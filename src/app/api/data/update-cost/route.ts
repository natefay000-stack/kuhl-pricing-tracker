import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * POST /api/data/update-cost
 *
 * Body: { id: string, landed?: number, margin?: number, editedBy: string, note?: string }
 *
 * Updates a cost row and writes one CostEdit audit row per field that
 * actually changed. `editedBy` is required (the app has no auth, so this
 * is a free-text attribution, matching ImportLog.importedBy).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, landed, margin, editedBy, note } = body as {
      id?: string;
      landed?: number | null;
      margin?: number | null;
      editedBy?: string;
      note?: string;
    };

    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    }
    const editor = (editedBy ?? '').trim();
    if (!editor) {
      return NextResponse.json({ error: 'editedBy is required' }, { status: 400 });
    }

    const existing = await prisma.cost.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Cost not found' }, { status: 404 });
    }

    // Figure out which fields changed. Use a small epsilon for float compare.
    const EPSILON = 1e-6;
    const changes: { field: string; oldValue: number | null; newValue: number | null }[] = [];

    if (landed !== undefined && landed !== null) {
      const newLanded = Number(landed);
      if (Math.abs((existing.landed ?? 0) - newLanded) > EPSILON) {
        changes.push({ field: 'landed', oldValue: existing.landed ?? null, newValue: newLanded });
      }
    }
    if (margin !== undefined && margin !== null) {
      const newMargin = Number(margin);
      const oldMargin = existing.margin ?? null;
      if (oldMargin === null || Math.abs(oldMargin - newMargin) > EPSILON) {
        changes.push({ field: 'margin', oldValue: oldMargin, newValue: newMargin });
      }
    }

    if (changes.length === 0) {
      return NextResponse.json({ success: true, updated: existing, edits: [], message: 'No changes' });
    }

    const trimmedNote = note?.trim() || null;

    const [updated, ...edits] = await prisma.$transaction([
      prisma.cost.update({
        where: { id },
        data: {
          ...(landed !== undefined && landed !== null ? { landed: Number(landed) } : {}),
          ...(margin !== undefined && margin !== null ? { margin: Number(margin) } : {}),
        },
      }),
      ...changes.map((c) =>
        prisma.costEdit.create({
          data: {
            costId: existing.id,
            styleNumber: existing.styleNumber,
            season: existing.season,
            field: c.field,
            oldValue: c.oldValue,
            newValue: c.newValue,
            editedBy: editor,
            note: trimmedNote,
          },
        })
      ),
    ]);

    return NextResponse.json({ success: true, updated, edits });
  } catch (error) {
    console.error('update-cost error:', error);
    return NextResponse.json(
      { error: 'Failed to update cost', message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
