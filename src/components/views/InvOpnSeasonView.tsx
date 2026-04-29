'use client';

import React, { useState, useMemo } from 'react';
import { Product, SalesRecord, normalizeCategory } from '@/types/product';
import { sortSeasons, matchesSeason } from '@/lib/store';
import { getSeasonStatus, getSeasonStatusBadge, parseSeasonCode } from '@/lib/season-utils';
import { isRelevantSeason } from '@/utils/season';
import { matchesDivision } from '@/utils/divisionMap';
import { getBaseStyleNumber } from '@/utils/combineStyles';
import { formatCurrencyShort, formatNumberShort, formatPercentSigned } from '@/utils/format';
import { exportToExcel } from '@/utils/exportData';
import { Search, X, Download } from 'lucide-react';
import SalesLoadingBanner from '@/components/SalesLoadingBanner';

// ── Types ────────────────────────────────────────────────────────────

interface InvOpnSeasonViewProps {
  products: Product[];
  sales: SalesRecord[];
  selectedSeason?: string;
  selectedDivision?: string;
  selectedCategory?: string;
  searchQuery?: string;
  onStyleClick: (styleNumber: string) => void;
}

interface AggRow {
  key: string;
  label: string;
  sublabel?: string;
  combined: number;
  shipped: number;
  booked: number;
  combinedUnits: number;
  shippedUnits: number;
  bookedUnits: number;
}

interface SeasonTrendRow {
  season: string;
  combined: number;
  shipped: number;
  booked: number;
  yoyPercent: number | null;
}

// ── Constants ────────────────────────────────────────────────────────

const CTYPE_DOT: Record<string, string> = {
  WH: 'bg-blue-400',
  EC: 'bg-emerald-400',
  BB: 'bg-purple-400',
  PS: 'bg-amber-400',
  KI: 'bg-cyan-400',
  WD: 'bg-orange-400',
};

const TAG_COLORS = {
  season: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
  style: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
  customer: 'bg-purple-500/20 text-purple-300 border border-purple-500/30',
  color: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
};

const COLOR_SWATCHES: Record<string, string> = {
  BLACK: '#1a1a1a', BLACKOUT: '#1a1a1a', WHITE: '#f5f5f5', IVORY: '#fffff0',
  NAVY: '#001f3f', RED: '#dc2626', BLUE: '#3b82f6', GREEN: '#22c55e',
  GRAY: '#6b7280', GREY: '#6b7280', BROWN: '#92400e', TAN: '#d2b48c',
  OLIVE: '#556b2f', KHAKI: '#c3b091', CHARCOAL: '#36454f', CARBON: '#3a3a3a',
  MIDNIGHT: '#191970', STEEL: '#708090', SAND: '#c2b280', STONE: '#928e85',
  SLATE: '#708090', SAGE: '#9caf88', INDIGO: '#4b0082', RUST: '#b7410e',
  KOAL: '#5c5c5c', BUCKSKIN: '#9a8b6e', 'GUN METAL': '#6d6e71',
  PIRATE: '#2d2d2d', TURKISH: '#4a7c8a', ESPRESSO: '#3c1414',
  INKBLACK: '#090909', RAVEN: '#2c2c2c',
};

function getSwatchColor(colorDesc: string): string | null {
  if (!colorDesc) return null;
  const upper = colorDesc.toUpperCase();
  // Exact match first
  if (COLOR_SWATCHES[upper]) return COLOR_SWATCHES[upper];
  // Partial match
  for (const [name, hex] of Object.entries(COLOR_SWATCHES)) {
    if (upper.includes(name)) return hex;
  }
  return null;
}

// ── Component ────────────────────────────────────────────────────────

