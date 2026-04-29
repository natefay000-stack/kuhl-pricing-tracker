/**
 * Costing + Margins xlsx export.
 *
 * Produces a 4-sheet workbook:
 *   1. Costing Detail   — one row per style × color × season
 *   2. Style Summary    — one row per style × season (colors aggregated)
 *   3. Season Totals    — one row per season (blended margin)
 *   4. Scenario         — only when a forecast scenario is active
 *
 * All margin numbers stay faithful to what the app shows:
 *   - Baseline margin = (wholesale - landed) / wholesale
 *   - Weighted margin (historical) = (revenue - landed*units) / revenue
 *     using actual sales-weighted revenue per style+color
 *   - Projected margin (forecast) = shared projectWeightedMargin() from
 *     /utils/marginScenario so it matches Season View + Margins View.
 */

import * as XLSX from 'xlsx';
import type { Product, PricingRecord, CostRecord, SalesRecord } from '@/types/product';
import {
  PRIMARY_CHANNELS,
  CHANNEL_LABELS,
  computeBasisMetrics,
  computeNaturalMix,
  projectWeightedMargin,
  type BasisMetrics,
} from '@/utils/marginScenario';
import { buildCostFallbackLookup } from '@/utils/costFallback';
import { getSeasonStatus, getSeasonStatusBadge } from '@/lib/season-utils';
import { sortSeasons } from '@/lib/store';

/**
 * Prior-season cost fallback is blocked for PLANNING + PRE-BOOK seasons:
 * future-season costing must come from the Landed Sheet (or line-list),
 * never carried forward from an older season.
 */
function canUseCostFallback(season: string): boolean {
  const status = getSeasonStatus(season);
  return status !== 'PLANNING' && status !== 'PRE-BOOK';
}

// ── Cell formats ─────────────────────────────────────────────────────────────
const FMT_CURRENCY = '"$"#,##0.00;[Red]\\("$"#,##0.00\\);"—"';
const FMT_INT = '#,##0;[Red]-#,##0;"—"';
const FMT_PCT = '0.0%;[Red]\\(0.0%\\);"—"';

// Column definitions: key (matches object field), header label, width, format
interface ColSpec {
  key: string;
  header: string;
  width: number;
  format?: string;
}

export interface CostingExportArgs {
  products: Product[];
  pricing: PricingRecord[];
  costs: CostRecord[];
  sales: SalesRecord[];

  // Optional narrowing
  seasonFilter?: string[]; // when set, only these seasons export
  divisionFilter?: string;
  categoryFilter?: string;

  // Scenario settings (if user has a scenario active in a view)
  scenario?: {
    basisSeason: string;
    effectiveMix: Record<string, number>;
  };

  filename?: string;
}

interface DetailRow {
  'Style #': string;
  'Description': string;
  'Color Code': string;
  'Color Desc': string;
  'Season': string;
  'Season Status': string;
  'Division': string;
  'Category': string;
  'Designer': string;
  'Factory': string;
  'COO': string;
  'FOB': number | null;
  'Duty Cost': number | null;
  'Tariff Cost': number | null;
  'Freight Cost': number | null;
  'Overhead Cost': number | null;
  'Landed': number | null;
  'MSRP': number | null;
  'Wholesale': number | null;
  'Baseline Margin': number | null;       // ratio 0-1
  'Avg Net Price (actual)': number | null;
  'Weighted Margin (actual)': number | null;
  'Projected Margin': number | null;
  'Projection Basis': string;
  'Units Sold': number | null;
  'Revenue': number | null;
  'Cost Source': string;
  'Price Source': string;
}

interface StyleRow {
  'Style #': string;
  'Description': string;
  'Season': string;
  'Division': string;
  'Category': string;
  '# Colors': number;
  'Landed': number | null;
  'MSRP': number | null;
  'Wholesale': number | null;
  'Baseline Margin': number | null;
  'Units (all colors)': number | null;
  'Revenue (all colors)': number | null;
  'Weighted/Projected Margin': number | null;
  'Projected?': string;
}

