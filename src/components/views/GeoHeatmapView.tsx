'use client';

import { useMemo, useState, useCallback, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { SalesRecord, normalizeCategory, CUSTOMER_TYPE_LABELS } from '@/types/product';
import { matchesDivision } from '@/utils/divisionMap';
import { STATE_PATHS } from '@/lib/us-state-paths';
import {
  loadCountyTopology,
  loadZipToCountyMap,
  getCountiesForState,
  createCountyPathGenerator,
  type ZipToCountyMap,
} from '@/lib/geo-utils';
import { aggregateSalesByCounty, type CountyData } from '@/lib/county-data';
import { loadCbsaMetros, aggregateSalesByMetro, type CbsaMetro, type MetroData } from '@/lib/cbsa-data';
import { matchesSeason } from '@/lib/store';
import type { Topology } from 'topojson-specification';
import type { Feature, GeoJsonProperties } from 'geojson';

// State name lookup
const STATE_NAMES: Record<string, string> = {
  AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',
  CO:'Colorado',CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',
  HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',
  KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',
  MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',
  NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',
  NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',
  OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',
  SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',
  VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',
  DC:'District of Columbia',
};

// Normalize state input to 2-letter code
const STATE_NAME_TO_ABBR: Record<string, string> = {};
Object.entries(STATE_NAMES).forEach(([abbr, name]) => {
  STATE_NAME_TO_ABBR[name.toUpperCase()] = abbr;
  STATE_NAME_TO_ABBR[abbr] = abbr;
});

function normalizeState(raw: string): string {
  if (!raw) return '';
  const upper = raw.trim().toUpperCase();
  if (STATE_NAME_TO_ABBR[upper]) return STATE_NAME_TO_ABBR[upper];
  const abbr = upper.substring(0, 2);
  if (STATE_NAMES[abbr]) return abbr;
  return '';
}

type MetricKey = 'revenue' | 'units' | 'orders' | 'avgOrder';

interface StateData {
  state: string;
  stateName: string;
  revenue: number;
  shippedAtNet: number;
  units: number;
  unitsShipped: number;
  orders: number;
  customers: Set<string>;
  categories: Record<string, number>;
  topCategory: string;
  genderRevenue: Record<string, number>;
  customerTypeRevenue: Record<string, number>;
}

/** Derive gender from divisionDesc */
function getGenderFromDivision(divisionDesc: string): string {
  if (!divisionDesc) return 'Unknown';
  const lower = divisionDesc.toLowerCase();
  if (lower.includes("men's") && !lower.includes("women's")) return "Men's";
  if (lower === 'm' || lower === '01') return "Men's";
  if (lower.includes("women's") || lower.includes("woman")) return "Women's";
  if (lower === 'w' || lower === '02') return "Women's";
  if (lower.includes("unisex") || lower.includes("accessories")) return "Unisex";
  if (lower === '08') return "Unisex";
  return "Unknown";
}

const GENDER_COLORS: Record<string, string> = {
  "Men's": '#2563eb',
  "Women's": '#9333ea',
  "Unisex": '#6b7280',
  "Unknown": '#4b5563',
};

const CTYPE_COLORS: Record<string, string> = {
  'WH': '#0a84ff',
  'WD': '#30d158',
  'BB': '#ff9f0a',
  'EC': '#bf5af2',
  'PS': '#ff453a',
  'KI': '#64d2ff',
};

/** Format YYYY-MM-DD to readable short date (e.g., "Jan 15, 2025") */
function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Reusable demographic breakdown bar + legend */
function DemographicBreakdown({
  title,
  data,
  totalRevenue,
  colorMap,
  labelMap,
  fmtFn,
}: {
  title: string;
  data: Record<string, number>;
  totalRevenue: number;
  colorMap: Record<string, string>;
  labelMap?: Record<string, string>;
  fmtFn: (n: number) => string;
}) {
  const sorted = Object.entries(data).sort(([, a], [, b]) => b - a);
  if (sorted.length === 0) return null;

  return (
    <div>
      <h4 className="text-xs font-medium text-[#8e8e93] uppercase tracking-wider mb-2">{title}</h4>
      {/* Stacked bar */}
      <div className="flex h-3 rounded-full overflow-hidden bg-[#2a2a32] mb-2">
        {sorted.map(([key, rev]) => {
          const pct = totalRevenue > 0 ? (rev / totalRevenue) * 100 : 0;
          if (pct < 0.5) return null;
          return (
            <div
              key={key}
              className="h-full"
              style={{ width: `${pct}%`, backgroundColor: colorMap[key] || '#6b7280' }}
              title={`${labelMap?.[key] || key}: ${fmtFn(rev)} (${pct.toFixed(0)}%)`}
            />
          );
        })}
      </div>
      {/* Legend */}
      <div className="space-y-1">
        {sorted.map(([key, rev]) => {
          const pct = totalRevenue > 0 ? (rev / totalRevenue) * 100 : 0;
          return (
            <div key={key} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: colorMap[key] || '#6b7280' }} />
                <span className="text-[#f5f5f7]">{labelMap?.[key] || key}</span>
              </div>
              <span className="text-[#8e8e93]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                {fmtFn(rev)} ({pct.toFixed(0)}%)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Shared metric value getter
function getMetricValue(d: { revenue: number; units: number; orders: number }, metric: MetricKey): number {
  switch (metric) {
    case 'revenue': return d.revenue;
    case 'units': return d.units;
    case 'orders': return d.orders;
    case 'avgOrder': return d.orders > 0 ? d.revenue / d.orders : 0;
  }
}

// Color scale — blue intensity (shared between state and county)
function computeColor(value: number, maxValue: number): string {
  if (value === 0) return '#1a1a22';
  const ratio = Math.pow(value / maxValue, 0.5);
  const r = Math.round(10 + ratio * 10);
  const g = Math.round(20 + ratio * 100);
  const b = Math.round(40 + ratio * 215);
  return `rgb(${r}, ${g}, ${b})`;
}

interface GeoHeatmapViewProps {
  sales: SalesRecord[];
  selectedSeason: string;
  selectedDivision: string;
  selectedCategory: string;
  selectedCustomerType: string;
  selectedCustomer: string;
}

export default function GeoHeatmapView({
  sales, selectedSeason, selectedDivision, selectedCategory,
  selectedCustomerType, selectedCustomer,
}: GeoHeatmapViewProps) {
  // State-level state
  const [hoveredState, setHoveredState] = useState<string | null>(null);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [metric, setMetric] = useState<MetricKey>('revenue');
  const [showTable, setShowTable] = useState(true);

  // County drill-down state
  const [drilledState, setDrilledState] = useState<string | null>(null);
  const [countyTopology, setCountyTopology] = useState<Topology | null>(null);
  const [zipToCounty, setZipToCounty] = useState<ZipToCountyMap | null>(null);
  const [isLoadingGeo, setIsLoadingGeo] = useState(false);
  const [hoveredCounty, setHoveredCounty] = useState<string | null>(null);
  const [selectedCounty, setSelectedCounty] = useState<string | null>(null);

  // Metro bubble overlay state
  const [showMetroBubbles, setShowMetroBubbles] = useState(true);
  const [cbsaMetros, setCbsaMetros] = useState<Map<string, CbsaMetro> | null>(null);
  const [hoveredMetro, setHoveredMetro] = useState<string | null>(null);
  const [selectedMetro, setSelectedMetro] = useState<string | null>(null);
  const [tableMode, setTableMode] = useState<'states' | 'metros' | 'cities'>('states');
  const [quickGender, setQuickGender] = useState<string | null>(null);

  // Date range filter state (local to this view)
  const [dateStart, setDateStart] = useState<string>('');
  const [dateEnd, setDateEnd] = useState<string>('');

  // Load CBSA metro data + zip map on mount
  useEffect(() => {
    let cancelled = false;
    Promise.all([loadCbsaMetros(), loadZipToCountyMap()])
      .then(([metros, zipMap]) => {
        if (!cancelled) {
          setCbsaMetros(metros);
          setZipToCounty(zipMap);
        }
      })
      .catch(err => console.error('Failed to load metro data:', err));
    return () => { cancelled = true; };
  }, []);

  // Filter sales by all active filters
  const filteredSales = useMemo(() => {
    return sales.filter((s) => {
      if (!matchesSeason(s.season, selectedSeason)) return false;
      if (selectedDivision && !matchesDivision(s.divisionDesc, selectedDivision)) return false;
      if (selectedCategory && normalizeCategory(s.categoryDesc) !== selectedCategory) return false;
      if (selectedCustomerType && !(s.customerType || '').split(',').some(t => t.trim() === selectedCustomerType)) return false;
      if (selectedCustomer && s.customer !== selectedCustomer) return false;
      if (quickGender && getGenderFromDivision(s.divisionDesc) !== quickGender) return false;
      // Date range filter
      if (dateStart || dateEnd) {
        const saleDate = s.invoiceDate ? new Date(s.invoiceDate) : null;
        if (!saleDate) return false; // Exclude sales without dates when date filter active
        if (dateStart && saleDate < new Date(dateStart)) return false;
        if (dateEnd) {
          const end = new Date(dateEnd);
          end.setDate(end.getDate() + 1); // Make end date inclusive
          if (saleDate >= end) return false;
        }
      }
      return true;
    });
  }, [sales, selectedSeason, selectedDivision, selectedCategory, selectedCustomerType, selectedCustomer, quickGender, dateStart, dateEnd]);

  // Aggregate sales by state
  const { stateData, maxValue, totalRevenue, totalUnits, statesWithData } = useMemo(() => {
    const map = new Map<string, StateData>();

    for (const sale of filteredSales) {
      const raw = sale.shipToState || sale.billToState || '';
      const code = normalizeState(raw);
      if (!code) continue;

      let entry = map.get(code);
      if (!entry) {
        entry = {
          state: code,
          stateName: STATE_NAMES[code] || code,
          revenue: 0, shippedAtNet: 0, units: 0, unitsShipped: 0,
          orders: 0, customers: new Set(), categories: {}, topCategory: '',
          genderRevenue: {}, customerTypeRevenue: {},
        };
        map.set(code, entry);
      }

      const rev = sale.shippedAtNet || sale.revenue || 0;
      entry.revenue += rev;
      entry.shippedAtNet += sale.shippedAtNet || 0;
      entry.units += sale.unitsShipped || sale.unitsBooked || 0;
      entry.unitsShipped += sale.unitsShipped || 0;
      entry.orders += 1;
      if (sale.customer) entry.customers.add(sale.customer);
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

    Array.from(map.values()).forEach(entry => {
      let topCat = '';
      let topRev = 0;
      for (const [cat, revVal] of Object.entries(entry.categories)) {
        if ((revVal as number) > topRev) { topCat = cat; topRev = revVal as number; }
      }
      entry.topCategory = topCat;
    });

    const values = Array.from(map.values());
    const maxVal = Math.max(...values.map(d => getMetricValue(d, metric)), 1);
    const totalRev = values.reduce((sum, d) => sum + d.revenue, 0);
    const totalU = values.reduce((sum, d) => sum + d.units, 0);

    return { stateData: map, maxValue: maxVal, totalRevenue: totalRev, totalUnits: totalU, statesWithData: values.length };
  }, [filteredSales, metric]);

  // Sort states by selected metric for table
  const sortedStates = useMemo(() => {
    return Array.from(stateData.values()).sort((a, b) => getMetricValue(b, metric) - getMetricValue(a, metric));
  }, [stateData, metric]);

  // --- Metro bubble data ---
  const { metroData, metroMaxValue, metroTotalRevenue } = useMemo(() => {
    if (!cbsaMetros || !zipToCounty) {
      return { metroData: new Map<string, MetroData>(), metroMaxValue: 1, metroTotalRevenue: 0 };
    }
    const data = aggregateSalesByMetro(filteredSales, zipToCounty, cbsaMetros);
    const values = Array.from(data.values());
    const maxVal = Math.max(...values.map(d => getMetricValue(d, metric)), 1);
    const totalRev = values.reduce((sum, d) => sum + d.revenue, 0);
    return { metroData: data, metroMaxValue: maxVal, metroTotalRevenue: totalRev };
  }, [filteredSales, metric, cbsaMetros, zipToCounty]);

  const sortedMetros = useMemo(() => {
    return Array.from(metroData.values()).sort((a, b) => getMetricValue(b, metric) - getMetricValue(a, metric));
  }, [metroData, metric]);

  // --- City aggregation ---
  const { cityData: sortedCities, cityTotalRevenue } = useMemo(() => {
    const map = new Map<string, {
      cityKey: string;
      city: string;
      state: string;
      stateName: string;
      revenue: number;
      units: number;
      orders: number;
      customers: Set<string>;
      categories: Record<string, number>;
      topCategory: string;
      genderRevenue: Record<string, number>;
      customerTypeRevenue: Record<string, number>;
    }>();

    for (const sale of filteredSales) {
      const rawCity = (sale.shipToCity || sale.billToCity || '').trim();
      const rawState = sale.shipToState || sale.billToState || '';
      const stateCode = normalizeState(rawState);
      if (!rawCity || !stateCode) continue;

      const cityNorm = rawCity.toUpperCase();
      const key = `${cityNorm}|${stateCode}`;

      let entry = map.get(key);
      if (!entry) {
        // Title-case the city name
        const cityDisplay = rawCity.replace(/\b\w/g, c => c.toUpperCase()).replace(/\B\w+/g, w => w.toLowerCase());
        entry = {
          cityKey: key,
          city: cityDisplay,
          state: stateCode,
          stateName: STATE_NAMES[stateCode] || stateCode,
          revenue: 0, units: 0, orders: 0,
          customers: new Set(),
          categories: {},
          topCategory: '',
          genderRevenue: {},
          customerTypeRevenue: {},
        };
        map.set(key, entry);
      }

      const rev = sale.shippedAtNet || sale.revenue || 0;
      entry.revenue += rev;
      entry.units += sale.unitsShipped || sale.unitsBooked || 0;
      entry.orders += 1;
      if (sale.customer) entry.customers.add(sale.customer);
      const cat = sale.categoryDesc || 'Other';
      entry.categories[cat] = (entry.categories[cat] || 0) + rev;

      const gender = getGenderFromDivision(sale.divisionDesc);
      entry.genderRevenue[gender] = (entry.genderRevenue[gender] || 0) + rev;
      const ctypes = (sale.customerType || '').split(',').map(t => t.trim()).filter(Boolean);
      for (const ct of ctypes) {
        entry.customerTypeRevenue[ct] = (entry.customerTypeRevenue[ct] || 0) + rev;
      }
    }

    // Compute top category for each city
    for (const entry of map.values()) {
      let topCat = '';
      let topRev = 0;
      for (const [cat, revVal] of Object.entries(entry.categories)) {
        if ((revVal as number) > topRev) { topCat = cat; topRev = revVal as number; }
      }
      entry.topCategory = topCat;
    }

    const sorted = Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
    const totalRev = sorted.reduce((sum, d) => sum + d.revenue, 0);
    return { cityData: sorted, cityTotalRevenue: totalRev };
  }, [filteredSales]);

  // Only show top 50 metros on the map — data-driven, highlights where sales actually are
  const visibleMetros = useMemo(() => sortedMetros.slice(0, 50), [sortedMetros]);

  // Bubble radius: sqrt scale for area-proportional sizing
  function getMetroBubbleRadius(cbsaCode: string): number {
    const data = metroData.get(cbsaCode);
    if (!data) return 0;
    const value = getMetricValue(data, metric);
    if (value === 0) return 0;
    const MIN_RADIUS = 6;
    const MAX_RADIUS = 40;
    const ratio = Math.sqrt(value / metroMaxValue);
    return MIN_RADIUS + ratio * (MAX_RADIUS - MIN_RADIUS);
  }

  // --- County drill-down data ---

  const countyFeatures = useMemo(() => {
    if (!drilledState || !countyTopology) return [];
    return getCountiesForState(countyTopology, drilledState);
  }, [drilledState, countyTopology]);

  const countyPathGen = useMemo(() => {
    if (!countyFeatures.length || !drilledState) return null;
    return createCountyPathGenerator(countyFeatures, drilledState);
  }, [countyFeatures, drilledState]);

  const { countyDataMap, countyMaxValue, countyTotalRevenue, countyTotalUnits, countyCoverage, countiesWithData } = useMemo(() => {
    if (!drilledState || !zipToCounty) {
      return { countyDataMap: new Map<string, CountyData>(), countyMaxValue: 1, countyTotalRevenue: 0, countyTotalUnits: 0, countyCoverage: 0, countiesWithData: 0 };
    }

    const { countyData: cdMap, totalStateRevenue, mappedRevenue } = aggregateSalesByCounty(filteredSales, zipToCounty, drilledState);
    const values = Array.from(cdMap.values());
    const maxVal = Math.max(...values.map(d => getMetricValue(d, metric)), 1);
    const totalRev = values.reduce((sum, d) => sum + d.revenue, 0);
    const totalU = values.reduce((sum, d) => sum + d.units, 0);
    const coverage = totalStateRevenue > 0 ? (mappedRevenue / totalStateRevenue) * 100 : 0;

    return { countyDataMap: cdMap, countyMaxValue: maxVal, countyTotalRevenue: totalRev, countyTotalUnits: totalU, countyCoverage: coverage, countiesWithData: values.length };
  }, [drilledState, zipToCounty, filteredSales, metric]);

  // Sort counties for table
  const sortedCounties = useMemo(() => {
    return Array.from(countyDataMap.values()).sort((a, b) => getMetricValue(b, metric) - getMetricValue(a, metric));
  }, [countyDataMap, metric]);

  // Drill-down handler
  const handleDrillDown = useCallback(async (stateCode: string) => {
    if (!stateData.has(stateCode)) return;
    setIsLoadingGeo(true);
    try {
      const [topo, zipMap] = await Promise.all([
        loadCountyTopology(),
        loadZipToCountyMap(),
      ]);
      setCountyTopology(topo);
      setZipToCounty(zipMap);
      setDrilledState(stateCode);
      setSelectedCounty(null);
      setHoveredCounty(null);
    } catch (err) {
      console.error('Failed to load county data:', err);
    } finally {
      setIsLoadingGeo(false);
    }
  }, [stateData]);

  const handleBackToStates = useCallback(() => {
    setDrilledState(null);
    setSelectedCounty(null);
    setHoveredCounty(null);
  }, []);

  // Color helpers
  function getStateColor(stateCode: string): string {
    const data = stateData.get(stateCode);
    if (!data) return '#1a1a22';
    return computeColor(getMetricValue(data, metric), maxValue);
  }

  function getCountyColor(fips: string): string {
    const data = countyDataMap.get(fips);
    if (!data) return '#1a1a22';
    return computeColor(getMetricValue(data, metric), countyMaxValue);
  }

  // Formatting
  const fmt = (n: number) => {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
    return `$${n.toFixed(0)}`;
  };

  const fmtUnits = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
  };

  // Active detail data
  const activeState = selectedState || hoveredState;
  const activeStateData = activeState ? stateData.get(activeState) : null;
  const activeCountyFips = selectedCounty || hoveredCounty;
  const activeCountyData = activeCountyFips ? countyDataMap.get(activeCountyFips) : null;
  const activeMetroCbsa = selectedMetro || hoveredMetro;
  const activeMetroData = activeMetroCbsa ? metroData.get(activeMetroCbsa) : null;

  // Determine which detail to show
  const isDrilled = drilledState !== null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          {isDrilled ? (
            <div className="flex items-center gap-3">
              <button
                onClick={handleBackToStates}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#0a84ff] bg-[#0a84ff]/10 rounded-lg hover:bg-[#0a84ff]/20 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                US Map
              </button>
              <div>
                <h2 className="text-xl font-semibold text-[#f5f5f7]" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                  {STATE_NAMES[drilledState!]} Counties
                </h2>
                <p className="text-sm text-[#8e8e93]">
                  {countiesWithData} counties &middot; {fmt(countyTotalRevenue)} revenue &middot; {fmtUnits(countyTotalUnits)} units
                  {countyCoverage < 100 && (
                    <span className="ml-2 text-[#ff9f0a]">({countyCoverage.toFixed(0)}% mapped by zip)</span>
                  )}
                </p>
              </div>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-semibold text-[#f5f5f7]" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                Geographic Sales Heat Map
              </h2>
              <p className="text-sm text-[#8e8e93]">
                {statesWithData} states with sales data &middot; {fmt(totalRevenue)} total revenue &middot; {fmtUnits(totalUnits)} units
                {(dateStart || dateEnd) && (
                  <span className="text-[#64d2ff]">
                    {' '}&middot; {dateStart && dateEnd ? `${formatDateLabel(dateStart)} – ${formatDateLabel(dateEnd)}` : dateStart ? `From ${formatDateLabel(dateStart)}` : `Through ${formatDateLabel(dateEnd)}`}
                  </span>
                )}
              </p>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Quick Gender Filter Chips */}
          {!isDrilled && (
            <div className="flex gap-1">
              {(["Men's", "Women's", "Unisex"] as const).map(g => (
                <button
                  key={g}
                  onClick={() => setQuickGender(quickGender === g ? null : g)}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors border ${
                    quickGender === g
                      ? 'text-white border-transparent'
                      : 'text-[#636366] hover:text-[#8e8e93] border-[#2a2a32]'
                  }`}
                  style={quickGender === g ? { backgroundColor: GENDER_COLORS[g] } : undefined}
                >
                  {g}
                </button>
              ))}
            </div>
          )}
          {/* Date Range Filter */}
          {!isDrilled && (
            <div className="flex items-center gap-1.5 pl-2 border-l border-[#2a2a32]">
              <span className="text-[10px] text-[#636366] uppercase tracking-wider">From</span>
              <input
                type="date"
                value={dateStart}
                onChange={e => setDateStart(e.target.value)}
                className="bg-[#1c1c1e] border border-[#2a2a32] rounded-md px-1.5 py-1 text-xs text-[#f5f5f7] focus:border-[#0a84ff] focus:outline-none w-[120px] [color-scheme:dark]"
              />
              <span className="text-[10px] text-[#636366] uppercase tracking-wider">To</span>
              <input
                type="date"
                value={dateEnd}
                onChange={e => setDateEnd(e.target.value)}
                className="bg-[#1c1c1e] border border-[#2a2a32] rounded-md px-1.5 py-1 text-xs text-[#f5f5f7] focus:border-[#0a84ff] focus:outline-none w-[120px] [color-scheme:dark]"
              />
              {(dateStart || dateEnd) && (
                <button
                  onClick={() => { setDateStart(''); setDateEnd(''); }}
                  className="text-[#636366] hover:text-[#ff453a] transition-colors text-sm leading-none"
                  title="Clear date filter"
                >
                  ×
                </button>
              )}
            </div>
          )}
          {/* Metro Bubbles Toggle */}
          {!isDrilled && (
            <button
              onClick={() => setShowMetroBubbles(!showMetroBubbles)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                showMetroBubbles
                  ? 'bg-[#ff9f0a]/20 text-[#ff9f0a] border border-[#ff9f0a]/30'
                  : 'text-[#636366] hover:text-[#8e8e93] border border-[#2a2a32]'
              }`}
              title="Toggle metro area revenue bubbles"
            >
              Metro Areas
            </button>
          )}
          {/* Metric Toggle */}
          <div className="flex gap-1 bg-[#1c1c1e] rounded-lg p-1">
            {([
              { key: 'revenue' as MetricKey, label: 'Revenue' },
              { key: 'units' as MetricKey, label: 'Units' },
              { key: 'orders' as MetricKey, label: 'Orders' },
              { key: 'avgOrder' as MetricKey, label: 'Avg Order' },
            ]).map(m => (
              <button
                key={m.key}
                onClick={() => setMetric(m.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  metric === m.key
                    ? 'bg-[#0a84ff] text-white'
                    : 'text-[#8e8e93] hover:text-[#f5f5f7]'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Active filter indicator */}
      {(selectedDivision || selectedCategory || selectedCustomerType || selectedCustomer || quickGender || dateStart || dateEnd) && (
        <div className="flex items-center gap-2 px-3 py-2 bg-[#0a84ff]/5 border border-[#0a84ff]/20 rounded-lg text-xs">
          <span className="text-[#8e8e93]">Filtering:</span>
          {selectedDivision && <span className="px-2 py-0.5 bg-[#2563eb]/20 text-[#2563eb] rounded font-medium">{selectedDivision}</span>}
          {selectedCategory && <span className="px-2 py-0.5 bg-[#30d158]/20 text-[#30d158] rounded font-medium">{selectedCategory}</span>}
          {selectedCustomerType && <span className="px-2 py-0.5 bg-[#ff9f0a]/20 text-[#ff9f0a] rounded font-medium">{CUSTOMER_TYPE_LABELS[selectedCustomerType] || selectedCustomerType}</span>}
          {selectedCustomer && <span className="px-2 py-0.5 bg-[#bf5af2]/20 text-[#bf5af2] rounded font-medium truncate max-w-[200px]">{selectedCustomer}</span>}
          {quickGender && <span className="px-2 py-0.5 rounded font-medium" style={{ backgroundColor: `${GENDER_COLORS[quickGender]}33`, color: GENDER_COLORS[quickGender] }}>{quickGender}</span>}
          {dateStart && <span className="px-2 py-0.5 bg-[#64d2ff]/20 text-[#64d2ff] rounded font-medium">From: {formatDateLabel(dateStart)}</span>}
          {dateEnd && <span className="px-2 py-0.5 bg-[#64d2ff]/20 text-[#64d2ff] rounded font-medium">To: {formatDateLabel(dateEnd)}</span>}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Map */}
        <div className="xl:col-span-2 bg-[#131316] rounded-xl border border-[#2a2a32] p-4 relative">
          {/* Loading overlay */}
          {isLoadingGeo && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#131316]/80 rounded-xl z-10">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-[#0a84ff] border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-[#8e8e93]">Loading county boundaries...</span>
              </div>
            </div>
          )}

          <svg
            viewBox="0 0 960 620"
            className="w-full h-auto transition-opacity duration-200"
            style={{ maxHeight: '500px' }}
          >
            {!isDrilled ? (
              <>
                {/* STATE VIEW */}
                {Object.entries(STATE_PATHS).map(([code, path]) => (
                  <path
                    key={code}
                    d={path}
                    fill={getStateColor(code)}
                    stroke={code === selectedState ? '#ff9f0a' : code === hoveredState ? '#64a0ff' : '#3a3a44'}
                    strokeWidth={code === selectedState ? 1 : code === hoveredState ? 1 : 0.5}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    shapeRendering="geometricPrecision"
                    vectorEffect="non-scaling-stroke"
                    paintOrder="stroke"
                    className="cursor-pointer transition-all duration-150"
                    onMouseEnter={() => setHoveredState(code)}
                    onMouseLeave={() => setHoveredState(null)}
                    onClick={() => setSelectedState(selectedState === code ? null : code)}
                    onDoubleClick={() => handleDrillDown(code)}
                  >
                    <title>{STATE_NAMES[code]}</title>
                  </path>
                ))}
                {/* State labels */}
                {Object.entries(STATE_PATHS).map(([code]) => {
                  const data = stateData.get(code);
                  if (!data) return null;
                  const path = STATE_PATHS[code];
                  const nums = path.match(/[\d.]+/g)?.map(Number) || [];
                  if (nums.length < 4) return null;
                  const xs = nums.filter((_, i) => i % 2 === 0);
                  const ys = nums.filter((_, i) => i % 2 === 1);
                  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
                  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
                  const width = Math.max(...xs) - Math.min(...xs);
                  if (width < 40) return null;
                  return (
                    <text key={`label-${code}`} x={cx} y={cy}
                      textAnchor="middle" dominantBaseline="central"
                      fill="#f5f5f7" fontSize="9" fontFamily="DM Sans, sans-serif"
                      fontWeight="600" pointerEvents="none" opacity={0.9}
                    >{code}</text>
                  );
                })}

                {/* METRO BUBBLE OVERLAY — top 50 by sales, visually tiered */}
                {showMetroBubbles && visibleMetros.length > 0 && (
                  <g className="metro-bubbles">
                    {/* Render largest first so smaller bubbles are clickable on top */}
                    {visibleMetros.map((metro, rank) => {
                      const r = getMetroBubbleRadius(metro.cbsaCode);
                      if (r === 0) return null;
                      const isHovered = hoveredMetro === metro.cbsaCode;
                      const isSelected = selectedMetro === metro.cbsaCode;
                      const isTop5 = rank < 5;
                      const isTop10 = rank < 10;
                      // Top 5: gold glow, Top 10: bright, Rest: standard
                      const fillOpacity = isTop5 ? 0.45 : isTop10 ? 0.35 : 0.25;
                      const strokeColor = isSelected ? '#ff9f0a'
                        : isHovered ? '#f5f5f7'
                        : isTop5 ? '#ff9f0a'
                        : isTop10 ? 'rgba(255, 159, 10, 0.8)'
                        : 'rgba(255, 159, 10, 0.5)';
                      const strokeW = isSelected || isHovered ? 2 : isTop5 ? 1.5 : 1;
                      return (
                        <g key={metro.cbsaCode}>
                          {/* Glow ring for top 5 */}
                          {isTop5 && (
                            <circle
                              cx={metro.svgX}
                              cy={metro.svgY}
                              r={r + 4}
                              fill="none"
                              stroke="rgba(255, 159, 10, 0.2)"
                              strokeWidth={2}
                              pointerEvents="none"
                            />
                          )}
                          <circle
                            cx={metro.svgX}
                            cy={metro.svgY}
                            r={isHovered || isSelected ? r + 2 : r}
                            fill={`rgba(255, 159, 10, ${fillOpacity})`}
                            stroke={strokeColor}
                            strokeWidth={strokeW}
                            className="cursor-pointer transition-all duration-150"
                            onMouseEnter={() => { setHoveredMetro(metro.cbsaCode); setHoveredState(null); }}
                            onMouseLeave={() => setHoveredMetro(null)}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedMetro(selectedMetro === metro.cbsaCode ? null : metro.cbsaCode);
                              setSelectedState(null);
                            }}
                          />
                          {/* Labels: always show for top 10, size-based for rest */}
                          {(isTop10 || r >= 14) && (
                            <text
                              x={metro.svgX}
                              y={metro.svgY}
                              textAnchor="middle"
                              dominantBaseline="central"
                              fill={isTop5 ? '#fff' : '#f5f5f7'}
                              fontSize={r >= 25 ? '8' : isTop10 ? '7' : '6.5'}
                              fontFamily="DM Sans, sans-serif"
                              fontWeight={isTop5 ? '700' : '600'}
                              pointerEvents="none"
                              opacity={isTop5 ? 1 : 0.9}
                            >
                              {metro.shortName}
                            </text>
                          )}
                        </g>
                      );
                    })}
                  </g>
                )}
              </>
            ) : (
              <>
                {/* COUNTY VIEW */}
                {countyFeatures.map((f: Feature<GeoJSON.Geometry, GeoJsonProperties>) => {
                  const fips = String(f.id).padStart(5, '0');
                  const d = countyPathGen?.(f) || '';
                  if (!d) return null;
                  const isSelected = selectedCounty === fips;
                  const isHovered = hoveredCounty === fips;
                  return (
                    <path
                      key={fips}
                      d={d}
                      fill={getCountyColor(fips)}
                      stroke={isSelected ? '#ff9f0a' : isHovered ? '#0a84ff' : '#2a2a32'}
                      strokeWidth={isSelected || isHovered ? 1.5 : 0.3}
                      className="cursor-pointer transition-all duration-150"
                      onMouseEnter={() => setHoveredCounty(fips)}
                      onMouseLeave={() => setHoveredCounty(null)}
                      onClick={() => setSelectedCounty(isSelected ? null : fips)}
                    >
                      <title>{countyDataMap.get(fips)?.countyName || f.properties?.name || `County ${fips}`}</title>
                    </path>
                  );
                })}
                {/* County labels for larger counties */}
                {countyFeatures.map((f: Feature<GeoJSON.Geometry, GeoJsonProperties>) => {
                  if (!countyPathGen) return null;
                  const bounds = countyPathGen.bounds(f);
                  const width = bounds[1][0] - bounds[0][0];
                  if (width < 50) return null;
                  const fips = String(f.id).padStart(5, '0');
                  const centroid = countyPathGen.centroid(f);
                  const data = countyDataMap.get(fips);
                  const name = data?.countyName || f.properties?.name;
                  if (!name) return null;
                  return (
                    <text key={`clabel-${fips}`} x={centroid[0]} y={centroid[1]}
                      textAnchor="middle" dominantBaseline="central"
                      fill={data ? '#f5f5f7' : '#636366'} fontSize="7" fontFamily="DM Sans, sans-serif"
                      fontWeight="500" pointerEvents="none" opacity={data ? 0.8 : 0.5}
                    >{name}</text>
                  );
                })}
              </>
            )}
          </svg>

          {/* Metro hover tooltip */}
          {hoveredMetro && metroData.has(hoveredMetro) && !isDrilled && (() => {
            const metro = metroData.get(hoveredMetro)!;
            const value = getMetricValue(metro, metric);
            return (
              <div
                className="absolute pointer-events-none bg-[#1c1c1e] border border-[#3a3a3c] rounded-lg px-3 py-2 shadow-xl z-20"
                style={{
                  left: `${(metro.svgX / 960) * 100}%`,
                  top: `${(metro.svgY / 620) * 100}%`,
                  transform: 'translate(-50%, -100%) translateY(-16px)',
                }}
              >
                <div className="text-xs font-semibold text-[#f5f5f7]">{metro.shortName}</div>
                <div className="text-xs text-[#ff9f0a]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                  {metric === 'revenue' || metric === 'avgOrder' ? fmt(value) : fmtUnits(value)}
                </div>
                <div className="text-[10px] text-[#636366]">
                  {metro.orders.toLocaleString()} orders · {metro.customers.size} customers
                </div>
              </div>
            );
          })()}

          {/* Legend */}
          <div className="flex items-center gap-3 mt-3 px-2">
            <span className="text-xs text-[#636366]">Low</span>
            <div className="flex-1 h-2 rounded-full" style={{
              background: 'linear-gradient(to right, #0a1428, #0a3466, #0a64cc, #0a84ff)',
            }} />
            <span className="text-xs text-[#636366]">High</span>
          </div>

          {/* Double-click hint */}
          {!isDrilled && (
            <div className="text-center mt-2">
              <span className="text-[10px] text-[#636366]">Double-click a state to drill into counties</span>
            </div>
          )}
        </div>

        {/* Detail Panel */}
        <div className="bg-[#131316] rounded-xl border border-[#2a2a32] p-4 space-y-4">
          {isDrilled && activeCountyData ? (
            /* County detail */
            <>
              <div>
                <h3 className="text-lg font-semibold text-[#f5f5f7]" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                  {activeCountyData.countyName}
                </h3>
                <span className="text-xs text-[#8e8e93]">FIPS {activeCountyData.fips} &middot; {activeCountyData.zipCodes.size} zip codes</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#1c1c1e] rounded-lg p-3">
                  <div className="text-xs text-[#8e8e93] mb-1">Revenue</div>
                  <div className="text-lg font-bold text-[#0a84ff]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    {fmt(activeCountyData.revenue)}
                  </div>
                  <div className="text-xs text-[#636366]">
                    {countyTotalRevenue > 0 ? ((activeCountyData.revenue / countyTotalRevenue) * 100).toFixed(1) : 0}% of state
                  </div>
                </div>
                <div className="bg-[#1c1c1e] rounded-lg p-3">
                  <div className="text-xs text-[#8e8e93] mb-1">Units</div>
                  <div className="text-lg font-bold text-[#30d158]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    {fmtUnits(activeCountyData.units)}
                  </div>
                  <div className="text-xs text-[#636366]">
                    {countyTotalUnits > 0 ? ((activeCountyData.units / countyTotalUnits) * 100).toFixed(1) : 0}% of state
                  </div>
                </div>
                <div className="bg-[#1c1c1e] rounded-lg p-3">
                  <div className="text-xs text-[#8e8e93] mb-1">Orders</div>
                  <div className="text-lg font-bold text-[#f5f5f7]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    {activeCountyData.orders.toLocaleString()}
                  </div>
                </div>
                <div className="bg-[#1c1c1e] rounded-lg p-3">
                  <div className="text-xs text-[#8e8e93] mb-1">Customers</div>
                  <div className="text-lg font-bold text-[#bf5af2]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    {activeCountyData.customers.size}
                  </div>
                </div>
                <div className="bg-[#1c1c1e] rounded-lg p-3 col-span-2">
                  <div className="text-xs text-[#8e8e93] mb-1">Avg Order Value</div>
                  <div className="text-lg font-bold text-[#ff9f0a]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    {activeCountyData.orders > 0 ? fmt(activeCountyData.revenue / activeCountyData.orders) : '$0'}
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-medium text-[#8e8e93] uppercase tracking-wider mb-2">Top Categories</h4>
                <div className="space-y-2">
                  {Object.entries(activeCountyData.categories)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 5)
                    .map(([cat, rev]) => {
                      const pct = activeCountyData.revenue > 0 ? (rev / activeCountyData.revenue) * 100 : 0;
                      return (
                        <div key={cat}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-[#f5f5f7]">{cat}</span>
                            <span className="text-[#8e8e93]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                              {fmt(rev)} ({pct.toFixed(0)}%)
                            </span>
                          </div>
                          <div className="h-1.5 bg-[#2a2a32] rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-[#0a84ff]" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
              <DemographicBreakdown
                title="Gender Breakdown"
                data={activeCountyData.genderRevenue}
                totalRevenue={activeCountyData.revenue}
                colorMap={GENDER_COLORS}
                fmtFn={fmt}
              />
              <DemographicBreakdown
                title="Channel Breakdown"
                data={activeCountyData.customerTypeRevenue}
                totalRevenue={activeCountyData.revenue}
                colorMap={CTYPE_COLORS}
                labelMap={CUSTOMER_TYPE_LABELS}
                fmtFn={fmt}
              />
            </>
          ) : isDrilled ? (
            /* Drilled but no county selected */
            <div className="flex flex-col items-center justify-center h-full text-center py-12">
              <div className="text-4xl mb-3">🏘️</div>
              <div className="text-sm text-[#8e8e93]">
                Hover or click a county to see details
              </div>
              <div className="text-xs text-[#636366] mt-1">
                {countiesWithData} counties with sales data in {STATE_NAMES[drilledState!]}
              </div>
            </div>
          ) : !isDrilled && activeMetroData ? (
            /* Metro detail */
            <>
              <div>
                <h3 className="text-lg font-semibold text-[#f5f5f7]" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                  {activeMetroData.shortName}
                </h3>
                <span className="text-xs text-[#8e8e93]">
                  {activeMetroData.name} · {activeMetroData.countyFips.length} counties
                  {activeMetroData.statesSpanned.size > 1 && ` · ${Array.from(activeMetroData.statesSpanned).join(', ')}`}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#1c1c1e] rounded-lg p-3">
                  <div className="text-xs text-[#8e8e93] mb-1">Revenue</div>
                  <div className="text-lg font-bold text-[#ff9f0a]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    {fmt(activeMetroData.revenue)}
                  </div>
                  <div className="text-xs text-[#636366]">
                    {metroTotalRevenue > 0 ? ((activeMetroData.revenue / metroTotalRevenue) * 100).toFixed(1) : 0}% of metro total
                  </div>
                </div>
                <div className="bg-[#1c1c1e] rounded-lg p-3">
                  <div className="text-xs text-[#8e8e93] mb-1">Units</div>
                  <div className="text-lg font-bold text-[#30d158]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    {fmtUnits(activeMetroData.units)}
                  </div>
                </div>
                <div className="bg-[#1c1c1e] rounded-lg p-3">
                  <div className="text-xs text-[#8e8e93] mb-1">Orders</div>
                  <div className="text-lg font-bold text-[#f5f5f7]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    {activeMetroData.orders.toLocaleString()}
                  </div>
                </div>
                <div className="bg-[#1c1c1e] rounded-lg p-3">
                  <div className="text-xs text-[#8e8e93] mb-1">Customers</div>
                  <div className="text-lg font-bold text-[#bf5af2]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    {activeMetroData.customers.size}
                  </div>
                </div>
                <div className="bg-[#1c1c1e] rounded-lg p-3">
                  <div className="text-xs text-[#8e8e93] mb-1">Avg Order Value</div>
                  <div className="text-lg font-bold text-[#ff9f0a]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    {activeMetroData.orders > 0 ? fmt(activeMetroData.revenue / activeMetroData.orders) : '$0'}
                  </div>
                </div>
                <div className="bg-[#1c1c1e] rounded-lg p-3">
                  <div className="text-xs text-[#8e8e93] mb-1">Zip Codes</div>
                  <div className="text-lg font-bold text-[#f5f5f7]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    {activeMetroData.contributingZips.size}
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-medium text-[#8e8e93] uppercase tracking-wider mb-2">Top Categories</h4>
                <div className="space-y-2">
                  {Object.entries(activeMetroData.categories)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 5)
                    .map(([cat, rev]) => {
                      const pct = activeMetroData.revenue > 0 ? (rev / activeMetroData.revenue) * 100 : 0;
                      return (
                        <div key={cat}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-[#f5f5f7]">{cat}</span>
                            <span className="text-[#8e8e93]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                              {fmt(rev)} ({pct.toFixed(0)}%)
                            </span>
                          </div>
                          <div className="h-1.5 bg-[#2a2a32] rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-[#ff9f0a]" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
              <DemographicBreakdown
                title="Gender Breakdown"
                data={activeMetroData.genderRevenue}
                totalRevenue={activeMetroData.revenue}
                colorMap={GENDER_COLORS}
                fmtFn={fmt}
              />
              <DemographicBreakdown
                title="Channel Breakdown"
                data={activeMetroData.customerTypeRevenue}
                totalRevenue={activeMetroData.revenue}
                colorMap={CTYPE_COLORS}
                labelMap={CUSTOMER_TYPE_LABELS}
                fmtFn={fmt}
              />
            </>
          ) : activeStateData ? (
            /* State detail (existing) */
            <>
              <div>
                <h3 className="text-lg font-semibold text-[#f5f5f7]" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                  {activeStateData.stateName}
                </h3>
                <span className="text-xs text-[#8e8e93]">{activeStateData.state}</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#1c1c1e] rounded-lg p-3">
                  <div className="text-xs text-[#8e8e93] mb-1">Revenue</div>
                  <div className="text-lg font-bold text-[#0a84ff]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    {fmt(activeStateData.revenue)}
                  </div>
                  <div className="text-xs text-[#636366]">
                    {totalRevenue > 0 ? ((activeStateData.revenue / totalRevenue) * 100).toFixed(1) : 0}% of total
                  </div>
                </div>
                <div className="bg-[#1c1c1e] rounded-lg p-3">
                  <div className="text-xs text-[#8e8e93] mb-1">Units</div>
                  <div className="text-lg font-bold text-[#30d158]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    {fmtUnits(activeStateData.units)}
                  </div>
                  <div className="text-xs text-[#636366]">
                    {totalUnits > 0 ? ((activeStateData.units / totalUnits) * 100).toFixed(1) : 0}% of total
                  </div>
                </div>
                <div className="bg-[#1c1c1e] rounded-lg p-3">
                  <div className="text-xs text-[#8e8e93] mb-1">Orders</div>
                  <div className="text-lg font-bold text-[#f5f5f7]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    {activeStateData.orders.toLocaleString()}
                  </div>
                </div>
                <div className="bg-[#1c1c1e] rounded-lg p-3">
                  <div className="text-xs text-[#8e8e93] mb-1">Customers</div>
                  <div className="text-lg font-bold text-[#bf5af2]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    {activeStateData.customers.size}
                  </div>
                </div>
                <div className="bg-[#1c1c1e] rounded-lg p-3 col-span-2">
                  <div className="text-xs text-[#8e8e93] mb-1">Avg Order Value</div>
                  <div className="text-lg font-bold text-[#ff9f0a]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    {activeStateData.orders > 0 ? fmt(activeStateData.revenue / activeStateData.orders) : '$0'}
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-medium text-[#8e8e93] uppercase tracking-wider mb-2">Top Categories</h4>
                <div className="space-y-2">
                  {Object.entries(activeStateData.categories)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 5)
                    .map(([cat, rev]) => {
                      const pct = activeStateData.revenue > 0 ? (rev / activeStateData.revenue) * 100 : 0;
                      return (
                        <div key={cat}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-[#f5f5f7]">{cat}</span>
                            <span className="text-[#8e8e93]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                              {fmt(rev)} ({pct.toFixed(0)}%)
                            </span>
                          </div>
                          <div className="h-1.5 bg-[#2a2a32] rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-[#0a84ff]" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
              <DemographicBreakdown
                title="Gender Breakdown"
                data={activeStateData.genderRevenue}
                totalRevenue={activeStateData.revenue}
                colorMap={GENDER_COLORS}
                fmtFn={fmt}
              />
              <DemographicBreakdown
                title="Channel Breakdown"
                data={activeStateData.customerTypeRevenue}
                totalRevenue={activeStateData.revenue}
                colorMap={CTYPE_COLORS}
                labelMap={CUSTOMER_TYPE_LABELS}
                fmtFn={fmt}
              />
            </>
          ) : (
            /* No selection */
            <div className="flex flex-col items-center justify-center h-full text-center py-12">
              <div className="text-4xl mb-3">🗺️</div>
              <div className="text-sm text-[#8e8e93]">
                Hover or click a state to see details
              </div>
              <div className="text-xs text-[#636366] mt-1">
                {statesWithData} states with sales data
              </div>
              <div className="text-xs text-[#636366] mt-2">
                Double-click to drill into counties
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Rankings Table */}
      <div className="bg-[#131316] rounded-xl border border-[#2a2a32]">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            {!isDrilled ? (
              <>
                <button
                  onClick={() => { setTableMode('states'); setShowTable(true); }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    tableMode === 'states'
                      ? 'bg-[#0a84ff]/20 text-[#0a84ff]'
                      : 'text-[#636366] hover:text-[#8e8e93]'
                  }`}
                >
                  State Rankings
                </button>
                <button
                  onClick={() => { setTableMode('metros'); setShowTable(true); }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    tableMode === 'metros'
                      ? 'bg-[#ff9f0a]/20 text-[#ff9f0a]'
                      : 'text-[#636366] hover:text-[#8e8e93]'
                  }`}
                >
                  Metro Rankings
                </button>
                <button
                  onClick={() => { setTableMode('cities'); setShowTable(true); }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    tableMode === 'cities'
                      ? 'bg-[#30d158]/20 text-[#30d158]'
                      : 'text-[#636366] hover:text-[#8e8e93]'
                  }`}
                >
                  City Rankings
                </button>
              </>
            ) : (
              <h3 className="text-sm font-semibold text-[#f5f5f7]" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                {STATE_NAMES[drilledState!]} County Rankings
              </h3>
            )}
          </div>
          <button onClick={() => setShowTable(!showTable)} className="text-xs text-[#636366] hover:text-[#8e8e93]">
            {showTable ? '▼' : '▶'} {isDrilled ? `${sortedCounties.length} counties` : tableMode === 'metros' ? `${sortedMetros.length} metros (top ${visibleMetros.length} on map)` : tableMode === 'cities' ? `Top 25 of ${sortedCities.length} cities` : `${sortedStates.length} states`}
          </button>
        </div>

        {showTable && (
          <div className="overflow-x-auto">
            {isDrilled ? (
              /* County rankings table */
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-t border-[#2a2a32] text-[#8e8e93]">
                    <th className="text-left px-4 py-2 font-medium">#</th>
                    <th className="text-left px-4 py-2 font-medium">County</th>
                    <th className="text-right px-4 py-2 font-medium">Revenue</th>
                    <th className="text-right px-4 py-2 font-medium">% Share</th>
                    <th className="text-right px-4 py-2 font-medium">Units</th>
                    <th className="text-right px-4 py-2 font-medium">Orders</th>
                    <th className="text-right px-4 py-2 font-medium">Customers</th>
                    <th className="text-right px-4 py-2 font-medium">Avg Order</th>
                    <th className="text-right px-4 py-2 font-medium">Zips</th>
                    <th className="text-left px-4 py-2 font-medium">Top Category</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedCounties.map((d, i) => {
                    const share = countyTotalRevenue > 0 ? (d.revenue / countyTotalRevenue) * 100 : 0;
                    return (
                      <tr
                        key={d.fips}
                        className={`border-t border-[#1c1c1e] hover:bg-[#1c1c1e] cursor-pointer transition-colors ${
                          d.fips === selectedCounty ? 'bg-[#0a84ff]/10' : ''
                        }`}
                        onClick={() => setSelectedCounty(selectedCounty === d.fips ? null : d.fips)}
                        onMouseEnter={() => setHoveredCounty(d.fips)}
                        onMouseLeave={() => setHoveredCounty(null)}
                      >
                        <td className="px-4 py-2 text-[#636366]">{i + 1}</td>
                        <td className="px-4 py-2 text-[#f5f5f7] font-medium">{d.countyName}</td>
                        <td className="px-4 py-2 text-right text-[#f5f5f7]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                          {fmt(d.revenue)}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 h-1.5 bg-[#2a2a32] rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-[#0a84ff]" style={{ width: `${Math.min(share, 100)}%` }} />
                            </div>
                            <span className="text-[#8e8e93] w-12 text-right" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                              {share.toFixed(1)}%
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right text-[#f5f5f7]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                          {fmtUnits(d.units)}
                        </td>
                        <td className="px-4 py-2 text-right text-[#f5f5f7]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                          {d.orders.toLocaleString()}
                        </td>
                        <td className="px-4 py-2 text-right text-[#bf5af2]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                          {d.customers.size}
                        </td>
                        <td className="px-4 py-2 text-right text-[#ff9f0a]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                          {d.orders > 0 ? fmt(d.revenue / d.orders) : '-'}
                        </td>
                        <td className="px-4 py-2 text-right text-[#8e8e93]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                          {d.zipCodes.size}
                        </td>
                        <td className="px-4 py-2 text-[#8e8e93]">{d.topCategory}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : tableMode === 'metros' ? (
              /* Metro rankings table */
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-t border-[#2a2a32] text-[#8e8e93]">
                    <th className="text-left px-4 py-2 font-medium">#</th>
                    <th className="text-left px-4 py-2 font-medium">Metro Area</th>
                    <th className="text-right px-4 py-2 font-medium">Revenue</th>
                    <th className="text-right px-4 py-2 font-medium">% Share</th>
                    <th className="text-right px-4 py-2 font-medium">Units</th>
                    <th className="text-right px-4 py-2 font-medium">Orders</th>
                    <th className="text-right px-4 py-2 font-medium">Customers</th>
                    <th className="text-right px-4 py-2 font-medium">Avg Order</th>
                    <th className="text-right px-4 py-2 font-medium">Zips</th>
                    <th className="text-left px-4 py-2 font-medium">Top Category</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedMetros.map((d, i) => {
                    const share = metroTotalRevenue > 0 ? (d.revenue / metroTotalRevenue) * 100 : 0;
                    return (
                      <tr
                        key={d.cbsaCode}
                        className={`border-t border-[#1c1c1e] hover:bg-[#1c1c1e] cursor-pointer transition-colors ${
                          d.cbsaCode === selectedMetro ? 'bg-[#ff9f0a]/10' : ''
                        }`}
                        onClick={() => setSelectedMetro(selectedMetro === d.cbsaCode ? null : d.cbsaCode)}
                        onMouseEnter={() => setHoveredMetro(d.cbsaCode)}
                        onMouseLeave={() => setHoveredMetro(null)}
                      >
                        <td className="px-4 py-2 text-[#636366]">{i + 1}</td>
                        <td className="px-4 py-2 text-[#f5f5f7] font-medium">
                          {d.shortName}
                          {d.statesSpanned.size > 1 && (
                            <span className="text-[#636366] ml-1">({Array.from(d.statesSpanned).join('/')})</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right text-[#f5f5f7]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                          {fmt(d.revenue)}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 h-1.5 bg-[#2a2a32] rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-[#ff9f0a]" style={{ width: `${Math.min(share, 100)}%` }} />
                            </div>
                            <span className="text-[#8e8e93] w-12 text-right" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                              {share.toFixed(1)}%
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right text-[#f5f5f7]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                          {fmtUnits(d.units)}
                        </td>
                        <td className="px-4 py-2 text-right text-[#f5f5f7]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                          {d.orders.toLocaleString()}
                        </td>
                        <td className="px-4 py-2 text-right text-[#bf5af2]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                          {d.customers.size}
                        </td>
                        <td className="px-4 py-2 text-right text-[#ff9f0a]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                          {d.orders > 0 ? fmt(d.revenue / d.orders) : '-'}
                        </td>
                        <td className="px-4 py-2 text-right text-[#8e8e93]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                          {d.contributingZips.size}
                        </td>
                        <td className="px-4 py-2 text-[#8e8e93]">{d.topCategory}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : tableMode === 'cities' ? (
              /* City rankings table — top 25 */
              sortedCities.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center border-t border-[#2a2a32]">
                  <div className="text-3xl mb-3">🏙️</div>
                  <div className="text-sm text-[#8e8e93]">No city data available</div>
                  <div className="text-xs text-[#636366] mt-1 max-w-sm">
                    City rankings require &ldquo;Ship To City&rdquo; or &ldquo;Bill To City&rdquo; fields in your sales data.
                    Try importing a detailed sales report that includes city-level shipping info.
                  </div>
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-t border-[#2a2a32] text-[#8e8e93]">
                      <th className="text-left px-4 py-2 font-medium">#</th>
                      <th className="text-left px-4 py-2 font-medium">City</th>
                      <th className="text-left px-4 py-2 font-medium">State</th>
                      <th className="text-right px-4 py-2 font-medium">Revenue</th>
                      <th className="text-right px-4 py-2 font-medium">% Share</th>
                      <th className="text-right px-4 py-2 font-medium">Units</th>
                      <th className="text-right px-4 py-2 font-medium">Orders</th>
                      <th className="text-right px-4 py-2 font-medium">Customers</th>
                      <th className="text-right px-4 py-2 font-medium">Avg Order</th>
                      <th className="text-left px-4 py-2 font-medium">Top Category</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedCities.slice(0, 25).map((d, i) => {
                      const share = cityTotalRevenue > 0 ? (d.revenue / cityTotalRevenue) * 100 : 0;
                      return (
                        <tr
                          key={d.cityKey}
                          className="border-t border-[#1c1c1e] hover:bg-[#1c1c1e] transition-colors"
                        >
                          <td className="px-4 py-2 text-[#636366]">{i + 1}</td>
                          <td className="px-4 py-2 text-[#f5f5f7] font-medium">{d.city}</td>
                          <td className="px-4 py-2 text-[#8e8e93]">{d.stateName} <span className="text-[#636366]">({d.state})</span></td>
                          <td className="px-4 py-2 text-right text-[#f5f5f7]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                            {fmt(d.revenue)}
                          </td>
                          <td className="px-4 py-2 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 h-1.5 bg-[#2a2a32] rounded-full overflow-hidden">
                                <div className="h-full rounded-full bg-[#30d158]" style={{ width: `${Math.min(share, 100)}%` }} />
                              </div>
                              <span className="text-[#8e8e93] w-12 text-right" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                                {share.toFixed(1)}%
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-2 text-right text-[#f5f5f7]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                            {fmtUnits(d.units)}
                          </td>
                          <td className="px-4 py-2 text-right text-[#f5f5f7]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                            {d.orders.toLocaleString()}
                          </td>
                          <td className="px-4 py-2 text-right text-[#bf5af2]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                            {d.customers.size}
                          </td>
                          <td className="px-4 py-2 text-right text-[#ff9f0a]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                            {d.orders > 0 ? fmt(d.revenue / d.orders) : '-'}
                          </td>
                          <td className="px-4 py-2 text-[#8e8e93]">{d.topCategory}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )
            ) : (
              /* State rankings table (existing) */
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-t border-[#2a2a32] text-[#8e8e93]">
                    <th className="text-left px-4 py-2 font-medium">#</th>
                    <th className="text-left px-4 py-2 font-medium">State</th>
                    <th className="text-right px-4 py-2 font-medium">Revenue</th>
                    <th className="text-right px-4 py-2 font-medium">% Share</th>
                    <th className="text-right px-4 py-2 font-medium">Units</th>
                    <th className="text-right px-4 py-2 font-medium">Orders</th>
                    <th className="text-right px-4 py-2 font-medium">Customers</th>
                    <th className="text-right px-4 py-2 font-medium">Avg Order</th>
                    <th className="text-left px-4 py-2 font-medium">Top Category</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedStates.map((d, i) => {
                    const share = totalRevenue > 0 ? (d.revenue / totalRevenue) * 100 : 0;
                    return (
                      <tr
                        key={d.state}
                        className={`border-t border-[#1c1c1e] hover:bg-[#1c1c1e] cursor-pointer transition-colors ${
                          d.state === selectedState ? 'bg-[#0a84ff]/10' : ''
                        }`}
                        onClick={() => setSelectedState(selectedState === d.state ? null : d.state)}
                        onDoubleClick={() => handleDrillDown(d.state)}
                        onMouseEnter={() => setHoveredState(d.state)}
                        onMouseLeave={() => setHoveredState(null)}
                      >
                        <td className="px-4 py-2 text-[#636366]">{i + 1}</td>
                        <td className="px-4 py-2 text-[#f5f5f7] font-medium">
                          {d.stateName}
                          <span className="text-[#636366] ml-1">({d.state})</span>
                        </td>
                        <td className="px-4 py-2 text-right text-[#f5f5f7]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                          {fmt(d.revenue)}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 h-1.5 bg-[#2a2a32] rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-[#0a84ff]" style={{ width: `${Math.min(share, 100)}%` }} />
                            </div>
                            <span className="text-[#8e8e93] w-12 text-right" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                              {share.toFixed(1)}%
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right text-[#f5f5f7]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                          {fmtUnits(d.units)}
                        </td>
                        <td className="px-4 py-2 text-right text-[#f5f5f7]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                          {d.orders.toLocaleString()}
                        </td>
                        <td className="px-4 py-2 text-right text-[#bf5af2]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                          {d.customers.size}
                        </td>
                        <td className="px-4 py-2 text-right text-[#ff9f0a]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                          {d.orders > 0 ? fmt(d.revenue / d.orders) : '-'}
                        </td>
                        <td className="px-4 py-2 text-[#8e8e93]">{d.topCategory}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
