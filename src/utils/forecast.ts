/**
 * Forecast Engine — pure calculation functions for projecting future season performance.
 *
 * Computes baseline projections from historical season-over-season trends,
 * with support for manual overrides persisted in localStorage.
 */

import { Product, SalesRecord, PricingRecord, CostRecord, InventoryOHRecord, CUSTOMER_TYPE_LABELS, normalizeCategory } from '@/types/product';
import { parseSeasonCode } from '@/lib/season-utils';
import { getSeasonStatus, type SeasonStatus } from '@/lib/season-utils';
import { sortSeasons } from '@/lib/store';
import { buildCostFallbackLookup } from '@/utils/costFallback';
import { matchesDivision } from '@/utils/divisionMap';

// ── Types ──────────────────────────────────────────────────────────────

export interface SeasonAggregate {
  season: string;
  revenue: number;
  units: number;
  avgPrice: number;
  avgCost: number;
  avgMargin: number;
  styleCount: number;
  status: SeasonStatus;
}

export interface CategoryAggregate {
  category: string;
  revenue: number;
  units: number;
  margin: number;
  styleCount: number;
}

export interface ChannelAggregate {
  channel: string;
  channelLabel: string;
  revenue: number;
  units: number;
}

export interface StyleAggregate {
  styleNumber: string;
  styleDesc: string;
  categoryDesc: string;
  divisionDesc: string;
  revenue: number;
  units: number;
  margin: number;
  price: number;
  cost: number;
}

export interface ForecastResult {
  season: string;
  status: SeasonStatus;
  label: string;
  // Season-level projections
  projectedRevenue: number;
  projectedUnits: number;
  projectedMargin: number;
  projectedStyleCount: number;
  revenueGrowthRate: number;
  unitGrowthRate: number;
  // Inventory needs
  recommendedInventory: number;
  safetyStock: number;
  // Baseline (what projection is derived from)
  baselineSeason: string;
  baselineRevenue: number;
  baselineUnits: number;
  // Breakdowns
  byCategory: CategoryAggregate[];
  byChannel: ChannelAggregate[];
  byStyle: StyleAggregate[];
}

export interface ForecastOverrides {
  [cellKey: string]: number;
}

// ── Override Persistence ───────────────────────────────────────────────

const OVERRIDE_KEY = 'kuhl-forecast-overrides-v1';

