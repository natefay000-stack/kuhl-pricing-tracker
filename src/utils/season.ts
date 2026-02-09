/**
 * Dynamic season utility functions.
 * Replaces all hardcoded season arrays/regex throughout the codebase.
 */

/**
 * Parse a normalized season code (e.g., "26FA") into year and type.
 * Returns null if the format is invalid.
 */
export function parseSeasonCode(code: string): { year: number; type: 'SP' | 'FA' } | null {
  const match = code.match(/^(\d{2})(SP|FA)$/);
  if (!match) return null;
  return {
    year: 2000 + parseInt(match[1]),
    type: match[2] as 'SP' | 'FA',
  };
}

/**
 * Determine if a season code represents a future season (not yet selling).
 * Spring seasons start selling ~January, Fall seasons start selling ~July.
 */
export function isFutureSeason(code: string, referenceDate: Date = new Date()): boolean {
  const parsed = parseSeasonCode(code);
  if (!parsed) return false;

  // Fall starts selling around July of the year before the label year
  // Spring starts selling around January of the label year
  // We use a conservative cutoff: if the selling window hasn't started yet, it's "future"
  const sellingStart = parsed.type === 'FA'
    ? new Date(parsed.year - 1, 6, 1)  // July of prior year (e.g., FA27 sells starting July 2026)
    : new Date(parsed.year - 1, 0, 1); // January of prior year (e.g., SP27 sells starting Jan 2026)

  return sellingStart > referenceDate;
}

/**
 * Determine if a season code represents a historical season (selling period has ended).
 */
export function isHistoricalSeason(code: string, referenceDate: Date = new Date()): boolean {
  return !isFutureSeason(code, referenceDate);
}

/**
 * Filter to only "relevant" seasons (recent + current + near future).
 * Keeps seasons from the last ~3 years through 2 years ahead.
 */
export function isRelevantSeason(code: string, referenceDate: Date = new Date()): boolean {
  const parsed = parseSeasonCode(code);
  if (!parsed) return false;

  const currentYear = referenceDate.getFullYear();
  // Show seasons from 3 years ago through 2 years ahead
  return parsed.year >= (currentYear - 3) && parsed.year <= (currentYear + 2);
}

/**
 * Generate season options for dropdowns (next ~4 seasons + current).
 * Returns in descending order (newest first).
 */
export function generateSeasonOptions(referenceDate: Date = new Date()): Array<{ value: string; label: string }> {
  const currentYear = referenceDate.getFullYear();
  const twoDigit = (y: number) => String(y).slice(-2);
  const options: Array<{ value: string; label: string }> = [];

  // Generate from 2 years ahead down to current year
  for (let year = currentYear + 2; year >= currentYear; year--) {
    options.push({ value: `${twoDigit(year)}FA`, label: `Fall ${year}` });
    options.push({ value: `${twoDigit(year)}SP`, label: `Spring ${year}` });
  }

  return options;
}
