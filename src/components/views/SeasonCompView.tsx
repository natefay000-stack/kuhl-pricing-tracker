'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Product, SalesRecord, normalizeCategory } from '@/types/product';
import { sortSeasons } from '@/lib/store';
import { isRelevantSeason } from '@/utils/season';
import { getSeasonStatus as getCanonicalStatus } from '@/lib/season-utils';
import { Download, X, AlertTriangle, TrendingUp } from 'lucide-react';
import * as XLSX from 'xlsx';
import { SourceLegend } from '@/components/SourceBadge';
import { formatCurrencyShort } from '@/utils/format';
import { matchesDivision, matchesGender } from '@/utils/divisionMap';
import SalesLoadingBanner from '@/components/SalesLoadingBanner';

interface SeasonCompViewProps {
  products: Product[];
  sales: SalesRecord[];
  selectedSeason?: string;
  selectedDivision?: string;
  selectedGender?: string;
  selectedCategory?: string;
  searchQuery?: string;
  onStyleClick: (styleNumber: string) => void;
}

// Gender detection from division description
function getGenderFromDivision(divisionDesc: string): 'Men' | 'Women' | 'Unisex' {
  if (!divisionDesc) return 'Unisex';
  const lower = divisionDesc.toLowerCase();
  if (lower.includes("women") || lower.includes("woman")) return 'Women';
  if (lower.includes("men") && !lower.includes("women")) return 'Men';
  return 'Unisex';
}

// Map canonical season status to display labels
const STATUS_MAP: Record<string, 'Planning' | 'Pre-Book' | 'Selling' | 'Closed'> = {
  'PLANNING': 'Planning',
  'PRE-BOOK': 'Pre-Book',
  'SHIPPING': 'Selling',
  'CLOSED': 'Closed',
};

function getSeasonStatusLabel(season: string): 'Planning' | 'Pre-Book' | 'Selling' | 'Closed' {
  return STATUS_MAP[getCanonicalStatus(season)] || 'Closed';
}

// Calculate percent change
function getChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

// Calculate revenue per style
function getRevenuePerStyle(data: { styles: number; revenue: number }): number {
  if (data.styles === 0) return 0;
  return Math.round(data.revenue / data.styles);
}

// Get status color classes
function getStatusColor(status: string): string {
  switch (status) {
    case 'Closed': return 'bg-surface-tertiary text-text-secondary';
    case 'Selling': return 'bg-emerald-100 dark:bg-emerald-900 text-emerald-700';
    case 'Pre-Book': return 'bg-blue-100 dark:bg-blue-900 text-blue-700';
    case 'Planning': return 'bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300';
    default: return 'bg-surface-tertiary text-text-secondary';
  }
}

// Grid column class lookup (Tailwind can't detect dynamic classes)
const GRID_COLS: Record<number, string> = {
  1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3',
  4: 'grid-cols-4', 5: 'grid-cols-5', 6: 'grid-cols-6',
};

