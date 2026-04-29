'use client';

import { useState, useMemo } from 'react';
import { Product, SalesRecord, CostRecord, PricingRecord, normalizeCategory } from '@/types/product';
import { sortSeasons } from '@/lib/store';
import { buildCSV } from '@/utils/exportData';
import { getSeasonStatus } from '@/lib/season-utils';
import { formatCurrency, formatCurrencyShort, formatNumber } from '@/utils/format';
import { buildCostFallbackLookup } from '@/utils/costFallback';
import {
  AlertTriangle,
  Trash2,
  Package,
  ChevronDown,
  ChevronUp,
  Download,
  CheckCircle,
  XCircle,
  DollarSign,
} from 'lucide-react';

interface ValidationViewProps {
  products: Product[];
  sales: SalesRecord[];
  costs?: CostRecord[];
  pricing?: PricingRecord[];
  searchQuery?: string;
  onStyleClick: (styleNumber: string) => void;
}

interface MissingLandedCost {
  styleNumber: string;
  styleDesc: string;
  season: string;
  whRevenue: number;
  units: number;
  wholesale: number;
  hasPricing: boolean;
  hasSales: boolean;
}

interface MissingFromLineList {
  styleNumber: string;
  styleDesc: string;
  whRevenue: number;
  totalUnits: number;
  lastSeason: string;
  seasons: string[];
}

interface NoSalesHistory {
  styleNumber: string;
  styleDesc: string;
  category: string;
  division: string;
  lastLineListSeason: string;
}

// A season should have sales data if it's closed or currently shipping
function shouldHaveSalesData(season: string): boolean {
  const status = getSeasonStatus(season);
  return status === 'CLOSED' || status === 'SHIPPING';
}


