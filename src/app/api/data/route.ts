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

// Channel aggregation for charts
interface ChannelAggregation {
  channel: string;
  season: string;
  revenue: number;
  units: number;
}

// Category aggregation
interface CategoryAggregation {
  category: string;
  season: string;
  revenue: number;
  units: number;
}

// Gender aggregation
interface GenderAggregation {
  gender: string;
  season: string;
  revenue: number;
  units: number;
}

// Customer aggregation
interface CustomerAggregation {
  customer: string;
  customerType: string;
  season: string;
  revenue: number;
  units: number;
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

    // Also build channel, category, gender, and customer aggregations from raw data
    const channelAggMap = new Map<string, ChannelAggregation>();
    const categoryAggMap = new Map<string, CategoryAggregation>();
    const genderAggMap = new Map<string, GenderAggregation>();
    const customerAggMap = new Map<string, CustomerAggregation>();

    for (const s of salesRaw) {
      const revenue = s.revenue || 0;
      const units = s.unitsBooked || 0;

      // Style+Season aggregation (for table)
      const styleKey = `${s.styleNumber}-${s.season}`;
      const existing = salesAggMap.get(styleKey);
      if (existing) {
        existing.unitsBooked += units;
        existing.unitsOpen += s.unitsOpen || 0;
        existing.revenue += revenue;
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
        salesAggMap.set(styleKey, {
          styleNumber: s.styleNumber,
          styleDesc: s.styleDesc || '',
          season: s.season,
          seasonType: s.seasonType || 'Main',
          divisionDesc: s.divisionDesc || '',
          categoryDesc: s.categoryDesc || '',
          gender: s.gender || '',
          unitsBooked: units,
          unitsOpen: s.unitsOpen || 0,
          revenue: revenue,
          shipped: s.shipped || 0,
          cost: s.cost || 0,
          wholesalePrice: s.wholesalePrice || 0,
          msrp: s.msrp || 0,
          customerCount: 1,
          customerTypes: s.customerType ? [s.customerType] : [],
        });
      }

      // Channel aggregation (by season + customerType)
      if (s.customerType) {
        const channelKey = `${s.season}-${s.customerType}`;
        const channelExisting = channelAggMap.get(channelKey);
        if (channelExisting) {
          channelExisting.revenue += revenue;
          channelExisting.units += units;
        } else {
          channelAggMap.set(channelKey, {
            channel: s.customerType,
            season: s.season,
            revenue: revenue,
            units: units,
          });
        }
      }

      // Category aggregation (by season + category)
      const category = s.categoryDesc || 'Other';
      const categoryKey = `${s.season}-${category}`;
      const categoryExisting = categoryAggMap.get(categoryKey);
      if (categoryExisting) {
        categoryExisting.revenue += revenue;
        categoryExisting.units += units;
      } else {
        categoryAggMap.set(categoryKey, {
          category: category,
          season: s.season,
          revenue: revenue,
          units: units,
        });
      }

      // Gender aggregation (derive from divisionDesc)
      const divisionLower = (s.divisionDesc || '').toLowerCase();
      let gender = 'Unknown';
      if (divisionLower.includes("men's") && !divisionLower.includes("women's")) {
        gender = "Men's";
      } else if (divisionLower.includes("women's") || divisionLower.includes("woman")) {
        gender = "Women's";
      } else if (divisionLower.includes("unisex") || divisionLower.includes("accessories")) {
        gender = "Unisex";
      }
      const genderKey = `${s.season}-${gender}`;
      const genderExisting = genderAggMap.get(genderKey);
      if (genderExisting) {
        genderExisting.revenue += revenue;
        genderExisting.units += units;
      } else {
        genderAggMap.set(genderKey, {
          gender: gender,
          season: s.season,
          revenue: revenue,
          units: units,
        });
      }

      // Customer aggregation (by season + customer)
      if (s.customer) {
        const customerKey = `${s.season}-${s.customer}`;
        const customerExisting = customerAggMap.get(customerKey);
        if (customerExisting) {
          customerExisting.revenue += revenue;
          customerExisting.units += units;
        } else {
          customerAggMap.set(customerKey, {
            customer: s.customer,
            customerType: s.customerType || '',
            season: s.season,
            revenue: revenue,
            units: units,
          });
        }
      }
    }

    const sales = Array.from(salesAggMap.values());
    const salesByChannel = Array.from(channelAggMap.values());
    const salesByCategory = Array.from(categoryAggMap.values());
    const salesByGender = Array.from(genderAggMap.values());
    const salesByCustomer = Array.from(customerAggMap.values());

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
      // Pre-computed aggregations for Sales View charts (from raw data, not style-aggregated)
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
