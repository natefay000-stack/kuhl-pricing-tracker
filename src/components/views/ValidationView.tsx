'use client';

import { useState, useMemo } from 'react';
import { Product, SalesRecord, normalizeCategory } from '@/types/product';
import { sortSeasons } from '@/lib/store';
import {
  AlertTriangle,
  Trash2,
  Package,
  ChevronDown,
  ChevronUp,
  Download,
  CheckCircle,
  XCircle,
} from 'lucide-react';

interface ValidationViewProps {
  products: Product[];
  sales: SalesRecord[];
  onStyleClick: (styleNumber: string) => void;
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

// Seasons that are "future" and should be excluded from validation
const FUTURE_SEASONS = ['27SP', '27FA', '28SP', '28FA'];

function isHistoricalSeason(season: string): boolean {
  return !FUTURE_SEASONS.includes(season);
}

function formatCurrency(value: number): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

function formatNumber(value: number): string {
  return value.toLocaleString();
}

export default function ValidationView({
  products,
  sales,
  onStyleClick,
}: ValidationViewProps) {
  const [expandMissing, setExpandMissing] = useState(true);
  const [expandNoSales, setExpandNoSales] = useState(true);

  // Get all unique seasons
  const allSeasons = useMemo(() => {
    const seasons = new Set<string>();
    products.forEach(p => p.season && seasons.add(p.season));
    sales.forEach(s => s.season && seasons.add(s.season));
    return sortSeasons(Array.from(seasons));
  }, [products, sales]);

  // Get historical seasons (before 27SP)
  const historicalSeasons = useMemo(() => {
    return allSeasons.filter(isHistoricalSeason);
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
    return missing.sort((a, b) => b.whRevenue - a.whRevenue);
  }, [products, sales]);

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
      if (!isHistoricalSeason(p.season)) return;

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
    return noSales.sort((a, b) => {
      const seasonCompare = sortSeasons([a.lastLineListSeason, b.lastLineListSeason]);
      if (seasonCompare[0] !== seasonCompare[1]) {
        return a.lastLineListSeason === seasonCompare[0] ? -1 : 1;
      }
      return a.styleNumber.localeCompare(b.styleNumber);
    });
  }, [products, sales]);

  // Summary stats
  const stats = useMemo(() => {
    const totalLineListStyles = new Set(products.map(p => p.styleNumber)).size;
    const totalSalesStyles = new Set(sales.map(s => s.styleNumber)).size;
    const missingCount = missingFromLineList.length;
    const noSalesCount = noSalesHistory.length;
    const totalMissingRevenue = missingFromLineList.reduce((sum, m) => sum + m.whRevenue, 0);

    return {
      totalLineListStyles,
      totalSalesStyles,
      missingCount,
      noSalesCount,
      totalMissingRevenue,
      healthScore: Math.max(0, 100 - (missingCount * 5) - (noSalesCount * 0.5)),
    };
  }, [products, sales, missingFromLineList, noSalesHistory]);

  // Export functions
  const exportMissingCSV = () => {
    const headers = ['Style #', 'Style Name', 'WH Revenue', 'Units', 'Last Season', 'All Seasons'];
    const rows = missingFromLineList.map(m => [
      m.styleNumber,
      `"${m.styleDesc}"`,
      m.whRevenue.toFixed(2),
      m.totalUnits,
      m.lastSeason,
      `"${m.seasons.join(', ')}"`,
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'missing-from-linelist.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportNoSalesCSV = () => {
    const headers = ['Style #', 'Style Name', 'Category', 'Division', 'Last in Line List'];
    const rows = noSalesHistory.map(n => [
      n.styleNumber,
      `"${n.styleDesc}"`,
      n.category,
      n.division,
      n.lastLineListSeason,
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
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
        <h2 className="text-4xl font-display font-bold text-gray-900">Line List Validation</h2>
        <p className="text-base text-gray-500 mt-2">
          Data quality checks for Line List accuracy
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border-2 border-gray-200 p-5">
          <div className="flex items-start justify-between mb-3">
            <span className="text-sm font-bold text-gray-600 uppercase tracking-wide">Health Score</span>
            {stats.healthScore >= 80 ? (
              <CheckCircle className="w-6 h-6 text-green-500" />
            ) : stats.healthScore >= 50 ? (
              <AlertTriangle className="w-6 h-6 text-amber-500" />
            ) : (
              <XCircle className="w-6 h-6 text-red-500" />
            )}
          </div>
          <div className={`text-4xl font-display font-bold ${
            stats.healthScore >= 80 ? 'text-green-600' :
            stats.healthScore >= 50 ? 'text-amber-600' : 'text-red-600'
          }`}>
            {stats.healthScore.toFixed(0)}%
          </div>
        </div>

        <div className="bg-white rounded-xl border-2 border-gray-200 p-5">
          <div className="flex items-start justify-between mb-3">
            <span className="text-sm font-bold text-gray-600 uppercase tracking-wide">Line List Styles</span>
            <Package className="w-6 h-6 text-cyan-600" />
          </div>
          <div className="text-4xl font-display font-bold text-gray-900">
            {formatNumber(stats.totalLineListStyles)}
          </div>
        </div>

        <div className="bg-amber-50 rounded-xl border-2 border-amber-200 p-5">
          <div className="flex items-start justify-between mb-3">
            <span className="text-sm font-bold text-amber-700 uppercase tracking-wide">Missing</span>
            <AlertTriangle className="w-6 h-6 text-amber-600" />
          </div>
          <div className="text-4xl font-display font-bold text-amber-700">
            {stats.missingCount}
          </div>
          <div className="text-sm text-amber-600 mt-1">
            {formatCurrency(stats.totalMissingRevenue)} WH revenue
          </div>
        </div>

        <div className="bg-gray-50 rounded-xl border-2 border-gray-200 p-5">
          <div className="flex items-start justify-between mb-3">
            <span className="text-sm font-bold text-gray-600 uppercase tracking-wide">No Sales</span>
            <Trash2 className="w-6 h-6 text-gray-500" />
          </div>
          <div className="text-4xl font-display font-bold text-gray-700">
            {stats.noSalesCount}
          </div>
          <div className="text-sm text-gray-500 mt-1">
            Historical styles
          </div>
        </div>
      </div>

      {/* Rule 1: Missing from Line List */}
      <div className="bg-white rounded-xl border-2 border-amber-200 overflow-hidden">
        <button
          onClick={() => setExpandMissing(!expandMissing)}
          className="w-full bg-amber-50 px-6 py-4 border-b-2 border-amber-200 flex items-center justify-between hover:bg-amber-100 transition-colors"
        >
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-amber-600" />
            <div className="text-left">
              <h3 className="text-xl font-bold text-amber-800">
                Missing from Line List
              </h3>
              <p className="text-sm text-amber-600">
                {missingFromLineList.length} styles have Wholesale sales but are not in Line List
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {missingFromLineList.length > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); exportMissingCSV(); }}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold text-amber-700 hover:bg-amber-200 rounded-lg transition-colors"
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
              <div className="text-center py-8 text-green-600">
                <CheckCircle className="w-12 h-12 mx-auto mb-3" />
                <p className="text-lg font-semibold">All wholesale styles are in Line List</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-100 border-b-2 border-gray-300">
                      <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 uppercase tracking-wide">Style #</th>
                      <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 uppercase tracking-wide">Style Name</th>
                      <th className="px-4 py-3 text-right text-sm font-bold text-gray-700 uppercase tracking-wide">WH Revenue</th>
                      <th className="px-4 py-3 text-right text-sm font-bold text-gray-700 uppercase tracking-wide">Units</th>
                      <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 uppercase tracking-wide">Last Season</th>
                      <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 uppercase tracking-wide">Seasons</th>
                    </tr>
                  </thead>
                  <tbody>
                    {missingFromLineList.slice(0, 50).map((item, index) => (
                      <tr
                        key={item.styleNumber}
                        onClick={() => onStyleClick(item.styleNumber)}
                        className={`border-b border-gray-200 cursor-pointer transition-colors ${
                          index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                        } hover:bg-amber-50`}
                      >
                        <td className="px-4 py-3">
                          <span className="font-mono text-lg font-bold text-gray-900">{item.styleNumber}</span>
                        </td>
                        <td className="px-4 py-3 text-base text-gray-700 truncate max-w-[200px]">{item.styleDesc}</td>
                        <td className="px-4 py-3 text-right font-mono text-base font-bold text-amber-700">
                          {formatCurrency(item.whRevenue)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-base text-gray-700">
                          {formatNumber(item.totalUnits)}
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-1 bg-gray-100 text-gray-700 text-sm font-mono font-bold rounded">
                            {item.lastSeason}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {item.seasons.join(', ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {missingFromLineList.length > 50 && (
                  <div className="text-center py-4 text-gray-500">
                    Showing 50 of {missingFromLineList.length} styles. Export CSV for full list.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Rule 2: No Sales History */}
      <div className="bg-white rounded-xl border-2 border-gray-200 overflow-hidden">
        <button
          onClick={() => setExpandNoSales(!expandNoSales)}
          className="w-full bg-gray-50 px-6 py-4 border-b-2 border-gray-200 flex items-center justify-between hover:bg-gray-100 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Trash2 className="w-6 h-6 text-gray-500" />
            <div className="text-left">
              <h3 className="text-xl font-bold text-gray-800">
                No Sales History
              </h3>
              <p className="text-sm text-gray-500">
                {noSalesHistory.length} historical styles (pre-27SP) have no sales data - consider removing
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {noSalesHistory.length > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); exportNoSalesCSV(); }}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
              >
                <Download className="w-4 h-4" />
                Export
              </button>
            )}
            {expandNoSales ? <ChevronUp className="w-5 h-5 text-gray-500" /> : <ChevronDown className="w-5 h-5 text-gray-500" />}
          </div>
        </button>

        {expandNoSales && (
          <div className="p-6">
            {noSalesHistory.length === 0 ? (
              <div className="text-center py-8 text-green-600">
                <CheckCircle className="w-12 h-12 mx-auto mb-3" />
                <p className="text-lg font-semibold">All historical styles have sales data</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-100 border-b-2 border-gray-300">
                      <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 uppercase tracking-wide">Style #</th>
                      <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 uppercase tracking-wide">Style Name</th>
                      <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 uppercase tracking-wide">Category</th>
                      <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 uppercase tracking-wide">Division</th>
                      <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 uppercase tracking-wide">Last in Line List</th>
                    </tr>
                  </thead>
                  <tbody>
                    {noSalesHistory.slice(0, 50).map((item, index) => (
                      <tr
                        key={item.styleNumber}
                        onClick={() => onStyleClick(item.styleNumber)}
                        className={`border-b border-gray-200 cursor-pointer transition-colors ${
                          index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                        } hover:bg-gray-100`}
                      >
                        <td className="px-4 py-3">
                          <span className="font-mono text-lg font-bold text-gray-900">{item.styleNumber}</span>
                        </td>
                        <td className="px-4 py-3 text-base text-gray-700 truncate max-w-[200px]">{item.styleDesc}</td>
                        <td className="px-4 py-3 text-base text-gray-600">{item.category}</td>
                        <td className="px-4 py-3 text-base text-gray-600">{item.division}</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-1 bg-gray-100 text-gray-700 text-sm font-mono font-bold rounded">
                            {item.lastLineListSeason}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {noSalesHistory.length > 50 && (
                  <div className="text-center py-4 text-gray-500">
                    Showing 50 of {noSalesHistory.length} styles. Export CSV for full list.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 rounded-xl border-2 border-blue-200 p-5">
        <h4 className="font-bold text-blue-800 mb-2">Validation Rules</h4>
        <ul className="text-sm text-blue-700 space-y-1">
          <li><strong>Rule 1:</strong> Styles with Wholesale (WH) sales MUST be in the Line List.</li>
          <li><strong>Rule 2:</strong> Historical styles (before 27SP) with no sales may be discontinued.</li>
          <li><strong>Note:</strong> 27SP and 27FA are future seasons and excluded from validation.</li>
        </ul>
      </div>
    </div>
  );
}
