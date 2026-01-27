import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET - Load all data from database
export async function GET() {
  try {
    const [products, sales, pricing, costs] = await Promise.all([
      prisma.product.findMany({
        orderBy: [{ season: 'desc' }, { styleNumber: 'asc' }],
      }),
      prisma.sale.findMany({
        orderBy: [{ season: 'desc' }, { styleNumber: 'asc' }],
      }),
      prisma.pricing.findMany({
        orderBy: [{ season: 'desc' }, { styleNumber: 'asc' }],
      }),
      prisma.cost.findMany({
        orderBy: [{ season: 'desc' }, { styleNumber: 'asc' }],
      }),
    ]);

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

    const transformedSales = sales.map((s) => ({
      id: s.id,
      styleNumber: s.styleNumber,
      styleDesc: s.styleDesc || '',
      colorCode: s.colorCode || '',
      colorDesc: s.colorDesc || '',
      season: s.season,
      seasonType: s.seasonType || 'Main',
      customer: s.customer || '',
      customerType: s.customerType || '',
      salesRep: s.salesRep || '',
      divisionDesc: s.divisionDesc || '',
      categoryDesc: s.categoryDesc || '',
      gender: s.gender || '',
      unitsBooked: s.unitsBooked,
      unitsOpen: s.unitsOpen,
      revenue: s.revenue,
      shipped: s.shipped,
      cost: s.cost,
      wholesalePrice: s.wholesalePrice,
      msrp: s.msrp,
      netUnitPrice: s.netUnitPrice,
      orderType: s.orderType || '',
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
        sales: sales.length,
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
