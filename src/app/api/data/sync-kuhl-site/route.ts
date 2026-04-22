import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // up to 5 min — catalog-wide sync

/**
 * POST /api/data/sync-kuhl-site
 *
 * Reads kuhl.com product visibility + pricing for every style in our
 * Product table and writes the results into KuhlSiteStatus.
 *
 * The endpoint is READ-ONLY with respect to kuhl.com — it only calls GET
 * endpoints on whichever source is configured. It never mutates the site.
 *
 * Two possible sources, either env-var combo enables sync:
 *
 *   Strapi CMS (most likely)
 *     STRAPI_API_BASE                — e.g. https://cms.kuhl.com/api
 *     STRAPI_API_TOKEN               — read-only API token
 *     STRAPI_PRODUCT_CONTENT_TYPE    — defaults to 'products' if unset
 *     STRAPI_STYLE_FIELD             — defaults to 'styleNumber' if unset
 *     STRAPI_PRICE_FIELD             — defaults to 'price'        if unset
 *     STRAPI_MSRP_FIELD              — defaults to 'msrp'         if unset
 *
 *   KUHL backend API (fallback)
 *     KUHL_API_BASE                  — e.g. https://api.kuhl.com
 *     KUHL_API_KEY                   — API Gateway key
 *
 * Returns a structured report. When no source is configured the endpoint
 * still responds 200 with configured:false so the UI can show a friendly
 * "paste a token into Vercel env vars to enable" message.
 */

interface SyncReport {
  configured: boolean;
  source: 'strapi' | 'api' | 'none';
  fetched: number;
  live: number;
  hidden: number;
  notFound: number;
  errors: number;
  tookMs: number;
  message: string;
  sampleNotFound?: string[];
  envHints?: Record<string, string>;
}

function getConfig() {
  const strapiBase = process.env.STRAPI_API_BASE;
  const strapiToken = process.env.STRAPI_API_TOKEN;
  const kuhlBase = process.env.KUHL_API_BASE;
  const kuhlKey = process.env.KUHL_API_KEY;

  const strapi =
    strapiBase && strapiToken
      ? {
          base: strapiBase.replace(/\/+$/, ''),
          token: strapiToken,
          contentType: (process.env.STRAPI_PRODUCT_CONTENT_TYPE || 'products').replace(/^\/+|\/+$/g, ''),
          styleField: process.env.STRAPI_STYLE_FIELD || 'styleNumber',
          priceField: process.env.STRAPI_PRICE_FIELD || 'price',
          msrpField: process.env.STRAPI_MSRP_FIELD || 'msrp',
        }
      : null;

  const api = kuhlBase && kuhlKey ? { base: kuhlBase.replace(/\/+$/, ''), key: kuhlKey } : null;
  return { strapi, api };
}

