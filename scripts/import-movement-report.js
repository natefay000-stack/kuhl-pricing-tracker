#!/usr/bin/env node
/**
 * Inventory Movement Report Import via Supabase REST API
 *
 * Handles report-style XLSX files with metadata header rows (title, company, date, etc.)
 * Auto-detects the actual column header row by looking for 'Style' in the first column.
 *
 * Usage:
 *   node scripts/import-movement-report.js "data/2026-02-18 Inventory movement report.xlsx"
 *   node scripts/import-movement-report.js <file.xlsx> [--dry-run] [--batch-size=N] [--clear]
 */

const fs = require('fs');
const path = require('path');

// ─── Config ──────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const filePath = args.find(a => !a.startsWith('--'));
const dryRun = args.includes('--dry-run');
const clearFirst = args.includes('--clear');
const batchSize = parseInt(args.find(a => a.startsWith('--batch-size='))?.split('=')[1] || '500');

// Load .env
const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=["']?(.+?)["']?\s*$/);
  if (match) envVars[match[1].trim()] = match[2];
});
const SUPABASE_URL = envVars.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_KEY in .env');
  process.exit(1);
}

if (!filePath) {
  console.log('Usage: node scripts/import-movement-report.js <file.xlsx> [--dry-run] [--batch-size=N] [--clear]');
  console.log('');
  console.log('Options:');
  console.log('  --dry-run        Parse and show stats without inserting');
  console.log('  --batch-size=N   Rows per batch (default: 500)');
  console.log('  --clear          Delete ALL existing Inventory records before import');
  process.exit(1);
}

// ─── Column Mapping ──────────────────────────────────────────────────
const COLUMN_MAP = {
  'Style': 'styleNumber', 'Style Desc': 'styleDesc',
  'Clr': 'color', 'Clr Desc': 'colorDesc', 'Color Type': 'colorType',
  'Style Category': 'styleCategory', 'Style Cat Desc': 'styleCatDesc',
  'Whse': 'warehouse', 'Type': 'movementType', 'Date': 'movementDate',
  'User': 'user', 'Group': 'group', 'Group Desc.': 'groupDesc', 'Group Desc': 'groupDesc',
  'Reference': 'reference', 'Customer/Vendor': 'customerVendor',
  'Rea': 'reasonCode', 'Rea Desc': 'reasonDesc',
  'Cost/Price': 'costPrice', 'Wholesale Price': 'wholesalePrice', 'MSRP': 'msrp',
  'Size Pricing': 'sizePricing', 'Division': 'division', 'Division Desc': 'divisionDesc',
  'Label': 'label', 'Label Desc': 'labelDesc', 'Period': 'period',
  'Qty': 'qty', 'Balance': 'balance', 'Extension': 'extension',
  'ProdMgr': 'prodMgr', 'Old Style #': 'oldStyleNumber',
  'Pantone/CSI Desc': 'pantoneCsiDesc', 'Control #': 'controlNumber',
  'ASN Status #': 'asnStatus', 'Store': 'store', 'Sales Order #': 'salesOrderNumber',
  'Segment Code': 'segmentCode', 'Segment Description': 'segmentDesc',
  'Cost Code': 'costCode', 'Cost Description': 'costDesc',
};

const NUMBER_FIELDS = new Set(['costPrice', 'wholesalePrice', 'msrp', 'qty', 'balance', 'extension']);

// All possible DB columns (must match Inventory table schema exactly)
const ALL_DB_FIELDS = [
  'id', 'styleNumber', 'styleDesc', 'color', 'colorDesc', 'colorType',
  'styleCategory', 'styleCatDesc', 'warehouse', 'movementType', 'movementDate',
  'user', 'group', 'groupDesc', 'reference', 'customerVendor',
  'reasonCode', 'reasonDesc', 'costPrice', 'wholesalePrice', 'msrp',
  'sizePricing', 'division', 'divisionDesc', 'label', 'labelDesc', 'period',
  'qty', 'balance', 'extension', 'prodMgr', 'oldStyleNumber',
  'pantoneCsiDesc', 'controlNumber', 'asnStatus', 'store', 'salesOrderNumber',
  'segmentCode', 'segmentDesc', 'costCode', 'costDesc',
  'createdAt', 'updatedAt',
];

// ─── Helpers ─────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
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

// Parse date like "02/01/26" or "02/01/2026" to "2026-02-01"
function parseDate(val) {
  if (!val) return null;
  const s = String(val).trim();
  const match = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!match) return s; // already ISO or other format
  const [, mm, dd, yy] = match;
  const year = yy.length === 2 ? (parseInt(yy) > 50 ? '19' + yy : '20' + yy) : yy;
  return `${year}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

async function insertBatch(records, retries = 5) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/Inventory`, {
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

async function deleteAll() {
  // Delete in batches via PostgREST (can't delete without a filter, so use id.neq.null)
  const res = await fetch(`${SUPABASE_URL}/rest/v1/Inventory?id=neq.null`, {
    method: 'DELETE',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'return=minimal',
    },
  });
  if (!res.ok && res.status !== 404 && res.status !== 406) {
    const text = await res.text();
    throw new Error(`Delete error (${res.status}): ${text.substring(0, 200)}`);
  }
}

