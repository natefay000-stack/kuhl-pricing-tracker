'use client';

import { useState, useEffect, useMemo, useCallback, Fragment } from 'react';
import { SalesRecord, Product, PricingRecord, CostRecord, InventoryOHRecord, normalizeCategory } from '@/types/product';
import { sortSeasons } from '@/lib/store';
import { formatCurrencyShort, formatNumber } from '@/utils/format';
import { matchesDivision } from '@/utils/divisionMap';
import { buildCSV } from '@/utils/exportData';
import {
  ChevronRight as ChevronRightIcon,
  ChevronUp,
  ChevronDown,
  Download,
  Search,
  X,
} from 'lucide-react';

// Sales aggregation types (from API)
interface ChannelAggregation {
  channel: string;
  season: string;
  revenue: number;
  units: number;
}

interface CategoryAggregation {
  category: string;
  season: string;
  revenue: number;
  units: number;
}

interface GenderAggregation {
  gender: string;
  season: string;
  revenue: number;
  units: number;
}

interface CustomerAggregation {
  customer: string;
  customerType: string;
  season: string;
  revenue: number;
  units: number;
}

interface SalesAggregations {
  byChannel: ChannelAggregation[];
  byCategory: CategoryAggregation[];
  byGender: GenderAggregation[];
  byCustomer: CustomerAggregation[];
}

interface SalesViewProps {
  sales: SalesRecord[];
  products: Product[];
  pricing: PricingRecord[];
  costs: CostRecord[];
  inventoryOH?: InventoryOHRecord[];
  salesAggregations: SalesAggregations | null;
  selectedSeason: string;
  selectedDivision: string;
  selectedCategory: string;
  searchQuery?: string;
  onStyleClick: (styleNumber: string) => void;
}

type SubTab = 'style' | 'customer' | 'category' | 'region';
type ViewMode = 'units' | 'revenue' | 'both';

// ── Health Score Types ──
type HealthTier = 'excellent' | 'good' | 'watch' | 'problem';
type ScoreSortField = 'compositeScore' | 'margin' | 'sellThrough' | 'growth' | 'channelDiversity' | 'priceStrength' | 'revenue';

interface DimensionScore {
  raw: number;
  score: number;
  tier: HealthTier;
}

interface StyleHealthScore {
  styleNumber: string;
  styleDesc: string;
  categoryDesc: string;
  divisionDesc: string;
  gender: string;
  units: number;
  revenue: number;
  compareUnits: number;
  compareRevenue: number;
  change: number | null;
  colorList: { color: string; colorDesc: string }[];
  margin: DimensionScore;
  sellThrough: DimensionScore;
  growth: DimensionScore;
  channelDiversity: DimensionScore;
  priceStrength: DimensionScore;
  compositeScore: number;
  tier: HealthTier;
  hasCostData: boolean;
  hasInventoryData: boolean;
}

// ── Health Score Helpers ──

const HEALTH_WEIGHTS = {
  margin: 20,
  sellThrough: 25,
  growth: 20,
  channelDiversity: 15,
  priceStrength: 20,
} as const;

function getHealthTier(score: number): HealthTier {
  if (score >= 75) return 'excellent';
  if (score >= 50) return 'good';
  if (score >= 25) return 'watch';
  return 'problem';
}

function getHealthColor(tier: HealthTier): string {
  switch (tier) {
    case 'excellent': return 'bg-emerald-500/15 text-emerald-400';
    case 'good': return 'bg-green-500/15 text-green-400';
    case 'watch': return 'bg-amber-500/15 text-amber-400';
    case 'problem': return 'bg-red-500/15 text-red-400';
  }
}

function getHealthBarColor(tier: HealthTier): string {
  switch (tier) {
    case 'excellent': return 'bg-emerald-500';
    case 'good': return 'bg-green-500';
    case 'watch': return 'bg-amber-500';
    case 'problem': return 'bg-red-500';
  }
}

function getHealthDot(tier: HealthTier): string {
  switch (tier) {
    case 'excellent': return 'bg-emerald-500';
    case 'good': return 'bg-green-500';
    case 'watch': return 'bg-amber-500';
    case 'problem': return 'bg-red-500';
  }
}

function scoreDimension(value: number, thresholds: [number, number, number]): DimensionScore {
  const [exc, good, watch] = thresholds;
  let score: number;
  if (value >= exc) score = 75 + 25 * Math.min(1, (value - exc) / (Math.max(exc * 0.5, 10)));
  else if (value >= good) score = 50 + 25 * ((value - good) / (exc - good));
  else if (value >= watch) score = 25 + 25 * ((value - watch) / (good - watch));
  else score = Math.max(0, 25 * (value / (watch || 1)));
  return {
    raw: value,
    score: Math.round(Math.min(100, Math.max(0, score))),
    tier: getHealthTier(Math.round(Math.min(100, Math.max(0, score)))),
  };
}

// Map division codes to labels
function getDivisionLabel(sale: SalesRecord): string {
  if (sale.gender) {
    if (sale.gender === 'Men') return "Men's";
    if (sale.gender === 'Women') return "Women's";
    return sale.gender;
  }
  const code = sale.divisionDesc;
  if (code === '01') return "Men's";
  if (code === '02') return "Women's";
  if (code === '08') return 'Unisex';
  if (code === '06') return 'Other';
  if (!code) return 'Unknown';
  const lower = code.toLowerCase();
  if (lower.includes("women")) return "Women's";
  if (lower.includes("men")) return "Men's";
  if (lower.includes("unisex")) return "Unisex";
  return code;
}

// Get the YoY comparison season (e.g., 25FA → 24FA)
function getYoYSeason(season: string): string | null {
  if (!season || season.length !== 4) return null;
  const yearNum = parseInt(season.slice(0, 2), 10);
  const type = season.slice(2);
  if (isNaN(yearNum) || yearNum <= 0) return null;
  return `${(yearNum - 1).toString().padStart(2, '0')}${type}`;
}

// Calculate percentage change
function calcChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return ((current - previous) / previous) * 100;
}

// Chart color palette
const CHART_COLORS = [
  '#0a84ff', // blue
  '#bf5af2', // purple
  '#30d158', // green
  '#ff9f0a', // orange
  '#5ac8fa', // teal
  '#ff453a', // red
  '#636366', // gray
];

