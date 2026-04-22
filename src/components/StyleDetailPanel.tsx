'use client';

import { useEffect, useMemo, useState } from 'react';
import { Product, SalesRecord, PricingRecord, CostRecord } from '@/types/product';
import { sortSeasons, matchesSeason } from '@/lib/store';
import {
  X,
  TrendingUp,
  TrendingDown,
  Clock,
  Edit3,
  History,
  Filter,
  DollarSign,
  Users,
  Palette,
  MapPin,
  Package,
} from 'lucide-react';
import { formatCurrencyShort } from '@/utils/format';
import { buildCostFallbackLookup } from '@/utils/costFallback';
import { matchesDivision } from '@/utils/divisionMap';
import CostEditModal from '@/components/CostEditModal';
import CostHistoryModal from '@/components/CostHistoryModal';
import PriceEditModal from '@/components/PriceEditModal';
import PricingHistoryModal from '@/components/PricingHistoryModal';

interface StyleDetailPanelProps {
  styleNumber: string;
  products: Product[];
  sales: SalesRecord[];
  pricing: PricingRecord[];
  costs: CostRecord[];
  // Global filter context — panel aggregations respect these.
  selectedSeason?: string;
  selectedDivision?: string;
  selectedCategory?: string;
  onClose: () => void;
  onCostUpdated?: (updated: CostRecord) => void;
  onPricingUpdated?: (updated: PricingRecord) => void;
}

interface EditEntry {
  id: string;
  kind: 'price' | 'cost';
  field: string;
  season: string;
  oldValue: number | null;
  newValue: number | null;
  editedBy: string;
  note: string | null;
  editedAt: string;
}

const CHANNEL_LABELS: Record<string, string> = {
  WH: 'Wholesale',
  WD: 'Wholesale Direct',
  BB: 'REI / Big Box',
  PS: 'Pro Sales',
  EC: 'E-commerce',
  KI: 'KÜHL Internal',
  DTC: 'DTC',
};

const formatCurrency = (v: number | null | undefined): string => {
  if (v == null || !Number.isFinite(v)) return '—';
  return `$${v.toFixed(2)}`;
};

