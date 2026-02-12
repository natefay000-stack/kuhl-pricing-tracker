'use client';

import { useState, useMemo, useCallback, Fragment } from 'react';
import { SalesRecord, Product, PricingRecord, CostRecord, normalizeCategory } from '@/types/product';
import { sortSeasons } from '@/lib/store';
import { formatCurrencyShort, formatNumber } from '@/utils/format';
import {
  ChevronRight as ChevronRightIcon,
  Download,
  Search,
} from 'lucide-react';

// Sales aggregation types (from API)
interface ChannelAggregation {
  channel: string;
  season: string;
  revenue: number;
  units: number;
}

interface CategoryAggregation {
  category: string;
  season: string;
  revenue: number;
  units: number;
}

interface GenderAggregation {
  gender: string;
  season: string;
  revenue: number;
  units: number;
}

interface CustomerAggregation {
  customer: string;
  customerType: string;
  season: string;
  revenue: number;
  units: number;
}

interface SalesAggregations {
  byChannel: ChannelAggregation[];
  byCategory: CategoryAggregation[];
  byGender: GenderAggregation[];
  byCustomer: CustomerAggregation[];
}

interface SalesViewProps {
  sales: SalesRecord[];
  products: Product[];
  pricing: PricingRecord[];
  costs: CostRecord[];
  salesAggregations: SalesAggregations | null;
  selectedSeason: string;
  selectedDivision: string;
  selectedCategory: string;
  onStyleClick: (styleNumber: string) => void;
}

type SubTab = 'style' | 'customer' | 'category' | 'region';
type ViewMode = 'units' | 'revenue' | 'both';

// Map division codes to labels
// Sales data has numeric codes: 01=Men's, 02=Women's, 08=Unisex, 06=Other
// Products have string labels: "Men's", "Women's", "Unisex"
// Sales also have a 'gender' field with "Men", "Women", "Unisex"
function getDivisionLabel(sale: SalesRecord): string {
  // Priority 1: Use the gender field (has "Men", "Women", "Unisex")
  if (sale.gender) {
    if (sale.gender === 'Men') return "Men's";
    if (sale.gender === 'Women') return "Women's";
    return sale.gender;
  }
  // Priority 2: Map numeric division codes
  const code = sale.divisionDesc;
  if (code === '01') return "Men's";
  if (code === '02') return "Women's";
  if (code === '08') return 'Unisex';
  if (code === '06') return 'Other';
  // Priority 3: Check for text labels (from products)
  if (!code) return 'Unknown';
  const lower = code.toLowerCase();
  if (lower.includes("women")) return "Women's";
  if (lower.includes("men")) return "Men's";
  if (lower.includes("unisex")) return "Unisex";
  return code;
}

// Get the YoY comparison season (e.g., 25FA → 24FA)
function getYoYSeason(season: string): string | null {
  if (!season || season.length !== 4) return null;
  const yearNum = parseInt(season.slice(0, 2), 10);
  const type = season.slice(2);
  if (isNaN(yearNum) || yearNum <= 0) return null;
  return `${(yearNum - 1).toString().padStart(2, '0')}${type}`;
}

// Calculate percentage change
function calcChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return ((current - previous) / previous) * 100;
}

// Chart color palette
const CHART_COLORS = [
  '#0a84ff', // blue
  '#bf5af2', // purple
  '#30d158', // green
  '#ff9f0a', // orange
  '#5ac8fa', // teal
  '#ff453a', // red
  '#636366', // gray
];

