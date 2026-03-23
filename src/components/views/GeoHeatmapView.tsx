'use client';

import { useMemo, useState, useEffect } from 'react';
import { SalesRecord, InvoiceRecord, normalizeCategory, CUSTOMER_TYPE_LABELS } from '@/types/product';
import { matchesDivision } from '@/utils/divisionMap';
import {
  loadZipToCountyMap,
  type ZipToCountyMap,
} from '@/lib/geo-utils';
import { loadCbsaMetros, aggregateSalesByMetro, type MetroData } from '@/lib/cbsa-data';
import { matchesSeason } from '@/lib/store';
import { loadCityCoords, loadStateCentroids, buildHeatPoints, type CityCoords, type StateCentroids } from '@/lib/geo-coords';
import retryDynamic from '@/lib/retryDynamic';
import type { MetroMarker } from '@/components/geo/LeafletHeatMap';

const LeafletHeatMap = retryDynamic(() => import('@/components/geo/LeafletHeatMap'));

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
  if (lower.includes("women") || lower.includes("woman")) return "Women's";
  if (lower === 'w' || lower === '02') return "Women's";
  if (lower.includes("men")) return "Men's";
  if (lower === 'm' || lower === '01') return "Men's";
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

interface GeoHeatmapViewProps {
  sales: SalesRecord[];
  invoices?: InvoiceRecord[];
  selectedSeason: string;
  selectedDivision: string;
  selectedCategory: string;
  selectedCustomerType: string;
  selectedCustomer: string;
}

