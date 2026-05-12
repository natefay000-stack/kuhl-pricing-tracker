import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/** One-off: Sale-table rollup by salesRep for a given season. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const season = url.searchParams.get('season') ?? '26SP';
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{
      rep: string | null;
      orders: bigint;
      shipped: number;
      open: number;
      total: number;
      units: bigint;
      customers: bigint;
    }>>(
      // NULLIF(x, 0) inside COALESCE so a zero in shippedAtNet correctly
      // falls through to the older `shipped` column (matches the JS
      // logic: r.shippedAtNet || r.shipped || 0). Same for openAtNet.
      `SELECT
         "salesRep" AS rep,
         COUNT(*)::bigint AS orders,
         COALESCE(SUM(COALESCE(NULLIF("shippedAtNet", 0), "shipped", 0)),0)::float AS shipped,
         COALESCE(SUM(COALESCE(NULLIF("openAtNet", 0),
                               GREATEST("revenue" - COALESCE(NULLIF("shippedAtNet",0),"shipped",0), 0))),0)::float AS open,
         (COALESCE(SUM(COALESCE(NULLIF("shippedAtNet",0),"shipped",0)),0) +
          COALESCE(SUM(COALESCE(NULLIF("openAtNet",0),
                                GREATEST("revenue" - COALESCE(NULLIF("shippedAtNet",0),"shipped",0), 0))),0))::float AS total,
         COALESCE(SUM("unitsShipped" + "unitsBooked"),0)::bigint AS units,
         COUNT(DISTINCT "customer")::bigint AS customers
       FROM "Sale"
       WHERE "season" = $1
       GROUP BY "salesRep"
       ORDER BY total DESC`,
      season,
    );
    return NextResponse.json({
      season,
      reps: rows.map(r => ({
        rep: r.rep,
        orders: Number(r.orders),
        shipped: r.shipped,
        open: r.open,
        total: r.total,
        units: Number(r.units),
        customers: Number(r.customers),
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
