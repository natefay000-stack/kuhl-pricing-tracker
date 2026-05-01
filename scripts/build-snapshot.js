#!/usr/bin/env node
/**
 * Build static JSON snapshots from database (Neon PostgreSQL via Prisma).
 * Output:
 *   public/data-core.json              — products, pricing, costs, inventory + aggregations
 *   public/data-sales-manifest.json    — season list
 *   public/data-sales-{season}.json    — per-season sales records (slim format)
 *
 * The frontend loads these directly — no API calls needed on page load.
 * Run this whenever data changes: node scripts/build-snapshot.js
 *
 * Memory-optimized: fetches and writes sales per-season to stay under 8GB.
 *
 * Build cache: Snapshots are cached in .next/cache/data-snapshots/ (persisted by
 * Vercel between builds). If the database is unavailable, the cached files are
 * restored to public/ automatically.
 */

const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');
const { Pool, neonConfig } = require('@neondatabase/serverless');
const ws = require('ws');
const fs = require('fs');
const path = require('path');

// WebSocket support for Node.js
neonConfig.webSocketConstructor = ws;

const publicDir = path.join(__dirname, '..', 'public');
const cacheDir = path.join(__dirname, '..', '.next', 'cache', 'data-snapshots');

// Ensure directories exist
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Copy all data-*.json files between directories
function copySnapshots(from, to) {
  ensureDir(to);
  const files = fs.readdirSync(from).filter(f =>
    f.startsWith('data-') && f.endsWith('.json')
  );
  for (const file of files) {
    fs.copyFileSync(path.join(from, file), path.join(to, file));
  }
  return files;
}

// Try to restore snapshots from build cache
function restoreFromCache() {
  if (!fs.existsSync(cacheDir)) return false;
  const manifestPath = path.join(cacheDir, 'data-sales-manifest.json');
  if (!fs.existsSync(manifestPath)) return false;

  console.log('Restoring snapshots from build cache...');
  const files = copySnapshots(cacheDir, publicDir);
  console.log(`  Restored ${files.length} files from cache`);
  return true;
}

// Save snapshots to build cache
function saveToCache() {
  const files = copySnapshots(publicDir, cacheDir);
  console.log(`  Cached ${files.length} snapshot files for future builds`);
}

// Compute inventory aggregations in-process
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

// Compute sales aggregations from per-season data (memory efficient)
function updateSalesAggregations(agg, sales) {
  for (const s of sales) {
    if (s.customerType) {
      const ck = `${s.season}-${s.customerType}`;
      const ce = agg.channelMap.get(ck);
      if (ce) { ce.revenue += s.revenue || 0; ce.units += s.unitsBooked || 0; }
      else agg.channelMap.set(ck, { channel: s.customerType, season: s.season || '', revenue: s.revenue || 0, units: s.unitsBooked || 0 });
    }

    const catKey = `${s.season}-${s.categoryDesc || 'Other'}`;
    const catE = agg.categoryMap.get(catKey);
    if (catE) { catE.revenue += s.revenue || 0; catE.units += s.unitsBooked || 0; }
    else agg.categoryMap.set(catKey, { category: s.categoryDesc || 'Other', season: s.season || '', revenue: s.revenue || 0, units: s.unitsBooked || 0 });

    const div = (s.divisionDesc || '').toLowerCase();
    let gender = 'Unisex';
    if (div.includes('women') || div.includes('woman')) gender = "Women's";
    else if (div.includes('men')) gender = "Men's";
    const gk = `${s.season}-${gender}`;
    const ge = agg.genderMap.get(gk);
    if (ge) { ge.revenue += s.revenue || 0; ge.units += s.unitsBooked || 0; }
    else agg.genderMap.set(gk, { gender, season: s.season || '', revenue: s.revenue || 0, units: s.unitsBooked || 0 });

    if (s.customer) {
      const custKey = `${s.season}-${s.customer}`;
      const custE = agg.customerMap.get(custKey);
      if (custE) { custE.revenue += s.revenue || 0; custE.units += s.unitsBooked || 0; }
      else agg.customerMap.set(custKey, { customer: s.customer, customerType: s.customerType || '', season: s.season || '', revenue: s.revenue || 0, units: s.unitsBooked || 0 });
    }
  }
}

function finalizeSalesAggregations(agg) {
  return {
    byChannel: Array.from(agg.channelMap.values()),
    byCategory: Array.from(agg.categoryMap.values()),
    byGender: Array.from(agg.genderMap.values()),
    byCustomer: Array.from(agg.customerMap.values()),
  };
}

