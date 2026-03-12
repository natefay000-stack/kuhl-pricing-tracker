/**
 * CBSA (Core-Based Statistical Area) metro data utilities
 * Aggregates sales by metro area using:
 *   1. zip → county FIPS → CBSA mapping (precise, when zip data exists)
 *   2. state → primary CBSA fallback (when only state data is available)
 */

import type { SalesRecord } from '@/types/product';
import type { ZipToCountyMap } from './geo-utils';

export interface CbsaMetro {
  cbsaCode: string;
  name: string;
  shortName: string;
  svgX: number;
  svgY: number;
  lat: number;
  lng: number;
  countyFips: string[];
}

export interface MetroData {
  cbsaCode: string;
  name: string;
  shortName: string;
  svgX: number;
  svgY: number;
  revenue: number;
  units: number;
  orders: number;
  customers: Set<string>;
  categories: Record<string, number>;
  topCategory: string;
  countyFips: string[];
  contributingZips: Set<string>;
  statesSpanned: Set<string>;
  genderRevenue: Record<string, number>;
  customerTypeRevenue: Record<string, number>;
}

// Module-level caches
let cachedCbsaData: Map<string, CbsaMetro> | null = null;
let cbsaPromise: Promise<Map<string, CbsaMetro>> | null = null;

// Reverse lookup: county FIPS → CBSA code (built on first load)
let fipsToCbsa: Map<string, string> | null = null;

// State abbreviation → primary CBSA code (largest metro per state by county count)
let stateToCbsa: Map<string, string[]> | null = null;

// State FIPS code → state abbreviation
const STATE_FIPS: Record<string, string> = {
  '01':'AL','02':'AK','04':'AZ','05':'AR','06':'CA','08':'CO','09':'CT',
  '10':'DE','11':'DC','12':'FL','13':'GA','15':'HI','16':'ID','17':'IL',
  '18':'IN','19':'IA','20':'KS','21':'KY','22':'LA','23':'ME','24':'MD',
  '25':'MA','26':'MI','27':'MN','28':'MS','29':'MO','30':'MT','31':'NE',
  '32':'NV','33':'NH','34':'NJ','35':'NM','36':'NY','37':'NC','38':'ND',
  '39':'OH','40':'OK','41':'OR','42':'PA','44':'RI','45':'SC','46':'SD',
  '47':'TN','48':'TX','49':'UT','50':'VT','51':'VA','53':'WA','54':'WV',
  '55':'WI','56':'WY',
};

// State → primary CBSA override (the well-known metro, not county-count winner)
// Without this, Ogden beats SLC (4 vs 3 counties), Reno beats Vegas (2 vs 1), etc.
const STATE_PRIMARY_CBSA: Record<string, string> = {
  'CA': '31080', // Los Angeles (not Sacramento)
  'UT': '41620', // Salt Lake City (not Ogden)
  'NV': '29820', // Las Vegas (not Reno)
  'NY': '35620', // New York
  'TX': '19100', // Dallas-Fort Worth
  'FL': '33100', // Miami
  'IL': '16980', // Chicago
  'WA': '42660', // Seattle
  'GA': '12060', // Atlanta
  'PA': '37980', // Philadelphia
  'MA': '14460', // Boston
  'AZ': '38060', // Phoenix
  'MI': '19820', // Detroit
  'MN': '33460', // Minneapolis
  'CO': '19740', // Denver
  'MO': '41180', // St. Louis
  'OH': '17140', // Cincinnati
  'OR': '38900', // Portland
  'NC': '16740', // Charlotte
  'TN': '34980', // Nashville
  'IN': '26900', // Indianapolis
  'VA': '47260', // Virginia Beach-Norfolk
  'WI': '33340', // Milwaukee
  'MD': '12580', // Baltimore
  'LA': '35380', // New Orleans
  'OK': '36420', // Oklahoma City
  'KY': '31140', // Louisville
  'SC': '16700', // Charleston
  'AL': '13820', // Birmingham
  'NE': '36540', // Omaha
  'KS': '28140', // Kansas City
  'AR': '30780', // Little Rock
  'NM': '10740', // Albuquerque
  'ID': '14260', // Boise
  'CT': '25540', // Hartford
  'HI': '46520', // Honolulu
  'MS': '27140', // Jackson
  'SD': '43580', // Sioux Falls
};

/**
 * Load and cache the CBSA metro definitions (~24KB, fetched once)
 */
