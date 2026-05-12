import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdminToken } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Install the Sale natural-key unique index. EXCLUDES dollar/unit
 * fields (revenue / shipped / shippedAtNet / openAtNet / unitsBooked /
 * unitsShipped) so re-imports of the same line item with evolved
 * dollar values UPDATE in place via ON CONFLICT DO UPDATE rather than
 * landing as a new row.
 *
 *   GET                          → preview: count rows + count duplicates
 *   POST ?dedupe=true&token=...  → dedupe in batches + CREATE UNIQUE INDEX
 *   POST ?token=...              → just CREATE the index (fails if dups exist)
 *
 * Composite key (matches @@unique in prisma/schema.prisma):
 *   (season, customer, salesRep, styleNumber, colorCode, invoiceNumber,
 *    shipToCity, shipToState)
 * with NULLS NOT DISTINCT so optional/null columns collapse correctly.
 *
 * Idempotent: re-runs are safe. The dedupe step keeps the row with
 * the most-recent createdAt per group (= the latest snapshot of that
 * order's state).
 */
const NATURAL_KEY_COLS = [
  '"season"', '"customer"', '"salesRep"', '"styleNumber"', '"colorCode"',
  '"invoiceNumber"', '"shipToCity"', '"shipToState"',
] as const;

const PARTITION_COLS = NATURAL_KEY_COLS
  .map((c) => `COALESCE(${c}, '__NULL__')`)
  .join(', ');

export async function GET() {
  try {
    const total = await prisma.sale.count();
    const dups = await prisma.$queryRawUnsafe<Array<{ excess: bigint }>>(`
      WITH grouped AS (
        SELECT COUNT(*) AS c
        FROM "Sale"
        GROUP BY ${PARTITION_COLS}
        HAVING COUNT(*) > 1
      )
      SELECT COALESCE(SUM(c - 1), 0)::bigint AS excess FROM grouped
    `);
    const indexExists = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
      `SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'sale_natural_key') AS exists`,
    );
    return NextResponse.json({
      mode: 'preview',
      totalSaleRows: total,
      excessRowsThatWouldBeDeleted: Number(dups[0]?.excess ?? 0),
      indexAlreadyInstalled: !!indexExists[0]?.exists,
      hint: 'POST ?dedupe=true&token=$ADMIN_TOKEN to dedupe + install the unique index.',
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

  const dedupe = new URL(request.url).searchParams.get('dedupe') === 'true';
  try {
    const before = await prisma.sale.count();
    let totalRemoved = 0;

    if (dedupe) {
      const BATCH = 5000;
      let safety = 0;
      while (true) {
        // Order by createdAt DESC so we keep the LATEST snapshot of
        // each line item — that's the most-recent state of the order.
        // Tie-break by id DESC for determinism.
        const r = await prisma.$executeRawUnsafe(`
          DELETE FROM "Sale"
          WHERE ctid IN (
            SELECT ctid FROM (
              SELECT ctid, ROW_NUMBER() OVER (
                PARTITION BY ${PARTITION_COLS}
                ORDER BY "createdAt" DESC, id DESC
              ) AS rn
              FROM "Sale"
            ) sub
            WHERE rn > 1
            LIMIT ${BATCH}
          )
        `);
        totalRemoved += Number(r);
        if (Number(r) === 0) break;
        safety++;
        if (safety > 1000) break; // 5M rows max — generous safety stop
      }
    }

    // Single tx so we never leave the table without its uniqueness guarantee
    await prisma.$transaction([
      prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "sale_natural_key"`),
      prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX "sale_natural_key"
        ON "Sale" (${NATURAL_KEY_COLS.join(', ')})
        NULLS NOT DISTINCT
      `),
    ]);

    const after = await prisma.sale.count();
    return NextResponse.json({
      success: true,
      rowsBefore: before,
      rowsRemoved: totalRemoved,
      rowsAfter: after,
      indexInstalled: 'sale_natural_key (NULLS NOT DISTINCT, 8 columns — no $/units)',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
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
