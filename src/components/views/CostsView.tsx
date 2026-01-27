'use client';

import { useState, useMemo } from 'react';
import { Product, PricingRecord, CostRecord, SalesRecord } from '@/types/product';
import { sortSeasons } from '@/lib/store';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Percent,
  ArrowUpDown,
  Search,
  X,
  Download,
  ChevronLeft,
  ChevronRight,
  Package,
  Factory,
  Globe,
  Users,
  Layers,
} from 'lucide-react';

interface CostsViewProps {
  products: Product[];
  pricing: PricingRecord[];
  costs: CostRecord[];
  sales: SalesRecord[];
  selectedSeason: string;
  selectedDivision: string;
  selectedCategory: string;
  onStyleClick: (styleNumber: string) => void;
}

type SortField = 'styleNumber' | 'styleName' | 'revenue' | 'units' | 'factory' | 'coo' | 'fob' | 'landed' | 'wholesale' | 'msrp' | 'margin' | 'designTeam';
type ViewMode = 'table' | 'byFactory' | 'byCountry' | 'byTeam';

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || value === 0) return '—';
  return `$${value.toFixed(2)}`;
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

// Get margin color class
function getMarginColorClass(margin: number | null | undefined): string {
  if (margin === null || margin === undefined) return 'text-gray-400';
  const pct = margin * 100;
  if (pct >= 50) return 'text-emerald-600';
  if (pct >= 45) return 'text-cyan-600';
  if (pct >= 40) return 'text-amber-600';
  return 'text-red-600';
}

function getMarginBgClass(margin: number | null | undefined): string {
  if (margin === null || margin === undefined) return 'bg-gray-100';
  const pct = margin * 100;
  if (pct >= 50) return 'bg-emerald-50';
  if (pct >= 45) return 'bg-cyan-50';
  if (pct >= 40) return 'bg-amber-50';
  return 'bg-red-50';
}

