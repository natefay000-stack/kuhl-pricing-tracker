/**
 * KÜHL Line List Color Key System
 *
 * Encodes the color-coding conventions used in the KÜHL line list Excel files
 * (Color Key tab) along with validation rules for product data integrity.
 *
 * Color keys vary by column — the same RGB value can mean different things
 * depending on which column it appears in.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Severity = 'info' | 'warning' | 'error';

export interface ColorMeaning {
  label: string;
  description: string;
  severity: Severity;
}

export interface CellColor {
  name: string;
  /** CSS hex value for light backgrounds */
  css: string;
  /** Lower-opacity variant for dark-mode backgrounds */
  darkCss: string;
}

export interface ValidationRule {
  id: string;
  name: string;
  description: string;
  severity: Severity;
  check: (product: LineListProduct) => ValidationResult;
}

export interface ValidationResult {
  passed: boolean;
  message?: string;
}

export interface ValidationIssue {
  ruleId: string;
  ruleName: string;
  severity: Severity;
  message: string;
}

/**
 * Minimal product shape expected by the validation rules.
 * Consumers should extend or map their own product type to this interface.
 */
export interface LineListProduct {
  styleNumber?: string;
  styleName?: string;
  colorCode?: string;
  colorDescription?: string;
  status?: string;
  usMsrp?: number | null;
  usWhsl?: number | null;
  fob?: number | null;
  usLanded?: number | null;
  factory?: string;
  market?: string;
  workbook?: string;
  /** True when the product/color row is cancelled */
  isCancelled?: boolean;
}

// ---------------------------------------------------------------------------
// Cell Colors — RGB hex to human-readable name and CSS values
// ---------------------------------------------------------------------------

export const CELL_COLORS: Record<string, CellColor> = {
  FFC7CE: { name: 'Pink',        css: '#FFC7CE', darkCss: 'rgba(255,199,206,0.2)' },
  FFFF00: { name: 'Yellow',      css: '#FFFF00', darkCss: 'rgba(255,255,0,0.15)' },
  E2F0D9: { name: 'Light Green', css: '#E2F0D9', darkCss: 'rgba(226,240,217,0.2)' },
  FFF2CC: { name: 'Light Yellow',css: '#FFF2CC', darkCss: 'rgba(255,242,204,0.2)' },
  FBE5D6: { name: 'Peach',       css: '#FBE5D6', darkCss: 'rgba(251,229,214,0.2)' },
  '5B9BD5':{ name: 'Blue',       css: '#5B9BD5', darkCss: 'rgba(91,155,213,0.2)' },
  '70AD47':{ name: 'Green',      css: '#70AD47', darkCss: 'rgba(112,173,71,0.2)' },
  BDD7EE: { name: 'Light Blue',  css: '#BDD7EE', darkCss: 'rgba(189,215,238,0.2)' },
  C6EFCE: { name: 'Mint Green',  css: '#C6EFCE', darkCss: 'rgba(198,239,206,0.2)' },
} as const;

// ---------------------------------------------------------------------------
// Color Key — column → rgb → meaning
// ---------------------------------------------------------------------------

/**
 * Complete mapping of line-list column names to their color-coded meanings.
 *
 * The special key `_default` applies to any column not explicitly listed.
 * Within each column, `_noColor` represents the meaning when no fill is applied.
 */
