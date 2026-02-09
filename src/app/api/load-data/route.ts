import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

// Prevent static generation at build time — this route reads local files
export const dynamic = 'force-dynamic';

const DATA_DIR = path.join(process.cwd(), 'data');

// File names
const LINE_LIST_FILE = 'FC LL 1.23.2026.xlsx';
const SALES_FILE = '26FA sales data 1.23.2026.xlsx';
const PRICING_FILE = 'pricebyseason1.23.26.xlsx';
const COSTS_FILE = 'Landed Request Sheet.xlsx';

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

// Season type extraction from raw season strings
type SeasonType = 'Main' | 'Bulk' | 'Proto' | 'SMS' | 'Production' | 'Unknown';

interface NormalizedSeason {
  season: string;      // Normalized code like "26FA", "27SP"
  seasonType: SeasonType;
  rawSeason: string;   // Original value for debugging
}

function normalizeSeasonCode(raw: string): NormalizedSeason {
  if (!raw) {
    return { season: '', seasonType: 'Unknown', rawSeason: '' };
  }

  const original = raw;
  let s = raw.toUpperCase().trim();
  let seasonType: SeasonType = 'Main';

  // Extract season type from suffixes/keywords
  if (s.includes('BULK')) {
    seasonType = 'Bulk';
    s = s.replace(/[\s-]*BULK/gi, '').trim();
  } else if (s.includes('PROTO')) {
    seasonType = 'Proto';
    s = s.replace(/[\s-]*PROTO/gi, '').trim();
  } else if (s.includes('SMS')) {
    seasonType = 'SMS';
    s = s.replace(/[\s-]*SMS/gi, '').trim();
  } else if (s.includes('PRODUCTION')) {
    seasonType = 'Production';
    s = s.replace(/[\s-]*PRODUCTION/gi, '').trim();
  }

  // Handle compound seasons like "SP26/FA26" - take the first one
  if (s.includes('/')) {
    s = s.split('/')[0].trim();
  }

  // Remove any remaining non-alphanumeric characters
  s = s.replace(/[^A-Z0-9]/g, '');

  let normalizedSeason = '';

  // Pattern: FA## or SP## (e.g., FA26, SP27)
  let match = s.match(/^(FA|SP)(\d{2})$/);
  if (match) {
    normalizedSeason = `${match[2]}${match[1]}`;
  }

  // Pattern: F## or S## (short form, e.g., F26, S27)
  if (!normalizedSeason) {
    match = s.match(/^(F|S)(\d{2})$/);
    if (match) {
      const seasonCode = match[1] === 'F' ? 'FA' : 'SP';
      normalizedSeason = `${match[2]}${seasonCode}`;
    }
  }

  // Pattern: ##FA or ##SP (already correct format, e.g., 26FA, 27SP)
  if (!normalizedSeason) {
    match = s.match(/^(\d{2})(FA|SP)$/);
    if (match) {
      normalizedSeason = `${match[1]}${match[2]}`;
    }
  }

  // Pattern: ##F or ##S (e.g., 26F, 27S)
  if (!normalizedSeason) {
    match = s.match(/^(\d{2})(F|S)$/);
    if (match) {
      const seasonCode = match[2] === 'F' ? 'FA' : 'SP';
      normalizedSeason = `${match[1]}${seasonCode}`;
    }
  }

  // If still no match, return original cleaned up
  if (!normalizedSeason) {
    normalizedSeason = s;
  }

  return {
    season: normalizedSeason,
    seasonType,
    rawSeason: original,
  };
}

