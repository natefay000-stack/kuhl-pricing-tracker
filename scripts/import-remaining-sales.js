#!/usr/bin/env node
/**
 * Import remaining sales data directly via Neon driver.
 * Deletes existing data for each season before inserting.
 */
const XLSX = require('xlsx');
const { Pool, neonConfig } = require('@neondatabase/serverless');
const ws = require('ws');
const path = require('path');
const crypto = require('crypto');

neonConfig.webSocketConstructor = ws;

// Generate cuid-like IDs (Prisma uses cuid() for @default)
function generateId() {
  return 'c' + crypto.randomBytes(12).toString('hex').slice(0, 24);
}

const DATABASE_URL = process.env.DATABASE_URL ||
  "postgresql://neondb_owner:npg_p6RCcjU1tIlW@ep-bold-dust-ai1gd22c-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require&pgbouncer=true&connect_timeout=30";

const pool = new Pool({ connectionString: DATABASE_URL });

const dataDir = path.join(__dirname, '..', 'data');

// Files to import - these are the ones that need completing
const filesToImport = [
  { file: '25SP SALES 1.30.26.xlsx', season: '25SP' },
  { file: '25FA SALES 1.30.26.xlsx', season: '25FA' },
  { file: '26SP SALES 1.31.2026.xlsx', season: '26SP' },
  { file: '26FA SALES 1.30.26.xlsx', season: '26FA' },
];

function mapRow(r) {
  return {
    styleNumber: String(r['Style'] || ''),
    styleDesc: String(r['Style Description'] || ''),
    colorCode: String(r['Color'] || r['Color Code'] || ''),
    colorDesc: String(r['Color Desc. From Clr Mst'] || r['Color Desc'] || ''),
    season: String(r['Season'] || ''),
    seasonType: 'Main',
    customer: String(r['Customer Name'] || ''),
    customerType: String(r['Customer Type'] || ''),
    salesRep: String(r['Sales Rep 1'] || ''),
    divisionDesc: String(r['Gender Descripton'] || r['Gender Description'] || ''),
    categoryDesc: String(r['Category Description'] || ''),
    gender: String(r['Gender Descripton'] || r['Gender Description'] || ''),
    unitsBooked: Math.round(Number(r['Units Current Booked'] || 0)),
    unitsOpen: Math.round(Number(r['Units Open'] || 0)),
    revenue: Number(r['$ Current Booked Net'] || 0),
    shipped: Number(r['$ Shipped Net'] || 0),
    cost: Number(r['Cost'] || 0),
    wholesalePrice: Number(r['Wholesale Price'] || 0),
    msrp: Number(r['MSRP (Order)'] || r['MSRP (Style)'] || 0),
    netUnitPrice: Number(r['Net Unit Price'] || 0),
    orderType: String(r['Order Type'] || ''),
  };
}

async function importFile(filePath, expectedSeason) {
  console.log(`\nReading ${path.basename(filePath)}...`);
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);
  console.log(`  Parsed ${rows.length} rows`);

  // Delete existing data for this season
  console.log(`  Deleting existing ${expectedSeason} sales...`);
  const delResult = await pool.query('DELETE FROM "Sale" WHERE season = $1', [expectedSeason]);
  console.log(`  Deleted ${delResult.rowCount} existing rows`);

  // Insert in batches of 500
  const batchSize = 500;
  let inserted = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize).map(mapRow);

    // Build parameterized query (23 columns including id and updatedAt)
    const columns = [
      '"id"', '"styleNumber"', '"styleDesc"', '"colorCode"', '"colorDesc"', '"season"',
      '"seasonType"', '"customer"', '"customerType"', '"salesRep"', '"divisionDesc"',
      '"categoryDesc"', '"gender"', '"unitsBooked"', '"unitsOpen"', '"revenue"',
      '"shipped"', '"cost"', '"wholesalePrice"', '"msrp"', '"netUnitPrice"', '"orderType"',
      '"updatedAt"'
    ];
    const numCols = 23;
    const now = new Date();

    const values = [];
    const placeholders = [];

    for (let j = 0; j < batch.length; j++) {
      const r = batch[j];
      const offset = j * numCols;
      const params = Array.from({length: numCols}, (_, k) => `$${offset+k+1}`);
      placeholders.push(`(${params.join(',')})`);
      values.push(
        generateId(),
        r.styleNumber, r.styleDesc, r.colorCode, r.colorDesc, r.season,
        r.seasonType, r.customer, r.customerType, r.salesRep, r.divisionDesc,
        r.categoryDesc, r.gender, r.unitsBooked, r.unitsOpen, r.revenue,
        r.shipped, r.cost, r.wholesalePrice, r.msrp, r.netUnitPrice, r.orderType,
        now
      );
    }

    const sql = `INSERT INTO "Sale" (${columns.join(',')}) VALUES ${placeholders.join(',')}`;
    await pool.query(sql, values);

    inserted += batch.length;
    if (inserted % 5000 === 0 || inserted === rows.length) {
      console.log(`  Inserted ${inserted}/${rows.length}`);
    }
  }

  console.log(`  ✓ ${expectedSeason}: ${inserted} rows imported`);
  return inserted;
}

async function main() {
  const startTime = Date.now();
  let totalImported = 0;

  for (const { file, season } of filesToImport) {
    const filePath = path.join(dataDir, file);
    const count = await importFile(filePath, season);
    totalImported += count;
  }

  // Check final counts
  const result = await pool.query('SELECT season, COUNT(*) as count FROM "Sale" GROUP BY season ORDER BY season');
  console.log('\n=== Final counts ===');
  let total = 0;
  for (const row of result.rows) {
    console.log(`  ${row.season}: ${row.count}`);
    total += parseInt(row.count);
  }
  console.log(`  TOTAL: ${total}`);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nDone in ${elapsed}s. Imported ${totalImported} new rows.`);

  await pool.end();
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