// ─── Main ────────────────────────────────────────────────────────────
async function main() {
  const startTime = Date.now();
  const fileSize = (fs.statSync(filePath).size / (1024 * 1024)).toFixed(1);

  console.log('');
  console.log('=== KUHL Inventory Movement Import (Supabase REST) ===');
  console.log('');
  console.log(`  File: ${path.basename(filePath)}`);
  console.log(`  Size: ${fileSize} MB`);
  console.log(`  Batch size: ${batchSize}`);
  console.log(`  ${dryRun ? 'DRY RUN' : 'LIVE - inserting to database'}`);
  console.log('');

  // Parse XLSX
  console.log('  Parsing file...');
  const XLSX = require('xlsx');
  const wb = XLSX.readFile(filePath, { type: 'file', cellDates: false, cellNF: false, cellText: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // Auto-detect header row (look for 'Style' in first column)
  let headerRowIdx = -1;
  for (let r = 0; r < Math.min(20, allRows.length); r++) {
    const row = allRows[r];
    if (row && String(row[0]).trim() === 'Style') {
      headerRowIdx = r;
      break;
    }
  }

  if (headerRowIdx < 0) {
    console.error('  Could not find header row (looking for "Style" in column A)');
    process.exit(1);
  }

  console.log(`  Header row found at row ${headerRowIdx}`);
  const headers = allRows[headerRowIdx];

  // Build column index map
  const colMap = {};
  headers.forEach((h, i) => {
    const mapped = COLUMN_MAP[String(h).trim()];
    if (mapped) colMap[i] = mapped;
  });

  console.log(`  Mapped ${Object.keys(colMap).length} columns`);

  // Parse data rows (skip empty rows between records)
  const records = [];
  let skipped = 0;
  for (let r = headerRowIdx + 1; r < allRows.length; r++) {
    const row = allRows[r];
    // Skip empty rows (report formatting leaves blank lines between groups)
    if (!row[0] && !row[1]) { skipped++; continue; }

    // Start with all fields set to null so every record has identical keys (PostgREST requires uniform keys in batch)
    const now = new Date().toISOString();
    const record = {};
    ALL_DB_FIELDS.forEach(f => { record[f] = null; });
    record.id = generateCUID();
    record.createdAt = now;
    record.updatedAt = now;
    let hasData = false;

    for (const [colIdx, fieldName] of Object.entries(colMap)) {
      const val = row[parseInt(colIdx)];
      if (val === '' || val === undefined || val === null) continue;

      hasData = true;

      if (fieldName === 'movementDate') {
        record[fieldName] = parseDate(val);
      } else if (NUMBER_FIELDS.has(fieldName)) {
        const num = parseFloat(val);
        if (!isNaN(num)) record[fieldName] = num;
      } else {
        record[fieldName] = String(val);
      }
    }

    if (hasData && record.styleNumber) {
      // Ensure required numeric fields default to 0
      if (record.costPrice === null) record.costPrice = 0;
      if (record.wholesalePrice === null) record.wholesalePrice = 0;
      if (record.msrp === null) record.msrp = 0;
      if (record.qty === null) record.qty = 0;
      if (record.balance === null) record.balance = 0;
      if (record.extension === null) record.extension = 0;
      records.push(record);
    }
  }

  console.log(`  Parsed ${formatNum(records.length)} movement records (skipped ${formatNum(skipped)} empty rows)`);
  console.log(`  Parse time: ${formatElapsed(Date.now() - startTime)}`);

  // Stats
  const types = {};
  const dates = new Set();
  let totalIn = 0, totalOut = 0;
  records.forEach(r => {
    const t = r.movementType || 'unknown';
    if (!types[t]) types[t] = { count: 0, qty: 0 };
    types[t].count++;
    types[t].qty += r.qty || 0;
    if (r.movementDate) dates.add(r.movementDate);
    if (r.qty > 0) totalIn += r.qty; else totalOut += Math.abs(r.qty);
  });

  console.log('');
  console.log(`  Date range: ${[...dates].sort()[0] || '?'} to ${[...dates].sort().pop() || '?'} (${dates.size} days)`);
  console.log(`  Total In: ${formatNum(totalIn)} / Out: ${formatNum(totalOut)} / Net: ${totalIn > totalOut ? '+' : ''}${formatNum(totalIn - totalOut)}`);
  console.log('  Movement types:');
  Object.entries(types).sort((a, b) => b[1].count - a[1].count).forEach(([t, info]) => {
    console.log(`    ${t}: ${formatNum(info.count)} rows, net ${info.qty >= 0 ? '+' : ''}${formatNum(info.qty)}`);
  });
  console.log('');

  if (dryRun) {
    console.log('  Dry run complete. Sample record:');
    console.log(JSON.stringify(records[0], null, 2));
    return;
  }

  // Clear existing data if requested
  if (clearFirst) {
    console.log('  Clearing ALL existing inventory movement records...');
    await deleteAll();
    console.log('  Cleared');
    console.log('');
  }

  // Insert in batches
  const totalBatches = Math.ceil(records.length / batchSize);
  let inserted = 0;
  let errors = 0;

  console.log(`  Inserting ${formatNum(records.length)} records via REST API...`);

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    try {
      await insertBatch(batch);
      inserted += batch.length;
    } catch (err) {
      errors++;
      console.error(`  Batch error at row ${i}: ${err.message.substring(0, 100)}`);
      // Try individual inserts for failed batch
      for (const rec of batch) {
        try {
          await insertBatch([rec]);
          inserted++;
        } catch {
          errors++;
        }
      }
    }

    // Progress bar
    const pct = Math.round((i + batch.length) / records.length * 100);
    const bar = '='.repeat(Math.round(pct / 2)).padEnd(50, '-');
    const elapsed = formatElapsed(Date.now() - startTime);
    process.stdout.write(`  [${bar}] ${pct}% | ${formatNum(inserted)} rows | err:${errors} | ${elapsed}\r`);
  }

  console.log('');
  console.log(`  ${'='.repeat(40)}`);
  console.log(`  Import complete!`);
  console.log(`     Inserted: ${formatNum(inserted)} records`);
  console.log(`     Errors: ${errors}`);
  console.log(`     Time: ${formatElapsed(Date.now() - startTime)}`);
  console.log(`  ${'='.repeat(40)}`);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