function loadProducts() {
  const filePath = path.join(DATA_DIR, LINE_LIST_FILE);
  if (!fs.existsSync(filePath)) {
    console.log('Line list file not found:', filePath);
    return [];
  }

  console.log('Loading products from:', LINE_LIST_FILE);
  const buffer = fs.readFileSync(filePath);
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  // Find the main sheet
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, unknown>[];

  console.log('Line list rows:', rows.length);
  if (rows.length > 0) {
    console.log('Line list columns:', Object.keys(rows[0]).slice(0, 15));
  }

  return rows
    .filter(row => {
      const styleNumber = parseString(row['Style#'] || row['Style'] || row['Style #']);
      return styleNumber && styleNumber.length > 0;
    })
    .map((row, index) => {
      const rawSeason = parseString(row['Seas'] || row['Season']);
      const normalized = normalizeSeasonCode(rawSeason);
      const rawStyleSeason = parseString(row['StySea']);
      const normalizedStyleSeason = normalizeSeasonCode(rawStyleSeason);
      const rawColorSeason = parseString(row['ClrSea']);
      const normalizedColorSeason = normalizeSeasonCode(rawColorSeason);

      return {
        id: `prod-${index}`,
        // Core identifiers
        styleNumber: parseString(row['Style#'] || row['Style'] || row['Style #']),
        styleDesc: parseString(row['Style Desc'] || row['Style Description']),
        color: parseString(row['Clr'] || row['Color']),
        colorDesc: parseString(row['Clr Desc'] || row['Color Desc']),
        styleColor: parseString(row['Style/Color'] || row['Style-Clr']),

        // Season info
        season: normalized.season,
        seasonType: normalized.seasonType,
        rawSeason: normalized.rawSeason,
        styleSeason: normalizedStyleSeason.season,
        colorSeason: normalizedColorSeason.season,
        seasonDesc: parseString(row['Selling Seasons'] || row['Sea Desc']),
        sellingSeasons: parseString(row['Selling Seasons']),

        // Classification
        divisionDesc: parseString(row['Division Desc'] || row['Div Desc']),
        categoryDesc: parseString(row['Cat Desc'] || row['Category Description']),
        category: parseString(row['Category']),
        productLine: parseString(row['Product Line']),
        productLineDesc: parseString(row['Product Line Desc']),
        styleSegment: parseString(row['Style Segment']),
        styleSegmentDesc: parseString(row['Style Segment Desc.']),
        labelDesc: parseString(row['Label Desc']),
        masterSegmentDesc: parseString(row['Master Segment Desc.']),
        merchandiseCollectionDesc: parseString(row['Merchandise Collection Desc']),

        // Pricing
        price: parseNumber(row['Price'] || row['Wholesale Price']),
        msrp: parseNumber(row['MSRP'] || row['MSRP (Style)']),
        cost: parseNumber(row['Cost']),
        currency: parseString(row['Curr']) || 'USD',
        cadLastCostSheet: parseNumber(row['CAD-Last Cost Sheet']) || null,
        cadPrice: parseNumber(row['CAD-Price']) || null,
        cadMsrp: parseNumber(row['CAD-MSRP']) || null,

        // Status flags
        carryOver: parseString(row['Carry Over'] || row['C/O']).toUpperCase() === 'Y',
        carryForward: parseString(row['Carry Forward']).toUpperCase() === 'Y',
        inventoryClassification: parseString(row['Inventory Classification']),
        inventoryClassificationDesc: parseString(row['Inventory Classification Desc.']),
        styleDisc: parseString(row['Style Disc']),
        styleDiscReason: parseString(row['Sty Disc Rea']),
        colorDisc: parseString(row['Color Disc']),
        colorAvailWeb: parseString(row['Clr Avail Web']),

        // Dates
        dateAddedColor: parseString(row['Date Added (Color)']) || null,
        dateChangedColor: parseString(row['Date Changed (Color)']) || null,
        dateChangedStyle: parseString(row['Date Changed (Style)']) || null,
        dateOpened: parseString(row['Date Opened']) || null,

        // Sourcing
        countryOfOrigin: parseString(row['Country of Origin Description']),
        factoryName: parseString(row['Factory Description']),
        primarySupplier: parseString(row['Primary Supplier Desc (Self)']),
        htsCode: parseString(row['HTS Code']),

        // Team
        designerName: parseString(row['Designer Name'] || row['Designer']),
        techDesignerName: parseString(row['Tech Designer Name'] || row['Tech Designer']),

        // Notes
        styleColorNotes: parseString(row['Style/Color Notes']),
      };
    });
}

function loadSales() {
  const filePath = path.join(DATA_DIR, SALES_FILE);
  if (!fs.existsSync(filePath)) {
    console.log('Sales file not found:', filePath);
    return [];
  }

  console.log('Loading sales from:', SALES_FILE);
  const buffer = fs.readFileSync(filePath);
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  // Use Sheet1 which has the raw data (Sheet2 is a pivot table)
  const sheetName = workbook.SheetNames.includes('Sheet1') ? 'Sheet1' : workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, unknown>[];

  console.log('Sales rows:', rows.length);
  if (rows.length > 0) {
    console.log('Sales columns:', Object.keys(rows[0]).slice(0, 15));
  }

  return rows
    .filter(row => {
      const styleNumber = parseString(row['Style']);
      return styleNumber && styleNumber.length > 0;
    })
    .map((row, index) => {
      const rawSeason = parseString(row['Season']);
      const normalized = normalizeSeasonCode(rawSeason);
      return {
        id: `sale-${index}`,
        styleNumber: parseString(row['Style']),
        styleDesc: parseString(row['Style Description']),
        colorCode: parseString(row['Color']),
        colorDesc: parseString(row['Color Desc. From Clr Mst']),
        season: normalized.season,
        seasonType: normalized.seasonType,
        rawSeason: normalized.rawSeason,
        customer: parseString(row['Customer Name']),
        customerType: parseString(row['Customer Type']),
        salesRep: parseString(row['Sales Rep 1']),
        divisionDesc: parseString(row['Division']),
        categoryDesc: parseString(row['Category Description']),
        gender: parseString(row['Gender Descripton']),
        unitsBooked: parseNumber(row['Units Current Booked']),
        unitsOpen: parseNumber(row['Units Open']),
        revenue: parseNumber(row['$ Current Booked Net']),
        shipped: parseNumber(row['$ Shipped Net']),
        cost: parseNumber(row['Cost']),
        wholesalePrice: parseNumber(row['Wholesale Price']),
        msrp: parseNumber(row['MSRP (Style)']),
        netUnitPrice: parseNumber(row['Net Unit Price']),
        orderType: parseString(row['Order Type']),
      };
    });
}

