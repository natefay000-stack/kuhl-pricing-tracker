/**
 * Rebuild static JSON snapshots from database.
 * Called automatically after file imports to keep snapshots fresh.
 *
 * Outputs:
 *   public/data-core.json              — products, pricing, costs, inventory + aggregations
 *   public/data-sales-manifest.json    — season list
 *   public/data-sales-{season}.json    — per-season sales records (slim format)
 */

import prisma from '@/lib/prisma';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function computeInventoryAggregations(inventory: any[]) {
  const typeMap = new Map<string, { count: number; totalQty: number; totalExtension: number }>();
  const whMap = new Map<string, { count: number; totalQty: number; totalExtension: number }>();
  const periodMap = new Map<string, { count: number; totalQty: number; totalExtension: number }>();

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
    byPeriod: Array.from(periodMap.entries()).map(([k, v]) => ({ period: k, ...v }))
      .sort((a, b) => a.period.localeCompare(b.period)),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function computeSalesAggregations(sales: any[]) {
  const channelMap = new Map<string, { channel: string; season: string; revenue: number; units: number }>();
  const categoryMap = new Map<string, { category: string; season: string; revenue: number; units: number }>();
  const genderMap = new Map<string, { gender: string; season: string; revenue: number; units: number }>();
  const customerMap = new Map<string, { customer: string; customerType: string; season: string; revenue: number; units: number }>();

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

// Slim a sales record — strip unused fields and zero/null values
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function slimSalesRecord(s: any): Record<string, unknown> {
  const rec: Record<string, unknown> = {
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
  return rec;
}

/**
 * Rebuild snapshots from the database.
 * Returns { corePath, counts } on success.
 */
export async function rebuildSnapshots(): Promise<{
  corePath: string;
  counts: { products: number; sales: number; pricing: number; costs: number; inventory: number };
}> {
  const startTime = Date.now();
  console.log('[Snapshot] Rebuilding from database...');

  const [products, pricing, costs, inventory, sales] = await Promise.all([
    prisma.product.findMany({ orderBy: { season: 'desc' } }),
    prisma.pricing.findMany({ orderBy: { season: 'desc' } }),
    prisma.cost.findMany({ orderBy: { season: 'desc' } }),
    prisma.inventory.findMany({ orderBy: [{ movementDate: 'desc' }, { styleNumber: 'asc' }] }),
    prisma.sale.findMany({ orderBy: [{ season: 'asc' }, { styleNumber: 'asc' }] }),
  ]);

  const inventoryAggregations = computeInventoryAggregations(inventory);
  const salesAggregations = computeSalesAggregations(sales);

  const counts = {
    products: products.length,
    sales: sales.length,
    pricing: pricing.length,
    costs: costs.length,
    inventory: inventory.length,
  };

  const coreSnapshot = {
    success: true,
    buildTime: new Date().toISOString(),
    counts,
    data: { products, pricing, costs, inventory },
    salesAggregations,
    inventoryAggregations,
  };

  const publicDir = join(process.cwd(), 'public');
  if (!existsSync(publicDir)) {
    mkdirSync(publicDir, { recursive: true });
  }

  const corePath = join(publicDir, 'data-core.json');
  writeFileSync(corePath, JSON.stringify(coreSnapshot));

  // Write per-season sales files (slim format)
  const slimSales = sales.map(slimSalesRecord);
  const salesBySeason: Record<string, Record<string, unknown>[]> = {};
  for (const s of slimSales) {
    const season = (s.season as string) || 'unknown';
    if (!salesBySeason[season]) salesBySeason[season] = [];
    salesBySeason[season].push(s);
  }

  const seasonKeys = Object.keys(salesBySeason).sort();
  const manifest = {
    success: true,
    buildTime: new Date().toISOString(),
    totalSales: slimSales.length,
    seasons: seasonKeys,
  };
  writeFileSync(join(publicDir, 'data-sales-manifest.json'), JSON.stringify(manifest));

  for (const season of seasonKeys) {
    writeFileSync(join(publicDir, `data-sales-${season}.json`), JSON.stringify(salesBySeason[season]));
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[Snapshot] Rebuilt in ${elapsed}s — ${counts.products} products, ${counts.sales} sales, ${counts.pricing} pricing, ${counts.costs} costs, ${counts.inventory} inventory`);

  return { corePath, counts };
}
