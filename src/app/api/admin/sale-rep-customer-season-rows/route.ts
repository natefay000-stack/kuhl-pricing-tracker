import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/** One-off: per-(style,color) breakdown of Sale rows for a (rep, customer, season).
 *  Helps spot duplicates and abnormally-high per-row revenue. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const rep = url.searchParams.get('rep') ?? '';
  const customer = url.searchParams.get('customer') ?? '';
  const season = url.searchParams.get('season') ?? '';
  if (!rep || !customer || !season) {
    return NextResponse.json({ error: 'rep + customer + season required' }, { status: 400 });
  }
  try {
    // Per (style, color, ship-to) breakdown — count of rows + sum of revenue.
    // If a (style+color+ship-to) tuple has multiple rows, each is a distinct
    // booking event (which should be normal) OR a duplicate (which is a bug).
    const groups = await prisma.$queryRawUnsafe<Array<{
      style: string; color: string | null; ship_city: string | null;
      cnt: bigint; sum_rev: number; sum_shipped: number; min_rev: number; max_rev: number;
    }>>(
      `SELECT
         "styleNumber" AS style,
         "colorCode" AS color,
         "shipToCity" AS ship_city,
         COUNT(*)::bigint AS cnt,
         COALESCE(SUM("revenue"),0)::float AS sum_rev,
         COALESCE(SUM("shipped"),0)::float AS sum_shipped,
         COALESCE(MIN("revenue"),0)::float AS min_rev,
         COALESCE(MAX("revenue"),0)::float AS max_rev
       FROM "Sale"
       WHERE "salesRep" = $1 AND "customer" = $2 AND "season" = $3
       GROUP BY "styleNumber", "colorCode", "shipToCity"
       ORDER BY cnt DESC, sum_rev DESC
       LIMIT 30`,
      rep, customer, season,
    );

    // Also: total rows + how many have multi-row (style,color,ship-to) keys
    const dupSummary = await prisma.$queryRawUnsafe<Array<{
      total_rows: bigint; dup_groups: bigint; dup_rows: bigint; dup_revenue: number;
    }>>(
      `WITH grouped AS (
        SELECT "styleNumber", "colorCode", "shipToCity",
               COUNT(*)::bigint AS c,
               SUM("revenue")::float AS rev
        FROM "Sale"
        WHERE "salesRep" = $1 AND "customer" = $2 AND "season" = $3
        GROUP BY 1,2,3
      )
      SELECT
        SUM(c)::bigint AS total_rows,
        COUNT(*) FILTER (WHERE c > 1)::bigint AS dup_groups,
        SUM(c - 1) FILTER (WHERE c > 1)::bigint AS dup_rows,
        COALESCE(SUM(rev * (c - 1) / c) FILTER (WHERE c > 1), 0)::float AS dup_revenue
      FROM grouped`,
      rep, customer, season,
    );
    const s = dupSummary[0];

    return NextResponse.json({
      rep, customer, season,
      summary: {
        totalRows: Number(s.total_rows),
        groupsWithDuplicates: Number(s.dup_groups),
        excessRowsAttributableToDups: Number(s.dup_rows),
        dollarsAttributableToDups: s.dup_revenue,
      },
      top30Groups: groups.map(g => ({
        style: g.style,
        color: g.color,
        shipCity: g.ship_city,
        rows: Number(g.cnt),
        sumRevenue: g.sum_rev,
        sumShipped: g.sum_shipped,
        minRevenue: g.min_rev,
        maxRevenue: g.max_rev,
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
