import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const VALID_ACTIONS = new Set([
  'PULL_FROM_SITE',
  'CANCEL_ORDERS',
  'LIQUIDATE',
  'KEEP',
  'OTHER',
]);

/**
 * POST /api/data/ats-decision
 *
 * Body: { styleNumber, color, action, decidedBy, note? }
 * Writes an audit row. Multiple decisions per style×color are allowed —
 * latest one wins in the UI.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const styleNumber = (body.styleNumber ?? '').toString().trim();
    const color = (body.color ?? '').toString().trim();
    const action = (body.action ?? '').toString().trim();
    const decidedBy = (body.decidedBy ?? '').toString().trim();
    const note = body.note ? String(body.note).trim() || null : null;

    if (!styleNumber) return NextResponse.json({ error: 'Missing styleNumber' }, { status: 400 });
    if (!color) return NextResponse.json({ error: 'Missing color' }, { status: 400 });
    if (!VALID_ACTIONS.has(action)) {
      return NextResponse.json(
        { error: `Invalid action. Expected one of: ${Array.from(VALID_ACTIONS).join(', ')}` },
        { status: 400 }
      );
    }
    if (!decidedBy) return NextResponse.json({ error: 'decidedBy is required' }, { status: 400 });

    const decision = await prisma.atsDecision.create({
      data: { styleNumber, color, action, decidedBy, note },
    });

    return NextResponse.json({ success: true, decision });
  } catch (error) {
    console.error('ats-decision error:', error);
    return NextResponse.json(
      { error: 'Failed to log decision', message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
