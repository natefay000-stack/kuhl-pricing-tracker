#!/usr/bin/env node
/**
 * Restore missing sales data from per-season snapshot files into Neon DB.
 * Compares DB counts per season with snapshot counts, deletes + re-imports
 * any season that has fewer records in the DB than the snapshot.
 */
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const BATCH_SIZE = 2000;
const PUBLIC_DIR = path.join(__dirname, 'public');

function normalizeCategory(cat) {
  const map = {
    'JACK': 'JACKET', 'PANT': 'PANTS', 'SHOR': 'SHORTS', 'LEGG': 'LEGGINGS',
    'DRES': 'DRESS', 'FLEE': 'FLEECE', 'HEAD': 'HEADWEAR', 'SLEE': 'SLEEVELESS',
    'LONG': 'LONG SLEEVE', 'SHRT': 'SHORT SLEEVE', 'SWEA': 'SWEATER',
    'UNDE': 'UNDERWEAR', 'SKIR': 'SKIRTS', 'SKOR': 'SKORTS', 'MISC': 'MISCELLANEOUS',
    'FLAN': 'FLANNEL', 'BASE': 'BASELAYER', 'VEST': 'VEST', 'BAGS': 'BAGS', 'POP': 'POP',
  };
  const upper = (cat || '').toUpperCase().trim();
  return map[upper] || upper;
}

function transformSaleForDb(item) {
  return {
    styleNumber: String(item.styleNumber || ''),
    styleDesc: String(item.styleDesc || ''),
    colorCode: String(item.colorCode || item.color || ''),
    colorDesc: String(item.colorDesc || ''),
    season: String(item.season || ''),
    seasonType: String(item.seasonType || 'Main'),
    customer: String(item.customer || ''),
    customerType: String(item.customerType || ''),
    salesRep: String(item.salesRep || ''),
    divisionDesc: String(item.divisionDesc || ''),
    categoryDesc: normalizeCategory(String(item.categoryDesc || '')),
    gender: String(item.gender || ''),
    unitsBooked: Number(item.unitsBooked || 0),
    unitsOpen: Number(item.unitsOpen || 0),
    revenue: Number(item.revenue || 0),
    shipped: Number(item.shipped || 0),
    cost: Number(item.cost || 0),
    wholesalePrice: Number(item.wholesalePrice || 0),
    msrp: Number(item.msrp || 0),
    netUnitPrice: Number(item.netUnitPrice || 0),
    orderType: String(item.orderType || ''),
    invoiceDate: item.invoiceDate ? new Date(String(item.invoiceDate)) : null,
    accountingPeriod: item.accountingPeriod ? String(item.accountingPeriod) : null,
    invoiceNumber: item.invoiceNumber ? String(item.invoiceNumber) : null,
    shipToState: item.shipToState ? String(item.shipToState) : null,
    returnedAtNet: Number(item.returnedAtNet || 0),
    shippedAtNet: Number(item.shippedAtNet || 0),
    totalPrice: Number(item.totalPrice || 0),
    commissionRate: Number(item.commissionRate || 0),
    ytdNetInvoicing: Number(item.ytdNetInvoicing || 0),
    ytdCreditMemos: Number(item.ytdCreditMemos || 0),
    ytdSales: Number(item.ytdSales || 0),
    warehouse: item.warehouse ? String(item.warehouse) : null,
    warehouseDesc: item.warehouseDesc ? String(item.warehouseDesc) : null,
    openAtNet: Number(item.openAtNet || 0),
    openOrder: Number(item.openOrder || 0),
    returned: Number(item.returned || 0),
    shippedAtMsrp: Number(item.shippedAtMsrp || 0),
    totalAtNet: Number(item.totalAtNet || 0),
    totalAtWholesale: Number(item.totalAtWholesale || 0),
    returnedAtWholesale: Number(item.returnedAtWholesale || 0),
    shipToCity: item.shipToCity ? String(item.shipToCity) : null,
    shipToZip: item.shipToZip ? String(item.shipToZip) : null,
    billToState: item.billToState ? String(item.billToState) : null,
    billToCity: item.billToCity ? String(item.billToCity) : null,
    billToZip: item.billToZip ? String(item.billToZip) : null,
    unitsShipped: Number(item.unitsShipped || 0),
    unitsReturned: Number(item.unitsReturned || 0),
    dataSource: item.dataSource ? String(item.dataSource) : null,
  };
}

async function main() {
  // Read manifest
  const manifestPath = path.join(PUBLIC_DIR, 'data-sales-manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.error('No manifest found at', manifestPath);
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  console.log(`Manifest: ${manifest.totalSales} total sales across ${manifest.seasons.length} seasons`);

  // Get DB counts per season
  const dbCountsRaw = await prisma.$queryRaw`
    SELECT season, COUNT(*)::int as cnt FROM "Sale" GROUP BY season ORDER BY season
  `;
  const dbCounts = {};
  for (const r of dbCountsRaw) {
    dbCounts[r.season] = r.cnt;
  }

  // Compare each season
  const seasonsToRestore = [];
  for (const season of manifest.seasons) {
    const snapFile = path.join(PUBLIC_DIR, `data-sales-${season}.json`);
    if (!fs.existsSync(snapFile)) continue;
    const snapData = JSON.parse(fs.readFileSync(snapFile, 'utf-8'));
    const snapCount = snapData.length;
    const dbCount = dbCounts[season] || 0;
    const diff = snapCount - dbCount;

    if (diff > 10) {
      console.log(`  ${season}: DB=${dbCount}, Snapshot=${snapCount} → MISSING ${diff} records ⚠️`);
      seasonsToRestore.push({ season, snapData, snapCount, dbCount });
    } else {
      console.log(`  ${season}: DB=${dbCount}, Snapshot=${snapCount} → OK`);
    }
  }

  if (seasonsToRestore.length === 0) {
    console.log('\nAll seasons match. Nothing to restore.');
    return;
  }

  console.log(`\nRestoring ${seasonsToRestore.length} seasons...`);

  for (const { season, snapData, snapCount, dbCount } of seasonsToRestore) {
    console.log(`\n--- Restoring ${season} (${snapCount} records, replacing ${dbCount}) ---`);

    // Delete existing records for this season
    const deleted = await prisma.sale.deleteMany({ where: { season } });
    console.log(`  Deleted ${deleted.count} existing records`);

    // Insert in batches
    let inserted = 0;
    for (let i = 0; i < snapData.length; i += BATCH_SIZE) {
      const batch = snapData.slice(i, i + BATCH_SIZE).map(transformSaleForDb);
      await prisma.sale.createMany({ data: batch });
      inserted += batch.length;
      if (inserted % 10000 === 0 || inserted === snapData.length) {
        process.stdout.write(`  Inserted ${inserted}/${snapData.length}\r`);
      }
    }
    console.log(`  Inserted ${inserted}/${snapData.length} records ✓`);
  }

  // Final count
  const finalCount = await prisma.sale.count();
  console.log(`\nDone! DB now has ${finalCount} total sales records.`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
