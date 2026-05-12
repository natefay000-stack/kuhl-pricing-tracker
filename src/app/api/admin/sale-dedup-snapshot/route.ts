import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdminToken } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Dedupes "snapshot dups" in the Sale table — rows that share the
 * (season, customer, salesRep, styleNumber, colorCode, invoiceNumber,
 *  shipToCity, shipToState) immutable identity but have different
 * `revenue` / `shipped` / `shippedAtNet` / `openAtNet` because they
 * came from re-imports of the same line item taken at different points
 * in time. Keeps only the row with the most-recent `createdAt` per
 * group (= the latest snapshot of that order's state).
 *
 *   GET                   → dry-run (counts only, no writes)
 *   POST ?token=...       → execute the dedupe
 *
 * NULLS are coalesced to a sentinel so groups including NULL fields
 * collapse correctly (mirrors NULLS NOT DISTINCT semantics).
 */

const PARTITION_COLS = [
  '"season"',
  'COALESCE("customer", \'__NULL__\')',
  'COALESCE("salesRep", \'__NULL__\')',
  'COALESCE("styleNumber", \'__NULL__\')',
  'COALESCE("colorCode", \'__NULL__\')',
  'COALESCE("invoiceNumber", \'__NULL__\')',
  'COALESCE("shipToCity", \'__NULL__\')',
  'COALESCE("shipToState", \'__NULL__\')',
].join(', ');

interface PreviewSummary {
  totalRows: number;
  rowsToKeep: number;
  rowsToDelete: number;
  revenueToKeep: number;
  revenueToDelete: number;
  shippedToKeep: number;
  shippedToDelete: number;
}

async function summarize(): Promise<{ summary: PreviewSummary; topCustomers: Array<{ customer: string; rows: number; toDelete: number; revenueRemoved: number }> }> {
  const [overall] = await prisma.$queryRawUnsafe<Array<{
    total: bigint; keep: bigint; del: bigint;
    rev_keep: number; rev_del: number;
    ship_keep: number; ship_del: number;
  }>>(`
    WITH ranked AS (
      SELECT id, customer, "revenue", "shipped",
             ROW_NUMBER() OVER (
               PARTITION BY ${PARTITION_COLS}
               ORDER BY "createdAt" DESC, id DESC
             ) AS rn
      FROM "Sale"
    )
    SELECT
      COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE rn = 1)::bigint AS keep,
      COUNT(*) FILTER (WHERE rn > 1)::bigint AS del,
      COALESCE(SUM("revenue") FILTER (WHERE rn = 1), 0)::float AS rev_keep,
      COALESCE(SUM("revenue") FILTER (WHERE rn > 1), 0)::float AS rev_del,
      COALESCE(SUM("shipped") FILTER (WHERE rn = 1), 0)::float AS ship_keep,
      COALESCE(SUM("shipped") FILTER (WHERE rn > 1), 0)::float AS ship_del
    FROM ranked
  `);

  const topCustomers = await prisma.$queryRawUnsafe<Array<{
    customer: string | null; total_rows: bigint; to_delete: bigint; revenue_removed: number;
  }>>(`
    WITH ranked AS (
      SELECT id, customer, "revenue",
             ROW_NUMBER() OVER (
               PARTITION BY ${PARTITION_COLS}
               ORDER BY "createdAt" DESC, id DESC
             ) AS rn
      FROM "Sale"
    )
    SELECT
      customer,
      COUNT(*)::bigint AS total_rows,
      COUNT(*) FILTER (WHERE rn > 1)::bigint AS to_delete,
      COALESCE(SUM("revenue") FILTER (WHERE rn > 1), 0)::float AS revenue_removed
    FROM ranked
    WHERE customer IS NOT NULL
    GROUP BY customer
    HAVING COUNT(*) FILTER (WHERE rn > 1) > 0
    ORDER BY to_delete DESC
    LIMIT 20
  `);

  return {
    summary: {
      totalRows: Number(overall.total),
      rowsToKeep: Number(overall.keep),
      rowsToDelete: Number(overall.del),
      revenueToKeep: overall.rev_keep,
      revenueToDelete: overall.rev_del,
      shippedToKeep: overall.ship_keep,
      shippedToDelete: overall.ship_del,
    },
    topCustomers: topCustomers.map(r => ({
      customer: r.customer ?? '(null)',
      rows: Number(r.total_rows),
      toDelete: Number(r.to_delete),
      revenueRemoved: r.revenue_removed,
    })),
  };
}

export async function GET() {
  try {
    const data = await summarize();
    return NextResponse.json({
      mode: 'preview',
      ...data,
      hint: 'POST with ?token=$ADMIN_TOKEN to execute the dedupe.',
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

  try {
    const before = await summarize();

    // Delete in batches via ctid — same pattern as the Invoice dedupe.
    // For each (partition key) group, keep the row with rn=1 (latest
    // createdAt). Everything with rn > 1 is older snapshots, deleted.
    const BATCH = 5000;
    let totalRemoved = 0;
    let safety = 0;
    while (true) {
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
      if (safety > 1000) break; // 5M rows max — generous cap
    }

    const after = await prisma.sale.count();
    return NextResponse.json({
      success: true,
      rowsBefore: before.summary.totalRows,
      rowsRemoved: totalRemoved,
      rowsAfter: after,
      revenueRemoved: before.summary.revenueToDelete,
      shippedRemoved: before.summary.shippedToDelete,
      topCustomersBefore: before.topCustomers,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
