import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Delete invoices whose invoiceDate falls in a given calendar year.
 * Use to wipe a year before re-importing corrected data.
 *
 *   GET  /api/admin/delete-invoices-by-year?year=2025         → dry-run
 *   POST /api/admin/delete-invoices-by-year?year=2025&force=1 → execute
 *
 * Requires `force=1` on POST. Without it returns an error so a stray
 * POST can't accidentally wipe data.
 */
function parseYear(req: Request): number | null {
  const yr = new URL(req.url).searchParams.get('year');
  if (!yr) return null;
  const n = parseInt(yr, 10);
  if (!Number.isFinite(n) || n < 2000 || n > 2100) return null;
  return n;
}

export async function GET(request: Request) {
  const year = parseYear(request);
  if (year === null) {
    return NextResponse.json({ error: 'year parameter required (2000-2100)' }, { status: 400 });
  }
  try {
    const start = new Date(`${year}-01-01T00:00:00Z`);
    const end = new Date(`${year + 1}-01-01T00:00:00Z`);
    const count = await prisma.invoice.count({
      where: { invoiceDate: { gte: start, lt: end } },
    });
    return NextResponse.json({
      mode: 'dry-run',
      year,
      wouldDelete: count,
      hint: `POST this endpoint with ?year=${year}&force=1 to actually delete.`,
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
  const year = parseYear(request);
  const force = url.searchParams.get('force') === '1' || url.searchParams.get('force') === 'true';

  if (year === null) {
    return NextResponse.json({ error: 'year parameter required (2000-2100)' }, { status: 400 });
  }
  if (!force) {
    return NextResponse.json(
      { error: 'force=1 required on POST to actually delete data. Use GET for a dry-run.' },
      { status: 400 },
    );
  }
  try {
    const start = new Date(`${year}-01-01T00:00:00Z`);
    const end = new Date(`${year + 1}-01-01T00:00:00Z`);
    const before = await prisma.invoice.count();
    const result = await prisma.invoice.deleteMany({
      where: { invoiceDate: { gte: start, lt: end } },
    });
    const after = await prisma.invoice.count();
    return NextResponse.json({
      success: true,
      year,
      deleted: result.count,
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