function formatRevenue(value: number): string {
  if (value === 0) return '$0';
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(1)}K`;
  }
  return `$${value.toFixed(0)}`;
}

function formatNumber(value: number): string {
  return value.toLocaleString();
}

export default function CostsView({
  products,
  pricing,
  costs,
  sales,
  selectedSeason,
  selectedDivision,
  selectedCategory,
  onStyleClick,
}: CostsViewProps) {
  // Filters
  const [filterSeason, setFilterSeason] = useState<string>('');
  const [filterStyleNumber, setFilterStyleNumber] = useState<string>('');
  const [filterFactory, setFilterFactory] = useState<string>('');
  const [filterCountry, setFilterCountry] = useState<string>('');
  const [filterTeam, setFilterTeam] = useState<string>('');
  const [filterDeveloper, setFilterDeveloper] = useState<string>('');

  // Table state
  const [sortField, setSortField] = useState<SortField>('revenue');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;

  // Calculate sales by style for the selected/filtered season
  const salesByStyle = useMemo(() => {
    const effectiveSeason = filterSeason || selectedSeason;
    if (!effectiveSeason) {
      // If no season selected, aggregate all sales
      return sales.reduce((acc, r) => {
        if (!acc[r.styleNumber]) {
          acc[r.styleNumber] = { revenue: 0, units: 0 };
        }
        acc[r.styleNumber].revenue += r.revenue || 0;
        acc[r.styleNumber].units += r.unitsBooked || 0;
        return acc;
      }, {} as Record<string, { revenue: number; units: number }>);
    }
    // Filter to selected season only
    return sales
      .filter(r => r.season === effectiveSeason)
      .reduce((acc, r) => {
        if (!acc[r.styleNumber]) {
          acc[r.styleNumber] = { revenue: 0, units: 0 };
        }
        acc[r.styleNumber].revenue += r.revenue || 0;
        acc[r.styleNumber].units += r.unitsBooked || 0;
        return acc;
      }, {} as Record<string, { revenue: number; units: number }>);
  }, [sales, filterSeason, selectedSeason]);

  // View mode
  const [viewMode, setViewMode] = useState<ViewMode>('table');

  // Get unique values for filters
  const seasons = useMemo(() => {
    const all = new Set<string>();
    costs.forEach((c) => c.season && all.add(c.season));
    return sortSeasons(Array.from(all));
  }, [costs]);

  const factories = useMemo(() => {
    const all = new Set<string>();
    costs.forEach((c) => c.factory && all.add(c.factory));
    return Array.from(all).sort();
  }, [costs]);

  const countries = useMemo(() => {
    const all = new Set<string>();
    costs.forEach((c) => c.countryOfOrigin && all.add(c.countryOfOrigin));
    return Array.from(all).sort();
  }, [costs]);

  const designTeams = useMemo(() => {
    const all = new Set<string>();
    costs.forEach((c) => c.designTeam && all.add(c.designTeam));
    return Array.from(all).sort();
  }, [costs]);

  const developers = useMemo(() => {
    const all = new Set<string>();
    costs.forEach((c) => c.developer && all.add(c.developer));
    return Array.from(all).sort();
  }, [costs]);

  // Filter costs and merge with sales data
  const filteredCostsWithSales = useMemo(() => {
    return costs
      .filter((c) => {
        if (filterSeason && c.season !== filterSeason) return false;
        if (filterStyleNumber && !c.styleNumber.toLowerCase().includes(filterStyleNumber.toLowerCase())) return false;
        if (filterFactory && c.factory !== filterFactory) return false;
        if (filterCountry && c.countryOfOrigin !== filterCountry) return false;
        if (filterTeam && c.designTeam !== filterTeam) return false;
        if (filterDeveloper && c.developer !== filterDeveloper) return false;
        return true;
      })
      .map((c) => ({
        ...c,
        revenue: salesByStyle[c.styleNumber]?.revenue || 0,
        units: salesByStyle[c.styleNumber]?.units || 0,
      }));
  }, [costs, filterSeason, filterStyleNumber, filterFactory, filterCountry, filterTeam, filterDeveloper, salesByStyle]);

  // Sort data
  const sortedData = useMemo(() => {
    return [...filteredCostsWithSales].sort((a, b) => {
      let aVal: string | number = 0;
      let bVal: string | number = 0;

      switch (sortField) {
        case 'styleNumber':
          aVal = a.styleNumber;
          bVal = b.styleNumber;
          break;
        case 'styleName':
          aVal = (a.styleName || '').toLowerCase();
          bVal = (b.styleName || '').toLowerCase();
          break;
        case 'revenue':
          aVal = a.revenue || 0;
          bVal = b.revenue || 0;
          break;
        case 'units':
          aVal = a.units || 0;
          bVal = b.units || 0;
          break;
        case 'factory':
          aVal = (a.factory || '').toLowerCase();
          bVal = (b.factory || '').toLowerCase();
          break;
        case 'coo':
          aVal = (a.countryOfOrigin || '').toLowerCase();
          bVal = (b.countryOfOrigin || '').toLowerCase();
          break;
        case 'fob':
          aVal = a.fob || 0;
          bVal = b.fob || 0;
          break;
        case 'landed':
          aVal = a.landed || 0;
          bVal = b.landed || 0;
          break;
        case 'wholesale':
          aVal = a.suggestedWholesale || 0;
          bVal = b.suggestedWholesale || 0;
          break;
        case 'msrp':
          aVal = a.suggestedMsrp || 0;
          bVal = b.suggestedMsrp || 0;
          break;
        case 'margin':
          aVal = a.margin || 0;
          bVal = b.margin || 0;
          break;
        case 'designTeam':
          aVal = (a.designTeam || '').toLowerCase();
          bVal = (b.designTeam || '').toLowerCase();
          break;
      }

      if (sortDir === 'asc') {
        return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      }
      return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
    });
  }, [filteredCostsWithSales, sortField, sortDir]);

  // Paginated data
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage]);

  const totalPages = Math.ceil(sortedData.length / pageSize);

  // Summary statistics
  const summary = useMemo(() => {
    const withFob = filteredCostsWithSales.filter((c) => c.fob > 0);
    const withLanded = filteredCostsWithSales.filter((c) => c.landed > 0);
    const withMargin = filteredCostsWithSales.filter((c) => c.margin !== null && c.margin > 0);

    const avgFob = withFob.length > 0
      ? withFob.reduce((sum, c) => sum + c.fob, 0) / withFob.length
      : 0;

    const avgLanded = withLanded.length > 0
      ? withLanded.reduce((sum, c) => sum + c.landed, 0) / withLanded.length
      : 0;

    const avgMargin = withMargin.length > 0
      ? withMargin.reduce((sum, c) => sum + (c.margin || 0), 0) / withMargin.length
      : 0;

    const uniqueStyles = new Set(filteredCostsWithSales.map((c) => c.styleNumber)).size;
    const uniqueFactories = new Set(filteredCostsWithSales.map((c) => c.factory).filter(Boolean)).size;
    const uniqueCountries = new Set(filteredCostsWithSales.map((c) => c.countryOfOrigin).filter(Boolean)).size;

    // Total revenue and units
    const totalRevenue = filteredCostsWithSales.reduce((sum, c) => sum + c.revenue, 0);
    const totalUnits = filteredCostsWithSales.reduce((sum, c) => sum + c.units, 0);

    // Margin distribution
    const marginBuckets = {
      excellent: withMargin.filter((c) => (c.margin || 0) >= 0.50).length,
      good: withMargin.filter((c) => (c.margin || 0) >= 0.45 && (c.margin || 0) < 0.50).length,
      fair: withMargin.filter((c) => (c.margin || 0) >= 0.40 && (c.margin || 0) < 0.45).length,
      poor: withMargin.filter((c) => (c.margin || 0) < 0.40).length,
    };

    return {
      totalRecords: filteredCostsWithSales.length,
      totalRevenue,
      totalUnits,
      uniqueStyles,
      uniqueFactories,
      uniqueCountries,
      avgFob,
      avgLanded,
      avgMargin,
      marginBuckets,
    };
  }, [filteredCostsWithSales]);

  // Group by Factory
  const byFactory = useMemo(() => {
    const grouped = new Map<string, { count: number; avgFob: number; avgLanded: number; avgMargin: number }>();

    filteredCostsWithSales.forEach((c) => {
      const key = c.factory || 'Unknown';
      const existing = grouped.get(key);
      if (existing) {
        existing.count++;
        existing.avgFob += c.fob || 0;
        existing.avgLanded += c.landed || 0;
        existing.avgMargin += c.margin || 0;
      } else {
        grouped.set(key, {
          count: 1,
          avgFob: c.fob || 0,
          avgLanded: c.landed || 0,
          avgMargin: c.margin || 0,
        });
      }
    });

    return Array.from(grouped.entries())
      .map(([factory, data]) => ({
        factory,
        count: data.count,
        avgFob: data.avgFob / data.count,
        avgLanded: data.avgLanded / data.count,
        avgMargin: data.avgMargin / data.count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [filteredCostsWithSales]);

  // Group by Country
  const byCountry = useMemo(() => {
    const grouped = new Map<string, { count: number; avgFob: number; avgLanded: number; avgMargin: number }>();

    filteredCostsWithSales.forEach((c) => {
      const key = c.countryOfOrigin || 'Unknown';
      const existing = grouped.get(key);
      if (existing) {
        existing.count++;
        existing.avgFob += c.fob || 0;
        existing.avgLanded += c.landed || 0;
        existing.avgMargin += c.margin || 0;
      } else {
        grouped.set(key, {
          count: 1,
          avgFob: c.fob || 0,
          avgLanded: c.landed || 0,
          avgMargin: c.margin || 0,
        });
      }
    });

    return Array.from(grouped.entries())
      .map(([country, data]) => ({
        country,
        count: data.count,
        avgFob: data.avgFob / data.count,
        avgLanded: data.avgLanded / data.count,
        avgMargin: data.avgMargin / data.count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [filteredCostsWithSales]);

  // Group by Design Team
  const byTeam = useMemo(() => {
    const grouped = new Map<string, { count: number; avgFob: number; avgLanded: number; avgMargin: number }>();

    filteredCostsWithSales.forEach((c) => {
      const key = c.designTeam || 'Unknown';
      const existing = grouped.get(key);
      if (existing) {
        existing.count++;
        existing.avgFob += c.fob || 0;
        existing.avgLanded += c.landed || 0;
        existing.avgMargin += c.margin || 0;
      } else {
        grouped.set(key, {
          count: 1,
          avgFob: c.fob || 0,
          avgLanded: c.landed || 0,
          avgMargin: c.margin || 0,
        });
      }
    });

    return Array.from(grouped.entries())
      .map(([team, data]) => ({
        team,
        count: data.count,
        avgFob: data.avgFob / data.count,
        avgLanded: data.avgLanded / data.count,
        avgMargin: data.avgMargin / data.count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [filteredCostsWithSales]);

  // Handlers
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setFilterSeason('');
    setFilterStyleNumber('');
    setFilterFactory('');
    setFilterCountry('');
    setFilterTeam('');
    setFilterDeveloper('');
    setCurrentPage(1);
  };

  const hasFilters = filterSeason || filterStyleNumber || filterFactory || filterCountry || filterTeam || filterDeveloper;

  // Export CSV
  const exportCSV = () => {
    const headers = ['Style #', 'Style Name', 'Season', 'Factory', 'Country', 'Design Team', 'Developer', 'FOB', 'Landed', 'Margin %'];

    const rows = sortedData.map((c) => [
      c.styleNumber,
      `"${c.styleName || ''}"`,
      c.season,
      c.factory,
      c.countryOfOrigin,
      c.designTeam,
      c.developer,
      c.fob?.toFixed(2) || '',
      c.landed?.toFixed(2) || '',
      c.margin ? (c.margin * 100).toFixed(1) : '',
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `landed-costs-${filterSeason || 'all'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // No cost data message
  if (costs.length === 0) {
    return (
      <div className="p-6">
        <h2 className="text-4xl font-display font-bold text-gray-900 mb-6">Landed Costs</h2>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-8 text-center">
          <DollarSign className="w-16 h-16 text-amber-500 mx-auto mb-4" />
          <p className="text-xl text-amber-800 font-bold">No landed cost data available</p>
          <p className="text-amber-600 text-base mt-2">
            Make sure the &quot;Landed Request Sheet.xlsx&quot; file is in the data folder and refresh the data.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-4xl font-display font-bold text-gray-900">
            Landed Costs
            {(filterSeason || selectedSeason) && (
              <span className="ml-3 text-2xl font-mono text-cyan-600">
                {filterSeason || selectedSeason}
              </span>
            )}
          </h2>
          <p className="text-base text-gray-500 mt-2">
            FOB, landed costs, and margins from the Landed Request Sheet
            {(filterSeason || selectedSeason) && (
              <span className="ml-2 text-cyan-600 font-medium">
                • Revenue/Units for {filterSeason || selectedSeason} only
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1 bg-white rounded-lg border border-gray-200 p-1.5">
          <button
            onClick={() => setViewMode('table')}
            className={`px-4 py-2 text-base font-bold rounded-md transition-colors ${
              viewMode === 'table' ? 'bg-cyan-600 text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Table
          </button>
          <button
            onClick={() => setViewMode('byFactory')}
            className={`px-4 py-2 text-base font-bold rounded-md transition-colors ${
              viewMode === 'byFactory' ? 'bg-cyan-600 text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            By Factory
          </button>
          <button
            onClick={() => setViewMode('byCountry')}
            className={`px-4 py-2 text-base font-bold rounded-md transition-colors ${
              viewMode === 'byCountry' ? 'bg-cyan-600 text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            By Country
          </button>
          <button
            onClick={() => setViewMode('byTeam')}
            className={`px-4 py-2 text-base font-bold rounded-md transition-colors ${
              viewMode === 'byTeam' ? 'bg-cyan-600 text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            By Team
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-xl border-2 border-gray-200 p-5 shadow-sm">
        <div className="flex flex-wrap gap-4 items-end">
          {/* Season Filter */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold text-gray-600 uppercase tracking-wide">Season</label>
            <select
              value={filterSeason}
              onChange={(e) => { setFilterSeason(e.target.value); setCurrentPage(1); }}
              className="px-4 py-2.5 text-base border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 min-w-[120px] bg-white"
            >
              <option value="">All Seasons</option>
              {seasons.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Style # Filter */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold text-gray-600 uppercase tracking-wide">Style #</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={filterStyleNumber}
                onChange={(e) => { setFilterStyleNumber(e.target.value); setCurrentPage(1); }}
                placeholder="Search..."
                className="pl-11 pr-4 py-2.5 text-base border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 w-[140px] bg-white"
              />
            </div>
          </div>

          {/* Factory Filter */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold text-gray-600 uppercase tracking-wide">Factory</label>
            <select
              value={filterFactory}
              onChange={(e) => { setFilterFactory(e.target.value); setCurrentPage(1); }}
              className="px-4 py-2.5 text-base border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 min-w-[160px] bg-white"
            >
              <option value="">All Factories</option>
              {factories.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>

          {/* Country Filter */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold text-gray-600 uppercase tracking-wide">Country</label>
            <select
              value={filterCountry}
              onChange={(e) => { setFilterCountry(e.target.value); setCurrentPage(1); }}
              className="px-4 py-2.5 text-base border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 min-w-[140px] bg-white"
            >
              <option value="">All Countries</option>
              {countries.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Design Team Filter */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold text-gray-600 uppercase tracking-wide">Team</label>
            <select
              value={filterTeam}
              onChange={(e) => { setFilterTeam(e.target.value); setCurrentPage(1); }}
              className="px-4 py-2.5 text-base border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 min-w-[140px] bg-white"
            >
              <option value="">All Teams</option>
              {designTeams.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Developer Filter */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold text-gray-600 uppercase tracking-wide">Developer</label>
            <select
              value={filterDeveloper}
              onChange={(e) => { setFilterDeveloper(e.target.value); setCurrentPage(1); }}
              className="px-4 py-2.5 text-base border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 min-w-[160px] bg-white"
            >
              <option value="">All Developers</option>
              {developers.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Clear Filters */}
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-2 px-4 py-2.5 text-base font-semibold text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
              Clear
            </button>
          )}

          {/* Export */}
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 px-4 py-2.5 text-base font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Download className="w-5 h-5" />
            Export
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <div className="bg-white rounded-xl border-2 border-gray-200 p-5 shadow-sm">
          <div className="flex items-start justify-between mb-3">
            <span className="text-sm font-bold text-gray-600 uppercase tracking-wide">Records</span>
            <Layers className="w-6 h-6 text-gray-400" />
          </div>
          <div className="text-3xl font-display font-bold text-gray-900">{summary.totalRecords.toLocaleString()}</div>
          <div className="text-sm text-gray-500 mt-1">{summary.uniqueStyles} styles</div>
        </div>

        <div className="bg-white rounded-xl border-2 border-gray-200 p-5 shadow-sm">
          <div className="flex items-start justify-between mb-3">
            <span className="text-sm font-bold text-gray-600 uppercase tracking-wide">Avg FOB</span>
            <DollarSign className="w-6 h-6 text-blue-500" />
          </div>
          <div className="text-3xl font-display font-bold text-gray-900">{formatCurrency(summary.avgFob)}</div>
          <div className="text-sm text-gray-500 mt-1">factory cost</div>
        </div>

        <div className="bg-white rounded-xl border-2 border-gray-200 p-5 shadow-sm">
          <div className="flex items-start justify-between mb-3">
            <span className="text-sm font-bold text-gray-600 uppercase tracking-wide">Avg Landed</span>
            <DollarSign className="w-6 h-6 text-violet-500" />
          </div>
          <div className="text-3xl font-display font-bold text-gray-900">{formatCurrency(summary.avgLanded)}</div>
          <div className="text-sm text-gray-500 mt-1">total cost</div>
        </div>

        <div className="bg-white rounded-xl border-2 border-gray-200 p-5 shadow-sm">
          <div className="flex items-start justify-between mb-3">
            <span className="text-sm font-bold text-gray-600 uppercase tracking-wide">Avg Margin</span>
            <Percent className="w-6 h-6 text-emerald-500" />
          </div>
          <div className={`text-3xl font-display font-bold ${getMarginColorClass(summary.avgMargin)}`}>
            {formatPercent(summary.avgMargin)}
          </div>
        </div>

        <div className="bg-white rounded-xl border-2 border-gray-200 p-5 shadow-sm">
          <div className="flex items-start justify-between mb-3">
            <span className="text-sm font-bold text-gray-600 uppercase tracking-wide">Factories</span>
            <Factory className="w-6 h-6 text-orange-500" />
          </div>
          <div className="text-3xl font-display font-bold text-gray-900">{summary.uniqueFactories}</div>
        </div>

        <div className="bg-white rounded-xl border-2 border-gray-200 p-5 shadow-sm">
          <div className="flex items-start justify-between mb-3">
            <span className="text-sm font-bold text-gray-600 uppercase tracking-wide">Countries</span>
            <Globe className="w-6 h-6 text-cyan-500" />
          </div>
          <div className="text-3xl font-display font-bold text-gray-900">{summary.uniqueCountries}</div>
        </div>
      </div>

      {/* Margin Distribution */}
      <div className="bg-white rounded-xl border-2 border-gray-200 p-5 shadow-sm">
        <h3 className="text-lg font-bold text-gray-800 mb-4">Margin Distribution</h3>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="w-4 h-4 rounded-full bg-emerald-500"></span>
            <span className="text-base font-medium text-gray-600">50%+ ({summary.marginBuckets.excellent})</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-4 rounded-full bg-cyan-500"></span>
            <span className="text-base font-medium text-gray-600">45-50% ({summary.marginBuckets.good})</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-4 rounded-full bg-amber-500"></span>
            <span className="text-base font-medium text-gray-600">40-45% ({summary.marginBuckets.fair})</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-4 rounded-full bg-red-500"></span>
            <span className="text-base font-medium text-gray-600">&lt;40% ({summary.marginBuckets.poor})</span>
          </div>
        </div>
      </div>

      {/* View Content */}
      {viewMode === 'table' && (
        <div className="bg-white rounded-xl border-2 border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-100 border-b-2 border-gray-300">
                  <th
                    className="px-4 py-3 text-left text-sm font-bold text-gray-700 uppercase tracking-wide cursor-pointer hover:text-gray-900 border-r border-gray-200"
                    onClick={() => handleSort('styleNumber')}
                  >
                    <div className="flex items-center gap-1">
                      Style #
                      <ArrowUpDown className="w-4 h-4" />
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-left text-sm font-bold text-gray-700 uppercase tracking-wide cursor-pointer hover:text-gray-900 border-r border-gray-200"
                    onClick={() => handleSort('styleName')}
                  >
                    <div className="flex items-center gap-1">
                      Style Name
                      <ArrowUpDown className="w-4 h-4" />
                    </div>
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 uppercase tracking-wide border-l border-gray-200">
                    Season
                  </th>
                  <th
                    className="px-4 py-3 text-right text-sm font-bold text-gray-700 uppercase tracking-wide cursor-pointer hover:text-gray-900 border-l border-gray-200"
                    onClick={() => handleSort('revenue')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Revenue
                      <ArrowUpDown className="w-4 h-4" />
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-right text-sm font-bold text-gray-700 uppercase tracking-wide cursor-pointer hover:text-gray-900 border-l border-gray-200"
                    onClick={() => handleSort('units')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Units
                      <ArrowUpDown className="w-4 h-4" />
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-left text-sm font-bold text-gray-700 uppercase tracking-wide cursor-pointer hover:text-gray-900 border-l border-gray-200"
                    onClick={() => handleSort('factory')}
                  >
                    <div className="flex items-center gap-1">
                      Factory
                      <ArrowUpDown className="w-4 h-4" />
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-left text-sm font-bold text-gray-700 uppercase tracking-wide cursor-pointer hover:text-gray-900 border-l border-gray-200"
                    onClick={() => handleSort('coo')}
                  >
                    <div className="flex items-center gap-1">
                      COO
                      <ArrowUpDown className="w-4 h-4" />
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-right text-sm font-bold text-gray-700 uppercase tracking-wide cursor-pointer hover:text-gray-900 border-l border-gray-200"
                    onClick={() => handleSort('fob')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      FOB
                      <ArrowUpDown className="w-4 h-4" />
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-right text-sm font-bold text-gray-700 uppercase tracking-wide cursor-pointer hover:text-gray-900 border-l border-gray-200"
                    onClick={() => handleSort('landed')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Landed
                      <ArrowUpDown className="w-4 h-4" />
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-right text-sm font-bold text-gray-700 uppercase tracking-wide cursor-pointer hover:text-gray-900 border-l border-gray-200"
                    onClick={() => handleSort('wholesale')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Wholesale
                      <ArrowUpDown className="w-4 h-4" />
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-right text-sm font-bold text-gray-700 uppercase tracking-wide cursor-pointer hover:text-gray-900 border-l border-gray-200"
                    onClick={() => handleSort('msrp')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      MSRP
                      <ArrowUpDown className="w-4 h-4" />
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-right text-sm font-bold text-gray-700 uppercase tracking-wide cursor-pointer hover:text-gray-900 border-l-2 border-gray-400"
                    onClick={() => handleSort('margin')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Margin
                      <ArrowUpDown className="w-4 h-4" />
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-left text-sm font-bold text-gray-700 uppercase tracking-wide cursor-pointer hover:text-gray-900 border-l border-gray-200"
                    onClick={() => handleSort('designTeam')}
                  >
                    <div className="flex items-center gap-1">
                      Team
                      <ArrowUpDown className="w-4 h-4" />
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedData.map((cost, index) => (
                  <tr
                    key={`${cost.styleNumber}-${cost.season}-${index}`}
                    onClick={() => onStyleClick(cost.styleNumber)}
                    className={`border-b border-gray-200 cursor-pointer transition-colors ${
                      index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                    } hover:bg-cyan-50`}
                  >
                    <td className="px-4 py-4 border-r border-gray-200">
                      <span className="font-mono text-lg font-bold text-gray-900">
                        {cost.styleNumber}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-base text-gray-700 truncate max-w-[200px] border-r border-gray-200">
                      {cost.styleName || '—'}
                    </td>
                    <td className="px-4 py-4 border-l border-gray-200">
                      <span className={`text-base font-mono font-semibold px-2.5 py-1 rounded ${
                        cost.season?.endsWith('SP') ? 'bg-emerald-50 text-emerald-700' : 'bg-orange-50 text-orange-700'
                      }`}>
                        {cost.season}
                      </span>
                    </td>
                    <td className={`px-4 py-4 text-right font-mono text-base border-l border-gray-200 ${
                      cost.revenue === 0
                        ? 'text-gray-400 italic'
                        : cost.revenue >= 100000
                        ? 'text-emerald-600 font-bold'
                        : 'text-gray-900 font-medium'
                    }`}>
                      {formatRevenue(cost.revenue)}
                    </td>
                    <td className={`px-4 py-4 text-right font-mono text-base border-l border-gray-200 ${
                      cost.units === 0
                        ? 'text-gray-400 italic'
                        : 'text-gray-900 font-medium'
                    }`}>
                      {cost.units === 0 ? '0' : formatNumber(cost.units)}
                    </td>
                    <td className="px-4 py-4 text-base text-gray-700 border-l border-gray-200">{cost.factory || '—'}</td>
                    <td className="px-4 py-4 text-base text-gray-700 border-l border-gray-200">{cost.countryOfOrigin || '—'}</td>
                    <td className="px-4 py-4 text-right font-mono text-base font-medium text-gray-900 border-l border-gray-200">
                      {formatCurrency(cost.fob)}
                    </td>
                    <td className="px-4 py-4 text-right font-mono text-base font-bold text-gray-900 border-l border-gray-200">
                      {formatCurrency(cost.landed)}
                    </td>
                    <td className="px-4 py-4 text-right font-mono text-base font-medium text-gray-900 border-l border-gray-200">
                      {formatCurrency(cost.suggestedWholesale)}
                    </td>
                    <td className="px-4 py-4 text-right font-mono text-base font-medium text-gray-900 border-l border-gray-200">
                      {formatCurrency(cost.suggestedMsrp)}
                    </td>
                    <td className="px-4 py-4 text-right border-l-2 border-gray-400">
                      <span className={`font-mono text-base font-bold px-3 py-1 rounded ${getMarginBgClass(cost.margin)} ${getMarginColorClass(cost.margin)}`}>
                        {formatPercent(cost.margin)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-base text-gray-700 border-l border-gray-200">{cost.designTeam || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="px-5 py-4 bg-gray-100 border-t-2 border-gray-300 flex items-center justify-between">
            <span className="text-base text-gray-600">
              Showing {((currentPage - 1) * pageSize) + 1}-{Math.min(currentPage * pageSize, sortedData.length)} of{' '}
              {sortedData.length} records
            </span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="inline-flex items-center gap-1 px-4 py-2 text-base font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-5 h-5" />
                Prev
              </button>
              <span className="text-base text-gray-600 font-medium">
                Page {currentPage} of {totalPages || 1}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="inline-flex items-center gap-1 px-4 py-2 text-base font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* By Factory View */}
      {viewMode === 'byFactory' && (
        <div className="bg-white rounded-xl border-2 border-gray-200 shadow-sm overflow-hidden">
          <div className="bg-gray-50 px-6 py-4 border-b-2 border-gray-200">
            <h3 className="text-xl font-bold text-gray-900">Cost Analysis by Factory</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {byFactory.map((item) => (
              <button
                key={item.factory}
                onClick={() => { setFilterFactory(item.factory); setViewMode('table'); }}
                className="w-full px-6 py-5 flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <Factory className="w-6 h-6 text-gray-400" />
                  <div className="text-left">
                    <div className="text-lg font-semibold text-gray-900">{item.factory}</div>
                    <div className="text-base text-gray-500">{item.count} records</div>
                  </div>
                </div>
                <div className="flex items-center gap-8 text-right">
                  <div>
                    <div className="text-sm font-bold text-gray-500 uppercase">Avg FOB</div>
                    <div className="font-mono text-lg font-semibold text-gray-900">{formatCurrency(item.avgFob)}</div>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-gray-500 uppercase">Avg Landed</div>
                    <div className="font-mono text-lg font-semibold text-gray-900">{formatCurrency(item.avgLanded)}</div>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-gray-500 uppercase">Avg Margin</div>
                    <div className={`font-mono text-lg font-semibold ${getMarginColorClass(item.avgMargin)}`}>
                      {formatPercent(item.avgMargin)}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* By Country View */}
      {viewMode === 'byCountry' && (
        <div className="bg-white rounded-xl border-2 border-gray-200 shadow-sm overflow-hidden">
          <div className="bg-gray-50 px-6 py-4 border-b-2 border-gray-200">
            <h3 className="text-xl font-bold text-gray-900">Cost Analysis by Country</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {byCountry.map((item) => (
              <button
                key={item.country}
                onClick={() => { setFilterCountry(item.country); setViewMode('table'); }}
                className="w-full px-6 py-5 flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <Globe className="w-6 h-6 text-gray-400" />
                  <div className="text-left">
                    <div className="text-lg font-semibold text-gray-900">{item.country}</div>
                    <div className="text-base text-gray-500">{item.count} records</div>
                  </div>
                </div>
                <div className="flex items-center gap-8 text-right">
                  <div>
                    <div className="text-sm font-bold text-gray-500 uppercase">Avg FOB</div>
                    <div className="font-mono text-lg font-semibold text-gray-900">{formatCurrency(item.avgFob)}</div>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-gray-500 uppercase">Avg Landed</div>
                    <div className="font-mono text-lg font-semibold text-gray-900">{formatCurrency(item.avgLanded)}</div>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-gray-500 uppercase">Avg Margin</div>
                    <div className={`font-mono text-lg font-semibold ${getMarginColorClass(item.avgMargin)}`}>
                      {formatPercent(item.avgMargin)}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* By Team View */}
      {viewMode === 'byTeam' && (
        <div className="bg-white rounded-xl border-2 border-gray-200 shadow-sm overflow-hidden">
          <div className="bg-gray-50 px-6 py-4 border-b-2 border-gray-200">
            <h3 className="text-xl font-bold text-gray-900">Cost Analysis by Design Team</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {byTeam.map((item) => (
              <button
                key={item.team}
                onClick={() => { setFilterTeam(item.team); setViewMode('table'); }}
                className="w-full px-6 py-5 flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <Users className="w-6 h-6 text-gray-400" />
                  <div className="text-left">
                    <div className="text-lg font-semibold text-gray-900">{item.team}</div>
                    <div className="text-base text-gray-500">{item.count} records</div>
                  </div>
                </div>
                <div className="flex items-center gap-8 text-right">
                  <div>
                    <div className="text-sm font-bold text-gray-500 uppercase">Avg FOB</div>
                    <div className="font-mono text-lg font-semibold text-gray-900">{formatCurrency(item.avgFob)}</div>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-gray-500 uppercase">Avg Landed</div>
                    <div className="font-mono text-lg font-semibold text-gray-900">{formatCurrency(item.avgLanded)}</div>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-gray-500 uppercase">Avg Margin</div>
                    <div className={`font-mono text-lg font-semibold ${getMarginColorClass(item.avgMargin)}`}>
                      {formatPercent(item.avgMargin)}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
