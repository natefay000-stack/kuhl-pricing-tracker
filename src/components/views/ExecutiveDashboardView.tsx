'use client';

import React, { useState } from 'react';

// ── Design system colors (from wireframe) ───────────────────────────────────
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

// ── Shared style helpers ────────────────────────────────────────────────────
const cardStyle: React.CSSProperties = {
  background: C.card,
  border: `1px solid ${C.border}`,
  borderRadius: 12,
};

const panelHeaderStyle: React.CSSProperties = {
  padding: '16px 20px',
  borderBottom: `1px solid ${C.border}`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

const panelBodyStyle: React.CSSProperties = { padding: 20 };

// ── Mock data ───────────────────────────────────────────────────────────────
type ViewMode = 'season' | 'monthly' | 'yearly';

const months = [
  { name: 'MAR', revenue: '$58.2M', trend: '+8%', up: true, pct: 72 },
  { name: 'APR', revenue: '$62.4M', trend: '+12%', up: true, pct: 78 },
  { name: 'MAY', revenue: '$71.8M', trend: '+15%', up: true, pct: 85 },
  { name: 'JUN', revenue: '$68.3M', trend: '+9%', up: true, pct: 82 },
  { name: 'JUL', revenue: '$54.1M', trend: '-3%', up: false, pct: 65 },
  { name: 'AUG', revenue: '$59.7M', trend: '+6%', up: true, pct: 70 },
  { name: 'SEP', revenue: '$72.9M', trend: '+18%', up: true, pct: 88 },
  { name: 'OCT', revenue: '$81.4M', trend: '+22%', up: true, pct: 95 },
  { name: 'NOV', revenue: '$78.2M', trend: '+14%', up: true, pct: 92 },
  { name: 'DEC', revenue: '$65.8M', trend: '+10%', up: true, pct: 78 },
  { name: 'JAN', revenue: '$42.3M', trend: '+5%', up: true, pct: 52 },
  { name: 'FEB', revenue: '$38.6M', trend: '+11%', up: true, pct: 45, current: true },
];

const years = [
  { label: 'FY 2022', revenue: '$542M', growth: '+18%', up: true, units: '9.8M', margin: '62.1%' },
  { label: 'FY 2023', revenue: '$598M', growth: '+10%', up: true, units: '10.9M', margin: '61.8%' },
  { label: 'FY 2024', revenue: '$645M', growth: '+8%', up: true, units: '12.1M', margin: '61.2%' },
  { label: 'FY 2025', revenue: '$672M', growth: '+4%', up: true, units: '13.2M', margin: '61.5%' },
  { label: 'FY 2026', revenue: '$754M', growth: '+12%', up: true, units: '14.3M', margin: '60.3%', current: true },
];

const alerts = [
  { text: '12 styles below 40% margin', color: C.red },
  { text: 'Shorts category down 18% YoY', color: C.orange },
  { text: '3 customers with overdue payments', color: C.yellow },
];

const kpis = [
  {
    icon: '💵', iconBg: `rgba(48,209,88,0.15)`, badge: 'On Track', badgeBg: `rgba(48,209,88,0.15)`, badgeColor: C.green,
    value: '$753.7M', label: 'Total Revenue',
    comps: [
      { value: '↑ 12%', label: 'vs PY', color: C.green },
      { value: '102%', label: 'to Budget', color: C.green },
      { value: '98%', label: 'to Forecast', color: C.muted },
    ],
    bars: [45, 52, 58, 55, 72, 85],
  },
  {
    icon: '📦', iconBg: `rgba(10,132,255,0.15)`, badge: 'On Track', badgeBg: `rgba(48,209,88,0.15)`, badgeColor: C.green,
    value: '14.3M', label: 'Units Sold',
    comps: [
      { value: '↑ 8%', label: 'vs PY', color: C.green },
      { value: '105%', label: 'to Budget', color: C.green },
      { value: '101%', label: 'to Forecast', color: C.green },
    ],
    bars: [50, 55, 52, 60, 75, 82],
  },
  {
    icon: '📊', iconBg: `rgba(191,90,242,0.15)`, badge: 'At Risk', badgeBg: `rgba(255,159,10,0.15)`, badgeColor: C.orange,
    value: '60.3%', label: 'Gross Margin',
    comps: [
      { value: '↓ 1.2pts', label: 'vs PY', color: C.red },
      { value: '98%', label: 'to Target', color: C.red },
      { value: '61.5%', label: 'Target', color: C.muted },
    ],
    bars: [85, 82, 78, 75, 72, 68],
  },
  {
    icon: '📋', iconBg: `rgba(255,159,10,0.15)`, badge: 'Strong', badgeBg: `rgba(48,209,88,0.15)`, badgeColor: C.green,
    value: '$42.1M', label: 'Open Orders',
    comps: [
      { value: '↑ 18%', label: 'vs PY', color: C.green },
      { value: '112%', label: 'to PY Book', color: C.green },
      { value: '26FA', label: 'Pre-Book', color: C.muted },
    ],
    bars: [40, 48, 55, 65, 78, 95],
  },
];

const revenueTrend = [
  { label: '24SP', actual: 98, budget: 105, pctA: 65, pctB: 70 },
  { label: '24FA', actual: 112, budget: 108, pctA: 75, pctB: 72 },
  { label: '25SP', actual: 108, budget: 112, pctA: 72, pctB: 75 },
  { label: '25FA', actual: 128, budget: 120, pctA: 85, pctB: 80, current: false },
  { label: '26SP', actual: 135, budget: 132, pctA: 90, pctB: 88, current: true },
  { label: '26FA', actual: 142, budget: 138, pctA: 95, pctB: 92, forecast: true },
];

const channels = [
  { name: 'Internet', value: '$316.5M', yoy: '+18%', up: true, share: '42%', pct: 42, gradient: 'linear-gradient(90deg,#0a84ff,#5ac8fa)' },
  { name: 'Retail', value: '$211.0M', yoy: '+12%', up: true, share: '28%', pct: 28, gradient: 'linear-gradient(90deg,#30d158,#34c759)' },
  { name: 'Wholesale', value: '$165.8M', yoy: '+5%', up: true, share: '22%', pct: 22, gradient: 'linear-gradient(90deg,#bf5af2,#af52de)' },
  { name: 'Big Box', value: '$60.4M', yoy: '-3%', up: false, share: '8%', pct: 8, gradient: 'linear-gradient(90deg,#ff9f0a,#ffcc00)' },
];

const categories = [
  { name: 'Pants', revenue: '$288.8M', share: 38, color: C.blue, trend: '+15%', up: true, margin: '62.1%' },
  { name: 'Jacket', revenue: '$122.3M', share: 16, color: C.purple, trend: '+8%', up: true, margin: '58.4%' },
  { name: 'Shorts', revenue: '$65.2M', share: 9, color: C.green, trend: '-18%', up: false, margin: '59.2%' },
  { name: 'Short Sleeve', revenue: '$62.3M', share: 8, color: C.orange, trend: '+3%', up: true, margin: '61.8%' },
  { name: 'Fleece', revenue: '$47.7M', share: 6, color: C.red, trend: '+22%', up: true, margin: '55.1%' },
];

const marginChannels = [
  { name: 'Internet', value: '65.2%', pct: 65, color: C.green, trend: '↑ 0.8', trendColor: C.green },
  { name: 'Retail', value: '62.1%', pct: 62, color: C.green, trend: '↓ 0.5', trendColor: C.red },
  { name: 'Wholesale', value: '55.4%', pct: 55, color: C.orange, trend: '↓ 2.1', trendColor: C.red },
  { name: 'Big Box', value: '48.2%', pct: 48, color: C.red, trend: '↓ 3.4', trendColor: C.red },
];

const gainers = [
  { name: 'Spekter Jacket', category: 'Jacket', change: '+142%', amount: '+$2.8M' },
  { name: 'Deceptr Hoody', category: 'Fleece', change: '+89%', amount: '+$1.9M' },
  { name: 'Silencr Pant', category: 'Pants', change: '+67%', amount: '+$1.4M' },
];

const decliners = [
  { name: 'Ramblr Short', category: 'Shorts', change: '-38%', amount: '-$1.2M' },
  { name: 'Konfidant Air', category: 'Short Sleeve', change: '-29%', amount: '-$0.8M' },
  { name: 'Renegade Short', category: 'Shorts', change: '-24%', amount: '-$0.6M' },
];

// ── Component ───────────────────────────────────────────────────────────────
export default function ExecutiveDashboardView() {
  const [activeView, setActiveView] = useState<ViewMode>('season');

  return (
    <div style={{ padding: '20px 24px', fontFamily: sans, color: C.text }}>

      {/* ─── 1. Time Period Toggle Bar ─────────────────────────────────── */}
      <div style={{ ...cardStyle, padding: '12px 20px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: C.dim, textTransform: 'uppercase', letterSpacing: 0.5 }}>View</span>
            <div style={{ display: 'flex', background: C.surface, borderRadius: 6, padding: 3 }}>
              {(['season', 'monthly', 'yearly'] as ViewMode[]).map(v => (
                <button key={v} onClick={() => setActiveView(v)} style={{
                  padding: '6px 14px', borderRadius: 5, border: 'none',
                  background: activeView === v ? C.blue : 'transparent',
                  color: activeView === v ? '#fff' : C.muted,
                  fontSize: 11, fontWeight: 500, fontFamily: sans, cursor: 'pointer',
                }}>
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingLeft: 16, borderLeft: `1px solid ${C.border}` }}>
            {[
              { value: 'February 2026', label: 'Current Month' },
              { value: '22 days left', label: 'In Month' },
              { value: '311 days left', label: 'In FY 2026' },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <span style={{ fontSize: 12, fontWeight: 600, fontFamily: mono }}>{item.value}</span>
                <span style={{ fontSize: 9, color: C.dim }}>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
        <span style={{ padding: '5px 10px', background: 'rgba(191,90,242,0.15)', border: '1px solid rgba(191,90,242,0.3)', borderRadius: 6, fontSize: 10, color: C.purple, fontWeight: 500 }}>
          FY 2026 (Mar-Feb)
        </span>
      </div>

      {/* ─── 2. YTD Progress Bar ───────────────────────────────────────── */}
      <div style={{ ...cardStyle, padding: '16px 20px', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Year-to-Date Revenue Progress</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: 20, fontWeight: 700, fontFamily: mono }}>$753.7M</span>
              <span style={{ fontSize: 12, color: C.dim }}>of $820M target</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, color: C.green }}>
              <span style={{ fontSize: 16, fontWeight: 600 }}>91.9%</span>
              <span style={{ fontSize: 12, color: C.dim }}>to target</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, color: C.blue }}>
              <span style={{ fontSize: 16, fontWeight: 600 }}>+12%</span>
              <span style={{ fontSize: 12, color: C.dim }}>vs PY YTD</span>
            </div>
          </div>
        </div>
        <div style={{ position: 'relative', height: 28, background: C.surface, borderRadius: 6, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: '85%', background: 'linear-gradient(90deg,#0a84ff,#5ac8fa)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#fff' }}>$753.7M</span>
          </div>
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: '92%', width: 2, background: C.orange, zIndex: 2 }}>
            <span style={{ position: 'absolute', top: -16, left: '50%', transform: 'translateX(-50%)', fontSize: 8, color: C.orange, whiteSpace: 'nowrap' }}>Target</span>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
          {['Q1: $185M', 'Q2: $395M', 'Q3: $620M', 'Q4: $820M'].map(m => (
            <div key={m} style={{ textAlign: 'center' }}>
              <div style={{ width: 1, height: 6, background: '#3a3a42', margin: '0 auto 2px' }} />
              <span style={{ fontSize: 9, color: C.dim }}>{m}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ─── 3. Monthly Grid (visible in Monthly view) ─────────────────── */}
      {activeView === 'monthly' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 6, marginBottom: 16 }}>
          {months.map(m => (
            <div key={m.name} style={{
              ...cardStyle, padding: '10px 8px', textAlign: 'center', cursor: 'pointer',
              borderColor: m.current ? C.blue : C.border,
              background: m.current ? 'rgba(10,132,255,0.1)' : C.card,
            }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: m.current ? C.blue : C.muted, marginBottom: 4 }}>{m.name}</div>
              <div style={{ fontSize: 12, fontWeight: 700, fontFamily: mono, marginBottom: 2 }}>{m.revenue}</div>
              <div style={{ fontSize: 9, fontWeight: 600, color: m.up ? C.green : C.red }}>{m.up ? '↑' : '↓'} {m.trend}</div>
              <div style={{ height: 3, background: C.surface, borderRadius: 2, marginTop: 6, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${m.pct}%`, borderRadius: 2, background: m.current ? 'linear-gradient(90deg,#0a84ff,#5ac8fa)' : C.blue }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── 4. Yearly Comparison (visible in Yearly view) ─────────────── */}
      {activeView === 'yearly' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 16 }}>
          {years.map(y => (
            <div key={y.label} style={{
              ...cardStyle, borderRadius: 10, padding: '14px 12px', textAlign: 'center',
              borderColor: y.current ? C.blue : C.border,
              background: y.current ? 'rgba(10,132,255,0.08)' : C.card,
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: y.current ? C.blue : C.muted, marginBottom: 6 }}>{y.label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, fontFamily: mono, marginBottom: 2 }}>{y.revenue}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: y.up ? C.green : C.red, marginBottom: 10 }}>↑ {y.growth}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                {[{ l: 'Units', v: y.units }, { l: 'Margin', v: y.margin }].map(m => (
                  <div key={m.l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                    <span style={{ color: C.dim }}>{m.l}</span>
                    <span style={{ fontFamily: mono, fontWeight: 500 }}>{m.v}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── 5. Season Filter Bar (visible in Season view) ─────────────── */}
      {activeView === 'season' && (
        <div style={{ ...cardStyle, padding: '14px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: C.dim, textTransform: 'uppercase', letterSpacing: 0.5 }}>Season</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ padding: '8px 16px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 600, fontFamily: sans, cursor: 'pointer', background: 'rgba(48,209,88,0.15)', color: C.green }}>All Spring</button>
            <button style={{ padding: '8px 16px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 600, fontFamily: sans, cursor: 'pointer', background: C.orange, color: '#000' }}>All Fall</button>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[
              { code: '25FA', status: 'Closed', bg: C.surface, color: C.text, borderColor: C.border },
              { code: '26SP', status: 'Selling', bg: C.green, color: '#000', borderColor: C.green },
              { code: '26FA', status: 'Pre-Book', bg: C.orange, color: '#000', borderColor: C.orange },
            ].map(s => (
              <div key={s.code} style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${s.borderColor}`, background: s.bg, fontFamily: mono, fontSize: 12, fontWeight: 500, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, color: s.color }}>
                <span>{s.code}</span>
                <span style={{ fontSize: 8, textTransform: 'uppercase', opacity: 0.7 }}>{s.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── 6. Alerts Banner ──────────────────────────────────────────── */}
      <div style={{ background: 'linear-gradient(135deg, rgba(255,69,58,0.1) 0%, rgba(255,159,10,0.1) 100%)', border: '1px solid rgba(255,69,58,0.3)', borderRadius: 12, padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 40, height: 40, background: 'rgba(255,69,58,0.2)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🚨</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.red, marginBottom: 4 }}>3 Items Need Your Attention</div>
          <div style={{ display: 'flex', gap: 24 }}>
            {alerts.map((a, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: a.color, display: 'inline-block' }} />
                {a.text}
              </div>
            ))}
          </div>
        </div>
        <button style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,69,58,0.3)', background: 'transparent', color: C.red, fontSize: 12, fontFamily: sans, cursor: 'pointer' }}>View All →</button>
      </div>

      {/* ─── 7. KPI Cards ──────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
        {kpis.map((kpi, i) => (
          <div key={i} style={{ ...cardStyle, padding: 20, position: 'relative', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, background: kpi.iconBg }}>{kpi.icon}</div>
              <span style={{ padding: '4px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', background: kpi.badgeBg, color: kpi.badgeColor }}>{kpi.badge}</span>
            </div>
            <div style={{ fontSize: 32, fontWeight: 700, fontFamily: mono, marginBottom: 4 }}>{kpi.value}</div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>{kpi.label}</div>
            <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
              {kpi.comps.map((c, j) => (
                <div key={j} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: c.color, display: 'flex', alignItems: 'center', gap: 4 }}>{c.value}</span>
                  <span style={{ fontSize: 10, color: C.dim }}>{c.label}</span>
                </div>
              ))}
            </div>
            <div style={{ height: 32, display: 'flex', alignItems: 'flex-end', gap: 3 }}>
              {kpi.bars.map((h, j) => (
                <div key={j} style={{ flex: 1, height: `${h}%`, borderRadius: 2, minHeight: 4, background: j === kpi.bars.length - 1 ? C.blue : '#2a2a32' }} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ─── 8. Season Order Status (5 visualization options) ──────────── */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Season Order Status — Pick Your Favorite View</span>
          <span style={{ fontSize: 11, color: C.dim }}>6 visualization options for user testing</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

          {/* Option 1: Stacked Bars */}
          <div style={cardStyle}>
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, fontSize: 12, fontWeight: 600 }}>
              <span style={{ background: C.blue, color: '#fff', padding: '2px 6px', borderRadius: 4, fontSize: 10, marginRight: 8 }}>1</span>
              Stacked Bars
            </div>
            <div style={{ padding: '12px 16px' }}>
              {[
                { label: '26FA', shipped: 65, open: 28, total: '$60M', pct: '65%', current: true },
                { label: '26SP', shipped: 93, open: 7, total: '$56M', pct: '93%' },
                { label: '25FA', shipped: 100, open: 0, total: '$52M', pct: '100%' },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ width: 32, fontSize: 10, fontFamily: mono, color: row.current ? C.blue : C.muted }}>{row.label}</span>
                  <div style={{ flex: 1, height: 16, background: C.surface, borderRadius: 3, display: 'flex', overflow: 'hidden' }}>
                    <div style={{ width: `${row.shipped}%`, background: C.green }} />
                    {row.open > 0 && <div style={{ width: `${row.open}%`, background: C.orange }} />}
                  </div>
                  <span style={{ width: 36, fontSize: 10, fontFamily: mono, textAlign: 'right' }}>{row.total}</span>
                  <span style={{ width: 28, fontSize: 9, color: C.dim, textAlign: 'right' }}>{row.pct}</span>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 12, marginTop: 8, justifyContent: 'center' }}>
                <span style={{ fontSize: 9, color: C.muted, display: 'flex', alignItems: 'center' }}><span style={{ width: 6, height: 6, borderRadius: 2, background: C.green, marginRight: 4, display: 'inline-block' }} />Shipped</span>
                <span style={{ fontSize: 9, color: C.muted, display: 'flex', alignItems: 'center' }}><span style={{ width: 6, height: 6, borderRadius: 2, background: C.orange, marginRight: 4, display: 'inline-block' }} />Open</span>
              </div>
            </div>
          </div>

          {/* Option 2: Waterfall */}
          <div style={cardStyle}>
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, fontSize: 12, fontWeight: 600 }}>
              <span style={{ background: C.blue, color: '#fff', padding: '2px 6px', borderRadius: 4, fontSize: 10, marginRight: 8 }}>2</span>
              Waterfall
            </div>
            <div style={{ padding: '12px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', height: 90, gap: 4 }}>
                {[
                  { label: 'Booked', value: '$65M', h: 80, color: C.blue },
                  { label: 'Shipped', value: '$42M', h: 52, color: C.green },
                  { label: 'Open', value: '$18M', h: 35, color: C.orange },
                  { label: 'At Risk', value: '$3M', h: 14, color: C.red },
                ].map(b => (
                  <div key={b.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 40, height: b.h, borderRadius: '3px 3px 0 0', background: b.color, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 4 }}>
                      <span style={{ fontSize: 8, fontWeight: 600, color: '#fff', fontFamily: mono }}>{b.value}</span>
                    </div>
                    <span style={{ fontSize: 8, color: C.dim }}>{b.label}</span>
                  </div>
                ))}
              </div>
              <div style={{ textAlign: 'center', marginTop: 8, fontSize: 10, color: C.muted }}>
                Fill Rate: <strong style={{ color: C.green }}>94.2%</strong>
              </div>
            </div>
          </div>

          {/* Option 3: Progress to Book */}
          <div style={cardStyle}>
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, fontSize: 12, fontWeight: 600 }}>
              <span style={{ background: C.blue, color: '#fff', padding: '2px 6px', borderRadius: 4, fontSize: 10, marginRight: 8 }}>3</span>
              Progress to Book
            </div>
            <div style={{ padding: '12px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.blue }}>26FA</span>
                <span style={{ fontSize: 10, color: C.dim }}>Target: $65M</span>
              </div>
              <div style={{ height: 20, background: C.surface, borderRadius: 4, display: 'flex', overflow: 'hidden', marginBottom: 10 }}>
                <div style={{ width: '65%', background: C.green }} />
                <div style={{ width: '28%', background: C.orange }} />
                <div style={{ width: '4%', background: C.red }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {[
                  { color: C.green, label: 'Shipped', val: '$42M', pct: '65%' },
                  { color: C.orange, label: 'Open', val: '$18M', pct: '28%' },
                  { color: C.red, label: 'At Risk', val: '$3M', pct: '5%' },
                ].map(item => (
                  <div key={item.label} style={{ fontSize: 9, color: C.muted, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 6, height: 6, borderRadius: 2, background: item.color, display: 'inline-block' }} />
                    {item.label} <strong style={{ color: C.text, fontFamily: mono }}>{item.val}</strong> ({item.pct})
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Option 4: Ship Schedule */}
          <div style={cardStyle}>
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, fontSize: 12, fontWeight: 600 }}>
              <span style={{ background: C.blue, color: '#fff', padding: '2px 6px', borderRadius: 4, fontSize: 10, marginRight: 8 }}>4</span>
              Ship Schedule
            </div>
            <div style={{ padding: '12px 16px', fontSize: 9 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '40px repeat(4, 1fr)', gap: 3, marginBottom: 4 }}>
                <span />
                {['JAN', 'FEB', 'MAR', 'APR'].map(m => (
                  <span key={m} style={{ textAlign: 'center', color: m === 'FEB' ? C.blue : C.dim, padding: '4px 0', background: m === 'FEB' ? 'rgba(10,132,255,0.15)' : 'transparent', borderRadius: 3 }}>{m}</span>
                ))}
              </div>
              {[
                { label: 'Ship', color: C.green, dot: C.green, vals: ['$12M', '$18M', '$12M', '—'] },
                { label: 'Open', color: C.orange, dot: C.orange, vals: ['—', '$4M', '$6M', '$5M'] },
              ].map(row => (
                <div key={row.label} style={{ display: 'grid', gridTemplateColumns: '40px repeat(4, 1fr)', gap: 3, marginBottom: 3 }}>
                  <span style={{ fontSize: 9, color: C.muted, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 6, height: 6, borderRadius: 2, background: row.dot, display: 'inline-block' }} />{row.label}
                  </span>
                  {row.vals.map((v, i) => (
                    <span key={i} style={{
                      textAlign: 'center', padding: '6px 2px', borderRadius: 3, fontFamily: mono, fontSize: 8, fontWeight: 600,
                      background: v === '—' ? C.surface : row.color,
                      color: v === '—' ? '#3a3a42' : '#000',
                    }}>{v}</span>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Option 6: Shipped / Invoice */}
          <div style={cardStyle}>
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <span style={{ background: C.purple, color: '#fff', padding: '2px 6px', borderRadius: 4, fontSize: 10, marginRight: 8 }}>6</span>
                Shipped / Invoice
              </div>
              <span style={{ fontSize: 9, color: C.dim, fontWeight: 400 }}>26FA &middot; Last 30 days</span>
            </div>
            <div style={{ padding: '12px 16px', fontSize: 9 }}>
              {/* Column headers */}
              <div style={{ display: 'grid', gridTemplateColumns: '52px repeat(4, 1fr)', gap: 3, marginBottom: 6 }}>
                <span />
                {['JAN', 'FEB', 'MAR', 'APR'].map(m => (
                  <span key={m} style={{ textAlign: 'center', color: m === 'FEB' ? C.purple : C.dim, padding: '4px 0', background: m === 'FEB' ? 'rgba(191,90,242,0.12)' : 'transparent', borderRadius: 3, fontSize: 9, fontWeight: 600 }}>{m}</span>
                ))}
              </div>
              {/* Data rows */}
              {[
                { label: 'Shipped', dot: C.green, vals: ['$12.4M', '$18.1M', '$8.2M', '—'], colors: [C.green, C.green, C.green, ''] },
                { label: 'Invoiced', dot: C.blue, vals: ['$12.4M', '$16.8M', '$4.1M', '—'], colors: [C.blue, C.blue, C.blue, ''] },
                { label: 'Variance', dot: C.orange, vals: ['$0', '$1.3M', '$4.1M', '—'], colors: ['', C.orange, C.orange, ''] },
              ].map(row => (
                <div key={row.label} style={{ display: 'grid', gridTemplateColumns: '52px repeat(4, 1fr)', gap: 3, marginBottom: 3 }}>
                  <span style={{ fontSize: 9, color: C.muted, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 6, height: 6, borderRadius: 2, background: row.dot, display: 'inline-block' }} />{row.label}
                  </span>
                  {row.vals.map((v, i) => {
                    const isEmpty = v === '—' || v === '$0';
                    return (
                      <span key={i} style={{
                        textAlign: 'center', padding: '6px 2px', borderRadius: 3, fontFamily: mono, fontSize: 8, fontWeight: 600,
                        background: isEmpty ? C.surface : (row.colors[i] || C.surface),
                        color: isEmpty ? '#3a3a42' : '#000',
                      }}>{v}</span>
                    );
                  })}
                </div>
              ))}
              {/* Summary bar */}
              <div style={{ marginTop: 8, padding: '8px 10px', background: C.surface, borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <span style={{ fontSize: 9, color: C.muted }}>Shipped <strong style={{ color: C.green, fontFamily: mono }}>$38.7M</strong></span>
                  <span style={{ fontSize: 9, color: C.muted }}>Invoiced <strong style={{ color: C.blue, fontFamily: mono }}>$33.3M</strong></span>
                </div>
                <span style={{ fontSize: 9, color: C.orange }}>
                  $5.4M uninvoiced
                  <span style={{ marginLeft: 6, background: 'rgba(255,159,10,0.15)', color: C.orange, padding: '2px 6px', borderRadius: 3, fontSize: 8, fontWeight: 600 }}>86% billed</span>
                </span>
              </div>
            </div>
          </div>

          {/* Option 5: YoY Comparison (full width) */}
          <div style={{ ...cardStyle, gridColumn: '1 / -1' }}>
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, fontSize: 12, fontWeight: 600 }}>
              <span style={{ background: C.blue, color: '#fff', padding: '2px 6px', borderRadius: 4, fontSize: 10, marginRight: 8 }}>5</span>
              YoY Comparison
            </div>
            <div style={{ padding: '12px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, background: C.surface, borderRadius: 8, padding: '10px 12px', position: 'relative', border: `1px solid ${C.blue}`, backgroundColor: 'rgba(10,132,255,0.05)' }}>
                  <span style={{ position: 'absolute', top: 6, right: 8, fontSize: 8, padding: '2px 6px', borderRadius: 3, background: C.blue, color: '#fff' }}>Current</span>
                  <div style={{ fontSize: 14, fontWeight: 700, fontFamily: mono, marginBottom: 6 }}>26FA</div>
                  <div style={{ fontSize: 10, color: C.muted, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div>Booked: <strong style={{ color: C.text, fontFamily: mono }}>$60M</strong></div>
                    <div>Shipped: <strong style={{ color: C.text, fontFamily: mono }}>$42M</strong></div>
                    <div>Open: <strong style={{ color: C.text, fontFamily: mono }}>$18M</strong></div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '0 8px' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, fontFamily: mono, color: C.green }}>+$8M</div>
                  <div style={{ fontSize: 9, color: C.green }}>+15% ahead</div>
                </div>
                <div style={{ flex: 1, background: C.surface, borderRadius: 8, padding: '10px 12px', position: 'relative' }}>
                  <span style={{ position: 'absolute', top: 6, right: 8, fontSize: 8, padding: '2px 6px', borderRadius: 3, background: '#2a2a32', color: C.muted }}>Prior Year</span>
                  <div style={{ fontSize: 14, fontWeight: 700, fontFamily: mono, marginBottom: 6 }}>25FA</div>
                  <div style={{ fontSize: 10, color: C.muted, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div>Booked: <strong style={{ color: C.text, fontFamily: mono }}>$52M</strong></div>
                    <div>Shipped: <strong style={{ color: C.text, fontFamily: mono }}>$38M</strong></div>
                    <div>Open: <strong style={{ color: C.text, fontFamily: mono }}>$14M</strong></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── 9 & 10. Revenue Trend + Channel Performance ───────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Revenue Trend */}
        <div style={cardStyle}>
          <div style={panelHeaderStyle}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Revenue Trend</div>
              <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>6-season comparison with forecast</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {['Revenue', 'Units'].map(btn => (
                <button key={btn} style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${btn === 'Revenue' ? C.blue : C.border}`, background: btn === 'Revenue' ? C.surface : 'transparent', color: btn === 'Revenue' ? C.text : C.muted, fontSize: 11, fontFamily: sans, cursor: 'pointer' }}>{btn}</button>
              ))}
            </div>
          </div>
          <div style={panelBodyStyle}>
            <div style={{ height: 200, display: 'flex', alignItems: 'flex-end', gap: 12, paddingTop: 20 }}>
              {revenueTrend.map(s => (
                <div key={s.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: '100%', height: 160, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 4 }}>
                    <div style={{
                      width: 24, borderRadius: '4px 4px 0 0', height: `${s.pctA}%`, position: 'relative',
                      background: s.forecast ? 'transparent' : C.blue,
                      border: s.forecast ? `2px dashed ${C.blue}` : 'none',
                    }}>
                      <span style={{ position: 'absolute', top: -20, left: '50%', transform: 'translateX(-50%)', fontSize: 10, fontFamily: mono, color: C.muted, whiteSpace: 'nowrap' }}>${s.actual}M</span>
                    </div>
                    <div style={{ width: 24, borderRadius: '4px 4px 0 0', height: `${s.pctB}%`, background: '#3a3a42' }} />
                  </div>
                  <span style={{ fontSize: 11, color: s.current ? C.blue : C.muted, fontFamily: mono, fontWeight: s.current ? 600 : 400 }}>{s.label}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 16 }}>
              {[
                { label: 'Actual', bg: C.blue },
                { label: 'Budget', bg: '#3a3a42' },
                { label: 'Forecast', border: true },
              ].map(l => (
                <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.muted }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: l.border ? 'transparent' : l.bg, border: l.border ? `2px dashed ${C.blue}` : 'none', display: 'inline-block' }} />
                  {l.label}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Channel Performance */}
        <div style={cardStyle}>
          <div style={panelHeaderStyle}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Channel Performance</div>
              <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>Revenue by sales channel</div>
            </div>
          </div>
          <div style={panelBodyStyle}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {channels.map(ch => (
                <div key={ch.name} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ width: 80, fontSize: 12 }}>{ch.name}</div>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1, height: 24, background: C.surface, borderRadius: 6, overflow: 'hidden', position: 'relative' }}>
                      <div style={{ height: '100%', width: `${ch.pct}%`, borderRadius: 6, background: ch.gradient, display: 'flex', alignItems: 'center', paddingLeft: 10 }}>
                        <span style={{ fontSize: 12, fontFamily: mono, color: '#fff', fontWeight: 600, textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>{ch.value}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 16, minWidth: 140 }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 12, fontFamily: mono, fontWeight: 500, color: ch.up ? C.green : C.red }}>{ch.up ? '↑' : '↓'} {ch.yoy}</div>
                        <div style={{ fontSize: 9, color: C.dim }}>vs PY</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 12, fontFamily: mono, fontWeight: 500 }}>{ch.share}</div>
                        <div style={{ fontSize: 9, color: C.dim }}>Share</div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ─── 11 & 12. Category Performance + Margin Health ─────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Category Performance */}
        <div style={cardStyle}>
          <div style={panelHeaderStyle}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Category Performance</div>
              <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>YoY comparison by category</div>
            </div>
          </div>
          <div style={{ padding: 0 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  {['Category', 'Revenue', 'Share', 'vs PY', 'Margin'].map(h => (
                    <th key={h} style={{ textAlign: h === 'Category' ? 'left' : 'right', padding: '10px 12px', fontSize: 10, fontWeight: 600, color: C.dim, textTransform: 'uppercase', letterSpacing: 0.3, borderBottom: `1px solid ${C.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {categories.map(cat => (
                  <tr key={cat.name}>
                    <td style={{ padding: 12, borderBottom: `1px solid ${C.surface}` }}>{cat.name}</td>
                    <td style={{ padding: 12, borderBottom: `1px solid ${C.surface}`, textAlign: 'right', fontFamily: mono }}>{cat.revenue}</td>
                    <td style={{ padding: 12, borderBottom: `1px solid ${C.surface}`, textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                        <div style={{ width: 60, height: 6, background: C.surface, borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${cat.share}%`, borderRadius: 3, background: cat.color }} />
                        </div>
                        {cat.share}%
                      </div>
                    </td>
                    <td style={{ padding: 12, borderBottom: `1px solid ${C.surface}`, textAlign: 'right' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: cat.up ? 'rgba(48,209,88,0.15)' : 'rgba(255,69,58,0.15)', color: cat.up ? C.green : C.red }}>
                        {cat.up ? '↑' : '↓'} {cat.trend}
                      </span>
                    </td>
                    <td style={{ padding: 12, borderBottom: `1px solid ${C.surface}`, textAlign: 'right', fontFamily: mono }}>{cat.margin}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Margin Health */}
        <div style={cardStyle}>
          <div style={panelHeaderStyle}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Margin Health</div>
              <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>Overall and by channel</div>
            </div>
          </div>
          <div style={panelBodyStyle}>
            <div style={{ display: 'flex', gap: 24, marginBottom: 24 }}>
              {/* Donut gauge */}
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{
                  width: 100, height: 100, borderRadius: '50%', margin: '0 auto 12px',
                  background: 'conic-gradient(#30d158 0deg 216deg, #1a1a1f 216deg 360deg)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
                }}>
                  <div style={{ width: 76, height: 76, background: C.card, borderRadius: '50%', position: 'absolute' }} />
                  <span style={{ position: 'relative', fontSize: 20, fontWeight: 700, fontFamily: mono }}>60.3%</span>
                </div>
                <div style={{ fontSize: 11, color: C.muted }}>Gross Margin</div>
                <div style={{ fontSize: 10, color: C.dim, marginTop: 4 }}>Target: 61.5%</div>
              </div>
              {/* Margin by channel */}
              <div style={{ flex: 2 }}>
                {marginChannels.map(mc => (
                  <div key={mc.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: `1px solid ${C.surface}` }}>
                    <div style={{ width: 80, fontSize: 12 }}>{mc.name}</div>
                    <div style={{ flex: 1, height: 8, background: C.surface, borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${mc.pct}%`, borderRadius: 4, background: mc.color }} />
                    </div>
                    <div style={{ width: 50, textAlign: 'right', fontSize: 12, fontFamily: mono, fontWeight: 600 }}>{mc.value}</div>
                    <div style={{ width: 50, textAlign: 'right', fontSize: 11, color: mc.trendColor }}>{mc.trend}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── 13 & 14. Forward Outlook + Style Movers ───────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Forward Outlook */}
        <div style={cardStyle}>
          <div style={panelHeaderStyle}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Forward Outlook</div>
              <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>Leading indicators for 26FA</div>
            </div>
          </div>
          <div style={panelBodyStyle}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              {[
                { value: '$42.1M', label: 'Pre-Book Orders', comp: '↑ 18% vs 25FA book', color: C.green, compUp: true },
                { value: '94.2%', label: 'Fill Rate', comp: '↑ 2.1pts vs PY', color: C.blue, compUp: true },
                { value: '8.4', label: 'Weeks of Supply', comp: '↓ 1.2 vs target (9.5)', color: C.orange, compUp: false },
              ].map(item => (
                <div key={item.label} style={{ background: C.surface, borderRadius: 10, padding: 16, textAlign: 'center' }}>
                  <div style={{ fontSize: 28, fontWeight: 700, fontFamily: mono, marginBottom: 4, color: item.color }}>{item.value}</div>
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>{item.label}</div>
                  <div style={{ fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, color: item.compUp ? C.green : C.red }}>{item.comp}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Style Movers */}
        <div style={cardStyle}>
          <div style={panelHeaderStyle}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Style Movers</div>
              <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>Biggest gainers and decliners vs PY</div>
            </div>
          </div>
          <div style={panelBodyStyle}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              {/* Gainers */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12, color: C.green, display: 'flex', alignItems: 'center', gap: 6 }}>📈 Top Gainers</div>
                {gainers.map((g, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < 2 ? `1px solid ${C.surface}` : 'none' }}>
                    <div style={{ width: 24, height: 24, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, background: 'rgba(48,209,88,0.15)', color: C.green }}>{i + 1}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 500 }}>{g.name}</div>
                      <div style={{ fontSize: 10, color: C.dim }}>{g.category}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, fontFamily: mono, color: C.green }}>{g.change}</div>
                      <div style={{ fontSize: 10, color: C.dim }}>{g.amount}</div>
                    </div>
                  </div>
                ))}
              </div>
              {/* Decliners */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12, color: C.red, display: 'flex', alignItems: 'center', gap: 6 }}>📉 Top Decliners</div>
                {decliners.map((d, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < 2 ? `1px solid ${C.surface}` : 'none' }}>
                    <div style={{ width: 24, height: 24, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, background: 'rgba(255,69,58,0.15)', color: C.red }}>{i + 1}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 500 }}>{d.name}</div>
                      <div style={{ fontSize: 10, color: C.dim }}>{d.category}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, fontFamily: mono, color: C.red }}>{d.change}</div>
                      <div style={{ fontSize: 10, color: C.dim }}>{d.amount}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
