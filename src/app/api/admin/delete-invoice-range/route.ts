import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdminToken } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** One-off: delete invoices whose invoiceDate falls in a [from, to) range.
 *  GET  ?from=2025-04-01&to=2025-07-01           → dry-run count
 *  POST ?from=2025-04-01&to=2025-07-01&force=1  → execute */
function parseRange(req: Request): { from: Date; to: Date } | null {
  const url = new URL(req.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  if (!from || !to) return null;
  const fromD = new Date(from);
  const toD = new Date(to);
  if (isNaN(fromD.getTime()) || isNaN(toD.getTime())) return null;
  if (toD <= fromD) return null;
  return { from: fromD, to: toD };
}

export async function GET(request: Request) {
  const range = parseRange(request);
  if (!range) {
    return NextResponse.json(
      { error: 'from and to query params required (ISO dates), to must be after from' },
      { status: 400 },
    );
  }
  try {
    const count = await prisma.invoice.count({
      where: { invoiceDate: { gte: range.from, lt: range.to } },
    });
    return NextResponse.json({
      mode: 'dry-run',
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      wouldDelete: count,
      hint: 'POST with &force=1 to actually delete.',
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const denied = requireAdminToken(request);
  if (denied) return denied;

  const range = parseRange(request);
  const force = new URL(request.url).searchParams.get('force') === '1';
  if (!range) {
    return NextResponse.json(
      { error: 'from and to query params required (ISO dates), to must be after from' },
      { status: 400 },
    );
  }
  if (!force) {
    return NextResponse.json(
      { error: 'force=1 required on POST. Use GET for a dry-run.' },
      { status: 400 },
    );
  }
  try {
    const before = await prisma.invoice.count();
    const result = await prisma.invoice.deleteMany({
      where: { invoiceDate: { gte: range.from, lt: range.to } },
    });
    const after = await prisma.invoice.count();
    return NextResponse.json({
      success: true,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
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
