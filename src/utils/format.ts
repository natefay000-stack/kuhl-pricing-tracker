/**
 * Centralized formatting utilities for the KUHL Pricing Tracker.
 *
 * Three currency modes:
 *   formatCurrency     – exact: $45.99 (for detail/line-item tables)
 *   formatCurrencyShort – abbreviated: $1.2M / $45K / $123 (for dashboards & summaries)
 *   formatDelta        – signed exact: +$2.50 / -$1.00 (for price change columns)
 *
 * Also: formatPercent, formatPercentRaw, formatNumber, formatNumberShort
 */

// ── Currency ────────────────────────────────────────────────────────

/** Exact currency – for line items, detail tables.  Null/undefined → '—' */
export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `$${value.toFixed(2)}`;
}

/** Abbreviated currency – for dashboards & summary cards */
export function formatCurrencyShort(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value) || !isFinite(value)) return '$0';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1000000) return `${sign}$${(abs / 1000000).toFixed(1)}M`;
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

/** Signed exact currency – for showing price deltas (+$2.50 / -$1.00) */
export function formatDelta(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const abs = Math.abs(value);
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}$${abs.toFixed(2)}`;
}

// ── Percentages ─────────────────────────────────────────────────────

/**
 * Format a percentage value that is already in "percent" form (e.g. 45.2 → "45.2%").
 * Null/undefined/NaN/Infinity → '—'
 */
export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value) || !isFinite(value)) return '—';
  return `${value.toFixed(1)}%`;
}

/**
 * Format a percentage with +/- sign (for delta columns). e.g. +3.2%, -1.5%
 */
export function formatPercentSigned(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value) || !isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

/**
 * Format a raw ratio (0–1) as a percentage.  0.452 → "45.2%"
 * Null/undefined/NaN/Infinity → '—'
 */
export function formatPercentRaw(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value) || !isFinite(value)) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

// ── Numbers ─────────────────────────────────────────────────────────

/** Locale-formatted number: 1234 → "1,234".  Null/undefined → '—' */
export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString();
}

// ── Margin Colors ──────────────────────────────────────────────────

/** Consistent margin text color across all views.  ≥50 green, ≥45 amber, ≥40 orange, <40 red */
export function getMarginColor(margin: number | null | undefined): string {
  const pct = margin ?? 0;
  if (pct >= 50) return 'text-emerald-600 dark:text-emerald-400';
  if (pct >= 45) return 'text-amber-600 dark:text-amber-400';
  if (pct >= 40) return 'text-orange-600 dark:text-orange-400';
  return 'text-red-600 dark:text-red-400';
}

/** Consistent margin background tint for badge/pill elements */
export function getMarginBg(margin: number | null | undefined): string {
  const pct = margin ?? 0;
  if (pct >= 50) return 'bg-emerald-50 dark:bg-emerald-950';
  if (pct >= 45) return 'bg-amber-50 dark:bg-amber-950';
  if (pct >= 40) return 'bg-orange-50 dark:bg-orange-950';
  return 'bg-red-50 dark:bg-red-950';
}

/** Margin tier label for dashboards */
export type MarginTier = 'excellent' | 'good' | 'fair' | 'poor';
export function getMarginTier(margin: number): MarginTier {
  if (margin >= 50) return 'excellent';
  if (margin >= 45) return 'good';
  if (margin >= 40) return 'fair';
  return 'poor';
}

// ── Numbers ─────────────────────────────────────────────────────────

/** Abbreviated number: 1234 → "1.2K", 1234567 → "1.2M", -5000 → "-5.0K" */
export function formatNumberShort(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1000000) return `${sign}${(abs / 1000000).toFixed(1)}M`;
  if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(1)}K`;
  return value.toLocaleString();
}
