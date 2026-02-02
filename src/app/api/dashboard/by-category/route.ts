import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Helper to safely convert BigInt to Number
function toNumber(val: unknown): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'bigint') return Number(val);
  if (typeof val === 'number') return val;
  return Number(val) || 0;
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const { searchParams } = new URL(request.url);
  const season = searchParams.get('season');

  try {
    const result = season
      ? await prisma.$queryRaw<Array<{
          category: string;
          total_revenue: unknown;
          total_units: unknown;
          style_count: unknown;
        }>>`
          SELECT
            COALESCE("categoryDesc", 'Other') as category,
            COALESCE(SUM(revenue), 0) as total_revenue,
            COALESCE(SUM("unitsBooked"), 0) as total_units,
            COUNT(DISTINCT "styleNumber") as style_count
          FROM "Sale"
          WHERE season = ${season}
          GROUP BY COALESCE("categoryDesc", 'Other')
          ORDER BY SUM(revenue) DESC NULLS LAST
          LIMIT 20
        `
      : await prisma.$queryRaw<Array<{
          category: string;
          total_revenue: unknown;
          total_units: unknown;
          style_count: unknown;
        }>>`
          SELECT
            COALESCE("categoryDesc", 'Other') as category,
            COALESCE(SUM(revenue), 0) as total_revenue,
            COALESCE(SUM("unitsBooked"), 0) as total_units,
            COUNT(DISTINCT "styleNumber") as style_count
          FROM "Sale"
          GROUP BY COALESCE("categoryDesc", 'Other')
          ORDER BY SUM(revenue) DESC NULLS LAST
          LIMIT 20
        `;

    const totalRevenue = result.reduce((sum, r) => sum + toNumber(r.total_revenue), 0);

    const categories = result.map(r => ({
      category: r.category || 'Other',
      revenue: toNumber(r.total_revenue),
      units: toNumber(r.total_units),
      styles: toNumber(r.style_count),
      revenuePercent: totalRevenue > 0 ? (toNumber(r.total_revenue) / totalRevenue) * 100 : 0,
    }));

    return NextResponse.json({
      success: true,
      duration: `${Date.now() - startTime}ms`,
      season: season || 'all',
      categories,
      totalRevenue,
    });
  } catch (error) {
    console.error('By-category error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
