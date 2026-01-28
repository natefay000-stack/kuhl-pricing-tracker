import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { normalizeCategory } from '@/types/product';

export const maxDuration = 300; // 5 minutes
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { season } = await request.json();

    if (!season) {
      return NextResponse.json(
        { error: 'Season is required' },
        { status: 400 }
      );
    }

    console.log('Generating line list from sales for season:', season);

    // Get all sales for this season
    const sales = await prisma.sale.findMany({
      where: { season },
    });

    if (sales.length === 0) {
      return NextResponse.json(
        { error: `No sales found for season ${season}` },
        { status: 404 }
      );
    }

    console.log(`Found ${sales.length} sales records for ${season}`);

    // Group sales by style+color to create unique products
    const productMap = new Map<string, {
      styleNumber: string;
      styleDesc: string;
      colorCode: string;
      colorDesc: string;
      divisionDesc: string;
      categoryDesc: string;
      msrp: number;
      wholesalePrice: number;
      totalUnits: number;
      totalRevenue: number;
    }>();

    for (const sale of sales) {
      const key = `${sale.styleNumber}-${sale.colorCode || 'DEFAULT'}`;

      const existing = productMap.get(key);
      if (existing) {
        // Accumulate totals, keep best pricing data
        existing.totalUnits += sale.unitsBooked;
        existing.totalRevenue += sale.revenue;
        // Prefer non-zero pricing
        if (sale.msrp > 0 && existing.msrp === 0) existing.msrp = sale.msrp;
        if (sale.wholesalePrice > 0 && existing.wholesalePrice === 0) existing.wholesalePrice = sale.wholesalePrice;
        // Prefer non-empty descriptions
        if (sale.styleDesc && !existing.styleDesc) existing.styleDesc = sale.styleDesc;
        if (sale.colorDesc && !existing.colorDesc) existing.colorDesc = sale.colorDesc;
        if (sale.divisionDesc && !existing.divisionDesc) existing.divisionDesc = sale.divisionDesc;
        if (sale.categoryDesc && !existing.categoryDesc) existing.categoryDesc = sale.categoryDesc;
      } else {
        productMap.set(key, {
          styleNumber: sale.styleNumber,
          styleDesc: sale.styleDesc || '',
          colorCode: sale.colorCode || '',
          colorDesc: sale.colorDesc || '',
          divisionDesc: sale.divisionDesc || '',
          categoryDesc: sale.categoryDesc || '',
          msrp: sale.msrp,
          wholesalePrice: sale.wholesalePrice,
          totalUnits: sale.unitsBooked,
          totalRevenue: sale.revenue,
        });
      }
    }

    console.log(`Aggregated to ${productMap.size} unique style/colors`);

    // Check how many products already exist for this season
    const existingProducts = await prisma.product.findMany({
      where: { season },
      select: { styleNumber: true, color: true },
    });

    const existingKeys = new Set(
      existingProducts.map(p => `${p.styleNumber}-${p.color || 'DEFAULT'}`)
    );

    // Create products from sales data (only new ones)
    const productsToCreate: {
      styleNumber: string;
      styleDesc: string;
      color: string;
      colorDesc: string;
      styleColor: string;
      season: string;
      seasonType: string;
      divisionDesc: string;
      categoryDesc: string;
      category: string;
      msrp: number;
      price: number;
      cost: number;
      carryOver: boolean;
    }[] = [];

    for (const [key, data] of Array.from(productMap.entries())) {
      if (existingKeys.has(key)) {
        continue; // Skip existing products
      }

      // Calculate wholesale price from revenue if not available
      let price = data.wholesalePrice;
      if (price === 0 && data.totalUnits > 0) {
        price = data.totalRevenue / data.totalUnits;
      }

      const normalizedCategory = normalizeCategory(data.categoryDesc);

      productsToCreate.push({
        styleNumber: data.styleNumber,
        styleDesc: data.styleDesc,
        color: data.colorCode,
        colorDesc: data.colorDesc,
        styleColor: `${data.styleNumber}-${data.colorCode}`,
        season: season,
        seasonType: 'Main',
        divisionDesc: data.divisionDesc,
        categoryDesc: normalizedCategory,
        category: normalizedCategory,
        msrp: data.msrp,
        price: price,
        cost: 0, // Will be filled in when landed costs are imported
        carryOver: false,
      });
    }

    console.log(`Creating ${productsToCreate.length} new products (${existingKeys.size} already exist)`);

    // Batch create products
    let createdCount = 0;
    const batchSize = 500;

    for (let i = 0; i < productsToCreate.length; i += batchSize) {
      const batch = productsToCreate.slice(i, i + batchSize);
      await prisma.product.createMany({
        data: batch,
        skipDuplicates: true,
      });
      createdCount += batch.length;
      console.log(`Created batch ${Math.floor(i / batchSize) + 1}, total: ${createdCount}`);
    }

    return NextResponse.json({
      success: true,
      season,
      stats: {
        salesRecords: sales.length,
        uniqueStyleColors: productMap.size,
        existingProducts: existingKeys.size,
        newProductsCreated: productsToCreate.length,
      },
    });
  } catch (error) {
    console.error('Generate line list error:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate line list from sales',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

// GET endpoint to preview what would be generated
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const season = searchParams.get('season');

    if (!season) {
      // Return available seasons from sales data
      const seasonCounts = await prisma.sale.groupBy({
        by: ['season'],
        _count: { id: true },
        orderBy: { season: 'asc' },
      });

      const productCounts = await prisma.product.groupBy({
        by: ['season'],
        _count: { id: true },
      });

      const productCountMap = new Map(
        productCounts.map(p => [p.season, p._count.id])
      );

      return NextResponse.json({
        seasons: seasonCounts.map(s => ({
          season: s.season,
          salesCount: s._count.id,
          productCount: productCountMap.get(s.season) || 0,
          hasLineList: (productCountMap.get(s.season) || 0) > 0,
        })),
      });
    }

    // Preview for specific season
    const salesCount = await prisma.sale.count({ where: { season } });
    const productCount = await prisma.product.count({ where: { season } });

    // Get unique style/colors from sales
    const uniqueStyles = await prisma.sale.groupBy({
      by: ['styleNumber', 'colorCode'],
      where: { season },
    });

    return NextResponse.json({
      season,
      salesCount,
      existingProductCount: productCount,
      uniqueStyleColorsInSales: uniqueStyles.length,
      potentialNewProducts: Math.max(0, uniqueStyles.length - productCount),
    });
  } catch (error) {
    console.error('Preview error:', error);
    return NextResponse.json(
      { error: 'Failed to preview generation' },
      { status: 500 }
    );
  }
}
