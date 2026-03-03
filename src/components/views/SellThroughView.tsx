'use client';

import { useState, useMemo } from 'react';
import { Product, SalesRecord, InventoryOHRecord, normalizeCategory } from '@/types/product';
import { matchesDivision } from '@/utils/divisionMap';
import { sortSeasons } from '@/lib/store';
import { formatCurrencyShort, formatNumber, formatPercent } from '@/utils/format';
import { exportToExcel } from '@/utils/exportData';
import SalesLoadingBanner from '@/components/SalesLoadingBanner';
import {
  ArrowRightLeft,
  Search,
  Download,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Package,
} from 'lucide-react';

/* ── Types ───────────────────────────────────────────────────────── */

interface SellThroughViewProps {
  products: Product[];
  sales: SalesRecord[];
  inventoryOH: InventoryOHRecord[];
  selectedSeason: string;
  selectedDivision: string;
  selectedCategory: string;
  searchQuery?: string;
  onStyleClick: (styleNumber: string) => void;
}

interface StyleSellThrough {
  styleNumber: string;
  styleDesc: string;
  categoryDesc: string;
  divisionDesc: string;
  ohUnits: number;        // Current on-hand inventory
  ohValue: number;        // OH value at std cost
  soldUnits: number;      // Units sold/booked for season
  soldRevenue: number;    // Revenue from sales
  sellThroughRate: number; // sold / (sold + oh) as percentage
  weeksOfSupply: number;  // oh / weekly sell rate
  riskLevel: 'overstock' | 'healthy' | 'low' | 'critical';
}

interface CategorySummary {
  category: string;
  ohUnits: number;
  soldUnits: number;
  sellThroughRate: number;
  styleCount: number;
}

/* ── Helpers ─────────────────────────────────────────────────────── */

function getRiskLevel(sellThroughRate: number, weeksOfSupply: number): 'overstock' | 'healthy' | 'low' | 'critical' {
  if (weeksOfSupply > 26) return 'overstock';
  if (weeksOfSupply > 12) return 'healthy';
  if (weeksOfSupply > 4) return 'low';
  return 'critical';
}

function getRiskColor(risk: string): string {
  switch (risk) {
    case 'overstock': return 'text-amber-500';
    case 'healthy': return 'text-emerald-500';
    case 'low': return 'text-orange-400';
    case 'critical': return 'text-red-400';
    default: return 'text-text-muted';
  }
}

function getRiskBg(risk: string): string {
  switch (risk) {
    case 'overstock': return 'bg-amber-500/10';
    case 'healthy': return 'bg-emerald-500/10';
    case 'low': return 'bg-orange-400/10';
    case 'critical': return 'bg-red-400/10';
    default: return 'bg-surface-tertiary';
  }
}

function getRiskLabel(risk: string): string {
  switch (risk) {
    case 'overstock': return 'Overstock';
    case 'healthy': return 'Healthy';
    case 'low': return 'Low Stock';
    case 'critical': return 'Critical';
    default: return risk;
  }
}

function getSellThroughColor(rate: number): string {
  if (rate >= 80) return 'text-emerald-500';
  if (rate >= 60) return 'text-emerald-400';
  if (rate >= 40) return 'text-text-primary';
  if (rate >= 20) return 'text-amber-400';
  return 'text-red-400';
}

function getSellThroughBarColor(rate: number): string {
  if (rate >= 80) return 'bg-emerald-500';
  if (rate >= 60) return 'bg-emerald-400';
  if (rate >= 40) return 'bg-blue-400';
  if (rate >= 20) return 'bg-amber-400';
  return 'bg-red-400';
}

type SortField = 'styleNumber' | 'styleDesc' | 'ohUnits' | 'soldUnits' | 'sellThroughRate' | 'weeksOfSupply';
type SortDir = 'asc' | 'desc';

/* ── Component ───────────────────────────────────────────────────── */

