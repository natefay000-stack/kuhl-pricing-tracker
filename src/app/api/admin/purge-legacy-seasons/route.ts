import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdminToken } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * One-shot admin endpoint: permanently deletes all records for legacy
 * seasons 10SP–19SP and 10FA–19FA from every table that carries a `season`
 * column (Product, Sale, Invoice, Pricing, Cost).
 *
 * Usage:
 *   curl -X POST https://<host>/api/admin/purge-legacy-seasons
 *   curl https://<host>/api/admin/purge-legacy-seasons   (dry-run, returns counts only)
 *
 * Returns the per-table delete counts (or pre-delete counts on GET dry-run).
 */
const LEGACY_SEASONS: string[] = (() => {
  const out: string[] = [];
  for (let yr = 10; yr <= 19; yr++) {
    out.push(`${yr}SP`);
    out.push(`${yr}FA`);
  }
  return out;
})();

async function counts() {
  const [products, sales, invoices, pricing, costs] = await Promise.all([
    prisma.product.count({ where: { season: { in: LEGACY_SEASONS } } }),
    prisma.sale.count({ where: { season: { in: LEGACY_SEASONS } } }),
    prisma.invoice.count({ where: { season: { in: LEGACY_SEASONS } } }),
    prisma.pricing.count({ where: { season: { in: LEGACY_SEASONS } } }),
    prisma.cost.count({ where: { season: { in: LEGACY_SEASONS } } }),
  ]);
  return { products, sales, invoices, pricing, costs };
}

export async function GET() {
  try {
    const c = await counts();
    return NextResponse.json({
      mode: 'dry-run',
      seasons: LEGACY_SEASONS,
      wouldDelete: c,
      total: Object.values(c).reduce((a, b) => a + b, 0),
      hint: 'POST this endpoint to actually delete.',
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
    const before = await counts();

    const [products, sales, invoices, pricing, costs] = await Promise.all([
      prisma.product.deleteMany({ where: { season: { in: LEGACY_SEASONS } } }),
      prisma.sale.deleteMany({ where: { season: { in: LEGACY_SEASONS } } }),
      prisma.invoice.deleteMany({ where: { season: { in: LEGACY_SEASONS } } }),
      prisma.pricing.deleteMany({ where: { season: { in: LEGACY_SEASONS } } }),
      prisma.cost.deleteMany({ where: { season: { in: LEGACY_SEASONS } } }),
    ]);

    const deleted = {
      products: products.count,
      sales: sales.count,
      invoices: invoices.count,
      pricing: pricing.count,
      costs: costs.count,
    };

    return NextResponse.json({
      success: true,
      seasons: LEGACY_SEASONS,
      before,
      deleted,
      total: Object.values(deleted).reduce((a, b) => a + b, 0),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