export default function SeasonCompView({
  products,
  sales,
  selectedSeason: globalSeason = '',
  selectedDivision: globalDivision = '',
  selectedGender: globalGender = '',
  selectedCategory: globalCategory = '',
  searchQuery: globalSearchQuery,
  onStyleClick,
}: SeasonCompViewProps) {
  const [selectedDivision, setSelectedDivision] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedDesigner, setSelectedDesigner] = useState<string>('');
  const [selectedSeasons, setSelectedSeasons] = useState<string[]>([]);
  const [selectedCustomerType, setSelectedCustomerType] = useState<string>('');
  const [selectedCustomer, setSelectedCustomer] = useState<string>('');
  const [breakdownMetric, setBreakdownMetric] = useState<'all' | 'styles' | 'revenue' | 'revPerStyle'>('all');

  // Get all available seasons (only recent ones: 24-27)
  const allSeasons = useMemo(() => {
    const seasonSet = new Set<string>();
    products.forEach((p) => p.season && seasonSet.add(p.season));
    sales.forEach((s) => s.season && seasonSet.add(s.season));
    return sortSeasons(Array.from(seasonSet))
      .filter((s) => isRelevantSeason(s));
  }, [products, sales]);

  // Sync global FilterBar → local state
  useEffect(() => {
    if (!globalSeason) return;
    if (globalSeason === '__ALL_SP__') {
      setSelectedSeasons(allSeasons.filter(s => s.endsWith('SP')));
    } else if (globalSeason === '__ALL_FA__') {
      setSelectedSeasons(allSeasons.filter(s => s.endsWith('FA')));
    } else if (allSeasons.includes(globalSeason)) {
      setSelectedSeasons([globalSeason]);
    }
  }, [globalSeason, allSeasons]);

  useEffect(() => {
    if (globalDivision !== selectedDivision) setSelectedDivision(globalDivision);
  }, [globalDivision]);

  useEffect(() => {
    if (globalCategory !== selectedCategory) setSelectedCategory(globalCategory);
  }, [globalCategory]);

  // Active seasons for comparison (selected or last 4)
  const seasons = useMemo(() => {
    if (selectedSeasons.length > 0) {
      return sortSeasons(selectedSeasons);
    }
    return allSeasons.slice(-4);
  }, [allSeasons, selectedSeasons]);

  // Toggle a season in the selection
  const toggleSeason = (season: string) => {
    setSelectedSeasons((prev) =>
      prev.includes(season)
        ? prev.filter((s) => s !== season)
        : [...prev, season]
    );
  };

  // Clear season filter
  const clearSeasonFilter = () => {
    setSelectedSeasons([]);
  };

  // Select all Spring or all Fall seasons
  const selectSeasonType = (type: 'SP' | 'FA') => {
    const matching = allSeasons.filter((s) => s.includes(type));
    const allSelected = matching.every((s) => selectedSeasons.includes(s));
    if (allSelected) {
      // Deselect all of this type
      setSelectedSeasons((prev) => prev.filter((s) => !s.includes(type)));
    } else {
      // Select all of this type
      setSelectedSeasons((prev) => {
        const others = prev.filter((s) => !s.includes(type));
        return [...others, ...matching];
      });
    }
  };

  // Get filter options
  const divisions = useMemo(() => {
    const all = new Set<string>();
    products.forEach((p) => p.divisionDesc && all.add(p.divisionDesc));
    return Array.from(all).sort();
  }, [products]);

  const designers = useMemo(() => {
    const all = new Set<string>();
    products.forEach((p) => p.designerName && all.add(p.designerName));
    return Array.from(all).sort();
  }, [products]);

  // Get unique customer types from sales
  const customerTypes = useMemo(() => {
    const all = new Set<string>();
    sales.forEach((s) => s.customerType && all.add(s.customerType));
    return Array.from(all).sort();
  }, [sales]);

  // Get unique customers from sales
  const customers = useMemo(() => {
    const all = new Set<string>();
    sales.forEach((s) => s.customer && all.add(s.customer));
    return Array.from(all).sort();
  }, [sales]);

  // Get categories based on division filter
  const categories = useMemo(() => {
    let filtered = products;
    if (selectedDivision) {
      filtered = products.filter((p) => matchesDivision(p.divisionDesc, selectedDivision));
    }
    const all = new Set<string>();
    filtered.forEach((p) => {
      if (p.categoryDesc) all.add(normalizeCategory(p.categoryDesc));
    });
    return Array.from(all).sort();
  }, [products, selectedDivision]);

  // Get the same season from the previous year (e.g., 25SP -> 24SP, 25FA -> 24FA)
  const getPreviousYearSeason = (season: string): string | null => {
    const year = parseInt(season.slice(0, 2));
    const type = season.slice(2); // SP or FA
    const prevYear = year - 1;
    const prevSeason = `${prevYear}${type}`;
    return allSeasons.includes(prevSeason) ? prevSeason : null;
  };

  // Build aggregated data by season/category/division
  const seasonData = useMemo(() => {
    const data = new Map<string, Map<string, { styles: Set<string>; units: number; revenue: number }>>();

    // Initialize for all seasons (including those needed for YoY comparison)
    const allSeasonsForData = new Set([...seasons]);
    seasons.forEach(s => {
      const prev = getPreviousYearSeason(s);
      if (prev) allSeasonsForData.add(prev);
    });

    allSeasonsForData.forEach((season) => {
      data.set(season, new Map());
    });

    // Aggregate products (style counts)
    products.forEach((p) => {
      if (!allSeasonsForData.has(p.season)) return;
      if (!matchesDivision(p.divisionDesc, selectedDivision)) return;
      if (selectedDesigner) {
        const designerTokens = selectedDesigner.split('|').filter(Boolean);
        if (designerTokens.length > 0 && !designerTokens.includes(p.designerName ?? '')) return;
      }
      if (globalSearchQuery) {
        const q = globalSearchQuery.toLowerCase();
        if (!p.styleNumber?.toLowerCase().includes(q) && !(p.styleDesc || '').toLowerCase().includes(q)) return;
      }

      const category = normalizeCategory(p.categoryDesc) || 'Other';
      const seasonMap = data.get(p.season);
      if (!seasonMap) return;

      if (!seasonMap.has(category)) {
        seasonMap.set(category, { styles: new Set(), units: 0, revenue: 0 });
      }
      seasonMap.get(category)!.styles.add(p.styleNumber);
    });

    // Aggregate sales (units & revenue)
    sales.forEach((s) => {
      if (!allSeasonsForData.has(s.season)) return;
      if (selectedDivision) {
        const tokens = selectedDivision.split('|').filter(Boolean);
        if (tokens.length > 0) {
          const saleGender = getGenderFromDivision(s.divisionDesc || '');
          const passes = tokens.some((tok) => {
            const gender = getGenderFromDivision(tok);
            return gender === 'Unisex' || saleGender === 'Unisex' || gender === saleGender;
          });
          if (!passes) return;
        }
      }
      // Page-level gender filter (separate from the legacy division-derived
      // gender check above). Sale.gender is exact-matched against the
      // pipe-delimited selection.
      if (globalGender && !matchesGender(s.gender, globalGender)) return;
      if (selectedDesigner) {
        const designerTokens = selectedDesigner.split('|').filter(Boolean);
        if (designerTokens.length > 0) {
          const styleProduct = products.find((p) => p.styleNumber === s.styleNumber && designerTokens.includes(p.designerName ?? ''));
          if (!styleProduct) return;
        }
      }
      // Filter by customer type
      if (selectedCustomerType) {
        const tokens = selectedCustomerType.split('|').filter(Boolean);
        if (tokens.length > 0 && !tokens.includes(s.customerType ?? '')) return;
      }
      // Filter by customer
      if (selectedCustomer) {
        const tokens = selectedCustomer.split('|').filter(Boolean);
        if (tokens.length > 0 && !tokens.includes(s.customer ?? '')) return;
      }
      if (globalSearchQuery) {
        const q = globalSearchQuery.toLowerCase();
        if (!s.styleNumber?.toLowerCase().includes(q) && !(s.styleDesc || '').toLowerCase().includes(q)) return;
      }

      const category = normalizeCategory(s.categoryDesc) || 'Other';
      const seasonMap = data.get(s.season);
      if (!seasonMap) return;

      if (!seasonMap.has(category)) {
        seasonMap.set(category, { styles: new Set(), units: 0, revenue: 0 });
      }
      const catData = seasonMap.get(category)!;
      catData.units += s.unitsBooked || 0;
      catData.revenue += s.revenue || 0;
    });

    return data;
  }, [products, sales, seasons, selectedDivision, globalGender, selectedDesigner, selectedCustomerType, selectedCustomer, allSeasons, globalSearchQuery]);

  // Get data for a specific season/category
  const getData = (season: string, category: string) => {
    const seasonMap = seasonData.get(season);
    if (!seasonMap) return { styles: 0, units: 0, revenue: 0 };

    if (category === '' || category === 'All') {
      let totals = { styles: 0, units: 0, revenue: 0 };
      seasonMap.forEach((cat) => {
        totals.styles += cat.styles.size;
        totals.units += cat.units;
        totals.revenue += cat.revenue;
      });
      return totals;
    }

    const catData = seasonMap.get(category);
    if (!catData) return { styles: 0, units: 0, revenue: 0 };
    return { styles: catData.styles.size, units: catData.units, revenue: catData.revenue };
  };

  // Generate contextual insight for a category
  const getCategoryInsight = (category: string): { type: 'warning' | 'success'; text: string } | null => {
    if (seasons.length < 1) return null;

    const mostRecentSeason = seasons[seasons.length - 1];
    const prevYearSeason = getPreviousYearSeason(mostRecentSeason);
    if (!prevYearSeason) return null;

    const current = getData(mostRecentSeason, category);
    const previous = getData(prevYearSeason, category);

    const revenueChange = getChange(current.revenue, previous.revenue);
    const stylesChange = getChange(current.styles, previous.styles);
    const rpsNow = getRevenuePerStyle(current);
    const rpsPrev = getRevenuePerStyle(previous);

    // Planning season with lots more styles but previous season had flat/declining revenue
    if (getSeasonStatusLabel(mostRecentSeason) === 'Planning' && stylesChange > 30 && revenueChange < 5) {
      return { type: 'warning', text: `+${stylesChange}% styles planned but recent revenue flat` };
    }
    if (stylesChange > 20 && revenueChange < 0) {
      return { type: 'warning', text: `+${stylesChange}% styles but revenue down ${Math.abs(revenueChange)}%` };
    }
    if (stylesChange < -15 && revenueChange > 10) {
      return { type: 'success', text: 'Fewer styles, more revenue - efficient!' };
    }
    if (rpsPrev > 0 && rpsNow > rpsPrev * 1.25) {
      return { type: 'success', text: `High performer: ${formatCurrencyShort(rpsNow)}/style` };
    }
    if (rpsPrev > 0 && rpsNow < rpsPrev * 0.75) {
      return { type: 'warning', text: '$/style declining significantly' };
    }
    return null;
  };

  // Generate main insight banner content
  const getMainInsight = () => {
    if (seasons.length < 2 || !selectedCategory || selectedCategory === 'All') return null;

    const mostRecentSeason = seasons[seasons.length - 1];
    const prevYearSeason = getPreviousYearSeason(mostRecentSeason);
    if (!prevYearSeason) return null;

    const current = getData(mostRecentSeason, selectedCategory);
    const previous = getData(prevYearSeason, selectedCategory);
    const isPlanning = getSeasonStatusLabel(mostRecentSeason) === 'Planning';

    const stylesChange = getChange(current.styles, previous.styles);
    const revenueChange = getChange(previous.revenue, getData(getPreviousYearSeason(prevYearSeason) || '', selectedCategory).revenue);

    if (isPlanning && stylesChange > 30 && revenueChange < 10) {
      return {
        type: 'warning' as const,
        title: `Assortment Alert: ${selectedDivision || 'All'} ${selectedCategory}`,
        text: `You're planning ${current.styles} styles for ${mostRecentSeason} — that's +${stylesChange}% more than ${prevYearSeason} (${previous.styles} styles). Consider whether more styles will drive more revenue, or if focusing on proven winners would be more effective.`
      };
    }

    return null;
  };

  // Export to Excel
  const exportToExcel = () => {
    const exportData: Record<string, unknown>[] = [];

    categories.forEach((category) => {
      const row: Record<string, unknown> = { Category: category };
      seasons.forEach((season) => {
        const data = getData(season, category);
        row[`${season} Revenue`] = data.revenue;
        row[`${season} Units`] = data.units;
        row[`${season} Styles`] = data.styles;
        row[`${season} $/Style`] = getRevenuePerStyle(data);
        const prevYearSeason = getPreviousYearSeason(season);
        if (prevYearSeason) {
          const prevYearData = getData(prevYearSeason, category);
          row[`${season} vs ${prevYearSeason} %`] = getChange(data.revenue, prevYearData.revenue);
        }
      });
      exportData.push(row);
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Season Comp');
    XLSX.writeFile(wb, 'KUHL_SeasonComp.xlsx');
  };

  const mainInsight = getMainInsight();

  return (
    <div className="p-6 space-y-6">
      <SalesLoadingBanner />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-4xl font-display font-bold text-text-primary">Season Comp</h2>
          <p className="text-base text-text-muted mt-1">
            Compare performance across seasons by category, division & designer
          </p>
        </div>
        <button
          onClick={exportToExcel}
          className="flex items-center gap-2 px-5 py-3 bg-emerald-500 hover:bg-emerald-600 text-white text-base font-bold rounded-xl transition-colors shadow-lg"
        >
          <Download className="w-5 h-5" />
          Export Analysis
        </button>
      </div>

      {/* Data Sources Legend */}
      <SourceLegend sources={['sales', 'linelist']} className="bg-surface rounded-xl border-2 border-border-primary p-4" />

      {/* Quick Season Filter */}
      <div className="bg-surface rounded-xl border-2 border-border-primary p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <span className="text-sm font-bold text-text-muted uppercase tracking-wide">Quick Season Filter</span>
            {/* All Spring / All Fall buttons */}
            <button
              onClick={() => selectSeasonType('SP')}
              className={`text-sm font-bold px-4 py-1.5 rounded-lg transition-colors ${
                allSeasons.filter((s) => s.includes('SP')).every((s) => selectedSeasons.includes(s)) && allSeasons.filter((s) => s.includes('SP')).length > 0
                  ? 'bg-emerald-500 text-white'
                  : 'bg-emerald-100 dark:bg-emerald-900 text-emerald-700 hover:bg-emerald-200'
              }`}
            >
              All Spring
            </button>
            <button
              onClick={() => selectSeasonType('FA')}
              className={`text-sm font-bold px-4 py-1.5 rounded-lg transition-colors ${
                allSeasons.filter((s) => s.includes('FA')).every((s) => selectedSeasons.includes(s)) && allSeasons.filter((s) => s.includes('FA')).length > 0
                  ? 'bg-orange-500 text-white'
                  : 'bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300 hover:bg-orange-200 dark:hover:bg-orange-800'
              }`}
            >
              All Fall
            </button>
          </div>
          {selectedSeasons.length > 0 && (
            <button
              onClick={clearSeasonFilter}
              className="flex items-center gap-2 text-sm font-medium text-text-muted hover:text-text-secondary"
            >
              <X className="w-4 h-4" />
              Clear ({selectedSeasons.length} selected)
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-3">
          {allSeasons.map((season) => {
            const isSelected = selectedSeasons.length === 0
              ? seasons.includes(season)
              : selectedSeasons.includes(season);
            const status = getSeasonStatusLabel(season);
            const isSpring = season.includes('SP');

            return (
              <button
                key={season}
                onClick={() => toggleSeason(season)}
                className={`px-5 py-3 rounded-xl text-base font-bold transition-all ${
                  isSelected
                    ? status === 'Planning'
                      ? 'bg-purple-500 text-white'
                      : isSpring
                      ? 'bg-emerald-500 text-white'
                      : 'bg-orange-500 text-white'
                    : 'bg-surface-tertiary text-text-secondary hover:bg-surface-tertiary'
                }`}
              >
                <div className="font-mono font-black">{season}</div>
                <div className={`text-xs font-medium mt-0.5 ${
                  isSelected ? 'text-white/80' : 'text-text-faint'
                }`}>
                  {status}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Filters & View Options */}
      <div className="bg-surface rounded-xl border-2 border-border-primary p-5">
        <div className="flex gap-6 flex-wrap items-end">
          <div>
            <label className="block text-sm font-bold text-text-muted uppercase tracking-wide mb-2">Division</label>
            <select
              className="border-2 border-border-primary rounded-xl px-4 py-3 text-base font-semibold bg-surface min-w-[160px] focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
              value={selectedDivision}
              onChange={(e) => {
                setSelectedDivision(e.target.value);
                setSelectedCategory('');
              }}
            >
              <option value="">All Divisions</option>
              {divisions.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-text-muted uppercase tracking-wide mb-2">Category</label>
            <select
              className={`border-2 rounded-xl px-4 py-3 text-base font-semibold bg-surface min-w-[180px] focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 ${
                selectedCategory ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-950' : 'border-border-primary'
              }`}
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-text-muted uppercase tracking-wide mb-2">Designer</label>
            <select
              className="border-2 border-border-primary rounded-xl px-4 py-3 text-base font-semibold bg-surface min-w-[180px] focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
              value={selectedDesigner}
              onChange={(e) => setSelectedDesigner(e.target.value)}
            >
              <option value="">All Designers</option>
              {designers.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-text-muted uppercase tracking-wide mb-2">Customer Type</label>
            <select
              className={`border-2 rounded-xl px-4 py-3 text-base font-semibold bg-surface min-w-[160px] focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 ${
                selectedCustomerType ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/50' : 'border-border-primary'
              }`}
              value={selectedCustomerType}
              onChange={(e) => {
                setSelectedCustomerType(e.target.value);
                setSelectedCustomer(''); // Reset customer when type changes
              }}
            >
              <option value="">All Types</option>
              {customerTypes.map((ct) => (
                <option key={ct} value={ct}>{ct}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-text-muted uppercase tracking-wide mb-2">Customer</label>
            <select
              className={`border-2 rounded-xl px-4 py-3 text-base font-semibold bg-surface min-w-[200px] focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 ${
                selectedCustomer ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/50' : 'border-border-primary'
              }`}
              value={selectedCustomer}
              onChange={(e) => setSelectedCustomer(e.target.value)}
            >
              <option value="">All Customers</option>
              {customers.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Season Summary Cards - Total Revenue is Hero */}
      <div className={`grid gap-5 ${GRID_COLS[Math.min(seasons.length, 6)] || 'grid-cols-4'}`}>
        {seasons.map((season) => {
          const data = getData(season, selectedCategory);
          const prevYearSeason = getPreviousYearSeason(season);
          const prevYearData = prevYearSeason ? getData(prevYearSeason, selectedCategory) : null;
          const revenueChange = prevYearData ? getChange(data.revenue, prevYearData.revenue) : null;
          const stylesChange = prevYearData ? getChange(data.styles, prevYearData.styles) : null;
          const status = getSeasonStatusLabel(season);
          const isPlanning = status === 'Planning';
          const revenuePerStyle = getRevenuePerStyle(data);

          return (
            <div
              key={season}
              className={`rounded-2xl border-2 p-6 ${
                isPlanning ? 'bg-purple-50 dark:bg-purple-950/50 border-purple-200 dark:border-purple-800' : 'bg-surface border-border-primary'
              }`}
            >
              {/* Season Header */}
              <div className="flex items-center justify-between mb-4">
                <span className={`text-2xl font-mono font-black ${
                  isPlanning ? 'text-purple-700 dark:text-purple-400' : 'text-emerald-600'
                }`}>
                  {season}
                </span>
                <span className={`text-sm px-3 py-1 rounded-full font-bold ${getStatusColor(status)}`}>
                  {status}
                </span>
              </div>

              {/* Primary Metric: Total Revenue */}
              <div className="mb-4">
                <div className="text-4xl font-black text-text-primary">
                  {isPlanning ? '—' : formatCurrencyShort(data.revenue)}
                </div>
                <div className="text-sm font-bold text-text-muted uppercase tracking-wide mt-1">Total Revenue</div>
                {/* Fixed height for comparison to maintain alignment */}
                <div className="h-7 mt-2">
                  {revenueChange !== null && !isPlanning && prevYearSeason ? (
                    <div className={`text-base font-bold ${
                      revenueChange > 0 ? 'text-emerald-600 dark:text-emerald-400' :
                      revenueChange < 0 ? 'text-red-500 dark:text-red-400' : 'text-text-muted'
                    }`}>
                      {revenueChange > 0 ? '↑' : revenueChange < 0 ? '↓' : '→'} {Math.abs(revenueChange)}% vs {prevYearSeason}
                    </div>
                  ) : (
                    <div className="text-transparent">—</div>
                  )}
                </div>
              </div>

              {/* Supporting Metrics */}
              <div className="pt-4 border-t-2 border-border-primary grid grid-cols-2 gap-4">
                <div>
                  <div className="text-2xl font-black text-text-primary">{data.styles}</div>
                  <div className="text-sm font-medium text-text-muted">Styles</div>
                  {/* Fixed height for comparison */}
                  <div className="h-5 mt-1">
                    {stylesChange !== null && prevYearSeason ? (
                      <div className={`text-sm font-bold ${
                        stylesChange > 0 ? 'text-emerald-600 dark:text-emerald-400' :
                        stylesChange < 0 ? 'text-red-500 dark:text-red-400' : 'text-text-faint'
                      }`}>
                        {stylesChange > 0 ? '+' : ''}{stylesChange}%
                      </div>
                    ) : (
                      <div className="text-transparent">—</div>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-black text-text-primary">
                    {isPlanning ? '—' : formatCurrencyShort(revenuePerStyle)}
                  </div>
                  <div className="text-sm font-medium text-text-muted">Rev / Style</div>
                  {/* Fixed height for consistency */}
                  <div className="h-5 mt-1">
                    <div className="text-sm text-text-faint">avg</div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Contextual Insight Banner */}
      {mainInsight && (
        <div className={`rounded-xl border-2 p-5 flex items-start gap-4 ${
          mainInsight.type === 'warning'
            ? 'bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800'
            : 'bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-800'
        }`}>
          {mainInsight.type === 'warning' ? (
            <AlertTriangle className="w-6 h-6 text-amber-500 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          ) : (
            <TrendingUp className="w-6 h-6 text-emerald-500 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
          )}
          <div>
            <div className={`font-bold text-lg ${
              mainInsight.type === 'warning' ? 'text-amber-800 dark:text-amber-200' : 'text-emerald-800 dark:text-emerald-200'
            }`}>
              {mainInsight.title}
            </div>
            <div className={`text-base mt-1 ${
              mainInsight.type === 'warning' ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300'
            }`}>
              {mainInsight.text}
            </div>
          </div>
        </div>
      )}

      {/* Category Breakdown Table */}
      <div className="bg-surface rounded-xl border-2 border-border-primary overflow-hidden shadow-lg">
        <div className="p-6 border-b-2 border-border-strong bg-gradient-to-r from-gray-50 to-white dark:from-slate-800 dark:to-slate-900">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-4">
                <h2 className="text-2xl font-black text-text-primary">Category Breakdown</h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => setBreakdownMetric('all')}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors ${
                      breakdownMetric === 'all'
                        ? 'bg-emerald-500 text-white'
                        : 'bg-surface-tertiary text-text-secondary hover:bg-gray-300 dark:hover:bg-slate-600'
                    }`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setBreakdownMetric('styles')}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors ${
                      breakdownMetric === 'styles'
                        ? 'bg-emerald-500 text-white'
                        : 'bg-surface-tertiary text-text-secondary hover:bg-gray-300 dark:hover:bg-slate-600'
                    }`}
                  >
                    Qty
                  </button>
                  <button
                    onClick={() => setBreakdownMetric('revenue')}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors ${
                      breakdownMetric === 'revenue'
                        ? 'bg-emerald-500 text-white'
                        : 'bg-surface-tertiary text-text-secondary hover:bg-gray-300 dark:hover:bg-slate-600'
                    }`}
                  >
                    Rev
                  </button>
                  <button
                    onClick={() => setBreakdownMetric('revPerStyle')}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors ${
                      breakdownMetric === 'revPerStyle'
                        ? 'bg-emerald-500 text-white'
                        : 'bg-surface-tertiary text-text-secondary hover:bg-gray-300 dark:hover:bg-slate-600'
                    }`}
                  >
                    Rev/Style
                  </button>
                </div>
              </div>
              <p className="text-sm text-text-muted mt-1">
                {selectedDivision || 'All Divisions'} • Compare styles and revenue across seasons
              </p>
            </div>
            <div className="text-right">
              <div className="text-xs font-bold text-text-muted uppercase tracking-wide">Categories</div>
              <div className="text-3xl font-black text-text-primary">{categories.length}</div>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gradient-to-b from-gray-100 to-gray-50 dark:from-slate-800 dark:to-slate-900 border-b-2 border-border-strong">
              <tr>
                <th className="text-left text-xs font-black text-text-secondary uppercase tracking-wider px-6 py-4 w-56 sticky left-0 bg-gradient-to-b from-gray-100 to-gray-50 dark:from-slate-800 dark:to-slate-900 z-10">
                  Category
                </th>
                {seasons.map((season) => {
                  const prevYearSeason = getPreviousYearSeason(season);
                  const status = getSeasonStatusLabel(season);
                  const isPlanning = status === 'Planning';
                  return (
                    <th key={season} className={`text-center text-xs font-black uppercase tracking-wider px-6 py-4 border-l-2 ${isPlanning ? 'border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/50' : 'border-border-primary'}`}>
                      <div className={`font-mono text-base font-black ${isPlanning ? 'text-purple-700 dark:text-purple-400' : 'text-text-primary'}`}>{season}</div>
                      {prevYearSeason && (
                        <div className="text-xs text-text-faint font-semibold mt-1">vs {prevYearSeason}</div>
                      )}
                    </th>
                  );
                })}
                <th className="text-left text-xs font-black text-text-secondary uppercase tracking-wider px-6 py-4 w-80 border-l-2 border-border-strong">
                  Insight
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-primary">
              {categories.map((category, idx) => {
                const insight = getCategoryInsight(category);
                const isSelected = selectedCategory === category;
                return (
                  <tr
                    key={category}
                    className={`cursor-pointer transition-all duration-150 ${
                      isSelected
                        ? 'bg-gradient-to-r from-emerald-50 to-emerald-100 dark:from-emerald-950/50 dark:to-emerald-900/50 shadow-inner'
                        : idx % 2 === 0
                        ? 'bg-surface hover:bg-hover'
                        : 'bg-surface-secondary/50 hover:bg-surface-tertiary'
                    }`}
                    onClick={() => setSelectedCategory(category === selectedCategory ? '' : category)}
                  >
                    <td className={`px-6 py-5 sticky left-0 z-10 ${
                      isSelected
                        ? 'bg-gradient-to-r from-emerald-50 to-emerald-100 dark:from-emerald-950/50 dark:to-emerald-900/50'
                        : idx % 2 === 0
                        ? 'bg-surface'
                        : 'bg-surface-secondary/50'
                    }`}>
                      <div className="flex items-center gap-2">
                        <div className={`w-1 h-8 rounded-full ${isSelected ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`}></div>
                        <span className={`text-base font-bold ${isSelected ? 'text-emerald-900 dark:text-emerald-300' : 'text-text-primary'}`}>
                          {category}
                        </span>
                      </div>
                    </td>
                    {seasons.map((season) => {
                      const data = getData(season, category);
                      const prevYearSeason = getPreviousYearSeason(season);
                      const prevYearData = prevYearSeason ? getData(prevYearSeason, category) : null;
                      const stylesChange = prevYearData ? getChange(data.styles, prevYearData.styles) : null;
                      const isPlanning = getSeasonStatusLabel(season) === 'Planning';

                      return (
                        <td key={season} className={`px-6 py-4 text-center border-l-2 ${isPlanning ? 'border-purple-100 dark:border-purple-900' : 'border-border-secondary'}`}>
                          {breakdownMetric === 'all' ? (
                            <div className="space-y-0.5">
                              <div className="relative">
                                <div className={`text-2xl font-black text-center ${isPlanning ? 'text-purple-700 dark:text-purple-400' : 'text-text-primary'}`}>
                                  {data.styles}
                                </div>
                                {stylesChange !== null && prevYearSeason && (
                                  <div className="absolute left-1/2 top-0 ml-6">
                                    <div className={`inline-flex items-center gap-0.5 text-xs font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap ${
                                      stylesChange > 0
                                        ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300'
                                        : stylesChange < 0
                                        ? 'bg-red-100 dark:bg-red-900/60 text-red-700 dark:text-red-300'
                                        : 'bg-surface-tertiary text-text-muted'
                                    }`}>
                                      {stylesChange > 0 ? '↑' : stylesChange < 0 ? '↓' : '→'}{Math.abs(stylesChange)}%
                                    </div>
                                  </div>
                                )}
                              </div>
                              <div className={`text-sm font-semibold ${isPlanning ? 'text-purple-500 dark:text-purple-400' : 'text-text-muted'}`}>
                                {isPlanning ? 'planned' : formatCurrencyShort(data.revenue)}
                              </div>
                              {!isPlanning && data.styles > 0 ? (
                                <div className="text-xs font-medium text-blue-600 dark:text-blue-400">
                                  {formatCurrencyShort(data.revenue / data.styles)}/style
                                </div>
                              ) : (
                                <div className="text-xs font-medium text-transparent">—</div>
                              )}
                            </div>
                          ) : breakdownMetric === 'styles' ? (
                            <div className="relative">
                              <div className={`text-3xl font-black text-center ${isPlanning ? 'text-purple-700 dark:text-purple-400' : 'text-text-primary'}`}>
                                {data.styles}
                              </div>
                              {stylesChange !== null && prevYearSeason && (
                                <div className="absolute left-1/2 top-0 ml-8">
                                  <div className={`inline-flex items-center gap-0.5 text-xs font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap ${
                                    stylesChange > 0
                                      ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300'
                                      : stylesChange < 0
                                      ? 'bg-red-100 dark:bg-red-900/60 text-red-700 dark:text-red-300'
                                      : 'bg-surface-tertiary text-text-muted'
                                  }`}>
                                    {stylesChange > 0 ? '↑' : stylesChange < 0 ? '↓' : '→'}{Math.abs(stylesChange)}%
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : breakdownMetric === 'revenue' ? (
                            <div className={`text-3xl font-black text-center ${isPlanning ? 'text-purple-700 dark:text-purple-400' : 'text-text-primary'}`}>
                              {isPlanning ? '—' : formatCurrencyShort(data.revenue)}
                            </div>
                          ) : (
                            <div className={`text-3xl font-black text-center ${isPlanning ? 'text-purple-700 dark:text-purple-400' : data.styles > 0 ? 'text-blue-700 dark:text-blue-400' : 'text-text-faint'}`}>
                              {!isPlanning && data.styles > 0 ? formatCurrencyShort(data.revenue / data.styles) : '—'}
                            </div>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-6 py-5 border-l-2 border-border-strong">
                      {insight && (
                        <div className={`inline-flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-lg shadow-sm ${
                          insight.type === 'warning'
                            ? 'bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-700'
                            : 'bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-700'
                        }`}>
                          <span className="text-lg">{insight.type === 'warning' ? '⚠️' : '✨'}</span>
                          <span>{insight.text}</span>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-gradient-to-b from-gray-100 to-gray-200 dark:from-slate-800 dark:to-slate-700">
              <tr className="border-t-4 border-border-strong">
                <td className="px-6 py-5 text-base font-black text-text-primary uppercase tracking-wide sticky left-0 bg-gradient-to-b from-gray-100 to-gray-200 dark:from-slate-800 dark:to-slate-700 z-10">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-8 rounded-full bg-surface-secondary0"></div>
                    Total
                  </div>
                </td>
                {seasons.map((season) => {
                  const data = getData(season, '');
                  const prevYearSeason = getPreviousYearSeason(season);
                  const prevYearData = prevYearSeason ? getData(prevYearSeason, '') : null;
                  const stylesChange = prevYearData ? getChange(data.styles, prevYearData.styles) : null;
                  const isPlanning = getSeasonStatusLabel(season) === 'Planning';

                  return (
                    <td key={season} className={`px-6 py-4 text-center border-l-2 ${isPlanning ? 'border-purple-200 dark:border-purple-800' : 'border-border-strong'}`}>
                      {breakdownMetric === 'all' ? (
                        <div className="space-y-0.5">
                          <div className="relative">
                            <div className={`text-2xl font-black text-center ${isPlanning ? 'text-purple-800 dark:text-purple-300' : 'text-text-primary'}`}>
                              {data.styles}
                            </div>
                            {stylesChange !== null && prevYearSeason && (
                              <div className="absolute left-1/2 top-0 ml-6">
                                <div className={`inline-flex items-center gap-0.5 text-xs font-black px-1.5 py-0.5 rounded-full whitespace-nowrap ${
                                  stylesChange > 0
                                    ? 'bg-emerald-200 dark:bg-emerald-800 text-emerald-900 dark:text-emerald-200'
                                    : stylesChange < 0
                                    ? 'bg-red-200 dark:bg-red-800 text-red-900 dark:text-red-200'
                                    : 'bg-gray-300 dark:bg-slate-600 text-text-secondary'
                                }`}>
                                  {stylesChange > 0 ? '↑' : stylesChange < 0 ? '↓' : '→'}{Math.abs(stylesChange)}%
                                </div>
                              </div>
                            )}
                          </div>
                          <div className={`text-sm font-bold ${isPlanning ? 'text-purple-600 dark:text-purple-400' : 'text-text-secondary'}`}>
                            {isPlanning ? 'planned' : formatCurrencyShort(data.revenue)}
                          </div>
                          {!isPlanning && data.styles > 0 ? (
                            <div className="text-xs font-bold text-blue-700 dark:text-blue-400">
                              {formatCurrencyShort(data.revenue / data.styles)}/style
                            </div>
                          ) : (
                            <div className="text-xs font-bold text-transparent">—</div>
                          )}
                        </div>
                      ) : breakdownMetric === 'styles' ? (
                        <div className="relative">
                          <div className={`text-3xl font-black text-center ${isPlanning ? 'text-purple-800 dark:text-purple-300' : 'text-text-primary'}`}>
                            {data.styles}
                          </div>
                          {stylesChange !== null && prevYearSeason && (
                            <div className="absolute left-1/2 top-0 ml-8">
                              <div className={`inline-flex items-center gap-0.5 text-xs font-black px-1.5 py-0.5 rounded-full whitespace-nowrap ${
                                stylesChange > 0
                                  ? 'bg-emerald-200 dark:bg-emerald-800 text-emerald-900 dark:text-emerald-200'
                                  : stylesChange < 0
                                  ? 'bg-red-200 dark:bg-red-800 text-red-900 dark:text-red-200'
                                  : 'bg-gray-300 dark:bg-slate-600 text-text-secondary'
                              }`}>
                                {stylesChange > 0 ? '↑' : stylesChange < 0 ? '↓' : '→'}{Math.abs(stylesChange)}%
                              </div>
                            </div>
                          )}
                        </div>
                      ) : breakdownMetric === 'revenue' ? (
                        <div className={`text-3xl font-black text-center ${isPlanning ? 'text-purple-800 dark:text-purple-300' : 'text-text-primary'}`}>
                          {isPlanning ? '—' : formatCurrencyShort(data.revenue)}
                        </div>
                      ) : (
                        <div className={`text-3xl font-black text-center ${isPlanning ? 'text-purple-800 dark:text-purple-300' : data.styles > 0 ? 'text-blue-700 dark:text-blue-400' : 'text-text-faint'}`}>
                          {!isPlanning && data.styles > 0 ? formatCurrencyShort(data.revenue / data.styles) : '—'}
                        </div>
                      )}
                    </td>
                  );
                })}
                <td className="border-l-2 border-border-strong"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Revenue Per Style by Category */}
      <div className="bg-surface rounded-xl border-2 border-border-primary p-5">
        <div className="mb-5">
          <h2 className="text-xl font-black text-text-primary">Revenue Per Style by Category</h2>
          <p className="text-sm text-text-muted mt-1">
            Which categories generate the most revenue per style? Higher = more efficient use of design resources.
            Based on most recent complete season.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
          {categories.slice(0, 8).map((category) => {
            // Find most recent non-planning season
            const recentSeason = [...seasons].reverse().find(s => getSeasonStatusLabel(s) !== 'Planning') || seasons[0];
            const prevYearSeason = recentSeason ? getPreviousYearSeason(recentSeason) : null;

            const current = getData(recentSeason || '', category);
            const previous = prevYearSeason ? getData(prevYearSeason, category) : null;
            const rpsNow = getRevenuePerStyle(current);
            const rpsPrev = previous ? getRevenuePerStyle(previous) : 0;
            const change = rpsPrev > 0 ? Math.round(((rpsNow - rpsPrev) / rpsPrev) * 100) : 0;

            // Determine performance tier
            const isHigh = rpsNow > 70000;
            const isLow = rpsNow < 40000 && rpsNow > 0;

            return (
              <div
                key={category}
                className={`p-4 rounded-xl text-center border-2 cursor-pointer transition-all ${
                  selectedCategory === category
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950'
                    : isHigh
                    ? 'border-emerald-200 bg-emerald-50 dark:bg-emerald-950 hover:border-emerald-300'
                    : isLow
                    ? 'border-amber-200 bg-amber-50 dark:bg-amber-950 hover:border-amber-300'
                    : 'border-border-primary bg-surface hover:border-border-strong'
                }`}
                onClick={() => setSelectedCategory(category === selectedCategory ? '' : category)}
              >
                <div className="text-sm font-bold text-text-secondary truncate mb-2" title={category}>
                  {category}
                </div>
                <div className="text-2xl font-black text-text-primary">
                  {rpsNow > 0 ? formatCurrencyShort(rpsNow) : '—'}
                </div>
                {change !== 0 && rpsPrev > 0 && prevYearSeason && (
                  <div className={`text-sm font-bold mt-1 ${
                    change > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'
                  }`}>
                    {change > 0 ? '↑' : '↓'} {Math.abs(change)}% vs {prevYearSeason}
                  </div>
                )}
                {isHigh && <div className="text-xs text-emerald-600 dark:text-emerald-400 font-bold mt-2">★ Top performer</div>}
                {isLow && <div className="text-xs text-amber-600 dark:text-amber-400 font-bold mt-2">Review assortment</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Trend Visualization - Are More Styles = More Revenue? */}
      <div className="bg-surface rounded-xl border-2 border-border-primary p-5">
        <div className="mb-5">
          <h2 className="text-xl font-black text-text-primary">Are More Styles = More Revenue?</h2>
          <p className="text-sm text-text-muted mt-1">
            Compare how style count (blue bars) relates to revenue (green bars) across seasons.
            Ideally, revenue should grow faster than style count.
          </p>
        </div>

        <div className="flex items-center gap-6 mb-5">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-blue-400 rounded"></div>
            <span className="text-sm font-medium text-text-secondary">Style Count</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-emerald-400 rounded"></div>
            <span className="text-sm font-medium text-text-secondary">Revenue</span>
          </div>
          <div className="text-gray-300">|</div>
          <div className="text-sm text-text-muted">Each group = one category, bars left-to-right = oldest → newest</div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
          {categories.slice(0, 8).map((category) => {
            // Filter out planning seasons for the chart
            const chartSeasons = seasons.filter(s => getSeasonStatusLabel(s) !== 'Planning');
            const seasonValues = chartSeasons.map((s) => getData(s, category));
            const maxStyles = Math.max(...seasonValues.map((d) => d.styles), 1);
            const maxRevenue = Math.max(...seasonValues.map((d) => d.revenue), 1);

            return (
              <div
                key={category}
                className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  selectedCategory === category
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950'
                    : 'border-border-primary hover:border-border-strong'
                }`}
                onClick={() => setSelectedCategory(category === selectedCategory ? '' : category)}
              >
                <div className="text-sm font-bold text-text-primary mb-3 truncate text-center" title={category}>
                  {category}
                </div>
                <div className="flex items-end justify-center gap-1.5 h-16">
                  {chartSeasons.map((season) => {
                    const data = getData(season, category);
                    const stylesHeight = (data.styles / maxStyles) * 100;
                    const revenueHeight = (data.revenue / maxRevenue) * 100;

                    return (
                      <div key={season} className="flex gap-0.5 items-end" title={season}>
                        <div
                          className="w-3 bg-blue-400 rounded-t transition-all"
                          style={{ height: `${Math.max(stylesHeight, 4)}%` }}
                        />
                        <div
                          className="w-3 bg-emerald-400 rounded-t transition-all"
                          style={{ height: `${Math.max(revenueHeight, 4)}%` }}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between text-xs text-text-faint mt-2 px-1 font-medium">
                  {chartSeasons.map((s) => (
                    <span key={s}>{s.slice(0, 2)}</span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