function loadPricing() {
  const filePath = path.join(DATA_DIR, PRICING_FILE);
  if (!fs.existsSync(filePath)) {
    console.log('Pricing file not found:', filePath);
    return [];
  }

  console.log('Loading pricing from:', PRICING_FILE);
  const buffer = fs.readFileSync(filePath);
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, unknown>[];

  console.log('Pricing rows:', rows.length);
  if (rows.length > 0) {
    console.log('Pricing columns:', Object.keys(rows[0]));
  }

  return rows
    .filter(row => {
      const styleNumber = parseString(row['Style'] || row['Style #']);
      return styleNumber && styleNumber.length > 0;
    })
    .map((row, index) => {
      const rawSeason = parseString(row['Season']);
      const normalized = normalizeSeasonCode(rawSeason);
      return {
        id: `price-${index}`,
        season: normalized.season,
        seasonType: normalized.seasonType,
        rawSeason: normalized.rawSeason,
        seasonDesc: parseString(row['Sea Desc']),
        styleNumber: parseString(row['Style'] || row['Style #']),
        styleDesc: parseString(row['Description'] || row['Style Desc']),
        colorCode: parseString(row['Clr']),
        colorDesc: parseString(row['Clr_Desc'] || row['Clr Desc']),
        price: parseNumber(row['Price'] || row['Wholesale']),
        msrp: parseNumber(row['MSRP'] || row['Retail']),
        cost: parseNumber(row['Cost']),
      };
    });
}

function loadCosts() {
  const filePath = path.join(DATA_DIR, COSTS_FILE);
  if (!fs.existsSync(filePath)) {
    console.log('Costs file not found:', filePath);
    return [];
  }

  console.log('Loading costs from:', COSTS_FILE);
  const buffer = fs.readFileSync(filePath);
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  // Check for LDP Requests sheet
  const sheetName = workbook.SheetNames.includes('LDP Requests') ? 'LDP Requests' : workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // Start from row 11 (0-indexed row 10) where data begins
  const rows = XLSX.utils.sheet_to_json(sheet, { range: 10, defval: '' }) as Record<string, unknown>[];

  console.log('Costs rows:', rows.length);
  if (rows.length > 0) {
    console.log('Costs columns:', Object.keys(rows[0]).slice(0, 15));
  }

  return rows
    .filter(row => {
      const styleNumber = parseString(row['Style #'] || row['Style']);
      return styleNumber && styleNumber.length > 0;
    })
    .map((row, index) => {
      const rawSeason = parseString(row['Season']);
      const normalized = normalizeSeasonCode(rawSeason);
      return {
        id: `cost-${index}`,
        styleNumber: parseString(row['Style #'] || row['Style']),
        styleName: parseString(row['Style Name'] || row['Description']),
        season: normalized.season,
        seasonType: normalized.seasonType,
        rawSeason: normalized.rawSeason,
        factory: parseString(row['Factory']),
        countryOfOrigin: parseString(row['COO'] || row['Country']),
        designTeam: parseString(row['Design Team']),
        developer: parseString(row['Developer/ Designer'] || row['Developer']),
        fob: parseNumber(row['FOB']),
        landed: parseNumber(row['Landed'] || row['LDP']),
        dutyCost: parseNumber(row['Duty Cost $'] || row['Duty']),
        tariffCost: parseNumber(row['Tariff  Cost $'] || row['Tariff Cost $'] || row['Tariff']),
        freightCost: parseNumber(row['Freight Cost'] || row['Freight']),
        overheadCost: parseNumber(row['Overhead Cost'] || row['Overhead']),
        suggestedMsrp: parseNumber(row['Suggested MSRP'] || row['MSRP']),
        suggestedWholesale: parseNumber(row['Suggested Selling Price'] || row['Wholesale']),
        margin: parseNumber(row['Margin']),
      };
    });
}

export async function GET() {
  try {
    console.log('Loading KÜHL data from:', DATA_DIR);

    if (!fs.existsSync(DATA_DIR)) {
      return NextResponse.json({
        error: 'Data directory not found',
        path: DATA_DIR
      }, { status: 404 });
    }

    const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.xlsx'));
    console.log('Available Excel files:', files);

    const products = loadProducts();
    const sales = loadSales();
    const pricing = loadPricing();
    const costs = loadCosts();

    console.log('Loaded:', {
      products: products.length,
      sales: sales.length,
      pricing: pricing.length,
      costs: costs.length,
    });

    return NextResponse.json({
      success: true,
      counts: {
        products: products.length,
        sales: sales.length,
        pricing: pricing.length,
        costs: costs.length,
      },
      data: {
        products,
        sales,
        pricing,
        costs,
      }
    });
  } catch (error) {
    console.error('Error loading data:', error);
    return NextResponse.json({
      error: 'Failed to load data',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
