'use client';

import { useState, useMemo, useEffect, useCallback, Fragment } from 'react';
import { Product, SalesRecord, PricingRecord, CostRecord, CUSTOMER_TYPE_LABELS } from '@/types/product';
import { sortSeasons } from '@/lib/store';
import { ArrowUpDown, Search, X, ChevronLeft, ChevronRight, Sparkles, Download } from 'lucide-react';
import { getCurrentShippingSeason, getSeasonStatus, getSeasonStatusBadge, getCostLabel, SeasonStatus } from '@/lib/season-utils';
import { isRelevantSeason, parseSeasonCode } from '@/utils/season';
import { formatCurrencyShort, formatCurrency, formatPercent, formatNumber } from '@/utils/format';
import { matchesDivision } from '@/utils/divisionMap';
import { cleanStyleNumber, getBaseStyleNumber, isVariantDescription, getCombineKey } from '@/utils/combineStyles';
import { buildCostFallbackLookup } from '@/utils/costFallback';
import {
  PRIMARY_CHANNELS,
  CHANNEL_LABELS,
  CHANNEL_COLORS,
  computeBasisMetrics,
  computeNaturalMix,
  projectWeightedMargin,
  type BasisMetrics,
} from '@/utils/marginScenario';
import MarginScenarioPanel from '@/components/MarginScenarioPanel';
import { exportCostingMargins } from '@/utils/exportCostingMargins';

type MetricType = 'sales' | 'units' | 'msrp' | 'cost' | 'margin';

interface SeasonViewProps {
  products: Product[];
  sales: SalesRecord[];
  pricing: PricingRecord[];
  costs: CostRecord[];
  selectedSeason?: string;
  selectedDivision: string;
  selectedCategory: string;
  searchQuery?: string;
  onStyleClick: (styleNumber: string) => void;
}

function formatValue(value: number | null, metric: MetricType): string {
  if (value === null || value === undefined) return '—';

  switch (metric) {
    case 'sales':
      return formatCurrencyShort(value);
    case 'units':
      return formatNumber(value);
    case 'msrp':
      // Remove .00 for clean whole numbers on MSRP
      if (value % 1 === 0) return `$${value.toFixed(0)}`;
      return formatCurrency(value) || '—';
    case 'cost':
      return formatCurrency(value) || '—';
    case 'margin':
      return formatPercent(value);
    default:
      return String(value);
  }
}

function pctChange(current: number, prior: number): number | null {
  if (prior === 0 && current === 0) return null;
  if (prior === 0) return null;
  return ((current - prior) / Math.abs(prior)) * 100;
}

function deltaColor(pct: number | null): string {
  if (pct === null) return 'text-text-muted';
  if (pct > 5) return 'text-emerald-400';
  if (pct < -5) return 'text-red-400';
  return 'text-text-muted';
}

