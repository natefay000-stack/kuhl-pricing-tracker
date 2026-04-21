import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/data/edit-history?styleNumber=...&limit=10
 *
 * Returns a merged stream of recent PricingEdit and CostEdit rows for a
 * given style, newest first. Lets the Style Detail Panel show a single
 * "recent changes" list without two round-trips.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const styleNumber = searchParams.get('styleNumber');
    const limit = Math.min(Math.max(1, parseInt(searchParams.get('limit') ?? '10', 10) || 10), 100);

    if (!styleNumber) {
      return NextResponse.json({ error: 'Missing styleNumber' }, { status: 400 });
    }

    const [priceEdits, costEdits] = await Promise.all([
      prisma.pricingEdit.findMany({
        where: { styleNumber },
        orderBy: { editedAt: 'desc' },
        take: limit,
      }),
      prisma.costEdit.findMany({
        where: { styleNumber },
        orderBy: { editedAt: 'desc' },
        take: limit,
      }),
    ]);

    const merged = [
      ...priceEdits.map((e) => ({
        id: e.id,
        kind: 'price' as const,
        field: e.field, // "price" or "msrp"
        season: e.season,
        oldValue: e.oldValue,
        newValue: e.newValue,
        editedBy: e.editedBy,
        note: e.note,
        editedAt: e.editedAt.toISOString(),
      })),
      ...costEdits.map((e) => ({
        id: e.id,
        kind: 'cost' as const,
        field: e.field, // "landed" or "margin"
        season: e.season,
        oldValue: e.oldValue,
        newValue: e.newValue,
        editedBy: e.editedBy,
        note: e.note,
        editedAt: e.editedAt.toISOString(),
      })),
    ]
      .sort((a, b) => (a.editedAt < b.editedAt ? 1 : -1))
      .slice(0, limit);

    return NextResponse.json({ success: true, edits: merged, count: merged.length });
  } catch (error) {
    console.error('edit-history error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch edit history',
        message: error instanceof Error ? error.message : String(error),
        edits: [],
      },
      { status: 500 }
    );
  }
}
