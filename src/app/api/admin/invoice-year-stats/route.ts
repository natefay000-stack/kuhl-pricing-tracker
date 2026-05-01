import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Diagnostic: counts and net-invoiced sums per year (from invoiceDate).
 * Plus null-date breakdown by season for rows we'd fall back to.
 */
export async function GET() {
  try {
    const total = await prisma.invoice.count();

    // Count + sum by year (using invoiceDate)
    const byYear = await prisma.$queryRawUnsafe<Array<{
      yr: number | null;
      cnt: bigint;
      shipped: number | null;
      returned: number | null;
      with_invoice_num: bigint;
    }>>(`
      SELECT
        EXTRACT(YEAR FROM "invoiceDate")::int AS yr,
        COUNT(*)::bigint AS cnt,
        SUM("shippedAtNet")::float AS shipped,
        SUM("returnedAtNet")::float AS returned,
        COUNT(*) FILTER (WHERE "invoiceNumber" IS NOT NULL)::bigint AS with_invoice_num
      FROM "Invoice"
      GROUP BY EXTRACT(YEAR FROM "invoiceDate")
      ORDER BY yr NULLS LAST
    `);

    // For null-invoiceDate rows, group by season (these would fall back)
    const nullDateBySeason = await prisma.$queryRawUnsafe<Array<{
      season: string | null;
      cnt: bigint;
    }>>(`
      SELECT "season", COUNT(*)::bigint AS cnt
      FROM "Invoice"
      WHERE "invoiceDate" IS NULL
      GROUP BY "season"
      ORDER BY cnt DESC
      LIMIT 20
    `);

    // Year × month breakdown so we can see exactly when 2024 invoices live
    const byYearMonth = await prisma.$queryRawUnsafe<Array<{
      yr: number | null;
      mo: number | null;
      cnt: bigint;
      net: number | null;
    }>>(`
      SELECT
        EXTRACT(YEAR FROM "invoiceDate")::int AS yr,
        EXTRACT(MONTH FROM "invoiceDate")::int AS mo,
        COUNT(*)::bigint AS cnt,
        (SUM("shippedAtNet") - SUM("returnedAtNet"))::float AS net
      FROM "Invoice"
      WHERE "invoiceDate" IS NOT NULL
      GROUP BY EXTRACT(YEAR FROM "invoiceDate"), EXTRACT(MONTH FROM "invoiceDate")
      ORDER BY yr, mo
    `);

    return NextResponse.json({
      totalInvoiceRows: total,
      byYear: byYear.map(r => ({
        year: r.yr,
        count: Number(r.cnt),
        withInvoiceNumber: Number(r.with_invoice_num),
        shippedSum: r.shipped,
        returnedSum: r.returned,
        netInvoiced: (r.shipped ?? 0) - (r.returned ?? 0),
      })),
      byYearMonth: byYearMonth.map(r => ({
        year: r.yr,
        month: r.mo,
        count: Number(r.cnt),
        netInvoiced: r.net ?? 0,
      })),
      nullInvoiceDateBySeason: nullDateBySeason.map(r => ({
        season: r.season,
        count: Number(r.cnt),
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
