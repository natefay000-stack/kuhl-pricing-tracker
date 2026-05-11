import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Pre-aggregated invoice data for the Invoice Month and Inv-Opn Month views.
 *
 * Returns ~50 KB of JSON instead of streaming 2.5M+ rows to the browser
 * (~600 MB unfiltered). Drives:
 *   - Year × Month pivot (with both `net` for Invoice Month and `open`
 *     for Inv-Opn Month, so a single fetch powers both views)
 *   - Top 500 styles
 *   - Top 500 customers
 *   - Filter option lists (seasons, customer types)
 *
 * For drill-down (color breakdown of one style, etc.) the client should
 * issue a targeted query — not implemented here yet.
 */
export async function GET() {
  try {
    // Year × Month — `net` for Invoice Month, `open` for Inv-Opn Month.
    // Inv-Opn doesn't filter on invoiceNumber (open orders haven't shipped
    // and may not have an invoice number yet), so the row scope is
    // intentionally broader than the invoiced-only scope above.
    const yearMonth = await prisma.$queryRawUnsafe<
      Array<{ y: number; m: number; cnt: bigint; net: number; open: number }>
    >(`
      SELECT
        EXTRACT(YEAR FROM "invoiceDate")::int AS y,
        EXTRACT(MONTH FROM "invoiceDate")::int AS m,
        COUNT(*) FILTER (WHERE "invoiceNumber" IS NOT NULL)::bigint AS cnt,
        (COALESCE(SUM("shippedAtNet") FILTER (WHERE "invoiceNumber" IS NOT NULL),0)
         - COALESCE(SUM("returnedAtNet") FILTER (WHERE "invoiceNumber" IS NOT NULL),0))::float AS net,
        COALESCE(SUM("openAtNet"),0)::float AS open
      FROM "Invoice"
      WHERE "invoiceDate" IS NOT NULL
      GROUP BY 1, 2
      ORDER BY 1, 2
    `);

    // Top 500 styles (by absolute net so big-return styles surface too).
    // `open` carried alongside so Inv-Opn Month can render its style
    // breakdown from the same payload.
    const topStyles = await prisma.$queryRawUnsafe<
      Array<{ styleNumber: string; styleDesc: string | null; shipped: number; returned: number; net: number; open: number }>
    >(`
      SELECT
        "styleNumber",
        MAX("styleDesc") AS "styleDesc",
        COALESCE(SUM("shippedAtNet"),0)::float AS shipped,
        COALESCE(SUM("returnedAtNet"),0)::float AS returned,
        (COALESCE(SUM("shippedAtNet"),0) - COALESCE(SUM("returnedAtNet"),0))::float AS net,
        COALESCE(SUM("openAtNet"),0)::float AS open
      FROM "Invoice"
      WHERE "invoiceNumber" IS NOT NULL
      GROUP BY "styleNumber"
      HAVING (COALESCE(SUM("shippedAtNet"),0) - COALESCE(SUM("returnedAtNet"),0)) <> 0
      ORDER BY ABS(COALESCE(SUM("shippedAtNet"),0) - COALESCE(SUM("returnedAtNet"),0)) DESC
      LIMIT 500
    `);

    // Top 500 customers
    const topCustomers = await prisma.$queryRawUnsafe<
      Array<{ customer: string; shipped: number; returned: number; net: number; open: number }>
    >(`
      SELECT
        "customer",
        COALESCE(SUM("shippedAtNet"),0)::float AS shipped,
        COALESCE(SUM("returnedAtNet"),0)::float AS returned,
        (COALESCE(SUM("shippedAtNet"),0) - COALESCE(SUM("returnedAtNet"),0))::float AS net,
        COALESCE(SUM("openAtNet"),0)::float AS open
      FROM "Invoice"
      WHERE "customer" IS NOT NULL AND "invoiceNumber" IS NOT NULL
      GROUP BY "customer"
      HAVING (COALESCE(SUM("shippedAtNet"),0) - COALESCE(SUM("returnedAtNet"),0)) <> 0
      ORDER BY ABS(COALESCE(SUM("shippedAtNet"),0) - COALESCE(SUM("returnedAtNet"),0)) DESC
      LIMIT 500
    `);

    // Filter option lists (compact)
    const seasons = await prisma.$queryRawUnsafe<Array<{ season: string | null }>>(
      `SELECT DISTINCT "season" FROM "Invoice" WHERE "season" IS NOT NULL ORDER BY "season"`,
    );
    const customerTypes = await prisma.$queryRawUnsafe<Array<{ ct: string | null }>>(
      `SELECT DISTINCT "customerType" AS ct FROM "Invoice" WHERE "customerType" IS NOT NULL ORDER BY ct`,
    );

    return NextResponse.json({
      success: true,
      yearMonth: yearMonth.map((r) => ({ y: r.y, m: r.m, count: Number(r.cnt), net: r.net, open: r.open })),
      topStyles: topStyles.map((r) => ({
        styleNumber: r.styleNumber,
        styleDesc: r.styleDesc ?? '',
        shipped: r.shipped,
        returned: r.returned,
        net: r.net,
        open: r.open,
      })),
      topCustomers: topCustomers.map((r) => ({
        customer: r.customer,
        shipped: r.shipped,
        returned: r.returned,
        net: r.net,
        open: r.open,
      })),
      seasons: seasons.map((r) => r.season).filter((s): s is string => Boolean(s)),
      customerTypes: customerTypes.map((r) => r.ct).filter((s): s is string => Boolean(s)),
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('invoice-aggregates error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
