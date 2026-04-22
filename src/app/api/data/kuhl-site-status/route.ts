import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/data/kuhl-site-status
 *
 * Returns the full KuhlSiteStatus table (one row per style). Empty
 * until the sync endpoint has been configured + run.
 */
export async function GET(_request: NextRequest) {
  try {
    const rows = await prisma.kuhlSiteStatus.findMany({
      orderBy: { styleNumber: 'asc' },
    });
    return NextResponse.json({
      success: true,
      statuses: rows,
      count: rows.length,
      lastCheckedAt: rows.reduce<Date | null>(
        (latest, r) => (!latest || r.lastCheckedAt > latest ? r.lastCheckedAt : latest),
        null,
      ),
    });
  } catch (error) {
    console.error('kuhl-site-status error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch statuses',
        message: error instanceof Error ? error.message : String(error),
        statuses: [],
      },
      { status: 500 }
    );
  }
}
