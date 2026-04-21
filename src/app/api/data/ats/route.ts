import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/data/ats
 *
 * Returns the full current ATS snapshot (style × color level).
 * Dataset is small (~3500 rows), no pagination needed.
 */
export async function GET(_request: NextRequest) {
  try {
    const rows = await prisma.atsInventory.findMany({
      orderBy: [{ styleNumber: 'asc' }, { color: 'asc' }],
    });
    return NextResponse.json({
      success: true,
      ats: rows,
      count: rows.length,
      snapshotDate: rows[0]?.snapshotDate ?? null,
    });
  } catch (error) {
    console.error('ats error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch ATS',
        message: error instanceof Error ? error.message : String(error),
        ats: [],
      },
      { status: 500 }
    );
  }
}
