'use client';

import { useState, useMemo } from 'react';
import { Product, SalesRecord, CostRecord, normalizeCategory } from '@/types/product';
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
} from 'lucide-react';

interface MarginsViewProps {
  products: Product[];
  sales: SalesRecord[];
  costs: CostRecord[];
  selectedSeason: string;
  selectedDivision: string;
  selectedCategory: string;
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

interface GenderMargin {
  gender: string;
  revenue: number;
  cogs: number;
  gross: number;
  margin: number;
}

type SortField = 'styleNumber' | 'styleDesc' | 'revenue' | 'cogs' | 'gross' | 'margin' | 'vsTarget';
type SortDirection = 'asc' | 'desc';

const CHANNEL_LABELS: Record<string, string> = {
  'WH': 'Wholesale',
  'WD': 'Wholesale Direct',
  'BB': 'Big Box/REI',
  'PS': 'Pro Sales',
  'EC': 'E-commerce',
  'KI': 'KÜHL Internal',
};

const TARGET_MARGIN = 48; // Default target margin percentage

function formatCurrency(value: number): string {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(2)}M`;
  }
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(0)}K`;
  }
  return `$${value.toFixed(0)}`;
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatNumber(value: number): string {
  return value.toLocaleString();
}

function getMarginTier(margin: number): 'excellent' | 'target' | 'watch' | 'problem' {
  if (margin >= 55) return 'excellent';
  if (margin >= 45) return 'target';
  if (margin >= 35) return 'watch';
  return 'problem';
}

