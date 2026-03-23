/**
 * Geographic coordinate utilities for the Leaflet heat map.
 * Loads city→lat/lng lookup and builds heat points from sales data.
 */

import type { SalesRecord } from '@/types/product';

// ── Types ──
export type CityCoords = Record<string, [number, number]>; // "CITY|ST" → [lat, lng]
export type StateCentroids = Record<string, [number, number]>; // "ST" → [lat, lng]
export type HeatPoint = [number, number, number]; // [lat, lng, intensity]

export type ZipCentroids = Record<string, [number, number]>; // "XXXXX" → [lat, lng]

// ── Module-level caches ──
let cachedCityCoords: CityCoords | null = null;
let cachedStateCentroids: StateCentroids | null = null;
let cachedZipCentroids: ZipCentroids | null = null;
let cityPromise: Promise<CityCoords> | null = null;
let centroidPromise: Promise<StateCentroids> | null = null;
let zipPromise: Promise<ZipCentroids> | null = null;

// Full state name → abbreviation mapping
const STATE_NAME_TO_ABBR: Record<string, string> = {
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
  'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
  'district of columbia': 'DC', 'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI',
  'idaho': 'ID', 'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA',
  'kansas': 'KS', 'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME',
  'maryland': 'MD', 'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN',
  'mississippi': 'MS', 'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE',
  'nevada': 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM',
  'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH',
  'oklahoma': 'OK', 'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI',
  'south carolina': 'SC', 'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX',
  'utah': 'UT', 'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA',
  'west virginia': 'WV', 'wisconsin': 'WI', 'wyoming': 'WY',
};

/** Normalize a state value to 2-letter abbreviation */
function normalizeState(state: string): string {
  const s = state.trim();
  if (s.length === 2) return s.toUpperCase();
  return STATE_NAME_TO_ABBR[s.toLowerCase()] || s.toUpperCase().substring(0, 2);
}

// ── Loaders ──

export async function loadCityCoords(): Promise<CityCoords> {
  if (cachedCityCoords) return cachedCityCoords;
  if (cityPromise) return cityPromise;
  cityPromise = fetch('/geo/us-city-coords.json')
    .then(r => r.json())
    .then((data: CityCoords) => {
      cachedCityCoords = data;
      return data;
    });
  return cityPromise;
}

export async function loadStateCentroids(): Promise<StateCentroids> {
  if (cachedStateCentroids) return cachedStateCentroids;
  if (centroidPromise) return centroidPromise;
  centroidPromise = fetch('/geo/state-centroids.json')
    .then(r => r.json())
    .then((data: StateCentroids) => {
      cachedStateCentroids = data;
      return data;
    });
  return centroidPromise;
}

export async function loadZipCentroids(): Promise<ZipCentroids> {
  if (cachedZipCentroids) return cachedZipCentroids;
  if (zipPromise) return zipPromise;
  zipPromise = fetch('/geo/zip-centroids.json')
    .then(r => r.json())
    .then((data: ZipCentroids) => {
      cachedZipCentroids = data;
      return data;
    });
  return zipPromise;
}

// ── Heat Point Builder ──

type MetricKey = 'revenue' | 'units' | 'orders' | 'avgOrder';

/**
 * Build heat map data points from sales records.
 * Aggregates by city to produce ~2K-5K points instead of hundreds of thousands.
 */
export function buildHeatPoints(
  sales: SalesRecord[],
  metric: MetricKey,
  cityCoords: CityCoords | null,
  stateCentroids: StateCentroids | null,
): HeatPoint[] {
  if (!cityCoords || !stateCentroids || sales.length === 0) return [];

  // Aggregate by city|state
  const cityAgg = new Map<string, { revenue: number; units: number; orders: number }>();

  for (const sale of sales) {
    // Determine city and state
    const city = (sale.shipToCity || sale.billToCity || '').trim().toUpperCase();
    const rawState = sale.shipToState || sale.billToState || '';
    if (!rawState) continue;
    const state = normalizeState(rawState);

    const key = city ? `${city}|${state}` : `__STATE__|${state}`;
    let agg = cityAgg.get(key);
    if (!agg) {
      agg = { revenue: 0, units: 0, orders: 0 };
      cityAgg.set(key, agg);
    }

    // Use invoice revenue (shippedAtNet) if available, otherwise booking revenue
    const rev = (sale.shippedAtNet || 0) + (sale.revenue || 0);
    const units = (sale.unitsShipped || 0) + (sale.unitsBooked || 0);
    agg.revenue += rev;
    agg.units += units;
    agg.orders += 1;
  }

  // Convert to heat points with coordinates
  const points: HeatPoint[] = [];

  for (const [key, agg] of cityAgg) {
    let coords: [number, number] | null = null;

    if (key.startsWith('__STATE__|')) {
      // State-only fallback
      const st = key.split('|')[1];
      if (stateCentroids[st]) coords = stateCentroids[st];
    } else {
      // Try city lookup
      if (cityCoords[key]) {
        coords = cityCoords[key];
      } else {
        // Try without state-specific variations
        const st = key.split('|')[1];
        if (stateCentroids[st]) coords = stateCentroids[st];
      }
    }

    if (!coords) continue;

    let intensity: number;
    switch (metric) {
      case 'revenue': intensity = agg.revenue; break;
      case 'units': intensity = agg.units; break;
      case 'orders': intensity = agg.orders; break;
      case 'avgOrder': intensity = agg.orders > 0 ? agg.revenue / agg.orders : 0; break;
    }

    if (intensity > 0) {
      points.push([coords[0], coords[1], intensity]);
    }
  }

  return points;
}

// ── ZIP Code Aggregation ──

export interface ZipAggregation {
  zip: string;
  lat: number;
  lng: number;
  revenue: number;
  units: number;
  orders: number;
  state: string;
}

/**
 * Aggregate invoice/sales data by ZIP code and return with coordinates.
 * Returns sorted by revenue descending.
 */
export function buildZipAggregations(
  sales: SalesRecord[],
  zipCentroids: ZipCentroids | null,
): ZipAggregation[] {
  if (!zipCentroids || sales.length === 0) return [];

  const zipAgg = new Map<string, { revenue: number; units: number; orders: number; state: string }>();

  for (const sale of sales) {
    const zip = (sale.shipToZip || sale.billToZip || '').trim().padStart(5, '0');
    if (!zip || zip === '00000' || zip.length !== 5) continue;

    const state = normalizeState(sale.shipToState || sale.billToState || '');

    let agg = zipAgg.get(zip);
    if (!agg) {
      agg = { revenue: 0, units: 0, orders: 0, state };
      zipAgg.set(zip, agg);
    }

    const rev = (sale.shippedAtNet || 0) + (sale.revenue || 0);
    const units = (sale.unitsShipped || 0) + (sale.unitsBooked || 0);
    agg.revenue += rev;
    agg.units += units;
    agg.orders += 1;
  }

  const results: ZipAggregation[] = [];

  for (const [zip, agg] of zipAgg) {
    const coords = zipCentroids[zip];
    if (!coords) continue;

    results.push({
      zip,
      lat: coords[0],
      lng: coords[1],
      revenue: agg.revenue,
      units: agg.units,
      orders: agg.orders,
      state: agg.state,
    });
  }

  return results.sort((a, b) => b.revenue - a.revenue);
}
