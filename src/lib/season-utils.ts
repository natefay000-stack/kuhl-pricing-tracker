'use strict';

/**
 * KÜHL Season Calendar Utilities
 *
 * SHIPPING WINDOWS:
 * - Spring (SP): Feb 15 → Aug 14
 * - Fall (FA): Aug 15 → Feb 14 (next year)
 *
 * PRE-BOOK WINDOWS:
 * - Spring: ~June prior year (8 months before Feb 15)
 * - Fall: ~December prior year (8 months before Aug 15)
 */

export type SeasonStatus = 'CLOSED' | 'SHIPPING' | 'PRE-BOOK' | 'PLANNING';

export interface SeasonInfo {
  code: string;           // e.g., "26SP", "26FA"
  status: SeasonStatus;
  shipStart: Date;
  shipEnd: Date;
  preBookStart: Date;
  label: string;          // e.g., "Spring 2026", "Fall 2026"
  shortLabel: string;     // e.g., "26SP", "26FA"
}

/**
 * Parse a season code like "26SP" into year and type
 */
export function parseSeasonCode(season: string): { year: number; type: 'SP' | 'FA' } | null {
  const match = season.match(/^(\d{2})(SP|FA)$/i);
  if (!match) return null;
  return {
    year: 2000 + parseInt(match[1], 10),
    type: match[2].toUpperCase() as 'SP' | 'FA'
  };
}

/**
 * Get the shipping start date for a season
 */
export function getSeasonShipStart(season: string): Date | null {
  const parsed = parseSeasonCode(season);
  if (!parsed) return null;

  if (parsed.type === 'SP') {
    // Spring ships Feb 15
    return new Date(parsed.year, 1, 15); // Month is 0-indexed
  } else {
    // Fall ships Aug 15
    return new Date(parsed.year, 7, 15);
  }
}

/**
 * Get the shipping end date for a season
 */
export function getSeasonShipEnd(season: string): Date | null {
  const parsed = parseSeasonCode(season);
  if (!parsed) return null;

  if (parsed.type === 'SP') {
    // Spring ends Aug 14
    return new Date(parsed.year, 7, 14);
  } else {
    // Fall ends Feb 14 of NEXT year
    return new Date(parsed.year + 1, 1, 14);
  }
}

/**
 * Get the pre-book start date for a season (~8 months before ship start)
 */
export function getPreBookStart(season: string): Date | null {
  const parsed = parseSeasonCode(season);
  if (!parsed) return null;

  if (parsed.type === 'SP') {
    // Spring pre-book starts ~June of prior year
    return new Date(parsed.year - 1, 5, 1); // June 1
  } else {
    // Fall pre-book starts ~December of prior year
    return new Date(parsed.year - 1, 11, 1); // Dec 1
  }
}

/**
 * Get the current shipping season based on today's date
 */
export function getCurrentShippingSeason(date: Date = new Date()): string {
  const month = date.getMonth() + 1; // 1-12
  const day = date.getDate();
  const year = date.getFullYear();

  // Feb 15 - Aug 14 = Spring of that year
  // Aug 15 - Feb 14 = Fall of that year (or previous year if Jan-Feb)

  if ((month > 2 || (month === 2 && day >= 15)) &&
      (month < 8 || (month === 8 && day < 15))) {
    // Spring: Feb 15 - Aug 14
    const seasonYear = year - 2000; // 2026 → 26
    return `${seasonYear}SP`;
  } else {
    // Fall: Aug 15 - Feb 14
    // If Jan 1 - Feb 14, it's the previous year's Fall
    const seasonYear = (month <= 2 && day < 15) ? year - 2001 : year - 2000;
    return `${seasonYear}FA`;
  }
}

/**
 * Get the status of a season relative to a given date
 */
export function getSeasonStatus(season: string, today: Date = new Date()): SeasonStatus {
  const shipStart = getSeasonShipStart(season);
  const shipEnd = getSeasonShipEnd(season);
  const preBookStart = getPreBookStart(season);

  if (!shipStart || !shipEnd || !preBookStart) return 'CLOSED';

  // Normalize to start of day for comparison
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  if (todayStart > shipEnd) return 'CLOSED';           // Past
  if (todayStart >= shipStart) return 'SHIPPING';      // Current shipping
  if (todayStart >= preBookStart) return 'PRE-BOOK';   // Taking orders
  return 'PLANNING';                                    // Future planning stage
}

/**
 * Get full season info including status and dates
 */
export function getSeasonInfo(season: string, today: Date = new Date()): SeasonInfo | null {
  const parsed = parseSeasonCode(season);
  if (!parsed) return null;

  const shipStart = getSeasonShipStart(season);
  const shipEnd = getSeasonShipEnd(season);
  const preBookStart = getPreBookStart(season);

  if (!shipStart || !shipEnd || !preBookStart) return null;

  const typeLabel = parsed.type === 'SP' ? 'Spring' : 'Fall';

  return {
    code: season,
    status: getSeasonStatus(season, today),
    shipStart,
    shipEnd,
    preBookStart,
    label: `${typeLabel} ${parsed.year}`,
    shortLabel: season
  };
}

/**
 * Get the status badge display for a season
 */
export function getSeasonStatusBadge(status: SeasonStatus): { icon: string; label: string; color: string } {
  switch (status) {
    case 'CLOSED':
      return { icon: '📁', label: 'Closed', color: 'bg-gray-100 text-gray-600' };
    case 'SHIPPING':
      return { icon: '📦', label: 'Shipping', color: 'bg-emerald-100 text-emerald-700' };
    case 'PRE-BOOK':
      return { icon: '📋', label: 'Pre-Book', color: 'bg-blue-100 text-blue-700' };
    case 'PLANNING':
      return { icon: '🔮', label: 'Planning', color: 'bg-purple-100 text-purple-700' };
  }
}

/**
 * Get cost label based on season status
 */
export function getCostLabel(status: SeasonStatus): string {
  if (status === 'CLOSED' || status === 'SHIPPING') {
    return 'Actual Cost';
  }
  return 'Projected Cost';
}

/**
 * Format a date range for display
 */
export function formatDateRange(start: Date, end: Date): string {
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const startStr = start.toLocaleDateString('en-US', options);
  const endStr = end.toLocaleDateString('en-US', { ...options, year: 'numeric' });
  return `${startStr} - ${endStr}`;
}

/**
 * Get all seasons in a range with their statuses
 */
export function getSeasonsWithStatus(seasons: string[], today: Date = new Date()): SeasonInfo[] {
  return seasons
    .map(s => getSeasonInfo(s, today))
    .filter((info): info is SeasonInfo => info !== null);
}
