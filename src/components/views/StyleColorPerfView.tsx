'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Download,
  Search,
} from 'lucide-react';
import { Product, SalesRecord, CostRecord } from '@/types/product';
import { getCombineKey } from '@/utils/combineStyles';
import { matchesDivision } from '@/utils/divisionMap';
import { matchesFilter } from '@/utils/filters';
import { sortSeasons } from '@/lib/store';
import {
  formatCurrencyShort,
  formatNumberShort,
  formatPercent,
} from '@/utils/format';
import { exportToExcel } from '@/utils/exportData';
import SalesLoadingBanner from '@/components/SalesLoadingBanner';

// ── Types ──────────────────────────────────────────────────────────

interface Props {
  products: Product[];
  sales: SalesRecord[];
  costs: CostRecord[];
  selectedSeason: string;
  selectedDivision: string;
  selectedCategory: string;
  selectedCustomerType: string;
  selectedCustomer: string;
  searchQuery?: string;
  onStyleClick: (styleNumber: string) => void;
}

interface SeasonData {
  revenue: number;
  units: number;
  cost: number;
}

interface ColorRow {
  colorCode: string;
  colorDesc: string;
  status: 'continuing' | 'new' | 'dropped';
  currentRevenue: number;
  currentUnits: number;
  currentCost: number;
  priorRevenue: number;
  priorUnits: number;
  priorCost: number;
  third: SeasonData;
}

interface StyleRow {
  styleKey: string;
  styleNumber: string;
  styleDesc: string;
  divisionDesc: string;
  categoryDesc: string;
  currentRevenue: number;
  currentUnits: number;
  currentCost: number;
  priorRevenue: number;
  priorUnits: number;
  priorCost: number;
  third: SeasonData & { customers: number; colorCount: number };
  currentCustomers: number;
  priorCustomers: number;
  colors: ColorRow[];
  currentColorCount: number;
  priorColorCount: number;
  newCount: number;
  dropCount: number;
  continueCount: number;
}

// ── Helpers ────────────────────────────────────────────────────────

function pctChange(current: number, prior: number): number | null {
  if (prior === 0 && current === 0) return null;
  if (prior === 0) return null;
  return ((current - prior) / prior) * 100;
}

function changeColor(pct: number | null): string {
  if (pct === null) return 'text-text-muted';
  if (pct > 5) return 'text-emerald-400';
  if (pct < -5) return 'text-red-400';
  return 'text-text-muted';
}