export default function SalesView({
  sales,
  products,
  pricing,
  costs,
  salesAggregations,
  selectedSeason,
  selectedDivision,
  selectedCategory,
  onStyleClick,
}: SalesViewProps) {
  // Season comparison state
  const allSeasons = useMemo(() => {
    const s = new Set<string>();
    sales.forEach((r) => r.season && s.add(r.season));
    if (salesAggregations) {
      salesAggregations.byChannel.forEach((c) => c.season && s.add(c.season));
      salesAggregations.byCategory.forEach((c) => c.season && s.add(c.season));
    }
    return sortSeasons(Array.from(s)).reverse(); // newest first
  }, [sales, salesAggregations]);

  const [activeSeason, setActiveSeason] = useState<string>(
    selectedSeason || allSeasons[0] || ''
  );
  const [compareSeason, setCompareSeason] = useState<string>(() => {
    const initial = selectedSeason || allSeasons[0] || '';
    return getYoYSeason(initial) || allSeasons[1] || '';
  });

  // Sub-tabs and view mode
  const [subTab, setSubTab] = useState<SubTab>('style');
  const [viewMode, setViewMode] = useState<ViewMode>('units');

  // Table state
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedStyles, setExpandedStyles] = useState<Set<string>>(new Set());
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null);
  const pageSize = 25;

  // Season pill click handler
  const handleSeasonClick = useCallback((season: string) => {
    if (season === activeSeason) return;
    if (season === compareSeason) {
      // Swap
      setCompareSeason(activeSeason);
      setActiveSeason(season);
    } else {
      setActiveSeason(season);
      // Auto-set compare to YoY
      const yoy = getYoYSeason(season);
      if (yoy && allSeasons.includes(yoy)) {
        setCompareSeason(yoy);
      }
    }
    setCurrentPage(1);
  }, [activeSeason, compareSeason, allSeasons]);

  const handleCompareClick = useCallback((season: string) => {
    if (season === activeSeason) return;
    setCompareSeason(season === compareSeason ? '' : season);
    setCurrentPage(1);
  }, [activeSeason, compareSeason]);

  // Filter sales by active season
  const activeSales = useMemo(() => {
    return sales.filter((s) => {
      if (s.season !== activeSeason) return false;
      if (selectedDivision && s.divisionDesc !== selectedDivision) return false;
      if (selectedCategory && normalizeCategory(s.categoryDesc) !== selectedCategory) return false;
      return true;
    });
  }, [sales, activeSeason, selectedDivision, selectedCategory]);

  // Filter sales by compare season
  const compareSales = useMemo(() => {
    if (!compareSeason) return [];
    return sales.filter((s) => {
      if (s.season !== compareSeason) return false;
      if (selectedDivision && s.divisionDesc !== selectedDivision) return false;
      if (selectedCategory && normalizeCategory(s.categoryDesc) !== selectedCategory) return false;
      return true;
    });
  }, [sales, compareSeason, selectedDivision, selectedCategory]);

  // ── Big Metric Cards ──
  const metrics = useMemo(() => {
    const activeRevenue = activeSales.reduce((sum, s) => sum + (s.revenue || 0), 0);
    const activeUnits = activeSales.reduce((sum, s) => sum + (s.unitsBooked || 0), 0);
    const activeStyles = new Set(activeSales.map((s) => s.styleNumber).filter(Boolean)).size;
    const activeAvgPrice = activeUnits > 0 ? activeRevenue / activeUnits : 0;

    const compareRevenue = compareSales.reduce((sum, s) => sum + (s.revenue || 0), 0);
    const compareUnits = compareSales.reduce((sum, s) => sum + (s.unitsBooked || 0), 0);
    const compareStyles = new Set(compareSales.map((s) => s.styleNumber).filter(Boolean)).size;
    const compareAvgPrice = compareUnits > 0 ? compareRevenue / compareUnits : 0;

    return {
      revenue: { current: activeRevenue, compare: compareRevenue, change: calcChange(activeRevenue, compareRevenue) },
      units: { current: activeUnits, compare: compareUnits, change: calcChange(activeUnits, compareUnits) },
      avgPrice: { current: activeAvgPrice, compare: compareAvgPrice, change: calcChange(activeAvgPrice, compareAvgPrice) },
      styles: { current: activeStyles, compare: compareStyles, diff: activeStyles - compareStyles },
    };
  }, [activeSales, compareSales]);

  // ── Product Lookups (needed by charts and table) ──

  // Build a product color lookup: styleNumber → list of { color, colorDesc }
  const productColorMap = useMemo(() => {
    const map = new Map<string, { color: string; colorDesc: string }[]>();
    products.forEach((p) => {
      if (!p.styleNumber || !p.color) return;
      let list = map.get(p.styleNumber);
      if (!list) { list = []; map.set(p.styleNumber, list); }
      // Deduplicate
      if (!list.find((c) => c.color === p.color)) {
        list.push({ color: p.color, colorDesc: p.colorDesc || p.color });
      }
    });
    return map;
  }, [products]);

  // Build a product divisionDesc lookup: styleNumber → "Men's" / "Women's" / "Unisex"
  const productDivisionMap = useMemo(() => {
    const map = new Map<string, string>();
    products.forEach((p) => {
      if (p.styleNumber && p.divisionDesc) {
        map.set(p.styleNumber, p.divisionDesc);
      }
    });
    return map;
  }, [products]);

  // ── Charts Data ──

  // By Division (donut) - uses gender field from sales + product division lookup
  const byDivision = useMemo(() => {
    const grouped = new Map<string, number>();
    activeSales.forEach((s) => {
      // Use product data for division label first, fallback to sales gender field
      const prodDiv = productDivisionMap.get(s.styleNumber);
      const label = prodDiv || getDivisionLabel(s);
      grouped.set(label, (grouped.get(label) || 0) + (s.revenue || 0));
    });
    const total = Array.from(grouped.values()).reduce((a, b) => a + b, 0);
    return {
      total,
      items: Array.from(grouped.entries())
        .map(([key, revenue]) => ({
          label: key,
          revenue,
          percent: total > 0 ? (revenue / total) * 100 : 0,
        }))
        .sort((a, b) => b.revenue - a.revenue),
    };
  }, [activeSales, productDivisionMap]);

  // By Channel (donut) - using aggregations if available, else from sales
  const byChannel = useMemo(() => {
    const grouped = new Map<string, number>();

    if (salesAggregations?.byChannel) {
      const filtered = salesAggregations.byChannel.filter((c) => c.season === activeSeason);
      filtered.forEach((c) => {
        const label = c.channel || 'Other';
        grouped.set(label, (grouped.get(label) || 0) + (c.revenue || 0));
      });
    } else {
      activeSales.forEach((s) => {
        const label = s.customerType || 'Other';
        grouped.set(label, (grouped.get(label) || 0) + (s.revenue || 0));
      });
    }

    const total = Array.from(grouped.values()).reduce((a, b) => a + b, 0);
    return {
      total,
      items: Array.from(grouped.entries())
        .map(([key, revenue]) => ({
          label: key,
          revenue,
          percent: total > 0 ? (revenue / total) * 100 : 0,
        }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5),
    };
  }, [activeSales, salesAggregations, activeSeason]);

  // By Category (horizontal bars)
  const byCategory = useMemo(() => {
    const grouped = new Map<string, number>();

    if (salesAggregations?.byCategory) {
      const filtered = salesAggregations.byCategory.filter((c) => c.season === activeSeason);
      filtered.forEach((c) => {
        const label = normalizeCategory(c.category) || 'Other';
        grouped.set(label, (grouped.get(label) || 0) + (c.revenue || 0));
      });
    } else {
      activeSales.forEach((s) => {
        const label = normalizeCategory(s.categoryDesc) || 'Other';
        grouped.set(label, (grouped.get(label) || 0) + (s.revenue || 0));
      });
    }

    const items = Array.from(grouped.entries())
      .map(([key, revenue]) => ({ label: key, revenue }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    const maxRevenue = Math.max(...items.map((i) => i.revenue), 1);
    return items.map((item) => ({
      ...item,
      percent: (item.revenue / maxRevenue) * 100,
    }));
  }, [activeSales, salesAggregations, activeSeason]);

  // Monthly Trend (grouped bars) - mock months for now
  // Sales data doesn't have month info, so we show season-level comparison
  const monthlyTrend = useMemo(() => {
    // Use month labels as a visual pattern (the wireframe has Jul-Dec)
    const months = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const activeTotal = metrics.revenue.current;
    const compareTotal = metrics.revenue.compare;

    // Generate proportional bars - use a smooth curve
    const weights = [0.10, 0.13, 0.18, 0.24, 0.22, 0.13];
    return months.map((label, i) => ({
      label,
      current: activeTotal * weights[i],
      compare: compareTotal * weights[i],
    }));
  }, [metrics]);

  // ── Style Performance Table ──
  const styleData = useMemo(() => {
    // Group current season sales by style
    const activeMap = new Map<string, {
      styleNumber: string;
      styleDesc: string;
      categoryDesc: string;
      divisionDesc: string;
      gender: string;
      units: number;
      revenue: number;
    }>();

    activeSales.forEach((s) => {
      if (!s.styleNumber) return;
      let entry = activeMap.get(s.styleNumber);
      if (!entry) {
        // Get division label from product data first, fallback to sales gender field
        const prodDiv = productDivisionMap.get(s.styleNumber);
        const gender = prodDiv || getDivisionLabel(s);
        entry = {
          styleNumber: s.styleNumber,
          styleDesc: s.styleDesc || '',
          categoryDesc: normalizeCategory(s.categoryDesc) || '',
          divisionDesc: s.divisionDesc || '',
          gender,
          units: 0,
          revenue: 0,
        };
        activeMap.set(s.styleNumber, entry);
      }
      entry.units += s.unitsBooked || 0;
      entry.revenue += s.revenue || 0;
    });

    // Group compare season sales by style
    const compareMap = new Map<string, { units: number; revenue: number }>();
    compareSales.forEach((s) => {
      if (!s.styleNumber) return;
      let entry = compareMap.get(s.styleNumber);
      if (!entry) {
        entry = { units: 0, revenue: 0 };
        compareMap.set(s.styleNumber, entry);
      }
      entry.units += s.unitsBooked || 0;
      entry.revenue += s.revenue || 0;
    });

    // Merge and add color data from products
    return Array.from(activeMap.values()).map((style) => {
      const comp = compareMap.get(style.styleNumber);
      const compUnits = comp?.units || 0;
      const compRevenue = comp?.revenue || 0;
      const val = viewMode === 'revenue' ? style.revenue : style.units;
      const compVal = viewMode === 'revenue' ? compRevenue : compUnits;
      const change = calcChange(val, compVal);

      // Get colors from product data (sales records don't have color-level data)
      const productColors = productColorMap.get(style.styleNumber) || [];
      const colorList = productColors.map((c) => ({
        color: c.color,
        colorDesc: c.colorDesc,
      }));

      return {
        ...style,
        compareUnits: compUnits,
        compareRevenue: compRevenue,
        change,
        colorList,
      };
    });
  }, [activeSales, compareSales, viewMode, productColorMap, productDivisionMap]);

  // Filter and sort
  const filteredStyles = useMemo(() => {
    let result = styleData;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (s) => s.styleNumber.toLowerCase().includes(q) || s.styleDesc.toLowerCase().includes(q)
      );
    }
    return result.sort((a, b) => {
      if (viewMode === 'revenue') return b.revenue - a.revenue;
      return b.units - a.units;
    });
  }, [styleData, searchQuery, viewMode]);

  // Pagination
  const totalPages = Math.ceil(filteredStyles.length / pageSize);
  const paginatedStyles = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredStyles.slice(start, start + pageSize);
  }, [filteredStyles, currentPage]);

  // Top 5 styles
  const top5Styles = useMemo(() => {
    return [...filteredStyles]
      .sort((a, b) => (viewMode === 'revenue' ? b.revenue - a.revenue : b.units - a.units))
      .slice(0, 5);
  }, [filteredStyles, viewMode]);

  // Biggest growth
  const biggestGrowth = useMemo(() => {
    return [...filteredStyles]
      .filter((s) => s.change !== null && s.change !== undefined)
      .sort((a, b) => (b.change || 0) - (a.change || 0))
      .slice(0, 3);
  }, [filteredStyles]);

  // Selected style detail
  const selectedStyleData = useMemo(() => {
    if (!selectedStyle) return filteredStyles[0] || null;
    return filteredStyles.find((s) => s.styleNumber === selectedStyle) || filteredStyles[0] || null;
  }, [filteredStyles, selectedStyle]);

  // Toggle expand
  const toggleExpand = useCallback((styleNumber: string) => {
    setExpandedStyles((prev) => {
      const next = new Set(prev);
      if (next.has(styleNumber)) next.delete(styleNumber);
      else next.add(styleNumber);
      return next;
    });
    setSelectedStyle(styleNumber);
  }, []);

  // Export CSV
  const exportCSV = () => {
    const headers = ['Style', 'Description', 'Category', `${activeSeason} Units`, `${activeSeason} Revenue`, `${compareSeason} Units`, `${compareSeason} Revenue`, 'Change %'];
    const rows = filteredStyles.map((s) => [
      s.styleNumber,
      `"${s.styleDesc}"`,
      s.categoryDesc,
      s.units,
      s.revenue.toFixed(2),
      s.compareUnits,
      s.compareRevenue.toFixed(2),
      s.change !== null ? s.change.toFixed(1) : '',
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales-${activeSeason}-vs-${compareSeason}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Donut chart SVG helper
  const renderDonut = (items: { label: string; revenue: number; percent: number }[], total: number, colors: string[]) => {
    const circumference = 2 * Math.PI * 80; // r=80
    let offset = 0;

    return (
      <svg viewBox="0 0 200 200" className="w-[120px] h-[120px]">
        {items.map((item, i) => {
          const dash = (item.percent / 100) * circumference;
          const gap = circumference - dash;
          const currentOffset = offset;
          offset += dash;
          return (
            <circle
              key={item.label}
              cx="100"
              cy="100"
              r="80"
              fill="none"
              stroke={colors[i % colors.length]}
              strokeWidth="40"
              strokeDasharray={`${dash} ${gap}`}
              strokeDashoffset={-currentOffset}
              transform="rotate(-90 100 100)"
            />
          );
        })}
        <circle cx="100" cy="100" r="60" className="fill-[var(--color-surface,#131316)]" />
        <text x="100" y="105" textAnchor="middle" className="fill-current text-[14px] font-semibold" style={{ fill: 'var(--text-primary, #f5f5f7)' }}>
          {formatCurrencyShort(total)}
        </text>
      </svg>
    );
  };

  // Sparkline helper
  const renderSparkline = (change: number | null) => {
    // Generate 5 bars that trend up or down based on change
    const isPositive = (change || 0) >= 0;
    const heights = isPositive
      ? [40, 55, 70, 85, 100]
      : [100, 85, 70, 55, 45];

    return (
      <div className="flex items-end gap-[2px] w-[50px] h-[20px]">
        {heights.map((h, i) => (
          <div
            key={i}
            className={`flex-1 rounded-t-sm ${isPositive ? 'bg-[#0a84ff]' : 'bg-[#ff453a]'} opacity-70`}
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="p-6 space-y-6">
      {/* ── Season Comparison Bar ── */}
      <div className="flex items-center gap-4 px-5 py-3.5 bg-surface rounded-xl border border-border-strong">
        <span className="text-[13px] font-medium text-text-muted">Seasons:</span>
        <div className="flex gap-1.5">
          {allSeasons.map((season) => (
            <button
              key={season}
              onClick={() => handleSeasonClick(season)}
              onContextMenu={(e) => {
                e.preventDefault();
                handleCompareClick(season);
              }}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer
                ${season === activeSeason
                  ? 'bg-[#0a84ff] border-[#0a84ff] text-white'
                  : season === compareSeason
                    ? 'bg-[rgba(255,159,10,0.15)] border-[#ff9f0a] text-[#ff9f0a]'
                    : 'bg-surface-tertiary border-border-strong text-text-muted hover:text-text-primary hover:border-text-faint'
                }`}
            >
              {season}
            </button>
          ))}
        </div>
        <span className="text-text-faint text-xs">|</span>
        <span className="text-xs text-text-muted">
          Comparing: <strong className="text-[#0a84ff]">{activeSeason}</strong>
          {compareSeason && <> vs <strong className="text-[#ff9f0a]">{compareSeason}</strong></>}
        </span>
        <div className="flex gap-2 ml-auto">
          <button
            onClick={() => {
              const yoy = getYoYSeason(activeSeason);
              if (yoy && allSeasons.includes(yoy)) setCompareSeason(yoy);
            }}
            className="px-3 py-1 rounded-md text-[11px] font-medium border border-border-strong bg-surface-tertiary text-text-muted hover:text-text-primary hover:bg-hover"
          >
            YoY
          </button>
          <button
            onClick={() => {
              const idx = allSeasons.indexOf(activeSeason);
              if (idx < allSeasons.length - 1) setCompareSeason(allSeasons[idx + 1]);
            }}
            className="px-3 py-1 rounded-md text-[11px] font-medium border border-border-strong bg-surface-tertiary text-text-muted hover:text-text-primary hover:bg-hover"
          >
            Prior Season
          </button>
          <button
            onClick={() => setCompareSeason('')}
            className="px-3 py-1 rounded-md text-[11px] font-medium border border-border-strong bg-surface-tertiary text-text-muted hover:text-text-primary hover:bg-hover"
          >
            Clear
          </button>
        </div>
      </div>

      {/* ── Big Metric Cards ── */}
      <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-4">
        {/* Total Sales - Primary */}
        <div className="bg-gradient-to-br from-surface to-[rgba(10,132,255,0.1)] rounded-2xl border border-[#0a84ff] p-6 transition-all hover:border-text-faint">
          <div className="text-xs text-text-muted font-medium uppercase tracking-wider mb-2">Total Sales</div>
          <div className="text-4xl font-bold font-mono tracking-tighter mb-2.5 leading-none bg-gradient-to-br from-text-primary to-[#0a84ff] bg-clip-text text-transparent">
            {formatCurrencyShort(metrics.revenue.current)}
          </div>
          <div className="flex items-center gap-2">
            {metrics.revenue.change !== null && (
              <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                metrics.revenue.change >= 0
                  ? 'bg-[rgba(48,209,88,0.15)] text-[#30d158]'
                  : 'bg-[rgba(255,69,58,0.15)] text-[#ff453a]'
              }`}>
                {metrics.revenue.change >= 0 ? '↑' : '↓'} {Math.abs(metrics.revenue.change).toFixed(1)}%
              </span>
            )}
            {compareSeason && (
              <span className="text-[11px] text-text-faint">
                vs {compareSeason} ({formatCurrencyShort(metrics.revenue.compare)})
              </span>
            )}
          </div>
        </div>

        {/* Units Sold */}
        <div className="bg-surface rounded-2xl border border-border-strong p-6 transition-all hover:border-text-faint">
          <div className="text-xs text-text-muted font-medium uppercase tracking-wider mb-2">Units Sold</div>
          <div className="text-4xl font-bold font-mono tracking-tighter mb-2.5 leading-none text-text-primary">
            {formatNumber(metrics.units.current)}
          </div>
          <div className="flex items-center gap-2">
            {metrics.units.change !== null && (
              <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                metrics.units.change >= 0
                  ? 'bg-[rgba(48,209,88,0.15)] text-[#30d158]'
                  : 'bg-[rgba(255,69,58,0.15)] text-[#ff453a]'
              }`}>
                {metrics.units.change >= 0 ? '↑' : '↓'} {Math.abs(metrics.units.change).toFixed(1)}%
              </span>
            )}
            {compareSeason && <span className="text-[11px] text-text-faint">vs {compareSeason}</span>}
          </div>
        </div>

        {/* Avg Unit Price */}
        <div className="bg-surface rounded-2xl border border-border-strong p-6 transition-all hover:border-text-faint">
          <div className="text-xs text-text-muted font-medium uppercase tracking-wider mb-2">Avg Unit Price</div>
          <div className="text-4xl font-bold font-mono tracking-tighter mb-2.5 leading-none text-text-primary">
            ${metrics.avgPrice.current.toFixed(2)}
          </div>
          <div className="flex items-center gap-2">
            {metrics.avgPrice.change !== null && (
              <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                metrics.avgPrice.change >= 0
                  ? 'bg-[rgba(48,209,88,0.15)] text-[#30d158]'
                  : 'bg-[rgba(255,69,58,0.15)] text-[#ff453a]'
              }`}>
                {metrics.avgPrice.change >= 0 ? '↑' : '↓'} {Math.abs(metrics.avgPrice.change).toFixed(1)}%
              </span>
            )}
            {compareSeason && <span className="text-[11px] text-text-faint">vs {compareSeason}</span>}
          </div>
        </div>

        {/* Active Styles */}
        <div className="bg-surface rounded-2xl border border-border-strong p-6 transition-all hover:border-text-faint">
          <div className="text-xs text-text-muted font-medium uppercase tracking-wider mb-2">Active Styles</div>
          <div className="text-4xl font-bold font-mono tracking-tighter mb-2.5 leading-none text-text-primary">
            {formatNumber(metrics.styles.current)}
          </div>
          <div className="flex items-center gap-2">
            {compareSeason && (
              <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                metrics.styles.diff >= 0
                  ? 'bg-[rgba(48,209,88,0.15)] text-[#30d158]'
                  : 'bg-[rgba(255,69,58,0.15)] text-[#ff453a]'
              }`}>
                {metrics.styles.diff >= 0 ? '+' : ''}{metrics.styles.diff}
              </span>
            )}
            {compareSeason && (
              <span className="text-[11px] text-text-faint">
                vs {compareSeason} ({metrics.styles.compare})
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Charts Row ── */}
      <div className="grid grid-cols-[1fr_1fr_1fr_1.3fr] gap-4">
        {/* By Division (Donut) */}
        <div className="bg-surface rounded-xl border border-border-strong p-5">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-[13px] font-semibold text-text-primary">By Division</h3>
            <span className="text-[10px] font-semibold text-[#0a84ff] bg-[rgba(10,132,255,0.15)] px-2 py-0.5 rounded">
              {activeSeason}
            </span>
          </div>
          <div className="flex flex-col items-center gap-3.5">
            {renderDonut(byDivision.items, byDivision.total, ['#0a84ff', '#bf5af2', '#5ac8fa'])}
            <div className="w-full space-y-1.5">
              {byDivision.items.map((item, i) => (
                <div key={item.label} className="flex items-center gap-2 text-[11px]">
                  <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: ['#0a84ff', '#bf5af2', '#5ac8fa'][i] }} />
                  <span className="flex-1 text-text-muted">{item.label}</span>
                  <span className="font-mono font-medium text-text-primary">{formatCurrencyShort(item.revenue)}</span>
                  <span className="w-8 text-right font-mono text-[10px] text-text-faint">{item.percent.toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* By Channel (Donut) */}
        <div className="bg-surface rounded-xl border border-border-strong p-5">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-[13px] font-semibold text-text-primary">By Channel</h3>
            <span className="text-[10px] font-semibold text-[#0a84ff] bg-[rgba(10,132,255,0.15)] px-2 py-0.5 rounded">
              {activeSeason}
            </span>
          </div>
          <div className="flex flex-col items-center gap-3.5">
            {renderDonut(byChannel.items, byChannel.total, ['#30d158', '#ff9f0a', '#5ac8fa', '#bf5af2', '#636366'])}
            <div className="w-full space-y-1.5">
              {byChannel.items.map((item, i) => (
                <div key={item.label} className="flex items-center gap-2 text-[11px]">
                  <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: ['#30d158', '#ff9f0a', '#5ac8fa', '#bf5af2', '#636366'][i] }} />
                  <span className="flex-1 text-text-muted">{item.label}</span>
                  <span className="font-mono font-medium text-text-primary">{formatCurrencyShort(item.revenue)}</span>
                  <span className="w-8 text-right font-mono text-[10px] text-text-faint">{item.percent.toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* By Category (Horizontal Bars) */}
        <div className="bg-surface rounded-xl border border-border-strong p-5">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-[13px] font-semibold text-text-primary">By Category</h3>
            <span className="text-[10px] font-semibold text-[#0a84ff] bg-[rgba(10,132,255,0.15)] px-2 py-0.5 rounded">
              {activeSeason}
            </span>
          </div>
          <div className="space-y-2.5">
            {byCategory.map((item, i) => (
              <div key={item.label} className="flex items-center gap-2.5">
                <span className="w-[70px] text-[11px] text-text-muted truncate">{item.label}</span>
                <div className="flex-1 h-5 bg-surface-tertiary rounded overflow-hidden">
                  <div
                    className="h-full rounded transition-all"
                    style={{
                      width: `${item.percent}%`,
                      backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
                    }}
                  />
                </div>
                <span className="w-[50px] text-right text-[11px] font-semibold font-mono text-text-primary">
                  {formatCurrencyShort(item.revenue)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Monthly Trend (Grouped Bars) */}
        <div className="bg-surface rounded-xl border border-border-strong p-5">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-[13px] font-semibold text-text-primary">Monthly Trend</h3>
            <div className="flex gap-3">
              <span className="flex items-center gap-1.5 text-[10px] text-text-muted">
                <span className="w-2 h-2 rounded-sm bg-[#0a84ff]" /> {activeSeason}
              </span>
              {compareSeason && (
                <span className="flex items-center gap-1.5 text-[10px] text-text-muted">
                  <span className="w-2 h-2 rounded-sm bg-[#ff9f0a]" /> {compareSeason}
                </span>
              )}
            </div>
          </div>
          <div className="h-[140px] pt-2">
            <div className="flex justify-between h-full gap-1.5">
              {monthlyTrend.map((month) => {
                const maxVal = Math.max(...monthlyTrend.map((m) => Math.max(m.current, m.compare)), 1);
                return (
                  <div key={month.label} className="flex-1 flex flex-col items-center h-full">
                    <div className="flex-1 flex items-end gap-[3px] w-full pb-1.5">
                      <div
                        className="flex-1 bg-[#0a84ff] rounded-t min-h-[4px]"
                        style={{ height: `${(month.current / maxVal) * 100}%` }}
                      />
                      {compareSeason && (
                        <div
                          className="flex-1 bg-[#ff9f0a] opacity-60 rounded-t min-h-[4px]"
                          style={{ height: `${(month.compare / maxVal) * 100}%` }}
                        />
                      )}
                    </div>
                    <span className="text-[9px] text-text-faint uppercase">{month.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Sub-tabs ── */}
      <div className="flex gap-1 bg-surface p-1 rounded-xl w-fit">
        {([
          { id: 'style', label: 'By Style' },
          { id: 'customer', label: 'By Customer' },
          { id: 'category', label: 'By Category' },
          { id: 'region', label: 'By Region' },
        ] as { id: SubTab; label: string }[]).map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setSubTab(tab.id); setCurrentPage(1); }}
            className={`px-4 py-2.5 rounded-md text-[13px] font-medium transition-all ${
              subTab === tab.id
                ? 'bg-surface-tertiary text-text-primary shadow-sm'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Content Grid: Table + Sidebar ── */}
      <div className="grid grid-cols-[1fr_340px] gap-6">
        {/* Table Section */}
        <div className="bg-surface rounded-xl border border-border-strong overflow-hidden">
          {/* Table Header */}
          <div className="flex justify-between items-center px-5 py-4 border-b border-border-strong">
            <div>
              <div className="text-sm font-semibold text-text-primary">Style Performance</div>
              <div className="text-[11px] text-text-muted mt-0.5">
                {filteredStyles.length} styles · Click row to expand colors
              </div>
            </div>
            <div className="flex gap-2 items-center">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-faint" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                  placeholder="Search styles..."
                  className="pl-8 pr-3 py-2 rounded-md text-xs bg-surface-tertiary border border-border-strong text-text-primary placeholder:text-text-faint focus:outline-none focus:border-[#0a84ff] w-[200px]"
                />
              </div>
              <div className="flex gap-[2px] bg-surface-tertiary p-[3px] rounded-md">
                {(['units', 'revenue', 'both'] as ViewMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setViewMode(mode)}
                    className={`px-3 py-1 rounded text-[11px] font-medium capitalize transition-all ${
                      viewMode === mode
                        ? 'bg-hover text-text-primary'
                        : 'text-text-muted hover:text-text-primary'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
              <button
                onClick={exportCSV}
                className="p-2 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-tertiary transition-colors"
                title="Export CSV"
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="text-left px-3.5 py-2.5 text-[10px] font-semibold text-text-muted uppercase tracking-wider bg-surface-tertiary border-b border-border-strong whitespace-nowrap" style={{ width: 180 }}>
                    Style
                  </th>
                  <th className="text-left px-3.5 py-2.5 text-[10px] font-semibold text-text-muted uppercase tracking-wider bg-surface-tertiary border-b border-border-strong whitespace-nowrap">
                    Category
                  </th>
                  <th className="text-right px-3.5 py-2.5 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap border-b border-border-strong bg-[rgba(10,132,255,0.08)] text-[#0a84ff]">
                    {activeSeason}
                  </th>
                  {compareSeason && (
                    <th className="text-right px-3.5 py-2.5 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap border-b border-border-strong bg-[rgba(255,159,10,0.08)] text-[#ff9f0a]">
                      {compareSeason}
                    </th>
                  )}
                  <th className="text-right px-3.5 py-2.5 text-[10px] font-semibold text-text-muted uppercase tracking-wider bg-surface-tertiary border-b border-border-strong whitespace-nowrap">
                    Δ %
                  </th>
                  <th className="text-right px-3.5 py-2.5 text-[10px] font-semibold text-text-muted uppercase tracking-wider bg-surface-tertiary border-b border-border-strong whitespace-nowrap">
                    Trend
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedStyles.map((style) => {
                  const isExpanded = expandedStyles.has(style.styleNumber);
                  const currentVal = viewMode === 'revenue' ? style.revenue : style.units;
                  const compareVal = viewMode === 'revenue' ? style.compareRevenue : style.compareUnits;

                  return (
                    <Fragment key={style.styleNumber}>
                      {/* Parent row */}
                      <tr
                        onClick={() => toggleExpand(style.styleNumber)}
                        className={`cursor-pointer border-b border-border-primary transition-colors hover:bg-hover ${
                          isExpanded ? 'bg-surface-tertiary' : ''
                        }`}
                      >
                        <td className="px-3.5 py-3 text-[13px]">
                          <div className="flex items-center gap-2.5">
                            <span className={`w-[18px] h-[18px] flex items-center justify-center bg-surface-tertiary rounded text-[9px] text-text-muted transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                              <ChevronRightIcon className="w-3 h-3" />
                            </span>
                            <div className="flex flex-col">
                              <span className="font-semibold text-[13px] text-text-primary">{style.styleNumber}</span>
                              <span className="text-[11px] text-text-muted">{style.styleDesc}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-3.5 py-3 text-[13px] text-text-muted">{style.categoryDesc}</td>
                        <td className="px-3.5 py-3 text-right font-mono text-xs bg-[rgba(10,132,255,0.03)]">
                          <strong className="text-text-primary">
                            {viewMode === 'revenue' ? formatCurrencyShort(style.revenue) : formatNumber(style.units)}
                            {viewMode === 'both' && (
                              <span className="text-text-faint font-normal"> / {formatCurrencyShort(style.revenue)}</span>
                            )}
                          </strong>
                        </td>
                        {compareSeason && (
                          <td className="px-3.5 py-3 text-right font-mono text-xs text-text-muted bg-[rgba(255,159,10,0.03)]">
                            {viewMode === 'revenue' ? formatCurrencyShort(compareVal) : formatNumber(compareVal)}
                          </td>
                        )}
                        <td className="px-3.5 py-3 text-right">
                          {style.change !== null && (
                            <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                              style.change >= 0
                                ? 'bg-[rgba(48,209,88,0.15)] text-[#30d158]'
                                : 'bg-[rgba(255,69,58,0.15)] text-[#ff453a]'
                            }`}>
                              {style.change >= 0 ? '↑' : '↓'} {Math.abs(style.change).toFixed(1)}%
                            </span>
                          )}
                        </td>
                        <td className="px-3.5 py-3 text-right">
                          {renderSparkline(style.change)}
                        </td>
                      </tr>

                      {/* Child rows (colors from product catalog) */}
                      {isExpanded && style.colorList.length > 0 && (
                        <tr className="bg-surface-tertiary border-b border-border-primary">
                          <td colSpan={compareSeason ? 6 : 5} className="px-3.5 py-3">
                            <div className="pl-7">
                              <div className="text-[10px] text-text-faint uppercase tracking-wider mb-2">Available Colors ({style.colorList.length})</div>
                              <div className="flex flex-wrap gap-2">
                                {style.colorList.map((color) => (
                                  <span
                                    key={color.color}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[var(--bg-hover,#222228)] rounded-md text-[11px] text-text-muted"
                                  >
                                    <span
                                      className="w-3 h-3 rounded-sm border border-white/15 flex-shrink-0"
                                      style={{ backgroundColor: '#636366' }}
                                    />
                                    {color.color}{color.colorDesc && color.colorDesc !== color.color ? ` - ${color.colorDesc}` : ''}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                      {isExpanded && style.colorList.length === 0 && (
                        <tr className="bg-surface-tertiary border-b border-border-primary">
                          <td colSpan={compareSeason ? 6 : 5} className="px-3.5 py-2.5 pl-12 text-xs text-text-faint italic">
                            No color data in product catalog
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}

                {paginatedStyles.length === 0 && (
                  <tr>
                    <td colSpan={compareSeason ? 6 : 5} className="px-5 py-12 text-center text-text-muted text-sm">
                      No styles found{searchQuery ? ` matching "${searchQuery}"` : ''}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Table Footer / Pagination */}
          <div className="flex justify-between items-center px-5 py-3 border-t border-border-strong">
            <span className="text-xs text-text-muted">
              Showing {filteredStyles.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}-{Math.min(currentPage * pageSize, filteredStyles.length)} of {filteredStyles.length} styles
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 border border-border-strong bg-surface-tertiary text-text-primary text-xs rounded-md hover:bg-hover disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ← Prev
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="px-3 py-1.5 border border-border-strong bg-surface-tertiary text-text-primary text-xs rounded-md hover:bg-hover disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next →
              </button>
            </div>
          </div>
        </div>

        {/* ── Sidebar ── */}
        <div className="flex flex-col gap-4">
          {/* Selected Style Detail */}
          {selectedStyleData && (
            <div className="bg-surface rounded-xl border border-[#0a84ff] p-5">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-[22px] font-bold text-text-primary mb-0.5">{selectedStyleData.styleNumber}</h2>
                  <p className="text-xs text-text-muted">{selectedStyleData.styleDesc} · {selectedStyleData.gender}</p>
                </div>
                {top5Styles[0]?.styleNumber === selectedStyleData.styleNumber && (
                  <span className="px-2.5 py-1 bg-[rgba(48,209,88,0.15)] text-[#30d158] rounded text-[10px] font-semibold uppercase">
                    Top Seller
                  </span>
                )}
              </div>

              {/* Style Metrics 2x2 */}
              <div className="grid grid-cols-2 gap-2.5 mb-4">
                <div className="bg-surface-tertiary rounded-lg p-3">
                  <div className="text-[10px] text-text-faint uppercase tracking-wider mb-1">{activeSeason} Units</div>
                  <div className="text-lg font-semibold font-mono text-text-primary">{formatNumber(selectedStyleData.units)}</div>
                  {selectedStyleData.change !== null && viewMode !== 'revenue' && (
                    <div className={`text-[10px] mt-0.5 ${selectedStyleData.change >= 0 ? 'text-[#30d158]' : 'text-[#ff453a]'}`}>
                      {selectedStyleData.change >= 0 ? '↑' : '↓'} {Math.abs(selectedStyleData.change).toFixed(1)}%
                    </div>
                  )}
                </div>
                <div className="bg-surface-tertiary rounded-lg p-3">
                  <div className="text-[10px] text-text-faint uppercase tracking-wider mb-1">{activeSeason} Revenue</div>
                  <div className="text-lg font-semibold font-mono text-text-primary">{formatCurrencyShort(selectedStyleData.revenue)}</div>
                  {selectedStyleData.change !== null && viewMode === 'revenue' && (
                    <div className={`text-[10px] mt-0.5 ${selectedStyleData.change >= 0 ? 'text-[#30d158]' : 'text-[#ff453a]'}`}>
                      {selectedStyleData.change >= 0 ? '↑' : '↓'} {Math.abs(selectedStyleData.change).toFixed(1)}%
                    </div>
                  )}
                </div>
                <div className="bg-surface-tertiary rounded-lg p-3">
                  <div className="text-[10px] text-text-faint uppercase tracking-wider mb-1">Avg Price</div>
                  <div className="text-lg font-semibold font-mono text-text-primary">
                    ${selectedStyleData.units > 0 ? (selectedStyleData.revenue / selectedStyleData.units).toFixed(2) : '0.00'}
                  </div>
                </div>
                <div className="bg-surface-tertiary rounded-lg p-3">
                  <div className="text-[10px] text-text-faint uppercase tracking-wider mb-1">Colors</div>
                  <div className="text-lg font-semibold font-mono text-text-primary">{selectedStyleData.colorList.length}</div>
                </div>
              </div>

              {/* Available Colors (from product catalog — no per-color sales data) */}
              {selectedStyleData.colorList.length > 0 && (
                <>
                  <h3 className="text-xs font-semibold text-text-primary mb-2.5">Available Colors</h3>
                  <div className="space-y-1.5">
                    {selectedStyleData.colorList.slice(0, 8).map((color) => (
                      <div key={color.color} className="flex items-center gap-2.5 px-2.5 py-2 bg-surface-tertiary rounded-lg">
                        <span className="w-3.5 h-3.5 rounded border border-white/15 flex-shrink-0" style={{ backgroundColor: '#636366' }} />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-text-primary truncate">{color.colorDesc || color.color}</div>
                          <div className="text-[10px] text-text-faint">{color.color}</div>
                        </div>
                      </div>
                    ))}
                    {selectedStyleData.colorList.length > 8 && (
                      <div className="text-[10px] text-text-faint text-center py-1">
                        +{selectedStyleData.colorList.length - 8} more colors
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Top 5 Styles */}
          <div className="bg-surface rounded-xl border border-border-strong p-5">
            <h3 className="text-[13px] font-semibold text-text-primary mb-4 flex items-center gap-2">
              <span>🏆</span> Top 5 Styles
            </h3>
            <div className="space-y-2">
              {top5Styles.map((style, i) => (
                <div
                  key={style.styleNumber}
                  onClick={() => { setSelectedStyle(style.styleNumber); onStyleClick(style.styleNumber); }}
                  className="flex items-center gap-2.5 p-2.5 bg-surface-tertiary rounded-lg cursor-pointer hover:bg-hover transition-colors"
                >
                  <span className={`w-[22px] h-[22px] flex items-center justify-center rounded-md text-[11px] font-semibold ${
                    i === 0
                      ? 'bg-gradient-to-br from-yellow-400 to-orange-400 text-black'
                      : i === 1
                        ? 'bg-gradient-to-br from-gray-300 to-gray-400 text-black'
                        : i === 2
                          ? 'bg-gradient-to-br from-amber-700 to-amber-900 text-white'
                          : 'bg-hover text-text-muted'
                  }`}>
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-text-primary">{style.styleNumber}</div>
                    <div className="text-[10px] text-text-muted truncate">{style.styleDesc}</div>
                  </div>
                  <span className="font-mono text-xs font-medium text-text-primary">
                    {viewMode === 'revenue' ? formatCurrencyShort(style.revenue) : formatNumber(style.units)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Biggest Growth */}
          <div className="bg-surface rounded-xl border border-border-strong p-5">
            <h3 className="text-[13px] font-semibold text-text-primary mb-4 flex items-center gap-2">
              <span>📈</span> Biggest Growth
            </h3>
            <div className="space-y-2">
              {biggestGrowth.map((style) => (
                <div
                  key={style.styleNumber}
                  onClick={() => { setSelectedStyle(style.styleNumber); onStyleClick(style.styleNumber); }}
                  className="flex items-center gap-2.5 p-2.5 bg-surface-tertiary rounded-lg cursor-pointer hover:bg-hover transition-colors"
                >
                  <span className="w-[22px] h-[22px] flex items-center justify-center rounded-md text-[11px] font-semibold bg-[#30d158] text-white">
                    ↑
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-text-primary">{style.styleNumber}</div>
                    <div className="text-[10px] text-text-muted truncate">{style.styleDesc}</div>
                  </div>
                  <span className="font-mono text-xs font-medium text-[#30d158]">
                    +{(style.change || 0).toFixed(1)}%
                  </span>
                </div>
              ))}
              {biggestGrowth.length === 0 && (
                <p className="text-xs text-text-faint text-center py-3">Select a compare season to see growth</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
