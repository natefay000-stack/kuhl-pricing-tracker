'use client';

import { useState, useMemo, useEffect } from 'react';
import { Product, SalesRecord, CostRecord, PricingRecord, normalizeCategory } from '@/types/product';
import { isRelevantSeason } from '@/utils/season';
import { matchesSeason, sortSeasons } from '@/lib/store';
import { matchesDivision } from '@/utils/divisionMap';
import { matchesFilter } from '@/utils/filters';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Percent,
  Package,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Settings,
  Store,
  Globe,
  Users,
  ShoppingCart,
  Filter,
  X,
  Download,
  Clock,
  Sparkles,
} from 'lucide-react';
import { exportToExcel } from '@/utils/exportData';
import { exportCostingMargins } from '@/utils/exportCostingMargins';
import { formatCurrency, formatCurrencyShort, formatPercent, formatNumber } from '@/utils/format';
import SalesLoadingBanner from '@/components/SalesLoadingBanner';
import { buildCostFallbackLookup } from '@/utils/costFallback';
import MarginScenarioPanel, { ChannelMetric } from '@/components/MarginScenarioPanel';

interface MarginsViewProps {
  products: Product[];
  sales: SalesRecord[];
  costs: CostRecord[];
  pricing: PricingRecord[];
  selectedSeason: string;
  selectedDivision: string;
  selectedCategory: string;
  searchQuery?: string;
  onStyleClick: (styleNumber: string) => void;
}

interface StyleMargin {
  styleNumber: string;
  styleDesc: string;
  categoryDesc: string;
  divisionDesc: string;
  gender: string;
  revenue: number;
  units: number;
  cost: number;
  cogs: number;
  gross: number;
  margin: number;
  vsTarget: number;
}

interface StyleChannelMargin {
  styleNumber: string;
  styleDesc: string;
  categoryDesc: string;
  divisionDesc: string;
  msrp: number;
  wholesalePrice: number;
  landedCost: number;
  msrpSource: string;
  wholesaleSource: string;
  costSource: string;
  costWarning: 'none' | 'above-wholesale' | 'above-msrp' | 'missing';
  costFallbackSeason?: string;
  baselineMargin: number;
  totalRevenue: number;
  totalUnits: number;
  avgNetPrice: number;
  weightedMargin: number;
  marginDelta: number;
  channelMix: Record<string, { revenue: number; units: number; pct: number; margin: number; avgNetPrice: number }>;
  isProjected?: boolean; // true when weightedMargin is derived from a forecast scenario (no actual sales)
  projectedBasisSeason?: string;
}

interface CategoryMargin {
  category: string;
  revenue: number;
  cogs: number;
  gross: number;
  margin: number;
}

interface ChannelMargin {
  channel: string;
  channelName: string;
  revenue: number;
  cogs: number;
  gross: number;
  margin: number;
}

interface ChannelPerformance {
  channel: string;
  channelName: string;
  revenue: number;
  units: number;
  avgNetPrice: number;
  avgWholesalePrice: number;
  avgLanded: number;
  trueMargin: number;
  /** Retail-adjusted margin — KUHL Kultur units re-valued at MSRP. null when no adjustment applies. */
  adjustedMargin: number | null;
  kulturUnits: number;
  avgDiscount: number;
  revenuePct: number;
}

interface GenderMargin {
  gender: string;
  revenue: number;
  cogs: number;
  gross: number;
  margin: number;
}

interface CustomerBreakdown {
  customer: string;
  customerType: string;
  revenue: number;
  units: number;
  avgNetPrice: number;
  margin: number;
}

type SortField = 'styleNumber' | 'styleDesc' | 'revenue' | 'cogs' | 'gross' | 'margin' | 'vsTarget' | 'weightedMargin' | 'marginDelta' | 'baselineMargin' | 'totalRevenue';
type SortDirection = 'asc' | 'desc';

// Customer Type mapping - FINAL
// WD and DTC are combined as "KÜHL Stores"
const CHANNEL_LABELS: Record<string, string> = {
  'WH': 'Wholesale',
  'BB': 'REI',
  'PS': 'Pro Sales',
  'EC': 'E-commerce',
  'KI': 'KUHL International',
  'KUHL_STORES': 'KÜHL Stores',  // Combined WD + DTC
};

// 6 primary channels (WD/DTC combined into KUHL_STORES)
const PRIMARY_CHANNELS = ['WH', 'BB', 'KUHL_STORES', 'EC', 'PS', 'KI'];

// Top channels to show in cards
const CARD_CHANNELS = ['WH', 'BB', 'KUHL_STORES', 'EC', 'PS', 'KI'];

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  'EC': <Globe className="w-5 h-5" />,
  'KUHL_STORES': <Store className="w-5 h-5" />,
  'PS': <Users className="w-5 h-5" />,
  'WH': <ShoppingCart className="w-5 h-5" />,
  'BB': <Package className="w-5 h-5" />,
  'KI': <Globe className="w-5 h-5" />,
};

const CHANNEL_COLORS: Record<string, { bg: string; text: string; light: string }> = {
  'WH': { bg: 'bg-green-600', text: 'text-green-700 dark:text-green-300', light: 'bg-green-100 dark:bg-green-900' },
  'BB': { bg: 'bg-red-600', text: 'text-red-700 dark:text-red-300', light: 'bg-red-100 dark:bg-red-900' },
  'KUHL_STORES': { bg: 'bg-blue-600', text: 'text-blue-700 dark:text-blue-400', light: 'bg-blue-100 dark:bg-blue-900' },
  'EC': { bg: 'bg-purple-600', text: 'text-purple-700 dark:text-purple-400', light: 'bg-purple-100 dark:bg-purple-900' },
  'PS': { bg: 'bg-amber-600', text: 'text-amber-700 dark:text-amber-300', light: 'bg-amber-100 dark:bg-amber-900' },
  'KI': { bg: 'bg-cyan-600', text: 'text-cyan-700 dark:text-cyan-300', light: 'bg-cyan-100 dark:bg-cyan-900' },
};

const TARGET_MARGIN = 48; // Default target margin percentage


function getMarginTier(margin: number): 'excellent' | 'target' | 'watch' | 'problem' {
  if (margin >= 50) return 'excellent';
  if (margin >= 45) return 'target';
  if (margin >= 40) return 'watch';
  return 'problem';
}

function getMarginColor(margin: number): string {
  const tier = getMarginTier(margin);
  switch (tier) {
    case 'excellent': return 'bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300';
    case 'target': return 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300';
    case 'watch': return 'bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300';
    case 'problem': return 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300';
  }
}

function getMarginBarColor(tier: 'excellent' | 'target' | 'watch' | 'problem'): string {
  switch (tier) {
    case 'excellent': return 'bg-emerald-600';
    case 'target': return 'bg-green-500';
    case 'watch': return 'bg-amber-500';
    case 'problem': return 'bg-red-500';
  }
}

// Known customer type codes from source data
const RAW_TYPES = ['WH', 'BB', 'PS', 'EC', 'KI', 'DTC', 'WD'];

// Normalize raw customer type to channel code
// WD and DTC both map to KUHL_STORES
function mapToChannel(rawType: string): string {
  const upper = rawType.toUpperCase().trim();
  // WD and DTC are both KÜHL Stores
  if (upper === 'WD' || upper === 'DTC') return 'KUHL_STORES';
  // Other known types map directly
  if (['WH', 'BB', 'PS', 'EC', 'KI'].includes(upper)) return upper;
  // Unknown defaults to WH
  return 'WH';
}

// Parse customer type - handles comma-separated values from aggregated data
// Returns the normalized channel code
function parseCustomerType(customerType: string): { channel: string; isMixed: boolean; rawTypes: string[] } {
  if (!customerType) return { channel: 'WH', isMixed: false, rawTypes: [] };

  const upper = customerType.toUpperCase().trim();

  // Check for comma-separated values (aggregated data)
  if (upper.includes(',')) {
    const types = upper.split(',').map(t => t.trim()).filter(t => t.length > 0);
    const validTypes = types.filter(t => RAW_TYPES.includes(t));
    // Get unique channels after mapping
    const channels = Array.from(new Set(validTypes.map(mapToChannel)));
    return {
      channel: channels[0] || 'WH',
      isMixed: channels.length > 1,
      rawTypes: validTypes
    };
  }

  // Single type
  if (RAW_TYPES.includes(upper)) {
    return { channel: mapToChannel(upper), isMixed: false, rawTypes: [upper] };
  }

  // Unknown type - default to WH
  return { channel: 'WH', isMixed: false, rawTypes: [] };
}

// Simple normalize for backwards compatibility - returns channel code
function normalizeCustomerType(customerType: string): string {
  return parseCustomerType(customerType).channel;
}

