import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const CHANNEL_LABELS: Record<string, string> = {
  'WH': 'Wholesale',
  'BB': 'REI',
  'WD': 'KÜHL Stores',
  'EC': 'E-Commerce',
  'PS': 'Pro Sales',
  'KI': 'KUHL International',
};

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const { searchParams } = new URL(request.url);
  const season = searchParams.get('season');

  try {
    const result = season
      ? await prisma.$queryRaw<Array<{
          channel: string;
          total_revenue: number;
          total_units: number;
          customer_count: number;
        }>>`
          SELECT
            "customerType" as channel,
            SUM(revenue)::float as total_revenue,
            SUM("unitsBooked")::int as total_units,
            COUNT(DISTINCT customer)::int as customer_count
          FROM "Sale"
          WHERE season = ${season} AND "customerType" IS NOT NULL AND "customerType" != ''
          GROUP BY "customerType"
          ORDER BY SUM(revenue) DESC
        `
      : await prisma.$queryRaw<Array<{
          channel: string;
          total_revenue: number;
          total_units: number;
          customer_count: number;
        }>>`
          SELECT
            "customerType" as channel,
            SUM(revenue)::float as total_revenue,
            SUM("unitsBooked")::int as total_units,
            COUNT(DISTINCT customer)::int as customer_count
          FROM "Sale"
          WHERE "customerType" IS NOT NULL AND "customerType" != ''
          GROUP BY "customerType"
          ORDER BY SUM(revenue) DESC
        `;

    const totalRevenue = result.reduce((sum, r) => sum + (r.total_revenue || 0), 0);

    const channels = result.map(r => ({
      channel: r.channel,
      channelLabel: CHANNEL_LABELS[r.channel] || r.channel,
      revenue: r.total_revenue || 0,
      units: r.total_units || 0,
      customers: r.customer_count || 0,
      revenuePercent: totalRevenue > 0 ? ((r.total_revenue || 0) / totalRevenue) * 100 : 0,
    }));

    return NextResponse.json({
      success: true,
      duration: `${Date.now() - startTime}ms`,
      season: season || 'all',
      channels,
      totalRevenue,
    });
  } catch (error) {
    console.error('By-channel error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
