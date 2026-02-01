import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

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
          total_revenue: number;
          total_units: number;
          order_count: number;
        }>>`
          SELECT
            customer,
            "customerType" as customer_type,
            SUM(revenue)::float as total_revenue,
            SUM("unitsBooked")::int as total_units,
            COUNT(*)::int as order_count
          FROM "Sale"
          WHERE season = ${season} AND customer IS NOT NULL AND customer != ''
          GROUP BY customer, "customerType"
          ORDER BY SUM(revenue) DESC
          LIMIT ${limit}
        `
      : await prisma.$queryRaw<Array<{
          customer: string;
          customer_type: string;
          total_revenue: number;
          total_units: number;
          order_count: number;
        }>>`
          SELECT
            customer,
            "customerType" as customer_type,
            SUM(revenue)::float as total_revenue,
            SUM("unitsBooked")::int as total_units,
            COUNT(*)::int as order_count
          FROM "Sale"
          WHERE customer IS NOT NULL AND customer != ''
          GROUP BY customer, "customerType"
          ORDER BY SUM(revenue) DESC
          LIMIT ${limit}
        `;

    const customers = result.map((r, index) => ({
      rank: index + 1,
      customer: r.customer,
      customerType: r.customer_type || 'Unknown',
      revenue: r.total_revenue || 0,
      units: r.total_units || 0,
      orders: r.order_count || 0,
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