export default function GeoHeatmapView({
  sales, invoices = [], selectedSeason, selectedDivision, selectedCategory,
  selectedCustomerType, selectedCustomer,
}: GeoHeatmapViewProps) {
  // State-level state
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [metric, setMetric] = useState<MetricKey>('revenue');
  const [showTable, setShowTable] = useState(true);

  // Metro bubble overlay state
  const [showMetroBubbles, setShowMetroBubbles] = useState(true);
  const [cbsaMetros, setCbsaMetros] = useState<Map<string, import('@/lib/cbsa-data').CbsaMetro> | null>(null);
  const [zipToCounty, setZipToCounty] = useState<ZipToCountyMap | null>(null);
  const [hoveredMetro, setHoveredMetro] = useState<string | null>(null);
  const [selectedMetro, setSelectedMetro] = useState<string | null>(null);
  const [tableMode, setTableMode] = useState<'states' | 'metros' | 'cities'>('states');
  const [quickGender, setQuickGender] = useState<string | null>(null);

  // City coordinate lookups for heat map
  const [cityCoords, setCityCoords] = useState<CityCoords | null>(null);
  const [stateCentroidsData, setStateCentroidsData] = useState<StateCentroids | null>(null);

  // Month/Year filter state (local to this view)
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState<string>('');

  // Derive dateStart/dateEnd from month + year selections
  const dateStart = useMemo(() => {
    if (!selectedYear) return '';
    const month = selectedMonth || '01';
    return `${selectedYear}-${month}-01`;
  }, [selectedMonth, selectedYear]);

  const dateEnd = useMemo(() => {
    if (!selectedYear) return '';
    const month = selectedMonth || '12';
    const y = parseInt(selectedYear);
    const m = parseInt(month);
    const lastDay = new Date(y, m, 0).getDate();
    return `${selectedYear}-${month}-${String(lastDay).padStart(2, '0')}`;
  }, [selectedMonth, selectedYear]);

  // Available years and months from the invoice data
  const { availableYears, availableMonths } = useMemo(() => {
    const years = new Set<string>();
    const months = new Set<string>();
    for (const s of sales) {
      if (!s.invoiceDate) continue;
      const d = new Date(s.invoiceDate);
      if (isNaN(d.getTime())) continue;
      years.add(String(d.getFullYear()));
      months.add(String(d.getMonth() + 1).padStart(2, '0'));
    }
    return {
      availableYears: Array.from(years).sort(),
      availableMonths: Array.from(months).sort(),
    };
  }, [sales]);

  // Load CBSA metro data + zip map + city coords + state centroids on mount
  useEffect(() => {
    let cancelled = false;
    Promise.all([loadCbsaMetros(), loadZipToCountyMap(), loadCityCoords(), loadStateCentroids()])
      .then(([metros, zipMap, coords, centroids]) => {
        if (!cancelled) {
          setCbsaMetros(metros);
          setZipToCounty(zipMap);
          setCityCoords(coords);
          setStateCentroidsData(centroids);
        }
      })
      .catch(err => console.error('Failed to load geo data:', err));
    return () => { cancelled = true; };
  }, []);

  // Merge invoices into sales-compatible records for geographic display
  const allGeoRecords = useMemo(() => {
    // Convert InvoiceRecords to SalesRecord-compatible shape
    const invoiceAsSales: SalesRecord[] = invoices.map((inv, i) => ({
      id: inv.id || `inv-${i}`,
      styleNumber: inv.styleNumber,
      styleDesc: inv.styleDesc || '',
      colorCode: inv.colorCode,
      colorDesc: inv.colorDesc || '',
      season: inv.season,
      customer: inv.customer,
      customerType: inv.customerType || '',
      divisionDesc: inv.divisionDesc || '',
      categoryDesc: inv.categoryDesc || '',
      gender: inv.gender,
      orderType: inv.orderType,
      shipToState: inv.shipToState,
      shipToCity: inv.shipToCity,
      shipToZip: inv.shipToZip,
      billToState: inv.billToState,
      billToCity: inv.billToCity,
      billToZip: inv.billToZip,
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.invoiceDate,
      shippedAtNet: inv.shippedAtNet || 0,
      returnedAtNet: inv.returnedAtNet || 0,
      unitsShipped: inv.unitsShipped || 0,
      unitsReturned: inv.unitsReturned || 0,
      revenue: inv.shippedAtNet || 0,
      unitsBooked: inv.unitsShipped || 0,
      cost: 0,
    }));

    // Prefer invoices (have geo data), fall back to sales with geo data
    return [...invoiceAsSales, ...sales.filter(s => s.shipToState || s.billToState)];
  }, [sales, invoices]);

  // Filter by all active filters
  const filteredSales = useMemo(() => {
    return allGeoRecords.filter((s) => {
      if (!matchesSeason(s.season, selectedSeason)) return false;
      if (selectedDivision && !matchesDivision(s.divisionDesc, selectedDivision)) return false;
      if (selectedCategory && normalizeCategory(s.categoryDesc) !== selectedCategory) return false;
      if (selectedCustomerType && !(s.customerType || '').split(',').some(t => t.trim() === selectedCustomerType)) return false;
      if (selectedCustomer && s.customer !== selectedCustomer) return false;
      if (quickGender && getGenderFromDivision(s.divisionDesc) !== quickGender) return false;
      // Date range filter
      if (dateStart || dateEnd) {
        const saleDate = s.invoiceDate ? new Date(s.invoiceDate) : null;
        if (!saleDate) return false;
        if (dateStart && saleDate < new Date(dateStart)) return false;
        if (dateEnd) {
          const end = new Date(dateEnd);
          end.setDate(end.getDate() + 1);
          if (saleDate >= end) return false;
        }
      }
      return true;
    });
  }, [allGeoRecords, selectedSeason, selectedDivision, selectedCategory, selectedCustomerType, selectedCustomer, quickGender, dateStart, dateEnd]);

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

      const rev = (sale.shippedAtNet || 0) + (sale.returnedAtNet || 0);
      entry.revenue += rev;
      entry.shippedAtNet += rev;
      entry.units += (sale.unitsShipped || 0) + (sale.unitsReturned || 0);
      entry.unitsShipped += (sale.unitsShipped || 0) + (sale.unitsReturned || 0);
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

      const rev = sale.shippedAtNet || 0;
      entry.revenue += rev;
      entry.units += sale.unitsShipped || 0;
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

  // Only show top 50 metros on the map
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

  // Formatting (must be defined before metroMarkers useMemo that references them)
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

  // --- Heat map points ---
  const heatPoints = useMemo(() => {
    return buildHeatPoints(filteredSales, metric, cityCoords, stateCentroidsData);
  }, [filteredSales, metric, cityCoords, stateCentroidsData]);

  const heatMaxIntensity = useMemo(() => {
    if (heatPoints.length === 0) return 1;
    return Math.max(...heatPoints.map(p => p[2]));
  }, [heatPoints]);

  // --- Metro markers for the Leaflet map ---
  const metroMarkers: MetroMarker[] = useMemo(() => {
    if (!cbsaMetros) return [];
    return visibleMetros.map((metro, index) => {
      const cbsa = cbsaMetros.get(metro.cbsaCode);
      if (!cbsa || !cbsa.lat || !cbsa.lng) return null;
      const value = getMetricValue(metro, metric);
      const formattedValue = metric === 'revenue' || metric === 'avgOrder'
        ? fmt(value)
        : fmtUnits(value);
      return {
        cbsaCode: metro.cbsaCode,
        name: metro.shortName,
        lat: cbsa.lat,
        lng: cbsa.lng,
        radius: getMetroBubbleRadius(metro.cbsaCode),
        value,
        formattedValue,
        rank: index + 1,
        isSelected: selectedMetro === metro.cbsaCode,
        isHovered: hoveredMetro === metro.cbsaCode,
      } satisfies MetroMarker;
    }).filter((m): m is MetroMarker => m !== null);
  }, [visibleMetros, cbsaMetros, metric, metroMaxValue, selectedMetro, hoveredMetro]);

  // Active detail data
  const activeStateData = selectedState ? stateData.get(selectedState) : null;
  const activeMetroCbsa = selectedMetro || hoveredMetro;
  const activeMetroData = activeMetroCbsa ? metroData.get(activeMetroCbsa) : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-[#f5f5f7]" style={{ fontFamily: 'DM Sans, sans-serif' }}>
            Geographic Sales Heat Map
          </h2>
          <p className="text-sm text-[#8e8e93]">
            {statesWithData} states with sales data &middot; {fmt(totalRevenue)} total revenue &middot; {fmtUnits(totalUnits)} units
            {(selectedMonth || selectedYear) && (
              <span className="text-[#64d2ff]">
                {' '}&middot; {selectedMonth ? new Date(2000, parseInt(selectedMonth) - 1).toLocaleString('en-US', { month: 'long' }) : ''}{selectedMonth && selectedYear ? ' ' : ''}{selectedYear || ''}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Quick Gender Filter Chips */}
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
          {/* Month / Year Filter */}
          <div className="flex items-center gap-1.5 pl-2 border-l border-[#2a2a32]">
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              className="bg-[#1c1c1e] border border-[#2a2a32] rounded-md px-1.5 py-1 text-xs text-[#f5f5f7] focus:border-[#0a84ff] focus:outline-none [color-scheme:dark]"
            >
              <option value="">All Months</option>
              {availableMonths.map(m => (
                <option key={m} value={m}>
                  {new Date(2000, parseInt(m) - 1).toLocaleString('en-US', { month: 'long' })}
                </option>
              ))}
            </select>
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(e.target.value)}
              className="bg-[#1c1c1e] border border-[#2a2a32] rounded-md px-1.5 py-1 text-xs text-[#f5f5f7] focus:border-[#0a84ff] focus:outline-none [color-scheme:dark]"
            >
              <option value="">All Years</option>
              {availableYears.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            {(selectedMonth || selectedYear) && (
              <button
                onClick={() => { setSelectedMonth(''); setSelectedYear(''); }}
                className="text-[#636366] hover:text-[#ff453a] transition-colors text-sm leading-none"
                title="Clear date filter"
              >
                ×
              </button>
            )}
          </div>
          {/* Metro Bubbles Toggle */}
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
      {(selectedDivision || selectedCategory || selectedCustomerType || selectedCustomer || quickGender || selectedMonth || selectedYear) && (
        <div className="flex items-center gap-2 px-3 py-2 bg-[#0a84ff]/5 border border-[#0a84ff]/20 rounded-lg text-xs">
          <span className="text-[#8e8e93]">Filtering:</span>
          {selectedDivision && <span className="px-2 py-0.5 bg-[#2563eb]/20 text-[#2563eb] rounded font-medium">{selectedDivision}</span>}
          {selectedCategory && <span className="px-2 py-0.5 bg-[#30d158]/20 text-[#30d158] rounded font-medium">{selectedCategory}</span>}
          {selectedCustomerType && <span className="px-2 py-0.5 bg-[#ff9f0a]/20 text-[#ff9f0a] rounded font-medium">{CUSTOMER_TYPE_LABELS[selectedCustomerType] || selectedCustomerType}</span>}
          {selectedCustomer && <span className="px-2 py-0.5 bg-[#bf5af2]/20 text-[#bf5af2] rounded font-medium truncate max-w-[200px]">{selectedCustomer}</span>}
          {quickGender && <span className="px-2 py-0.5 rounded font-medium" style={{ backgroundColor: `${GENDER_COLORS[quickGender]}33`, color: GENDER_COLORS[quickGender] }}>{quickGender}</span>}
          {selectedMonth && <span className="px-2 py-0.5 bg-[#64d2ff]/20 text-[#64d2ff] rounded font-medium">{new Date(2000, parseInt(selectedMonth) - 1).toLocaleString('en-US', { month: 'long' })}</span>}
          {selectedYear && <span className="px-2 py-0.5 bg-[#64d2ff]/20 text-[#64d2ff] rounded font-medium">{selectedYear}</span>}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        {/* Map */}
        <div className="xl:col-span-2 bg-[#131316] rounded-xl border border-[#2a2a32] overflow-hidden relative">
          {/* Leaflet Heat Map */}
          <div style={{ height: '520px' }}>
            <LeafletHeatMap
              heatPoints={heatPoints}
              metroMarkers={metroMarkers}
              showMetroBubbles={showMetroBubbles}
              onMetroClick={(cbsaCode: string) => {
                setSelectedMetro(selectedMetro === cbsaCode ? null : cbsaCode);
                setSelectedState(null);
              }}
              onMetroHover={(cbsaCode: string | null) => setHoveredMetro(cbsaCode)}
              maxIntensity={heatMaxIntensity}
            />
          </div>

          {/* Legend */}
          <div className="flex items-center gap-3 px-4 py-3 border-t border-[#2a2a32]">
            <span className="text-xs text-[#636366]">Low</span>
            <div className="flex-1 h-2 rounded-full" style={{
              background: 'linear-gradient(to right, #0d2266, #1a3a9a, #6a1b9a, #b71c1c, #d84315, #ef6c00, #f9a825, #ffee58, #ffffff)',
            }} />
            <span className="text-xs text-[#636366]">High</span>
            <span className="text-[10px] text-[#636366] ml-2">
              {metric === 'revenue' ? 'Revenue' : metric === 'units' ? 'Units' : metric === 'orders' ? 'Orders' : 'Avg Order'} density
            </span>
          </div>
        </div>

        {/* Detail Panel */}
        <div className="bg-[#131316] rounded-xl border border-[#2a2a32] p-4 space-y-4 self-start sticky top-4 max-h-[calc(100vh-6rem)] overflow-y-auto">
          {activeMetroData ? (
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
            /* State detail */
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
                Click a metro marker to see details
              </div>
              <div className="text-xs text-[#636366] mt-1">
                {statesWithData} states with sales data
              </div>
              <div className="text-xs text-[#636366] mt-2">
                Zoom and pan to explore regional density
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Rankings Table */}
      <div className="bg-[#131316] rounded-xl border border-[#2a2a32]">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
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
          </div>
          <button onClick={() => setShowTable(!showTable)} className="text-xs text-[#636366] hover:text-[#8e8e93]">
            {showTable ? '▼' : '▶'} {tableMode === 'metros' ? `${sortedMetros.length} metros (top ${visibleMetros.length} on map)` : tableMode === 'cities' ? `Top 25 of ${sortedCities.length} cities` : `${sortedStates.length} states`}
          </button>
        </div>

        {showTable && (
          <div className="overflow-x-auto">
            {tableMode === 'metros' ? (
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
              /* State rankings table */
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
