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
          total_revenue: unknown;
          total_units: unknown;
          customer_count: unknown;
        }>>`
          SELECT
            "customerType" as channel,
            COALESCE(SUM(revenue), 0) as total_revenue,
            COALESCE(SUM("unitsBooked"), 0) as total_units,
            COUNT(DISTINCT customer) as customer_count
          FROM "Sale"
          WHERE season = ${season} AND "customerType" IS NOT NULL AND "customerType" != ''
          GROUP BY "customerType"
          ORDER BY SUM(revenue) DESC NULLS LAST
        `
      : await prisma.$queryRaw<Array<{
          channel: string;
          total_revenue: unknown;
          total_units: unknown;
          customer_count: unknown;
        }>>`
          SELECT
            "customerType" as channel,
            COALESCE(SUM(revenue), 0) as total_revenue,
            COALESCE(SUM("unitsBooked"), 0) as total_units,
            COUNT(DISTINCT customer) as customer_count
          FROM "Sale"
          WHERE "customerType" IS NOT NULL AND "customerType" != ''
          GROUP BY "customerType"
          ORDER BY SUM(revenue) DESC NULLS LAST
        `;

    const totalRevenue = result.reduce((sum, r) => sum + toNumber(r.total_revenue), 0);

    const channels = result.map(r => ({
      channel: r.channel,
      channelLabel: CHANNEL_LABELS[r.channel] || r.channel,
      revenue: toNumber(r.total_revenue),
      units: toNumber(r.total_units),
      customers: toNumber(r.customer_count),
      revenuePercent: totalRevenue > 0 ? (toNumber(r.total_revenue) / totalRevenue) * 100 : 0,
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
