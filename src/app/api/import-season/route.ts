import { NextRequest, NextResponse } from 'next/server';
import {
  parseLineListXLSX,
  parsePricingXLSX,
  parseLandedSheetXLSX,
  parseSalesXLSX,
  mergeSeasonData,
  convertToAppFormats,
} from '@/lib/xlsx-import';

// Increase limits for large file uploads
export const maxDuration = 300; // 5 minutes
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const lineListFile = formData.get('lineList') as File | null;
    const pricingFile = formData.get('pricing') as File | null;
    const landedFile = formData.get('landed') as File | null;
    const salesFile = formData.get('sales') as File | null;
    const season = formData.get('season') as string;

    if (!lineListFile) {
      return NextResponse.json(
        { error: 'Line List file is required' },
        { status: 400 }
      );
    }

    if (!season) {
      return NextResponse.json(
        { error: 'Season is required' },
        { status: 400 }
      );
    }

    console.log('Processing import for season:', season);
    console.log('Line List file:', lineListFile.name, lineListFile.size);

    // Parse Line List
    const lineListBuffer = await lineListFile.arrayBuffer();
    const lineListData = parseLineListXLSX(lineListBuffer);
    console.log('Parsed Line List:', lineListData.length, 'items');

    // Parse Pricing Sheet if provided (source of truth for pricing)
    let pricingData: ReturnType<typeof parsePricingXLSX> = [];
    if (pricingFile) {
      console.log('Pricing file:', pricingFile.name, pricingFile.size);
      const pricingBuffer = await pricingFile.arrayBuffer();
      pricingData = parsePricingXLSX(pricingBuffer);
      console.log('Parsed Pricing Sheet:', pricingData.length, 'items');
    }

    // Parse Landed Sheet if provided
    let landedData: ReturnType<typeof parseLandedSheetXLSX> = [];
    if (landedFile) {
      console.log('Landed file:', landedFile.name, landedFile.size);
      const landedBuffer = await landedFile.arrayBuffer();
      landedData = parseLandedSheetXLSX(landedBuffer);
      console.log('Parsed Landed Sheet:', landedData.length, 'items');
    }

    // Parse Sales Data if provided
    let salesData: ReturnType<typeof parseSalesXLSX> = [];
    if (salesFile) {
      console.log('Sales file:', salesFile.name, salesFile.size);
      const salesBuffer = await salesFile.arrayBuffer();
      salesData = parseSalesXLSX(salesBuffer);
      console.log('Parsed Sales Data:', salesData.length, 'items');
    }

    // Apply pricing overrides to line list data (pricing file is source of truth)
    let pricingOverrideCount = 0;
    if (pricingData.length > 0) {
      // Create a map for fast lookup by style+color
      const pricingMap = new Map<string, typeof pricingData[0]>();
      for (const p of pricingData) {
        const key = `${p.styleNumber}-${p.colorCode}`.toLowerCase();
        pricingMap.set(key, p);
      }

      // Apply overrides
      for (const item of lineListData) {
        const key = `${item.styleNumber}-${item.colorCode}`.toLowerCase();
        const priceOverride = pricingMap.get(key);
        if (priceOverride) {
          if (priceOverride.price > 0) item.usWholesale = priceOverride.price;
          if (priceOverride.msrp > 0) item.usMsrp = priceOverride.msrp;
          pricingOverrideCount++;
        }
      }
      console.log('Applied pricing overrides:', pricingOverrideCount);
    }

    // Merge data (applies landed cost overrides)
    const mergedResult = mergeSeasonData(lineListData, landedData, season);
    console.log('Merged result:', {
      products: mergedResult.products.length,
      landedMatches: mergedResult.stats.landedCostMatches,
    });

    // Convert to app formats
    const appData = convertToAppFormats(mergedResult, season);

    // Convert pricing data to app format for separate storage
    const pricingAppData = pricingData.map((p, index) => ({
      id: `price-${season}-${index}`,
      styleNumber: p.styleNumber,
      styleDesc: p.styleDesc,
      colorCode: p.colorCode,
      colorDesc: p.colorDesc,
      season: p.season || season,
      seasonType: 'Main',
      seasonDesc: p.seasonDesc || '',
      price: p.price,
      msrp: p.msrp,
      cost: p.cost,
    }));

    // Convert sales data to app format
    const salesAppData = salesData.map((s, index) => ({
      id: `sale-${season}-${index}`,
      styleNumber: s.styleNumber,
      styleDesc: s.styleDesc,
      colorCode: s.colorCode,
      colorDesc: s.colorDesc,
      season: s.season || season,
      seasonType: 'Main',
      customer: s.customer,
      customerType: s.customerType,
      unitsBooked: s.unitsBooked,
      unitsOpen: 0,
      revenue: s.revenue,
      shipped: 0,
      cost: 0,
      wholesalePrice: 0,
      msrp: 0,
      netUnitPrice: s.unitsBooked > 0 ? s.revenue / s.unitsBooked : 0,
      divisionDesc: s.divisionDesc,
      categoryDesc: s.categoryDesc,
      gender: '',
      salesRep: '',
      orderType: '',
    }));

    return NextResponse.json({
      success: true,
      season,
      stats: {
        lineListCount: mergedResult.stats.lineListCount,
        pricingCount: pricingOverrideCount,
        landedCostMatches: mergedResult.stats.landedCostMatches,
        productsCount: appData.products.length,
        costsCount: appData.costs.length,
        salesCount: salesAppData.length,
      },
      data: {
        products: appData.products,
        pricing: pricingAppData,
        costs: appData.costs,
        sales: salesAppData,
      },
      preview: mergedResult.products.slice(0, 10).map(p => ({
        styleNumber: p.styleNumber,
        styleName: p.styleName,
        colorCode: p.colorCode,
        msrp: p.usMsrp,
        wholesale: p.usWholesale,
        landed: p.landed,
        margin: p.margin,
        costSource: p.costSource,
      })),
    });
  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json(
      {
        error: 'Failed to process import',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
