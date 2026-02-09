'use client';

import { Product, FilterState, SeasonSummary, SalesRecord, PricingRecord } from '@/types/product';

// Season sorting: 25SP, 25FA, 26SP, 26FA (Spring before Fall within same year)
export function sortSeasons(seasons: string[]): string[] {
  return [...seasons].sort((a, b) => {
    const parseSeasonCode = (s: string) => {
      const match = s.match(/^(\d+)(SP|FA)$/i);
      if (!match) return { year: 0, order: 0 };
      const year = parseInt(match[1], 10);
      const seasonType = match[2].toUpperCase();
      // SP = 0 (first), FA = 1 (second)
      const order = seasonType === 'SP' ? 0 : 1;
      return { year, order };
    };

    const aParsed = parseSeasonCode(a);
    const bParsed = parseSeasonCode(b);

    // Sort by year first, then by season order (SP before FA)
    if (aParsed.year !== bParsed.year) {
      return aParsed.year - bParsed.year;
    }
    return aParsed.order - bParsed.order;
  });
}

// Compare function for individual season codes
export function compareSeasons(a: string, b: string): number {
  const parseSeasonCode = (s: string) => {
    const match = s.match(/^(\d+)(SP|FA)$/i);
    if (!match) return { year: 0, order: 0 };
    const year = parseInt(match[1], 10);
    const seasonType = match[2].toUpperCase();
    const order = seasonType === 'SP' ? 0 : 1;
    return { year, order };
  };

  const aParsed = parseSeasonCode(a);
  const bParsed = parseSeasonCode(b);

  if (aParsed.year !== bParsed.year) {
    return aParsed.year - bParsed.year;
  }
  return aParsed.order - bParsed.order;
}

const STORAGE_KEY = 'kuhl_pricing_data';

// Load products from localStorage
export function loadProducts(): Product[] {
  if (typeof window === 'undefined') return [];
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : [];
}

// Save products to localStorage
export function saveProducts(products: Product[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
  } catch (e) {
    console.warn('Failed to save products to localStorage:', e);
  }
}

// Generate unique ID
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Add or update products (upsert based on styleColor)
export function upsertProducts(newProducts: Product[]): Product[] {
  const existing = loadProducts();
  const existingMap = new Map(existing.map(p => [p.styleColor, p]));
  
  newProducts.forEach(product => {
    const id = existingMap.get(product.styleColor)?.id || generateId();
    existingMap.set(product.styleColor, {
      ...product,
      id,
      updatedAt: new Date().toISOString(),
      createdAt: existingMap.get(product.styleColor)?.createdAt || new Date().toISOString(),
    });
  });
  
  const allProducts = Array.from(existingMap.values());
  saveProducts(allProducts);
  return allProducts;
}

// Delete a product
export function deleteProduct(id: string): Product[] {
  const products = loadProducts().filter(p => p.id !== id);
  saveProducts(products);
  return products;
}

// Clear all products
export function clearAllProducts(): void {
  saveProducts([]);
}

// Filter products
export function filterProducts(products: Product[], filters: FilterState): Product[] {
  return products.filter(product => {
    // Search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      const searchable = [
        product.styleNumber,
        product.styleDesc,
        product.colorDesc,
        product.styleColor,
        product.designerName,
      ].join(' ').toLowerCase();
      if (!searchable.includes(searchLower)) return false;
    }
    
    // Division filter
    if (filters.division && product.divisionDesc !== filters.division) return false;
    
    // Category filter
    if (filters.category && product.categoryDesc !== filters.category) return false;
    
    // Season filter
    if (filters.season && product.season !== filters.season) return false;
    
    // Product Line filter
    if (filters.productLine && product.productLineDesc !== filters.productLine) return false;
    
    // Designer filter
    if (filters.designer && product.designerName !== filters.designer) return false;
    
    // Carry Over filter
    if (filters.carryOver === 'yes' && !product.carryOver) return false;
    if (filters.carryOver === 'no' && product.carryOver) return false;
    
    // Price range filters
    if (filters.priceMin !== null && product.price < filters.priceMin) return false;
    if (filters.priceMax !== null && product.price > filters.priceMax) return false;
    
    return true;
  });
}

// Get unique values for filter dropdowns
export function getUniqueValues(products: Product[], field: keyof Product): string[] {
  const values = new Set<string>();
  products.forEach(p => {
    const value = p[field];
    if (value && typeof value === 'string') {
      values.add(value);
    }
  });
  return Array.from(values).sort();
}

