/**
 * Cost fallback utility — when a style has no landed cost for a given season,
 * fall back to the most recent prior season's landed cost.
 */

import { CostRecord } from '@/types/product';
import { parseSeasonCode } from '@/utils/season';

export interface CostResult {
  cost: number;
  source: 'exact' | 'fallback' | 'missing';
  fallbackSeason?: string;
}

/**
 * Convert a season code like "24SP" or "25FA" to a numeric sort key.
 * SP = 0, FA = 1 within a year, so 24SP=4800, 24FA=4801, 25SP=5000, 25FA=5001.
 */
function seasonSortKey(season: string): number {
  const parsed = parseSeasonCode(season);
  if (!parsed) return -1;
  return parsed.year * 2 + (parsed.type === 'FA' ? 1 : 0);
}

/**
 * Build a fallback-aware cost lookup.
 *
 * @param costs  Array of CostRecord from the landed cost sheet
 * @param products Optional array of Products to supplement cost data
 * @returns A getter function that resolves costs with prior-season fallback
 */
export function buildCostFallbackLookup(
  costs: CostRecord[],
  products?: { styleNumber: string; season: string; cost: number }[],
): {
  getCostWithFallback: (styleNumber: string, season: string) => CostResult;
} {
  // Map: styleNumber -> sorted list of { season, sortKey, cost }
  const byStyle = new Map<string, { season: string; sortKey: number; cost: number }[]>();

  function addEntry(styleNumber: string, season: string, cost: number) {
    if (!styleNumber || !season || cost <= 0) return;
    const sk = seasonSortKey(season);
    if (sk < 0) return;

    if (!byStyle.has(styleNumber)) {
      byStyle.set(styleNumber, []);
    }
    const entries = byStyle.get(styleNumber)!;
    // Check if we already have this season — keep highest cost (landed > fob > product)
    const existing = entries.find(e => e.season === season);
    if (existing) {
      if (cost > existing.cost) existing.cost = cost;
    } else {
      entries.push({ season, sortKey: sk, cost });
    }
  }

  // Add from cost records (priority: landed > fob)
  costs.forEach(c => {
    const cost = c.landed > 0 ? c.landed : c.fob > 0 ? c.fob : 0;
    addEntry(c.styleNumber, c.season, cost);
  });

  // Supplement from products
  if (products) {
    products.forEach(p => {
      addEntry(p.styleNumber, p.season, p.cost);
    });
  }

  // Sort each style's entries by season descending (most recent first)
  byStyle.forEach(entries => {
    entries.sort((a, b) => b.sortKey - a.sortKey);
  });

  function getCostWithFallback(styleNumber: string, season: string): CostResult {
    const entries = byStyle.get(styleNumber);
    if (!entries || entries.length === 0) {
      return { cost: 0, source: 'missing' };
    }

    // Try exact match
    const exact = entries.find(e => e.season === season);
    if (exact && exact.cost > 0) {
      return { cost: exact.cost, source: 'exact' };
    }

    // Find most recent PRIOR season with a cost
    const targetKey = seasonSortKey(season);
    if (targetKey < 0) {
      return { cost: 0, source: 'missing' };
    }

    // entries are sorted descending — find first entry with sortKey < targetKey
    for (const entry of entries) {
      if (entry.sortKey < targetKey && entry.cost > 0) {
        return { cost: entry.cost, source: 'fallback', fallbackSeason: entry.season };
      }
    }

    return { cost: 0, source: 'missing' };
  }

  return { getCostWithFallback };
}
