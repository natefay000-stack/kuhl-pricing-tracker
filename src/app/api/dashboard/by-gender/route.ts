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
    // Derive gender from divisionDesc (Men's, Women's, Unisex)
    const result = season
      ? await prisma.$queryRaw<Array<{
          gender: string;
          total_revenue: unknown;
          total_units: unknown;
          style_count: unknown;
        }>>`
          SELECT
            CASE
              WHEN LOWER("divisionDesc") LIKE '%women%' THEN 'Women''s'
              WHEN LOWER("divisionDesc") LIKE '%men%' AND LOWER("divisionDesc") NOT LIKE '%women%' THEN 'Men''s'
              ELSE 'Unisex'
            END as gender,
            COALESCE(SUM(revenue), 0) as total_revenue,
            COALESCE(SUM("unitsBooked"), 0) as total_units,
            COUNT(DISTINCT "styleNumber") as style_count
          FROM "Sale"
          WHERE season = ${season}
          GROUP BY
            CASE
              WHEN LOWER("divisionDesc") LIKE '%women%' THEN 'Women''s'
              WHEN LOWER("divisionDesc") LIKE '%men%' AND LOWER("divisionDesc") NOT LIKE '%women%' THEN 'Men''s'
              ELSE 'Unisex'
            END
          ORDER BY SUM(revenue) DESC NULLS LAST
        `
      : await prisma.$queryRaw<Array<{
          gender: string;
          total_revenue: unknown;
          total_units: unknown;
          style_count: unknown;
        }>>`
          SELECT
            CASE
              WHEN LOWER("divisionDesc") LIKE '%women%' THEN 'Women''s'
              WHEN LOWER("divisionDesc") LIKE '%men%' AND LOWER("divisionDesc") NOT LIKE '%women%' THEN 'Men''s'
              ELSE 'Unisex'
            END as gender,
            COALESCE(SUM(revenue), 0) as total_revenue,
            COALESCE(SUM("unitsBooked"), 0) as total_units,
            COUNT(DISTINCT "styleNumber") as style_count
          FROM "Sale"
          GROUP BY
            CASE
              WHEN LOWER("divisionDesc") LIKE '%women%' THEN 'Women''s'
              WHEN LOWER("divisionDesc") LIKE '%men%' AND LOWER("divisionDesc") NOT LIKE '%women%' THEN 'Men''s'
              ELSE 'Unisex'
            END
          ORDER BY SUM(revenue) DESC NULLS LAST
        `;

    const totalRevenue = result.reduce((sum, r) => sum + toNumber(r.total_revenue), 0);

    const genders = result.map(r => ({
      gender: r.gender,
      revenue: toNumber(r.total_revenue),
      units: toNumber(r.total_units),
      styles: toNumber(r.style_count),
      revenuePercent: totalRevenue > 0 ? (toNumber(r.total_revenue) / totalRevenue) * 100 : 0,
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