// Calculate season summaries
export function getSeasonSummaries(products: Product[]): SeasonSummary[] {
  const seasonMap = new Map<string, Product[]>();
  
  products.forEach(product => {
    const season = product.season || 'Unknown';
    if (!seasonMap.has(season)) {
      seasonMap.set(season, []);
    }
    seasonMap.get(season)!.push(product);
  });
  
  const summaries: SeasonSummary[] = [];
  
  seasonMap.forEach((seasonProducts, season) => {
    const count = seasonProducts.length;
    const productsWithCost = seasonProducts.filter(p => p.cost > 0);
    const avgCost = productsWithCost.length > 0 
      ? productsWithCost.reduce((sum, p) => sum + p.cost, 0) / productsWithCost.length 
      : null;
    const avgPrice = seasonProducts.reduce((sum, p) => sum + (p.price || 0), 0) / count;
    const avgMsrp = seasonProducts.reduce((sum, p) => sum + (p.msrp || 0), 0) / count;
    
    // Use wholesale to MSRP margin when no cost data
    const avgMargin = avgMsrp > 0 ? ((avgMsrp - avgPrice) / avgMsrp) * 100 : 0;
    
    // Get seasonDesc from first product in this season
    const seasonDesc = seasonProducts[0]?.seasonDesc || '';
    
    summaries.push({
      season,
      seasonDesc,
      productCount: count,
      avgCost,
      avgPrice,
      avgMsrp,
      avgMargin,
      totalProducts: count,
      carryOverCount: seasonProducts.filter(p => p.carryOver).length,
      newStyleCount: seasonProducts.filter(p => !p.carryOver).length,
    });
  });
  
  // Sort by season (chronological order: 25SP, 25FA, 26SP, 26FA)
  return summaries.sort((a, b) => compareSeasons(a.season, b.season));
}

// Get overall statistics
export function getOverallStats(products: Product[]) {
  if (products.length === 0) {
    return {
      totalProducts: 0,
      totalStyles: 0,
      avgCost: 0,
      avgPrice: 0,
      avgMsrp: 0,
      avgMargin: 0,
      divisions: 0,
      categories: 0,
      seasons: 0,
    };
  }
  
  const uniqueStyles = new Set(products.map(p => p.styleNumber));
  const uniqueDivisions = new Set(products.map(p => p.divisionDesc).filter(Boolean));
  const uniqueCategories = new Set(products.map(p => p.categoryDesc).filter(Boolean));
  const uniqueSeasons = new Set(products.map(p => p.season).filter(Boolean));
  
  const productsWithCost = products.filter(p => p.cost > 0);
  const avgCost = productsWithCost.length > 0 
    ? productsWithCost.reduce((sum, p) => sum + p.cost, 0) / productsWithCost.length 
    : 0;
  const avgPrice = products.reduce((sum, p) => sum + (p.price || 0), 0) / products.length;
  const avgMsrp = products.reduce((sum, p) => sum + (p.msrp || 0), 0) / products.length;
  
  // Use wholesale to MSRP margin
  const avgMargin = avgMsrp > 0 ? ((avgMsrp - avgPrice) / avgMsrp) * 100 : 0;
  
  return {
    totalProducts: products.length,
    totalStyles: uniqueStyles.size,
    avgCost,
    avgPrice,
    avgMsrp,
    avgMargin,
    divisions: uniqueDivisions.size,
    categories: uniqueCategories.size,
    seasons: uniqueSeasons.size,
  };
}

// ============================================
// SALES DATA AGGREGATION
// ============================================

export interface SalesSummary {
  totalUnits: number;
  totalRevenue: number;
  totalCost: number;
  grossProfit: number;
  grossMargin: number;
  avgOrderValue: number;
  uniqueCustomers: number;
  uniqueStyles: number;
}

export interface SalesByDimension {
  key: string;
  label: string;
  units: number;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
  orderCount: number;
}

// Get overall sales summary
export function getSalesSummary(sales: SalesRecord[]): SalesSummary {
  if (sales.length === 0) {
    return {
      totalUnits: 0,
      totalRevenue: 0,
      totalCost: 0,
      grossProfit: 0,
      grossMargin: 0,
      avgOrderValue: 0,
      uniqueCustomers: 0,
      uniqueStyles: 0,
    };
  }

  const totalUnits = sales.reduce((sum, s) => sum + (s.unitsBooked || 0), 0);
  const totalRevenue = sales.reduce((sum, s) => sum + (s.revenue || 0), 0);
  const totalCost = sales.reduce((sum, s) => sum + (s.cost || 0), 0);
  const grossProfit = totalRevenue - totalCost;
  const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
  const uniqueCustomers = new Set(sales.map(s => s.customer).filter(Boolean)).size;
  const uniqueStyles = new Set(sales.map(s => s.styleNumber).filter(Boolean)).size;

  return {
    totalUnits,
    totalRevenue,
    totalCost,
    grossProfit,
    grossMargin,
    avgOrderValue: totalRevenue / sales.length,
    uniqueCustomers,
    uniqueStyles,
  };
}

