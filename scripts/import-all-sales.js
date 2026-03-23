const { PrismaClient } = require('@prisma/client');
const XLSX = require('xlsx');
const fs = require('fs');

const prisma = new PrismaClient();

function parseString(val) {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}
function parseNumber(val) {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return val;
  const num = parseFloat(String(val).replace(/[$,]/g, ''));
  return isNaN(num) ? 0 : num;
}

async function importSalesFile(filePath, expectedSeason) {
  const buffer = fs.readFileSync(filePath);
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  console.log(`${expectedSeason}: ${rows.length} rows from ${filePath.split('/').pop()}`);

  const deleted = await prisma.sale.deleteMany({ where: { season: expectedSeason } });
  if (deleted.count > 0) console.log(`  Cleared ${deleted.count} existing`);

  const BATCH = 2000;
  let count = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
      .filter(r => parseString(r['Style']))
      .map(r => ({
        styleNumber: parseString(r['Style']),
        styleDesc: parseString(r['Style Description']),
        colorCode: parseString(r['Color']),
        colorDesc: parseString(r['Color Desc. From Clr Mst'] || r['Color Description'] || r['Color Desc']),
        season: expectedSeason,
        seasonType: 'Main',
        customer: parseString(r['Customer Name']),
        customerType: parseString(r['Customer Type']),
        salesRep: parseString(r['Sales Rep 1'] || r['Sales Rep']),
        divisionDesc: parseString(r['Division']),
        categoryDesc: parseString(r['Category Description']),
        gender: parseString(r['Gender Descripton'] || r['Gender Description']),
        unitsBooked: Math.round(parseNumber(r['Units Current Booked'])),
        unitsOpen: Math.round(parseNumber(r['Units Open'])),
        revenue: parseNumber(r['$ Current Booked Net'] || r['Current Booked Net']),
        shipped: parseNumber(r['$ Shipped Net'] || r['Shipped Net']),
        cost: parseNumber(r['Cost']),
        wholesalePrice: parseNumber(r['Wholesale Price']),
        msrp: parseNumber(r['MSRP (Style)'] || r['MSRP']),
        netUnitPrice: parseNumber(r['Net Unit Price']),
        orderType: parseString(r['Order Type']),
      }));

    if (batch.length > 0) {
      await prisma.sale.createMany({ data: batch });
      count += batch.length;
    }
  }

  console.log(`  ✓ ${count} records imported`);
  return count;
}

async function importInvoiceFile(filePath) {
  const buffer = fs.readFileSync(filePath);
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  // Group by season
  const seasonCounts = {};
  rows.forEach(r => {
    const s = parseString(r['Season']);
    seasonCounts[s] = (seasonCounts[s] || 0) + 1;
  });
  const seasons = Object.keys(seasonCounts).filter(s => s);
  console.log(`Invoice: ${rows.length} rows, seasons: ${JSON.stringify(seasonCounts)}`);

  // Delete existing for these seasons
  for (const s of seasons) {
    const deleted = await prisma.sale.deleteMany({ where: { season: s } });
    if (deleted.count > 0) console.log(`  Cleared ${deleted.count} existing for ${s}`);
  }

  const BATCH = 2000;
  let count = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
      .filter(r => parseString(r['Style']))
      .map(r => ({
        styleNumber: parseString(r['Style']),
        styleDesc: parseString(r['Style Description']),
        colorCode: parseString(r['Color']),
        colorDesc: parseString(r['Color Description'] || r['Color Desc']),
        season: parseString(r['Season']),
        seasonType: 'Main',
        customer: parseString(r['Customer Name']),
        customerType: parseString(r['Customer Type']),
        salesRep: '',
        divisionDesc: '',
        categoryDesc: '',
        gender: parseString(r['Gender Description']),
        unitsBooked: 0,
        unitsOpen: 0,
        revenue: parseNumber(r['$ Total at Net Price']),
        shipped: parseNumber(r['$ Shipped at Net Price']),
        cost: 0,
        wholesalePrice: 0,
        msrp: parseNumber(r['$ Shipped at MSRP']),
        netUnitPrice: 0,
        orderType: parseString(r['Order Type']),
        // Geo fields
        shipToState: parseString(r['Ship To State']) || null,
        // Invoice-specific
        invoiceNumber: parseString(r['Invoice Number']) || null,
        invoiceDate: r['Invoice Date'] instanceof Date ? r['Invoice Date'] : (r['Invoice Date'] ? new Date(String(r['Invoice Date'])) : null),
        accountingPeriod: parseString(r['Accounting Period']) || null,
        shippedAtNet: parseNumber(r['$ Shipped at Net Price']),
        returnedAtNet: parseNumber(r['$ Returned at Net Price']),
        totalPrice: parseNumber(r['$ Total Price']),
        commissionRate: parseNumber(r['% Commission Rate 1']),
        ytdNetInvoicing: parseNumber(r['YTD Net Invoicing']),
        ytdCreditMemos: parseNumber(r['YTD Credit Memos']),
        ytdSales: parseNumber(r['YTD Sales']),
        warehouse: parseString(r['Warehouse']) || null,
        warehouseDesc: parseString(r['Warehouse Description']) || null,
        openAtNet: parseNumber(r['$ Open at Net Price']),
        openOrder: parseNumber(r['$ Open Order']),
        returned: parseNumber(r['$ Returned']),
        shippedAtMsrp: parseNumber(r['$ Shipped at MSRP']),
        totalAtNet: parseNumber(r['$ Total at Net Price']),
        totalAtWholesale: parseNumber(r['$ Total at Wholesale']),
        returnedAtWholesale: parseNumber(r['$ Returned at Wholesale Price']),
      }));

    if (batch.length > 0) {
      await prisma.sale.createMany({ data: batch });
      count += batch.length;
    }
  }

  console.log(`  ✓ ${count} invoice records imported`);
  return count;
}

async function main() {
  await prisma.$connect();
  let total = 0;

  // Import sales files (seasons without invoice data)
  const salesFiles = [
    { path: 'data/24SP SALES 1.30.26.xlsx', season: '24SP' },
    { path: 'data/24FA SALES 1.30.26.xlsx', season: '24FA' },
    { path: 'data/25SP SALES 1.30.26.xlsx', season: '25SP' },
    { path: 'data/25FA SALES 1.30.26.xlsx', season: '25FA' },
    { path: 'data/26SP SALES 1.31.2026.xlsx', season: '26SP' },
    { path: 'data/26FA SALES 1.30.26.xlsx', season: '26FA' },
  ];

  for (const f of salesFiles) {
    if (fs.existsSync(f.path)) {
      total += await importSalesFile(f.path, f.season);
    }
  }

  // Import invoice file (has geo data)
  total += await importInvoiceFile('data/2026-01 invoice.xlsx');

  // Log it
  await prisma.importLog.create({
    data: {
      fileName: 'import-all-sales.js',
      fileType: 'sales',
      recordCount: total,
    },
  });

  console.log(`\nTotal: ${total} records`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