function fmtDelta(pct: number | null): string {
  if (pct === null) return '';
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(0)}%`;
}

export default function SeasonView({
  products,
  sales,
  pricing,
  costs,
  selectedSeason: globalSeason = '',
  selectedDivision,
  selectedCategory,
  searchQuery: globalSearchQuery,
  onStyleClick,
}: SeasonViewProps) {
  const [metric, setMetric] = useState<MetricType>('sales');
  const [sortColumn, setSortColumn] = useState<string>('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [combineStyles, setCombineStyles] = useState(false);
  const [expandedStyles, setExpandedStyles] = useState<Set<string>>(new Set());
  const [totalsMode, setTotalsMode] = useState<'blended' | 'sum'>('blended');

  const toggleExpand = useCallback((styleNumber: string) => {
    setExpandedStyles((prev) => {
      const next = new Set(prev);
      if (next.has(styleNumber)) next.delete(styleNumber);
      else next.add(styleNumber);
      return next;
    });
  }, []);

  // Local filters
  const [selectedSeasons, setSelectedSeasons] = useState<string[]>([]);
  const [styleNumberFilter, setStyleNumberFilter] = useState<string>('');
  const [styleNameFilter, setStyleNameFilter] = useState<string>('');
  const [selectedDesigner, setSelectedDesigner] = useState<string>('');
  const [selectedCustomerType, setSelectedCustomerType] = useState<string>('');
  const [selectedCustomer, setSelectedCustomer] = useState<string>('');
  const [localGenderFilter, setLocalGenderFilter] = useState<string>('');
  const [localCategoryFilter, setLocalCategoryFilter] = useState<string>('');
  const [sortBy, setSortBy] = useState<'revenue' | 'units' | 'styles' | 'price' | ''>('');

  // Sync global FilterBar season → local selectedSeasons
  useEffect(() => {
    if (!globalSeason) return;
    const seasonSet = new Set<string>();
    products.forEach(p => p.season && seasonSet.add(p.season));
    sales.forEach(s => s.season && seasonSet.add(s.season));
    const all = sortSeasons(Array.from(seasonSet));
    if (globalSeason === '__ALL_SP__') {
      setSelectedSeasons(all.filter(s => s.endsWith('SP')));
    } else if (globalSeason === '__ALL_FA__') {
      setSelectedSeasons(all.filter(s => s.endsWith('FA')));
    } else if (all.includes(globalSeason)) {
      setSelectedSeasons([globalSeason]);
    }
  }, [globalSeason, products, sales]);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;

  // Reset to page 1 and collapse expanded rows when filters or metric change
  useEffect(() => { setCurrentPage(1); setExpandedStyles(new Set()); }, [metric, selectedSeasons, styleNumberFilter, styleNameFilter, selectedDesigner, selectedCustomerType, selectedCustomer, localGenderFilter, localCategoryFilter, sortBy, combineStyles]);

  // Toggle a season in the selection
  const toggleSeason = (season: string) => {
    setSelectedSeasons((prev) =>
      prev.includes(season)
        ? prev.filter((s) => s !== season)
        : [...prev, season]
    );
  };

  // Select all Spring or all Fall seasons
  const selectSeasonType = (type: 'SP' | 'FA') => {
    const matching = seasons.filter((s) => s.endsWith(type));
    const allSelected = matching.every((s) => selectedSeasons.includes(s));
    if (allSelected) {
      // Deselect all of this type
      setSelectedSeasons((prev) => prev.filter((s) => !s.endsWith(type)));
    } else {
      // Select all of this type
      setSelectedSeasons((prev) => {
        const others = prev.filter((s) => !s.endsWith(type));
        return [...others, ...matching];
      });
    }
  };

  // Get seasons from actual data (products, sales, pricing, costs)
  // Only show seasons 24-27 (hide old seasons 10-23)
  const seasons = useMemo(() => {
    const allSeasons = new Set<string>();
    products.forEach((p) => p.season && allSeasons.add(p.season));
    sales.forEach((s) => s.season && allSeasons.add(s.season));
    pricing.forEach((p) => p.season && allSeasons.add(p.season));
    costs.forEach((c) => c.season && allSeasons.add(c.season));

    // Filter to only show relevant seasons (current ± a few years)
    const recentSeasons = Array.from(allSeasons).filter((s) => isRelevantSeason(s));
    return sortSeasons(recentSeasons);
  }, [products, sales, pricing, costs]);

  // Seasons with actual sales data (used to decide which columns are forecasts)
  const seasonsWithSales = useMemo(() => {
    const s = new Set<string>();
    sales.forEach((r) => r.season && s.add(r.season));
    return s;
  }, [sales]);

  // Prior-season cost fallback is disabled for PLANNING and PRE-BOOK seasons.
  // For those seasons, the user has explicitly asked that costing come from
  // the Landed Sheet only — showing a carried-forward prior cost would
  // imply we have costing we don't actually have.
  const canUseCostFallback = useCallback((season: string): boolean => {
    const status = getSeasonStatus(season);
    return status !== 'PLANNING' && status !== 'PRE-BOOK';
  }, []);

  // ── Scenario state for projecting forecast-season margins ──
  // Only meaningful when metric === 'margin' and a forecast season is in view.
  const [scenarioBasisSeason, setScenarioBasisSeason] = useState<string | null>(null);
  const [scenarioMixOverride, setScenarioMixOverride] = useState<Record<string, number> | null>(null);

  const basisMetrics: BasisMetrics = useMemo(
    () => computeBasisMetrics(sales, products, scenarioBasisSeason),
    [sales, products, scenarioBasisSeason],
  );
  const naturalMix = useMemo(() => computeNaturalMix(basisMetrics), [basisMetrics]);
  const effectiveMix = useMemo(
    () => scenarioMixOverride ?? naturalMix,
    [scenarioMixOverride, naturalMix],
  );
  const scenarioActive = metric === 'margin' && scenarioBasisSeason !== null;

  // Get unique designers
  const designers = useMemo(() => {
    const all = new Set<string>();
    products.forEach((p) => p.designerName && all.add(p.designerName));
    return Array.from(all).sort();
  }, [products]);

  // Get unique genders from divisions
  const genders = useMemo(() => {
    const all = new Set<string>();
    products.forEach((p) => {
      if (p.divisionDesc) {
        const lower = p.divisionDesc.toLowerCase();
        if (lower.includes("women") || lower.includes("woman")) all.add("Women's");
        else if (lower.includes("men")) all.add("Men's");
        else if (lower.includes("unisex")) all.add("Unisex");
      }
    });
    sales.forEach((s) => {
      if (s.divisionDesc) {
        const lower = s.divisionDesc.toLowerCase();
        if (lower.includes("women") || lower.includes("woman")) all.add("Women's");
        else if (lower.includes("men")) all.add("Men's");
        else if (lower.includes("unisex")) all.add("Unisex");
      }
    });
    return Array.from(all).sort();
  }, [products, sales]);

  // Get unique categories
  const categories = useMemo(() => {
    const all = new Set<string>();
    products.forEach((p) => p.categoryDesc && all.add(p.categoryDesc));
    sales.forEach((s) => s.categoryDesc && all.add(s.categoryDesc));
    return Array.from(all).sort();
  }, [products, sales]);

  // Hardcoded list of 6 individual channels (not derived from data which has combinations)
  const customerTypes = ['WH', 'BB', 'WD', 'EC', 'PS', 'KI'];

  // Get unique customers
  const customers = useMemo(() => {
    const all = new Set<string>();
    sales.forEach((s) => s.customer && all.add(s.customer));
    return Array.from(all).sort();
  }, [sales]);

  // Get unique styles from ALL sources (products, sales, pricing, costs)
  const filteredStyles = useMemo(() => {
    const styleMap = new Map<string, { styleNumber: string; styleDesc: string; designerName: string; divisionDesc: string; categoryDesc: string; variantStyles?: Array<{ styleNumber: string; styleDesc: string }>; allStyleNumbers?: string[] }>();

    // 1st: Add styles from products (Line List) - has most metadata
    products.forEach((p) => {
      const cleanedStyle = cleanStyleNumber(p.styleNumber);
      if (!styleMap.has(cleanedStyle)) {
        styleMap.set(cleanedStyle, {
          styleNumber: cleanedStyle,
          styleDesc: p.styleDesc || '',
          designerName: p.designerName || '',
          divisionDesc: p.divisionDesc || '',
          categoryDesc: p.categoryDesc || '',
        });
      }
    });

    // 2nd: Add styles from pricing that might not be in products
    pricing.forEach((p) => {
      const cleanedStyle = cleanStyleNumber(p.styleNumber);
      if (!styleMap.has(cleanedStyle)) {
        styleMap.set(cleanedStyle, {
          styleNumber: cleanedStyle,
          styleDesc: p.styleDesc || '',
          designerName: '',
          divisionDesc: '',
          categoryDesc: '',
        });
      }
    });

    // 3rd: Add styles from sales that might not be in products or pricing
    sales.forEach((s) => {
      const cleanedStyle = cleanStyleNumber(s.styleNumber);
      if (!styleMap.has(cleanedStyle)) {
        styleMap.set(cleanedStyle, {
          styleNumber: cleanedStyle,
          styleDesc: s.styleDesc || '',
          designerName: '',
          divisionDesc: s.divisionDesc || '',
          categoryDesc: s.categoryDesc || '',
        });
      }
    });

    // 4th: Add styles from costs that might not exist elsewhere
    costs.forEach((c) => {
      const cleanedStyle = cleanStyleNumber(c.styleNumber);
      if (!styleMap.has(cleanedStyle)) {
        styleMap.set(cleanedStyle, {
          styleNumber: cleanedStyle,
          styleDesc: c.styleName || '',
          designerName: '',
          divisionDesc: '',
          categoryDesc: '',
        });
      }
    });

    // Apply filters first
    const filtered = Array.from(styleMap.values()).filter((style) => {
      if (selectedDivision && !matchesDivision(style.divisionDesc, selectedDivision)) return false;
      if (selectedCategory && style.categoryDesc !== selectedCategory) return false;
      if (localCategoryFilter && style.categoryDesc !== localCategoryFilter) return false;
      if (localGenderFilter) {
        const lower = style.divisionDesc?.toLowerCase() || '';
        if (localGenderFilter === "Men's" && !(lower.includes("men") && !lower.includes("women"))) return false;
        if (localGenderFilter === "Women's" && !(lower.includes("women") || lower.includes("woman"))) return false;
        if (localGenderFilter === "Unisex" && !lower.includes("unisex")) return false;
      }
      if (selectedDesigner && style.designerName !== selectedDesigner) return false;
      if (styleNumberFilter && !style.styleNumber.toLowerCase().includes(styleNumberFilter.toLowerCase())) return false;
      if (styleNameFilter && !style.styleDesc?.toLowerCase().includes(styleNameFilter.toLowerCase())) return false;
      if (globalSearchQuery) {
        const q = globalSearchQuery.toLowerCase();
        if (!style.styleNumber.toLowerCase().includes(q) && !(style.styleDesc || '').toLowerCase().includes(q)) return false;
      }
      return true;
    });

    // If combining styles, group by program name (extracted from styleDesc)
    // This merges different silhouettes (Jacket, Trench, Vest) AND size variants (R, X, T)
    if (combineStyles) {
      const combinedMap = new Map<string, { styleNumber: string; styleDesc: string; designerName: string; divisionDesc: string; categoryDesc: string; variantStyles: Array<{ styleNumber: string; styleDesc: string }>; allStyleNumbers: string[] }>();

      filtered.forEach((style) => {
        const programKey = getCombineKey(style.styleNumber);

        const existing = combinedMap.get(programKey);
        if (existing) {
          // Track all style numbers for data aggregation
          if (!existing.allStyleNumbers.includes(style.styleNumber)) {
            existing.allStyleNumbers.push(style.styleNumber);
          }
          // Add to variants list
          existing.variantStyles.push({
            styleNumber: style.styleNumber,
            styleDesc: style.styleDesc || '',
          });
          // Prefer non-variant metadata (shorter desc = usually the base)
          if (!isVariantDescription(style.styleDesc) && isVariantDescription(existing.styleDesc)) {
            existing.styleDesc = style.styleDesc || existing.styleDesc;
            existing.designerName = style.designerName || existing.designerName;
            existing.divisionDesc = style.divisionDesc || existing.divisionDesc;
            existing.categoryDesc = style.categoryDesc || existing.categoryDesc;
          }
        } else {
          combinedMap.set(programKey, {
            styleNumber: style.styleNumber,
            styleDesc: style.styleDesc,
            designerName: style.designerName,
            divisionDesc: style.divisionDesc,
            categoryDesc: style.categoryDesc,
            variantStyles: [],
            allStyleNumbers: [style.styleNumber],
          });
        }
      });

      return Array.from(combinedMap.values());
    }

    return filtered;
  }, [products, sales, pricing, costs, selectedDivision, selectedCategory, localGenderFilter, localCategoryFilter, selectedDesigner, styleNumberFilter, styleNameFilter, combineStyles, globalSearchQuery]);

  // Helper: get the combine/lookup key for a style number
  // When combining: uses base style number (strips R/X/T) to group size variants
  // When not combining: uses cleaned style number as-is
  function getStyleKey(styleNumber: string): string {
    const cleaned = cleanStyleNumber(styleNumber);
    if (!combineStyles) return cleaned;
    return getCombineKey(styleNumber);
  }

  // Build lookup maps for quick access using WATERFALL LOGIC
  // Pricing: 1st pricebyseason → 2nd Line List → 3rd Sales (calculated)
  // Costs: 1st Landed Sheet → 2nd Line List
  const dataLookups = useMemo(() => {
    // Sales by style+season
    const salesByStyleSeason = new Map<string, { revenue: number; units: number }>();
    sales.forEach((s) => {
      if (selectedCustomerType && !s.customerType?.includes(selectedCustomerType)) return;
      if (selectedCustomer && s.customer !== selectedCustomer) return;
      if (selectedSeasons.length > 0 && !selectedSeasons.includes(s.season)) return;

      // Clean style number and use base style number if combining styles
      const styleKey = getStyleKey(s.styleNumber);
      const key = `${styleKey}-${s.season}`;
      const existing = salesByStyleSeason.get(key);
      if (existing) {
        existing.revenue += s.revenue || 0;
        existing.units += s.unitsBooked || 0;
      } else {
        salesByStyleSeason.set(key, {
          revenue: s.revenue || 0,
          units: s.unitsBooked || 0,
        });
      }
    });

    // PRICING WATERFALL FOR MSRP & WHOLESALE ONLY:
    // 1st: pricebyseason (Pricing table)
    // 2nd: Sales table
    // 3rd: Line List (Products table)
    type PricingSource = 'pricebyseason' | 'sales' | 'linelist' | 'none';
    const pricingByStyleSeason = new Map<string, { msrp: number; wholesale: number; source: PricingSource }>();

    // 1st Priority: pricebyseason file (Pricing table)
    pricing.forEach((p) => {
      if (selectedSeasons.length > 0 && !selectedSeasons.includes(p.season)) return;
      const styleKey = getStyleKey(p.styleNumber);
      const key = `${styleKey}-${p.season}`;
      if (p.msrp > 0 || p.price > 0) {
        // For combined styles, keep the first pricing found (or could average later)
        if (!pricingByStyleSeason.has(key)) {
          pricingByStyleSeason.set(key, { msrp: p.msrp, wholesale: p.price, source: 'pricebyseason' });
        }
      }
    });

    // 2nd Priority: Sales table (only if not already set from pricing)
    sales.forEach((s) => {
      if (selectedSeasons.length > 0 && !selectedSeasons.includes(s.season)) return;
      const styleKey = getStyleKey(s.styleNumber);
      const key = `${styleKey}-${s.season}`;
      if (!pricingByStyleSeason.has(key) && ((s.msrp && s.msrp > 0) || (s.wholesalePrice && s.wholesalePrice > 0))) {
        pricingByStyleSeason.set(key, {
          msrp: s.msrp || 0,
          wholesale: s.wholesalePrice || 0,
          source: 'sales'
        });
      }
    });

    // 3rd Priority: Line List / Products table (only if not already set)
    products.forEach((p) => {
      if (!p.season) return;
      if (selectedSeasons.length > 0 && !selectedSeasons.includes(p.season)) return;
      const styleKey = getStyleKey(p.styleNumber);
      const key = `${styleKey}-${p.season}`;
      if (!pricingByStyleSeason.has(key) && (p.msrp > 0 || p.price > 0)) {
        pricingByStyleSeason.set(key, { msrp: p.msrp, wholesale: p.price, source: 'linelist' });
      }
    });

    // Fallback: Calculate implied wholesale from revenue/units if still no pricing
    salesByStyleSeason.forEach((salesData, key) => {
      if (!pricingByStyleSeason.has(key) && salesData.units > 0) {
        const impliedWholesale = salesData.revenue / salesData.units;
        pricingByStyleSeason.set(key, { msrp: 0, wholesale: impliedWholesale, source: 'sales' });
      }
    });

    // COST WATERFALL: Landed Sheet → Line List → Prior-season fallback
    type CostSource = 'landed_sheet' | 'linelist' | 'fallback' | 'none';
    const costsByStyleSeason = new Map<string, { landed: number; fob: number; source: CostSource; fallbackSeason?: string }>();

    // 1st Priority: Landed Request Sheet
    costs.forEach((c) => {
      if (selectedSeasons.length > 0 && !selectedSeasons.includes(c.season)) return;
      const styleKey = getStyleKey(c.styleNumber);
      const key = `${styleKey}-${c.season}`;
      if ((c.landed > 0 || c.fob > 0) && !costsByStyleSeason.has(key)) {
        costsByStyleSeason.set(key, { landed: c.landed, fob: c.fob, source: 'landed_sheet' });
      }
    });

    // 2nd Priority: Line List costs (only if not already set)
    products.forEach((p) => {
      if (!p.season) return;
      if (selectedSeasons.length > 0 && !selectedSeasons.includes(p.season)) return;
      const styleKey = getStyleKey(p.styleNumber);
      const key = `${styleKey}-${p.season}`;
      if (!costsByStyleSeason.has(key) && p.cost > 0) {
        costsByStyleSeason.set(key, { landed: p.cost, fob: 0, source: 'linelist' });
      }
    });

    // 3rd Priority: Fallback from prior seasons. Build the fallback lookup from
    // ALL costs/products (not season-filtered) so we can reach back to any prior season.
    const fallbackLookup = buildCostFallbackLookup(
      costs,
      products.filter(p => p.season && p.cost > 0).map(p => ({
        styleNumber: getStyleKey(p.styleNumber),
        season: p.season,
        cost: p.cost,
      })),
    );

    // Track which styles have data for each season (for filtering)
    const stylesWithDataBySeason = new Map<string, Set<string>>();
    seasons.forEach((season) => {
      stylesWithDataBySeason.set(season, new Set());
    });

    // Mark styles that have sales
    salesByStyleSeason.forEach((_, key) => {
      const [styleNumber, season] = key.split('-');
      stylesWithDataBySeason.get(season)?.add(styleNumber);
    });

    // Mark styles that have pricing
    pricingByStyleSeason.forEach((_, key) => {
      const [styleNumber, season] = key.split('-');
      stylesWithDataBySeason.get(season)?.add(styleNumber);
    });

    // Mark styles that have costs
    costsByStyleSeason.forEach((_, key) => {
      const [styleNumber, season] = key.split('-');
      stylesWithDataBySeason.get(season)?.add(styleNumber);
    });

    return { salesByStyleSeason, pricingByStyleSeason, costsByStyleSeason, stylesWithDataBySeason, fallbackLookup };
  }, [sales, pricing, costs, products, selectedCustomerType, selectedCustomer, selectedSeasons, seasons, combineStyles]);

  // Build pivot data
  const pivotData = useMemo(() => {
    return filteredStyles.map((style) => {
      const seasonData: Record<string, number | null> = {};
      const seasonSources: Record<string, string> = {};

      // When combining, lookup by base style number (same key used in dataLookups)
      const lookupKey = getStyleKey(style.styleNumber);

      seasons.forEach((season) => {
        const key = `${lookupKey}-${season}`;
        const salesData = dataLookups.salesByStyleSeason.get(key);
        const pricingData = dataLookups.pricingByStyleSeason.get(key);
        let costData = dataLookups.costsByStyleSeason.get(key);

        // Prior-season fallback: if this season has no cost, try the most
        // recent prior season — BUT only for historical/shipping seasons.
        // PLANNING / PRE-BOOK must source from the Landed Sheet or nothing.
        if ((!costData || !costData.landed || costData.landed <= 0) && canUseCostFallback(season)) {
          const fallback = dataLookups.fallbackLookup.getCostWithFallback(lookupKey, season);
          if (fallback.source === 'fallback' && fallback.cost > 0) {
            costData = {
              landed: fallback.cost,
              fob: 0,
              source: 'fallback',
              fallbackSeason: fallback.fallbackSeason,
            };
          }
        }

        let value: number | null = null;
        let source = '';

        switch (metric) {
          case 'sales':
            value = salesData?.revenue || null;
            source = salesData ? 'sales' : '';
            break;
          case 'units':
            value = salesData?.units || null;
            source = salesData ? 'sales' : '';
            break;
          case 'msrp':
            value = pricingData?.msrp || null;
            source = pricingData?.source || '';
            break;
          case 'cost':
            value = costData?.landed || null;
            source = costData?.source || '';
            if (costData?.source === 'fallback' && costData.fallbackSeason) {
              source = `fallback:${costData.fallbackSeason}`;
            }
            break;
          case 'margin': {
            const isForecast = scenarioActive && !seasonsWithSales.has(season);
            if (
              isForecast &&
              pricingData?.wholesale &&
              pricingData.wholesale > 0 &&
              costData?.landed &&
              costData.landed > 0
            ) {
              // Project weighted margin from basis season's channel ratios + user mix
              const projected = projectWeightedMargin({
                msrp: pricingData.msrp ?? 0,
                wholesale: pricingData.wholesale,
                landed: costData.landed,
                basisMetrics,
                effectiveMix,
              });
              if (projected && projected.syntheticAvgNetPrice > 0) {
                value = projected.weightedMargin;
                source = `projected:${scenarioBasisSeason}`;
              } else {
                // Fall back to baseline margin if projection not computable
                value = ((pricingData.wholesale - costData.landed) / pricingData.wholesale) * 100;
                source = `${pricingData.source}/${costData.source}`;
              }
            } else if (pricingData?.wholesale && pricingData.wholesale > 0 && costData?.landed) {
              value = ((pricingData.wholesale - costData.landed) / pricingData.wholesale) * 100;
              source = `${pricingData.source}/${costData.source}`;
            } else if (salesData && salesData.revenue > 0 && costData?.landed) {
              // Fallback to sales-based margin
              const totalCost = costData.landed * salesData.units;
              value = ((salesData.revenue - totalCost) / salesData.revenue) * 100;
              source = `sales/${costData.source}`;
            }
            if (costData?.source === 'fallback' && costData.fallbackSeason && value !== null) {
              source = `${source}|fallback:${costData.fallbackSeason}`;
            }
            break;
          }
        }

        seasonData[season] = value;
        seasonSources[season] = source;
      });

      // Calculate per-season deltas (each season vs prior same-type season)
      const seasonDeltas: Record<string, number | null> = {};
      const seasonIsNew: Record<string, boolean> = {};

      seasons.forEach((season) => {
        const parsed = parseSeasonCode(season);
        if (!parsed) return;
        // Find the prior same-type season from all seasons (not just displayed)
        const sameType = seasons.filter((s) => {
          const p = parseSeasonCode(s);
          return p && p.type === parsed.type;
        });
        const idx = sameType.indexOf(season);
        const priorSeason = idx > 0 ? sameType[idx - 1] : null;

        const curVal = seasonData[season];
        const priorVal = priorSeason ? seasonData[priorSeason] : null;

        if (curVal !== null && priorVal !== null) {
          seasonDeltas[season] = pctChange(curVal, priorVal);
        } else if (curVal !== null && priorSeason && priorVal === null) {
          seasonIsNew[season] = true;
          seasonDeltas[season] = null;
        } else {
          seasonDeltas[season] = null;
        }
      });

      return {
        ...style,
        seasonData,
        seasonSources,
        seasonDeltas,
        seasonIsNew,
      };
    });
  }, [
    filteredStyles,
    seasons,
    metric,
    dataLookups,
    combineStyles,
    canUseCostFallback,
    // Scenario inputs (only used when metric === 'margin' on forecast columns)
    scenarioActive,
    scenarioBasisSeason,
    seasonsWithSales,
    basisMetrics,
    effectiveMix,
  ]);

  // Filter to show only styles with data for the CURRENT METRIC in displayed seasons
  const relevantPivotData = useMemo(() => {
    // Determine which seasons to display
    const seasonsToDisplay = selectedSeasons.length > 0
      ? sortSeasons(selectedSeasons)
      : seasons;

    // Filter styles that have at least one non-null value for the current metric
    return pivotData.filter((row) => {
      return seasonsToDisplay.some((season) => {
        const value = row.seasonData[season];
        return value !== null && value !== undefined;
      });
    });
  }, [pivotData, seasons, selectedSeasons]);

  // Sort data
  const sortedData = useMemo(() => {
    // If sortBy filter is set, use it for sorting
    if (sortBy) {
      return [...relevantPivotData].sort((a, b) => {
        let aVal = 0;
        let bVal = 0;

        if (sortBy === 'price') {
          // For price, calculate average MSRP across seasons
          // Note: We need to access the actual MSRP data, not the current metric view
          let aTotal = 0;
          let aCount = 0;
          let bTotal = 0;
          let bCount = 0;

          // Access the style's MSRP data directly from dataLookups
          seasons.forEach((season) => {
            const aStyleKey = `${a.styleNumber}-${season}`;
            const bStyleKey = `${b.styleNumber}-${season}`;
            const aPricing = dataLookups.pricingByStyleSeason.get(aStyleKey);
            const bPricing = dataLookups.pricingByStyleSeason.get(bStyleKey);

            if (aPricing && aPricing.msrp > 0) {
              aTotal += aPricing.msrp;
              aCount += 1;
            }
            if (bPricing && bPricing.msrp > 0) {
              bTotal += bPricing.msrp;
              bCount += 1;
            }
          });

          aVal = aCount > 0 ? aTotal / aCount : 0;
          bVal = bCount > 0 ? bTotal / bCount : 0;

          // If one has no price and the other does, prioritize the one with price
          if (aVal === 0 && bVal > 0) return 1; // a goes to bottom
          if (bVal === 0 && aVal > 0) return -1; // b goes to bottom
        } else if (sortBy === 'revenue') {
          // For revenue, sum sales across seasons (from sales data)
          seasons.forEach((season) => {
            const aKey = `${a.styleNumber}-${season}`;
            const bKey = `${b.styleNumber}-${season}`;
            const aSales = dataLookups.salesByStyleSeason.get(aKey);
            const bSales = dataLookups.salesByStyleSeason.get(bKey);
            aVal += aSales?.revenue || 0;
            bVal += bSales?.revenue || 0;
          });
        } else if (sortBy === 'units') {
          // For units, sum units across seasons (from sales data)
          seasons.forEach((season) => {
            const aKey = `${a.styleNumber}-${season}`;
            const bKey = `${b.styleNumber}-${season}`;
            const aSales = dataLookups.salesByStyleSeason.get(aKey);
            const bSales = dataLookups.salesByStyleSeason.get(bKey);
            aVal += aSales?.units || 0;
            bVal += bSales?.units || 0;
          });
        } else if (sortBy === 'styles') {
          // For styles, count how many seasons the style appears in
          seasons.forEach((season) => {
            const aKey = `${a.styleNumber}-${season}`;
            const bKey = `${b.styleNumber}-${season}`;
            const aSales = dataLookups.salesByStyleSeason.get(aKey);
            const bSales = dataLookups.salesByStyleSeason.get(bKey);
            const aPricing = dataLookups.pricingByStyleSeason.get(aKey);
            const bPricing = dataLookups.pricingByStyleSeason.get(bKey);
            const aCost = dataLookups.costsByStyleSeason.get(aKey);
            const bCost = dataLookups.costsByStyleSeason.get(bKey);

            // Count if style has any data in this season
            if (aSales || aPricing || aCost) aVal += 1;
            if (bSales || bPricing || bCost) bVal += 1;
          });
        }

        return bVal - aVal; // Descending order
      });
    }

    if (!sortColumn) {
      // Default sort: by last season descending
      const lastSeason = seasons[seasons.length - 1];
      return [...relevantPivotData].sort((a, b) => {
        const aVal = a.seasonData[lastSeason] || 0;
        const bVal = b.seasonData[lastSeason] || 0;
        return bVal - aVal;
      });
    }

    return [...relevantPivotData].sort((a, b) => {
      let aVal: number | string = 0;
      let bVal: number | string = 0;

      if (sortColumn === 'style') {
        aVal = a.styleNumber;
        bVal = b.styleNumber;
      } else {
        aVal = a.seasonData[sortColumn] || 0;
        bVal = b.seasonData[sortColumn] || 0;
      }

      if (sortDir === 'asc') {
        return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      }
      return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
    });
  }, [relevantPivotData, sortColumn, sortDir, seasons, sortBy, metric, dataLookups]);

  // Calculate totals
  const totals = useMemo(() => {
    const seasonTotals: Record<string, number> = {};

    seasons.forEach((season) => {
      let total = 0;
      relevantPivotData.forEach((row) => {
        total += row.seasonData[season] || 0;
      });
      seasonTotals[season] = total;
    });

    // Calculate per-season deltas for totals (same-type comparison)
    const totalDeltas: Record<string, number | null> = {};
    seasons.forEach((season) => {
      const parsed = parseSeasonCode(season);
      if (!parsed) return;
      const sameType = seasons.filter((s) => {
        const p = parseSeasonCode(s);
        return p && p.type === parsed.type;
      });
      const idx = sameType.indexOf(season);
      const priorSeason = idx > 0 ? sameType[idx - 1] : null;

      if (priorSeason && seasonTotals[priorSeason] !== 0) {
        totalDeltas[season] = pctChange(seasonTotals[season], seasonTotals[priorSeason]);
      } else {
        totalDeltas[season] = null;
      }
    });

    // Blended (revenue-weighted) margin totals per season
    const blendedTotals: Record<string, number> = {};
    // Cost coverage per season: how many styles in the pivot are missing landed cost
    const coverageBySeason: Record<string, { withCost: number; total: number }> = {};
    if (metric === 'margin') {
      seasons.forEach((season) => {
        let totalRevenue = 0;
        let totalLandedCost = 0;
        let stylesWithCost = 0;
        let stylesInSeason = 0;

        relevantPivotData.forEach((row) => {
          const key = `${row.styleNumber}-${season}`;
          const salesData = dataLookups.salesByStyleSeason.get(key);
          const pricingData = dataLookups.pricingByStyleSeason.get(key);
          let costData = dataLookups.costsByStyleSeason.get(key);

          // Apply prior-season fallback if no exact match — but not for
          // PLANNING / PRE-BOOK seasons (Landed Sheet only).
          if ((!costData?.landed || costData.landed <= 0) && canUseCostFallback(season)) {
            const fallback = dataLookups.fallbackLookup.getCostWithFallback(row.styleNumber, season);
            if (fallback.source === 'fallback' && fallback.cost > 0) {
              costData = { landed: fallback.cost, fob: 0, source: 'fallback', fallbackSeason: fallback.fallbackSeason };
            }
          }

          // Count styles that have any data for this season (sales or pricing)
          const hasData = (salesData && (salesData.revenue > 0 || salesData.units > 0))
            || (pricingData && pricingData.wholesale > 0);
          if (hasData) stylesInSeason++;

          if (!costData?.landed || costData.landed <= 0) return;
          if (hasData) stylesWithCost++;

          const isForecast = scenarioActive && !seasonsWithSales.has(season);

          if (salesData && salesData.revenue > 0 && salesData.units > 0) {
            // Use actual revenue and actual cost (landed × units)
            totalRevenue += salesData.revenue;
            totalLandedCost += costData.landed * salesData.units;
          } else if (
            isForecast &&
            pricingData?.wholesale &&
            pricingData.wholesale > 0
          ) {
            // No sales yet — project this style's contribution using the
            // chosen basis season's per-channel ratios + user mix.
            const projected = projectWeightedMargin({
              msrp: pricingData.msrp ?? 0,
              wholesale: pricingData.wholesale,
              landed: costData.landed,
              basisMetrics,
              effectiveMix,
            });
            if (projected && projected.syntheticAvgNetPrice > 0) {
              totalRevenue += projected.syntheticAvgNetPrice;
              totalLandedCost += costData.landed;
            } else {
              totalRevenue += pricingData.wholesale;
              totalLandedCost += costData.landed;
            }
          } else if (pricingData?.wholesale && pricingData.wholesale > 0) {
            // No sales data — use wholesale as a proxy (weight = 1 unit)
            totalRevenue += pricingData.wholesale;
            totalLandedCost += costData.landed;
          }
        });

        blendedTotals[season] = totalRevenue > 0
          ? ((totalRevenue - totalLandedCost) / totalRevenue) * 100
          : 0;
        coverageBySeason[season] = { withCost: stylesWithCost, total: stylesInSeason };
      });
    }

    // Deltas for blended totals
    const blendedDeltas: Record<string, number | null> = {};
    if (metric === 'margin') {
      seasons.forEach((season) => {
        const parsed = parseSeasonCode(season);
        if (!parsed) return;
        const sameType = seasons.filter((s) => {
          const p = parseSeasonCode(s);
          return p && p.type === parsed.type;
        });
        const idx = sameType.indexOf(season);
        const priorSeason = idx > 0 ? sameType[idx - 1] : null;

        if (priorSeason && blendedTotals[priorSeason] !== 0) {
          blendedDeltas[season] = pctChange(blendedTotals[season], blendedTotals[priorSeason]);
        } else {
          blendedDeltas[season] = null;
        }
      });
    }

    return { seasonTotals, totalDeltas, blendedTotals, blendedDeltas, coverageBySeason };
  }, [
    relevantPivotData,
    seasons,
    metric,
    dataLookups,
    canUseCostFallback,
    // Scenario inputs (only used when projecting forecast-season blended totals)
    scenarioActive,
    seasonsWithSales,
    basisMetrics,
    effectiveMix,
  ]);

  // Seasons to display (filtered if seasons are selected)
  const displaySeasons = useMemo(() => {
    if (selectedSeasons.length > 0) {
      return sortSeasons(selectedSeasons);
    }
    return seasons;
  }, [seasons, selectedSeasons]);

  // ── Forecast column plumbing (needs displaySeasons) ──
  const displayedForecastSeasons = useMemo(
    () => displaySeasons.filter((s) => !seasonsWithSales.has(s)),
    [displaySeasons, seasonsWithSales],
  );
  const hasForecastColumn = displayedForecastSeasons.length > 0;

  // Basis candidates = past seasons that have real sales, most recent first.
  const availableBasisSeasons = useMemo(() => {
    return sortSeasons(Array.from(seasonsWithSales).filter((s) => isRelevantSeason(s))).reverse();
  }, [seasonsWithSales]);

  // Auto-pick a default basis when a forecast column + margin metric enters
  // view; clear it out otherwise.
  useEffect(() => {
    const relevant = metric === 'margin' && hasForecastColumn;
    if (!relevant) {
      if (scenarioBasisSeason !== null) setScenarioBasisSeason(null);
      if (scenarioMixOverride !== null) setScenarioMixOverride(null);
      return;
    }
    if (scenarioBasisSeason === null && availableBasisSeasons.length > 0) {
      setScenarioBasisSeason(availableBasisSeasons[0]);
      setScenarioMixOverride(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metric, hasForecastColumn, availableBasisSeasons]);

  // Color data for expanded styles — lazily computed only for expanded rows
  // Merges product records AND sales records to build complete season presence
  const colorsByStyleSeason = useMemo(() => {
    if (expandedStyles.size === 0) return new Map<string, Array<{
      color: string; colorDesc: string; colorSeason: string;
      status: 'Active' | 'Discontinued'; webAvailable: boolean;
      seasonPresence: Set<string>;
    }>>();

    const map = new Map<string, Array<{
      color: string; colorDesc: string; colorSeason: string;
      status: 'Active' | 'Discontinued'; webAvailable: boolean;
      seasonPresence: Set<string>;
    }>>();

    expandedStyles.forEach((styleNumber) => {
      // Handle combine-styles mode: gather products for all variant style numbers
      const styleNumbers: string[] = combineStyles
        ? products
            .filter(p => getCombineKey(p.styleNumber) === getCombineKey(styleNumber))
            .map(p => cleanStyleNumber(p.styleNumber))
            .filter((sn, i, arr) => arr.indexOf(sn) === i)
        : [cleanStyleNumber(styleNumber)];

      const relevantProducts = products.filter(p =>
        styleNumbers.includes(cleanStyleNumber(p.styleNumber))
      );

      // Build color list with per-season presence from product records
      const colorMap = new Map<string, {
        color: string; colorDesc: string; colorSeason: string;
        status: 'Active' | 'Discontinued'; webAvailable: boolean;
        seasonPresence: Set<string>;
      }>();

      relevantProducts.forEach(p => {
        const existing = colorMap.get(p.color);
        if (existing) {
          if (p.season) existing.seasonPresence.add(p.season);
        } else {
          colorMap.set(p.color, {
            color: p.color,
            colorDesc: p.colorDesc,
            colorSeason: p.colorSeason || p.season,
            status: (p.colorDisc === 'Y' || p.inventoryClassification === 'D') ? 'Discontinued' : 'Active',
            webAvailable: p.colorAvailWeb === 'Y',
            seasonPresence: new Set(p.season ? [p.season] : []),
          });
        }
      });

      // Supplement with sales data — sales records often cover more seasons
      // than line-list product records since sales span historical seasons
      const relevantSales = sales.filter(s =>
        styleNumbers.includes(cleanStyleNumber(s.styleNumber))
      );
      relevantSales.forEach(s => {
        const colorCode = s.colorCode || s.color || '';
        if (!colorCode || !s.season) return;
        const existing = colorMap.get(colorCode);
        if (existing) {
          existing.seasonPresence.add(s.season);
        } else {
          // Color found in sales but not in product records — add it
          colorMap.set(colorCode, {
            color: colorCode,
            colorDesc: s.colorDesc || '',
            colorSeason: s.season,
            status: 'Active',
            webAvailable: false,
            seasonPresence: new Set([s.season]),
          });
        }
      });

      map.set(styleNumber, Array.from(colorMap.values()).sort((a, b) => a.color.localeCompare(b.color)));
    });

    return map;
  }, [expandedStyles, products, sales, combineStyles]);

  // Map each displayed season to its prior same-type (SP→SP, FA→FA) season
  const priorSeasonMap = useMemo(() => {
    const map: Record<string, string | null> = {};
    const spSeasons = displaySeasons.filter((s) => {
      const p = parseSeasonCode(s);
      return p && p.type === 'SP';
    });
    const faSeasons = displaySeasons.filter((s) => {
      const p = parseSeasonCode(s);
      return p && p.type === 'FA';
    });
    // For each SP season, prior is the previous SP in display order
    spSeasons.forEach((s, i) => {
      map[s] = i > 0 ? spSeasons[i - 1] : null;
    });
    // For each FA season, prior is the previous FA in display order
    faSeasons.forEach((s, i) => {
      map[s] = i > 0 ? faSeasons[i - 1] : null;
    });
    return map;
  }, [displaySeasons]);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDir('desc');
    }
  };

  const clearFilters = () => {
    setSelectedSeasons([]);
    setStyleNumberFilter('');
    setStyleNameFilter('');
    setSelectedDesigner('');
    setSelectedCustomerType('');
    setSelectedCustomer('');
    setLocalGenderFilter('');
    setLocalCategoryFilter('');
    setSortBy('');
    setCurrentPage(1);
  };

  const hasFilters = selectedSeasons.length > 0 || styleNumberFilter || styleNameFilter || selectedDesigner || selectedCustomerType || selectedCustomer || localGenderFilter || localCategoryFilter || sortBy;

  const metricButtons = [
    { id: 'sales' as MetricType, label: 'Sales $' },
    { id: 'units' as MetricType, label: 'Units' },
    { id: 'msrp' as MetricType, label: 'MSRP' },
    { id: 'cost' as MetricType, label: 'Cost' },
    { id: 'margin' as MetricType, label: 'Margin %' },
  ];

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-4xl font-display font-bold text-text-primary">Season View</h2>
          <p className="text-base text-text-muted mt-2">
            Compare performance across seasons
          </p>
        </div>
        {/* Current Season Context */}
        {(() => {
          const currentSeason = getCurrentShippingSeason();
          const status = getSeasonStatus(currentSeason);
          const badge = getSeasonStatusBadge(status);
          return (
            <div className="text-right">
              <div className="text-sm text-text-muted">Current Shipping Season</div>
              <div className="flex items-center justify-end gap-2 mt-1">
                <span className="text-2xl font-mono font-bold text-text-primary">{currentSeason}</span>
                <span className={`text-sm px-2 py-1 rounded ${badge.color}`}>
                  {badge.icon} {badge.label}
                </span>
              </div>
              <div className="text-xs text-text-faint mt-1">
                {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Filters */}
      <div className="bg-surface rounded-xl border-2 border-border-primary p-5">
        <div className="flex flex-wrap gap-4 items-end">
          {/* Season Multi-Select */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <label className="text-sm font-bold text-text-secondary uppercase tracking-wide">Seasons</label>
              {/* Quick select buttons */}
              <button
                onClick={() => selectSeasonType('SP')}
                className={`text-sm font-semibold px-3 py-1 rounded transition-colors ${
                  seasons.filter((s) => s.endsWith('SP')).every((s) => selectedSeasons.includes(s)) && seasons.filter((s) => s.endsWith('SP')).length > 0
                    ? 'bg-emerald-100 dark:bg-emerald-900 text-emerald-700'
                    : 'bg-surface-tertiary text-text-secondary hover:bg-surface-tertiary'
                }`}
              >
                All Spring
              </button>
              <button
                onClick={() => selectSeasonType('FA')}
                className={`text-sm font-semibold px-3 py-1 rounded transition-colors ${
                  seasons.filter((s) => s.endsWith('FA')).every((s) => selectedSeasons.includes(s)) && seasons.filter((s) => s.endsWith('FA')).length > 0
                    ? 'bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300'
                    : 'bg-surface-tertiary text-text-secondary hover:bg-surface-tertiary'
                }`}
              >
                All Fall
              </button>
              {selectedSeasons.length > 0 && (
                <button
                  onClick={() => setSelectedSeasons([])}
                  className="text-sm font-semibold px-3 py-1 rounded bg-surface-tertiary text-text-secondary hover:bg-surface-tertiary"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {seasons.map((season) => {
                const isSelected = selectedSeasons.includes(season);
                const isSpring = season.endsWith('SP');
                return (
                  <button
                    key={season}
                    onClick={() => toggleSeason(season)}
                    className={`px-3 py-1.5 text-sm font-mono font-semibold rounded-md transition-colors ${
                      isSelected
                        ? isSpring
                          ? 'bg-emerald-500 text-white'
                          : 'bg-orange-500 text-white'
                        : isSpring
                        ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 hover:bg-emerald-100'
                        : 'bg-orange-50 dark:bg-orange-950 text-orange-700 hover:bg-orange-100'
                    }`}
                  >
                    {season}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Style Number Filter */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold text-text-secondary uppercase tracking-wide">Style #</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-faint" />
              <input
                type="text"
                value={styleNumberFilter}
                onChange={(e) => setStyleNumberFilter(e.target.value)}
                placeholder="Search..."
                className="pl-11 pr-4 py-2.5 text-base border-2 border-border-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 w-[140px]"
              />
            </div>
          </div>

          {/* Style Name Filter */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold text-text-secondary uppercase tracking-wide">Style Name</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-faint" />
              <input
                type="text"
                value={styleNameFilter}
                onChange={(e) => setStyleNameFilter(e.target.value)}
                placeholder="Search..."
                className="pl-11 pr-4 py-2.5 text-base border-2 border-border-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 w-[180px]"
              />
            </div>
          </div>

          {/* Designer Filter */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold text-text-secondary uppercase tracking-wide">Designer</label>
            <select
              value={selectedDesigner}
              onChange={(e) => setSelectedDesigner(e.target.value)}
              className="px-4 py-2.5 text-base border-2 border-border-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 min-w-[160px]"
            >
              <option value="">All Designers</option>
              {designers.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          {/* Customer Type Filter */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold text-text-secondary uppercase tracking-wide">Channel</label>
            <select
              value={selectedCustomerType}
              onChange={(e) => setSelectedCustomerType(e.target.value)}
              className="px-4 py-2.5 text-base border-2 border-border-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 min-w-[160px]"
            >
              <option value="">All Channels</option>
              {customerTypes.map((ct) => (
                <option key={ct} value={ct}>{CUSTOMER_TYPE_LABELS[ct] || ct}</option>
              ))}
            </select>
          </div>

          {/* Customer Filter */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold text-text-secondary uppercase tracking-wide">Customer</label>
            <select
              value={selectedCustomer}
              onChange={(e) => setSelectedCustomer(e.target.value)}
              className="px-4 py-2.5 text-base border-2 border-border-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 min-w-[200px] max-w-[240px]"
            >
              <option value="">All Customers</option>
              {customers.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Gender Filter */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold text-text-secondary uppercase tracking-wide">Gender</label>
            <select
              value={localGenderFilter}
              onChange={(e) => setLocalGenderFilter(e.target.value)}
              className="px-4 py-2.5 text-base border-2 border-border-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 min-w-[140px]"
            >
              <option value="">All Genders</option>
              {genders.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>

          {/* Category Filter */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold text-text-secondary uppercase tracking-wide">Category</label>
            <select
              value={localCategoryFilter}
              onChange={(e) => setLocalCategoryFilter(e.target.value)}
              className="px-4 py-2.5 text-base border-2 border-border-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 min-w-[160px]"
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Sort By */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold text-text-secondary uppercase tracking-wide">Sort By</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'revenue' | 'units' | 'styles' | 'price' | '')}
              className="px-4 py-2.5 text-base border-2 border-border-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 min-w-[140px]"
            >
              <option value="">Default</option>
              <option value="revenue">Revenue</option>
              <option value="units">Units</option>
              <option value="styles">Styles</option>
              <option value="price">Price</option>
            </select>
          </div>

          {/* Clear Filters */}
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-2 px-4 py-2.5 text-base font-semibold text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 hover:bg-hover-accent rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Metric Toggle + Combine Styles + Source Legend */}
      <div className="flex items-center gap-6">
        <div className="bg-surface rounded-xl border-2 border-border-primary p-2 inline-flex gap-1">
          {metricButtons.map((btn) => (
            <button
              key={btn.id}
              onClick={() => setMetric(btn.id)}
              className={`px-5 py-2.5 text-base font-bold rounded-lg transition-colors ${
                metric === btn.id
                  ? 'bg-cyan-600 text-white'
                  : 'text-text-secondary hover:bg-surface-tertiary'
              }`}
            >
              {btn.label}
            </button>
          ))}
          <div className="w-px bg-gray-300 mx-1" />
          <button
            onClick={() => setCombineStyles(!combineStyles)}
            className={`px-5 py-2.5 text-base font-bold rounded-lg transition-colors ${
              combineStyles
                ? 'bg-purple-600 text-white'
                : 'text-text-secondary hover:bg-surface-tertiary'
            }`}
            title="Combine style variants (R/X/T suffixes, tall, plus)"
          >
            Combine Styles
          </button>
          <div className="w-px bg-gray-300 mx-1" />
          <button
            onClick={() => {
              exportCostingMargins({
                products,
                pricing,
                costs,
                sales,
                seasonFilter: selectedSeasons.length > 0 ? selectedSeasons : undefined,
                divisionFilter: selectedDivision || undefined,
                categoryFilter: selectedCategory || undefined,
                scenario: scenarioActive && scenarioBasisSeason
                  ? { basisSeason: scenarioBasisSeason, effectiveMix }
                  : undefined,
              });
            }}
            title="Export Costing + Margins workbook (Detail + Style Summary + Season Totals + Scenario)"
            className="flex items-center gap-2 px-5 py-2.5 text-base font-bold rounded-lg transition-colors text-text-secondary hover:bg-surface-tertiary"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>

        {/* Source Legend - Priority: pricebyseason > Sales > Line List */}
        <div className="flex items-center gap-4 text-sm text-text-muted flex-wrap">
          <span className="font-semibold">MSRP/Price Source:</span>
          <span className="flex items-center gap-1">
            <span className="text-emerald-500">●</span> pricebyseason
          </span>
          <span className="flex items-center gap-1">
            <span className="text-amber-500">◇</span> Sales
          </span>
          <span className="flex items-center gap-1">
            <span className="text-blue-500">○</span> Line List
          </span>
          <span className="flex items-center gap-1">
            <span className="text-purple-500">■</span> Landed Sheet
          </span>
          {metric === 'margin' && (
            <>
              <span className="ml-4 font-semibold">Margin formula:</span>
              <span className="flex items-center gap-1" title="(wholesale − landed) / wholesale — shown on every historical cell without a badge.">
                <span className="text-text-muted">baseline</span>
              </span>
              <span className="flex items-center gap-1 text-cyan-600 dark:text-cyan-400" title="Projected from the scenario panel — forecast seasons only.">
                projected
              </span>
              <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400" title="Sales-weighted: (revenue − landed × units) / revenue.">
                sales-wtd
              </span>
            </>
          )}
        </div>
      </div>

      {/* Scenario Panel (for projecting weighted margins on forecast seasons) */}
      {scenarioActive && scenarioBasisSeason && (
        <MarginScenarioPanel
          futureSeason={
            displayedForecastSeasons.length === 1
              ? displayedForecastSeasons[0]
              : `${displayedForecastSeasons.length} forecast seasons`
          }
          availableBasisSeasons={availableBasisSeasons}
          basisSeason={scenarioBasisSeason}
          onBasisChange={(s) => {
            setScenarioBasisSeason(s);
            setScenarioMixOverride(null);
          }}
          basisMetrics={basisMetrics}
          primaryChannels={[...PRIMARY_CHANNELS]}
          channelLabels={CHANNEL_LABELS}
          channelColors={CHANNEL_COLORS}
          mix={effectiveMix}
          naturalMix={naturalMix}
          isOverridden={scenarioMixOverride !== null}
          onMixChange={setScenarioMixOverride}
          onReset={() => setScenarioMixOverride(null)}
        />
      )}

      {/* Pivot Table */}
      <div className="bg-surface rounded-xl border-2 border-border-primary shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-surface-tertiary border-b-2 border-border-strong">
                <th
                  className="px-4 py-3 text-left text-sm font-bold text-text-secondary uppercase tracking-wide cursor-pointer hover:text-text-primary sticky left-0 bg-surface-tertiary z-10 min-w-[100px] border-r border-border-primary"
                  onClick={() => handleSort('style')}
                >
                  <div className="flex items-center gap-1">
                    Style
                    <ArrowUpDown className="w-4 h-4" />
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-sm font-bold text-text-secondary uppercase tracking-wide sticky left-[100px] bg-surface-tertiary z-10 min-w-[200px] border-r border-border-primary">
                  Description
                </th>
                {displaySeasons.map((season) => {
                  const status = getSeasonStatus(season);
                  const badge = getSeasonStatusBadge(status);
                  const currentSeason = getCurrentShippingSeason();
                  const isCurrent = season === currentSeason;
                  // Abbreviate status labels to keep columns tight
                  const shortLabel = badge.label === 'SHIPPING' ? 'SHIP'
                    : badge.label === 'PRE-BOOK' ? 'PRE'
                    : badge.label === 'PLANNING' ? 'PLAN'
                    : badge.label;
                  const isProjected = scenarioActive && !seasonsWithSales.has(season);
                  return (
                    <th
                      key={season}
                      className={`px-3 py-3 text-right text-sm font-bold text-text-secondary uppercase tracking-wide cursor-pointer hover:text-text-primary min-w-[100px] border-l border-border-primary ${isCurrent ? 'bg-cyan-500/10 ring-1 ring-inset ring-cyan-500/30' : 'bg-surface-tertiary'}`}
                      onClick={() => handleSort(season)}
                      title={isProjected ? `Margin projected using ${scenarioBasisSeason} channel mix` : undefined}
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        {isProjected && (
                          <Sparkles className="w-3 h-3 text-cyan-400 flex-shrink-0" />
                        )}
                        <span className="font-mono text-base">{season}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap ${badge.color}`}>
                          {shortLabel}
                        </span>
                        <ArrowUpDown className="w-3 h-3 flex-shrink-0" />
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sortedData.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((row, index) => {
                const isExpanded = expandedStyles.has(row.styleNumber);
                const colors = isExpanded ? (colorsByStyleSeason.get(row.styleNumber) || []) : [];
                const rowBg = index % 2 === 0 ? 'bg-surface' : 'bg-surface-secondary';

                return (
                  <Fragment key={row.styleNumber}>
                    {/* Parent style row */}
                    <tr
                      onClick={() => onStyleClick(row.styleNumber)}
                      className={`border-b border-border-primary cursor-pointer transition-colors ${
                        isExpanded ? 'bg-surface-tertiary' : `${rowBg} hover:bg-hover-accent`
                      }`}
                    >
                      <td className={`px-4 py-4 sticky left-0 z-10 border-r border-border-primary ${isExpanded ? 'bg-surface-tertiary' : rowBg} hover:bg-hover-accent`}>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleExpand(row.styleNumber); }}
                            className={`w-[18px] h-[18px] flex items-center justify-center rounded text-text-muted transition-transform flex-shrink-0 hover:text-text-primary ${
                              isExpanded ? 'rotate-90 bg-cyan-500/15 text-cyan-400' : 'bg-surface-tertiary'
                            }`}
                            title={isExpanded ? 'Collapse colors' : 'Expand colors'}
                          >
                            <ChevronRight className="w-3 h-3" />
                          </button>
                          <span className="font-mono text-xl font-bold text-text-primary">
                            {combineStyles && row.allStyleNumbers && row.allStyleNumbers.length > 1
                              ? row.allStyleNumbers.join(', ')
                              : row.styleNumber}
                          </span>
                          {row.variantStyles && row.variantStyles.length > 0 && (
                            <span
                              className="text-xs font-semibold px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded-full cursor-help whitespace-nowrap"
                              title={`Combined ${row.allStyleNumbers?.length || row.variantStyles.length + 1} styles:\n${row.variantStyles.map((v: { styleNumber: string; styleDesc: string }) => `• ${v.styleNumber}${v.styleDesc ? ` – ${v.styleDesc}` : ''}`).join('\n')}`}
                            >
                              {row.allStyleNumbers?.length || row.variantStyles.length + 1} styles
                            </span>
                          )}
                        </div>
                      </td>
                      <td className={`px-4 py-4 text-lg text-text-secondary truncate max-w-[280px] sticky left-[100px] z-10 border-r border-border-primary ${isExpanded ? 'bg-surface-tertiary' : rowBg} hover:bg-hover-accent`}
                        title={combineStyles && row.variantStyles && row.variantStyles.length > 0
                          ? `${row.styleDesc}\n${row.variantStyles.map((v: { styleNumber?: string; styleDesc: string }) => `• ${v.styleNumber}: ${v.styleDesc}`).join('\n')}`
                          : row.styleDesc}
                      >
                        {row.styleDesc}
                      </td>
                      {displaySeasons.map((season) => {
                        const value = row.seasonData[season];
                        const source = row.seasonSources[season];
                        const delta = row.seasonDeltas?.[season] ?? null;
                        const isNew = row.seasonIsNew?.[season] ?? false;
                        const prior = priorSeasonMap[season];
                        // Detect fallback marker (e.g. "pricebyseason/fallback|fallback:24FA" or "fallback:24FA")
                        const fallbackMatch = source?.match(/fallback:([^|]+)/);
                        const fallbackSeason = fallbackMatch ? fallbackMatch[1] : null;
                        const baseSource = source?.replace(/\|?fallback:[^|]+/, '').replace(/fallback:[^|]+/, '') || '';

                        // Margin-specific: which formula was used to compute this cell?
                        //   "projected:<basis>" → scenario-based weighted margin (forecast col + scenario active)
                        //   "sales/*"            → sales-weighted (revenue / units vs landed)
                        //   else                 → baseline (wholesale − landed) / wholesale
                        // We only show a badge for non-baseline cells so the historical cols stay uncluttered.
                        const projectedMatch = metric === 'margin' ? source?.match(/^projected:([^|]+)/) : null;
                        const projectedBasis = projectedMatch ? projectedMatch[1] : null;
                        const isSalesWeighted = metric === 'margin' && /^sales(\/|$)/.test(source ?? '');
                        const formulaBadge = projectedBasis
                          ? {
                              label: `projected · ${projectedBasis}`,
                              className: 'text-cyan-600 dark:text-cyan-400',
                              title: `Projected using ${projectedBasis} per-channel pricing ratios applied to ${season} prices + costs (scenario panel).`,
                            }
                          : isSalesWeighted
                          ? {
                              label: 'sales-wtd',
                              className: 'text-amber-600 dark:text-amber-400',
                              title: 'Margin weighted by actual sales: (revenue − landed × units) / revenue.',
                            }
                          : null;

                        // Source indicator: ● pricebyseason, ○ linelist, ◇ sales, ■ landed_sheet
                        const getSourceIndicator = (src: string) => {
                          if (src === 'pricebyseason') return { symbol: '●', color: 'text-emerald-500', title: 'Source: pricebyseason' };
                          if (src === 'linelist') return { symbol: '○', color: 'text-blue-500', title: 'Source: Line List' };
                          if (src === 'sales') return { symbol: '◇', color: 'text-amber-500', title: 'Source: Calculated from Sales' };
                          if (src === 'landed_sheet') return { symbol: '■', color: 'text-purple-500', title: 'Source: Landed Request Sheet' };
                          if (src === 'fallback') return null; // handled separately
                          if (src.includes('/')) return { symbol: '◆', color: 'text-text-faint', title: `Source: ${src}` };
                          return null;
                        };
                        const indicator = baseSource ? getSourceIndicator(baseSource) : null;
                        const fallbackIndicator = fallbackSeason
                          ? { symbol: '⟲', color: 'text-amber-500', title: `Cost from prior season: ${fallbackSeason}` }
                          : null;
                        return (
                          <td
                            key={season}
                            className="px-3 py-2 text-right font-mono border-l border-border-primary"
                          >
                            {value !== null ? (
                              <div className="flex flex-col items-end">
                                <span className="text-text-primary font-medium text-lg inline-flex items-center gap-1">
                                  {formatValue(value, metric)}
                                  {indicator && (
                                    <span className={`text-xs ${indicator.color}`} title={indicator.title}>
                                      {indicator.symbol}
                                    </span>
                                  )}
                                  {fallbackIndicator && (
                                    <span className={`text-sm ${fallbackIndicator.color}`} title={fallbackIndicator.title}>
                                      {fallbackIndicator.symbol}
                                    </span>
                                  )}
                                </span>
                                {prior && isNew && (
                                  <span className="text-[11px] font-bold text-cyan-500">NEW</span>
                                )}
                                {prior && delta !== null && (
                                  <span
                                    className={`text-[11px] font-semibold ${deltaColor(delta)}`}
                                    title={`vs ${prior}`}
                                  >
                                    {fmtDelta(delta)}
                                  </span>
                                )}
                                {formulaBadge && (
                                  <span
                                    className={`text-[10px] font-medium tracking-wide ${formulaBadge.className}`}
                                    title={formulaBadge.title}
                                  >
                                    {formulaBadge.label}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-text-faint">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>

                    {/* Expanded color sub-rows */}
                    {isExpanded && colors.length > 0 && colors.map((color) => (
                      <tr
                        key={`${row.styleNumber}-${color.color}`}
                        className="border-b border-border-primary transition-colors"
                        style={{ background: 'var(--color-surface-secondary, #0d0d0f)' }}
                      >
                        <td className="px-4 py-2 sticky left-0 z-10 border-r border-border-primary" style={{ background: 'var(--color-surface-secondary, #0d0d0f)' }}>
                          <div className="flex items-center gap-2 pl-7">
                            <span className="text-sm font-mono font-semibold text-text-primary">{color.color}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                              color.status === 'Active'
                                ? 'bg-emerald-500/15 text-emerald-400'
                                : 'bg-red-500/15 text-red-400'
                            }`}>
                              {color.status === 'Active' ? 'Active' : 'Disc'}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2 sticky left-[100px] z-10 border-r border-border-primary" style={{ background: 'var(--color-surface-secondary, #0d0d0f)' }}>
                          <div className="flex flex-col">
                            <span className="text-sm text-text-secondary truncate">{color.colorDesc}</span>
                            <div className="flex gap-2 text-[10px] text-text-muted">
                              <span>Intro: {color.colorSeason}</span>
                              {color.webAvailable && <span className="text-blue-400">Web</span>}
                            </div>
                          </div>
                        </td>
                        {displaySeasons.map((season) => (
                          <td key={season} className="px-3 py-2 text-center border-l border-border-primary">
                            {color.seasonPresence.has(season) ? (
                              <span className="inline-block w-3 h-3 rounded-full bg-emerald-500" title={`${color.colorDesc} offered in ${season}`} />
                            ) : (
                              <span className="text-text-faint text-xs">—</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {isExpanded && colors.length === 0 && (
                      <tr className="border-b border-border-primary" style={{ background: 'var(--color-surface-secondary, #0d0d0f)' }}>
                        <td colSpan={2 + displaySeasons.length} className="px-4 py-3 pl-12 text-sm text-text-muted italic">
                          No color data available for this style
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
            {/* Totals Row */}
            <tfoot>
              <tr className="bg-surface-tertiary border-t-2 border-border-strong">
                <td className="px-4 py-4 sticky left-0 bg-surface-tertiary text-xl font-bold text-text-primary border-r border-border-strong">
                  <div className="flex flex-col gap-1">
                    <span>TOTALS</span>
                    {metric === 'margin' && (
                      <div className="flex gap-1">
                        <button
                          onClick={() => setTotalsMode('blended')}
                          className={`px-2 py-0.5 text-[11px] font-semibold rounded transition-colors ${
                            totalsMode === 'blended'
                              ? 'bg-cyan-600 text-white'
                              : 'bg-surface text-text-secondary hover:bg-surface-secondary'
                          }`}
                        >
                          Blended
                        </button>
                        <button
                          onClick={() => setTotalsMode('sum')}
                          className={`px-2 py-0.5 text-[11px] font-semibold rounded transition-colors ${
                            totalsMode === 'sum'
                              ? 'bg-cyan-600 text-white'
                              : 'bg-surface text-text-secondary hover:bg-surface-secondary'
                          }`}
                        >
                          Sum
                        </button>
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-4 py-4 sticky left-[100px] bg-surface-tertiary border-r border-border-strong"></td>
                {displaySeasons.map((season) => {
                  const useBlended = metric === 'margin' && totalsMode === 'blended';
                  const totalVal = useBlended ? totals.blendedTotals[season] : totals.seasonTotals[season];
                  const td = useBlended ? totals.blendedDeltas[season] : totals.totalDeltas[season];
                  const prior = priorSeasonMap[season];
                  const coverage = metric === 'margin' ? totals.coverageBySeason?.[season] : undefined;
                  const missingCount = coverage ? coverage.total - coverage.withCost : 0;
                  return (
                    <td key={season} className="px-3 py-2 text-right font-mono border-l border-border-strong">
                      <div className="flex flex-col items-end">
                        <span className="text-lg font-bold text-text-primary">
                          {formatValue(totalVal, metric)}
                        </span>
                        {prior && td !== null && td !== undefined && (
                          <span
                            className={`text-[11px] font-semibold ${deltaColor(td)}`}
                            title={`vs ${prior}`}
                          >
                            {fmtDelta(td)}
                          </span>
                        )}
                        {metric === 'margin' && coverage && coverage.total > 0 && missingCount > 0 && (
                          <span
                            className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-0.5 mt-0.5"
                            title={`${missingCount} of ${coverage.total} styles missing landed cost data`}
                          >
                            ⚠ {missingCount}/{coverage.total} no cost
                          </span>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Footer with Pagination */}
        {(() => {
          const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize));
          const startRow = (currentPage - 1) * pageSize + 1;
          const endRow = Math.min(currentPage * pageSize, sortedData.length);
          return (
            <div className="px-5 py-4 bg-surface-tertiary border-t-2 border-border-strong flex items-center justify-between text-base text-text-secondary">
              <span className="font-semibold">
                Showing {startRow}–{endRow} of {sortedData.length} styles with {metricButtons.find(m => m.id === metric)?.label} data
                {filteredStyles.length > relevantPivotData.length && (
                  <span className="text-text-muted font-normal ml-1">
                    ({filteredStyles.length - relevantPivotData.length} hidden)
                  </span>
                )}
              </span>
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded-lg hover:bg-surface-tertiary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <span className="font-semibold text-sm">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-1.5 rounded-lg hover:bg-surface-tertiary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              )}
              <span className="font-semibold">
                Sorted by: {sortColumn || seasons[seasons.length - 1]} {sortDir === 'desc' ? '↓' : '↑'}
              </span>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
