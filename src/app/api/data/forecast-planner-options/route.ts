import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * Filter-option lists for the Forecast Planner view. Returns the set of
 * distinct seasons (so the target-season dropdown can be populated),
 * reps, and customers found in the Sale table — small, cheap query.
 */
export async function GET() {
  try {
    const [seasonsRaw, repsRaw, customersRaw] = await Promise.all([
      prisma.$queryRawUnsafe<Array<{ s: string | null }>>(
        `SELECT DISTINCT "season" AS s FROM "Sale" WHERE "season" IS NOT NULL AND "season" <> '' ORDER BY s`,
      ),
      prisma.$queryRawUnsafe<Array<{ s: string | null }>>(
        `SELECT DISTINCT "salesRep" AS s FROM "Sale" WHERE "salesRep" IS NOT NULL AND "salesRep" <> '' ORDER BY s`,
      ),
      prisma.$queryRawUnsafe<Array<{ s: string | null }>>(
        `SELECT DISTINCT "customer" AS s FROM "Sale" WHERE "customer" IS NOT NULL AND "customer" <> '' ORDER BY s`,
      ),
    ]);
    const filt = (rows: Array<{ s: string | null }>) =>
      rows.map(r => r.s).filter((s): s is string => Boolean(s));
    return NextResponse.json({
      seasons: filt(seasonsRaw),
      reps: filt(repsRaw),
      customers: filt(customersRaw),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
