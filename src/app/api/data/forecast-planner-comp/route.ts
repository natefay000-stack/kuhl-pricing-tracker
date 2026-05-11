import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Forecast Planner — historical season-over-season comparison data for
 * the planning view. Pulls aggregated Sale-table rows for the same-type
 * comparison seasons of a target season (e.g., target=27SP → returns
 * 25SP + 26SP), then groups by the requested level.
 *
 * Sale table is the source (not Invoice) because:
 *   - Sale carries `salesRep` for rep-filtering
 *   - "Sold" in planning context = booked + shipped, both of which the
 *     Sale row exposes via revenue/shipped/openAtNet/shippedAtNet
 *
 * Query params:
 *   targetSeason  required, e.g. "27SP"
 *   seasonsBack   default 2 — how many same-type seasons to include
 *   groupBy       category | style | color (default category)
 *   rep           csv list (optional)
 *   customer      csv list (optional)
 *   category      filter scope (required when groupBy=style or color)
 *   styleNumber   filter scope (required when groupBy=color)
 */
function comparisonSeasons(target: string, n: number): string[] {
  const m = target.match(/^(\d{2})(SP|FA)$/i);
  if (!m) return [];
  const yr = parseInt(m[1], 10);
  const type = m[2].toUpperCase();
  const out: string[] = [];
  for (let i = n; i >= 1; i--) {
    const y = yr - i;
    if (y < 0) continue;
    out.push(`${String(y).padStart(2, '0')}${type}`);
  }
  return out;
}

interface RowAgg {
  shipped: number;
  open: number;
  total: number;
  units: number;
  orders: number;
  customerSet: Set<string>;
}

