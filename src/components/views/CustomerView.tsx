'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Product, SalesRecord, CUSTOMER_TYPE_LABELS, normalizeCategory } from '@/types/product';
import { sortSeasons, compareSeasons } from '@/lib/store';
import { isRelevantSeason } from '@/utils/season';
import { matchesDivision } from '@/utils/divisionMap';
import { Search, Download, Users } from 'lucide-react';
import { exportToExcel } from '@/utils/exportData';
import { formatCurrencyShort, formatNumberShort } from '@/utils/format';
import SalesLoadingBanner from '@/components/SalesLoadingBanner';

interface CustomerViewProps {
  products: Product[];
  sales: SalesRecord[];
  selectedSeason?: string;
  selectedDivision?: string;
  selectedCategory?: string;
  selectedCustomerType?: string;
  searchQuery?: string;
  onStyleClick: (styleNumber: string) => void;
}

/* ── Customer type colors ───────────────────────────────────────── */
const TYPE_DOT_COLORS: Record<string, string> = {
  EC: 'bg-emerald-400',
  WH: 'bg-blue-400',
  BB: 'bg-purple-400',
  WD: 'bg-orange-400',
  PS: 'bg-pink-400',
  KI: 'bg-cyan-400',
};

const TYPE_BADGE_CLASSES: Record<string, string> = {
  EC: 'bg-emerald-500/15 text-emerald-400',
  WH: 'bg-blue-500/15 text-blue-400',
  BB: 'bg-purple-500/15 text-purple-400',
  WD: 'bg-orange-500/15 text-orange-400',
  PS: 'bg-pink-500/15 text-pink-400',
  KI: 'bg-cyan-500/15 text-cyan-400',
};

const BAR_COLORS = ['#30d158', '#0a84ff', '#bf5af2', '#ff9f0a', '#ff453a', '#5ac8fa'];

/* ── Helpers ────────────────────────────────────────────────────── */
function getInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

/* ── Aggregated customer data ───────────────────────────────────── */
type CustomerMetrics = {
  customer: string;
  customerType: string;
  revenue: number;
  shipped: number;
  units: number;
  totalCost: number;
  styles: Set<string>;
  orders: number;
};

type SortMode = 'revenue' | 'name';

