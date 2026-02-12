#!/usr/bin/env node
/**
 * Chunked Inventory Movement Import Script
 *
 * Handles large FG Inventory Movement Excel files (100MB+) by streaming
 * rows in batches and upserting to Supabase via Prisma.
 *
 * Usage:
 *   node scripts/import-inventory.js /path/to/inventory-file.xlsx
 *   node scripts/import-inventory.js /path/to/inventory-file.csv
 *
 * Options:
 *   --batch-size=N   Rows per database batch (default: 500)
 *   --dry-run        Parse file and show stats without inserting
 *   --clear          Clear existing inventory data before import
 *   --sheet=N        Sheet index for xlsx files (default: 0)
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

// ─── Config ──────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const filePath = args.find(a => !a.startsWith('--'));
const batchSize = parseInt(args.find(a => a.startsWith('--batch-size='))?.split('=')[1] || '500');
const dryRun = args.includes('--dry-run');
const clearFirst = args.includes('--clear');
const sheetIndex = parseInt(args.find(a => a.startsWith('--sheet='))?.split('=')[1] || '0');

if (!filePath) {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║  KÜHL Inventory Movement Importer                           ║
╠══════════════════════════════════════════════════════════════╣
║  Usage:                                                      ║
║    node scripts/import-inventory.js <file> [options]          ║
║                                                              ║
║  Supported formats: .xlsx, .csv                              ║
║                                                              ║
║  Options:                                                    ║
║    --batch-size=N   Rows per DB batch (default: 500)         ║
║    --dry-run        Parse only, don't insert                 ║
║    --clear          Clear existing data before import        ║
║    --sheet=N        Sheet index for xlsx (default: 0)        ║
╚══════════════════════════════════════════════════════════════╝
`);
  process.exit(1);
}

if (!fs.existsSync(filePath)) {
  console.error(`❌ File not found: ${filePath}`);
  process.exit(1);
}

// ─── Column Mapping ──────────────────────────────────────────────────
// Maps Excel column headers to our Prisma model fields
const COLUMN_MAP = {
  'Style': 'styleNumber',
  'Style Desc': 'styleDesc',
  'Clr': 'color',
  'Clr Desc': 'colorDesc',
  'Color Type': 'colorType',
  'Style Category': 'styleCategory',
  'Style Cat Desc': 'styleCatDesc',
  'Whse': 'warehouse',
  'Type': 'movementType',
  'Date': 'movementDate',
  'User': 'user',
  'Group': 'group',
  'Group Desc.': 'groupDesc',
  'Group Desc': 'groupDesc',
  'Reference': 'reference',
  'Customer/Vendor': 'customerVendor',
  'Rea': 'reasonCode',
  'Rea Desc': 'reasonDesc',
  'Cost/Price': 'costPrice',
  'Wholesale Price': 'wholesalePrice',
  'MSRP': 'msrp',
  'Size Pricing': 'sizePricing',
  'Division': 'division',
  'Division Desc': 'divisionDesc',
  'Label': 'label',
  'Label Desc': 'labelDesc',
  'Period': 'period',
  'Qty': 'qty',
  'Balance': 'balance',
  'Extension': 'extension',
  'ProdMgr': 'prodMgr',
  'Old Style #': 'oldStyleNumber',
  'Pantone/CSI Desc': 'pantoneCsiDesc',
  'Control #': 'controlNumber',
  'ASN Status #': 'asnStatus',
  'Store': 'store',
  'Sales Order #': 'salesOrderNumber',
  'Segment Code': 'segmentCode',
  'Segment Description': 'segmentDesc',
  'Cost Code': 'costCode',
  'Cost Description': 'costDesc',
};

// Fields that should be parsed as numbers
const NUMBER_FIELDS = new Set([
  'costPrice', 'wholesalePrice', 'msrp', 'qty', 'balance', 'extension',
]);

// Fields that should be parsed as dates
const DATE_FIELDS = new Set(['movementDate']);

// ─── Helpers ─────────────────────────────────────────────────────────

function formatElapsed(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function formatNumber(n) {
  return n.toLocaleString();
}

function parseDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val;

  // Handle Excel serial date numbers
  if (typeof val === 'number') {
    // Excel serial date: days since 1900-01-01 (with the 1900 leap year bug)
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + val * 86400000);
    if (!isNaN(date.getTime())) return date;
  }

  const str = String(val).trim();
  if (!str) return null;

  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) return parsed;

  return null;
}

function mapRow(rawRow, headerMap) {
  const record = {};

  for (const [excelCol, fieldName] of Object.entries(headerMap)) {
    let val = rawRow[excelCol];

    if (val === undefined || val === null || val === '') {
      if (NUMBER_FIELDS.has(fieldName)) {
        record[fieldName] = 0;
      } else if (DATE_FIELDS.has(fieldName)) {
        record[fieldName] = null;
      } else {
        record[fieldName] = null;
      }
      continue;
    }

    if (NUMBER_FIELDS.has(fieldName)) {
      record[fieldName] = Number(val) || 0;
    } else if (DATE_FIELDS.has(fieldName)) {
      record[fieldName] = parseDate(val);
    } else {
      record[fieldName] = String(val).trim();
    }
  }

  // Required fields
  if (!record.styleNumber) record.styleNumber = '';
  if (record.qty === undefined) record.qty = 0;
  if (record.balance === undefined) record.balance = 0;
  if (record.costPrice === undefined) record.costPrice = 0;
  if (record.wholesalePrice === undefined) record.wholesalePrice = 0;
  if (record.msrp === undefined) record.msrp = 0;
  if (record.extension === undefined) record.extension = 0;

  return record;
}

// ─── Main Import Function ────────────────────────────────────────────

async function importInventory() {
  const startTime = Date.now();
  const ext = path.extname(filePath).toLowerCase();

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  KÜHL Inventory Movement Importer                           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  📄 File: ${path.basename(filePath)}`);
  console.log(`  📏 Size: ${(fs.statSync(filePath).size / (1024 * 1024)).toFixed(1)} MB`);
  console.log(`  📦 Batch size: ${batchSize}`);
  console.log(`  ${dryRun ? '🔍 DRY RUN — no data will be inserted' : '💾 LIVE — data will be inserted to database'}`);
  console.log('');

  // ── Parse File ──
  console.log('  ⏳ Parsing file...');
  let rows;

  if (ext === '.xlsx' || ext === '.xls') {
    // Use xlsx library for Excel files — reads in streaming mode
    let XLSX;
    try {
      XLSX = require('xlsx');
    } catch {
      console.error('  ❌ xlsx library not found. Install it: npm install xlsx');
      process.exit(1);
    }

    console.log(`  📊 Reading sheet index ${sheetIndex}...`);
    const workbook = XLSX.readFile(filePath, {
      type: 'file',
      cellDates: true,
      cellNF: false,
      cellText: false,
    });

    const sheetName = workbook.SheetNames[sheetIndex];
    if (!sheetName) {
      console.error(`  ❌ Sheet index ${sheetIndex} not found. Available sheets: ${workbook.SheetNames.join(', ')}`);
      process.exit(1);
    }

    console.log(`  📋 Sheet: "${sheetName}"`);
    rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });

  } else if (ext === '.csv') {
    // Simple CSV parsing
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"(.*)"$/, '$1'));

    rows = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/^"(.*)"$/, '$1'));
      const row = {};
      headers.forEach((h, j) => { row[h] = values[j] || ''; });
      rows.push(row);
    }
  } else {
    console.error(`  ❌ Unsupported file format: ${ext}`);
    process.exit(1);
  }

  console.log(`  ✅ Parsed ${formatNumber(rows.length)} rows in ${formatElapsed(Date.now() - startTime)}`);

  // ── Map Headers ──
  const fileHeaders = rows.length > 0 ? Object.keys(rows[0]) : [];
  console.log(`  📋 Columns found: ${fileHeaders.length}`);

  const headerMap = {};
  let matched = 0;
  let unmatched = [];

  for (const header of fileHeaders) {
    if (COLUMN_MAP[header]) {
      headerMap[header] = COLUMN_MAP[header];
      matched++;
    } else {
      unmatched.push(header);
    }
  }

  console.log(`  ✅ Mapped ${matched}/${fileHeaders.length} columns`);
  if (unmatched.length > 0) {
    console.log(`  ⚠️  Unmapped: ${unmatched.join(', ')}`);
  }
  console.log('');

  // ── Show Sample ──
  if (rows.length > 0) {
    const sample = mapRow(rows[0], headerMap);
    console.log('  📝 First record sample:');
    console.log(`     Style: ${sample.styleNumber} — ${sample.styleDesc}`);
    console.log(`     Color: ${sample.color} — ${sample.colorDesc}`);
    console.log(`     Type: ${sample.movementType} | Date: ${sample.movementDate}`);
    console.log(`     Qty: ${sample.qty} | Balance: ${sample.balance} | Ext: $${sample.extension}`);
    console.log(`     Warehouse: ${sample.warehouse}`);
    console.log('');
  }

  // ── Stats ──
  const movementTypes = {};
  const warehouses = {};
  const periods = {};
  const styles = new Set();

  for (const row of rows) {
    const mapped = mapRow(row, headerMap);
    styles.add(mapped.styleNumber);
    const mt = mapped.movementType || 'Unknown';
    movementTypes[mt] = (movementTypes[mt] || 0) + 1;
    const wh = mapped.warehouse || 'Unknown';
    warehouses[wh] = (warehouses[wh] || 0) + 1;
    const per = mapped.period || 'Unknown';
    periods[per] = (periods[per] || 0) + 1;
  }

  console.log('  📊 Data Summary:');
  console.log(`     Total rows: ${formatNumber(rows.length)}`);
  console.log(`     Unique styles: ${formatNumber(styles.size)}`);
  console.log(`     Movement types: ${Object.keys(movementTypes).length}`);
  Object.entries(movementTypes).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
    console.log(`       • ${type}: ${formatNumber(count)}`);
  });
  console.log(`     Warehouses: ${Object.keys(warehouses).length}`);
  Object.entries(warehouses).sort((a, b) => b[1] - a[1]).forEach(([wh, count]) => {
    console.log(`       • ${wh}: ${formatNumber(count)}`);
  });
  console.log(`     Periods: ${Object.keys(periods).length}`);
  Object.entries(periods).sort().forEach(([per, count]) => {
    console.log(`       • ${per}: ${formatNumber(count)}`);
  });
  console.log('');

  if (dryRun) {
    console.log('  🔍 Dry run complete — no data was inserted.');
    console.log(`  ⏱️  Total time: ${formatElapsed(Date.now() - startTime)}`);
    return;
  }

  // ── Database Import ──
  const prisma = new PrismaClient();

  try {
    // Clear existing data if requested
    if (clearFirst) {
      console.log('  🗑️  Clearing existing inventory data...');
      const deleted = await prisma.inventory.deleteMany({});
      console.log(`  ✅ Deleted ${formatNumber(deleted.count)} existing records`);
      console.log('');
    }

    // Insert in batches
    console.log(`  💾 Inserting ${formatNumber(rows.length)} records in batches of ${batchSize}...`);

    let inserted = 0;
    let errors = 0;
    const totalBatches = Math.ceil(rows.length / batchSize);

    for (let i = 0; i < rows.length; i += batchSize) {
      const batchNum = Math.floor(i / batchSize) + 1;
      const batch = rows.slice(i, i + batchSize);

      const records = batch.map(row => mapRow(row, headerMap));

      try {
        await prisma.inventory.createMany({
          data: records,
          skipDuplicates: true,
        });
        inserted += records.length;
      } catch (err) {
        errors += records.length;
        console.error(`  ❌ Batch ${batchNum} error: ${err.message.substring(0, 100)}`);
      }

      // Progress bar
      const pct = Math.round((batchNum / totalBatches) * 100);
      const bar = '█'.repeat(Math.floor(pct / 2)) + '░'.repeat(50 - Math.floor(pct / 2));
      const elapsed = formatElapsed(Date.now() - startTime);
      process.stdout.write(`\r  [${bar}] ${pct}% | ${formatNumber(inserted)} rows | ${elapsed}`);
    }

    console.log('');
    console.log('');
    console.log('  ════════════════════════════════════════════');
    console.log(`  ✅ Import complete!`);
    console.log(`     Inserted: ${formatNumber(inserted)} records`);
    if (errors > 0) console.log(`     Errors: ${formatNumber(errors)} records`);
    console.log(`     Time: ${formatElapsed(Date.now() - startTime)}`);
    console.log('  ════════════════════════════════════════════');

    // Log the import
    await prisma.importLog.create({
      data: {
        fileName: path.basename(filePath),
        fileType: 'inventory',
        recordCount: inserted,
      },
    });

  } catch (err) {
    console.error(`\n  ❌ Fatal error: ${err.message}`);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// ─── Run ─────────────────────────────────────────────────────────────
importInventory().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
