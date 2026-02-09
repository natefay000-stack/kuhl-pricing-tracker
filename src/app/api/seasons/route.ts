import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET - List all seasons with their metadata AND actual data counts
export async function GET() {
  try {
    // Get season metadata
    const seasonMetadata = await prisma.season.findMany({
      orderBy: { code: 'desc' },
    });

    // Get actual data counts per season from each table
    const [salesCounts, productCounts, pricingCounts, costCounts] = await Promise.all([
      prisma.sale.groupBy({
        by: ['season'],
        _count: { id: true },
      }),
      prisma.product.groupBy({
        by: ['season'],
        _count: { id: true },
      }),
      prisma.pricing.groupBy({
        by: ['season'],
        _count: { id: true },
      }),
      prisma.cost.groupBy({
        by: ['season'],
        _count: { id: true },
      }),
    ]);

    // Build lookup maps for counts
    const salesByseason = new Map(salesCounts.map(s => [s.season, s._count.id]));
    const productsByseason = new Map(productCounts.map(s => [s.season, s._count.id]));
    const pricingByseason = new Map(pricingCounts.map(s => [s.season, s._count.id]));
    const costsByseason = new Map(costCounts.map(s => [s.season, s._count.id]));

    // Get all unique seasons from data
    const allSeasonCodes = new Set<string>();
    salesCounts.forEach(s => allSeasonCodes.add(s.season));
    productCounts.forEach(s => allSeasonCodes.add(s.season));
    pricingCounts.forEach(s => allSeasonCodes.add(s.season));
    costCounts.forEach(s => allSeasonCodes.add(s.season));

    // Also add seasons from metadata
    seasonMetadata.forEach(s => allSeasonCodes.add(s.code));

    // Build metadata lookup
    const metadataByCode = new Map(seasonMetadata.map(s => [s.code, s]));

    // Combine metadata with actual counts
    const seasons = Array.from(allSeasonCodes)
      .filter(code => /^\d{2}(SP|FA)$/.test(code)) // Valid season codes only
      .sort((a, b) => b.localeCompare(a)) // Descending
      .map(code => {
        const metadata = metadataByCode.get(code);
        const salesCount = salesByseason.get(code) || 0;
        const productCount = productsByseason.get(code) || 0;
        const pricingCount = pricingByseason.get(code) || 0;
        const costCount = costsByseason.get(code) || 0;

        return {
          id: metadata?.id || null,
          code,
          name: metadata?.name || getSeasonName(code),
          status: metadata?.status || inferStatus(code),
          // Actual data counts (source of truth)
          actualCounts: {
            sales: salesCount,
            products: productCount,
            pricing: pricingCount,
            costs: costCount,
          },
          // Derived flags from actual data
          hasSalesData: salesCount > 0,
          hasLineList: productCount > 0,
          hasPricing: pricingCount > 0,
          hasCosts: costCount > 0,
          // Metadata fields
          startDate: metadata?.startDate || null,
          endDate: metadata?.endDate || null,
          notes: metadata?.notes || null,
          createdAt: metadata?.createdAt || null,
          updatedAt: metadata?.updatedAt || null,
        };
      });

    return NextResponse.json({
      success: true,
      seasons,
    });
  } catch (error) {
    console.error('Error fetching seasons:', error);
    return NextResponse.json(
      { error: 'Failed to fetch seasons', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// Infer status based on season code and current date
function inferStatus(code: string): 'planning' | 'selling' | 'complete' {
  const match = code.match(/^(\d{2})(SP|FA)$/i);
  if (!match) return 'planning';

  const year = 2000 + parseInt(match[1]);
  const isFall = match[2].toUpperCase() === 'FA';
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-12

  // Fall seasons: selling Jul-Dec, complete after
  // Spring seasons: selling Jan-Jun, complete after
  if (isFall) {
    if (year > currentYear) return 'planning';
    if (year === currentYear && currentMonth >= 7) return 'selling';
    if (year === currentYear && currentMonth < 7) return 'planning';
    return 'complete';
  } else {
    if (year > currentYear) return 'planning';
    if (year === currentYear && currentMonth <= 6) return 'selling';
    if (year === currentYear && currentMonth > 6) return 'complete';
    return 'complete';
  }
}

// POST - Create or update a season
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code, name, status, hasSalesData, hasLineList, hasPricing, hasCosts, startDate, endDate, notes } = body;

    if (!code) {
      return NextResponse.json({ error: 'Season code is required' }, { status: 400 });
    }

    // Upsert - create or update
    const season = await prisma.season.upsert({
      where: { code },
      update: {
        name: name || undefined,
        status: status || undefined,
        hasSalesData: hasSalesData !== undefined ? hasSalesData : undefined,
        hasLineList: hasLineList !== undefined ? hasLineList : undefined,
        hasPricing: hasPricing !== undefined ? hasPricing : undefined,
        hasCosts: hasCosts !== undefined ? hasCosts : undefined,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        notes: notes !== undefined ? notes : undefined,
      },
      create: {
        code,
        name: name || getSeasonName(code),
        status: status || 'planning',
        hasSalesData: hasSalesData ?? false,
        hasLineList: hasLineList ?? false,
        hasPricing: hasPricing ?? false,
        hasCosts: hasCosts ?? false,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        notes: notes || null,
      },
    });

    return NextResponse.json({
      success: true,
      season,
    });
  } catch (error) {
    console.error('Error saving season:', error);
    return NextResponse.json(
      { error: 'Failed to save season', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// DELETE - Remove a season metadata entry
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');

    if (!code) {
      return NextResponse.json({ error: 'Season code is required' }, { status: 400 });
    }

    await prisma.season.delete({
      where: { code },
    });

    return NextResponse.json({
      success: true,
      message: `Season ${code} deleted`,
    });
  } catch (error) {
    console.error('Error deleting season:', error);
    return NextResponse.json(
      { error: 'Failed to delete season', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// Helper to generate a readable name from season code
function getSeasonName(code: string): string {
  const match = code.match(/^(\d{2})(SP|FA)$/i);
  if (!match) return code;

  const year = 2000 + parseInt(match[1]);
  const season = match[2].toUpperCase() === 'SP' ? 'Spring' : 'Fall';
  return `${season} ${year}`;
}
