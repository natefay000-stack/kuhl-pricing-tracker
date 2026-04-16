import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/data/cost-history?costId=...&limit=20
 *
 * Returns recent audit entries for a cost record, newest first.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const costId = searchParams.get('costId');
    const limit = Math.min(Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10) || 20), 100);

    if (!costId) {
      return NextResponse.json({ error: 'Missing costId' }, { status: 400 });
    }

    const edits = await prisma.costEdit.findMany({
      where: { costId },
      orderBy: { editedAt: 'desc' },
      take: limit,
    });

    return NextResponse.json({ success: true, edits, count: edits.length });
  } catch (error) {
    console.error('cost-history error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch cost history', message: error instanceof Error ? error.message : String(error), edits: [] },
      { status: 500 }
    );
  }
}
