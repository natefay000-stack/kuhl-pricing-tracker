import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// Allow longer timeout for large data loads
export const maxDuration = 300; // 5 minutes (Vercel Pro) — Hobby caps at 60s
export const dynamic = 'force-dynamic';

const SALES_SELECT = {
  styleNumber: true,
  styleDesc: true,
  season: true,
  seasonType: true,
  divisionDesc: true,
  categoryDesc: true,
  gender: true,
  customerType: true,
  customer: true,
  unitsBooked: true,
  unitsOpen: true,
  revenue: true,
  shipped: true,
  cost: true,
  wholesalePrice: true,
  msrp: true,
} as const;

function transformSale(s: {
  styleNumber: string;
  styleDesc: string | null;
  season: string;
  seasonType: string | null;
  divisionDesc: string | null;
  categoryDesc: string | null;
  gender: string | null;
  customerType: string | null;
  customer: string | null;
  unitsBooked: number | null;
  unitsOpen: number | null;
  revenue: number | null;
  shipped: number | null;
  cost: number | null;
  wholesalePrice: number | null;
  msrp: number | null;
}) {
  return {
    styleNumber: s.styleNumber,
    styleDesc: s.styleDesc || '',
    season: s.season,
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

// GET - Load all data from database
// ?salesOnly=true&salesPage=N&salesPageSize=M  → returns just one page of sales
// ?salesPageSize=M                              → returns products/pricing/costs + first page of sales
// (no params)                                   → returns everything (may timeout on large datasets)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const salesPage = parseInt(searchParams.get('salesPage') || '0');
    const salesPageSize = parseInt(searchParams.get('salesPageSize') || '0');
    const salesOnly = searchParams.get('salesOnly') === 'true';

    // ── Sales-only mode: return a single page of sales ──────────
    if (salesOnly && salesPageSize > 0) {
      const [salesChunk, totalSales] = await Promise.all([
        prisma.sale.findMany({
          select: SALES_SELECT,
          skip: salesPage * salesPageSize,
          take: salesPageSize,
        }),
        prisma.sale.count(),
      ]);

      return NextResponse.json({
        success: true,
        salesOnly: true,
        page: salesPage,
        pageSize: salesPageSize,
        totalSales,
        totalPages: Math.ceil(totalSales / salesPageSize),
        sales: salesChunk.map(transformSale),
      });
    }

    // ── Full mode: products + pricing + costs + first page of sales ─
    const [products, pricing, costs, salesCount] = await Promise.all([
      prisma.product.findMany({
        orderBy: [{ season: 'desc' }, { styleNumber: 'asc' }],
      }),
      prisma.pricing.findMany({
        orderBy: [{ season: 'desc' }, { styleNumber: 'asc' }],
      }),
      prisma.cost.findMany({
        orderBy: [{ season: 'desc' }, { styleNumber: 'asc' }],
      }),
      prisma.sale.count(),
    ]);

    // Load first page of sales (or all if no pagination requested)
    const salesToLoad = salesPageSize > 0 ? Math.min(salesPageSize, salesCount) : salesCount;
    const BATCH = 50000;
    const salesRaw: ReturnType<typeof transformSale>[] = [];

    for (let offset = 0; offset < salesToLoad; offset += BATCH) {
      const batch = await prisma.sale.findMany({
        select: SALES_SELECT,
        skip: offset,
        take: Math.min(BATCH, salesToLoad - offset),
      });
      salesRaw.push(...batch.map(transformSale));
    }

    // Build aggregations using Prisma groupBy (efficient, no need to load all rows)
    const [channelAgg, categoryAgg, genderAgg, customerAgg] = await Promise.all([
      prisma.sale.groupBy({
        by: ['season', 'customerType'],
        _sum: { revenue: true, unitsBooked: true },
      }),
      prisma.sale.groupBy({
        by: ['season', 'categoryDesc'],
        _sum: { revenue: true, unitsBooked: true },
      }),
      prisma.sale.groupBy({
        by: ['season', 'divisionDesc'],
        _sum: { revenue: true, unitsBooked: true },
      }),
      prisma.sale.groupBy({
        by: ['season', 'customer', 'customerType'],
        _sum: { revenue: true, unitsBooked: true },
      }),
    ]);

    // Transform aggregations to expected format
    const salesByChannel = channelAgg
      .filter(r => r.customerType)
      .map(r => ({
        channel: r.customerType || '',
        season: r.season,
        revenue: r._sum.revenue || 0,
        units: r._sum.unitsBooked || 0,
      }));

    const salesByCategory = categoryAgg.map(r => ({
      category: r.categoryDesc || 'Other',
      season: r.season,
      revenue: r._sum.revenue || 0,
      units: r._sum.unitsBooked || 0,
    }));

    // Derive gender from divisionDesc
    const genderMap = new Map<string, { gender: string; season: string; revenue: number; units: number }>();
    for (const r of genderAgg) {
      const div = (r.divisionDesc || '').toLowerCase();
      let gender = 'Unknown';
      if (div.includes("men's") && !div.includes("women's")) gender = "Men's";
      else if (div.includes("women's") || div.includes("woman")) gender = "Women's";
      else if (div.includes("unisex") || div.includes("accessories")) gender = "Unisex";

      const key = `${r.season}-${gender}`;
      const existing = genderMap.get(key);
      if (existing) {
        existing.revenue += r._sum.revenue || 0;
        existing.units += r._sum.unitsBooked || 0;
      } else {
        genderMap.set(key, {
          gender,
          season: r.season,
          revenue: r._sum.revenue || 0,
          units: r._sum.unitsBooked || 0,
        });
      }
    }
    const salesByGender = Array.from(genderMap.values());

    const salesByCustomer = customerAgg
      .filter(r => r.customer)
      .map(r => ({
        customer: r.customer || '',
        customerType: r.customerType || '',
        season: r.season,
        revenue: r._sum.revenue || 0,
        units: r._sum.unitsBooked || 0,
      }));

    // Transform products
    const transformedProducts = products.map((p) => ({
      id: p.id,
      styleNumber: p.styleNumber,
      styleDesc: p.styleDesc || '',
      color: p.color || '',
      colorDesc: p.colorDesc || '',
      styleColor: p.styleColor || '',
      season: p.season,
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
      msrp: p.msrp,
      price: p.price,
      cost: p.cost,
      cadMsrp: p.cadMsrp,
      cadPrice: p.cadPrice,
      carryOver: p.carryOver,
      carryForward: p.carryForward,
      sellingSeasons: p.sellingSeasons || '',
      htsCode: p.htsCode || '',
      styleColorNotes: p.styleColorNotes || '',
    }));

    const transformedPricing = pricing.map((p) => ({
      id: p.id,
      styleNumber: p.styleNumber,
      styleDesc: p.styleDesc || '',
      colorCode: p.colorCode || '',
      colorDesc: p.colorDesc || '',
      season: p.season,
      seasonType: p.seasonType || 'Main',
      seasonDesc: p.seasonDesc || '',
      price: p.price,
      msrp: p.msrp,
      cost: p.cost,
    }));

    const transformedCosts = costs.map((c) => ({
      id: c.id,
      styleNumber: c.styleNumber,
      styleName: c.styleName || '',
      season: c.season,
      seasonType: c.seasonType || 'Main',
      factory: c.factory || '',
      countryOfOrigin: c.countryOfOrigin || '',
      designTeam: c.designTeam || '',
      developer: c.developer || '',
      fob: c.fob,
      landed: c.landed,
      dutyCost: c.dutyCost,
      tariffCost: c.tariffCost,
      freightCost: c.freightCost,
      overheadCost: c.overheadCost,
      suggestedMsrp: c.suggestedMsrp,
      suggestedWholesale: c.suggestedWholesale,
      margin: c.margin,
    }));

    return NextResponse.json({
      success: true,
      counts: {
        products: products.length,
        sales: salesCount, // Total sales count (may be more than returned)
        pricing: pricing.length,
        costs: costs.length,
      },
      data: {
        products: transformedProducts,
        sales: salesRaw,
        pricing: transformedPricing,
        costs: transformedCosts,
      },
      salesAggregations: {
        byChannel: salesByChannel,
        byCategory: salesByCategory,
        byGender: salesByGender,
        byCustomer: salesByCustomer,
      },
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