export const COLOR_KEY: Record<string, Record<string, ColorMeaning>> = {
  // -- Progress column -------------------------------------------------------
  Progress: {
    E2F0D9:  { label: 'Added to Elastic',  description: 'Style/color has been added to Elastic.',            severity: 'info' },
    _noColor:{ label: 'Not on Elastic',     description: 'Style/color has not yet been added to Elastic.',    severity: 'warning' },
  },

  // -- Style # ---------------------------------------------------------------
  'Style #': {
    FFC7CE: { label: 'Cancelled',  description: 'This style has been cancelled.',  severity: 'error' },
    FFFF00: { label: 'SMU',        description: 'Special Make-Up style.',          severity: 'info' },
    E2F0D9: { label: 'Web Only',   description: 'Available on web only.',          severity: 'info' },
    FFF2CC: { label: 'Corporate',  description: 'Corporate program style.',        severity: 'info' },
  },

  // -- Style Name ------------------------------------------------------------
  'Style Name': {
    FFC7CE: { label: 'Cancelled',  description: 'This style has been cancelled.',  severity: 'error' },
    FFFF00: { label: 'SMU',        description: 'Special Make-Up style.',          severity: 'info' },
    E2F0D9: { label: 'Web Only',   description: 'Available on web only.',          severity: 'info' },
    FFF2CC: { label: 'Corporate',  description: 'Corporate program style.',        severity: 'info' },
  },

  // -- Color Code ------------------------------------------------------------
  'Color Code': {
    FFC7CE: { label: 'Cancelled',       description: 'This color has been cancelled.',          severity: 'error' },
    FFFF00: { label: 'SMU',             description: 'Special Make-Up color.',                  severity: 'info' },
    E2F0D9: { label: 'Web Only',        description: 'Available on web only.',                  severity: 'info' },
    FFF2CC: { label: 'Corporate',       description: 'Corporate program color.',                severity: 'info' },
    FBE5D6: { label: 'TBD Color Code',  description: 'Color code is still to be determined.',   severity: 'warning' },
  },

  // -- Color Description -----------------------------------------------------
  'Color Description': {
    FBE5D6: { label: 'TBD Color Name', description: 'Color name is still to be determined.', severity: 'warning' },
  },

  // -- Status ----------------------------------------------------------------
  Status: {
    '70AD47': { label: 'NEW/UPDATED', description: 'Style is new or has been updated this season.',  severity: 'info' },
    _noColor: { label: 'C/O',         description: 'Carryover from previous season.',                severity: 'info' },
  },

  // -- US MSRP ---------------------------------------------------------------
  'US MSRP': {
    '5B9BD5': { label: 'Late Price Change',  description: 'Price was changed after initial release.', severity: 'warning' },
    FBE5D6:   { label: 'Tentative Price',    description: 'MSRP is not yet finalized.',               severity: 'warning' },
  },

  // -- Old Price -------------------------------------------------------------
  'Old Price': {
    FFF2CC:   { label: 'Price Increase', description: 'Price increased from previous season.',       severity: 'info' },
    FBE5D6:   { label: 'Price Decrease', description: 'Price decreased from previous season.',       severity: 'info' },
    _noColor: { label: 'No Price Change',description: 'No price change from previous season.',       severity: 'info' },
  },

  // -- US WHSL ---------------------------------------------------------------
  'US WHSL': {
    FFFF00: { label: 'WHSL not 50%', description: 'Wholesale is not 50% of MSRP. Scheels SMU.', severity: 'warning' },
  },

  // -- FOB -------------------------------------------------------------------
  FOB: {
    FBE5D6: { label: 'Tentative Price', description: 'FOB price is not yet finalized.', severity: 'warning' },
  },

  // -- US Landed -------------------------------------------------------------
  'US Landed': {
    FBE5D6: { label: 'Tentative Price',     description: 'Landed cost is not yet finalized.',                   severity: 'warning' },
    BDD7EE: { label: 'Confirmed by Prod',   description: 'Landed price has been confirmed by the Prod team.',   severity: 'info' },
  },

  // -- Sales Samples ---------------------------------------------------------
  'Sales Samples': {
    FBE5D6: { label: 'No Info / Incorrect', description: 'Sample information is missing or incorrect.',        severity: 'warning' },
    FFF2CC: { label: 'SMS PO Mismatch',     description: 'Does not match the SMS purchase order.',             severity: 'warning' },
  },

  // -- Sample Qty ------------------------------------------------------------
  'Sample Qty': {
    FBE5D6: { label: 'No Info / Incorrect', description: 'Sample quantity information is missing or incorrect.', severity: 'warning' },
    FFF2CC: { label: 'SMS PO Mismatch',     description: 'Does not match the SMS purchase order.',               severity: 'warning' },
  },

  // -- Market ----------------------------------------------------------------
  Market: {
    FFC7CE: { label: 'CXL',              description: 'Cancelled from this market.',          severity: 'error' },
    FFFF00: { label: 'SMU',              description: 'Special Make-Up for this market.',     severity: 'info' },
    C6EFCE: { label: 'DIRECT',           description: 'Direct-to-consumer channel.',          severity: 'info' },
    FFF2CC: { label: 'DIRECT',           description: 'Direct-to-consumer channel (alt).',    severity: 'info' },
  },

  // -- Workbook --------------------------------------------------------------
  Workbook: {
    FFC7CE: { label: 'CXL',        description: 'Cancelled in workbook.',              severity: 'error' },
    FFFF00: { label: 'SMU',        description: 'Special Make-Up in workbook.',        severity: 'info' },
    C6EFCE: { label: 'WEB',        description: 'Web-only in workbook.',               severity: 'info' },
    FFF2CC: { label: 'CORPORATE',  description: 'Corporate program in workbook.',      severity: 'info' },
  },

  // -- Sketch ----------------------------------------------------------------
  Sketch: {
    E2F0D9:   { label: 'Sketch Ran Normally', description: 'Sketch rendered at standard resolution.',       severity: 'info' },
    FBE5D6:   { label: 'No Sketch',           description: 'No sketch available for this style/color.',     severity: 'warning' },
    '5B9BD5': { label: 'Sketch 330 ppi',      description: 'Sketch was rendered at 330 ppi.',               severity: 'info' },
  },

  // -- Default (any column not listed above) ---------------------------------
  _default: {
    FBE5D6: { label: 'Unsure / Missing Info', description: 'Information in this cell may be missing or uncertain.', severity: 'warning' },
  },
};

