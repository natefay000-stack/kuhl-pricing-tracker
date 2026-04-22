import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * POST /api/data/import-kuhl-site
 *
 * Reads the kuhl.com "Style Report" xlsx (Style # / Style name / Color name,
 * one row per live style×color on kuhl.com) and populates KuhlSiteStatus:
 *
 *   - Every styleNumber in the report → isLive = true
 *   - Every styleNumber in Product or AtsInventory but NOT in the report
 *     → isLive = false (hidden / not on site)
 *
 * Style-level (not style×color) because KuhlSiteStatus is keyed on styleNumber.
 * If any color of a style is reported as live, the style is considered live.
 */

function normalizeSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) return NextResponse.json({ error: 'No sheet found' }, { status: 400 });

    type Row = Record<string, unknown>;
    const rows = XLSX.utils.sheet_to_json<Row>(sheet, { defval: null });

    // Validate columns
    const first = rows[0] ?? {};
    const styleKey = 'Style #' in first ? 'Style #' : 'Style#' in first ? 'Style#' : 'Style';
    const nameKey = 'Style name' in first ? 'Style name' : 'Style Name' in first ? 'Style Name' : null;
    if (!(styleKey in first)) {
      return NextResponse.json(
        { error: 'Expected a "Style #" column — doesn\'t look like the kuhl.com Style Report.' },
        { status: 400 }
      );
    }

    // Unique styles + first name per style for slug hint
    const liveByStyle = new Map<string, { name: string; colors: Set<string> }>();
    for (const r of rows) {
      const sn = String(r[styleKey] ?? '').trim();
      if (!sn) continue;
      const name = nameKey ? String(r[nameKey] ?? '').trim() : '';
      const color = String(r['Color name'] ?? r['Color Name'] ?? '').trim();
      const cur = liveByStyle.get(sn) ?? { name, colors: new Set<string>() };
      if (!cur.name && name) cur.name = name;
      if (color) cur.colors.add(color);
      liveByStyle.set(sn, cur);
    }

    // Universe = every styleNumber we've seen in Product + AtsInventory
    const [products, ats] = await Promise.all([
      prisma.product.findMany({ select: { styleNumber: true }, distinct: ['styleNumber'] }),
      prisma.atsInventory.findMany({ select: { styleNumber: true }, distinct: ['styleNumber'] }),
    ]);
    const universe = new Set<string>();
    for (const p of products) if (p.styleNumber) universe.add(p.styleNumber.trim());
    for (const a of ats) if (a.styleNumber) universe.add(a.styleNumber.trim());
    for (const sn of liveByStyle.keys()) universe.add(sn);

    const now = new Date();
    let liveCount = 0;
    let hiddenCount = 0;
    let notOnSiteCount = 0;

    // Build every upsert as a row and run them in a single transaction. ~1k
    // statements max; Neon handles this in < 2s.
    const ops = [];
    for (const sn of universe) {
      const live = liveByStyle.get(sn);
      if (live) {
        // Reported live
        liveCount++;
        const slug = live.name ? normalizeSlug(live.name) : null;
        ops.push(
          prisma.kuhlSiteStatus.upsert({
            where: { styleNumber: sn },
            create: {
              styleNumber: sn,
              isLive: true,
              siteUrl: slug ? `https://www.kuhl.com/shop/${slug}` : null,
              source: 'report',
              errorMessage: null,
              lastCheckedAt: now,
            },
            update: {
              isLive: true,
              siteUrl: slug ? `https://www.kuhl.com/shop/${slug}` : null,
              source: 'report',
              errorMessage: null,
              lastCheckedAt: now,
            },
          })
        );
      } else {
        // Not reported — we either have this style in Product/Ats (so it's
        // a hidden product) or it's a carryover we should mark as not live.
        // Either way: isLive = false.
        const inOurDb = products.some((p) => p.styleNumber === sn) || ats.some((a) => a.styleNumber === sn);
        if (inOurDb) hiddenCount++;
        else notOnSiteCount++;
        ops.push(
          prisma.kuhlSiteStatus.upsert({
            where: { styleNumber: sn },
            create: {
              styleNumber: sn,
              isLive: false,
              siteUrl: null,
              source: 'report',
              errorMessage: null,
              lastCheckedAt: now,
            },
            update: {
              isLive: false,
              siteUrl: null,
              source: 'report',
              errorMessage: null,
              lastCheckedAt: now,
            },
          })
        );
      }
    }

    // Neon / Postgres can handle ~2k upserts in a single transaction OK.
    await prisma.$transaction(ops);

    return NextResponse.json({
      success: true,
      reportedStyles: liveByStyle.size,
      reportedRows: rows.length,
      live: liveCount,
      hidden: hiddenCount,
      notOnSite: notOnSiteCount,
      totalStatuses: universe.size,
      snapshotDate: now.toISOString(),
    });
  } catch (error) {
    console.error('import-kuhl-site error:', error);
    return NextResponse.json(
      {
        error: 'Failed to import kuhl.com report',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
