/**
 * File type detection utilities for smart import
 */

export type FileType = 'lineList' | 'costs' | 'sales' | 'pricing' | 'unknown';

export interface DetectionResult {
  type: FileType;
  confidence: 'high' | 'medium' | 'low';
  matchedColumns: string[];
  allColumns: string[];
}

// Column signatures for each file type
const LINE_LIST_COLUMNS = [
  'Style #', 'Style', 'Style Number', 'Style#',
  'Style Name', 'Description', 'Style Desc',
  'MSRP', 'US MSRP', 'Retail',
  'Wholesale', 'US WHSL', 'WHSL', 'Price',
  'Category', 'Cat Desc',
  'Division', 'Division Desc',
];

const COSTS_COLUMNS = [
  'FOB', 'Factory Cost',
  'Landed', 'Landed Cost', 'LDP',
  'Duty', 'Duty %', 'Duty Cost', 'Duty Cost $',
  'Freight', 'Freight Cost',
  'Tariff', 'Tariff Cost', 'Tariff Cost $', 'Tariff  Cost $',
  'Overhead', 'Overhead Cost',
  'Suggested MSRP', 'Suggested Selling Price',
  // Cost History sheet columns
  'Total Cost', 'Std Cost', 'GP %',
  'Fab $', 'Trm $', 'Process $',
  'Cost_Sheet',
];

const SALES_COLUMNS = [
  'Revenue', 'Net Sales', 'Sales', '$ Current Booked Net',
  'Units', 'Qty', 'Quantity', 'Units Current Booked',
  'Customer', 'Customer Name',
  'Ship Date', 'Date',
  'Customer Type',
];

const PRICING_COLUMNS = [
  'Price', 'Wholesale', 'WHSL',
  'MSRP', 'Retail',
  'Season', 'Sea Desc',
  'Style', 'Style #',
  'Color', 'Clr',
];

/**
 * Detect file type based on column headers
 */
export function detectFileType(headers: string[]): DetectionResult {
  const normalizedHeaders = headers.map(h => h.trim());

  const lineListMatches = countMatches(normalizedHeaders, LINE_LIST_COLUMNS);
  const costsMatches = countMatches(normalizedHeaders, COSTS_COLUMNS);
  const salesMatches = countMatches(normalizedHeaders, SALES_COLUMNS);
  const pricingMatches = countMatches(normalizedHeaders, PRICING_COLUMNS);

  // Get matched column names for display
  const getMatchedColumns = (signature: string[]) =>
    normalizedHeaders.filter(h =>
      signature.some(s => h.toLowerCase() === s.toLowerCase())
    );

  // Check for pricing-specific and line-list-specific columns to disambiguate
  const headerLower = normalizedHeaders.map(h => h.toLowerCase());
  const hasPricingSpecific = headerLower.some(h =>
    h === 'sea desc' || h === 'season desc' || h === 'clr_desc'
  );
  const hasLineListSpecific = headerLower.some(h =>
    h === 'category' || h === 'cat desc' || h === 'division' || h === 'division desc'
  );

  // Determine type based on match counts and thresholds
  // Sales detection is most specific (3+ matches required)
  if (salesMatches >= 3) {
    return {
      type: 'sales',
      confidence: salesMatches >= 5 ? 'high' : salesMatches >= 4 ? 'medium' : 'low',
      matchedColumns: getMatchedColumns(SALES_COLUMNS),
      allColumns: normalizedHeaders,
    };
  }

  // Costs detection (2+ matches required)
  if (costsMatches >= 2) {
    return {
      type: 'costs',
      confidence: costsMatches >= 4 ? 'high' : costsMatches >= 3 ? 'medium' : 'low',
      matchedColumns: getMatchedColumns(COSTS_COLUMNS),
      allColumns: normalizedHeaders,
    };
  }

  // Pricing detection - check BEFORE line list if it has pricing-specific columns
  // Pricing files have Sea Desc/Season columns with Color variations, but no Category/Division
  if (pricingMatches >= 3 && hasPricingSpecific && !hasLineListSpecific) {
    return {
      type: 'pricing',
      confidence: pricingMatches >= 5 ? 'high' : pricingMatches >= 4 ? 'medium' : 'low',
      matchedColumns: getMatchedColumns(PRICING_COLUMNS),
      allColumns: normalizedHeaders,
    };
  }

  // Line list detection (3+ matches required)
  if (lineListMatches >= 3) {
    return {
      type: 'lineList',
      confidence: lineListMatches >= 6 ? 'high' : lineListMatches >= 4 ? 'medium' : 'low',
      matchedColumns: getMatchedColumns(LINE_LIST_COLUMNS),
      allColumns: normalizedHeaders,
    };
  }

  // Pricing detection fallback (2+ matches, if nothing else matched)
  if (pricingMatches >= 2) {
    return {
      type: 'pricing',
      confidence: pricingMatches >= 4 ? 'high' : pricingMatches >= 3 ? 'medium' : 'low',
      matchedColumns: getMatchedColumns(PRICING_COLUMNS),
      allColumns: normalizedHeaders,
    };
  }

  return {
    type: 'unknown',
    confidence: 'low',
    matchedColumns: [],
    allColumns: normalizedHeaders,
  };
}

function countMatches(headers: string[], signature: string[]): number {
  let count = 0;
  const headerLower = headers.map(h => h.toLowerCase());

  for (const sigCol of signature) {
    if (headerLower.includes(sigCol.toLowerCase())) {
      count++;
    }
  }

  return count;
}

/**
 * Extract season code from filename
 * Returns normalized season code (e.g., "27SP", "26FA") or null if not found
 */
export function extractSeasonFromFilename(filename: string): string | null {
  if (!filename) return null;

  const name = filename.toUpperCase();

  // Pattern: "SPRING 2027" or "FALL 2026"
  let match = name.match(/\b(SPRING|FALL)\s*(\d{4})\b/);
  if (match) {
    const season = match[1] === 'SPRING' ? 'SP' : 'FA';
    const year = match[2].slice(-2);
    return `${year}${season}`;
  }

  // Pattern: "SPRING 27" or "FALL 26"
  match = name.match(/\b(SPRING|FALL)\s*(\d{2})\b/);
  if (match) {
    const season = match[1] === 'SPRING' ? 'SP' : 'FA';
    return `${match[2]}${season}`;
  }

  // Pattern: "SP27" or "FA26"
  match = name.match(/\b(SP|FA)(\d{2})\b/);
  if (match) {
    return `${match[2]}${match[1]}`;
  }

  // Pattern: "27SP" or "26FA" (already correct format)
  match = name.match(/\b(\d{2})(SP|FA)\b/);
  if (match) {
    return `${match[1]}${match[2]}`;
  }

  // Pattern: "S27" or "F26"
  match = name.match(/\b([SF])(\d{2})\b/);
  if (match) {
    const season = match[1] === 'S' ? 'SP' : 'FA';
    return `${match[2]}${season}`;
  }

  return null;
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