// ---------------------------------------------------------------------------
// getCellColorMeaning — look up what a color means for a given column
// ---------------------------------------------------------------------------

/**
 * Returns the meaning of a cell's background color for a given column.
 *
 * Falls back to the `_default` column mapping when the specific column
 * has no entry for the given RGB value.
 *
 * @param column - The column header name (e.g. "US MSRP", "Status")
 * @param rgb    - The 6-character hex RGB value without '#' (e.g. "FFC7CE")
 * @returns The color meaning, or `undefined` if no mapping exists
 */
export function getCellColorMeaning(
  column: string,
  rgb: string,
): ColorMeaning | undefined {
  const normalizedRgb = rgb.replace(/^#/, '').toUpperCase();

  // Try the specific column first
  const columnMap = COLOR_KEY[column];
  if (columnMap?.[normalizedRgb]) {
    return columnMap[normalizedRgb];
  }

  // Fall back to _default
  const defaultMap = COLOR_KEY._default;
  return defaultMap?.[normalizedRgb];
}

// ---------------------------------------------------------------------------
// Validation Rules
// ---------------------------------------------------------------------------

/** Helper: returns true when the product row is effectively cancelled */
function isCancelled(product: LineListProduct): boolean {
  if (product.isCancelled) return true;
  const s = (product.status ?? '').toUpperCase().trim();
  return s === 'CXL' || s === 'CANCELLED';
}

export const VALIDATION_RULES: ValidationRule[] = [
  // 1. Missing US MSRP
  {
    id: 'missing-msrp',
    name: 'Missing US MSRP',
    description: 'Active products must have a US MSRP.',
    severity: 'error',
    check(product) {
      if (isCancelled(product)) return { passed: true };
      if (product.usMsrp == null || product.usMsrp === 0) {
        return { passed: false, message: 'US MSRP is missing.' };
      }
      return { passed: true };
    },
  },

  // 2. Missing US WHSL when MSRP exists
  {
    id: 'missing-whsl',
    name: 'Missing US WHSL',
    description: 'Active products with a MSRP must also have a US WHSL price.',
    severity: 'error',
    check(product) {
      if (isCancelled(product)) return { passed: true };
      if (product.usMsrp && (product.usWhsl == null || product.usWhsl === 0)) {
        return { passed: false, message: 'US WHSL is missing but US MSRP is set.' };
      }
      return { passed: true };
    },
  },

  // 3. Margin below 45%
  {
    id: 'low-margin',
    name: 'Margin Below 45%',
    description: 'Active products should maintain at least a 45% margin ((MSRP - Landed) / MSRP).',
    severity: 'warning',
    check(product) {
      if (isCancelled(product)) return { passed: true };
      if (product.usMsrp && product.usLanded) {
        const margin = (product.usMsrp - product.usLanded) / product.usMsrp;
        if (margin < 0.45) {
          return {
            passed: false,
            message: `Margin is ${(margin * 100).toFixed(1)}%, below the 45% threshold.`,
          };
        }
      }
      return { passed: true };
    },
  },

  // 4. WHSL not 50% of MSRP
  {
    id: 'whsl-not-50-pct',
    name: 'WHSL Not 50% of MSRP',
    description: 'Wholesale price should be exactly 50% of MSRP for standard products.',
    severity: 'warning',
    check(product) {
      if (isCancelled(product)) return { passed: true };
      if (product.usMsrp && product.usWhsl) {
        const expected = product.usMsrp * 0.5;
        // Allow a 1-cent tolerance for rounding
        if (Math.abs(product.usWhsl - expected) > 0.01) {
          return {
            passed: false,
            message: `US WHSL ($${product.usWhsl.toFixed(2)}) is not 50% of MSRP ($${product.usMsrp.toFixed(2)}). Expected $${expected.toFixed(2)}.`,
          };
        }
      }
      return { passed: true };
    },
  },

  // 5. Has FOB but missing US Landed
  {
    id: 'fob-no-landed',
    name: 'FOB Without US Landed',
    description: 'When FOB is present, US Landed cost should also be provided.',
    severity: 'warning',
    check(product) {
      if (isCancelled(product)) return { passed: true };
      if (product.fob && (product.usLanded == null || product.usLanded === 0)) {
        return { passed: false, message: 'FOB is set but US Landed cost is missing.' };
      }
      return { passed: true };
    },
  },

  // 6. TBD Color Code
  {
    id: 'tbd-color-code',
    name: 'TBD Color Code',
    description: 'Color code has not been finalized.',
    severity: 'warning',
    check(product) {
      if (product.colorCode && /tbd/i.test(product.colorCode)) {
        return { passed: false, message: `Color code "${product.colorCode}" is still TBD.` };
      }
      return { passed: true };
    },
  },

  // 7. Missing Factory
  {
    id: 'missing-factory',
    name: 'Missing Factory',
    description: 'Every product should have an assigned factory.',
    severity: 'warning',
    check(product) {
      if (!product.factory || product.factory.trim() === '') {
        return { passed: false, message: 'Factory is not assigned.' };
      }
      return { passed: true };
    },
  },

  // 8. Cancelled style still in active workbook
  {
    id: 'cancelled-in-active-workbook',
    name: 'Cancelled in Active Workbook',
    description: 'A cancelled style should not appear in an active (non-CXL) workbook.',
    severity: 'error',
    check(product) {
      if (!isCancelled(product)) return { passed: true };
      const wb = (product.workbook ?? '').toUpperCase().trim();
      // If there's a workbook value and it doesn't indicate cancellation, flag it
      if (wb && wb !== 'CXL' && wb !== 'CANCELLED') {
        return {
          passed: false,
          message: `Cancelled style is still listed in workbook "${product.workbook}".`,
        };
      }
      return { passed: true };
    },
  },
];

// ---------------------------------------------------------------------------
// validateProduct — run all rules against a product
// ---------------------------------------------------------------------------

/**
 * Runs every validation rule against the given product and returns an array
 * of issues. An empty array means the product passed all checks.
 */
export function validateProduct(product: LineListProduct): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const rule of VALIDATION_RULES) {
    const result = rule.check(product);
    if (!result.passed) {
      issues.push({
        ruleId: rule.id,
        ruleName: rule.name,
        severity: rule.severity,
        message: result.message ?? rule.description,
      });
    }
  }

  return issues;
}