function fmtChange(pct: number | null): string {
  if (pct === null) return '—';
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

function getYoYSeason(season: string): string | null {
  if (!season || season.length !== 4) return null;
  const yearNum = parseInt(season.slice(0, 2), 10);
  const type = season.slice(2);
  if (isNaN(yearNum) || yearNum <= 0) return null;
  return `${(yearNum - 1).toString().padStart(2, '0')}${type}`;
}

// ── Component ──────────────────────────────────────────────────────

export default function StyleColorPerfView({
  products, sales, costs,
  selectedSeason, selectedDivision, selectedCategory,
  selectedCustomerType, selectedCustomer,
  searchQuery: globalSearchQuery,
  onStyleClick,
}: Props) {
  const [metricMode, setMetricMode] = useState<'revenue' | 'units'>('revenue');
  const [combineStyles, setCombineStyles] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Sync global search → local search
  useEffect(() => {
    if (globalSearchQuery !== undefined && globalSearchQuery !== searchQuery) {
      setSearchQuery(globalSearchQuery);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalSearchQuery]);
  const [selectedStyleKey, setSelectedStyleKey] = useState<string | null>(null);
  const [expandedStyles, setExpandedStyles] = useState<Set<string>>(new Set());

  // Seasons from sales — sorted newest first
  const allSeasons = useMemo(() => {
    const s = new Set<string>();
    sales.forEach(r => r.season && s.add(r.season));
    return sortSeasons(Array.from(s));
  }, [sales]);

  // Active + Compare + Third season
  const [activeSeason, setActiveSeason] = useState<string>('');
  const [compareSeason, setCompareSeason] = useState<string>('');
  const [thirdSeason, setThirdSeason] = useState<string>('');

  // Initialize when sales load
  useEffect(() => {
    if (!activeSeason && allSeasons.length > 0) {
      const initial = selectedSeason || allSeasons[0];
      setActiveSeason(initial);
      const yoy = getYoYSeason(initial);
      setCompareSeason(yoy && allSeasons.includes(yoy) ? yoy : allSeasons[1] || '');
    }
  }, [allSeasons, activeSeason, selectedSeason]);

  // Sync with global season filter
  useEffect(() => {
    if (!selectedSeason || allSeasons.length === 0) return;
    const match = allSeasons.find(s => s === selectedSeason);
    if (match && match !== activeSeason) {
      setActiveSeason(match);
      const yoy = getYoYSeason(match);
      setCompareSeason(yoy && allSeasons.includes(yoy) ? yoy : allSeasons[allSeasons.indexOf(match) + 1] || '');
      setThirdSeason('');
    }
  }, [selectedSeason, allSeasons]);

  const handleSeasonClick = useCallback((season: string) => {
    if (season === activeSeason) return;
    if (season === compareSeason) {
      setCompareSeason(activeSeason);
      setActiveSeason(season);
    } else if (season === thirdSeason) {
      setThirdSeason(activeSeason);
      setActiveSeason(season);
    } else {
      setActiveSeason(season);
      const yoy = getYoYSeason(season);
      if (yoy && allSeasons.includes(yoy)) {
        setCompareSeason(yoy);
      }
    }
  }, [activeSeason, compareSeason, thirdSeason, allSeasons]);

  const handleCompareClick = useCallback((season: string) => {
    if (season === activeSeason) return;
    if (season === compareSeason) {
      // Right-click on compare season → clear it
      setCompareSeason('');
    } else if (season === thirdSeason) {
      // Right-click on third season → clear it
      setThirdSeason('');
    } else if (!compareSeason) {
      // No compare yet → set as compare
      setCompareSeason(season);
    } else if (!thirdSeason) {
      // Compare exists, no third → set as third
      setThirdSeason(season);
    } else {
      // Both exist → replace third
      setThirdSeason(season);
    }
  }, [activeSeason, compareSeason, thirdSeason]);

  const currentSeason = activeSeason;
  const priorSeason = compareSeason;

  // All active seasons for the pipeline
  const activeSeasons = useMemo(() => {
    const s = new Set<string>();
    if (currentSeason) s.add(currentSeason);
    if (priorSeason) s.add(priorSeason);
    if (thirdSeason) s.add(thirdSeason);
    return s;
  }, [currentSeason, priorSeason, thirdSeason]);

  // ── Main data pipeline — ALL from sales ─────────────────────────
  const styleRows: StyleRow[] = useMemo(() => {
    if (!currentSeason || !priorSeason) return [];

    // Aggregate sales by (styleKey, colorCode, season)
    type ColorAgg = { revenue: number; units: number; cost: number };
    type StyleAgg = { revenue: number; units: number; cost: number; customers: Set<string> };

    const salesByStyleColor = new Map<string, ColorAgg>();   // key: styleKey|colorCode|season
    const salesByStyle = new Map<string, StyleAgg>();         // key: styleKey|season
    const colorDescMap = new Map<string, string>();            // key: styleKey|colorCode -> best colorDesc
    const styleInfo = new Map<string, { styleDesc: string; divisionDesc: string; categoryDesc: string; styleNumbers: Set<string> }>();

    for (let i = 0, len = sales.length; i < len; i++) {
      const s = sales[i];
      if (!activeSeasons.has(s.season)) continue;
      if (!matchesDivision(s.divisionDesc, selectedDivision)) continue;
      if (!matchesFilter(s.categoryDesc, selectedCategory)) continue;
      if (selectedCustomerType) {
        const tokens = selectedCustomerType.split('|').filter(Boolean);
        const types = (s.customerType || '').split(',').map(t => t.trim());
        if (tokens.length > 0 && !tokens.some(tok => types.includes(tok))) continue;
      }
      if (!matchesFilter(s.customer, selectedCustomer)) continue;

      const styleKey = combineStyles
        ? (s.styleDesc || getCombineKey(s.styleNumber))
        : s.styleNumber;
      const colorCode = s.colorCode || s.color || '';

      // Style-level aggregation
      const styleMapKey = `${styleKey}|${s.season}`;
      let styleAgg = salesByStyle.get(styleMapKey);
      if (!styleAgg) { styleAgg = { revenue: 0, units: 0, cost: 0, customers: new Set() }; salesByStyle.set(styleMapKey, styleAgg); }
      styleAgg.revenue += s.revenue || 0;
      styleAgg.units += s.unitsBooked || 0;
      styleAgg.cost += s.cost || 0;
      if (s.customer) styleAgg.customers.add(s.customer);

      // Color-level aggregation (only if we have a color code)
      if (colorCode) {
        const colorMapKey = `${styleKey}|${colorCode}|${s.season}`;
        let colorAgg = salesByStyleColor.get(colorMapKey);
        if (!colorAgg) { colorAgg = { revenue: 0, units: 0, cost: 0 }; salesByStyleColor.set(colorMapKey, colorAgg); }
        colorAgg.revenue += s.revenue || 0;
        colorAgg.units += s.unitsBooked || 0;
        colorAgg.cost += s.cost || 0;

        const descKey = `${styleKey}|${colorCode}`;
        if (!colorDescMap.has(descKey) && s.colorDesc) {
          colorDescMap.set(descKey, s.colorDesc);
        }
      }

      if (!styleInfo.has(styleKey)) {
        styleInfo.set(styleKey, { styleDesc: s.styleDesc || styleKey, divisionDesc: s.divisionDesc || '', categoryDesc: s.categoryDesc || '', styleNumbers: new Set<string>() });
      }
      styleInfo.get(styleKey)!.styleNumbers.add(s.styleNumber);
    }

    // Build style rows
    const allStyleKeys = new Set<string>();
    for (const [mapKey] of Array.from(salesByStyle.entries())) allStyleKeys.add(mapKey.split('|')[0]);

    const rows: StyleRow[] = [];

    for (const styleKey of Array.from(allStyleKeys)) {
      const curStyle = salesByStyle.get(`${styleKey}|${currentSeason}`);
      const priStyle = salesByStyle.get(`${styleKey}|${priorSeason}`);
      const thirdStyle = thirdSeason ? salesByStyle.get(`${styleKey}|${thirdSeason}`) : null;
      const cur = curStyle || { revenue: 0, units: 0, cost: 0, customers: new Set<string>() };
      const pri = priStyle || { revenue: 0, units: 0, cost: 0, customers: new Set<string>() };
      const thi = thirdStyle || { revenue: 0, units: 0, cost: 0, customers: new Set<string>() };

      if (cur.revenue === 0 && cur.units === 0 && pri.revenue === 0 && pri.units === 0 && thi.revenue === 0 && thi.units === 0) continue;

      const info = styleInfo.get(styleKey) || { styleDesc: styleKey, divisionDesc: '', categoryDesc: '', styleNumbers: new Set<string>() };
      const displayNumber = Array.from(info.styleNumbers).sort().join(', ');

      // Build color rows from SALES data
      const colorMap = new Map<string, ColorRow>();

      for (const [mapKey, agg] of Array.from(salesByStyleColor.entries())) {
        const parts = mapKey.split('|');
        if (parts[0] !== styleKey) continue;
        const colorCode = parts[1];
        const season = parts[2];

        if (!colorMap.has(colorCode)) {
          const descKey = `${styleKey}|${colorCode}`;
          colorMap.set(colorCode, {
            colorCode,
            colorDesc: colorDescMap.get(descKey) || colorCode,
            status: 'continuing',
            currentRevenue: 0, currentUnits: 0, currentCost: 0,
            priorRevenue: 0, priorUnits: 0, priorCost: 0,
            third: { revenue: 0, units: 0, cost: 0 },
          });
        }

        const cr = colorMap.get(colorCode)!;
        if (season === currentSeason) {
          cr.currentRevenue = agg.revenue;
          cr.currentUnits = agg.units;
          cr.currentCost = agg.cost;
        } else if (season === priorSeason) {
          cr.priorRevenue = agg.revenue;
          cr.priorUnits = agg.units;
          cr.priorCost = agg.cost;
        } else if (season === thirdSeason) {
          cr.third = { revenue: agg.revenue, units: agg.units, cost: agg.cost };
        }
      }

      // Determine status + counts
      let newCount = 0, dropCount = 0, continueCount = 0;
      let currentColorCount = 0, priorColorCount = 0, thirdColorCount = 0;
      const colorRows: ColorRow[] = [];

      for (const [, cr] of Array.from(colorMap.entries())) {
        const hasCurrent = cr.currentRevenue > 0 || cr.currentUnits > 0;
        const hasPrior = cr.priorRevenue > 0 || cr.priorUnits > 0;

        if (hasCurrent && hasPrior) { cr.status = 'continuing'; continueCount++; }
        else if (hasCurrent) { cr.status = 'new'; newCount++; }
        else { cr.status = 'dropped'; dropCount++; }

        if (hasCurrent) currentColorCount++;
        if (hasPrior) priorColorCount++;
        if (cr.third.revenue > 0 || cr.third.units > 0) thirdColorCount++;

        colorRows.push(cr);
      }

      const statusOrd = { continuing: 0, new: 1, dropped: 2 };
      colorRows.sort((a, b) => {
        if (statusOrd[a.status] !== statusOrd[b.status]) return statusOrd[a.status] - statusOrd[b.status];
        const aVal = a.status === 'dropped' ? a.priorRevenue : a.currentRevenue;
        const bVal = b.status === 'dropped' ? b.priorRevenue : b.currentRevenue;
        return bVal - aVal;
      });

      rows.push({
        styleKey,
        styleNumber: displayNumber || styleKey,
        styleDesc: info.styleDesc,
        divisionDesc: info.divisionDesc,
        categoryDesc: info.categoryDesc,
        currentRevenue: cur.revenue, currentUnits: cur.units, currentCost: cur.cost,
        priorRevenue: pri.revenue, priorUnits: pri.units, priorCost: pri.cost,
        third: { revenue: thi.revenue, units: thi.units, cost: thi.cost, customers: thi.customers.size, colorCount: thirdColorCount },
        currentCustomers: cur.customers.size, priorCustomers: pri.customers.size,
        colors: colorRows,
        currentColorCount, priorColorCount,
        newCount, dropCount, continueCount,
      });
    }

    // Sort styles by metric
    rows.sort((a, b) => {
      const av = metricMode === 'revenue' ? a.currentRevenue : a.currentUnits;
      const bv = metricMode === 'revenue' ? b.currentRevenue : b.currentUnits;
      return bv - av;
    });

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return rows.filter(r =>
        r.styleDesc.toLowerCase().includes(q) ||
        r.styleNumber.toLowerCase().includes(q) ||
        r.colors.some(c => c.colorDesc.toLowerCase().includes(q) || c.colorCode.toLowerCase().includes(q))
      );
    }
    return rows;
  }, [sales, currentSeason, priorSeason, thirdSeason, activeSeasons, selectedDivision, selectedCategory, selectedCustomerType, selectedCustomer, combineStyles, metricMode, searchQuery]);

  // Detail panel always visible — default to top-selling style
  const selectedStyle = useMemo(() => {
    if (styleRows.length === 0) return null;
    // If user picked a style and it's still in the list, use it
    if (selectedStyleKey) {
      const found = styleRows.find(r => r.styleKey === selectedStyleKey);
      if (found) return found;
    }
    // Default to top style (list is already sorted by metric)
    return styleRows[0];
  }, [styleRows, selectedStyleKey]);

  // ── Handlers ─────────────────────────────────────────────────────

  const toggleExpand = useCallback((styleKey: string) => {
    setExpandedStyles(prev => { const n = new Set(prev); if (n.has(styleKey)) n.delete(styleKey); else n.add(styleKey); return n; });
  }, []);

  const handleStyleSelect = useCallback((styleKey: string) => {
    setSelectedStyleKey(styleKey);
    // Only changes detail panel — does NOT expand
  }, []);

  const handleExport = () => {
    const exportRows: Record<string, unknown>[] = [];
    for (const s of styleRows) {
      const row: Record<string, unknown> = {
        Style: s.styleNumber, 'Style Desc': s.styleDesc, Division: s.divisionDesc, Category: s.categoryDesc,
        Color: '', Status: '',
        [`${currentSeason} Rev`]: s.currentRevenue, [`${currentSeason} Units`]: s.currentUnits,
        [`${priorSeason} Rev`]: s.priorRevenue, [`${priorSeason} Units`]: s.priorUnits,
      };
      if (thirdSeason) {
        row[`${thirdSeason} Rev`] = s.third.revenue;
        row[`${thirdSeason} Units`] = s.third.units;
      }
      row['Rev Change %'] = pctChange(s.currentRevenue, s.priorRevenue)?.toFixed(1) ?? '';
      row['Unit Change %'] = pctChange(s.currentUnits, s.priorUnits)?.toFixed(1) ?? '';
      row[`${currentSeason} Colors`] = s.currentColorCount;
      row[`${priorSeason} Colors`] = s.priorColorCount;
      row['New Colors'] = s.newCount;
      row['Dropped Colors'] = s.dropCount;
      exportRows.push(row);

      for (const c of s.colors) {
        const cRow: Record<string, unknown> = {
          Style: s.styleNumber, 'Style Desc': '', Division: '', Category: '',
          Color: `${c.colorCode} ${c.colorDesc}`, Status: c.status,
          [`${currentSeason} Rev`]: c.currentRevenue || '', [`${currentSeason} Units`]: c.currentUnits || '',
          [`${priorSeason} Rev`]: c.priorRevenue || '', [`${priorSeason} Units`]: c.priorUnits || '',
        };
        if (thirdSeason) {
          cRow[`${thirdSeason} Rev`] = c.third.revenue || '';
          cRow[`${thirdSeason} Units`] = c.third.units || '';
        }
        cRow['Rev Change %'] = pctChange(c.currentRevenue, c.priorRevenue)?.toFixed(1) ?? '';
        cRow['Unit Change %'] = pctChange(c.currentUnits, c.priorUnits)?.toFixed(1) ?? '';
        exportRows.push(cRow);
      }
    }
    const suffix = thirdSeason ? `${currentSeason}_vs_${priorSeason}_vs_${thirdSeason}` : `${currentSeason}_vs_${priorSeason}`;
    exportToExcel(exportRows, `style-color-perf_${suffix}`);
  };

  const getCur = (r: { currentRevenue: number; currentUnits: number }) => metricMode === 'revenue' ? r.currentRevenue : r.currentUnits;
  const getPri = (r: { priorRevenue: number; priorUnits: number }) => metricMode === 'revenue' ? r.priorRevenue : r.priorUnits;
  const getThird = (r: { third: SeasonData }) => metricMode === 'revenue' ? r.third.revenue : r.third.units;
  const fmt = metricMode === 'revenue' ? formatCurrencyShort : formatNumberShort;
  const has3 = !!thirdSeason;

  // ── Render ───────────────────────────────────────────────────────

  if (allSeasons.length < 2) {
    const stillLoading = sales.length > 0 && allSeasons.length < 2;
    return (
      <div className="p-5">
        <div className="bg-surface-primary rounded-xl p-12 text-center border border-border-primary">
          {stillLoading ? (
            <>
              <div className="inline-block w-8 h-8 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin mb-4" />
              <p className="text-text-muted text-lg">Loading sales data…</p>
              <p className="text-text-muted text-sm mt-2">
                {formatNumberShort(sales.length)} records loaded ({allSeasons.join(', ')}) — waiting for more seasons…
              </p>
            </>
          ) : (
            <>
              <p className="text-text-muted text-lg">Not enough season data to compare.</p>
              <p className="text-text-muted text-sm mt-2">Need sales in at least two comparable seasons (e.g. 25SP &amp; 24SP).</p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-5 space-y-3">
      <SalesLoadingBanner />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-text-primary">Style / Color Performance</h2>
          <p className="text-sm text-text-muted mt-1">Compare style and color revenue across seasons</p>
        </div>
        <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2.5 bg-surface-primary border border-border-primary rounded-lg text-sm font-medium text-text-secondary hover:bg-surface-secondary transition-colors">
          <Download className="w-4 h-4" /> Export
        </button>
      </div>

      {/* Season Comparison Bar */}
      <div className="flex items-center gap-4 px-5 py-3.5 bg-surface-primary border border-border-primary rounded-xl">
        <span className="text-[13px] font-medium text-text-muted">Seasons:</span>
        <div className="flex gap-1.5">
          {allSeasons.map(season => {
            const isActive = season === activeSeason;
            const isCompare = season === compareSeason;
            const isThird = season === thirdSeason;
            return (
              <button
                key={season}
                onClick={() => handleSeasonClick(season)}
                onContextMenu={e => { e.preventDefault(); handleCompareClick(season); }}
                title="Click to set primary · Right-click to add/remove comparison"
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer
                  ${isActive
                    ? 'bg-[#0a84ff] border-[#0a84ff] text-white'
                    : isCompare
                      ? 'bg-[rgba(255,159,10,0.15)] border-[#ff9f0a] text-[#ff9f0a]'
                      : isThird
                        ? 'bg-[rgba(191,90,242,0.15)] border-[#bf5af2] text-[#bf5af2]'
                        : 'bg-surface-secondary border-border-primary text-text-muted hover:text-text-primary hover:border-text-muted'
                  }`}
              >
                {season}
              </button>
            );
          })}
        </div>
        <span className="text-text-muted/40 text-xs">|</span>
        <span className="text-xs text-text-muted">
          <strong className="text-[#0a84ff]">{activeSeason}</strong>
          {compareSeason && <> vs <strong className="text-[#ff9f0a]">{compareSeason}</strong></>}
          {thirdSeason && <> vs <strong className="text-[#bf5af2]">{thirdSeason}</strong></>}
        </span>
        <div className="flex gap-2 ml-auto">
          <button
            onClick={() => { const yoy = getYoYSeason(activeSeason); if (yoy && allSeasons.includes(yoy)) setCompareSeason(yoy); }}
            className="px-3 py-1 rounded-md text-[11px] font-medium border border-border-primary bg-surface-secondary text-text-muted hover:text-text-primary hover:bg-surface-secondary/80 transition-colors"
          >
            YoY
          </button>
          <button
            onClick={() => {
              // 3-year trend: active, YoY, and YoY-1
              const yoy = getYoYSeason(activeSeason);
              if (yoy && allSeasons.includes(yoy)) {
                setCompareSeason(yoy);
                const yoy2 = getYoYSeason(yoy);
                if (yoy2 && allSeasons.includes(yoy2)) setThirdSeason(yoy2);
              }
            }}
            className="px-3 py-1 rounded-md text-[11px] font-medium border border-border-primary bg-surface-secondary text-text-muted hover:text-text-primary hover:bg-surface-secondary/80 transition-colors"
          >
            3-Year
          </button>
          <button
            onClick={() => { setCompareSeason(''); setThirdSeason(''); }}
            className="px-3 py-1 rounded-md text-[11px] font-medium border border-border-primary bg-surface-secondary text-text-muted hover:text-text-primary hover:bg-surface-secondary/80 transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Options Bar */}
      <div className="flex items-center gap-4 flex-wrap bg-surface-primary border border-border-primary rounded-xl px-4 py-2.5">
        <label className="flex items-center gap-2 text-sm text-text-primary cursor-pointer select-none">
          <input type="checkbox" checked={combineStyles} onChange={e => setCombineStyles(e.target.checked)} className="w-4 h-4 rounded border-border-primary text-cyan-500 focus:ring-cyan-500" />
          Combine Styles
        </label>

        <div className="w-px h-6 bg-border-primary" />

        <div className="flex items-center gap-1">
          <span className="text-xs text-text-muted uppercase tracking-wider">Show</span>
          <div className="flex items-center bg-surface-secondary rounded-md p-0.5">
            <button onClick={() => setMetricMode('revenue')} className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${metricMode === 'revenue' ? 'bg-cyan-600 text-white' : 'text-text-muted hover:text-text-primary'}`}>
              $
            </button>
            <button onClick={() => setMetricMode('units')} className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${metricMode === 'units' ? 'bg-cyan-600 text-white' : 'text-text-muted hover:text-text-primary'}`}>
              Units
            </button>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2 bg-surface-secondary border border-border-primary rounded-md px-3 py-2">
          <Search className="w-4 h-4 text-text-muted" />
          <input type="text" placeholder="Search styles or colors..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            className="bg-transparent text-sm text-text-primary placeholder:text-text-muted w-44 focus:outline-none" />
        </div>
      </div>

      {/* Active filters */}
      {(selectedDivision || selectedCategory || selectedCustomerType || selectedCustomer) && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-cyan-500/5 border border-cyan-500/20 rounded-lg text-[13px]">
          <span className="text-text-muted">Filtering by:</span>
          {selectedDivision && <span className="px-2.5 py-1 bg-cyan-600 text-white rounded-md font-medium">{selectedDivision.split('|').filter(Boolean).join(', ')}</span>}
          {selectedCategory && <span className="px-2.5 py-1 bg-cyan-600 text-white rounded-md font-medium">{selectedCategory.split('|').filter(Boolean).join(', ')}</span>}
          {selectedCustomerType && <span className="px-2.5 py-1 bg-cyan-600 text-white rounded-md font-medium">{selectedCustomerType.split('|').filter(Boolean).join(', ')}</span>}
          {selectedCustomer && <span className="px-2.5 py-1 bg-cyan-600 text-white rounded-md font-medium">{selectedCustomer.split('|').filter(Boolean).join(', ')}</span>}
        </div>
      )}

      {/* Main grid — 50/50 split when detail open */}
      <div className="grid gap-4 grid-cols-2" style={{ height: 'calc(100vh - 280px)' }}>
        {/* ── Left: Style Table ── */}
        <div className="bg-surface-primary rounded-xl border border-border-primary overflow-hidden flex flex-col">
          {/* Table Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-primary bg-surface-secondary">
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold text-text-primary">All Styles</span>
              <span className="text-base text-text-muted">{styleRows.length} styles</span>
            </div>
          </div>

          {/* Column Headers */}
          <div className={`grid gap-1 px-3 py-2.5 border-b border-border-primary text-[15px] font-semibold text-text-muted uppercase bg-surface-primary sticky top-0 z-10 ${has3 ? 'grid-cols-[1fr_95px_95px_95px_80px]' : 'grid-cols-[1fr_110px_110px_90px]'}`}>
            <div className="pl-1">Style</div>
            <div className="text-right text-[#0a84ff]">{currentSeason}</div>
            <div className="text-right text-[#ff9f0a]">{priorSeason}</div>
            {has3 && <div className="text-right text-[#bf5af2]">{thirdSeason}</div>}
            <div className="text-right">Chg</div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {styleRows.length === 0 ? (
              <div className="p-8 text-center text-text-muted text-base">No data for this comparison.</div>
            ) : styleRows.map(style => {
              const isExp = expandedStyles.has(style.styleKey);
              const isSel = selectedStyle?.styleKey === style.styleKey;
              const chg = pctChange(getCur(style), getPri(style));

              return (
                <div key={style.styleKey}>
                  {/* Style row */}
                  <div
                    className={`grid gap-1 px-3 py-3 cursor-pointer transition-colors border-b border-border-primary hover:bg-surface-secondary/50 ${isSel ? 'bg-cyan-500/10' : ''} ${has3 ? 'grid-cols-[1fr_95px_95px_95px_80px]' : 'grid-cols-[1fr_110px_110px_90px]'}`}
                    onClick={() => handleStyleSelect(style.styleKey)}
                    style={isSel ? { boxShadow: 'inset 3px 0 0 #06b6d4' } : undefined}
                  >
                    <div className="flex items-center gap-2 text-left min-w-0 pl-1">
                      <button onClick={e => { e.stopPropagation(); toggleExpand(style.styleKey); }}
                        className={`w-5 h-5 flex items-center justify-center rounded flex-shrink-0 transition-all ${isExp ? 'bg-cyan-500/15 text-cyan-400' : 'bg-surface-secondary text-text-muted'}`}>
                        {isExp ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      </button>
                      <div className="min-w-0">
                        <div className={`${has3 ? 'text-[16px]' : 'text-[17px]'} font-medium text-text-primary truncate leading-tight`}>{style.styleDesc}</div>
                        <div className="text-[14px] text-text-muted mt-px">
                          {style.styleNumber} · {style.colors.length} clrs
                          {style.newCount > 0 && ` · ${style.newCount} new`}
                          {style.dropCount > 0 && ` · ${style.dropCount} drop`}
                        </div>
                      </div>
                    </div>
                    <div className={`text-right font-mono ${has3 ? 'text-[16px]' : 'text-[17px]'} font-medium text-text-primary self-center`}>{fmt(getCur(style))}</div>
                    <div className={`text-right font-mono ${has3 ? 'text-[16px]' : 'text-[17px]'} text-text-secondary self-center`}>{fmt(getPri(style))}</div>
                    {has3 && <div className="text-right font-mono text-[16px] text-text-secondary self-center">{fmt(getThird(style))}</div>}
                    <div className={`text-right font-mono text-[15px] font-medium self-center ${changeColor(chg)}`}>{fmtChange(chg)}</div>
                  </div>

                  {/* Expanded color rows — WITH per-color revenue from sales */}
                  {isExp && (
                    <>
                      {style.colors.length > 0 ? style.colors.map(c => {
                        const cChg = pctChange(getCur(c), getPri(c));
                        const cThirdVal = getThird(c);
                        return (
                          <div key={c.colorCode}
                            className={`grid gap-1 px-3 py-2.5 border-b border-border-primary ${has3 ? 'grid-cols-[1fr_95px_95px_95px_80px]' : 'grid-cols-[1fr_110px_110px_90px]'}`}
                            style={{ background: 'var(--color-surface-secondary, #0d0d0f)', paddingLeft: '46px' }}
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className={`text-[15px] truncate ${c.status === 'dropped' ? 'text-text-muted line-through' : 'text-text-secondary'}`}>{c.colorDesc}</span>
                              <span className="text-[13px] text-text-muted/50 font-mono flex-shrink-0">{c.colorCode}</span>
                              {c.status === 'new' && <span className="px-1.5 py-0.5 text-[11px] font-semibold rounded bg-cyan-500/15 text-cyan-400 flex-shrink-0">NEW</span>}
                              {c.status === 'dropped' && <span className="px-1.5 py-0.5 text-[11px] font-semibold rounded bg-red-500/15 text-red-400 flex-shrink-0">DROP</span>}
                            </div>
                            <div className="text-right font-mono text-[15px] text-text-secondary self-center">{getCur(c) > 0 ? fmt(getCur(c)) : '—'}</div>
                            <div className="text-right font-mono text-[15px] text-text-muted self-center">{getPri(c) > 0 ? fmt(getPri(c)) : '—'}</div>
                            {has3 && <div className="text-right font-mono text-[15px] text-text-muted self-center">{cThirdVal > 0 ? fmt(cThirdVal) : '—'}</div>}
                            <div className={`text-right font-mono text-[14px] self-center ${changeColor(cChg)}`}>{c.status === 'new' ? 'NEW' : c.status === 'dropped' ? '-100%' : fmtChange(cChg)}</div>
                          </div>
                        );
                      }) : (
                        <div className="px-4 py-3 text-[15px] text-text-muted" style={{ paddingLeft: '50px', background: 'var(--color-surface-secondary, #0d0d0f)' }}>
                          No color-level sales data for {currentSeason} or {priorSeason}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer / Legend */}
          <div className="px-4 py-2.5 border-t border-border-primary flex items-center gap-4 text-[13px] text-text-muted bg-surface-secondary">
            <div className="flex items-center gap-1.5"><span className="px-1.5 py-0.5 text-[11px] font-semibold rounded bg-cyan-500/15 text-cyan-400">NEW</span> New this season</div>
            <div className="flex items-center gap-1.5"><span className="px-1.5 py-0.5 text-[11px] font-semibold rounded bg-red-500/15 text-red-400">DROP</span> No sales this season</div>
          </div>
        </div>

        {/* ── Right: Detail Panel ── */}
        {!selectedStyle && (
          <div className="bg-surface-primary rounded-xl border border-border-primary flex items-center justify-center">
            <p className="text-text-muted text-base">Select a style to view details</p>
          </div>
        )}
        {selectedStyle && (
          <div className="flex flex-col gap-3 overflow-y-auto">
            {/* Detail Header + KPIs */}
            <div className="bg-surface-primary rounded-xl border border-border-primary p-4">
              <div className="flex items-start justify-between mb-4">
                <div className="min-w-0">
                  <h3 className="text-xl font-semibold text-text-primary truncate">{selectedStyle.styleDesc}</h3>
                  <div className="text-sm text-text-muted mt-1">
                    {selectedStyle.styleNumber}
                    {selectedStyle.divisionDesc && ` · ${selectedStyle.divisionDesc}`}
                    {selectedStyle.categoryDesc && ` · ${selectedStyle.categoryDesc}`}
                    {` · ${selectedStyle.colors.length} colors`}
                  </div>
                </div>
                {/* Detail panel always visible — no close button */}
              </div>

              {/* KPIs */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Revenue', cur: selectedStyle.currentRevenue, pri: selectedStyle.priorRevenue, thi: selectedStyle.third.revenue, fmtFn: formatCurrencyShort },
                  { label: 'Units', cur: selectedStyle.currentUnits, pri: selectedStyle.priorUnits, thi: selectedStyle.third.units, fmtFn: formatNumberShort },
                  { label: 'Margin', cur: selectedStyle.currentRevenue > 0 ? ((selectedStyle.currentRevenue - selectedStyle.currentCost) / selectedStyle.currentRevenue) * 100 : 0, pri: selectedStyle.priorRevenue > 0 ? ((selectedStyle.priorRevenue - selectedStyle.priorCost) / selectedStyle.priorRevenue) * 100 : 0, thi: selectedStyle.third.revenue > 0 ? ((selectedStyle.third.revenue - selectedStyle.third.cost) / selectedStyle.third.revenue) * 100 : 0, fmtFn: (v: number) => formatPercent(v), isMargin: true },
                ].map(kpi => {
                  const d = pctChange(kpi.cur, kpi.pri);
                  const isMargin = 'isMargin' in kpi && kpi.isMargin;
                  return (
                    <div key={kpi.label} className="bg-surface-secondary rounded-lg p-3">
                      <div className="text-xs text-text-muted uppercase">{kpi.label}</div>
                      <div className={`text-xl font-semibold font-mono mt-1 ${isMargin && kpi.cur > 40 ? 'text-emerald-400' : 'text-text-primary'}`}>{kpi.fmtFn(kpi.cur)}</div>
                      <div className={`text-sm mt-1 ${changeColor(d)}`}>
                        {isMargin && d !== null
                          ? `${d > 0 ? '+' : ''}${d.toFixed(1)}pp`
                          : fmtChange(d)}
                      </div>
                      {has3 && (
                        <div className="text-xs mt-0.5 text-text-faint font-mono">
                          {thirdSeason}: {kpi.fmtFn(kpi.thi)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Side-by-side Season Comparison with revenue */}
            <div className={`grid gap-3 ${has3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
              {/* Third Season (oldest, leftmost when active) */}
              {has3 && (
                <div className="bg-surface-primary rounded-xl border border-[#bf5af2]/40 overflow-hidden">
                  <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-border-primary bg-[#bf5af2]/5">
                    <span className="text-[14px] font-semibold text-[#bf5af2]">{thirdSeason}</span>
                    <span className="text-xs text-[#bf5af2]">{selectedStyle.third.colorCount} clrs</span>
                  </div>
                  <div className="max-h-[280px] overflow-y-auto">
                    {selectedStyle.colors.map(c => {
                      const val = c.third.revenue;
                      return (
                        <div key={c.colorCode} className="flex items-center px-3 py-1.5 border-b border-border-primary last:border-b-0">
                          <span className={`text-xs truncate ${val > 0 ? 'text-text-secondary' : 'text-text-muted/40'}`}>{c.colorDesc}</span>
                          <span className="ml-auto font-mono text-[12px] text-text-muted flex-shrink-0">{val > 0 ? formatCurrencyShort(val) : '—'}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Prior Season */}
              <div className="bg-surface-primary rounded-xl border border-border-primary overflow-hidden">
                <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-border-primary bg-surface-secondary">
                  <span className={`${has3 ? 'text-[14px]' : 'text-[15px]'} font-semibold text-[#ff9f0a]`}>{priorSeason}</span>
                  <span className={`${has3 ? 'text-xs' : 'text-sm'} text-text-muted`}>{selectedStyle.priorColorCount} {has3 ? 'clrs' : 'colors'}</span>
                </div>
                <div className="max-h-[280px] overflow-y-auto">
                  {selectedStyle.colors.filter(c => c.status !== 'new').length > 0
                    ? selectedStyle.colors.filter(c => c.status !== 'new').map(c => (
                      <div key={c.colorCode} className={`flex items-center px-3${has3 ? '' : '.5'} py-${has3 ? '1.5' : '2'} border-b border-border-primary last:border-b-0`}>
                        <span className={`${has3 ? 'text-xs' : 'text-sm'} truncate ${c.status === 'dropped' ? 'text-text-muted' : 'text-text-secondary'}`}>{c.colorDesc}</span>
                        {c.status === 'dropped' && <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-red-500/15 text-red-400 flex-shrink-0 ml-1">DROP</span>}
                        <span className={`ml-auto font-mono ${has3 ? 'text-[12px]' : 'text-[13px]'} text-text-muted flex-shrink-0`}>{formatCurrencyShort(c.priorRevenue)}</span>
                      </div>
                    ))
                    : <div className="px-3.5 py-3 text-sm text-text-muted">No prior season sales</div>
                  }
                  {selectedStyle.colors.filter(c => c.status === 'new').map(c => (
                    <div key={c.colorCode} className={`flex items-center px-3${has3 ? '' : '.5'} py-${has3 ? '1.5' : '2'} border-b border-border-primary last:border-b-0 opacity-30`}>
                      <span className={`${has3 ? 'text-xs' : 'text-sm'} text-text-muted truncate`}>{c.colorDesc}</span>
                      <span className="ml-auto text-sm text-text-muted">—</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Current Season */}
              <div className="bg-surface-primary rounded-xl border-2 border-cyan-500/40 overflow-hidden">
                <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-border-primary bg-cyan-500/5">
                  <span className={`${has3 ? 'text-[14px]' : 'text-[15px]'} font-semibold text-cyan-400`}>{currentSeason}</span>
                  <span className={`${has3 ? 'text-xs' : 'text-sm'} text-cyan-400`}>{selectedStyle.currentColorCount} {has3 ? 'clrs' : 'colors'}</span>
                </div>
                <div className="max-h-[280px] overflow-y-auto">
                  {selectedStyle.colors.filter(c => c.status !== 'dropped').length > 0
                    ? selectedStyle.colors.filter(c => c.status !== 'dropped').map(c => (
                        <div key={c.colorCode} className={`flex items-center px-3${has3 ? '' : '.5'} py-${has3 ? '1.5' : '2'} border-b border-border-primary last:border-b-0`}>
                          <span className={`${has3 ? 'text-xs' : 'text-sm'} text-text-secondary truncate`}>{c.colorDesc}</span>
                          {c.status === 'new' && <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-cyan-500/15 text-cyan-400 flex-shrink-0 ml-1">NEW</span>}
                          <span className={`ml-auto font-mono ${has3 ? 'text-[12px]' : 'text-[13px]'} text-text-primary flex-shrink-0`}>{formatCurrencyShort(c.currentRevenue)}</span>
                        </div>
                      ))
                    : <div className="px-3.5 py-3 text-sm text-text-muted">No current season sales</div>
                  }
                  {selectedStyle.colors.filter(c => c.status === 'dropped').map(c => (
                    <div key={c.colorCode} className={`flex items-center px-3${has3 ? '' : '.5'} py-${has3 ? '1.5' : '2'} border-b border-border-primary last:border-b-0 opacity-30`}>
                      <span className={`${has3 ? 'text-xs' : 'text-sm'} text-text-muted truncate`}>{c.colorDesc}</span>
                      <span className="ml-auto text-sm text-text-muted">—</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Change Summary with revenue */}
            <div className="bg-surface-primary rounded-xl border border-border-primary p-4">
              <div className="text-[15px] font-semibold text-text-primary mb-3">Change Summary</div>
              {(() => {
                const contRev = selectedStyle.colors.filter(c => c.status === 'continuing').reduce((s, c) => s + c.currentRevenue, 0);
                const contPriRev = selectedStyle.colors.filter(c => c.status === 'continuing').reduce((s, c) => s + c.priorRevenue, 0);
                const newRev = selectedStyle.colors.filter(c => c.status === 'new').reduce((s, c) => s + c.currentRevenue, 0);
                const dropRev = selectedStyle.colors.filter(c => c.status === 'dropped').reduce((s, c) => s + c.priorRevenue, 0);
                return (
                  <div className="space-y-0">
                    <div className="flex justify-between py-1.5 border-b border-border-primary text-[15px]">
                      <span className="text-text-muted">Continuing</span>
                      <span className="font-mono text-text-primary">{selectedStyle.continueCount} colors · {formatCurrencyShort(contRev)}{contPriRev > 0 ? ` (${fmtChange(pctChange(contRev, contPriRev))})` : ''}</span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-border-primary text-[15px]">
                      <span className="text-text-muted">New Colors</span>
                      <span className="font-mono text-cyan-400">{selectedStyle.newCount} colors · +{formatCurrencyShort(newRev)}</span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-border-primary text-[15px]">
                      <span className="text-text-muted">Dropped Colors</span>
                      <span className="font-mono text-red-400">{selectedStyle.dropCount} colors · -{formatCurrencyShort(dropRev)}</span>
                    </div>
                    <div className="flex justify-between py-2.5 mt-1 -mx-4 px-4 bg-surface-secondary rounded-b-xl text-[15px]">
                      <span className="font-semibold text-text-primary">Net Change</span>
                      <span className={`font-mono font-semibold ${changeColor(pctChange(selectedStyle.currentRevenue, selectedStyle.priorRevenue))}`}>
                        {fmtChange(pctChange(selectedStyle.currentRevenue, selectedStyle.priorRevenue))} ({selectedStyle.priorColorCount} → {selectedStyle.currentColorCount} colors)
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Link to full detail */}
            <button onClick={() => onStyleClick(selectedStyle.styleNumber)}
              className="w-full py-2.5 text-sm font-medium text-cyan-400 hover:text-cyan-300 bg-surface-primary border border-border-primary hover:bg-surface-secondary rounded-xl transition-colors">
              View Full Style Detail →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
