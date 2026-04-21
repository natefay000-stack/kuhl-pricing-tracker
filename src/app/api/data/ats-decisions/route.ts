import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/data/ats-decisions[?styleNumber=&color=&limit=]
 *
 * Without filters: returns the *latest* decision per (styleNumber, color)
 * so the UI can show each row's current status in one pass.
 * With styleNumber (+ optional color): returns full history newest-first.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const styleNumber = searchParams.get('styleNumber');
    const color = searchParams.get('color');
    const limit = Math.min(Math.max(1, parseInt(searchParams.get('limit') ?? '100', 10) || 100), 1000);

    if (styleNumber) {
      const history = await prisma.atsDecision.findMany({
        where: color ? { styleNumber, color } : { styleNumber },
        orderBy: { decidedAt: 'desc' },
        take: limit,
      });
      return NextResponse.json({ success: true, decisions: history, count: history.length });
    }

    // No filter → return the most recent decision per (styleNumber, color).
    // Small enough to hydrate in memory; dataset is ~bounded.
    const all = await prisma.atsDecision.findMany({
      orderBy: { decidedAt: 'desc' },
      take: 10000,
    });
    const latestByKey = new Map<string, typeof all[number]>();
    for (const d of all) {
      const k = `${d.styleNumber}|${d.color}`;
      if (!latestByKey.has(k)) latestByKey.set(k, d);
    }
    const decisions = Array.from(latestByKey.values());
    return NextResponse.json({ success: true, decisions, count: decisions.length });
  } catch (error) {
    console.error('ats-decisions error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch decisions', message: error instanceof Error ? error.message : String(error), decisions: [] },
      { status: 500 }
    );
  }
}
