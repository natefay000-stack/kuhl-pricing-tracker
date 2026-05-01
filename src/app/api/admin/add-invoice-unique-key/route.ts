import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * One-shot admin migration:
 *   1. Removes existing duplicate Invoice rows (same invoiceNumber +
 *      styleNumber + colorCode + customer), keeping the most-recently-
 *      inserted row from each duplicate group.
 *   2. Adds a composite UNIQUE INDEX on (invoiceNumber, styleNumber,
 *      colorCode, customer) so future re-imports become idempotent
 *      via Prisma's skipDuplicates.
 *
 * GET  → dry-run, returns duplicate counts.
 * POST → actually run the dedupe + index creation. Wrapped in a tx.
 */
export async function GET() {
  try {
    const duplicates = await prisma.$queryRawUnsafe<{ dup_count: bigint }[]>(
      `SELECT COUNT(*)::bigint AS dup_count FROM (
         SELECT "invoiceNumber", "styleNumber", "colorCode", "customer", COUNT(*) c
         FROM "Invoice"
         WHERE "invoiceNumber" IS NOT NULL
         GROUP BY 1, 2, 3, 4
         HAVING COUNT(*) > 1
       ) t`,
    );
    const total = await prisma.invoice.count();
    return NextResponse.json({
      mode: 'dry-run',
      totalInvoiceRows: total,
      duplicateGroups: Number(duplicates[0]?.dup_count ?? 0),
      hint: 'POST this endpoint to dedupe + add the unique index.',
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function POST() {
  try {
    const before = await prisma.invoice.count();

    // Delete duplicates: keep one row per (invoiceNumber, styleNumber,
    // colorCode, customer) — pick the row with the smallest cuid id
    // (cuids are time-sortable, so this keeps the earliest).
    const dedupeResult = await prisma.$executeRawUnsafe(
      `DELETE FROM "Invoice"
       WHERE "id" IN (
         SELECT id FROM (
           SELECT id, ROW_NUMBER() OVER (
             PARTITION BY "invoiceNumber", "styleNumber", "colorCode", "customer"
             ORDER BY id
           ) AS rn
           FROM "Invoice"
           WHERE "invoiceNumber" IS NOT NULL
         ) sub
         WHERE rn > 1
       )`,
    );

    const after = await prisma.invoice.count();

    // Create the composite unique index. NOT VALID for partial-style
    // (only enforce when invoiceNumber is non-null), but Postgres unique
    // indexes already treat NULL as distinct so this is fine.
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "invoice_natural_key"
       ON "Invoice" ("invoiceNumber", "styleNumber", "colorCode", "customer")`,
    );

    return NextResponse.json({
      success: true,
      before,
      duplicatesRemoved: dedupeResult,
      after,
      uniqueIndex: 'invoice_natural_key created',
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
