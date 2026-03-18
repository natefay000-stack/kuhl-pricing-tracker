'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Product, SalesRecord, PricingRecord, CostRecord, InventoryOHRecord, CUSTOMER_TYPE_LABELS, normalizeCategory } from '@/types/product';
import { matchesDivision } from '@/utils/divisionMap';
import { sortSeasons } from '@/lib/store';
import { formatCurrencyShort, formatNumber, formatPercent, formatPercentSigned, getMarginColor, getMarginBg } from '@/utils/format';
import { getSeasonStatus, getSeasonStatusBadge } from '@/lib/season-utils';
import {
  computeForecasts,
  getTimelineSeries,
  loadOverrides,
  saveOverrides,
  clearOverrides,
  applyOverride,
  buildCellKey,
  type ForecastResult,
  type ForecastOverrides,
  type CategoryAggregate,
  type ChannelAggregate,
  type StyleAggregate,
} from '@/utils/forecast';
import SalesLoadingBanner from '@/components/SalesLoadingBanner';
import {
  TrendingUp,
  TrendingDown,
  Search,
  Download,
  RotateCcw,
  Package,
  DollarSign,
  Hash,
  Percent,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowLeft,
  Info,
} from 'lucide-react';

/* ── Types ───────────────────────────────────────────────────────── */

interface ForecastViewProps {
  products: Product[];
  sales: SalesRecord[];
  pricing: PricingRecord[];
  costs: CostRecord[];
  inventoryOH: InventoryOHRecord[];
  selectedSeason: string;
  selectedDivision: string;
  selectedCategory: string;
  searchQuery?: string;
  onStyleClick: (styleNumber: string) => void;
}

type TabId = 'overview' | 'category' | 'channel' | 'style';
type StyleSortField = 'styleNumber' | 'styleDesc' | 'revenue' | 'units' | 'margin' | 'price';
type SortDir = 'asc' | 'desc';

const TAB_LABELS: Record<TabId, string> = {
  overview: 'Overview',
  category: 'By Category',
  channel: 'By Channel',
  style: 'By Style',
};

/* ── Helpers ─────────────────────────────────────────────────────── */

function getGrowthColor(rate: number): string {
  if (rate > 5) return 'text-emerald-500';
  if (rate > 0) return 'text-emerald-400';
  if (rate === 0) return 'text-text-muted';
  if (rate > -5) return 'text-amber-400';
  return 'text-red-400';
}

function getGrowthIcon(rate: number) {
  return rate >= 0 ? TrendingUp : TrendingDown;
}

/* ── Editable Cell ──────────────────────────────────────────────── */

function EditableCell({
  cellKey,
  computedValue,
  overrides,
  onSave,
  format,
  className = '',
}: {
  cellKey: string;
  computedValue: number;
  overrides: ForecastOverrides;
  onSave: (key: string, value: number | undefined) => void;
  format: (n: number) => string;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

  const { value: displayValue, isOverridden } = applyOverride(overrides, cellKey, computedValue);

  const handleClick = useCallback(() => {
    setEditValue(String(Math.round(displayValue)));
    setEditing(true);
  }, [displayValue]);

  const handleCommit = useCallback(() => {
    const num = parseFloat(editValue);
    if (!isNaN(num) && num !== computedValue) {
      onSave(cellKey, num);
    } else if (editValue === '' || num === computedValue) {
      // Clear override if matching computed or empty
      onSave(cellKey, undefined);
    }
    setEditing(false);
  }, [editValue, computedValue, cellKey, onSave]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleCommit();
    if (e.key === 'Escape') setEditing(false);
  }, [handleCommit]);

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleCommit}
        onKeyDown={handleKeyDown}
        className="w-full text-right bg-surface-tertiary border border-cyan-500/50 rounded px-1.5 py-0.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-cyan-500/30"
      />
    );
  }

  return (
    <span
      onClick={handleClick}
      className={`cursor-pointer hover:bg-surface-tertiary/50 rounded px-1.5 py-0.5 transition-colors inline-flex items-center gap-1 ${
        isOverridden ? 'text-cyan-400' : ''
      } ${className}`}
      title={isOverridden ? `Override: ${format(displayValue)}. Computed: ${format(computedValue)}` : 'Click to override'}
    >
      {format(displayValue)}
      {isOverridden && <span className="inline-block w-1.5 h-1.5 rounded-full bg-cyan-400 flex-shrink-0" />}
    </span>
  );
}