export default function MarginsView({
  products,
  sales,
  costs,
  pricing,
  selectedSeason,
  selectedDivision,
  selectedCategory,
  searchQuery: globalSearchQuery,
  onStyleClick,
}: MarginsViewProps) {
  // Sort by revenue (highest first) by default
  const [sortField, setSortField] = useState<SortField>('totalRevenue');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string | null>(null);
  const [selectedCustomerType, setSelectedCustomerType] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);
  const [expandedStyle, setExpandedStyle] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'channel' | 'traditional'>('channel');

  // Search filter for style-level analysis
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [styleLevelSeasonFilter, setStyleLevelSeasonFilter] = useState<string>('all');

  // Sync global search → local search
  useEffect(() => {
    if (globalSearchQuery !== undefined && globalSearchQuery !== searchQuery) {
      setSearchQuery(globalSearchQuery);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalSearchQuery]);

  // Customer filters
  const [customerTypeFilters, setCustomerTypeFilters] = useState<string[]>([]);
  const [showTopN, setShowTopN] = useState<number>(10);
  const [tableDisplayLimit, setTableDisplayLimit] = useState(50);

  // Seasons that have actual sales data (used as basis candidates + for
  // deciding whether a season is "forecast" vs historical).
  const seasonsWithSales = useMemo(() => {
    const s = new Set<string>();
    sales.forEach((r) => r.season && s.add(r.season));
    return s;
  }, [sales]);

  const availableSeasons = useMemo(() => {
    return Array.from(seasonsWithSales).sort().filter((s) => isRelevantSeason(s));
  }, [seasonsWithSales]);

  // Union of seasons across sales, pricing, costs, and products. This is
  // what the season pills use, so future seasons (27SP) with pricing/costs
  // but no sales still appear and can be projected.
  const allSeasons = useMemo(() => {
    const set = new Set<string>();
    sales.forEach((r) => r.season && set.add(r.season));
    pricing.forEach((p) => p.season && set.add(p.season));
    costs.forEach((c) => c.season && set.add(c.season));
    products.forEach((p) => p.season && set.add(p.season));
    const arr = Array.from(set).filter((s) => isRelevantSeason(s));
    return sortSeasons(arr);
  }, [sales, pricing, costs, products]);

  const isForecastSeason = (season: string) =>
    season !== 'all' && !seasonsWithSales.has(season) && allSeasons.includes(season);

  // ── Scenario state (only meaningful when a forecast season is picked) ──
  const [scenarioBasisSeason, setScenarioBasisSeason] = useState<string | null>(null);
  const [scenarioMixOverride, setScenarioMixOverride] = useState<Record<string, number> | null>(null);

  // Retail-facing channels use MSRP as reference price; wholesale channels use wholesale price
  const RETAIL_CHANNELS = useMemo(() => new Set(['EC', 'KUHL_STORES']), []);

  // Is the currently-selected style-level season a forecast (no sales)?
  const isCurrentForecast = useMemo(
    () => isForecastSeason(styleLevelSeasonFilter),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [styleLevelSeasonFilter, seasonsWithSales, allSeasons],
  );

  // Available basis candidates: seasons with sales, most recent first.
  const availableBasisSeasons = useMemo(() => {
    return sortSeasons(Array.from(seasonsWithSales).filter((s) => isRelevantSeason(s))).reverse();
  }, [seasonsWithSales]);

  // Reset scenario when leaving/entering forecast mode or changing future season.
  useEffect(() => {
    if (!isCurrentForecast) {
      if (scenarioBasisSeason !== null) setScenarioBasisSeason(null);
      if (scenarioMixOverride !== null) setScenarioMixOverride(null);
      return;
    }
    // Pick default basis = most recent past season with sales (if not already set).
    if (scenarioBasisSeason === null && availableBasisSeasons.length > 0) {
      setScenarioBasisSeason(availableBasisSeasons[0]);
    }
    // Clear any old override when basis changes
    setScenarioMixOverride(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleLevelSeasonFilter, isCurrentForecast, availableBasisSeasons]);

  // Aggregate per-channel metrics for the basis season (seasons-wide, not per style).
  // listPriceRatio = avgNetPrice / avgListPrice — what fraction of list we
  // actually realize in each channel. We'll apply this to future-season
  // list prices to project per-channel net prices.
  const basisMetrics = useMemo<Record<string, ChannelMetric>>(() => {
    const out: Record<string, ChannelMetric> = {};
    if (!scenarioBasisSeason) return out;

    const perChannel = new Map<string, { units: number; revenue: number; totalList: number }>();
    sales.forEach((record) => {
      if (record.season !== scenarioBasisSeason) return;
      const channel = normalizeCustomerType(record.customerType);
      const units = record.unitsBooked || 0;
      if (units <= 0) return;

      const priceInfo = products.find((p) => p.styleNumber === record.styleNumber);
      const msrp = priceInfo?.msrp ?? 0;
      const wholesale = priceInfo?.price ?? record.wholesalePrice ?? 0;
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
  }, [scenarioBasisSeason, sales, products, RETAIL_CHANNELS]);

  // Natural channel mix from basis season (by units).
  const naturalMix = useMemo<Record<string, number>>(() => {
    const total = PRIMARY_CHANNELS.reduce((s, c) => s + (basisMetrics[c]?.units ?? 0), 0);
    const mix: Record<string, number> = {};
    PRIMARY_CHANNELS.forEach((c) => {
      mix[c] = total > 0 ? ((basisMetrics[c]?.units ?? 0) / total) * 100 : 0;
    });
    return mix;
  }, [basisMetrics]);

  // The mix actually used for projection: the user's override, or the natural one.
  const effectiveMix = useMemo<Record<string, number>>(
    () => scenarioMixOverride ?? naturalMix,
    [scenarioMixOverride, naturalMix],
  );

  // Build cost lookup from costs data — with prior-season fallback
  const costFallbackLookup = useMemo(() => {
    return buildCostFallbackLookup(costs, products);
  }, [costs, products]);

  // Convenience wrapper that returns { cost, source, fallbackSeason }
  const getCost = costFallbackLookup.getCostWithFallback;

  // Filter sales by season and additional filters
  const filteredSales = useMemo(() => {
    return sales.filter(s => {
      if (!matchesSeason(s.season, selectedSeason)) return false;
      if (selectedCustomerType && normalizeCustomerType(s.customerType) !== selectedCustomerType) return false;
      if (selectedCustomer && s.customer !== selectedCustomer) return false;
      return true;
    });
  }, [sales, selectedSeason, selectedCustomerType, selectedCustomer]);

  // Get unique customers for filter dropdown
  const uniqueCustomers = useMemo(() => {
    const customers = new Set<string>();
    filteredSales.forEach(s => {
      if (s.customer) customers.add(s.customer);
    });
    return Array.from(customers).sort();
  }, [filteredSales]);

  // Build wholesale price lookup from products — keyed by styleNumber
  const wholesalePriceLookup = useMemo(() => {
    const lookup = new Map<string, { wholesale: number; msrp: number }>();
    products.forEach(p => {
      if (!lookup.has(p.styleNumber)) {
        lookup.set(p.styleNumber, { wholesale: p.price || 0, msrp: p.msrp || 0 });
      }
    });
    return lookup;
  }, [products]);

  // Channel Performance Analysis - True Margin by Channel
  const channelPerformance = useMemo(() => {
    const byChannel = new Map<string, {
      revenue: number;
      units: number;
      totalCost: number;
      totalWholesale: number;
      totalListPrice: number;
      stylesWithCost: number;
      // Kultur-only buckets used to retail-adjust margins: units sold to
      // KUHL Kultur * customers are booked at wholesale but sell through
      // at MSRP in KUHL's own stores, so we re-value them when computing
      // the "adjusted" margin.
      kulturUnits: number;
      kulturRevenue: number;
      kulturMsrpValue: number; // sum of units × msrp for Kultur rows
    }>();

    filteredSales.forEach(record => {
      // Apply division/category filters
      if (!matchesDivision(record.divisionDesc, selectedDivision)) return;
      if (!matchesFilter(normalizeCategory(record.categoryDesc), selectedCategory)) return;

      const channel = normalizeCustomerType(record.customerType);
      const costResult = getCost(record.styleNumber, record.season);
      const landedCost = costResult.cost;
      const units = record.unitsBooked || 0;
      const priceInfo = wholesalePriceLookup.get(record.styleNumber);
      const wholesalePrice = priceInfo?.wholesale || 0;
      const msrp = priceInfo?.msrp || 0;
      const listPrice = RETAIL_CHANNELS.has(channel) ? msrp : wholesalePrice;

      if (!byChannel.has(channel)) {
        byChannel.set(channel, {
          revenue: 0,
          units: 0,
          totalCost: 0,
          totalWholesale: 0,
          totalListPrice: 0,
          stylesWithCost: 0,
          kulturUnits: 0,
          kulturRevenue: 0,
          kulturMsrpValue: 0,
        });
      }

      const entry = byChannel.get(channel)!;
      entry.revenue += record.revenue || 0;
      entry.units += units;
      entry.totalCost += units * landedCost;
      entry.totalWholesale += units * wholesalePrice;
      entry.totalListPrice += units * listPrice;
      if (landedCost > 0) entry.stylesWithCost++;

      if (/^kuhl\s+kultur/i.test(record.customer ?? '') && units > 0 && msrp > 0) {
        entry.kulturUnits += units;
        entry.kulturRevenue += record.revenue || 0;
        entry.kulturMsrpValue += units * msrp;
      }
    });

    const totalRevenue = Array.from(byChannel.values()).reduce((sum, c) => sum + c.revenue, 0);

    const results: ChannelPerformance[] = PRIMARY_CHANNELS.map(channel => {
      const data = byChannel.get(channel) || {
        revenue: 0, units: 0, totalCost: 0, totalWholesale: 0, totalListPrice: 0,
        stylesWithCost: 0, kulturUnits: 0, kulturRevenue: 0, kulturMsrpValue: 0,
      };
      const avgNetPrice = data.units > 0 ? data.revenue / data.units : 0;
      const avgLanded = data.units > 0 ? data.totalCost / data.units : 0;
      const avgWholesalePrice = data.units > 0 ? data.totalWholesale / data.units : 0;
      const avgListPrice = data.units > 0 ? data.totalListPrice / data.units : 0;
      const trueMargin = avgNetPrice > 0 ? ((avgNetPrice - avgLanded) / avgNetPrice) * 100 : 0;
      const avgDiscount = avgListPrice > 0 ? ((avgListPrice - avgNetPrice) / avgListPrice) * 100 : 0;

      // Retail-adjusted margin (only when Kultur units exist in this channel):
      //   effectiveRev   = otherRevenue + kulturMsrpValue
      //   effectiveCost  = totalUnits × avgLanded
      let adjustedMargin: number | null = null;
      if (data.kulturUnits > 0 && avgLanded > 0) {
        const otherRevenue = data.revenue - data.kulturRevenue;
        const effectiveRev = otherRevenue + data.kulturMsrpValue;
        const effectiveCost = data.units * avgLanded;
        if (effectiveRev > 0) {
          adjustedMargin = ((effectiveRev - effectiveCost) / effectiveRev) * 100;
        }
      }

      return {
        channel,
        channelName: CHANNEL_LABELS[channel] || channel,
        revenue: data.revenue,
        units: data.units,
        avgNetPrice,
        avgWholesalePrice,
        avgLanded,
        trueMargin,
        adjustedMargin,
        kulturUnits: data.kulturUnits,
        avgDiscount,
        revenuePct: totalRevenue > 0 ? (data.revenue / totalRevenue) * 100 : 0,
      };
    });

    // Blended totals (aggregate Kultur adjustments across all channels)
    const totalUnits = results.reduce((sum, c) => sum + c.units, 0);
    const totalCost = results.reduce((sum, c) => sum + (c.avgLanded * c.units), 0);
    const totalWholesale = results.reduce((sum, c) => sum + (c.avgWholesalePrice * c.units), 0);
    const totalListPrice = results.reduce((sum, c) => {
      const data = byChannel.get(c.channel);
      return sum + (data?.totalListPrice || 0);
    }, 0);
    const totalKulturUnits = Array.from(byChannel.values()).reduce((s, d) => s + d.kulturUnits, 0);
    const totalKulturRevenue = Array.from(byChannel.values()).reduce((s, d) => s + d.kulturRevenue, 0);
    const totalKulturMsrpValue = Array.from(byChannel.values()).reduce((s, d) => s + d.kulturMsrpValue, 0);
    const blendedAvgNetPrice = totalUnits > 0 ? totalRevenue / totalUnits : 0;
    const blendedAvgLanded = totalUnits > 0 ? totalCost / totalUnits : 0;
    const blendedAvgWholesale = totalUnits > 0 ? totalWholesale / totalUnits : 0;
    const blendedAvgListPrice = totalUnits > 0 ? totalListPrice / totalUnits : 0;
    const blendedMargin = blendedAvgNetPrice > 0 ? ((blendedAvgNetPrice - blendedAvgLanded) / blendedAvgNetPrice) * 100 : 0;
    const blendedDiscount = blendedAvgListPrice > 0 ? ((blendedAvgListPrice - blendedAvgNetPrice) / blendedAvgListPrice) * 100 : 0;

    let blendedAdjustedMargin: number | null = null;
    if (totalKulturUnits > 0 && blendedAvgLanded > 0) {
      const otherRev = totalRevenue - totalKulturRevenue;
      const effectiveRev = otherRev + totalKulturMsrpValue;
      const effectiveCost = totalUnits * blendedAvgLanded;
      if (effectiveRev > 0) {
        blendedAdjustedMargin = ((effectiveRev - effectiveCost) / effectiveRev) * 100;
      }
    }

    return {
      channels: results,
      blended: {
        revenue: totalRevenue,
        units: totalUnits,
        avgNetPrice: blendedAvgNetPrice,
        avgWholesalePrice: blendedAvgWholesale,
        avgLanded: blendedAvgLanded,
        trueMargin: blendedMargin,
        adjustedMargin: blendedAdjustedMargin,
        kulturUnits: totalKulturUnits,
        avgDiscount: blendedDiscount,
      },
    };
  }, [filteredSales, getCost, wholesalePriceLookup, selectedDivision, selectedCategory]);

  // Style-Level Margin Analysis with Channel Mix
  const styleChannelMargins = useMemo<StyleChannelMargin[]>(() => {
    // ── FORECAST BRANCH ──
    // No sales for the selected season — project per-style weighted margin
    // using the basis season's per-channel net-to-list ratios applied to
    // the future season's list prices, weighted by the user's mix.
    if (
      isCurrentForecast &&
      styleLevelSeasonFilter !== 'all' &&
      scenarioBasisSeason &&
      Object.values(basisMetrics).some((m) => m.units > 0)
    ) {
      const futureSeason = styleLevelSeasonFilter;

      // Gather the set of (styleNumber) that have pricing or cost records in the future season.
      const futureStyles = new Map<string, { msrp: number; wholesale: number; landed: number; styleDesc: string; categoryDesc: string; divisionDesc: string; msrpSource: string; wholesaleSource: string; costSource: string; costFallbackSeason?: string }>();

      const addStyle = (styleNumber: string) => {
        if (futureStyles.has(styleNumber)) return;
        const p = products.find((pp) => pp.styleNumber === styleNumber && pp.season === futureSeason)
          || products.find((pp) => pp.styleNumber === styleNumber);
        const pricingRec = pricing.find((pr) => pr.styleNumber === styleNumber && pr.season === futureSeason);
        const costRec = costs.find((cc) => cc.styleNumber === styleNumber && cc.season === futureSeason);

        // MSRP: prefer line list for this season, then pricing, then any product record
        let msrp = 0;
        let msrpSource: 'linelist' | 'pricebyseason' | 'none' = 'none';
        if (p?.msrp) { msrp = p.msrp; msrpSource = 'linelist'; }
        else if (pricingRec?.msrp) { msrp = pricingRec.msrp; msrpSource = 'pricebyseason'; }

        // Wholesale
        let wholesale = 0;
        let wholesaleSource: 'linelist' | 'pricebyseason' | 'none' = 'none';
        if (p?.price) { wholesale = p.price; wholesaleSource = 'linelist'; }
        else if (pricingRec?.price) { wholesale = pricingRec.price; wholesaleSource = 'pricebyseason'; }

        // Landed: for forecast seasons (PLANNING / PRE-BOOK), require the
        // exact Landed Sheet cost. Do NOT fall back to a prior season —
        // that would imply costing we don't actually have. If Landed is
        // missing we fall through to line-list cost only, and if that's
        // also missing the row is excluded.
        let landed = 0;
        let costSource: 'landed' | 'linelist' | 'none' = 'none';
        const costFallbackSeason: string | undefined = undefined;
        if (costRec?.landed && costRec.landed > 0) {
          landed = costRec.landed;
          costSource = 'landed';
        } else if (p?.cost) {
          landed = p.cost;
          costSource = 'linelist';
        }

        futureStyles.set(styleNumber, {
          msrp,
          wholesale,
          landed,
          styleDesc: p?.styleDesc || '',
          categoryDesc: normalizeCategory(p?.categoryDesc ?? '') || '',
          divisionDesc: p?.divisionDesc || '',
          msrpSource,
          wholesaleSource,
          costSource,
          costFallbackSeason,
        });
      };

      pricing.forEach((pr) => { if (pr.season === futureSeason && pr.styleNumber) addStyle(pr.styleNumber); });
      costs.forEach((cc) => { if (cc.season === futureSeason && cc.styleNumber) addStyle(cc.styleNumber); });
      products.forEach((pp) => { if (pp.season === futureSeason && pp.styleNumber) addStyle(pp.styleNumber); });

      const mixTotal = PRIMARY_CHANNELS.reduce((s, c) => s + (effectiveMix[c] ?? 0), 0);

      const results: StyleChannelMargin[] = Array.from(futureStyles.entries()).map(([styleNumber, info]) => {
        // Synthetic per-channel net price for this style in the future season.
        const synthNet: Record<string, number> = {};
        PRIMARY_CHANNELS.forEach((c) => {
          const ratio = basisMetrics[c]?.listPriceRatio ?? 0;
          const list = RETAIL_CHANNELS.has(c) ? info.msrp : info.wholesale;
          synthNet[c] = list > 0 && ratio > 0 ? list * ratio : 0;
        });

        // Weighted avg using effective mix (normalized to sum=1)
        let syntheticAvgNetPrice = 0;
        if (mixTotal > 0) {
          syntheticAvgNetPrice = PRIMARY_CHANNELS.reduce((sum, c) => {
            const weight = (effectiveMix[c] ?? 0) / mixTotal;
            return sum + synthNet[c] * weight;
          }, 0);
        }

        const baselineMargin = info.wholesale > 0 && info.landed > 0
          ? ((info.wholesale - info.landed) / info.wholesale) * 100
          : 0;

        const weightedMargin = syntheticAvgNetPrice > 0 && info.landed > 0
          ? ((syntheticAvgNetPrice - info.landed) / syntheticAvgNetPrice) * 100
          : 0;

        const channelMix: Record<string, { revenue: number; units: number; pct: number; margin: number; avgNetPrice: number }> = {};
        PRIMARY_CHANNELS.forEach((c) => {
          const weightPct = mixTotal > 0 ? ((effectiveMix[c] ?? 0) / mixTotal) * 100 : 0;
          const chAvgNet = synthNet[c];
          const chMargin = chAvgNet > 0 && info.landed > 0
            ? ((chAvgNet - info.landed) / chAvgNet) * 100
            : 0;
          channelMix[c] = {
            revenue: 0,
            units: 0,
            pct: weightPct,
            margin: chMargin,
            avgNetPrice: chAvgNet,
          };
        });

        let costWarning: 'none' | 'above-wholesale' | 'above-msrp' | 'missing' = 'none';
        if (info.landed === 0) costWarning = 'missing';
        else if (info.msrp > 0 && info.landed > info.msrp) costWarning = 'above-msrp';
        else if (info.wholesale > 0 && info.landed > info.wholesale) costWarning = 'above-wholesale';

        return {
          styleNumber,
          styleDesc: info.styleDesc,
          categoryDesc: info.categoryDesc,
          divisionDesc: info.divisionDesc,
          msrp: info.msrp,
          wholesalePrice: info.wholesale,
          landedCost: info.landed,
          msrpSource: info.msrpSource,
          wholesaleSource: info.wholesaleSource,
          costSource: info.costSource,
          costWarning,
          costFallbackSeason: info.costFallbackSeason,
          baselineMargin,
          totalRevenue: 0,
          totalUnits: 0,
          avgNetPrice: syntheticAvgNetPrice,
          weightedMargin,
          marginDelta: weightedMargin - baselineMargin,
          channelMix,
          isProjected: true,
          projectedBasisSeason: scenarioBasisSeason,
        };
      });

      // Apply division/category/search filters (totalRevenue is 0 for all projected rows)
      return results.filter((s) => {
        if (!matchesDivision(s.divisionDesc, selectedDivision)) return false;
        if (s.categoryDesc && !matchesFilter(normalizeCategory(s.categoryDesc), selectedCategory)) return false;
        return s.weightedMargin !== 0 || s.baselineMargin !== 0;
      });
    }

    // ── HISTORICAL BRANCH (original logic) ──
    const byStyle = new Map<string, {
      styleNumber: string;
      styleDesc: string;
      categoryDesc: string;
      divisionDesc: string;
      msrp: number;
      wholesalePrice: number;
      landedCost: number;
      msrpSource: string;
      wholesaleSource: string;
      costSource: string;
      costFallbackSeason?: string;
      channels: Map<string, { revenue: number; units: number }>;
    }>();

    filteredSales.forEach(record => {
      // Apply division/category filters
      if (!matchesDivision(record.divisionDesc, selectedDivision)) return;
      if (!matchesFilter(normalizeCategory(record.categoryDesc), selectedCategory)) return;
      // Apply season filter if not "all"
      if (styleLevelSeasonFilter !== 'all' && record.season !== styleLevelSeasonFilter) return;

      const channel = normalizeCustomerType(record.customerType);
      const costResult = getCost(record.styleNumber, record.season);
      const landedCost = costResult.cost;

      if (!byStyle.has(record.styleNumber)) {
        // Get pricing from products (line list)
        const product = products.find(p => p.styleNumber === record.styleNumber);

        // Track MSRP source
        let msrp = 0;
        let msrpSource: 'linelist' | 'sales' | 'pricebyseason' | 'none' = 'none';
        if (product?.msrp) {
          msrp = product.msrp;
          msrpSource = 'linelist';
        }

        // Track Wholesale source
        let wholesalePrice = 0;
        let wholesaleSource: 'linelist' | 'sales' | 'pricebyseason' | 'none' = 'none';
        if (product?.price) {
          wholesalePrice = product.price;
          wholesaleSource = 'linelist';
        } else if (record.wholesalePrice) {
          wholesalePrice = record.wholesalePrice;
          wholesaleSource = 'sales';
        }

        // Track Cost source
        let cost = 0;
        let costSource: 'landed' | 'linelist' | 'none' = 'none';
        let costFallbackSeason: string | undefined;
        if (landedCost > 0) {
          cost = landedCost;
          costSource = 'landed';
          if (costResult.source === 'fallback') {
            costFallbackSeason = costResult.fallbackSeason;
          }
        } else if (product?.cost) {
          cost = product.cost;
          costSource = 'linelist';
        }

        byStyle.set(record.styleNumber, {
          styleNumber: record.styleNumber,
          styleDesc: record.styleDesc || '',
          categoryDesc: normalizeCategory(record.categoryDesc) || '',
          divisionDesc: record.divisionDesc || '',
          msrp,
          wholesalePrice,
          landedCost: cost,
          msrpSource,
          wholesaleSource,
          costSource,
          costFallbackSeason,
          channels: new Map(),
        });
      }

      const style = byStyle.get(record.styleNumber)!;
      if (!style.channels.has(channel)) {
        style.channels.set(channel, { revenue: 0, units: 0 });
      }

      const channelData = style.channels.get(channel)!;
      channelData.revenue += record.revenue || 0;
      channelData.units += record.unitsBooked || 0;
    });

    // Calculate margins for each style
    const results: StyleChannelMargin[] = Array.from(byStyle.values()).map(style => {
      const totalRevenue = Array.from(style.channels.values()).reduce((sum, c) => sum + c.revenue, 0);
      const totalUnits = Array.from(style.channels.values()).reduce((sum, c) => sum + c.units, 0);
      const avgNetPrice = totalUnits > 0 ? totalRevenue / totalUnits : 0;

      // Baseline margin: using wholesale price
      const baselineMargin = style.wholesalePrice > 0 && style.landedCost > 0
        ? ((style.wholesalePrice - style.landedCost) / style.wholesalePrice) * 100
        : 0;

      // Weighted margin: using actual avg net price (channel-mix weighted)
      const weightedMargin = avgNetPrice > 0 && style.landedCost > 0
        ? ((avgNetPrice - style.landedCost) / avgNetPrice) * 100
        : 0;

      // Channel mix breakdown
      const channelMix: Record<string, { revenue: number; units: number; pct: number; margin: number; avgNetPrice: number }> = {};
      PRIMARY_CHANNELS.forEach(ch => {
        const data = style.channels.get(ch) || { revenue: 0, units: 0 };
        const chAvgNetPrice = data.units > 0 ? data.revenue / data.units : 0;
        const chMargin = chAvgNetPrice > 0 && style.landedCost > 0
          ? ((chAvgNetPrice - style.landedCost) / chAvgNetPrice) * 100
          : 0;

        channelMix[ch] = {
          revenue: data.revenue,
          units: data.units,
          pct: totalRevenue > 0 ? (data.revenue / totalRevenue) * 100 : 0,
          margin: chMargin,
          avgNetPrice: chAvgNetPrice,
        };
      });

      // Cost validation
      let costWarning: 'none' | 'above-wholesale' | 'above-msrp' | 'missing' = 'none';
      if (style.landedCost === 0) {
        costWarning = 'missing';
      } else if (style.msrp > 0 && style.landedCost > style.msrp) {
        costWarning = 'above-msrp';
      } else if (style.wholesalePrice > 0 && style.landedCost > style.wholesalePrice) {
        costWarning = 'above-wholesale';
      }

      return {
        styleNumber: style.styleNumber,
        styleDesc: style.styleDesc,
        categoryDesc: style.categoryDesc,
        divisionDesc: style.divisionDesc,
        msrp: style.msrp,
        wholesalePrice: style.wholesalePrice,
        landedCost: style.landedCost,
        msrpSource: style.msrpSource,
        wholesaleSource: style.wholesaleSource,
        costSource: style.costSource,
        costWarning,
        costFallbackSeason: style.costFallbackSeason,
        baselineMargin,
        totalRevenue,
        totalUnits,
        avgNetPrice,
        weightedMargin,
        marginDelta: weightedMargin - baselineMargin,
        channelMix,
      };
    });

    return results.filter(s => s.totalRevenue > 0);
  }, [
    filteredSales,
    getCost,
    products,
    selectedDivision,
    selectedCategory,
    styleLevelSeasonFilter,
    // Forecast-branch deps
    isCurrentForecast,
    scenarioBasisSeason,
    basisMetrics,
    effectiveMix,
    pricing,
    costs,
    RETAIL_CHANNELS,
  ]);

  // Customer breakdown for drill-down - with filters
  const customerBreakdown = useMemo(() => {
    const byCustomer = new Map<string, { customer: string; customerType: string; revenue: number; units: number; totalCost: number }>();

    filteredSales.forEach(record => {
      if (!matchesDivision(record.divisionDesc, selectedDivision)) return;
      if (!matchesFilter(normalizeCategory(record.categoryDesc), selectedCategory)) return;

      // Apply customer type filter if set
      const type = normalizeCustomerType(record.customerType);
      if (customerTypeFilters.length > 0 && !customerTypeFilters.includes(type)) return;

      // Use customer name, or fallback to "Unknown (Type)"
      const customer = record.customer && record.customer.trim()
        ? record.customer.trim()
        : `Unknown (${type})`;
      const landedCost = getCost(record.styleNumber, record.season).cost;
      const units = record.unitsBooked || 0;

      if (!byCustomer.has(customer)) {
        byCustomer.set(customer, {
          customer,
          customerType: type,
          revenue: 0,
          units: 0,
          totalCost: 0,
        });
      }

      const entry = byCustomer.get(customer)!;
      entry.revenue += record.revenue || 0;
      entry.units += units;
      entry.totalCost += units * landedCost;
    });

    const results = Array.from(byCustomer.values())
      .map(c => ({
        customer: c.customer,
        customerType: c.customerType,
        revenue: c.revenue,
        units: c.units,
        avgNetPrice: c.units > 0 ? c.revenue / c.units : 0,
        margin: c.units > 0 && c.totalCost > 0
          ? (((c.revenue / c.units) - (c.totalCost / c.units)) / (c.revenue / c.units)) * 100
          : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    // Apply showTopN limit (0 = show all)
    return showTopN > 0 ? results.slice(0, showTopN) : results;
  }, [filteredSales, getCost, selectedDivision, selectedCategory, customerTypeFilters, showTopN]);

  // Calculate margins by style
  const styleMargins = useMemo(() => {
    const byStyle = new Map<string, StyleMargin>();

    filteredSales.forEach(record => {
      const cost = getCost(record.styleNumber, record.season).cost;

      if (!byStyle.has(record.styleNumber)) {
        byStyle.set(record.styleNumber, {
          styleNumber: record.styleNumber,
          styleDesc: record.styleDesc || '',
          categoryDesc: normalizeCategory(record.categoryDesc) || '',
          divisionDesc: record.divisionDesc || '',
          gender: (record as any).gender || '',
          revenue: 0,
          units: 0,
          cost: cost,
          cogs: 0,
          gross: 0,
          margin: 0,
          vsTarget: 0,
        });
      }

      const style = byStyle.get(record.styleNumber)!;
      style.revenue += record.revenue || 0;
      style.units += record.unitsBooked || 0;
      style.cogs += (record.unitsBooked || 0) * cost;
    });

    // Calculate final margins
    return Array.from(byStyle.values()).map(s => {
      s.gross = s.revenue - s.cogs;
      s.margin = s.revenue > 0 ? (s.gross / s.revenue) * 100 : 0;
      s.vsTarget = s.margin - TARGET_MARGIN;
      return s;
    });
  }, [filteredSales, getCost]);

  // Apply filters (division, category, tier, channel)
  const filteredStyleMargins = useMemo(() => {
    return styleMargins.filter(s => {
      if (!matchesDivision(s.divisionDesc, selectedDivision)) return false;
      if (!matchesFilter(s.categoryDesc, selectedCategory)) return false;
      if (selectedCategoryFilter && s.categoryDesc !== selectedCategoryFilter) return false;
      if (selectedTier) {
        const tier = getMarginTier(s.margin);
        if (tier !== selectedTier) return false;
      }
      return true;
    });
  }, [styleMargins, selectedDivision, selectedCategory, selectedCategoryFilter, selectedTier]);

  // Filter style channel margins with search
  const filteredStyleChannelMargins = useMemo(() => {
    return styleChannelMargins.filter(s => {
      // Search filter - match style number or description
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesStyle = s.styleNumber.toLowerCase().includes(query);
        const matchesDesc = s.styleDesc.toLowerCase().includes(query);
        if (!matchesStyle && !matchesDesc) return false;
      }
      if (selectedCategoryFilter && s.categoryDesc !== selectedCategoryFilter) return false;
      if (selectedTier) {
        const tier = getMarginTier(s.weightedMargin);
        if (tier !== selectedTier) return false;
      }
      return true;
    });
  }, [styleChannelMargins, selectedCategoryFilter, selectedTier, searchQuery]);

  // Sort styles (traditional view)
  const sortedStyles = useMemo(() => {
    const sorted = [...filteredStyleMargins].sort((a, b) => {
      let aVal: number | string = a[sortField as keyof StyleMargin] as number | string;
      let bVal: number | string = b[sortField as keyof StyleMargin] as number | string;

      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = (bVal as string).toLowerCase();
        return sortDirection === 'asc'
          ? aVal.localeCompare(bVal as string)
          : (bVal as string).localeCompare(aVal);
      }

      return sortDirection === 'asc' ? aVal - (bVal as number) : (bVal as number) - aVal;
    });
    return sorted;
  }, [filteredStyleMargins, sortField, sortDirection]);

  // Sort style channel margins
  const sortedStyleChannelMargins = useMemo(() => {
    const sorted = [...filteredStyleChannelMargins].sort((a, b) => {
      const field = sortField as keyof StyleChannelMargin;
      let aVal = a[field];
      let bVal = b[field];

      if (typeof aVal === 'string') {
        return sortDirection === 'asc'
          ? (aVal as string).toLowerCase().localeCompare((bVal as string).toLowerCase())
          : (bVal as string).toLowerCase().localeCompare((aVal as string).toLowerCase());
      }

      if (typeof aVal === 'number') {
        return sortDirection === 'asc' ? aVal - (bVal as number) : (bVal as number) - aVal;
      }

      return 0;
    });
    return sorted;
  }, [filteredStyleChannelMargins, sortField, sortDirection]);

  // Calculate summary stats
  const stats = useMemo(() => {
    const totalRevenue = filteredStyleMargins.reduce((sum, s) => sum + s.revenue, 0);
    const totalCogs = filteredStyleMargins.reduce((sum, s) => sum + s.cogs, 0);
    const totalGross = totalRevenue - totalCogs;
    const overallMargin = totalRevenue > 0 ? (totalGross / totalRevenue) * 100 : 0;
    const markup = totalCogs > 0 ? (totalGross / totalCogs) * 100 : 0;

    return { totalRevenue, totalCogs, totalGross, overallMargin, markup };
  }, [filteredStyleMargins]);

  // Margin health distribution
  const marginHealth = useMemo(() => {
    const tiers = { excellent: 0, target: 0, watch: 0, problem: 0 };
    filteredStyleMargins.forEach(s => {
      const tier = getMarginTier(s.margin);
      tiers[tier]++;
    });
    const total = filteredStyleMargins.length || 1;
    return {
      excellent: { count: tiers.excellent, pct: (tiers.excellent / total) * 100 },
      target: { count: tiers.target, pct: (tiers.target / total) * 100 },
      watch: { count: tiers.watch, pct: (tiers.watch / total) * 100 },
      problem: { count: tiers.problem, pct: (tiers.problem / total) * 100 },
    };
  }, [filteredStyleMargins]);

  // Margins by category
  const categoryMargins = useMemo(() => {
    const byCategory = new Map<string, CategoryMargin>();

    filteredStyleMargins.forEach(s => {
      const cat = s.categoryDesc || 'Unknown';
      if (!byCategory.has(cat)) {
        byCategory.set(cat, { category: cat, revenue: 0, cogs: 0, gross: 0, margin: 0 });
      }
      const entry = byCategory.get(cat)!;
      entry.revenue += s.revenue;
      entry.cogs += s.cogs;
    });

    return Array.from(byCategory.values())
      .map(c => {
        c.gross = c.revenue - c.cogs;
        c.margin = c.revenue > 0 ? (c.gross / c.revenue) * 100 : 0;
        return c;
      })
      .sort((a, b) => b.margin - a.margin)
      .slice(0, 8);
  }, [filteredStyleMargins]);

  // Margins by channel
  const channelMargins = useMemo(() => {
    const byChannel = new Map<string, ChannelMargin>();

    // Need to go back to raw sales data for channel info
    filteredSales.forEach(record => {
      // Apply division/category filters
      if (!matchesDivision(record.divisionDesc, selectedDivision)) return;
      if (!matchesFilter(normalizeCategory(record.categoryDesc), selectedCategory)) return;

      const channel = record.customerType || 'Other';
      const cost = getCost(record.styleNumber, record.season).cost;

      if (!byChannel.has(channel)) {
        byChannel.set(channel, {
          channel,
          channelName: CHANNEL_LABELS[channel] || channel,
          revenue: 0,
          cogs: 0,
          gross: 0,
          margin: 0,
        });
      }

      const entry = byChannel.get(channel)!;
      entry.revenue += record.revenue || 0;
      entry.cogs += (record.unitsBooked || 0) * cost;
    });

    return Array.from(byChannel.values())
      .map(c => {
        c.gross = c.revenue - c.cogs;
        c.margin = c.revenue > 0 ? (c.gross / c.revenue) * 100 : 0;
        return c;
      })
      .sort((a, b) => b.margin - a.margin);
  }, [filteredSales, getCost, selectedDivision, selectedCategory]);

  // Margins by gender
  const genderMargins = useMemo(() => {
    const byGender = new Map<string, GenderMargin>();

    filteredStyleMargins.forEach(s => {
      const gender = s.gender || 'Unknown';
      if (!byGender.has(gender)) {
        byGender.set(gender, { gender, revenue: 0, cogs: 0, gross: 0, margin: 0 });
      }
      const entry = byGender.get(gender)!;
      entry.revenue += s.revenue;
      entry.cogs += s.cogs;
    });

    return Array.from(byGender.values())
      .map(g => {
        g.gross = g.revenue - g.cogs;
        g.margin = g.revenue > 0 ? (g.gross / g.revenue) * 100 : 0;
        return g;
      })
      .filter(g => g.gender !== 'Unknown' && g.revenue > 0)
      .sort((a, b) => b.margin - a.margin);
  }, [filteredStyleMargins]);

  // Top and bottom margin styles
  const topStyles = useMemo(() => {
    return [...filteredStyleMargins]
      .filter(s => s.revenue > 0)
      .sort((a, b) => b.margin - a.margin)
      .slice(0, 5);
  }, [filteredStyleMargins]);

  const bottomStyles = useMemo(() => {
    return [...filteredStyleMargins]
      .filter(s => s.revenue > 0)
      .sort((a, b) => a.margin - b.margin)
      .slice(0, 5);
  }, [filteredStyleMargins]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const handleTierClick = (tier: string) => {
    setSelectedTier(selectedTier === tier ? null : tier);
  };

  const handleCategoryClick = (category: string) => {
    setSelectedCategoryFilter(selectedCategoryFilter === category ? null : category);
  };

  const clearFilters = () => {
    setSelectedTier(null);
    setSelectedChannel(null);
    setSelectedCategoryFilter(null);
    setSelectedCustomerType(null);
    setSelectedCustomer(null);
  };

  const toggleStyleExpand = (styleNumber: string) => {
    setExpandedStyle(expandedStyle === styleNumber ? null : styleNumber);
  };

  const hasActiveFilters = selectedTier || selectedCategoryFilter || selectedCustomerType || selectedCustomer;

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? (
      <ChevronUp className="w-4 h-4 inline ml-1" />
    ) : (
      <ChevronDown className="w-4 h-4 inline ml-1" />
    );
  };

  // Export data based on current view mode
  const handleExport = () => {
    if (viewMode === 'channel') {
      // Export style-level channel analysis
      exportToExcel(
        styleChannelMargins.map(style => ({
          Season: styleLevelSeasonFilter === 'all' ? 'ALL' : styleLevelSeasonFilter,
          Style: style.styleNumber,
          Description: style.styleDesc,
          Category: style.categoryDesc,
          Division: style.divisionDesc,
          MSRP: style.msrp.toFixed(2),
          Wholesale: style.wholesalePrice.toFixed(2),
          'Net Price': style.avgNetPrice.toFixed(2),
          Cost: style.landedCost.toFixed(2),
          'Baseline Margin %': style.baselineMargin.toFixed(1),
          'Weighted Margin %': style.weightedMargin.toFixed(1),
          'Margin Delta': style.marginDelta.toFixed(1),
          Revenue: style.totalRevenue.toFixed(2),
          Units: style.totalUnits,
          'Avg Net Price': style.avgNetPrice.toFixed(2),
        })),
        `margins_channel_analysis_${styleLevelSeasonFilter}`
      );
    } else {
      // Export traditional margin analysis
      exportToExcel(
        styleMargins.map(style => ({
          Season: selectedSeason || 'ALL',
          Style: style.styleNumber,
          Description: style.styleDesc,
          Category: style.categoryDesc,
          Division: style.divisionDesc,
          Gender: style.gender,
          Revenue: style.revenue.toFixed(2),
          Units: style.units,
          Cost: style.cost.toFixed(2),
          COGS: style.cogs.toFixed(2),
          'Gross Profit': style.gross.toFixed(2),
          'Margin %': style.margin.toFixed(1),
          'vs Target': style.vsTarget.toFixed(1),
        })),
        `margins_traditional_${selectedSeason || 'all'}`
      );
    }
  };

  return (
    <div className="p-6 space-y-6">
      <SalesLoadingBanner />
      {/* Header with View Toggle */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-4xl font-display font-bold text-text-primary">
            Margin Analysis: {selectedSeason || 'All Seasons'}
          </h2>
          <p className="text-base text-text-muted mt-2">
            True margin analysis using actual sales prices by channel
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode('channel')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                viewMode === 'channel'
                  ? 'bg-cyan-600 text-white'
                  : 'bg-surface-tertiary text-text-secondary hover:bg-surface-tertiary'
              }`}
            >
              Channel Analysis
            </button>
            <button
              onClick={() => setViewMode('traditional')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                viewMode === 'traditional'
                  ? 'bg-cyan-600 text-white'
                : 'bg-surface-tertiary text-text-secondary hover:bg-surface-tertiary'
            }`}
          >
            Traditional View
          </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-5 py-3 bg-emerald-500 hover:bg-emerald-600 text-white text-base font-bold rounded-xl transition-colors shadow-lg"
              title="Export current table to a single-sheet xlsx"
            >
              <Download className="w-5 h-5" />
              Export Data
            </button>
            <button
              onClick={() => {
                exportCostingMargins({
                  products,
                  pricing,
                  costs,
                  sales,
                  seasonFilter:
                    styleLevelSeasonFilter !== 'all' ? [styleLevelSeasonFilter] : undefined,
                  divisionFilter: selectedDivision || undefined,
                  categoryFilter: selectedCategory || undefined,
                  scenario:
                    isCurrentForecast && scenarioBasisSeason
                      ? { basisSeason: scenarioBasisSeason, effectiveMix }
                      : undefined,
                });
              }}
              title="Export full Costing + Margins workbook (Detail / Style Summary / Season Totals / Scenario)"
              className="flex items-center gap-2 px-5 py-3 bg-cyan-600 hover:bg-cyan-500 text-white text-base font-bold rounded-xl transition-colors shadow-lg"
            >
              <Download className="w-5 h-5" />
              Costing + Margins
            </button>
          </div>
        </div>
      </div>


      {/* Channel Summary Cards */}
      {viewMode === 'channel' && (
        <>
          <div className="grid grid-cols-6 gap-3">
            {/* Channel Cards - Fixed order with BB first */}
            {(() => {
              // Define fixed channel order (BB first, then by typical importance)
              const channelOrder = ['BB', 'WH', 'WD', 'EC', 'PS', 'KI'];

              // Sort channels by fixed order
              const sortedChannels = channelPerformance.channels
                .slice() // Create a copy to avoid mutating original
                .sort((a, b) => {
                  const aIndex = channelOrder.indexOf(a.channel);
                  const bIndex = channelOrder.indexOf(b.channel);
                  if (aIndex === -1) return 1;
                  if (bIndex === -1) return -1;
                  return aIndex - bIndex;
                })
                .slice(0, 5);

              return sortedChannels.map(channel => {
              const colors = CHANNEL_COLORS[channel.channel] || { bg: 'bg-gray-600', text: 'text-text-secondary', light: 'bg-surface-tertiary' };
              const isSelected = selectedCustomerType === channel.channel;

              return (
                <button
                  key={channel.channel}
                  onClick={() => setSelectedCustomerType(isSelected ? null : channel.channel)}
                  className={`rounded-xl border-2 p-4 shadow-sm transition-all text-left ${
                    isSelected
                      ? `${colors.light} border-border-strong`
                      : 'bg-surface border-border-primary hover:border-border-strong'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-8 h-8 rounded-lg ${isSelected ? 'bg-surface' : colors.light} flex items-center justify-center ${colors.text}`}>
                      {CHANNEL_ICONS[channel.channel] || <DollarSign className="w-4 h-4" />}
                    </div>
                    <div className="text-xs font-bold text-text-secondary uppercase tracking-wide">
                      {channel.channel}
                    </div>
                  </div>
                  <p className={`text-2xl font-bold font-mono ${channel.trueMargin >= TARGET_MARGIN ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                    {formatPercent(channel.trueMargin)}
                  </p>
                  {channel.adjustedMargin !== null && channel.kulturUnits > 0 && (
                    <p
                      className="text-[11px] text-cyan-600 dark:text-cyan-400 font-mono mt-0.5 flex items-center gap-1"
                      title={`Retail-adjusted: ${formatNumber(channel.kulturUnits)} KUHL Kultur units re-valued at MSRP`}
                    >
                      <Sparkles className="w-3 h-3" />
                      Retail: {formatPercent(channel.adjustedMargin)}
                    </p>
                  )}
                  <p className="text-xs text-text-muted mt-1">
                    {formatCurrencyShort(channel.revenue)} · {channel.revenuePct.toFixed(0)}%
                  </p>
                </button>
              );
            });
            })()}

            {/* Blended Card */}
            <div className="bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 rounded-xl border-2 border-gray-300 dark:border-gray-700 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-surface/10 flex items-center justify-center">
                  <Percent className="w-4 h-4 text-white" />
                </div>
                <div className="text-xs font-bold text-text-faint uppercase tracking-wide">
                  BLENDED
                </div>
              </div>
              <p className={`text-2xl font-bold font-mono ${channelPerformance.blended.trueMargin >= TARGET_MARGIN ? 'text-emerald-400' : 'text-amber-400'}`}>
                {formatPercent(channelPerformance.blended.trueMargin)}
              </p>
              {channelPerformance.blended.adjustedMargin !== null &&
                channelPerformance.blended.kulturUnits > 0 && (
                  <p
                    className="text-[11px] text-cyan-600 dark:text-cyan-400 font-mono mt-0.5 flex items-center gap-1"
                    title={`Retail-adjusted: ${formatNumber(channelPerformance.blended.kulturUnits)} KUHL Kultur units re-valued at MSRP`}
                  >
                    <Sparkles className="w-3 h-3" />
                    Retail: {formatPercent(channelPerformance.blended.adjustedMargin)}
                  </p>
                )}
              <p className="text-xs text-text-faint mt-1">
                {formatCurrencyShort(channelPerformance.blended.revenue)} total
              </p>
            </div>
          </div>

          {/* Filters Row */}
          {hasActiveFilters && (
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="w-4 h-4 text-text-muted" />
              <span className="text-sm text-text-muted">Active filters:</span>
              {selectedCustomerType && (
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-cyan-100 dark:bg-cyan-900 text-cyan-700 dark:text-cyan-300 rounded-full text-sm font-medium">
                  {CHANNEL_LABELS[selectedCustomerType] || selectedCustomerType}
                  <button onClick={() => setSelectedCustomerType(null)} className="hover:text-cyan-900">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {selectedCustomer && (
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-400 rounded-full text-sm font-medium">
                  {selectedCustomer}
                  <button onClick={() => setSelectedCustomer(null)} className="hover:text-purple-900">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {selectedTier && (
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 rounded-full text-sm font-medium">
                  {selectedTier}
                  <button onClick={() => setSelectedTier(null)} className="hover:text-amber-900">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {selectedCategoryFilter && (
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded-full text-sm font-medium">
                  {selectedCategoryFilter}
                  <button onClick={() => setSelectedCategoryFilter(null)} className="hover:text-green-900">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              <button
                onClick={clearFilters}
                className="text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 font-medium ml-2"
              >
                Clear all
              </button>
            </div>
          )}

          {/* Channel Performance Table */}
          <div className="bg-surface rounded-xl border-2 border-border-primary shadow-sm">
            <div className="px-6 py-4 border-b-2 border-border-primary">
              <h3 className="text-xl font-bold text-text-primary">Channel Performance</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-border-primary bg-surface-secondary">
                    <th className="px-4 py-3 text-left text-sm font-bold text-text-secondary uppercase tracking-wide">Channel</th>
                    <th className="px-4 py-3 text-right text-sm font-bold text-text-secondary uppercase tracking-wide">Revenue</th>
                    <th className="px-4 py-3 text-right text-sm font-bold text-text-secondary uppercase tracking-wide">Units</th>
                    <th className="px-4 py-3 text-right text-sm font-bold text-text-secondary uppercase tracking-wide">Avg Wholesale</th>
                    <th className="px-4 py-3 text-right text-sm font-bold text-text-secondary uppercase tracking-wide">Avg Net Price</th>
                    <th className="px-4 py-3 text-right text-sm font-bold text-text-secondary uppercase tracking-wide">Avg Discount</th>
                    <th className="px-4 py-3 text-right text-sm font-bold text-text-secondary uppercase tracking-wide">Avg Landed</th>
                    <th className="px-4 py-3 text-right text-sm font-bold text-text-secondary uppercase tracking-wide">True Margin</th>
                    <th className="px-4 py-3 text-right text-sm font-bold text-text-secondary uppercase tracking-wide">Rev Mix</th>
                  </tr>
                </thead>
                <tbody>
                  {channelPerformance.channels.map((channel, index) => {
                    const colors = CHANNEL_COLORS[channel.channel] || { bg: 'bg-gray-600', text: 'text-text-secondary', light: 'bg-surface-tertiary' };
                    const isSelected = selectedCustomerType === channel.channel;
                    return (
                      <tr
                        key={channel.channel}
                        onClick={() => setSelectedCustomerType(selectedCustomerType === channel.channel ? null : channel.channel)}
                        className={`border-b border-border-secondary cursor-pointer transition-colors ${
                          isSelected ? colors.light : 'hover:bg-hover'
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded ${colors.light} flex items-center justify-center ${colors.text}`}>
                              {CHANNEL_ICONS[channel.channel]}
                            </div>
                            <div>
                              <span className="font-semibold text-text-primary">{channel.channelName}</span>
                              <span className="text-xs text-text-muted ml-2">({channel.channel})</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-medium text-text-primary">
                          {formatCurrencyShort(channel.revenue)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-text-secondary">
                          {formatNumber(channel.units)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-text-secondary">
                          {formatCurrency(channel.avgWholesalePrice)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-text-primary">
                          {formatCurrency(channel.avgNetPrice)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-mono text-sm ${channel.avgDiscount > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                            {channel.avgDiscount > 0 ? '-' : '+'}{Math.abs(channel.avgDiscount).toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-text-secondary">
                          {formatCurrency(channel.avgLanded)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-mono font-bold px-2 py-1 rounded ${getMarginColor(channel.trueMargin)}`}>
                            {formatPercent(channel.trueMargin)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 h-2 bg-surface-tertiary rounded-full overflow-hidden">
                              <div
                                className={`h-full ${colors.bg}`}
                                style={{ width: `${Math.min(channel.revenuePct, 100)}%` }}
                              />
                            </div>
                            <span className="font-mono text-sm text-text-secondary w-12 text-right">
                              {channel.revenuePct.toFixed(0)}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {/* Blended Total Row */}
                  <tr className="bg-surface-tertiary font-semibold">
                    <td className="px-4 py-3">
                      <span className="font-bold text-text-primary">BLENDED TOTAL</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-text-primary">
                      {formatCurrencyShort(channelPerformance.blended.revenue)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-text-primary">
                      {formatNumber(channelPerformance.blended.units)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-text-secondary">
                      {formatCurrency(channelPerformance.blended.avgWholesalePrice)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-text-primary">
                      {formatCurrency(channelPerformance.blended.avgNetPrice)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-mono font-bold text-sm ${channelPerformance.blended.avgDiscount > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                        {channelPerformance.blended.avgDiscount > 0 ? '-' : '+'}{Math.abs(channelPerformance.blended.avgDiscount).toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-text-secondary">
                      {formatCurrency(channelPerformance.blended.avgLanded)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-mono font-bold px-3 py-1 rounded ${getMarginColor(channelPerformance.blended.trueMargin)}`}>
                        {formatPercent(channelPerformance.blended.trueMargin)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-text-primary">
                      100%
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Customer Breakdown with Filters */}
          <div className="bg-surface rounded-xl border-2 border-border-primary shadow-sm">
            <div className="px-6 py-4 border-b-2 border-border-primary">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-text-primary">Top Customers by Revenue</h3>
                <div className="flex items-center gap-4">
                  {/* Channel Type Filter Buttons */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-text-muted">Channel:</span>
                    <button
                      onClick={() => setCustomerTypeFilters([])}
                      className={`px-2 py-1 text-xs font-semibold rounded ${
                        customerTypeFilters.length === 0 ? 'bg-cyan-600 text-white' : 'bg-surface-tertiary text-text-secondary hover:bg-surface-tertiary'
                      }`}
                    >
                      All
                    </button>
                    {PRIMARY_CHANNELS.map(type => {
                      const isActive = customerTypeFilters.includes(type);
                      const colors = CHANNEL_COLORS[type] || { bg: 'bg-gray-600', light: 'bg-surface-tertiary' };
                      return (
                        <button
                          key={type}
                          onClick={() => {
                            if (isActive) {
                              setCustomerTypeFilters(customerTypeFilters.filter(t => t !== type));
                            } else {
                              setCustomerTypeFilters([...customerTypeFilters, type]);
                            }
                          }}
                          className={`px-2 py-1 text-xs font-semibold rounded transition-colors ${
                            isActive ? `${colors.bg} text-white` : `${colors.light} text-text-secondary hover:opacity-80`
                          }`}
                        >
                          {CHANNEL_LABELS[type] || type}
                        </button>
                      );
                    })}
                  </div>
                  {/* Show Top N Selector */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-text-muted">Show:</span>
                    <select
                      value={showTopN}
                      onChange={(e) => setShowTopN(Number(e.target.value))}
                      className="text-sm border border-border-strong rounded px-2 py-1"
                    >
                      <option value={10}>Top 10</option>
                      <option value={25}>Top 25</option>
                      <option value={50}>Top 50</option>
                      <option value={0}>All</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-border-primary bg-surface-secondary">
                    <th className="px-4 py-3 text-left text-sm font-bold text-text-secondary uppercase tracking-wide">Customer</th>
                    <th className="px-4 py-3 text-left text-sm font-bold text-text-secondary uppercase tracking-wide">Type</th>
                    <th className="px-4 py-3 text-right text-sm font-bold text-text-secondary uppercase tracking-wide">Revenue</th>
                    <th className="px-4 py-3 text-right text-sm font-bold text-text-secondary uppercase tracking-wide">Units</th>
                    <th className="px-4 py-3 text-right text-sm font-bold text-text-secondary uppercase tracking-wide">Avg Net Price</th>
                    <th className="px-4 py-3 text-right text-sm font-bold text-text-secondary uppercase tracking-wide">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {customerBreakdown.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-text-muted">
                        No customers found with selected filters
                      </td>
                    </tr>
                  ) : (
                    customerBreakdown.map((customer, index) => {
                      const typeColors = CHANNEL_COLORS[customer.customerType] || { bg: 'bg-gray-600', light: 'bg-surface-tertiary', text: 'text-text-secondary' };
                      return (
                        <tr
                          key={`${customer.customer}-${index}`}
                          onClick={() => setSelectedCustomer(selectedCustomer === customer.customer ? null : customer.customer)}
                          className={`border-b border-border-secondary cursor-pointer transition-colors ${
                            selectedCustomer === customer.customer ? 'bg-purple-50 dark:bg-purple-950' : 'hover:bg-hover'
                          }`}
                        >
                          <td className="px-4 py-3 font-medium text-text-primary">{customer.customer}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-semibold px-2 py-1 rounded ${typeColors.light} ${typeColors.text}`}>
                              {customer.customerType}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-text-primary">{formatCurrencyShort(customer.revenue)}</td>
                          <td className="px-4 py-3 text-right font-mono text-text-secondary">{formatNumber(customer.units)}</td>
                          <td className="px-4 py-3 text-right font-mono text-text-primary">{formatCurrency(customer.avgNetPrice)}</td>
                          <td className="px-4 py-3 text-right">
                            <span className={`font-mono font-semibold px-2 py-1 rounded ${getMarginColor(customer.margin)}`}>
                              {formatPercent(customer.margin)}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Style-Level Margin Analysis */}
          <div className="bg-surface rounded-xl border-2 border-border-primary shadow-sm">
            <div className="px-6 py-4 border-b-2 border-border-strong bg-surface-tertiary">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-xl font-bold text-text-primary">Style-Level Margin Analysis</h3>
                  <p className="text-sm text-text-muted mt-1">
                    Baseline (wholesale) vs Weighted (actual sales mix) margin comparison
                  </p>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="flex items-center gap-1">
                    <span className="text-emerald-600 dark:text-emerald-400">🟢</span> Above baseline
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="text-red-600 dark:text-red-400">🔴</span> Below baseline
                  </span>
                  <span className="text-text-muted">
                    {formatNumber(sortedStyleChannelMargins.length)} styles
                  </span>
                  {sortedStyleChannelMargins.filter(s => s.costWarning === 'above-wholesale' || s.costWarning === 'above-msrp').length > 0 && (
                    <span className="text-amber-400 text-xs font-medium" title="Styles with suspect cost data">
                      ⚠️ {sortedStyleChannelMargins.filter(s => s.costWarning === 'above-wholesale' || s.costWarning === 'above-msrp').length} suspect costs
                    </span>
                  )}
                </div>
              </div>
              {/* Season Filter Pills */}
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span className="text-xs text-text-muted font-medium">Season:</span>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => setStyleLevelSeasonFilter('all')}
                    className={`px-3 py-1 text-xs font-semibold rounded-full transition-colors ${
                      styleLevelSeasonFilter === 'all'
                        ? 'bg-cyan-600 text-white'
                        : 'bg-surface-tertiary text-text-secondary hover:bg-gray-300 dark:hover:bg-gray-700'
                    }`}
                  >
                    All Seasons
                  </button>
                  {allSeasons.map(season => {
                    const isForecast = !seasonsWithSales.has(season);
                    const active = styleLevelSeasonFilter === season;
                    return (
                      <button
                        key={season}
                        onClick={() => setStyleLevelSeasonFilter(season)}
                        className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-full transition-colors ${
                          active
                            ? 'bg-cyan-600 text-white'
                            : isForecast
                            ? 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/20'
                            : 'bg-surface-tertiary text-text-secondary hover:bg-gray-300 dark:hover:bg-gray-700'
                        }`}
                        title={isForecast ? 'No sales yet — projected scenario' : undefined}
                      >
                        {isForecast && <Sparkles className="w-3 h-3" />}
                        {season}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Scenario Panel (only for forecast seasons) */}
              {isCurrentForecast && scenarioBasisSeason && (
                <MarginScenarioPanel
                  futureSeason={styleLevelSeasonFilter}
                  availableBasisSeasons={availableBasisSeasons}
                  basisSeason={scenarioBasisSeason}
                  onBasisChange={(s) => {
                    setScenarioBasisSeason(s);
                    setScenarioMixOverride(null);
                  }}
                  basisMetrics={basisMetrics}
                  primaryChannels={PRIMARY_CHANNELS}
                  channelLabels={CHANNEL_LABELS}
                  channelColors={CHANNEL_COLORS}
                  mix={effectiveMix}
                  naturalMix={naturalMix}
                  isOverridden={scenarioMixOverride !== null}
                  onMixChange={setScenarioMixOverride}
                  onReset={() => setScenarioMixOverride(null)}
                />
              )}
              {/* Channel Mix Legend */}
              <div className="flex items-center gap-4 mb-3 text-xs">
                <span className="text-text-muted font-medium">Channel Mix:</span>
                {PRIMARY_CHANNELS.map(ch => {
                  const colors = CHANNEL_COLORS[ch];
                  return (
                    <span key={ch} className="flex items-center gap-1">
                      <span className={`w-3 h-3 rounded ${colors.bg}`}></span>
                      <span className="text-text-secondary">{CHANNEL_LABELS[ch]}</span>
                    </span>
                  );
                })}
              </div>
              {/* Data Source Legend */}
              <div className="flex items-center gap-4 mb-3 text-xs">
                <span className="text-text-muted font-medium">Price Source:</span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-full bg-blue-500"></span>
                  <span className="text-text-secondary">Line List</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-full bg-purple-500"></span>
                  <span className="text-text-secondary">Sales</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-full bg-orange-500"></span>
                  <span className="text-text-secondary">Landed Sheet</span>
                </span>
              </div>
              {/* Search Input */}
              <div className="flex items-center gap-4">
                <div className="relative flex-1 max-w-md">
                  <input
                    type="text"
                    placeholder="Search by style # or description..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-border-strong rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  />
                  <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-faint" />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-text-faint hover:text-text-secondary"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {searchQuery && (
                  <span className="text-sm text-text-muted">
                    Found {formatNumber(sortedStyleChannelMargins.length)} matching styles
                  </span>
                )}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b-2 border-border-strong text-left bg-surface-secondary">
                    <th
                      className="px-4 py-3 text-sm font-bold text-text-secondary uppercase tracking-wide cursor-pointer hover:text-text-primary"
                      onClick={() => handleSort('styleNumber')}
                    >
                      Style <SortIcon field="styleNumber" />
                    </th>
                    <th className="px-4 py-3 text-sm font-bold text-text-secondary uppercase tracking-wide">
                      Description
                    </th>
                    <th className="px-4 py-3 text-sm font-bold text-text-secondary uppercase tracking-wide text-right">
                      MSRP
                    </th>
                    <th className="px-4 py-3 text-sm font-bold text-text-secondary uppercase tracking-wide text-right">
                      Wholesale
                    </th>
                    <th className="px-4 py-3 text-sm font-bold text-text-secondary uppercase tracking-wide text-right">
                      Net Price
                    </th>
                    <th className="px-4 py-3 text-sm font-bold text-text-secondary uppercase tracking-wide text-right">
                      Cost
                    </th>
                    <th
                      className="px-4 py-3 text-sm font-bold text-text-secondary uppercase tracking-wide text-right cursor-pointer hover:text-text-primary"
                      onClick={() => handleSort('totalRevenue')}
                    >
                      Revenue <SortIcon field="totalRevenue" />
                    </th>
                    <th className="px-4 py-3 text-sm font-bold text-text-secondary uppercase tracking-wide text-center min-w-[200px]">
                      Channel Mix
                    </th>
                    <th
                      className="px-4 py-3 text-sm font-bold text-text-secondary uppercase tracking-wide text-right cursor-pointer hover:text-text-primary"
                      onClick={() => handleSort('baselineMargin')}
                    >
                      Baseline <SortIcon field="baselineMargin" />
                    </th>
                    <th
                      className="px-4 py-3 text-sm font-bold text-text-secondary uppercase tracking-wide text-right cursor-pointer hover:text-text-primary"
                      onClick={() => handleSort('weightedMargin')}
                    >
                      Weighted <SortIcon field="weightedMargin" />
                    </th>
                    <th
                      className="px-4 py-3 text-sm font-bold text-text-secondary uppercase tracking-wide text-right cursor-pointer hover:text-text-primary border-l-2 border-border-strong"
                      onClick={() => handleSort('marginDelta')}
                    >
                      Δ <SortIcon field="marginDelta" />
                    </th>
                    <th className="px-4 py-3 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedStyleChannelMargins.slice(0, tableDisplayLimit).map((style, index) => {
                    const isExpanded = expandedStyle === style.styleNumber;
                    const deltaIndicator = style.marginDelta >= 2 ? '🟢' : style.marginDelta <= -2 ? '🔴' : '';

                    return (
                      <>
                        <tr
                          key={style.styleNumber}
                          onClick={() => toggleStyleExpand(style.styleNumber)}
                          className={`border-b border-border-primary cursor-pointer transition-colors ${
                            index % 2 === 0 ? 'bg-surface' : 'bg-surface-secondary'
                          } ${isExpanded ? 'bg-cyan-50 dark:bg-cyan-950' : 'hover:bg-hover-accent'}`}
                        >
                          <td className="px-4 py-3">
                            <span className="font-mono text-base font-bold text-text-primary">
                              {style.styleNumber}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-text-secondary max-w-[180px] truncate">
                            {style.styleDesc}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {style.msrpSource !== 'none' && (
                                <span className={`w-2 h-2 rounded-full ${
                                  style.msrpSource === 'linelist' ? 'bg-blue-500' :
                                  style.msrpSource === 'sales' ? 'bg-purple-500' :
                                  'bg-orange-500'
                                }`} title={style.msrpSource === 'linelist' ? 'Line List' : style.msrpSource === 'sales' ? 'Sales' : 'Landed Sheet'}></span>
                              )}
                              <span className="font-mono text-sm text-text-primary">
                                {style.msrp > 0 ? `$${style.msrp.toFixed(0)}` : '—'}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {style.wholesaleSource !== 'none' && (
                                <span className={`w-2 h-2 rounded-full ${
                                  style.wholesaleSource === 'linelist' ? 'bg-blue-500' :
                                  style.wholesaleSource === 'sales' ? 'bg-purple-500' :
                                  'bg-orange-500'
                                }`} title={style.wholesaleSource === 'linelist' ? 'Line List' : style.wholesaleSource === 'sales' ? 'Sales' : 'Landed Sheet'}></span>
                              )}
                              <span className="font-mono text-sm text-text-primary">
                                {style.wholesalePrice > 0 ? formatCurrency(style.wholesalePrice) : '—'}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {style.avgNetPrice > 0 && (
                                <span className="w-2 h-2 rounded-full bg-purple-500" title="Sales (calculated from revenue/units)"></span>
                              )}
                              <span className="font-mono text-sm text-text-primary">
                                {style.avgNetPrice > 0 ? formatCurrency(style.avgNetPrice) : '—'}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {style.costSource !== 'none' && (
                                <span className={`w-2 h-2 rounded-full ${
                                  style.costSource === 'landed' ? 'bg-orange-500' :
                                  'bg-blue-500'
                                }`} title={style.costSource === 'landed' ? 'Landed Sheet' : 'Line List'}></span>
                              )}
                              <span className={`font-mono text-sm ${
                                style.costWarning === 'above-msrp' ? 'text-red-400 font-bold' :
                                style.costWarning === 'above-wholesale' ? 'text-amber-400 font-semibold' :
                                style.costWarning === 'missing' ? 'text-text-muted' :
                                'text-text-secondary'
                              }`}>
                                {style.landedCost > 0 ? formatCurrency(style.landedCost) : '—'}
                              </span>
                              {style.costWarning === 'above-wholesale' && (
                                <span className="text-amber-400 text-xs" title="Cost exceeds wholesale price — suspect data">⚠️</span>
                              )}
                              {style.costWarning === 'above-msrp' && (
                                <span className="text-red-400 text-xs" title="Cost exceeds MSRP — bad data">🚫</span>
                              )}
                              {style.costFallbackSeason && (
                                <span className="ml-1 inline-flex items-center" title={`Cost from ${style.costFallbackSeason} (no landed cost for current season)`}>
                                  <Clock className="w-3 h-3 text-amber-400" />
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-medium text-text-primary">
                            {formatCurrencyShort(style.totalRevenue)}
                          </td>
                          {/* Channel Mix Stacked Horizontal Bar */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="flex h-5 w-full min-w-[150px] rounded overflow-hidden bg-surface-tertiary">
                                {PRIMARY_CHANNELS.map(ch => {
                                  const mix = style.channelMix[ch];
                                  if (!mix || mix.pct <= 0) return null;
                                  const colors = CHANNEL_COLORS[ch];
                                  return (
                                    <div
                                      key={ch}
                                      className={`${colors.bg} h-full flex items-center justify-center text-white text-[10px] font-bold`}
                                      style={{ width: `${mix.pct}%`, minWidth: mix.pct > 5 ? '20px' : '0' }}
                                      title={`${CHANNEL_LABELS[ch]}: ${mix.pct.toFixed(0)}%`}
                                    >
                                      {mix.pct >= 10 ? `${mix.pct.toFixed(0)}%` : ''}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="font-mono text-sm text-text-secondary">
                              {formatPercent(style.baselineMargin)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span
                              className={`inline-flex items-center gap-1 font-mono font-bold px-2 py-1 rounded ${getMarginColor(style.weightedMargin)}`}
                              title={
                                style.isProjected
                                  ? `Projected using ${style.projectedBasisSeason} channel mix + net-to-list ratios`
                                  : undefined
                              }
                            >
                              {style.isProjected && (
                                <Sparkles className="w-3 h-3 opacity-70" />
                              )}
                              {formatPercent(style.weightedMargin)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right border-l-2 border-border-strong">
                            <span
                              className={`font-mono font-bold flex items-center justify-end gap-1 ${
                                style.marginDelta >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'
                              }`}
                            >
                              {deltaIndicator && <span>{deltaIndicator}</span>}
                              {style.marginDelta >= 0 ? '+' : ''}{style.marginDelta.toFixed(1)}%
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <ChevronRight className={`w-5 h-5 text-text-faint transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                          </td>
                        </tr>
                        {/* Expanded Detail Row */}
                        {isExpanded && (
                          <tr className="bg-surface-tertiary border-b border-border-strong">
                            <td colSpan={8} className="px-6 py-4">
                              <div className="grid grid-cols-4 gap-4">
                                {PRIMARY_CHANNELS.map(ch => {
                                  const mix = style.channelMix[ch];
                                  const colors = CHANNEL_COLORS[ch];
                                  if (!mix || mix.revenue === 0) return null;

                                  return (
                                    <div key={ch} className={`${colors.light} rounded-lg p-4`}>
                                      <div className="flex items-center gap-2 mb-2">
                                        <div className={`${colors.text}`}>
                                          {CHANNEL_ICONS[ch]}
                                        </div>
                                        <span className={`font-bold ${colors.text}`}>
                                          {CHANNEL_LABELS[ch]}
                                        </span>
                                      </div>
                                      <div className="space-y-1 text-sm">
                                        <div className="flex justify-between">
                                          <span className="text-text-secondary">Revenue:</span>
                                          <span className="font-mono font-medium">{formatCurrencyShort(mix.revenue)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-text-secondary">Units:</span>
                                          <span className="font-mono">{formatNumber(mix.units)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-text-secondary">Avg Net Price:</span>
                                          <span className="font-mono">{formatCurrency(mix.avgNetPrice)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-text-secondary">Channel Margin:</span>
                                          <span className={`font-mono font-bold ${mix.margin >= TARGET_MARGIN ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                                            {formatPercent(mix.margin)}
                                          </span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-text-secondary">Mix %:</span>
                                          <span className="font-mono font-medium">{mix.pct.toFixed(1)}%</span>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                              <div className="mt-4 pt-4 border-t border-border-strong flex items-center gap-6 text-sm">
                                <div className="flex items-center">
                                  <span className="text-text-secondary">Landed Cost:</span>
                                  <span className="font-mono font-medium ml-2">{formatCurrency(style.landedCost)}</span>
                                  {style.costFallbackSeason && (
                                    <span className="ml-1 inline-flex items-center" title={`Cost from ${style.costFallbackSeason} (no landed cost for current season)`}>
                                      <Clock className="w-3 h-3 text-amber-400" />
                                    </span>
                                  )}
                                </div>
                                <div>
                                  <span className="text-text-secondary">Wholesale Price:</span>
                                  <span className="font-mono font-medium ml-2">{formatCurrency(style.wholesalePrice)}</span>
                                </div>
                                <div>
                                  <span className="text-text-secondary">Avg Net Price (All Channels):</span>
                                  <span className="font-mono font-medium ml-2">{formatCurrency(style.avgNetPrice)}</span>
                                </div>
                                <button
                                  onClick={(e) => { e.stopPropagation(); onStyleClick(style.styleNumber); }}
                                  className="ml-auto text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 font-semibold"
                                >
                                  View Full Details →
                                </button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {sortedStyleChannelMargins.length > tableDisplayLimit ? (
              <div className="px-6 py-4 border-t-2 border-border-strong bg-surface-tertiary text-center">
                <button
                  onClick={() => setTableDisplayLimit(prev => Math.min(prev + 50, sortedStyleChannelMargins.length))}
                  className="text-base text-accent hover:text-accent-hover font-medium transition-colors"
                >
                  Showing {tableDisplayLimit} of {formatNumber(sortedStyleChannelMargins.length)} styles — Show More
                </button>
              </div>
            ) : sortedStyleChannelMargins.length > 50 ? (
              <div className="px-6 py-4 border-t-2 border-border-strong bg-surface-tertiary text-center">
                <button
                  onClick={() => setTableDisplayLimit(50)}
                  className="text-base text-text-secondary hover:text-text-primary font-medium transition-colors"
                >
                  Showing all {formatNumber(sortedStyleChannelMargins.length)} styles — Show Less
                </button>
              </div>
            ) : null}
          </div>
        </>
      )}

      {/* Traditional View Stats */}
      {viewMode === 'traditional' && (
        <div className="grid grid-cols-5 gap-4">
          <div className="bg-surface rounded-xl border-2 border-border-primary p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold font-mono text-text-primary">
                  {formatCurrencyShort(stats.totalRevenue)}
                </p>
                <p className="text-sm text-text-muted font-bold uppercase tracking-wide">
                  Revenue
                </p>
              </div>
            </div>
          </div>

          <div className="bg-surface rounded-xl border-2 border-border-primary p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900 flex items-center justify-center">
                <Package className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold font-mono text-text-primary">
                  {formatCurrencyShort(stats.totalCogs)}
                </p>
                <p className="text-sm text-text-muted font-bold uppercase tracking-wide">
                  COGS
                </p>
              </div>
            </div>
          </div>

          <div className="bg-surface rounded-xl border-2 border-border-primary p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold font-mono text-text-primary">
                  {formatCurrencyShort(stats.totalGross)}
                </p>
                <p className="text-sm text-text-muted font-bold uppercase tracking-wide">
                  Gross $
                </p>
              </div>
            </div>
          </div>

          <div className="bg-surface rounded-xl border-2 border-border-primary p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                <Percent className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className={`text-2xl font-bold font-mono ${stats.overallMargin >= TARGET_MARGIN ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                  {formatPercent(stats.overallMargin)}
                </p>
                <p className="text-sm text-text-muted font-bold uppercase tracking-wide">
                  Margin %
                </p>
              </div>
            </div>
          </div>

          <div className="bg-surface rounded-xl border-2 border-border-primary p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold font-mono text-text-primary">
                  {formatPercent(stats.markup)}
                </p>
                <p className="text-sm text-text-muted font-bold uppercase tracking-wide">
                  Markup %
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Margin Health Bar - Traditional View Only */}
      {viewMode === 'traditional' && (
      <div className="bg-surface rounded-xl border-2 border-border-primary shadow-sm">
        <div className="px-6 py-4 border-b-2 border-border-primary flex items-center justify-between">
          <h3 className="text-xl font-bold text-text-primary">Margin Health</h3>
          {(selectedTier || selectedCategoryFilter) && (
            <button
              onClick={clearFilters}
              className="text-sm text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 font-medium"
            >
              Clear filters
            </button>
          )}
        </div>
        <div className="p-6">
          {/* Health Bar */}
          <div className="h-8 rounded-full overflow-hidden flex mb-4">
            {marginHealth.excellent.pct > 0 && (
              <button
                onClick={() => handleTierClick('excellent')}
                className={`${getMarginBarColor('excellent')} h-full transition-all hover:opacity-80 ${selectedTier === 'excellent' ? 'ring-2 ring-offset-2 ring-emerald-600' : ''}`}
                style={{ width: `${marginHealth.excellent.pct}%` }}
                title={`Excellent: ${marginHealth.excellent.count} styles`}
              />
            )}
            {marginHealth.target.pct > 0 && (
              <button
                onClick={() => handleTierClick('target')}
                className={`${getMarginBarColor('target')} h-full transition-all hover:opacity-80 ${selectedTier === 'target' ? 'ring-2 ring-offset-2 ring-green-500' : ''}`}
                style={{ width: `${marginHealth.target.pct}%` }}
                title={`Target: ${marginHealth.target.count} styles`}
              />
            )}
            {marginHealth.watch.pct > 0 && (
              <button
                onClick={() => handleTierClick('watch')}
                className={`${getMarginBarColor('watch')} h-full transition-all hover:opacity-80 ${selectedTier === 'watch' ? 'ring-2 ring-offset-2 ring-amber-500' : ''}`}
                style={{ width: `${marginHealth.watch.pct}%` }}
                title={`Watch: ${marginHealth.watch.count} styles`}
              />
            )}
            {marginHealth.problem.pct > 0 && (
              <button
                onClick={() => handleTierClick('problem')}
                className={`${getMarginBarColor('problem')} h-full transition-all hover:opacity-80 ${selectedTier === 'problem' ? 'ring-2 ring-offset-2 ring-red-500' : ''}`}
                style={{ width: `${marginHealth.problem.pct}%` }}
                title={`Problem: ${marginHealth.problem.count} styles`}
              />
            )}
          </div>

          {/* Legend */}
          <div className="flex justify-between text-sm">
            <button
              onClick={() => handleTierClick('excellent')}
              className={`flex items-center gap-2 px-3 py-1 rounded-lg transition-colors ${selectedTier === 'excellent' ? 'bg-emerald-100 dark:bg-emerald-900' : 'hover:bg-surface-tertiary'}`}
            >
              <div className="w-3 h-3 bg-emerald-600 rounded-full" />
              <span className="font-semibold text-text-secondary">55%+</span>
              <span className="text-text-muted">Excellent</span>
              <span className="font-mono font-bold text-text-primary">{marginHealth.excellent.count}</span>
            </button>
            <button
              onClick={() => handleTierClick('target')}
              className={`flex items-center gap-2 px-3 py-1 rounded-lg transition-colors ${selectedTier === 'target' ? 'bg-green-100 dark:bg-green-900' : 'hover:bg-surface-tertiary'}`}
            >
              <div className="w-3 h-3 bg-green-500 rounded-full" />
              <span className="font-semibold text-text-secondary">45-55%</span>
              <span className="text-text-muted">Target</span>
              <span className="font-mono font-bold text-text-primary">{marginHealth.target.count}</span>
            </button>
            <button
              onClick={() => handleTierClick('watch')}
              className={`flex items-center gap-2 px-3 py-1 rounded-lg transition-colors ${selectedTier === 'watch' ? 'bg-amber-100 dark:bg-amber-900' : 'hover:bg-surface-tertiary'}`}
            >
              <div className="w-3 h-3 bg-amber-500 rounded-full" />
              <span className="font-semibold text-text-secondary">35-45%</span>
              <span className="text-text-muted">Watch</span>
              <span className="font-mono font-bold text-text-primary">{marginHealth.watch.count}</span>
            </button>
            <button
              onClick={() => handleTierClick('problem')}
              className={`flex items-center gap-2 px-3 py-1 rounded-lg transition-colors ${selectedTier === 'problem' ? 'bg-red-100 dark:bg-red-900' : 'hover:bg-surface-tertiary'}`}
            >
              <div className="w-3 h-3 bg-red-500 rounded-full" />
              <span className="font-semibold text-text-secondary">&lt;35%</span>
              <span className="text-text-muted">Problem</span>
              <span className="font-mono font-bold text-text-primary">{marginHealth.problem.count}</span>
            </button>
          </div>
        </div>
      </div>
      )}

      {/* Two Column Row: By Category and By Channel */}
      {viewMode === 'traditional' && (
      <div className="grid grid-cols-2 gap-6">
        {/* By Category */}
        <div className="bg-surface rounded-xl border-2 border-border-primary shadow-sm">
          <div className="px-6 py-4 border-b-2 border-border-primary">
            <h3 className="text-xl font-bold text-text-primary">By Category</h3>
          </div>
          <div className="p-4">
            <table className="w-full">
              <thead>
                <tr className="text-left">
                  <th className="px-3 py-2 text-sm font-bold text-text-secondary uppercase tracking-wide">Category</th>
                  <th className="px-3 py-2 text-sm font-bold text-text-secondary uppercase tracking-wide text-right">Margin</th>
                  <th className="px-3 py-2 text-sm font-bold text-text-secondary uppercase tracking-wide text-right">Gross</th>
                </tr>
              </thead>
              <tbody>
                {categoryMargins.map(c => (
                  <tr
                    key={c.category}
                    onClick={() => handleCategoryClick(c.category)}
                    className={`cursor-pointer transition-colors ${selectedCategoryFilter === c.category ? 'bg-cyan-50 dark:bg-cyan-950' : 'hover:bg-hover'}`}
                  >
                    <td className="px-3 py-2 text-base text-text-secondary font-medium truncate max-w-[140px]">
                      {c.category}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className={`text-base font-mono font-semibold px-2 py-0.5 rounded ${getMarginColor(c.margin)}`}>
                        {formatPercent(c.margin)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-base font-mono text-text-primary text-right">
                      {formatCurrencyShort(c.gross)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* By Channel */}
        <div className="bg-surface rounded-xl border-2 border-border-primary shadow-sm">
          <div className="px-6 py-4 border-b-2 border-border-primary">
            <h3 className="text-xl font-bold text-text-primary">By Channel</h3>
          </div>
          <div className="p-4">
            <table className="w-full">
              <thead>
                <tr className="text-left">
                  <th className="px-3 py-2 text-sm font-bold text-text-secondary uppercase tracking-wide">Channel</th>
                  <th className="px-3 py-2 text-sm font-bold text-text-secondary uppercase tracking-wide text-right">Margin</th>
                  <th className="px-3 py-2 text-sm font-bold text-text-secondary uppercase tracking-wide text-right">Gross</th>
                </tr>
              </thead>
              <tbody>
                {channelMargins.map(c => (
                  <tr
                    key={c.channel}
                    className="hover:bg-hover transition-colors"
                  >
                    <td className="px-3 py-2 text-base text-text-secondary font-medium">
                      {c.channelName}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className={`text-base font-mono font-semibold px-2 py-0.5 rounded ${getMarginColor(c.margin)}`}>
                        {formatPercent(c.margin)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-base font-mono text-text-primary text-right">
                      {formatCurrencyShort(c.gross)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      )}

      {/* Two Column Row: By Gender and Top/Bottom Styles */}
      {viewMode === 'traditional' && (
      <div className="grid grid-cols-2 gap-6">
        {/* By Gender + Bottom Styles */}
        <div className="space-y-6">
          {/* By Gender */}
          <div className="bg-surface rounded-xl border-2 border-border-primary shadow-sm">
            <div className="px-6 py-4 border-b-2 border-border-primary">
              <h3 className="text-xl font-bold text-text-primary">By Gender</h3>
            </div>
            <div className="p-4">
              <table className="w-full">
                <thead>
                  <tr className="text-left">
                    <th className="px-3 py-2 text-sm font-bold text-text-secondary uppercase tracking-wide">Gender</th>
                    <th className="px-3 py-2 text-sm font-bold text-text-secondary uppercase tracking-wide text-right">Margin</th>
                    <th className="px-3 py-2 text-sm font-bold text-text-secondary uppercase tracking-wide text-right">Gross</th>
                  </tr>
                </thead>
                <tbody>
                  {genderMargins.map(g => (
                    <tr key={g.gender} className="hover:bg-hover transition-colors">
                      <td className="px-3 py-2 text-base text-text-secondary font-medium">{g.gender}</td>
                      <td className="px-3 py-2 text-right">
                        <span className={`text-base font-mono font-semibold px-2 py-0.5 rounded ${getMarginColor(g.margin)}`}>
                          {formatPercent(g.margin)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-base font-mono text-text-primary text-right">
                        {formatCurrencyShort(g.gross)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bottom Margin Styles */}
          <div className="bg-surface rounded-xl border-2 border-border-primary shadow-sm">
            <div className="px-6 py-4 border-b-2 border-border-primary">
              <h3 className="text-xl font-bold text-text-primary flex items-center gap-2">
                <TrendingDown className="w-5 h-5 text-red-500" />
                Bottom Margin Styles
              </h3>
            </div>
            <div className="p-4">
              <table className="w-full">
                <thead>
                  <tr className="text-left">
                    <th className="px-3 py-2 text-sm font-bold text-text-secondary uppercase tracking-wide">Style</th>
                    <th className="px-3 py-2 text-sm font-bold text-text-secondary uppercase tracking-wide">Desc</th>
                    <th className="px-3 py-2 text-sm font-bold text-text-secondary uppercase tracking-wide text-right">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {bottomStyles.map(s => (
                    <tr
                      key={s.styleNumber}
                      onClick={() => onStyleClick(s.styleNumber)}
                      className="hover:bg-red-50 hover:dark:bg-red-950 cursor-pointer transition-colors"
                    >
                      <td className="px-3 py-2">
                        <span className="font-mono font-semibold text-text-primary bg-surface-tertiary px-2 py-0.5 rounded text-sm">
                          {s.styleNumber}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-sm text-text-secondary truncate max-w-[120px]">
                        {s.styleDesc}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className={`text-sm font-mono font-semibold px-2 py-0.5 rounded ${getMarginColor(s.margin)}`}>
                          {formatPercent(s.margin)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Top Margin Styles */}
        <div className="bg-surface rounded-xl border-2 border-border-primary shadow-sm">
          <div className="px-6 py-4 border-b-2 border-border-primary">
            <h3 className="text-xl font-bold text-text-primary flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-500" />
              Top Margin Styles
            </h3>
          </div>
          <div className="p-4">
            <table className="w-full">
              <thead>
                <tr className="text-left">
                  <th className="px-3 py-2 text-sm font-bold text-text-secondary uppercase tracking-wide">Style</th>
                  <th className="px-3 py-2 text-sm font-bold text-text-secondary uppercase tracking-wide">Desc</th>
                  <th className="px-3 py-2 text-sm font-bold text-text-secondary uppercase tracking-wide text-right">Margin</th>
                </tr>
              </thead>
              <tbody>
                {topStyles.map(s => (
                  <tr
                    key={s.styleNumber}
                    onClick={() => onStyleClick(s.styleNumber)}
                    className="hover:bg-emerald-50 hover:dark:bg-emerald-950 cursor-pointer transition-colors"
                  >
                    <td className="px-3 py-2">
                      <span className="font-mono font-semibold text-text-primary bg-surface-tertiary px-2 py-0.5 rounded text-sm">
                        {s.styleNumber}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-sm text-text-secondary truncate max-w-[160px]">
                      {s.styleDesc}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className={`text-sm font-mono font-semibold px-2 py-0.5 rounded ${getMarginColor(s.margin)}`}>
                        {formatPercent(s.margin)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      )}

      {/* Margin By Style Table */}
      {viewMode === 'traditional' && (
      <div className="bg-surface rounded-xl border-2 border-border-primary shadow-sm">
        <div className="px-6 py-4 border-b-2 border-border-strong bg-surface-tertiary flex items-center justify-between">
          <h3 className="text-xl font-bold text-text-primary">Margin by Style</h3>
          <div className="flex items-center gap-4">
            <span className="text-sm text-text-secondary font-medium">
              Target Margin: <span className="font-mono font-bold">{TARGET_MARGIN}%</span>
            </span>
            <span className="text-sm text-text-muted font-medium">
              {formatNumber(sortedStyles.length)} styles
            </span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b-2 border-border-strong text-left bg-surface-tertiary">
                <th
                  className="px-4 py-3 text-sm font-bold text-text-secondary uppercase tracking-wide cursor-pointer hover:text-text-primary border-r border-border-primary"
                  onClick={() => handleSort('styleNumber')}
                >
                  Style <SortIcon field="styleNumber" />
                </th>
                <th
                  className="px-4 py-3 text-sm font-bold text-text-secondary uppercase tracking-wide cursor-pointer hover:text-text-primary border-r border-border-primary"
                  onClick={() => handleSort('styleDesc')}
                >
                  Description <SortIcon field="styleDesc" />
                </th>
                <th
                  className="px-4 py-3 text-sm font-bold text-text-secondary uppercase tracking-wide text-right cursor-pointer hover:text-text-primary border-l border-border-primary"
                  onClick={() => handleSort('revenue')}
                >
                  Revenue <SortIcon field="revenue" />
                </th>
                <th
                  className="px-4 py-3 text-sm font-bold text-text-secondary uppercase tracking-wide text-right cursor-pointer hover:text-text-primary border-l border-border-primary"
                  onClick={() => handleSort('cogs')}
                >
                  COGS <SortIcon field="cogs" />
                </th>
                <th
                  className="px-4 py-3 text-sm font-bold text-text-secondary uppercase tracking-wide text-right cursor-pointer hover:text-text-primary border-l border-border-primary"
                  onClick={() => handleSort('gross')}
                >
                  Gross <SortIcon field="gross" />
                </th>
                <th
                  className="px-4 py-3 text-sm font-bold text-text-secondary uppercase tracking-wide text-right cursor-pointer hover:text-text-primary border-l border-border-primary"
                  onClick={() => handleSort('margin')}
                >
                  Margin % <SortIcon field="margin" />
                </th>
                <th
                  className="px-4 py-3 text-sm font-bold text-text-secondary uppercase tracking-wide text-right cursor-pointer hover:text-text-primary border-l-2 border-border-strong"
                  onClick={() => handleSort('vsTarget')}
                >
                  vs Target <SortIcon field="vsTarget" />
                </th>
                <th className="px-4 py-3 w-10 border-l border-border-primary"></th>
              </tr>
            </thead>
            <tbody>
              {sortedStyles.slice(0, tableDisplayLimit).map((style, index) => (
                <tr
                  key={style.styleNumber}
                  onClick={() => onStyleClick(style.styleNumber)}
                  className={`border-b border-border-primary cursor-pointer transition-colors ${
                    index % 2 === 0 ? 'bg-surface' : 'bg-surface-secondary'
                  } hover:bg-hover-accent`}
                >
                  <td className="px-4 py-4 border-r border-border-primary">
                    <span className="font-mono text-lg font-bold text-text-primary">
                      {style.styleNumber}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-base text-text-secondary max-w-xs truncate border-r border-border-primary">
                    {style.styleDesc}
                  </td>
                  <td className="px-4 py-4 text-base font-mono font-medium text-text-primary text-right border-l border-border-primary">
                    {formatCurrencyShort(style.revenue)}
                  </td>
                  <td className="px-4 py-4 text-base font-mono text-text-secondary text-right border-l border-border-primary">
                    {formatCurrencyShort(style.cogs)}
                  </td>
                  <td className="px-4 py-4 text-base font-mono font-bold text-text-primary text-right border-l border-border-primary">
                    {formatCurrencyShort(style.gross)}
                  </td>
                  <td className="px-4 py-4 text-right border-l border-border-primary">
                    <span className={`text-base font-mono font-bold px-3 py-1 rounded ${getMarginColor(style.margin)}`}>
                      {formatPercent(style.margin)}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right border-l-2 border-border-strong">
                    <span
                      className={`text-base font-mono font-bold flex items-center justify-end gap-1 ${
                        style.vsTarget >= 0
                          ? 'text-emerald-700 dark:text-emerald-300'
                          : 'text-red-700 dark:text-red-300'
                      }`}
                    >
                      {style.vsTarget >= 0 ? '+' : ''}{style.vsTarget.toFixed(1)}%
                      {style.vsTarget >= 0 ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-4 border-l border-border-primary">
                    <ChevronRight className="w-5 h-5 text-text-faint" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {sortedStyles.length > tableDisplayLimit ? (
          <div className="px-6 py-4 border-t-2 border-border-strong bg-surface-tertiary text-center">
            <button
              onClick={() => setTableDisplayLimit(prev => Math.min(prev + 50, sortedStyles.length))}
              className="text-base text-accent hover:text-accent-hover font-medium transition-colors"
            >
              Showing {tableDisplayLimit} of {formatNumber(sortedStyles.length)} styles — Show More
            </button>
          </div>
        ) : sortedStyles.length > 50 ? (
          <div className="px-6 py-4 border-t-2 border-border-strong bg-surface-tertiary text-center">
            <button
              onClick={() => setTableDisplayLimit(50)}
              className="text-base text-text-secondary hover:text-text-primary font-medium transition-colors"
            >
              Showing all {formatNumber(sortedStyles.length)} styles — Show Less
            </button>
          </div>
        ) : null}
      </div>
      )}
    </div>
  );
}