async function syncFromStrapi(
  cfg: NonNullable<ReturnType<typeof getConfig>['strapi']>,
  styleNumbers: string[],
): Promise<SyncReport> {
  const start = Date.now();
  const report: SyncReport = {
    configured: true,
    source: 'strapi',
    fetched: 0,
    live: 0,
    hidden: 0,
    notFound: 0,
    errors: 0,
    tookMs: 0,
    message: '',
    sampleNotFound: [],
  };

  // Fetch all published + unpublished entries so we can detect hidden styles.
  // Strapi v4 default: only published show; pass publicationState=preview to
  // include drafts. Token must have permission to see draft state.
  const pageSize = 100;
  let page = 1;
  const results: Array<{ styleNumber: string | null; isLive: boolean; siteUrl: string | null; price: number | null; msrp: number | null }> = [];
  let maxPages = 500; // safety
  while (maxPages-- > 0) {
    const url = `${cfg.base}/${cfg.contentType}?publicationState=preview&pagination[page]=${page}&pagination[pageSize]=${pageSize}&populate=*`;
    try {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${cfg.token}`,
          Accept: 'application/json',
        },
      });
      if (!res.ok) {
        report.errors++;
        report.message = `Strapi ${res.status} on page ${page}`;
        break;
      }
      const body = await res.json();
      const data = Array.isArray(body.data) ? body.data : [];
      for (const entry of data) {
        // Strapi v4 shape: { id, attributes: {...} }
        const attrs = (entry?.attributes ?? entry) as Record<string, unknown>;
        const styleValue = attrs[cfg.styleField];
        const styleNumber = styleValue == null ? null : String(styleValue);
        const priceValue = attrs[cfg.priceField];
        const msrpValue = attrs[cfg.msrpField];
        const slug = attrs.slug ?? attrs.url ?? null;
        const publishedAt = attrs.publishedAt ?? null;
        results.push({
          styleNumber,
          isLive: Boolean(publishedAt),
          siteUrl: typeof slug === 'string' ? `https://www.kuhl.com/p/${slug}` : null,
          price: typeof priceValue === 'number' ? priceValue : null,
          msrp: typeof msrpValue === 'number' ? msrpValue : null,
        });
      }
      const meta = body.meta?.pagination;
      if (!meta || meta.page >= meta.pageCount || data.length < pageSize) break;
      page++;
    } catch (err) {
      report.errors++;
      report.message = `Strapi fetch failed: ${err instanceof Error ? err.message : String(err)}`;
      break;
    }
  }

  report.fetched = results.length;

  // Index by styleNumber for quick lookup
  const byStyle = new Map<string, (typeof results)[number]>();
  for (const r of results) {
    if (r.styleNumber) byStyle.set(r.styleNumber, r);
  }

  // Upsert one KuhlSiteStatus per requested style
  const now = new Date();
  for (const sn of styleNumbers) {
    const match = byStyle.get(sn);
    if (!match) {
      report.notFound++;
      if ((report.sampleNotFound?.length ?? 0) < 5) report.sampleNotFound!.push(sn);
      await prisma.kuhlSiteStatus.upsert({
        where: { styleNumber: sn },
        create: {
          styleNumber: sn,
          isLive: null,
          source: 'strapi',
          errorMessage: 'Not found in Strapi',
          lastCheckedAt: now,
        },
        update: {
          isLive: null,
          source: 'strapi',
          errorMessage: 'Not found in Strapi',
          lastCheckedAt: now,
        },
      });
      continue;
    }
    if (match.isLive) report.live++;
    else report.hidden++;
    await prisma.kuhlSiteStatus.upsert({
      where: { styleNumber: sn },
      create: {
        styleNumber: sn,
        isLive: match.isLive,
        siteUrl: match.siteUrl,
        currentPrice: match.price,
        currentMsrp: match.msrp,
        source: 'strapi',
        errorMessage: null,
        lastCheckedAt: now,
      },
      update: {
        isLive: match.isLive,
        siteUrl: match.siteUrl,
        currentPrice: match.price,
        currentMsrp: match.msrp,
        source: 'strapi',
        errorMessage: null,
        lastCheckedAt: now,
      },
    });
  }

  report.tookMs = Date.now() - start;
  report.message = report.message || `Synced ${report.fetched} Strapi entries in ${report.tookMs}ms.`;
  return report;
}

async function syncFromKuhlApi(
  cfg: NonNullable<ReturnType<typeof getConfig>['api']>,
  _styleNumbers: string[],
): Promise<SyncReport> {
  // Placeholder — the api.kuhl.com shape isn't documented publicly.
  // Once we have an API key + route spec we'll fill this in with the
  // same shape as syncFromStrapi.
  return {
    configured: true,
    source: 'api',
    fetched: 0,
    live: 0,
    hidden: 0,
    notFound: 0,
    errors: 1,
    tookMs: 0,
    message: `api.kuhl.com sync isn't implemented yet — need route spec. Base configured as ${cfg.base}.`,
  };
}

export async function POST(_request: NextRequest) {
  const { strapi, api } = getConfig();

  if (!strapi && !api) {
    const report: SyncReport = {
      configured: false,
      source: 'none',
      fetched: 0,
      live: 0,
      hidden: 0,
      notFound: 0,
      errors: 0,
      tookMs: 0,
      message:
        'Not configured. Set STRAPI_API_BASE + STRAPI_API_TOKEN (preferred) or KUHL_API_BASE + KUHL_API_KEY in Vercel env vars.',
      envHints: {
        STRAPI_API_BASE: 'missing',
        STRAPI_API_TOKEN: 'missing',
        KUHL_API_BASE: 'missing',
        KUHL_API_KEY: 'missing',
      },
    };
    return NextResponse.json(report);
  }

  // Gather the style numbers we care about — everything in our Product
  // or Ats table. De-dup by trimming.
  const [products, ats] = await Promise.all([
    prisma.product.findMany({ select: { styleNumber: true }, distinct: ['styleNumber'] }),
    prisma.atsInventory.findMany({ select: { styleNumber: true }, distinct: ['styleNumber'] }),
  ]);
  const styleSet = new Set<string>();
  for (const p of products) if (p.styleNumber) styleSet.add(p.styleNumber.trim());
  for (const a of ats) if (a.styleNumber) styleSet.add(a.styleNumber.trim());
  const styleNumbers = Array.from(styleSet).filter(Boolean);

  try {
    const report = strapi
      ? await syncFromStrapi(strapi, styleNumbers)
      : await syncFromKuhlApi(api!, styleNumbers);
    return NextResponse.json(report);
  } catch (error) {
    console.error('sync-kuhl-site error:', error);
    return NextResponse.json(
      {
        configured: true,
        source: strapi ? 'strapi' : 'api',
        error: 'Sync failed',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