/* ── Component ───────────────────────────────────────────────────── */

export default function ForecastView({
  products,
  sales,
  pricing,
  costs,
  inventoryOH,
  selectedSeason,
  selectedDivision,
  selectedCategory,
  searchQuery: globalSearchQuery,
  onStyleClick,
}: ForecastViewProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [overrides, setOverrides] = useState<ForecastOverrides>(() => loadOverrides());
  const [localSearch, setLocalSearch] = useState('');
  const [sortField, setSortField] = useState<StyleSortField>('revenue');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [drillCategory, setDrillCategory] = useState<string | null>(null);
  const [selectedForecastIdx, setSelectedForecastIdx] = useState(0);
  const pageSize = 50;

  const activeSearch = globalSearchQuery || localSearch;

  // Load overrides from localStorage on mount
  useEffect(() => {
    setOverrides(loadOverrides());
  }, []);

  // Save overrides whenever they change
  const handleOverrideSave = useCallback((key: string, value: number | undefined) => {
    setOverrides(prev => {
      const next = { ...prev };
      if (value === undefined) {
        delete next[key];
      } else {
        next[key] = value;
      }
      saveOverrides(next);
      return next;
    });
  }, []);

  const handleResetOverrides = useCallback(() => {
    clearOverrides();
    setOverrides({});
  }, []);

  // Compute forecasts
  const forecasts = useMemo(() => {
    return computeForecasts(sales, products, costs, inventoryOH, {
      division: selectedDivision,
      category: selectedCategory,
      search: activeSearch,
    });
  }, [sales, products, costs, inventoryOH, selectedDivision, selectedCategory, activeSearch]);

  // Timeline series (historical + forecast)
  const timeline = useMemo(() => {
    return getTimelineSeries(sales, costs, forecasts, {
      division: selectedDivision,
      category: selectedCategory,
    });
  }, [sales, costs, forecasts, selectedDivision, selectedCategory]);

  // Selected forecast
  const activeForecast = forecasts[selectedForecastIdx] || forecasts[0] || null;

  // Override count
  const overrideCount = Object.keys(overrides).length;

  // Filtered & sorted style data for style tab
  const { sortedStyles, totalStylePages } = useMemo(() => {
    if (!activeForecast) return { sortedStyles: [], totalStylePages: 0 };

    let styles = [...activeForecast.byStyle];

    // Apply search
    if (activeSearch) {
      const q = activeSearch.toLowerCase();
      styles = styles.filter(s =>
        s.styleNumber.toLowerCase().includes(q) ||
        s.styleDesc.toLowerCase().includes(q)
      );
    }

    // Apply category drill-down
    if (drillCategory) {
      styles = styles.filter(s => s.categoryDesc === drillCategory);
    }

    // Sort
    styles.sort((a, b) => {
      let aVal: number | string = 0, bVal: number | string = 0;
      switch (sortField) {
        case 'styleNumber': aVal = a.styleNumber; bVal = b.styleNumber; break;
        case 'styleDesc': aVal = a.styleDesc; bVal = b.styleDesc; break;
        case 'revenue': aVal = a.revenue; bVal = b.revenue; break;
        case 'units': aVal = a.units; bVal = b.units; break;
        case 'margin': aVal = a.margin; bVal = b.margin; break;
        case 'price': aVal = a.price; bVal = b.price; break;
      }
      if (typeof aVal === 'string') {
        const cmp = aVal.localeCompare(bVal as string);
        return sortDir === 'asc' ? cmp : -cmp;
      }
      return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });

    return {
      sortedStyles: styles.slice((currentPage - 1) * pageSize, currentPage * pageSize),
      totalStylePages: Math.ceil(styles.length / pageSize),
    };
  }, [activeForecast, activeSearch, drillCategory, sortField, sortDir, currentPage]);

  // Reset page when filters change
  useEffect(() => { setCurrentPage(1); }, [activeSearch, drillCategory, sortField, sortDir]);

  const toggleSort = useCallback((field: StyleSortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  }, [sortField]);

  // ── No data state ───────────────────────────────────────────────
  if (sales.length === 0) {
    return (
      <div className="space-y-6">
        <SalesLoadingBanner />
        <div className="card p-8 text-center">
          <TrendingUp className="w-12 h-12 mx-auto mb-3 text-text-muted opacity-40" />
          <h2 className="text-lg font-semibold text-text-primary mb-1">Forecast</h2>
          <p className="text-sm text-text-muted">Loading sales data for forecast projections...</p>
        </div>
      </div>
    );
  }

  if (forecasts.length === 0) {
    return (
      <div className="space-y-6">
        <div className="card p-8 text-center">
          <TrendingUp className="w-12 h-12 mx-auto mb-3 text-text-muted opacity-40" />
          <h2 className="text-lg font-semibold text-text-primary mb-1">No Forecast Data</h2>
          <p className="text-sm text-text-muted">Not enough historical data to generate projections.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SalesLoadingBanner />

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Forecast</h1>
          <p className="text-xs text-text-muted mt-0.5">
            Projections based on historical season-over-season trends
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Season selector for multi-forecast */}
          {forecasts.length > 1 && (
            <div className="flex gap-1">
              {forecasts.map((f, idx) => (
                <button
                  key={f.season}
                  onClick={() => setSelectedForecastIdx(idx)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    idx === selectedForecastIdx
                      ? 'bg-purple-500/20 text-purple-400 ring-1 ring-purple-500/30'
                      : 'bg-surface-tertiary text-text-muted hover:text-text-secondary'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
          {overrideCount > 0 && (
            <button
              onClick={handleResetOverrides}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors"
              title="Reset all manual overrides"
            >
              <RotateCcw className="w-3 h-3" />
              Reset {overrideCount} override{overrideCount !== 1 ? 's' : ''}
            </button>
          )}
        </div>
      </div>

      {/* ── Sub-tabs ───────────────────────────────────────────────── */}
      <div className="flex gap-2">
        {(Object.keys(TAB_LABELS) as TabId[]).map(tab => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); setDrillCategory(null); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeTab === tab
                ? 'bg-purple-500/20 text-purple-400 ring-1 ring-purple-500/30'
                : 'bg-surface-tertiary text-text-muted hover:text-text-secondary'
            }`}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {/* ── Content ────────────────────────────────────────────────── */}
      {activeTab === 'overview' && activeForecast && (
        <OverviewTab
          forecast={activeForecast}
          timeline={timeline}
          overrides={overrides}
          onOverrideSave={handleOverrideSave}
        />
      )}
      {activeTab === 'category' && activeForecast && (
        <CategoryTab
          forecast={activeForecast}
          overrides={overrides}
          onOverrideSave={handleOverrideSave}
          drillCategory={drillCategory}
          onDrillCategory={setDrillCategory}
          onStyleClick={onStyleClick}
        />
      )}
      {activeTab === 'channel' && activeForecast && (
        <ChannelTab
          forecast={activeForecast}
          overrides={overrides}
          onOverrideSave={handleOverrideSave}
        />
      )}
      {activeTab === 'style' && activeForecast && (
        <StyleTab
          forecast={activeForecast}
          styles={sortedStyles}
          totalPages={totalStylePages}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          overrides={overrides}
          onOverrideSave={handleOverrideSave}
          sortField={sortField}
          sortDir={sortDir}
          onSort={toggleSort}
          localSearch={localSearch}
          onLocalSearchChange={setLocalSearch}
          drillCategory={drillCategory}
          onDrillCategory={setDrillCategory}
          onStyleClick={onStyleClick}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Overview Tab
   ═══════════════════════════════════════════════════════════════════ */

function OverviewTab({
  forecast,
  timeline,
  overrides,
  onOverrideSave,
}: {
  forecast: ForecastResult;
  timeline: ReturnType<typeof getTimelineSeries>;
  overrides: ForecastOverrides;
  onOverrideSave: (key: string, value: number | undefined) => void;
}) {
  const { value: effectiveRevenue } = applyOverride(overrides, buildCellKey('revenue', forecast.season), forecast.projectedRevenue);
  const { value: effectiveUnits } = applyOverride(overrides, buildCellKey('units', forecast.season), forecast.projectedUnits);
  const { value: effectiveMargin } = applyOverride(overrides, buildCellKey('margin', forecast.season), forecast.projectedMargin);
  const statusBadge = getSeasonStatusBadge(forecast.status);

  return (
    <div className="space-y-6">
      {/* Season header */}
      <div className="card p-4">
        <div className="flex items-center gap-3">
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge.color}`}>
            {statusBadge.icon} {statusBadge.label}
          </span>
          <span className="text-sm text-text-secondary">
            {forecast.label} &mdash; Based on {forecast.baselineSeason ? `${forecast.baselineSeason} actuals` : 'available history'}
          </span>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Revenue */}
        <div className="card p-4 space-y-2">
          <div className="flex items-center gap-2 text-text-muted">
            <DollarSign className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wide">Projected Revenue</span>
          </div>
          <div className="text-2xl font-bold text-text-primary">
            <EditableCell
              cellKey={buildCellKey('revenue', forecast.season)}
              computedValue={forecast.projectedRevenue}
              overrides={overrides}
              onSave={onOverrideSave}
              format={formatCurrencyShort}
              className="text-2xl font-bold"
            />
          </div>
          <div className={`flex items-center gap-1 text-xs ${getGrowthColor(forecast.revenueGrowthRate)}`}>
            {React.createElement(getGrowthIcon(forecast.revenueGrowthRate), { className: 'w-3 h-3' })}
            {formatPercentSigned(forecast.revenueGrowthRate)} YoY
          </div>
        </div>

        {/* Units */}
        <div className="card p-4 space-y-2">
          <div className="flex items-center gap-2 text-text-muted">
            <Hash className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wide">Projected Units</span>
          </div>
          <div className="text-2xl font-bold text-text-primary">
            <EditableCell
              cellKey={buildCellKey('units', forecast.season)}
              computedValue={forecast.projectedUnits}
              overrides={overrides}
              onSave={onOverrideSave}
              format={formatNumber}
              className="text-2xl font-bold"
            />
          </div>
          <div className={`flex items-center gap-1 text-xs ${getGrowthColor(forecast.unitGrowthRate)}`}>
            {React.createElement(getGrowthIcon(forecast.unitGrowthRate), { className: 'w-3 h-3' })}
            {formatPercentSigned(forecast.unitGrowthRate)} YoY
          </div>
        </div>

        {/* Margin */}
        <div className="card p-4 space-y-2">
          <div className="flex items-center gap-2 text-text-muted">
            <Percent className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wide">Projected Margin</span>
          </div>
          <div className={`text-2xl font-bold ${getMarginColor(effectiveMargin)}`}>
            <EditableCell
              cellKey={buildCellKey('margin', forecast.season)}
              computedValue={forecast.projectedMargin}
              overrides={overrides}
              onSave={onOverrideSave}
              format={formatPercent}
              className={`text-2xl font-bold ${getMarginColor(effectiveMargin)}`}
            />
          </div>
          <div className="text-xs text-text-muted">
            {forecast.projectedStyleCount} styles projected
          </div>
        </div>

        {/* Inventory Need */}
        <div className="card p-4 space-y-2">
          <div className="flex items-center gap-2 text-text-muted">
            <Package className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wide">Inventory Need</span>
          </div>
          <div className="text-2xl font-bold text-text-primary">
            {formatNumber(forecast.recommendedInventory)}
          </div>
          <div className="text-xs text-text-muted">
            Incl. {formatNumber(forecast.safetyStock)} safety stock (4 wk)
          </div>
        </div>
      </div>

      {/* Timeline bars */}
      <div className="card p-4">
        <h3 className="text-sm font-semibold text-text-primary mb-4">Season Revenue Timeline</h3>
        <div className="space-y-2">
          {(() => {
            // Show last 6 items max for readability
            const visible = timeline.slice(-8);
            const maxRevenue = Math.max(...visible.map(s => s.revenue), 1);
            return visible.map(item => {
              const pct = (item.revenue / maxRevenue) * 100;
              const isCurrent = item.season === forecast.season;
              return (
                <div key={item.season} className="flex items-center gap-3">
                  <span className={`w-12 text-xs font-mono text-right flex-shrink-0 ${isCurrent ? 'text-purple-400 font-semibold' : 'text-text-muted'}`}>
                    {item.season}
                  </span>
                  <div className="flex-1 h-6 bg-surface-tertiary rounded-lg overflow-hidden relative">
                    <div
                      className={`h-full rounded-lg transition-all ${
                        item.isForecast
                          ? 'bg-purple-500/40 border border-purple-500/30 border-dashed'
                          : item.status === 'SHIPPING'
                            ? 'bg-emerald-500/50'
                            : 'bg-blue-500/40'
                      }`}
                      style={{ width: `${Math.max(pct, 2)}%` }}
                    />
                    <span className="absolute inset-y-0 right-2 flex items-center text-xs text-text-secondary font-mono">
                      {formatCurrencyShort(item.revenue)}
                    </span>
                  </div>
                  {item.isForecast && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400 font-medium flex-shrink-0">
                      FORECAST
                    </span>
                  )}
                </div>
              );
            });
          })()}
        </div>
        <div className="flex items-center gap-4 mt-3 text-[10px] text-text-muted">
          <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded bg-blue-500/40 inline-block" /> Historical</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded bg-emerald-500/50 inline-block" /> Shipping</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded bg-purple-500/40 border border-purple-500/30 border-dashed inline-block" /> Forecast</span>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Category Tab
   ═══════════════════════════════════════════════════════════════════ */

function CategoryTab({
  forecast,
  overrides,
  onOverrideSave,
  drillCategory,
  onDrillCategory,
  onStyleClick,
}: {
  forecast: ForecastResult;
  overrides: ForecastOverrides;
  onOverrideSave: (key: string, value: number | undefined) => void;
  drillCategory: string | null;
  onDrillCategory: (cat: string | null) => void;
  onStyleClick: (styleNumber: string) => void;
}) {
  const maxRevenue = Math.max(...forecast.byCategory.map(c => c.revenue), 1);

  if (drillCategory) {
    const catStyles = forecast.byStyle.filter(s => s.categoryDesc === drillCategory);
    const catMaxRev = Math.max(...catStyles.map(s => s.revenue), 1);

    return (
      <div className="space-y-4">
        <button
          onClick={() => onDrillCategory(null)}
          className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to categories
        </button>
        <h3 className="text-sm font-semibold text-text-primary">{drillCategory} — Style Breakdown ({forecast.label})</h3>
        <div className="card overflow-hidden">
          <div className="divide-y divide-border-primary">
            {catStyles.slice(0, 50).map(style => {
              const pct = (style.revenue / catMaxRev) * 100;
              return (
                <div key={style.styleNumber} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-tertiary/50 transition-colors">
                  <button
                    onClick={() => onStyleClick(style.styleNumber)}
                    className="w-24 text-xs font-mono text-cyan-400 hover:underline text-left flex-shrink-0"
                  >
                    {style.styleNumber}
                  </button>
                  <span className="w-40 text-xs text-text-secondary truncate flex-shrink-0">{style.styleDesc}</span>
                  <div className="flex-1 h-5 bg-surface-tertiary rounded overflow-hidden">
                    <div className="h-full rounded bg-purple-500/40" style={{ width: `${Math.max(pct, 2)}%` }} />
                  </div>
                  <span className="w-20 text-xs text-right font-mono text-text-secondary flex-shrink-0">
                    {formatCurrencyShort(style.revenue)}
                  </span>
                  <span className="w-16 text-xs text-right font-mono text-text-muted flex-shrink-0">
                    {formatNumber(style.units)} u
                  </span>
                  <span className={`w-14 text-xs text-right font-mono flex-shrink-0 ${getMarginColor(style.margin)}`}>
                    {formatPercent(style.margin)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-text-primary">Category Forecast — {forecast.label}</h3>
      <div className="card overflow-hidden">
        <div className="divide-y divide-border-primary">
          {forecast.byCategory.map(cat => {
            const pct = (cat.revenue / maxRevenue) * 100;
            const cellKey = buildCellKey('revenue', forecast.season, 'category', cat.category);
            return (
              <div
                key={cat.category}
                className="flex items-center gap-3 px-4 py-3 hover:bg-surface-tertiary/50 transition-colors cursor-pointer"
                onClick={() => onDrillCategory(cat.category)}
              >
                <span className="w-28 text-sm font-medium text-text-primary flex-shrink-0">{cat.category}</span>
                <div className="flex-1 h-6 bg-surface-tertiary rounded-lg overflow-hidden">
                  <div className="h-full rounded-lg bg-purple-500/40" style={{ width: `${Math.max(pct, 2)}%` }} />
                </div>
                <div className="w-24 text-right flex-shrink-0">
                  <EditableCell
                    cellKey={cellKey}
                    computedValue={cat.revenue}
                    overrides={overrides}
                    onSave={onOverrideSave}
                    format={formatCurrencyShort}
                    className="text-xs font-mono"
                  />
                </div>
                <span className="w-20 text-xs text-right font-mono text-text-muted flex-shrink-0">
                  {formatNumber(cat.units)} u
                </span>
                <span className={`w-14 text-xs text-right font-mono flex-shrink-0 ${getMarginColor(cat.margin)}`}>
                  {formatPercent(cat.margin)}
                </span>
                <span className="w-10 text-xs text-text-muted text-right flex-shrink-0">{cat.styleCount} sty</span>
                <ChevronRight className="w-4 h-4 text-text-muted flex-shrink-0" />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Channel Tab
   ═══════════════════════════════════════════════════════════════════ */

const CHANNEL_COLORS: Record<string, string> = {
  'WH': 'bg-blue-500/40',
  'EC': 'bg-emerald-500/40',
  'BB': 'bg-purple-500/40',
  'WD': 'bg-cyan-500/40',
  'PS': 'bg-amber-500/40',
  'KI': 'bg-rose-500/40',
};

function ChannelTab({
  forecast,
  overrides,
  onOverrideSave,
}: {
  forecast: ForecastResult;
  overrides: ForecastOverrides;
  onOverrideSave: (key: string, value: number | undefined) => void;
}) {
  const maxRevenue = Math.max(...forecast.byChannel.map(c => c.revenue), 1);
  const totalRevenue = forecast.byChannel.reduce((s, c) => s + c.revenue, 0);

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-text-primary">Channel Forecast — {forecast.label}</h3>
      <div className="card overflow-hidden">
        <div className="divide-y divide-border-primary">
          {forecast.byChannel.map(ch => {
            const pct = (ch.revenue / maxRevenue) * 100;
            const sharePct = totalRevenue > 0 ? (ch.revenue / totalRevenue * 100) : 0;
            const cellKey = buildCellKey('revenue', forecast.season, 'channel', ch.channel);
            const barColor = CHANNEL_COLORS[ch.channel] || 'bg-slate-500/40';

            return (
              <div key={ch.channel} className="flex items-center gap-3 px-4 py-3">
                <span className="w-36 text-sm font-medium text-text-primary flex-shrink-0">
                  {ch.channelLabel}
                  <span className="text-[10px] text-text-muted ml-1">({ch.channel})</span>
                </span>
                <div className="flex-1 h-6 bg-surface-tertiary rounded-lg overflow-hidden">
                  <div className={`h-full rounded-lg ${barColor}`} style={{ width: `${Math.max(pct, 2)}%` }} />
                </div>
                <div className="w-24 text-right flex-shrink-0">
                  <EditableCell
                    cellKey={cellKey}
                    computedValue={ch.revenue}
                    overrides={overrides}
                    onSave={onOverrideSave}
                    format={formatCurrencyShort}
                    className="text-xs font-mono"
                  />
                </div>
                <span className="w-20 text-xs text-right font-mono text-text-muted flex-shrink-0">
                  {formatNumber(ch.units)} u
                </span>
                <span className="w-14 text-xs text-right text-text-muted flex-shrink-0">
                  {sharePct.toFixed(1)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Style Tab
   ═══════════════════════════════════════════════════════════════════ */

function StyleTab({
  forecast,
  styles,
  totalPages,
  currentPage,
  onPageChange,
  overrides,
  onOverrideSave,
  sortField,
  sortDir,
  onSort,
  localSearch,
  onLocalSearchChange,
  drillCategory,
  onDrillCategory,
  onStyleClick,
}: {
  forecast: ForecastResult;
  styles: StyleAggregate[];
  totalPages: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  overrides: ForecastOverrides;
  onOverrideSave: (key: string, value: number | undefined) => void;
  sortField: StyleSortField;
  sortDir: SortDir;
  onSort: (field: StyleSortField) => void;
  localSearch: string;
  onLocalSearchChange: (s: string) => void;
  drillCategory: string | null;
  onDrillCategory: (cat: string | null) => void;
  onStyleClick: (styleNumber: string) => void;
}) {
  const SortHeader = ({ field, label, className = '' }: { field: StyleSortField; label: string; className?: string }) => (
    <th
      className={`px-3 py-2 text-xs font-medium text-text-muted uppercase tracking-wide cursor-pointer hover:text-text-primary transition-colors select-none ${className}`}
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortField === field && (
          <span className="text-purple-400">{sortDir === 'asc' ? '↑' : '↓'}</span>
        )}
      </span>
    </th>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {drillCategory && (
            <button
              onClick={() => onDrillCategory(null)}
              className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              All
            </button>
          )}
          <h3 className="text-sm font-semibold text-text-primary">
            Style Forecast — {forecast.label} {drillCategory ? `/ ${drillCategory}` : ''}
          </h3>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
          <input
            value={localSearch}
            onChange={(e) => onLocalSearchChange(e.target.value)}
            placeholder="Search styles..."
            className="pl-8 pr-3 py-1.5 text-xs rounded-lg bg-surface-tertiary border border-border-primary focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500/50 outline-none w-48"
          />
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="sticky top-0 z-10 bg-surface-secondary">
              <tr className="border-b border-border-primary">
                <SortHeader field="styleNumber" label="Style #" className="text-left" />
                <SortHeader field="styleDesc" label="Description" className="text-left" />
                <th className="px-3 py-2 text-xs font-medium text-text-muted uppercase tracking-wide text-left">Category</th>
                <SortHeader field="revenue" label="Proj. Revenue" className="text-right" />
                <SortHeader field="units" label="Proj. Units" className="text-right" />
                <SortHeader field="margin" label="Margin" className="text-right" />
                <SortHeader field="price" label="Avg Price" className="text-right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border-primary">
              {styles.map(style => (
                <tr key={style.styleNumber} className="hover:bg-surface-tertiary/50 transition-colors">
                  <td className="px-3 py-2">
                    <button
                      onClick={() => onStyleClick(style.styleNumber)}
                      className="text-xs font-mono text-cyan-400 hover:underline"
                    >
                      {style.styleNumber}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-xs text-text-secondary max-w-[200px] truncate">{style.styleDesc}</td>
                  <td className="px-3 py-2 text-xs text-text-muted">{style.categoryDesc}</td>
                  <td className="px-3 py-2 text-right">
                    <EditableCell
                      cellKey={buildCellKey('revenue', forecast.season, 'style', style.styleNumber)}
                      computedValue={style.revenue}
                      overrides={overrides}
                      onSave={onOverrideSave}
                      format={formatCurrencyShort}
                      className="text-xs font-mono"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <EditableCell
                      cellKey={buildCellKey('units', forecast.season, 'style', style.styleNumber)}
                      computedValue={style.units}
                      overrides={overrides}
                      onSave={onOverrideSave}
                      format={formatNumber}
                      className="text-xs font-mono"
                    />
                  </td>
                  <td className={`px-3 py-2 text-right text-xs font-mono ${getMarginColor(style.margin)}`}>
                    {formatPercent(style.margin)}
                  </td>
                  <td className="px-3 py-2 text-right text-xs font-mono text-text-muted">
                    {formatCurrencyShort(style.price)}
                  </td>
                </tr>
              ))}
              {styles.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-xs text-text-muted">
                    No styles found matching filters
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-border-primary bg-surface-secondary">
            <span className="text-xs text-text-muted">
              Page {currentPage} of {totalPages}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="p-1 rounded hover:bg-surface-tertiary disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="w-4 h-4 text-text-muted" />
              </button>
              <button
                onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="p-1 rounded hover:bg-surface-tertiary disabled:opacity-30 transition-colors"
              >
                <ChevronRight className="w-4 h-4 text-text-muted" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
