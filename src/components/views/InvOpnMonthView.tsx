'use client';

/**
 * Inv-Opn Month View — replicates the company's Power BI page that shows
 * Combined Total (Booked Net + Invoiced − Cancelled Net) bucketed by
 * year × month, with Style and Customer breakdowns at the bottom.
 *
 * Data source: Invoice records (have openAtNet, shippedAtNet, returnedAtNet,
 * invoiceDate, customer, customerType, season, etc.). Combined Total per
 * invoice = openAtNet + shippedAtNet − returnedAtNet.
 *
 * Cross-filtering matches Power BI behavior: clicking a row in the Style
 * or Customer table re-scopes the pivot table and the *other* breakdown
 * table. Click again to deselect.
 */

import { useMemo, useState } from 'react';
import { InvoiceRecord, Product } from '@/types/product';
import { sortSeasons } from '@/lib/store';
import { isRelevantSeason } from '@/utils/season';
import MultiSelect from '@/components/MultiSelect';
import { Search, Filter, X, Calendar } from 'lucide-react';

interface InvOpnMonthViewProps {
  invoices: InvoiceRecord[];
  products: Product[];
  selectedSeason?: string;
  onStyleClick?: (styleNumber: string) => void;
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const fmtMillions = (v: number) => {
  if (!Number.isFinite(v) || v === 0) return '—';
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${Math.round(v)}`;
};

const fmtFull = (v: number) => {
  if (!Number.isFinite(v) || v === 0) return '—';
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
};

export default function InvOpnMonthView({
  invoices,
  products,
  selectedSeason: globalSeason = '',
  onStyleClick,
}: InvOpnMonthViewProps) {
  // ── Local filter state (multi-select arrays) ──
  const [monthFilter, setMonthFilter] = useState<string[]>([]);
  const [seasonFilter, setSeasonFilter] = useState<string[]>([]);
  const [customerTypeFilter, setCustomerTypeFilter] = useState<string[]>([]);
  const [customerFilter, setCustomerFilter] = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [genderFilter, setGenderFilter] = useState<string[]>([]);
  const [orderTypeFilter, setOrderTypeFilter] = useState<string[]>([]);
  const [colorFilter, setColorFilter] = useState<string[]>([]);
  const [styleSearch, setStyleSearch] = useState('');

  // Click-to-cross-filter: when a row is clicked, scope all other panels
  const [clickedStyle, setClickedStyle] = useState<string | null>(null);
  const [clickedCustomer, setClickedCustomer] = useState<string | null>(null);

  // ── Lookup: styleNumber → categoryDesc (since invoices don't carry it directly) ──
  const styleToCategory = useMemo(() => {
    const m = new Map<string, string>();
    products.forEach((p) => {
      if (p.styleNumber && p.categoryDesc && !m.has(p.styleNumber)) {
        m.set(p.styleNumber, p.categoryDesc);
      }
    });
    return m;
  }, [products]);

  // ── Apply global season prop to local filter once ──
  // (one-way — local state is the source of truth after initial sync)
  // No effect needed: we just use `globalSeason` as a default if seasonFilter is empty.

  // Helper: does this invoice match the active filters? (Excludes the
  // invoice's own field for click-cross-filtering — see notes inline.)
  type FilterScope = 'all' | 'forPivot' | 'forStyleTable' | 'forCustomerTable';

  const matchesInvoice = (inv: InvoiceRecord, scope: FilterScope): boolean => {
    // Time filters
    if (monthFilter.length > 0) {
      if (!inv.invoiceDate) return false;
      const m = new Date(inv.invoiceDate).getMonth();
      if (!monthFilter.includes(MONTHS_SHORT[m])) return false;
    }
    // Season filter (local takes priority; fall back to global if local empty)
    const effectiveSeasons = seasonFilter.length > 0 ? seasonFilter : (globalSeason && globalSeason !== '__ALL_SP__' && globalSeason !== '__ALL_FA__' ? [globalSeason] : []);
    if (effectiveSeasons.length > 0) {
      if (!inv.season || !effectiveSeasons.includes(inv.season)) return false;
    }
    // Customer Type
    if (customerTypeFilter.length > 0) {
      if (!inv.customerType) return false;
      const parts = inv.customerType.toUpperCase().split(',').map((p) => p.trim());
      if (!parts.some((p) => customerTypeFilter.map((c) => c.toUpperCase()).includes(p))) return false;
    }
    // Customer
    if (customerFilter.length > 0) {
      if (!inv.customer || !customerFilter.includes(inv.customer)) return false;
    }
    // Gender
    if (genderFilter.length > 0) {
      if (!inv.gender || !genderFilter.includes(inv.gender)) return false;
    }
    // Order Type
    if (orderTypeFilter.length > 0) {
      if (!inv.orderType || !orderTypeFilter.includes(inv.orderType)) return false;
    }
    // Color (matches against colorDesc; falls back to colorCode if desc is empty)
    if (colorFilter.length > 0) {
      const color = (inv.colorDesc ?? '').trim() || (inv.colorCode ?? '').trim();
      if (!color || !colorFilter.includes(color)) return false;
    }
    // Category (from styleNumber via product lookup)
    if (categoryFilter.length > 0) {
      const cat = styleToCategory.get(inv.styleNumber ?? '');
      if (!cat || !categoryFilter.includes(cat)) return false;
    }
    // Style search
    if (styleSearch) {
      const q = styleSearch.toLowerCase();
      const sn = (inv.styleNumber ?? '').toLowerCase();
      const sd = (inv.styleDesc ?? '').toLowerCase();
      if (!sn.includes(q) && !sd.includes(q)) return false;
    }
    // Click cross-filters: skip the field we're computing the breakdown for,
    // so the table doesn't filter itself out.
    if (clickedStyle && scope !== 'forStyleTable' && inv.styleNumber !== clickedStyle) return false;
    if (clickedCustomer && scope !== 'forCustomerTable' && inv.customer !== clickedCustomer) return false;
    return true;
  };

  // ── Derived filter option lists (from full invoice set + products) ──
  const allSeasons = useMemo(() => {
    const set = new Set<string>();
    invoices.forEach((i) => i.season && set.add(i.season));
    return sortSeasons(Array.from(set).filter((s) => isRelevantSeason(s)));
  }, [invoices]);

  const customerTypes = useMemo(() => {
    const set = new Set<string>();
    invoices.forEach((i) => {
      if (!i.customerType) return;
      i.customerType.split(',').forEach((p) => set.add(p.trim().toUpperCase()));
    });
    return Array.from(set).filter(Boolean).sort();
  }, [invoices]);

  const customers = useMemo(() => {
    const set = new Set<string>();
    invoices.forEach((i) => i.customer && set.add(i.customer));
    return Array.from(set).sort();
  }, [invoices]);

  const genders = useMemo(() => {
    const set = new Set<string>();
    invoices.forEach((i) => i.gender && set.add(i.gender));
    return Array.from(set).sort();
  }, [invoices]);

  const orderTypes = useMemo(() => {
    const set = new Set<string>();
    invoices.forEach((i) => i.orderType && set.add(i.orderType));
    return Array.from(set).sort();
  }, [invoices]);

  const colors = useMemo(() => {
    const set = new Set<string>();
    invoices.forEach((i) => {
      const c = (i.colorDesc ?? '').trim() || (i.colorCode ?? '').trim();
      if (c) set.add(c);
    });
    return Array.from(set).sort();
  }, [invoices]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => p.categoryDesc && set.add(p.categoryDesc));
    return Array.from(set).sort();
  }, [products]);

  // ── Year × Month pivot ──
  // Cell value = sum(openAtNet + shippedAtNet − returnedAtNet) for invoices
  // matching the active filters AND the click-selected style/customer.
  const yearMonthGrid = useMemo(() => {
    const grid = new Map<number, number[]>(); // year → [12 month buckets]
    let grandTotal = 0;
    invoices.forEach((inv) => {
      if (!matchesInvoice(inv, 'forPivot')) return;
      if (!inv.invoiceDate) return;
      const d = new Date(inv.invoiceDate);
      const y = d.getFullYear();
      const m = d.getMonth();
      if (!grid.has(y)) grid.set(y, new Array(12).fill(0));
      const v = (inv.openAtNet ?? 0) + (inv.shippedAtNet ?? 0) - (inv.returnedAtNet ?? 0);
      grid.get(y)![m] += v;
      grandTotal += v;
    });
    const years = Array.from(grid.keys()).sort();
    return { years, grid, grandTotal };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    invoices,
    monthFilter, seasonFilter, customerTypeFilter, customerFilter,
    categoryFilter, genderFilter, orderTypeFilter, colorFilter, styleSearch,
    clickedStyle, clickedCustomer, globalSeason, styleToCategory,
  ]);

  // ── Style breakdown ──
  const styleRows = useMemo(() => {
    const m = new Map<string, { styleNumber: string; styleDesc: string; open: number; shipped: number }>();
    invoices.forEach((inv) => {
      if (!matchesInvoice(inv, 'forStyleTable')) return;
      const sn = inv.styleNumber ?? '';
      if (!sn) return;
      const e = m.get(sn) ?? { styleNumber: sn, styleDesc: inv.styleDesc ?? '', open: 0, shipped: 0 };
      e.open += inv.openAtNet ?? 0;
      e.shipped += (inv.shippedAtNet ?? 0) - (inv.returnedAtNet ?? 0);
      if (!e.styleDesc && inv.styleDesc) e.styleDesc = inv.styleDesc;
      m.set(sn, e);
    });
    return Array.from(m.values())
      .filter((r) => r.open !== 0 || r.shipped !== 0)
      .sort((a, b) => (b.open + b.shipped) - (a.open + a.shipped));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    invoices,
    monthFilter, seasonFilter, customerTypeFilter, customerFilter,
    categoryFilter, genderFilter, orderTypeFilter, colorFilter, styleSearch,
    clickedStyle, clickedCustomer, globalSeason, styleToCategory,
  ]);

  // ── Customer breakdown ──
  const customerRows = useMemo(() => {
    const m = new Map<string, { customer: string; open: number; shipped: number }>();
    invoices.forEach((inv) => {
      if (!matchesInvoice(inv, 'forCustomerTable')) return;
      const c = inv.customer ?? '';
      if (!c) return;
      const e = m.get(c) ?? { customer: c, open: 0, shipped: 0 };
      e.open += inv.openAtNet ?? 0;
      e.shipped += (inv.shippedAtNet ?? 0) - (inv.returnedAtNet ?? 0);
      m.set(c, e);
    });
    return Array.from(m.values())
      .filter((r) => r.open !== 0 || r.shipped !== 0)
      .sort((a, b) => (b.open + b.shipped) - (a.open + a.shipped));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    invoices,
    monthFilter, seasonFilter, customerTypeFilter, customerFilter,
    categoryFilter, genderFilter, orderTypeFilter, colorFilter, styleSearch,
    clickedStyle, clickedCustomer, globalSeason, styleToCategory,
  ]);

  const hasAnyFilter =
    monthFilter.length > 0 ||
    seasonFilter.length > 0 ||
    customerTypeFilter.length > 0 ||
    customerFilter.length > 0 ||
    categoryFilter.length > 0 ||
    genderFilter.length > 0 ||
    orderTypeFilter.length > 0 ||
    colorFilter.length > 0 ||
    styleSearch !== '' ||
    clickedStyle !== null ||
    clickedCustomer !== null;

  const clearAll = () => {
    setMonthFilter([]);
    setSeasonFilter([]);
    setCustomerTypeFilter([]);
    setCustomerFilter([]);
    setCategoryFilter([]);
    setGenderFilter([]);
    setOrderTypeFilter([]);
    setColorFilter([]);
    setStyleSearch('');
    setClickedStyle(null);
    setClickedCustomer(null);
  };

  // Compute year-row totals + month-column totals for the pivot
  const yearTotals = new Map<number, number>();
  const monthTotals = new Array(12).fill(0);
  yearMonthGrid.years.forEach((y) => {
    const row = yearMonthGrid.grid.get(y)!;
    let sum = 0;
    row.forEach((v, i) => {
      sum += v;
      monthTotals[i] += v;
    });
    yearTotals.set(y, sum);
  });

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-4xl font-display font-bold text-text-primary">Inv-Opn Month</h2>
          <p className="text-base text-text-muted mt-2">
            Combined Total (Booked Net + Invoiced − Cancelled Net) bucketed by year × month, with style and customer breakdowns.
          </p>
          <p className="text-xs text-text-faint mt-1">
            {invoices.length.toLocaleString()} invoice records · click any style or customer row to cross-filter the pivot
          </p>
        </div>
      </div>

      {/* Click-active filter chips */}
      {(clickedStyle || clickedCustomer) && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs uppercase tracking-wide text-text-muted font-semibold">Cross-filtered:</span>
          {clickedStyle && (
            <button
              onClick={() => setClickedStyle(null)}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/20"
            >
              Style: <span className="font-mono">{clickedStyle}</span>
              <X className="w-3 h-3" />
            </button>
          )}
          {clickedCustomer && (
            <button
              onClick={() => setClickedCustomer(null)}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30 hover:bg-purple-500/20"
            >
              Customer: {clickedCustomer}
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      {/* Filter strip */}
      <div className="bg-surface rounded-xl border-2 border-border-primary p-4 flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold text-text-secondary uppercase tracking-wide">Style</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-faint" />
            <input
              type="text"
              value={styleSearch}
              onChange={(e) => setStyleSearch(e.target.value)}
              placeholder="Style # / desc"
              className="pl-9 pr-3 py-2 text-sm border-2 border-border-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 w-[200px]"
            />
          </div>
        </div>
        <MultiSelect label="Month" placeholder="All months" options={MONTHS_SHORT.slice()} values={monthFilter} onChange={setMonthFilter} widthClass="w-[140px]" />
        <MultiSelect label="Season" placeholder="All seasons" options={allSeasons} values={seasonFilter} onChange={setSeasonFilter} widthClass="w-[170px]" />
        <MultiSelect label="Customer Type" placeholder="All types" options={customerTypes} values={customerTypeFilter} onChange={setCustomerTypeFilter} widthClass="w-[170px]" />
        <MultiSelect label="Customer" placeholder="All customers" options={customers} values={customerFilter} onChange={setCustomerFilter} widthClass="w-[200px]" />
        <MultiSelect label="Category" placeholder="All categories" options={categories} values={categoryFilter} onChange={setCategoryFilter} widthClass="w-[170px]" />
        <MultiSelect label="Gender" placeholder="All genders" options={genders} values={genderFilter} onChange={setGenderFilter} widthClass="w-[140px]" />
        <MultiSelect label="Order Type" placeholder="All order types" options={orderTypes} values={orderTypeFilter} onChange={setOrderTypeFilter} widthClass="w-[170px]" />
        <MultiSelect label="Color" placeholder="All colors" options={colors} values={colorFilter} onChange={setColorFilter} widthClass="w-[170px]" />
        {hasAnyFilter && (
          <button
            onClick={clearAll}
            className="flex items-center gap-1 px-3 py-2 text-sm font-semibold text-cyan-600 hover:bg-hover-accent rounded-lg"
          >
            <X className="w-4 h-4" /> Clear
          </button>
        )}
        <div className="ml-auto flex items-center gap-2 text-xs text-text-muted">
          <Filter className="w-3.5 h-3.5" />
          {fmtFull(yearMonthGrid.grandTotal)} total
        </div>
      </div>

      {/* Year × Month pivot */}
      <div className="bg-surface rounded-xl border-2 border-border-primary overflow-hidden">
        <div className="px-5 py-3 border-b border-border-primary bg-surface-secondary flex items-center gap-2">
          <Calendar className="w-4 h-4 text-text-muted" />
          <h3 className="font-semibold text-text-primary">Combined Total</h3>
          <span className="text-xs text-text-muted">(Booked Net + Invoiced − Cancelled Net)</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-tertiary border-b border-border-primary text-xs uppercase text-text-secondary">
                <th className="text-left px-3 py-2 font-semibold sticky left-0 bg-surface-tertiary">Year</th>
                {MONTHS_SHORT.map((m) => (
                  <th key={m} className="text-right px-2 py-2 font-semibold">{m}</th>
                ))}
                <th className="text-right px-3 py-2 font-bold border-l-2 border-border-strong bg-surface-secondary">Annual</th>
              </tr>
            </thead>
            <tbody>
              {yearMonthGrid.years.length === 0 && (
                <tr>
                  <td colSpan={14} className="px-3 py-4 text-center text-text-muted">
                    No invoice activity matches the current filters.
                  </td>
                </tr>
              )}
              {yearMonthGrid.years.map((y) => {
                const row = yearMonthGrid.grid.get(y)!;
                const total = yearTotals.get(y) ?? 0;
                return (
                  <tr key={y} className="border-b border-border-primary/50 hover:bg-hover-accent">
                    <td className="px-3 py-1.5 font-mono font-semibold text-text-primary sticky left-0 bg-surface">
                      {y}
                    </td>
                    {row.map((v, i) => (
                      <td key={i} className={`px-2 py-1.5 text-right font-mono ${v === 0 ? 'text-text-faint' : 'text-text-primary'}`}>
                        {v === 0 ? '—' : fmtMillions(v)}
                      </td>
                    ))}
                    <td className="px-3 py-1.5 text-right font-mono font-bold text-text-primary border-l-2 border-border-strong bg-surface-secondary">
                      {fmtMillions(total)}
                    </td>
                  </tr>
                );
              })}
              {yearMonthGrid.years.length > 0 && (
                <tr className="border-t-2 border-border-strong bg-surface-tertiary">
                  <td className="px-3 py-2 font-bold text-text-primary sticky left-0 bg-surface-tertiary">Total</td>
                  {monthTotals.map((v, i) => (
                    <td key={i} className={`px-2 py-2 text-right font-mono font-bold ${v === 0 ? 'text-text-faint' : 'text-text-primary'}`}>
                      {v === 0 ? '—' : fmtMillions(v)}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right font-mono font-bold text-cyan-600 dark:text-cyan-400 border-l-2 border-border-strong">
                    {fmtMillions(yearMonthGrid.grandTotal)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Style + Customer breakdown side-by-side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Styles */}
        <div className="bg-surface rounded-xl border-2 border-border-primary overflow-hidden">
          <div className="px-5 py-3 border-b border-border-primary bg-surface-secondary flex items-center justify-between">
            <h3 className="font-semibold text-text-primary">By Style</h3>
            <span className="text-xs text-text-muted">{styleRows.length.toLocaleString()} styles</span>
          </div>
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0">
                <tr className="bg-surface-tertiary border-b border-border-primary text-xs uppercase text-text-secondary">
                  <th className="text-left px-3 py-2 font-semibold">Style</th>
                  <th className="text-left px-3 py-2 font-semibold">Style Desc</th>
                  <th className="text-right px-3 py-2 font-semibold">$ Open net</th>
                  <th className="text-right px-3 py-2 font-semibold">$ Shipped Invoice</th>
                </tr>
              </thead>
              <tbody>
                {styleRows.length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-4 text-center text-text-muted">No matching styles.</td></tr>
                )}
                {styleRows.slice(0, 200).map((r) => {
                  const isActive = clickedStyle === r.styleNumber;
                  return (
                    <tr
                      key={r.styleNumber}
                      onClick={() => setClickedStyle(isActive ? null : r.styleNumber)}
                      onDoubleClick={() => onStyleClick?.(r.styleNumber)}
                      className={`border-b border-border-primary/50 cursor-pointer ${
                        isActive ? 'bg-cyan-500/10' : 'hover:bg-hover-accent'
                      }`}
                      title="Click to cross-filter · Double-click to open style detail"
                    >
                      <td className="px-3 py-1.5 font-mono font-semibold text-text-primary">{r.styleNumber}</td>
                      <td className="px-3 py-1.5 text-text-secondary truncate max-w-[200px]">{r.styleDesc}</td>
                      <td className={`px-3 py-1.5 text-right font-mono ${r.open === 0 ? 'text-text-faint' : 'text-text-primary'}`}>
                        {fmtMillions(r.open)}
                      </td>
                      <td className={`px-3 py-1.5 text-right font-mono ${r.shipped === 0 ? 'text-text-faint' : 'text-text-primary'}`}>
                        {fmtMillions(r.shipped)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Customers */}
        <div className="bg-surface rounded-xl border-2 border-border-primary overflow-hidden">
          <div className="px-5 py-3 border-b border-border-primary bg-surface-secondary flex items-center justify-between">
            <h3 className="font-semibold text-text-primary">By Customer</h3>
            <span className="text-xs text-text-muted">{customerRows.length.toLocaleString()} customers</span>
          </div>
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0">
                <tr className="bg-surface-tertiary border-b border-border-primary text-xs uppercase text-text-secondary">
                  <th className="text-left px-3 py-2 font-semibold">Customer Name</th>
                  <th className="text-right px-3 py-2 font-semibold">$ Open net</th>
                  <th className="text-right px-3 py-2 font-semibold">$ Shipped Invoice</th>
                </tr>
              </thead>
              <tbody>
                {customerRows.length === 0 && (
                  <tr><td colSpan={3} className="px-3 py-4 text-center text-text-muted">No matching customers.</td></tr>
                )}
                {customerRows.slice(0, 200).map((r) => {
                  const isActive = clickedCustomer === r.customer;
                  return (
                    <tr
                      key={r.customer}
                      onClick={() => setClickedCustomer(isActive ? null : r.customer)}
                      className={`border-b border-border-primary/50 cursor-pointer ${
                        isActive ? 'bg-purple-500/10' : 'hover:bg-hover-accent'
                      }`}
                      title="Click to cross-filter the pivot + style table"
                    >
                      <td className="px-3 py-1.5 text-text-primary truncate max-w-[260px]">{r.customer}</td>
                      <td className={`px-3 py-1.5 text-right font-mono ${r.open === 0 ? 'text-text-faint' : 'text-text-primary'}`}>
                        {fmtMillions(r.open)}
                      </td>
                      <td className={`px-3 py-1.5 text-right font-mono ${r.shipped === 0 ? 'text-text-faint' : 'text-text-primary'}`}>
                        {fmtMillions(r.shipped)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
