import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Allow longer timeout for large data loads
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// Supabase REST has a max of 1000 rows per request
// We use range() to paginate larger datasets
async function fetchAll(table: string, orderCol: string, orderDir: 'asc' | 'desc' = 'desc', selectCols = '*') {
  const PAGE = 1000;
  // eslint-disable-next-line
  const rows: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(selectCols)
      .order(orderCol, { ascending: orderDir === 'asc' })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table} fetch error: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

// Fetch sales via direct PostgREST RPC call — bypasses supabase-js row limit
// Single HTTP call per page (up to 50K+ rows per call)
async function fetchSalesRPC(pageSize: number, startOffset = 0): Promise<ReturnType<typeof transformSale>[]> {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/get_sales_page`;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ p_offset: startOffset, p_limit: pageSize }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sales RPC error (${res.status}): ${text}`);
  }
  const rows = await res.json();
  return (rows || []).map(transformSale);
}


function transformSale(s: any) {
  return {
    styleNumber: s.styleNumber || '',
    styleDesc: s.styleDesc || '',
    season: s.season || '',
    seasonType: s.seasonType || 'Main',
    customer: s.customer || '',
    customerType: s.customerType || '',
    divisionDesc: s.divisionDesc || '',
    categoryDesc: s.categoryDesc || '',
    gender: s.gender || '',
    unitsBooked: s.unitsBooked || 0,
    unitsOpen: s.unitsOpen || 0,
    revenue: s.revenue || 0,
    shipped: s.shipped || 0,
    cost: s.cost || 0,
    wholesalePrice: s.wholesalePrice || 0,
    msrp: s.msrp || 0,
  };
}


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
  };
}


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

