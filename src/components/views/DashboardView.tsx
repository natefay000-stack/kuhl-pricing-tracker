'use client';

import { useMemo } from 'react';
import { Product, SalesRecord, CostRecord, normalizeCategory } from '@/types/product';
import { SalesAggregations } from '@/app/page';
import { DollarSign, Package, TrendingUp, Layers, ChevronRight, Calculator } from 'lucide-react';
import { SourceLegend } from '@/components/SourceBadge';
import { formatCurrencyShort, formatPercent, formatNumber } from '@/utils/format';

interface DashboardViewProps {
  products: Product[];
  sales: SalesRecord[];
  costs: CostRecord[];
  salesAggregations?: SalesAggregations | null;
  selectedSeason: string;
  selectedDivision: string;
  selectedCategory: string;
  onStyleClick: (styleNumber: string) => void;
}

export default function DashboardView({
  products,
  sales,
  costs,
  salesAggregations,
  selectedSeason,
  selectedDivision,
  selectedCategory,
  onStyleClick,
}: DashboardViewProps) {
  // Use raw sales when available, otherwise fall back to aggregations
  const hasSalesData = sales.length > 0;

  // Filter sales by selected filters
  const filteredSales = useMemo(() => {
    return sales.filter((s) => {
      if (selectedSeason && s.season !== selectedSeason) return false;
      if (selectedDivision && s.divisionDesc !== selectedDivision) return false;
      if (selectedCategory && normalizeCategory(s.categoryDesc) !== selectedCategory) return false;
      return true;
    });
  }, [sales, selectedSeason, selectedDivision, selectedCategory]);

  // Calculate summary stats — use aggregations as fallback when sales haven't loaded
  const stats = useMemo(() => {
    if (hasSalesData) {
      // Full calculation from raw sales
      const totalRevenue = filteredSales.reduce((sum, s) => sum + (s.revenue || 0), 0);
      const totalUnits = filteredSales.reduce((sum, s) => sum + (s.unitsBooked || 0), 0);
      const uniqueStyles = new Set(filteredSales.map((s) => s.styleNumber)).size;

      const costLookup = new Map<string, number>();
      costs.forEach((c) => {
        const key = `${c.styleNumber}-${c.season}`;
        if (c.landed > 0) costLookup.set(key, c.landed);
      });

      let totalCost = 0;
      filteredSales.forEach((s) => {
        const costKey = `${s.styleNumber}-${s.season}`;
        const unitCost = costLookup.get(costKey) || 0;
        totalCost += unitCost * s.unitsBooked;
      });

      const margin = totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue) * 100 : 0;
      return { totalRevenue, totalUnits, uniqueStyles, margin };
    }

    // Fallback: compute from aggregations (available before raw sales load)
    if (salesAggregations) {
      const aggs = salesAggregations.byCategory || [];
      const filtered = aggs.filter((a) => {
        if (selectedSeason && a.season !== selectedSeason) return false;
        if (selectedCategory && normalizeCategory(a.category) !== selectedCategory) return false;
        return true;
      });
      const totalRevenue = filtered.reduce((sum, a) => sum + (a.revenue || 0), 0);
      const totalUnits = filtered.reduce((sum, a) => sum + (a.units || 0), 0);
      return { totalRevenue, totalUnits, uniqueStyles: 0, margin: 0 };
    }

    return { totalRevenue: 0, totalUnits: 0, uniqueStyles: 0, margin: 0 };
  }, [hasSalesData, filteredSales, costs, salesAggregations, selectedSeason, selectedCategory]);

  // Sales by category — use aggregations as fallback
  const salesByCategory = useMemo(() => {
    if (hasSalesData) {
      const grouped = new Map<string, number>();
      filteredSales.forEach((s) => {
        const cat = normalizeCategory(s.categoryDesc) || 'Unknown';
        grouped.set(cat, (grouped.get(cat) || 0) + (s.revenue || 0));
      });
      return Array.from(grouped.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6);
    }
    if (salesAggregations) {
      const grouped = new Map<string, number>();
      (salesAggregations.byCategory || []).forEach((a) => {
        if (selectedSeason && a.season !== selectedSeason) return;
        const cat = normalizeCategory(a.category) || 'Unknown';
        grouped.set(cat, (grouped.get(cat) || 0) + (a.revenue || 0));
      });
      return Array.from(grouped.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6);
    }
    return [];
  }, [hasSalesData, filteredSales, salesAggregations, selectedSeason]);

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

  // Sales by gender — use aggregations as fallback
  const salesByGender = useMemo(() => {
    if (hasSalesData) {
      const grouped = new Map<string, number>();
      const totalRevenue = filteredSales.reduce((sum, s) => sum + (s.revenue || 0), 0);

      filteredSales.forEach((s) => {
        let gender = productGenderMap.get(s.styleNumber);
        if (!gender) gender = getGenderFromDivision(s.divisionDesc);
        grouped.set(gender, (grouped.get(gender) || 0) + (s.revenue || 0));
      });

      return Array.from(grouped.entries())
        .map(([gender, revenue]) => ({
          gender,
          revenue,
          percent: totalRevenue > 0 ? (revenue / totalRevenue) * 100 : 0,
        }))
        .sort((a, b) => b.revenue - a.revenue);
    }

    // Fallback: use gender aggregations
    if (salesAggregations) {
      const grouped = new Map<string, number>();
      let totalRevenue = 0;
      (salesAggregations.byGender || []).forEach((a) => {
        if (selectedSeason && a.season !== selectedSeason) return;
        const gender = a.gender || 'Unknown';
        grouped.set(gender, (grouped.get(gender) || 0) + (a.revenue || 0));
        totalRevenue += a.revenue || 0;
      });
      return Array.from(grouped.entries())
        .map(([gender, revenue]) => ({
          gender,
          revenue,
          percent: totalRevenue > 0 ? (revenue / totalRevenue) * 100 : 0,
        }))
        .sort((a, b) => b.revenue - a.revenue);
    }

    return [];
  }, [hasSalesData, filteredSales, productGenderMap, salesAggregations, selectedSeason]);

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
        <h2 className="text-4xl font-display font-bold text-text-primary">
          Season Dashboard: {selectedSeason || 'All'}
        </h2>
        <p className="text-base text-text-muted mt-2">
          Overview of sales performance and key metrics
        </p>
      </div>

      {/* Data Sources Legend */}
      <SourceLegend sources={['sales', 'landed', 'linelist']} className="bg-surface rounded-xl border border-border-primary p-4" />

      {/* Stat Cards */}
      <div className="grid grid-cols-4 gap-5">
        <div className="bg-surface rounded-xl border border-border-strong p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-3xl font-bold font-mono text-text-primary">
                {formatCurrencyShort(stats.totalRevenue)}
              </p>
              <p className="text-sm text-text-muted font-bold uppercase tracking-wide">
                Revenue
              </p>
            </div>
          </div>
        </div>

        <div className="bg-surface rounded-xl border border-border-strong p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
              <Package className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-3xl font-bold font-mono text-text-primary">
                {formatNumber(stats.totalUnits)}
              </p>
              <p className="text-sm text-text-muted font-bold uppercase tracking-wide">
                Units
              </p>
            </div>
          </div>
        </div>

        <div className="bg-surface rounded-xl border border-border-strong p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-purple-100 dark:bg-purple-900 flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <p className="text-3xl font-bold font-mono text-text-primary">
                {formatPercent(stats.margin)}
              </p>
              <p className="text-sm text-text-muted font-bold uppercase tracking-wide">
                Margin
              </p>
            </div>
          </div>
        </div>

        <div className="bg-surface rounded-xl border border-border-strong p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-amber-100 dark:bg-amber-900 flex items-center justify-center">
              <Layers className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <p className="text-3xl font-bold font-mono text-text-primary">
                {formatNumber(stats.uniqueStyles)}
              </p>
              <p className="text-sm text-text-muted font-bold uppercase tracking-wide">
                Styles
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Two Column Row */}
      <div className="grid grid-cols-2 gap-6">
        {/* By Category */}
        <div className="bg-surface rounded-xl border border-border-strong shadow-sm">
          <div className="px-6 py-4 border-b border-border-strong">
            <h3 className="text-xl font-bold text-text-primary">By Category</h3>
          </div>
          <div className="p-6 space-y-4">
            {salesByCategory.map(([category, revenue]) => {
              const maxRevenue = salesByCategory[0]?.[1] || 1;
              const width = (revenue / maxRevenue) * 100;
              return (
                <div key={category} className="flex items-center gap-4">
                  <div className="w-32 text-base text-text-secondary truncate font-medium">{category}</div>
                  <div className="flex-1 bg-surface-tertiary rounded-full h-3 overflow-hidden">
                    <div
                      className="bg-cyan-500 h-full rounded-full transition-all"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                  <div className="w-20 text-right text-base font-mono font-semibold text-text-primary">
                    {formatCurrencyShort(revenue)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* By Gender */}
        <div className="bg-surface rounded-xl border border-border-strong shadow-sm">
          <div className="px-6 py-4 border-b border-border-strong">
            <h3 className="text-xl font-bold text-text-primary">By Gender</h3>
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
                <div className="flex-1 bg-surface-tertiary rounded-full h-3 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${percent}%`, backgroundColor: genderColors[gender] || '#6b7280' }}
                  />
                </div>
                <div className="w-16 text-right text-base font-mono text-text-muted">
                  {formatPercent(percent)}
                </div>
                <div className="w-20 text-right text-base font-mono font-semibold text-text-primary">
                  {formatCurrencyShort(revenue)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Costs Summary */}
      <div className="bg-surface rounded-xl border border-border-strong shadow-sm">
        <div className="px-6 py-4 border-b border-border-strong">
          <h3 className="text-xl font-bold text-text-primary">
            Cost Analysis {selectedSeason ? `(${selectedSeason})` : '(All Seasons)'}
          </h3>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-4 gap-6">
            {/* Styles with Costs */}
            <div className="text-center">
              <p className="text-3xl font-bold font-mono text-text-primary">
                {formatNumber(costStats.totalStyles)}
              </p>
              <p className="text-sm text-text-muted font-bold uppercase tracking-wide mt-1">
                Styles with Costs
              </p>
            </div>

            {/* Avg FOB */}
            <div className="text-center">
              <p className="text-3xl font-bold font-mono text-text-primary">
                ${costStats.avgFob.toFixed(2)}
              </p>
              <p className="text-sm text-text-muted font-bold uppercase tracking-wide mt-1">
                Avg FOB
              </p>
            </div>

            {/* Avg Landed */}
            <div className="text-center">
              <p className="text-3xl font-bold font-mono text-text-primary">
                ${costStats.avgLanded.toFixed(2)}
              </p>
              <p className="text-sm text-text-muted font-bold uppercase tracking-wide mt-1">
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
              <p className="text-sm text-text-muted font-bold uppercase tracking-wide mt-1">
                Avg Margin
              </p>
            </div>
          </div>

          {/* Margin Distribution */}
          {costStats.totalStyles > 0 && (
            <div className="mt-6 pt-6 border-t border-border-primary">
              <p className="text-sm font-bold text-text-secondary uppercase tracking-wide mb-3">
                Margin Distribution
              </p>
              <div className="flex gap-4">
                <div className="flex-1 bg-emerald-50 dark:bg-emerald-950 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold font-mono text-emerald-700">
                    {costStats.marginBuckets.excellent}
                  </p>
                  <p className="text-xs font-semibold text-emerald-600 mt-1">50%+ Excellent</p>
                </div>
                <div className="flex-1 bg-amber-50 dark:bg-amber-950 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold font-mono text-amber-700">
                    {costStats.marginBuckets.good}
                  </p>
                  <p className="text-xs font-semibold text-amber-600 mt-1">45-50% Good</p>
                </div>
                <div className="flex-1 bg-orange-50 dark:bg-orange-950 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold font-mono text-orange-700">
                    {costStats.marginBuckets.fair}
                  </p>
                  <p className="text-xs font-semibold text-orange-600 mt-1">40-45% Fair</p>
                </div>
                <div className="flex-1 bg-red-50 dark:bg-red-950 rounded-lg p-3 text-center">
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
      <div className="bg-surface rounded-xl border border-border-strong shadow-sm">
        <div className="px-6 py-4 border-b border-border-strong bg-surface-tertiary flex items-center justify-between">
          <h3 className="text-xl font-bold text-text-primary">Top Styles</h3>
          <span className="text-sm text-text-muted font-medium">Click row for details</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b-2 border-border-strong text-left bg-surface-tertiary">
                <th className="px-4 py-3 text-sm font-bold text-text-secondary uppercase tracking-wide border-r border-border-primary">
                  Style
                </th>
                <th className="px-4 py-3 text-sm font-bold text-text-secondary uppercase tracking-wide border-r border-border-primary">
                  Description
                </th>
                <th className="px-4 py-3 text-sm font-bold text-text-secondary uppercase tracking-wide text-right border-l border-border-primary">
                  Units
                </th>
                <th className="px-4 py-3 text-sm font-bold text-text-secondary uppercase tracking-wide text-right border-l border-border-primary">
                  Revenue
                </th>
                <th className="px-4 py-3 text-sm font-bold text-text-secondary uppercase tracking-wide text-right border-l border-border-primary">
                  Margin
                </th>
                <th className="px-4 py-3 w-10 border-l border-border-primary"></th>
              </tr>
            </thead>
            <tbody>
              {topStyles.map((style, index) => (
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
                    {formatNumber(style.units)}
                  </td>
                  <td className="px-4 py-4 text-base font-mono font-bold text-text-primary text-right border-l border-border-primary">
                    {formatCurrencyShort(style.revenue)}
                  </td>
                  <td className="px-4 py-4 text-right border-l border-border-primary">
                    <span
                      className={`text-base font-mono font-bold px-3 py-1 rounded ${
                        style.margin >= 50
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-400'
                          : style.margin >= 40
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-400'
                          : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-400'
                      }`}
                    >
                      {formatPercent(style.margin)}
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
      </div>
    </div>
  );
}
