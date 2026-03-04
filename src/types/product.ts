// Product data types based on KÜHL's product identifiers

// Season type for normalized season data
export type SeasonType = 'Main' | 'Bulk' | 'Proto' | 'SMS' | 'Production' | 'Unknown';

export interface Product {
  id: string;

  // Core identifiers
  styleNumber: string;
  styleDesc: string;
  color: string;
  colorDesc: string;
  styleColor: string;

  // Season info
  season: string;           // Normalized season code (e.g., "26FA", "27SP")
  seasonType?: SeasonType;  // Season type (Main, Bulk, Proto, SMS, Production)
  rawSeason?: string;       // Original season value before normalization
  styleSeason: string;      // Style introduction season
  colorSeason: string;      // Color introduction season
  seasonDesc: string;
  sellingSeasons: string;

  // Classification
  divisionDesc: string;
  categoryDesc: string;
  category: string;
  productLine: string;
  productLineDesc: string;
  styleSegment: string;
  styleSegmentDesc: string;
  labelDesc: string;
  masterSegmentDesc?: string;
  merchandiseCollectionDesc?: string;

  // Pricing
  price: number;            // Wholesale
  msrp: number;
  cost: number;             // May be 0 if not available
  currency: string;
  cadLastCostSheet: number | null;
  cadPrice: number | null;
  cadMsrp: number | null;

  // Status flags
  carryOver: boolean;
  carryForward: boolean;
  inventoryClassification: string;
  inventoryClassificationDesc: string;
  styleDisc?: string;       // Style discontinued flag
  styleDiscReason?: string; // Style discontinue reason
  colorDisc?: string;       // Color discontinued flag
  colorAvailWeb?: string;   // Web availability flag

  // Dates
  dateAddedColor: string | null;
  dateChangedColor: string | null;
  dateChangedStyle: string | null;
  dateOpened: string | null;

  // Sourcing
  countryOfOrigin?: string;
  factoryName?: string;
  primarySupplier?: string;
  htsCode?: string;

  // Team
  designerName: string;
  techDesignerName: string;

  // Notes
  styleColorNotes: string;

  // System fields
  createdAt?: string;
  updatedAt?: string;
}

// Pricing data by season
export interface PricingRecord {
  id: string;
  season: string;           // Normalized season code
  seasonType?: SeasonType;  // Season type
  rawSeason?: string;       // Original season value
  styleNumber: string;
  styleDesc: string;
  price: number;
  msrp: number;
  cost: number;
  cadPrice: number | null;
  cadMsrp: number | null;
  createdAt?: string;
}

// Cost data from Landed Request Sheet
export interface CostRecord {
  id: string;
  season: string;           // Normalized season code
  seasonType?: SeasonType;  // Season type
  rawSeason?: string;       // Original season value
  styleNumber: string;
  styleName: string;
  factory: string;
  countryOfOrigin: string;
  fob: number; // Factory cost (Free on Board)
  landed: number; // Landed Duty Paid cost
  dutyCost: number;
  tariffCost: number;
  freightCost: number;
  overheadCost: number;
  suggestedMsrp: number | null;
  suggestedWholesale: number | null;
  margin: number | null;
  designTeam: string;
  developer: string;
  costSource?: string; // 'landed_cost' (priority 1) or 'standard_cost' (priority 2)
  createdAt?: string;
}

// Sales data record (aggregated by style+season)
export interface SalesRecord {
  id: string;
  styleNumber: string;
  styleDesc: string;
  color?: string;
  colorCode?: string;
  colorDesc: string;
  styleColor?: string;
  customer?: string;
  customerType: string; // WH, WD, BB, PS, EC, KI (or comma-separated if multiple)
  unitsBooked: number;
  unitsOpen?: number;
  revenue: number;
  shipped?: number;
  cost: number;
  wholesalePrice?: number;
  msrp?: number;
  netUnitPrice?: number;
  unitsShipped?: number;
  season: string;           // Normalized season code
  seasonType?: SeasonType;  // Season type
  rawSeason?: string;       // Original season value
  divisionDesc: string;
  categoryDesc: string;
  gender?: string;
  salesRep?: string;
  orderType?: string;
  customerCount?: number;   // Number of unique customers (for aggregated data)
  // New fields from detailed sales report
  invoiceDate?: string;
  accountingPeriod?: string;
  invoiceNumber?: string;
  shipToState?: string;
  returnedAtNet?: number;
  shippedAtNet?: number;
  totalPrice?: number;
  commissionRate?: number;
  ytdNetInvoicing?: number;
  ytdCreditMemos?: number;
  ytdSales?: number;
  warehouse?: string;
  warehouseDesc?: string;
  openAtNet?: number;
  openOrder?: number;
  returned?: number;
  shippedAtMsrp?: number;
  totalAtNet?: number;
  totalAtWholesale?: number;
  returnedAtWholesale?: number;
  // Geographic fields
  shipToCity?: string;
  shipToZip?: string;
  billToState?: string;
  billToCity?: string;
  billToZip?: string;
  // Unit counts (unitsShipped already above)
  unitsReturned?: number;
  createdAt?: string;
  // Data source tag — 'invoice' for invoice records enriched via enrich-sales-geo
  dataSource?: string;
}

