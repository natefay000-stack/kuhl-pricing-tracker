/**
 * Shared helpers for projecting weighted margins on future (forecast) seasons.
 *
 * A "basis season" is a past season with real sales whose per-channel
 * discount behavior we treat as the default assumption for the future
 * season. We compute a per-channel net-to-list ratio from the basis
 * (actual average net price / actual average list price per channel),
 * then apply it to the future season's list prices to get synthetic
 * per-channel net prices. Those are weighted by an assumed channel mix
 * (the user's sliders, or the basis season's natural mix by default) to
 * produce the synthetic blended net price used in the margin formula.
 *
 * Both MarginsView and SeasonView consume this to keep their projections
 * consistent.
 */

import type { Product, SalesRecord } from '@/types/product';

// Channel configuration (source of truth)
export const PRIMARY_CHANNELS = ['WH', 'BB', 'KUHL_STORES', 'EC', 'PS', 'KI'] as const;
export type Channel = (typeof PRIMARY_CHANNELS)[number];

export const RETAIL_CHANNELS: ReadonlySet<string> = new Set(['EC', 'KUHL_STORES']);

export const CHANNEL_LABELS: Record<string, string> = {
  WH: 'Wholesale',
  BB: 'REI',
  PS: 'Pro Sales',
  EC: 'E-commerce',
  KI: 'KUHL International',
  KUHL_STORES: 'KÜHL Stores',
};

export const CHANNEL_COLORS: Record<string, { bg: string; text: string; light: string }> = {
  WH: { bg: 'bg-green-600', text: 'text-green-700 dark:text-green-300', light: 'bg-green-100 dark:bg-green-900' },
  BB: { bg: 'bg-red-600', text: 'text-red-700 dark:text-red-300', light: 'bg-red-100 dark:bg-red-900' },
  KUHL_STORES: { bg: 'bg-blue-600', text: 'text-blue-700 dark:text-blue-400', light: 'bg-blue-100 dark:bg-blue-900' },
  EC: { bg: 'bg-purple-600', text: 'text-purple-700 dark:text-purple-400', light: 'bg-purple-100 dark:bg-purple-900' },
  PS: { bg: 'bg-amber-600', text: 'text-amber-700 dark:text-amber-300', light: 'bg-amber-100 dark:bg-amber-900' },
  KI: { bg: 'bg-cyan-600', text: 'text-cyan-700 dark:text-cyan-300', light: 'bg-cyan-100 dark:bg-cyan-900' },
};

const RAW_TYPES = ['WH', 'BB', 'PS', 'EC', 'KI', 'DTC', 'WD'];

export function normalizeCustomerTypeToChannel(rawType: string | undefined | null): string {
  if (!rawType) return 'WH';
  const upper = String(rawType).toUpperCase().trim();
  // Handle comma-separated (aggregated) values — pick the first recognized one
  if (upper.includes(',')) {
    const types = upper.split(',').map((t) => t.trim()).filter((t) => RAW_TYPES.includes(t));
    if (types.length === 0) return 'WH';
    return normalizeCustomerTypeToChannel(types[0]);
  }
  if (upper === 'WD' || upper === 'DTC') return 'KUHL_STORES';
  if (['WH', 'BB', 'PS', 'EC', 'KI'].includes(upper)) return upper;
  return 'WH';
}

export interface ChannelMetric {
  units: number;
  revenue: number;
  avgNetPrice: number;
  listPriceRatio: number; // avgNetPrice / avgListPrice
}

export type BasisMetrics = Record<string, ChannelMetric>;

/**
 * Aggregate the basis season's sales into per-channel metrics.
 * listPriceRatio is what fraction of list price the channel actually realized.
 */
