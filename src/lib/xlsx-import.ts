import * as XLSX from 'xlsx';

// Types for imported data
export interface LineListItem {
  id: string;
  styleNumber: string;
  styleName: string;
  colorCode: string;
  colorDescription: string;
  styleColor: string;
  season: string;
  status: string;
  factory: string;
  usMsrp: number;
  usWholesale: number;
  fob: number;
  landed: number;
  margin: number;
  category: string;
  label: string;
  division: string;
  productLine: string;
  designer: string;
  developer: string;
  topSeller: boolean;
  kore: boolean;
  smu: boolean;
  map: boolean;
  deliveryDate: string;
  usAvailable: boolean;
  cadAvailable: boolean;
  ukAvailable: boolean;
  cadMsrp: number;
  cadWholesale: number;
  countryOfOrigin: string;
  carryOver: boolean;
  fit: string;
  sizes: string;
  shortDescription: string;
  longDescription: string;
  costSource: 'line_list' | 'landed_sheet';
}

export interface LandedCostItem {
  styleNumber: string;
  styleName: string;
  season: string;
  factory: string;
  countryOfOrigin: string;
  fob: number;
  landed: number;
  dutyCost: number;
  tariffCost: number;
  freightCost: number;
  overheadCost: number;
  suggestedWholesale: number;
  suggestedMsrp: number;
  margin: number;
  designTeam: string;
  developer: string;
  dateRequested: number; // Excel serial date - higher = more recent
}

export interface ImportedSalesItem {
  styleNumber: string;
  styleDesc: string;
  colorCode: string;
  colorDesc: string;
  season: string;
  customer: string;
  customerType: string;
  unitsBooked: number;
  unitsOpen: number;
  revenue: number;
  shipped: number;
  divisionDesc: string;
  categoryDesc: string;
  gender: string;
  wholesalePrice: number;
  msrp: number;
  netUnitPrice: number;
  cost: number;
  salesRep: string;
  orderType: string;
}

export interface SeasonImportResult {
  products: LineListItem[];
  costs: LandedCostItem[];
  sales: ImportedSalesItem[];
  stats: {
    lineListCount: number;
    landedCostMatches: number;
    salesCount: number;
  };
}

