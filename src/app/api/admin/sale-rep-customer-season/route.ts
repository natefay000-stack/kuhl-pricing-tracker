import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/** One-off: raw Sale aggregates for a (rep, customer, season) so we can
 *  compare against what the Forecast Planner is showing and spot
 *  double-counting. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const rep = url.searchParams.get('rep') ?? '';
  const customer = url.searchParams.get('customer') ?? '';
  const season = url.searchParams.get('season') ?? '';
  if (!rep || !customer || !season) {
    return NextResponse.json({ error: 'rep + customer + season required' }, { status: 400 });
  }
  try {
    const totals = await prisma.$queryRawUnsafe<Array<{
      rows: bigint;
      sum_revenue: number; sum_shipped: number; sum_shippedAtNet: number;
      sum_openAtNet: number; sum_unitsBooked: bigint; sum_unitsShipped: bigint;
      rows_with_invoiceNumber: bigint;
      rows_revenue_and_shipped: bigint;
      rows_open_and_shipped: bigint;
    }>>(
      `SELECT
         COUNT(*)::bigint AS rows,
         COALESCE(SUM("revenue"),0)::float AS sum_revenue,
         COALESCE(SUM("shipped"),0)::float AS sum_shipped,
         COALESCE(SUM("shippedAtNet"),0)::float AS "sum_shippedAtNet",
         COALESCE(SUM("openAtNet"),0)::float AS "sum_openAtNet",
         COALESCE(SUM("unitsBooked"),0)::bigint AS "sum_unitsBooked",
         COALESCE(SUM("unitsShipped"),0)::bigint AS "sum_unitsShipped",
         COUNT(*) FILTER (WHERE "invoiceNumber" IS NOT NULL AND "invoiceNumber" <> '')::bigint AS "rows_with_invoiceNumber",
         COUNT(*) FILTER (WHERE "revenue" > 0 AND ("shippedAtNet" > 0 OR "shipped" > 0))::bigint AS "rows_revenue_and_shipped",
         COUNT(*) FILTER (WHERE "openAtNet" > 0 AND ("shippedAtNet" > 0 OR "shipped" > 0))::bigint AS "rows_open_and_shipped"
       FROM "Sale"
       WHERE "salesRep" = $1 AND "customer" = $2 AND "season" = $3`,
      rep, customer, season,
    );
    const t = totals[0];
    return NextResponse.json({
      rep, customer, season,
      rows: Number(t.rows),
      rowsWithInvoiceNumber: Number(t.rows_with_invoiceNumber),
      rowsWithBothRevenueAndShipped: Number(t.rows_revenue_and_shipped),
      rowsWithBothOpenAndShipped: Number(t.rows_open_and_shipped),
      sums: {
        revenue: t.sum_revenue,
        shipped: t.sum_shipped,
        shippedAtNet: t.sum_shippedAtNet,
        openAtNet: t.sum_openAtNet,
        unitsBooked: Number(t.sum_unitsBooked),
        unitsShipped: Number(t.sum_unitsShipped),
      },
      derivations: {
        plannerShipped: t.sum_shippedAtNet > 0 ? t.sum_shippedAtNet : t.sum_shipped,
        plannerOpen: t.sum_openAtNet,
        plannerTotal: (t.sum_shippedAtNet > 0 ? t.sum_shippedAtNet : t.sum_shipped) + t.sum_openAtNet,
        revenueOnly: t.sum_revenue,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
