#!/usr/bin/env node
/**
 * On-Hand Inventory Snapshot Import via Supabase Management API
 *
 * Imports OH Inventory XLSX files with size-level breakdowns into the
 * InventoryOH table. Each row is a style-color with qty per size.
 *
 * Usage:
 *   node scripts/import-oh-inventory.js "data/2026-02-10 OH Inventory.xlsx"
 *   node scripts/import-oh-inventory.js <file.xlsx> [--dry-run] [--batch-size=N] [--snapshot-date=YYYY-MM-DD]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ─── Config ──────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const filePath = args.find(a => !a.startsWith('--'));
const dryRun = args.includes('--dry-run');
const batchSize = parseInt(args.find(a => a.startsWith('--batch-size='))?.split('=')[1] || '200');
const snapshotDateArg = args.find(a => a.startsWith('--snapshot-date='))?.split('=')[1];

// Load .env
const envPath = require('path').join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=["']?(.+?)["']?\s*$/);
  if (match) envVars[match[1].trim()] = match[2];
});
const SUPABASE_URL = envVars.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const PROJECT_REF = 'bphoxjpfwdarlexrvgcg';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_KEY in .env');
  process.exit(1);
}

if (!filePath) {
  console.log('Usage: node scripts/import-oh-inventory.js <file.xlsx> [--dry-run] [--batch-size=N] [--snapshot-date=YYYY-MM-DD]');
  console.log('');
  console.log('Options:');
  console.log('  --dry-run             Parse and show stats without inserting');
  console.log('  --batch-size=N        Rows per batch (default: 200)');
  console.log('  --snapshot-date=DATE  Override snapshot date (default: extracted from filename)');
  process.exit(1);
}

// Try to extract date from filename like "2026-02-10 OH Inventory.xlsx"
function extractDateFromFilename(fp) {
  const basename = path.basename(fp);
  const match = basename.match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : new Date().toISOString().split('T')[0];
}

const snapshotDate = snapshotDateArg || extractDateFromFilename(filePath);

// ─── Helpers ─────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Insert rows via Supabase PostgREST
async function insertBatch(records, retries = 5) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/InventoryOH`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(records),
    });
    if (res.ok) return;
    const text = await res.text();
    if (res.status === 429 || res.status >= 500) {
      const delay = Math.min(attempt * 5000, 30000);
      if (attempt < retries) { await sleep(delay); continue; }
    }
    throw new Error(`Insert error (${res.status}): ${text.substring(0, 300)}`);
  }
}

// Delete rows via PostgREST
async function deleteBySnapshot(date) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/InventoryOH?snapshotDate=eq.${date}`, {
    method: 'DELETE',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'return=minimal',
    },
  });
  if (!res.ok) {
    const text = await res.text();
    // 404 is fine — table might not exist yet or no rows to delete
    if (res.status !== 404 && res.status !== 406) {
      throw new Error(`Delete error (${res.status}): ${text.substring(0, 200)}`);
    }
  }
}

// Execute SQL via Management API (for DDL — table creation, functions)
function getToken() {
  try {
    const raw = execSync('security find-generic-password -s "Supabase CLI" -a "supabase" -w', { encoding: 'utf-8' }).trim();
    const b64 = raw.replace('go-keyring-base64:', '');
    return Buffer.from(b64, 'base64').toString('utf-8');
  } catch {
    return null; // Not available — will skip DDL
  }
}

async function execSQL(token, query) {
  if (!token) throw new Error('No management token');
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (res.ok) return res.json();
  const text = await res.text();
  throw new Error(`SQL error (${res.status}): ${text.substring(0, 300)}`);
}

function escSQL(val) {
  if (val === null || val === undefined) return 'NULL';
  const str = String(val).replace(/'/g, "''");
  return `'${str}'`;
}

function formatNum(n) { return n.toLocaleString(); }
function formatElapsed(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function generateCUID() {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 10);
  const rand2 = Math.random().toString(36).substring(2, 6);
  return 'c' + ts + rand + rand2;
}

// ─── Main ────────────────────────────────────────────────────────────
async function main() {
  const startTime = Date.now();

  console.log('');
  console.log('=== KUHL On-Hand Inventory Import (Supabase API) ===');
  console.log('');
  console.log(`  File: ${path.basename(filePath)}`);
  console.log(`  Size: ${(fs.statSync(filePath).size / (1024 * 1024)).toFixed(1)} MB`);
  console.log(`  Snapshot Date: ${snapshotDate}`);
  console.log(`  Batch size: ${batchSize}`);
  console.log(`  ${dryRun ? 'DRY RUN' : 'LIVE - inserting to database'}`);
  console.log('');

  // Parse XLSX
  console.log('  Parsing file...');
  const XLSX = require('xlsx');
  const wb = XLSX.readFile(filePath, { type: 'file', cellDates: false, cellNF: false, cellText: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const allRows = XLSX.utils.sheet_to_json(ws, { header: 1 });

  if (allRows.length < 3) {
    console.log('  Not enough rows. Expected header + size sub-header + data.');
    return;
  }

  // Row 0 = main headers, Row 1 = size sub-headers, Row 2+ = data
  const headers = allRows[0];
  const sizeRow = allRows[1];

  // Auto-detect column layout — find "Size Scale" header dynamically
  let SIZE_START_COL = headers.indexOf('Size Scale');
  if (SIZE_START_COL < 0) SIZE_START_COL = 34; // fallback

  // Auto-detect warehouse column (present in newer files, absent in older)
  const warehouseCol = headers.indexOf('Warehouse');
  const hasWarehouse = warehouseCol >= 0;
  console.log(`  Warehouse column: ${hasWarehouse ? 'col ' + warehouseCol : 'not present'}`);

  // Auto-detect Inventory Classification and Type (sizeType) columns
  const invClassCol = headers.indexOf('Inventory Classification');
  const typeCol = headers.indexOf('Type');

  // ─── Size column mapping ────────────────────────────────────────────
  // The spreadsheet's size columns serve dual purposes:
  //   - For alpha-sized products (shirts, fleece, etc): S, M, L, XL, XXL, XXXL, XS
  //   - For waist-sized products (pants, shorts): 28, 29, 30, 31, 32, 33, 34, 35, 36, 38, 40, 42, 44, 46
  // The sub-header row only has alpha labels; waist sizes are positional (unlabeled).
  // sizeType field tells us which interpretation to use:
  //   - Numeric sizeType (28,30,32,34,36) = inseam length → columns are waist sizes
  //   - Alpha sizeType (RG,LN,SH,_) = columns use alpha labels as-is

  // Waist size scale: 14 positions mapping to actual waist measurements
  const WAIST_SIZES = [28, 29, 30, 31, 32, 33, 34, 35, 36, 38, 40, 42, 44, 46];

  // Categories that use numeric waist sizing
  const WAIST_SIZED_CATEGORIES = new Set(['PANT', 'SHOR', 'LEGG', 'SKIR', 'SKOR']);

  // Scan ALL data rows to find the last column with any non-zero value (before the total column)
  const dataRowsRaw = allRows.slice(2).filter(row => row[0] !== null && row[0] !== undefined && row[0] !== '');
  let lastDataCol = SIZE_START_COL;
  for (const row of dataRowsRaw) {
    for (let i = SIZE_START_COL; i < row.length - 1; i++) { // -1 to skip total column
      if ((parseInt(row[i]) || 0) > 0 && i > lastDataCol) lastDataCol = i;
    }
  }

  // Build column index array (shared across all rows)
  const sizeCols = [];
  for (let i = SIZE_START_COL; i <= lastDataCol; i++) {
    sizeCols.push(i);
  }

  // Alpha labels from sub-header row (for non-waist-sized products)
  const alphaLabels = sizeCols.map((col, idx) => {
    const label = sizeRow[col];
    return (label && label !== null) ? String(label) : `pos_${idx + 1}`;
  });

  console.log(`  Size columns: ${sizeCols.length} (cols ${SIZE_START_COL}–${lastDataCol})`);
  console.log(`  Alpha labels: ${alphaLabels.join(', ')}`);
  console.log(`  Waist labels: ${WAIST_SIZES.slice(0, sizeCols.length).join(', ')}`);

  // Parse data rows (already scanned above as dataRowsRaw)
  const dataRows = dataRowsRaw;
  console.log(`  Parsed ${formatNum(dataRows.length)} rows in ${formatElapsed(Date.now() - startTime)}`);

  // Build records
  const records = dataRows.map(row => {
    const category = row[3] ? String(row[3]) : '';
    const sizeType = typeCol >= 0 && row[typeCol] ? String(row[typeCol]) : '';

    // Determine if this row uses waist sizing:
    // Must be a waist-sized category AND have a numeric sizeType (inseam length)
    const isWaistSized = WAIST_SIZED_CATEGORIES.has(category) && /^\d+$/.test(sizeType);

    // Build size breakdown JSONB with correct labels
    const sizeBreakdown = {};
    let totalFromSizes = 0;
    for (let idx = 0; idx < sizeCols.length; idx++) {
      const col = sizeCols[idx];
      const val = parseInt(row[col]) || 0;
      if (val > 0) {
        const label = isWaistSized
          ? String(WAIST_SIZES[idx] || `w${idx + 28}`)  // waist size number
          : alphaLabels[idx];                             // alpha label (S, M, L...)
        sizeBreakdown[label] = val;
        totalFromSizes += val;
      }
    }

    // Last column is typically the total
    const lastCol = row[row.length - 1];
    const totalQty = (typeof lastCol === 'number' && lastCol >= totalFromSizes)
      ? Math.round(lastCol)
      : totalFromSizes;

    return {
      id: generateCUID(),
      snapshotDate,
      styleNumber: String(row[0] || ''),
      styleDesc: row[1] ? String(row[1]) : null,
      season: row[2] ? String(row[2]) : null,
      category: row[3] ? String(row[3]) : null,
      division: row[5] != null ? parseInt(row[5]) || null : null,
      label: row[6] ? String(row[6]) : null,
      prodType: row[8] ? String(row[8]) : null,
      prodLine: row[9] ? String(row[9]) : null,
      stdPrice: parseFloat(row[13]) || 0,
      msrp: parseFloat(row[14]) || 0,
      outletMsrp: parseFloat(row[15]) || 0,
      stdCost: parseFloat(row[16]) || 0,
      color: row[17] ? String(row[17]) : null,
      colorDesc: row[18] ? String(row[18]) : null,
      colorType: row[19] ? String(row[19]) : null,
      segmentCode: row[21] ? String(row[21]) : null,
      garmentClass: row[22] ? String(row[22]) : null,
      garmentClassDesc: row[23] ? String(row[23]) : null,
      warehouse: hasWarehouse && row[warehouseCol] != null ? parseInt(row[warehouseCol]) || null : null,
      sizeType: typeCol >= 0 ? (row[typeCol] ? String(row[typeCol]) : null) : null,
      inventoryClassification: invClassCol >= 0 ? (row[invClassCol] ? String(row[invClassCol]) : null) : null,
      sizeBreakdown,
      totalQty,
    };
  });

  // Stats
  const styles = new Set(records.map(r => r.styleNumber));
  const seasons = new Set(records.filter(r => r.season).map(r => r.season));
  const categories = new Set(records.filter(r => r.category).map(r => r.category));
  const totalUnits = records.reduce((s, r) => s + r.totalQty, 0);

  console.log('');
  console.log(`  Styles: ${formatNum(styles.size)}`);
  console.log(`  Seasons: ${seasons.size} (${[...seasons].sort().slice(-5).join(', ')}...)`);
  console.log(`  Categories: ${categories.size}`);
  console.log(`  Total units on hand: ${formatNum(totalUnits)}`);
  console.log('');

  if (dryRun) {
    console.log('  Dry run complete. Sample record:');
    console.log(JSON.stringify(records[2], null, 2));
    return;
  }

  // Try management API for DDL (table + function creation)
  const token = getToken();
  if (token) {
    console.log('  Supabase management token found — creating table + RPC...');
    try {
      await execSQL(token, `
        CREATE TABLE IF NOT EXISTS "InventoryOH" (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          "snapshotDate" DATE NOT NULL,
          "styleNumber" TEXT NOT NULL,
          "styleDesc" TEXT,
          season TEXT,
          category TEXT,
          division INT,
          label TEXT,
          "prodType" TEXT,
          "prodLine" TEXT,
          "stdPrice" FLOAT DEFAULT 0,
          msrp FLOAT DEFAULT 0,
          "outletMsrp" FLOAT DEFAULT 0,
          "stdCost" FLOAT DEFAULT 0,
          color TEXT,
          "colorDesc" TEXT,
          "colorType" TEXT,
          "segmentCode" TEXT,
          "garmentClass" TEXT,
          "garmentClassDesc" TEXT,
          warehouse INT,
          "sizeType" TEXT,
          "inventoryClassification" TEXT,
          "sizeBreakdown" JSONB DEFAULT '{}',
          "totalQty" INT DEFAULT 0,
          "createdAt" TIMESTAMPTZ DEFAULT now()
        );
      `);
      await execSQL(token, `CREATE INDEX IF NOT EXISTS idx_inv_oh_style ON "InventoryOH" ("styleNumber");`);
      await execSQL(token, `CREATE INDEX IF NOT EXISTS idx_inv_oh_season ON "InventoryOH" (season);`);
      await execSQL(token, `CREATE INDEX IF NOT EXISTS idx_inv_oh_category ON "InventoryOH" (category);`);
      await execSQL(token, `CREATE INDEX IF NOT EXISTS idx_inv_oh_snapshot ON "InventoryOH" ("snapshotDate");`);

      await execSQL(token, `
        CREATE OR REPLACE FUNCTION get_oh_inventory_aggregations()
        RETURNS JSON LANGUAGE sql STABLE AS $$
          SELECT json_build_object(
            'totalCount', (SELECT count(*) FROM "InventoryOH"),
            'totalUnits', (SELECT COALESCE(sum("totalQty"), 0) FROM "InventoryOH"),
            'totalValue', (SELECT COALESCE(sum("totalQty" * "stdCost"), 0) FROM "InventoryOH"),
            'byCategory', (
              SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM (
                SELECT category, count(DISTINCT "styleNumber") as styles, count(*) as colors,
                       sum("totalQty") as total_qty, sum("totalQty" * "stdCost") as total_value
                FROM "InventoryOH" WHERE category IS NOT NULL GROUP BY category ORDER BY sum("totalQty") DESC
              ) t
            ),
            'bySeason', (
              SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM (
                SELECT season, count(DISTINCT "styleNumber") as styles, count(*) as colors,
                       sum("totalQty") as total_qty, sum("totalQty" * "stdCost") as total_value
                FROM "InventoryOH" WHERE season IS NOT NULL GROUP BY season ORDER BY season
              ) t
            ),
            'topStyles', (
              SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM (
                SELECT "styleNumber", max("styleDesc") as style_desc, max(category) as category,
                       count(*) as colors, sum("totalQty") as total_qty,
                       sum("totalQty" * "stdCost") as total_value,
                       max("stdPrice") as std_price, max(msrp) as msrp
                FROM "InventoryOH" GROUP BY "styleNumber" ORDER BY sum("totalQty") DESC LIMIT 50
              ) t
            )
          );
        $$;
      `);
      console.log('  Table, indexes, and RPC function ready');
    } catch (err) {
      console.log(`  DDL warning: ${err.message.substring(0, 100)}`);
      console.log('  Table may already exist — continuing with insert...');
    }
  } else {
    console.log('  No management token — table must already exist in Supabase');
    console.log('  (Create the table via Supabase SQL Editor if needed)');
  }

  // Clear existing data for this snapshot date
  console.log(`\n  Clearing existing records for snapshot ${snapshotDate}...`);
  try {
    await deleteBySnapshot(snapshotDate);
    console.log('  Cleared');
  } catch (err) {
    console.log(`  Clear warning: ${err.message.substring(0, 100)}`);
  }
  console.log('');

  // Insert in batches via PostgREST
  console.log(`  Inserting ${formatNum(records.length)} records via REST API...`);
  let inserted = 0;
  let errors = 0;
  const totalBatches = Math.ceil(records.length / batchSize);

  for (let i = 0; i < records.length; i += batchSize) {
    const batchNum = Math.floor(i / batchSize) + 1;
    const batch = records.slice(i, i + batchSize);

    try {
      await insertBatch(batch);
      inserted += batch.length;
    } catch (err) {
      errors += batch.length;
      if (errors <= 2000) {
        console.error(`\n  Batch ${batchNum} error: ${err.message.substring(0, 200)}`);
      }
    }

    await sleep(100);

    const pct = Math.round((batchNum / totalBatches) * 100);
    const bar = '='.repeat(Math.floor(pct / 2)) + '-'.repeat(50 - Math.floor(pct / 2));
    process.stdout.write(`\r  [${bar}] ${pct}% | ${formatNum(inserted)} rows | err:${formatNum(errors)} | ${formatElapsed(Date.now() - startTime)}`);
  }

  console.log('');
  console.log('  ====================================');
  console.log(`  Import complete!`);
  console.log(`     Inserted: ${formatNum(inserted)} records`);
  if (errors > 0) console.log(`     Errors: ${formatNum(errors)} records`);
  console.log(`     Time: ${formatElapsed(Date.now() - startTime)}`);
  console.log('  ====================================');
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
