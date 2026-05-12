import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/** One-off diagnostic: per-season Sale counts + dollar totals. Mirrors
 *  the shape of /api/admin/invoice-year-stats but for the Sale table. */
export async function GET() {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{
      season: string;
      cnt: bigint;
      revenue: number;
      shipped: number;
      open: number;
      units: bigint;
      customers: bigint;
    }>>(`
      SELECT
        "season",
        COUNT(*)::bigint AS cnt,
        COALESCE(SUM("revenue"),0)::float AS revenue,
        COALESCE(SUM(COALESCE(NULLIF("shippedAtNet",0),"shipped",0)),0)::float AS shipped,
        COALESCE(SUM(COALESCE(NULLIF("openAtNet",0),
                              GREATEST("revenue" - COALESCE(NULLIF("shippedAtNet",0),"shipped",0), 0))),0)::float AS open,
        COALESCE(SUM("unitsShipped" + "unitsBooked"),0)::bigint AS units,
        COUNT(DISTINCT "customer")::bigint AS customers
      FROM "Sale"
      GROUP BY "season"
      ORDER BY "season"
    `);
    const total = await prisma.sale.count();
    return NextResponse.json({
      totalRows: total,
      bySeason: rows.map(r => ({
        season: r.season,
        rows: Number(r.cnt),
        revenue: r.revenue,
        shipped: r.shipped,
        open: r.open,
        total: r.shipped + r.open,
        units: Number(r.units),
        customers: Number(r.customers),
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
