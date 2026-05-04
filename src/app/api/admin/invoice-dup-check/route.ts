import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Diagnostic: count rows that share the natural key (invoiceNumber +
 *  styleNumber + colorCode + customer). The composite unique index
 *  should prevent these, but null colorCode/customer would slip through
 *  (Postgres treats NULLs as distinct).
 *
 *  Reports for 2024 specifically:
 *    - total rows
 *    - rows that participate in any duplicate group
 *    - inflation $ (sum of net for everything beyond row #1 per group) */
export async function GET() {
  try {
    const dups = await prisma.$queryRawUnsafe<Array<{
      total_rows: bigint;
      dup_groups: bigint;
      dup_rows: bigint;
      inflation_net: number | null;
    }>>(`
      WITH grouped AS (
        SELECT
          "invoiceNumber", "styleNumber", "colorCode", "customer",
          COUNT(*)::bigint AS cnt,
          SUM("shippedAtNet" - "returnedAtNet")::float AS group_net,
          MIN("shippedAtNet" - "returnedAtNet")::float AS min_net
        FROM "Invoice"
        WHERE "invoiceDate" >= '2024-01-01' AND "invoiceDate" < '2025-01-01'
        GROUP BY 1, 2, 3, 4
      )
      SELECT
        SUM(cnt)::bigint AS total_rows,
        COUNT(*) FILTER (WHERE cnt > 1)::bigint AS dup_groups,
        SUM(cnt - 1) FILTER (WHERE cnt > 1)::bigint AS dup_rows,
        SUM(group_net - min_net) FILTER (WHERE cnt > 1)::float AS inflation_net
      FROM grouped
    `);
    const r = dups[0] ?? { total_rows: 0n, dup_groups: 0n, dup_rows: 0n, inflation_net: 0 };

    // Also: rows with NULL invoiceNumber (which the unique index can't catch)
    const nullInv = await prisma.invoice.count({
      where: {
        invoiceDate: { gte: new Date('2024-01-01'), lt: new Date('2025-01-01') },
        invoiceNumber: null,
      },
    });

    return NextResponse.json({
      year: 2024,
      totalRows: Number(r.total_rows),
      duplicateGroups: Number(r.dup_groups),
      duplicateRows: Number(r.dup_rows),
      inflationNetDollars: r.inflation_net ?? 0,
      rowsWithNullInvoiceNumber: nullInv,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