// Customer type labels
export const CUSTOMER_TYPE_LABELS: Record<string, string> = {
  'KI': 'KUHL International',
  'WH': 'Wholesale',
  'BB': 'REI',
  'WD': 'Wholesale Direct',
  'EC': 'E-Commerce',
  'PS': 'Pro Sales',
};

// Category abbreviation to full name mapping
export const CATEGORY_MAP: Record<string, string> = {
  'JACK': 'JACKET',
  'PANT': 'PANTS',
  'SHOR': 'SHORTS',
  'LEGG': 'LEGGINGS',
  'DRES': 'DRESS',
  'FLEE': 'FLEECE',
  'HEAD': 'HEADWEAR',
  'SLEE': 'SLEEVELESS',
  'LONG': 'LONG SLEEVE',
  'SHRT': 'SHORT SLEEVE',
  'SWEA': 'SWEATER',
  'UNDE': 'UNDERWEAR',
  'SKIR': 'SKIRTS',
  'SKOR': 'SKORTS',
  'MISC': 'MISCELLANEOUS',
  'FLAN': 'FLANNEL',
  'BASE': 'BASELAYER',
  'VEST': 'VEST',
  'BAGS': 'BAGS',
  'POP': 'POP',
};

// Normalize category abbreviations to full names
export function normalizeCategory(category: string): string {
  if (!category) return '';
  const upper = category.toUpperCase().trim();
  return CATEGORY_MAP[upper] || upper;
}

// Inventory data from Inventory Movement Report
export interface InventoryRecord {
  id: string;
  styleNumber: string;
  styleDesc?: string;
  color?: string;
  colorDesc?: string;
  colorType?: string;
  styleCategory?: string;
  styleCatDesc?: string;
  warehouse?: string;
  movementType?: string;     // Type — Receipt, Shipment, Adjustment, etc.
  movementDate?: string;     // Date of movement
  user?: string;
  group?: string;
  groupDesc?: string;
  reference?: string;
  customerVendor?: string;   // Customer/Vendor
  reasonCode?: string;       // Rea
  reasonDesc?: string;       // Rea Desc
  costPrice: number;         // Cost/Price
  wholesalePrice: number;
  msrp: number;
  sizePricing?: string;
  division?: string;
  divisionDesc?: string;
  label?: string;
  labelDesc?: string;
  period?: string;           // Accounting period
  qty: number;               // Movement qty (+/-)
  balance: number;           // Running balance after movement
  extension: number;         // Dollar extension
  prodMgr?: string;
  oldStyleNumber?: string;
  pantoneCsiDesc?: string;
  controlNumber?: string;
  asnStatus?: string;
  store?: string;
  salesOrderNumber?: string;
  segmentCode?: string;
  segmentDesc?: string;
  costCode?: string;
  costDesc?: string;
  createdAt?: string;
}

// On-Hand inventory snapshot (style-color level, with size breakdown)
export interface InventoryOHRecord {
  id: string;
  snapshotDate: string;
  styleNumber: string;
  styleDesc?: string;
  season?: string;
  category?: string;
  division?: number;
  prodType?: string;
  prodLine?: string;
  stdPrice: number;
  msrp: number;
  outletMsrp: number;
  stdCost: number;
  color?: string;
  colorDesc?: string;
  colorType?: string;
  segmentCode?: string;
  garmentClass?: string;
  garmentClassDesc?: string;
  warehouse?: number;
  sizeType?: string;
  inventoryClassification?: string;
  sizeBreakdown: Record<string, number>;
  totalQty: number;
}

export interface InventoryOHAggregations {
  totalCount: number;
  totalUnits: number;
  totalValue: number;
  byCategory: { category: string; styles: number; colors: number; total_qty: number; total_value: number }[];
  bySeason: { season: string; styles: number; colors: number; total_qty: number; total_value: number }[];
  topStyles: { styleNumber: string; style_desc: string; category: string; colors: number; total_qty: number; total_value: number; std_price: number; msrp: number }[];
}

