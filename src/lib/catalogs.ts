import { Product } from '@/types/product';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Catalog {
  id: string;
  label: string;
  shortLabel: string; // For badges (3-4 chars)
  color: string; // Tailwind color name like 'red', 'blue', etc.
  isBuiltIn: boolean;
  /** Workbook values from line list that map to this catalog (case-insensitive match) */
  workbookKeys?: string[];
}

export interface CatalogOverrides {
  [key: string]: 'add' | 'remove'; // key = `${catalogId}:${styleNumber}`
}

// ---------------------------------------------------------------------------
// Built-in catalogs — derived from the "Workbook" column in line list files
//
// Workbook values found in data:
//   WHOLESALE, WHOLESALE?, WHOLESALE - NO REI, WHOLESALE - NO WKBK
//   WEB, REI, SCHEELS
//   REI / WEB, SCHEELS / WEB, REI / SCHEELS, REI / SCHEELS / WEB
//   CORPORATE, SAMPLE - NO WKBK, CXL
// ---------------------------------------------------------------------------

export const BUILT_IN_CATALOGS: Catalog[] = [
  {
    id: 'wholesale',
    label: 'Wholesale',
    shortLabel: 'WHS',
    color: 'green',
    isBuiltIn: true,
    workbookKeys: ['WHOLESALE', 'WHOLESALE?', 'WHOLESALE - NO REI', 'WHOLESALE - NO WKBK'],
  },
  {
    id: 'rei',
    label: 'REI',
    shortLabel: 'REI',
    color: 'red',
    isBuiltIn: true,
    workbookKeys: ['REI'],
  },
  {
    id: 'direct',
    label: 'Direct',
    shortLabel: 'DIR',
    color: 'purple',
    isBuiltIn: true,
    workbookKeys: ['WEB'],
  },
  {
    id: 'scheels',
    label: 'Scheels',
    shortLabel: 'SCH',
    color: 'amber',
    isBuiltIn: true,
    workbookKeys: ['SCHEELS'],
  },
];

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

const CUSTOM_CATALOGS_KEY = 'kuhl-catalogs-custom';
const CATALOG_OVERRIDES_KEY = 'kuhl-catalog-overrides';

export function getCustomCatalogs(): Catalog[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CUSTOM_CATALOGS_KEY);
    return raw ? (JSON.parse(raw) as Catalog[]) : [];
  } catch {
    return [];
  }
}

export function saveCustomCatalogs(catalogs: Catalog[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CUSTOM_CATALOGS_KEY, JSON.stringify(catalogs));
}

export function getCatalogOverrides(): CatalogOverrides {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(CATALOG_OVERRIDES_KEY);
    return raw ? (JSON.parse(raw) as CatalogOverrides) : {};
  } catch {
    return {};
  }
}

export function saveCatalogOverrides(overrides: CatalogOverrides): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CATALOG_OVERRIDES_KEY, JSON.stringify(overrides));
}

export function getAllCatalogs(): Catalog[] {
  return [...BUILT_IN_CATALOGS, ...getCustomCatalogs()];
}

// ---------------------------------------------------------------------------
// Parse workbook value into individual catalog tokens
// ---------------------------------------------------------------------------

/**
 * Parse a workbook string like "REI / SCHEELS / WEB" into individual tokens.
 * Also handles compound values with " - " qualifier like "WHOLESALE - NO REI".
 */
function parseWorkbookTokens(workbook: string): string[] {
  if (!workbook) return [];
  const upper = workbook.toUpperCase().trim();
  if (upper === 'CXL') return []; // Cancelled — not in any catalog

  // Split on " / " for multi-catalog assignments
  const tokens = upper.split(/\s*\/\s*/).map(t => t.trim()).filter(Boolean);
  return tokens;
}

// ---------------------------------------------------------------------------
// Membership computation — now based on Workbook column from line list
// ---------------------------------------------------------------------------

/**
 * Determine which catalogs a style belongs to based on its workbook value
 * from the line list, plus any manual overrides.
 */
export function computeStyleCatalogMembership(
  styleNumber: string,
  workbookValue: string,
  catalogs: Catalog[],
  overrides: CatalogOverrides,
): Set<string> {
  const result = new Set<string>();
  const tokens = parseWorkbookTokens(workbookValue);

  for (const catalog of catalogs) {
    const overrideKey = `${catalog.id}:${styleNumber}`;
    const override = overrides[overrideKey];

    if (override === 'add') {
      result.add(catalog.id);
      continue;
    }
    if (override === 'remove') {
      continue;
    }

    // Check if any workbook token matches this catalog's keys
    if (catalog.workbookKeys) {
      const matched = tokens.some(token =>
        catalog.workbookKeys!.some(key => {
          const keyUpper = key.toUpperCase();
          // Exact match for simple tokens (e.g., "WEB" matches catalog with key "WEB")
          if (token === keyUpper) return true;
          // Also match the full workbook value for compound entries like "WHOLESALE - NO REI"
          if (workbookValue.toUpperCase().trim() === keyUpper) return true;
          return false;
        }),
      );
      if (matched) {
        result.add(catalog.id);
      }
    }
  }

  // Special handling: "WHOLESALE - NO REI" should be in wholesale but NOT rei
  const upperWb = workbookValue.toUpperCase().trim();
  if (upperWb === 'WHOLESALE - NO REI') {
    result.delete('rei');
    result.add('wholesale');
  }
  // "SCHEELS - NO WKBK" = Scheels but not in workbook
  if (upperWb === 'SCHEELS - NO WKBK') {
    result.add('scheels');
  }

  return result;
}

/**
 * Build a map from styleNumber -> Set of catalogIds for all products.
 * Uses the workbook field from the Product data (sourced from line list Excel).
 */
export function buildCatalogMembershipMap(
  products: Product[],
  catalogs: Catalog[],
  overrides: CatalogOverrides,
  season: string,
): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();

  // Filter products by season and get best workbook value per style
  // (a style may have multiple color rows — all should share the same workbook)
  const workbookByStyle = new Map<string, string>();
  for (const product of products) {
    if (season && product.season !== season) continue;
    if (product.workbook && !workbookByStyle.has(product.styleNumber)) {
      workbookByStyle.set(product.styleNumber, product.workbook);
    }
  }

  for (const [styleNumber, workbook] of workbookByStyle) {
    result.set(
      styleNumber,
      computeStyleCatalogMembership(styleNumber, workbook, catalogs, overrides),
    );
  }

  return result;
}
