'use client';

/**
 * Snapshots — daily aggregate snapshots of the Invoice table.
 *
 * Lists what `/api/admin/list-snapshots` returns: most-recent first, with
 * day-over-day deltas highlighted so a sudden drop in totals (the "data
 * shrunk overnight" failure mode) jumps out visually.
 *
 * Click a row to expand its year × month rollup inline. Manual trigger
 * (POST /api/admin/snapshot-invoices) requires ADMIN_TOKEN — not exposed
 * in the UI; run from terminal or schedule via Vercel Cron.
 */

import { useEffect, useMemo, useState } from 'react';
import { Camera, ChevronRight, RefreshCw, AlertTriangle } from 'lucide-react';

interface SnapshotMeta {
  id: string;
  takenAt: string;
  trigger: string;
  totalRows: number;
  totalNetInvoiced: number;
}
interface SnapshotDetail extends SnapshotMeta {
  yearMonth: { y: number; m: number; count: number; net: number }[];
  topStyles: { styleNumber: string; styleDesc: string; net: number }[];
  topCustomers: { customer: string; net: number }[];
}

const fmtUSD = (v: number) =>
  v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const fmtMillions = (v: number) => {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${Math.round(v)}`;
};
const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
};

export default function SnapshotsView() {
  const [snapshots, setSnapshots] = useState<SnapshotMeta[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, SnapshotDetail>>({});
  const [detailLoading, setDetailLoading] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/list-snapshots');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSnapshots(data.snapshots ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);

  const rowsWithDeltas = useMemo(() => {
    if (!snapshots) return [];
    // Snapshots come most-recent first. Δ for row i is (i.total − (i+1).total)
    return snapshots.map((s, i) => {
      const prev = snapshots[i + 1];
      const deltaRows = prev ? s.totalRows - prev.totalRows : null;
      const deltaNet = prev ? s.totalNetInvoiced - prev.totalNetInvoiced : null;
      const deltaPct = prev && prev.totalNetInvoiced !== 0
        ? (s.totalNetInvoiced - prev.totalNetInvoiced) / prev.totalNetInvoiced
        : null;
      // "Suspicious" = net dropped by 2% or more (data was deleted unexpectedly)
      const suspicious = deltaPct !== null && deltaPct <= -0.02;
      return { ...s, deltaRows, deltaNet, deltaPct, suspicious };
    });
  }, [snapshots]);

  const expandSnapshot = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (details[id]) return; // already loaded
    setDetailLoading(id);
    try {
      const res = await fetch(`/api/admin/list-snapshots?id=${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setDetails((prev) => ({ ...prev, [id]: data }));
    } catch (err) {
      console.warn('snapshot detail fetch failed:', err);
    } finally {
      setDetailLoading(null);
    }
  };

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-4xl font-display font-bold text-text-primary flex items-center gap-3">
            <Camera className="w-8 h-8 text-cyan-500" />
            Snapshots
          </h2>
          <p className="text-base text-text-muted mt-2">
            Daily aggregate backups of the Invoice table. Compare day-over-day to catch unexpected data loss.
          </p>
          <p className="text-xs text-text-faint mt-1">
            Captured automatically each day at 06:00 UTC by Vercel Cron · 90-day retention · Aggregate-only (use Neon point-in-time recovery for full row restore)
          </p>
        </div>
        <button
          onClick={reload}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-cyan-700 dark:text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-xl border-2 border-red-500/40 bg-red-500/10 p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-red-700 dark:text-red-300">Failed to load snapshots</p>
            <p className="text-text-muted mt-0.5 font-mono">{error}</p>
          </div>
        </div>
      )}

      {!loading && rowsWithDeltas.length === 0 && !error && (
        <div className="rounded-xl border-2 border-amber-500/40 bg-amber-500/10 p-4">
          <p className="text-sm text-amber-700 dark:text-amber-300">
            No snapshots yet. The first one will land tomorrow at 06:00 UTC. Or trigger manually:
          </p>
          <pre className="mt-2 text-xs bg-surface rounded p-2 overflow-x-auto">
            curl -X POST &quot;https://kuhl-tracker.vercel.app/api/admin/snapshot-invoices?token=$ADMIN_TOKEN&quot;
          </pre>
        </div>
      )}

      {/* Snapshot table */}
      {rowsWithDeltas.length > 0 && (
        <div className="bg-surface rounded-xl border-2 border-border-primary overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-tertiary border-b border-border-primary text-xs uppercase text-text-secondary">
                  <th className="text-left px-4 py-3 font-semibold">Taken</th>
                  <th className="text-left px-3 py-3 font-semibold">Trigger</th>
                  <th className="text-right px-3 py-3 font-semibold">Total Rows</th>
                  <th className="text-right px-3 py-3 font-semibold">Δ Rows</th>
                  <th className="text-right px-3 py-3 font-semibold">Net Invoiced</th>
                  <th className="text-right px-3 py-3 font-semibold">Δ Net</th>
                  <th className="text-right px-3 py-3 font-semibold">Δ %</th>
                </tr>
              </thead>
              <tbody>
                {rowsWithDeltas.map((s) => {
                  const isOpen = expandedId === s.id;
                  return (
                    <>
                      <tr
                        key={s.id}
                        onClick={() => expandSnapshot(s.id)}
                        className={`border-b border-border-primary/50 cursor-pointer transition-colors ${
                          s.suspicious ? 'bg-red-500/5' : isOpen ? 'bg-cyan-500/10' : 'hover:bg-hover-accent'
                        }`}
                      >
                        <td className="px-4 py-2.5 font-mono text-text-primary">
                          <span className="inline-flex items-center gap-1.5">
                            <ChevronRight className={`w-3.5 h-3.5 text-text-muted transition-transform ${isOpen ? 'rotate-90 text-cyan-400' : ''}`} />
                            {fmtDate(s.takenAt)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`text-xs font-mono px-2 py-0.5 rounded ${
                            s.trigger === 'cron'
                              ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                              : 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
                          }`}>
                            {s.trigger}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono">{s.totalRows.toLocaleString()}</td>
                        <td className={`px-3 py-2.5 text-right font-mono ${
                          s.deltaRows === null ? 'text-text-faint' :
                          s.deltaRows < 0 ? 'text-red-500' :
                          s.deltaRows > 0 ? 'text-emerald-500' : 'text-text-faint'
                        }`}>
                          {s.deltaRows === null ? '—' : `${s.deltaRows >= 0 ? '+' : ''}${s.deltaRows.toLocaleString()}`}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-semibold">{fmtUSD(s.totalNetInvoiced)}</td>
                        <td className={`px-3 py-2.5 text-right font-mono ${
                          s.deltaNet === null ? 'text-text-faint' :
                          s.deltaNet < 0 ? 'text-red-500' :
                          s.deltaNet > 0 ? 'text-emerald-500' : 'text-text-faint'
                        }`}>
                          {s.deltaNet === null ? '—' : `${s.deltaNet >= 0 ? '+' : ''}${fmtMillions(s.deltaNet)}`}
                        </td>
                        <td className={`px-3 py-2.5 text-right font-mono ${
                          s.deltaPct === null ? 'text-text-faint' :
                          s.suspicious ? 'text-red-500 font-bold' :
                          s.deltaPct < 0 ? 'text-red-500' :
                          s.deltaPct > 0 ? 'text-emerald-500' : 'text-text-faint'
                        }`}>
                          {s.deltaPct === null ? '—' : `${s.deltaPct >= 0 ? '+' : ''}${(s.deltaPct * 100).toFixed(2)}%`}
                          {s.suspicious && <AlertTriangle className="w-3.5 h-3.5 inline-block ml-1" />}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr key={`${s.id}-detail`} className="bg-cyan-500/5 border-b border-border-primary/50">
                          <td colSpan={7} className="px-6 py-4">
                            {detailLoading === s.id && (
                              <p className="text-sm text-text-muted">Loading detail…</p>
                            )}
                            {details[s.id] && (
                              <YearMonthDetail detail={details[s.id]} />
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function YearMonthDetail({ detail }: { detail: SnapshotDetail }) {
  // Build year × month grid from the snapshot's flat array
  const grid = useMemo(() => {
    const m = new Map<number, number[]>();
    for (const r of detail.yearMonth ?? []) {
      if (!m.has(r.y)) m.set(r.y, new Array(12).fill(0));
      m.get(r.y)![r.m - 1] += r.net;
    }
    return Array.from(m.entries()).sort(([a], [b]) => a - b);
  }, [detail.yearMonth]);

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  return (
    <div className="space-y-3">
      <div className="text-xs text-text-muted">
        Snapshot id: <span className="font-mono">{detail.id}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-surface-tertiary text-text-secondary uppercase">
              <th className="text-left px-2 py-1.5 font-semibold">Year</th>
              {MONTHS.map((m) => (
                <th key={m} className="text-right px-2 py-1.5 font-semibold">{m}</th>
              ))}
              <th className="text-right px-2 py-1.5 font-bold border-l border-border-strong">Annual</th>
            </tr>
          </thead>
          <tbody>
            {grid.map(([y, row]) => {
              const total = row.reduce((s, v) => s + v, 0);
              return (
                <tr key={y} className="border-b border-border-primary/30">
                  <td className="px-2 py-1.5 font-mono font-semibold">{y}</td>
                  {row.map((v, i) => (
                    <td key={i} className={`px-2 py-1.5 text-right font-mono ${v === 0 ? 'text-text-faint' : 'text-text-primary'}`}>
                      {v === 0 ? '—' : fmtMillions(v)}
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-right font-mono font-bold border-l border-border-strong">
                    {fmtMillions(total)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
