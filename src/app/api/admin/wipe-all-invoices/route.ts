import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Nuclear option: deletes EVERY row from the Invoice table.
 *
 *   GET                              → dry-run (returns current row count)
 *   POST  ?force=1&confirm=WIPE      → executes the delete
 *
 * Both `force=1` AND `confirm=WIPE` required on POST so a stray request
 * can't accidentally vaporize the entire table. ONLY touches the
 * Invoice table — Sale, Product, Pricing, Cost, Inventory are all
 * untouched.
 *
 * After wipe: re-import invoice files via the normal import flow.
 * The unique index + skipDuplicates + append-only logic stays in place.
 */
export async function GET() {
  try {
    const total = await prisma.invoice.count();
    return NextResponse.json({
      mode: 'dry-run',
      wouldDelete: total,
      table: 'Invoice',
      hint: 'POST with ?force=1&confirm=WIPE to actually delete every Invoice row.',
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const force = url.searchParams.get('force') === '1' || url.searchParams.get('force') === 'true';
  const confirm = url.searchParams.get('confirm');

  if (!force) {
    return NextResponse.json(
      { error: 'force=1 required on POST.' },
      { status: 400 },
    );
  }
  if (confirm !== 'WIPE') {
    return NextResponse.json(
      { error: 'confirm=WIPE required on POST as a safety acknowledgement.' },
      { status: 400 },
    );
  }

  try {
    const before = await prisma.invoice.count();
    // Use raw TRUNCATE for speed — way faster than deleteMany on millions of rows.
    // CASCADE not needed: nothing references Invoice.
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "Invoice" RESTART IDENTITY');
    const after = await prisma.invoice.count();
    return NextResponse.json({
      success: true,
      deleted: before,
      tableBefore: before,
      tableAfter: after,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
