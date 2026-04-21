'use client';

/**
 * Pullback View — triage styles × colors that need to come off kuhl.com
 * or have orders canceled based on ATS (Available To Sell) data.
 *
 * Sections (sub-tabs inside the view):
 *   1. Urgent Cancels       — ATS ≤ 0 AND OH > 0 (oversold, can't fulfill)
 *   2. Remove from kuhl.com — Classification = WEB AND ATS < threshold
 *   3. Closeout Review      — Classification ∈ {CLOS, 30, 50, 70}
 *   4. Slow Movers          — High OH, low recent revenue (cross-ref Sales)
 *
 * Each row can be tagged with a decision (PULL_FROM_SITE, CANCEL_ORDERS,
 * LIQUIDATE, KEEP, OTHER) which persists via /api/data/ats-decision.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SalesRecord } from '@/types/product';
import {
  AlertTriangle,
  ExternalLink,
  Tag,
  TrendingDown,
  Upload,
  Download,
  Check,
  Loader2,
  AlertCircle,
  Filter,
  X,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import MultiSelect from '@/components/MultiSelect';

const EDITED_BY_KEY = 'kuhl-edited-by';

// Actions we let users tag a style × color with.
type DecisionAction = 'PULL_FROM_SITE' | 'CANCEL_ORDERS' | 'LIQUIDATE' | 'KEEP' | 'OTHER';

const ACTION_LABELS: Record<DecisionAction, string> = {
  PULL_FROM_SITE: 'Pull from site',
  CANCEL_ORDERS: 'Cancel orders',
  LIQUIDATE: 'Liquidate',
  KEEP: 'Keep live',
  OTHER: 'Other',
};

const ACTION_COLORS: Record<DecisionAction, string> = {
  PULL_FROM_SITE: 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 border border-red-500/30',
  CANCEL_ORDERS: 'bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-300 border border-orange-500/30',
  LIQUIDATE: 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-500/30',
  KEEP: 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30',
  OTHER: 'bg-surface-tertiary text-text-secondary border border-primary',
};

interface AtsRow {
  id: string;
  styleNumber: string;
  color: string;
  styleDesc: string | null;
  colorDesc: string | null;
  gender: string | null;
  category: string | null;
  styleSegment: string | null;
  blockCode: string | null;
  classification: string | null;
  wholesale: number;
  msrp: number;
  styleVendor: string | null;
  warehouse: string | null;
  unitsATS: number;
  unitsOnHand: number;
  unitsAtOnce: number;
  snapshotDate: string;
}

interface Decision {
  id: string;
  styleNumber: string;
  color: string;
  action: DecisionAction;
  decidedBy: string;
  note: string | null;
  decidedAt: string;
}

interface PullbackViewProps {
  sales: SalesRecord[];
  onStyleClick?: (styleNumber: string) => void;
}

type SectionKey = 'urgent' | 'web' | 'closeout' | 'slow';

const WEB_ATS_THRESHOLD = 5;
const CLOSEOUT_CODES = new Set(['CLOS', '30', '50', '70']);
const formatCurrency = (v: number) => `$${v.toFixed(2)}`;
const formatCurrencyShort = (v: number) => {
  if (!Number.isFinite(v)) return '—';
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${Math.round(v)}`;
};
const formatNumber = (v: number) => (Number.isFinite(v) ? Math.round(v).toLocaleString() : '—');

export default function PullbackView({ sales, onStyleClick }: PullbackViewProps) {
  // ── Data ──
  const [ats, setAts] = useState<AtsRow[] | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [snapshotDate, setSnapshotDate] = useState<string | null>(null);

  // ── UI state ──
  const [section, setSection] = useState<SectionKey>('urgent');
  const [search, setSearch] = useState('');
  const [filterGender, setFilterGender] = useState<string[]>([]);
  const [filterCategory, setFilterCategory] = useState<string[]>([]);
  const [filterClass, setFilterClass] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Decision modal state
  const [decidingRow, setDecidingRow] = useState<AtsRow | null>(null);
  const [decisionAction, setDecisionAction] = useState<DecisionAction>('PULL_FROM_SITE');
  const [decisionNote, setDecisionNote] = useState('');
  const [decisionSaving, setDecisionSaving] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [editorName, setEditorName] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem(EDITED_BY_KEY) ?? '' : ''
  );

  // ── Fetch ATS + decisions ──
  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      const [atsRes, decRes] = await Promise.all([
        fetch('/api/data/ats'),
        fetch('/api/data/ats-decisions'),
      ]);
      const atsJson = await atsRes.json();
      const decJson = await decRes.json();
      if (!atsRes.ok) throw new Error(atsJson.error || `HTTP ${atsRes.status}`);
      if (!decRes.ok) throw new Error(decJson.error || `HTTP ${decRes.status}`);
      setAts(atsJson.ats ?? []);
      setDecisions(decJson.decisions ?? []);
      setSnapshotDate(atsJson.snapshotDate ?? null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
      setAts([]);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // ── Latest decision per (style, color) lookup ──
  const decisionByKey = useMemo(() => {
    const m = new Map<string, Decision>();
    for (const d of decisions) {
      const k = `${d.styleNumber}|${d.color}`;
      const cur = m.get(k);
      if (!cur || new Date(d.decidedAt) > new Date(cur.decidedAt)) m.set(k, d);
    }
    return m;
  }, [decisions]);

  // ── Derived lookups for filters ──
  const genders = useMemo(() => {
    const s = new Set<string>();
    (ats ?? []).forEach((r) => r.gender && s.add(r.gender));
    return Array.from(s).sort();
  }, [ats]);
  const categories = useMemo(() => {
    const s = new Set<string>();
    (ats ?? []).forEach((r) => r.category && s.add(r.category));
    return Array.from(s).sort();
  }, [ats]);
  const classifications = useMemo(() => {
    const s = new Set<string>();
    (ats ?? []).forEach((r) => r.classification && s.add(r.classification));
    return Array.from(s).sort();
  }, [ats]);

  // ── Section filtering ──
  const matchesFilters = (r: AtsRow): boolean => {
    if (filterGender.length > 0 && (!r.gender || !filterGender.includes(r.gender))) return false;
    if (filterCategory.length > 0 && (!r.category || !filterCategory.includes(r.category))) return false;
    if (filterClass.length > 0 && (!r.classification || !filterClass.includes(r.classification))) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !r.styleNumber.toLowerCase().includes(q) &&
        !(r.styleDesc ?? '').toLowerCase().includes(q) &&
        !(r.color ?? '').toLowerCase().includes(q) &&
        !(r.colorDesc ?? '').toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  };

  // Sales by style (all seasons) — used for Slow Movers
  const salesByStyle = useMemo(() => {
    const m = new Map<string, { revenue: number; units: number }>();
    sales.forEach((s) => {
      if (!s.styleNumber) return;
      const e = m.get(s.styleNumber) ?? { revenue: 0, units: 0 };
      e.revenue += s.revenue || 0;
      e.units += s.unitsBooked || 0;
      m.set(s.styleNumber, e);
    });
    return m;
  }, [sales]);

  const urgentRows = useMemo(() => {
    return (ats ?? []).filter((r) => r.unitsATS <= 0 && r.unitsOnHand > 0 && matchesFilters(r));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ats, filterGender, filterCategory, filterClass, search]);

  const webRows = useMemo(() => {
    return (ats ?? []).filter(
      (r) => (r.classification ?? '') === 'WEB' && r.unitsATS < WEB_ATS_THRESHOLD && matchesFilters(r),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ats, filterGender, filterCategory, filterClass, search]);

  const closeoutRows = useMemo(() => {
    return (ats ?? []).filter((r) => CLOSEOUT_CODES.has(r.classification ?? '') && matchesFilters(r));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ats, filterGender, filterCategory, filterClass, search]);

  // Slow movers: OH > 50 units AND sell-through ratio < 0.5 AND ats > 0 (still live)
  const slowRows = useMemo(() => {
    return (ats ?? [])
      .map((r) => {
        const sold = salesByStyle.get(r.styleNumber)?.units ?? 0;
        const sellThrough = r.unitsOnHand > 0 ? sold / r.unitsOnHand : 0;
        return { ...r, sold, sellThrough };
      })
      .filter(
        (r) => r.unitsOnHand > 50 && r.unitsATS > 0 && r.sellThrough < 0.5 && matchesFilters(r),
      )
      .sort((a, b) => a.sellThrough - b.sellThrough);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ats, salesByStyle, filterGender, filterCategory, filterClass, search]);

  // Current section's rows (as a generic AtsRow[] for UI)
  const sectionRows: (AtsRow & { sold?: number; sellThrough?: number })[] = useMemo(() => {
    switch (section) {
      case 'urgent':
        return urgentRows;
      case 'web':
        return webRows;
      case 'closeout':
        return closeoutRows;
      case 'slow':
        return slowRows;
    }
  }, [section, urgentRows, webRows, closeoutRows, slowRows]);

  // ── Summary cards (top-of-page) ──
  const summary = useMemo(() => {
    const oversoldUnits = urgentRows.reduce((sum, r) => sum + Math.abs(Math.min(0, r.unitsATS)), 0);
    const oversoldRisk = urgentRows.reduce(
      (sum, r) => sum + Math.abs(Math.min(0, r.unitsATS)) * (r.wholesale || 0),
      0,
    );
    const closeoutOHValue = closeoutRows.reduce(
      (sum, r) => sum + r.unitsOnHand * (r.wholesale || 0),
      0,
    );
    return {
      urgentCount: urgentRows.length,
      oversoldUnits,
      oversoldRisk,
      webCount: webRows.length,
      closeoutCount: closeoutRows.length,
      closeoutOHValue,
      slowCount: slowRows.length,
    };
  }, [urgentRows, webRows, closeoutRows, slowRows]);

  // ── Upload handler ──
  const handleUpload = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/data/import-ats', { method: 'POST', body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setUploadSuccess(`Imported ${j.imported} rows (from ${j.rawRows} raw).`);
      await refresh();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  };

  // ── Decision save ──
  const saveDecision = async () => {
    if (!decidingRow) return;
    setDecisionSaving(true);
    setDecisionError(null);
    try {
      const name = editorName.trim();
      if (!name) {
        setDecisionError('Please enter your name.');
        setDecisionSaving(false);
        return;
      }
      try { localStorage.setItem(EDITED_BY_KEY, name); } catch { /* ignore */ }
      const res = await fetch('/api/data/ats-decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          styleNumber: decidingRow.styleNumber,
          color: decidingRow.color,
          action: decisionAction,
          decidedBy: name,
          note: decisionNote.trim() || undefined,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      // Append locally; decisionByKey memo picks up the new latest
      setDecisions((prev) => [j.decision, ...prev]);
      setDecidingRow(null);
      setDecisionNote('');
    } catch (err) {
      setDecisionError(err instanceof Error ? err.message : String(err));
    } finally {
      setDecisionSaving(false);
    }
  };

  // ── Export selected rows (or all shown) ──
  const handleExport = () => {
    const rows = sectionRows.filter((r) => selected.size === 0 || selected.has(`${r.styleNumber}|${r.color}`));
    if (rows.length === 0) return;
    const aoa: unknown[][] = [
      [
        'Style', 'Color', 'Color Desc', 'Description', 'Gender', 'Category',
        'Classification', 'Units ATS', 'Units On Hand', 'Units At-Once',
        'Wholesale', 'MSRP', 'Revenue at Risk', 'Current Decision', 'Decided By', 'Note',
      ],
    ];
    rows.forEach((r) => {
      const d = decisionByKey.get(`${r.styleNumber}|${r.color}`);
      const oversold = Math.abs(Math.min(0, r.unitsATS));
      aoa.push([
        r.styleNumber,
        r.color,
        r.colorDesc ?? '',
        r.styleDesc ?? '',
        r.gender ?? '',
        r.category ?? '',
        r.classification ?? '',
        r.unitsATS,
        r.unitsOnHand,
        r.unitsAtOnce,
        r.wholesale,
        r.msrp,
        oversold * (r.wholesale || 0),
        d ? ACTION_LABELS[d.action] : '',
        d?.decidedBy ?? '',
        d?.note ?? '',
      ]);
    });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, 'Pullback');
    const date = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `KUHL_Pullback_${section}_${date}.xlsx`);
  };

  // ── Row select ──
  const toggleSelect = (key: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  };
  const selectAllVisible = () => {
    setSelected(new Set(sectionRows.map((r) => `${r.styleNumber}|${r.color}`)));
  };
  const clearSelection = () => setSelected(new Set());

  // ── Render ──
  const sections: { key: SectionKey; label: string; count: number; tone: string }[] = [
    { key: 'urgent', label: 'Urgent Cancels', count: summary.urgentCount, tone: 'red' },
    { key: 'web', label: 'Remove from kuhl.com', count: summary.webCount, tone: 'orange' },
    { key: 'closeout', label: 'Closeout Review', count: summary.closeoutCount, tone: 'amber' },
    { key: 'slow', label: 'Slow Movers', count: summary.slowCount, tone: 'purple' },
  ];

  // Empty state: no ATS data yet
  const noData = ats !== null && ats.length === 0 && !loadError;

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-4xl font-display font-bold text-text-primary">Pullback</h2>
          <p className="text-base text-text-muted mt-2">
            Styles that need to come off kuhl.com or have orders canceled, sourced from the ATS export.
          </p>
          {snapshotDate && (
            <p className="text-xs text-text-faint mt-1">
              Last ATS snapshot: {new Date(snapshotDate).toLocaleString()}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
              e.target.value = '';
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg disabled:opacity-50 transition-colors"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? 'Importing…' : 'Import ATS'}
          </button>
          <button
            onClick={handleExport}
            disabled={sectionRows.length === 0}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg disabled:opacity-50 transition-colors"
          >
            <Download className="w-4 h-4" />
            Export {selected.size > 0 ? `(${selected.size})` : ''}
          </button>
        </div>
      </div>

      {/* Upload feedback */}
      {uploadError && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {uploadError}
        </div>
      )}
      {uploadSuccess && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-sm text-emerald-400 flex items-center gap-2">
          <Check className="w-4 h-4" />
          {uploadSuccess}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-surface-secondary rounded-xl p-4 border-l-4 border-red-500">
          <div className="text-xs text-text-muted uppercase tracking-wide">Urgent (oversold)</div>
          <div className="mt-1 font-mono font-bold text-2xl text-text-primary">{summary.urgentCount}</div>
          <div className="text-xs text-text-muted mt-1">
            {formatNumber(summary.oversoldUnits)} oversold units · ~{formatCurrencyShort(summary.oversoldRisk)} at risk
          </div>
        </div>
        <div className="bg-surface-secondary rounded-xl p-4 border-l-4 border-orange-500">
          <div className="text-xs text-text-muted uppercase tracking-wide">kuhl.com to pull</div>
          <div className="mt-1 font-mono font-bold text-2xl text-text-primary">{summary.webCount}</div>
          <div className="text-xs text-text-muted mt-1">WEB-only styles with ATS &lt; {WEB_ATS_THRESHOLD}</div>
        </div>
        <div className="bg-surface-secondary rounded-xl p-4 border-l-4 border-amber-500">
          <div className="text-xs text-text-muted uppercase tracking-wide">Closeout</div>
          <div className="mt-1 font-mono font-bold text-2xl text-text-primary">{summary.closeoutCount}</div>
          <div className="text-xs text-text-muted mt-1">
            ~{formatCurrencyShort(summary.closeoutOHValue)} OH at wholesale
          </div>
        </div>
        <div className="bg-surface-secondary rounded-xl p-4 border-l-4 border-purple-500">
          <div className="text-xs text-text-muted uppercase tracking-wide">Slow movers</div>
          <div className="mt-1 font-mono font-bold text-2xl text-text-primary">{summary.slowCount}</div>
          <div className="text-xs text-text-muted mt-1">&gt; 50 OH · sell-through &lt; 50%</div>
        </div>
      </div>

      {/* Section pills */}
      <div className="flex items-center gap-2 flex-wrap">
        {sections.map((s) => {
          const active = section === s.key;
          return (
            <button
              key={s.key}
              onClick={() => {
                setSection(s.key);
                clearSelection();
              }}
              className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
                active
                  ? s.tone === 'red' ? 'bg-red-600 text-white'
                    : s.tone === 'orange' ? 'bg-orange-600 text-white'
                    : s.tone === 'amber' ? 'bg-amber-600 text-white'
                    : 'bg-purple-600 text-white'
                  : 'bg-surface-tertiary text-text-secondary hover:bg-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              {s.label} <span className="ml-1 opacity-80">({s.count})</span>
            </button>
          );
        })}
      </div>

      {/* Filter bar */}
      <div className="bg-surface rounded-xl border-2 border-border-primary p-4 flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold text-text-secondary uppercase tracking-wide">Search</label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Style / desc / color"
            className="px-3 py-2 text-sm border-2 border-border-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 w-[220px]"
          />
        </div>
        <MultiSelect
          label="Gender"
          placeholder="All genders"
          options={genders}
          values={filterGender}
          onChange={setFilterGender}
          widthClass="w-[160px]"
        />
        <MultiSelect
          label="Category"
          placeholder="All categories"
          options={categories}
          values={filterCategory}
          onChange={setFilterCategory}
          widthClass="w-[180px]"
        />
        <MultiSelect
          label="Classification"
          placeholder="All"
          options={classifications}
          values={filterClass}
          onChange={setFilterClass}
          widthClass="w-[160px]"
        />
        {(search || filterGender.length > 0 || filterCategory.length > 0 || filterClass.length > 0) && (
          <button
            onClick={() => {
              setSearch('');
              setFilterGender([]);
              setFilterCategory([]);
              setFilterClass([]);
            }}
            className="flex items-center gap-1 px-3 py-2 text-sm font-semibold text-cyan-600 hover:bg-hover-accent rounded-lg"
          >
            <X className="w-4 h-4" /> Clear
          </button>
        )}
        <div className="ml-auto flex items-center gap-2 text-xs text-text-muted">
          <Filter className="w-3.5 h-3.5" />
          {sectionRows.length.toLocaleString()} rows
          {selected.size > 0 && (
            <>
              <span>·</span>
              <span className="text-cyan-400 font-semibold">{selected.size} selected</span>
              <button onClick={clearSelection} className="text-text-muted hover:text-text-primary underline">
                clear
              </button>
            </>
          )}
        </div>
      </div>

      {/* Body */}
      {loadError && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
          Failed to load ATS: {loadError}
        </div>
      )}
      {ats === null && !loadError && (
        <div className="p-8 text-center text-text-muted">
          <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading ATS…
        </div>
      )}
      {noData && (
        <div className="p-8 text-center border-2 border-dashed border-border-primary rounded-xl">
          <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
          <p className="text-text-primary font-semibold mb-1">No ATS data imported yet</p>
          <p className="text-sm text-text-muted mb-4">
            Upload an ATS export (e.g. <code className="font-mono text-xs">2026-04-21 ATS Current.xlsx</code>) to populate this view.
          </p>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg"
          >
            <Upload className="w-4 h-4" />
            Import ATS
          </button>
        </div>
      )}

      {ats !== null && ats.length > 0 && sectionRows.length === 0 && (
        <div className="p-8 text-center text-text-muted border-2 border-dashed border-border-primary rounded-xl">
          No rows match this filter — everything in this section is clear.
        </div>
      )}

      {sectionRows.length > 0 && (
        <div className="bg-surface rounded-xl border-2 border-border-primary overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-surface-tertiary border-b-2 border-border-strong text-xs uppercase tracking-wide text-text-secondary">
                  <th className="px-3 py-2 text-left">
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={selected.size > 0 && selected.size === sectionRows.length}
                      onChange={(e) => {
                        if (e.target.checked) selectAllVisible();
                        else clearSelection();
                      }}
                    />
                  </th>
                  <th className="px-3 py-2 text-left">Style</th>
                  <th className="px-3 py-2 text-left">Color</th>
                  <th className="px-3 py-2 text-left">Description</th>
                  <th className="px-3 py-2 text-left">Class</th>
                  <th className="px-3 py-2 text-right">ATS</th>
                  <th className="px-3 py-2 text-right">On Hand</th>
                  <th className="px-3 py-2 text-right">At-Once</th>
                  {section === 'slow' && <th className="px-3 py-2 text-right">Sold</th>}
                  {section === 'slow' && <th className="px-3 py-2 text-right">Sell-Thru</th>}
                  <th className="px-3 py-2 text-right">Whsl</th>
                  <th className="px-3 py-2 text-right">Risk $</th>
                  <th className="px-3 py-2 text-left">Decision</th>
                </tr>
              </thead>
              <tbody>
                {sectionRows.map((r) => {
                  const key = `${r.styleNumber}|${r.color}`;
                  const decision = decisionByKey.get(key);
                  const oversold = Math.abs(Math.min(0, r.unitsATS));
                  const risk = oversold * (r.wholesale || 0);
                  const isSelected = selected.has(key);
                  const atsNegative = r.unitsATS < 0;
                  return (
                    <tr
                      key={r.id}
                      className={`border-b border-border-primary hover:bg-hover-accent transition-colors ${isSelected ? 'bg-cyan-500/5' : ''}`}
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(key)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => onStyleClick?.(r.styleNumber)}
                          className="font-mono font-semibold text-text-primary hover:text-cyan-400"
                          title="Open style detail"
                        >
                          {r.styleNumber}
                        </button>
                      </td>
                      <td className="px-3 py-2 text-sm">
                        <span className="font-mono text-text-muted mr-2">{r.color}</span>
                        <span className="text-text-secondary">{r.colorDesc ?? ''}</span>
                      </td>
                      <td className="px-3 py-2 text-sm text-text-secondary truncate max-w-[220px]" title={r.styleDesc ?? ''}>
                        {r.styleDesc ?? ''}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <span className="inline-block px-1.5 py-0.5 rounded bg-surface-tertiary text-text-muted font-mono">
                          {r.classification ?? '—'}
                        </span>
                      </td>
                      <td className={`px-3 py-2 text-right font-mono ${atsNegative ? 'text-red-500 font-bold' : 'text-text-primary'}`}>
                        {formatNumber(r.unitsATS)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-text-primary">{formatNumber(r.unitsOnHand)}</td>
                      <td className="px-3 py-2 text-right font-mono text-text-muted">{formatNumber(r.unitsAtOnce)}</td>
                      {section === 'slow' && (
                        <td className="px-3 py-2 text-right font-mono text-text-primary">
                          {formatNumber(r.sold ?? 0)}
                        </td>
                      )}
                      {section === 'slow' && (
                        <td className="px-3 py-2 text-right font-mono text-purple-400">
                          {((r.sellThrough ?? 0) * 100).toFixed(0)}%
                        </td>
                      )}
                      <td className="px-3 py-2 text-right font-mono text-text-primary">{formatCurrency(r.wholesale)}</td>
                      <td className={`px-3 py-2 text-right font-mono ${risk > 0 ? 'text-red-500 font-semibold' : 'text-text-muted'}`}>
                        {risk > 0 ? formatCurrencyShort(risk) : '—'}
                      </td>
                      <td className="px-3 py-2">
                        {decision ? (
                          <div className="flex items-center gap-2">
                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${ACTION_COLORS[decision.action]}`}>
                              {ACTION_LABELS[decision.action]}
                            </span>
                            <button
                              onClick={() => {
                                setDecidingRow(r);
                                setDecisionAction(decision.action);
                                setDecisionNote(decision.note ?? '');
                                setDecisionError(null);
                              }}
                              className="text-text-muted hover:text-cyan-400"
                              title={`Decided by ${decision.decidedBy} · ${new Date(decision.decidedAt).toLocaleDateString()}${decision.note ? ` · ${decision.note}` : ''}`}
                            >
                              <Tag className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setDecidingRow(r);
                              // Sensible default per section
                              setDecisionAction(
                                section === 'urgent' ? 'CANCEL_ORDERS'
                                  : section === 'web' ? 'PULL_FROM_SITE'
                                  : section === 'closeout' ? 'LIQUIDATE'
                                  : 'PULL_FROM_SITE',
                              );
                              setDecisionNote('');
                              setDecisionError(null);
                            }}
                            className="flex items-center gap-1 px-2 py-1 text-xs font-semibold text-cyan-600 hover:bg-cyan-500/10 rounded"
                          >
                            <Tag className="w-3.5 h-3.5" />
                            Tag action
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Decision modal */}
      {decidingRow && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => !decisionSaving && setDecidingRow(null)}
          />
          <div className="relative bg-surface rounded-xl shadow-2xl border border-primary max-w-md w-full mx-4 overflow-hidden">
            <div className="p-5 border-b border-primary">
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-cyan-500/20 flex items-center justify-center">
                  <ExternalLink className="w-5 h-5 text-cyan-400" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-text-primary">Tag action</h2>
                  <p className="text-sm text-text-muted truncate">
                    {decidingRow.styleNumber} · {decidingRow.color} · {decidingRow.styleDesc ?? ''}
                  </p>
                </div>
              </div>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">Action</label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(ACTION_LABELS) as DecisionAction[]).map((a) => (
                    <button
                      key={a}
                      onClick={() => setDecisionAction(a)}
                      disabled={decisionSaving}
                      className={`px-3 py-2 text-sm font-semibold rounded-lg border-2 transition-colors ${
                        decisionAction === a
                          ? `${ACTION_COLORS[a]} !border-current`
                          : 'bg-surface-secondary border-primary text-text-secondary hover:bg-surface-tertiary'
                      }`}
                    >
                      {ACTION_LABELS[a]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1">
                  Your name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={editorName}
                  onChange={(e) => setEditorName(e.target.value)}
                  disabled={decisionSaving}
                  placeholder="e.g. Shelby"
                  className="w-full px-3 py-2 bg-surface-secondary border border-primary rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1">Note (optional)</label>
                <input
                  type="text"
                  value={decisionNote}
                  onChange={(e) => setDecisionNote(e.target.value)}
                  disabled={decisionSaving}
                  placeholder="Why this action?"
                  className="w-full px-3 py-2 bg-surface-secondary border border-primary rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
              {decisionError && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <p className="text-sm text-red-400">{decisionError}</p>
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-primary">
              <button
                onClick={() => setDecidingRow(null)}
                disabled={decisionSaving}
                className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={saveDecision}
                disabled={decisionSaving}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg disabled:opacity-50"
              >
                {decisionSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingDown className="w-4 h-4" />}
                {decisionSaving ? 'Saving…' : 'Save decision'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
