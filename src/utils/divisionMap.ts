/**
 * Sales divisionDesc uses numeric codes ('01', '02', '08') while products/filters
 * use display names ("Men's", "Women's", "Unisex"). This utility handles matching
 * across both formats.
 */

const DIVISION_MAP: Record<string, string[]> = {
  "Men's":   ['01', "Men's", 'Mens', 'Men', "Men’s"],
  "Women's": ['02', "Women's", 'Womens', 'Women', "Women’s"],
  'Accessories': ['06', 'Accessories', 'Acc'],
  'Unisex':  ['08', 'Unisex'],
};

/** Convert a raw division code (01, 02, 06, 08) to its display name */
export function normalizeDivisionDesc(raw: string): string {
  if (!raw) return '';
  for (const [displayName, aliases] of Object.entries(DIVISION_MAP)) {
    if (aliases.includes(raw)) return displayName;
  }
  return raw; // return as-is if no mapping found
}

/** Single-token division match (handles code/display-name aliases). */
function matchesSingleDivision(divisionDesc: string, token: string): boolean {
  if (!token) return true;
  if (divisionDesc === token) return true;
  const aliases = DIVISION_MAP[token];
  if (aliases && aliases.includes(divisionDesc)) return true;
  // Reverse: if token is a code, check if divisionDesc matches any display name
  for (const [, codes] of Object.entries(DIVISION_MAP)) {
    if (codes.includes(token) && codes.includes(divisionDesc)) return true;
  }
  return false;
}

/**
 * Multi-select-aware division match. `selectedDivision` may be empty
 * (match all) or a pipe-delimited list of divisions (e.g. "Men's|Women's").
 */
export function matchesDivision(
  divisionDesc: string,
  selectedDivision: string | null | undefined,
): boolean {
  if (!selectedDivision) return true;
  const tokens = selectedDivision.split('|').filter(Boolean);
  if (tokens.length === 0) return true;
  return tokens.some((tok) => matchesSingleDivision(divisionDesc, tok));
}