function parseString(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

function parseNumber(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return val;
  const num = parseFloat(String(val).replace(/[$,]/g, ''));
  return isNaN(num) ? 0 : num;
}

function parseBoolean(val: unknown): boolean {
  if (!val) return false;
  const str = String(val).toLowerCase().trim();
  return str === 'y' || str === 'yes' || str === 'true' || str === '1';
}

function normalizeSeasonCode(raw: string): string {
  if (!raw) return '';

  let s = raw.toUpperCase().trim();

  // Remove suffixes
  s = s.replace(/[\s-]*(BULK|PROTO|SMS|PRODUCTION)/gi, '').trim();

  // Handle compound seasons - take first
  if (s.includes('/')) {
    s = s.split('/')[0].trim();
  }

  // Clean non-alphanumeric
  s = s.replace(/[^A-Z0-9]/g, '');

  // Pattern: SPRING 27 or FALL 26
  if (s.includes('SPRING')) {
    const match = s.match(/SPRING\s*(\d{2})/);
    if (match) return `${match[1]}SP`;
  }
  if (s.includes('FALL')) {
    const match = s.match(/FALL\s*(\d{2})/);
    if (match) return `${match[1]}FA`;
  }

  // Pattern: FA## or SP## -> ##FA or ##SP
  let match = s.match(/^(FA|SP)(\d{2})$/);
  if (match) return `${match[2]}${match[1]}`;

  // Pattern: F## or S## -> ##FA or ##SP
  match = s.match(/^(F|S)(\d{2})$/);
  if (match) return `${match[2]}${match[1] === 'F' ? 'FA' : 'SP'}`;

  // Pattern: ##FA or ##SP (already correct)
  match = s.match(/^(\d{2})(FA|SP)$/);
  if (match) return `${match[1]}${match[2]}`;

  // Pattern: ##F or ##S
  match = s.match(/^(\d{2})(F|S)$/);
  if (match) return `${match[1]}${match[2] === 'F' ? 'FA' : 'SP'}`;

  return s;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function parseLineListXLSX(buffer: ArrayBuffer): LineListItem[] {
  const workbook = XLSX.read(buffer, { type: 'array' });

  // Use 'Line List' sheet or first sheet
  const sheetName = workbook.SheetNames.includes('Line List')
    ? 'Line List'
    : workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, unknown>[];

  return rows
    .filter(row => {
      const styleNumber = parseString(row['Style #'] || row['Style'] || row['Style#']);
      return styleNumber && styleNumber.length > 0;
    })
    .map((row) => {
      // Read season from file - check both "Season" and "Seas" column names
      const rawSeason = parseString(row['Season'] || row['Seas']);
      const season = normalizeSeasonCode(rawSeason);
      const status = parseString(row['Status']);

      return {
        id: generateId(),
        styleNumber: parseString(row['Style #'] || row['Style'] || row['Style#']),
        styleName: parseString(row['Style Name'] || row['Style Desc']),
        colorCode: parseString(row['Color Code'] || row['Clr']),
        colorDescription: parseString(row['Color Description'] || row['Clr Desc']),
        styleColor: parseString(row['Style/Color']),
        season,
        status,
        factory: parseString(row['Factory']),
        usMsrp: parseNumber(row['US MSRP'] || row['MSRP']),
        usWholesale: parseNumber(row['US WHSL'] || row['Wholesale'] || row['Price']),
        fob: parseNumber(row['FOB']),
        landed: parseNumber(row['US Landed'] || row['Landed']),
        margin: parseNumber(row['US Margin %'] || row['Margin']) * 100, // Convert to percentage
        category: parseString(row['Category'] || row['Cat Desc']),
        label: parseString(row['Label'] || row['Label Desc']),
        division: parseString(row['Division'] || row['Division Desc']),
        productLine: parseString(row['Product Line']),
        designer: parseString(row['Designer']),
        developer: parseString(row['Developer']),
        topSeller: parseBoolean(row['Top Seller']),
        kore: parseBoolean(row['KORE']),
        smu: parseBoolean(row['SMU']),
        map: parseBoolean(row['MAP?']),
        deliveryDate: parseString(row['Delivery Date']),
        usAvailable: parseBoolean(row['US (Y/N)']),
        cadAvailable: parseBoolean(row['Canada (Y/N)']),
        ukAvailable: parseBoolean(row['UK (Y/N)']),
        cadMsrp: parseNumber(row['CAD MSRP']),
        cadWholesale: parseNumber(row['CAD WHSL']),
        countryOfOrigin: parseString(row['COO Description'] || row['COO']),
        carryOver: status === 'C/O',
        fit: parseString(row['Fit']),
        sizes: parseString(row['Sizes']),
        shortDescription: parseString(row['Short Description']),
        longDescription: parseString(row['Long Description']),
        costSource: 'line_list',
      };
    });
}

export function parseLandedSheetXLSX(buffer: ArrayBuffer): LandedCostItem[] {
  const workbook = XLSX.read(buffer, { type: 'array' });

  // Use 'LDP Requests' sheet or first sheet
  const sheetName = workbook.SheetNames.includes('LDP Requests')
    ? 'LDP Requests'
    : workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // Start from row 11 (0-indexed row 10) where data begins
  const rows = XLSX.utils.sheet_to_json(sheet, { range: 10, defval: '' }) as Record<string, unknown>[];

  const allCosts = rows
    .filter(row => {
      const styleNumber = parseString(row['Style #'] || row['Style']);
      return styleNumber && styleNumber.length > 0;
    })
    .map((row) => {
      const rawSeason = parseString(row['Season']);
      const season = normalizeSeasonCode(rawSeason);

      return {
        styleNumber: parseString(row['Style #'] || row['Style']),
        styleName: parseString(row['Style Name'] || row['Description']),
        season,
        factory: parseString(row['Factory']),
        countryOfOrigin: parseString(row['COO'] || row['Country']),
        fob: parseNumber(row['FOB']),
        landed: parseNumber(row['Landed'] || row['LDP']),
        dutyCost: parseNumber(row['Duty Cost $'] || row['Duty']),
        tariffCost: parseNumber(row['Tariff  Cost $'] || row['Tariff Cost $']),
        freightCost: parseNumber(row['Freight Cost'] || row['Freight']),
        overheadCost: parseNumber(row['Overhead Cost'] || row['Overhead']),
        suggestedWholesale: parseNumber(row['Suggested Selling Price'] || row['Wholesale']),
        suggestedMsrp: parseNumber(row['Suggested MSRP'] || row['MSRP']),
        margin: parseNumber(row['Margin']),
        designTeam: parseString(row['Design Team']),
        developer: parseString(row['Developer/ Designer'] || row['Developer']),
        dateRequested: parseNumber(row['Date Requested']), // Excel serial date
      };
    });

  // Deduplicate by style+season, keeping the most recent (highest dateRequested)
  const costMap = new Map<string, LandedCostItem>();
  for (const cost of allCosts) {
    const key = `${cost.styleNumber}-${cost.season}`;
    const existing = costMap.get(key);

    // Keep if no existing entry, or if this one is more recent
    if (!existing || cost.dateRequested > existing.dateRequested) {
      costMap.set(key, cost);
    }
  }

  const deduped = Array.from(costMap.values());
  console.log(`Landed costs: ${allCosts.length} total rows -> ${deduped.length} unique style+season (kept most recent)`);

  return deduped;
}

export interface ImportedPricingItem {
  styleNumber: string;
  styleDesc: string;
  colorCode: string;
  colorDesc: string;
  season: string;
  seasonDesc: string;
  price: number;
  msrp: number;
  cost: number;
}

export function parsePricingXLSX(buffer: ArrayBuffer): ImportedPricingItem[] {
  const workbook = XLSX.read(buffer, { type: 'array' });

  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, unknown>[];

  console.log('Pricing rows:', rows.length);
  if (rows.length > 0) {
    console.log('Pricing columns:', Object.keys(rows[0]));
  }

  return rows
    .filter(row => {
      const styleNumber = parseString(row['Style'] || row['Style #'] || row['Style#']);
      return styleNumber && styleNumber.length > 0;
    })
    .map((row) => {
      const rawSeason = parseString(row['Season']);
      const season = normalizeSeasonCode(rawSeason);

      return {
        styleNumber: parseString(row['Style'] || row['Style #'] || row['Style#']),
        styleDesc: parseString(row['Description'] || row['Style Desc'] || row['Style Description']),
        colorCode: parseString(row['Clr'] || row['Color'] || row['Color Code']),
        colorDesc: parseString(row['Clr_Desc'] || row['Clr Desc'] || row['Color Desc']),
        season,
        seasonDesc: parseString(row['Sea Desc'] || row['Season Desc']),
        price: parseNumber(row['Price'] || row['Wholesale'] || row['WHSL']),
        msrp: parseNumber(row['MSRP'] || row['Retail']),
        cost: parseNumber(row['Cost']),
      };
    });
}

// Helper to find a column value with flexible matching
function getColumn(row: Record<string, unknown>, ...names: string[]): unknown {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== '') return row[name];
    // Also try trimmed version
    const trimmed = name.trim();
    if (row[trimmed] !== undefined && row[trimmed] !== '') return row[trimmed];
  }
  return '';
}

