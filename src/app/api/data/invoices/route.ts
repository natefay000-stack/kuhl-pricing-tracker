import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/data/invoices?page=N&pageSize=M
 *
 * Returns invoice records in pages. The full dataset is ~120k rows which
 * exceeds Vercel's 4.5 MB response limit, so the frontend must page through.
 *
 * Only the fields actually read by the UI are returned — the schema has
 * many analytics columns (totalPrice, ytd*, openOrder, etc.) that the
 * frontend doesn't use. Stripping them shrinks the payload substantially.
 *
 * Response shape:
 *   { invoices, page, pageSize, total, hasMore }
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const pageSizeRaw = parseInt(searchParams.get('pageSize') ?? '10000', 10) || 10000;
  const pageSize = Math.min(Math.max(1, pageSizeRaw), 10000); // clamp 1..10000
  // Bumped from 5000 → 10000 to halve round-trip count on the cold-load
  // pagination (~30s instead of ~60s for 2.3M rows). Each page still ships
  // ~1.5 MB JSON, comfortably under Vercel's 4.5 MB serverless response cap.

  try {
    const [total, invoices] = await Promise.all([
      prisma.invoice.count(),
      prisma.invoice.findMany({
        select: {
          id: true,
          styleNumber: true,
          styleDesc: true,
          colorCode: true,
          colorDesc: true,
          season: true,
          customer: true,
          customerType: true,
          gender: true,
          orderType: true,
          shipToState: true,
          shipToCity: true,
          shipToZip: true,
          billToState: true,
          billToCity: true,
          billToZip: true,
          invoiceNumber: true,
          invoiceDate: true,
          accountingPeriod: true,
          shippedAtNet: true,
          returnedAtNet: true,
          openAtNet: true,
          unitsShipped: true,
          unitsReturned: true,
        },
        // Stable ordering by id so pagination doesn't skip/duplicate rows
        // (season/styleNumber aren't unique).
        orderBy: { id: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const hasMore = page * pageSize < total;

    return NextResponse.json({
      success: true,
      invoices,
      page,
      pageSize,
      total,
      hasMore,
      count: invoices.length,
    });
  } catch (error) {
    console.error('Error fetching invoices:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch invoices',
        message: error instanceof Error ? error.message : String(error),
        invoices: [],
      },
      { status: 500 }
    );
  }
}
