import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/data/pricing-history?pricingId=...&limit=20
 *
 * Returns recent PricingEdit rows for a pricing record, newest first.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const pricingId = searchParams.get('pricingId');
    const limit = Math.min(Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10) || 20), 100);

    if (!pricingId) {
      return NextResponse.json({ error: 'Missing pricingId' }, { status: 400 });
    }

    const edits = await prisma.pricingEdit.findMany({
      where: { pricingId },
      orderBy: { editedAt: 'desc' },
      take: limit,
    });

    return NextResponse.json({ success: true, edits, count: edits.length });
  } catch (error) {
    console.error('pricing-history error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch pricing history', message: error instanceof Error ? error.message : String(error), edits: [] },
      { status: 500 }
    );
  }
}
