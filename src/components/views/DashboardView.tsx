'use client';

import { useMemo } from 'react';
import { Product, SalesRecord, CostRecord, normalizeCategory } from '@/types/product';
import { DollarSign, Package, TrendingUp, Layers, ChevronRight, Calculator } from 'lucide-react';
import { SourceLegend } from '@/components/SourceBadge';
import { formatCurrencyShort, formatPercent, formatNumber } from '@/utils/format';

interface DashboardViewProps {
  products: Product[];
  sales: SalesRecord[];
  costs: CostRecord[];
  selectedSeason: string;
  selectedDivision: string;
  selectedCategory: string;
  onStyleClick: (styleNumber: string) => void;
}

export default function DashboardView({
  products,
  sales,
  costs,
  selectedSeason,
  selectedDivision,
  selectedCategory,
  onStyleClick,
}: DashboardViewProps) {
  // Filter sales by selected filters
  const filteredSales = useMemo(() => {
    return sales.filter((s) => {
      if (selectedSeason && s.season !== selectedSeason) return false;
      if (selectedDivision && s.divisionDesc !== selectedDivision) return false;
      if (selectedCategory && normalizeCategory(s.categoryDesc) !== selectedCategory) return false;
      return true;
    });
  }, [sales, selectedSeason, selectedDivision, selectedCategory]);

  // Calculate summary stats
  const stats = useMemo(() => {
    const totalRevenue = filteredSales.reduce((sum, s) => sum + (s.revenue || 0), 0);
    const totalUnits = filteredSales.reduce((sum, s) => sum + (s.unitsBooked || 0), 0);
    const uniqueStyles = new Set(filteredSales.map((s) => s.styleNumber)).size;

    // Build cost lookup
    const costLookup = new Map<string, number>();
    costs.forEach((c) => {
      const key = `${c.styleNumber}-${c.season}`;
      if (c.landed > 0) {
        costLookup.set(key, c.landed);
      }
    });

    // Calculate margin
    let totalCost = 0;
    filteredSales.forEach((s) => {
      const costKey = `${s.styleNumber}-${s.season}`;
      const unitCost = costLookup.get(costKey) || 0;
      totalCost += unitCost * s.unitsBooked;
    });

    const margin = totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue) * 100 : 0;

    return { totalRevenue, totalUnits, uniqueStyles, margin };
  }, [filteredSales, costs]);

  // Sales by category
  const salesByCategory = useMemo(() => {
    const grouped = new Map<string, number>();
    filteredSales.forEach((s) => {
      const cat = normalizeCategory(s.categoryDesc) || 'Unknown';
      grouped.set(cat, (grouped.get(cat) || 0) + (s.revenue || 0));
    });
    return Array.from(grouped.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [filteredSales]);

  // Helper to derive gender from divisionDesc
  const getGenderFromDivision = (divisionDesc: string): string => {
    if (!divisionDesc) return 'Unknown';
    const lower = divisionDesc.toLowerCase();
    if (lower.includes("men's") && !lower.includes("women's")) return "Men's";
    if (lower.includes("women's") || lower.includes("woman")) return "Women's";
    if (lower.includes("unisex") || lower.includes("accessories")) return "Unisex";
    return "Unknown";
  };

  // Build gender lookup from products (Line List priority)
  const productGenderMap = useMemo(() => {
    const map = new Map<string, string>();
    products.forEach((p) => {
      if (p.styleNumber && p.divisionDesc) {
        const gender = getGenderFromDivision(p.divisionDesc);
        if (gender !== 'Unknown') {
          map.set(p.styleNumber, gender);
        }
      }
    });
    return map;
  }, [products]);

  // Sales by gender (Line List priority, fallback to sales divisionDesc)
  const salesByGender = useMemo(() => {
    const grouped = new Map<string, number>();
    const totalRevenue = filteredSales.reduce((sum, s) => sum + (s.revenue || 0), 0);

    filteredSales.forEach((s) => {
      // Priority: Line List first, then sales divisionDesc
      let gender = productGenderMap.get(s.styleNumber);
      if (!gender) {
        gender = getGenderFromDivision(s.divisionDesc);
      }
      grouped.set(gender, (grouped.get(gender) || 0) + (s.revenue || 0));
    });

    return Array.from(grouped.entries())
      .map(([gender, revenue]) => ({
        gender,
        revenue,
        percent: totalRevenue > 0 ? (revenue / totalRevenue) * 100 : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [filteredSales, productGenderMap]);

  // Cost summary stats
  const costStats = useMemo(() => {
    // Filter costs by selected season
    const filteredCosts = selectedSeason
      ? costs.filter((c) => c.season === selectedSeason)
      : costs;

    const stylesWithCosts = filteredCosts.filter((c) => c.landed > 0);
    const totalStyles = stylesWithCosts.length;

    if (totalStyles === 0) {
      return {
        totalStyles: 0,
        avgLanded: 0,
        avgFob: 0,
        avgMargin: 0,
        marginBuckets: { excellent: 0, good: 0, fair: 0, poor: 0 },
      };
    }

    const avgLanded = stylesWithCosts.reduce((sum, c) => sum + c.landed, 0) / totalStyles;
    const avgFob = stylesWithCosts.reduce((sum, c) => sum + (c.fob || 0), 0) / totalStyles;

    // Calculate margins using suggested wholesale from costs
    const margins = stylesWithCosts
      .filter((c) => c.suggestedWholesale && c.suggestedWholesale > 0)
      .map((c) => ((c.suggestedWholesale! - c.landed) / c.suggestedWholesale!) * 100);

    const avgMargin = margins.length > 0
      ? margins.reduce((sum, m) => sum + m, 0) / margins.length
      : 0;

    // Margin distribution buckets
    const marginBuckets = { excellent: 0, good: 0, fair: 0, poor: 0 };
    margins.forEach((m) => {
      if (m >= 50) marginBuckets.excellent++;
      else if (m >= 45) marginBuckets.good++;
      else if (m >= 40) marginBuckets.fair++;
      else marginBuckets.poor++;
    });

    return { totalStyles, avgLanded, avgFob, avgMargin, marginBuckets };
  }, [costs, selectedSeason]);

  // Top styles by revenue
  const topStyles = useMemo(() => {
    const grouped = new Map<string, { styleNumber: string; styleDesc: string; units: number; revenue: number }>();

    filteredSales.forEach((s) => {
      const existing = grouped.get(s.styleNumber);
      if (existing) {
        existing.units += s.unitsBooked || 0;
        existing.revenue += s.revenue || 0;
      } else {
        grouped.set(s.styleNumber, {
          styleNumber: s.styleNumber,
          styleDesc: s.styleDesc || '',
          units: s.unitsBooked || 0,
          revenue: s.revenue || 0,
        });
      }
    });

    // Build cost lookup for margin
    const costLookup = new Map<string, number>();
    costs.forEach((c) => {
      if (c.season === selectedSeason && c.landed > 0) {
        costLookup.set(c.styleNumber, c.landed);
      }
    });

    return Array.from(grouped.values())
      .map((style) => {
        const unitCost = costLookup.get(style.styleNumber) || 0;
        const totalCost = unitCost * style.units;
        const margin = style.revenue > 0 ? ((style.revenue - totalCost) / style.revenue) * 100 : 0;
        return { ...style, margin };
      })
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
  }, [filteredSales, costs, selectedSeason]);

  // Gender colors for chart
  const genderColors: Record<string, string> = {
    "Men's": '#2563eb',    // blue-600
    "Women's": '#9333ea',  // purple-600
    "Unisex": '#6b7280',   // gray-500
    "Unknown": '#6b7280',  // gray-500
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-4xl font-display font-bold text-gray-900">
          Season Dashboard: {selectedSeason || 'All'}
        </h2>
        <p className="text-base text-gray-500 mt-2">
          Overview of sales performance and key metrics
        </p>
      </div>

      {/* Data Sources Legend */}
      <SourceLegend sources={['sales', 'landed', 'linelist']} className="bg-white rounded-xl border border-gray-200 p-4" />

      {/* Stat Cards */}
      <div className="grid grid-cols-4 gap-5">
        <div className="bg-white rounded-xl border border-gray-300 p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-emerald-100 flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-3xl font-bold font-mono text-gray-900">
                {formatCurrencyShort(stats.totalRevenue)}
              </p>
              <p className="text-sm text-gray-500 font-bold uppercase tracking-wide">
                Revenue
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-300 p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
              <Package className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-3xl font-bold font-mono text-gray-900">
                {formatNumber(stats.totalUnits)}
              </p>
              <p className="text-sm text-gray-500 font-bold uppercase tracking-wide">
                Units
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-300 p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-purple-100 flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <p className="text-3xl font-bold font-mono text-gray-900">
                {formatPercent(stats.margin)}
              </p>
              <p className="text-sm text-gray-500 font-bold uppercase tracking-wide">
                Margin
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-300 p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-amber-100 flex items-center justify-center">
              <Layers className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <p className="text-3xl font-bold font-mono text-gray-900">
                {formatNumber(stats.uniqueStyles)}
              </p>
              <p className="text-sm text-gray-500 font-bold uppercase tracking-wide">
                Styles
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Two Column Row */}
      <div className="grid grid-cols-2 gap-6">
        {/* By Category */}
        <div className="bg-white rounded-xl border border-gray-300 shadow-sm">
          <div className="px-6 py-4 border-b border-gray-300">
            <h3 className="text-xl font-bold text-gray-900">By Category</h3>
          </div>
          <div className="p-6 space-y-4">
            {salesByCategory.map(([category, revenue]) => {
              const maxRevenue = salesByCategory[0]?.[1] || 1;
              const width = (revenue / maxRevenue) * 100;
              return (
                <div key={category} className="flex items-center gap-4">
                  <div className="w-32 text-base text-gray-700 truncate font-medium">{category}</div>
                  <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                    <div
                      className="bg-cyan-500 h-full rounded-full transition-all"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                  <div className="w-20 text-right text-base font-mono font-semibold text-gray-900">
                    {formatCurrencyShort(revenue)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* By Gender */}
        <div className="bg-white rounded-xl border border-gray-300 shadow-sm">
          <div className="px-6 py-4 border-b border-gray-300">
            <h3 className="text-xl font-bold text-gray-900">By Gender</h3>
          </div>
          <div className="p-6 space-y-4">
            {salesByGender.map(({ gender, revenue, percent }) => (
              <div key={gender} className="flex items-center gap-4">
                <div
                  className="w-24 text-base font-medium px-2 py-1 rounded"
                  style={{
                    backgroundColor: `${genderColors[gender] || '#6b7280'}20`,
                    color: genderColors[gender] || '#6b7280'
                  }}
                >
                  {gender}
                </div>
                <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${percent}%`, backgroundColor: genderColors[gender] || '#6b7280' }}
                  />
                </div>
                <div className="w-16 text-right text-base font-mono text-gray-500">
                  {formatPercent(percent)}
                </div>
                <div className="w-20 text-right text-base font-mono font-semibold text-gray-900">
                  {formatCurrencyShort(revenue)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Costs Summary */}
      <div className="bg-white rounded-xl border border-gray-300 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-300">
          <h3 className="text-xl font-bold text-gray-900">
            Cost Analysis {selectedSeason ? `(${selectedSeason})` : '(All Seasons)'}
          </h3>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-4 gap-6">
            {/* Styles with Costs */}
            <div className="text-center">
              <p className="text-3xl font-bold font-mono text-gray-900">
                {formatNumber(costStats.totalStyles)}
              </p>
              <p className="text-sm text-gray-500 font-bold uppercase tracking-wide mt-1">
                Styles with Costs
              </p>
            </div>

            {/* Avg FOB */}
            <div className="text-center">
              <p className="text-3xl font-bold font-mono text-gray-900">
                ${costStats.avgFob.toFixed(2)}
              </p>
              <p className="text-sm text-gray-500 font-bold uppercase tracking-wide mt-1">
                Avg FOB
              </p>
            </div>

            {/* Avg Landed */}
            <div className="text-center">
              <p className="text-3xl font-bold font-mono text-gray-900">
                ${costStats.avgLanded.toFixed(2)}
              </p>
              <p className="text-sm text-gray-500 font-bold uppercase tracking-wide mt-1">
                Avg Landed
              </p>
            </div>

            {/* Avg Margin */}
            <div className="text-center">
              <p className={`text-3xl font-bold font-mono ${
                costStats.avgMargin >= 50 ? 'text-emerald-600' :
                costStats.avgMargin >= 45 ? 'text-amber-600' :
                costStats.avgMargin >= 40 ? 'text-orange-600' : 'text-red-600'
              }`}>
                {formatPercent(costStats.avgMargin)}
              </p>
              <p className="text-sm text-gray-500 font-bold uppercase tracking-wide mt-1">
                Avg Margin
              </p>
            </div>
          </div>

          {/* Margin Distribution */}
          {costStats.totalStyles > 0 && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <p className="text-sm font-bold text-gray-600 uppercase tracking-wide mb-3">
                Margin Distribution
              </p>
              <div className="flex gap-4">
                <div className="flex-1 bg-emerald-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold font-mono text-emerald-700">
                    {costStats.marginBuckets.excellent}
                  </p>
                  <p className="text-xs font-semibold text-emerald-600 mt-1">50%+ Excellent</p>
                </div>
                <div className="flex-1 bg-amber-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold font-mono text-amber-700">
                    {costStats.marginBuckets.good}
                  </p>
                  <p className="text-xs font-semibold text-amber-600 mt-1">45-50% Good</p>
                </div>
                <div className="flex-1 bg-orange-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold font-mono text-orange-700">
                    {costStats.marginBuckets.fair}
                  </p>
                  <p className="text-xs font-semibold text-orange-600 mt-1">40-45% Fair</p>
                </div>
                <div className="flex-1 bg-red-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold font-mono text-red-700">
                    {costStats.marginBuckets.poor}
                  </p>
                  <p className="text-xs font-semibold text-red-600 mt-1">&lt;40% Poor</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Top Styles Table */}
      <div className="bg-white rounded-xl border border-gray-300 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-300 bg-gray-100 flex items-center justify-between">
          <h3 className="text-xl font-bold text-gray-900">Top Styles</h3>
          <span className="text-sm text-gray-500 font-medium">Click row for details</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b-2 border-gray-300 text-left bg-gray-100">
                <th className="px-4 py-3 text-sm font-bold text-gray-700 uppercase tracking-wide border-r border-gray-200">
                  Style
                </th>
                <th className="px-4 py-3 text-sm font-bold text-gray-700 uppercase tracking-wide border-r border-gray-200">
                  Description
                </th>
                <th className="px-4 py-3 text-sm font-bold text-gray-700 uppercase tracking-wide text-right border-l border-gray-200">
                  Units
                </th>
                <th className="px-4 py-3 text-sm font-bold text-gray-700 uppercase tracking-wide text-right border-l border-gray-200">
                  Revenue
                </th>
                <th className="px-4 py-3 text-sm font-bold text-gray-700 uppercase tracking-wide text-right border-l border-gray-200">
                  Margin
                </th>
                <th className="px-4 py-3 w-10 border-l border-gray-200"></th>
              </tr>
            </thead>
            <tbody>
              {topStyles.map((style, index) => (
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
                    {formatNumber(style.units)}
                  </td>
                  <td className="px-4 py-4 text-base font-mono font-bold text-gray-900 text-right border-l border-gray-200">
                    {formatCurrencyShort(style.revenue)}
                  </td>
                  <td className="px-4 py-4 text-right border-l border-gray-200">
                    <span
                      className={`text-base font-mono font-bold px-3 py-1 rounded ${
                        style.margin >= 50
                          ? 'bg-emerald-100 text-emerald-700'
                          : style.margin >= 40
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {formatPercent(style.margin)}
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
      </div>
    </div>
  );
}
