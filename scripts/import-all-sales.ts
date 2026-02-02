import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

const API_URL = 'https://satisfied-liberation-production-402e.up.railway.app/api/data/import';

const SALES_FILES = [
  '24FA SALES 1.30.26.xlsx',
  '24SP SALES 1.30.26.xlsx',
  '25FA SALES 1.30.26.xlsx',
  '25SP SALES 1.30.26.xlsx',
  '26FA SALES 1.30.26.xlsx',
  '26SP SALES 1.30.26.xlsx',
];

const DATA_DIR = '/Users/natef/Library/Mobile Documents/com~apple~CloudDocs/Projects/kuhl-pricing-tracker/data';

function parseNumber(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0;
  const num = typeof val === 'number' ? val : parseFloat(String(val).replace(/[$,]/g, ''));
  return isNaN(num) ? 0 : num;
}

function parseString(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

async function importSalesFile(filename: string, isFirst: boolean): Promise<number> {
  const filePath = path.join(DATA_DIR, filename);

  if (!fs.existsSync(filePath)) {
    console.log('  ⚠️  File not found:', filename);
    return 0;
  }

  console.log('  📖 Reading', filename + '...');
  const buffer = fs.readFileSync(filePath);
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, unknown>[];

  console.log('  📊 Parsed', rows.length, 'rows');

  // Transform to sales format - column names from actual Excel headers
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
  })).filter(s => s.styleNumber); // Filter out empty rows

  console.log('  📤 Importing', sales.length, 'records...');

  // Send in batches of 2000
  const BATCH_SIZE = 2000;
  let imported = 0;

  for (let i = 0; i < sales.length; i += BATCH_SIZE) {
    const batch = sales.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(sales.length / BATCH_SIZE);

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'sales',
        data: batch,
        fileName: filename,
        replaceExisting: isFirst && i === 0, // Only clear on first batch of first file
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error('API error: ' + error);
    }

    imported += batch.length;
    console.log('     Batch', batchNum + '/' + totalBatches + ':', imported + '/' + sales.length, 'records');
  }

  return sales.length;
}

async function main() {
  console.log('🚀 Starting sales import...\n');

  let totalImported = 0;
  let isFirst = true;

  for (const file of SALES_FILES) {
    console.log('\n📁 Processing:', file);
    try {
      const count = await importSalesFile(file, isFirst);
      totalImported += count;
      isFirst = false;
      console.log('  ✅ Imported', count, 'records');
    } catch (error) {
      console.error('  ❌ Error:', error);
    }
  }

  console.log('\n🎉 Done! Total imported:', totalImported, 'sales records');
}

main().catch(console.error);