function emptyAgg(): RowAgg {
  return { shipped: 0, open: 0, total: 0, units: 0, orders: 0, customerSet: new Set() };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const targetSeason = url.searchParams.get('targetSeason') ?? '';
  const seasonsBack = Math.max(1, Math.min(5, parseInt(url.searchParams.get('seasonsBack') ?? '2', 10) || 2));
  const groupBy = (url.searchParams.get('groupBy') ?? 'category') as 'category' | 'style' | 'color';
  const repFilter = (url.searchParams.get('rep') ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const customerFilter = (url.searchParams.get('customer') ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const categoryScope = url.searchParams.get('category') ?? '';
  const styleScope = url.searchParams.get('styleNumber') ?? '';

  if (!targetSeason) {
    return NextResponse.json({ error: 'targetSeason required (e.g., 27SP)' }, { status: 400 });
  }

  const seasons = comparisonSeasons(targetSeason, seasonsBack);
  if (seasons.length === 0) {
    return NextResponse.json({ error: 'targetSeason must match /(\\d{2})(SP|FA)/' }, { status: 400 });
  }

  try {
    // Single Prisma query — pulls only the columns we need, scoped to
    // the comparison seasons + filter set. Aggregation happens in JS
    // because the group-by axis is dynamic.
    const rows = await prisma.sale.findMany({
      where: {
        season: { in: seasons },
        ...(repFilter.length > 0 ? { salesRep: { in: repFilter } } : {}),
        ...(customerFilter.length > 0 ? { customer: { in: customerFilter } } : {}),
        ...(categoryScope ? { categoryDesc: categoryScope } : {}),
        ...(styleScope ? { styleNumber: styleScope } : {}),
      },
      select: {
        season: true,
        styleNumber: true,
        styleDesc: true,
        colorCode: true,
        colorDesc: true,
        categoryDesc: true,
        customer: true,
        salesRep: true,
        revenue: true,
        shipped: true,
        shippedAtNet: true,
        openAtNet: true,
        unitsBooked: true,
        unitsShipped: true,
      },
    });

    // Group key resolver
    const keyOf = (r: typeof rows[number]): { key: string; label: string } => {
      switch (groupBy) {
        case 'style': {
          const k = r.styleNumber || '(unknown)';
          return { key: k, label: r.styleDesc || k };
        }
        case 'color': {
          const k = `${r.styleNumber || '?'}||${r.colorCode || ''}`;
          const lab = `${r.colorCode || '(no color)'} — ${r.colorDesc || ''}`.trim();
          return { key: k, label: lab };
        }
        case 'category':
        default: {
          const k = r.categoryDesc || '(uncategorized)';
          return { key: k, label: k };
        }
      }
    };

    // Pivot: groupKey → season → RowAgg
    const grid = new Map<string, { label: string; bySeason: Map<string, RowAgg> }>();
    for (const r of rows) {
      const { key, label } = keyOf(r);
      let entry = grid.get(key);
      if (!entry) {
        entry = { label, bySeason: new Map() };
        grid.set(key, entry);
      }
      let agg = entry.bySeason.get(r.season);
      if (!agg) {
        agg = emptyAgg();
        entry.bySeason.set(r.season, agg);
      }
      // Prefer detailed (shippedAtNet / openAtNet) when present; fall
      // back to the rougher revenue / shipped fields when they're zero.
      const shippedDollars = r.shippedAtNet || r.shipped || 0;
      const openDollars = r.openAtNet || Math.max(0, (r.revenue || 0) - shippedDollars);
      agg.shipped += shippedDollars;
      agg.open += openDollars;
      agg.total += shippedDollars + openDollars;
      agg.units += (r.unitsShipped || 0) + (r.unitsBooked || 0);
      agg.orders += 1;
      if (r.customer) agg.customerSet.add(r.customer);
    }

    // Build response rows with YoY + 2-yr avg fields
    const responseRows = Array.from(grid.entries()).map(([key, e]) => {
      const bySeason: Record<string, { shipped: number; open: number; total: number; units: number; orders: number; customers: number }> = {};
      seasons.forEach(s => {
        const a = e.bySeason.get(s);
        bySeason[s] = a
          ? { shipped: a.shipped, open: a.open, total: a.total, units: a.units, orders: a.orders, customers: a.customerSet.size }
          : { shipped: 0, open: 0, total: 0, units: 0, orders: 0, customers: 0 };
      });
      // YoY % change between the two most recent comparison seasons
      const last = seasons[seasons.length - 1];
      const prev = seasons[seasons.length - 2];
      const lastTotal = bySeason[last]?.total ?? 0;
      const prevTotal = prev ? (bySeason[prev]?.total ?? 0) : 0;
      const yoyDeltaPct = prev && prevTotal !== 0 ? (lastTotal - prevTotal) / prevTotal : null;
      // Average across all comparison seasons (only those with non-zero)
      const totals = seasons.map(s => bySeason[s].total).filter(v => v !== 0);
      const avgTotal = totals.length > 0 ? totals.reduce((a, b) => a + b, 0) / totals.length : 0;
      return { key, label: e.label, bySeason, yoyDeltaPct, avgTotal };
    });

    // Sort by avg total descending so the most-significant rows surface first
    responseRows.sort((a, b) => b.avgTotal - a.avgTotal);

    // Grand totals row
    const grandTotal = {
      bySeason: Object.fromEntries(seasons.map(s => {
        const sum = responseRows.reduce((acc, r) => ({
          shipped: acc.shipped + r.bySeason[s].shipped,
          open: acc.open + r.bySeason[s].open,
          total: acc.total + r.bySeason[s].total,
          units: acc.units + r.bySeason[s].units,
        }), { shipped: 0, open: 0, total: 0, units: 0 });
        return [s, sum];
      })),
      avgTotal: responseRows.reduce((acc, r) => acc + r.avgTotal, 0),
    };

    return NextResponse.json({
      success: true,
      targetSeason,
      comparisonSeasons: seasons,
      groupBy,
      filters: { rep: repFilter, customer: customerFilter, categoryScope, styleScope },
      rows: responseRows,
      grandTotal,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
