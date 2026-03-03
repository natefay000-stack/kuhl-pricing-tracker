// Shared helpers for the "Combine Styles" feature across all views
// Groups size variants (R = Regular/Big, X = Plus, T = Tall) of the same
// base style number into a single row.

// Helper to clean style number by stripping unwanted suffixes (TES, etc.)
export function cleanStyleNumber(styleNumber: string): string {
  return styleNumber.replace(/TES$/i, '');
}

// Helper to get base style number by stripping R, X, T suffixes (for combining)
// e.g. "1052R" → "1052", "2133X" → "2133", "1122T" → "1122"
export function getBaseStyleNumber(styleNumber: string): string {
  const cleaned = cleanStyleNumber(styleNumber);
  const match = cleaned.match(/^(.+?)[RXT]$/i);
  return match ? match[1] : cleaned;
}

// Check if style description indicates it's a variant (tall/plus)
export function isVariantDescription(styleDesc: string): boolean {
  if (!styleDesc) return false;
  const lower = styleDesc.toLowerCase();
  return lower.includes('tall') || lower.includes('plus');
}

// Get the combine key for a style — just the base style number
// This ONLY combines size variants (R/X/T suffixes of the same style).
// It does NOT combine across different style numbers, genders, or silhouettes.
export function getCombineKey(styleNumber: string): string {
  return getBaseStyleNumber(styleNumber);
}
