#!/usr/bin/env node
/**
 * Re-import all sales data (booking + invoice) from xlsx files.
 * Clears ALL existing sales first, then imports per-season booking files + invoice file.
 */
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const DATA_DIR = path.join(__dirname, 'data');
const API_URL = 'https://kuhl-tracker.vercel.app/api/data/import';
const BATCH_SIZE = 1000;

function parseNumber(val) {
  if (val === null || val === undefined || val === '') return 0;
  const num = typeof val === 'number' ? val : parseFloat(String(val).replace(/[$,]/g, ''));
  return isNaN(num) ? 0 : num;
}

function parseString(val) {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

function sendBatch(batch, fileName, replaceExisting, season) {
  const payload = JSON.stringify({
    type: 'sales',
    data: batch,
    fileName,
    replaceExisting,
    ...(season ? { season } : {}),
  });
  const tmpFile = '/tmp/sales-batch.json';
  fs.writeFileSync(tmpFile, payload);

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = execSync(
        `curl -s --max-time 55 -X POST "${API_URL}" -H "Content-Type: application/json" -d @${tmpFile}`,
        { encoding: 'utf-8', timeout: 60000 }
      );
      const json = JSON.parse(result);
      if (json.success) return json.count;
      console.warn(`  Attempt ${attempt} error:`, json.error);
    } catch (err) {
      console.warn(`  Attempt ${attempt} failed: ${err.message?.substring(0, 100)}`);
      if (attempt < 3) execSync('sleep 3');
    }
  }
  throw new Error('Failed after 3 attempts');
}

// Step 1: Clear all existing sales
async function clearAllSales() {
  console.log('\n--- Clearing all existing sales ---');
  // Send empty data with replaceExisting=true and no season to delete ALL
  const payload = JSON.stringify({
    type: 'sales',
    data: [],
    fileName: 'full_clear',
    replaceExisting: true,
  });
  const tmpFile = '/tmp/sales-batch.json';
  fs.writeFileSync(tmpFile, payload);
  const result = execSync(
    `curl -s --max-time 55 -X POST "${API_URL}" -H "Content-Type: application/json" -d @${tmpFile}`,
    { encoding: 'utf-8', timeout: 60000 }
  );
  console.log('Clear result:', result.trim());
}

// Step 2: Import per-season booking files
function importBookingFile(filename) {
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) {
    console.log(`  File not found: ${filename}, skipping`);
    return 0;
  }

  console.log(`  Reading ${filename}...`);
  const buffer = fs.readFileSync(filePath);
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  console.log(`  Parsed ${rows.length} rows`);

  const sales = rows.map((row) => ({
    styleNumber: parseString(row['Style']),
    styleDesc: parseString(row['Style Description']),
    colorCode: parseString(row['Color']),
    colorDesc: parseString(row['Color Desc. From Clr Mst']),
    season: parseString(row['Season']),
    customer: parseString(row['Customer Name']),
    customerType: parseString(row['Customer Type']),
    salesRep: parseString(row['Sales Rep 1']),
    divisionDesc: parseString(row['Division']),
    categoryDesc: parseString(row['Category Description']),
    gender: parseString(row['Gender Descripton']),
    unitsBooked: parseNumber(row['Units Current Booked']),
    unitsOpen: parseNumber(row['Units Open']),
    revenue: parseNumber(row['$ Current Booked Net']),
    shipped: parseNumber(row['$ Shipped Net']),
    cost: parseNumber(row['Cost']),
    wholesalePrice: parseNumber(row['Wholesale Price']),
    msrp: parseNumber(row['MSRP (Style)']) || parseNumber(row['MSRP (Order)']),
    netUnitPrice: parseNumber(row['Net Unit Price']),
    orderType: parseString(row['Order Type']),
  })).filter(s => s.styleNumber);

  console.log(`  Sending ${sales.length} records...`);
  let imported = 0;
  const totalBatches = Math.ceil(sales.length / BATCH_SIZE);

  for (let i = 0; i < sales.length; i += BATCH_SIZE) {
    const batch = sales.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const count = sendBatch(batch, filename, false);
    imported += count;
    process.stdout.write(`    Batch ${batchNum}/${totalBatches}: ${imported}/${sales.length}\r`);
  }
  console.log(`  Imported ${imported} records from ${filename}`);
  return imported;
}

// Step 3: Import invoice file
function importInvoiceFile() {
  const filename = '2026-01 invoice.xlsx';
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) {
    console.log(`  Invoice file not found: ${filename}`);
    return 0;
  }

  console.log(`  Reading ${filename}...`);
  const workbook = XLSX.readFile(filePath, { cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  console.log(`  Parsed ${rows.length} rows`);

  const sales = rows.filter(r => r['Style']).map((row) => {
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
  });

  console.log(`  Sending ${sales.length} records...`);
  let imported = 0;
  const totalBatches = Math.ceil(sales.length / BATCH_SIZE);

  for (let i = 0; i < sales.length; i += BATCH_SIZE) {
    const batch = sales.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const count = sendBatch(batch, filename, false);
    imported += count;
    process.stdout.write(`    Batch ${batchNum}/${totalBatches}: ${imported}/${sales.length}\r`);
  }
  console.log(`  Imported ${imported} records from ${filename}`);
  return imported;
}

// Main
(async () => {
  console.log('=== Full Sales Re-Import ===\n');

  // Clear all sales
  await clearAllSales();

  // Import booking files (the 1.30.26 dated files are the latest per-season)
  const BOOKING_FILES = [
    '24SP SALES 1.30.26.xlsx',
    '24FA SALES 1.30.26.xlsx',
    '25SP SALES 1.30.26.xlsx',
    '25FA SALES 1.30.2026 - Copy.xlsx',  // newer copy
    '26SP SALES 1.31.2026.xlsx',         // newer file
    '26FA SALES 1.30.26.xlsx',
  ];

  let totalBooking = 0;
  console.log('\n--- Importing booking files ---');
  for (const file of BOOKING_FILES) {
    console.log(`\nFile: ${file}`);
    try {
      totalBooking += importBookingFile(file);
    } catch (err) {
      console.error(`  FAILED: ${err.message}`);
    }
    execSync('sleep 1'); // Brief pause between files
  }

  // Import invoice file
  console.log('\n--- Importing invoice file ---');
  let totalInvoice = 0;
  try {
    totalInvoice = importInvoiceFile();
  } catch (err) {
    console.error(`  FAILED: ${err.message}`);
  }

  console.log('\n=== DONE ===');
  console.log(`Booking records: ${totalBooking}`);
  console.log(`Invoice records: ${totalInvoice}`);
  console.log(`Total: ${totalBooking + totalInvoice}`);
})();
