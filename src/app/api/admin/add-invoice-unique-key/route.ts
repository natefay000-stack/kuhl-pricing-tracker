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
/** GET — quick health check (no heavy queries). */
export async function GET() {
  try {
    const total = await prisma.invoice.count();
    return NextResponse.json({
      mode: 'ready',
      totalInvoiceRows: total,
      hint: 'POST to add the unique index. POST ?dedupe=true to also remove duplicate rows first.',
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

/** POST — adds the unique index. If duplicates exist Postgres will reject
 *  the CREATE UNIQUE INDEX; pass `?dedupe=true` to remove them first.
 *  The dedupe runs in batches to stay under Vercel's memory limit. */
export async function POST(request: Request) {
  const dedupe = new URL(request.url).searchParams.get('dedupe') === 'true';
  try {
    const before = await prisma.invoice.count();
    let totalRemoved = 0;

    if (dedupe) {
      // Delete duplicates in chunks. CTID is Postgres's physical row id —
      // dirt cheap and avoids a window function across the entire table.
      // Loop until no more duplicate ids found in a single pass.
      const BATCH = 5000;
      while (true) {
        const r = await prisma.$executeRawUnsafe(
          `DELETE FROM "Invoice"
           WHERE ctid IN (
             SELECT ctid FROM (
               SELECT ctid, ROW_NUMBER() OVER (
                 PARTITION BY "invoiceNumber", "styleNumber", "colorCode", "customer"
                 ORDER BY id
               ) AS rn
               FROM "Invoice"
               WHERE "invoiceNumber" IS NOT NULL
               LIMIT ${BATCH * 4}
             ) sub
             WHERE rn > 1
             LIMIT ${BATCH}
           )`,
        );
        totalRemoved += Number(r);
        if (Number(r) === 0) break;
        // safety stop — prevents infinite loop on weird edge cases
        if (totalRemoved > 1_000_000) break;
      }
    }

    // Create the composite unique index. Postgres treats NULLs as distinct
    // by default, so partial keys with null fields don't collide.
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "invoice_natural_key"
       ON "Invoice" ("invoiceNumber", "styleNumber", "colorCode", "customer")`,
    );

    const after = await prisma.invoice.count();
    return NextResponse.json({
      success: true,
      before,
      duplicatesRemoved: totalRemoved,
      after,
      uniqueIndex: 'invoice_natural_key created (or already existed)',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // If CREATE UNIQUE INDEX failed because of duplicates, give a useful hint.
    const isDupErr = msg.includes('duplicate key') || msg.includes('could not create unique index');
    return NextResponse.json(
      {
        error: msg,
        hint: isDupErr
          ? 'Duplicates exist. Re-POST with ?dedupe=true to remove them first.'
          : undefined,
      },
      { status: 500 },
    );
  }
}
