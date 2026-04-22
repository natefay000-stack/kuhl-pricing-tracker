'use client';

/**
 * Pullback View — triage styles × colors that need to come off kuhl.com
 * or have orders canceled.
 *
 * Data sources:
 *   - AtsInventory snapshot (Units ATS / OH / At-Once + Classification)
 *   - SalesRecord (aggregated sales by style+color+season, channel mix)
 *   - Invoice (shipped dates, shipped $, returns, customer) — used to
 *     compute Weeks-of-Supply, velocity trend, days-since-last-sold,
 *     average net price, and return rate.
 *   - Cost (landed cost for OH $ at cost math)
 *
 * Sections (sub-tabs inside the view):
 *   Urgent Cancels       — ATS ≤ 0 AND OH > 0
 *   Remove from kuhl.com — Classification = WEB AND ATS < threshold
 *   Closeout Review      — Classification ∈ {CLOS, 30, 50, 70}
 *   Slow Movers          — OH > 50 AND ATS > 0 AND WOS > 52 weeks
 *   Deadstock            — OH > 25 AND (no sales in last 180d OR
 *                          days since last sale > 180)
 *
 * Each row gets a computed recommendation that pre-seeds the Tag Action
 * modal.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SalesRecord, InvoiceRecord, CostRecord } from '@/types/product';
import {
  AlertTriangle,
  ExternalLink,
  Tag,
  TrendingDown,
  TrendingUp,
  ArrowRight,
  Upload,
  Download,
  Check,
  Loader2,
  AlertCircle,
  Filter,
  X,
  Sparkles,
  Skull,
  Globe,
  RefreshCw,
  EyeOff,
  Eye,
  HelpCircle,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import MultiSelect from '@/components/MultiSelect';

const EDITED_BY_KEY = 'kuhl-edited-by';

// ── Config ──────────────────────────────────────────────────────────────
const SALES_WINDOW_DAYS = 180; // "recent sales" window
const WEEKS_IN_WINDOW = SALES_WINDOW_DAYS / 7;
const WEB_ATS_THRESHOLD = 5;
const CLOSEOUT_CODES = new Set(['CLOS', '30', '50', '70']);
const DEADSTOCK_DAYS = 180;
const DEADSTOCK_OH = 25;
const SLOW_OH_THRESHOLD = 50;
const SLOW_WOS_THRESHOLD = 52; // >52 weeks of supply = slow

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

interface KuhlSiteStatus {
  id: string;
  styleNumber: string;
  isLive: boolean | null;
  siteUrl: string | null;
  currentPrice: number | null;
  currentMsrp: number | null;
  source: string | null;
  errorMessage: string | null;
  lastCheckedAt: string;
}

interface SyncReport {
  configured: boolean;
  source: 'strapi' | 'api' | 'none';
  fetched: number;
  live: number;
  hidden: number;
  notFound: number;
  errors: number;
  tookMs: number;
  message: string;
}

interface RowMetrics {
  // Invoice-derived
  unitsLast180d: number;
  unitsLast90d: number;
  unitsPrior90d: number;
  shippedAtNetLast180d: number;
  lastSoldDaysAgo: number | null; // null if never sold
  avgNetPrice: number; // based on last 180d when possible, else all-time, else 0
  returnRate: number; // units returned / units shipped (all-time)
  // Derived
  weeksOfSupply: number | null; // null if no recent sales
  velocityDelta: number | null; // (last90 - prior90) / prior90
  velocityTrend: 'up' | 'down' | 'flat' | null;
  // $ exposure
  ohAtWholesale: number;
  ohAtLanded: number;
  revenueAtRisk: number; // oversold × avgNet (fallback: wholesale)
  // Channel hint
  topChannel: string | null;
  topCustomer: string | null;
}

type EnrichedRow = AtsRow & {
  m: RowMetrics;
  landed: number;
  /** True when `landed` was estimated (wholesale × 0.5) because no Cost row exists for this style. */
  landedIsEstimated: boolean;
  recommendation: DecisionAction;
  recReason: string;
};

interface PullbackViewProps {
  sales: SalesRecord[];
  invoices: InvoiceRecord[];
  costs: CostRecord[];
  onStyleClick?: (styleNumber: string) => void;
}

type SectionKey = 'urgent' | 'web' | 'closeout' | 'slow' | 'deadstock';

