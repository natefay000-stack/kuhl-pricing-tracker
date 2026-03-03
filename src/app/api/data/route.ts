import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// Allow longer timeout for large data loads
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformSale(s: any) {
  return {
    styleNumber: s.styleNumber || '',
    styleDesc: s.styleDesc || '',
    colorCode: s.colorCode || '',
    colorDesc: s.colorDesc || '',
    season: s.season || '',
    seasonType: s.seasonType || 'Main',
    customer: s.customer || '',
    customerType: s.customerType || '',
    divisionDesc: s.divisionDesc || '',
    categoryDesc: s.categoryDesc || '',
    gender: s.gender || '',
    salesRep: s.salesRep || '',
    orderType: s.orderType || '',
    unitsBooked: s.unitsBooked || 0,
    unitsOpen: s.unitsOpen || 0,
    revenue: s.revenue ?? 0,
    shipped: s.shipped || 0,
    cost: s.cost ?? 0,
    wholesalePrice: s.wholesalePrice ?? 0,
    msrp: s.msrp ?? 0,
    netUnitPrice: s.netUnitPrice ?? 0,
    invoiceDate: s.invoiceDate || null,
    accountingPeriod: s.accountingPeriod || null,
    invoiceNumber: s.invoiceNumber || null,
    shipToState: s.shipToState || null,
    returnedAtNet: s.returnedAtNet ?? 0,
    shippedAtNet: s.shippedAtNet ?? 0,
    totalPrice: s.totalPrice ?? 0,
    commissionRate: s.commissionRate ?? 0,
    ytdNetInvoicing: s.ytdNetInvoicing ?? 0,
    ytdCreditMemos: s.ytdCreditMemos ?? 0,
    ytdSales: s.ytdSales ?? 0,
    warehouse: s.warehouse || null,
    warehouseDesc: s.warehouseDesc || null,
    openAtNet: s.openAtNet ?? 0,
    openOrder: s.openOrder ?? 0,
    returned: s.returned ?? 0,
    shippedAtMsrp: s.shippedAtMsrp ?? 0,
    totalAtNet: s.totalAtNet ?? 0,
    totalAtWholesale: s.totalAtWholesale ?? 0,
    returnedAtWholesale: s.returnedAtWholesale ?? 0,
    shipToCity: s.shipToCity || null,
    shipToZip: s.shipToZip || null,
    billToState: s.billToState || null,
    billToCity: s.billToCity || null,
    billToZip: s.billToZip || null,
    unitsShipped: s.unitsShipped ?? 0,
    unitsReturned: s.unitsReturned ?? 0,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformProduct(p: any) {
  return {
    id: p.id,
    styleNumber: p.styleNumber || '',
    styleDesc: p.styleDesc || '',
    color: p.color || '',
    colorDesc: p.colorDesc || '',
    styleColor: p.styleColor || '',
    season: p.season || '',
    seasonType: p.seasonType || 'Main',
    divisionDesc: p.divisionDesc || '',
    categoryDesc: p.categoryDesc || '',
    category: p.category || '',
    productLine: p.productLine || '',
    productLineDesc: p.productLineDesc || '',
    labelDesc: p.labelDesc || '',
    designerName: p.designerName || '',
    techDesignerName: p.techDesignerName || '',
    countryOfOrigin: p.countryOfOrigin || '',
    factoryName: p.factoryName || '',
    msrp: p.msrp || 0,
    price: p.price || 0,
    cost: p.cost || 0,
    cadMsrp: p.cadMsrp || 0,
    cadPrice: p.cadPrice || 0,
    carryOver: p.carryOver || false,
    carryForward: p.carryForward || false,
    sellingSeasons: p.sellingSeasons || '',
    htsCode: p.htsCode || '',
    styleColorNotes: p.styleColorNotes || '',
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformPricing(p: any) {
  return {
    id: p.id,
    styleNumber: p.styleNumber || '',
    styleDesc: p.styleDesc || '',
    colorCode: p.colorCode || '',
    colorDesc: p.colorDesc || '',
    season: p.season || '',
    seasonType: p.seasonType || 'Main',
    seasonDesc: p.seasonDesc || '',
    price: p.price || 0,
    msrp: p.msrp || 0,
    cost: p.cost || 0,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformCost(c: any) {
  return {
    id: c.id,
    styleNumber: c.styleNumber || '',
    styleName: c.styleName || '',
    season: c.season || '',
    seasonType: c.seasonType || 'Main',
    factory: c.factory || '',
    countryOfOrigin: c.countryOfOrigin || '',
    designTeam: c.designTeam || '',
    developer: c.developer || '',
    fob: c.fob || 0,
    landed: c.landed || 0,
    dutyCost: c.dutyCost || 0,
    tariffCost: c.tariffCost || 0,
    freightCost: c.freightCost || 0,
    overheadCost: c.overheadCost || 0,
    suggestedMsrp: c.suggestedMsrp || 0,
    suggestedWholesale: c.suggestedWholesale || 0,
    margin: c.margin || 0,
    costSource: c.costSource || '',
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformInventory(inv: any) {
  return {
    id: inv.id,
    styleNumber: inv.styleNumber || '',
    styleDesc: inv.styleDesc || '',
    color: inv.color || '',
    colorDesc: inv.colorDesc || '',
    colorType: inv.colorType || undefined,
    styleCategory: inv.styleCategory || undefined,
    styleCatDesc: inv.styleCatDesc || undefined,
    warehouse: inv.warehouse || undefined,
    movementType: inv.movementType || undefined,
    movementDate: inv.movementDate || undefined,
    user: inv.user || undefined,
    group: inv.group || undefined,
    groupDesc: inv.groupDesc || undefined,
    reference: inv.reference || undefined,
    customerVendor: inv.customerVendor || undefined,
    reasonCode: inv.reasonCode || undefined,
    reasonDesc: inv.reasonDesc || undefined,
    costPrice: inv.costPrice || 0,
    wholesalePrice: inv.wholesalePrice || 0,
    msrp: inv.msrp || 0,
    sizePricing: inv.sizePricing || undefined,
    division: inv.division || undefined,
    divisionDesc: inv.divisionDesc || undefined,
    label: inv.label || undefined,
    labelDesc: inv.labelDesc || undefined,
    period: inv.period || undefined,
    qty: inv.qty || 0,
    balance: inv.balance || 0,
    extension: inv.extension || 0,
    prodMgr: inv.prodMgr || undefined,
    oldStyleNumber: inv.oldStyleNumber || undefined,
    pantoneCsiDesc: inv.pantoneCsiDesc || undefined,
    controlNumber: inv.controlNumber || undefined,
    asnStatus: inv.asnStatus || undefined,
    store: inv.store || undefined,
    salesOrderNumber: inv.salesOrderNumber || undefined,
    segmentCode: inv.segmentCode || undefined,
    segmentDesc: inv.segmentDesc || undefined,
    costCode: inv.costCode || undefined,
    costDesc: inv.costDesc || undefined,
  };
}

// Compute inventory aggregations in-process (replaces Supabase RPC)
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

// Compute sales aggregations in-process (replaces Supabase RPC)
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

// GET - Load all data from SQLite database via Prisma
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const salesPage = parseInt(searchParams.get('salesPage') || '0');
    const salesPageSize = parseInt(searchParams.get('salesPageSize') || '0');
    const salesOnly = searchParams.get('salesOnly') === 'true';

    // ── Inventory page mode ──────────────────────────────────────
    const invPage = parseInt(searchParams.get('inventoryPage') || '0');
    const invPageSize = parseInt(searchParams.get('inventoryPageSize') || '0');
    const inventoryOnly = searchParams.get('inventoryOnly') === 'true';

    if (inventoryOnly && invPageSize > 0) {
      const [invData, totalInv] = await Promise.all([
        prisma.inventory.findMany({
          orderBy: [{ movementDate: 'desc' }, { styleNumber: 'asc' }],
          skip: invPage * invPageSize,
          take: invPageSize,
        }),
        prisma.inventory.count(),
      ]);
      return NextResponse.json({
        success: true,
        inventoryOnly: true,
        page: invPage,
        pageSize: invPageSize,
        totalInventory: totalInv,
        totalPages: Math.ceil(totalInv / invPageSize),
        inventory: invData.map(transformInventory),
      });
    }

    // ── Sales-only mode (for progressive loading of additional pages) ──
    if (salesOnly && salesPageSize > 0) {
      const startOffset = salesPage * salesPageSize;
      const [totalSales, salesData] = await Promise.all([
        prisma.sale.count(),
        prisma.sale.findMany({
          orderBy: [{ season: 'asc' }, { styleNumber: 'asc' }, { customer: 'asc' }],
          skip: startOffset,
          take: salesPageSize,
        }),
      ]);

      return NextResponse.json({
        success: true,
        salesOnly: true,
        page: salesPage,
        pageSize: salesPageSize,
        totalSales,
        totalPages: Math.ceil(totalSales / salesPageSize),
        sales: salesData.map(transformSale),
      });
    }

    // ── Full mode: aggregations + small tables (NO bulk sales) ──
    const startTime = Date.now();

    // Fetch counts + all data in parallel
    const [
      prodCount,
      salesCount,
      pricingCount,
      costsCount,
      productsRaw,
      pricingRaw,
      costsRaw,
      inventoryRaw,
      allInventoryForAgg,
      allSalesForAgg,
    ] = await Promise.all([
      prisma.product.count(),
      prisma.sale.count(),
      prisma.pricing.count(),
      prisma.cost.count(),
      prisma.product.findMany({ orderBy: { season: 'desc' } }),
      prisma.pricing.findMany({ orderBy: { season: 'desc' } }),
      prisma.cost.findMany({ orderBy: { season: 'desc' } }),
      // Limited inventory for detail views
      prisma.inventory.findMany({
        orderBy: [{ movementDate: 'desc' }, { styleNumber: 'asc' }],
        take: 1000,
      }),
      // All inventory for aggregations (only select needed fields)
      prisma.inventory.findMany({
        select: { movementType: true, warehouse: true, period: true, qty: true, extension: true },
      }),
      // All sales for aggregations (only select needed fields)
      prisma.sale.findMany({
        select: {
          season: true, customerType: true, categoryDesc: true,
          divisionDesc: true, customer: true, revenue: true, unitsBooked: true,
        },
      }),
    ]);

    // Compute aggregations in-process (fast on SQLite — no network overhead)
    const inventoryAggregations = computeInventoryAggregations(allInventoryForAgg);
    const salesAggregations = computeSalesAggregations(allSalesForAgg);

    console.log(`Full mode (Prisma/SQLite): ${Date.now() - startTime}ms`);

    return NextResponse.json({
      success: true,
      counts: {
        products: prodCount,
        sales: salesCount,
        pricing: pricingCount,
        costs: costsCount,
        inventory: inventoryAggregations.totalCount,
      },
      data: {
        products: productsRaw.map(transformProduct),
        sales: [], // Sales loaded progressively via salesOnly mode
        pricing: pricingRaw.map(transformPricing),
        costs: costsRaw.map(transformCost),
        inventory: inventoryRaw.map(transformInventory),
        inventoryOH: [], // InventoryOH not in SQLite schema — was Supabase-only
      },
      salesAggregations,
      inventoryAggregations,
      ohAggregations: null,
    });
  } catch (error) {
    console.error('Error loading data from database:', error);
    return NextResponse.json(
      {
        error: 'Failed to load data',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
