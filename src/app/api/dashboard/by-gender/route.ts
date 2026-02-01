import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const { searchParams } = new URL(request.url);
  const season = searchParams.get('season');

  try {
    // Derive gender from divisionDesc (Men's, Women's, Unisex)
    const result = season
      ? await prisma.$queryRaw<Array<{
          gender: string;
          total_revenue: number;
          total_units: number;
          style_count: number;
        }>>`
          SELECT
            CASE
              WHEN LOWER("divisionDesc") LIKE '%women%' THEN 'Women''s'
              WHEN LOWER("divisionDesc") LIKE '%men%' AND LOWER("divisionDesc") NOT LIKE '%women%' THEN 'Men''s'
              ELSE 'Unisex'
            END as gender,
            SUM(revenue)::float as total_revenue,
            SUM("unitsBooked")::int as total_units,
            COUNT(DISTINCT "styleNumber")::int as style_count
          FROM "Sale"
          WHERE season = ${season}
          GROUP BY
            CASE
              WHEN LOWER("divisionDesc") LIKE '%women%' THEN 'Women''s'
              WHEN LOWER("divisionDesc") LIKE '%men%' AND LOWER("divisionDesc") NOT LIKE '%women%' THEN 'Men''s'
              ELSE 'Unisex'
            END
          ORDER BY SUM(revenue) DESC
        `
      : await prisma.$queryRaw<Array<{
          gender: string;
          total_revenue: number;
          total_units: number;
          style_count: number;
        }>>`
          SELECT
            CASE
              WHEN LOWER("divisionDesc") LIKE '%women%' THEN 'Women''s'
              WHEN LOWER("divisionDesc") LIKE '%men%' AND LOWER("divisionDesc") NOT LIKE '%women%' THEN 'Men''s'
              ELSE 'Unisex'
            END as gender,
            SUM(revenue)::float as total_revenue,
            SUM("unitsBooked")::int as total_units,
            COUNT(DISTINCT "styleNumber")::int as style_count
          FROM "Sale"
          GROUP BY
            CASE
              WHEN LOWER("divisionDesc") LIKE '%women%' THEN 'Women''s'
              WHEN LOWER("divisionDesc") LIKE '%men%' AND LOWER("divisionDesc") NOT LIKE '%women%' THEN 'Men''s'
              ELSE 'Unisex'
            END
          ORDER BY SUM(revenue) DESC
        `;

    const totalRevenue = result.reduce((sum, r) => sum + (r.total_revenue || 0), 0);

    const genders = result.map(r => ({
      gender: r.gender,
      revenue: r.total_revenue || 0,
      units: r.total_units || 0,
      styles: r.style_count || 0,
      revenuePercent: totalRevenue > 0 ? ((r.total_revenue || 0) / totalRevenue) * 100 : 0,
    }));

    return NextResponse.json({
      success: true,
      duration: `${Date.now() - startTime}ms`,
      season: season || 'all',
      genders,
      totalRevenue,
    });
  } catch (error) {
    console.error('By-gender error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