const fmtCurrency = (v: number) => `$${v.toFixed(2)}`;
const fmtCurrencyShort = (v: number) => {
  if (!Number.isFinite(v)) return '—';
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${Math.round(v)}`;
};
const fmtNumber = (v: number) => (Number.isFinite(v) ? Math.round(v).toLocaleString() : '—');
const fmtPct = (v: number | null, digits = 0) =>
  v == null || !Number.isFinite(v) ? '—' : `${v.toFixed(digits)}%`;

const fmtWOS = (v: number | null) => {
  if (v == null) return '—';
  if (!Number.isFinite(v)) return '∞';
  if (v < 1) return '<1 wk';
  if (v >= 104) return '2+ yrs';
  if (v >= 52) return `${(v / 52).toFixed(1)} yrs`;
  return `${v.toFixed(0)} wks`;
};

const fmtDaysAgo = (d: number | null) => {
  if (d == null) return 'never';
  if (d === 0) return 'today';
  if (d < 30) return `${d}d ago`;
  if (d < 365) return `${Math.round(d / 30)}mo ago`;
  return `${(d / 365).toFixed(1)}yr ago`;
};

export default function PullbackView({ sales, invoices, costs, onStyleClick }: PullbackViewProps) {
  // ── Data fetch ──
  const [ats, setAts] = useState<AtsRow[] | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [siteStatuses, setSiteStatuses] = useState<KuhlSiteStatus[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [snapshotDate, setSnapshotDate] = useState<string | null>(null);

  // ── kuhl.com sync state ──
  const [syncing, setSyncing] = useState(false);
  const [syncReport, setSyncReport] = useState<SyncReport | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

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
  const [decidingRow, setDecidingRow] = useState<EnrichedRow | null>(null);
  const [decisionAction, setDecisionAction] = useState<DecisionAction>('PULL_FROM_SITE');
  const [decisionNote, setDecisionNote] = useState('');
  const [decisionSaving, setDecisionSaving] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [editorName, setEditorName] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem(EDITED_BY_KEY) ?? '' : ''
  );

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      const [atsRes, decRes, siteRes] = await Promise.all([
        fetch('/api/data/ats'),
        fetch('/api/data/ats-decisions'),
        fetch('/api/data/kuhl-site-status'),
      ]);
      const atsJson = await atsRes.json();
      const decJson = await decRes.json();
      const siteJson = await siteRes.json().catch(() => ({ statuses: [] }));
      if (!atsRes.ok) throw new Error(atsJson.error || `HTTP ${atsRes.status}`);
      if (!decRes.ok) throw new Error(decJson.error || `HTTP ${decRes.status}`);
      setAts(atsJson.ats ?? []);
      setDecisions(decJson.decisions ?? []);
      setSiteStatuses(siteJson.statuses ?? []);
      setSnapshotDate(atsJson.snapshotDate ?? null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
      setAts([]);
    }
  }, []);

  const runSync = useCallback(async () => {
    setSyncing(true);
    setSyncError(null);
    setSyncReport(null);
    try {
      const res = await fetch('/api/data/sync-kuhl-site', { method: 'POST' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || j.message || `HTTP ${res.status}`);
      setSyncReport(j as SyncReport);
      // Refresh statuses from DB after sync
      const statusRes = await fetch('/api/data/kuhl-site-status');
      const statusJson = await statusRes.json().catch(() => ({ statuses: [] }));
      setSiteStatuses(statusJson.statuses ?? []);
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const decisionByKey = useMemo(() => {
    const m = new Map<string, Decision>();
    for (const d of decisions) {
      const k = `${d.styleNumber}|${d.color}`;
      const cur = m.get(k);
      if (!cur || new Date(d.decidedAt) > new Date(cur.decidedAt)) m.set(k, d);
    }
    return m;
  }, [decisions]);

  // Latest kuhl.com status per styleNumber
  const siteStatusByStyle = useMemo(() => {
    const m = new Map<string, KuhlSiteStatus>();
    for (const s of siteStatuses) m.set(s.styleNumber, s);
    return m;
  }, [siteStatuses]);

  const lastSyncedAt = useMemo(() => {
    if (siteStatuses.length === 0) return null;
    return siteStatuses.reduce<string | null>((latest, s) => {
      return !latest || s.lastCheckedAt > latest ? s.lastCheckedAt : latest;
    }, null);
  }, [siteStatuses]);

  const landedByKey = useMemo(() => {
    // Best available landed cost per style (use any season — prefer most recent)
    const m = new Map<string, number>();
    for (const c of costs) {
      if (!c.styleNumber || c.landed <= 0) continue;
      const cur = m.get(c.styleNumber);
      if (!cur || c.landed > cur) m.set(c.styleNumber, c.landed);
    }
    return m;
  }, [costs]);

  // ── Invoice aggregates per style+color ──
  // Single pass over the invoice list (120k rows max) building everything
  // we need for the metrics. Done once per invoice change.
  const invoiceAgg = useMemo(() => {
    const now = Date.now();
    const cutoff180 = now - SALES_WINDOW_DAYS * 24 * 3600 * 1000;
    const cutoff90 = now - 90 * 24 * 3600 * 1000;
    type Agg = {
      unitsLast180d: number;
      unitsLast90d: number;
      unitsPrior90d: number;
      shippedAtNetLast180d: number;
      shippedAtNetAll: number;
      unitsShippedAll: number;
      unitsReturnedAll: number;
      lastSold: number | null; // ms
    };
    const map = new Map<string, Agg>();

    for (const inv of invoices) {
      const style = inv.styleNumber;
      const color = inv.colorCode ?? '';
      if (!style) continue;
      const key = `${style}|${color}`;
      let a = map.get(key);
      if (!a) {
        a = {
          unitsLast180d: 0,
          unitsLast90d: 0,
          unitsPrior90d: 0,
          shippedAtNetLast180d: 0,
          shippedAtNetAll: 0,
          unitsShippedAll: 0,
          unitsReturnedAll: 0,
          lastSold: null,
        };
        map.set(key, a);
      }
      const units = inv.unitsShipped || 0;
      const net = inv.shippedAtNet || 0;
      const returned = inv.unitsReturned || 0;
      a.unitsShippedAll += units;
      a.shippedAtNetAll += net;
      a.unitsReturnedAll += returned;

      const dStr = inv.invoiceDate;
      const t = dStr ? new Date(dStr).getTime() : NaN;
      if (Number.isFinite(t)) {
        if (a.lastSold === null || t > a.lastSold) a.lastSold = t;
        if (t >= cutoff180) {
          a.unitsLast180d += units;
          a.shippedAtNetLast180d += net;
        }
        if (t >= cutoff90) {
          a.unitsLast90d += units;
        } else if (t >= cutoff180) {
          a.unitsPrior90d += units;
        }
      }
    }
    return map;
  }, [invoices]);

  // ── Sales-based channel + customer mix per style (not color) ──
  const salesMix = useMemo(() => {
    type Mix = {
      topChannel: string | null;
      topCustomer: string | null;
    };
    const byStyleChannel = new Map<string, Map<string, number>>();
    const byStyleCustomer = new Map<string, Map<string, number>>();
    for (const s of sales) {
      if (!s.styleNumber) continue;
      const rawType = (s.customerType ?? '').toString().toUpperCase();
      const channel = rawType.split(',')[0].trim() || 'Other';
      const chMap = byStyleChannel.get(s.styleNumber) ?? new Map<string, number>();
      chMap.set(channel, (chMap.get(channel) ?? 0) + (s.revenue || 0));
      byStyleChannel.set(s.styleNumber, chMap);
      if (s.customer) {
        const custMap = byStyleCustomer.get(s.styleNumber) ?? new Map<string, number>();
        custMap.set(s.customer, (custMap.get(s.customer) ?? 0) + (s.revenue || 0));
        byStyleCustomer.set(s.styleNumber, custMap);
      }
    }
    const mix = new Map<string, Mix>();
    const pickTop = (m: Map<string, number> | undefined): string | null => {
      if (!m || m.size === 0) return null;
      let best: [string, number] | null = null;
      for (const [k, v] of m) if (!best || v > best[1]) best = [k, v];
      return best ? best[0] : null;
    };
    const styles = new Set([...byStyleChannel.keys(), ...byStyleCustomer.keys()]);
    for (const s of styles) {
      mix.set(s, {
        topChannel: pickTop(byStyleChannel.get(s)),
        topCustomer: pickTop(byStyleCustomer.get(s)),
      });
    }
    return mix;
  }, [sales]);

  // ── Enrich every ATS row with metrics + recommendation ──
  const enrichedRows = useMemo<EnrichedRow[]>(() => {
    if (!ats) return [];
    const now = Date.now();

    return ats.map((r): EnrichedRow => {
      const k = `${r.styleNumber}|${r.color}`;
      const a = invoiceAgg.get(k);
      const mix = salesMix.get(r.styleNumber);
      // Landed cost: prefer the real Cost-table value; if missing, estimate
      // as wholesale × 0.5 (industry-standard ~50% margin) and flag it so
      // the UI can show an asterisk. Lets OH $ surface for styles that
      // never made it through the Landed Sheet (typical for older seasons).
      const realLanded = landedByKey.get(r.styleNumber) ?? 0;
      let landed = realLanded;
      let landedIsEstimated = false;
      if (landed <= 0 && r.wholesale > 0) {
        landed = r.wholesale * 0.5;
        landedIsEstimated = true;
      }

      const unitsLast180d = a?.unitsLast180d ?? 0;
      const unitsLast90d = a?.unitsLast90d ?? 0;
      const unitsPrior90d = a?.unitsPrior90d ?? 0;
      const shippedNetLast180d = a?.shippedAtNetLast180d ?? 0;
      const unitsShippedAll = a?.unitsShippedAll ?? 0;
      const unitsReturnedAll = a?.unitsReturnedAll ?? 0;
      const shippedNetAll = a?.shippedAtNetAll ?? 0;

      const lastSoldDaysAgo = a?.lastSold
        ? Math.floor((now - a.lastSold) / (24 * 3600 * 1000))
        : null;

      // Avg net price: prefer last 180d; fall back to all-time; else wholesale
      let avgNetPrice = 0;
      if (unitsLast180d > 0 && shippedNetLast180d > 0) {
        avgNetPrice = shippedNetLast180d / unitsLast180d;
      } else if (unitsShippedAll > 0 && shippedNetAll > 0) {
        avgNetPrice = shippedNetAll / unitsShippedAll;
      }

      const returnRate = unitsShippedAll > 0 ? unitsReturnedAll / unitsShippedAll : 0;

      // WOS = OH / (weekly rate). Infinity when no recent sales.
      let weeksOfSupply: number | null = null;
      if (unitsLast180d > 0) {
        const weeklyRate = unitsLast180d / WEEKS_IN_WINDOW;
        weeksOfSupply = weeklyRate > 0 ? r.unitsOnHand / weeklyRate : Infinity;
      } else if (r.unitsOnHand > 0) {
        weeksOfSupply = Infinity;
      }

      // Velocity trend
      let velocityDelta: number | null = null;
      let velocityTrend: 'up' | 'down' | 'flat' | null = null;
      if (unitsPrior90d > 0) {
        velocityDelta = (unitsLast90d - unitsPrior90d) / unitsPrior90d;
        if (velocityDelta > 0.1) velocityTrend = 'up';
        else if (velocityDelta < -0.1) velocityTrend = 'down';
        else velocityTrend = 'flat';
      } else if (unitsLast90d > 0) {
        velocityTrend = 'up';
        velocityDelta = 1;
      } else if (unitsLast180d > 0) {
        velocityTrend = 'down';
        velocityDelta = -1;
      }

      const oversold = Math.abs(Math.min(0, r.unitsATS));
      const revenueAtRisk = oversold * (avgNetPrice || r.wholesale || 0);
      const ohAtWholesale = r.unitsOnHand * (r.wholesale || 0);
      const ohAtLanded = r.unitsOnHand * (landed || 0);

      const m: RowMetrics = {
        unitsLast180d,
        unitsLast90d,
        unitsPrior90d,
        shippedAtNetLast180d: shippedNetLast180d,
        lastSoldDaysAgo,
        avgNetPrice,
        returnRate,
        weeksOfSupply,
        velocityDelta,
        velocityTrend,
        ohAtWholesale,
        ohAtLanded,
        revenueAtRisk,
        topChannel: mix?.topChannel ?? null,
        topCustomer: mix?.topCustomer ?? null,
      };

      // ── Recommendation engine ──
      // Priority-ordered. First match wins.
      let recommendation: DecisionAction = 'KEEP';
      let recReason = 'Healthy velocity, no action';
      const isDeadstock =
        r.unitsOnHand > DEADSTOCK_OH &&
        ((lastSoldDaysAgo != null && lastSoldDaysAgo > DEADSTOCK_DAYS) || unitsLast180d === 0);

      if (oversold > 0) {
        recommendation = 'CANCEL_ORDERS';
        recReason = `${fmtNumber(oversold)} oversold · ${fmtCurrencyShort(revenueAtRisk)} at risk`;
      } else if (isDeadstock) {
        recommendation = 'LIQUIDATE';
        recReason = `Deadstock · last sold ${fmtDaysAgo(lastSoldDaysAgo)} · ${fmtNumber(r.unitsOnHand)} OH`;
      } else if (CLOSEOUT_CODES.has(r.classification ?? '')) {
        recommendation = 'LIQUIDATE';
        recReason = `Classified ${r.classification} · ${fmtNumber(r.unitsOnHand)} OH · ${fmtCurrencyShort(ohAtLanded)} at cost`;
      } else if (
        r.classification === 'WEB' &&
        (r.unitsATS < WEB_ATS_THRESHOLD ||
          (weeksOfSupply != null && (!Number.isFinite(weeksOfSupply) || weeksOfSupply > 26)))
      ) {
        recommendation = 'PULL_FROM_SITE';
        recReason =
          r.unitsATS < WEB_ATS_THRESHOLD
            ? `WEB · ATS ${fmtNumber(r.unitsATS)} · ${fmtWOS(weeksOfSupply)}`
            : `WEB · ${fmtWOS(weeksOfSupply)} · velocity ${velocityTrend ?? 'flat'}`;
      } else if (
        r.unitsOnHand > SLOW_OH_THRESHOLD &&
        weeksOfSupply != null &&
        (!Number.isFinite(weeksOfSupply) || weeksOfSupply > SLOW_WOS_THRESHOLD)
      ) {
        recommendation = 'LIQUIDATE';
        recReason = `Slow · ${fmtWOS(weeksOfSupply)} · ${fmtCurrencyShort(ohAtLanded)} at cost`;
      } else {
        // Keep — add color on the reason if we can
        if (weeksOfSupply != null && Number.isFinite(weeksOfSupply)) {
          recReason = `${fmtWOS(weeksOfSupply)} · velocity ${velocityTrend ?? '—'}`;
        }
      }

      return { ...r, m, landed, landedIsEstimated, recommendation, recReason };
    });
  }, [ats, invoiceAgg, salesMix, landedByKey]);

  // ── Derived filter option lists ──
  const genders = useMemo(() => {
    const s = new Set<string>();
    enrichedRows.forEach((r) => r.gender && s.add(r.gender));
    return Array.from(s).sort();
  }, [enrichedRows]);
  const categories = useMemo(() => {
    const s = new Set<string>();
    enrichedRows.forEach((r) => r.category && s.add(r.category));
    return Array.from(s).sort();
  }, [enrichedRows]);
  const classifications = useMemo(() => {
    const s = new Set<string>();
    enrichedRows.forEach((r) => r.classification && s.add(r.classification));
    return Array.from(s).sort();
  }, [enrichedRows]);

  const matchesFilters = (r: EnrichedRow): boolean => {
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

  // ── Section filtering ──
  const urgentRows = useMemo(
    () => enrichedRows.filter((r) => r.unitsATS <= 0 && r.unitsOnHand > 0 && matchesFilters(r)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enrichedRows, filterGender, filterCategory, filterClass, search],
  );

  const webRows = useMemo(
    () => enrichedRows.filter((r) => (r.classification ?? '') === 'WEB' && r.unitsATS < WEB_ATS_THRESHOLD && matchesFilters(r)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enrichedRows, filterGender, filterCategory, filterClass, search],
  );

  const closeoutRows = useMemo(
    () => enrichedRows.filter((r) => CLOSEOUT_CODES.has(r.classification ?? '') && matchesFilters(r)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enrichedRows, filterGender, filterCategory, filterClass, search],
  );

  const slowRows = useMemo(
    () =>
      enrichedRows
        .filter(
          (r) =>
            r.unitsOnHand > SLOW_OH_THRESHOLD &&
            r.unitsATS > 0 &&
            r.m.weeksOfSupply != null &&
            (!Number.isFinite(r.m.weeksOfSupply) || r.m.weeksOfSupply > SLOW_WOS_THRESHOLD) &&
            matchesFilters(r),
        )
        .sort((a, b) => {
          const aw = a.m.weeksOfSupply ?? -1;
          const bw = b.m.weeksOfSupply ?? -1;
          // Put ∞ (no sales) first
          if (!Number.isFinite(aw) && Number.isFinite(bw)) return -1;
          if (Number.isFinite(aw) && !Number.isFinite(bw)) return 1;
          return bw - aw;
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enrichedRows, filterGender, filterCategory, filterClass, search],
  );

  const deadstockRows = useMemo(
    () =>
      enrichedRows
        .filter((r) => {
          if (r.unitsOnHand <= DEADSTOCK_OH) return false;
          const cond = (r.m.lastSoldDaysAgo != null && r.m.lastSoldDaysAgo > DEADSTOCK_DAYS) || r.m.unitsLast180d === 0;
          return cond && matchesFilters(r);
        })
        .sort((a, b) => (b.m.lastSoldDaysAgo ?? 9999) - (a.m.lastSoldDaysAgo ?? 9999)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enrichedRows, filterGender, filterCategory, filterClass, search],
  );

  const sectionRows: EnrichedRow[] = useMemo(() => {
    switch (section) {
      case 'urgent': return urgentRows;
      case 'web': return webRows;
      case 'closeout': return closeoutRows;
      case 'slow': return slowRows;
      case 'deadstock': return deadstockRows;
    }
  }, [section, urgentRows, webRows, closeoutRows, slowRows, deadstockRows]);

  // ── Summary cards ──
  const summary = useMemo(() => {
    const oversoldUnits = urgentRows.reduce((s, r) => s + Math.abs(Math.min(0, r.unitsATS)), 0);
    const oversoldRisk = urgentRows.reduce((s, r) => s + r.m.revenueAtRisk, 0);
    const closeoutOHValue = closeoutRows.reduce((s, r) => s + r.m.ohAtLanded, 0);
    const deadstockValue = deadstockRows.reduce((s, r) => s + r.m.ohAtLanded, 0);
    return {
      urgentCount: urgentRows.length,
      oversoldUnits,
      oversoldRisk,
      webCount: webRows.length,
      closeoutCount: closeoutRows.length,
      closeoutOHValue,
      slowCount: slowRows.length,
      deadstockCount: deadstockRows.length,
      deadstockValue,
    };
  }, [urgentRows, webRows, closeoutRows, slowRows, deadstockRows]);

  // ── Upload ──
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
      setDecisions((prev) => [j.decision, ...prev]);
      setDecidingRow(null);
      setDecisionNote('');
    } catch (err) {
      setDecisionError(err instanceof Error ? err.message : String(err));
    } finally {
      setDecisionSaving(false);
    }
  };

  const openDecisionModal = (r: EnrichedRow, fallback?: DecisionAction) => {
    setDecidingRow(r);
    const existing = decisionByKey.get(`${r.styleNumber}|${r.color}`);
    setDecisionAction(existing?.action ?? fallback ?? r.recommendation);
    setDecisionNote(existing?.note ?? '');
    setDecisionError(null);
  };

  // ── Export ──
  const handleExport = () => {
    const rows = sectionRows.filter((r) => selected.size === 0 || selected.has(`${r.styleNumber}|${r.color}`));
    if (rows.length === 0) return;
    const aoa: unknown[][] = [
      [
        'Style', 'Color', 'Color Desc', 'Description', 'Gender', 'Category',
        'Classification', 'Units ATS', 'Units OH', 'At-Once',
        'Wholesale', 'MSRP', 'Landed',
        'Units Last 180d', 'Last Sold (days ago)', 'Weeks of Supply',
        'Velocity Δ (90d)', 'Avg Net $', 'Return %',
        'OH $ at Landed', 'Revenue at Risk',
        'Top Channel', 'Top Customer',
        'Recommendation', 'Reason',
        'Current Decision', 'Decided By', 'Note',
      ],
    ];
    rows.forEach((r) => {
      const d = decisionByKey.get(`${r.styleNumber}|${r.color}`);
      aoa.push([
        r.styleNumber, r.color, r.colorDesc ?? '', r.styleDesc ?? '',
        r.gender ?? '', r.category ?? '', r.classification ?? '',
        r.unitsATS, r.unitsOnHand, r.unitsAtOnce,
        r.wholesale, r.msrp, r.landed,
        r.m.unitsLast180d, r.m.lastSoldDaysAgo ?? '',
        r.m.weeksOfSupply == null ? '' : !Number.isFinite(r.m.weeksOfSupply) ? 'infinite' : Math.round(r.m.weeksOfSupply),
        r.m.velocityDelta == null ? '' : (r.m.velocityDelta * 100).toFixed(0) + '%',
        r.m.avgNetPrice || '',
        r.m.returnRate ? (r.m.returnRate * 100).toFixed(1) + '%' : '',
        r.m.ohAtLanded || '', r.m.revenueAtRisk || '',
        r.m.topChannel ?? '', r.m.topCustomer ?? '',
        ACTION_LABELS[r.recommendation], r.recReason,
        d ? ACTION_LABELS[d.action] : '',
        d?.decidedBy ?? '', d?.note ?? '',
      ]);
    });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, 'Pullback');
    const date = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `KUHL_Pullback_${section}_${date}.xlsx`);
  };

  // ── Selection ──
  const toggleSelect = (key: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });
  const selectAllVisible = () => setSelected(new Set(sectionRows.map((r) => `${r.styleNumber}|${r.color}`)));
  const clearSelection = () => setSelected(new Set());

  // ── Render helpers ──
  const velocityGlyph = (t: 'up' | 'down' | 'flat' | null) => {
    if (t === 'up') return <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />;
    if (t === 'down') return <TrendingDown className="w-3.5 h-3.5 text-red-500" />;
    if (t === 'flat') return <ArrowRight className="w-3.5 h-3.5 text-text-muted" />;
    return <span className="text-text-faint text-xs">—</span>;
  };

  const sections: { key: SectionKey; label: string; count: number; tone: string }[] = [
    { key: 'urgent', label: 'Urgent Cancels', count: summary.urgentCount, tone: 'red' },
    { key: 'web', label: 'Remove from kuhl.com', count: summary.webCount, tone: 'orange' },
    { key: 'closeout', label: 'Closeout Review', count: summary.closeoutCount, tone: 'amber' },
    { key: 'slow', label: 'Slow Movers', count: summary.slowCount, tone: 'purple' },
    { key: 'deadstock', label: 'Deadstock', count: summary.deadstockCount, tone: 'slate' },
  ];

  const noData = ats !== null && ats.length === 0 && !loadError;

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-4xl font-display font-bold text-text-primary">Pullback</h2>
          <p className="text-base text-text-muted mt-2">
            Styles that need to come off kuhl.com or have orders canceled.
            Combines ATS snapshot with sales + invoice history for smarter triage.
          </p>
          {snapshotDate && (
            <p className="text-xs text-text-faint mt-1">
              Last ATS snapshot: {new Date(snapshotDate).toLocaleString()} · sales window: last {SALES_WINDOW_DAYS} days
            </p>
          )}
          {lastSyncedAt && (
            <p className="text-xs text-text-faint">
              Last kuhl.com sync: {new Date(lastSyncedAt).toLocaleString()}
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
            onClick={runSync}
            disabled={syncing}
            title="Pull current live/hidden status from kuhl.com. Read-only."
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-lg disabled:opacity-50 transition-colors"
          >
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
            {syncing ? 'Syncing…' : 'Sync kuhl.com'}
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
      {syncError && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          Sync failed: {syncError}
        </div>
      )}
      {syncReport && !syncReport.configured && (
        <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-sm text-blue-500 flex items-center gap-2">
          <Globe className="w-4 h-4" />
          kuhl.com sync isn't configured yet. Paste a Strapi API token into Vercel env vars
          (<code className="font-mono text-xs">STRAPI_API_BASE</code> +{' '}
          <code className="font-mono text-xs">STRAPI_API_TOKEN</code>) and click Sync again.
        </div>
      )}
      {syncReport && syncReport.configured && (
        <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-sm text-blue-500 flex items-center gap-2">
          <Check className="w-4 h-4" />
          Synced {syncReport.fetched} entries from {syncReport.source} · {syncReport.live} live · {syncReport.hidden} hidden · {syncReport.notFound} not on site · {syncReport.tookMs}ms
          {syncReport.message && syncReport.errors > 0 && (
            <span className="ml-2 text-red-400">· {syncReport.message}</span>
          )}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-surface-secondary rounded-xl p-4 border-l-4 border-red-500">
          <div className="text-xs text-text-muted uppercase tracking-wide">Urgent (oversold)</div>
          <div className="mt-1 font-mono font-bold text-2xl text-text-primary">{summary.urgentCount}</div>
          <div className="text-xs text-text-muted mt-1">
            {fmtNumber(summary.oversoldUnits)} units · ~{fmtCurrencyShort(summary.oversoldRisk)} at risk (avg net)
          </div>
        </div>
        <div className="bg-surface-secondary rounded-xl p-4 border-l-4 border-orange-500">
          <div className="text-xs text-text-muted uppercase tracking-wide">kuhl.com to pull</div>
          <div className="mt-1 font-mono font-bold text-2xl text-text-primary">{summary.webCount}</div>
          <div className="text-xs text-text-muted mt-1">WEB, ATS &lt; {WEB_ATS_THRESHOLD}</div>
        </div>
        <div className="bg-surface-secondary rounded-xl p-4 border-l-4 border-amber-500">
          <div className="text-xs text-text-muted uppercase tracking-wide">Closeout</div>
          <div className="mt-1 font-mono font-bold text-2xl text-text-primary">{summary.closeoutCount}</div>
          <div className="text-xs text-text-muted mt-1">
            ~{fmtCurrencyShort(summary.closeoutOHValue)} OH at landed
          </div>
        </div>
        <div className="bg-surface-secondary rounded-xl p-4 border-l-4 border-purple-500">
          <div className="text-xs text-text-muted uppercase tracking-wide">Slow movers</div>
          <div className="mt-1 font-mono font-bold text-2xl text-text-primary">{summary.slowCount}</div>
          <div className="text-xs text-text-muted mt-1">&gt; 50 OH · WOS &gt; {SLOW_WOS_THRESHOLD} wks</div>
        </div>
        <div className="bg-surface-secondary rounded-xl p-4 border-l-4 border-slate-500">
          <div className="text-xs text-text-muted uppercase tracking-wide flex items-center gap-1">
            <Skull className="w-3 h-3" /> Deadstock
          </div>
          <div className="mt-1 font-mono font-bold text-2xl text-text-primary">{summary.deadstockCount}</div>
          <div className="text-xs text-text-muted mt-1">
            ~{fmtCurrencyShort(summary.deadstockValue)} frozen at landed
          </div>
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
                    : s.tone === 'purple' ? 'bg-purple-600 text-white'
                    : 'bg-slate-600 text-white'
                  : 'bg-surface-tertiary text-text-secondary hover:bg-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              {s.label} <span className="ml-1 opacity-80">({s.count})</span>
            </button>
          );
        })}
      </div>

      {/* Filters */}
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
        <MultiSelect label="Gender" placeholder="All genders" options={genders} values={filterGender} onChange={setFilterGender} widthClass="w-[160px]" />
        <MultiSelect label="Category" placeholder="All categories" options={categories} values={filterCategory} onChange={setFilterCategory} widthClass="w-[180px]" />
        <MultiSelect label="Classification" placeholder="All" options={classifications} values={filterClass} onChange={setFilterClass} widthClass="w-[160px]" />
        {(search || filterGender.length > 0 || filterCategory.length > 0 || filterClass.length > 0) && (
          <button
            onClick={() => { setSearch(''); setFilterGender([]); setFilterCategory([]); setFilterClass([]); }}
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
              <button onClick={clearSelection} className="text-text-muted hover:text-text-primary underline">clear</button>
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
            Upload an ATS export to populate this view.
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
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-surface-tertiary border-b-2 border-border-strong text-xs uppercase tracking-wide text-text-secondary">
                  <th className="px-3 py-2 text-left">
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={selected.size > 0 && selected.size === sectionRows.length}
                      onChange={(e) => { if (e.target.checked) selectAllVisible(); else clearSelection(); }}
                    />
                  </th>
                  <th className="px-3 py-2 text-left">Style</th>
                  <th className="px-3 py-2 text-left">Color</th>
                  <th className="px-3 py-2 text-left">Description</th>
                  <th className="px-3 py-2 text-left">Class</th>
                  <th
                    className="px-3 py-2 text-center"
                    title="Live / hidden status on kuhl.com (from the last sync)"
                  >
                    On site
                  </th>
                  <th className="px-3 py-2 text-right">ATS</th>
                  <th className="px-3 py-2 text-right">OH</th>
                  <th className="px-3 py-2 text-right">WOS</th>
                  <th className="px-3 py-2 text-center">Trend</th>
                  <th className="px-3 py-2 text-right">Last sold</th>
                  <th className="px-3 py-2 text-right">Avg Net</th>
                  <th className="px-3 py-2 text-right">Return %</th>
                  <th
                    className="px-3 py-2 text-right"
                    title="On-hand value at landed cost. * indicates an estimate (50% of wholesale) because no landed cost is on file."
                  >
                    OH $
                  </th>
                  <th className="px-3 py-2 text-right">Risk $</th>
                  <th className="px-3 py-2 text-left">Channel</th>
                  <th className="px-3 py-2 text-left w-[260px]">Recommendation</th>
                </tr>
              </thead>
              <tbody>
                {sectionRows.map((r) => {
                  const key = `${r.styleNumber}|${r.color}`;
                  const decision = decisionByKey.get(key);
                  const isSelected = selected.has(key);
                  const atsNegative = r.unitsATS < 0;
                  return (
                    <tr
                      key={r.id}
                      className={`border-b border-border-primary hover:bg-hover-accent transition-colors ${isSelected ? 'bg-cyan-500/5' : ''}`}
                    >
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(key)} />
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
                      <td className="px-3 py-2 text-xs">
                        <span className="font-mono text-text-muted mr-2">{r.color}</span>
                        <span className="text-text-secondary">{r.colorDesc ?? ''}</span>
                      </td>
                      <td className="px-3 py-2 text-text-secondary truncate max-w-[200px]" title={r.styleDesc ?? ''}>{r.styleDesc ?? ''}</td>
                      <td className="px-3 py-2 text-xs">
                        <span className="inline-block px-1.5 py-0.5 rounded bg-surface-tertiary text-text-muted font-mono">
                          {r.classification ?? '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        {(() => {
                          const s = siteStatusByStyle.get(r.styleNumber);
                          if (!s) {
                            return (
                              <span
                                title="Not synced yet — click Sync kuhl.com"
                                className="inline-flex items-center text-text-faint"
                              >
                                <HelpCircle className="w-4 h-4" />
                              </span>
                            );
                          }
                          if (s.isLive === true) {
                            const href = s.siteUrl ?? null;
                            const badge = (
                              <span
                                title={`Live on kuhl.com${s.currentPrice ? ` · $${s.currentPrice.toFixed(2)}` : ''}`}
                                className="inline-flex items-center gap-1 text-emerald-500"
                              >
                                <Eye className="w-4 h-4" />
                              </span>
                            );
                            return href ? (
                              <a href={href} target="_blank" rel="noreferrer">{badge}</a>
                            ) : (
                              badge
                            );
                          }
                          if (s.isLive === false) {
                            return (
                              <span
                                title="Hidden / unpublished on kuhl.com"
                                className="inline-flex items-center gap-1 text-amber-500"
                              >
                                <EyeOff className="w-4 h-4" />
                              </span>
                            );
                          }
                          return (
                            <span
                              title={s.errorMessage ?? 'Not found in kuhl.com CMS'}
                              className="inline-flex items-center gap-1 text-text-muted"
                            >
                              <HelpCircle className="w-4 h-4" />
                            </span>
                          );
                        })()}
                      </td>
                      <td className={`px-3 py-2 text-right font-mono ${atsNegative ? 'text-red-500 font-bold' : 'text-text-primary'}`}>
                        {fmtNumber(r.unitsATS)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-text-primary">{fmtNumber(r.unitsOnHand)}</td>
                      <td className={`px-3 py-2 text-right font-mono ${
                        r.m.weeksOfSupply == null ? 'text-text-faint'
                          : !Number.isFinite(r.m.weeksOfSupply) ? 'text-red-500 font-semibold'
                          : r.m.weeksOfSupply > 52 ? 'text-amber-500 font-semibold'
                          : r.m.weeksOfSupply > 20 ? 'text-text-primary'
                          : 'text-emerald-500'
                      }`}>
                        {fmtWOS(r.m.weeksOfSupply)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className="inline-flex items-center justify-center gap-1" title={
                          r.m.velocityDelta == null ? 'no prior-window sales'
                            : `${(r.m.velocityDelta * 100).toFixed(0)}% 90d vs prior 90d`
                        }>
                          {velocityGlyph(r.m.velocityTrend)}
                        </span>
                      </td>
                      <td className={`px-3 py-2 text-right text-xs ${
                        r.m.lastSoldDaysAgo == null ? 'text-text-faint'
                          : r.m.lastSoldDaysAgo > 180 ? 'text-red-500 font-semibold'
                          : r.m.lastSoldDaysAgo > 90 ? 'text-amber-500'
                          : 'text-text-primary'
                      }`}>
                        {fmtDaysAgo(r.m.lastSoldDaysAgo)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-text-primary">
                        {r.m.avgNetPrice > 0 ? fmtCurrency(r.m.avgNetPrice) : '—'}
                      </td>
                      <td className={`px-3 py-2 text-right font-mono text-xs ${
                        r.m.returnRate > 0.05 ? 'text-amber-500' : 'text-text-muted'
                      }`}>
                        {r.m.returnRate > 0 ? (r.m.returnRate * 100).toFixed(1) + '%' : '—'}
                      </td>
                      <td
                        className="px-3 py-2 text-right font-mono text-text-primary"
                        title={
                          r.landedIsEstimated
                            ? `Estimated at 50% of wholesale — no landed cost on file for style ${r.styleNumber}`
                            : r.landed > 0
                            ? `${fmtNumber(r.unitsOnHand)} OH × ${fmtCurrency(r.landed)} landed`
                            : undefined
                        }
                      >
                        {r.m.ohAtLanded > 0 ? (
                          <span>
                            {fmtCurrencyShort(r.m.ohAtLanded)}
                            {r.landedIsEstimated && (
                              <span className="text-amber-500 ml-0.5" aria-hidden="true">*</span>
                            )}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className={`px-3 py-2 text-right font-mono ${r.m.revenueAtRisk > 0 ? 'text-red-500 font-semibold' : 'text-text-muted'}`}>
                        {r.m.revenueAtRisk > 0 ? fmtCurrencyShort(r.m.revenueAtRisk) : '—'}
                      </td>
                      <td className="px-3 py-2 text-xs text-text-muted">
                        {r.m.topChannel ? <span>{r.m.topChannel}</span> : <span className="text-text-faint">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          {decision ? (
                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${ACTION_COLORS[decision.action]}`}>
                              {ACTION_LABELS[decision.action]}
                            </span>
                          ) : (
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${ACTION_COLORS[r.recommendation]}`}
                              title={r.recReason}
                            >
                              <Sparkles className="w-3 h-3" />
                              {ACTION_LABELS[r.recommendation]}
                            </span>
                          )}
                          <span className="text-[11px] text-text-muted flex-1 truncate" title={r.recReason}>
                            {decision?.note || r.recReason}
                          </span>
                          <button
                            onClick={() => openDecisionModal(r)}
                            className="text-text-muted hover:text-cyan-400"
                            title={decision ? `Change action (was ${ACTION_LABELS[decision.action]} by ${decision.decidedBy})` : 'Confirm this recommendation'}
                          >
                            <Tag className="w-3.5 h-3.5" />
                          </button>
                        </div>
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
          <div className="absolute inset-0 bg-black/60" onClick={() => !decisionSaving && setDecidingRow(null)} />
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
              {/* Context line */}
              <div className="p-3 bg-surface-secondary rounded-lg text-xs text-text-secondary">
                <div className="flex items-center gap-1 text-text-primary font-semibold mb-1">
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                  Suggested: <span className="ml-1">{ACTION_LABELS[decidingRow.recommendation]}</span>
                </div>
                <div className="text-text-muted">{decidingRow.recReason}</div>
              </div>
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
                {decisionSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {decisionSaving ? 'Saving…' : 'Save decision'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
