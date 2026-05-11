/* eslint-disable */
// CLI invoice importer.
//
//   node import-invoice.js <path/to/file.xlsx> [api-url]
//
// Examples:
//   node import-invoice.js ~/Downloads/2025-Q3\ Invoice\ data\ 5.4.xlsx
//   node import-invoice.js data/2026-01\ invoice.xlsx http://localhost:3000/api/data/import
//
// Defaults to the Vercel production API if no URL is given. Sends
// type='invoice' so rows land in the Invoice table (NOT 'sales' — that
// was the old footgun that silently routed invoice data to the wrong
// table). Uses skipDuplicates against the wider natural-key + NULLS NOT
// DISTINCT index, so re-running on the same file is a no-op.
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node import-invoice.js <path/to/file.xlsx> [api-url]');
  console.error('Example: node import-invoice.js ~/Downloads/2025-Q3\\ Invoice\\ data\\ 5.4.xlsx');
  process.exit(1);
}
const resolvedPath = path.resolve(filePath);
if (!fs.existsSync(resolvedPath)) {
  console.error(`File not found: ${resolvedPath}`);
  process.exit(1);
}

const API_URL = process.argv[3] || 'https://kuhl-tracker.vercel.app/api/data/import';
const BATCH_SIZE = 2000;

console.log(`Reading ${resolvedPath}...`);
const workbook = XLSX.readFile(resolvedPath, { cellDates: true });
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
console.log(`Parsed ${rows.length.toLocaleString()} rows`);

function mapRow(row) {
  let invoiceDate = null;
  const rawDate = row['Invoice Date'];
  if (rawDate instanceof Date) invoiceDate = rawDate.toISOString();
  else if (rawDate) { const d = new Date(String(rawDate)); if (!isNaN(d.getTime())) invoiceDate = d.toISOString(); }

  return {
    styleNumber: String(row['Style'] || ''),
    styleDesc: String(row['Style Description'] || ''),
    colorCode: String(row['Color'] || ''),
    colorDesc: String(row['Color Description'] || ''),
    season: String(row['Season'] || '').trim(),
    customer: String(row['Customer Name'] || ''),
    customerType: String(row['Customer Type'] || ''),
    gender: String(row['Gender Description'] || ''),
    orderType: String(row['Order Type Description'] || row['Order Type'] || ''),
    invoiceDate,
    accountingPeriod: String(row['Accounting Period'] || ''),
    invoiceNumber: String(row['Invoice Number'] || ''),
    shipToState: String(row['Ship To State'] || ''),
    shipToCity: String(row['Ship To City'] || ''),
    shipToZip: String(row['Zip Code'] || row['Zip'] || ''),
    returnedAtNet: Number(row['$ Returned at Net Price'] || 0),
    shippedAtNet: Number(row['$ Shipped at Net Price'] || 0),
    totalPrice: Number(row['$ Total Price'] || 0),
    commissionRate: Number(row['% Commission Rate 1'] || 0),
    ytdNetInvoicing: Number(row['YTD Net Invoicing'] || 0),
    ytdCreditMemos: Number(row['YTD Credit Memos'] || 0),
    ytdSales: Number(row['YTD Sales'] || 0),
    warehouse: String(row['Warehouse'] || ''),
    warehouseDesc: String(row['Warehouse Description'] || ''),
    openAtNet: Number(row['$ Open at Net Price'] || 0),
    openOrder: Number(row['$ Open Order'] || 0),
    returned: Number(row['$ Returned'] || 0),
    shippedAtMsrp: Number(row['$ Shipped at MSRP'] || 0),
    totalAtNet: Number(row['$ Total at Net Price'] || 0),
    totalAtWholesale: Number(row['$ Total at Wholesale'] || 0),
    returnedAtWholesale: Number(row['$ Returned at Wholesale Price'] || 0),
    unitsShipped: Number(row['Units Shipped'] || 0),
    unitsReturned: Number(row['Units Returned'] || 0),
  };
}

const mapped = rows.filter(r => r['Style']).map(mapRow);
console.log(`Mapped ${mapped.length.toLocaleString()} records (filtered out rows with no Style)`);
console.log(`Target: ${API_URL}`);

const totalBatches = Math.ceil(mapped.length / BATCH_SIZE);
console.log(`\nSending ${mapped.length.toLocaleString()} records in ${totalBatches} batches of ${BATCH_SIZE}...\n`);

let totalImported = 0;
const startMs = Date.now();
for (let i = 0; i < mapped.length; i += BATCH_SIZE) {
  const batch = mapped.slice(i, i + BATCH_SIZE);
  const batchNum = Math.floor(i / BATCH_SIZE) + 1;

  const payload = JSON.stringify({
    type: 'invoice',
    data: batch,
    fileName: path.basename(resolvedPath),
    replaceExisting: false,
  });
  const tmpFile = '/tmp/invoice-batch.json';
  fs.writeFileSync(tmpFile, payload);

  let success = false;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = execSync(
        `curl -s --max-time 55 -X POST "${API_URL}" -H "Content-Type: application/json" -d @${tmpFile}`,
        { encoding: 'utf-8', timeout: 60000 }
      );
      const json = JSON.parse(result);
      if (json.success) {
        const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
        console.log(`Batch ${batchNum}/${totalBatches}: +${json.count} (cumulative ${totalImported + json.count}, ${elapsed}s)`);
        totalImported += json.count;
        success = true;
        break;
      } else {
        console.warn(`Batch ${batchNum} attempt ${attempt} error:`, json.error);
      }
    } catch (err) {
      console.warn(`Batch ${batchNum} attempt ${attempt} failed: ${err.message?.substring(0, 100)}`);
      if (attempt < 3) execSync('sleep 3');
    }
  }
  if (!success) { console.error(`Batch ${batchNum} FAILED after 3 attempts, stopping.`); process.exit(1); }
}

const totalSec = ((Date.now() - startMs) / 1000).toFixed(1);
console.log(`\nDone. Server reported ${totalImported.toLocaleString()} rows imported in ${totalSec}s.`);
console.log('(Note: server-side skipDuplicates may report 0 per batch even when rows DO insert — verify via /api/admin/invoice-year-stats for actual delta.)');
