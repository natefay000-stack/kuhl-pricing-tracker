#!/usr/bin/env node
/**
 * Build static JSON snapshots of all data from SQLite (via Prisma).
 * Output:
 *   public/data-core.json   — products, pricing, costs, inventory + aggregations
 *   public/data-sales.json  — all sales records
 *
 * The frontend loads these directly — no API calls needed on page load.
 * Run this whenever data changes: node scripts/build-snapshot.js
 *
 * Also called automatically after file imports.
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

// Compute aggregations in-process
function computeInventoryAggregations(inventory) {
  const typeMap = new Map();
  const whMap = new Map();
  const periodMap = new Map();

  for (const r of inventory) {
    const mt = r.movementType || 'Unknown';
    const te = typeMap.get(mt) || { count: 0, totalQty: 0, totalExtension: 0 };
    te.count++; te.totalQty += r.qty || 0; te.totalExtension += r.extension || 0;
    typeMap.set(mt, te);

    const wh = r.warehouse || 'Unknown';
    const we = whMap.get(wh) || { count: 0, totalQty: 0, totalExtension: 0 };
    we.count++; we.totalQty += r.qty || 0; we.totalExtension += r.extension || 0;
    whMap.set(wh, we);

    const p = r.period || 'Unknown';
    const pe = periodMap.get(p) || { count: 0, totalQty: 0, totalExtension: 0 };
    pe.count++; pe.totalQty += r.qty || 0; pe.totalExtension += r.extension || 0;
    periodMap.set(p, pe);
  }

  return {
    totalCount: inventory.length,
    byType: Array.from(typeMap.entries()).map(([k, v]) => ({ movementType: k, ...v })),
    byWarehouse: Array.from(whMap.entries()).map(([k, v]) => ({ warehouse: k, ...v })),
    byPeriod: Array.from(periodMap.entries()).map(([k, v]) => ({ period: k, ...v })).sort((a, b) => a.period.localeCompare(b.period)),
  };
}

function computeSalesAggregations(sales) {
  const channelMap = new Map();
  const categoryMap = new Map();
  const genderMap = new Map();
  const customerMap = new Map();

  for (const s of sales) {
    if (s.customerType) {
      const ck = `${s.season}-${s.customerType}`;
      const ce = channelMap.get(ck);
      if (ce) { ce.revenue += s.revenue || 0; ce.units += s.unitsBooked || 0; }
      else channelMap.set(ck, { channel: s.customerType, season: s.season || '', revenue: s.revenue || 0, units: s.unitsBooked || 0 });
    }

    const catKey = `${s.season}-${s.categoryDesc || 'Other'}`;
    const catE = categoryMap.get(catKey);
    if (catE) { catE.revenue += s.revenue || 0; catE.units += s.unitsBooked || 0; }
    else categoryMap.set(catKey, { category: s.categoryDesc || 'Other', season: s.season || '', revenue: s.revenue || 0, units: s.unitsBooked || 0 });

    const div = (s.divisionDesc || '').toLowerCase();
    let gender = 'Unisex';
    if (div.includes('women') || div.includes('woman')) gender = "Women's";
    else if (div.includes("men's") || div.includes('mens')) gender = "Men's";
    const gk = `${s.season}-${gender}`;
    const ge = genderMap.get(gk);
    if (ge) { ge.revenue += s.revenue || 0; ge.units += s.unitsBooked || 0; }
    else genderMap.set(gk, { gender, season: s.season || '', revenue: s.revenue || 0, units: s.unitsBooked || 0 });

    if (s.customer) {
      const custKey = `${s.season}-${s.customer}`;
      const custE = customerMap.get(custKey);
      if (custE) { custE.revenue += s.revenue || 0; custE.units += s.unitsBooked || 0; }
      else customerMap.set(custKey, { customer: s.customer, customerType: s.customerType || '', season: s.season || '', revenue: s.revenue || 0, units: s.unitsBooked || 0 });
    }
  }

  return {
    byChannel: Array.from(channelMap.values()),
    byCategory: Array.from(categoryMap.values()),
    byGender: Array.from(genderMap.values()),
    byCustomer: Array.from(customerMap.values()),
  };
}

async function main() {
  const startTime = Date.now();
  console.log('Building data snapshot from SQLite (Prisma)...\n');

  // Fetch all tables in parallel
  console.log('Fetching tables...');
  const [products, pricing, costs, inventory, sales] = await Promise.all([
    prisma.product.findMany({ orderBy: { season: 'desc' } }),
    prisma.pricing.findMany({ orderBy: { season: 'desc' } }),
    prisma.cost.findMany({ orderBy: { season: 'desc' } }),
    prisma.inventory.findMany({ orderBy: [{ movementDate: 'desc' }, { styleNumber: 'asc' }] }),
    prisma.sale.findMany({ orderBy: [{ season: 'asc' }, { styleNumber: 'asc' }] }),
  ]);

  console.log(`  Products: ${products.length} rows`);
  console.log(`  Pricing: ${pricing.length} rows`);
  console.log(`  Costs: ${costs.length} rows`);
  console.log(`  Inventory: ${inventory.length} rows`);
  console.log(`  Sales: ${sales.length} rows`);

  // Compute aggregations locally
  console.log('\nComputing aggregations...');
  const inventoryAggregations = computeInventoryAggregations(inventory);
  const salesAggregations = computeSalesAggregations(sales);
  console.log('  Done.');

  // Build core snapshot (everything except bulk sales)
  const coreSnapshot = {
    success: true,
    buildTime: new Date().toISOString(),
    counts: {
      products: products.length,
      sales: sales.length,
      pricing: pricing.length,
      costs: costs.length,
      inventory: inventory.length,
    },
    data: {
      products,
      pricing,
      costs,
      inventory,
    },
    salesAggregations,
    inventoryAggregations,
  };

  // Build sales snapshot (separate file for progressive loading)
  const salesSnapshot = {
    success: true,
    buildTime: new Date().toISOString(),
    totalSales: sales.length,
    sales,
  };

  // Ensure public directory exists
  const publicDir = path.join(__dirname, '..', 'public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  // Write core snapshot
  const corePath = path.join(publicDir, 'data-core.json');
  fs.writeFileSync(corePath, JSON.stringify(coreSnapshot));
  const coreSizeMB = (fs.statSync(corePath).size / 1024 / 1024).toFixed(1);

  // Write sales snapshot
  const salesPath = path.join(publicDir, 'data-sales.json');
  fs.writeFileSync(salesPath, JSON.stringify(salesSnapshot));
  const salesSizeMB = (fs.statSync(salesPath).size / 1024 / 1024).toFixed(1);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nSnapshots built in ${elapsed}s`);
  console.log(`  Core:  ${corePath} (${coreSizeMB} MB)`);
  console.log(`  Sales: ${salesPath} (${salesSizeMB} MB)`);
  console.log(`Counts: ${products.length} products, ${sales.length} sales, ${pricing.length} pricing, ${costs.length} costs, ${inventory.length} inventory`);
}

main()
  .catch(err => {
    console.error('FATAL:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