export interface PriceHistory {
  id: string;
  productId: string;
  season: string;
  price: number;
  msrp: number;
  cost: number;
  cadPrice: number | null;
  cadMsrp: number | null;
  cadCost: number | null;
  recordedAt: string;
}

export interface MarginAnalysis {
  costToWholesale: number | null; // (price - cost) / price - null if no cost
  wholesaleToMsrp: number; // (msrp - price) / msrp
  fullMarkup: number | null; // (msrp - cost) / cost - null if no cost
  costToWholesaleMultiplier: number | null; // price / cost - null if no cost
  wholesaleToMsrpMultiplier: number; // msrp / price
  fullMultiplier: number | null; // msrp / cost - null if no cost
  hasCost: boolean;
}

export interface SeasonSummary {
  season: string;
  seasonDesc: string;
  productCount: number;
  avgCost: number | null;
  avgPrice: number;
  avgMsrp: number;
  avgMargin: number;
  totalProducts: number;
  carryOverCount: number;
  newStyleCount: number;
}

export interface FilterState {
  search: string;
  division: string;
  category: string;
  season: string;
  productLine: string;
  designer: string;
  carryOver: 'all' | 'yes' | 'no';
  priceMin: number | null;
  priceMax: number | null;
}

// CSV Import mapping - maps CSV headers to Product fields
export const CSV_HEADER_MAP: Record<string, keyof Product> = {
  'Style#': 'styleNumber',
  'Style': 'styleNumber',
  'Style Desc': 'styleDesc',
  'Description': 'styleDesc',
  'Clr': 'color',
  'Clr_Desc': 'colorDesc',
  'Clr Desc': 'colorDesc',
  'Style/Color': 'styleColor',
  'Division Desc': 'divisionDesc',
  'Cat Desc': 'categoryDesc',
  'StySea': 'styleSeason',
  'ClrSea': 'colorSeason',
  'Carry Over': 'carryOver',
  'Carry Forward': 'carryForward',
  'Season': 'season',
  'Sea Desc': 'seasonDesc',
  'Style Segment Desc.': 'styleSegmentDesc',
  'Style Segment': 'styleSegment',
  'Price': 'price',
  'MSRP': 'msrp',
  'Cost': 'cost',
  'Date Added (Color)': 'dateAddedColor',
  'Date Changed (Color)': 'dateChangedColor',
  'Date Changed (Style)': 'dateChangedStyle',
  'Date Opened': 'dateOpened',
  'Inventory Classification': 'inventoryClassification',
  'Inventory Classification Desc.': 'inventoryClassificationDesc',
  'Style/Color Notes': 'styleColorNotes',
  'Curr': 'currency',
  'Currency': 'currency',
  'Selling Seasons': 'sellingSeasons',
  'CAD-Last Cost Sheet': 'cadLastCostSheet',
  'CAD-Price': 'cadPrice',
  'CAD-MSRP': 'cadMsrp',
  'Product Line': 'productLine',
  'Product Line Desc': 'productLineDesc',
  'Tech Designer Name': 'techDesignerName',
  'Category': 'category',
  'Designer Name': 'designerName',
  'Label Desc': 'labelDesc',
};

// Utility functions for calculations
export function calculateMargins(cost: number, price: number, msrp: number): MarginAnalysis {
  const hasCost = cost > 0;
  
  return {
    costToWholesale: hasCost && price > 0 ? ((price - cost) / price) * 100 : null,
    wholesaleToMsrp: msrp > 0 ? ((msrp - price) / msrp) * 100 : 0,
    fullMarkup: hasCost && cost > 0 ? ((msrp - cost) / cost) * 100 : null,
    costToWholesaleMultiplier: hasCost && cost > 0 ? price / cost : null,
    wholesaleToMsrpMultiplier: price > 0 ? msrp / price : 0,
    fullMultiplier: hasCost && cost > 0 ? msrp / cost : null,
    hasCost,
  };
}

export function getMarginClass(margin: number | null): string {
  if (margin === null) return 'text-kuhl-stone/40';
  if (margin >= 60) return 'margin-excellent';
  if (margin >= 50) return 'margin-good';
  if (margin >= 40) return 'margin-fair';
  return 'margin-poor';
}

// Formatting utilities moved to @/utils/format — use formatCurrency/formatPercent from there
