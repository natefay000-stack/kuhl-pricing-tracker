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

  console.log(`File: ${filePath}, rows: ${rows.length}`);

  // Delete existing for this season
  const deleted = await prisma.sale.deleteMany({ where: { season: expectedSeason } });
  console.log(`Deleted ${deleted.count} existing ${expectedSeason} records`);

  const BATCH = 2000;
  let count = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
      .filter(r => parseString(r['Style']))
      .map(r => ({
        styleNumber: parseString(r['Style']),
        styleDesc: parseString(r['Style Description']),
        colorCode: parseString(r['Color']),
        colorDesc: parseString(r['Color Desc. From Clr Mst'] || r['Color Desc']),
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
    if (count % 10000 === 0 || i + BATCH >= rows.length) {
      console.log(`  ${expectedSeason}: ${count} imported`);
    }
  }

  await prisma.importLog.create({
    data: {
      fileName: filePath.split('/').pop() || '',
      fileType: 'sales',
      season: expectedSeason,
      recordCount: count,
    },
  });

  return count;
}

async function main() {
  await prisma.$connect();

  const files = [
    { path: 'data/24SP SALES 1.30.26.xlsx', season: '24SP' },
    { path: 'data/24FA SALES 1.30.26.xlsx', season: '24FA' },
    { path: 'data/25SP SALES 1.30.26.xlsx', season: '25SP' },
  ];

  let total = 0;
  for (const f of files) {
    const count = await importSalesFile(f.path, f.season);
    console.log(`✓ ${f.season}: ${count} records\n`);
    total += count;
  }

  console.log(`\nTotal imported: ${total}`);
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
