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
  if (value === null || value === undefined || value === 0) return '—';
  return `$${value.toFixed(2)}`;
}

/** Abbreviated currency – for dashboards & summary cards */
export function formatCurrencyShort(value: number): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

/** Signed exact currency – for showing price deltas (+$2.50) */
export function formatDelta(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}$${value.toFixed(2)}`;
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

/** Locale-formatted number: 1234 → "1,234" */
export function formatNumber(value: number): string {
  return value.toLocaleString();
}

/** Abbreviated number: 1234 → "1.2K", 1234567 → "1.2M" */
export function formatNumberShort(value: number): string {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return value.toLocaleString();
}
