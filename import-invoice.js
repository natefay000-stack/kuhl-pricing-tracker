const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const filePath = path.join(__dirname, 'data', '2026-01 invoice.xlsx');
console.log('Reading invoice file...');
const workbook = XLSX.readFile(filePath, { cellDates: true });
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
console.log(`Parsed ${rows.length} rows`);

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
    seasonType: 'Main',
    customer: String(row['Customer Name'] || ''),
    customerType: String(row['Customer Type'] || ''),
    divisionDesc: String(row['Gender Description'] || ''),
    gender: String(row['Gender Description'] || ''),
    orderType: String(row['Order Type Description'] || row['Order Type'] || ''),
    unitsBooked: 0, unitsOpen: 0, revenue: 0, shipped: 0, cost: 0,
    wholesalePrice: 0, msrp: 0, netUnitPrice: 0, salesRep: '', categoryDesc: '',
    invoiceDate,
    accountingPeriod: String(row['Accounting Period'] || ''),
    invoiceNumber: String(row['Invoice Number'] || ''),
    shipToState: String(row['Ship To State'] || ''),
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
    shipToCity: '', shipToZip: '', billToState: '', billToCity: '', billToZip: '',
    unitsShipped: 0, unitsReturned: 0,
  };
}

const mapped = rows.filter(r => r['Style']).map(mapRow);
console.log(`Mapped ${mapped.length} records`);

const BATCH_SIZE = 1000;
const API_URL = 'https://kuhl-tracker.vercel.app/api/data/import';
const START_FROM = 32000; // First 32K already imported
const remaining = mapped.slice(START_FROM);
const totalBatches = Math.ceil(remaining.length / BATCH_SIZE);
console.log(`\nResuming from record ${START_FROM}. Sending ${remaining.length} records in ${totalBatches} batches...`);

let totalImported = 0;
for (let i = 0; i < remaining.length; i += BATCH_SIZE) {
  const batch = remaining.slice(i, i + BATCH_SIZE);
  const batchNum = Math.floor(i / BATCH_SIZE) + 1;
  
  const payload = JSON.stringify({ type: 'sales', data: batch, fileName: '2026-01 invoice.xlsx', replaceExisting: false });
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
        console.log(`Batch ${batchNum}/${totalBatches}: ${json.count} records`);
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

console.log(`\nDone! Imported ${totalImported} additional records (${START_FROM + totalImported} total with invoice data)`);