export function loadOverrides(): ForecastOverrides {
  try {
    const saved = localStorage.getItem(OVERRIDE_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

export function saveOverrides(overrides: ForecastOverrides): void {
  try {
    localStorage.setItem(OVERRIDE_KEY, JSON.stringify(overrides));
  } catch {
    console.warn('Failed to save forecast overrides');
  }
}

export function clearOverrides(): void {
  try {
    localStorage.removeItem(OVERRIDE_KEY);
  } catch {
    // ignore
  }
}

// ── Season Helpers ─────────────────────────────────────────────────────

/** Get the season type label (Spring/Fall) */
function seasonLabel(code: string): string {
  const parsed = parseSeasonCode(code);
  if (!parsed) return code;
  return `${parsed.type === 'SP' ? 'Spring' : 'Fall'} ${parsed.year}`;
}

/** Find comparable historical seasons (same SP/FA type), sorted newest first */
function findComparableSeasons(targetSeason: string, allSeasons: string[]): string[] {
  const parsed = parseSeasonCode(targetSeason);
  if (!parsed) return [];

  return sortSeasons(
    allSeasons.filter(s => {
      const p = parseSeasonCode(s);
      return p && p.type === parsed.type && p.year < parsed.year;
    })
  ).reverse(); // newest first
}

/**
 * Identify which seasons should be forecast targets.
 * PLANNING and PRE-BOOK seasons are targets. Also include SHIPPING as "current"
 * so users can see actuals vs. projected side by side.
 */
export function getForecastTargetSeasons(allSeasons: string[]): string[] {
  return sortSeasons(
    allSeasons.filter(s => {
      const status = getSeasonStatus(s);
      return status === 'PLANNING' || status === 'PRE-BOOK';
    })
  );
}

// ── Aggregation ────────────────────────────────────────────────────────

interface FilterOptions {
  division?: string;
  category?: string;
  search?: string;
}

function filterSales(sales: SalesRecord[], filters: FilterOptions): SalesRecord[] {
  return sales.filter(s => {
    if (filters.division && !matchesDivision(s.divisionDesc, filters.division)) return false;
    if (filters.category) {
      const normCat = normalizeCategory(s.categoryDesc);
      const normFilter = normalizeCategory(filters.category);
      if (normCat !== normFilter) return false;
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      if (
        !s.styleNumber.toLowerCase().includes(q) &&
        !s.styleDesc.toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });
}

/** Build season-level aggregates from sales data */
export function buildSeasonAggregates(
  sales: SalesRecord[],
  costs: CostRecord[],
  filters: FilterOptions = {},
): Map<string, SeasonAggregate> {
  const filtered = filterSales(sales, filters);
  const map = new Map<string, { revenue: number; units: number; styles: Set<string> }>();

  for (const s of filtered) {
    if (!s.season) continue;
    let agg = map.get(s.season);
    if (!agg) {
      agg = { revenue: 0, units: 0, styles: new Set() };
      map.set(s.season, agg);
    }
    agg.revenue += s.revenue || 0;
    agg.units += s.unitsBooked || 0;
    agg.styles.add(s.styleNumber);
  }

  // Build cost lookup for avg cost/margin
  const costMap = new Map<string, { totalCost: number; count: number }>();
  for (const c of costs) {
    if (!c.season) continue;
    const key = c.season;
    let entry = costMap.get(key);
    if (!entry) {
      entry = { totalCost: 0, count: 0 };
      costMap.set(key, entry);
    }
    const cost = c.landed > 0 ? c.landed : c.fob > 0 ? c.fob : 0;
    if (cost > 0) {
      entry.totalCost += cost;
      entry.count++;
    }
  }

  const result = new Map<string, SeasonAggregate>();
  for (const [season, agg] of map) {
    const avgPrice = agg.units > 0 ? agg.revenue / agg.units : 0;
    const costEntry = costMap.get(season);
    const avgCost = costEntry && costEntry.count > 0 ? costEntry.totalCost / costEntry.count : 0;
    const avgMargin = avgPrice > 0 && avgCost > 0 ? ((avgPrice - avgCost) / avgPrice) * 100 : 0;

    result.set(season, {
      season,
      revenue: agg.revenue,
      units: agg.units,
      avgPrice,
      avgCost,
      avgMargin,
      styleCount: agg.styles.size,
      status: getSeasonStatus(season),
    });
  }
  return result;
}

/** Build category-level aggregates for a specific season */
function buildCategoryAggregates(
  sales: SalesRecord[],
  season: string,
  costs: CostRecord[],
  filters: FilterOptions = {},
): CategoryAggregate[] {
  const filtered = filterSales(sales, filters).filter(s => s.season === season);
  const map = new Map<string, { revenue: number; units: number; styles: Set<string>; totalCost: number; costCount: number }>();

  for (const s of filtered) {
    const cat = normalizeCategory(s.categoryDesc) || 'Other';
    let agg = map.get(cat);
    if (!agg) {
      agg = { revenue: 0, units: 0, styles: new Set(), totalCost: 0, costCount: 0 };
      map.set(cat, agg);
    }
    agg.revenue += s.revenue || 0;
    agg.units += s.unitsBooked || 0;
    agg.styles.add(s.styleNumber);
  }

  // Enrich with cost data
  const seasonCosts = costs.filter(c => c.season === season);
  for (const c of seasonCosts) {
    const cost = c.landed > 0 ? c.landed : c.fob > 0 ? c.fob : 0;
    if (cost <= 0) continue;
    // Find product category for this cost record (look in sales)
    const salesForStyle = filtered.filter(s => s.styleNumber === c.styleNumber);
    if (salesForStyle.length > 0) {
      const cat = normalizeCategory(salesForStyle[0].categoryDesc) || 'Other';
      const agg = map.get(cat);
      if (agg) {
        agg.totalCost += cost;
        agg.costCount++;
      }
    }
  }

  return Array.from(map.entries())
    .map(([category, agg]) => {
      const avgPrice = agg.units > 0 ? agg.revenue / agg.units : 0;
      const avgCost = agg.costCount > 0 ? agg.totalCost / agg.costCount : 0;
      const margin = avgPrice > 0 && avgCost > 0 ? ((avgPrice - avgCost) / avgPrice) * 100 : 0;
      return {
        category,
        revenue: agg.revenue,
        units: agg.units,
        margin,
        styleCount: agg.styles.size,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
}

/** Build channel-level aggregates for a specific season */
function buildChannelAggregates(
  sales: SalesRecord[],
  season: string,
  filters: FilterOptions = {},
): ChannelAggregate[] {
  const filtered = filterSales(sales, filters).filter(s => s.season === season);
  const map = new Map<string, { revenue: number; units: number }>();

  for (const s of filtered) {
    const ch = s.customerType || 'Other';
    let agg = map.get(ch);
    if (!agg) {
      agg = { revenue: 0, units: 0 };
      map.set(ch, agg);
    }
    agg.revenue += s.revenue || 0;
    agg.units += s.unitsBooked || 0;
  }

  return Array.from(map.entries())
    .map(([channel, agg]) => ({
      channel,
      channelLabel: CUSTOMER_TYPE_LABELS[channel] || channel,
      revenue: agg.revenue,
      units: agg.units,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

/** Build style-level aggregates for a specific season */
function buildStyleAggregates(
  sales: SalesRecord[],
  season: string,
  costs: CostRecord[],
  products: Product[],
  filters: FilterOptions = {},
): StyleAggregate[] {
  const filtered = filterSales(sales, filters).filter(s => s.season === season);
  const map = new Map<string, { revenue: number; units: number; styleDesc: string; categoryDesc: string; divisionDesc: string }>();

  for (const s of filtered) {
    let agg = map.get(s.styleNumber);
    if (!agg) {
      agg = { revenue: 0, units: 0, styleDesc: s.styleDesc, categoryDesc: s.categoryDesc, divisionDesc: s.divisionDesc };
      map.set(s.styleNumber, agg);
    }
    agg.revenue += s.revenue || 0;
    agg.units += s.unitsBooked || 0;
  }

  // Get cost fallback lookup
  const { getCostWithFallback } = buildCostFallbackLookup(costs, products);

  return Array.from(map.entries())
    .map(([styleNumber, agg]) => {
      const price = agg.units > 0 ? agg.revenue / agg.units : 0;
      const costResult = getCostWithFallback(styleNumber, season);
      const cost = costResult.cost;
      const margin = price > 0 && cost > 0 ? ((price - cost) / price) * 100 : 0;
      return {
        styleNumber,
        styleDesc: agg.styleDesc,
        categoryDesc: normalizeCategory(agg.categoryDesc),
        divisionDesc: agg.divisionDesc,
        revenue: agg.revenue,
        units: agg.units,
        margin,
        price,
        cost,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
}

// ── Growth Rate Computation ────────────────────────────────────────────

interface GrowthRates {
  revenueGrowth: number;
  unitGrowth: number;
}

/**
 * Compute weighted growth rate from historical comparable seasons.
 * Weights: 60% most recent, 30% prior, 10% oldest.
 * Falls back to 0% if insufficient data.
 */
export function computeGrowthRate(
  aggregates: Map<string, SeasonAggregate>,
  targetSeason: string,
  allSeasons: string[],
): GrowthRates {
  const comparables = findComparableSeasons(targetSeason, allSeasons);

  // Get aggregates for comparable seasons (ordered newest first)
  const compAggs: SeasonAggregate[] = [];
  for (const s of comparables) {
    const agg = aggregates.get(s);
    if (agg && agg.revenue > 0) compAggs.push(agg);
    if (compAggs.length >= 4) break; // need max 4 for 3 growth rates
  }

  if (compAggs.length < 2) {
    return { revenueGrowth: 0, unitGrowth: 0 };
  }

  // Compute YoY growth rates between consecutive pairs
  const growthRates: { revenue: number; units: number }[] = [];
  for (let i = 0; i < compAggs.length - 1; i++) {
    const newer = compAggs[i];
    const older = compAggs[i + 1];
    growthRates.push({
      revenue: older.revenue > 0 ? (newer.revenue - older.revenue) / older.revenue : 0,
      units: older.units > 0 ? (newer.units - older.units) / older.units : 0,
    });
  }

  // Weighted average (most recent gets highest weight)
  const weights = [0.6, 0.3, 0.1];
  let revGrowth = 0, unitGrowth = 0, totalWeight = 0;
  growthRates.forEach((g, i) => {
    const w = weights[i] || 0.1;
    revGrowth += g.revenue * w;
    unitGrowth += g.units * w;
    totalWeight += w;
  });

  return {
    revenueGrowth: totalWeight > 0 ? revGrowth / totalWeight : 0,
    unitGrowth: totalWeight > 0 ? unitGrowth / totalWeight : 0,
  };
}

// ── Inventory Needs ────────────────────────────────────────────────────

/**
 * Compute recommended inventory for a projected season.
 * @param projectedUnits Expected units to sell
 * @param sellThroughRate Historical sell-through rate (0-1). Default 0.7
 * @param safetyStockWeeks Weeks of safety stock. Default 4
 */
export function computeInventoryNeeds(
  projectedUnits: number,
  sellThroughRate: number = 0.7,
  safetyStockWeeks: number = 4,
): { recommendedInventory: number; safetyStock: number } {
  const weeklyDemand = projectedUnits / 26; // ~26 weeks per season
  const safetyStock = Math.ceil(weeklyDemand * safetyStockWeeks);
  const rate = Math.max(sellThroughRate, 0.3); // floor at 30%
  const recommendedInventory = Math.ceil(projectedUnits / rate) + safetyStock;
  return { recommendedInventory, safetyStock };
}

// ── Master Forecast Computation ────────────────────────────────────────

/**
 * Compute forecasts for all target seasons.
 *
 * @param sales All sales records
 * @param products All product records
 * @param costs All cost records
 * @param inventoryOH On-hand inventory records
 * @param filters Active filter state
 */
export function computeForecasts(
  sales: SalesRecord[],
  products: Product[],
  costs: CostRecord[],
  inventoryOH: InventoryOHRecord[],
  filters: FilterOptions = {},
): ForecastResult[] {
  // Build season-level aggregates from historical data
  const allSeasons = Array.from(new Set(sales.map(s => s.season).filter(Boolean)));
  const aggregates = buildSeasonAggregates(sales, costs, filters);

  // Identify target seasons
  const targets = getForecastTargetSeasons(allSeasons);

  // If no PLANNING/PRE-BOOK seasons found, generate the next 2 logical seasons
  const effectiveTargets = targets.length > 0 ? targets : generateNextSeasons(allSeasons);

  // Compute sell-through rate from historical inventory data
  const totalOH = inventoryOH.reduce((sum, r) => sum + r.totalQty, 0);
  const totalSold = sales.reduce((sum, s) => sum + (s.unitsBooked || 0), 0);
  const historicalSellThrough = totalOH + totalSold > 0 ? totalSold / (totalSold + totalOH) : 0.7;

  return effectiveTargets.map(targetSeason => {
    const growth = computeGrowthRate(aggregates, targetSeason, allSeasons);

    // Find most recent comparable season as baseline
    const comparables = findComparableSeasons(targetSeason, allSeasons);
    const baselineSeason = comparables[0] || '';
    const baseline = aggregates.get(baselineSeason);

    const baselineRevenue = baseline?.revenue || 0;
    const baselineUnits = baseline?.units || 0;
    const baselineStyleCount = baseline?.styleCount || 0;

    // Project forward
    const projectedRevenue = baselineRevenue * (1 + growth.revenueGrowth);
    const projectedUnits = baselineUnits * (1 + growth.unitGrowth);
    const projectedStyleCount = baselineStyleCount; // style count stays flat

    // Project margin from costs
    const baselineMargin = baseline?.avgMargin || 0;
    const projectedMargin = baselineMargin; // margins held flat for projection

    // Inventory needs
    const { recommendedInventory, safetyStock } = computeInventoryNeeds(
      projectedUnits,
      historicalSellThrough,
    );

    // Category/channel/style breakdowns — scale from baseline season proportions
    const baseCategoryAggs = baselineSeason ? buildCategoryAggregates(sales, baselineSeason, costs, filters) : [];
    const baseChannelAggs = baselineSeason ? buildChannelAggregates(sales, baselineSeason, filters) : [];
    const baseStyleAggs = baselineSeason ? buildStyleAggregates(sales, baselineSeason, costs, products, filters) : [];

    const baseTotal = baseCategoryAggs.reduce((s, c) => s + c.revenue, 0);
    const revMultiplier = baseTotal > 0 ? projectedRevenue / baseTotal : 1;
    const unitMultiplier = baselineUnits > 0 ? projectedUnits / baselineUnits : 1;

    const byCategory = baseCategoryAggs.map(c => ({
      ...c,
      revenue: c.revenue * revMultiplier,
      units: Math.round(c.units * unitMultiplier),
    }));

    const byChannel = baseChannelAggs.map(c => ({
      ...c,
      revenue: c.revenue * revMultiplier,
      units: Math.round(c.units * unitMultiplier),
    }));

    const byStyle = baseStyleAggs.map(s => ({
      ...s,
      revenue: s.revenue * revMultiplier,
      units: Math.round(s.units * unitMultiplier),
    }));

    return {
      season: targetSeason,
      status: getSeasonStatus(targetSeason),
      label: seasonLabel(targetSeason),
      projectedRevenue,
      projectedUnits: Math.round(projectedUnits),
      projectedMargin,
      projectedStyleCount,
      revenueGrowthRate: growth.revenueGrowth * 100,
      unitGrowthRate: growth.unitGrowth * 100,
      recommendedInventory,
      safetyStock,
      baselineSeason,
      baselineRevenue,
      baselineUnits,
      byCategory,
      byChannel,
      byStyle,
    };
  });
}

/**
 * Get historical season aggregates plus forecast results for the timeline view.
 * Returns historical actuals (CLOSED/SHIPPING) alongside forecast projections.
 */
export function getTimelineSeries(
  sales: SalesRecord[],
  costs: CostRecord[],
  forecasts: ForecastResult[],
  filters: FilterOptions = {},
): Array<{ season: string; label: string; revenue: number; units: number; isForecast: boolean; status: SeasonStatus }> {
  const aggregates = buildSeasonAggregates(sales, costs, filters);

  // Historical actuals
  const historical = Array.from(aggregates.values())
    .filter(a => a.status === 'CLOSED' || a.status === 'SHIPPING')
    .map(a => ({
      season: a.season,
      label: seasonLabel(a.season),
      revenue: a.revenue,
      units: a.units,
      isForecast: false,
      status: a.status,
    }));

  // Forecast projections
  const projected = forecasts.map(f => ({
    season: f.season,
    label: f.label,
    revenue: f.projectedRevenue,
    units: f.projectedUnits,
    isForecast: true,
    status: f.status,
  }));

  return sortSeasons([...historical, ...projected].map(s => s.season))
    .map(season => [...historical, ...projected].find(s => s.season === season)!)
    .filter(Boolean);
}

// ── Helpers ────────────────────────────────────────────────────────────

/** Generate next 2 seasons after the latest known season */
function generateNextSeasons(allSeasons: string[]): string[] {
  if (allSeasons.length === 0) return [];
  const sorted = sortSeasons(allSeasons);
  const latest = sorted[sorted.length - 1];
  const parsed = parseSeasonCode(latest);
  if (!parsed) return [];

  const next: string[] = [];
  let { year, type } = parsed;

  for (let i = 0; i < 2; i++) {
    if (type === 'SP') {
      type = 'FA';
    } else {
      type = 'SP';
      year++;
    }
    next.push(`${String(year).slice(-2)}${type}`);
  }
  return next;
}

/** Apply an override to a value, returning the effective value */
export function applyOverride(
  overrides: ForecastOverrides,
  cellKey: string,
  computedValue: number,
): { value: number; isOverridden: boolean } {
  if (cellKey in overrides && overrides[cellKey] !== undefined) {
    return { value: overrides[cellKey], isOverridden: true };
  }
  return { value: computedValue, isOverridden: false };
}

/** Build the cell key for an override */
export function buildCellKey(
  metric: string,
  season: string,
  dimension?: string,
  dimensionValue?: string,
): string {
  if (dimension && dimensionValue) {
    return `${metric}:${season}:${dimension}:${dimensionValue}`;
  }
  return `${metric}:${season}`;
}
