/**
 * Geographic utilities for county-level drill-down
 * Handles topology loading, county filtering, and projection fitting
 */

import { geoPath, geoAlbersUsa, geoConicEqualArea } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Topology } from 'topojson-specification';
import type { FeatureCollection, Feature, GeoJsonProperties } from 'geojson';

// State abbreviation to FIPS code mapping
export const STATE_FIPS: Record<string, number> = {
  AL: 1, AK: 2, AZ: 4, AR: 5, CA: 6, CO: 8, CT: 9, DE: 10,
  DC: 11, FL: 12, GA: 13, HI: 15, ID: 16, IL: 17, IN: 18, IA: 19,
  KS: 20, KY: 21, LA: 22, ME: 23, MD: 24, MA: 25, MI: 26, MN: 27,
  MS: 28, MO: 29, MT: 30, NE: 31, NV: 32, NH: 33, NJ: 34, NM: 35,
  NY: 36, NC: 37, ND: 38, OH: 39, OK: 40, OR: 41, PA: 42, RI: 44,
  SC: 45, SD: 46, TN: 47, TX: 48, UT: 49, VT: 50, VA: 51, WA: 53,
  WV: 54, WI: 55, WY: 56,
};

export interface ZipToCountyEntry {
  fips: string;
  county: string;
  state: string;
}

export type ZipToCountyMap = Record<string, ZipToCountyEntry>;

// Module-level caches
let cachedTopology: Topology | null = null;
let cachedZipMap: ZipToCountyMap | null = null;
let topologyPromise: Promise<Topology> | null = null;
let zipMapPromise: Promise<ZipToCountyMap> | null = null;

/**
 * Load and cache the US counties TopoJSON (~800KB, fetched once)
 */
export async function loadCountyTopology(): Promise<Topology> {
  if (cachedTopology) return cachedTopology;
  if (topologyPromise) return topologyPromise;

  topologyPromise = fetch('/geo/counties-10m.json')
    .then(res => {
      if (!res.ok) throw new Error(`Failed to load county topology: ${res.status}`);
      return res.json();
    })
    .then(data => {
      cachedTopology = data;
      return data;
    });

  return topologyPromise;
}

/**
 * Load and cache the zip-to-county mapping (~1.9MB, fetched once)
 */
export async function loadZipToCountyMap(): Promise<ZipToCountyMap> {
  if (cachedZipMap) return cachedZipMap;
  if (zipMapPromise) return zipMapPromise;

  zipMapPromise = fetch('/geo/zip-to-county.json')
    .then(res => {
      if (!res.ok) throw new Error(`Failed to load zip-to-county map: ${res.status}`);
      return res.json();
    })
    .then(data => {
      cachedZipMap = data;
      return data;
    });

  return zipMapPromise;
}

/**
 * Extract county GeoJSON features for a given state from the topology
 * County FIPS codes encode state in first 2 digits (e.g., 06xxx = California)
 */
export function getCountiesForState(
  topology: Topology,
  stateAbbr: string,
): Feature<GeoJSON.Geometry, GeoJsonProperties>[] {
  const stateFips = STATE_FIPS[stateAbbr];
  if (stateFips === undefined) return [];

  const allCounties = feature(
    topology,
    topology.objects.counties,
  ) as FeatureCollection;

  return allCounties.features.filter(f => {
    const id = typeof f.id === 'string' ? parseInt(f.id, 10) : (f.id as number);
    return Math.floor(id / 1000) === stateFips;
  });
}

/**
 * Create a d3 projection and path generator fitted to a state's counties
 * Projects county GeoJSON features into SVG paths within the 960x620 viewBox
 */
export function createCountyPathGenerator(
  countyFeatures: Feature<GeoJSON.Geometry, GeoJsonProperties>[],
  stateAbbr: string,
) {
  if (countyFeatures.length === 0) return null;

  const fc: FeatureCollection = {
    type: 'FeatureCollection',
    features: countyFeatures,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let projection: any;

  if (stateAbbr === 'AK') {
    projection = geoConicEqualArea()
      .rotate([154, 0])
      .center([0, 62])
      .parallels([55, 65]);
  } else if (stateAbbr === 'HI') {
    projection = geoConicEqualArea()
      .rotate([157, 0])
      .center([0, 20.5])
      .parallels([19, 22]);
  } else {
    projection = geoAlbersUsa();
  }

  // Fit projection to viewBox with padding
  projection.fitExtent(
    [[30, 30], [930, 590]],
    fc,
  );

  return geoPath(projection);
}
