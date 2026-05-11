import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * MSRP season-over-season comparison for the Pricing tab's export button.
 *
 * Returns two pivot shapes from the Pricing table:
 *   - byStyle: one row per (styleNumber), MSRP per season as max() across
 *     colors. Use the byColor sheet to see the per-color spread.
 *   - byColor: one row per (styleNumber, colorCode), exact MSRP per season.
 *
 * Seasons returned in canonical order (year ASC, SP before FA). Empty
 * cells (no Pricing row for that style+season) appear as null in JSON;
 * the client renders them as blank in the XLSX.
 */
export async function GET() {
  try {
    // Fetch all Pricing rows that carry a non-zero MSRP. Single query;
    // the pivot is cheap enough to do in JS (typically <50K rows).
    const rows = await prisma.pricing.findMany({
      where: { msrp: { gt: 0 } },
      select: {
        styleNumber: true,
        styleDesc: true,
        colorCode: true,
        colorDesc: true,
        season: true,
        msrp: true,
      },
      orderBy: [{ styleNumber: 'asc' }, { colorCode: 'asc' }, { season: 'asc' }],
    });

    // Collect distinct seasons and sort canonically: year ASC, SP before FA
    const seasonSet = new Set<string>();
    rows.forEach(r => seasonSet.add(r.season));
    const seasons = Array.from(seasonSet).sort((a, b) => {
      const ya = parseInt(a.slice(0, 2), 10);
      const yb = parseInt(b.slice(0, 2), 10);
      if (ya !== yb) return ya - yb;
      return a.endsWith('SP') ? -1 : 1;
    });

    // Pivot per (style, season) — MSRP is max() across colors. Tracks
    // styleDesc in a separate map so we always have one to surface.
    const byStyleMap = new Map<string, { styleDesc: string; seasonMsrps: Record<string, number> }>();
    for (const r of rows) {
      const sn = r.styleNumber;
      let entry = byStyleMap.get(sn);
      if (!entry) {
        entry = { styleDesc: r.styleDesc ?? '', seasonMsrps: {} };
        byStyleMap.set(sn, entry);
      }
      if (!entry.styleDesc && r.styleDesc) entry.styleDesc = r.styleDesc;
      const cur = entry.seasonMsrps[r.season];
      if (cur === undefined || r.msrp > cur) entry.seasonMsrps[r.season] = r.msrp;
    }

    const byStyle = Array.from(byStyleMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([styleNumber, e]) => ({
        styleNumber,
        styleDesc: e.styleDesc,
        seasonMsrps: e.seasonMsrps,
      }));

    // Pivot per (style, color, season) — exact MSRP per SKU.
    const byColorMap = new Map<string, {
      styleNumber: string; styleDesc: string;
      colorCode: string; colorDesc: string;
      seasonMsrps: Record<string, number>;
    }>();
    for (const r of rows) {
      const code = r.colorCode ?? '';
      const key = `${r.styleNumber}||${code}`;
      let entry = byColorMap.get(key);
      if (!entry) {
        entry = {
          styleNumber: r.styleNumber,
          styleDesc: r.styleDesc ?? '',
          colorCode: code,
          colorDesc: r.colorDesc ?? '',
          seasonMsrps: {},
        };
        byColorMap.set(key, entry);
      }
      if (!entry.styleDesc && r.styleDesc) entry.styleDesc = r.styleDesc;
      if (!entry.colorDesc && r.colorDesc) entry.colorDesc = r.colorDesc;
      // For per-color we don't expect duplicates, but if the unique index
      // ever isn't enforced we still want the highest seen.
      const cur = entry.seasonMsrps[r.season];
      if (cur === undefined || r.msrp > cur) entry.seasonMsrps[r.season] = r.msrp;
    }

    const byColor = Array.from(byColorMap.values())
      .sort((a, b) =>
        a.styleNumber.localeCompare(b.styleNumber) ||
        a.colorCode.localeCompare(b.colorCode));

    return NextResponse.json({
      success: true,
      seasons,
      byStyle,
      byColor,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
