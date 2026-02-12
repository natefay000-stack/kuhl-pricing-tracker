#!/usr/bin/env node
/**
 * Inventory Movement Import via Supabase Management API
 *
 * Bypasses Prisma/pgbouncer connection issues by using the Supabase
 * Management API to execute SQL directly.
 *
 * Usage:
 *   node scripts/import-inventory-api.js /path/to/file.xlsx --sheet=1
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ─── Config ──────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const filePath = args.find(a => !a.startsWith('--'));
const sheetIndex = parseInt(args.find(a => a.startsWith('--sheet='))?.split('=')[1] || '0');
const dryRun = args.includes('--dry-run');
const batchSize = parseInt(args.find(a => a.startsWith('--batch-size='))?.split('=')[1] || '200');

const PROJECT_REF = 'bphoxjpfwdarlexrvgcg';

if (!filePath) {
  console.log('Usage: node scripts/import-inventory-api.js <file.xlsx> [--sheet=N] [--dry-run] [--batch-size=N]');
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
const DATE_FIELDS = new Set(['movementDate']);
const INT_FIELDS = new Set(['qty', 'balance']);

// ─── Helpers ─────────────────────────────────────────────────────────
function getToken() {
  try {
    const raw = execSync('security find-generic-password -s "Supabase CLI" -a "supabase" -w', { encoding: 'utf-8' }).trim();
    const b64 = raw.replace('go-keyring-base64:', '');
    return Buffer.from(b64, 'base64').toString('utf-8');
  } catch {
    console.error('❌ Could not get Supabase token from keychain');
    process.exit(1);
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function execSQL(token, query, retries = 5) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    if (res.ok) return res.json();
    const text = await res.text();
    if (res.status === 429 || res.status >= 500) {
      // Rate limited or server error — exponential backoff
      const delay = Math.min(attempt * 5000, 30000); // 5s, 10s, 15s, 20s, 25s
      if (attempt < retries) {
        await sleep(delay);
        continue;
      }
    }
    throw new Error(`SQL error (${res.status}): ${text.substring(0, 300)}`);
  }
}

function escSQL(val) {
  if (val === null || val === undefined) return 'NULL';
  const str = String(val).replace(/'/g, "''");
  return `'${str}'`;
}

function formatNumber(n) { return n.toLocaleString(); }
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

function parseDate(val) {
  if (!val) return null;
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    return val.toISOString();
  }
  if (typeof val === 'number') {
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + val * 86400000);
    if (!isNaN(date.getTime())) return date.toISOString();
  }
  const str = String(val).trim();
  if (!str) return null;
  // Handle MM/DD/YY format (2-digit year)
  const mdyMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (mdyMatch) {
    let year = parseInt(mdyMatch[3]);
    year = year < 50 ? 2000 + year : 1900 + year; // 00-49 = 2000s, 50-99 = 1900s
    const date = new Date(year, parseInt(mdyMatch[1]) - 1, parseInt(mdyMatch[2]));
    if (!isNaN(date.getTime())) return date.toISOString();
  }
  // Handle MM/DD/YYYY format
  const mdyFullMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdyFullMatch) {
    const date = new Date(parseInt(mdyFullMatch[3]), parseInt(mdyFullMatch[1]) - 1, parseInt(mdyFullMatch[2]));
    if (!isNaN(date.getTime())) return date.toISOString();
  }
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) return parsed.toISOString();
  return null;
}

function mapRow(rawRow) {
  const record = { id: generateCUID() };
  for (const [excelCol, fieldName] of Object.entries(COLUMN_MAP)) {
    let val = rawRow[excelCol];
    if (val === undefined || val === null || val === '') {
      record[fieldName] = NUMBER_FIELDS.has(fieldName) ? 0 : null;
    } else if (NUMBER_FIELDS.has(fieldName)) {
      const num = Number(val);
      record[fieldName] = INT_FIELDS.has(fieldName) ? Math.round(num || 0) : (num || 0);
    } else if (DATE_FIELDS.has(fieldName)) {
      record[fieldName] = parseDate(val);
    } else {
      record[fieldName] = String(val).trim();
    }
  }
  if (!record.styleNumber) record.styleNumber = '';
  return record;
}

// DB column order for INSERT
const DB_COLUMNS = [
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

function recordToValues(rec) {
  const now = new Date().toISOString();
  const vals = DB_COLUMNS.map(col => {
    if (col === 'createdAt' || col === 'updatedAt') return escSQL(now);
    const val = rec[col];
    if (val === null || val === undefined) return 'NULL';
    if (typeof val === 'number') return String(val);
    return escSQL(val);
  });
  return `(${vals.join(',')})`;
}

// ─── Main ────────────────────────────────────────────────────────────
async function main() {
  const startTime = Date.now();

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  KÜHL Inventory Import (Supabase API)                       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  📄 File: ${path.basename(filePath)}`);
  console.log(`  📏 Size: ${(fs.statSync(filePath).size / (1024 * 1024)).toFixed(1)} MB`);
  console.log(`  📦 Batch size: ${batchSize}`);
  console.log(`  ${dryRun ? '🔍 DRY RUN' : '💾 LIVE — inserting to database'}`);
  console.log('');

  // Parse
  console.log('  ⏳ Parsing file...');
  const XLSX = require('xlsx');
  const wb = XLSX.readFile(filePath, { type: 'file', cellDates: true, cellNF: false, cellText: false });
  const sheetName = wb.SheetNames[sheetIndex];
  console.log(`  📋 Sheet: "${sheetName}" (index ${sheetIndex})`);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });
  console.log(`  ✅ Parsed ${formatNumber(rows.length)} rows in ${formatElapsed(Date.now() - startTime)}`);

  if (rows.length === 0) {
    console.log('  ⚠️  No rows found. Try --sheet=1 if data is on another sheet.');
    return;
  }

  // Stats
  const types = {}, warehouses = {}, styles = new Set();
  rows.forEach(r => {
    styles.add(r['Style'] || '');
    const t = r['Type'] || '?'; types[t] = (types[t] || 0) + 1;
    const w = r['Whse'] || '?'; warehouses[w] = (warehouses[w] || 0) + 1;
  });
  console.log(`  📊 ${formatNumber(styles.size)} styles, ${Object.keys(types).length} types, ${Object.keys(warehouses).length} warehouses`);
  console.log('');

  if (dryRun) {
    console.log('  🔍 Dry run complete.');
    return;
  }

  // Get token
  const token = getToken();
  console.log('  🔑 Authenticated with Supabase');

  // Clear existing
  console.log('  🗑️  Clearing existing inventory...');
  await execSQL(token, 'DELETE FROM "Inventory"');
  console.log('  ✅ Cleared');
  console.log('');

  // Insert in batches
  console.log(`  💾 Inserting ${formatNumber(rows.length)} records...`);
  const colNames = DB_COLUMNS.map(c => `"${c}"`).join(',');
  let inserted = 0;
  let errors = 0;
  const errorLog = [];
  const totalBatches = Math.ceil(rows.length / batchSize);

  for (let i = 0; i < rows.length; i += batchSize) {
    const batchNum = Math.floor(i / batchSize) + 1;
    const batch = rows.slice(i, i + batchSize);
    const records = batch.map(mapRow);
    const values = records.map(recordToValues).join(',\n');
    const sql = `INSERT INTO "Inventory" (${colNames}) VALUES ${values}`;

    try {
      await execSQL(token, sql);
      inserted += batch.length;
    } catch (err) {
      errors += batch.length;
      const errMsg = `Batch ${batchNum} (rows ${i}-${i + batch.length - 1}): ${err.message}`;
      errorLog.push(errMsg);
      if (errorLog.length <= 10) {
        console.error(`\n  ❌ ${errMsg.substring(0, 200)}`);
      }
    }

    // Delay between batches to avoid rate limiting (Supabase 429s)
    // ~200ms per batch = ~5 req/sec, well under most rate limits
    await sleep(200);

    const pct = Math.round((batchNum / totalBatches) * 100);
    const bar = '█'.repeat(Math.floor(pct / 2)) + '░'.repeat(50 - Math.floor(pct / 2));
    const elapsed = formatElapsed(Date.now() - startTime);
    process.stdout.write(`\r  [${bar}] ${pct}% | ${formatNumber(inserted)} rows | err:${formatNumber(errors)} | ${elapsed}`);
  }

  // Write error log if any
  if (errorLog.length > 0) {
    const logPath = path.join(path.dirname(filePath || '.'), 'import-errors.log');
    try {
      fs.writeFileSync(logPath, errorLog.join('\n\n'));
      console.log(`\n  📝 Error details written to: ${logPath}`);
    } catch { /* ignore write errors */ }
  }

  console.log('');
  console.log('');
  console.log('  ════════════════════════════════════════════');
  console.log(`  ✅ Import complete!`);
  console.log(`     Inserted: ${formatNumber(inserted)} records`);
  if (errors > 0) console.log(`     Errors: ${formatNumber(errors)} records`);
  console.log(`     Time: ${formatElapsed(Date.now() - startTime)}`);
  console.log('  ════════════════════════════════════════════');
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