export default function SalesView({
  sales,
  products,
  pricing,
  costs,
  inventoryOH,
  salesAggregations,
  selectedSeason,
  selectedDivision,
  selectedCategory,
  searchQuery: globalSearchQuery,
  onStyleClick,
}: SalesViewProps) {
  // Season comparison state
  const allSeasons = useMemo(() => {
    const s = new Set<string>();
    sales.forEach((r) => r.season && s.add(r.season));
    if (salesAggregations) {
      salesAggregations.byChannel.forEach((c) => c.season && s.add(c.season));
      salesAggregations.byCategory.forEach((c) => c.season && s.add(c.season));
    }
    return sortSeasons(Array.from(s)).reverse(); // newest first
  }, [sales, salesAggregations]);

  const [activeSeason, setActiveSeason] = useState<string>(
    selectedSeason || allSeasons[0] || ''
  );
  const [compareSeason, setCompareSeason] = useState<string>(() => {
    const initial = selectedSeason || allSeasons[0] || '';
    return getYoYSeason(initial) || allSeasons[1] || '';
  });

  // Update activeSeason when sales data loads and activeSeason is still empty
  useEffect(() => {
    if (!activeSeason && allSeasons.length > 0) {
      setActiveSeason(selectedSeason || allSeasons[0]);
      const initial = selectedSeason || allSeasons[0];
      setCompareSeason(getYoYSeason(initial) || allSeasons[1] || '');
    }
  }, [allSeasons, activeSeason, selectedSeason]);

  // Sync global season filter → local activeSeason
  useEffect(() => {
    if (!selectedSeason || allSeasons.length === 0) return;
    let target = '';
    if (selectedSeason === '__ALL_SP__') {
      target = allSeasons.find(s => s.endsWith('SP')) || '';
    } else if (selectedSeason === '__ALL_FA__') {
      target = allSeasons.find(s => s.endsWith('FA')) || '';
    } else if (allSeasons.includes(selectedSeason)) {
      target = selectedSeason;
    }
    if (target && target !== activeSeason) {
      setActiveSeason(target);
      setCompareSeason(getYoYSeason(target) || allSeasons[allSeasons.indexOf(target) + 1] || '');
    }
  }, [selectedSeason, allSeasons]);

  // Sub-tabs and view mode
  const [subTab, setSubTab] = useState<SubTab>('style');
  const [viewMode, setViewMode] = useState<ViewMode>('revenue');

  // Table state
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedStyles, setExpandedStyles] = useState<Set<string>>(new Set());
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null);
  const pageSize = 25;

  // Health score state
  const [healthTierFilter, setHealthTierFilter] = useState<HealthTier | null>(null);
  const [scoreSortField, setScoreSortField] = useState<ScoreSortField>('compositeScore');
  const [scoreSortDir, setScoreSortDir] = useState<'asc' | 'desc'>('asc');

  // Sync global search → local search
  useEffect(() => {
    if (globalSearchQuery !== undefined && globalSearchQuery !== searchQuery) {
      setSearchQuery(globalSearchQuery);
      setCurrentPage(1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalSearchQuery]);

  // Season pill click handler
  const handleSeasonClick = useCallback((season: string) => {
    if (season === activeSeason) return;
    if (season === compareSeason) {
      // Swap active and compare
      setCompareSeason(activeSeason);
      setActiveSeason(season);
    } else {
      setActiveSeason(season);
      const yoy = getYoYSeason(season);
      setCompareSeason(yoy && allSeasons.includes(yoy) ? yoy : '');
    }
  }, [activeSeason, compareSeason, allSeasons]);

  // Right-click season pill → set compare
  const handleCompareClick = useCallback((season: string) => {
    if (season === activeSeason) return;
    setCompareSeason(compareSeason === season ? '' : season);
  }, [activeSeason, compareSeason]);

  // ── Core Data Memos ──
  const activeSales = useMemo(() => {
    return sales.filter((s) => {
      if (s.season !== activeSeason) return false;
      if (selectedDivision && !matchesDivision(s.divisionDesc || s.gender || '', selectedDivision)) return false;
      if (selectedCategory) {
        const norm = normalizeCategory(s.categoryDesc);
        if (norm !== selectedCategory) return false;
      }
      return true;
    });
  }, [sales, activeSeason, selectedDivision, selectedCategory]);

  const compareSales = useMemo(() => {
    if (!compareSeason) return [];
    return sales.filter((s) => {
      if (s.season !== compareSeason) return false;
      if (selectedDivision && !matchesDivision(s.divisionDesc || s.gender || '', selectedDivision)) return false;
      if (selectedCategory) {
        const norm = normalizeCategory(s.categoryDesc);
        if (norm !== selectedCategory) return false;
      }
      return true;
    });
  }, [sales, compareSeason, selectedDivision, selectedCategory]);

  // ── Metrics for header cards ──
  const metrics = useMemo(() => {
    const activeRevenue = activeSales.reduce((sum, s) => sum + (s.revenue || 0), 0);
    const activeUnits = activeSales.reduce((sum, s) => sum + (s.unitsBooked || 0), 0);
    const compareRevenue = compareSales.reduce((sum, s) => sum + (s.revenue || 0), 0);
    const compareUnits = compareSales.reduce((sum, s) => sum + (s.unitsBooked || 0), 0);
    const activeStyles = new Set(activeSales.map((s) => s.styleNumber).filter(Boolean)).size;
    const compareStyles = new Set(compareSales.map((s) => s.styleNumber).filter(Boolean)).size;

    return {
      revenue: { current: activeRevenue, compare: compareRevenue, change: calcChange(activeRevenue, compareRevenue) },
      units: { current: activeUnits, compare: compareUnits, change: calcChange(activeUnits, compareUnits) },
      avgPrice: {
        current: activeUnits > 0 ? activeRevenue / activeUnits : 0,
        compare: compareUnits > 0 ? compareRevenue / compareUnits : 0,
        change: calcChange(
          activeUnits > 0 ? activeRevenue / activeUnits : 0,
          compareUnits > 0 ? compareRevenue / compareUnits : 0
        ),
      },
      styles: { current: activeStyles, compare: compareStyles, diff: activeStyles - compareStyles },
    };
  }, [activeSales, compareSales]);

  // Product color map (style → colors)
  const productColorMap = useMemo(() => {
    const map = new Map<string, { color: string; colorDesc: string }[]>();
    products.forEach((p) => {
      if (!p.styleNumber || !p.color) return;
      const list = map.get(p.styleNumber) || [];
      if (!list.some((c) => c.color === p.color)) {
        list.push({ color: p.color, colorDesc: p.colorDesc || p.color });
      }
      map.set(p.styleNumber, list);
    });
    return map;
  }, [products]);

  // Product division map (style → division label)
  const productDivisionMap = useMemo(() => {
    const map = new Map<string, string>();
    products.forEach((p) => {
      if (p.styleNumber && p.divisionDesc && !map.has(p.styleNumber)) {
        map.set(p.styleNumber, p.divisionDesc);
      }
    });
    return map;
  }, [products]);

  // ── Chart Data ──
  const byDivision = useMemo(() => {
    const divMap = new Map<string, number>();
    activeSales.forEach((s) => {
      const label = productDivisionMap.get(s.styleNumber) || getDivisionLabel(s);
      divMap.set(label, (divMap.get(label) || 0) + (s.revenue || 0));
    });
    const total = Array.from(divMap.values()).reduce((a, b) => a + b, 0) || 1;
    const items = Array.from(divMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([label, revenue]) => ({ label, revenue, percent: (revenue / total) * 100 }));
    return { total, items };
  }, [activeSales, productDivisionMap]);

  const byChannel = useMemo(() => {
    if (salesAggregations?.byChannel) {
      const channelSales = salesAggregations.byChannel.filter((c) => c.season === activeSeason);
      const total = channelSales.reduce((sum, c) => sum + c.revenue, 0) || 1;
      const items = channelSales
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5)
        .map((c) => ({ label: c.channel, revenue: c.revenue, percent: (c.revenue / total) * 100 }));
      return { total, items };
    }
    const chMap = new Map<string, number>();
    activeSales.forEach((s) => {
      const ch = s.customerType || 'Other';
      chMap.set(ch, (chMap.get(ch) || 0) + (s.revenue || 0));
    });
    const total = Array.from(chMap.values()).reduce((a, b) => a + b, 0) || 1;
    const items = Array.from(chMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, revenue]) => ({ label, revenue, percent: (revenue / total) * 100 }));
    return { total, items };
  }, [activeSales, salesAggregations, activeSeason]);

  const byCategory = useMemo(() => {
    if (salesAggregations?.byCategory) {
      const catSales = salesAggregations.byCategory.filter((c) => c.season === activeSeason);
      const maxRevenue = Math.max(...catSales.map((c) => c.revenue), 1);
      return catSales
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5)
        .map((c) => ({ label: c.category, revenue: c.revenue, percent: (c.revenue / maxRevenue) * 100 }));
    }
    const catMap = new Map<string, number>();
    activeSales.forEach((s) => {
      const cat = normalizeCategory(s.categoryDesc) || 'Unknown';
      catMap.set(cat, (catMap.get(cat) || 0) + (s.revenue || 0));
    });
    const maxRevenue = Math.max(...Array.from(catMap.values()), 1);
    return Array.from(catMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, revenue]) => ({ label, revenue, percent: (revenue / maxRevenue) * 100 }));
  }, [activeSales, salesAggregations, activeSeason]);

  const categoryBreakdown = useMemo(() => {
    const activeByCategory = new Map<string, number>();
    activeSales.forEach((s) => {
      const cat = normalizeCategory(s.categoryDesc) || 'Unknown';
      activeByCategory.set(cat, (activeByCategory.get(cat) || 0) + (s.revenue || 0));
    });
    const compareByCategory = new Map<string, number>();
    compareSales.forEach((s) => {
      const cat = normalizeCategory(s.categoryDesc) || 'Unknown';
      compareByCategory.set(cat, (compareByCategory.get(cat) || 0) + (s.revenue || 0));
    });
    return Array.from(activeByCategory.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([label, current]) => ({
        label,
        current,
        compare: compareByCategory.get(label) || 0,
      }));
  }, [activeSales, compareSales]);

  // ── Lookups for Health Scoring ──

  const costLookup = useMemo(() => {
    const lookup = new Map<string, number>();
    costs.forEach(c => {
      const key = `${c.styleNumber}-${c.season}`;
      const val = c.landed > 0 ? c.landed : c.fob > 0 ? c.fob : 0;
      if (val > 0) {
        lookup.set(key, val);
        if (!lookup.has(c.styleNumber)) lookup.set(c.styleNumber, val);
      }
    });
    products.forEach(p => {
      if (!lookup.has(p.styleNumber) && p.cost > 0) {
        lookup.set(p.styleNumber, p.cost);
      }
    });
    return lookup;
  }, [costs, products]);

  const priceLookup = useMemo(() => {
    const lookup = new Map<string, { wholesale: number; msrp: number }>();
    products.forEach(p => {
      if (!lookup.has(p.styleNumber)) {
        lookup.set(p.styleNumber, { wholesale: p.price || 0, msrp: p.msrp || 0 });
      }
    });
    return lookup;
  }, [products]);

  const ohByStyle = useMemo(() => {
    const map = new Map<string, number>();
    if (!inventoryOH?.length) return map;
    const dates = Array.from(new Set(inventoryOH.map(r => r.snapshotDate))).sort();
    const latestDate = dates[dates.length - 1];
    inventoryOH
      .filter(r => r.snapshotDate === latestDate)
      .forEach(r => {
        map.set(r.styleNumber, (map.get(r.styleNumber) || 0) + r.totalQty);
      });
    return map;
  }, [inventoryOH]);

  // ── Style Health Scores ──

  const styleHealthScores = useMemo(() => {
    // Group current season sales by style
    const activeMap = new Map<string, {
      styleNumber: string;
      styleDesc: string;
      categoryDesc: string;
      divisionDesc: string;
      gender: string;
      units: number;
      revenue: number;
      channels: Set<string>;
    }>();

    activeSales.forEach((s) => {
      if (!s.styleNumber) return;
      let entry = activeMap.get(s.styleNumber);
      if (!entry) {
        const prodDiv = productDivisionMap.get(s.styleNumber);
        const gender = prodDiv || getDivisionLabel(s);
        entry = {
          styleNumber: s.styleNumber,
          styleDesc: s.styleDesc || '',
          categoryDesc: normalizeCategory(s.categoryDesc) || '',
          divisionDesc: s.divisionDesc || '',
          gender,
          units: 0,
          revenue: 0,
          channels: new Set(),
        };
        activeMap.set(s.styleNumber, entry);
      }
      entry.units += s.unitsBooked || 0;
      entry.revenue += s.revenue || 0;
      if (s.customerType) {
        // Normalize channel types
        const ct = s.customerType.trim().toUpperCase();
        if (ct === 'WD') entry.channels.add('WH'); // WD rolls into WH
        else if (ct) entry.channels.add(ct);
      }
    });

    // Group compare season
    const compareMap = new Map<string, { units: number; revenue: number }>();
    compareSales.forEach((s) => {
      if (!s.styleNumber) return;
      let entry = compareMap.get(s.styleNumber);
      if (!entry) {
        entry = { units: 0, revenue: 0 };
        compareMap.set(s.styleNumber, entry);
      }
      entry.units += s.unitsBooked || 0;
      entry.revenue += s.revenue || 0;
    });

    const hasInvData = !!(inventoryOH && inventoryOH.length > 0);

    return Array.from(activeMap.values()).map((style): StyleHealthScore => {
      const comp = compareMap.get(style.styleNumber);
      const compUnits = comp?.units || 0;
      const compRevenue = comp?.revenue || 0;
      const change = calcChange(style.revenue, compRevenue);
      const colorList = (productColorMap.get(style.styleNumber) || []).map(c => ({ color: c.color, colorDesc: c.colorDesc }));

      // 1. MARGIN
      const landed = costLookup.get(`${style.styleNumber}-${activeSeason}`)
        || costLookup.get(style.styleNumber) || 0;
      const hasCostData = landed > 0;
      const cogs = landed * style.units;
      const marginPct = style.revenue > 0 && hasCostData
        ? ((style.revenue - cogs) / style.revenue) * 100
        : 0;
      const margin = hasCostData
        ? scoreDimension(marginPct, [50, 40, 30])
        : { raw: 0, score: 0, tier: 'problem' as HealthTier };

      // 2. SELL-THROUGH
      const onHand = ohByStyle.get(style.styleNumber) || 0;
      const totalAvailable = style.units + onHand;
      const sellThroughPct = hasInvData && totalAvailable > 0 ? (style.units / totalAvailable) * 100 : 0;
      const sellThrough = hasInvData
        ? scoreDimension(sellThroughPct, [80, 60, 40])
        : { raw: 0, score: 0, tier: 'problem' as HealthTier };

      // 3. GROWTH
      const growthPct = change ?? 0;
      const growth = change !== null
        ? scoreDimension(growthPct, [20, 0, -10])
        : { raw: 0, score: 50, tier: 'good' as HealthTier };

      // 4. CHANNEL DIVERSITY
      const channelCount = style.channels.size;
      const channelDiversity = scoreDimension(channelCount, [4, 3, 2]);

      // 5. PRICE STRENGTH
      const prices = priceLookup.get(style.styleNumber);
      const avgNetPrice = style.units > 0 ? style.revenue / style.units : 0;
      const listPrice = prices?.wholesale || 0;
      const priceRatio = listPrice > 0 ? (avgNetPrice / listPrice) * 100 : 100;
      const priceStrength = listPrice > 0
        ? scoreDimension(priceRatio, [100, 90, 80])
        : { raw: 100, score: 75, tier: 'good' as HealthTier };

      // COMPOSITE
      let totalWeight = 0;
      let weightedSum = 0;
      if (hasCostData) { weightedSum += margin.score * HEALTH_WEIGHTS.margin; totalWeight += HEALTH_WEIGHTS.margin; }
      if (hasInvData) { weightedSum += sellThrough.score * HEALTH_WEIGHTS.sellThrough; totalWeight += HEALTH_WEIGHTS.sellThrough; }
      if (change !== null) { weightedSum += growth.score * HEALTH_WEIGHTS.growth; totalWeight += HEALTH_WEIGHTS.growth; }
      weightedSum += channelDiversity.score * HEALTH_WEIGHTS.channelDiversity; totalWeight += HEALTH_WEIGHTS.channelDiversity;
      if (listPrice > 0) { weightedSum += priceStrength.score * HEALTH_WEIGHTS.priceStrength; totalWeight += HEALTH_WEIGHTS.priceStrength; }

      const compositeScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;

      return {
        styleNumber: style.styleNumber,
        styleDesc: style.styleDesc,
        categoryDesc: style.categoryDesc,
        divisionDesc: style.divisionDesc,
        gender: style.gender,
        units: style.units,
        revenue: style.revenue,
        compareUnits: compUnits,
        compareRevenue: compRevenue,
        change,
        colorList,
        margin,
        sellThrough,
        growth,
        channelDiversity,
        priceStrength,
        compositeScore,
        tier: getHealthTier(compositeScore),
        hasCostData,
        hasInventoryData: hasInvData,
      };
    });
  }, [activeSales, compareSales, costLookup, priceLookup, ohByStyle, inventoryOH, activeSeason, productColorMap, productDivisionMap]);

  // ── Health Distribution ──
  const healthDistribution = useMemo(() => {
    const tiers = { excellent: 0, good: 0, watch: 0, problem: 0 };
    styleHealthScores.forEach(s => { tiers[s.tier]++; });
    const total = styleHealthScores.length || 1;
    return {
      excellent: { count: tiers.excellent, pct: (tiers.excellent / total) * 100 },
      good: { count: tiers.good, pct: (tiers.good / total) * 100 },
      watch: { count: tiers.watch, pct: (tiers.watch / total) * 100 },
      problem: { count: tiers.problem, pct: (tiers.problem / total) * 100 },
      total: styleHealthScores.length,
    };
  }, [styleHealthScores]);

  // ── Filter / Sort ──
  const filteredStyles = useMemo(() => {
    let result = styleHealthScores;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(s =>
        s.styleNumber.toLowerCase().includes(q) || s.styleDesc.toLowerCase().includes(q)
      );
    }
    if (healthTierFilter) {
      result = result.filter(s => s.tier === healthTierFilter);
    }
    const dir = scoreSortDir === 'asc' ? 1 : -1;
    result = [...result].sort((a, b) => {
      switch (scoreSortField) {
        case 'compositeScore': return (a.compositeScore - b.compositeScore) * dir;
        case 'margin': return (a.margin.score - b.margin.score) * dir;
        case 'sellThrough': return (a.sellThrough.score - b.sellThrough.score) * dir;
        case 'growth': return (a.growth.score - b.growth.score) * dir;
        case 'channelDiversity': return (a.channelDiversity.score - b.channelDiversity.score) * dir;
        case 'priceStrength': return (a.priceStrength.score - b.priceStrength.score) * dir;
        case 'revenue': return (a.revenue - b.revenue) * dir;
        default: return (a.compositeScore - b.compositeScore) * dir;
      }
    });
    return result;
  }, [styleHealthScores, searchQuery, healthTierFilter, scoreSortField, scoreSortDir]);

  // Pagination
  const totalPages = Math.ceil(filteredStyles.length / pageSize);
  const paginatedStyles = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredStyles.slice(start, start + pageSize);
  }, [filteredStyles, currentPage]);

  // Top 5 styles
  const top5Styles = useMemo(() => {
    return [...styleHealthScores]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }, [styleHealthScores]);

  // Needs attention (bottom 5)
  const needsAttention = useMemo(() => {
    return [...styleHealthScores]
      .filter(s => s.revenue > 10000) // Only flag styles with meaningful revenue
      .sort((a, b) => a.compositeScore - b.compositeScore)
      .slice(0, 5);
  }, [styleHealthScores]);

  // Biggest growth
  const biggestGrowth = useMemo(() => {
    return [...styleHealthScores]
      .filter((s) => s.change !== null && s.change !== undefined)
      .sort((a, b) => (b.change || 0) - (a.change || 0))
      .slice(0, 3);
  }, [styleHealthScores]);

  // Selected style detail
  const selectedStyleData = useMemo(() => {
    if (!selectedStyle) return filteredStyles[0] || null;
    return filteredStyles.find((s) => s.styleNumber === selectedStyle) || filteredStyles[0] || null;
  }, [filteredStyles, selectedStyle]);

  // Toggle expand
  const toggleExpand = useCallback((styleNumber: string) => {
    setExpandedStyles((prev) => {
      const next = new Set(prev);
      if (next.has(styleNumber)) next.delete(styleNumber);
      else next.add(styleNumber);
      return next;
    });
    setSelectedStyle(styleNumber);
  }, []);

  // Sort handler
  const handleScoreSort = useCallback((field: ScoreSortField) => {
    if (scoreSortField === field) {
      setScoreSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setScoreSortField(field);
      setScoreSortDir(field === 'revenue' ? 'desc' : 'asc');
    }
    setCurrentPage(1);
  }, [scoreSortField]);

  // Sort indicator
  const sortIndicator = (field: ScoreSortField) => {
    if (scoreSortField !== field) return null;
    return scoreSortDir === 'asc'
      ? <ChevronUp className="w-3 h-3 inline ml-0.5" />
      : <ChevronDown className="w-3 h-3 inline ml-0.5" />;
  };

  // Export CSV
  const exportCSV = () => {
    const headers = [
      'Style', 'Description', 'Category',
      'Health Score', 'Tier',
      'Margin %', 'Margin Score',
      'Sell-Through %', 'Sell-Through Score',
      'Growth %', 'Growth Score',
      'Channels', 'Channel Score',
      'Price Ratio %', 'Price Score',
      `${activeSeason} Units`, `${activeSeason} Revenue`,
      ...(compareSeason ? [`${compareSeason} Units`, `${compareSeason} Revenue`] : []),
      'Change %',
    ];
    const rows = filteredStyles.map((s) => [
      s.styleNumber, s.styleDesc, s.categoryDesc,
      s.compositeScore, s.tier,
      s.hasCostData ? s.margin.raw.toFixed(1) : '',
      s.hasCostData ? s.margin.score : '',
      s.hasInventoryData ? s.sellThrough.raw.toFixed(1) : '',
      s.hasInventoryData ? s.sellThrough.score : '',
      s.change !== null ? (s.change).toFixed(1) : '',
      s.growth.score,
      s.channelDiversity.raw,
      s.channelDiversity.score,
      s.priceStrength.raw.toFixed(1),
      s.priceStrength.score,
      s.units, s.revenue.toFixed(2),
      ...(compareSeason ? [s.compareUnits, s.compareRevenue.toFixed(2)] : []),
      s.change !== null ? s.change.toFixed(1) : '',
    ]);
    const csv = buildCSV(headers, rows);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `style-health-${activeSeason}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Donut chart SVG helper
  const renderDonut = (items: { label: string; revenue: number; percent: number }[], total: number, colors: string[]) => {
    const circumference = 2 * Math.PI * 80;
    let offset = 0;
    return (
      <svg viewBox="0 0 200 200" className="w-[120px] h-[120px]">
        {items.map((item, i) => {
          const dash = (item.percent / 100) * circumference;
          const gap = circumference - dash;
          const currentOffset = offset;
          offset += dash;
          return (
            <circle
              key={item.label}
              cx="100" cy="100" r="80"
              fill="none"
              stroke={colors[i % colors.length]}
              strokeWidth="40"
              strokeDasharray={`${dash} ${gap}`}
              strokeDashoffset={-currentOffset}
              transform="rotate(-90 100 100)"
            />
          );
        })}
        <circle cx="100" cy="100" r="60" className="fill-[var(--color-surface,#131316)]" />
        <text x="100" y="105" textAnchor="middle" className="fill-current text-[14px] font-semibold" style={{ fill: 'var(--text-primary, #f5f5f7)' }}>
          {formatCurrencyShort(total)}
        </text>
      </svg>
    );
  };

  // Dimension label helper
  const DIMENSION_LABELS: { key: ScoreSortField; label: string; short: string }[] = [
    { key: 'margin', label: 'Margin', short: 'Margin' },
    { key: 'sellThrough', label: 'Sell-Through', short: 'Sell-Thru' },
    { key: 'growth', label: 'Growth', short: 'Growth' },
    { key: 'channelDiversity', label: 'Channels', short: 'Channels' },
    { key: 'priceStrength', label: 'Price Strength', short: 'Price' },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-4xl font-display font-bold text-text-primary">Sales Analysis</h2>
        <p className="text-base text-text-muted mt-2">
          Style health scoring across margin, sell-through, growth, channels &amp; pricing
        </p>
      </div>

      {/* ── Season Comparison Bar ── */}
      <div className="flex items-center gap-4 px-5 py-3.5 bg-surface rounded-xl border border-border-strong">
        <span className="text-[13px] font-medium text-text-muted">Seasons:</span>
        <div className="flex gap-1.5">
          {allSeasons.map((season) => (
            <button
              key={season}
              title={season === activeSeason ? `Active season` : `Click to switch · Right-click to compare`}
              onClick={() => handleSeasonClick(season)}
              onContextMenu={(e) => { e.preventDefault(); handleCompareClick(season); }}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer
                ${season === activeSeason
                  ? 'bg-[#0a84ff] border-[#0a84ff] text-white'
                  : season === compareSeason
                    ? 'bg-[rgba(255,159,10,0.15)] border-[#ff9f0a] text-[#ff9f0a]'
                    : 'bg-surface-tertiary border-border-strong text-text-muted hover:text-text-primary hover:border-text-faint'
                }`}
            >
              {season}
            </button>
          ))}
        </div>
        <span className="text-text-faint text-xs">|</span>
        <span className="text-xs text-text-muted">
          Comparing: <strong className="text-[#0a84ff]">{activeSeason}</strong>
          {compareSeason && <> vs <strong className="text-[#ff9f0a]">{compareSeason}</strong></>}
        </span>
        <div className="flex gap-2 ml-auto">
          <button
            onClick={() => {
              const yoy = getYoYSeason(activeSeason);
              if (yoy && allSeasons.includes(yoy)) setCompareSeason(yoy);
            }}
            className="px-3 py-1 rounded-md text-[11px] font-medium border border-border-strong bg-surface-tertiary text-text-muted hover:text-text-primary hover:bg-hover"
          >
            YoY
          </button>
          <button
            onClick={() => {
              const idx = allSeasons.indexOf(activeSeason);
              if (idx < allSeasons.length - 1) setCompareSeason(allSeasons[idx + 1]);
            }}
            className="px-3 py-1 rounded-md text-[11px] font-medium border border-border-strong bg-surface-tertiary text-text-muted hover:text-text-primary hover:bg-hover"
          >
            Prior Season
          </button>
          <button
            onClick={() => setCompareSeason('')}
            className="px-3 py-1 rounded-md text-[11px] font-medium border border-border-strong bg-surface-tertiary text-text-muted hover:text-text-primary hover:bg-hover"
          >
            Clear
          </button>
        </div>
      </div>

      {/* ── Big Metric Cards ── */}
      <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-4">
        <div className="bg-gradient-to-br from-surface to-[rgba(10,132,255,0.1)] rounded-2xl border border-[#0a84ff] p-6 transition-all hover:border-text-faint">
          <div className="text-xs text-text-muted font-medium uppercase tracking-wider mb-2">Total Sales</div>
          <div className="text-4xl font-bold font-mono tracking-tighter mb-2.5 leading-none bg-gradient-to-br from-text-primary to-[#0a84ff] bg-clip-text text-transparent">
            {formatCurrencyShort(metrics.revenue.current)}
          </div>
          <div className="flex items-center gap-2">
            {metrics.revenue.change !== null && (
              <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${metrics.revenue.change >= 0 ? 'bg-[rgba(48,209,88,0.15)] text-[#30d158]' : 'bg-[rgba(255,69,58,0.15)] text-[#ff453a]'}`}>
                {metrics.revenue.change >= 0 ? '↑' : '↓'} {Math.abs(metrics.revenue.change).toFixed(1)}%
              </span>
            )}
            {compareSeason && <span className="text-[11px] text-text-faint">vs {compareSeason} ({formatCurrencyShort(metrics.revenue.compare)})</span>}
          </div>
        </div>
        <div className="bg-surface rounded-2xl border border-border-strong p-6 transition-all hover:border-text-faint">
          <div className="text-xs text-text-muted font-medium uppercase tracking-wider mb-2">Units Sold</div>
          <div className="text-4xl font-bold font-mono tracking-tighter mb-2.5 leading-none text-text-primary">{formatNumber(metrics.units.current)}</div>
          <div className="flex items-center gap-2">
            {metrics.units.change !== null && (
              <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${metrics.units.change >= 0 ? 'bg-[rgba(48,209,88,0.15)] text-[#30d158]' : 'bg-[rgba(255,69,58,0.15)] text-[#ff453a]'}`}>
                {metrics.units.change >= 0 ? '↑' : '↓'} {Math.abs(metrics.units.change).toFixed(1)}%
              </span>
            )}
            {compareSeason && <span className="text-[11px] text-text-faint">vs {compareSeason}</span>}
          </div>
        </div>
        <div className="bg-surface rounded-2xl border border-border-strong p-6 transition-all hover:border-text-faint">
          <div className="text-xs text-text-muted font-medium uppercase tracking-wider mb-2">Avg Unit Price</div>
          <div className="text-4xl font-bold font-mono tracking-tighter mb-2.5 leading-none text-text-primary">${metrics.avgPrice.current.toFixed(2)}</div>
          <div className="flex items-center gap-2">
            {metrics.avgPrice.change !== null && (
              <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${metrics.avgPrice.change >= 0 ? 'bg-[rgba(48,209,88,0.15)] text-[#30d158]' : 'bg-[rgba(255,69,58,0.15)] text-[#ff453a]'}`}>
                {metrics.avgPrice.change >= 0 ? '↑' : '↓'} {Math.abs(metrics.avgPrice.change).toFixed(1)}%
              </span>
            )}
            {compareSeason && <span className="text-[11px] text-text-faint">vs {compareSeason}</span>}
          </div>
        </div>
        <div className="bg-surface rounded-2xl border border-border-strong p-6 transition-all hover:border-text-faint">
          <div className="text-xs text-text-muted font-medium uppercase tracking-wider mb-2">Active Styles</div>
          <div className="text-4xl font-bold font-mono tracking-tighter mb-2.5 leading-none text-text-primary">{formatNumber(metrics.styles.current)}</div>
          <div className="flex items-center gap-2">
            {compareSeason && (
              <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${metrics.styles.diff >= 0 ? 'bg-[rgba(48,209,88,0.15)] text-[#30d158]' : 'bg-[rgba(255,69,58,0.15)] text-[#ff453a]'}`}>
                {metrics.styles.diff >= 0 ? '+' : ''}{metrics.styles.diff}
              </span>
            )}
            {compareSeason && <span className="text-[11px] text-text-faint">vs {compareSeason} ({metrics.styles.compare})</span>}
          </div>
        </div>
      </div>

      {/* ── Charts Row ── */}
      <div className="grid grid-cols-[1fr_1fr_1fr_1.3fr] gap-4">
        {/* By Division (Donut) */}
        <div className="bg-surface rounded-xl border border-border-strong p-5">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-[13px] font-semibold text-text-primary">By Division</h3>
            <span className="text-[10px] font-semibold text-[#0a84ff] bg-[rgba(10,132,255,0.15)] px-2 py-0.5 rounded">{activeSeason}</span>
          </div>
          <div className="flex flex-col items-center gap-3.5">
            {renderDonut(byDivision.items, byDivision.total, ['#0a84ff', '#bf5af2', '#5ac8fa'])}
            <div className="w-full space-y-1.5">
              {byDivision.items.map((item, i) => (
                <div key={item.label} className="flex items-center gap-2 text-[11px]">
                  <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: ['#0a84ff', '#bf5af2', '#5ac8fa'][i] }} />
                  <span className="flex-1 text-text-muted">{item.label}</span>
                  <span className="font-mono font-medium text-text-primary">{formatCurrencyShort(item.revenue)}</span>
                  <span className="w-8 text-right font-mono text-[10px] text-text-faint">{item.percent.toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        {/* By Channel (Donut) */}
        <div className="bg-surface rounded-xl border border-border-strong p-5">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-[13px] font-semibold text-text-primary">By Channel</h3>
            <span className="text-[10px] font-semibold text-[#0a84ff] bg-[rgba(10,132,255,0.15)] px-2 py-0.5 rounded">{activeSeason}</span>
          </div>
          <div className="flex flex-col items-center gap-3.5">
            {renderDonut(byChannel.items, byChannel.total, ['#30d158', '#ff9f0a', '#5ac8fa', '#bf5af2', '#636366'])}
            <div className="w-full space-y-1.5">
              {byChannel.items.map((item, i) => (
                <div key={item.label} className="flex items-center gap-2 text-[11px]">
                  <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: ['#30d158', '#ff9f0a', '#5ac8fa', '#bf5af2', '#636366'][i] }} />
                  <span className="flex-1 text-text-muted">{item.label}</span>
                  <span className="font-mono font-medium text-text-primary">{formatCurrencyShort(item.revenue)}</span>
                  <span className="w-8 text-right font-mono text-[10px] text-text-faint">{item.percent.toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        {/* By Category (Horizontal Bars) */}
        <div className="bg-surface rounded-xl border border-border-strong p-5">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-[13px] font-semibold text-text-primary">By Category</h3>
            <span className="text-[10px] font-semibold text-[#0a84ff] bg-[rgba(10,132,255,0.15)] px-2 py-0.5 rounded">{activeSeason}</span>
          </div>
          <div className="space-y-2.5">
            {byCategory.map((item, i) => (
              <div key={item.label} className="flex items-center gap-2.5">
                <span className="w-[70px] text-[11px] text-text-muted truncate">{item.label}</span>
                <div className="flex-1 h-5 bg-surface-tertiary rounded overflow-hidden">
                  <div className="h-full rounded transition-all" style={{ width: `${item.percent}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                </div>
                <span className="w-[50px] text-right text-[11px] font-semibold font-mono text-text-primary">{formatCurrencyShort(item.revenue)}</span>
              </div>
            ))}
          </div>
        </div>
        {/* Category Breakdown (Grouped Bars) */}
        <div className="bg-surface rounded-xl border border-border-strong p-5">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-[13px] font-semibold text-text-primary">Revenue by Category</h3>
            <div className="flex gap-3">
              <span className="flex items-center gap-1.5 text-[10px] text-text-muted">
                <span className="w-2 h-2 rounded-sm bg-[#0a84ff]" /> {activeSeason}
              </span>
              {compareSeason && (
                <span className="flex items-center gap-1.5 text-[10px] text-text-muted">
                  <span className="w-2 h-2 rounded-sm bg-[#ff9f0a]" /> {compareSeason}
                </span>
              )}
            </div>
          </div>
          <div className="h-[140px] pt-2">
            <div className="flex justify-between h-full gap-1.5">
              {categoryBreakdown.map((cat) => {
                const maxVal = Math.max(...categoryBreakdown.map((c) => Math.max(c.current, c.compare)), 1);
                return (
                  <div key={cat.label} className="flex-1 flex flex-col items-center h-full">
                    <div className="flex-1 flex items-end gap-[3px] w-full pb-1.5">
                      <div className="flex-1 bg-[#0a84ff] rounded-t min-h-[4px]" style={{ height: `${(cat.current / maxVal) * 100}%` }} />
                      {compareSeason && (
                        <div className="flex-1 bg-[#ff9f0a] opacity-60 rounded-t min-h-[4px]" style={{ height: `${(cat.compare / maxVal) * 100}%` }} />
                      )}
                    </div>
                    <span className="text-[9px] text-text-faint uppercase">{cat.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Sub-tabs ── */}
      <div className="flex gap-1 bg-surface p-1 rounded-xl w-fit">
        {([
          { id: 'style', label: 'By Style', enabled: true },
          { id: 'customer', label: 'By Customer', enabled: false },
          { id: 'category', label: 'By Category', enabled: false },
          { id: 'region', label: 'By Region', enabled: false },
        ] as { id: SubTab; label: string; enabled: boolean }[]).map((tab) => (
          <button
            key={tab.id}
            onClick={() => { if (tab.enabled) { setSubTab(tab.id); setCurrentPage(1); } }}
            className={`px-4 py-2.5 rounded-md text-[13px] font-medium transition-all ${
              subTab === tab.id
                ? 'bg-surface-tertiary text-text-primary shadow-sm'
                : tab.enabled
                  ? 'text-text-muted hover:text-text-primary'
                  : 'text-text-faint opacity-40 cursor-not-allowed'
            }`}
            title={!tab.enabled ? 'Coming soon' : undefined}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Health Distribution Bar ── */}
      {subTab === 'style' && styleHealthScores.length > 0 && (
        <div className="bg-surface rounded-xl border border-border-strong overflow-hidden">
          <div className="px-6 py-4 border-b border-border-strong flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-text-primary">Style Health</h3>
              <p className="text-[11px] text-text-muted mt-0.5">
                {healthDistribution.total} styles scored
                {!inventoryOH?.length && <span className="text-amber-400 ml-1.5">(no inventory data — sell-through excluded)</span>}
              </p>
            </div>
            {healthTierFilter && (
              <button
                onClick={() => { setHealthTierFilter(null); setCurrentPage(1); }}
                className="flex items-center gap-1.5 text-sm text-cyan-400 hover:text-cyan-300 font-medium"
              >
                <X className="w-3.5 h-3.5" /> Clear filter
              </button>
            )}
          </div>
          <div className="px-6 py-5">
            {/* Segmented Health Bar */}
            <div className="h-8 rounded-full overflow-hidden flex mb-4">
              {(['excellent', 'good', 'watch', 'problem'] as HealthTier[]).map(tier => {
                const data = healthDistribution[tier];
                if (data.pct <= 0) return null;
                return (
                  <button
                    key={tier}
                    onClick={() => { setHealthTierFilter(healthTierFilter === tier ? null : tier); setCurrentPage(1); }}
                    className={`${getHealthBarColor(tier)} h-full transition-all hover:opacity-80 ${
                      healthTierFilter === tier ? 'ring-2 ring-offset-2 ring-offset-surface' : ''
                    }`}
                    style={{ width: `${data.pct}%` }}
                    title={`${tier}: ${data.count} styles`}
                  />
                );
              })}
            </div>
            {/* Legend */}
            <div className="flex justify-between text-sm">
              {[
                { tier: 'excellent' as HealthTier, label: 'Excellent', range: '75-100' },
                { tier: 'good' as HealthTier, label: 'Good', range: '50-74' },
                { tier: 'watch' as HealthTier, label: 'Watch', range: '25-49' },
                { tier: 'problem' as HealthTier, label: 'Problem', range: '0-24' },
              ].map(({ tier, label, range }) => (
                <button
                  key={tier}
                  onClick={() => { setHealthTierFilter(healthTierFilter === tier ? null : tier); setCurrentPage(1); }}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${
                    healthTierFilter === tier ? getHealthColor(tier) : 'hover:bg-surface-tertiary'
                  }`}
                >
                  <div className={`w-3 h-3 ${getHealthDot(tier)} rounded-full`} />
                  <span className="font-semibold text-text-secondary text-xs">{range}</span>
                  <span className="text-text-muted text-xs">{label}</span>
                  <span className="font-mono font-bold text-text-primary text-xs">{healthDistribution[tier].count}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Content Grid: Table + Sidebar ── */}
      <div className="grid grid-cols-[1fr_340px] gap-6">
        {/* Table Section */}
        <div className="bg-surface rounded-xl border border-border-strong overflow-hidden">
          {/* Table Header */}
          <div className="flex justify-between items-center px-5 py-4 border-b border-border-strong">
            <div>
              <div className="text-sm font-semibold text-text-primary">Style Health Scorecard</div>
              <div className="text-[11px] text-text-muted mt-0.5">
                {filteredStyles.length} styles · Sorted {scoreSortDir === 'asc' ? 'worst → best' : 'best → worst'} · Click row for details
              </div>
            </div>
            <div className="flex gap-2 items-center">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-faint" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                  placeholder="Search styles..."
                  className="pl-8 pr-3 py-2 rounded-md text-xs bg-surface-tertiary border border-border-strong text-text-primary placeholder:text-text-faint focus:outline-none focus:border-[#0a84ff] w-[200px]"
                />
              </div>
              <button
                onClick={exportCSV}
                className="p-2 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-tertiary transition-colors"
                title="Export CSV"
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="text-left px-3 py-2.5 text-[10px] font-semibold text-text-muted uppercase tracking-wider bg-surface-tertiary border-b border-border-strong whitespace-nowrap" style={{ width: 180 }}>
                    Style
                  </th>
                  <th className="text-left px-2 py-2.5 text-[10px] font-semibold text-text-muted uppercase tracking-wider bg-surface-tertiary border-b border-border-strong whitespace-nowrap">
                    Category
                  </th>
                  <th
                    onClick={() => handleScoreSort('compositeScore')}
                    className="text-center px-2 py-2.5 text-[10px] font-semibold text-text-muted uppercase tracking-wider bg-surface-tertiary border-b border-border-strong whitespace-nowrap cursor-pointer hover:text-text-primary"
                  >
                    Score {sortIndicator('compositeScore')}
                  </th>
                  {DIMENSION_LABELS.map(dim => (
                    <th
                      key={dim.key}
                      onClick={() => handleScoreSort(dim.key)}
                      className="text-center px-1.5 py-2.5 text-[10px] font-semibold text-text-muted uppercase tracking-wider bg-surface-tertiary border-b border-border-strong whitespace-nowrap cursor-pointer hover:text-text-primary"
                    >
                      {dim.short} {sortIndicator(dim.key)}
                    </th>
                  ))}
                  <th
                    onClick={() => handleScoreSort('revenue')}
                    className="text-right px-3 py-2.5 text-[10px] font-semibold text-text-muted uppercase tracking-wider bg-surface-tertiary border-b border-border-strong whitespace-nowrap cursor-pointer hover:text-text-primary"
                  >
                    Revenue {sortIndicator('revenue')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedStyles.map((style) => {
                  const isExpanded = expandedStyles.has(style.styleNumber);

                  return (
                    <Fragment key={style.styleNumber}>
                      {/* Parent row */}
                      <tr
                        onClick={() => toggleExpand(style.styleNumber)}
                        className={`cursor-pointer border-b border-border-primary transition-colors hover:bg-hover ${
                          isExpanded ? 'bg-surface-tertiary' : ''
                        }`}
                      >
                        <td className="px-3 py-2.5 text-[13px]">
                          <div className="flex items-center gap-2">
                            <span className={`w-[18px] h-[18px] flex items-center justify-center bg-surface-tertiary rounded text-[9px] text-text-muted transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                              <ChevronRightIcon className="w-3 h-3" />
                            </span>
                            <div className="flex flex-col">
                              <span className="font-semibold text-[13px] text-text-primary">{style.styleNumber}</span>
                              <span className="text-[10px] text-text-muted truncate max-w-[120px]">{style.styleDesc}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-2 py-2.5 text-[11px] text-text-muted">{style.categoryDesc}</td>
                        {/* Composite Score Badge */}
                        <td className="px-2 py-2.5 text-center">
                          <span className={`font-mono font-bold px-2.5 py-1 rounded-lg text-sm ${getHealthColor(style.tier)}`}>
                            {style.compositeScore}
                          </span>
                        </td>
                        {/* Margin */}
                        <td className="px-1.5 py-2.5 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <div className={`w-2 h-2 rounded-full ${style.hasCostData ? getHealthDot(style.margin.tier) : 'bg-surface-tertiary'}`} />
                            <span className="font-mono text-[11px] text-text-secondary">
                              {style.hasCostData ? `${style.margin.raw.toFixed(0)}%` : '--'}
                            </span>
                          </div>
                        </td>
                        {/* Sell-Through */}
                        <td className="px-1.5 py-2.5 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <div className={`w-2 h-2 rounded-full ${style.hasInventoryData ? getHealthDot(style.sellThrough.tier) : 'bg-surface-tertiary'}`} />
                            <span className="font-mono text-[11px] text-text-secondary">
                              {style.hasInventoryData ? `${style.sellThrough.raw.toFixed(0)}%` : '--'}
                            </span>
                          </div>
                        </td>
                        {/* Growth */}
                        <td className="px-1.5 py-2.5 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <div className={`w-2 h-2 rounded-full ${style.change !== null ? getHealthDot(style.growth.tier) : 'bg-surface-tertiary'}`} />
                            <span className={`font-mono text-[11px] ${
                              style.change === null ? 'text-text-faint' :
                              style.change >= 0 ? 'text-emerald-400' : 'text-red-400'
                            }`}>
                              {style.change !== null ? `${style.change >= 0 ? '+' : ''}${style.change.toFixed(0)}%` : '--'}
                            </span>
                          </div>
                        </td>
                        {/* Channel Diversity */}
                        <td className="px-1.5 py-2.5 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <div className={`w-2 h-2 rounded-full ${getHealthDot(style.channelDiversity.tier)}`} />
                            <span className="font-mono text-[11px] text-text-secondary">{style.channelDiversity.raw}</span>
                          </div>
                        </td>
                        {/* Price Strength */}
                        <td className="px-1.5 py-2.5 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <div className={`w-2 h-2 rounded-full ${getHealthDot(style.priceStrength.tier)}`} />
                            <span className="font-mono text-[11px] text-text-secondary">
                              {style.priceStrength.raw >= 100 ? '100%' : `${style.priceStrength.raw.toFixed(0)}%`}
                            </span>
                          </div>
                        </td>
                        {/* Revenue */}
                        <td className="px-3 py-2.5 text-right font-mono text-xs font-medium text-text-primary">
                          {formatCurrencyShort(style.revenue)}
                        </td>
                      </tr>

                      {/* Expanded detail row */}
                      {isExpanded && (
                        <tr className="bg-surface-tertiary border-b border-border-strong">
                          <td colSpan={9} className="px-6 py-4">
                            <div className="grid grid-cols-5 gap-3 mb-3">
                              {[
                                { label: 'Margin', dim: style.margin, hasData: style.hasCostData,
                                  detail: style.hasCostData ? `${style.margin.raw.toFixed(1)}% true margin` : 'No cost data available' },
                                { label: 'Sell-Through', dim: style.sellThrough, hasData: style.hasInventoryData,
                                  detail: style.hasInventoryData ? `${style.sellThrough.raw.toFixed(0)}% of available sold` : 'No inventory data' },
                                { label: 'Growth', dim: style.growth, hasData: style.change !== null,
                                  detail: style.change !== null ? `${style.change >= 0 ? '+' : ''}${style.change.toFixed(1)}% vs ${compareSeason}` : 'No compare season' },
                                { label: 'Channels', dim: style.channelDiversity, hasData: true,
                                  detail: `${style.channelDiversity.raw} channel${style.channelDiversity.raw !== 1 ? 's' : ''}` },
                                { label: 'Price Strength', dim: style.priceStrength, hasData: true,
                                  detail: `${style.priceStrength.raw.toFixed(0)}% of wholesale price` },
                              ].map(({ label, dim, hasData, detail }) => (
                                <div key={label} className={`rounded-lg p-3 border border-white/5 ${getHealthColor(dim.tier)}`}>
                                  <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-[10px] font-semibold uppercase tracking-wider">{label}</span>
                                    <span className="font-mono font-bold text-sm">{hasData ? dim.score : '--'}</span>
                                  </div>
                                  <div className="h-1.5 bg-black/20 rounded-full overflow-hidden mb-1.5">
                                    <div className={`h-full ${getHealthBarColor(dim.tier)} rounded-full transition-all`}
                                         style={{ width: `${hasData ? dim.score : 0}%` }} />
                                  </div>
                                  <span className="text-[10px] opacity-80">{detail}</span>
                                </div>
                              ))}
                            </div>
                            {/* Colors */}
                            {style.colorList.length > 0 && (
                              <div className="pt-3 border-t border-border-strong">
                                <div className="text-[10px] text-text-faint uppercase tracking-wider mb-2">Colors ({style.colorList.length})</div>
                                <div className="flex flex-wrap gap-1.5">
                                  {style.colorList.slice(0, 16).map((color) => (
                                    <span key={color.color} className="px-2 py-0.5 bg-hover rounded text-[10px] text-text-muted">
                                      {color.color}{color.colorDesc && color.colorDesc !== color.color ? ` - ${color.colorDesc}` : ''}
                                    </span>
                                  ))}
                                  {style.colorList.length > 16 && (
                                    <span className="px-2 py-0.5 text-[10px] text-text-faint">+{style.colorList.length - 16} more</span>
                                  )}
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}

                {paginatedStyles.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-5 py-12 text-center text-text-muted text-sm">
                      No styles found{searchQuery ? ` matching "${searchQuery}"` : ''}{healthTierFilter ? ` in ${healthTierFilter} tier` : ''}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Table Footer / Pagination */}
          <div className="flex justify-between items-center px-5 py-3 border-t border-border-strong">
            <span className="text-xs text-text-muted">
              Showing {filteredStyles.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}-{Math.min(currentPage * pageSize, filteredStyles.length)} of {filteredStyles.length} styles
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 border border-border-strong bg-surface-tertiary text-text-primary text-xs rounded-md hover:bg-hover disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ← Prev
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="px-3 py-1.5 border border-border-strong bg-surface-tertiary text-text-primary text-xs rounded-md hover:bg-hover disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next →
              </button>
            </div>
          </div>
        </div>

        {/* ── Sidebar ── */}
        <div className="flex flex-col gap-4">
          {/* Selected Style Health Detail */}
          {selectedStyleData && (
            <div className="bg-surface rounded-xl border border-[#0a84ff] p-5">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h2 className="text-[22px] font-bold text-text-primary mb-0.5">{selectedStyleData.styleNumber}</h2>
                  <p className="text-xs text-text-muted">{selectedStyleData.styleDesc} · {selectedStyleData.gender}</p>
                </div>
                <span className={`font-mono font-bold px-3 py-1.5 rounded-lg text-lg ${getHealthColor(selectedStyleData.tier)}`}>
                  {selectedStyleData.compositeScore}
                </span>
              </div>

              {/* Dimension bars */}
              <div className="space-y-2 mb-4">
                {[
                  { label: 'Margin', score: selectedStyleData.margin.score, tier: selectedStyleData.margin.tier, hasData: selectedStyleData.hasCostData },
                  { label: 'Sell-Thru', score: selectedStyleData.sellThrough.score, tier: selectedStyleData.sellThrough.tier, hasData: selectedStyleData.hasInventoryData },
                  { label: 'Growth', score: selectedStyleData.growth.score, tier: selectedStyleData.growth.tier, hasData: selectedStyleData.change !== null },
                  { label: 'Channels', score: selectedStyleData.channelDiversity.score, tier: selectedStyleData.channelDiversity.tier, hasData: true },
                  { label: 'Price', score: selectedStyleData.priceStrength.score, tier: selectedStyleData.priceStrength.tier, hasData: true },
                ].map(d => (
                  <div key={d.label} className="flex items-center gap-2">
                    <span className="text-[10px] text-text-muted w-14 text-right">{d.label}</span>
                    <div className="flex-1 h-2 bg-surface-tertiary rounded-full overflow-hidden">
                      <div className={`h-full ${getHealthBarColor(d.tier)} rounded-full transition-all`}
                           style={{ width: `${d.hasData ? d.score : 0}%` }} />
                    </div>
                    <span className="font-mono text-[10px] text-text-secondary w-6 text-right">{d.hasData ? d.score : '--'}</span>
                  </div>
                ))}
              </div>

              {/* Revenue + units summary */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="bg-surface-tertiary rounded-lg p-3">
                  <div className="text-[10px] text-text-faint uppercase">Revenue</div>
                  <div className="text-lg font-semibold font-mono text-text-primary">{formatCurrencyShort(selectedStyleData.revenue)}</div>
                  {selectedStyleData.change !== null && (
                    <div className={`text-[10px] mt-0.5 ${selectedStyleData.change >= 0 ? 'text-[#30d158]' : 'text-[#ff453a]'}`}>
                      {selectedStyleData.change >= 0 ? '↑' : '↓'} {Math.abs(selectedStyleData.change).toFixed(1)}%
                    </div>
                  )}
                </div>
                <div className="bg-surface-tertiary rounded-lg p-3">
                  <div className="text-[10px] text-text-faint uppercase">Units</div>
                  <div className="text-lg font-semibold font-mono text-text-primary">{formatNumber(selectedStyleData.units)}</div>
                </div>
              </div>
            </div>
          )}

          {/* Needs Attention */}
          {needsAttention.length > 0 && (
            <div className="bg-surface rounded-xl border border-red-500/30 p-5">
              <h3 className="text-[13px] font-semibold text-text-primary mb-4 flex items-center gap-2">
                <span className="text-red-400">⚠</span> Needs Attention
              </h3>
              <div className="space-y-2">
                {needsAttention.map((style) => (
                  <div
                    key={style.styleNumber}
                    onClick={() => { setSelectedStyle(style.styleNumber); onStyleClick(style.styleNumber); }}
                    className="flex items-center gap-2.5 p-2.5 bg-surface-tertiary rounded-lg cursor-pointer hover:bg-hover transition-colors"
                  >
                    <span className={`font-mono font-bold text-xs px-2 py-0.5 rounded ${getHealthColor(style.tier)}`}>
                      {style.compositeScore}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-text-primary">{style.styleNumber}</div>
                      <div className="text-[10px] text-text-muted truncate">{style.styleDesc}</div>
                    </div>
                    <span className="font-mono text-[10px] text-text-faint">{formatCurrencyShort(style.revenue)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top 5 Styles */}
          <div className="bg-surface rounded-xl border border-border-strong p-5">
            <h3 className="text-[13px] font-semibold text-text-primary mb-4 flex items-center gap-2">
              <span>🏆</span> Top 5 by Revenue
            </h3>
            <div className="space-y-2">
              {top5Styles.map((style, i) => (
                <div
                  key={style.styleNumber}
                  onClick={() => { setSelectedStyle(style.styleNumber); onStyleClick(style.styleNumber); }}
                  className="flex items-center gap-2.5 p-2.5 bg-surface-tertiary rounded-lg cursor-pointer hover:bg-hover transition-colors"
                >
                  <span className={`w-[22px] h-[22px] flex items-center justify-center rounded-md text-[11px] font-semibold ${
                    i === 0 ? 'bg-gradient-to-br from-yellow-400 to-orange-400 text-black'
                    : i === 1 ? 'bg-gradient-to-br from-gray-300 to-gray-400 text-black'
                    : i === 2 ? 'bg-gradient-to-br from-amber-700 to-amber-900 text-white'
                    : 'bg-hover text-text-muted'
                  }`}>
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-text-primary">{style.styleNumber}</div>
                    <div className="text-[10px] text-text-muted truncate">{style.styleDesc}</div>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-xs font-medium text-text-primary">{formatCurrencyShort(style.revenue)}</span>
                    <div>
                      <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${getHealthColor(style.tier)}`}>
                        {style.compositeScore}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Biggest Growth */}
          <div className="bg-surface rounded-xl border border-border-strong p-5">
            <h3 className="text-[13px] font-semibold text-text-primary mb-4 flex items-center gap-2">
              <span>📈</span> Biggest Growth
            </h3>
            <div className="space-y-2">
              {biggestGrowth.map((style) => (
                <div
                  key={style.styleNumber}
                  onClick={() => { setSelectedStyle(style.styleNumber); onStyleClick(style.styleNumber); }}
                  className="flex items-center gap-2.5 p-2.5 bg-surface-tertiary rounded-lg cursor-pointer hover:bg-hover transition-colors"
                >
                  <span className="w-[22px] h-[22px] flex items-center justify-center rounded-md text-[11px] font-semibold bg-[#30d158] text-white">↑</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-text-primary">{style.styleNumber}</div>
                    <div className="text-[10px] text-text-muted truncate">{style.styleDesc}</div>
                  </div>
                  <span className="font-mono text-xs font-medium text-[#30d158]">
                    +{(style.change || 0).toFixed(1)}%
                  </span>
                </div>
              ))}
              {biggestGrowth.length === 0 && (
                <p className="text-xs text-text-faint text-center py-3">Select a compare season to see growth</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