// Slim down a sales record for the snapshot
function slimSale(s) {
  const rec = {
    styleNumber: s.styleNumber,
    season: s.season,
    revenue: s.revenue,
    unitsBooked: s.unitsBooked,
  };
  if (s.styleDesc) rec.styleDesc = s.styleDesc;
  if (s.colorCode) rec.colorCode = s.colorCode;
  if (s.colorDesc) rec.colorDesc = s.colorDesc;
  if (s.seasonType && s.seasonType !== 'Main') rec.seasonType = s.seasonType;
  if (s.divisionDesc) rec.divisionDesc = s.divisionDesc;
  if (s.categoryDesc) rec.categoryDesc = s.categoryDesc;
  if (s.customer) rec.customer = s.customer;
  if (s.customerType) rec.customerType = s.customerType;
  if (s.salesRep) rec.salesRep = s.salesRep;
  if (s.gender) rec.gender = s.gender;
  if (s.orderType) rec.orderType = s.orderType;
  if (s.unitsOpen) rec.unitsOpen = s.unitsOpen;
  if (s.shipped) rec.shipped = s.shipped;
  if (s.cost) rec.cost = s.cost;
  if (s.wholesalePrice) rec.wholesalePrice = s.wholesalePrice;
  if (s.msrp) rec.msrp = s.msrp;
  if (s.netUnitPrice) rec.netUnitPrice = s.netUnitPrice;
  if (s.shipToState) rec.shipToState = s.shipToState;
  if (s.shipToCity) rec.shipToCity = s.shipToCity;
  if (s.shipToZip) rec.shipToZip = s.shipToZip;
  if (s.billToState) rec.billToState = s.billToState;
  if (s.billToCity) rec.billToCity = s.billToCity;
  if (s.billToZip) rec.billToZip = s.billToZip;
  if (s.shippedAtNet) rec.shippedAtNet = s.shippedAtNet;
  if (s.unitsShipped) rec.unitsShipped = s.unitsShipped;
  return rec;
}