export function computeBasisMetrics(
  sales: SalesRecord[],
  products: Product[],
  basisSeason: string | null,
): BasisMetrics {
  const out: BasisMetrics = {};
  if (!basisSeason) return out;

  const productByStyle = new Map<string, Product>();
  products.forEach((p) => {
    if (!productByStyle.has(p.styleNumber)) productByStyle.set(p.styleNumber, p);
  });

  const perChannel = new Map<string, { units: number; revenue: number; totalList: number }>();
  sales.forEach((record) => {
    if (record.season !== basisSeason) return;
    const channel = normalizeCustomerTypeToChannel(record.customerType);
    const units = record.unitsBooked || 0;
    if (units <= 0) return;

    const p = productByStyle.get(record.styleNumber);
    const msrp = p?.msrp ?? 0;
    const wholesale = p?.price ?? record.wholesalePrice ?? 0;
    const listPrice = RETAIL_CHANNELS.has(channel) ? msrp : wholesale;
    if (listPrice <= 0) return;

    if (!perChannel.has(channel)) perChannel.set(channel, { units: 0, revenue: 0, totalList: 0 });
    const entry = perChannel.get(channel)!;
    entry.units += units;
    entry.revenue += record.revenue || 0;
    entry.totalList += units * listPrice;
  });

  PRIMARY_CHANNELS.forEach((c) => {
    const d = perChannel.get(c);
    if (!d || d.units === 0) {
      out[c] = { units: 0, revenue: 0, avgNetPrice: 0, listPriceRatio: 0 };
      return;
    }
    const avgNetPrice = d.revenue / d.units;
    const avgList = d.totalList / d.units;
    out[c] = {
      units: d.units,
      revenue: d.revenue,
      avgNetPrice,
      listPriceRatio: avgList > 0 ? avgNetPrice / avgList : 0,
    };
  });
  return out;
}

/** Natural channel mix (unit share %) from basis metrics. */
export function computeNaturalMix(basisMetrics: BasisMetrics): Record<string, number> {
  const total = PRIMARY_CHANNELS.reduce((s, c) => s + (basisMetrics[c]?.units ?? 0), 0);
  const mix: Record<string, number> = {};
  PRIMARY_CHANNELS.forEach((c) => {
    mix[c] = total > 0 ? ((basisMetrics[c]?.units ?? 0) / total) * 100 : 0;
  });
  return mix;
}

/**
 * Project a single style's weighted margin for a future season.
 * Returns null if the inputs are insufficient (no list price or no cost).
 */
export function projectWeightedMargin(args: {
  msrp: number;
  wholesale: number;
  landed: number;
  basisMetrics: BasisMetrics;
  effectiveMix: Record<string, number>; // pct values 0-100, may or may not sum to 100
}): { syntheticAvgNetPrice: number; weightedMargin: number; synthNetByChannel: Record<string, number> } | null {
  const { msrp, wholesale, landed, basisMetrics, effectiveMix } = args;
  if (landed <= 0) return null;
  if (msrp <= 0 && wholesale <= 0) return null;

  const synthNet: Record<string, number> = {};
  PRIMARY_CHANNELS.forEach((c) => {
    const ratio = basisMetrics[c]?.listPriceRatio ?? 0;
    const list = RETAIL_CHANNELS.has(c) ? msrp : wholesale;
    synthNet[c] = list > 0 && ratio > 0 ? list * ratio : 0;
  });

  const mixTotal = PRIMARY_CHANNELS.reduce((s, c) => s + (effectiveMix[c] ?? 0), 0);
  if (mixTotal <= 0) {
    return { syntheticAvgNetPrice: 0, weightedMargin: 0, synthNetByChannel: synthNet };
  }

  const syntheticAvgNetPrice = PRIMARY_CHANNELS.reduce((sum, c) => {
    const weight = (effectiveMix[c] ?? 0) / mixTotal;
    return sum + synthNet[c] * weight;
  }, 0);

  if (syntheticAvgNetPrice <= 0) {
    return { syntheticAvgNetPrice: 0, weightedMargin: 0, synthNetByChannel: synthNet };
  }

  const weightedMargin = ((syntheticAvgNetPrice - landed) / syntheticAvgNetPrice) * 100;
  return { syntheticAvgNetPrice, weightedMargin, synthNetByChannel: synthNet };
}