interface SeasonRow {
  'Season': string;
  'Status': string;
  '# Styles': number;
  '# Colors': number;
  'Total Units': number;
  'Total Revenue': number;
  'Avg Landed': number | null;
  'Avg Wholesale': number | null;
  'Blended Margin': number | null;
  'Cost Coverage': number | null; // ratio of styles with landed cost
}

/** Main entry point. Assembles everything and triggers a download. */
export function exportCostingMargins(args: CostingExportArgs): void {
  const {
    products,
    pricing,
    costs,
    sales,
    seasonFilter,
    divisionFilter,
    categoryFilter,
    scenario,
    filename = 'KUHL_Costing_Margins',
  } = args;

  // Lookups
  const pricingByKey = new Map<string, PricingRecord>();
  pricing.forEach((p) => pricingByKey.set(`${p.styleNumber}-${p.season}`, p));
  const costByKey = new Map<string, CostRecord>();
  costs.forEach((c) => costByKey.set(`${c.styleNumber}-${c.season}`, c));
  const fallbackLookup = buildCostFallbackLookup(costs, products);

  // Sales aggregation keyed by `${style}-${color}-${season}` and `${style}-${season}` for style-level rollups
  const salesByColor = new Map<string, { revenue: number; units: number }>();
  const salesByStyleSeason = new Map<string, { revenue: number; units: number; colors: Set<string> }>();
  const seasonsWithSales = new Set<string>();
  sales.forEach((s) => {
    if (!s.season || !s.styleNumber) return;
    seasonsWithSales.add(s.season);
    const colorKey = `${s.styleNumber}-${s.colorCode ?? ''}-${s.season}`;
    const prev = salesByColor.get(colorKey) ?? { revenue: 0, units: 0 };
    prev.revenue += s.revenue || 0;
    prev.units += s.unitsBooked || 0;
    salesByColor.set(colorKey, prev);

    const styleSeasonKey = `${s.styleNumber}-${s.season}`;
    const sp = salesByStyleSeason.get(styleSeasonKey) ?? { revenue: 0, units: 0, colors: new Set<string>() };
    sp.revenue += s.revenue || 0;
    sp.units += s.unitsBooked || 0;
    if (s.colorCode) sp.colors.add(s.colorCode);
    salesByStyleSeason.set(styleSeasonKey, sp);
  });

  // Basis metrics for scenario projection
  let basisMetrics: BasisMetrics | null = null;
  if (scenario?.basisSeason) {
    basisMetrics = computeBasisMetrics(sales, products, scenario.basisSeason);
  }

  // Product filter by division/category
  const matchesFilters = (p: Product): boolean => {
    if (divisionFilter) {
      const desc = (p.divisionDesc ?? '').toLowerCase();
      const tokens = divisionFilter.split('|').filter(Boolean);
      if (tokens.length > 0 && !tokens.some(t => desc.includes(t.toLowerCase()))) return false;
    }
    if (categoryFilter) {
      const tokens = categoryFilter.split('|').filter(Boolean);
      if (tokens.length > 0 && !tokens.includes(p.categoryDesc ?? '')) return false;
    }
    if (seasonFilter && seasonFilter.length > 0 && !seasonFilter.includes(p.season)) return false;
    return true;
  };

  // ── Sheet 1: Detail ──
  const detailRows: DetailRow[] = [];
  const productsFiltered = products.filter((p) => matchesFilters(p));

  // Deduplicate by style+color+season — line list can have duplicates
  const seenProduct = new Set<string>();
  productsFiltered.forEach((p) => {
    const key = `${p.styleNumber}-${p.color ?? ''}-${p.season}`;
    if (seenProduct.has(key)) return;
    seenProduct.add(key);

    const costExact = costByKey.get(`${p.styleNumber}-${p.season}`);
    let landed = costExact?.landed ?? 0;
    let costSource = costExact ? 'landed_cost' : '';
    let costFallbackSeason: string | undefined;
    if (!landed || landed <= 0) {
      if (canUseCostFallback(p.season)) {
        const result = fallbackLookup.getCostWithFallback(p.styleNumber, p.season);
        if (result.cost > 0) {
          landed = result.cost;
          costSource = result.source === 'fallback' ? `fallback:${result.fallbackSeason}` : (costSource || 'landed_cost');
          if (result.source === 'fallback') costFallbackSeason = result.fallbackSeason;
        } else if (p.cost && p.cost > 0) {
          landed = p.cost;
          costSource = 'linelist';
        }
      } else if (p.cost && p.cost > 0) {
        // Forecast season — only line-list fallback allowed, no prior-season carryover.
        landed = p.cost;
        costSource = 'linelist';
      }
    }

    const pricingExact = pricingByKey.get(`${p.styleNumber}-${p.season}`);
    const msrp = p.msrp || pricingExact?.msrp || 0;
    const wholesale = p.price || pricingExact?.price || 0;
    const priceSource = p.msrp || p.price ? 'linelist' : pricingExact ? 'pricebyseason' : '';

    const baselineMargin = wholesale > 0 && landed > 0 ? (wholesale - landed) / wholesale : null;

    const salesData = salesByColor.get(`${p.styleNumber}-${p.color ?? ''}-${p.season}`);
    const avgNet = salesData && salesData.units > 0 ? salesData.revenue / salesData.units : null;
    const weightedMargin = avgNet && landed > 0 ? (avgNet - landed) / avgNet : null;

    let projectedMargin: number | null = null;
    let projectionBasis = '';
    const isForecast = !seasonsWithSales.has(p.season);
    if (isForecast && scenario && basisMetrics) {
      const projected = projectWeightedMargin({
        msrp,
        wholesale,
        landed,
        basisMetrics,
        effectiveMix: scenario.effectiveMix,
      });
      if (projected && projected.syntheticAvgNetPrice > 0) {
        projectedMargin = projected.weightedMargin / 100; // formula returned percent
        projectionBasis = scenario.basisSeason;
      }
    }

    const status = getSeasonStatus(p.season);
    const badge = getSeasonStatusBadge(status);

    detailRows.push({
      'Style #': p.styleNumber,
      'Description': p.styleDesc || '',
      'Color Code': p.color || '',
      'Color Desc': p.colorDesc || '',
      'Season': p.season,
      'Season Status': badge.label,
      'Division': p.divisionDesc || '',
      'Category': p.categoryDesc || '',
      'Designer': p.designerName || '',
      'Factory': p.factoryName || costExact?.factory || '',
      'COO': p.countryOfOrigin || costExact?.countryOfOrigin || '',
      'FOB': costExact?.fob ?? null,
      'Duty Cost': costExact?.dutyCost ?? null,
      'Tariff Cost': costExact?.tariffCost ?? null,
      'Freight Cost': costExact?.freightCost ?? null,
      'Overhead Cost': costExact?.overheadCost ?? null,
      'Landed': landed || null,
      'MSRP': msrp || null,
      'Wholesale': wholesale || null,
      'Baseline Margin': baselineMargin,
      'Avg Net Price (actual)': avgNet,
      'Weighted Margin (actual)': weightedMargin,
      'Projected Margin': projectedMargin,
      'Projection Basis': projectionBasis,
      'Units Sold': salesData?.units ?? null,
      'Revenue': salesData?.revenue ?? null,
      'Cost Source': costFallbackSeason ? `fallback:${costFallbackSeason}` : costSource,
      'Price Source': priceSource,
    });
  });

  // ── Sheet 2: Style Summary (aggregate across colors) ──
  const styleKeys = new Set<string>();
  productsFiltered.forEach((p) => styleKeys.add(`${p.styleNumber}-${p.season}`));
  const styleRows: StyleRow[] = [];

  Array.from(styleKeys).forEach((key) => {
    const [styleNumber, ...rest] = key.split('-');
    const season = rest.join('-');
    const productSample = products.find((p) => p.styleNumber === styleNumber && p.season === season);
    if (!productSample) return;

    const colorsInStyleSeason = new Set<string>();
    products.forEach((p) => {
      if (p.styleNumber === styleNumber && p.season === season && p.color) colorsInStyleSeason.add(p.color);
    });

    const costExact = costByKey.get(`${styleNumber}-${season}`);
    let landed = costExact?.landed ?? 0;
    if (!landed || landed <= 0) {
      if (canUseCostFallback(season)) {
        const result = fallbackLookup.getCostWithFallback(styleNumber, season);
        if (result.cost > 0) landed = result.cost;
        else if (productSample.cost && productSample.cost > 0) landed = productSample.cost;
      } else if (productSample.cost && productSample.cost > 0) {
        landed = productSample.cost;
      }
    }

    const pricingExact = pricingByKey.get(`${styleNumber}-${season}`);
    const msrp = productSample.msrp || pricingExact?.msrp || 0;
    const wholesale = productSample.price || pricingExact?.price || 0;

    const baselineMargin = wholesale > 0 && landed > 0 ? (wholesale - landed) / wholesale : null;

    const ss = salesByStyleSeason.get(key);
    const totalRevenue = ss?.revenue ?? 0;
    const totalUnits = ss?.units ?? 0;

    let weightedOrProjected: number | null = null;
    let isProjected = false;
    if (totalUnits > 0 && landed > 0 && totalRevenue > 0) {
      const avgNet = totalRevenue / totalUnits;
      weightedOrProjected = (avgNet - landed) / avgNet;
    } else if (!seasonsWithSales.has(season) && scenario && basisMetrics) {
      const projected = projectWeightedMargin({
        msrp,
        wholesale,
        landed,
        basisMetrics,
        effectiveMix: scenario.effectiveMix,
      });
      if (projected && projected.syntheticAvgNetPrice > 0) {
        weightedOrProjected = projected.weightedMargin / 100;
        isProjected = true;
      }
    }

    styleRows.push({
      'Style #': styleNumber,
      'Description': productSample.styleDesc || '',
      'Season': season,
      'Division': productSample.divisionDesc || '',
      'Category': productSample.categoryDesc || '',
      '# Colors': colorsInStyleSeason.size,
      'Landed': landed || null,
      'MSRP': msrp || null,
      'Wholesale': wholesale || null,
      'Baseline Margin': baselineMargin,
      'Units (all colors)': totalUnits || null,
      'Revenue (all colors)': totalRevenue || null,
      'Weighted/Projected Margin': weightedOrProjected,
      'Projected?': isProjected ? `Yes (basis: ${scenario?.basisSeason})` : '',
    });
  });

  // ── Sheet 3: Season Totals ──
  const seasonsInExport = sortSeasons(
    Array.from(new Set(productsFiltered.map((p) => p.season).filter(Boolean))),
  );
  const seasonRows: SeasonRow[] = seasonsInExport.map((season) => {
    // Aggregate across all styles/colors in this season
    let totalRevenue = 0;
    let totalLandedCost = 0;
    let totalUnitsWeighted = 0;
    let landedSum = 0;
    let landedCount = 0;
    let wholesaleSum = 0;
    let wholesaleCount = 0;
    let stylesWithCost = 0;
    const stylesInSeason = new Set<string>();
    const colorsInSeason = new Set<string>();

    productsFiltered.forEach((p) => {
      if (p.season !== season) return;
      stylesInSeason.add(p.styleNumber);
      if (p.color) colorsInSeason.add(`${p.styleNumber}-${p.color}`);
    });

    stylesInSeason.forEach((styleNumber) => {
      const sample = products.find((p) => p.styleNumber === styleNumber && p.season === season);
      if (!sample) return;

      const costExact = costByKey.get(`${styleNumber}-${season}`);
      let landed = costExact?.landed ?? 0;
      if (!landed || landed <= 0) {
        if (canUseCostFallback(season)) {
          const result = fallbackLookup.getCostWithFallback(styleNumber, season);
          if (result.cost > 0) landed = result.cost;
          else if (sample.cost && sample.cost > 0) landed = sample.cost;
        } else if (sample.cost && sample.cost > 0) {
          landed = sample.cost;
        }
      }
      if (landed > 0) {
        landedSum += landed;
        landedCount++;
        stylesWithCost++;
      }

      const pricingExact = pricingByKey.get(`${styleNumber}-${season}`);
      const wholesale = sample.price || pricingExact?.price || 0;
      if (wholesale > 0) {
        wholesaleSum += wholesale;
        wholesaleCount++;
      }

      const ss = salesByStyleSeason.get(`${styleNumber}-${season}`);
      if (ss && ss.units > 0 && landed > 0) {
        totalRevenue += ss.revenue;
        totalLandedCost += landed * ss.units;
        totalUnitsWeighted += ss.units;
      } else if (!seasonsWithSales.has(season) && wholesale > 0 && landed > 0) {
        // For forecast seasons: use projected avg net if scenario available
        if (scenario && basisMetrics) {
          const projected = projectWeightedMargin({
            msrp: sample.msrp || pricingExact?.msrp || 0,
            wholesale,
            landed,
            basisMetrics,
            effectiveMix: scenario.effectiveMix,
          });
          if (projected && projected.syntheticAvgNetPrice > 0) {
            totalRevenue += projected.syntheticAvgNetPrice;
            totalLandedCost += landed;
          } else {
            totalRevenue += wholesale;
            totalLandedCost += landed;
          }
        } else {
          totalRevenue += wholesale;
          totalLandedCost += landed;
        }
      }
    });

    const blendedMargin = totalRevenue > 0 ? (totalRevenue - totalLandedCost) / totalRevenue : null;
    const status = getSeasonStatus(season);
    const badge = getSeasonStatusBadge(status);

    return {
      'Season': season,
      'Status': badge.label,
      '# Styles': stylesInSeason.size,
      '# Colors': colorsInSeason.size,
      'Total Units': totalUnitsWeighted,
      'Total Revenue': totalRevenue,
      'Avg Landed': landedCount > 0 ? landedSum / landedCount : null,
      'Avg Wholesale': wholesaleCount > 0 ? wholesaleSum / wholesaleCount : null,
      'Blended Margin': blendedMargin,
      'Cost Coverage': stylesInSeason.size > 0 ? stylesWithCost / stylesInSeason.size : null,
    };
  });

  // ── Sheet 4: Scenario (only if active) ──
  const scenarioRows: Array<Record<string, unknown>> = [];
  if (scenario && basisMetrics) {
    const natural = computeNaturalMix(basisMetrics);
    const mixTotal = PRIMARY_CHANNELS.reduce((s, c) => s + (scenario.effectiveMix[c] ?? 0), 0);
    scenarioRows.push({ Setting: 'Basis Season', Value: scenario.basisSeason });
    scenarioRows.push({ Setting: 'Effective Mix Total', Value: mixTotal.toFixed(1) + '%' });
    scenarioRows.push({ Setting: '', Value: '' });
    scenarioRows.push({
      Setting: 'Channel',
      Value: 'Natural Mix (from basis)',
      'Effective Mix': 'Effective Mix (used)',
      'Basis Avg Net': 'Basis Avg Net Price',
      'Basis List Ratio': 'Basis Net/List Ratio',
      'Basis Units': 'Basis Units',
      'Basis Revenue': 'Basis Revenue',
    });
    PRIMARY_CHANNELS.forEach((c) => {
      const m = basisMetrics![c];
      scenarioRows.push({
        Setting: CHANNEL_LABELS[c] ?? c,
        Value: `${(natural[c] ?? 0).toFixed(1)}%`,
        'Effective Mix': `${(scenario.effectiveMix[c] ?? 0).toFixed(1)}%`,
        'Basis Avg Net': m?.avgNetPrice ?? 0,
        'Basis List Ratio': m?.listPriceRatio ?? 0,
        'Basis Units': m?.units ?? 0,
        'Basis Revenue': m?.revenue ?? 0,
      });
    });
  }

  // ── Build workbook with column widths + number formats ──
  const wb = XLSX.utils.book_new();

  const detailCols: ColSpec[] = [
    { key: 'Style #', header: 'Style #', width: 12 },
    { key: 'Description', header: 'Description', width: 30 },
    { key: 'Color Code', header: 'Color Code', width: 10 },
    { key: 'Color Desc', header: 'Color Desc', width: 20 },
    { key: 'Season', header: 'Season', width: 9 },
    { key: 'Season Status', header: 'Status', width: 11 },
    { key: 'Division', header: 'Division', width: 16 },
    { key: 'Category', header: 'Category', width: 16 },
    { key: 'Designer', header: 'Designer', width: 16 },
    { key: 'Factory', header: 'Factory', width: 14 },
    { key: 'COO', header: 'COO', width: 10 },
    { key: 'FOB', header: 'FOB', width: 10, format: FMT_CURRENCY },
    { key: 'Duty Cost', header: 'Duty Cost', width: 10, format: FMT_CURRENCY },
    { key: 'Tariff Cost', header: 'Tariff Cost', width: 11, format: FMT_CURRENCY },
    { key: 'Freight Cost', header: 'Freight', width: 10, format: FMT_CURRENCY },
    { key: 'Overhead Cost', header: 'Overhead', width: 10, format: FMT_CURRENCY },
    { key: 'Landed', header: 'Landed', width: 11, format: FMT_CURRENCY },
    { key: 'MSRP', header: 'MSRP', width: 9, format: FMT_CURRENCY },
    { key: 'Wholesale', header: 'Wholesale', width: 10, format: FMT_CURRENCY },
    { key: 'Baseline Margin', header: 'Baseline Margin', width: 12, format: FMT_PCT },
    { key: 'Avg Net Price (actual)', header: 'Avg Net (actual)', width: 13, format: FMT_CURRENCY },
    { key: 'Weighted Margin (actual)', header: 'Weighted Margin', width: 13, format: FMT_PCT },
    { key: 'Projected Margin', header: 'Projected Margin', width: 13, format: FMT_PCT },
    { key: 'Projection Basis', header: 'Projection Basis', width: 13 },
    { key: 'Units Sold', header: 'Units', width: 10, format: FMT_INT },
    { key: 'Revenue', header: 'Revenue', width: 13, format: FMT_CURRENCY },
    { key: 'Cost Source', header: 'Cost Source', width: 14 },
    { key: 'Price Source', header: 'Price Source', width: 13 },
  ];
  appendSheet(wb, 'Costing Detail', detailRows as unknown as Record<string, unknown>[], detailCols);

  const styleCols: ColSpec[] = [
    { key: 'Style #', header: 'Style #', width: 12 },
    { key: 'Description', header: 'Description', width: 30 },
    { key: 'Season', header: 'Season', width: 9 },
    { key: 'Division', header: 'Division', width: 16 },
    { key: 'Category', header: 'Category', width: 16 },
    { key: '# Colors', header: '# Colors', width: 9, format: FMT_INT },
    { key: 'Landed', header: 'Landed', width: 11, format: FMT_CURRENCY },
    { key: 'MSRP', header: 'MSRP', width: 9, format: FMT_CURRENCY },
    { key: 'Wholesale', header: 'Wholesale', width: 10, format: FMT_CURRENCY },
    { key: 'Baseline Margin', header: 'Baseline Margin', width: 12, format: FMT_PCT },
    { key: 'Units (all colors)', header: 'Units', width: 10, format: FMT_INT },
    { key: 'Revenue (all colors)', header: 'Revenue', width: 13, format: FMT_CURRENCY },
    { key: 'Weighted/Projected Margin', header: 'Weighted/Projected', width: 15, format: FMT_PCT },
    { key: 'Projected?', header: 'Projected?', width: 20 },
  ];
  appendSheet(wb, 'Style Summary', styleRows as unknown as Record<string, unknown>[], styleCols);

  const seasonCols: ColSpec[] = [
    { key: 'Season', header: 'Season', width: 9 },
    { key: 'Status', header: 'Status', width: 11 },
    { key: '# Styles', header: '# Styles', width: 10, format: FMT_INT },
    { key: '# Colors', header: '# Colors', width: 10, format: FMT_INT },
    { key: 'Total Units', header: 'Total Units', width: 12, format: FMT_INT },
    { key: 'Total Revenue', header: 'Total Revenue', width: 14, format: FMT_CURRENCY },
    { key: 'Avg Landed', header: 'Avg Landed', width: 11, format: FMT_CURRENCY },
    { key: 'Avg Wholesale', header: 'Avg Wholesale', width: 12, format: FMT_CURRENCY },
    { key: 'Blended Margin', header: 'Blended Margin', width: 13, format: FMT_PCT },
    { key: 'Cost Coverage', header: 'Cost Coverage', width: 12, format: FMT_PCT },
  ];
  appendSheet(wb, 'Season Totals', seasonRows as unknown as Record<string, unknown>[], seasonCols);

  if (scenarioRows.length > 0) {
    const scenarioCols: ColSpec[] = [
      { key: 'Setting', header: 'Setting', width: 22 },
      { key: 'Value', header: 'Value', width: 22 },
      { key: 'Effective Mix', header: 'Effective Mix', width: 18 },
      { key: 'Basis Avg Net', header: 'Basis Avg Net', width: 14, format: FMT_CURRENCY },
      { key: 'Basis List Ratio', header: 'Basis Net/List', width: 14, format: FMT_PCT },
      { key: 'Basis Units', header: 'Basis Units', width: 12, format: FMT_INT },
      { key: 'Basis Revenue', header: 'Basis Revenue', width: 14, format: FMT_CURRENCY },
    ];
    appendSheet(wb, 'Scenario', scenarioRows, scenarioCols);
  }

  // Write to disk
  const dateStr = new Date().toISOString().split('T')[0];
  XLSX.writeFile(wb, `${filename}_${dateStr}.xlsx`);
}