const formatPct = (v: number | null | undefined, digits = 1): string => {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${v.toFixed(digits)}%`;
};

const formatNumber = (v: number | null | undefined): string => {
  if (v == null || !Number.isFinite(v)) return '—';
  return v.toLocaleString();
};

const formatEditDate = (iso: string): string => {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
};

export default function StyleDetailPanel({
  styleNumber,
  products,
  sales,
  pricing,
  costs,
  selectedSeason = '',
  selectedDivision = '',
  selectedCategory = '',
  onClose,
  onCostUpdated,
  onPricingUpdated,
}: StyleDetailPanelProps) {
  // Modal state
  const [editing, setEditing] = useState(false);
  const [viewingHistory, setViewingHistory] = useState(false);
  const [editingPrice, setEditingPrice] = useState(false);
  const [viewingPriceHistory, setViewingPriceHistory] = useState(false);

  // Panel-level season filter. 'all' defers to the parent view's global
  // selectedSeason. Picking a pill overrides that to a single season so
  // the user can scope any of the sales-driven aggregations without
  // leaving the panel.
  const [panelSeason, setPanelSeason] = useState<string>('all');

  // Style metadata (first Product match for this style)
  const styleInfo = useMemo(() => {
    return products.find((p) => p.styleNumber === styleNumber) ?? null;
  }, [products, styleNumber]);

  // Seasons this style has appeared in, derived from raw sales ignoring
  // any filters — used to populate the panel's pill row.
  const styleSeasons = useMemo(() => {
    const seen = new Set<string>();
    for (const s of sales) {
      if (s.styleNumber === styleNumber && s.season) seen.add(s.season);
    }
    return sortSeasons(Array.from(seen));
  }, [sales, styleNumber]);

  // Reset the panel season when switching styles so we don't carry a stale
  // pick from the previous detail view.
  useEffect(() => {
    setPanelSeason('all');
  }, [styleNumber]);

  // ── Filter-aware sales set ──
  // Sales aggregations (channel, customer, color, geography) respect
  // selectedSeason / selectedDivision / selectedCategory. Pricing + Cost
  // tables stay full-history since they're catalog-level reference data.
  //
  // `panelSeason` is an explicit in-panel override: when set to a specific
  // season it overrides the parent's global selectedSeason for the panel
  // only. 'all' means "defer to whatever the parent view had selected".
  const filteredSales = useMemo(() => {
    return sales.filter((s) => {
      if (s.styleNumber !== styleNumber) return false;
      if (panelSeason !== 'all') {
        if (s.season !== panelSeason) return false;
      } else if (selectedSeason && !matchesSeason(s.season, selectedSeason)) {
        return false;
      }
      if (selectedDivision && !matchesDivision(s.divisionDesc ?? '', selectedDivision)) return false;
      if (selectedCategory && s.categoryDesc !== selectedCategory) return false;
      return true;
    });
  }, [sales, styleNumber, selectedSeason, selectedDivision, selectedCategory, panelSeason]);

  // ── Pricing by Season ──
  const pricingBySeason = useMemo(() => {
    const stylePricing = pricing.filter((p) => p.styleNumber === styleNumber);
    const seasons = sortSeasons(stylePricing.map((p) => p.season));

    return seasons.map((season, index) => {
      const record = stylePricing.find((p) => p.season === season);
      const prevRecord = index > 0 ? stylePricing.find((p) => p.season === seasons[index - 1]) : null;

      let change: number | null = null;
      if (record && prevRecord && prevRecord.price > 0) {
        change = ((record.price - prevRecord.price) / prevRecord.price) * 100;
      }

      return {
        season,
        price: record?.price || 0,
        msrp: record?.msrp || 0,
        change,
      };
    });
  }, [pricing, styleNumber]);

  const latestPricingRecord = useMemo(() => {
    const stylePricing = pricing.filter((p) => p.styleNumber === styleNumber);
    if (stylePricing.length === 0) return null;
    const seasons = sortSeasons(stylePricing.map((p) => p.season));
    const latest = seasons[seasons.length - 1];
    return stylePricing.find((p) => p.season === latest) ?? null;
  }, [pricing, styleNumber]);

  // ── Cost breakdown by season (full-history) ──
  const costBreakdownBySeason = useMemo(() => {
    const rows = costs.filter((c) => c.styleNumber === styleNumber);
    const seasons = sortSeasons(rows.map((c) => c.season));
    return seasons.map((season) => {
      const c = rows.find((r) => r.season === season);
      return {
        season,
        fob: c?.fob ?? 0,
        duty: c?.dutyCost ?? 0,
        tariff: c?.tariffCost ?? 0,
        freight: c?.freightCost ?? 0,
        overhead: c?.overheadCost ?? 0,
        landed: c?.landed ?? 0,
        factory: c?.factory ?? '',
        coo: c?.countryOfOrigin ?? '',
        source: c?.costSource ?? '',
      };
    });
  }, [costs, styleNumber]);

  // ── Per-season margin row (latest season's pricing + cost) ──
  const costInfo = useMemo(() => {
    const latestPricing = pricingBySeason[pricingBySeason.length - 1];
    if (!latestPricing) return null;

    const fallbackLookup = buildCostFallbackLookup(costs, products);

    let styleCost = costs.find(
      (c) => c.styleNumber === styleNumber && c.season === latestPricing.season && c.landed > 0,
    );
    let fallbackSeason: string | undefined;
    if (!styleCost) {
      styleCost = costs.find((c) => c.styleNumber === styleNumber && c.landed > 0);
    }

    let landedCost = styleCost?.landed ?? 0;
    if (landedCost <= 0) {
      const result = fallbackLookup.getCostWithFallback(styleNumber, latestPricing.season);
      if (result.cost > 0) {
        landedCost = result.cost;
        if (result.source === 'fallback') fallbackSeason = result.fallbackSeason;
      }
    }
    if (landedCost <= 0) return null;

    const margin = latestPricing.price > 0
      ? ((latestPricing.price - landedCost) / latestPricing.price) * 100
      : 0;

    return {
      cost: landedCost,
      wholesale: latestPricing.price,
      msrp: latestPricing.msrp,
      margin,
      factory: styleCost?.factory,
      coo: styleCost?.countryOfOrigin,
      fallbackSeason,
      costRecord: fallbackSeason ? null : (styleCost ?? null),
    };
  }, [costs, products, styleNumber, pricingBySeason]);

  // ── Sales by channel (filter-aware, enhanced) ──
  const salesByChannel = useMemo(() => {
    const grouped = new Map<string, { revenue: number; units: number }>();
    filteredSales.forEach((s) => {
      // Break out comma-separated aggregates the same way other views do
      const raw = (s.customerType ?? 'Other').toString().toUpperCase();
      const channels = raw.includes(',')
        ? raw.split(',').map((x) => x.trim()).filter(Boolean)
        : [raw];
      // Attribute to the first known channel only (avoids double counting)
      const ch = channels[0] || 'Other';
      const e = grouped.get(ch) ?? { revenue: 0, units: 0 };
      e.revenue += s.revenue || 0;
      e.units += s.unitsBooked || 0;
      grouped.set(ch, e);
    });
    const totalRev = Array.from(grouped.values()).reduce((x, c) => x + c.revenue, 0);
    const landedForMargin = costInfo?.cost ?? 0;

    return Array.from(grouped.entries())
      .map(([channel, data]) => {
        const avgNetPrice = data.units > 0 ? data.revenue / data.units : 0;
        const margin =
          avgNetPrice > 0 && landedForMargin > 0
            ? ((avgNetPrice - landedForMargin) / avgNetPrice) * 100
            : null;
        return {
          channel,
          revenue: data.revenue,
          units: data.units,
          avgNetPrice,
          margin,
          share: totalRev > 0 ? (data.revenue / totalRev) * 100 : 0,
        };
      })
      .sort((a, b) => b.revenue - a.revenue);
  }, [filteredSales, costInfo]);

  // ── Top customers (filter-aware) ──
  const topCustomers = useMemo(() => {
    const grouped = new Map<string, { revenue: number; units: number; type: string }>();
    filteredSales.forEach((s) => {
      if (!s.customer) return;
      const e = grouped.get(s.customer) ?? { revenue: 0, units: 0, type: s.customerType ?? '' };
      e.revenue += s.revenue || 0;
      e.units += s.unitsBooked || 0;
      grouped.set(s.customer, e);
    });
    const totalRev = Array.from(grouped.values()).reduce((x, c) => x + c.revenue, 0);
    return Array.from(grouped.entries())
      .map(([customer, d]) => ({
        customer,
        type: d.type,
        revenue: d.revenue,
        units: d.units,
        share: totalRev > 0 ? (d.revenue / totalRev) * 100 : 0,
        avgNet: d.units > 0 ? d.revenue / d.units : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
  }, [filteredSales]);

  // ── Top colors (filter-aware, fixed) ──
  // Old code keyed off `s.color` which was often blank. Use a sensible
  // combination of colorCode + colorDesc and only drop to "Unknown" if
  // absolutely nothing is there.
  const topColors = useMemo(() => {
    const grouped = new Map<string, { revenue: number; units: number; code: string; desc: string }>();
    filteredSales.forEach((s) => {
      const code = (s.colorCode ?? '').trim();
      const desc = (s.colorDesc ?? '').trim();
      const fallback = (s.color ?? '').trim();
      const key = code || desc || fallback || 'Unknown';
      const e = grouped.get(key) ?? { revenue: 0, units: 0, code, desc: desc || fallback };
      e.revenue += s.revenue || 0;
      e.units += s.unitsBooked || 0;
      if (!e.code && code) e.code = code;
      if (!e.desc && (desc || fallback)) e.desc = desc || fallback;
      grouped.set(key, e);
    });
    const totalRev = Array.from(grouped.values()).reduce((x, c) => x + c.revenue, 0);
    const totalUnits = Array.from(grouped.values()).reduce((x, c) => x + c.units, 0);
    return Array.from(grouped.entries())
      .map(([key, d]) => ({
        key,
        code: d.code,
        desc: d.desc || key,
        revenue: d.revenue,
        units: d.units,
        share: totalRev > 0 ? (d.revenue / totalRev) * 100 : totalUnits > 0 ? (d.units / totalUnits) * 100 : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue || b.units - a.units)
      .slice(0, 12);
  }, [filteredSales]);

  // ── Geographic (top states) ──
  // Sales records carry state info on some imports; fall back to ZIP as an
  // identifier if state is missing. If neither is available the section
  // simply hides.
  const topStates = useMemo(() => {
    const grouped = new Map<string, { revenue: number; units: number }>();
    filteredSales.forEach((s) => {
      const state = ((s as unknown as { shipToState?: string }).shipToState ?? '').toString().trim();
      if (!state) return;
      const e = grouped.get(state) ?? { revenue: 0, units: 0 };
      e.revenue += s.revenue || 0;
      e.units += s.unitsBooked || 0;
      grouped.set(state, e);
    });
    const totalRev = Array.from(grouped.values()).reduce((x, c) => x + c.revenue, 0);
    return Array.from(grouped.entries())
      .map(([state, d]) => ({
        state,
        revenue: d.revenue,
        units: d.units,
        share: totalRev > 0 ? (d.revenue / totalRev) * 100 : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
  }, [filteredSales]);

  // ── Season-over-season summary card ──
  // Takes the most recent season with sales (respecting filters) and
  // compares it against the prior same-type season.
  const sosComparison = useMemo(() => {
    const bySeasonTotals = new Map<string, { revenue: number; units: number }>();
    filteredSales.forEach((s) => {
      if (!s.season) return;
      const e = bySeasonTotals.get(s.season) ?? { revenue: 0, units: 0 };
      e.revenue += s.revenue || 0;
      e.units += s.unitsBooked || 0;
      bySeasonTotals.set(s.season, e);
    });
    const sorted = sortSeasons(Array.from(bySeasonTotals.keys()));
    if (sorted.length === 0) return null;
    const current = sorted[sorted.length - 1];
    const isSpring = current.endsWith('SP');
    // Find most recent same-type prior
    const prior = [...sorted]
      .slice(0, -1)
      .reverse()
      .find((s) => s.endsWith(isSpring ? 'SP' : 'FA'));
    const cur = bySeasonTotals.get(current)!;
    const prev = prior ? bySeasonTotals.get(prior)! : null;
    const revDelta = prev && prev.revenue > 0 ? ((cur.revenue - prev.revenue) / prev.revenue) * 100 : null;
    const unitsDelta = prev && prev.units > 0 ? ((cur.units - prev.units) / prev.units) * 100 : null;
    return { current, prior, cur, prev, revDelta, unitsDelta };
  }, [filteredSales]);

  // ── Recent edits (fetched) ──
  const [editHistory, setEditHistory] = useState<EditEntry[] | null>(null);
  const [editHistoryError, setEditHistoryError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setEditHistory(null);
    setEditHistoryError(null);
    (async () => {
      try {
        const res = await fetch(`/api/data/edit-history?styleNumber=${encodeURIComponent(styleNumber)}&limit=8`);
        const j = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
        setEditHistory(j.edits ?? []);
      } catch (err) {
        if (!cancelled) setEditHistoryError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [styleNumber]);

  // ── Filter chip strip ──
  const activeFilterChips = useMemo(() => {
    const chips: { label: string; value: string }[] = [];
    if (selectedSeason) {
      const label =
        selectedSeason === '__ALL_SP__'
          ? 'All Spring'
          : selectedSeason === '__ALL_FA__'
          ? 'All Fall'
          : selectedSeason;
      chips.push({ label: 'Season', value: label });
    }
    if (selectedDivision) chips.push({ label: 'Division', value: selectedDivision });
    if (selectedCategory) chips.push({ label: 'Category', value: selectedCategory });
    return chips;
  }, [selectedSeason, selectedDivision, selectedCategory]);

  const hasFilters = activeFilterChips.length > 0;
  const filteredSalesTotals = useMemo(() => {
    return filteredSales.reduce(
      (acc, s) => {
        acc.revenue += s.revenue || 0;
        acc.units += s.unitsBooked || 0;
        return acc;
      },
      { revenue: 0, units: 0 },
    );
  }, [filteredSales]);

  // ── Render ──
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 animate-slide-up">
      <div className="fixed inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-surface rounded-t-2xl shadow-2xl border-t border-border-primary max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-surface border-b border-border-primary px-6 py-4 flex items-center justify-between z-10">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-mono font-bold text-xl text-text-primary bg-surface-tertiary px-3 py-1 rounded">
                {styleNumber}
              </span>
              <h3 className="font-display font-semibold text-xl text-text-primary truncate">
                {styleInfo?.styleDesc || 'Unknown Style'}
              </h3>
            </div>
            <div className="flex items-center gap-x-4 gap-y-1 mt-2 text-sm text-text-muted flex-wrap">
              {styleInfo?.divisionDesc && (
                <span>Division: <span className="text-text-secondary">{styleInfo.divisionDesc}</span></span>
              )}
              {styleInfo?.categoryDesc && (
                <span>Category: <span className="text-text-secondary">{styleInfo.categoryDesc}</span></span>
              )}
              {styleInfo?.designerName && (
                <span>Designer: <span className="text-text-secondary">{styleInfo.designerName}</span></span>
              )}
              {styleInfo?.techDesignerName && (
                <span>Tech: <span className="text-text-secondary">{styleInfo.techDesignerName}</span></span>
              )}
              {styleInfo?.factoryName && (
                <span>Factory: <span className="text-text-secondary">{styleInfo.factoryName}</span></span>
              )}
              {styleInfo?.countryOfOrigin && (
                <span>COO: <span className="text-text-secondary">{styleInfo.countryOfOrigin}</span></span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-text-faint hover:text-text-secondary hover:bg-surface-tertiary rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter chip strip */}
        {hasFilters && (
          <div className="px-6 pt-4 flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 text-xs uppercase tracking-wide text-text-muted font-semibold">
              <Filter className="w-3.5 h-3.5" />
              Filtered by
            </span>
            {activeFilterChips.map((c) => (
              <span
                key={c.label}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30"
              >
                <span className="opacity-70">{c.label}:</span>
                <span>{c.value}</span>
              </span>
            ))}
            <span className="text-xs text-text-muted ml-2">
              ({formatCurrencyShort(filteredSalesTotals.revenue)} · {formatNumber(filteredSalesTotals.units)} units)
            </span>
          </div>
        )}

        {/* Panel-level season pills */}
        {styleSeasons.length > 0 && (
          <div className="px-6 pt-4 flex items-center gap-2 flex-wrap">
            <span className="text-xs uppercase tracking-wide text-text-muted font-semibold">
              Season
            </span>
            <button
              onClick={() => setPanelSeason('all')}
              className={`px-3 py-1 text-xs font-semibold rounded-full transition-colors ${
                panelSeason === 'all'
                  ? 'bg-cyan-600 text-white'
                  : 'bg-surface-tertiary text-text-secondary hover:bg-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              All
            </button>
            {styleSeasons.map((s) => {
              const active = panelSeason === s;
              const isSpring = s.endsWith('SP');
              return (
                <button
                  key={s}
                  onClick={() => setPanelSeason(s)}
                  className={`px-3 py-1 text-xs font-mono font-semibold rounded-full transition-colors ${
                    active
                      ? isSpring ? 'bg-emerald-500 text-white' : 'bg-orange-500 text-white'
                      : isSpring
                      ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 hover:bg-emerald-100'
                      : 'bg-orange-50 dark:bg-orange-950 text-orange-700 hover:bg-orange-100'
                  }`}
                >
                  {s}
                </button>
              );
            })}
            {panelSeason !== 'all' && (
              <span className="text-[11px] text-text-muted ml-1">
                (overrides parent filter — click All to reset)
              </span>
            )}
          </div>
        )}

        {/* Season-over-season summary */}
        {sosComparison && (
          <div className="px-6 pt-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-surface-secondary rounded-lg p-4">
                <div className="text-xs text-text-muted uppercase tracking-wide mb-1">
                  {sosComparison.current} Revenue
                </div>
                <div className="font-mono font-bold text-lg text-text-primary">
                  {formatCurrencyShort(sosComparison.cur.revenue)}
                </div>
                {sosComparison.revDelta !== null && (
                  <div
                    className={`text-xs mt-1 flex items-center gap-1 ${
                      sosComparison.revDelta >= 0 ? 'text-emerald-500' : 'text-red-500'
                    }`}
                  >
                    {sosComparison.revDelta >= 0 ? (
                      <TrendingUp className="w-3 h-3" />
                    ) : (
                      <TrendingDown className="w-3 h-3" />
                    )}
                    {sosComparison.revDelta >= 0 ? '+' : ''}
                    {sosComparison.revDelta.toFixed(1)}% vs {sosComparison.prior}
                  </div>
                )}
              </div>
              <div className="bg-surface-secondary rounded-lg p-4">
                <div className="text-xs text-text-muted uppercase tracking-wide mb-1">
                  {sosComparison.current} Units
                </div>
                <div className="font-mono font-bold text-lg text-text-primary">
                  {formatNumber(sosComparison.cur.units)}
                </div>
                {sosComparison.unitsDelta !== null && (
                  <div
                    className={`text-xs mt-1 flex items-center gap-1 ${
                      sosComparison.unitsDelta >= 0 ? 'text-emerald-500' : 'text-red-500'
                    }`}
                  >
                    {sosComparison.unitsDelta >= 0 ? (
                      <TrendingUp className="w-3 h-3" />
                    ) : (
                      <TrendingDown className="w-3 h-3" />
                    )}
                    {sosComparison.unitsDelta >= 0 ? '+' : ''}
                    {sosComparison.unitsDelta.toFixed(1)}% vs {sosComparison.prior}
                  </div>
                )}
              </div>
              <div className="bg-surface-secondary rounded-lg p-4">
                <div className="text-xs text-text-muted uppercase tracking-wide mb-1">
                  Latest Margin
                </div>
                <div
                  className={`font-mono font-bold text-lg ${
                    costInfo && costInfo.margin >= 45
                      ? 'text-emerald-500'
                      : costInfo && costInfo.margin >= 40
                      ? 'text-amber-500'
                      : 'text-red-500'
                  }`}
                >
                  {costInfo ? `${costInfo.margin.toFixed(1)}%` : '—'}
                </div>
                {costInfo && (
                  <div className="text-xs text-text-muted mt-1">
                    Landed {formatCurrency(costInfo.cost)} · Whsl {formatCurrency(costInfo.wholesale)}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Content grid */}
        <div className="p-6 grid grid-cols-2 gap-6">
          {/* ── Pricing by Season ── */}
          <div className="bg-surface-secondary rounded-xl p-5 col-span-2 md:col-span-1">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-semibold text-text-primary flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-400" />
                Pricing by Season
              </h4>
              {latestPricingRecord && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setEditingPrice(true)}
                    title={`Edit wholesale / MSRP (${latestPricingRecord.season})`}
                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-emerald-400 hover:bg-emerald-500/10 rounded transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    Edit
                  </button>
                  <button
                    onClick={() => setViewingPriceHistory(true)}
                    title="View price edit history"
                    className="p-1 text-text-muted hover:text-amber-400 hover:bg-amber-500/10 rounded transition-colors"
                  >
                    <History className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
            {pricingBySeason.length === 0 ? (
              <p className="text-sm text-text-faint">No pricing data available</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase text-text-muted border-b border-border-primary">
                    <th className="text-left py-1.5 font-semibold">Season</th>
                    <th className="text-right py-1.5 font-semibold">MSRP</th>
                    <th className="text-right py-1.5 font-semibold">Whsl</th>
                    <th className="text-right py-1.5 font-semibold">Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {pricingBySeason.map((p) => (
                    <tr key={p.season} className="border-b border-border-primary/50 last:border-0">
                      <td className="py-1.5 font-mono text-text-secondary">{p.season}</td>
                      <td className="py-1.5 text-right font-mono text-text-primary">
                        {formatCurrency(p.msrp || null)}
                      </td>
                      <td className="py-1.5 text-right font-mono font-medium text-text-primary">
                        {formatCurrency(p.price || null)}
                      </td>
                      <td className={`py-1.5 text-right font-mono text-xs ${
                        p.change == null
                          ? 'text-text-faint'
                          : p.change > 0
                          ? 'text-emerald-500'
                          : p.change < 0
                          ? 'text-red-500'
                          : 'text-text-muted'
                      }`}>
                        {p.change == null ? '—' : `${p.change > 0 ? '+' : ''}${p.change.toFixed(0)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* ── Cost / Margin summary + editor ── */}
          <div className="bg-surface-secondary rounded-xl p-5 col-span-2 md:col-span-1">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-semibold text-text-primary flex items-center gap-2">
                <Package className="w-4 h-4 text-cyan-400" />
                Cost / Margin
              </h4>
              {costInfo?.costRecord && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setEditing(true)}
                    title="Edit landed / margin"
                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-cyan-400 hover:bg-cyan-500/10 rounded transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    Edit
                  </button>
                  <button
                    onClick={() => setViewingHistory(true)}
                    title="View edit history"
                    className="p-1 text-text-muted hover:text-amber-400 hover:bg-amber-500/10 rounded transition-colors"
                  >
                    <History className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
            {costInfo ? (
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary">Landed Cost:</span>
                  <span className="font-mono font-medium text-text-primary inline-flex items-center gap-1">
                    {formatCurrency(costInfo.cost)}
                    {costInfo.fallbackSeason && (
                      <span title={`Cost from prior season: ${costInfo.fallbackSeason}`}>
                        <Clock className="w-3.5 h-3.5 text-amber-500" />
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary">Wholesale:</span>
                  <span className="font-mono font-medium text-text-primary">
                    {formatCurrency(costInfo.wholesale)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary">MSRP:</span>
                  <span className="font-mono font-medium text-text-primary">
                    {formatCurrency(costInfo.msrp)}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-border-primary">
                  <span className="text-text-secondary">Margin:</span>
                  <span
                    className={`font-mono font-bold px-2 py-0.5 rounded ${
                      costInfo.margin >= 50
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                        : costInfo.margin >= 40
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                        : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                    }`}
                  >
                    {costInfo.margin.toFixed(1)}%
                  </span>
                </div>
                {(costInfo.factory || costInfo.coo) && (
                  <div className="pt-2 border-t border-border-primary text-xs text-text-faint">
                    {costInfo.factory && <div>Factory: {costInfo.factory}</div>}
                    {costInfo.coo && <div>COO: {costInfo.coo}</div>}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-text-faint">No cost data available</p>
            )}
          </div>

          {/* ── Cost breakdown by season ── */}
          {costBreakdownBySeason.length > 0 && (
            <div className="bg-surface-secondary rounded-xl p-5 col-span-2">
              <h4 className="font-semibold text-text-primary mb-4 flex items-center gap-2">
                <Package className="w-4 h-4 text-cyan-400" />
                Cost Breakdown by Season
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs uppercase text-text-muted border-b border-border-primary">
                      <th className="text-left py-1.5 font-semibold">Season</th>
                      <th className="text-right py-1.5 font-semibold">FOB</th>
                      <th className="text-right py-1.5 font-semibold">Duty</th>
                      <th className="text-right py-1.5 font-semibold">Tariff</th>
                      <th className="text-right py-1.5 font-semibold">Freight</th>
                      <th className="text-right py-1.5 font-semibold">Overhead</th>
                      <th className="text-right py-1.5 font-semibold">Landed</th>
                      <th className="text-left py-1.5 font-semibold pl-3">Factory / COO</th>
                    </tr>
                  </thead>
                  <tbody>
                    {costBreakdownBySeason.map((c) => (
                      <tr key={c.season} className="border-b border-border-primary/50 last:border-0">
                        <td className="py-1.5 font-mono text-text-secondary">{c.season}</td>
                        <td className="py-1.5 text-right font-mono text-text-primary">{formatCurrency(c.fob || null)}</td>
                        <td className="py-1.5 text-right font-mono text-text-primary">{formatCurrency(c.duty || null)}</td>
                        <td className="py-1.5 text-right font-mono text-text-primary">{formatCurrency(c.tariff || null)}</td>
                        <td className="py-1.5 text-right font-mono text-text-primary">{formatCurrency(c.freight || null)}</td>
                        <td className="py-1.5 text-right font-mono text-text-primary">{formatCurrency(c.overhead || null)}</td>
                        <td className="py-1.5 text-right font-mono font-bold text-text-primary">{formatCurrency(c.landed || null)}</td>
                        <td className="py-1.5 pl-3 text-xs text-text-muted">
                          {c.factory || '—'}{c.coo ? ` · ${c.coo}` : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Sales by channel ── */}
          <div className="bg-surface-secondary rounded-xl p-5 col-span-2 md:col-span-1">
            <h4 className="font-semibold text-text-primary mb-4 flex items-center gap-2">
              <Users className="w-4 h-4 text-purple-400" />
              Sales by Channel
            </h4>
            {salesByChannel.length === 0 ? (
              <p className="text-sm text-text-faint">No sales data for this filter</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase text-text-muted border-b border-border-primary">
                    <th className="text-left py-1.5 font-semibold">Channel</th>
                    <th className="text-right py-1.5 font-semibold">Units</th>
                    <th className="text-right py-1.5 font-semibold">Revenue</th>
                    <th className="text-right py-1.5 font-semibold">%</th>
                    <th className="text-right py-1.5 font-semibold">Net</th>
                    <th className="text-right py-1.5 font-semibold">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {salesByChannel.map((c) => (
                    <tr key={c.channel} className="border-b border-border-primary/50 last:border-0">
                      <td className="py-1.5 text-text-secondary">{CHANNEL_LABELS[c.channel] || c.channel}</td>
                      <td className="py-1.5 text-right font-mono text-text-primary">{formatNumber(c.units)}</td>
                      <td className="py-1.5 text-right font-mono font-medium text-text-primary">{formatCurrencyShort(c.revenue)}</td>
                      <td className="py-1.5 text-right font-mono text-text-muted">{c.share.toFixed(0)}%</td>
                      <td className="py-1.5 text-right font-mono text-text-primary">{formatCurrency(c.avgNetPrice || null)}</td>
                      <td className={`py-1.5 text-right font-mono font-semibold ${
                        c.margin == null
                          ? 'text-text-faint'
                          : c.margin >= 45
                          ? 'text-emerald-500'
                          : c.margin >= 35
                          ? 'text-amber-500'
                          : 'text-red-500'
                      }`}>
                        {formatPct(c.margin)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* ── Top customers ── */}
          <div className="bg-surface-secondary rounded-xl p-5 col-span-2 md:col-span-1">
            <h4 className="font-semibold text-text-primary mb-4 flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-400" />
              Top Customers
            </h4>
            {topCustomers.length === 0 ? (
              <p className="text-sm text-text-faint">No customer data for this filter</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase text-text-muted border-b border-border-primary">
                    <th className="text-left py-1.5 font-semibold">Customer</th>
                    <th className="text-right py-1.5 font-semibold">Units</th>
                    <th className="text-right py-1.5 font-semibold">Revenue</th>
                    <th className="text-right py-1.5 font-semibold">%</th>
                    <th className="text-right py-1.5 font-semibold">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {topCustomers.map((c) => (
                    <tr key={c.customer} className="border-b border-border-primary/50 last:border-0">
                      <td className="py-1.5 text-text-secondary truncate max-w-[180px]" title={c.customer}>{c.customer}</td>
                      <td className="py-1.5 text-right font-mono text-text-primary">{formatNumber(c.units)}</td>
                      <td className="py-1.5 text-right font-mono font-medium text-text-primary">{formatCurrencyShort(c.revenue)}</td>
                      <td className="py-1.5 text-right font-mono text-text-muted">{c.share.toFixed(0)}%</td>
                      <td className="py-1.5 text-right font-mono text-text-primary">{formatCurrency(c.avgNet || null)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* ── Top colors ── */}
          <div className="bg-surface-secondary rounded-xl p-5 col-span-2 md:col-span-1">
            <h4 className="font-semibold text-text-primary mb-4 flex items-center gap-2">
              <Palette className="w-4 h-4 text-pink-400" />
              Top Colors
            </h4>
            {topColors.length === 0 ? (
              <p className="text-sm text-text-faint">No color data for this filter</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase text-text-muted border-b border-border-primary">
                    <th className="text-left py-1.5 font-semibold">Color</th>
                    <th className="text-right py-1.5 font-semibold">Units</th>
                    <th className="text-right py-1.5 font-semibold">Revenue</th>
                    <th className="text-right py-1.5 font-semibold">%</th>
                  </tr>
                </thead>
                <tbody>
                  {topColors.map((c) => (
                    <tr key={c.key} className="border-b border-border-primary/50 last:border-0">
                      <td className="py-1.5 text-text-secondary truncate max-w-[180px]">
                        <span className="font-mono text-xs text-text-muted mr-2">{c.code || '—'}</span>
                        {c.desc}
                      </td>
                      <td className="py-1.5 text-right font-mono text-text-primary">{formatNumber(c.units)}</td>
                      <td className="py-1.5 text-right font-mono font-medium text-text-primary">{formatCurrencyShort(c.revenue)}</td>
                      <td className="py-1.5 text-right font-mono text-text-muted">{c.share.toFixed(0)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* ── Geographic (top states) ── */}
          {topStates.length > 0 && (
            <div className="bg-surface-secondary rounded-xl p-5 col-span-2 md:col-span-1">
              <h4 className="font-semibold text-text-primary mb-4 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-amber-400" />
                Top States
              </h4>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase text-text-muted border-b border-border-primary">
                    <th className="text-left py-1.5 font-semibold">State</th>
                    <th className="text-right py-1.5 font-semibold">Units</th>
                    <th className="text-right py-1.5 font-semibold">Revenue</th>
                    <th className="text-right py-1.5 font-semibold">%</th>
                  </tr>
                </thead>
                <tbody>
                  {topStates.map((s) => (
                    <tr key={s.state} className="border-b border-border-primary/50 last:border-0">
                      <td className="py-1.5 text-text-secondary font-mono">{s.state}</td>
                      <td className="py-1.5 text-right font-mono text-text-primary">{formatNumber(s.units)}</td>
                      <td className="py-1.5 text-right font-mono font-medium text-text-primary">{formatCurrencyShort(s.revenue)}</td>
                      <td className="py-1.5 text-right font-mono text-text-muted">{s.share.toFixed(0)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Recent edits ── */}
          <div className="bg-surface-secondary rounded-xl p-5 col-span-2 md:col-span-1">
            <h4 className="font-semibold text-text-primary mb-4 flex items-center gap-2">
              <History className="w-4 h-4 text-amber-400" />
              Recent Edits
            </h4>
            {editHistoryError ? (
              <p className="text-sm text-red-400">Failed to load: {editHistoryError}</p>
            ) : editHistory == null ? (
              <p className="text-sm text-text-muted">Loading…</p>
            ) : editHistory.length === 0 ? (
              <p className="text-sm text-text-faint">No tracked edits for this style yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase text-text-muted border-b border-border-primary">
                    <th className="text-left py-1.5 font-semibold">When</th>
                    <th className="text-left py-1.5 font-semibold">Who</th>
                    <th className="text-left py-1.5 font-semibold">What</th>
                    <th className="text-right py-1.5 font-semibold">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {editHistory.map((e) => {
                    const fmt = (v: number | null) => {
                      if (v == null) return '—';
                      if (e.field === 'margin') return `${(v * 100).toFixed(1)}%`;
                      return `$${v.toFixed(2)}`;
                    };
                    const label = e.field === 'price'
                      ? 'Wholesale'
                      : e.field.charAt(0).toUpperCase() + e.field.slice(1);
                    return (
                      <tr key={e.id} className="border-b border-border-primary/50 last:border-0">
                        <td className="py-1.5 text-text-muted whitespace-nowrap text-xs">{formatEditDate(e.editedAt)}</td>
                        <td className="py-1.5 text-text-primary font-medium whitespace-nowrap">{e.editedBy}</td>
                        <td className="py-1.5 text-text-secondary">
                          <span className="text-xs font-mono text-text-muted mr-1">{e.season}</span>
                          {label}
                        </td>
                        <td className="py-1.5 text-right font-mono text-text-primary whitespace-nowrap">
                          {fmt(e.oldValue)} → {fmt(e.newValue)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes slide-up {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }
        .animate-slide-up > div:last-child {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>

      {editing && costInfo?.costRecord && (
        <CostEditModal
          cost={costInfo.costRecord}
          onClose={() => setEditing(false)}
          onSaved={(updated) => {
            onCostUpdated?.(updated);
            setEditing(false);
          }}
        />
      )}
      {viewingHistory && costInfo?.costRecord && (
        <CostHistoryModal
          costId={costInfo.costRecord.id}
          styleNumber={costInfo.costRecord.styleNumber}
          season={costInfo.costRecord.season}
          onClose={() => setViewingHistory(false)}
        />
      )}

      {editingPrice && latestPricingRecord && (
        <PriceEditModal
          pricing={latestPricingRecord}
          onClose={() => setEditingPrice(false)}
          onSaved={(updated) => {
            onPricingUpdated?.(updated);
            setEditingPrice(false);
          }}
        />
      )}
      {viewingPriceHistory && latestPricingRecord && (
        <PricingHistoryModal
          pricingId={latestPricingRecord.id}
          styleNumber={latestPricingRecord.styleNumber}
          season={latestPricingRecord.season}
          onClose={() => setViewingPriceHistory(false)}
        />
      )}
    </div>
  );
}
