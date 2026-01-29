import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// Allow longer timeout for large data loads
export const maxDuration = 60; // 60 seconds
export const dynamic = 'force-dynamic';

// Interface for aggregated sales data
interface AggregatedSale {
  styleNumber: string;
  styleDesc: string;
  season: string;
  seasonType: string;
  divisionDesc: string;
  categoryDesc: string;
  gender: string;
  unitsBooked: number;
  unitsOpen: number;
  revenue: number;
  shipped: number;
  cost: number;
  wholesalePrice: number;
  msrp: number;
  customerCount: number;
  customerTypes: string[];
}

// GET - Load all data from database
export async function GET() {
  try {
    // Load products, pricing, costs normally (smaller datasets)
    // For sales, we'll aggregate server-side to reduce data size
    const [products, pricing, costs, salesRaw] = await Promise.all([
      prisma.product.findMany({
        orderBy: [{ season: 'desc' }, { styleNumber: 'asc' }],
      }),
      prisma.pricing.findMany({
        orderBy: [{ season: 'desc' }, { styleNumber: 'asc' }],
      }),
      prisma.cost.findMany({
        orderBy: [{ season: 'desc' }, { styleNumber: 'asc' }],
      }),
      // Get sales with only needed fields for aggregation
      prisma.sale.findMany({
        select: {
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
        },
      }),
    ]);

    // Aggregate sales by style+season to reduce 246K records to ~5K
    const salesAggMap = new Map<string, AggregatedSale>();
    for (const s of salesRaw) {
      const key = `${s.styleNumber}-${s.season}`;
      const existing = salesAggMap.get(key);
      if (existing) {
        existing.unitsBooked += s.unitsBooked || 0;
        existing.unitsOpen += s.unitsOpen || 0;
        existing.revenue += s.revenue || 0;
        existing.shipped += s.shipped || 0;
        existing.cost += s.cost || 0;
        existing.customerCount++;
        if (s.customerType && !existing.customerTypes.includes(s.customerType)) {
          existing.customerTypes.push(s.customerType);
        }
        // Keep first non-empty values for descriptive fields
        if (!existing.styleDesc && s.styleDesc) existing.styleDesc = s.styleDesc;
        if (!existing.divisionDesc && s.divisionDesc) existing.divisionDesc = s.divisionDesc;
        if (!existing.categoryDesc && s.categoryDesc) existing.categoryDesc = s.categoryDesc;
        if (!existing.gender && s.gender) existing.gender = s.gender;
        if (!existing.wholesalePrice && s.wholesalePrice) existing.wholesalePrice = s.wholesalePrice;
        if (!existing.msrp && s.msrp) existing.msrp = s.msrp;
      } else {
        salesAggMap.set(key, {
          styleNumber: s.styleNumber,
          styleDesc: s.styleDesc || '',
          season: s.season,
          seasonType: s.seasonType || 'Main',
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
          customerCount: 1,
          customerTypes: s.customerType ? [s.customerType] : [],
        });
      }
    }
    const sales = Array.from(salesAggMap.values());

    // Transform to match expected format
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

    // Sales are already aggregated, just format for output
    const transformedSales = sales.map((s, idx) => ({
      id: `agg-${idx}`,
      styleNumber: s.styleNumber,
      styleDesc: s.styleDesc,
      colorCode: '',
      colorDesc: '',
      season: s.season,
      seasonType: s.seasonType,
      customer: '',
      customerType: s.customerTypes.join(', ') || '',
      salesRep: '',
      divisionDesc: s.divisionDesc,
      categoryDesc: s.categoryDesc,
      gender: s.gender,
      unitsBooked: s.unitsBooked,
      unitsOpen: s.unitsOpen,
      revenue: s.revenue,
      shipped: s.shipped,
      cost: s.cost,
      wholesalePrice: s.wholesalePrice,
      msrp: s.msrp,
      netUnitPrice: 0,
      orderType: '',
      customerCount: s.customerCount,
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
        sales: salesRaw.length, // Show raw count for reference
        salesAggregated: sales.length, // Aggregated by style+season
        pricing: pricing.length,
        costs: costs.length,
      },
      data: {
        products: transformedProducts,
        sales: transformedSales,
        pricing: transformedPricing,
        costs: transformedCosts,
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
