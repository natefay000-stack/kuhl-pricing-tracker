'use client';

/**
 * Invoice Month View — sister of InvOpnMonthView, but shows ONLY the
 * invoiced (shipped − returned) dollars. No open / booked component.
 *
 * Useful for verifying invoice imports: any row that surfaces here has
 * a real invoiceNumber AND a non-zero shippedAtNet, which is the
 * cleanest signal that the row is a real invoice and not a booking
 * stub. Year × Month pivot + Style and Customer breakdowns.
 *
 * Cross-filtering matches Power BI behavior: clicking a row in the Style
 * or Customer table re-scopes the pivot table and the *other* breakdown
 * table. Click again to deselect.
 */

import { Fragment, useMemo, useState } from 'react';
import { InvoiceRecord, Product, SalesRecord } from '@/types/product';
import { sortSeasons } from '@/lib/store';
import { isRelevantSeason } from '@/utils/season';
import MultiSelect from '@/components/MultiSelect';
import { Search, Filter, X, Calendar, ChevronRight } from 'lucide-react';

interface InvoiceMonthViewProps {
  invoices: InvoiceRecord[];
  sales?: SalesRecord[];
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

export default function InvoiceMonthView({
  invoices: invoicesProp,
  sales = [],
  products,
  selectedSeason: globalSeason = '',
  onStyleClick,
}: InvoiceMonthViewProps) {
  // Union sales + invoices into a single record set. Sales records have the
  // same shape (openAtNet, shippedAtNet, returnedAtNet, invoiceDate, season,
  // customer…) as invoice records — they're often imported from a different
  // xlsx file but represent the same booked/shipped activity. We dedupe on
  // a composite key (invoiceNumber|styleNumber|colorCode|customer) when
  // available so the same physical line doesn't get double-counted.
  const invoices: InvoiceRecord[] = useMemo(() => {
    const out: InvoiceRecord[] = [];
    const seen = new Set<string>();
    const push = (r: InvoiceRecord) => {
      const key = r.invoiceNumber
        ? `${r.invoiceNumber}|${r.styleNumber}|${r.colorCode ?? ''}|${r.customer ?? ''}`
        : '';
      if (key && seen.has(key)) return;
      if (key) seen.add(key);
      out.push(r);
    };
    invoicesProp.forEach(push);
    sales.forEach((s) => {
      // A Sale row can represent either a shipped invoice line OR a booked-
      // but-not-yet-shipped order. The "Booked Net" report typically only
      // populates `revenue` (booked $), while the "Detailed/Invoiced" report
      // populates shippedAtNet / openAtNet / returnedAtNet. To avoid losing
      // open orders for future seasons, we infer open$ = revenue when the
      // detailed open$ field isn't set.
      const shipped = s.shippedAtNet ?? s.shipped ?? 0;
      const returned = s.returnedAtNet ?? 0;
      const explicitOpen = s.openAtNet ?? 0;
      // If openAtNet wasn't populated AND the row hasn't shipped yet, the
      // revenue (Booked Net) IS the open amount.
      const inferredOpen = explicitOpen > 0
        ? explicitOpen
        : Math.max(0, (s.revenue ?? 0) - shipped - returned);
      push({
        id: s.id,
        styleNumber: s.styleNumber,
        styleDesc: s.styleDesc,
        colorCode: s.colorCode,
        colorDesc: s.colorDesc,
        season: s.season,
        customer: s.customer,
        customerType: s.customerType,
        gender: s.gender,
        orderType: s.orderType,
        shipToState: s.shipToState,
        shipToCity: s.shipToCity,
        shipToZip: s.shipToZip,
        billToState: s.billToState,
        billToCity: s.billToCity,
        billToZip: s.billToZip,
        invoiceNumber: s.invoiceNumber,
        invoiceDate: s.invoiceDate,
        accountingPeriod: s.accountingPeriod,
        shippedAtNet: shipped,
        returnedAtNet: returned,
        openAtNet: inferredOpen,
        unitsShipped: s.unitsShipped,
        unitsReturned: s.unitsReturned,
      } as InvoiceRecord);
    });
    return out;
  }, [invoicesProp, sales]);
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

  // Date bucket resolver (used by both filter-match and pivot). Sales records
  // often lack invoiceDate for booked-but-not-yet-shipped lines, so we fall
  // back to accountingPeriod, then to a season-derived month.
  const MONTH_NAMES: Record<string, number> = {
    JAN: 0, JANUARY: 0, FEB: 1, FEBRUARY: 1, MAR: 2, MARCH: 2,
    APR: 3, APRIL: 3, MAY: 4, JUN: 5, JUNE: 5, JUL: 6, JULY: 6,
    AUG: 7, AUGUST: 7, SEP: 8, SEPT: 8, SEPTEMBER: 8, OCT: 9, OCTOBER: 9,
    NOV: 10, NOVEMBER: 10, DEC: 11, DECEMBER: 11,
  };

  const parseAcctPeriod = (raw: string): { y: number; m: number } | null => {
    const ap = raw.trim().toUpperCase();
    if (!ap) return null;
    // "MM/YYYY" or "M/YYYY" or "MM-YYYY"
    let match = ap.match(/^(\d{1,2})[\/\-\.](\d{4})$/);
    if (match) {
      const mm = parseInt(match[1], 10) - 1;
      const yy = parseInt(match[2], 10);
      if (mm >= 0 && mm <= 11) return { y: yy, m: mm };
    }
    // "YYYY/MM" or "YYYY-MM"
    match = ap.match(/^(\d{4})[\/\-\.](\d{1,2})$/);
    if (match) {
      const yy = parseInt(match[1], 10);
      const mm = parseInt(match[2], 10) - 1;
      if (mm >= 0 && mm <= 11) return { y: yy, m: mm };
    }
    // "YYYYMM" (6 digits)
    match = ap.match(/^(\d{4})(\d{2})$/);
    if (match) {
      const yy = parseInt(match[1], 10);
      const mm = parseInt(match[2], 10) - 1;
      if (mm >= 0 && mm <= 11) return { y: yy, m: mm };
    }
    // "MM/YY" or "M/YY"
    match = ap.match(/^(\d{1,2})[\/\-\.](\d{2})$/);
    if (match) {
      const mm = parseInt(match[1], 10) - 1;
      const yy = 2000 + parseInt(match[2], 10);
      if (mm >= 0 && mm <= 11) return { y: yy, m: mm };
    }
    // "MMMYY" / "MMM-YY" / "MMM YY" / "MMM YYYY"  (e.g. "MAR25", "MAR-25", "MAR 2025")
    match = ap.match(/^([A-Z]{3,9})[\s\-\/\.]?(\d{2,4})$/);
    if (match) {
      const monKey = match[1];
      const mm = MONTH_NAMES[monKey];
      if (mm !== undefined) {
        const rawYr = parseInt(match[2], 10);
        const yy = rawYr < 100 ? 2000 + rawYr : rawYr;
        return { y: yy, m: mm };
      }
    }
    // "P03-2025" / "P3-25" / "FY25P03"  → strip leading non-digits, retry
    const stripped = ap.replace(/^[A-Z]+/, '').replace(/^FY/, '');
    if (stripped !== ap) {
      const retry = parseAcctPeriod(stripped);
      if (retry) return retry;
    }
    // Last resort — try Date.parse
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return { y: d.getFullYear(), m: d.getMonth() };
    return null;
  };

  const resolveBucket = (inv: InvoiceRecord): { y: number; m: number } | null => {
    if (inv.invoiceDate) {
      const d = new Date(inv.invoiceDate);
      if (!isNaN(d.getTime())) return { y: d.getFullYear(), m: d.getMonth() };
    }
    if (inv.accountingPeriod) {
      const parsed = parseAcctPeriod(inv.accountingPeriod);
      if (parsed) return parsed;
    }
    if (inv.season) {
      const match = inv.season.match(/^(\d{2})(SP|FA)$/i);
      if (match) {
        const yy = 2000 + parseInt(match[1], 10);
        const mm = match[2].toUpperCase() === 'SP' ? 2 : 7;
        return { y: yy, m: mm };
      }
    }
    return null;
  };

  // Helper: does this invoice match the active filters? (Excludes the
  // invoice's own field for click-cross-filtering — see notes inline.)
  type FilterScope = 'all' | 'forPivot' | 'forStyleTable' | 'forCustomerTable';

  const matchesInvoice = (inv: InvoiceRecord, scope: FilterScope): boolean => {
    // Time filters
    if (monthFilter.length > 0) {
      const bucket = resolveBucket(inv);
      if (!bucket) return false;
      if (!monthFilter.includes(MONTHS_SHORT[bucket.m])) return false;
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
  // matching the active filters. Bucket date resolved via resolveBucket()
  // (defined above): invoiceDate → accountingPeriod → season-derived.
  // Invoice-only predicate: must have a real invoiceNumber AND a non-zero
  // net invoiced amount (shipped − returned). Filters out booked/open
  // stubs that have no invoice attached yet.
  const isInvoiced = (inv: InvoiceRecord): boolean => {
    if (!inv.invoiceNumber) return false;
    const net = (inv.shippedAtNet ?? 0) - (inv.returnedAtNet ?? 0);
    return net !== 0;
  };

  const yearMonthGrid = useMemo(() => {
    const grid = new Map<number, number[]>(); // year → [12 month buckets]
    let grandTotal = 0;
    invoices.forEach((inv) => {
      if (!isInvoiced(inv)) return;
      if (!matchesInvoice(inv, 'forPivot')) return;
      const bucket = resolveBucket(inv);
      if (!bucket) return;
      const { y, m } = bucket;
      if (!grid.has(y)) grid.set(y, new Array(12).fill(0));
      // Invoice Month: shippedAtNet − returnedAtNet only (no open / booked)
      const v = (inv.shippedAtNet ?? 0) - (inv.returnedAtNet ?? 0);
      grid.get(y)![m] += v;
      grandTotal += v;
    });
    // Hide empty years (every month bucket = 0)
    const years = Array.from(grid.keys())
      .filter((y) => (grid.get(y) ?? []).some((v) => v !== 0))
      .sort();
    return { years, grid, grandTotal };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    invoices,
    monthFilter, seasonFilter, customerTypeFilter, customerFilter,
    categoryFilter, genderFilter, orderTypeFilter, colorFilter, styleSearch,
    clickedStyle, clickedCustomer, globalSeason, styleToCategory,
  ]);

  // ── Style breakdown ──
  // For Invoice Month we re-purpose the two value columns:
  //   `open` field = $ Returned at Net (returns)
  //   `shipped` field = $ Net Invoiced (shipped − returned)
  const styleRows = useMemo(() => {
    const m = new Map<string, { styleNumber: string; styleDesc: string; open: number; shipped: number }>();
    invoices.forEach((inv) => {
      if (!isInvoiced(inv)) return;
      if (!matchesInvoice(inv, 'forStyleTable')) return;
      const sn = inv.styleNumber ?? '';
      if (!sn) return;
      const e = m.get(sn) ?? { styleNumber: sn, styleDesc: inv.styleDesc ?? '', open: 0, shipped: 0 };
      e.open += inv.returnedAtNet ?? 0;
      e.shipped += (inv.shippedAtNet ?? 0) - (inv.returnedAtNet ?? 0);
      if (!e.styleDesc && inv.styleDesc) e.styleDesc = inv.styleDesc;
      m.set(sn, e);
    });
    return Array.from(m.values())
      .filter((r) => r.open !== 0 || r.shipped !== 0)
      .sort((a, b) => b.shipped - a.shipped);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    invoices,
    monthFilter, seasonFilter, customerTypeFilter, customerFilter,
    categoryFilter, genderFilter, orderTypeFilter, colorFilter, styleSearch,
    clickedStyle, clickedCustomer, globalSeason, styleToCategory,
  ]);

  // ── Color breakdown for the currently expanded style (if any) ──
  // Recomputed when filters change; ignores the clickedStyle restriction
  // (we're explicitly scoping to clickedStyle, so we drop that one filter).
  const expandedStyleColors = useMemo(() => {
    if (!clickedStyle) return [];
    const m = new Map<string, { code: string; desc: string; open: number; shipped: number }>();
    invoices.forEach((inv) => {
      if (inv.styleNumber !== clickedStyle) return;
      if (!isInvoiced(inv)) return;
      // Apply every other filter (the styleTable scope skips clickedStyle for us)
      if (!matchesInvoice(inv, 'forStyleTable')) return;
      const code = (inv.colorCode ?? '').trim();
      const desc = (inv.colorDesc ?? '').trim();
      const key = code || desc || '(no color)';
      const e = m.get(key) ?? { code, desc: desc || code || '(no color)', open: 0, shipped: 0 };
      e.open += inv.returnedAtNet ?? 0;
      e.shipped += (inv.shippedAtNet ?? 0) - (inv.returnedAtNet ?? 0);
      if (!e.desc && desc) e.desc = desc;
      if (!e.code && code) e.code = code;
      m.set(key, e);
    });
    return Array.from(m.values())
      .filter((r) => r.open !== 0 || r.shipped !== 0)
      .sort((a, b) => (b.open + b.shipped) - (a.open + a.shipped));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    invoices, clickedStyle,
    monthFilter, seasonFilter, customerTypeFilter, customerFilter,
    categoryFilter, genderFilter, orderTypeFilter, colorFilter, styleSearch,
    clickedCustomer, globalSeason, styleToCategory,
  ]);

  // ── Customer breakdown ──
  const customerRows = useMemo(() => {
    const m = new Map<string, { customer: string; open: number; shipped: number }>();
    invoices.forEach((inv) => {
      if (!isInvoiced(inv)) return;
      if (!matchesInvoice(inv, 'forCustomerTable')) return;
      const c = inv.customer ?? '';
      if (!c) return;
      const e = m.get(c) ?? { customer: c, open: 0, shipped: 0 };
      e.open += inv.returnedAtNet ?? 0;
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

  // Detect: a season is being filtered for, but no invoice records exist for it.
  // This happens when the user picks a season globally that's only present in
  // products/sales but not in invoices.
  const activeSeasonFilters: string[] = seasonFilter.length > 0
    ? seasonFilter
    : (globalSeason && globalSeason !== '__ALL_SP__' && globalSeason !== '__ALL_FA__' ? [globalSeason] : []);
  const missingSeasons = activeSeasonFilters.filter((s) => !allSeasons.includes(s));

  // ── Diagnostic: how are the matching records resolving their date bucket? ──
  // (Helpful when a year shows up "wrong" — tells you if rows have real
  // invoiceDates from the report or are being season-fallback'd.)
  const dateSourceStats = useMemo(() => {
    let invoiceDate = 0, accountingPeriod = 0, seasonFallback = 0, unbucketable = 0, total = 0;
    const acctSamples = new Set<string>();
    invoices.forEach((inv) => {
      if (!matchesInvoice(inv, 'forPivot')) return;
      total++;
      if (inv.invoiceDate && !isNaN(new Date(inv.invoiceDate).getTime())) { invoiceDate++; return; }
      if (inv.accountingPeriod) {
        const parsed = parseAcctPeriod(inv.accountingPeriod);
        if (parsed) { accountingPeriod++; return; }
        if (acctSamples.size < 5) acctSamples.add(inv.accountingPeriod);
      }
      if (inv.season && /^\d{2}(SP|FA)$/i.test(inv.season)) { seasonFallback++; return; }
      unbucketable++;
    });
    return { invoiceDate, accountingPeriod, seasonFallback, unbucketable, total, acctSamples: Array.from(acctSamples) };
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
          <h2 className="text-4xl font-display font-bold text-text-primary">Invoice Month</h2>
          <p className="text-base text-text-muted mt-2">
            Net Invoiced (Shipped − Returned) bucketed by year × month — invoice records only, no booked/open. Use this to verify what was actually billed.
          </p>
          <p className="text-xs text-text-faint mt-1">
            {invoices.length.toLocaleString()} invoice records · click any style or customer row to cross-filter the pivot
          </p>
        </div>
      </div>

      {/* Empty-state banner: season filter has no matching invoice records */}
      {missingSeasons.length > 0 && (
        <div className="rounded-xl border-2 border-amber-500/40 bg-amber-500/10 p-4 flex items-start gap-3">
          <span className="text-amber-500 text-lg flex-shrink-0">⚠</span>
          <div className="text-sm">
            <p className="font-semibold text-amber-700 dark:text-amber-300">
              No invoice data for {missingSeasons.join(', ')}
            </p>
            <p className="text-text-muted mt-0.5">
              The header season filter is set to <span className="font-mono">{missingSeasons.join(', ')}</span>, but the invoice
              dataset doesn&apos;t contain any rows for it. This view reads the <span className="font-medium">Invoice</span> table only —
              try a different season from the local filter below, or re-import an invoice file that covers this season.
            </p>
            {allSeasons.length > 0 && (
              <p className="text-xs text-text-faint mt-1">
                Seasons present in invoices: <span className="font-mono">{allSeasons.join(', ')}</span>
              </p>
            )}
          </div>
        </div>
      )}

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

      {/* Diagnostic strip — date source breakdown for currently filtered rows */}
      {dateSourceStats.total > 0 && (
        <div className="text-xs text-text-muted bg-surface-secondary rounded-lg px-4 py-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="font-semibold text-text-secondary">Date sources ({dateSourceStats.total.toLocaleString()} matching rows):</span>
          <span>📅 Invoice date: <span className="font-mono text-emerald-500">{dateSourceStats.invoiceDate.toLocaleString()}</span></span>
          <span>🧾 Accounting period: <span className="font-mono text-cyan-500">{dateSourceStats.accountingPeriod.toLocaleString()}</span></span>
          <span>🌱 Season fallback: <span className="font-mono text-amber-500">{dateSourceStats.seasonFallback.toLocaleString()}</span></span>
          {dateSourceStats.unbucketable > 0 && (
            <span>⚠ Unbucketable: <span className="font-mono text-red-500">{dateSourceStats.unbucketable.toLocaleString()}</span></span>
          )}
          {dateSourceStats.acctSamples.length > 0 && (
            <span className="basis-full text-text-faint">
              Unparseable acct period samples: <span className="font-mono">{dateSourceStats.acctSamples.map((s) => `"${s}"`).join(', ')}</span>
            </span>
          )}
        </div>
      )}

      {/* Year × Month pivot */}
      <div className="bg-surface rounded-xl border-2 border-border-primary overflow-hidden">
        <div className="px-5 py-3 border-b border-border-primary bg-surface-secondary flex items-center gap-2">
          <Calendar className="w-4 h-4 text-text-muted" />
          <h3 className="font-semibold text-text-primary">Net Invoiced</h3>
          <span className="text-xs text-text-muted">(Shipped at Net − Returned at Net)</span>
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
                  <th className="text-right px-3 py-2 font-semibold">$ Returns</th>
                  <th className="text-right px-3 py-2 font-semibold">$ Net Invoiced</th>
                </tr>
              </thead>
              <tbody>
                {styleRows.length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-4 text-center text-text-muted">No matching styles.</td></tr>
                )}
                {styleRows.slice(0, 200).map((r) => {
                  const isActive = clickedStyle === r.styleNumber;
                  return (
                    <Fragment key={r.styleNumber}>
                      <tr
                        onClick={() => setClickedStyle(isActive ? null : r.styleNumber)}
                        onDoubleClick={() => onStyleClick?.(r.styleNumber)}
                        className={`border-b border-border-primary/50 cursor-pointer ${
                          isActive ? 'bg-cyan-500/10' : 'hover:bg-hover-accent'
                        }`}
                        title="Click to expand colors + cross-filter · Double-click to open style detail"
                      >
                        <td className="px-3 py-1.5 font-mono font-semibold text-text-primary">
                          <span className="inline-flex items-center gap-1">
                            <ChevronRight
                              className={`w-3.5 h-3.5 text-text-muted transition-transform flex-shrink-0 ${
                                isActive ? 'rotate-90 text-cyan-400' : ''
                              }`}
                            />
                            {r.styleNumber}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-text-secondary truncate max-w-[200px]">{r.styleDesc}</td>
                        <td className={`px-3 py-1.5 text-right font-mono ${r.open === 0 ? 'text-text-faint' : 'text-text-primary'}`}>
                          {fmtMillions(r.open)}
                        </td>
                        <td className={`px-3 py-1.5 text-right font-mono ${r.shipped === 0 ? 'text-text-faint' : 'text-text-primary'}`}>
                          {fmtMillions(r.shipped)}
                        </td>
                      </tr>
                      {/* Expanded color breakdown for this style */}
                      {isActive && (
                        expandedStyleColors.length === 0 ? (
                          <tr className="border-b border-border-primary/50 bg-cyan-500/5">
                            <td colSpan={4} className="px-12 py-2 text-xs text-text-muted italic">
                              No color-level data for this style under the current filters.
                            </td>
                          </tr>
                        ) : (
                          expandedStyleColors.map((c) => (
                            <tr key={`${r.styleNumber}-${c.code || c.desc}`} className="border-b border-border-primary/50 bg-cyan-500/5">
                              <td className="pl-10 pr-3 py-1.5 text-text-faint text-xs"></td>
                              <td className="px-3 py-1.5 text-xs text-text-secondary truncate max-w-[200px]">
                                <span className="font-mono text-text-muted mr-2">{c.code || '—'}</span>
                                {c.desc}
                              </td>
                              <td className={`px-3 py-1.5 text-right font-mono text-xs ${c.open === 0 ? 'text-text-faint' : 'text-text-primary'}`}>
                                {fmtMillions(c.open)}
                              </td>
                              <td className={`px-3 py-1.5 text-right font-mono text-xs ${c.shipped === 0 ? 'text-text-faint' : 'text-text-primary'}`}>
                                {fmtMillions(c.shipped)}
                              </td>
                            </tr>
                          ))
                        )
                      )}
                    </Fragment>
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
                  <th className="text-right px-3 py-2 font-semibold">$ Returns</th>
                  <th className="text-right px-3 py-2 font-semibold">$ Net Invoiced</th>
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
