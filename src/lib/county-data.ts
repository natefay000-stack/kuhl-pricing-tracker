/**
 * County-level data aggregation for the geo heatmap drill-down
 * Maps sales records to counties via zip code lookup
 */

import type { SalesRecord } from '@/types/product';
import type { ZipToCountyMap } from './geo-utils';

export interface CountyData {
  fips: string;
  countyName: string;
  stateCode: string;
  revenue: number;
  shippedAtNet: number;
  units: number;
  unitsShipped: number;
  orders: number;
  customers: Set<string>;
  categories: Record<string, number>;
  topCategory: string;
  zipCodes: Set<string>;
  genderRevenue: Record<string, number>;
  customerTypeRevenue: Record<string, number>;
}

/** Derive gender from divisionDesc for demographic tracking */
function getGenderFromDivision(divisionDesc: string): string {
  if (!divisionDesc) return 'Unknown';
  const lower = divisionDesc.toLowerCase();
  if (lower.includes("women") || lower.includes("woman")) return "Women's";
  if (lower === 'w' || lower === '02') return "Women's";
  if (lower.includes("men")) return "Men's";
  if (lower === 'm' || lower === '01') return "Men's";
  if (lower.includes("unisex") || lower.includes("accessories")) return "Unisex";
  if (lower === '08') return "Unisex";
  return "Unknown";
}

/**
 * Aggregate sales for a specific state into county-level data
 * Uses shipToZip/billToZip → county FIPS mapping
 *
 * Returns: Map of county FIPS → CountyData, plus coverage stats
 */
export function aggregateSalesByCounty(
  sales: SalesRecord[],
  zipMap: ZipToCountyMap,
  stateCode: string,
): { countyData: Map<string, CountyData>; totalStateRevenue: number; mappedRevenue: number } {
  const map = new Map<string, CountyData>();
  let totalStateRevenue = 0;
  let mappedRevenue = 0;

  for (const sale of sales) {
    // Only include sales for the target state
    const saleState = (sale.shipToState || sale.billToState || '').trim().toUpperCase();
    // Normalize — could be full name or 2-letter code
    const normalized = saleState.length === 2 ? saleState : '';
    if (normalized !== stateCode) continue;

    const rev = sale.shippedAtNet || 0;
    totalStateRevenue += rev;

    // Resolve zip to county
    const zip = (sale.shipToZip || sale.billToZip || '').trim().substring(0, 5);
    if (!zip || zip.length < 5) continue;

    const countyInfo = zipMap[zip];
    if (!countyInfo) continue;

    const fips = countyInfo.fips;
    mappedRevenue += rev;

    let entry = map.get(fips);
    if (!entry) {
      entry = {
        fips,
        countyName: countyInfo.county,
        stateCode,
        revenue: 0,
        shippedAtNet: 0,
        units: 0,
        unitsShipped: 0,
        orders: 0,
        customers: new Set(),
        categories: {},
        topCategory: '',
        zipCodes: new Set(),
        genderRevenue: {},
        customerTypeRevenue: {},
      };
      map.set(fips, entry);
    }

    entry.revenue += rev;
    entry.shippedAtNet += rev;
    entry.units += sale.unitsShipped || 0;
    entry.unitsShipped += sale.unitsShipped || 0;
    entry.orders += 1;
    if (sale.customer) entry.customers.add(sale.customer);
    if (zip) entry.zipCodes.add(zip);

    const cat = sale.categoryDesc || 'Other';
    entry.categories[cat] = (entry.categories[cat] || 0) + rev;

    // Gender breakdown
    const gender = getGenderFromDivision(sale.divisionDesc);
    entry.genderRevenue[gender] = (entry.genderRevenue[gender] || 0) + rev;

    // Customer type breakdown
    const ctypes = (sale.customerType || '').split(',').map(t => t.trim()).filter(Boolean);
    for (const ct of ctypes) {
      entry.customerTypeRevenue[ct] = (entry.customerTypeRevenue[ct] || 0) + rev;
    }
  }

  // Compute top category per county
  for (const entry of map.values()) {
    let topCat = '';
    let topRev = 0;
    for (const [cat, catRev] of Object.entries(entry.categories)) {
      if (catRev > topRev) {
        topCat = cat;
        topRev = catRev;
      }
    }
    entry.topCategory = topCat;
  }

  return { countyData: map, totalStateRevenue, mappedRevenue };
}