export default function SellThroughView({
  products,
  sales,
  inventoryOH,
  selectedSeason,
  selectedDivision,
  selectedCategory,
  searchQuery: globalSearchQuery,
  onStyleClick,
}: SellThroughViewProps) {
  const [localSearch, setLocalSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('sellThroughRate');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;

  // Determine the active search (global takes priority)
  const activeSearch = globalSearchQuery || localSearch;

  // Get latest OH snapshot date
  const latestSnapshotDate = useMemo(() => {
    if (!inventoryOH.length) return null;
    const dates = Array.from(new Set(inventoryOH.map(r => r.snapshotDate))).sort();
    return dates[dates.length - 1];
  }, [inventoryOH]);

  // Available seasons from sales
  const allSeasons = useMemo(() => {
    const s = new Set<string>();
    sales.forEach(r => r.season && s.add(r.season));
    return sortSeasons(Array.from(s));
  }, [sales]);

  // Active season (from global filter or latest)
  const activeSeason = useMemo(() => {
    if (selectedSeason && selectedSeason !== '__ALL_SP__' && selectedSeason !== '__ALL_FA__') {
      return selectedSeason;
    }
    return allSeasons[allSeasons.length - 1] || '';
  }, [selectedSeason, allSeasons]);

  // Aggregate OH by style number (latest snapshot only)
  const ohByStyle = useMemo(() => {
    const map = new Map<string, { units: number; value: number; desc: string; category: string; division: string }>();
    if (!latestSnapshotDate) return map;

    inventoryOH
      .filter(r => r.snapshotDate === latestSnapshotDate)
      .forEach(r => {
        // Apply global filters
        if (selectedDivision && r.division !== undefined && !matchesDivision(String(r.division), selectedDivision)) return;
        if (selectedCategory && normalizeCategory(r.category || '') !== selectedCategory) return;

        const existing = map.get(r.styleNumber);
        if (existing) {
          existing.units += r.totalQty;
          existing.value += r.totalQty * r.stdCost;
        } else {
          map.set(r.styleNumber, {
            units: r.totalQty,
            value: r.totalQty * r.stdCost,
            desc: r.styleDesc || '',
            category: r.category || '',
            division: String(r.division || ''),
          });
        }
      });

    return map;
  }, [inventoryOH, latestSnapshotDate, selectedDivision, selectedCategory]);

  // Aggregate sales by style for active season
  const salesByStyle = useMemo(() => {
    const map = new Map<string, { units: number; revenue: number; desc: string; category: string; division: string }>();

    sales
      .filter(s => s.season === activeSeason)
      .forEach(s => {
        if (selectedDivision && !matchesDivision(s.divisionDesc, selectedDivision)) return;
        if (selectedCategory && normalizeCategory(s.categoryDesc) !== selectedCategory) return;

        const existing = map.get(s.styleNumber);
        if (existing) {
          existing.units += s.unitsBooked || 0;
          existing.revenue += s.revenue || 0;
        } else {
          map.set(s.styleNumber, {
            units: s.unitsBooked || 0,
            revenue: s.revenue || 0,
            desc: s.styleDesc || '',
            category: s.categoryDesc || '',
            division: s.divisionDesc || '',
          });
        }
      });

    return map;
  }, [sales, activeSeason, selectedDivision, selectedCategory]);

  // Estimate weeks of selling season remaining (rough: 26 weeks per season)
  const SEASON_WEEKS = 26;

  // Combine OH + sales into sell-through data
  const sellThroughData = useMemo(() => {
    const allStyleNumbers = new Set(Array.from(ohByStyle.keys()).concat(Array.from(salesByStyle.keys())));
    const results: StyleSellThrough[] = [];

    allStyleNumbers.forEach(styleNumber => {
      const oh = ohByStyle.get(styleNumber);
      const sold = salesByStyle.get(styleNumber);

      const ohUnits = oh?.units || 0;
      const ohValue = oh?.value || 0;
      const soldUnits = sold?.units || 0;
      const soldRevenue = sold?.revenue || 0;

      // Only include styles that have either inventory or sales
      if (ohUnits === 0 && soldUnits === 0) return;

      const totalAvailable = soldUnits + ohUnits;
      const sellThroughRate = totalAvailable > 0 ? (soldUnits / totalAvailable) * 100 : 0;

      // Weeks of supply: OH / weekly sales rate
      const weeklySalesRate = SEASON_WEEKS > 0 ? soldUnits / SEASON_WEEKS : 0;
      const weeksOfSupply = weeklySalesRate > 0 ? ohUnits / weeklySalesRate : ohUnits > 0 ? 999 : 0;

      const riskLevel = getRiskLevel(sellThroughRate, weeksOfSupply);

      // Get description from whichever source has it
      const styleDesc = oh?.desc || sold?.desc || '';
      const categoryDesc = oh?.category || sold?.category || '';
      const divisionDesc = oh?.division || sold?.division || '';

      results.push({
        styleNumber,
        styleDesc,
        categoryDesc,
        divisionDesc,
        ohUnits,
        ohValue,
        soldUnits,
        soldRevenue,
        sellThroughRate,
        weeksOfSupply: Math.min(weeksOfSupply, 999),
        riskLevel,
      });
    });

    return results;
  }, [ohByStyle, salesByStyle]);

  // Category summary for the chart
  const categorySummary = useMemo(() => {
    const map = new Map<string, CategorySummary>();

    sellThroughData.forEach(s => {
      const cat = normalizeCategory(s.categoryDesc) || 'Other';
      const existing = map.get(cat);
      if (existing) {
        existing.ohUnits += s.ohUnits;
        existing.soldUnits += s.soldUnits;
        existing.styleCount++;
      } else {
        map.set(cat, {
          category: cat,
          ohUnits: s.ohUnits,
          soldUnits: s.soldUnits,
          sellThroughRate: 0,
          styleCount: 1,
        });
      }
    });

    // Calculate sell-through rates
    const result = Array.from(map.values()).map(c => ({
      ...c,
      sellThroughRate: (c.soldUnits + c.ohUnits) > 0 ? (c.soldUnits / (c.soldUnits + c.ohUnits)) * 100 : 0,
    }));

    return result.sort((a, b) => b.soldUnits + b.ohUnits - (a.soldUnits + a.ohUnits));
  }, [sellThroughData]);

  // Filtered and sorted data
  const filteredData = useMemo(() => {
    let result = sellThroughData;

    // Search filter
    if (activeSearch) {
      const q = activeSearch.toLowerCase();
      result = result.filter(s =>
        s.styleNumber.toLowerCase().includes(q) ||
        s.styleDesc.toLowerCase().includes(q)
      );
    }

    // Risk filter
    if (riskFilter !== 'all') {
      result = result.filter(s => s.riskLevel === riskFilter);
    }

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'styleNumber': cmp = a.styleNumber.localeCompare(b.styleNumber); break;
        case 'styleDesc': cmp = (a.styleDesc || '').localeCompare(b.styleDesc || ''); break;
        case 'ohUnits': cmp = a.ohUnits - b.ohUnits; break;
        case 'soldUnits': cmp = a.soldUnits - b.soldUnits; break;
        case 'sellThroughRate': cmp = a.sellThroughRate - b.sellThroughRate; break;
        case 'weeksOfSupply': cmp = a.weeksOfSupply - b.weeksOfSupply; break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [sellThroughData, activeSearch, riskFilter, sortField, sortDir]);

  // Pagination
  const totalPages = Math.ceil(filteredData.length / pageSize);
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredData.slice(start, start + pageSize);
  }, [filteredData, currentPage]);

  // Summary KPIs
  const kpis = useMemo(() => {
    const totalOH = sellThroughData.reduce((sum, s) => sum + s.ohUnits, 0);
    const totalSold = sellThroughData.reduce((sum, s) => sum + s.soldUnits, 0);
    const totalAvailable = totalSold + totalOH;
    const overallSellThrough = totalAvailable > 0 ? (totalSold / totalAvailable) * 100 : 0;
    const overstockCount = sellThroughData.filter(s => s.riskLevel === 'overstock').length;
    const criticalCount = sellThroughData.filter(s => s.riskLevel === 'critical').length;
    const totalOHValue = sellThroughData.reduce((sum, s) => sum + s.ohValue, 0);

    return { totalOH, totalSold, overallSellThrough, overstockCount, criticalCount, totalOHValue };
  }, [sellThroughData]);

  // Risk distribution
  const riskCounts = useMemo(() => {
    const counts = { overstock: 0, healthy: 0, low: 0, critical: 0 };
    sellThroughData.forEach(s => { counts[s.riskLevel]++; });
    return counts;
  }, [sellThroughData]);

  // Sort handler
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir(field === 'styleNumber' || field === 'styleDesc' ? 'asc' : 'desc');
    }
    setCurrentPage(1);
  };

  const sortIcon = (field: SortField) => {
    if (sortField !== field) return null;
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  };

  // Export
  const handleExport = () => {
    const rows = filteredData.map(s => ({
      'Style #': s.styleNumber,
      'Description': s.styleDesc,
      'Category': s.categoryDesc,
      'On-Hand Units': s.ohUnits,
      'On-Hand Value': Math.round(s.ohValue),
      'Units Sold': s.soldUnits,
      'Revenue': Math.round(s.soldRevenue),
      'Sell-Through %': Math.round(s.sellThroughRate * 10) / 10,
      'Weeks of Supply': s.weeksOfSupply >= 999 ? 'No Sales' : Math.round(s.weeksOfSupply * 10) / 10,
      'Risk Level': getRiskLabel(s.riskLevel),
    }));
    exportToExcel(rows, `sell-through-${activeSeason}`);
  };

  // No OH data state
  if (!inventoryOH.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-text-muted">
        <Package className="w-12 h-12 mb-4 opacity-30" />
        <p className="text-lg font-medium mb-2">No Inventory Data</p>
        <p className="text-sm">Import On-Hand inventory data to see sell-through analysis.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <SalesLoadingBanner />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-blue-500" />
            Sell-Through Analysis
          </h2>
          <p className="text-xs text-text-muted mt-1">
            {activeSeason} sales vs. on-hand inventory (snapshot: {latestSnapshotDate || 'N/A'})
            {' · '}{sellThroughData.length} styles
          </p>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface-tertiary rounded-lg transition-colors border border-border-primary"
        >
          <Download className="w-3.5 h-3.5" />
          Export
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-surface rounded-xl border border-border-primary p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1">Overall Sell-Through</p>
          <p className={`text-2xl font-bold ${getSellThroughColor(kpis.overallSellThrough)}`}>
            {kpis.overallSellThrough.toFixed(1)}%
          </p>
          <p className="text-[10px] text-text-faint mt-1">{formatNumber(kpis.totalSold)} sold / {formatNumber(kpis.totalSold + kpis.totalOH)} available</p>
        </div>
        <div className="bg-surface rounded-xl border border-border-primary p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1">On-Hand Value</p>
          <p className="text-2xl font-bold text-text-primary">{formatCurrencyShort(kpis.totalOHValue)}</p>
          <p className="text-[10px] text-text-faint mt-1">{formatNumber(kpis.totalOH)} units in stock</p>
        </div>
        <div className="bg-surface rounded-xl border border-border-primary p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1">Overstock Styles</p>
          <p className="text-2xl font-bold text-amber-500">{kpis.overstockCount}</p>
          <p className="text-[10px] text-text-faint mt-1">26+ weeks of supply</p>
        </div>
        <div className="bg-surface rounded-xl border border-border-primary p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1">Critical Stock</p>
          <p className="text-2xl font-bold text-red-400">{kpis.criticalCount}</p>
          <p className="text-[10px] text-text-faint mt-1">&lt;4 weeks remaining</p>
        </div>
      </div>

      {/* Category Breakdown */}
      {categorySummary.length > 0 && (
        <div className="bg-surface rounded-xl border border-border-primary p-4">
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Sell-Through by Category</h3>
          <div className="space-y-2.5">
            {categorySummary.slice(0, 8).map(cat => (
              <div key={cat.category} className="flex items-center gap-3">
                <span className="text-xs text-text-secondary w-20 truncate" title={cat.category}>{cat.category}</span>
                <div className="flex-1 relative h-5 bg-surface-tertiary rounded-full overflow-hidden">
                  <div
                    className={`absolute inset-y-0 left-0 rounded-full transition-all ${getSellThroughBarColor(cat.sellThroughRate)}`}
                    style={{ width: `${Math.min(cat.sellThroughRate, 100)}%` }}
                  />
                </div>
                <span className={`text-xs font-semibold w-12 text-right ${getSellThroughColor(cat.sellThroughRate)}`}>
                  {cat.sellThroughRate.toFixed(0)}%
                </span>
                <span className="text-[10px] text-text-faint w-16 text-right">
                  {cat.styleCount} styles
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Risk Distribution + Filters */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {(['all', 'critical', 'low', 'healthy', 'overstock'] as const).map(risk => {
            const count = risk === 'all' ? sellThroughData.length : riskCounts[risk as keyof typeof riskCounts];
            const isActive = riskFilter === risk;
            return (
              <button
                key={risk}
                onClick={() => { setRiskFilter(risk); setCurrentPage(1); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  isActive
                    ? risk === 'all' ? 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/30'
                    : `${getRiskBg(risk)} ${getRiskColor(risk)} ring-1 ring-inset ring-current/20`
                    : 'bg-surface-tertiary text-text-muted hover:text-text-secondary hover:bg-surface-secondary'
                }`}
              >
                {risk === 'all' ? 'All' : getRiskLabel(risk)} ({count})
              </button>
            );
          })}
        </div>
        <div className="relative w-56">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-faint" />
          <input
            type="text"
            value={localSearch}
            onChange={(e) => { setLocalSearch(e.target.value); setCurrentPage(1); }}
            placeholder="Filter styles..."
            className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs bg-surface-tertiary border border-border-strong text-text-primary placeholder:text-text-faint"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-surface rounded-xl border border-border-primary overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-strong">
                {[
                  { field: 'styleNumber' as SortField, label: 'Style #', align: 'left' },
                  { field: 'styleDesc' as SortField, label: 'Description', align: 'left' },
                  { field: 'ohUnits' as SortField, label: 'On-Hand', align: 'right' },
                  { field: 'soldUnits' as SortField, label: 'Sold', align: 'right' },
                  { field: 'sellThroughRate' as SortField, label: 'Sell-Through', align: 'right' },
                  { field: 'weeksOfSupply' as SortField, label: 'Weeks Supply', align: 'right' },
                ].map(col => (
                  <th
                    key={col.field}
                    onClick={() => handleSort(col.field)}
                    className={`px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted bg-surface-tertiary cursor-pointer hover:text-text-secondary transition-colors whitespace-nowrap ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                  >
                    {col.label}{sortIcon(col.field)}
                  </th>
                ))}
                <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted bg-surface-tertiary text-center whitespace-nowrap">Risk</th>
                <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted bg-surface-tertiary text-right whitespace-nowrap">Visual</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-primary">
              {paginatedData.map((s) => (
                <tr
                  key={s.styleNumber}
                  onClick={() => onStyleClick(s.styleNumber)}
                  className="hover:bg-surface-secondary cursor-pointer transition-colors"
                >
                  <td className="px-4 py-2.5 font-mono text-xs text-blue-400">{s.styleNumber}</td>
                  <td className="px-4 py-2.5 text-xs text-text-secondary truncate max-w-[200px]" title={s.styleDesc}>{s.styleDesc}</td>
                  <td className="px-4 py-2.5 text-xs text-right text-text-secondary">{formatNumber(s.ohUnits)}</td>
                  <td className="px-4 py-2.5 text-xs text-right text-text-secondary">{formatNumber(s.soldUnits)}</td>
                  <td className={`px-4 py-2.5 text-xs text-right font-semibold ${getSellThroughColor(s.sellThroughRate)}`}>
                    {s.sellThroughRate.toFixed(1)}%
                  </td>
                  <td className="px-4 py-2.5 text-xs text-right text-text-secondary">
                    {s.weeksOfSupply >= 999 ? (
                      <span className="text-text-faint">No sales</span>
                    ) : (
                      <span>{s.weeksOfSupply.toFixed(1)}w</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${getRiskBg(s.riskLevel)} ${getRiskColor(s.riskLevel)}`}>
                      {getRiskLabel(s.riskLevel)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 w-28">
                    <div className="w-full h-2 bg-surface-tertiary rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${getSellThroughBarColor(s.sellThroughRate)}`}
                        style={{ width: `${Math.min(s.sellThroughRate, 100)}%` }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
              {paginatedData.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-text-muted text-sm">
                    {activeSearch ? 'No styles match your search' : 'No sell-through data available'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border-primary">
            <span className="text-xs text-text-muted">
              Showing {((currentPage - 1) * pageSize) + 1}–{Math.min(currentPage * pageSize, filteredData.length)} of {filteredData.length}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 text-xs rounded-md bg-surface-tertiary text-text-muted hover:text-text-primary disabled:opacity-30 transition-colors"
              >
                Prev
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 text-xs rounded-md bg-surface-tertiary text-text-muted hover:text-text-primary disabled:opacity-30 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
