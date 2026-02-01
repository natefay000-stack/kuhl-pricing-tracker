import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Fast dashboard summary - aggregated queries only, no raw records
export async function GET() {
  const startTime = Date.now();

  try {
    // Run all aggregation queries in parallel
    const [
      productStats,
      salesStats,
      costStats,
      pricingStats,
      seasonList,
    ] = await Promise.all([
      // Product count by season
      prisma.product.groupBy({
        by: ['season'],
        _count: { id: true },
      }),

      // Sales aggregates - use raw SQL for performance
      prisma.$queryRaw<Array<{
        season: string;
        total_revenue: number;
        total_units: number;
        unique_styles: number;
        unique_customers: number;
      }>>`
        SELECT
          season,
          SUM(revenue)::float as total_revenue,
          SUM("unitsBooked")::int as total_units,
          COUNT(DISTINCT "styleNumber")::int as unique_styles,
          COUNT(DISTINCT customer)::int as unique_customers
        FROM "Sale"
        GROUP BY season
        ORDER BY season DESC
      `,

      // Costs count by season
      prisma.cost.groupBy({
        by: ['season'],
        _count: { id: true },
      }),

      // Pricing count by season
      prisma.pricing.groupBy({
        by: ['season'],
        _count: { id: true },
      }),

      // Get all unique seasons
      prisma.$queryRaw<Array<{ season: string }>>`
        SELECT DISTINCT season FROM (
          SELECT season FROM "Product"
          UNION
          SELECT season FROM "Sale"
        ) AS all_seasons
        ORDER BY season DESC
      `,
    ]);

    // Build summary by season
    const seasonSummaries: Record<string, {
      products: number;
      sales: { revenue: number; units: number; styles: number; customers: number };
      costs: number;
      pricing: number;
    }> = {};

    // Initialize all seasons
    seasonList.forEach(s => {
      seasonSummaries[s.season] = {
        products: 0,
        sales: { revenue: 0, units: 0, styles: 0, customers: 0 },
        costs: 0,
        pricing: 0,
      };
    });

    // Fill in product counts
    productStats.forEach(p => {
      if (seasonSummaries[p.season]) {
        seasonSummaries[p.season].products = p._count.id;
      }
    });

    // Fill in sales stats
    salesStats.forEach(s => {
      if (seasonSummaries[s.season]) {
        seasonSummaries[s.season].sales = {
          revenue: s.total_revenue || 0,
          units: s.total_units || 0,
          styles: s.unique_styles || 0,
          customers: s.unique_customers || 0,
        };
      }
    });

    // Fill in cost counts
    costStats.forEach(c => {
      if (seasonSummaries[c.season]) {
        seasonSummaries[c.season].costs = c._count.id;
      }
    });

    // Fill in pricing counts
    pricingStats.forEach(p => {
      if (seasonSummaries[p.season]) {
        seasonSummaries[p.season].pricing = p._count.id;
      }
    });

    // Calculate totals
    const totals = {
      products: productStats.reduce((sum, p) => sum + p._count.id, 0),
      salesRevenue: salesStats.reduce((sum, s) => sum + (s.total_revenue || 0), 0),
      salesUnits: salesStats.reduce((sum, s) => sum + (s.total_units || 0), 0),
      costs: costStats.reduce((sum, c) => sum + c._count.id, 0),
      pricing: pricingStats.reduce((sum, p) => sum + p._count.id, 0),
    };

    const duration = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      duration: `${duration}ms`,
      seasons: seasonList.map(s => s.season),
      seasonSummaries,
      totals,
    });
  } catch (error) {
    console.error('Dashboard summary error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