export function parseSalesXLSX(buffer: ArrayBuffer): ImportedSalesItem[] {
  const workbook = XLSX.read(buffer, { type: 'array' });

  // Use Sheet1 which has the raw data
  const sheetName = workbook.SheetNames.includes('Sheet1')
    ? 'Sheet1'
    : workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, unknown>[];

  // Log column headers for debugging
  if (rows.length > 0) {
    const cols = Object.keys(rows[0]);
    console.log('Sales file columns:', cols);
    console.log('Total columns:', cols.length);
  }

  const results = rows
    .filter(row => {
      const styleNumber = parseString(getColumn(row, 'Style', 'Style #', 'Style#'));
      return styleNumber && styleNumber.length > 0;
    })
    .map((row) => {
      const rawSeason = parseString(getColumn(row, 'Season', 'Seas'));
      const season = normalizeSeasonCode(rawSeason);

      return {
        styleNumber: parseString(getColumn(row, 'Style', 'Style #', 'Style#')),
        styleDesc: parseString(getColumn(row, 'Style Description', 'Style Desc', 'Description')),
        colorCode: parseString(getColumn(row, 'Color', 'Color Code', 'Clr')),
        colorDesc: parseString(getColumn(row, 'Color Desc. From Clr Mst', 'Color Desc', 'Clr Desc')),
        season,
        customer: parseString(getColumn(row, 'Customer Name', 'Customer', 'Cust Name', 'Cust', 'Account Name', 'Account', 'Ship To', 'Ship To Name', 'Sold To', 'Sold To Name', 'Bill To', 'Bill To Name', 'Company', 'Company Name', 'Retailer', 'Client')),
        customerType: parseString(getColumn(row, 'Customer Type', 'Cust Type', 'Type')),
        unitsBooked: parseNumber(getColumn(row, 'Units Current Booked', 'Units Booked', 'Qty', 'Units')),
        unitsOpen: parseNumber(getColumn(row, 'Units Open', 'Open Units')),
        revenue: parseNumber(getColumn(row, '$ Current Booked Net', 'Revenue', 'Booked Net', 'Net Revenue')),
        shipped: parseNumber(getColumn(row, '$ Shipped Net', 'Shipped', 'Shipped Net')),
        divisionDesc: parseString(getColumn(row, 'Division', 'Div', 'Division Desc')),
        categoryDesc: parseString(getColumn(row, 'Category Description', 'Category', 'Cat Desc', 'Category Desc')),
        gender: parseString(getColumn(row, 'Gender Descripton', 'Gender Description', 'Gender', 'Gender Desc')),
        wholesalePrice: parseNumber(getColumn(row, 'Wholesale Price', 'Wholesale', 'WHSL', 'Price')),
        msrp: parseNumber(getColumn(row, 'MSRP (Style)', 'MSRP (Order)', 'MSRP', 'Retail')),
        netUnitPrice: parseNumber(getColumn(row, 'Net Unit Price', 'Net Price', 'Unit Price')),
        cost: parseNumber(getColumn(row, 'Cost', 'Unit Cost', 'COGS')),
        salesRep: parseString(getColumn(row, 'Sales Rep 1', 'Sales Rep', 'Rep', 'Salesperson')),
        orderType: parseString(getColumn(row, 'Order Type', 'Type')),
      };
    });

  console.log(`Parsed ${results.length} sales records`);
  if (results.length > 0) {
    const sample = results[0];
    console.log('Sample record:', {
      style: sample.styleNumber,
      customer: sample.customer,
      customerType: sample.customerType,
      revenue: sample.revenue,
      units: sample.unitsBooked,
    });
  }

  return results;
}

