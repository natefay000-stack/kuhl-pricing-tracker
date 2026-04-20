import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * POST /api/data/update-price
 *
 * Body: { id: string, price?: number, msrp?: number, editedBy: string, note?: string }
 *
 * Updates a Pricing row and writes one PricingEdit audit row per field that
 * actually changed. `editedBy` is required (no auth system, so it's a
 * free-text attribution matching ImportLog.importedBy).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, price, msrp, editedBy, note } = body as {
      id?: string;
      price?: number | null;
      msrp?: number | null;
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

    const existing = await prisma.pricing.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Pricing record not found' }, { status: 404 });
    }

    const EPSILON = 1e-6;
    const changes: { field: string; oldValue: number | null; newValue: number | null }[] = [];

    if (price !== undefined && price !== null) {
      const newPrice = Number(price);
      if (Math.abs((existing.price ?? 0) - newPrice) > EPSILON) {
        changes.push({ field: 'price', oldValue: existing.price ?? null, newValue: newPrice });
      }
    }
    if (msrp !== undefined && msrp !== null) {
      const newMsrp = Number(msrp);
      if (Math.abs((existing.msrp ?? 0) - newMsrp) > EPSILON) {
        changes.push({ field: 'msrp', oldValue: existing.msrp ?? null, newValue: newMsrp });
      }
    }

    if (changes.length === 0) {
      return NextResponse.json({ success: true, updated: existing, edits: [], message: 'No changes' });
    }

    const trimmedNote = note?.trim() || null;

    const [updated, ...edits] = await prisma.$transaction([
      prisma.pricing.update({
        where: { id },
        data: {
          ...(price !== undefined && price !== null ? { price: Number(price) } : {}),
          ...(msrp !== undefined && msrp !== null ? { msrp: Number(msrp) } : {}),
        },
      }),
      ...changes.map((c) =>
        prisma.pricingEdit.create({
          data: {
            pricingId: existing.id,
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
    console.error('update-price error:', error);
    return NextResponse.json(
      { error: 'Failed to update price', message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
