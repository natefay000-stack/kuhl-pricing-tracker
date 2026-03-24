import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/data/invoices
 *
 * Returns all invoice records from the database.
 * Used as a fallback when the static snapshot file (data-invoices.json)
 * is missing or empty after a deploy.
 */
export async function GET() {
  try {
    const invoices = await prisma.invoice.findMany({
      orderBy: [{ season: 'asc' }, { styleNumber: 'asc' }],
    });

    return NextResponse.json({
      success: true,
      invoices,
      count: invoices.length,
    });
  } catch (error) {
    console.error('Error fetching invoices:', error);
    return NextResponse.json(
      { error: 'Failed to fetch invoices', invoices: [] },
      { status: 500 }
    );
  }
}