export async function loadCbsaMetros(): Promise<Map<string, CbsaMetro>> {
  if (cachedCbsaData) return cachedCbsaData;
  if (cbsaPromise) return cbsaPromise;

  cbsaPromise = fetch('/geo/cbsa-metros.json')
    .then(res => {
      if (!res.ok) throw new Error(`Failed to load CBSA data: ${res.status}`);
      return res.json();
    })
    .then((raw: Record<string, Omit<CbsaMetro, 'cbsaCode'>>) => {
      const map = new Map<string, CbsaMetro>();
      const reverse = new Map<string, string>();

      // Track metros per state (by county count) for state-based fallback
      const stateMetros = new Map<string, { cbsaCode: string; countyCount: number }[]>();

      for (const [code, entry] of Object.entries(raw)) {
        map.set(code, { cbsaCode: code, ...entry });

        // Build state→metro mapping from county FIPS codes
        const statesInMetro = new Set<string>();
        for (const fips of entry.countyFips) {
          reverse.set(fips, code);
          const stateCode = fips.substring(0, 2);
          const stateAbbr = STATE_FIPS[stateCode];
          if (stateAbbr) statesInMetro.add(stateAbbr);
        }

        for (const st of statesInMetro) {
          if (!stateMetros.has(st)) stateMetros.set(st, []);
          stateMetros.get(st)!.push({ cbsaCode: code, countyCount: entry.countyFips.length });
        }
      }

      // Build state→metro priority: use hardcoded primary override, then county count
      const stateMap = new Map<string, string[]>();
      for (const [state, metros] of stateMetros) {
        const primaryOverride = STATE_PRIMARY_CBSA[state];
        if (primaryOverride) {
          // Put the override first, then the rest sorted by county count
          const rest = metros.filter((m: { cbsaCode: string }) => m.cbsaCode !== primaryOverride);
          rest.sort((a: { countyCount: number }, b: { countyCount: number }) => b.countyCount - a.countyCount);
          const codes = [primaryOverride, ...rest.map((m: { cbsaCode: string }) => m.cbsaCode)];
          stateMap.set(state, codes);
        } else {
          metros.sort((a: { countyCount: number }, b: { countyCount: number }) => b.countyCount - a.countyCount);
          stateMap.set(state, metros.map((m: { cbsaCode: string }) => m.cbsaCode));
        }
      }

      cachedCbsaData = map;
      fipsToCbsa = reverse;
      stateToCbsa = stateMap;
      return map;
    });

  return cbsaPromise;
}

/**
 * Get the reverse lookup map (county FIPS → CBSA code)
 * Only available after loadCbsaMetros() resolves
 */
export function getFipsToCbsaMap(): Map<string, string> | null {
  return fipsToCbsa;
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
 * Helper: initialize or get a MetroData entry in the map
 */
function getOrCreateEntry(map: Map<string, MetroData>, cbsaCode: string, metro: CbsaMetro): MetroData {
  let entry = map.get(cbsaCode);
  if (!entry) {
    entry = {
      cbsaCode,
      name: metro.name,
      shortName: metro.shortName,
      svgX: metro.svgX,
      svgY: metro.svgY,
      revenue: 0,
      units: 0,
      orders: 0,
      customers: new Set(),
      categories: {},
      topCategory: '',
      countyFips: metro.countyFips,
      contributingZips: new Set(),
      statesSpanned: new Set(),
      genderRevenue: {},
      customerTypeRevenue: {},
    };
    map.set(cbsaCode, entry);
  }
  return entry;
}

/**
 * Helper: accumulate a sale into a MetroData entry
 */
function accumulateSale(entry: MetroData, sale: SalesRecord, zip?: string, state?: string) {
  const rev = (sale.shippedAtNet || 0) + (sale.returnedAtNet || 0);
  entry.revenue += rev;
  entry.units += (sale.unitsShipped || 0) + (sale.unitsReturned || 0);
  entry.orders += 1;
  if (sale.customer) entry.customers.add(sale.customer);
  if (zip) entry.contributingZips.add(zip);
  if (state) entry.statesSpanned.add(state);

  const cat = sale.categoryDesc || 'Other';
  entry.categories[cat] = (entry.categories[cat] || 0) + rev;

  // Gender breakdown
  const gender = getGenderFromDivision(sale.divisionDesc);
  entry.genderRevenue[gender] = (entry.genderRevenue[gender] || 0) + rev;

  // Customer type breakdown
  const types = (sale.customerType || '').split(',').map(t => t.trim()).filter(Boolean);
  for (const ct of types) {
    entry.customerTypeRevenue[ct] = (entry.customerTypeRevenue[ct] || 0) + rev;
  }
}

/**
 * Aggregate sales into metro-level data
 * Dual pipeline:
 *   1. sale.shipToZip → county FIPS (via zipMap) → CBSA code (precise)
 *   2. sale.shipToState → primary CBSA for state (fallback when no zip)
 */
export function aggregateSalesByMetro(
  sales: SalesRecord[],
  zipMap: ZipToCountyMap,
  cbsaMetros: Map<string, CbsaMetro>,
): Map<string, MetroData> {
  if (!fipsToCbsa) return new Map();

  const map = new Map<string, MetroData>();

  for (const sale of sales) {
    // ── Try zip-based mapping first (most precise) ──
    const zip = (sale.shipToZip || sale.billToZip || '').trim().substring(0, 5);
    if (zip && zip.length >= 5) {
      const countyInfo = zipMap[zip];
      if (countyInfo) {
        const cbsaCode = fipsToCbsa.get(countyInfo.fips);
        if (cbsaCode) {
          const metro = cbsaMetros.get(cbsaCode);
          if (metro) {
            const entry = getOrCreateEntry(map, cbsaCode, metro);
            accumulateSale(entry, sale, zip, countyInfo.state);
            continue; // done with this sale
          }
        }
      }
    }

    // ── Fallback: state-based mapping ──
    // Assign to the primary (largest) metro in the state
    if (!stateToCbsa) continue;
    const stateRaw = (sale.shipToState || sale.billToState || '').trim().toUpperCase();
    if (!stateRaw || stateRaw.length < 2) continue;

    const stateAbbr = stateRaw.length === 2 ? stateRaw : '';
    if (!stateAbbr) continue;

    const metrosInState = stateToCbsa.get(stateAbbr);
    if (!metrosInState || metrosInState.length === 0) continue;

    // Assign to the primary metro (largest by county count)
    const primaryCbsa = metrosInState[0];
    const metro = cbsaMetros.get(primaryCbsa);
    if (!metro) continue;

    const entry = getOrCreateEntry(map, primaryCbsa, metro);
    accumulateSale(entry, sale, undefined, stateAbbr);
  }

  // Compute top category per metro
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

  return map;
}
