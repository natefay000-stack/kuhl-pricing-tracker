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
  const limit = parseInt(searchParams.get('limit') || '10');

  try {
    const result = season
      ? await prisma.$queryRaw<Array<{
          customer: string;
          customer_type: string;
          total_revenue: unknown;
          total_units: unknown;
          order_count: unknown;
        }>>`
          SELECT
            customer,
            "customerType" as customer_type,
            COALESCE(SUM(revenue), 0) as total_revenue,
            COALESCE(SUM("unitsBooked"), 0) as total_units,
            COUNT(*) as order_count
          FROM "Sale"
          WHERE season = ${season} AND customer IS NOT NULL AND customer != ''
          GROUP BY customer, "customerType"
          ORDER BY SUM(revenue) DESC NULLS LAST
          LIMIT ${limit}
        `
      : await prisma.$queryRaw<Array<{
          customer: string;
          customer_type: string;
          total_revenue: unknown;
          total_units: unknown;
          order_count: unknown;
        }>>`
          SELECT
            customer,
            "customerType" as customer_type,
            COALESCE(SUM(revenue), 0) as total_revenue,
            COALESCE(SUM("unitsBooked"), 0) as total_units,
            COUNT(*) as order_count
          FROM "Sale"
          WHERE customer IS NOT NULL AND customer != ''
          GROUP BY customer, "customerType"
          ORDER BY SUM(revenue) DESC NULLS LAST
          LIMIT ${limit}
        `;

    const customers = result.map((r, index) => ({
      rank: index + 1,
      customer: r.customer,
      customerType: r.customer_type || 'Unknown',
      revenue: toNumber(r.total_revenue),
      units: toNumber(r.total_units),
      orders: toNumber(r.order_count),
    }));

    return NextResponse.json({
      success: true,
      duration: `${Date.now() - startTime}ms`,
      season: season || 'all',
      customers,
    });
  } catch (error) {
    console.error('Top-customers error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