export function mergeSeasonData(
  lineListData: LineListItem[],
  landedData: LandedCostItem[],
  targetSeason: string
): SeasonImportResult {
  // Filter landed data to target season
  const seasonLandedData = landedData.filter(c => c.season === targetSeason);

  // Create a map for fast lookup by style number
  const landedByStyle = new Map<string, LandedCostItem>();
  for (const cost of seasonLandedData) {
    // If multiple entries for same style, use the one with lower landed cost (more competitive)
    const existing = landedByStyle.get(cost.styleNumber);
    if (!existing || cost.landed < existing.landed) {
      landedByStyle.set(cost.styleNumber, cost);
    }
  }

  let landedCostMatches = 0;

  // Merge landed costs into line list products
  const mergedProducts = lineListData.map(product => {
    const landedCost = landedByStyle.get(product.styleNumber);

    if (landedCost && landedCost.landed > 0) {
      landedCostMatches++;

      // Override costs from landed sheet
      const newFob = landedCost.fob;
      const newLanded = landedCost.landed;

      // Recalculate margin with new landed cost
      const newMargin = product.usWholesale > 0
        ? ((product.usWholesale - newLanded) / product.usWholesale) * 100
        : 0;

      return {
        ...product,
        fob: newFob,
        landed: newLanded,
        margin: newMargin,
        factory: landedCost.factory || product.factory,
        countryOfOrigin: landedCost.countryOfOrigin || product.countryOfOrigin,
        costSource: 'landed_sheet' as const,
      };
    }

    // Keep original if no landed cost match, but recalculate margin
    const margin = product.usWholesale > 0 && product.landed > 0
      ? ((product.usWholesale - product.landed) / product.usWholesale) * 100
      : product.margin;

    return {
      ...product,
      margin,
    };
  });

  return {
    products: mergedProducts,
    costs: seasonLandedData,
    sales: [],
    stats: {
      lineListCount: lineListData.length,
      landedCostMatches,
      salesCount: 0,
    },
  };
}

// Convert merged data to the Product and CostRecord formats used by the app
// If targetSeason is provided, it's used as a fallback; otherwise use the product's own season
export function convertToAppFormats(
  mergedData: SeasonImportResult,
  targetSeason?: string
): {
  products: Record<string, unknown>[];
  costs: Record<string, unknown>[];
} {
  const products = mergedData.products.map((p, index) => {
    // Use the product's season from the file, fall back to targetSeason if not set
    const season = p.season || targetSeason || '';
    return {
      id: `prod-${season}-${index}`,
      styleNumber: p.styleNumber,
      styleDesc: p.styleName,
      color: p.colorCode,
      colorDesc: p.colorDescription,
      styleColor: p.styleColor || `${p.styleNumber}-${p.colorCode}`,
      season,
      seasonType: 'Main',
      rawSeason: season,
      divisionDesc: p.division,
      categoryDesc: p.category,
      category: p.category,
      productLine: p.productLine,
      labelDesc: p.label,
      price: p.usWholesale,
      msrp: p.usMsrp,
      cost: p.landed,
      currency: 'USD',
      cadPrice: p.cadWholesale,
      cadMsrp: p.cadMsrp,
      carryOver: p.carryOver,
      countryOfOrigin: p.countryOfOrigin,
      factoryName: p.factory,
      designerName: p.designer,
      techDesignerName: p.developer,
    };
  });

  const costs = mergedData.products.map((p, index) => {
    const season = p.season || targetSeason || '';
    return {
      id: `cost-${season}-${index}`,
      styleNumber: p.styleNumber,
      styleName: p.styleName,
      season,
      seasonType: 'Main',
      rawSeason: season,
      factory: p.factory,
      countryOfOrigin: p.countryOfOrigin,
      fob: p.fob,
      landed: p.landed,
      suggestedMsrp: p.usMsrp,
      suggestedWholesale: p.usWholesale,
      margin: p.margin,
      designTeam: p.division,
      developer: p.developer,
    };
  });

  return { products, costs };
}
