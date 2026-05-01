'use client';

import React, { useMemo } from 'react';
import type { InvoiceRecord, SalesRecord, Product } from '@/types/product';

// ── Design system colors ──────────────────────────────────────────
const C = {
  card: '#131316',
  border: '#2a2a32',
  surface: '#1a1a1f',
  text: '#f5f5f7',
  muted: '#8e8e93',
  dim: '#636366',
  blue: '#0a84ff',
  green: '#30d158',
  purple: '#bf5af2',
  orange: '#ff9f0a',
  red: '#ff453a',
  yellow: '#ffd60a',
};

const mono = "'JetBrains Mono', monospace";
const sans = "'DM Sans', -apple-system, sans-serif";

const cardStyle: React.CSSProperties = {
  background: C.card,
  border: `1px solid ${C.border}`,
  borderRadius: 12,
};

// ── Formatters ────────────────────────────────────────────────────
const fmtMoney = (v: number): string => {
  if (!Number.isFinite(v) || v === 0) return '$0';
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${Math.round(abs)}`;
};

const fmtPct = (v: number): string =>
  Number.isFinite(v) ? `${v >= 0 ? '+' : ''}${v.toFixed(1)}%` : '—';

// ── Date bucket: invoiceDate → year/month, with accountingPeriod fallback ──
type DatedRecord = {
  invoiceDate?: string | null;
  accountingPeriod?: string | null;
};

function resolveYM(d: DatedRecord): { year: number; month: number } | null {
  if (d.invoiceDate) {
    const dt = new Date(d.invoiceDate);
    if (!isNaN(dt.getTime())) return { year: dt.getFullYear(), month: dt.getMonth() + 1 };
  }
  if (d.accountingPeriod) {
    const ap = d.accountingPeriod.trim();
    let m: RegExpMatchArray | null;
    m = ap.match(/^(\d{4})(\d{2})$/);
    if (m) return { year: parseInt(m[1], 10), month: parseInt(m[2], 10) };
    m = ap.match(/^(\d{1,2})[\/\-](\d{4})$/);
    if (m) return { year: parseInt(m[2], 10), month: parseInt(m[1], 10) };
    m = ap.match(/^(\d{4})[\/\-](\d{1,2})$/);
    if (m) return { year: parseInt(m[1], 10), month: parseInt(m[2], 10) };
  }
  return null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ── Component ──────────────────────────────────────────────────────
interface ExecutiveDashboardViewProps {
  invoices?: InvoiceRecord[];
  sales?: SalesRecord[];
  products?: Product[];
}

export default function ExecutiveDashboardView({
  invoices = [],
  sales = [],
  products = [],
}: ExecutiveDashboardViewProps) {
  // Style → category lookup (invoices don't carry it directly)
  const styleToCategory = useMemo(() => {
    const m = new Map<string, string>();
    products.forEach((p) => {
      if (p.styleNumber && p.categoryDesc && !m.has(p.styleNumber)) {
        m.set(p.styleNumber, p.categoryDesc);
      }
    });
    return m;
  }, [products]);

  const allRecords = useMemo(() => [...invoices, ...sales], [invoices, sales]);

  // ── Year totals ──
  const yearTotals = useMemo(() => {
    const sums = new Map<number, { invoiced: number; shipped: number; returned: number; rows: number; orders: Set<string>; customers: Set<string> }>();
    allRecords.forEach((r) => {
      const ym = resolveYM(r as DatedRecord);
      if (!ym) return;
      const yr = ym.year;
      const shipped = (r as { shippedAtNet?: number }).shippedAtNet ?? 0;
      const returned = (r as { returnedAtNet?: number }).returnedAtNet ?? 0;
      const cur = sums.get(yr) ?? { invoiced: 0, shipped: 0, returned: 0, rows: 0, orders: new Set<string>(), customers: new Set<string>() };
      cur.invoiced += shipped - returned;
      cur.shipped += shipped;
      cur.returned += returned;
      cur.rows += 1;
      const invNum = (r as { invoiceNumber?: string | null }).invoiceNumber;
      if (invNum) cur.orders.add(invNum);
      const cust = (r as { customer?: string | null }).customer;
      if (cust) cur.customers.add(cust);
      sums.set(yr, cur);
    });
    return Array.from(sums.entries())
      .map(([yr, v]) => ({
        year: yr,
        invoiced: v.invoiced,
        shipped: v.shipped,
        returned: v.returned,
        rows: v.rows,
        orders: v.orders.size,
        customers: v.customers.size,
      }))
      .filter((r) => r.year >= 2020 && r.year <= 2030 && r.invoiced !== 0)
      .sort((a, b) => a.year - b.year);
  }, [allRecords]);

  // ── Monthly trend: most-recent year + prior year, by month ──
  const monthlyTrend = useMemo(() => {
    if (yearTotals.length === 0) return null;
    const currentYear = yearTotals[yearTotals.length - 1].year;
    const priorYear = currentYear - 1;
    const cur = new Array(12).fill(0);
    const pri = new Array(12).fill(0);
    allRecords.forEach((r) => {
      const ym = resolveYM(r as DatedRecord);
      if (!ym) return;
      const net = ((r as { shippedAtNet?: number }).shippedAtNet ?? 0) - ((r as { returnedAtNet?: number }).returnedAtNet ?? 0);
      if (ym.year === currentYear) cur[ym.month - 1] += net;
      else if (ym.year === priorYear) pri[ym.month - 1] += net;
    });
    return { currentYear, priorYear, cur, pri };
  }, [allRecords, yearTotals]);

  // ── Current YTD / Prior YTD comparison (uses last month with current-year data) ──
  const ytdKpis = useMemo(() => {
    if (!monthlyTrend) return null;
    let lastMonth = -1;
    monthlyTrend.cur.forEach((v: number, i: number) => { if (v !== 0) lastMonth = i; });
    if (lastMonth < 0) return null;
    const ytdCur = monthlyTrend.cur.slice(0, lastMonth + 1).reduce((s: number, v: number) => s + v, 0);
    const ytdPri = monthlyTrend.pri.slice(0, lastMonth + 1).reduce((s: number, v: number) => s + v, 0);
    const yoyDelta = ytdCur - ytdPri;
    const yoyPct = ytdPri !== 0 ? ((ytdCur - ytdPri) / ytdPri) * 100 : null;
    const yrTotal = yearTotals.find((y) => y.year === monthlyTrend.currentYear);
    const returnsRate = yrTotal && yrTotal.shipped > 0 ? (yrTotal.returned / yrTotal.shipped) * 100 : 0;
    return {
      asOfMonth: MONTHS[lastMonth],
      ytdCur,
      ytdPri,
      yoyDelta,
      yoyPct,
      returnsRate,
      activeCustomers: yrTotal?.customers ?? 0,
    };
  }, [monthlyTrend, yearTotals]);

  // ── Top 10 customers (current year, by net invoiced) ──
  const topCustomers = useMemo(() => {
    if (!monthlyTrend) return [];
    const map = new Map<string, number>();
    allRecords.forEach((r) => {
      const ym = resolveYM(r as DatedRecord);
      if (!ym || ym.year !== monthlyTrend.currentYear) return;
      const cust = (r as { customer?: string | null }).customer;
      if (!cust) return;
      const net = ((r as { shippedAtNet?: number }).shippedAtNet ?? 0) - ((r as { returnedAtNet?: number }).returnedAtNet ?? 0);
      map.set(cust, (map.get(cust) ?? 0) + net);
    });
    return Array.from(map.entries())
      .map(([customer, invoiced]) => ({ customer, invoiced }))
      .filter((c) => c.invoiced > 0)
      .sort((a, b) => b.invoiced - a.invoiced)
      .slice(0, 10);
  }, [allRecords, monthlyTrend]);

  // ── Top 10 categories (current year) ──
  const topCategories = useMemo(() => {
    if (!monthlyTrend) return [];
    const map = new Map<string, number>();
    allRecords.forEach((r) => {
      const ym = resolveYM(r as DatedRecord);
      if (!ym || ym.year !== monthlyTrend.currentYear) return;
      const styleNumber = (r as { styleNumber?: string }).styleNumber ?? '';
      const cat = styleToCategory.get(styleNumber) ?? '(uncategorized)';
      const net = ((r as { shippedAtNet?: number }).shippedAtNet ?? 0) - ((r as { returnedAtNet?: number }).returnedAtNet ?? 0);
      map.set(cat, (map.get(cat) ?? 0) + net);
    });
    return Array.from(map.entries())
      .map(([category, invoiced]) => ({ category, invoiced }))
      .filter((c) => c.invoiced > 0)
      .sort((a, b) => b.invoiced - a.invoiced)
      .slice(0, 10);
  }, [allRecords, monthlyTrend, styleToCategory]);

  // ── Channel mix (current year) ──
  const channelMix = useMemo(() => {
    if (!monthlyTrend) return [];
    const map = new Map<string, number>();
    allRecords.forEach((r) => {
      const ym = resolveYM(r as DatedRecord);
      if (!ym || ym.year !== monthlyTrend.currentYear) return;
      const ct = (r as { customerType?: string | null }).customerType ?? '';
      const channel = ct ? ct.split(',')[0].trim().toUpperCase() : 'UNKNOWN';
      const net = ((r as { shippedAtNet?: number }).shippedAtNet ?? 0) - ((r as { returnedAtNet?: number }).returnedAtNet ?? 0);
      map.set(channel, (map.get(channel) ?? 0) + net);
    });
    const total = Array.from(map.values()).reduce((s, v) => s + v, 0);
    return Array.from(map.entries())
      .map(([channel, invoiced]) => ({
        channel,
        invoiced,
        share: total > 0 ? (invoiced / total) * 100 : 0,
      }))
      .filter((c) => c.invoiced > 0)
      .sort((a, b) => b.invoiced - a.invoiced);
  }, [allRecords, monthlyTrend]);

  // ── Empty state when invoices haven't loaded yet ──
  if (yearTotals.length === 0) {
    return (
      <div style={{ padding: '20px 24px', fontFamily: sans, color: C.text }}>
        <div style={{ ...cardStyle, padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Loading executive metrics…</div>
          <div style={{ fontSize: 13, color: C.muted }}>
            Streaming {invoices.length === 0 ? 'invoice records' : `${invoices.length.toLocaleString()} invoice records`} from the database. This panel populates once the data is in memory.
          </div>
        </div>
      </div>
    );
  }

  const maxYear = Math.max(...yearTotals.map((y) => y.invoiced));
  const maxMonth = monthlyTrend ? Math.max(...monthlyTrend.cur, ...monthlyTrend.pri, 1) : 1;
  const maxCustomer = topCustomers.length > 0 ? topCustomers[0].invoiced : 1;
  const maxCategory = topCategories.length > 0 ? topCategories[0].invoiced : 1;

  return (
    <div style={{ padding: '20px 24px', fontFamily: sans, color: C.text }}>
      {/* ─── 1. Year cards ─────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${yearTotals.length}, 1fr)`, gap: 12, marginBottom: 12 }}>
        {yearTotals.map((y, i) => {
          const prev = yearTotals[i - 1];
          const yoy = prev && prev.invoiced > 0 ? ((y.invoiced - prev.invoiced) / prev.invoiced) * 100 : null;
          const isCurrent = i === yearTotals.length - 1;
          return (
            <div
              key={y.year}
              style={{
                ...cardStyle,
                padding: '16px 18px',
                borderColor: isCurrent ? C.blue : C.border,
                background: isCurrent ? 'rgba(10,132,255,0.06)' : C.card,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: isCurrent ? C.blue : C.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {y.year} {isCurrent && '· Current'}
                </span>
                {yoy !== null && (
                  <span style={{ fontSize: 11, fontWeight: 600, color: yoy >= 0 ? C.green : C.red }}>
                    {yoy >= 0 ? '↑' : '↓'} {Math.abs(yoy).toFixed(1)}% YoY
                  </span>
                )}
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, fontFamily: mono, lineHeight: 1.1 }}>
                {fmtMoney(y.invoiced)}
              </div>
              <div style={{ fontSize: 11, color: C.dim, marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
                <span>{y.orders.toLocaleString()} invoices</span>
                <span>{y.customers.toLocaleString()} customers</span>
              </div>
              <div style={{ height: 4, background: C.surface, borderRadius: 2, marginTop: 10, overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${Math.max(2, (y.invoiced / maxYear) * 100)}%`,
                    background: isCurrent ? 'linear-gradient(90deg,#0a84ff,#5ac8fa)' : C.blue,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* ─── 2. Current-year KPIs ──────────────────────────────────── */}
      {ytdKpis && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 12 }}>
          <div style={{ ...cardStyle, padding: '14px 18px' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
              YTD Net Invoiced (thru {ytdKpis.asOfMonth})
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: mono }}>{fmtMoney(ytdKpis.ytdCur)}</div>
            <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>vs {fmtMoney(ytdKpis.ytdPri)} prior YTD</div>
          </div>
          <div style={{ ...cardStyle, padding: '14px 18px' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
              YoY Change
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: mono, color: ytdKpis.yoyDelta >= 0 ? C.green : C.red }}>
              {fmtMoney(ytdKpis.yoyDelta)}
            </div>
            <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>
              {ytdKpis.yoyPct !== null ? fmtPct(ytdKpis.yoyPct) : '—'} change
            </div>
          </div>
          <div style={{ ...cardStyle, padding: '14px 18px' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
              Returns Rate
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: mono, color: ytdKpis.returnsRate > 5 ? C.orange : C.text }}>
              {ytdKpis.returnsRate.toFixed(2)}%
            </div>
            <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>of shipped $</div>
          </div>
          <div style={{ ...cardStyle, padding: '14px 18px' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
              Active Customers
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: mono }}>{ytdKpis.activeCustomers.toLocaleString()}</div>
            <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>distinct customers, current year</div>
          </div>
        </div>
      )}

      {/* ─── 3. Monthly trend ──────────────────────────────────────── */}
      {monthlyTrend && (
        <div style={{ ...cardStyle, padding: '16px 20px', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Monthly Net Invoiced — {monthlyTrend.currentYear} vs {monthlyTrend.priorYear}</span>
            <div style={{ display: 'flex', gap: 14, fontSize: 11, color: C.dim }}>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, background: C.blue, borderRadius: 2, marginRight: 6, verticalAlign: 'middle' }} />{monthlyTrend.currentYear}</span>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, background: C.dim, borderRadius: 2, marginRight: 6, verticalAlign: 'middle' }} />{monthlyTrend.priorYear}</span>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 6 }}>
            {MONTHS.map((m, i) => (
              <div key={m} style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'stretch' }}>
                <div style={{ height: 80, display: 'flex', alignItems: 'flex-end', gap: 2 }}>
                  <div style={{ flex: 1, height: `${Math.max(2, (monthlyTrend.cur[i] / maxMonth) * 100)}%`, background: C.blue, borderRadius: 2, opacity: monthlyTrend.cur[i] > 0 ? 1 : 0.15 }} />
                  <div style={{ flex: 1, height: `${Math.max(2, (monthlyTrend.pri[i] / maxMonth) * 100)}%`, background: C.dim, borderRadius: 2, opacity: monthlyTrend.pri[i] > 0 ? 1 : 0.15 }} />
                </div>
                <div style={{ fontSize: 9, color: C.dim, textAlign: 'center' }}>{m}</div>
                <div style={{ fontSize: 10, fontFamily: mono, textAlign: 'center', color: monthlyTrend.cur[i] > 0 ? C.text : C.dim }}>
                  {monthlyTrend.cur[i] > 0 ? fmtMoney(monthlyTrend.cur[i]) : '—'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── 4. Top customers + Top categories ────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div style={{ ...cardStyle, padding: '16px 20px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
            Top 10 Customers — {monthlyTrend?.currentYear} YTD
          </div>
          {topCustomers.length === 0 ? (
            <div style={{ fontSize: 12, color: C.dim }}>No customer data yet for this year.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {topCustomers.map((c, i) => (
                <div key={c.customer} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 11, color: C.dim, width: 18, textAlign: 'right' }}>{i + 1}</span>
                  <span style={{ fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.customer}</span>
                  <div style={{ width: 80, height: 6, background: C.surface, borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(c.invoiced / maxCustomer) * 100}%`, background: C.blue }} />
                  </div>
                  <span style={{ fontSize: 12, fontFamily: mono, width: 70, textAlign: 'right' }}>{fmtMoney(c.invoiced)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ ...cardStyle, padding: '16px 20px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
            Top 10 Categories — {monthlyTrend?.currentYear} YTD
          </div>
          {topCategories.length === 0 ? (
            <div style={{ fontSize: 12, color: C.dim }}>No category data yet for this year.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {topCategories.map((c, i) => (
                <div key={c.category} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 11, color: C.dim, width: 18, textAlign: 'right' }}>{i + 1}</span>
                  <span style={{ fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.category}</span>
                  <div style={{ width: 80, height: 6, background: C.surface, borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(c.invoiced / maxCategory) * 100}%`, background: C.purple }} />
                  </div>
                  <span style={{ fontSize: 12, fontFamily: mono, width: 70, textAlign: 'right' }}>{fmtMoney(c.invoiced)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ─── 5. Channel mix ───────────────────────────────────────── */}
      {channelMix.length > 0 && (
        <div style={{ ...cardStyle, padding: '16px 20px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
            Channel Mix — {monthlyTrend?.currentYear} YTD
          </div>
          {/* Stacked bar */}
          <div style={{ display: 'flex', height: 36, borderRadius: 6, overflow: 'hidden', marginBottom: 12 }}>
            {channelMix.map((c, i) => {
              const colors = [C.blue, C.green, C.purple, C.orange, C.yellow, C.red];
              const color = colors[i % colors.length];
              return (
                <div
                  key={c.channel}
                  style={{
                    width: `${c.share}%`,
                    background: color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#000',
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                  title={`${c.channel}: ${fmtMoney(c.invoiced)} (${c.share.toFixed(1)}%)`}
                >
                  {c.share >= 8 ? `${c.channel} ${c.share.toFixed(0)}%` : ''}
                </div>
              );
            })}
          </div>
          {/* Channel rows */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            {channelMix.map((c, i) => {
              const colors = [C.blue, C.green, C.purple, C.orange, C.yellow, C.red];
              return (
                <div key={c.channel} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                  <span style={{ width: 10, height: 10, background: colors[i % colors.length], borderRadius: 2 }} />
                  <span style={{ flex: 1 }}>{c.channel}</span>
                  <span style={{ fontFamily: mono, color: C.muted }}>{c.share.toFixed(1)}%</span>
                  <span style={{ fontFamily: mono, fontWeight: 600 }}>{fmtMoney(c.invoiced)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
