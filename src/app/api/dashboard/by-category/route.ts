import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const { searchParams } = new URL(request.url);
  const season = searchParams.get('season');

  try {
    const whereClause = season ? `WHERE season = '${season}'` : '';

    const categoryStats = await prisma.$queryRaw<Array<{
      category: string;
      total_revenue: number;
      total_units: number;
      style_count: number;
    }>>`
      SELECT
        COALESCE("categoryDesc", 'Other') as category,
        SUM(revenue)::float as total_revenue,
        SUM("unitsBooked")::int as total_units,
        COUNT(DISTINCT "styleNumber")::int as style_count
      FROM "Sale"
      ${season ? prisma.$queryRaw`WHERE season = ${season}` : prisma.$queryRaw``}
      GROUP BY COALESCE("categoryDesc", 'Other')
      ORDER BY SUM(revenue) DESC
      LIMIT 20
    `;

    // Recalculate with proper SQL
    const result = season
      ? await prisma.$queryRaw<Array<{
          category: string;
          total_revenue: number;
          total_units: number;
          style_count: number;
        }>>`
          SELECT
            COALESCE("categoryDesc", 'Other') as category,
            SUM(revenue)::float as total_revenue,
            SUM("unitsBooked")::int as total_units,
            COUNT(DISTINCT "styleNumber")::int as style_count
          FROM "Sale"
          WHERE season = ${season}
          GROUP BY COALESCE("categoryDesc", 'Other')
          ORDER BY SUM(revenue) DESC
          LIMIT 20
        `
      : await prisma.$queryRaw<Array<{
          category: string;
          total_revenue: number;
          total_units: number;
          style_count: number;
        }>>`
          SELECT
            COALESCE("categoryDesc", 'Other') as category,
            SUM(revenue)::float as total_revenue,
            SUM("unitsBooked")::int as total_units,
            COUNT(DISTINCT "styleNumber")::int as style_count
          FROM "Sale"
          GROUP BY COALESCE("categoryDesc", 'Other')
          ORDER BY SUM(revenue) DESC
          LIMIT 20
        `;

    const totalRevenue = result.reduce((sum, r) => sum + (r.total_revenue || 0), 0);

    const categories = result.map(r => ({
      category: r.category,
      revenue: r.total_revenue || 0,
      units: r.total_units || 0,
      styles: r.style_count || 0,
      revenuePercent: totalRevenue > 0 ? ((r.total_revenue || 0) / totalRevenue) * 100 : 0,
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