export default function InvOpnSeasonView({
  products,
  sales,
  selectedSeason,
  selectedDivision,
  selectedCategory,
  searchQuery,
  onStyleClick,
}: InvOpnSeasonViewProps) {
  // ── Local State ──────────────────────────────────────────────────
  const [selectedSeasons, setSelectedSeasons] = useState<string[]>([]);
  const [selectedStyles, setSelectedStyles] = useState<string[]>([]);
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);

  const [orderTypeFilter, setOrderTypeFilter] = useState('all');

  const [styleSearch, setStyleSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [colorSearch, setColorSearch] = useState('');

  const [trendMetric, setTrendMetric] = useState<'combined' | 'shipped' | 'booked'>('combined');


  // ── Helpers ──────────────────────────────────────────────────────
  const getShipped = (s: SalesRecord): number => (s.shipped as number) || 0;
  const getBooked = (s: SalesRecord): number => (s.revenue || 0) - getShipped(s);
  const getShippedUnits = (s: SalesRecord): number => (s.unitsShipped as number) || 0;
  const getBookedUnits = (s: SalesRecord): number => (s.unitsBooked || 0) - getShippedUnits(s);

  const matchesStylesSel = (s: SalesRecord) =>
    selectedStyles.length === 0 || selectedStyles.includes(getBaseStyleNumber(s.styleNumber));
  const matchesCustomersSel = (s: SalesRecord) =>
    selectedCustomers.length === 0 || selectedCustomers.includes(s.customer || '');
  const matchesColorsSel = (s: SalesRecord) =>
    selectedColors.length === 0 || selectedColors.includes(s.colorDesc || '');

  // ── Stage 1: Global + Local Dropdown Filters ─────────────────────
  const globalFiltered = useMemo(() => {
    return sales.filter(s => {
      if (!matchesSeason(s.season, selectedSeason || '')) return false;
      if (!matchesDivision(s.divisionDesc ?? '', selectedDivision)) return false;
      if (selectedCategory) {
        const norm = normalizeCategory(s.categoryDesc);
        const tokens = selectedCategory.split('|').filter(Boolean).map(normalizeCategory);
        if (tokens.length > 0 && !tokens.includes(norm)) return false;
      }
      if (orderTypeFilter === 'invoice' && s.orderType?.toLowerCase() !== 'invoice') return false;
      if (orderTypeFilter === 'open' && s.orderType?.toLowerCase() !== 'open') return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (
          !s.styleNumber?.toLowerCase().includes(q) &&
          !s.styleDesc?.toLowerCase().includes(q) &&
          !s.customer?.toLowerCase().includes(q) &&
          !s.colorDesc?.toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [sales, selectedSeason, selectedDivision, selectedCategory, orderTypeFilter, searchQuery]);

  // ── Stage 2: Unique Seasons ──────────────────────────────────────
  const allSeasons = useMemo(() => {
    const set = new Set<string>();
    globalFiltered.forEach(s => s.season && set.add(s.season));
    return sortSeasons(Array.from(set)).filter(s => isRelevantSeason(s));
  }, [globalFiltered]);

  // ── Stage 3: Season Chip Filter ──────────────────────────────────
  const seasonFiltered = useMemo(() => {
    if (selectedSeasons.length === 0) return globalFiltered;
    const set = new Set(selectedSeasons);
    return globalFiltered.filter(s => set.has(s.season));
  }, [globalFiltered, selectedSeasons]);

  // ── Stage 4: Cross-Panel Aggregation ─────────────────────────────
  const panelData = useMemo(() => {
    // Styles panel: filtered by customers AND colors (NOT styles)
    const stylesSource = seasonFiltered.filter(s => matchesCustomersSel(s) && matchesColorsSel(s));
    const styleMap = new Map<string, AggRow>();
    for (const s of stylesSource) {
      const baseStyle = getBaseStyleNumber(s.styleNumber);
      let row = styleMap.get(baseStyle);
      if (!row) {
        row = {
          key: baseStyle, label: s.styleDesc || baseStyle, sublabel: baseStyle,
          combined: 0, shipped: 0, booked: 0, combinedUnits: 0, shippedUnits: 0, bookedUnits: 0,
        };
        styleMap.set(baseStyle, row);
      }
      row.combined += s.revenue || 0;
      row.shipped += getShipped(s);
      row.booked += getBooked(s);
      row.combinedUnits += s.unitsBooked || 0;
      row.shippedUnits += getShippedUnits(s);
      row.bookedUnits += getBookedUnits(s);
    }

    // Customers panel: filtered by styles AND colors (NOT customers)
    const customersSource = seasonFiltered.filter(s => matchesStylesSel(s) && matchesColorsSel(s));
    const customerMap = new Map<string, AggRow>();
    for (const s of customersSource) {
      const cust = s.customer || 'Unknown';
      let row = customerMap.get(cust);
      if (!row) {
        row = {
          key: cust, label: cust, sublabel: s.customerType || '',
          combined: 0, shipped: 0, booked: 0, combinedUnits: 0, shippedUnits: 0, bookedUnits: 0,
        };
        customerMap.set(cust, row);
      }
      row.combined += s.revenue || 0;
      row.shipped += getShipped(s);
      row.booked += getBooked(s);
      row.combinedUnits += s.unitsBooked || 0;
      row.shippedUnits += getShippedUnits(s);
      row.bookedUnits += getBookedUnits(s);
    }

    // Colors panel: filtered by styles AND customers (NOT colors)
    const colorsSource = seasonFiltered.filter(s => matchesStylesSel(s) && matchesCustomersSel(s));
    const colorMap = new Map<string, AggRow>();
    for (const s of colorsSource) {
      const color = s.colorDesc || 'Unknown';
      let row = colorMap.get(color);
      if (!row) {
        row = {
          key: color, label: color, sublabel: '',
          combined: 0, shipped: 0, booked: 0, combinedUnits: 0, shippedUnits: 0, bookedUnits: 0,
        };
        colorMap.set(color, row);
      }
      row.combined += s.revenue || 0;
      row.shipped += getShipped(s);
      row.booked += getBooked(s);
      row.combinedUnits += s.unitsBooked || 0;
      row.shippedUnits += getShippedUnits(s);
      row.bookedUnits += getBookedUnits(s);
    }

    const sortByRevenue = (a: AggRow, b: AggRow) => b.combined - a.combined;
    return {
      styles: Array.from(styleMap.values()).sort(sortByRevenue),
      customers: Array.from(customerMap.values()).sort(sortByRevenue),
      colors: Array.from(colorMap.values()).sort(sortByRevenue),
    };
  }, [seasonFiltered, selectedStyles, selectedCustomers, selectedColors]);

  // ── Stage 5: KPI Metrics ─────────────────────────────────────────
  const kpiMetrics = useMemo(() => {
    const fullyFiltered = seasonFiltered.filter(s =>
      matchesStylesSel(s) && matchesCustomersSel(s) && matchesColorsSel(s));

    let totalCombined = 0, totalShipped = 0, totalBooked = 0;
    let totalUnits = 0;
    let totalNetPrice = 0, priceCount = 0;

    for (const s of fullyFiltered) {
      totalCombined += s.revenue || 0;
      totalShipped += getShipped(s);
      totalBooked += getBooked(s);
      totalUnits += s.unitsBooked || 0;
      if (s.netUnitPrice && s.netUnitPrice > 0) {
        totalNetPrice += s.netUnitPrice;
        priceCount++;
      }
    }

    let unfilteredTotal = 0;
    for (const s of globalFiltered) { unfilteredTotal += s.revenue || 0; }

    const hasActive = selectedSeasons.length > 0 || selectedStyles.length > 0 ||
      selectedCustomers.length > 0 || selectedColors.length > 0;

    return {
      filteredTotal: totalCombined,
      unfilteredTotal,
      shipped: totalShipped,
      booked: totalBooked,
      units: totalUnits,
      avgUnitPrice: priceCount > 0 ? totalNetPrice / priceCount : totalUnits > 0 ? totalCombined / totalUnits : 0,
      hasActiveFilters: hasActive,
    };
  }, [seasonFiltered, globalFiltered, selectedStyles, selectedCustomers, selectedColors, selectedSeasons]);

  // ── Stage 6: Season Trend ────────────────────────────────────────
  const seasonTrend = useMemo(() => {
    const filtered = globalFiltered.filter(s =>
      matchesStylesSel(s) && matchesCustomersSel(s) && matchesColorsSel(s));

    const seasonMap = new Map<string, { combined: number; shipped: number; booked: number; units: number }>();
    for (const s of filtered) {
      if (!s.season) continue;
      let row = seasonMap.get(s.season);
      if (!row) { row = { combined: 0, shipped: 0, booked: 0, units: 0 }; seasonMap.set(s.season, row); }
      row.combined += s.revenue || 0;
      row.shipped += getShipped(s);
      row.booked += getBooked(s);
      row.units += s.unitsBooked || 0;
    }

    const sortedSeasons = sortSeasons(Array.from(seasonMap.keys())).filter(s => isRelevantSeason(s));
    return sortedSeasons.map(season => {
      const data = seasonMap.get(season)!;
      const parsed = parseSeasonCode(season);
      const priorCode = parsed ? `${String(parsed.year - 1).slice(-2)}${parsed.type}` : null;
      const priorData = priorCode ? seasonMap.get(priorCode) : null;
      const yoyPercent = priorData && priorData.combined > 0
        ? ((data.combined - priorData.combined) / priorData.combined) * 100
        : null;
      return { season, ...data, yoyPercent } as SeasonTrendRow;
    }).reverse(); // Most recent first
  }, [globalFiltered, selectedStyles, selectedCustomers, selectedColors]);

  // ── Prior-season KPI deltas ──────────────────────────────────────
  const priorKpiDeltas = useMemo(() => {
    if (selectedSeasons.length !== 1) return null;
    const currentSeason = selectedSeasons[0];
    const parsed = parseSeasonCode(currentSeason);
    if (!parsed) return null;
    const priorCode = `${String(parsed.year - 1).slice(-2)}${parsed.type}`;

    const priorSales = globalFiltered.filter(s => s.season === priorCode)
      .filter(s => matchesStylesSel(s) && matchesCustomersSel(s) && matchesColorsSel(s));

    if (priorSales.length === 0) return null;

    let priorUnits = 0, priorNetPrice = 0, priorPriceCount = 0;
    for (const s of priorSales) {
      priorUnits += s.unitsBooked || 0;
      if (s.netUnitPrice && s.netUnitPrice > 0) { priorNetPrice += s.netUnitPrice; priorPriceCount++; }
    }
    const priorAvgPrice = priorPriceCount > 0 ? priorNetPrice / priorPriceCount : 0;
    const currentAvgPrice = kpiMetrics.avgUnitPrice;

    return {
      unitsDelta: priorUnits > 0 ? ((kpiMetrics.units - priorUnits) / priorUnits) * 100 : null,
      priceDelta: priorAvgPrice > 0 ? ((currentAvgPrice - priorAvgPrice) / priorAvgPrice) * 100 : null,
      priorSeason: priorCode,
    };
  }, [globalFiltered, selectedSeasons, selectedStyles, selectedCustomers, selectedColors, kpiMetrics]);

  // ── Toggle Helpers ───────────────────────────────────────────────
  const toggleSeason = (season: string) => {
    setSelectedSeasons(prev =>
      prev.includes(season) ? prev.filter(s => s !== season) : [...prev, season]);
  };
  const toggleAllSpring = () => {
    const springs = allSeasons.filter(s => s.endsWith('SP'));
    const allSelected = springs.every(s => selectedSeasons.includes(s));
    setSelectedSeasons(prev => allSelected
      ? prev.filter(s => !s.endsWith('SP'))
      : [...prev.filter(s => !s.endsWith('SP')), ...springs]);
  };
  const toggleAllFall = () => {
    const falls = allSeasons.filter(s => s.endsWith('FA'));
    const allSelected = falls.every(s => selectedSeasons.includes(s));
    setSelectedSeasons(prev => allSelected
      ? prev.filter(s => !s.endsWith('FA'))
      : [...prev.filter(s => !s.endsWith('FA')), ...falls]);
  };
  const toggleStyle = (key: string) => {
    setSelectedStyles(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };
  const toggleCustomer = (key: string) => {
    setSelectedCustomers(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };
  const toggleColor = (key: string) => {
    setSelectedColors(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };
  const clearAll = () => {
    setSelectedSeasons([]);
    setSelectedStyles([]);
    setSelectedCustomers([]);
    setSelectedColors([]);
  };

  const hasAnySelection = selectedSeasons.length > 0 || selectedStyles.length > 0 ||
    selectedCustomers.length > 0 || selectedColors.length > 0;

  // ── Export ───────────────────────────────────────────────────────
  const handleExport = () => {
    const fullyFiltered = seasonFiltered.filter(s =>
      matchesStylesSel(s) && matchesCustomersSel(s) && matchesColorsSel(s));

    exportToExcel(
      fullyFiltered.map(s => ({
        Season: s.season,
        Style: s.styleNumber,
        StyleDesc: s.styleDesc,
        Color: s.colorDesc,
        Customer: s.customer,
        CustomerType: s.customerType,
        Gender: s.gender || '',
        Category: s.categoryDesc,
        Combined: (s.revenue || 0).toFixed(2),
        Shipped: getShipped(s).toFixed(2),
        Booked: getBooked(s).toFixed(2),
        UnitsBooked: s.unitsBooked || 0,
        UnitsShipped: getShippedUnits(s),
        OrderType: s.orderType || '',
      })),
      'inv-opn-season'
    );
  };

  // ── Display-filtered panels ──────────────────────────────────────
  const filteredStyles = useMemo(() => {
    let list = panelData.styles;
    if (styleSearch) {
      const q = styleSearch.toLowerCase();
      list = list.filter(r => r.label.toLowerCase().includes(q) || (r.sublabel || '').toLowerCase().includes(q));
    }
    return list;
  }, [panelData.styles, styleSearch]);

  const filteredCustomers = useMemo(() => {
    let list = panelData.customers;
    if (customerSearch) {
      const q = customerSearch.toLowerCase();
      list = list.filter(r => r.label.toLowerCase().includes(q));
    }
    return list;
  }, [panelData.customers, customerSearch]);

  const filteredColors = useMemo(() => {
    let list = panelData.colors;
    if (colorSearch) {
      const q = colorSearch.toLowerCase();
      list = list.filter(r => r.label.toLowerCase().includes(q));
    }
    return list;
  }, [panelData.colors, colorSearch]);

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-4">
      <SalesLoadingBanner />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-text-primary">Inv-Opn Season</h2>
          <p className="text-sm text-text-muted mt-0.5">Invoice + Open Orders by Season</p>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-secondary border border-border-primary text-sm font-medium text-text-primary hover:bg-hover transition-colors"
        >
          <Download className="w-4 h-4" /> Export
        </button>
      </div>

      {/* ── Season Filter Bar ─────────────────────────────────────── */}
      <div className="card p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[11px] font-semibold text-text-faint uppercase tracking-wide whitespace-nowrap">
            Season
          </span>
          {/* Order Type toggle */}
          <div className="flex gap-1 mr-2">
            {[
              { value: 'all', label: 'All' },
              { value: 'invoice', label: 'Invoice' },
              { value: 'open', label: 'Open' },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => setOrderTypeFilter(opt.value)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                  orderTypeFilter === opt.value
                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                    : 'bg-surface-secondary text-text-muted border border-border-primary hover:bg-hover'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="w-px h-5 bg-border-primary" />
          <div className="flex gap-2">
            <button
              onClick={toggleAllSpring}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                allSeasons.filter(s => s.endsWith('SP')).every(s => selectedSeasons.includes(s)) && allSeasons.some(s => s.endsWith('SP'))
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-surface-secondary text-text-muted border border-border-primary hover:bg-hover'
              }`}
            >
              All Spring
            </button>
            <button
              onClick={toggleAllFall}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                allSeasons.filter(s => s.endsWith('FA')).every(s => selectedSeasons.includes(s)) && allSeasons.some(s => s.endsWith('FA'))
                  ? 'bg-orange-500/20 text-orange-300 border border-orange-500/40'
                  : 'bg-surface-secondary text-text-muted border border-border-primary hover:bg-hover'
              }`}
            >
              All Fall
            </button>
          </div>
          <div className="flex gap-2 flex-wrap">
            {allSeasons.map(season => {
              const status = getSeasonStatus(season);
              const badge = getSeasonStatusBadge(status);
              const isSelected = selectedSeasons.includes(season);
              return (
                <button
                  key={season}
                  onClick={() => toggleSeason(season)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    isSelected
                      ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 ring-1 ring-blue-500/30'
                      : 'bg-surface-secondary text-text-secondary border border-border-primary hover:bg-hover'
                  }`}
                >
                  <span className="font-mono font-semibold">{season}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${badge.color}`}>
                    {badge.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>


      {/* ── Active Selections Bar ─────────────────────────────────── */}
      {hasAnySelection && (
        <div className="card p-3 flex items-center gap-3 flex-wrap">
          <span className="text-[11px] font-semibold text-text-faint uppercase tracking-wide whitespace-nowrap">
            Active Selections
          </span>

          {selectedSeasons.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-text-faint">Season:</span>
              {selectedSeasons.map(s => (
                <span key={s} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${TAG_COLORS.season}`}>
                  {s}
                  <button onClick={() => toggleSeason(s)} className="hover:text-white"><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
          )}

          {selectedStyles.length > 0 && (
            <>
              <div className="w-px h-4 bg-border-primary" />
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-text-faint">Styles:</span>
                {selectedStyles.map(s => {
                  const row = panelData.styles.find(r => r.key === s);
                  return (
                    <span key={s} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${TAG_COLORS.style}`}>
                      {row?.label || s}
                      <button onClick={() => toggleStyle(s)} className="hover:text-white"><X className="w-3 h-3" /></button>
                    </span>
                  );
                })}
              </div>
            </>
          )}

          {selectedCustomers.length > 0 && (
            <>
              <div className="w-px h-4 bg-border-primary" />
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-text-faint">Customers:</span>
                {selectedCustomers.map(c => (
                  <span key={c} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${TAG_COLORS.customer}`}>
                    {c}
                    <button onClick={() => toggleCustomer(c)} className="hover:text-white"><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
            </>
          )}

          {selectedColors.length > 0 && (
            <>
              <div className="w-px h-4 bg-border-primary" />
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-text-faint">Colors:</span>
                {selectedColors.map(c => (
                  <span key={c} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${TAG_COLORS.color}`}>
                    {c}
                    <button onClick={() => toggleColor(c)} className="hover:text-white"><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
            </>
          )}

          <div className="ml-auto flex items-center gap-3">
            <span className="text-sm text-text-secondary">
              Filtered: <strong className="text-emerald-400">{formatCurrencyShort(kpiMetrics.filteredTotal)}</strong>
              {kpiMetrics.hasActiveFilters && (
                <span className="text-text-faint"> of {formatCurrencyShort(kpiMetrics.unfilteredTotal)}</span>
              )}
            </span>
            <button
              onClick={clearAll}
              className="text-xs text-red-400 hover:text-red-300 font-medium px-2 py-1 rounded hover:bg-red-500/10 transition-colors"
            >
              Clear All
            </button>
          </div>
        </div>
      )}

      {/* ── KPI Cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-5 gap-3">
        {/* Filtered Total */}
        <div className="card p-4 border-l-[3px] border-l-emerald-500">
          <div className="text-[11px] font-semibold text-text-faint uppercase tracking-wide">Filtered Total</div>
          <div className="text-2xl font-bold text-emerald-400 mt-1 font-mono">{formatCurrencyShort(kpiMetrics.filteredTotal)}</div>
          <div className="text-xs text-text-muted mt-1">
            of {formatCurrencyShort(kpiMetrics.unfilteredTotal)} total
            {kpiMetrics.unfilteredTotal > 0 && (
              <span> ({((kpiMetrics.filteredTotal / kpiMetrics.unfilteredTotal) * 100).toFixed(1)}%)</span>
            )}
          </div>
        </div>

        {/* Shipped Invoice */}
        <div className="card p-4">
          <div className="text-[11px] font-semibold text-text-faint uppercase tracking-wide">Shipped Invoice</div>
          <div className="text-2xl font-bold text-text-primary mt-1 font-mono">{formatCurrencyShort(kpiMetrics.shipped)}</div>
          <div className="text-xs text-text-muted mt-1">
            {kpiMetrics.filteredTotal > 0
              ? `${((kpiMetrics.shipped / kpiMetrics.filteredTotal) * 100).toFixed(1)}% shipped`
              : '—'}
          </div>
        </div>

        {/* Current Booked */}
        <div className="card p-4">
          <div className="text-[11px] font-semibold text-text-faint uppercase tracking-wide">Current Booked</div>
          <div className="text-2xl font-bold text-text-primary mt-1 font-mono">{formatCurrencyShort(kpiMetrics.booked)}</div>
          <div className="text-xs text-text-muted mt-1">
            {kpiMetrics.filteredTotal > 0
              ? `${((kpiMetrics.booked / kpiMetrics.filteredTotal) * 100).toFixed(1)}% pending`
              : '—'}
          </div>
        </div>

        {/* Units */}
        <div className="card p-4">
          <div className="text-[11px] font-semibold text-text-faint uppercase tracking-wide">Units</div>
          <div className="text-2xl font-bold text-text-primary mt-1 font-mono">{formatNumberShort(kpiMetrics.units)}</div>
          {priorKpiDeltas?.unitsDelta != null && (
            <div className={`text-xs mt-1 flex items-center gap-1 ${priorKpiDeltas.unitsDelta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {formatPercentSigned(priorKpiDeltas.unitsDelta)}
              <span className="text-text-faint">vs {priorKpiDeltas.priorSeason}</span>
            </div>
          )}
        </div>

        {/* Avg Unit Price */}
        <div className="card p-4">
          <div className="text-[11px] font-semibold text-text-faint uppercase tracking-wide">Avg Unit Price</div>
          <div className="text-2xl font-bold text-text-primary mt-1 font-mono">{formatCurrencyShort(kpiMetrics.avgUnitPrice)}</div>
          {priorKpiDeltas?.priceDelta != null && (
            <div className={`text-xs mt-1 flex items-center gap-1 ${priorKpiDeltas.priceDelta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {formatPercentSigned(priorKpiDeltas.priceDelta)}
              <span className="text-text-faint">vs {priorKpiDeltas.priorSeason}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── 2×2 Grid ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">

        {/* ── Styles Panel ──────────────────────────────────────── */}
        <div className="card flex flex-col overflow-hidden" style={{ maxHeight: 440 }}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-primary bg-surface-secondary">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-text-primary">👕 Styles</span>
              <span className="text-xs text-text-muted">· {filteredStyles.length}</span>
              {selectedStyles.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold">
                  {selectedStyles.length} selected
                </span>
              )}
            </div>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-faint" />
              <input
                type="text"
                value={styleSearch}
                onChange={e => setStyleSearch(e.target.value)}
                placeholder="Search styles..."
                className="pl-7 pr-2 py-1 w-40 rounded-md bg-surface-primary border border-border-primary text-xs text-text-primary placeholder:text-text-faint focus:outline-none focus:ring-1 focus:ring-blue-500/50"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 z-10 bg-surface-secondary">
                <tr>
                  <th className="w-10 px-3 py-2" />
                  <th className="text-left text-[10px] font-semibold uppercase text-text-faint px-3 py-2">Style</th>
                  <th className="text-right text-[10px] font-semibold uppercase text-text-faint px-3 py-2">Combined</th>
                  <th className="text-right text-[10px] font-semibold uppercase text-text-faint px-3 py-2">Shipped</th>
                  <th className="text-right text-[10px] font-semibold uppercase text-text-faint px-3 py-2">Booked</th>
                </tr>
              </thead>
              <tbody>
                {filteredStyles.map(row => {
                  const isSelected = selectedStyles.includes(row.key);
                  return (
                    <tr
                      key={row.key}
                      className={`border-b border-border-secondary cursor-pointer transition-colors ${
                        isSelected ? 'bg-blue-500/10' : 'hover:bg-hover/50'
                      }`}
                      onClick={() => toggleStyle(row.key)}
                    >
                      <td className="px-3 py-2">
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                          isSelected ? 'border-blue-400 bg-blue-500' : 'border-border-primary'
                        }`}>
                          {isSelected && <span className="text-white text-[10px]">✓</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="text-sm font-medium text-text-primary leading-tight">{row.label}</div>
                        <div className="text-[11px] text-text-faint font-mono">{row.sublabel}</div>
                      </td>
                      <td className="px-3 py-2 text-right text-sm font-mono text-text-primary">{formatCurrencyShort(row.combined)}</td>
                      <td className="px-3 py-2 text-right text-sm font-mono text-text-muted">{formatCurrencyShort(row.shipped)}</td>
                      <td className="px-3 py-2 text-right text-sm font-mono text-text-muted">{formatCurrencyShort(row.booked)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Customers Panel ───────────────────────────────────── */}
        <div className="card flex flex-col overflow-hidden" style={{ maxHeight: 440 }}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-primary bg-surface-secondary">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-text-primary">👥 Customers</span>
              <span className="text-xs text-text-muted">· {filteredCustomers.length}</span>
              {selectedCustomers.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-semibold">
                  {selectedCustomers.length} selected
                </span>
              )}
            </div>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-faint" />
              <input
                type="text"
                value={customerSearch}
                onChange={e => setCustomerSearch(e.target.value)}
                placeholder="Search customers..."
                className="pl-7 pr-2 py-1 w-40 rounded-md bg-surface-primary border border-border-primary text-xs text-text-primary placeholder:text-text-faint focus:outline-none focus:ring-1 focus:ring-blue-500/50"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 z-10 bg-surface-secondary">
                <tr>
                  <th className="w-10 px-3 py-2" />
                  <th className="text-left text-[10px] font-semibold uppercase text-text-faint px-3 py-2">Customer</th>
                  <th className="text-right text-[10px] font-semibold uppercase text-text-faint px-3 py-2">Combined</th>
                  <th className="text-right text-[10px] font-semibold uppercase text-text-faint px-3 py-2">Shipped</th>
                  <th className="text-right text-[10px] font-semibold uppercase text-text-faint px-3 py-2">Booked</th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.map(row => {
                  const isSelected = selectedCustomers.includes(row.key);
                  const dotColor = CTYPE_DOT[(row.sublabel || '').split(',')[0].trim()] || 'bg-gray-400';
                  return (
                    <tr
                      key={row.key}
                      className={`border-b border-border-secondary cursor-pointer transition-colors ${
                        isSelected ? 'bg-blue-500/10' : 'hover:bg-hover/50'
                      }`}
                      onClick={() => toggleCustomer(row.key)}
                    >
                      <td className="px-3 py-2">
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                          isSelected ? 'border-purple-400 bg-purple-500' : 'border-border-primary'
                        }`}>
                          {isSelected && <span className="text-white text-[10px]">✓</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
                          <span className="text-sm font-medium text-text-primary">{row.label}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right text-sm font-mono text-text-primary">{formatCurrencyShort(row.combined)}</td>
                      <td className="px-3 py-2 text-right text-sm font-mono text-text-muted">{formatCurrencyShort(row.shipped)}</td>
                      <td className="px-3 py-2 text-right text-sm font-mono text-text-muted">{formatCurrencyShort(row.booked)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Colors Panel ──────────────────────────────────────── */}
        <div className="card flex flex-col overflow-hidden" style={{ maxHeight: 440 }}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-primary bg-surface-secondary">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-text-primary">🎨 Colors</span>
              <span className="text-xs text-text-muted">· {filteredColors.length}</span>
              {selectedColors.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-semibold">
                  {selectedColors.length} selected
                </span>
              )}
            </div>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-faint" />
              <input
                type="text"
                value={colorSearch}
                onChange={e => setColorSearch(e.target.value)}
                placeholder="Search colors..."
                className="pl-7 pr-2 py-1 w-40 rounded-md bg-surface-primary border border-border-primary text-xs text-text-primary placeholder:text-text-faint focus:outline-none focus:ring-1 focus:ring-blue-500/50"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 z-10 bg-surface-secondary">
                <tr>
                  <th className="w-10 px-3 py-2" />
                  <th className="text-left text-[10px] font-semibold uppercase text-text-faint px-3 py-2">Color</th>
                  <th className="text-right text-[10px] font-semibold uppercase text-text-faint px-3 py-2">Combined</th>
                  <th className="text-right text-[10px] font-semibold uppercase text-text-faint px-3 py-2">Shipped</th>
                  <th className="text-right text-[10px] font-semibold uppercase text-text-faint px-3 py-2">Booked</th>
                </tr>
              </thead>
              <tbody>
                {filteredColors.map(row => {
                  const isSelected = selectedColors.includes(row.key);
                  const swatchHex = getSwatchColor(row.label);
                  return (
                    <tr
                      key={row.key}
                      className={`border-b border-border-secondary cursor-pointer transition-colors ${
                        isSelected ? 'bg-blue-500/10' : 'hover:bg-hover/50'
                      }`}
                      onClick={() => toggleColor(row.key)}
                    >
                      <td className="px-3 py-2">
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                          isSelected ? 'border-amber-400 bg-amber-500' : 'border-border-primary'
                        }`}>
                          {isSelected && <span className="text-white text-[10px]">✓</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-5 h-5 rounded-md border border-border-primary flex-shrink-0"
                            style={{ background: swatchHex || '#3a3a3a' }}
                          />
                          <span className="text-sm font-medium text-text-primary">{row.label}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right text-sm font-mono text-text-primary">{formatCurrencyShort(row.combined)}</td>
                      <td className="px-3 py-2 text-right text-sm font-mono text-text-muted">{formatCurrencyShort(row.shipped)}</td>
                      <td className="px-3 py-2 text-right text-sm font-mono text-text-muted">{formatCurrencyShort(row.booked)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Season Trend Panel ────────────────────────────────── */}
        <div className="card flex flex-col overflow-hidden" style={{ maxHeight: 440 }}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-primary bg-surface-secondary">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-text-primary">📈 Season Trend</span>
            </div>
            <div className="flex gap-1">
              {(['combined', 'shipped', 'booked'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setTrendMetric(m)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                    trendMetric === m
                      ? 'bg-blue-500/20 text-blue-300'
                      : 'text-text-muted hover:text-text-secondary hover:bg-hover'
                  }`}
                >
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 z-10 bg-surface-secondary">
                <tr>
                  <th className="text-left text-[10px] font-semibold uppercase text-text-faint px-4 py-2">Season</th>
                  <th className="text-right text-[10px] font-semibold uppercase text-text-faint px-3 py-2">Combined</th>
                  <th className="text-right text-[10px] font-semibold uppercase text-text-faint px-3 py-2">Shipped</th>
                  <th className="text-right text-[10px] font-semibold uppercase text-text-faint px-3 py-2">Booked</th>
                  <th className="text-right text-[10px] font-semibold uppercase text-text-faint px-3 py-2">YoY</th>
                </tr>
              </thead>
              <tbody>
                {seasonTrend.map(row => {
                  const isHighlighted = selectedSeasons.includes(row.season);
                  return (
                    <tr
                      key={row.season}
                      className={`border-b border-border-secondary ${isHighlighted ? 'bg-blue-500/10' : ''}`}
                    >
                      <td className="px-4 py-2.5">
                        <span className={`font-mono text-sm ${isHighlighted ? 'font-bold text-blue-400' : 'font-medium text-text-primary'}`}>
                          {row.season}
                        </span>
                      </td>
                      <td className={`px-3 py-2.5 text-right text-sm font-mono ${trendMetric === 'combined' ? 'text-text-primary font-semibold' : 'text-text-muted'}`}>
                        {formatCurrencyShort(row.combined)}
                      </td>
                      <td className={`px-3 py-2.5 text-right text-sm font-mono ${trendMetric === 'shipped' ? 'text-text-primary font-semibold' : 'text-text-muted'}`}>
                        {formatCurrencyShort(row.shipped)}
                      </td>
                      <td className={`px-3 py-2.5 text-right text-sm font-mono ${trendMetric === 'booked' ? 'text-text-primary font-semibold' : 'text-text-muted'}`}>
                        {formatCurrencyShort(row.booked)}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {row.yoyPercent != null ? (
                          <span className={`text-xs font-semibold ${row.yoyPercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {formatPercentSigned(row.yoyPercent)}
                          </span>
                        ) : (
                          <span className="text-xs text-text-faint">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {seasonTrend.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-text-faint">
                      No season data available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Empty state */}
      {sales.length === 0 && (
        <div className="card p-12 text-center">
          <p className="text-lg font-semibold text-text-primary mb-2">No Sales Data</p>
          <p className="text-sm text-text-muted">Import sales data to use the Inv-Opn Season view.</p>
        </div>
      )}
    </div>
  );
}
