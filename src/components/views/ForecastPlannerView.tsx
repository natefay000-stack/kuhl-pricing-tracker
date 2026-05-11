'use client';

/**
 * Forecast Planner — historical reference for forward season planning.
 *
 * Pick a target season (e.g. 27SP) and the view shows the same-type
 * historical comparison seasons (default: 25SP + 26SP) side-by-side.
 * Rep / customer / category filters scope the data; clicking a category
 * row drills into per-style detail; clicking a style drills into per-color.
 *
 * Data source: Sale table (booked + shipped), pulled fresh on every
 * filter / drill via /api/data/forecast-planner-comp. Server returns
 * pre-aggregated rows so the client stays light.
 */

import { Fragment, useEffect, useMemo, useState } from 'react';
import { ChevronRight, RefreshCw, Download, Filter, X, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import MultiSelect from '@/components/MultiSelect';
import { exportMultiSheetExcel } from '@/utils/exportData';

type GroupBy = 'category' | 'style' | 'color';

interface PlannerSeasonAgg {
  shipped: number;
  open: number;
  total: number;
  units: number;
  orders: number;
  customers: number;
}
interface PlannerRow {
  key: string;
  label: string;
  bySeason: Record<string, PlannerSeasonAgg>;
  yoyDeltaPct: number | null;
  avgTotal: number;
}
interface PlannerResponse {
  success: boolean;
  targetSeason: string;
  comparisonSeasons: string[];
  groupBy: GroupBy;
  rows: PlannerRow[];
  grandTotal: {
    bySeason: Record<string, { shipped: number; open: number; total: number; units: number }>;
    avgTotal: number;
  };
  generatedAt: string;
}

const fmtCur = (v: number) => v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const fmtCurShort = (v: number) => {
  if (!Number.isFinite(v) || v === 0) return '—';
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${Math.round(v)}`;
};
const fmtUnits = (v: number) => v === 0 ? '—' : v.toLocaleString();
const fmtPct = (v: number | null) => v === null || !Number.isFinite(v) ? '—' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`;

/** Derive default target season: pick the most-recent season + 1 year of the same type */
function defaultTargetSeason(allSeasons: string[]): string {
  const parsed = allSeasons
    .map((s) => { const m = s.match(/^(\d{2})(SP|FA)$/i); return m ? { y: parseInt(m[1], 10), t: m[2].toUpperCase(), raw: s } : null; })
    .filter((x): x is { y: number; t: string; raw: string } => !!x);
  if (parsed.length === 0) return '';
  const newest = parsed.sort((a, b) => (a.y - b.y) || (a.t === 'SP' ? -1 : 1)).pop()!;
  // Project 1 year forward keeping same type (SP or FA)
  return `${String(newest.y + 1).padStart(2, '0')}${newest.t}`;
}

export default function ForecastPlannerView() {
  // ── Filter / config state ──
  const [allSeasons, setAllSeasons] = useState<string[]>([]);
  const [allReps, setAllReps] = useState<string[]>([]);
  const [allCustomers, setAllCustomers] = useState<string[]>([]);
  const [targetSeason, setTargetSeason] = useState<string>('');
  const [seasonsBack, setSeasonsBack] = useState<number>(2);
  const [repFilter, setRepFilter] = useState<string[]>([]);
  const [customerFilter, setCustomerFilter] = useState<string[]>([]);

  // ── Data state ──
  const [data, setData] = useState<PlannerResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Inline drill-down — track which categories/styles are expanded and
  // cache their server responses so re-expanding is instant.
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [styleSubData, setStyleSubData] = useState<Record<string, PlannerResponse>>({});
  const [expandedStyle, setExpandedStyle] = useState<string | null>(null);
  const [colorSubData, setColorSubData] = useState<Record<string, PlannerResponse>>({});

  // ── Initial options load ──
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/data/forecast-planner-options');
        if (!res.ok) return;
        const opts = await res.json();
        setAllSeasons(opts.seasons ?? []);
        setAllReps(opts.reps ?? []);
        setAllCustomers(opts.customers ?? []);
        if (!targetSeason && opts.seasons?.length > 0) {
          setTargetSeason(defaultTargetSeason(opts.seasons));
        }
      } catch { /* non-fatal */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Data fetch (top-level rows, group=category) ──
  const fetchPlanner = async (
    overrides?: { groupBy?: GroupBy; category?: string; styleNumber?: string },
  ): Promise<PlannerResponse | null> => {
    if (!targetSeason) return null;
    const params = new URLSearchParams();
    params.set('targetSeason', targetSeason);
    params.set('seasonsBack', String(seasonsBack));
    params.set('groupBy', overrides?.groupBy ?? 'category');
    if (repFilter.length > 0) params.set('rep', repFilter.join(','));
    if (customerFilter.length > 0) params.set('customer', customerFilter.join(','));
    if (overrides?.category) params.set('category', overrides.category);
    if (overrides?.styleNumber) params.set('styleNumber', overrides.styleNumber);
    const res = await fetch(`/api/data/forecast-planner-comp?${params.toString()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const d: PlannerResponse = await res.json();
    if (!d.success) throw new Error((d as unknown as { error?: string }).error || 'Failed');
    return d;
  };

  const refresh = async () => {
    setLoading(true);
    setError(null);
    setExpandedCategory(null);
    setExpandedStyle(null);
    setStyleSubData({});
    setColorSubData({});
    try {
      const top = await fetchPlanner({ groupBy: 'category' });
      setData(top);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  // Auto-refresh whenever the inputs that affect the top-level query change
  useEffect(() => {
    if (targetSeason) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetSeason, seasonsBack, repFilter, customerFilter]);

  // ── Drill: expand a category to show its styles ──
  const toggleCategory = async (cat: string) => {
    if (expandedCategory === cat) {
      setExpandedCategory(null);
      return;
    }
    setExpandedCategory(cat);
    setExpandedStyle(null);
    if (!styleSubData[cat]) {
      try {
        const sub = await fetchPlanner({ groupBy: 'style', category: cat });
        if (sub) setStyleSubData((prev) => ({ ...prev, [cat]: sub }));
      } catch (err) {
        console.warn('style drill failed:', err);
      }
    }
  };

  // ── Drill: expand a style to show its colors ──
  const toggleStyle = async (cat: string, styleNumber: string) => {
    const subKey = `${cat}||${styleNumber}`;
    if (expandedStyle === subKey) {
      setExpandedStyle(null);
      return;
    }
    setExpandedStyle(subKey);
    if (!colorSubData[subKey]) {
      try {
        const sub = await fetchPlanner({ groupBy: 'color', category: cat, styleNumber });
        if (sub) setColorSubData((prev) => ({ ...prev, [subKey]: sub }));
      } catch (err) {
        console.warn('color drill failed:', err);
      }
    }
  };

  // ── Export ──
  const handleExport = () => {
    if (!data) return;
    const seasons = data.comparisonSeasons;
    const buildSheet = (rows: PlannerRow[], firstCol: string) =>
      rows.map(r => {
        const out: Record<string, unknown> = { [firstCol]: r.label };
        seasons.forEach(s => {
          out[`${s} Units`] = r.bySeason[s].units || null;
          out[`${s} Shipped $`] = r.bySeason[s].shipped || null;
          out[`${s} Open $`] = r.bySeason[s].open || null;
          out[`${s} Total $`] = r.bySeason[s].total || null;
        });
        out['YoY Δ %'] = r.yoyDeltaPct !== null ? r.yoyDeltaPct : null;
        out[`Avg Total $`] = r.avgTotal;
        return out;
      });

    const sheets: { name: string; data: Record<string, unknown>[] }[] = [
      { name: `By Category`, data: buildSheet(data.rows, 'Category') },
    ];
    // Style sheets — one block per expanded category, concatenated
    for (const [cat, sub] of Object.entries(styleSubData)) {
      const rows = sub.rows.map(r => ({ Category: cat, ...buildSheet([r], 'Style')[0] }));
      const sheetName = `Style — ${cat}`.substring(0, 31);
      sheets.push({ name: sheetName, data: rows });
    }
    // Color sheets — one block per expanded style
    for (const [subKey, sub] of Object.entries(colorSubData)) {
      const [cat, styleNumber] = subKey.split('||');
      const rows = sub.rows.map(r => ({
        Category: cat,
        Style: styleNumber,
        ...buildSheet([r], 'Color')[0],
      }));
      const sheetName = `Color — ${styleNumber}`.substring(0, 31);
      sheets.push({ name: sheetName, data: rows });
    }
    exportMultiSheetExcel(sheets, `forecast_planner_${targetSeason}`);
  };

  const hasFilters = repFilter.length > 0 || customerFilter.length > 0;
  const seasons = data?.comparisonSeasons ?? [];

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-4xl font-display font-bold text-text-primary flex items-center gap-3">
            <TrendingUp className="w-8 h-8 text-cyan-500" />
            Forecast Planner
          </h2>
          <p className="text-base text-text-muted mt-2">
            Pick a target season — the view shows what was sold in the same type of season previously, to support forecasting.
          </p>
          <p className="text-xs text-text-faint mt-1">
            Data source: Sale table (booked + shipped) · {seasons.length > 0 ? `Comparing ${seasons.join(' vs ')} for forecasting ${data?.targetSeason}` : 'Loading…'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            disabled={loading || !targetSeason}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-cyan-700 dark:text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={handleExport}
            disabled={!data || loading}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Export XLSX
          </button>
        </div>
      </div>

      {/* Top control strip — target season, seasons-back, filters */}
      <div className="bg-surface rounded-xl border-2 border-border-primary p-4 flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold text-text-secondary uppercase tracking-wide">Target Season</label>
          <select
            value={targetSeason}
            onChange={(e) => setTargetSeason(e.target.value)}
            className="px-3 py-2 text-sm border-2 border-border-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 font-mono w-[140px]"
          >
            {/* Project 1-2 years past the most recent season as suggestions */}
            {(() => {
              const opts = new Set<string>();
              if (targetSeason) opts.add(targetSeason);
              allSeasons.forEach(s => {
                const m = s.match(/^(\d{2})(SP|FA)$/i);
                if (m) {
                  const yr = parseInt(m[1], 10);
                  opts.add(`${String(yr + 1).padStart(2, '0')}${m[2]}`);
                  opts.add(`${String(yr + 2).padStart(2, '0')}${m[2]}`);
                  opts.add(s);
                }
              });
              return Array.from(opts).sort().map(o => (
                <option key={o} value={o}>{o}</option>
              ));
            })()}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold text-text-secondary uppercase tracking-wide">Seasons Back</label>
          <select
            value={seasonsBack}
            onChange={(e) => setSeasonsBack(parseInt(e.target.value, 10))}
            className="px-3 py-2 text-sm border-2 border-border-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 w-[100px]"
          >
            {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <MultiSelect label="Rep" placeholder="All reps" options={allReps} values={repFilter} onChange={setRepFilter} widthClass="w-[200px]" />
        <MultiSelect label="Customer" placeholder="All customers" options={allCustomers} values={customerFilter} onChange={setCustomerFilter} widthClass="w-[240px]" />
        {hasFilters && (
          <button
            onClick={() => { setRepFilter([]); setCustomerFilter([]); }}
            className="flex items-center gap-1 px-3 py-2 text-sm font-semibold text-cyan-600 hover:bg-hover-accent rounded-lg"
          >
            <X className="w-4 h-4" /> Clear filters
          </button>
        )}
        <div className="ml-auto flex items-center gap-2 text-xs text-text-muted">
          <Filter className="w-3.5 h-3.5" />
          {data ? `${data.rows.length} categories` : '—'}
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-700 dark:text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2">
          {error}
        </div>
      )}

      {/* Main pivot table */}
      {data && (
        <div className="bg-surface rounded-xl border-2 border-border-primary overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-tertiary border-b border-border-primary text-xs uppercase text-text-secondary">
                  <th className="text-left px-3 py-2.5 font-semibold sticky left-0 bg-surface-tertiary">Category</th>
                  {seasons.map(s => (
                    <Fragment key={s}>
                      <th className="text-right px-2 py-2.5 font-semibold border-l border-border-primary/60">{s} Units</th>
                      <th className="text-right px-2 py-2.5 font-semibold">{s} Shipped</th>
                      <th className="text-right px-2 py-2.5 font-semibold">{s} Open</th>
                      <th className="text-right px-2 py-2.5 font-semibold bg-surface-secondary/50">{s} Total</th>
                    </Fragment>
                  ))}
                  <th className="text-right px-2 py-2.5 font-semibold border-l-2 border-border-strong">YoY Δ%</th>
                  <th className="text-right px-3 py-2.5 font-bold bg-cyan-500/10">Avg Total $ <span className="text-text-faint font-normal">(reference)</span></th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 && !loading && (
                  <tr><td colSpan={3 + seasons.length * 4 + 2} className="px-3 py-6 text-center text-text-muted">No data for the current filters.</td></tr>
                )}
                {data.rows.map((r) => {
                  const isOpen = expandedCategory === r.key;
                  return (
                    <Fragment key={r.key}>
                      <tr
                        onClick={() => toggleCategory(r.key)}
                        className={`border-b border-border-primary/50 cursor-pointer ${isOpen ? 'bg-cyan-500/10' : 'hover:bg-hover-accent'}`}
                      >
                        <td className="px-3 py-2 font-semibold text-text-primary sticky left-0 bg-surface">
                          <span className="inline-flex items-center gap-1.5">
                            <ChevronRight className={`w-3.5 h-3.5 text-text-muted transition-transform ${isOpen ? 'rotate-90 text-cyan-400' : ''}`} />
                            {r.label}
                          </span>
                        </td>
                        {seasons.map(s => {
                          const a = r.bySeason[s];
                          return (
                            <Fragment key={s}>
                              <td className="px-2 py-2 text-right font-mono text-text-secondary border-l border-border-primary/60">{fmtUnits(a.units)}</td>
                              <td className="px-2 py-2 text-right font-mono">{fmtCurShort(a.shipped)}</td>
                              <td className="px-2 py-2 text-right font-mono text-text-secondary">{fmtCurShort(a.open)}</td>
                              <td className="px-2 py-2 text-right font-mono font-semibold bg-surface-secondary/30">{fmtCurShort(a.total)}</td>
                            </Fragment>
                          );
                        })}
                        <td className={`px-2 py-2 text-right font-mono font-semibold border-l-2 border-border-strong ${
                          r.yoyDeltaPct === null ? 'text-text-faint' :
                          r.yoyDeltaPct > 0 ? 'text-emerald-500' :
                          r.yoyDeltaPct < 0 ? 'text-red-500' : 'text-text-muted'
                        }`}>
                          <span className="inline-flex items-center gap-1">
                            {r.yoyDeltaPct === null ? <Minus className="w-3 h-3" /> : r.yoyDeltaPct > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {fmtPct(r.yoyDeltaPct)}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-cyan-700 dark:text-cyan-300 bg-cyan-500/5">{fmtCur(r.avgTotal)}</td>
                      </tr>
                      {/* Style sub-rows */}
                      {isOpen && styleSubData[r.key] && styleSubData[r.key].rows.map((s) => {
                        const subKey = `${r.key}||${s.key}`;
                        const styleOpen = expandedStyle === subKey;
                        return (
                          <Fragment key={subKey}>
                            <tr
                              onClick={() => toggleStyle(r.key, s.key)}
                              className={`border-b border-border-primary/40 cursor-pointer ${styleOpen ? 'bg-cyan-500/5' : 'hover:bg-hover-accent/50'}`}
                            >
                              <td className="pl-8 pr-3 py-1.5 text-xs text-text-secondary sticky left-0 bg-surface">
                                <span className="inline-flex items-center gap-1.5">
                                  <ChevronRight className={`w-3 h-3 text-text-muted transition-transform ${styleOpen ? 'rotate-90 text-cyan-400' : ''}`} />
                                  <span className="font-mono font-semibold mr-2">{s.key}</span>
                                  <span className="truncate max-w-[200px]">{s.label}</span>
                                </span>
                              </td>
                              {seasons.map(season => {
                                const a = s.bySeason[season];
                                return (
                                  <Fragment key={season}>
                                    <td className="px-2 py-1.5 text-right font-mono text-xs text-text-secondary border-l border-border-primary/60">{fmtUnits(a.units)}</td>
                                    <td className="px-2 py-1.5 text-right font-mono text-xs">{fmtCurShort(a.shipped)}</td>
                                    <td className="px-2 py-1.5 text-right font-mono text-xs text-text-secondary">{fmtCurShort(a.open)}</td>
                                    <td className="px-2 py-1.5 text-right font-mono text-xs font-semibold bg-surface-secondary/20">{fmtCurShort(a.total)}</td>
                                  </Fragment>
                                );
                              })}
                              <td className={`px-2 py-1.5 text-right font-mono text-xs font-semibold border-l-2 border-border-strong ${
                                s.yoyDeltaPct === null ? 'text-text-faint' :
                                s.yoyDeltaPct > 0 ? 'text-emerald-500' :
                                s.yoyDeltaPct < 0 ? 'text-red-500' : 'text-text-muted'
                              }`}>{fmtPct(s.yoyDeltaPct)}</td>
                              <td className="px-3 py-1.5 text-right font-mono text-xs font-bold text-cyan-600 dark:text-cyan-400 bg-cyan-500/5">{fmtCur(s.avgTotal)}</td>
                            </tr>
                            {/* Color sub-rows */}
                            {styleOpen && colorSubData[subKey] && colorSubData[subKey].rows.map((c) => (
                              <tr key={`${subKey}||${c.key}`} className="border-b border-border-primary/30 bg-surface-secondary/20">
                                <td className="pl-14 pr-3 py-1 text-xs text-text-faint sticky left-0 bg-surface-secondary/20">
                                  <span className="truncate max-w-[260px] inline-block">{c.label}</span>
                                </td>
                                {seasons.map(season => {
                                  const a = c.bySeason[season];
                                  return (
                                    <Fragment key={season}>
                                      <td className="px-2 py-1 text-right font-mono text-xs text-text-faint border-l border-border-primary/40">{fmtUnits(a.units)}</td>
                                      <td className="px-2 py-1 text-right font-mono text-xs">{fmtCurShort(a.shipped)}</td>
                                      <td className="px-2 py-1 text-right font-mono text-xs text-text-faint">{fmtCurShort(a.open)}</td>
                                      <td className="px-2 py-1 text-right font-mono text-xs font-semibold">{fmtCurShort(a.total)}</td>
                                    </Fragment>
                                  );
                                })}
                                <td className="px-2 py-1 text-right font-mono text-xs border-l-2 border-border-strong text-text-faint">{fmtPct(c.yoyDeltaPct)}</td>
                                <td className="px-3 py-1 text-right font-mono text-xs font-bold text-cyan-600/80">{fmtCur(c.avgTotal)}</td>
                              </tr>
                            ))}
                            {styleOpen && !colorSubData[subKey] && (
                              <tr className="border-b border-border-primary/30 bg-surface-secondary/10">
                                <td colSpan={3 + seasons.length * 4 + 2} className="px-12 py-2 text-xs text-text-faint italic">Loading colors…</td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                      {isOpen && !styleSubData[r.key] && (
                        <tr className="border-b border-border-primary/30 bg-cyan-500/5">
                          <td colSpan={3 + seasons.length * 4 + 2} className="px-8 py-2 text-xs text-text-faint italic">Loading styles…</td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {/* Grand total */}
                {data.rows.length > 0 && (
                  <tr className="border-t-2 border-border-strong bg-surface-tertiary">
                    <td className="px-3 py-2.5 font-bold text-text-primary sticky left-0 bg-surface-tertiary">TOTAL</td>
                    {seasons.map(s => {
                      const t = data.grandTotal.bySeason[s];
                      return (
                        <Fragment key={s}>
                          <td className="px-2 py-2.5 text-right font-mono font-bold border-l border-border-primary/60">{fmtUnits(t.units)}</td>
                          <td className="px-2 py-2.5 text-right font-mono font-bold">{fmtCurShort(t.shipped)}</td>
                          <td className="px-2 py-2.5 text-right font-mono font-bold text-text-secondary">{fmtCurShort(t.open)}</td>
                          <td className="px-2 py-2.5 text-right font-mono font-bold bg-surface-secondary/40">{fmtCurShort(t.total)}</td>
                        </Fragment>
                      );
                    })}
                    <td className="px-2 py-2.5 text-right font-mono text-text-faint border-l-2 border-border-strong">—</td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold text-cyan-600 dark:text-cyan-400 bg-cyan-500/10">{fmtCur(data.grandTotal.avgTotal)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