export default function CustomerView({
  products,
  sales,
  selectedSeason: globalSeason = '',
  selectedDivision: globalDivision = '',
  selectedCategory: globalCategory = '',
  selectedCustomerType: globalCustomerType = '',
  searchQuery: globalSearchQuery,
  onStyleClick,
}: CustomerViewProps) {
  /* ── Local state ───────────────────────────────────────────────── */
  const [searchQuery, setSearchQuery] = useState('');

  // Sync global search → local search
  useEffect(() => {
    if (globalSearchQuery !== undefined && globalSearchQuery !== searchQuery) {
      setSearchQuery(globalSearchQuery);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalSearchQuery]);
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('revenue');

  /* ── Derive activeSeason from global filter ────────────────────── */
  const allSeasons = useMemo(() => {
    const s = new Set<string>();
    sales.forEach(r => r.season && s.add(r.season));
    return sortSeasons(Array.from(s)).filter(ss => isRelevantSeason(ss));
  }, [sales]);

  const activeSeason = useMemo(() => {
    if (!globalSeason) return allSeasons[allSeasons.length - 1] || '';
    if (globalSeason === '__ALL_SP__') {
      return [...allSeasons].reverse().find(s => s.endsWith('SP')) || allSeasons[allSeasons.length - 1] || '';
    }
    if (globalSeason === '__ALL_FA__') {
      return [...allSeasons].reverse().find(s => s.endsWith('FA')) || allSeasons[allSeasons.length - 1] || '';
    }
    return allSeasons.includes(globalSeason) ? globalSeason : allSeasons[allSeasons.length - 1] || '';
  }, [globalSeason, allSeasons]);

  // Previous season for YoY comparison
  const priorSeason = useMemo(() => {
    const idx = allSeasons.indexOf(activeSeason);
    if (!activeSeason) return '';
    const half = activeSeason.slice(-2); // SP or FA
    const yearNum = parseInt(activeSeason.slice(0, 2), 10);
    const prior = `${String(yearNum - 1).padStart(2, '0')}${half}`;
    return allSeasons.includes(prior) ? prior : (idx > 0 ? allSeasons[idx - 1] : '');
  }, [allSeasons, activeSeason]);

  /* ── Build customer metrics for active season ──────────────────── */
  const customerMetrics = useMemo(() => {
    const map = new Map<string, CustomerMetrics>();

    sales.forEach(sale => {
      if (sale.season !== activeSeason) return;
      if (globalCustomerType && sale.customerType !== globalCustomerType) return;
      if (globalCategory && normalizeCategory(sale.categoryDesc) !== normalizeCategory(globalCategory)) return;
      if (globalDivision && !matchesDivision(sale.divisionDesc, globalDivision)) return;
      const cust = sale.customer || 'Unknown';
      if (!map.has(cust)) {
        map.set(cust, { customer: cust, customerType: sale.customerType || '', revenue: 0, shipped: 0, units: 0, totalCost: 0, styles: new Set(), orders: 0 });
      }
      const m = map.get(cust)!;
      m.revenue += sale.revenue || 0;
      m.shipped += (sale.shipped as number) || 0;
      m.units += sale.unitsBooked || 0;
      m.totalCost += sale.cost || 0;
      if (sale.styleNumber) m.styles.add(sale.styleNumber);
      m.orders += 1;
    });

    return Array.from(map.values());
  }, [sales, activeSeason, globalCustomerType, globalCategory, globalDivision]);

  /* ── Prior-season metrics for YoY comparison ───────────────────── */
  const priorMetricsMap = useMemo(() => {
    if (!priorSeason) return new Map<string, { revenue: number; shipped: number; units: number; totalCost: number; styles: number; orders: number }>();
    const map = new Map<string, { revenue: number; shipped: number; units: number; totalCost: number; styles: Set<string>; orders: number }>();

    sales.forEach(sale => {
      if (sale.season !== priorSeason) return;
      const cust = sale.customer || 'Unknown';
      if (!map.has(cust)) map.set(cust, { revenue: 0, shipped: 0, units: 0, totalCost: 0, styles: new Set(), orders: 0 });
      const m = map.get(cust)!;
      m.revenue += sale.revenue || 0;
      m.shipped += (sale.shipped as number) || 0;
      m.units += sale.unitsBooked || 0;
      m.totalCost += sale.cost || 0;
      if (sale.styleNumber) m.styles.add(sale.styleNumber);
      m.orders += 1;
    });

    const result = new Map<string, { revenue: number; shipped: number; units: number; totalCost: number; styles: number; orders: number }>();
    map.forEach((v, k) => result.set(k, { ...v, styles: v.styles.size }));
    return result;
  }, [sales, priorSeason]);

  /* ── Filter + sort ─────────────────────────────────────────────── */
  const filteredCustomers = useMemo(() => {
    let list = customerMetrics;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(c => c.customer.toLowerCase().includes(q));
    }
    list.sort((a, b) =>
      sortMode === 'revenue' ? b.revenue - a.revenue : a.customer.localeCompare(b.customer)
    );
    return list;
  }, [customerMetrics, searchQuery, sortMode]);

  /* ── Customer list summary ─────────────────────────────────────── */
  const listSummary = useMemo(() => {
    let totalRevenue = 0;
    for (const c of filteredCustomers) totalRevenue += c.revenue;
    return { count: filteredCustomers.length, totalRevenue };
  }, [filteredCustomers]);

  /* ── Auto-select first customer if none selected ──────────────── */
  const activeCustomer = selectedCustomer && filteredCustomers.some(c => c.customer === selectedCustomer)
    ? selectedCustomer
    : filteredCustomers[0]?.customer || null;

  const activeMetrics = activeCustomer ? filteredCustomers.find(c => c.customer === activeCustomer) : null;
  const activePrior = activeCustomer ? priorMetricsMap.get(activeCustomer) : null;

  /* ── Detail: Top selling styles ────────────────────────────────── */
  const topStyles = useMemo(() => {
    if (!activeCustomer) return [];
    const map = new Map<string, { styleDesc: string; divisionDesc: string; revenue: number; units: number }>();
    sales.forEach(sale => {
      if (sale.customer !== activeCustomer || sale.season !== activeSeason) return;
      if (globalDivision && !matchesDivision(sale.divisionDesc, globalDivision)) return;
      const sn = sale.styleNumber;
      if (!map.has(sn)) map.set(sn, { styleDesc: sale.styleDesc || '', divisionDesc: sale.divisionDesc || '', revenue: 0, units: 0 });
      const m = map.get(sn)!;
      m.revenue += sale.revenue || 0;
      m.units += sale.unitsBooked || 0;
    });
    return Array.from(map.entries())
      .map(([styleNumber, d]) => ({ styleNumber, ...d }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }, [activeCustomer, sales, activeSeason, globalDivision]);

  /* ── Detail: Revenue by category ───────────────────────────────── */
  const categoryBreakdown = useMemo(() => {
    if (!activeCustomer) return [];
    const map = new Map<string, number>();
    sales.forEach(sale => {
      if (sale.customer !== activeCustomer || sale.season !== activeSeason) return;
      if (globalDivision && !matchesDivision(sale.divisionDesc, globalDivision)) return;
      const cat = normalizeCategory(sale.categoryDesc) || 'Unknown';
      map.set(cat, (map.get(cat) || 0) + (sale.revenue || 0));
    });
    return Array.from(map.entries())
      .map(([category, revenue]) => ({ category, revenue }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }, [activeCustomer, sales, activeSeason, globalDivision]);

  const maxCatRevenue = categoryBreakdown[0]?.revenue || 1;

  /* ── Company-wide category share (benchmark) ────────────────────── */
  const companyCategoryShares = useMemo(() => {
    const map = new Map<string, number>();
    let total = 0;
    sales.forEach(sale => {
      if (sale.season !== activeSeason) return;
      if (globalDivision && !matchesDivision(sale.divisionDesc, globalDivision)) return;
      const cat = normalizeCategory(sale.categoryDesc) || 'Unknown';
      const rev = sale.revenue || 0;
      map.set(cat, (map.get(cat) || 0) + rev);
      total += rev;
    });
    const shares = new Map<string, number>();
    if (total > 0) {
      map.forEach((rev, cat) => shares.set(cat, (rev / total) * 100));
    }
    return shares;
  }, [sales, activeSeason, globalDivision]);

  /* ── Detail: Season revenue history (with shipped/booked) ───────── */
  const seasonHistory = useMemo(() => {
    if (!activeCustomer) return [];
    const map = new Map<string, { revenue: number; shipped: number; units: number; styles: Set<string> }>();
    sales.forEach(sale => {
      if (sale.customer !== activeCustomer) return;
      const s = sale.season;
      if (!map.has(s)) map.set(s, { revenue: 0, shipped: 0, units: 0, styles: new Set() });
      const m = map.get(s)!;
      m.revenue += sale.revenue || 0;
      m.shipped += (sale.shipped as number) || 0;
      m.units += sale.unitsBooked || 0;
      if (sale.styleNumber) m.styles.add(sale.styleNumber);
    });
    return Array.from(map.entries())
      .map(([season, d]) => ({ season, revenue: d.revenue, shipped: d.shipped, booked: d.revenue - d.shipped, units: d.units, styles: d.styles.size }))
      .sort((a, b) => compareSeasons(a.season, b.season))
      .slice(-6);
  }, [activeCustomer, sales]);

  const maxSeasonRev = Math.max(...seasonHistory.map(s => s.revenue), 1);

  /* ── KPI delta helper ──────────────────────────────────────────── */
  function kpiDelta(current: number, prior: number | undefined): { pct: number; dir: 'up' | 'down' | 'flat' } {
    if (prior === undefined || prior === null) return { pct: 0, dir: 'flat' };
    if (prior === 0) return current > 0 ? { pct: 100, dir: 'up' } : { pct: 0, dir: 'flat' };
    const pct = ((current - prior) / prior) * 100;
    return { pct: Math.abs(pct), dir: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat' };
  }

  /* ── Export ─────────────────────────────────────────────────────── */
  const handleExport = () => {
    exportToExcel(
      filteredCustomers.map((c, idx) => ({
        Season: activeSeason,
        Rank: idx + 1,
        Customer: c.customer,
        Type: c.customerType,
        Revenue: c.revenue.toFixed(2),
        Shipped: c.shipped.toFixed(2),
        Booked: (c.revenue - c.shipped).toFixed(2),
        Units: c.units,
        Styles: c.styles.size,
        Orders: c.orders,
      })),
      `customers_${activeSeason}`
    );
  };

  /* ──────────────────────────────────────────────────────────────── */
  /*  RENDER                                                         */
  /* ──────────────────────────────────────────────────────────────── */
  return (
    <div className="p-6 space-y-4">
      <SalesLoadingBanner />
      {/* ── Page Header ──────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-display font-semibold text-text-primary">Customers</h1>
          <p className="text-xs text-text-muted mt-1">Customer performance for <span className="font-mono font-semibold text-text-secondary">{activeSeason}</span></p>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2.5 text-xs font-medium rounded-lg border border-border-primary bg-surface text-text-primary hover:bg-surface-tertiary transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Export
        </button>
      </div>

      {/* ── Main Layout: List + Detail ───────────────────────────── */}
      <div className="grid gap-3" style={{ gridTemplateColumns: 'minmax(200px, 22%) 1fr', height: 'calc(100vh - 200px)' }}>

        {/* === LEFT PANEL: Customer List ============================= */}
        <div className="card flex flex-col overflow-hidden">
          {/* List header */}
          <div className="px-4 py-3 bg-surface-secondary border-b border-border-primary space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-semibold text-text-primary">All Customers</span>
                <span className="text-xs text-text-muted ml-1">· {listSummary.count}</span>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => setSortMode('revenue')}
                  className={`px-2 py-0.5 text-[11px] rounded ${sortMode === 'revenue' ? 'bg-surface-tertiary text-text-primary' : 'text-text-faint hover:text-text-muted'}`}
                >
                  Revenue
                </button>
                <button
                  onClick={() => setSortMode('name')}
                  className={`px-2 py-0.5 text-[11px] rounded ${sortMode === 'name' ? 'bg-surface-tertiary text-text-primary' : 'text-text-faint hover:text-text-muted'}`}
                >
                  Name
                </button>
              </div>
            </div>
            {/* Search */}
            <div className="flex items-center gap-2 bg-surface-primary border border-border-primary rounded-md px-2.5 py-1.5">
              <Search className="w-3.5 h-3.5 text-text-faint flex-shrink-0" />
              <input
                type="text"
                placeholder="Search customers..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="bg-transparent border-none text-sm w-full focus:outline-none placeholder:text-text-faint"
              />
            </div>
            {/* Summary */}
            <div className="text-[11px] text-text-faint">
              Total: <span className="font-mono font-semibold text-text-secondary">{formatCurrencyShort(listSummary.totalRevenue)}</span>
            </div>
          </div>

          {/* Scrollable list */}
          <div className="flex-1 overflow-y-auto">
            {filteredCustomers.map(c => {
              const isSelected = c.customer === activeCustomer;
              const prior = priorMetricsMap.get(c.customer);
              const isNew = priorSeason && !prior;
              const trend = prior && prior.revenue > 0 ? ((c.revenue - prior.revenue) / prior.revenue) * 100 : null;
              return (
                <button
                  key={c.customer}
                  onClick={() => setSelectedCustomer(c.customer)}
                  className={`
                    w-full flex items-center gap-2.5 px-3.5 py-3 border-b border-border-secondary text-left transition-all cursor-pointer
                    ${isSelected
                      ? 'bg-blue-500/10 border-l-[3px] border-l-blue-500 pl-[11px]'
                      : 'hover:bg-hover border-l-[3px] border-l-transparent'
                    }
                  `}
                >
                  {/* Avatar */}
                  <div className={`
                    w-10 h-10 rounded-lg flex items-center justify-center text-sm font-semibold flex-shrink-0
                    ${isSelected ? 'bg-blue-500/20 text-blue-400' : 'bg-surface-tertiary text-text-muted'}
                  `}>
                    {getInitials(c.customer)}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-text-primary truncate">{c.customer}</span>
                      {isNew && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold uppercase tracking-wider flex-shrink-0">
                          New
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${TYPE_DOT_COLORS[c.customerType] || 'bg-gray-400'}`} />
                      <span className="text-[11px] text-text-faint">{c.customerType} · {c.orders} orders</span>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="text-right flex-shrink-0">
                    <div className="text-sm font-mono font-medium text-text-primary">{formatCurrencyShort(c.revenue)}</div>
                    {trend !== null && (
                      <div className={`text-[10px] mt-0.5 ${trend >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {trend >= 0 ? '↑' : '↓'} {Math.abs(trend).toFixed(0)}%
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
            {filteredCustomers.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-text-faint">
                <Users className="w-10 h-10 mb-3 opacity-50" />
                <p className="text-sm font-semibold text-text-muted">No customers found</p>
                <p className="text-xs mt-1">Try adjusting your filters</p>
              </div>
            )}
          </div>
        </div>

        {/* === RIGHT PANEL: Detail ================================== */}
        <div className="flex flex-col gap-3 overflow-y-auto pr-1">
          {activeMetrics ? (
            <>
              {/* ── Detail Header ──────────────────────────────────── */}
              <div className="card flex items-center gap-5 px-5 py-4">
                <div className="w-14 h-14 rounded-xl bg-blue-500/15 flex items-center justify-center text-xl font-semibold text-blue-400 flex-shrink-0">
                  {getInitials(activeMetrics.customer)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-semibold text-text-primary truncate">{activeMetrics.customer}</h2>
                    {priorSeason && !priorMetricsMap.has(activeMetrics.customer) && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold uppercase tracking-wider flex-shrink-0">
                        New Customer
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-sm text-text-muted">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium ${TYPE_BADGE_CLASSES[activeMetrics.customerType] || 'bg-surface-tertiary text-text-secondary'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${TYPE_DOT_COLORS[activeMetrics.customerType] || 'bg-gray-400'}`} />
                      {CUSTOMER_TYPE_LABELS[activeMetrics.customerType] || activeMetrics.customerType}
                    </span>
                    <span>{activeMetrics.orders} orders this season</span>
                  </div>
                </div>
              </div>

              {/* ── KPI Cards (6) ─────────────────────────────────── */}
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-2.5">
                {(() => {
                  const avgOrder = activeMetrics.orders > 0 ? activeMetrics.revenue / activeMetrics.orders : 0;
                  const priorAvgOrder = activePrior && activePrior.orders > 0 ? activePrior.revenue / activePrior.orders : undefined;

                  // Calculate actual margin from cost data
                  const hasMarginData = activeMetrics.totalCost > 0 && activeMetrics.revenue > 0;
                  const marginPct = hasMarginData ? ((activeMetrics.revenue - activeMetrics.totalCost) / activeMetrics.revenue) * 100 : null;
                  const priorHasMargin = activePrior && activePrior.totalCost > 0 && activePrior.revenue > 0;
                  const priorMarginPct = priorHasMargin ? ((activePrior!.revenue - activePrior!.totalCost) / activePrior!.revenue) * 100 : undefined;

                  // Shipped % of revenue
                  const shippedPct = activeMetrics.revenue > 0 ? (activeMetrics.shipped / activeMetrics.revenue) * 100 : 0;
                  const priorShippedPct = activePrior && activePrior.revenue > 0 ? (activePrior.shipped / activePrior.revenue) * 100 : undefined;

                  const kpis = [
                    { label: 'Total Revenue', value: formatCurrencyShort(activeMetrics.revenue), delta: kpiDelta(activeMetrics.revenue, activePrior?.revenue) },
                    { label: 'Customer Margin', value: marginPct !== null ? `${marginPct.toFixed(1)}%` : '—', delta: marginPct !== null && priorMarginPct !== undefined ? kpiDelta(marginPct, priorMarginPct) : { pct: 0, dir: 'flat' as const }, color: marginPct !== null && marginPct >= 50 ? 'text-emerald-400' : marginPct !== null ? 'text-amber-400' : undefined },
                    { label: 'Units Sold', value: formatNumberShort(activeMetrics.units), delta: kpiDelta(activeMetrics.units, activePrior?.units) },
                    { label: 'Avg Order Value', value: formatCurrencyShort(avgOrder), delta: kpiDelta(avgOrder, priorAvgOrder) },
                    { label: 'Styles Ordered', value: String(activeMetrics.styles.size), delta: kpiDelta(activeMetrics.styles.size, activePrior?.styles) },
                    { label: 'Shipped %', value: `${shippedPct.toFixed(0)}%`, delta: kpiDelta(shippedPct, priorShippedPct), color: shippedPct >= 90 ? 'text-emerald-400' : shippedPct >= 50 ? 'text-blue-400' : 'text-amber-400', sublabel: `${formatCurrencyShort(activeMetrics.shipped)} shipped · ${formatCurrencyShort(activeMetrics.revenue - activeMetrics.shipped)} open` },
                  ];

                  return kpis.map(kpi => (
                    <div key={kpi.label} className="card px-4 py-3">
                      <div className="text-[11px] uppercase tracking-wider text-text-faint font-semibold mb-1">{kpi.label}</div>
                      <div className={`text-xl font-semibold font-mono ${kpi.color || 'text-text-primary'}`}>{kpi.value}</div>
                      {'sublabel' in kpi && kpi.sublabel && (
                        <div className="text-[11px] text-text-faint mt-0.5">{kpi.sublabel}</div>
                      )}
                      {kpi.delta.dir !== 'flat' && priorSeason && (
                        <div className={`text-xs mt-1 flex items-center gap-1 ${kpi.delta.dir === 'up' ? 'text-emerald-400' : 'text-red-400'}`}>
                          {kpi.delta.dir === 'up' ? '↑' : '↓'} {kpi.delta.pct.toFixed(0)}%
                          <span className="text-text-faint">vs {priorSeason}</span>
                        </div>
                      )}
                    </div>
                  ));
                })()}
              </div>

              {/* ── Content Grid: 2 columns ──────────────────────── */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                {/* Top Selling Styles */}
                <div className="card overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-primary">
                    <span className="text-sm font-semibold text-text-primary">Top Selling Styles</span>
                    <span className="text-xs text-text-faint">By revenue</span>
                  </div>
                  <table className="w-full">
                    <thead>
                      <tr className="bg-surface-secondary border-b border-border-primary">
                        <th className="text-left text-[11px] font-semibold uppercase text-text-faint px-3.5 py-2.5 w-10">#</th>
                        <th className="text-left text-[11px] font-semibold uppercase text-text-faint px-3.5 py-2.5">Style</th>
                        <th className="text-right text-[11px] font-semibold uppercase text-text-faint px-3.5 py-2.5">Revenue</th>
                        <th className="text-right text-[11px] font-semibold uppercase text-text-faint px-3.5 py-2.5">Units</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topStyles.map((style, idx) => (
                        <tr
                          key={style.styleNumber}
                          className="border-b border-border-secondary hover:bg-hover/50 cursor-pointer transition-colors"
                          onClick={() => onStyleClick(style.styleNumber)}
                        >
                          <td className="px-3.5 py-2">
                            <span className={`inline-flex items-center justify-center w-5.5 h-5.5 rounded-md text-[11px] font-semibold font-mono ${idx < 3 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-surface-tertiary text-text-muted'}`}>
                              {idx + 1}
                            </span>
                          </td>
                          <td className="px-3.5 py-2">
                            <div className="text-sm font-medium text-text-primary">{style.styleDesc || style.styleNumber}</div>
                            <div className="text-[11px] text-text-faint mt-0.5">{style.styleNumber}</div>
                          </td>
                          <td className="px-3.5 py-2 text-right text-sm font-mono text-text-primary">{formatCurrencyShort(style.revenue)}</td>
                          <td className="px-3.5 py-2 text-right text-sm font-mono text-text-secondary">{formatNumberShort(style.units)}</td>
                        </tr>
                      ))}
                      {topStyles.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-4 py-8 text-center text-xs text-text-faint">No style data</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Revenue by Category — horizontal bars with company benchmark */}
                <div className="card overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-primary">
                    <span className="text-sm font-semibold text-text-primary">Revenue by Category</span>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <div className="w-[2px] h-3 bg-white/50 rounded-full" />
                        <span className="text-[10px] text-text-faint">Co. avg</span>
                      </div>
                      <span className="text-xs text-text-faint">{activeSeason}</span>
                    </div>
                  </div>
                  <div className="p-4 space-y-3.5">
                    {categoryBreakdown.map((cat, idx) => {
                      const totalCatRev = categoryBreakdown.reduce((s, c) => s + c.revenue, 0);
                      const share = totalCatRev > 0 ? (cat.revenue / totalCatRev) * 100 : 0;
                      const companyShare = companyCategoryShares.get(cat.category) || 0;
                      // Scale bars: max of either customer or company share maps to 100% width
                      const maxShare = Math.max(...categoryBreakdown.map(c => {
                        const cs = totalCatRev > 0 ? (c.revenue / totalCatRev) * 100 : 0;
                        const co = companyCategoryShares.get(c.category) || 0;
                        return Math.max(cs, co);
                      }), 1);
                      const barWidth = (share / maxShare) * 100;
                      const companyWidth = (companyShare / maxShare) * 100;
                      return (
                        <div key={cat.category} className="flex items-center gap-2">
                          <div className="w-[5.5em] text-sm font-medium text-text-primary flex-shrink-0 truncate">{cat.category}</div>
                          <div className="flex-1 h-7 bg-surface-tertiary rounded-md overflow-hidden min-w-0 relative">
                            {/* Customer bar */}
                            <div
                              className="h-full rounded-md flex items-center pl-2 text-xs font-medium text-white whitespace-nowrap"
                              style={{ width: `${Math.max(barWidth, 6)}%`, backgroundColor: BAR_COLORS[idx % BAR_COLORS.length] }}
                            >
                              {barWidth > 30 ? formatCurrencyShort(cat.revenue) : ''}
                            </div>
                            {/* Company average marker line (always on top) */}
                            <div
                              className="absolute top-0 h-full z-10 pointer-events-none"
                              style={{ left: `${Math.max(companyWidth, 2)}%` }}
                            >
                              <div className="w-[2px] h-full bg-white/50" />
                            </div>
                          </div>
                          <div className="w-[3.5em] text-right flex-shrink-0">
                            <div className="font-mono text-sm text-text-secondary">{share.toFixed(0)}%</div>
                            {Math.abs(share - companyShare) >= 1 && (
                              <div className="text-[9px] text-text-faint font-mono">{companyShare.toFixed(0)}% avg</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {categoryBreakdown.length === 0 && (
                      <p className="text-xs text-text-faint text-center py-6">No category data</p>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Season Revenue Comparison (full width, stacked shipped/booked) ── */}
              <div className="card overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border-primary">
                  <span className="text-sm font-semibold text-text-primary">Season Revenue Comparison</span>
                  <span className="text-xs text-text-faint">Last {seasonHistory.length} seasons</span>
                </div>
                <div className="p-4">
                  <div className="flex items-center gap-4 mb-3">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-sm bg-blue-500" />
                      <span className="text-xs text-text-muted">Shipped</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-sm bg-blue-500/30" />
                      <span className="text-xs text-text-muted">Booked</span>
                    </div>
                  </div>
                  <div className="flex items-end gap-2 h-[10em]">
                    {seasonHistory.map(sh => {
                      const pct = (sh.revenue / maxSeasonRev) * 100;
                      const shippedPct = sh.revenue > 0 ? (sh.shipped / sh.revenue) * pct : 0;
                      const bookedPct = pct - shippedPct;
                      const isCurrent = sh.season === activeSeason;
                      return (
                        <div key={sh.season} className={`flex-1 flex flex-col items-center gap-1 ${isCurrent ? 'bg-blue-500/10 rounded-lg py-1 -my-1' : ''}`}>
                          <div className="flex items-end h-[7.5em] w-full justify-center">
                            <div className="w-3/5 max-w-[3em] flex flex-col-reverse" style={{ height: `${Math.max(pct, 4)}%` }}>
                              {/* Shipped (bottom, solid) */}
                              <div
                                className="w-full rounded-t-none rounded-b-none bg-blue-500"
                                style={{ height: shippedPct > 0 ? `${(shippedPct / Math.max(pct, 4)) * 100}%` : '0%', borderRadius: bookedPct <= 0 ? '4px 4px 0 0' : '0' }}
                              />
                              {/* Booked (top, lighter) */}
                              {bookedPct > 0 && (
                                <div
                                  className="w-full bg-blue-500/30 rounded-t"
                                  style={{ height: `${(bookedPct / Math.max(pct, 4)) * 100}%` }}
                                />
                              )}
                            </div>
                          </div>
                          <span className={`text-xs font-mono ${isCurrent ? 'text-blue-400 font-semibold' : 'text-text-muted'}`}>
                            {formatCurrencyShort(sh.revenue)}
                          </span>
                          <span className={`text-xs font-medium ${isCurrent ? 'text-blue-400 font-semibold' : 'text-text-faint'}`}>
                            {sh.season}
                          </span>
                        </div>
                      );
                    })}
                    {seasonHistory.length === 0 && (
                      <div className="flex-1 flex items-center justify-center text-xs text-text-faint">No season data</div>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* ── Empty state ──────────────────────────────────────── */
            <div className="flex flex-col items-center justify-center py-16 text-text-faint">
              <Users className="w-12 h-12 mb-4 opacity-40" />
              <p className="text-base font-semibold text-text-muted mb-2">Select a Customer</p>
              <p className="text-sm">Choose a customer from the list to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