function getMarginColor(margin: number): string {
  const tier = getMarginTier(margin);
  switch (tier) {
    case 'excellent': return 'bg-emerald-100 text-emerald-700';
    case 'target': return 'bg-green-100 text-green-700';
    case 'watch': return 'bg-amber-100 text-amber-700';
    case 'problem': return 'bg-red-100 text-red-700';
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

export default function MarginsView({
  products,
  sales,
  costs,
  selectedSeason,
  selectedDivision,
  selectedCategory,
  onStyleClick,
}: MarginsViewProps) {
  const [sortField, setSortField] = useState<SortField>('margin');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string | null>(null);

  // Build cost lookup from costs data
  const costLookup = useMemo(() => {
    const lookup = new Map<string, number>();
    costs.forEach(c => {
      // Use landed cost if available
      if (c.landed > 0) {
        lookup.set(c.styleNumber, c.landed);
      } else if (c.fob > 0) {
        lookup.set(c.styleNumber, c.fob);
      }
    });
    // Also get costs from products
    products.forEach(p => {
      if (!lookup.has(p.styleNumber) && p.cost > 0) {
        lookup.set(p.styleNumber, p.cost);
      }
    });
    return lookup;
  }, [costs, products]);

  // Filter sales by season first
  const filteredSales = useMemo(() => {
    return sales.filter(s => {
      if (selectedSeason && s.season !== selectedSeason) return false;
      return true;
    });
  }, [sales, selectedSeason]);

  // Calculate margins by style
  const styleMargins = useMemo(() => {
    const byStyle = new Map<string, StyleMargin>();

    filteredSales.forEach(record => {
      const cost = costLookup.get(record.styleNumber) || 0;

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
  }, [filteredSales, costLookup]);

  // Apply filters (division, category, tier, channel)
  const filteredStyleMargins = useMemo(() => {
    return styleMargins.filter(s => {
      if (selectedDivision && s.divisionDesc !== selectedDivision) return false;
      if (selectedCategory && s.categoryDesc !== selectedCategory) return false;
      if (selectedCategoryFilter && s.categoryDesc !== selectedCategoryFilter) return false;
      if (selectedTier) {
        const tier = getMarginTier(s.margin);
        if (tier !== selectedTier) return false;
      }
      return true;
    });
  }, [styleMargins, selectedDivision, selectedCategory, selectedCategoryFilter, selectedTier]);

  // Sort styles
  const sortedStyles = useMemo(() => {
    const sorted = [...filteredStyleMargins].sort((a, b) => {
      let aVal: number | string = a[sortField];
      let bVal: number | string = b[sortField];

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
      if (selectedDivision && record.divisionDesc !== selectedDivision) return;
      if (selectedCategory && normalizeCategory(record.categoryDesc) !== selectedCategory) return;

      const channel = record.customerType || 'Other';
      const cost = costLookup.get(record.styleNumber) || 0;

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
  }, [filteredSales, costLookup, selectedDivision, selectedCategory]);

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
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? (
      <ChevronUp className="w-4 h-4 inline ml-1" />
    ) : (
      <ChevronDown className="w-4 h-4 inline ml-1" />
    );
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-4xl font-display font-bold text-gray-900">
          Margins View: {selectedSeason || 'All Seasons'}
        </h2>
        <p className="text-base text-gray-500 mt-2">
          Profitability analysis across categories, channels, and styles
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-5 gap-4">
        <div className="bg-white rounded-xl border-2 border-gray-200 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold font-mono text-gray-900">
                {formatCurrency(stats.totalRevenue)}
              </p>
              <p className="text-sm text-gray-500 font-bold uppercase tracking-wide">
                Revenue
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border-2 border-gray-200 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
              <Package className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold font-mono text-gray-900">
                {formatCurrency(stats.totalCogs)}
              </p>
              <p className="text-sm text-gray-500 font-bold uppercase tracking-wide">
                COGS
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border-2 border-gray-200 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold font-mono text-gray-900">
                {formatCurrency(stats.totalGross)}
              </p>
              <p className="text-sm text-gray-500 font-bold uppercase tracking-wide">
                Gross $
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border-2 border-gray-200 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <Percent className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className={`text-2xl font-bold font-mono ${stats.overallMargin >= TARGET_MARGIN ? 'text-emerald-600' : 'text-red-600'}`}>
                {formatPercent(stats.overallMargin)}
              </p>
              <p className="text-sm text-gray-500 font-bold uppercase tracking-wide">
                Margin %
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border-2 border-gray-200 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold font-mono text-gray-900">
                {formatPercent(stats.markup)}
              </p>
              <p className="text-sm text-gray-500 font-bold uppercase tracking-wide">
                Markup %
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Margin Health Bar */}
      <div className="bg-white rounded-xl border-2 border-gray-200 shadow-sm">
        <div className="px-6 py-4 border-b-2 border-gray-200 flex items-center justify-between">
          <h3 className="text-xl font-bold text-gray-900">Margin Health</h3>
          {(selectedTier || selectedCategoryFilter) && (
            <button
              onClick={clearFilters}
              className="text-sm text-cyan-600 hover:text-cyan-700 font-medium"
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
              className={`flex items-center gap-2 px-3 py-1 rounded-lg transition-colors ${selectedTier === 'excellent' ? 'bg-emerald-100' : 'hover:bg-gray-100'}`}
            >
              <div className="w-3 h-3 bg-emerald-600 rounded-full" />
              <span className="font-semibold text-gray-700">55%+</span>
              <span className="text-gray-500">Excellent</span>
              <span className="font-mono font-bold text-gray-900">{marginHealth.excellent.count}</span>
            </button>
            <button
              onClick={() => handleTierClick('target')}
              className={`flex items-center gap-2 px-3 py-1 rounded-lg transition-colors ${selectedTier === 'target' ? 'bg-green-100' : 'hover:bg-gray-100'}`}
            >
              <div className="w-3 h-3 bg-green-500 rounded-full" />
              <span className="font-semibold text-gray-700">45-55%</span>
              <span className="text-gray-500">Target</span>
              <span className="font-mono font-bold text-gray-900">{marginHealth.target.count}</span>
            </button>
            <button
              onClick={() => handleTierClick('watch')}
              className={`flex items-center gap-2 px-3 py-1 rounded-lg transition-colors ${selectedTier === 'watch' ? 'bg-amber-100' : 'hover:bg-gray-100'}`}
            >
              <div className="w-3 h-3 bg-amber-500 rounded-full" />
              <span className="font-semibold text-gray-700">35-45%</span>
              <span className="text-gray-500">Watch</span>
              <span className="font-mono font-bold text-gray-900">{marginHealth.watch.count}</span>
            </button>
            <button
              onClick={() => handleTierClick('problem')}
              className={`flex items-center gap-2 px-3 py-1 rounded-lg transition-colors ${selectedTier === 'problem' ? 'bg-red-100' : 'hover:bg-gray-100'}`}
            >
              <div className="w-3 h-3 bg-red-500 rounded-full" />
              <span className="font-semibold text-gray-700">&lt;35%</span>
              <span className="text-gray-500">Problem</span>
              <span className="font-mono font-bold text-gray-900">{marginHealth.problem.count}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Two Column Row: By Category and By Channel */}
      <div className="grid grid-cols-2 gap-6">
        {/* By Category */}
        <div className="bg-white rounded-xl border-2 border-gray-200 shadow-sm">
          <div className="px-6 py-4 border-b-2 border-gray-200">
            <h3 className="text-xl font-bold text-gray-900">By Category</h3>
          </div>
          <div className="p-4">
            <table className="w-full">
              <thead>
                <tr className="text-left">
                  <th className="px-3 py-2 text-sm font-bold text-gray-600 uppercase tracking-wide">Category</th>
                  <th className="px-3 py-2 text-sm font-bold text-gray-600 uppercase tracking-wide text-right">Margin</th>
                  <th className="px-3 py-2 text-sm font-bold text-gray-600 uppercase tracking-wide text-right">Gross</th>
                </tr>
              </thead>
              <tbody>
                {categoryMargins.map(c => (
                  <tr
                    key={c.category}
                    onClick={() => handleCategoryClick(c.category)}
                    className={`cursor-pointer transition-colors ${selectedCategoryFilter === c.category ? 'bg-cyan-50' : 'hover:bg-gray-50'}`}
                  >
                    <td className="px-3 py-2 text-base text-gray-700 font-medium truncate max-w-[140px]">
                      {c.category}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className={`text-base font-mono font-semibold px-2 py-0.5 rounded ${getMarginColor(c.margin)}`}>
                        {formatPercent(c.margin)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-base font-mono text-gray-900 text-right">
                      {formatCurrency(c.gross)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* By Channel */}
        <div className="bg-white rounded-xl border-2 border-gray-200 shadow-sm">
          <div className="px-6 py-4 border-b-2 border-gray-200">
            <h3 className="text-xl font-bold text-gray-900">By Channel</h3>
          </div>
          <div className="p-4">
            <table className="w-full">
              <thead>
                <tr className="text-left">
                  <th className="px-3 py-2 text-sm font-bold text-gray-600 uppercase tracking-wide">Channel</th>
                  <th className="px-3 py-2 text-sm font-bold text-gray-600 uppercase tracking-wide text-right">Margin</th>
                  <th className="px-3 py-2 text-sm font-bold text-gray-600 uppercase tracking-wide text-right">Gross</th>
                </tr>
              </thead>
              <tbody>
                {channelMargins.map(c => (
                  <tr
                    key={c.channel}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-3 py-2 text-base text-gray-700 font-medium">
                      {c.channelName}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className={`text-base font-mono font-semibold px-2 py-0.5 rounded ${getMarginColor(c.margin)}`}>
                        {formatPercent(c.margin)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-base font-mono text-gray-900 text-right">
                      {formatCurrency(c.gross)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Two Column Row: By Gender and Top/Bottom Styles */}
      <div className="grid grid-cols-2 gap-6">
        {/* By Gender + Bottom Styles */}
        <div className="space-y-6">
          {/* By Gender */}
          <div className="bg-white rounded-xl border-2 border-gray-200 shadow-sm">
            <div className="px-6 py-4 border-b-2 border-gray-200">
              <h3 className="text-xl font-bold text-gray-900">By Gender</h3>
            </div>
            <div className="p-4">
              <table className="w-full">
                <thead>
                  <tr className="text-left">
                    <th className="px-3 py-2 text-sm font-bold text-gray-600 uppercase tracking-wide">Gender</th>
                    <th className="px-3 py-2 text-sm font-bold text-gray-600 uppercase tracking-wide text-right">Margin</th>
                    <th className="px-3 py-2 text-sm font-bold text-gray-600 uppercase tracking-wide text-right">Gross</th>
                  </tr>
                </thead>
                <tbody>
                  {genderMargins.map(g => (
                    <tr key={g.gender} className="hover:bg-gray-50 transition-colors">
                      <td className="px-3 py-2 text-base text-gray-700 font-medium">{g.gender}</td>
                      <td className="px-3 py-2 text-right">
                        <span className={`text-base font-mono font-semibold px-2 py-0.5 rounded ${getMarginColor(g.margin)}`}>
                          {formatPercent(g.margin)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-base font-mono text-gray-900 text-right">
                        {formatCurrency(g.gross)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bottom Margin Styles */}
          <div className="bg-white rounded-xl border-2 border-gray-200 shadow-sm">
            <div className="px-6 py-4 border-b-2 border-gray-200">
              <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <TrendingDown className="w-5 h-5 text-red-500" />
                Bottom Margin Styles
              </h3>
            </div>
            <div className="p-4">
              <table className="w-full">
                <thead>
                  <tr className="text-left">
                    <th className="px-3 py-2 text-sm font-bold text-gray-600 uppercase tracking-wide">Style</th>
                    <th className="px-3 py-2 text-sm font-bold text-gray-600 uppercase tracking-wide">Desc</th>
                    <th className="px-3 py-2 text-sm font-bold text-gray-600 uppercase tracking-wide text-right">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {bottomStyles.map(s => (
                    <tr
                      key={s.styleNumber}
                      onClick={() => onStyleClick(s.styleNumber)}
                      className="hover:bg-red-50 cursor-pointer transition-colors"
                    >
                      <td className="px-3 py-2">
                        <span className="font-mono font-semibold text-gray-900 bg-gray-100 px-2 py-0.5 rounded text-sm">
                          {s.styleNumber}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-sm text-gray-700 truncate max-w-[120px]">
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
        <div className="bg-white rounded-xl border-2 border-gray-200 shadow-sm">
          <div className="px-6 py-4 border-b-2 border-gray-200">
            <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-500" />
              Top Margin Styles
            </h3>
          </div>
          <div className="p-4">
            <table className="w-full">
              <thead>
                <tr className="text-left">
                  <th className="px-3 py-2 text-sm font-bold text-gray-600 uppercase tracking-wide">Style</th>
                  <th className="px-3 py-2 text-sm font-bold text-gray-600 uppercase tracking-wide">Desc</th>
                  <th className="px-3 py-2 text-sm font-bold text-gray-600 uppercase tracking-wide text-right">Margin</th>
                </tr>
              </thead>
              <tbody>
                {topStyles.map(s => (
                  <tr
                    key={s.styleNumber}
                    onClick={() => onStyleClick(s.styleNumber)}
                    className="hover:bg-emerald-50 cursor-pointer transition-colors"
                  >
                    <td className="px-3 py-2">
                      <span className="font-mono font-semibold text-gray-900 bg-gray-100 px-2 py-0.5 rounded text-sm">
                        {s.styleNumber}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-700 truncate max-w-[160px]">
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

      {/* Margin By Style Table */}
      <div className="bg-white rounded-xl border-2 border-gray-200 shadow-sm">
        <div className="px-6 py-4 border-b-2 border-gray-300 bg-gray-100 flex items-center justify-between">
          <h3 className="text-xl font-bold text-gray-900">Margin by Style</h3>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600 font-medium">
              Target Margin: <span className="font-mono font-bold">{TARGET_MARGIN}%</span>
            </span>
            <span className="text-sm text-gray-500 font-medium">
              {formatNumber(sortedStyles.length)} styles
            </span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b-2 border-gray-300 text-left bg-gray-100">
                <th
                  className="px-4 py-3 text-sm font-bold text-gray-700 uppercase tracking-wide cursor-pointer hover:text-gray-900 border-r border-gray-200"
                  onClick={() => handleSort('styleNumber')}
                >
                  Style <SortIcon field="styleNumber" />
                </th>
                <th
                  className="px-4 py-3 text-sm font-bold text-gray-700 uppercase tracking-wide cursor-pointer hover:text-gray-900 border-r border-gray-200"
                  onClick={() => handleSort('styleDesc')}
                >
                  Description <SortIcon field="styleDesc" />
                </th>
                <th
                  className="px-4 py-3 text-sm font-bold text-gray-700 uppercase tracking-wide text-right cursor-pointer hover:text-gray-900 border-l border-gray-200"
                  onClick={() => handleSort('revenue')}
                >
                  Revenue <SortIcon field="revenue" />
                </th>
                <th
                  className="px-4 py-3 text-sm font-bold text-gray-700 uppercase tracking-wide text-right cursor-pointer hover:text-gray-900 border-l border-gray-200"
                  onClick={() => handleSort('cogs')}
                >
                  COGS <SortIcon field="cogs" />
                </th>
                <th
                  className="px-4 py-3 text-sm font-bold text-gray-700 uppercase tracking-wide text-right cursor-pointer hover:text-gray-900 border-l border-gray-200"
                  onClick={() => handleSort('gross')}
                >
                  Gross <SortIcon field="gross" />
                </th>
                <th
                  className="px-4 py-3 text-sm font-bold text-gray-700 uppercase tracking-wide text-right cursor-pointer hover:text-gray-900 border-l border-gray-200"
                  onClick={() => handleSort('margin')}
                >
                  Margin % <SortIcon field="margin" />
                </th>
                <th
                  className="px-4 py-3 text-sm font-bold text-gray-700 uppercase tracking-wide text-right cursor-pointer hover:text-gray-900 border-l-2 border-gray-400"
                  onClick={() => handleSort('vsTarget')}
                >
                  vs Target <SortIcon field="vsTarget" />
                </th>
                <th className="px-4 py-3 w-10 border-l border-gray-200"></th>
              </tr>
            </thead>
            <tbody>
              {sortedStyles.slice(0, 50).map((style, index) => (
                <tr
                  key={style.styleNumber}
                  onClick={() => onStyleClick(style.styleNumber)}
                  className={`border-b border-gray-200 cursor-pointer transition-colors ${
                    index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                  } hover:bg-cyan-50`}
                >
                  <td className="px-4 py-4 border-r border-gray-200">
                    <span className="font-mono text-lg font-bold text-gray-900">
                      {style.styleNumber}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-base text-gray-700 max-w-xs truncate border-r border-gray-200">
                    {style.styleDesc}
                  </td>
                  <td className="px-4 py-4 text-base font-mono font-medium text-gray-900 text-right border-l border-gray-200">
                    {formatCurrency(style.revenue)}
                  </td>
                  <td className="px-4 py-4 text-base font-mono text-gray-600 text-right border-l border-gray-200">
                    {formatCurrency(style.cogs)}
                  </td>
                  <td className="px-4 py-4 text-base font-mono font-bold text-gray-900 text-right border-l border-gray-200">
                    {formatCurrency(style.gross)}
                  </td>
                  <td className="px-4 py-4 text-right border-l border-gray-200">
                    <span className={`text-base font-mono font-bold px-3 py-1 rounded ${getMarginColor(style.margin)}`}>
                      {formatPercent(style.margin)}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right border-l-2 border-gray-400">
                    <span
                      className={`text-base font-mono font-bold flex items-center justify-end gap-1 ${
                        style.vsTarget >= 0
                          ? 'text-emerald-700'
                          : 'text-red-700'
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
                  <td className="px-4 py-4 border-l border-gray-200">
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {sortedStyles.length > 50 && (
          <div className="px-6 py-4 border-t-2 border-gray-300 bg-gray-100 text-center text-base text-gray-600 font-medium">
            Showing 50 of {formatNumber(sortedStyles.length)} styles
          </div>
        )}
      </div>
    </div>
  );
}
