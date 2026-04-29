/**
 * Multi-select filter utilities for the global FilterBar.
 *
 * The selectedX state values in `src/app/page.tsx` and view props are kept as
 * `string` for backwards compatibility, but a non-empty value is now a
 * `|`-delimited list of selected values (e.g. "Men's|Women's").
 *
 * Empty string means "match all". Special tokens like `__ALL_SP__` /
 * `__ALL_FA__` (the season aggregator) keep their existing meaning and are
 * handled by callers separately.
 */

/** True if `rowValue` passes the active multi-select filter.
 *  filter is either empty (= match all), a special token like __ALL_SP__,
 *  or a pipe-delimited list of allowed values ("Men|Women"). */
export function matchesFilter(
  rowValue: string | null | undefined,
  filter: string | null | undefined,
): boolean {
  if (!filter) return true;
  if (filter.startsWith('__ALL_')) return true; // caller handles the season aggregator separately
  const tokens = filter.split('|').filter(Boolean);
  if (tokens.length === 0) return true;
  return tokens.includes(rowValue ?? '');
}

/** Parse a pipe-delimited filter into an array of tokens. Empty string → []. */
export function parseFilter(filter: string): string[] {
  if (!filter) return [];
  if (filter.startsWith('__ALL_')) return [];
  return filter.split('|').filter(Boolean);
}

/** Join an array of tokens back to a pipe-delimited filter string. */
export function joinFilter(tokens: string[]): string {
  return tokens.join('|');
}