export default function ValidationView({
  products,
  sales,
  costs = [],
  pricing = [],
  searchQuery: globalSearchQuery,
  onStyleClick,
}: ValidationViewProps) {
  const [expandMissing, setExpandMissing] = useState(true);
  const [expandNoSales, setExpandNoSales] = useState(true);
  const [expandMissingCost, setExpandMissingCost] = useState(true);

  // Get all unique seasons
  const allSeasons = useMemo(() => {
    const seasons = new Set<string>();
    products.forEach(p => p.season && seasons.add(p.season));
    sales.forEach(s => s.season && seasons.add(s.season));
    return sortSeasons(Array.from(seasons));
  }, [products, sales]);

  // Get historical seasons (before 27SP)
  const seasonsWithExpectedSales = useMemo(() => {
    return allSeasons.filter(shouldHaveSalesData);
  }, [allSeasons]);

  // RULE 1: Find styles with wholesale sales but missing from Line List
  const missingFromLineList = useMemo(() => {
    // Build set of all style numbers in Line List
    const lineListStyles = new Set<string>();
    products.forEach(p => lineListStyles.add(p.styleNumber));

    // Find all wholesale sales grouped by style
    const wholesaleSalesByStyle = new Map<string, {
      styleDesc: string;
      whRevenue: number;
      totalUnits: number;
      seasons: Set<string>;
    }>();

    sales.forEach(s => {
      // Only consider wholesale (WH) sales
      if (s.customerType !== 'WH') return;
      if (!s.styleNumber) return;

      if (!wholesaleSalesByStyle.has(s.styleNumber)) {
        wholesaleSalesByStyle.set(s.styleNumber, {
          styleDesc: s.styleDesc || '',
          whRevenue: 0,
          totalUnits: 0,
          seasons: new Set(),
        });
      }

      const entry = wholesaleSalesByStyle.get(s.styleNumber)!;
      entry.whRevenue += s.revenue || 0;
      entry.totalUnits += s.unitsBooked || 0;
      if (s.season) entry.seasons.add(s.season);
      if (s.styleDesc && !entry.styleDesc) entry.styleDesc = s.styleDesc;
    });

    // Find styles with WH sales that are NOT in Line List
    const missing: MissingFromLineList[] = [];
    wholesaleSalesByStyle.forEach((data, styleNumber) => {
      if (!lineListStyles.has(styleNumber)) {
        const seasonsList = sortSeasons(Array.from(data.seasons));
        missing.push({
          styleNumber,
          styleDesc: data.styleDesc,
          whRevenue: data.whRevenue,
          totalUnits: data.totalUnits,
          lastSeason: seasonsList[seasonsList.length - 1] || '',
          seasons: seasonsList,
        });
      }
    });

    // Sort by revenue descending
    const sorted = missing.sort((a, b) => b.whRevenue - a.whRevenue);
    if (globalSearchQuery) {
      const q = globalSearchQuery.toLowerCase();
      return sorted.filter(m => m.styleNumber.toLowerCase().includes(q) || m.styleDesc.toLowerCase().includes(q));
    }
    return sorted;
  }, [products, sales, globalSearchQuery]);

  // RULE 2: Find historical Line List styles with no sales
  const noSalesHistory = useMemo(() => {
    // Build set of all style numbers with ANY sales
    const stylesWithSales = new Set<string>();
    sales.forEach(s => {
      if (s.styleNumber && (s.revenue > 0 || s.unitsBooked > 0)) {
        stylesWithSales.add(s.styleNumber);
      }
    });

    // Find Line List styles from historical seasons with no sales
    const noSales: NoSalesHistory[] = [];
    const processedStyles = new Set<string>();

    // Group products by style number to find latest season
    const styleInfo = new Map<string, {
      styleDesc: string;
      category: string;
      division: string;
      latestSeason: string;
      seasons: string[];
    }>();

    products.forEach(p => {
      if (!p.styleNumber) return;
      // Only consider historical seasons
      if (!shouldHaveSalesData(p.season)) return;

      if (!styleInfo.has(p.styleNumber)) {
        styleInfo.set(p.styleNumber, {
          styleDesc: p.styleDesc || '',
          category: normalizeCategory(p.categoryDesc) || '',
          division: p.divisionDesc || '',
          latestSeason: p.season,
          seasons: [p.season],
        });
      } else {
        const info = styleInfo.get(p.styleNumber)!;
        if (!info.seasons.includes(p.season)) {
          info.seasons.push(p.season);
        }
        // Update latest season if newer
        const sorted = sortSeasons([info.latestSeason, p.season]);
        info.latestSeason = sorted[sorted.length - 1];
      }
    });

    // Check which have no sales
    styleInfo.forEach((info, styleNumber) => {
      if (!stylesWithSales.has(styleNumber) && !processedStyles.has(styleNumber)) {
        processedStyles.add(styleNumber);
        noSales.push({
          styleNumber,
          styleDesc: info.styleDesc,
          category: info.category,
          division: info.division,
          lastLineListSeason: info.latestSeason,
        });
      }
    });

    // Sort by season (oldest first), then style number
    const sorted = noSales.sort((a, b) => {
      const seasonCompare = sortSeasons([a.lastLineListSeason, b.lastLineListSeason]);
      if (seasonCompare[0] !== seasonCompare[1]) {
        return a.lastLineListSeason === seasonCompare[0] ? -1 : 1;
      }
      return a.styleNumber.localeCompare(b.styleNumber);
    });
    if (globalSearchQuery) {
      const q = globalSearchQuery.toLowerCase();
      return sorted.filter(n => n.styleNumber.toLowerCase().includes(q) || n.styleDesc.toLowerCase().includes(q));
    }
    return sorted;
  }, [products, sales, globalSearchQuery]);

  // RULE 3: Find style+season combos missing landed cost (and no prior-season fallback)
  const missingLandedCost = useMemo(() => {
    // Build map of style+season -> landed cost (from costs file first, then products)
    const costMap = new Map<string, number>();
    costs.forEach(c => {
      if (!c.styleNumber || !c.season) return;
      const key = `${c.styleNumber}-${c.season}`;
      if (c.landed && c.landed > 0 && !costMap.has(key)) {
        costMap.set(key, c.landed);
      }
    });
    products.forEach(p => {
      if (!p.styleNumber || !p.season) return;
      const key = `${p.styleNumber}-${p.season}`;
      if (p.cost && p.cost > 0 && !costMap.has(key)) {
        costMap.set(key, p.cost);
      }
    });

    // Build a fallback lookup so we can treat prior-season costs as "covered"
    const fallbackLookup = buildCostFallbackLookup(
      costs,
      products.filter(p => p.season && p.cost > 0).map(p => ({
        styleNumber: p.styleNumber,
        season: p.season,
        cost: p.cost,
      })),
    );
    const hasCostOrFallback = (styleNumber: string, season: string): boolean => {
      const key = `${styleNumber}-${season}`;
      if (costMap.has(key)) return true;
      const result = fallbackLookup.getCostWithFallback(styleNumber, season);
      return result.source !== 'missing' && result.cost > 0;
    };

    // Build map of pricing by style+season
    const pricingMap = new Map<string, number>();
    pricing.forEach(p => {
      if (!p.styleNumber || !p.season) return;
      const key = `${p.styleNumber}-${p.season}`;
      if (p.price && p.price > 0 && !pricingMap.has(key)) {
        pricingMap.set(key, p.price);
      }
    });

    // Aggregate sales by style+season
    const salesMap = new Map<string, { revenue: number; units: number; styleDesc: string }>();
    sales.forEach(s => {
      if (!s.styleNumber || !s.season) return;
      const key = `${s.styleNumber}-${s.season}`;
      const existing = salesMap.get(key);
      if (existing) {
        existing.revenue += s.revenue || 0;
        existing.units += s.unitsBooked || 0;
      } else {
        salesMap.set(key, {
          revenue: s.revenue || 0,
          units: s.unitsBooked || 0,
          styleDesc: s.styleDesc || '',
        });
      }
    });

    // Collect all style+season combos that have sales or pricing but no cost
    const missing: MissingLandedCost[] = [];
    const seenKeys = new Set<string>();

    // Check styles with sales but no cost (and no prior-season fallback)
    salesMap.forEach((data, key) => {
      const [styleNumber, season] = key.split('-');
      if (hasCostOrFallback(styleNumber, season)) return;
      if (seenKeys.has(key)) return;
      seenKeys.add(key);
      missing.push({
        styleNumber,
        styleDesc: data.styleDesc,
        season,
        whRevenue: data.revenue,
        units: data.units,
        wholesale: pricingMap.get(key) || 0,
        hasPricing: pricingMap.has(key),
        hasSales: true,
      });
    });

    // Check styles with pricing but no cost (and not already found via sales)
    pricingMap.forEach((wholesale, key) => {
      const [styleNumber, season] = key.split('-');
      if (hasCostOrFallback(styleNumber, season)) return;
      if (seenKeys.has(key)) return;
      seenKeys.add(key);
      // Find description from products
      const product = products.find(p => p.styleNumber === styleNumber);
      missing.push({
        styleNumber,
        styleDesc: product?.styleDesc || '',
        season,
        whRevenue: 0,
        units: 0,
        wholesale,
        hasPricing: true,
        hasSales: false,
      });
    });

    // Sort: highest revenue first, then by season (newest first), then style number
    const sorted = missing.sort((a, b) => {
      if (b.whRevenue !== a.whRevenue) return b.whRevenue - a.whRevenue;
      const seasonOrder = sortSeasons([a.season, b.season]);
      if (seasonOrder[0] !== seasonOrder[1]) {
        return a.season === seasonOrder[0] ? 1 : -1;
      }
      return a.styleNumber.localeCompare(b.styleNumber);
    });

    if (globalSearchQuery) {
      const q = globalSearchQuery.toLowerCase();
      return sorted.filter(m =>
        m.styleNumber.toLowerCase().includes(q) ||
        m.styleDesc.toLowerCase().includes(q) ||
        m.season.toLowerCase().includes(q)
      );
    }
    return sorted;
  }, [costs, pricing, sales, products, globalSearchQuery]);

  // Summary stats
  const stats = useMemo(() => {
    const totalLineListStyles = new Set(products.map(p => p.styleNumber)).size;
    const totalSalesStyles = new Set(sales.map(s => s.styleNumber)).size;
    const missingCount = missingFromLineList.length;
    const noSalesCount = noSalesHistory.length;
    const missingCostCount = missingLandedCost.length;
    const totalMissingRevenue = missingFromLineList.reduce((sum, m) => sum + m.whRevenue, 0);
    const missingCostRevenue = missingLandedCost.reduce((sum, m) => sum + m.whRevenue, 0);

    return {
      totalLineListStyles,
      totalSalesStyles,
      missingCount,
      noSalesCount,
      missingCostCount,
      totalMissingRevenue,
      missingCostRevenue,
      healthScore: Math.max(0, 100 - (missingCount * 5) - (noSalesCount * 0.5) - (missingCostCount * 0.3)),
    };
  }, [products, sales, missingFromLineList, noSalesHistory, missingLandedCost]);

  // Export functions
  const exportMissingCSV = () => {
    const headers = ['Style #', 'Style Name', 'WH Revenue', 'Units', 'Last Season', 'All Seasons'];
    const rows = missingFromLineList.map(m => [
      m.styleNumber,
      m.styleDesc,
      m.whRevenue.toFixed(2),
      m.totalUnits,
      m.lastSeason,
      m.seasons.join(', '),
    ]);
    const csv = buildCSV(headers, rows);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'missing-from-linelist.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportMissingCostCSV = () => {
    const headers = ['Style #', 'Style Name', 'Season', 'WH Revenue', 'Units', 'Wholesale', 'Has Pricing', 'Has Sales'];
    const rows = missingLandedCost.map(m => [
      m.styleNumber,
      m.styleDesc,
      m.season,
      m.whRevenue.toFixed(2),
      m.units,
      m.wholesale.toFixed(2),
      m.hasPricing ? 'Yes' : 'No',
      m.hasSales ? 'Yes' : 'No',
    ]);
    const csv = buildCSV(headers, rows);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'missing-landed-cost.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportNoSalesCSV = () => {
    const headers = ['Style #', 'Style Name', 'Category', 'Division', 'Last in Line List'];
    const rows = noSalesHistory.map(n => [
      n.styleNumber,
      n.styleDesc,
      n.category,
      n.division,
      n.lastLineListSeason,
    ]);
    const csv = buildCSV(headers, rows);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'no-sales-history.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-4xl font-display font-bold text-text-primary">Line List Validation</h2>
        <p className="text-base text-text-muted mt-2">
          Data quality checks for Line List accuracy
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-surface rounded-xl border-2 border-border-primary p-5">
          <div className="flex items-start justify-between mb-3">
            <span className="text-sm font-bold text-text-secondary uppercase tracking-wide">Health Score</span>
            {stats.healthScore >= 80 ? (
              <CheckCircle className="w-6 h-6 text-green-500" />
            ) : stats.healthScore >= 50 ? (
              <AlertTriangle className="w-6 h-6 text-amber-500" />
            ) : (
              <XCircle className="w-6 h-6 text-red-500" />
            )}
          </div>
          <div className={`text-4xl font-display font-bold ${
            stats.healthScore >= 80 ? 'text-green-600 dark:text-green-400' :
            stats.healthScore >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'
          }`}>
            {stats.healthScore.toFixed(0)}%
          </div>
        </div>

        <div className="bg-surface rounded-xl border-2 border-border-primary p-5">
          <div className="flex items-start justify-between mb-3">
            <span className="text-sm font-bold text-text-secondary uppercase tracking-wide">Line List Styles</span>
            <Package className="w-6 h-6 text-cyan-600" />
          </div>
          <div className="text-4xl font-display font-bold text-text-primary">
            {formatNumber(stats.totalLineListStyles)}
          </div>
        </div>

        <div className="bg-amber-50 dark:bg-amber-950 rounded-xl border-2 border-amber-200 dark:border-amber-700 p-5">
          <div className="flex items-start justify-between mb-3">
            <span className="text-sm font-bold text-amber-700 dark:text-amber-300 uppercase tracking-wide">Missing</span>
            <AlertTriangle className="w-6 h-6 text-amber-600" />
          </div>
          <div className="text-4xl font-display font-bold text-amber-700 dark:text-amber-300">
            {stats.missingCount}
          </div>
          <div className="text-sm text-amber-600 dark:text-amber-400 mt-1">
            {formatCurrencyShort(stats.totalMissingRevenue)} WH revenue
          </div>
        </div>

        <div className="bg-surface-secondary rounded-xl border-2 border-border-primary p-5">
          <div className="flex items-start justify-between mb-3">
            <span className="text-sm font-bold text-text-secondary uppercase tracking-wide">No Sales</span>
            <Trash2 className="w-6 h-6 text-text-muted" />
          </div>
          <div className="text-4xl font-display font-bold text-text-secondary">
            {stats.noSalesCount}
          </div>
          <div className="text-sm text-text-muted mt-1">
            Historical styles
          </div>
        </div>

        <div className="bg-red-50 dark:bg-red-950 rounded-xl border-2 border-red-200 dark:border-red-700 p-5">
          <div className="flex items-start justify-between mb-3">
            <span className="text-sm font-bold text-red-700 dark:text-red-300 uppercase tracking-wide">No Cost</span>
            <DollarSign className="w-6 h-6 text-red-600" />
          </div>
          <div className="text-4xl font-display font-bold text-red-700 dark:text-red-300">
            {stats.missingCostCount}
          </div>
          <div className="text-sm text-red-600 dark:text-red-400 mt-1">
            {formatCurrencyShort(stats.missingCostRevenue)} WH revenue
          </div>
        </div>
      </div>

      {/* Rule 1: Missing from Line List */}
      <div className="bg-surface rounded-xl border-2 border-amber-200 dark:border-amber-700 overflow-hidden">
        <button
          onClick={() => setExpandMissing(!expandMissing)}
          className="w-full bg-amber-50 dark:bg-amber-950 px-6 py-4 border-b-2 border-amber-200 dark:border-amber-700 flex items-center justify-between hover:bg-amber-100 dark:hover:bg-amber-900 transition-colors"
        >
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-amber-600" />
            <div className="text-left">
              <h3 className="text-xl font-bold text-amber-800 dark:text-amber-200">
                Missing from Line List
              </h3>
              <p className="text-sm text-amber-600 dark:text-amber-400">
                {missingFromLineList.length} styles have Wholesale sales but are not in Line List
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {missingFromLineList.length > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); exportMissingCSV(); }}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-800 rounded-lg transition-colors"
              >
                <Download className="w-4 h-4" />
                Export
              </button>
            )}
            {expandMissing ? <ChevronUp className="w-5 h-5 text-amber-600" /> : <ChevronDown className="w-5 h-5 text-amber-600" />}
          </div>
        </button>

        {expandMissing && (
          <div className="p-6">
            {missingFromLineList.length === 0 ? (
              <div className="text-center py-8 text-green-600 dark:text-green-400">
                <CheckCircle className="w-12 h-12 mx-auto mb-3" />
                <p className="text-lg font-semibold">All wholesale styles are in Line List</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-surface-tertiary border-b-2 border-border-strong">
                      <th className="px-4 py-3 text-left text-sm font-bold text-text-secondary uppercase tracking-wide">Style #</th>
                      <th className="px-4 py-3 text-left text-sm font-bold text-text-secondary uppercase tracking-wide">Style Name</th>
                      <th className="px-4 py-3 text-right text-sm font-bold text-text-secondary uppercase tracking-wide">WH Revenue</th>
                      <th className="px-4 py-3 text-right text-sm font-bold text-text-secondary uppercase tracking-wide">Units</th>
                      <th className="px-4 py-3 text-left text-sm font-bold text-text-secondary uppercase tracking-wide">Last Season</th>
                      <th className="px-4 py-3 text-left text-sm font-bold text-text-secondary uppercase tracking-wide">Seasons</th>
                    </tr>
                  </thead>
                  <tbody>
                    {missingFromLineList.slice(0, 50).map((item, index) => (
                      <tr
                        key={item.styleNumber}
                        onClick={() => onStyleClick(item.styleNumber)}
                        className={`border-b border-border-primary cursor-pointer transition-colors ${
                          index % 2 === 0 ? 'bg-surface' : 'bg-surface-secondary'
                        } hover:bg-amber-50 dark:hover:bg-amber-950`}
                      >
                        <td className="px-4 py-3">
                          <span className="font-mono text-lg font-bold text-text-primary">{item.styleNumber}</span>
                        </td>
                        <td className="px-4 py-3 text-base text-text-secondary truncate max-w-[200px]">{item.styleDesc}</td>
                        <td className="px-4 py-3 text-right font-mono text-base font-bold text-amber-700 dark:text-amber-300">
                          {formatCurrencyShort(item.whRevenue)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-base text-text-secondary">
                          {formatNumber(item.totalUnits)}
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-1 bg-surface-tertiary text-text-secondary text-sm font-mono font-bold rounded">
                            {item.lastSeason}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-text-muted">
                          {item.seasons.join(', ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {missingFromLineList.length > 50 && (
                  <div className="text-center py-4 text-text-muted">
                    Showing 50 of {missingFromLineList.length} styles. Export CSV for full list.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Rule 2: No Sales History */}
      <div className="bg-surface rounded-xl border-2 border-border-primary overflow-hidden">
        <button
          onClick={() => setExpandNoSales(!expandNoSales)}
          className="w-full bg-surface-secondary px-6 py-4 border-b-2 border-border-primary flex items-center justify-between hover:bg-surface-tertiary transition-colors"
        >
          <div className="flex items-center gap-3">
            <Trash2 className="w-6 h-6 text-text-muted" />
            <div className="text-left">
              <h3 className="text-xl font-bold text-text-primary">
                No Sales History
              </h3>
              <p className="text-sm text-text-muted">
                {noSalesHistory.length} historical styles (pre-27SP) have no sales data - consider removing
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {noSalesHistory.length > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); exportNoSalesCSV(); }}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold text-text-secondary hover:bg-surface-tertiary rounded-lg transition-colors"
              >
                <Download className="w-4 h-4" />
                Export
              </button>
            )}
            {expandNoSales ? <ChevronUp className="w-5 h-5 text-text-muted" /> : <ChevronDown className="w-5 h-5 text-text-muted" />}
          </div>
        </button>

        {expandNoSales && (
          <div className="p-6">
            {noSalesHistory.length === 0 ? (
              <div className="text-center py-8 text-green-600 dark:text-green-400">
                <CheckCircle className="w-12 h-12 mx-auto mb-3" />
                <p className="text-lg font-semibold">All historical styles have sales data</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-surface-tertiary border-b-2 border-border-strong">
                      <th className="px-4 py-3 text-left text-sm font-bold text-text-secondary uppercase tracking-wide">Style #</th>
                      <th className="px-4 py-3 text-left text-sm font-bold text-text-secondary uppercase tracking-wide">Style Name</th>
                      <th className="px-4 py-3 text-left text-sm font-bold text-text-secondary uppercase tracking-wide">Category</th>
                      <th className="px-4 py-3 text-left text-sm font-bold text-text-secondary uppercase tracking-wide">Division</th>
                      <th className="px-4 py-3 text-left text-sm font-bold text-text-secondary uppercase tracking-wide">Last in Line List</th>
                    </tr>
                  </thead>
                  <tbody>
                    {noSalesHistory.slice(0, 50).map((item, index) => (
                      <tr
                        key={item.styleNumber}
                        onClick={() => onStyleClick(item.styleNumber)}
                        className={`border-b border-border-primary cursor-pointer transition-colors ${
                          index % 2 === 0 ? 'bg-surface' : 'bg-surface-secondary'
                        } hover:bg-surface-tertiary`}
                      >
                        <td className="px-4 py-3">
                          <span className="font-mono text-lg font-bold text-text-primary">{item.styleNumber}</span>
                        </td>
                        <td className="px-4 py-3 text-base text-text-secondary truncate max-w-[200px]">{item.styleDesc}</td>
                        <td className="px-4 py-3 text-base text-text-secondary">{item.category}</td>
                        <td className="px-4 py-3 text-base text-text-secondary">{item.division}</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-1 bg-surface-tertiary text-text-secondary text-sm font-mono font-bold rounded">
                            {item.lastLineListSeason}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {noSalesHistory.length > 50 && (
                  <div className="text-center py-4 text-text-muted">
                    Showing 50 of {noSalesHistory.length} styles. Export CSV for full list.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Rule 3: Missing Landed Cost */}
      <div className="bg-surface rounded-xl border-2 border-red-200 dark:border-red-700 overflow-hidden">
        <button
          onClick={() => setExpandMissingCost(!expandMissingCost)}
          className="w-full bg-red-50 dark:bg-red-950 px-6 py-4 border-b-2 border-red-200 dark:border-red-700 flex items-center justify-between hover:bg-red-100 dark:hover:bg-red-900 transition-colors"
        >
          <div className="flex items-center gap-3">
            <DollarSign className="w-6 h-6 text-red-600" />
            <div className="text-left">
              <h3 className="text-xl font-bold text-red-800 dark:text-red-200">
                Missing Landed Cost
              </h3>
              <p className="text-sm text-red-600 dark:text-red-400">
                {missingLandedCost.length} style+season combos have sales/pricing but no landed cost — margins cannot be calculated
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {missingLandedCost.length > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); exportMissingCostCSV(); }}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-800 rounded-lg transition-colors"
              >
                <Download className="w-4 h-4" />
                Export
              </button>
            )}
            {expandMissingCost ? <ChevronUp className="w-5 h-5 text-red-600" /> : <ChevronDown className="w-5 h-5 text-red-600" />}
          </div>
        </button>

        {expandMissingCost && (
          <div className="p-6">
            {missingLandedCost.length === 0 ? (
              <div className="text-center py-8 text-green-600 dark:text-green-400">
                <CheckCircle className="w-12 h-12 mx-auto mb-3" />
                <p className="text-lg font-semibold">All styles with sales/pricing have landed cost data</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-surface-tertiary border-b-2 border-border-strong">
                      <th className="px-4 py-3 text-left text-sm font-bold text-text-secondary uppercase tracking-wide">Style #</th>
                      <th className="px-4 py-3 text-left text-sm font-bold text-text-secondary uppercase tracking-wide">Style Name</th>
                      <th className="px-4 py-3 text-left text-sm font-bold text-text-secondary uppercase tracking-wide">Season</th>
                      <th className="px-4 py-3 text-right text-sm font-bold text-text-secondary uppercase tracking-wide">Revenue</th>
                      <th className="px-4 py-3 text-right text-sm font-bold text-text-secondary uppercase tracking-wide">Units</th>
                      <th className="px-4 py-3 text-right text-sm font-bold text-text-secondary uppercase tracking-wide">Wholesale</th>
                      <th className="px-4 py-3 text-left text-sm font-bold text-text-secondary uppercase tracking-wide">Data Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {missingLandedCost.slice(0, 50).map((item, index) => (
                      <tr
                        key={`${item.styleNumber}-${item.season}`}
                        onClick={() => onStyleClick(item.styleNumber)}
                        className={`border-b border-border-primary cursor-pointer transition-colors ${
                          index % 2 === 0 ? 'bg-surface' : 'bg-surface-secondary'
                        } hover:bg-red-50 dark:hover:bg-red-950`}
                      >
                        <td className="px-4 py-3">
                          <span className="font-mono text-lg font-bold text-text-primary">{item.styleNumber}</span>
                        </td>
                        <td className="px-4 py-3 text-base text-text-secondary truncate max-w-[200px]">{item.styleDesc}</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-1 bg-surface-tertiary text-text-secondary text-sm font-mono font-bold rounded">
                            {item.season}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-base font-bold text-red-700 dark:text-red-300">
                          {item.whRevenue > 0 ? formatCurrencyShort(item.whRevenue) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-base text-text-secondary">
                          {item.units > 0 ? formatNumber(item.units) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-base text-text-secondary">
                          {item.wholesale > 0 ? formatCurrency(item.wholesale) : '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-text-muted">
                          {[item.hasSales && 'Sales', item.hasPricing && 'Pricing'].filter(Boolean).join(' + ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {missingLandedCost.length > 50 && (
                  <div className="text-center py-4 text-text-muted">
                    Showing 50 of {missingLandedCost.length} style+season combos. Export CSV for full list.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 dark:bg-blue-950/50 rounded-xl border-2 border-blue-200 dark:border-blue-800 p-5">
        <h4 className="font-bold text-blue-800 dark:text-blue-300 mb-2">Validation Rules</h4>
        <ul className="text-sm text-blue-700 dark:text-blue-400 space-y-1">
          <li><strong>Rule 1:</strong> Styles with Wholesale (WH) sales MUST be in the Line List.</li>
          <li><strong>Rule 2:</strong> Historical styles (before 27SP) with no sales may be discontinued.</li>
          <li><strong>Rule 3:</strong> Styles with sales or pricing MUST have landed cost data for margin calculation.</li>
          <li><strong>Note:</strong> 27SP and 27FA are future seasons and excluded from validation.</li>
        </ul>
      </div>
    </div>
  );
}
