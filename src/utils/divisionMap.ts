/**
 * Sales divisionDesc uses numeric codes ('01', '02', '08') while products/filters
 * use display names ("Men's", "Women's", "Unisex"). This utility handles matching
 * across both formats.
 */

const DIVISION_MAP: Record<string, string[]> = {
  "Men's":   ['01', "Men's", 'Mens', 'Men', "Men\u2019s"],
  "Women's": ['02', "Women's", 'Womens', 'Women', "Women\u2019s"],
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

export function matchesDivision(divisionDesc: string, selectedDivision: string): boolean {
  if (!selectedDivision) return true;
  if (divisionDesc === selectedDivision) return true;
  const aliases = DIVISION_MAP[selectedDivision];
  if (aliases && aliases.includes(divisionDesc)) return true;
  // Reverse: if selectedDivision is a code, check if divisionDesc matches any display name
  for (const [, codes] of Object.entries(DIVISION_MAP)) {
    if (codes.includes(selectedDivision) && codes.includes(divisionDesc)) return true;
  }
  return false;
}