async function main() {
  const startTime = Date.now();
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.log('DATABASE_URL not set, checking cache...');
    if (restoreFromCache()) return;
    console.error('No cache available either. Skipping snapshot build.');
    process.exit(0);
  }

  let pool, prisma;
  try {
    pool = new Pool({ connectionString });
    const adapter = new PrismaNeon(pool);
    prisma = new PrismaClient({ adapter });

    console.log('Building data snapshots from database...\n');
    ensureDir(publicDir);

    // ── Step 1: Fetch non-sales tables (small) ──
    // Invoices are NOT loaded into memory here — at 400K+ rows they OOM
    // the Vercel build machine. We only need the count for log/manifest,
    // and the runtime API serves them paginated anyway.
    console.log('Fetching core tables...');
    const [products, pricing, costs, inventory, invoiceCount] = await Promise.all([
      prisma.product.findMany({ orderBy: { season: 'desc' } }),
      prisma.pricing.findMany({ orderBy: { season: 'desc' } }),
      prisma.cost.findMany({ orderBy: { season: 'desc' } }),
      prisma.inventory.findMany({ orderBy: [{ movementDate: 'desc' }, { styleNumber: 'asc' }] }),
      prisma.invoice.count(),
    ]);

    console.log(`  Products: ${products.length} | Pricing: ${pricing.length} | Costs: ${costs.length} | Inventory: ${inventory.length} | Invoices: ${invoiceCount}`);

    // Compute inventory aggregations
    const inventoryAggregations = computeInventoryAggregations(inventory);

    // ── Step 2: Get distinct seasons from sales ──
    console.log('\nFetching sales seasons...');
    const seasonRows = await prisma.sale.groupBy({
      by: ['season'],
      _count: { id: true },
      orderBy: { season: 'asc' },
    });
    const seasons = seasonRows.map(r => r.season).filter(Boolean);
    const totalSales = seasonRows.reduce((sum, r) => sum + r._count.id, 0);
    console.log(`  ${seasons.length} seasons, ${totalSales} total sales records`);

    // ── Step 3: Process sales per-season (memory efficient) ──
    console.log('\nProcessing sales per-season...');
    const salesAgg = {
      channelMap: new Map(),
      categoryMap: new Map(),
      genderMap: new Map(),
      customerMap: new Map(),
    };
    let totalSalesMB = 0;

    for (const season of seasons) {
      // Fetch one season at a time
      const seasonSales = await prisma.sale.findMany({
        where: { season },
        orderBy: [{ styleNumber: 'asc' }, { customer: 'asc' }],
      });

      // Update aggregations
      updateSalesAggregations(salesAgg, seasonSales);

      // Slim and write to disk immediately
      const slimData = seasonSales.map(slimSale);
      const seasonPath = path.join(publicDir, `data-sales-${season}.json`);
      fs.writeFileSync(seasonPath, JSON.stringify(slimData));
      const sizeMB = (fs.statSync(seasonPath).size / 1024 / 1024).toFixed(1);
      totalSalesMB += parseFloat(sizeMB);
      console.log(`  ${season}: ${seasonSales.length} records (${sizeMB} MB)`);

      // slimData and seasonSales go out of scope here — GC can reclaim
    }

    // Finalize aggregations
    const salesAggregations = finalizeSalesAggregations(salesAgg);

    // Write manifest
    const manifest = {
      success: true,
      buildTime: new Date().toISOString(),
      totalSales,
      seasons,
    };
    fs.writeFileSync(path.join(publicDir, 'data-sales-manifest.json'), JSON.stringify(manifest));

    // ── Step 4: Write core snapshot (no sales data) ──
    console.log('\nWriting core snapshot...');
    const coreSnapshot = {
      success: true,
      buildTime: new Date().toISOString(),
      counts: {
        products: products.length,
        sales: totalSales,
        pricing: pricing.length,
        costs: costs.length,
        inventory: inventory.length,
        invoices: invoiceCount,
      },
      data: { products, pricing, costs, inventory },
      salesAggregations,
      inventoryAggregations,
    };

    const corePath = path.join(publicDir, 'data-core.json');
    fs.writeFileSync(corePath, JSON.stringify(coreSnapshot));
    const coreSizeMB = (fs.statSync(corePath).size / 1024 / 1024).toFixed(1);

    // Invoices are too large for static files (~197MB) — Vercel's 250MB serverless
    // function limit includes all public/ files. Invoices are loaded at runtime
    // via /api/data/invoices instead.
    console.log(`\n  Invoices: ${invoiceCount} records (served via API, not static file)`);

    // Remove any stale invoice snapshot from previous builds
    const staleInvoicePath = path.join(publicDir, 'data-invoices.json');
    if (fs.existsSync(staleInvoicePath)) {
      fs.unlinkSync(staleInvoicePath);
      console.log('  Removed stale data-invoices.json');
    }

    // Cache for future builds
    saveToCache();

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\nSnapshots built in ${elapsed}s`);
    console.log(`  Core:  ${corePath} (${coreSizeMB} MB)`);
    console.log(`  Sales: ${seasons.length} season files (${totalSalesMB.toFixed(1)} MB total)`);
    console.log(`Counts: ${products.length} products, ${totalSales} sales, ${pricing.length} pricing, ${costs.length} costs, ${inventory.length} inventory, ${invoiceCount} invoices`);

    await prisma.$disconnect();
    await pool.end();

  } catch (err) {
    console.error('Database error:', err.message || err);
    console.log('\nAttempting to restore from build cache...');

    if (restoreFromCache()) {
      console.log('Successfully restored cached snapshots. Build will continue.');
    } else {
      const existingManifest = path.join(publicDir, 'data-sales-manifest.json');
      if (fs.existsSync(existingManifest)) {
        const m = JSON.parse(fs.readFileSync(existingManifest, 'utf-8'));
        if (m.totalSales > 0) {
          console.log(`Using existing snapshot files in public/ (${m.totalSales} sales, ${m.seasons.length} seasons)`);
          saveToCache();
          return;
        }
      }
      console.error('No cached or existing snapshots available. Build will proceed without data.');
      ensureDir(publicDir);
      fs.writeFileSync(path.join(publicDir, 'data-core.json'), JSON.stringify({
        success: true, buildTime: new Date().toISOString(),
        counts: { products: 0, sales: 0, pricing: 0, costs: 0, inventory: 0, invoices: 0 },
        data: { products: [], pricing: [], costs: [], inventory: [], invoices: [] },
        salesAggregations: { byChannel: [], byCategory: [], byGender: [], byCustomer: [] },
        inventoryAggregations: { totalCount: 0, byType: [], byWarehouse: [], byPeriod: [] },
      }));
      fs.writeFileSync(path.join(publicDir, 'data-sales-manifest.json'), JSON.stringify({
        success: true, buildTime: new Date().toISOString(), totalSales: 0, seasons: [],
      }));
    }

    try { if (prisma) await prisma.$disconnect(); } catch {}
    try { if (pool) await pool.end(); } catch {}
  }
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(0);
});