/**
 * Append a sheet with headers + column widths + per-column number formats,
 * and freeze the top row.
 */
function appendSheet(
  wb: XLSX.WorkBook,
  sheetName: string,
  rows: Record<string, unknown>[],
  cols: ColSpec[],
): void {
  if (rows.length === 0) return;

  // Build sheet using explicit header order so column layout matches `cols`.
  const headers = cols.map((c) => c.header);
  const keys = cols.map((c) => c.key);
  const aoa: unknown[][] = [headers];
  rows.forEach((r) => {
    aoa.push(keys.map((k) => (r[k] === undefined ? null : r[k])));
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Column widths
  ws['!cols'] = cols.map((c) => ({ wch: c.width }));

  // Freeze header row
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };
  // Some xlsx versions honor this instead:
  (ws as XLSX.WorkSheet & { '!views'?: unknown[] })['!views'] = [
    { state: 'frozen', ySplit: 1 },
  ];

  // Apply formats per column (skip header row; start at row 2 / index 1)
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
  for (let C = range.s.c; C <= range.e.c; C++) {
    const spec = cols[C];
    if (!spec?.format) continue;
    for (let R = range.s.r + 1; R <= range.e.r; R++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[addr];
      if (!cell) continue;
      // Ensure numeric type for numeric values (undefined/null stays blank)
      if (typeof cell.v === 'number') cell.t = 'n';
      cell.z = spec.format;
    }
  }

  // Bold header
  for (let C = range.s.c; C <= range.e.c; C++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c: C });
    const cell = ws[addr];
    if (!cell) continue;
    cell.s = { font: { bold: true } };
  }

  XLSX.utils.book_append_sheet(wb, ws, sheetName.substring(0, 31));
}
