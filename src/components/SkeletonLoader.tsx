'use client';

import React from 'react';

/* ── Shimmer keyframes injected once ─────────────────────────────── */
const shimmerCSS = `
@keyframes skeleton-shimmer {
  0% {
    background-position: -400px 0;
  }
  100% {
    background-position: 400px 0;
  }
}
`;

let injected = false;
function injectShimmerCSS() {
  if (injected || typeof document === 'undefined') return;
  const style = document.createElement('style');
  style.textContent = shimmerCSS;
  document.head.appendChild(style);
  injected = true;
}

/* ── Shared shimmer style builder ────────────────────────────────── */
function shimmerStyle(): React.CSSProperties {
  return {
    background: `linear-gradient(
      90deg,
      var(--color-surface-tertiary) 0%,
      var(--color-surface-secondary) 40%,
      var(--color-surface-tertiary) 80%
    )`,
    backgroundSize: '800px 100%',
    animation: 'skeleton-shimmer 1.8s ease-in-out infinite',
  };
}

/* ═══════════════════════════════════════════════════════════════════
   1. SkeletonPulse — Base animated pulse element
   ═══════════════════════════════════════════════════════════════════ */

interface SkeletonPulseProps {
  className?: string;
  style?: React.CSSProperties;
}

export function SkeletonPulse({ className = '', style }: SkeletonPulseProps) {
  injectShimmerCSS();
  return (
    <div
      className={`rounded-md ${className}`}
      style={{ ...shimmerStyle(), ...style }}
    />
  );
}

/* ═══════════════════════════════════════════════════════════════════
   2. SkeletonCard — Stat card placeholder
   ═══════════════════════════════════════════════════════════════════ */

export function SkeletonCard() {
  injectShimmerCSS();
  return (
    <div
      className="stat-card flex items-start gap-4"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--glass-border)' }}
    >
      {/* Icon circle */}
      <SkeletonPulse className="w-10 h-10 rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-2">
        {/* Value line */}
        <SkeletonPulse className="h-7 w-24 rounded-md" />
        {/* Label line */}
        <SkeletonPulse className="h-3.5 w-32 rounded-md" />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   3. SkeletonChart — Chart area placeholder
   ═══════════════════════════════════════════════════════════════════ */

interface SkeletonChartProps {
  height?: number;
}

export function SkeletonChart({ height = 300 }: SkeletonChartProps) {
  injectShimmerCSS();

  // Fake bar heights as percentages
  const bars = [40, 65, 50, 80, 55, 70, 45, 75, 60, 85, 50, 68];

  return (
    <div
      className="card overflow-hidden"
      style={{ height, background: 'var(--color-surface)', border: '1px solid var(--glass-border)' }}
    >
      {/* Chart title placeholder */}
      <div className="px-5 pt-4 pb-2">
        <SkeletonPulse className="h-4 w-36 rounded-md" />
      </div>
      {/* Fake bars */}
      <div className="flex items-end gap-2 px-5 pb-4" style={{ height: height - 60 }}>
        {bars.map((pct, i) => (
          <div key={i} className="flex-1 flex flex-col justify-end h-full">
            <SkeletonPulse
              className="w-full rounded-sm"
              style={{ height: `${pct}%`, opacity: 0.6 + (i % 3) * 0.15 }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   4. SkeletonTable — Data table placeholder
   ═══════════════════════════════════════════════════════════════════ */

interface SkeletonTableProps {
  rows?: number;
  columns?: number;
}

export function SkeletonTable({ rows = 8, columns = 5 }: SkeletonTableProps) {
  injectShimmerCSS();

  // Varied widths per column for a natural look
  const colWidths = ['60%', '75%', '45%', '55%', '40%', '70%', '50%', '65%'];

  return (
    <div
      className="card overflow-hidden"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--glass-border)' }}
    >
      <table className="w-full">
        {/* Header */}
        <thead>
          <tr>
            {Array.from({ length: columns }).map((_, c) => (
              <th
                key={c}
                className="px-4 py-3 text-left"
                style={{
                  backgroundColor: 'var(--color-surface-secondary)',
                  borderBottom: '2px solid var(--color-border-primary)',
                }}
              >
                <SkeletonPulse
                  className="h-3 rounded-md"
                  style={{ width: colWidths[c % colWidths.length], opacity: 0.7 }}
                />
              </th>
            ))}
          </tr>
        </thead>
        {/* Body */}
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r}>
              {Array.from({ length: columns }).map((_, c) => {
                // Shift widths per row for variety
                const widthIdx = (c + r) % colWidths.length;
                return (
                  <td
                    key={c}
                    className="px-4 py-3"
                    style={{ borderBottom: '1px solid var(--color-border-secondary)' }}
                  >
                    <SkeletonPulse
                      className="h-3.5 rounded-md"
                      style={{ width: colWidths[widthIdx] }}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   5. SkeletonDashboard — Pre-built dashboard layout skeleton
   ═══════════════════════════════════════════════════════════════════ */

export function SkeletonDashboard() {
  return (
    <div className="space-y-6">
      {/* 4 stat cards in a row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>

      {/* 2 charts side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SkeletonChart height={320} />
        <SkeletonChart height={320} />
      </div>

      {/* Table below */}
      <SkeletonTable rows={8} columns={6} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   6. SkeletonView — Generic view skeleton (title + table)
   ═══════════════════════════════════════════════════════════════════ */

export function SkeletonView() {
  return (
    <div className="space-y-6">
      {/* Title bar + subtitle */}
      <div className="space-y-2">
        <SkeletonPulse className="h-7 w-56 rounded-md" />
        <SkeletonPulse className="h-4 w-80 rounded-md" style={{ opacity: 0.6 }} />
      </div>

      {/* Table */}
      <SkeletonTable rows={10} columns={5} />
    </div>
  );
}
