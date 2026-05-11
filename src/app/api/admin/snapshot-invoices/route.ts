import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdminToken } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Daily aggregate snapshot of the Invoice table — the second layer of the
 * "bulletproof data" plan (first layer = ADMIN_TOKEN-locked destructive
 * endpoints, third layer = Neon point-in-time recovery).
 *
 *   POST /api/admin/snapshot-invoices?token=$ADMIN_TOKEN  → take snapshot
 *   GET  /api/admin/snapshot-invoices                     → endpoint info
 *
 * Each snapshot row captures everything the Invoice Month tab renders:
 *   - total row count + grand total $ net invoiced
 *   - year × month rollup (counts + nets per cell)
 *   - top 500 styles + top 500 customers by abs(net)
 *
 * Triggered automatically once a day by Vercel Cron (see vercel.json).
 * The cron call authenticates via Authorization: Bearer $CRON_SECRET.
 *
 * Retention: 90 days. Older snapshots are pruned on each successful write.
 *
 * For full row-level recovery use Neon's PITR feature in the Neon dashboard
 * — these snapshots only catch aggregates, not per-row data. They exist to
 * SURFACE that something went wrong so you can act.
 */
const RETENTION_DAYS = 90;

// Idempotent: creates the InvoiceSnapshot table + index if not present.
// Safe to call on every snapshot write — DDL is fast when nothing changes.
async function ensureSnapshotTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "InvoiceSnapshot" (
      "id" TEXT PRIMARY KEY,
      "takenAt" TIMESTAMP NOT NULL DEFAULT NOW(),
      "trigger" TEXT NOT NULL,
      "totalRows" INTEGER NOT NULL,
      "totalNetInvoiced" DOUBLE PRECISION NOT NULL,
      "yearMonth" JSONB NOT NULL,
      "topStyles" JSONB NOT NULL,
      "topCustomers" JSONB NOT NULL
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "InvoiceSnapshot_takenAt_idx"
    ON "InvoiceSnapshot" ("takenAt")
  `);
}

export async function GET() {
  return NextResponse.json({
    endpoint: 'snapshot-invoices',
    purpose: 'Daily aggregate snapshot of Invoice table for change detection.',
    retentionDays: RETENTION_DAYS,
    triggers: [
      'POST with ?token=$ADMIN_TOKEN (manual)',
      'Vercel Cron with Authorization: Bearer $CRON_SECRET (automated)',
    ],
    listSnapshots: 'GET /api/admin/list-snapshots',
  });
}

export async function POST(request: Request) {
  const denied = requireAdminToken(request);
  if (denied) return denied;

  const isCron = !!request.headers.get('authorization');
  const trigger = isCron ? 'cron' : 'manual';

  try {
    await ensureSnapshotTable();

    // Pull the same shape /api/data/invoice-aggregates returns. Inlined
    // rather than fetched so this endpoint is independent and works during
    // a partial outage of the dashboard route.
    const yearMonth = await prisma.$queryRawUnsafe<Array<{
      y: number; m: number; cnt: bigint; net: number;
    }>>(`
      SELECT
        EXTRACT(YEAR FROM "invoiceDate")::int AS y,
        EXTRACT(MONTH FROM "invoiceDate")::int AS m,
        COUNT(*)::bigint AS cnt,
        (COALESCE(SUM("shippedAtNet"),0) - COALESCE(SUM("returnedAtNet"),0))::float AS net
      FROM "Invoice"
      WHERE "invoiceDate" IS NOT NULL AND "invoiceNumber" IS NOT NULL
      GROUP BY 1, 2
      ORDER BY 1, 2
    `);

    const topStyles = await prisma.$queryRawUnsafe<Array<{
      styleNumber: string; styleDesc: string | null;
      shipped: number; returned: number; net: number;
    }>>(`
      SELECT
        "styleNumber",
        MAX("styleDesc") AS "styleDesc",
        COALESCE(SUM("shippedAtNet"),0)::float AS shipped,
        COALESCE(SUM("returnedAtNet"),0)::float AS returned,
        (COALESCE(SUM("shippedAtNet"),0) - COALESCE(SUM("returnedAtNet"),0))::float AS net
      FROM "Invoice"
      WHERE "invoiceNumber" IS NOT NULL
      GROUP BY "styleNumber"
      HAVING (COALESCE(SUM("shippedAtNet"),0) - COALESCE(SUM("returnedAtNet"),0)) <> 0
      ORDER BY ABS(COALESCE(SUM("shippedAtNet"),0) - COALESCE(SUM("returnedAtNet"),0)) DESC
      LIMIT 500
    `);

    const topCustomers = await prisma.$queryRawUnsafe<Array<{
      customer: string; shipped: number; returned: number; net: number;
    }>>(`
      SELECT
        "customer",
        COALESCE(SUM("shippedAtNet"),0)::float AS shipped,
        COALESCE(SUM("returnedAtNet"),0)::float AS returned,
        (COALESCE(SUM("shippedAtNet"),0) - COALESCE(SUM("returnedAtNet"),0))::float AS net
      FROM "Invoice"
      WHERE "customer" IS NOT NULL AND "invoiceNumber" IS NOT NULL
      GROUP BY "customer"
      HAVING (COALESCE(SUM("shippedAtNet"),0) - COALESCE(SUM("returnedAtNet"),0)) <> 0
      ORDER BY ABS(COALESCE(SUM("shippedAtNet"),0) - COALESCE(SUM("returnedAtNet"),0)) DESC
      LIMIT 500
    `);

    const totalRows = await prisma.invoice.count();
    const totalNetInvoiced = yearMonth.reduce((s, r) => s + r.net, 0);

    // BigInt → Number for JSONB serialization
    const yearMonthNorm = yearMonth.map(r => ({ y: r.y, m: r.m, count: Number(r.cnt), net: r.net }));

    // Insert snapshot (raw SQL since Prisma client isn't regenerated yet)
    const id = `snap_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    await prisma.$executeRawUnsafe(
      `INSERT INTO "InvoiceSnapshot"
        ("id", "trigger", "totalRows", "totalNetInvoiced", "yearMonth", "topStyles", "topCustomers")
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb)`,
      id,
      trigger,
      totalRows,
      totalNetInvoiced,
      JSON.stringify(yearMonthNorm),
      JSON.stringify(topStyles),
      JSON.stringify(topCustomers),
    );

    // Prune snapshots older than RETENTION_DAYS
    const pruned = await prisma.$executeRawUnsafe(
      `DELETE FROM "InvoiceSnapshot" WHERE "takenAt" < NOW() - INTERVAL '${RETENTION_DAYS} days'`,
    );

    return NextResponse.json({
      success: true,
      id,
      trigger,
      totalRows,
      totalNetInvoiced,
      monthBuckets: yearMonthNorm.length,
      stylesCaptured: topStyles.length,
      customersCaptured: topCustomers.length,
      prunedOldSnapshots: Number(pruned),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