// GET - Load all data from database via Supabase REST + RPC
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
      const from = invPage * invPageSize;
      const to = from + invPageSize - 1;
      const [invResult, countResult] = await Promise.all([
        supabase.from('Inventory').select('*').order('movementDate', { ascending: false }).order('styleNumber').range(from, to),
        supabase.from('Inventory').select('id', { count: 'exact', head: true }),
      ]);
      if (invResult.error) throw new Error(invResult.error.message);
      const totalInv = countResult.count || 0;
      return NextResponse.json({
        success: true,
        inventoryOnly: true,
        page: invPage,
        pageSize: invPageSize,
        totalInventory: totalInv,
        totalPages: Math.ceil(totalInv / invPageSize),
        inventory: (invResult.data || []).map(transformInventory),
      });
    }

    // ── Sales-only mode (for progressive loading of additional pages) ──
    if (salesOnly && salesPageSize > 0) {
      const startOffset = salesPage * salesPageSize;
      const [countResult, salesData] = await Promise.all([
        supabase.from('Sale').select('id', { count: 'exact', head: true }),
        fetchSalesRPC(salesPageSize, startOffset),
      ]);
      const totalSales = countResult.count || 0;

      return NextResponse.json({
        success: true,
        salesOnly: true,
        page: salesPage,
        pageSize: salesPageSize,
        totalSales,
        totalPages: Math.ceil(totalSales / salesPageSize),
        sales: salesData,
      });
    }

    // ── Full mode: aggregations + small tables (NO bulk sales) ──
    // Sales are loaded separately via salesOnly mode for progressive loading
    const startTime = Date.now();

    const [
      prodCount,
      salesCount,
      pricingCount,
      costsCount,
      invAggResult,
      salesAggResult,
      productsRaw,
      pricingRaw,
      costsRaw,
      inventoryRaw,
    ] = await Promise.all([
      supabase.from('Product').select('id', { count: 'exact', head: true }),
      supabase.from('Sale').select('id', { count: 'exact', head: true }),
      supabase.from('Pricing').select('id', { count: 'exact', head: true }),
      supabase.from('Cost').select('id', { count: 'exact', head: true }),
      // Single RPC call for all inventory aggregations (replaces 173+ REST calls)
      supabase.rpc('get_inventory_aggregations'),
      // Single RPC call for all sales aggregations (replaces 380+ REST calls + computation)
      supabase.rpc('get_sales_aggregations'),
      // Fetch products, pricing, costs (small datasets via REST)
      fetchAll('Product', 'season', 'desc'),
      fetchAll('Pricing', 'season', 'desc'),
      fetchAll('Cost', 'season', 'desc'),
      // Limited inventory detail records (for the detail views)
      supabase.from('Inventory').select('*').order('movementDate', { ascending: false }).order('styleNumber').limit(1000),
    ]);

    if (inventoryRaw.error) throw new Error(inventoryRaw.error.message);

    const totalSalesCount = salesCount.count || 0;
    const inventoryCount = invAggResult.data?.totalCount || 0;

    console.log(`Full mode (aggregations + small tables): ${Date.now() - startTime}ms`);

    // No bulk sales in full mode — frontend loads them progressively via salesOnly
    const salesRaw: ReturnType<typeof transformSale>[] = [];

    // ── Transform inventory aggregations from RPC ──
    const invAgg = invAggResult.data || { totalCount: 0, byType: [], byWarehouse: [], byPeriod: [] };
    const inventoryAggregations = {
      totalCount: invAgg.totalCount || inventoryCount,
      // Map RPC column names to what the frontend expects
      byType: (invAgg.byType || []).map((t: { movementType: string; count: number; sum_qty: number; sum_extension: number }) => ({
        movementType: t.movementType || 'Unknown',
        count: t.count,
        totalQty: t.sum_qty,
        totalExtension: t.sum_extension,
      })),
      byWarehouse: (invAgg.byWarehouse || []).map((w: { warehouse: string; count: number; sum_qty: number; sum_extension: number }) => ({
        warehouse: w.warehouse || 'Unknown',
        count: w.count,
        totalQty: w.sum_qty,
        totalExtension: w.sum_extension,
      })),
      byPeriod: (invAgg.byPeriod || []).map((p: { period: string; count: number; sum_qty: number; sum_extension: number }) => ({
        period: p.period || 'Unknown',
        count: p.count,
        totalQty: p.sum_qty,
        totalExtension: p.sum_extension,
      })),
    };

    // ── Transform sales aggregations from RPC ──
    const salesAgg = salesAggResult.data || { byChannel: [], byCategory: [], byGender: [], byCustomer: [] };
    const salesAggregations = {
      byChannel: (salesAgg.byChannel || []).map((c: { season: string; customerType: string; sum_revenue: number; sum_units_booked: number }) => ({
        channel: c.customerType || '',
        season: c.season || '',
        revenue: c.sum_revenue || 0,
        units: c.sum_units_booked || 0,
      })),
      byCategory: (salesAgg.byCategory || []).map((c: { season: string; categoryDesc: string; sum_revenue: number; sum_units_booked: number }) => ({
        category: c.categoryDesc || 'Other',
        season: c.season || '',
        revenue: c.sum_revenue || 0,
        units: c.sum_units_booked || 0,
      })),
      byGender: (salesAgg.byGender || []).map((g: { season: string; gender: string; sum_revenue: number; sum_units_booked: number }) => ({
        gender: g.gender || 'Unknown',
        season: g.season || '',
        revenue: g.sum_revenue || 0,
        units: g.sum_units_booked || 0,
      })),
      byCustomer: (salesAgg.byCustomer || []).map((c: { season: string; customer: string; customerType: string; sum_revenue: number; sum_units_booked: number }) => ({
        customer: c.customer || '',
        customerType: c.customerType || '',
        season: c.season || '',
        revenue: c.sum_revenue || 0,
        units: c.sum_units_booked || 0,
      })),
    };

    console.log(`Total API time: ${Date.now() - startTime}ms`);

    return NextResponse.json({
      success: true,
      counts: {
        products: prodCount.count || 0,
        sales: totalSalesCount,
        pricing: pricingCount.count || 0,
        costs: costsCount.count || 0,
        inventory: inventoryCount,
      },
      data: {
        products: productsRaw.map(transformProduct),
        sales: salesRaw,
        pricing: pricingRaw.map(transformPricing),
        costs: costsRaw.map(transformCost),
        inventory: (inventoryRaw.data || []).map(transformInventory),
      },
      salesAggregations,
      inventoryAggregations,
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
