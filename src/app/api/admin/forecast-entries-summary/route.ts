import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/** One-off: summary of ForecastEntry rows so we can confirm persistence
 *  is working without exposing per-rep contents. Returns counts + a few
 *  recent timestamps. */
export async function GET() {
  try {
    const total = await prisma.$queryRawUnsafe<Array<{ cnt: bigint }>>(
      `SELECT COUNT(*)::bigint AS cnt FROM "ForecastEntry"`,
    ).catch(() => [{ cnt: BigInt(0) }]);
    const byRep = await prisma.$queryRawUnsafe<Array<{
      rep: string; cnt: bigint; ranks: bigint; first_at: Date; last_at: Date;
    }>>(
      `SELECT
         "rep",
         COUNT(*)::bigint AS cnt,
         COUNT(*) FILTER (WHERE "colorRank" IS NOT NULL)::bigint AS ranks,
         MIN("createdAt") AS first_at,
         MAX("updatedAt") AS last_at
       FROM "ForecastEntry"
       GROUP BY "rep"
       ORDER BY MAX("updatedAt") DESC`,
    ).catch(() => []);
    return NextResponse.json({
      totalEntries: Number(total[0]?.cnt ?? 0),
      byRep: byRep.map(r => ({
        rep: r.rep,
        entries: Number(r.cnt),
        withRank: Number(r.ranks),
        firstAt: r.first_at?.toISOString?.() ?? null,
        lastAt: r.last_at?.toISOString?.() ?? null,
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