// Aggregate sales by a dimension (season, category, division, customerType, style)
export function getSalesByDimension(
  sales: SalesRecord[],
  dimension: 'season' | 'categoryDesc' | 'divisionDesc' | 'customerType' | 'styleNumber'
): SalesByDimension[] {
  const grouped = new Map<string, SalesRecord[]>();

  sales.forEach(sale => {
    const key = sale[dimension] || 'Unknown';
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(sale);
  });

  const results: SalesByDimension[] = [];

  grouped.forEach((records, key) => {
    const units = records.reduce((sum, r) => sum + (r.unitsBooked || 0), 0);
    const revenue = records.reduce((sum, r) => sum + (r.revenue || 0), 0);
    const cost = records.reduce((sum, r) => sum + (r.cost || 0), 0);
    const profit = revenue - cost;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

    results.push({
      key,
      label: key,
      units,
      revenue,
      cost,
      profit,
      margin,
      orderCount: records.length,
    });
  });

  // Sort by revenue descending
  return results.sort((a, b) => b.revenue - a.revenue);
}

// Get sales for a specific style
export function getSalesForStyle(sales: SalesRecord[], styleNumber: string): SalesRecord[] {
  return sales.filter(s => s.styleNumber === styleNumber);
}

// Get sales summary for a specific style
export function getStyleSalesSummary(sales: SalesRecord[], styleNumber: string): SalesSummary {
  const styleSales = getSalesForStyle(sales, styleNumber);
  return getSalesSummary(styleSales);
}

// Filter sales
export function filterSales(
  sales: SalesRecord[],
  filters: {
    season?: string;
    division?: string;
    category?: string;
    customerType?: string;
    styleNumber?: string;
  }
): SalesRecord[] {
  return sales.filter(sale => {
    if (filters.season && sale.season !== filters.season) return false;
    if (filters.division && sale.divisionDesc !== filters.division) return false;
    if (filters.category && sale.categoryDesc !== filters.category) return false;
    if (filters.customerType && sale.customerType !== filters.customerType) return false;
    if (filters.styleNumber && sale.styleNumber !== filters.styleNumber) return false;
    return true;
  });
}

// Get unique values from sales
export function getUniqueSalesValues(sales: SalesRecord[], field: keyof SalesRecord): string[] {
  const values = new Set<string>();
  sales.forEach(s => {
    const value = s[field];
    if (value && typeof value === 'string') {
      values.add(value);
    }
  });
  return Array.from(values).sort();
}

// ============================================
// PRICING DATA AGGREGATION
// ============================================

export interface PricingBySeason {
  season: string;
  styleNumber: string;
  styleDesc: string;
  price: number;
  msrp: number;
  cost: number;
  priceChange?: number; // % change from previous season
  msrpChange?: number;
}

// Get pricing history for a style across seasons
export function getPricingForStyle(pricing: PricingRecord[], styleNumber: string): PricingRecord[] {
  return pricing
    .filter(p => p.styleNumber === styleNumber)
    .sort((a, b) => a.season.localeCompare(b.season));
}

// Get all pricing with changes calculated
export function getPricingWithChanges(pricing: PricingRecord[]): PricingBySeason[] {
  // Group by style
  const byStyle = new Map<string, PricingRecord[]>();
  pricing.forEach(p => {
    if (!byStyle.has(p.styleNumber)) {
      byStyle.set(p.styleNumber, []);
    }
    byStyle.get(p.styleNumber)!.push(p);
  });

  const results: PricingBySeason[] = [];

  byStyle.forEach((records, styleNumber) => {
    // Sort by season
    const sorted = records.sort((a, b) => a.season.localeCompare(b.season));

    sorted.forEach((record, index) => {
      const prev = index > 0 ? sorted[index - 1] : null;
      const priceChange = prev && prev.price > 0
        ? ((record.price - prev.price) / prev.price) * 100
        : undefined;
      const msrpChange = prev && prev.msrp > 0
        ? ((record.msrp - prev.msrp) / prev.msrp) * 100
        : undefined;

      results.push({
        season: record.season,
        styleNumber: record.styleNumber,
        styleDesc: record.styleDesc,
        price: record.price,
        msrp: record.msrp,
        cost: record.cost,
        priceChange,
        msrpChange,
      });
    });
  });

  return results;
}

// Get pricing summary by season
export function getPricingSummaryBySeason(pricing: PricingRecord[]): Map<string, { avgPrice: number; avgMsrp: number; styleCount: number }> {
  const bySeason = new Map<string, PricingRecord[]>();

  pricing.forEach(p => {
    if (!bySeason.has(p.season)) {
      bySeason.set(p.season, []);
    }
    bySeason.get(p.season)!.push(p);
  });

  const results = new Map<string, { avgPrice: number; avgMsrp: number; styleCount: number }>();

  bySeason.forEach((records, season) => {
    const avgPrice = records.reduce((sum, r) => sum + r.price, 0) / records.length;
    const avgMsrp = records.reduce((sum, r) => sum + r.msrp, 0) / records.length;
    results.set(season, { avgPrice, avgMsrp, styleCount: records.length });
  });

  return results;
}
