'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { Product, SalesRecord, InventoryRecord, InventoryOHRecord, InventoryOHAggregations } from '@/types/product';
import { formatNumber, formatCurrencyShort, formatCurrency } from '@/utils/format';
import { matchesDivision } from '@/utils/divisionMap';
import {
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  Package,
  TrendingUp,
  TrendingDown,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Warehouse,
  BarChart3,
  ClipboardList,
  Download,
  Clock,
  Activity,
  AlertTriangle,
  Scissors,
  ShoppingCart,
} from 'lucide-react';
import { exportToExcel } from '@/utils/exportData';

// ─── Types ──────────────────────────────────────────────────────────

interface InventoryAggregations {
  totalCount: number;
  byType: { movementType: string; count: number; totalQty: number; totalExtension: number }[];
  byWarehouse: { warehouse: string; count: number; totalQty: number; totalExtension: number }[];
  byPeriod: { period: string; count: number; totalQty: number; totalExtension: number }[];
}

interface InventoryViewProps {
  products: Product[];
  sales: SalesRecord[];
  inventory: InventoryRecord[];
  inventoryAggregations?: InventoryAggregations;
  inventoryOH?: InventoryOHRecord[];
  ohAggregations?: InventoryOHAggregations;
  selectedSeason: string;
  selectedDivision: string;
  selectedCategory: string;
  searchQuery?: string;
  onStyleClick: (styleNumber: string) => void;
}

type TabId = 'on-hand' | 'summary' | 'by-warehouse' | 'history';

type HistorySortField =
  | 'movementDate'
  | 'styleNumber'
  | 'color'
  | 'warehouse'
  | 'movementType'
  | 'qty'
  | 'balance'
  | 'customerVendor';

// Warehouse names
const WAREHOUSE_NAMES: Record<number, string> = {
  1: 'Main DC',
  4: 'Warehouse 4',
  5: 'Warehouse 5',
  7: 'Warehouse 7',
  8: 'Warehouse 8',
};

function getWarehouseName(wh: number | undefined): string {
  if (wh === undefined || wh === null) return 'Unknown';
  return WAREHOUSE_NAMES[wh] || `WH ${wh}`;
}

// ─── Utility Functions ──────────────────────────────────────────────

function getStockStatus(qty: number): { label: string; className: string } {
  if (qty === 0) return { label: 'Out of Stock', className: 'bg-red-500/15 text-red-400' };
  if (qty <= 50) return { label: 'Low', className: 'bg-amber-500/15 text-amber-400' };
  if (qty <= 200) return { label: 'Limited', className: 'bg-orange-500/15 text-orange-400' };
  return { label: 'In Stock', className: 'bg-emerald-500/15 text-emerald-400' };
}

function movementTypeColor(type: string): string {
  const t = type.toUpperCase();
  if (t === 'IN') return 'bg-blue-500';
  if (t === 'PO') return 'bg-emerald-500';
  if (t === 'AW') return 'bg-teal-500';
  if (t === 'RA') return 'bg-rose-500';
  if (t === 'AJ') return 'bg-amber-500';
  if (t === 'PC') return 'bg-indigo-500';
  if (t === 'IR') return 'bg-purple-500';
  switch (type.toLowerCase()) {
    case 'receipt': return 'bg-emerald-500';
    case 'shipment': return 'bg-blue-500';
    case 'adjustment': return 'bg-amber-500';
    case 'transfer in': return 'bg-teal-500';
    case 'transfer out': return 'bg-indigo-500';
    case 'return': return 'bg-rose-500';
    default: return 'bg-gray-500';
  }
}

function movementTypeBadge(type: string): string {
  const t = type.toUpperCase();
  if (t === 'IN') return 'bg-blue-500/15 text-blue-400';
  if (t === 'PO') return 'bg-emerald-500/15 text-emerald-400';
  if (t === 'AW') return 'bg-teal-500/15 text-teal-400';
  if (t === 'RA') return 'bg-rose-500/15 text-rose-400';
  if (t === 'AJ') return 'bg-amber-500/15 text-amber-400';
  if (t === 'PC') return 'bg-indigo-500/15 text-indigo-400';
  if (t === 'IR') return 'bg-purple-500/15 text-purple-400';
  switch (type.toLowerCase()) {
    case 'receipt': return 'bg-emerald-500/15 text-emerald-400';
    case 'shipment': return 'bg-blue-500/15 text-blue-400';
    case 'adjustment': return 'bg-amber-500/15 text-amber-400';
    case 'transfer in': return 'bg-teal-500/15 text-teal-400';
    case 'transfer out': return 'bg-indigo-500/15 text-indigo-400';
    case 'return': return 'bg-rose-500/15 text-rose-400';
    default: return 'bg-gray-500/15 text-gray-400';
  }
}

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  'IN': 'Invoice (Outbound)',
  'PO': 'Purchase Order (Inbound)',
  'AW': 'Allocation/Transfer',
  'RA': 'Return',
  'AJ': 'Adjustment',
  'PC': 'Price Change',
  'IR': 'Inter-Warehouse',
};

function getMovementTypeLabel(type: string): string {
  return MOVEMENT_TYPE_LABELS[type.toUpperCase()] || type;
}

// Color swatch helper
function getSwatchColor(colorCode: string): string {
  const colorMap: Record<string, string> = {
    'BLAK': '#1a1a1a', 'BKOT': '#1a1a1a', 'BLKV': '#1a1a1a',
    'BADK': '#8B7355', 'BARK': '#8B7355',
    'GMTL': '#4A4A4A', 'GRMT': '#4A4A4A',
    'KAKI': '#C3B091', 'KHKI': '#C3B091',
    'INKY': '#2C3E50', 'NAVY': '#1B2838',
    'SAGE': '#87AE73', 'OLIV': '#556B2F',
    'RDPL': '#A52A2A', 'WINE': '#722F37',
    'PITN': '#5C4033', 'MDNT': '#191970', 'KBLU': '#4682B4',
  };
  if (colorMap[colorCode?.toUpperCase()]) return colorMap[colorCode.toUpperCase()];
  let hash = 0;
  const code = colorCode || '';
  for (let i = 0; i < code.length; i++) hash = code.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${Math.abs(hash) % 360}, 40%, 45%)`;
}

// Division label helper
function getDivisionLabel(div: number | undefined): string {
  if (div === 1) return "Men's";
  if (div === 2) return "Women's";
  if (div === 3) return "Accessories";
  return div !== undefined ? `Div ${div}` : '';
}

// Map global filter division name → OH numeric division string
function divisionNameToOHCode(name: string): string {
  if (!name) return '';
  const n = name.toLowerCase();
  if (n.includes('men') && !n.includes('women')) return '1';
  if (n.includes('women')) return '2';
  if (n.includes('unisex') || n.includes('accessor')) return '3';
  return '';
}

// Map global filter categoryDesc → OH abbreviated category code
const CATEGORY_DESC_TO_CODE: Record<string, string> = {
  'PANTS': 'PANT', 'SHORTS': 'SHOR', 'SHORT SLEEVE': 'SHRT', 'JACKET': 'JACK',
  'LONG SLEEVE': 'LONG', 'FLEECE': 'FLEE', 'HEADWEAR': 'HEAD', 'SWEATER': 'SWEA',
  'FLANNEL': 'FLAN', 'SLEEVELESS': 'SLEE', 'DRESS': 'DRES', 'SKORTS': 'SKOR',
  'VEST': 'VEST', 'UNDERWEAR': 'UNDE', 'LEGGINGS': 'LEGG', 'BASELAYER': 'BASE',
  'BAGS': 'BAGS', 'SKIRTS': 'SKIR', 'MISCELLANEOUS': 'MISC',
};
function categoryDescToOHCode(desc: string): string {
  if (!desc) return '';
  return CATEGORY_DESC_TO_CODE[desc] || desc;
}

// ─── Tabs ────────────────────────────────────────────────────────────

const TABS: { id: TabId; label: string; icon: typeof Package }[] = [
  { id: 'on-hand', label: 'On-Hand', icon: Package },
  { id: 'summary', label: 'Movements', icon: BarChart3 },
  { id: 'by-warehouse', label: 'By Warehouse', icon: Warehouse },
  { id: 'history', label: 'Movement History', icon: ClipboardList },
];

// ─── Component ──────────────────────────────────────────────────────

export default function InventoryView({
  products,
  sales,
  inventory,
  inventoryAggregations,
  inventoryOH = [],
  ohAggregations,
  selectedSeason,
  selectedDivision,
  selectedCategory,
  searchQuery: globalSearchQuery,
  onStyleClick,
}: InventoryViewProps) {
  const [activeTab, setActiveTab] = useState<TabId>(inventoryOH.length > 0 ? 'on-hand' : 'summary');

  // ── History tab state ──
  const [historySearch, setHistorySearch] = useState('');
  const [historyWarehouse, setHistoryWarehouse] = useState('');
  const [historyType, setHistoryType] = useState('');
  const [historyPeriod, setHistoryPeriod] = useState('');
  const [historyStyle, setHistoryStyle] = useState('');
  const [historySortField, setHistorySortField] = useState<HistorySortField>('movementDate');
  const [historySortDir, setHistorySortDir] = useState<'asc' | 'desc'>('desc');
  const [historyPage, setHistoryPage] = useState(1);
  const historyPageSize = 50;

  // ── Warehouse tab state ──
  const [warehouseFilter, setWarehouseFilter] = useState('');

  // ── On-Hand tab state ──
  const [ohSearch, setOHSearch] = useState('');
  const [ohWarehouse, setOHWarehouse] = useState('');
  const [ohSortField, setOHSortField] = useState<'totalQty' | 'stdCost' | 'msrp' | 'styleNumber' | 'weeksOfSupply'>('totalQty');
  const [ohSortDir, setOHSortDir] = useState<'asc' | 'desc'>('desc');
  const [ohPage, setOHPage] = useState(0);
  const ohPageSize = 50;

  // Derive OH filter codes from global FilterBar props
  const ohSeasonCode = useMemo(() => {
    if (!selectedSeason || selectedSeason === '__ALL_SP__' || selectedSeason === '__ALL_FA__') return '';
    return selectedSeason;
  }, [selectedSeason]);
  const ohDivisionCodes = useMemo(
    () => (selectedDivision ? selectedDivision.split('|').filter(Boolean).map(divisionNameToOHCode).filter(Boolean) : []),
    [selectedDivision],
  );
  const ohCategoryCodes = useMemo(
    () => (selectedCategory ? selectedCategory.split('|').filter(Boolean).map(categoryDescToOHCode).filter(Boolean) : []),
    [selectedCategory],
  );

  // ── Hierarchy & drill-down state ──
  const [expandedStyles, setExpandedStyles] = useState<Set<string>>(new Set());
  const [drilldownRecord, setDrilldownRecord] = useState<InventoryOHRecord | null>(null);
  const [activeSizeType, setActiveSizeType] = useState<string>('');

  // ── Resolve data (real inventory movements) ──
  const data = inventory;

  // ── Unique filter options for movement tabs ──
  const warehouses = useMemo(() => {
    const s = new Set<string>();
    data.forEach(r => r.warehouse && s.add(r.warehouse));
    return Array.from(s).sort();
  }, [data]);

  const movementTypes = useMemo(() => {
    const s = new Set<string>();
    data.forEach(r => r.movementType && s.add(r.movementType));
    return Array.from(s).sort();
  }, [data]);

  const periods = useMemo(() => {
    const s = new Set<string>();
    data.forEach(r => r.period && s.add(r.period));
    return Array.from(s).sort();
  }, [data]);

  const styles = useMemo(() => {
    const s = new Set<string>();
    data.forEach(r => r.styleNumber && s.add(r.styleNumber));
    return Array.from(s).sort();
  }, [data]);

  // ── Movement velocity: shipments per style (daily rate) ──
  const movementVelocity = useMemo(() => {
    // Compute daily shipment rate per style from movement data
    // IN = Invoice (outbound), so IN movements are shipments
    const styleShipments = new Map<string, number>();
    const dates = new Set<string>();

    data.forEach(r => {
      if (r.movementDate) dates.add(r.movementDate);
      // Count outbound movements: IN (invoice/shipment), AW (allocation/withdrawal)
      const type = (r.movementType || '').toUpperCase();
      if ((type === 'IN' || type === 'AW') && r.qty < 0) {
        const prev = styleShipments.get(r.styleNumber) || 0;
        styleShipments.set(r.styleNumber, prev + Math.abs(r.qty));
      }
    });

    // Calculate the date range to get daily rate
    const sortedDates = Array.from(dates).sort();
    let daySpan = 1;
    if (sortedDates.length >= 2) {
      const first = new Date(sortedDates[0]);
      const last = new Date(sortedDates[sortedDates.length - 1]);
      daySpan = Math.max(1, Math.round((last.getTime() - first.getTime()) / (1000 * 60 * 60 * 24)));
    }

    // Return daily rate per style
    const dailyRate = new Map<string, number>();
    styleShipments.forEach((totalShipped, style) => {
      dailyRate.set(style, totalShipped / daySpan);
    });

    return { dailyRate, daySpan, dateRange: sortedDates.length >= 2 ? `${sortedDates[0]} to ${sortedDates[sortedDates.length - 1]}` : '' };
  }, [data]);

  // ── Receipt tracking: PO movements per style ──
  const receiptsByStyle = useMemo(() => {
    const map = new Map<string, number>();
    data.forEach(r => {
      const type = (r.movementType || '').toUpperCase();
      if (type === 'PO' && r.qty > 0) {
        const prev = map.get(r.styleNumber) || 0;
        map.set(r.styleNumber, prev + r.qty);
      }
    });
    return map;
  }, [data]);

  // ── Movement summary stats ──
  const agg = inventoryAggregations;
  const summaryStats = useMemo(() => {
    if (agg) {
      let totalIn = 0, totalOut = 0;
      agg.byType.forEach(t => { if (t.totalQty > 0) totalIn += t.totalQty; else totalOut += Math.abs(t.totalQty); });
      return { totalMovements: agg.totalCount, totalIn, totalOut, netChange: totalIn - totalOut };
    }
    let totalIn = 0, totalOut = 0;
    data.forEach(r => { if (r.qty > 0) totalIn += r.qty; else totalOut += Math.abs(r.qty); });
    return { totalMovements: data.length, totalIn, totalOut, netChange: totalIn - totalOut };
  }, [agg, data]);

  // Movement by type breakdown
  const byTypeBreakdown = useMemo(() => {
    if (agg) {
      return agg.byType.map(t => ({ type: t.movementType, totalQty: t.totalQty, absQty: Math.abs(t.totalQty), count: t.count })).sort((a, b) => b.absQty - a.absQty);
    }
    const map = new Map<string, { type: string; totalQty: number; absQty: number; count: number }>();
    data.forEach(r => {
      const type = r.movementType || 'Unknown';
      const existing = map.get(type);
      if (existing) { existing.totalQty += r.qty; existing.absQty += Math.abs(r.qty); existing.count += 1; }
      else { map.set(type, { type, totalQty: r.qty, absQty: Math.abs(r.qty), count: 1 }); }
    });
    return Array.from(map.values()).sort((a, b) => b.absQty - a.absQty);
  }, [agg, data]);

  const maxTypeAbsQty = useMemo(() => Math.max(...byTypeBreakdown.map(t => t.absQty), 1), [byTypeBreakdown]);

  // Top 10 styles by movement volume
  const topStyles = useMemo(() => {
    const map = new Map<string, { styleNumber: string; styleDesc: string; absQty: number; count: number; netQty: number }>();
    data.forEach(r => {
      const key = r.styleNumber;
      const existing = map.get(key);
      if (existing) { existing.absQty += Math.abs(r.qty); existing.count += 1; existing.netQty += r.qty; }
      else { map.set(key, { styleNumber: r.styleNumber, styleDesc: r.styleDesc || '', absQty: Math.abs(r.qty), count: 1, netQty: r.qty }); }
    });
    return Array.from(map.values()).sort((a, b) => b.absQty - a.absQty).slice(0, 10);
  }, [data]);

  const maxStyleAbsQty = useMemo(() => Math.max(...topStyles.map(s => s.absQty), 1), [topStyles]);

  // Movement by warehouse
  const byWarehouseSummary = useMemo(() => {
    if (agg) {
      return agg.byWarehouse.map(w => ({
        warehouse: w.warehouse, totalIn: w.totalQty > 0 ? w.totalQty : 0, totalOut: w.totalQty < 0 ? Math.abs(w.totalQty) : 0,
        net: w.totalQty, count: w.count, totalExtension: w.totalExtension,
      })).sort((a, b) => b.count - a.count);
    }
    const map = new Map<string, { warehouse: string; totalIn: number; totalOut: number; net: number; count: number; totalExtension: number }>();
    data.forEach(r => {
      const wh = r.warehouse || 'Unknown';
      const existing = map.get(wh);
      const inQty = r.qty > 0 ? r.qty : 0;
      const outQty = r.qty < 0 ? Math.abs(r.qty) : 0;
      if (existing) { existing.totalIn += inQty; existing.totalOut += outQty; existing.net += r.qty; existing.count += 1; existing.totalExtension += r.extension; }
      else { map.set(wh, { warehouse: wh, totalIn: inQty, totalOut: outQty, net: r.qty, count: 1, totalExtension: r.extension }); }
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [agg, data]);

  // Movement by period
  const byPeriodSummary = useMemo(() => {
    if (agg) {
      return agg.byPeriod.map(p => ({
        period: p.period, totalIn: p.totalQty > 0 ? p.totalQty : 0, totalOut: p.totalQty < 0 ? Math.abs(p.totalQty) : 0,
        net: p.totalQty, count: p.count,
      })).sort((a, b) => a.period.localeCompare(b.period));
    }
    const map = new Map<string, { period: string; totalIn: number; totalOut: number; net: number; count: number }>();
    data.forEach(r => {
      const period = r.period || 'Unknown';
      const existing = map.get(period);
      const inQty = r.qty > 0 ? r.qty : 0;
      const outQty = r.qty < 0 ? Math.abs(r.qty) : 0;
      if (existing) { existing.totalIn += inQty; existing.totalOut += outQty; existing.net += r.qty; existing.count += 1; }
      else { map.set(period, { period, totalIn: inQty, totalOut: outQty, net: r.qty, count: 1 }); }
    });
    return Array.from(map.values()).sort((a, b) => a.period.localeCompare(b.period));
  }, [agg, data]);

  // ── Warehouse filtered ──
  const warehouseFilteredData = useMemo(() => {
    if (!warehouseFilter) return data;
    return data.filter(r => r.warehouse === warehouseFilter);
  }, [data, warehouseFilter]);

  const warehouseFilteredStyles = useMemo(() => {
    const map = new Map<string, { styleNumber: string; styleDesc: string; totalIn: number; totalOut: number; net: number; count: number }>();
    warehouseFilteredData.forEach(r => {
      const key = r.styleNumber;
      const existing = map.get(key);
      const inQty = r.qty > 0 ? r.qty : 0;
      const outQty = r.qty < 0 ? Math.abs(r.qty) : 0;
      if (existing) { existing.totalIn += inQty; existing.totalOut += outQty; existing.net += r.qty; existing.count += 1; }
      else { map.set(key, { styleNumber: r.styleNumber, styleDesc: r.styleDesc || '', totalIn: inQty, totalOut: outQty, net: r.qty, count: 1 }); }
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [warehouseFilteredData]);

  // ── History tab ──
  const historyFiltered = useMemo(() => {
    let result = data;
    if (historyWarehouse) result = result.filter(r => r.warehouse === historyWarehouse);
    if (historyType) result = result.filter(r => r.movementType === historyType);
    if (historyPeriod) result = result.filter(r => r.period === historyPeriod);
    if (historyStyle) result = result.filter(r => r.styleNumber === historyStyle);
    if (historySearch) {
      const q = historySearch.toLowerCase();
      result = result.filter(r =>
        r.styleNumber?.toLowerCase().includes(q) || r.styleDesc?.toLowerCase().includes(q) ||
        r.colorDesc?.toLowerCase().includes(q) || r.customerVendor?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [data, historyWarehouse, historyType, historyPeriod, historyStyle, historySearch]);

  const historySorted = useMemo(() => {
    const sorted = [...historyFiltered];
    const dir = historySortDir === 'asc' ? 1 : -1;
    sorted.sort((a, b) => {
      switch (historySortField) {
        case 'movementDate': return dir * ((a.movementDate || '').localeCompare(b.movementDate || ''));
        case 'styleNumber': return dir * a.styleNumber.localeCompare(b.styleNumber);
        case 'color': return dir * ((a.color || '').localeCompare(b.color || ''));
        case 'warehouse': return dir * ((a.warehouse || '').localeCompare(b.warehouse || ''));
        case 'movementType': return dir * ((a.movementType || '').localeCompare(b.movementType || ''));
        case 'qty': return dir * (a.qty - b.qty);
        case 'balance': return dir * (a.balance - b.balance);
        case 'customerVendor': return dir * ((a.customerVendor || '').localeCompare(b.customerVendor || ''));
        default: return 0;
      }
    });
    return sorted;
  }, [historyFiltered, historySortField, historySortDir]);

  const historyTotalPages = Math.max(1, Math.ceil(historySorted.length / historyPageSize));
  const historyPaged = useMemo(() => {
    const start = (historyPage - 1) * historyPageSize;
    return historySorted.slice(start, start + historyPageSize);
  }, [historySorted, historyPage]);

  const toggleHistorySort = useCallback((field: HistorySortField) => {
    if (historySortField === field) setHistorySortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setHistorySortField(field); setHistorySortDir(field === 'movementDate' ? 'desc' : 'asc'); }
    setHistoryPage(1);
  }, [historySortField]);

  const clearHistoryFilters = useCallback(() => {
    setHistorySearch(''); setHistoryWarehouse(''); setHistoryType(''); setHistoryPeriod(''); setHistoryStyle(''); setHistoryPage(1);
  }, []);

  const hasHistoryFilters = historySearch || historyWarehouse || historyType || historyPeriod || historyStyle;

  // ── On-Hand tab computations ──
  const ohData = inventoryOH || [];

  const ohWarehouses = useMemo(() => {
    const s = new Set<number>();
    ohData.forEach(r => { if (r.warehouse !== undefined && r.warehouse !== null) s.add(r.warehouse); });
    return Array.from(s).sort((a, b) => a - b);
  }, [ohData]);

  // ── OH Warehouse breakdown ──
  const ohByWarehouse = useMemo(() => {
    const map = new Map<number, { warehouse: number; totalQty: number; totalValue: number; styleCount: Set<string> }>();
    ohData.forEach(r => {
      const wh = r.warehouse ?? 0;
      const existing = map.get(wh);
      if (existing) {
        existing.totalQty += r.totalQty;
        existing.totalValue += r.totalQty * r.stdCost;
        existing.styleCount.add(r.styleNumber);
      } else {
        const styleSet = new Set<string>();
        styleSet.add(r.styleNumber);
        map.set(wh, { warehouse: wh, totalQty: r.totalQty, totalValue: r.totalQty * r.stdCost, styleCount: styleSet });
      }
    });
    return Array.from(map.values())
      .map(v => ({ ...v, styles: v.styleCount.size }))
      .sort((a, b) => b.totalQty - a.totalQty);
  }, [ohData]);

  const filteredOH = useMemo(() => {
    let result = ohData;
    if (ohSearch) {
      const q = ohSearch.toLowerCase();
      result = result.filter(r =>
        r.styleNumber.toLowerCase().includes(q) ||
        (r.styleDesc || '').toLowerCase().includes(q) ||
        (r.colorDesc || '').toLowerCase().includes(q) ||
        (r.color || '').toLowerCase().includes(q)
      );
    }
    if (globalSearchQuery) {
      const q = globalSearchQuery.toLowerCase();
      result = result.filter(r =>
        r.styleNumber.toLowerCase().includes(q) ||
        (r.styleDesc || '').toLowerCase().includes(q)
      );
    }
    if (ohCategoryCodes.length > 0) result = result.filter(r => ohCategoryCodes.includes(r.category ?? ''));
    if (ohSeasonCode) result = result.filter(r => r.season === ohSeasonCode);
    if (ohDivisionCodes.length > 0) result = result.filter(r => ohDivisionCodes.includes(String(r.division)));
    if (ohWarehouse) result = result.filter(r => String(r.warehouse) === ohWarehouse);
    return result;
  }, [ohData, ohSearch, ohCategoryCodes, ohSeasonCode, ohDivisionCodes, ohWarehouse, globalSearchQuery]);

  // ── Filtered KPI computations ──
  const ohTotalUnits = useMemo(() => filteredOH.reduce((s, r) => s + r.totalQty, 0), [filteredOH]);
  const ohTotalValue = useMemo(() => filteredOH.reduce((s, r) => s + r.totalQty * r.stdCost, 0), [filteredOH]);
  const ohUniqueStyles = useMemo(() => new Set(filteredOH.map(r => r.styleNumber)).size, [filteredOH]);
  const ohUniqueColors = useMemo(() => filteredOH.length, [filteredOH]);

  // ── Sell-through & open orders: match sales to OH styles ──
  const salesByStyle = useMemo(() => {
    const booked = new Map<string, number>();
    const shipped = new Map<string, number>();
    sales.forEach(s => {
      if (!matchesDivision(s.divisionDesc, selectedDivision)) return;
      booked.set(s.styleNumber, (booked.get(s.styleNumber) || 0) + (s.unitsBooked || 0));
      shipped.set(s.styleNumber, (shipped.get(s.styleNumber) || 0) + (s.unitsShipped || 0));
    });
    return { booked, shipped };
  }, [sales, selectedDivision]);

  // ── Style groups for hierarchy view ──
  interface StyleGroup {
    styleNumber: string;
    styleDesc: string;
    season: string;
    category: string;
    colors: InventoryOHRecord[];
    totalQty: number;
    totalValue: number;
    totalWholesale: number;
    totalMsrp: number;
    avgCost: number;
    avgMsrp: number;
    unitsSold: number;
    unitsShipped: number;
    openOrders: number;
    sellThrough: number;
    dailyShipRate: number;
    weeksOfSupply: number | null;
    recentReceipts: number;
    warehouseBreakdown: Map<number, number>;
    brokenSizeCount: number;
    totalSizeCount: number;
  }

  const styleGroups = useMemo((): StyleGroup[] => {
    const map = new Map<string, StyleGroup>();
    filteredOH.forEach(r => {
      const key = r.styleNumber;
      const existing = map.get(key);
      const wh = r.warehouse ?? 0;
      if (existing) {
        existing.colors.push(r);
        existing.totalQty += r.totalQty;
        existing.totalValue += r.totalQty * r.stdCost;
        existing.totalWholesale += r.totalQty * r.stdPrice;
        existing.totalMsrp += r.totalQty * r.msrp;
        existing.warehouseBreakdown.set(wh, (existing.warehouseBreakdown.get(wh) || 0) + r.totalQty);
      } else {
        const whMap = new Map<number, number>();
        whMap.set(wh, r.totalQty);
        map.set(key, {
          styleNumber: r.styleNumber, styleDesc: r.styleDesc || '', season: r.season || '', category: r.category || '',
          colors: [r], totalQty: r.totalQty, totalValue: r.totalQty * r.stdCost,
          totalWholesale: r.totalQty * r.stdPrice, totalMsrp: r.totalQty * r.msrp,
          avgCost: 0, avgMsrp: 0, unitsSold: 0, unitsShipped: 0, openOrders: 0, sellThrough: 0,
          dailyShipRate: 0, weeksOfSupply: null, recentReceipts: 0,
          warehouseBreakdown: whMap, brokenSizeCount: 0, totalSizeCount: 0,
        });
      }
    });
    map.forEach(g => {
      if (g.colors.length > 0) {
        g.avgCost = g.colors.reduce((s, c) => s + c.stdCost, 0) / g.colors.length;
        g.avgMsrp = g.colors.reduce((s, c) => s + c.msrp, 0) / g.colors.length;
      }
      g.unitsSold = salesByStyle.booked.get(g.styleNumber) || 0;
      g.unitsShipped = salesByStyle.shipped.get(g.styleNumber) || 0;
      g.openOrders = Math.max(0, g.unitsSold - g.unitsShipped);
      const totalAvail = g.totalQty + g.unitsSold;
      g.sellThrough = totalAvail > 0 ? (g.unitsSold / totalAvail) * 100 : 0;

      // Movement velocity
      g.dailyShipRate = movementVelocity.dailyRate.get(g.styleNumber) || 0;
      g.weeksOfSupply = g.dailyShipRate > 0 ? (g.totalQty / g.dailyShipRate) / 7 : null;

      // Recent receipts (POs)
      g.recentReceipts = receiptsByStyle.get(g.styleNumber) || 0;

      // Broken size runs: count sizes at 0 across all colors
      const allSizes = new Map<string, number>();
      g.colors.forEach(c => {
        if (c.sizeBreakdown) {
          Object.entries(c.sizeBreakdown).forEach(([size, qty]) => {
            allSizes.set(size, (allSizes.get(size) || 0) + qty);
          });
        }
      });
      g.totalSizeCount = allSizes.size;
      g.brokenSizeCount = Array.from(allSizes.values()).filter(qty => qty === 0).length;
    });

    const groups = Array.from(map.values());
    // Sort with weeksOfSupply support
    groups.sort((a, b) => {
      if (ohSortField === 'weeksOfSupply') {
        const av = a.weeksOfSupply ?? (ohSortDir === 'asc' ? Infinity : -Infinity);
        const bv = b.weeksOfSupply ?? (ohSortDir === 'asc' ? Infinity : -Infinity);
        return ohSortDir === 'desc' ? bv - av : av - bv;
      }
      if (ohSortField === 'totalQty') return ohSortDir === 'desc' ? b.totalQty - a.totalQty : a.totalQty - b.totalQty;
      if (ohSortField === 'styleNumber') return ohSortDir === 'desc' ? b.styleNumber.localeCompare(a.styleNumber) : a.styleNumber.localeCompare(b.styleNumber);
      // Default by totalQty
      return b.totalQty - a.totalQty;
    });
    return groups;
  }, [filteredOH, salesByStyle, movementVelocity, receiptsByStyle, ohSortField, ohSortDir]);

  // Paginate style groups
  const stylePageSize = 25;
  const styleGroupPages = Math.ceil(styleGroups.length / stylePageSize);
  const pagedStyleGroups = useMemo(() => styleGroups.slice(ohPage * stylePageSize, (ohPage + 1) * stylePageSize), [styleGroups, ohPage]);

  // OH health counts
  const ohLowStockCount = useMemo(() => {
    const seen = new Set<string>();
    filteredOH.forEach(r => {
      if (r.totalQty > 0 && r.totalQty <= 50) seen.add(r.styleNumber);
    });
    return seen.size;
  }, [filteredOH]);

  const ohOutOfStockCount = useMemo(() => {
    const seen = new Set<string>();
    filteredOH.forEach(r => {
      if (r.totalQty === 0) seen.add(`${r.styleNumber}|${r.color}`);
    });
    return seen.size;
  }, [filteredOH]);

  // Average weeks of supply across styles that have velocity data
  const avgWeeksOfSupply = useMemo(() => {
    const withVelocity = styleGroups.filter(g => g.weeksOfSupply !== null);
    if (withVelocity.length === 0) return null;
    return withVelocity.reduce((s, g) => s + (g.weeksOfSupply || 0), 0) / withVelocity.length;
  }, [styleGroups]);

  // ── Category breakdown for mini-chart ──
  const ohCategoryBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    filteredOH.forEach(r => {
      const cat = r.category || 'Other';
      map.set(cat, (map.get(cat) || 0) + r.totalQty);
    });
    return Array.from(map.entries())
      .map(([category, units]) => ({ category, units }))
      .sort((a, b) => b.units - a.units);
  }, [filteredOH]);

  // ── Stock health distribution ──
  const stockHealth = useMemo(() => {
    const counts = { inStock: 0, limited: 0, low: 0, outOfStock: 0 };
    // Count by style group (not individual color rows)
    styleGroups.forEach(g => {
      if (g.totalQty === 0) counts.outOfStock++;
      else if (g.totalQty <= 50) counts.low++;
      else if (g.totalQty <= 200) counts.limited++;
      else counts.inStock++;
    });
    return counts;
  }, [styleGroups]);

  const stockHealthTotal = stockHealth.inStock + stockHealth.limited + stockHealth.low + stockHealth.outOfStock;

  // ── Inventory Alerts ──
  const inventoryAlerts = useMemo(() => {
    const lowWos: StyleGroup[] = [];       // Styles with < 4 weeks of supply
    const shortOnHand: StyleGroup[] = [];  // On-hand < open orders
    const brokenRuns: StyleGroup[] = [];   // Styles with broken size runs

    styleGroups.forEach(g => {
      if (g.totalQty === 0) return; // Skip OOS — already shown in health bar

      // 1. Low velocity / reorder alerts
      if (g.weeksOfSupply !== null && g.weeksOfSupply < 4) {
        lowWos.push(g);
      }

      // 2. Open order coverage — on-hand can't fulfill open bookings
      if (g.openOrders > 0 && g.totalQty < g.openOrders) {
        shortOnHand.push(g);
      }

      // 3. Broken size runs
      if (g.brokenSizeCount > 0 && g.totalSizeCount > 1) {
        brokenRuns.push(g);
      }
    });

    // Sort each by severity
    lowWos.sort((a, b) => (a.weeksOfSupply || 0) - (b.weeksOfSupply || 0));
    shortOnHand.sort((a, b) => (a.totalQty - a.openOrders) - (b.totalQty - b.openOrders)); // most short first
    brokenRuns.sort((a, b) => (b.brokenSizeCount / b.totalSizeCount) - (a.brokenSizeCount / a.totalSizeCount));

    return { lowWos, shortOnHand, brokenRuns };
  }, [styleGroups]);

  const totalAlerts = inventoryAlerts.lowWos.length + inventoryAlerts.shortOnHand.length + inventoryAlerts.brokenRuns.length;

  // Drilldown helpers
  const drilldownSiblings = useMemo(() => {
    if (!drilldownRecord) return [];
    return ohData.filter(r => r.styleNumber === drilldownRecord.styleNumber && r.color === drilldownRecord.color);
  }, [drilldownRecord, ohData]);

  const drilldownSizeTypes = useMemo(() => {
    if (!drilldownRecord) return [];
    const types = new Set<string>();
    drilldownSiblings.forEach(r => { if (r.sizeType) types.add(r.sizeType); });
    return Array.from(types).sort();
  }, [drilldownRecord, drilldownSiblings]);

  const drilldownActiveRecord = useMemo(() => {
    if (!drilldownRecord) return null;
    if (activeSizeType && drilldownSiblings.length > 1) {
      return drilldownSiblings.find(r => r.sizeType === activeSizeType) || drilldownRecord;
    }
    return drilldownRecord;
  }, [drilldownRecord, activeSizeType, drilldownSiblings]);

  // ── Export ──
  const handleOHExport = useCallback(() => {
    const rows: Record<string, unknown>[] = [];
    filteredOH.forEach(r => {
      rows.push({
        Style: r.styleNumber, Description: r.styleDesc, Season: r.season, Category: r.category,
        Division: getDivisionLabel(r.division), Warehouse: r.warehouse ?? '', Color: r.color, 'Color Desc': r.colorDesc,
        'On-Hand': r.totalQty, 'Std Cost': r.stdCost, 'Wholesale': r.stdPrice, 'MSRP': r.msrp,
        'Value (Cost)': r.totalQty * r.stdCost, 'Value (Wholesale)': r.totalQty * r.stdPrice,
        Classification: r.inventoryClassification, Segment: r.segmentCode,
      });
    });
    exportToExcel(rows, `on-hand-inventory_${new Date().toISOString().split('T')[0]}`);
  }, [filteredOH]);

  // ── Render helpers ──
  const SortIcon = ({ field, currentField, currentDir }: { field: string; currentField: string; currentDir: 'asc' | 'desc' }) => {
    if (field !== currentField) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-30" />;
    return currentDir === 'asc' ? <ArrowUp className="w-3 h-3 ml-1" /> : <ArrowDown className="w-3 h-3 ml-1" />;
  };

  // Weeks of supply color coding
  function wosColor(wos: number | null): string {
    if (wos === null) return 'text-text-muted';
    if (wos <= 4) return 'text-red-400';
    if (wos <= 8) return 'text-amber-400';
    if (wos <= 16) return 'text-emerald-400';
    return 'text-cyan-400';
  }

  function wosLabel(wos: number | null): string {
    if (wos === null) return '—';
    if (wos <= 4) return `${wos.toFixed(1)}w ⚠`;
    return `${wos.toFixed(1)}w`;
  }

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <div className="space-y-5 p-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-text-primary">Inventory</h2>
          <p className="text-sm text-text-muted mt-1">On-hand levels, movements, and stock health</p>
        </div>
        {activeTab === 'on-hand' && ohData.length > 0 && (
          <button onClick={handleOHExport} className="flex items-center gap-2 px-4 py-2.5 bg-surface-primary border border-border-primary rounded-lg text-sm font-medium text-text-secondary hover:bg-surface-secondary transition-colors">
            <Download className="w-4 h-4" /> Export
          </button>
        )}
      </div>

      {/* Sub Tabs */}
      <div className="flex gap-0.5 bg-surface-secondary rounded-xl p-1 w-fit">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-md text-xs font-medium whitespace-nowrap transition-colors
              ${activeTab === tab.id ? 'bg-surface-tertiary text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ═══ ON-HAND TAB ══════════════════════════════════════════════ */}
      {activeTab === 'on-hand' && (
        <div className="space-y-4">
          {ohData.length === 0 ? (
            <div className="text-center py-16">
              <Package className="w-12 h-12 mx-auto mb-4 opacity-30 text-text-muted" />
              <p className="text-lg font-semibold text-text-muted">No On-Hand inventory data</p>
              <p className="text-sm mt-1 text-text-muted">Import an OH Inventory XLSX file to see data here.</p>
            </div>
          ) : drilldownRecord && drilldownActiveRecord ? (
            /* ── DRILL-DOWN VIEW ── */
            <div className="space-y-4">
              {/* Breadcrumb */}
              <div className="flex items-center gap-2 text-sm">
                <button onClick={() => setDrilldownRecord(null)} className="text-text-secondary hover:text-cyan-400 transition-colors">On-Hand</button>
                <span className="text-text-muted">›</span>
                <button onClick={() => setDrilldownRecord(null)} className="text-text-secondary hover:text-cyan-400 transition-colors">{drilldownActiveRecord.styleNumber} {drilldownActiveRecord.styleDesc}</button>
                <span className="text-text-muted">›</span>
                <span className="text-text-primary font-medium">{drilldownActiveRecord.color} ({drilldownActiveRecord.colorDesc})</span>
              </div>

              {/* Drill-down Header */}
              <div className="bg-surface-primary rounded-xl border border-border-primary p-5 flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-lg border-2 border-white/15 flex-shrink-0" style={{ background: getSwatchColor(drilldownActiveRecord.color || '') }} />
                  <div>
                    <h3 className="text-xl font-semibold text-text-primary">{drilldownActiveRecord.styleNumber} · {drilldownActiveRecord.color}</h3>
                    <p className="text-sm text-text-secondary">
                      {drilldownActiveRecord.styleDesc} · {getDivisionLabel(drilldownActiveRecord.division)} · {drilldownActiveRecord.category}
                      {drilldownActiveRecord.garmentClassDesc && ` · ${drilldownActiveRecord.garmentClassDesc}`}
                      {drilldownActiveRecord.warehouse !== undefined && ` · ${getWarehouseName(drilldownActiveRecord.warehouse)}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {drilldownActiveRecord.season && <span className="px-2.5 py-1 rounded text-xs font-semibold bg-cyan-500/15 text-cyan-400">{drilldownActiveRecord.season}</span>}
                  {drilldownActiveRecord.warehouse !== undefined && <span className="px-2.5 py-1 rounded text-xs font-semibold bg-indigo-500/15 text-indigo-400">WH {drilldownActiveRecord.warehouse}</span>}
                  {drilldownActiveRecord.inventoryClassification && <span className="px-2.5 py-1 rounded text-xs font-semibold bg-surface-secondary text-text-muted">{drilldownActiveRecord.inventoryClassification}</span>}
                </div>
              </div>

              {/* Size-type tabs (numeric = inseam length, alpha = fit variant) */}
              {drilldownSizeTypes.length > 1 && (
                <div className="flex gap-1 bg-surface-secondary rounded-lg p-1 w-fit">
                  {drilldownSizeTypes.map(st => {
                    const isInseam = /^\d+$/.test(st);
                    const label = isInseam ? `${st}" Inseam` : st === 'RG' ? 'Regular' : st === 'LN' ? 'Long' : st === 'SH' ? 'Short' : `${st} Type`;
                    return (
                      <button key={st} onClick={() => setActiveSizeType(st)}
                        className={`px-4 py-2 rounded text-sm font-medium transition-colors
                          ${(activeSizeType === st || (!activeSizeType && st === drilldownSizeTypes[0]))
                            ? 'bg-cyan-600 text-white' : 'text-text-secondary hover:text-text-primary'}`}
                      >{label}</button>
                    );
                  })}
                </div>
              )}

              {/* Drill-down Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
                {/* Size Breakdown Table */}
                <div className="bg-surface-primary rounded-xl border border-border-primary overflow-hidden">
                  <div className="px-5 py-3 border-b border-border-primary">
                    <span className="text-sm font-semibold text-text-primary">
                      {/^\d+$/.test(drilldownActiveRecord.sizeType || '') ? 'Waist Size Breakdown' : 'Size Breakdown'} — On-Hand Quantities
                    </span>
                    {drilldownActiveRecord.sizeType && (
                      <span className="text-xs text-text-muted ml-2">
                        ({/^\d+$/.test(drilldownActiveRecord.sizeType) ? `${drilldownActiveRecord.sizeType}" inseam` : drilldownActiveRecord.sizeType === 'RG' ? 'Regular fit' : drilldownActiveRecord.sizeType === 'LN' ? 'Long fit' : `${drilldownActiveRecord.sizeType} type`})
                      </span>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    {(() => {
                      const breakdown = drilldownActiveRecord.sizeBreakdown || {};
                      // Sort size keys: numeric waist sizes numerically, alpha sizes in standard order
                      const alphaOrder = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
                      const sizeKeys = Object.keys(breakdown).sort((a, b) => {
                        const aNum = parseInt(a), bNum = parseInt(b);
                        if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
                        if (!isNaN(aNum)) return -1;
                        if (!isNaN(bNum)) return 1;
                        const aIdx = alphaOrder.indexOf(a), bIdx = alphaOrder.indexOf(b);
                        if (aIdx >= 0 && bIdx >= 0) return aIdx - bIdx;
                        return a.localeCompare(b);
                      });
                      const maxQty = Math.max(...sizeKeys.map(k => breakdown[k] || 0), 1);
                      return sizeKeys.length > 0 ? (
                        <table className="w-full border-collapse text-sm">
                          <thead>
                            <tr>
                              <th className="text-left px-4 py-2.5 bg-surface-secondary border-b border-border-primary text-xs font-semibold text-text-muted uppercase">
                                {/^\d+$/.test(drilldownActiveRecord.sizeType || '') ? 'Waist' : 'Size'}
                              </th>
                              <th className="text-right px-4 py-2.5 bg-surface-secondary border-b border-border-primary text-xs font-semibold text-text-muted uppercase">Qty</th>
                              <th className="text-left px-4 py-2.5 bg-surface-secondary border-b border-border-primary text-xs font-semibold text-text-muted uppercase w-1/2">Distribution</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sizeKeys.map(sz => {
                              const qty = breakdown[sz] || 0;
                              const pct = drilldownActiveRecord.totalQty > 0 ? (qty / drilldownActiveRecord.totalQty * 100) : 0;
                              return (
                                <tr key={sz} className="border-b border-border-primary hover:bg-surface-secondary/50">
                                  <td className="px-4 py-2.5 text-text-primary font-mono font-medium">{sz}</td>
                                  <td className={`px-4 py-2.5 text-right font-mono font-semibold ${qty === 0 ? 'text-red-400' : qty <= 10 ? 'text-amber-400' : 'text-text-primary'}`}>
                                    {formatNumber(qty)}
                                    {qty > 0 && qty <= 10 && <span className="ml-1.5 text-[10px] text-amber-400">LOW</span>}
                                  </td>
                                  <td className="px-4 py-2.5">
                                    <div className="flex items-center gap-2">
                                      <div className="flex-1 bg-surface-secondary rounded-full h-2">
                                        <div className={`h-2 rounded-full transition-all ${qty === 0 ? 'bg-red-500/30' : qty <= 10 ? 'bg-amber-500' : 'bg-cyan-500'}`}
                                          style={{ width: `${(qty / maxQty) * 100}%` }} />
                                      </div>
                                      <span className="text-xs text-text-muted w-10 text-right">{pct.toFixed(1)}%</span>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                            <tr className="bg-surface-secondary">
                              <td className="px-4 py-2.5 text-text-primary font-semibold">Total</td>
                              <td className="px-4 py-2.5 text-right font-mono font-bold text-text-primary">{formatNumber(drilldownActiveRecord.totalQty)}</td>
                              <td className="px-4 py-2.5 text-xs text-text-muted">{sizeKeys.filter(k => (breakdown[k] || 0) > 0).length} active sizes</td>
                            </tr>
                          </tbody>
                        </table>
                      ) : (
                        <div className="px-5 py-8 text-center text-text-muted text-sm">No size breakdown available</div>
                      );
                    })()}
                  </div>
                </div>

                {/* Sidebar Stats */}
                <div className="flex flex-col gap-3">
                  <div className="bg-surface-primary rounded-xl border border-border-primary p-4">
                    <h4 className="text-xs font-semibold text-text-muted uppercase mb-3">Pricing</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-surface-secondary rounded-md p-2.5">
                        <div className="text-[10px] text-text-muted uppercase">Std Cost</div>
                        <div className="text-base font-semibold font-mono text-text-primary">{formatCurrency(drilldownActiveRecord.stdCost)}</div>
                      </div>
                      <div className="bg-surface-secondary rounded-md p-2.5">
                        <div className="text-[10px] text-text-muted uppercase">Wholesale</div>
                        <div className="text-base font-semibold font-mono text-text-primary">{formatCurrency(drilldownActiveRecord.stdPrice)}</div>
                      </div>
                      <div className="bg-surface-secondary rounded-md p-2.5">
                        <div className="text-[10px] text-text-muted uppercase">MSRP</div>
                        <div className="text-base font-semibold font-mono text-text-primary">{formatCurrency(drilldownActiveRecord.msrp)}</div>
                      </div>
                      {drilldownActiveRecord.outletMsrp > 0 && (
                        <div className="bg-surface-secondary rounded-md p-2.5">
                          <div className="text-[10px] text-text-muted uppercase">Outlet MSRP</div>
                          <div className="text-base font-semibold font-mono text-text-primary">{formatCurrency(drilldownActiveRecord.outletMsrp)}</div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Velocity info for drilldown */}
                  {(() => {
                    const dailyRate = movementVelocity.dailyRate.get(drilldownActiveRecord.styleNumber) || 0;
                    const wos = dailyRate > 0 ? (drilldownActiveRecord.totalQty / dailyRate) / 7 : null;
                    const receipts = receiptsByStyle.get(drilldownActiveRecord.styleNumber) || 0;
                    return (
                      <div className="bg-surface-primary rounded-xl border border-border-primary p-4">
                        <h4 className="text-xs font-semibold text-text-muted uppercase mb-3">Velocity</h4>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-text-muted">Daily Ship Rate</span>
                            <span className="font-mono text-text-primary">{dailyRate > 0 ? `${dailyRate.toFixed(1)}/day` : '—'}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-text-muted">Weeks of Supply</span>
                            <span className={`font-mono font-medium ${wosColor(wos)}`}>{wosLabel(wos)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-text-muted">Recent POs</span>
                            <span className="font-mono text-text-primary">{receipts > 0 ? `+${formatNumber(receipts)}` : '—'}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="bg-surface-primary rounded-xl border border-border-primary p-4">
                    <h4 className="text-xs font-semibold text-text-muted uppercase mb-3">Value</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-text-muted">At Cost</span>
                        <span className="font-mono text-text-primary">{formatCurrencyShort(drilldownActiveRecord.totalQty * drilldownActiveRecord.stdCost)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-text-muted">At Wholesale</span>
                        <span className="font-mono text-text-primary">{formatCurrencyShort(drilldownActiveRecord.totalQty * drilldownActiveRecord.stdPrice)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-text-muted">At MSRP</span>
                        <span className="font-mono text-text-primary">{formatCurrencyShort(drilldownActiveRecord.totalQty * drilldownActiveRecord.msrp)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-surface-primary rounded-xl border border-border-primary p-4">
                    <h4 className="text-xs font-semibold text-text-muted uppercase mb-3">Details</h4>
                    <div className="space-y-1.5 text-sm">
                      {drilldownActiveRecord.warehouse !== undefined && <div className="flex justify-between"><span className="text-text-muted">Warehouse</span><span className="text-text-primary">{getWarehouseName(drilldownActiveRecord.warehouse)}</span></div>}
                      {drilldownActiveRecord.segmentCode && <div className="flex justify-between"><span className="text-text-muted">Segment</span><span className="text-text-primary">{drilldownActiveRecord.segmentCode}</span></div>}
                      {drilldownActiveRecord.garmentClass && <div className="flex justify-between"><span className="text-text-muted">Garment Class</span><span className="text-text-primary">{drilldownActiveRecord.garmentClassDesc || drilldownActiveRecord.garmentClass}</span></div>}
                      {drilldownActiveRecord.colorType && <div className="flex justify-between"><span className="text-text-muted">Color Type</span><span className="text-text-primary">{drilldownActiveRecord.colorType}</span></div>}
                      {drilldownActiveRecord.prodType && <div className="flex justify-between"><span className="text-text-muted">Prod Type</span><span className="text-text-primary">{drilldownActiveRecord.prodType}</span></div>}
                      {drilldownActiveRecord.prodLine && <div className="flex justify-between"><span className="text-text-muted">Prod Line</span><span className="text-text-primary">{drilldownActiveRecord.prodLine}</span></div>}
                    </div>
                  </div>

                  <button onClick={() => onStyleClick(drilldownActiveRecord.styleNumber)}
                    className="w-full py-2.5 text-sm font-medium text-cyan-400 hover:text-cyan-300 bg-surface-primary border border-border-primary hover:bg-surface-secondary rounded-xl transition-colors">
                    View Full Style Detail →
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* ── MAIN ON-HAND VIEW ── */
            <>
              {/* Warehouse chips + Search */}
              <div className="flex items-center gap-2 flex-wrap">
                {ohWarehouses.length > 1 && (
                  <>
                    <Warehouse className="w-3.5 h-3.5 text-text-muted" />
                    {ohByWarehouse.map(wh => {
                      const isSelected = ohWarehouse === String(wh.warehouse);
                      const allUnits = ohData.reduce((s, r) => s + r.totalQty, 0);
                      const pct = allUnits > 0 ? (wh.totalQty / allUnits * 100) : 0;
                      return (
                        <button key={wh.warehouse}
                          onClick={() => { setOHWarehouse(isSelected ? '' : String(wh.warehouse)); setOHPage(0); }}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                            ${isSelected ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/40' : 'bg-surface-secondary text-text-secondary border border-border-primary hover:bg-surface-tertiary'}`}>
                          <span>{getWarehouseName(wh.warehouse)}</span>
                          <span className="font-mono text-[10px] opacity-70">{formatNumber(wh.totalQty)} · {pct.toFixed(0)}%</span>
                        </button>
                      );
                    })}
                  </>
                )}
                {(ohSearch || ohWarehouse) && (
                  <button onClick={() => { setOHSearch(''); setOHWarehouse(''); setOHPage(0); }}
                    className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 transition-colors">
                    <X className="w-3 h-3" /> Clear
                  </button>
                )}
                <div className="relative ml-auto">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
                  <input type="text" placeholder="Search style, color..." value={ohSearch}
                    onChange={e => { setOHSearch(e.target.value); setOHPage(0); }}
                    className="pl-8 pr-3 py-2 rounded-md text-xs bg-surface-secondary border border-border-primary text-text-primary focus:outline-none focus:border-cyan-500 w-52" />
                </div>
              </div>

              {/* KPI Cards — REAL data only */}
              <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
                <div className="bg-surface-primary rounded-xl border border-cyan-500/30 p-4">
                  <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5">Total On-Hand</div>
                  <div className="text-2xl font-bold font-mono tracking-tight text-cyan-400">{formatNumber(ohTotalUnits)}</div>
                  <div className="text-[10px] text-text-muted mt-1">{formatNumber(ohUniqueStyles)} styles · {formatNumber(ohUniqueColors)} rows</div>
                </div>
                <div className="bg-surface-primary rounded-xl border border-border-primary p-4">
                  <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5">Value (Cost)</div>
                  <div className="text-2xl font-bold font-mono tracking-tight text-text-primary">{formatCurrencyShort(ohTotalValue)}</div>
                  <div className="text-[10px] text-text-muted mt-1">Wholesale: {formatCurrencyShort(filteredOH.reduce((s, r) => s + r.totalQty * r.stdPrice, 0))}</div>
                </div>
                <div className="bg-surface-primary rounded-xl border border-border-primary p-4">
                  <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5">Avg/Style</div>
                  <div className="text-2xl font-bold font-mono tracking-tight text-text-primary">{ohUniqueStyles > 0 ? formatNumber(Math.round(ohTotalUnits / ohUniqueStyles)) : '—'}</div>
                  <div className="text-[10px] text-text-muted mt-1">units per style</div>
                </div>
                <div className="bg-surface-primary rounded-xl border border-border-primary p-4">
                  <div className="flex items-center gap-1 text-[10px] text-text-muted uppercase tracking-wider mb-1.5">
                    <Clock className="w-3 h-3" /> Weeks of Supply
                  </div>
                  <div className={`text-2xl font-bold font-mono tracking-tight ${wosColor(avgWeeksOfSupply)}`}>
                    {avgWeeksOfSupply !== null ? `${avgWeeksOfSupply.toFixed(1)}` : '—'}
                  </div>
                  <div className="text-[10px] text-text-muted mt-1">
                    {movementVelocity.daySpan > 1 ? `based on ${movementVelocity.daySpan}d of shipments` : 'no movement data'}
                  </div>
                </div>
                {/* Stock Health — combined card */}
                <div className="bg-surface-primary rounded-xl border border-border-primary p-4 col-span-2">
                  <div className="text-[10px] text-text-muted uppercase tracking-wider mb-2">Stock Health</div>
                  {stockHealthTotal > 0 ? (
                    <>
                      <div className="flex rounded-full h-3 overflow-hidden bg-surface-secondary">
                        {stockHealth.inStock > 0 && <div className="bg-emerald-500 transition-all" style={{ width: `${(stockHealth.inStock / stockHealthTotal) * 100}%` }} />}
                        {stockHealth.limited > 0 && <div className="bg-cyan-500 transition-all" style={{ width: `${(stockHealth.limited / stockHealthTotal) * 100}%` }} />}
                        {stockHealth.low > 0 && <div className="bg-amber-500 transition-all" style={{ width: `${(stockHealth.low / stockHealthTotal) * 100}%` }} />}
                        {stockHealth.outOfStock > 0 && <div className="bg-red-500 transition-all" style={{ width: `${(stockHealth.outOfStock / stockHealthTotal) * 100}%` }} />}
                      </div>
                      <div className="flex items-center gap-3 mt-2 text-[10px]">
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /><span className="text-text-muted">In Stock</span><span className="font-mono font-medium text-text-secondary">{stockHealth.inStock}</span></span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-cyan-500" /><span className="text-text-muted">Limited</span><span className="font-mono font-medium text-text-secondary">{stockHealth.limited}</span></span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /><span className="text-text-muted">Low</span><span className="font-mono font-medium text-amber-400">{stockHealth.low}</span></span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /><span className="text-text-muted">OOS</span><span className="font-mono font-medium text-red-400">{stockHealth.outOfStock}</span></span>
                      </div>
                    </>
                  ) : (
                    <div className="text-sm text-text-muted">—</div>
                  )}
                </div>
              </div>

              {/* Category Breakdown Bar */}
              {ohCategoryBreakdown.length > 0 && (
                <div className="bg-surface-primary rounded-xl border border-border-primary p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[10px] text-text-muted uppercase tracking-wider">Units by Category</div>
                    <div className="text-[10px] text-text-muted">{formatNumber(ohTotalUnits)} total</div>
                  </div>
                  <div className="flex rounded-lg h-6 overflow-hidden bg-surface-secondary">
                    {ohCategoryBreakdown.map((cat, i) => {
                      const pct = ohTotalUnits > 0 ? (cat.units / ohTotalUnits) * 100 : 0;
                      if (pct < 1) return null;
                      const colors = ['bg-cyan-500', 'bg-purple-500', 'bg-emerald-500', 'bg-amber-500', 'bg-red-500', 'bg-blue-500', 'bg-pink-500', 'bg-teal-500'];
                      return (
                        <div key={cat.category} className={`${colors[i % colors.length]} relative group transition-all`}
                          style={{ width: `${pct}%` }}>
                          <div className="absolute inset-0 flex items-center justify-center">
                            {pct >= 8 && <span className="text-[9px] font-semibold text-white truncate px-1">{cat.category}</span>}
                          </div>
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-10 whitespace-nowrap">
                            <div className="bg-gray-900 text-white text-[10px] px-2 py-1 rounded shadow-lg">
                              {cat.category}: {formatNumber(cat.units)} ({pct.toFixed(1)}%)
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                    {ohCategoryBreakdown.slice(0, 8).map((cat, i) => {
                      const pct = ohTotalUnits > 0 ? (cat.units / ohTotalUnits) * 100 : 0;
                      const colors = ['bg-cyan-500', 'bg-purple-500', 'bg-emerald-500', 'bg-amber-500', 'bg-red-500', 'bg-blue-500', 'bg-pink-500', 'bg-teal-500'];
                      return (
                        <span key={cat.category} className="flex items-center gap-1 text-[10px]">
                          <span className={`w-2 h-2 rounded-sm ${colors[i % colors.length]}`} />
                          <span className="text-text-muted">{cat.category}</span>
                          <span className="font-mono text-text-secondary">{pct.toFixed(0)}%</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Inventory Alerts */}
              {totalAlerts > 0 && (
                <div className="bg-surface-primary rounded-xl border border-border-primary overflow-hidden">
                  <div className="px-5 py-3 border-b border-border-primary flex items-center justify-between bg-surface-secondary">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                      <span className="text-sm font-semibold text-text-primary">Inventory Alerts</span>
                      <span className="text-xs text-text-muted">({totalAlerts} styles flagged)</span>
                    </div>
                  </div>
                  <div className="divide-y divide-border-secondary">
                    {/* Low Weeks of Supply */}
                    {inventoryAlerts.lowWos.length > 0 && (
                      <div className="px-5 py-3">
                        <div className="flex items-center gap-2 mb-2">
                          <Clock className="w-3.5 h-3.5 text-red-400" />
                          <span className="text-xs font-semibold text-red-400 uppercase tracking-wide">Low Supply ({inventoryAlerts.lowWos.length})</span>
                          <span className="text-[10px] text-text-muted">Less than 4 weeks at current sell rate</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {inventoryAlerts.lowWos.slice(0, 12).map(g => (
                            <button key={g.styleNumber} onClick={() => onStyleClick(g.styleNumber)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-colors text-xs">
                              <span className="font-medium text-text-primary">{g.styleNumber}</span>
                              <span className="font-mono text-red-400">{g.weeksOfSupply !== null ? `${g.weeksOfSupply.toFixed(1)}w` : '—'}</span>
                              <span className="text-text-muted">{formatNumber(g.totalQty)} oh</span>
                            </button>
                          ))}
                          {inventoryAlerts.lowWos.length > 12 && (
                            <span className="inline-flex items-center px-2.5 py-1.5 text-xs text-text-muted">+{inventoryAlerts.lowWos.length - 12} more</span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Open Order Shortage */}
                    {inventoryAlerts.shortOnHand.length > 0 && (
                      <div className="px-5 py-3">
                        <div className="flex items-center gap-2 mb-2">
                          <ShoppingCart className="w-3.5 h-3.5 text-amber-400" />
                          <span className="text-xs font-semibold text-amber-400 uppercase tracking-wide">Order Shortage ({inventoryAlerts.shortOnHand.length})</span>
                          <span className="text-[10px] text-text-muted">On-hand less than open bookings</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {inventoryAlerts.shortOnHand.slice(0, 12).map(g => {
                            const shortBy = g.openOrders - g.totalQty;
                            return (
                              <button key={g.styleNumber} onClick={() => onStyleClick(g.styleNumber)}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 transition-colors text-xs">
                                <span className="font-medium text-text-primary">{g.styleNumber}</span>
                                <span className="font-mono text-amber-400">-{formatNumber(shortBy)}</span>
                                <span className="text-text-muted">{formatNumber(g.totalQty)} oh / {formatNumber(g.openOrders)} open</span>
                              </button>
                            );
                          })}
                          {inventoryAlerts.shortOnHand.length > 12 && (
                            <span className="inline-flex items-center px-2.5 py-1.5 text-xs text-text-muted">+{inventoryAlerts.shortOnHand.length - 12} more</span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Broken Size Runs */}
                    {inventoryAlerts.brokenRuns.length > 0 && (
                      <div className="px-5 py-3">
                        <div className="flex items-center gap-2 mb-2">
                          <Scissors className="w-3.5 h-3.5 text-purple-400" />
                          <span className="text-xs font-semibold text-purple-400 uppercase tracking-wide">Broken Size Runs ({inventoryAlerts.brokenRuns.length})</span>
                          <span className="text-[10px] text-text-muted">Sizes at zero while others have stock</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {inventoryAlerts.brokenRuns.slice(0, 12).map(g => (
                            <button key={g.styleNumber} onClick={() => onStyleClick(g.styleNumber)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 hover:bg-purple-500/20 transition-colors text-xs">
                              <span className="font-medium text-text-primary">{g.styleNumber}</span>
                              <span className="font-mono text-purple-400">{g.brokenSizeCount}/{g.totalSizeCount} sizes</span>
                              <span className="text-text-muted">{formatNumber(g.totalQty)} oh</span>
                            </button>
                          ))}
                          {inventoryAlerts.brokenRuns.length > 12 && (
                            <span className="inline-flex items-center px-2.5 py-1.5 text-xs text-text-muted">+{inventoryAlerts.brokenRuns.length - 12} more</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Inventory Table */}
              <div className="bg-surface-primary rounded-xl border border-border-primary overflow-hidden">
                <div className="px-5 py-3 border-b border-border-primary flex items-center justify-between bg-surface-secondary">
                  <div>
                    <div className="text-sm font-semibold text-text-primary">On-Hand by Style</div>
                    <div className="text-[11px] text-text-muted mt-0.5">
                      {formatNumber(styleGroups.length)} styles · Click to expand colors · Click color for size breakdown
                      {ohWarehouse && ` · Filtered to ${getWarehouseName(parseInt(ohWarehouse))}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => { setOHSortField('totalQty'); setOHSortDir(d => ohSortField === 'totalQty' ? (d === 'desc' ? 'asc' : 'desc') : 'desc'); setOHPage(0); }}
                      className={`px-2.5 py-1 rounded text-[10px] font-medium transition-colors ${ohSortField === 'totalQty' ? 'bg-cyan-500/15 text-cyan-400' : 'text-text-muted hover:text-text-primary'}`}>
                      Qty {ohSortField === 'totalQty' && (ohSortDir === 'desc' ? '↓' : '↑')}
                    </button>
                    <button onClick={() => { setOHSortField('weeksOfSupply'); setOHSortDir(d => ohSortField === 'weeksOfSupply' ? (d === 'desc' ? 'asc' : 'desc') : 'asc'); setOHPage(0); }}
                      className={`px-2.5 py-1 rounded text-[10px] font-medium transition-colors ${ohSortField === 'weeksOfSupply' ? 'bg-cyan-500/15 text-cyan-400' : 'text-text-muted hover:text-text-primary'}`}>
                      WoS {ohSortField === 'weeksOfSupply' && (ohSortDir === 'asc' ? '↑' : '↓')}
                    </button>
                    <button onClick={() => { setOHSortField('styleNumber'); setOHSortDir(d => ohSortField === 'styleNumber' ? (d === 'desc' ? 'asc' : 'desc') : 'asc'); setOHPage(0); }}
                      className={`px-2.5 py-1 rounded text-[10px] font-medium transition-colors ${ohSortField === 'styleNumber' ? 'bg-cyan-500/15 text-cyan-400' : 'text-text-muted hover:text-text-primary'}`}>
                      Style {ohSortField === 'styleNumber' && (ohSortDir === 'asc' ? '↑' : '↓')}
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border-primary bg-surface-secondary">
                        <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-text-muted uppercase tracking-wider min-w-[220px]">Style</th>
                        <th className="text-right px-3 py-2.5 text-[10px] font-semibold text-text-muted uppercase tracking-wider">On-Hand</th>
                        <th className="text-right px-3 py-2.5 text-[10px] font-semibold text-text-muted uppercase tracking-wider">Cost Val</th>
                        <th className="text-right px-3 py-2.5 text-[10px] font-semibold text-text-muted uppercase tracking-wider">
                          <span className="inline-flex items-center gap-0.5"><Activity className="w-3 h-3" /> Ship/Day</span>
                        </th>
                        <th className="text-right px-3 py-2.5 text-[10px] font-semibold text-text-muted uppercase tracking-wider">
                          <span className="inline-flex items-center gap-0.5"><Clock className="w-3 h-3" /> WoS</span>
                        </th>
                        <th className="text-right px-3 py-2.5 text-[10px] font-semibold text-text-muted uppercase tracking-wider">PO Rcpts</th>
                        <th className="text-right px-3 py-2.5 text-[10px] font-semibold text-text-muted uppercase tracking-wider">Sold</th>
                        <th className="text-right px-3 py-2.5 text-[10px] font-semibold text-text-muted uppercase tracking-wider">Sell-Thru</th>
                        <th className="text-left px-3 py-2.5 text-[10px] font-semibold text-text-muted uppercase tracking-wider">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedStyleGroups.map(group => {
                        const isExpanded = expandedStyles.has(group.styleNumber);
                        const stockStatus = getStockStatus(group.totalQty);
                        return (
                          <React.Fragment key={group.styleNumber}>
                            <tr className={`border-b border-border-primary cursor-pointer transition-colors ${isExpanded ? 'bg-surface-secondary' : 'hover:bg-surface-secondary/50'}`}
                              onClick={() => {
                                setExpandedStyles(prev => {
                                  const next = new Set(prev);
                                  if (next.has(group.styleNumber)) next.delete(group.styleNumber); else next.add(group.styleNumber);
                                  return next;
                                });
                              }}>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2.5">
                                  <span className={`w-[18px] h-[18px] flex items-center justify-center bg-surface-secondary rounded text-[9px] text-text-muted transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                                  <div className="flex flex-col">
                                    <span className="text-[13px] font-semibold text-text-primary">{group.styleNumber}</span>
                                    <span className="text-[11px] text-text-muted">{group.styleDesc}</span>
                                  </div>
                                  <span className="text-[10px] text-text-muted ml-1">{group.colors.length} clr{group.colors.length !== 1 ? 's' : ''}</span>
                                </div>
                              </td>
                              <td className="px-3 py-3 text-right text-[13px] font-mono font-semibold text-text-primary">{formatNumber(group.totalQty)}</td>
                              <td className="px-3 py-3 text-right text-xs font-mono text-text-secondary">{formatCurrencyShort(group.totalValue)}</td>
                              <td className="px-3 py-3 text-right text-xs font-mono text-text-secondary">
                                {group.dailyShipRate > 0 ? group.dailyShipRate.toFixed(1) : '—'}
                              </td>
                              <td className={`px-3 py-3 text-right text-xs font-mono font-medium ${wosColor(group.weeksOfSupply)}`}>
                                {wosLabel(group.weeksOfSupply)}
                              </td>
                              <td className="px-3 py-3 text-right text-xs font-mono text-text-secondary">
                                {group.recentReceipts > 0 ? <span className="text-emerald-400">+{formatNumber(group.recentReceipts)}</span> : '—'}
                              </td>
                              <td className="px-3 py-3 text-right text-xs font-mono text-text-secondary">{group.unitsSold > 0 ? formatNumber(group.unitsSold) : '—'}</td>
                              <td className={`px-3 py-3 text-right text-xs font-mono font-medium ${group.sellThrough >= 50 ? 'text-emerald-400' : group.sellThrough >= 25 ? 'text-text-primary' : group.sellThrough > 0 ? 'text-amber-400' : 'text-text-muted'}`}>
                                {group.sellThrough > 0 ? `${group.sellThrough.toFixed(1)}%` : '—'}
                              </td>
                              <td className="px-3 py-3">
                                <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${stockStatus.className}`}>{stockStatus.label}</span>
                              </td>
                            </tr>
                            {/* Color rows */}
                            {isExpanded && group.colors.map(color => {
                              const colorStatus = getStockStatus(color.totalQty);
                              const sizeCount = Object.keys(color.sizeBreakdown || {}).length;
                              return (
                                <tr key={color.id}
                                  className="border-b border-border-primary bg-gray-50 dark:bg-[#0a0a0f] hover:bg-surface-secondary/50 cursor-pointer transition-colors"
                                  onClick={e => { e.stopPropagation(); setDrilldownRecord(color); setActiveSizeType(color.sizeType || ''); }}>
                                  <td className="px-4 py-2.5">
                                    <div className="flex items-center gap-2.5 pl-7">
                                      <div className="w-4 h-4 rounded flex-shrink-0 border border-white/15" style={{ background: getSwatchColor(color.color || '') }} />
                                      <div className="flex flex-col">
                                        <span className="text-xs font-medium text-text-primary">{color.color}</span>
                                        <span className="text-[10px] text-text-muted">{color.colorDesc}</span>
                                      </div>
                                      {color.warehouse !== undefined && <span className="text-[10px] text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded">WH{color.warehouse}</span>}
                                      {sizeCount > 0 && <span className="text-[10px] text-text-muted ml-1">{sizeCount} sizes</span>}
                                      <span className="ml-auto text-[10px] text-text-muted hover:text-cyan-400">sizes →</span>
                                    </div>
                                  </td>
                                  <td className="px-3 py-2.5 text-right text-xs font-mono text-text-primary">{formatNumber(color.totalQty)}</td>
                                  <td className="px-3 py-2.5 text-right text-xs font-mono text-text-muted">{formatCurrencyShort(color.totalQty * color.stdCost)}</td>
                                  <td className="px-3 py-2.5 text-right text-xs font-mono text-text-muted">—</td>
                                  <td className="px-3 py-2.5 text-right text-xs font-mono text-text-muted">—</td>
                                  <td className="px-3 py-2.5 text-right text-xs font-mono text-text-muted">—</td>
                                  <td className="px-3 py-2.5 text-right text-xs font-mono text-text-muted">—</td>
                                  <td className="px-3 py-2.5 text-right text-xs font-mono text-text-muted">—</td>
                                  <td className="px-3 py-2.5">
                                    {color.totalQty <= 50 && (
                                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${colorStatus.className}`}>{colorStatus.label}</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </React.Fragment>
                        );
                      })}
                      {pagedStyleGroups.length === 0 && (
                        <tr><td colSpan={9} className="py-12 text-center text-text-muted">No styles found</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                <div className="px-5 py-3 border-t border-border-primary bg-surface-secondary flex items-center justify-between text-xs">
                  <span className="text-text-muted">Showing {pagedStyleGroups.length} of {styleGroups.length} styles</span>
                  <div className="flex items-center gap-1.5">
                    <button disabled={ohPage === 0} onClick={() => setOHPage(p => p - 1)}
                      className="px-2.5 py-1 rounded border border-border-primary bg-surface-primary text-text-primary text-xs disabled:opacity-30 hover:bg-surface-secondary transition-colors">← Prev</button>
                    <span className="text-text-muted px-2">Page {ohPage + 1} of {Math.max(1, styleGroupPages)}</span>
                    <button disabled={ohPage >= styleGroupPages - 1} onClick={() => setOHPage(p => p + 1)}
                      className="px-2.5 py-1 rounded border border-border-primary bg-surface-primary text-text-primary text-xs disabled:opacity-30 hover:bg-surface-secondary transition-colors">Next →</button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ═══ MOVEMENTS SUMMARY TAB ════════════════════════════════════ */}
      {activeTab === 'summary' && (
        <div className="space-y-5">
          {data.length === 0 ? (
            <div className="text-center py-16">
              <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-30 text-text-muted" />
              <p className="text-lg font-semibold text-text-muted">No movement data</p>
              <p className="text-sm mt-1 text-text-muted">Upload FG Inventory Movement data to see metrics.</p>
            </div>
          ) : (
            <>
              {/* KPI cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard label="Total Movements" value={formatNumber(summaryStats.totalMovements)} icon={<ClipboardList className="w-5 h-5 text-cyan-400" />} />
                <KPICard label="Total Units In" value={formatNumber(summaryStats.totalIn)} icon={<TrendingUp className="w-5 h-5 text-emerald-400" />} accent="emerald" />
                <KPICard label="Total Units Out" value={formatNumber(summaryStats.totalOut)} icon={<TrendingDown className="w-5 h-5 text-rose-400" />} accent="rose" />
                <KPICard label="Net Change" value={`${summaryStats.netChange >= 0 ? '+' : ''}${formatNumber(summaryStats.netChange)}`}
                  icon={<Package className="w-5 h-5 text-cyan-400" />} accent={summaryStats.netChange >= 0 ? 'emerald' : 'rose'} />
              </div>

              {/* Movement date range info */}
              {movementVelocity.dateRange && (
                <div className="bg-surface-primary rounded-xl border border-border-primary p-4 flex items-center gap-3">
                  <Clock className="w-4 h-4 text-text-muted" />
                  <span className="text-sm text-text-secondary">Movement data spans <span className="font-mono font-medium text-text-primary">{movementVelocity.daySpan} days</span> ({movementVelocity.dateRange})</span>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Movement by Type */}
                <div className="bg-surface-primary rounded-xl border border-border-primary p-5">
                  <h3 className="text-text-primary font-semibold mb-4">Movement by Type</h3>
                  <div className="space-y-3">
                    {byTypeBreakdown.map(t => (
                      <div key={t.type} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <span className={`inline-block w-2 h-2 rounded-full ${movementTypeColor(t.type)}`} />
                            <span className="text-text-primary font-medium">{t.type}</span>
                            <span className="text-text-muted text-xs">{getMovementTypeLabel(t.type)}</span>
                            <span className="text-text-muted text-xs">({formatNumber(t.count)})</span>
                          </div>
                          <span className={`font-mono text-sm ${t.totalQty >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {t.totalQty >= 0 ? '+' : ''}{formatNumber(t.totalQty)}
                          </span>
                        </div>
                        <div className="w-full bg-surface-secondary rounded-full h-2">
                          <div className={`h-2 rounded-full ${movementTypeColor(t.type)} transition-all`} style={{ width: `${(t.absQty / maxTypeAbsQty) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Top 10 Styles by Movement Volume */}
                <div className="bg-surface-primary rounded-xl border border-border-primary p-5">
                  <h3 className="text-text-primary font-semibold mb-4">Top 10 Styles by Movement Volume</h3>
                  <div className="space-y-3">
                    {topStyles.map((s, idx) => (
                      <div key={s.styleNumber} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <span className="text-text-muted w-5 text-right font-mono text-xs">{idx + 1}</span>
                            <button onClick={() => onStyleClick(s.styleNumber)} className="text-text-primary hover:text-cyan-400 transition-colors">{s.styleNumber}</button>
                            <span className="text-text-muted truncate max-w-[120px]">{s.styleDesc}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-sm text-text-secondary">{formatNumber(s.absQty)} units</span>
                            <span className={`font-mono text-xs ${s.netQty >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{s.netQty >= 0 ? '+' : ''}{formatNumber(s.netQty)}</span>
                          </div>
                        </div>
                        <div className="w-full bg-surface-secondary rounded-full h-1.5 ml-7">
                          <div className="h-1.5 rounded-full bg-cyan-500 transition-all" style={{ width: `${(s.absQty / maxStyleAbsQty) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                    {topStyles.length === 0 && <p className="text-text-muted text-sm text-center py-6">No movement data</p>}
                  </div>
                </div>

                {/* Movement by Warehouse */}
                <div className="bg-surface-primary rounded-xl border border-border-primary p-5">
                  <h3 className="text-text-primary font-semibold mb-4">Movement by Warehouse</h3>
                  <div className="space-y-2">
                    {byWarehouseSummary.map(w => (
                      <div key={w.warehouse} className="flex items-center justify-between p-3 rounded-lg bg-surface-secondary">
                        <div>
                          <p className="text-text-primary text-sm font-medium">{w.warehouse}</p>
                          <p className="text-text-muted text-xs">{formatNumber(w.count)} movements</p>
                        </div>
                        <div className="flex items-center gap-4 text-sm font-mono">
                          <span className="text-emerald-400">+{formatNumber(w.totalIn)}</span>
                          <span className="text-rose-400">-{formatNumber(w.totalOut)}</span>
                          <span className={w.net >= 0 ? 'text-text-primary' : 'text-amber-400'}>Net: {w.net >= 0 ? '+' : ''}{formatNumber(w.net)}</span>
                        </div>
                      </div>
                    ))}
                    {byWarehouseSummary.length === 0 && <p className="text-text-muted text-sm text-center py-6">No warehouse data</p>}
                  </div>
                </div>

                {/* Movement by Period */}
                <div className="bg-surface-primary rounded-xl border border-border-primary p-5">
                  <h3 className="text-text-primary font-semibold mb-4">Movement by Period</h3>
                  <div className="space-y-2">
                    {byPeriodSummary.map(p => (
                      <div key={p.period} className="flex items-center justify-between p-3 rounded-lg bg-surface-secondary">
                        <div>
                          <p className="text-text-primary text-sm font-medium font-mono">{p.period}</p>
                          <p className="text-text-muted text-xs">{formatNumber(p.count)} movements</p>
                        </div>
                        <div className="flex items-center gap-4 text-sm font-mono">
                          <span className="text-emerald-400">+{formatNumber(p.totalIn)}</span>
                          <span className="text-rose-400">-{formatNumber(p.totalOut)}</span>
                          <span className={p.net >= 0 ? 'text-text-primary' : 'text-amber-400'}>Net: {p.net >= 0 ? '+' : ''}{formatNumber(p.net)}</span>
                        </div>
                      </div>
                    ))}
                    {byPeriodSummary.length === 0 && <p className="text-text-muted text-sm text-center py-6">No period data</p>}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ═══ BY WAREHOUSE TAB ═════════════════════════════════════════ */}
      {activeTab === 'by-warehouse' && (
        <div className="space-y-5">
          {/* OH Warehouse breakdown (if available) */}
          {ohByWarehouse.length > 1 && (
            <div className="bg-surface-primary rounded-xl border border-border-primary overflow-hidden">
              <div className="p-4 border-b border-border-primary">
                <h3 className="text-text-primary font-semibold">On-Hand by Warehouse</h3>
                <p className="text-xs text-text-muted mt-0.5">Snapshot inventory levels per warehouse location</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border-primary text-text-muted text-xs uppercase tracking-wider">
                      <th className="text-left py-3 px-4">Warehouse</th>
                      <th className="text-right py-3 px-4">Styles</th>
                      <th className="text-right py-3 px-4">On-Hand Units</th>
                      <th className="text-right py-3 px-4">Value (Cost)</th>
                      <th className="text-right py-3 px-4">% of Total</th>
                      <th className="text-left py-3 px-4 w-1/4">Distribution</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ohByWarehouse.map(wh => {
                      const pct = ohTotalUnits > 0 ? (wh.totalQty / ohTotalUnits * 100) : 0;
                      return (
                        <tr key={wh.warehouse} className="border-b border-border-primary hover:bg-surface-secondary/50 transition-colors">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <Warehouse className="w-4 h-4 text-indigo-400" />
                              <div>
                                <span className="text-text-primary font-medium">{getWarehouseName(wh.warehouse)}</span>
                                <span className="text-text-muted text-xs ml-2">WH {wh.warehouse}</span>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-text-secondary">{formatNumber(wh.styles)}</td>
                          <td className="py-3 px-4 text-right font-mono font-semibold text-text-primary">{formatNumber(wh.totalQty)}</td>
                          <td className="py-3 px-4 text-right font-mono text-text-secondary">{formatCurrencyShort(wh.totalValue)}</td>
                          <td className="py-3 px-4 text-right font-mono text-text-secondary">{pct.toFixed(1)}%</td>
                          <td className="py-3 px-4">
                            <div className="w-full bg-surface-secondary rounded-full h-2">
                              <div className="h-2 rounded-full bg-indigo-500 transition-all" style={{ width: `${pct}%` }} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="bg-surface-secondary font-semibold">
                      <td className="py-3 px-4 text-text-primary">Total</td>
                      <td className="py-3 px-4 text-right font-mono text-text-primary">{formatNumber(ohUniqueStyles)}</td>
                      <td className="py-3 px-4 text-right font-mono text-text-primary">{formatNumber(ohTotalUnits)}</td>
                      <td className="py-3 px-4 text-right font-mono text-text-primary">{formatCurrencyShort(ohTotalValue)}</td>
                      <td className="py-3 px-4 text-right font-mono text-text-primary">100%</td>
                      <td className="py-3 px-4" />
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Movement warehouse breakdown */}
          <div className="bg-surface-primary rounded-xl border border-border-primary overflow-hidden">
            <div className="p-4 border-b border-border-primary flex items-center justify-between">
              <div>
                <h3 className="text-text-primary font-semibold">Movement Activity by Warehouse</h3>
                <p className="text-xs text-text-muted mt-0.5">In/out flows from movement report data</p>
              </div>
              {warehouseFilter && (
                <button onClick={() => setWarehouseFilter('')}
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-cyan-500/15 text-cyan-400 hover:bg-cyan-500/25 transition-colors">
                  <X className="w-3 h-3" /> Clear filter
                </button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-primary text-text-muted text-xs uppercase tracking-wider">
                    <th className="text-left py-3 px-4">Warehouse</th>
                    <th className="text-right py-3 px-4">Movements</th>
                    <th className="text-right py-3 px-4">Units In</th>
                    <th className="text-right py-3 px-4">Units Out</th>
                    <th className="text-right py-3 px-4">Net</th>
                    <th className="text-right py-3 px-4">Extension</th>
                  </tr>
                </thead>
                <tbody>
                  {byWarehouseSummary.map(w => (
                    <tr key={w.warehouse} onClick={() => setWarehouseFilter(w.warehouse === warehouseFilter ? '' : w.warehouse)}
                      className={`border-b border-border-primary cursor-pointer transition-colors ${w.warehouse === warehouseFilter ? 'bg-cyan-500/10' : 'hover:bg-surface-secondary/50'}`}>
                      <td className="py-3 px-4"><div className="flex items-center gap-2"><Warehouse className="w-4 h-4 text-text-muted" /><span className="text-text-primary font-medium">{w.warehouse}</span></div></td>
                      <td className="py-3 px-4 text-right font-mono text-text-secondary">{formatNumber(w.count)}</td>
                      <td className="py-3 px-4 text-right font-mono text-emerald-400">+{formatNumber(w.totalIn)}</td>
                      <td className="py-3 px-4 text-right font-mono text-rose-400">-{formatNumber(w.totalOut)}</td>
                      <td className={`py-3 px-4 text-right font-mono ${w.net >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{w.net >= 0 ? '+' : ''}{formatNumber(w.net)}</td>
                      <td className="py-3 px-4 text-right font-mono text-text-secondary">{formatCurrencyShort(w.totalExtension)}</td>
                    </tr>
                  ))}
                  {byWarehouseSummary.length === 0 && (
                    <tr><td colSpan={6} className="py-12 text-center text-text-muted">No warehouse movement data</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {warehouseFilter && (
            <div className="bg-surface-primary rounded-xl border border-border-primary overflow-hidden">
              <div className="p-4 border-b border-border-primary">
                <h3 className="text-text-primary font-semibold">Styles in {warehouseFilter} <span className="ml-2 text-text-muted font-normal text-sm">({formatNumber(warehouseFilteredStyles.length)} styles)</span></h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border-primary text-text-muted text-xs uppercase tracking-wider">
                      <th className="text-left py-3 px-4">Style</th>
                      <th className="text-left py-3 px-4">Description</th>
                      <th className="text-right py-3 px-4">Movements</th>
                      <th className="text-right py-3 px-4">In</th>
                      <th className="text-right py-3 px-4">Out</th>
                      <th className="text-right py-3 px-4">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {warehouseFilteredStyles.slice(0, 25).map(s => (
                      <tr key={s.styleNumber} className="border-b border-border-primary hover:bg-surface-secondary/50 transition-colors">
                        <td className="py-3 px-4"><button onClick={() => onStyleClick(s.styleNumber)} className="text-text-primary font-mono hover:text-cyan-400 transition-colors">{s.styleNumber}</button></td>
                        <td className="py-3 px-4 text-text-secondary">{s.styleDesc}</td>
                        <td className="py-3 px-4 text-right font-mono text-text-secondary">{formatNumber(s.count)}</td>
                        <td className="py-3 px-4 text-right font-mono text-emerald-400">+{formatNumber(s.totalIn)}</td>
                        <td className="py-3 px-4 text-right font-mono text-rose-400">-{formatNumber(s.totalOut)}</td>
                        <td className={`py-3 px-4 text-right font-mono ${s.net >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{s.net >= 0 ? '+' : ''}{formatNumber(s.net)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ MOVEMENT HISTORY TAB ═════════════════════════════════════ */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="bg-surface-primary rounded-xl border border-border-primary p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input type="text" value={historySearch} onChange={e => { setHistorySearch(e.target.value); setHistoryPage(1); }}
                  placeholder="Search style, color, customer..."
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-surface-secondary border border-border-primary text-text-primary placeholder:text-text-muted text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500" />
              </div>
              <select value={historyWarehouse} onChange={e => { setHistoryWarehouse(e.target.value); setHistoryPage(1); }}
                className="px-3 py-2 rounded-lg bg-surface-secondary border border-border-primary text-text-primary text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500">
                <option value="">All Warehouses</option>
                {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
              <select value={historyType} onChange={e => { setHistoryType(e.target.value); setHistoryPage(1); }}
                className="px-3 py-2 rounded-lg bg-surface-secondary border border-border-primary text-text-primary text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500">
                <option value="">All Types</option>
                {movementTypes.map(t => <option key={t} value={t}>{t} - {getMovementTypeLabel(t)}</option>)}
              </select>
              <select value={historyPeriod} onChange={e => { setHistoryPeriod(e.target.value); setHistoryPage(1); }}
                className="px-3 py-2 rounded-lg bg-surface-secondary border border-border-primary text-text-primary text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500">
                <option value="">All Periods</option>
                {periods.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <select value={historyStyle} onChange={e => { setHistoryStyle(e.target.value); setHistoryPage(1); }}
                className="px-3 py-2 rounded-lg bg-surface-secondary border border-border-primary text-text-primary text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500">
                <option value="">All Styles</option>
                {styles.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              {hasHistoryFilters && (
                <button onClick={clearHistoryFilters} className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 transition-colors">
                  <X className="w-3 h-3" /> Clear
                </button>
              )}
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-text-muted">
              <span>{formatNumber(historyFiltered.length)} movements</span>
              <span>Page {historyPage} of {historyTotalPages}</span>
            </div>
          </div>

          {/* Table */}
          <div className="bg-surface-primary rounded-xl border border-border-primary overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-primary text-text-muted text-xs uppercase tracking-wider">
                    {([
                      { field: 'movementDate' as HistorySortField, label: 'Date', align: 'left' },
                      { field: 'styleNumber' as HistorySortField, label: 'Style', align: 'left' },
                      { field: 'color' as HistorySortField, label: 'Color', align: 'left' },
                      { field: 'warehouse' as HistorySortField, label: 'Warehouse', align: 'left' },
                      { field: 'movementType' as HistorySortField, label: 'Type', align: 'left' },
                      { field: 'qty' as HistorySortField, label: 'Qty', align: 'right' },
                      { field: 'balance' as HistorySortField, label: 'Balance', align: 'right' },
                      { field: 'customerVendor' as HistorySortField, label: 'Customer/Vendor', align: 'left' },
                    ] as const).map(col => (
                      <th key={col.field} onClick={() => toggleHistorySort(col.field)}
                        className={`py-3 px-4 cursor-pointer hover:text-text-primary transition-colors ${col.align === 'right' ? 'text-right' : 'text-left'}`}>
                        <span className="inline-flex items-center">{col.label}<SortIcon field={col.field} currentField={historySortField} currentDir={historySortDir} /></span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {historyPaged.map(r => (
                    <tr key={r.id} className="border-b border-border-primary hover:bg-surface-secondary/50 transition-colors">
                      <td className="py-3 px-4 font-mono text-text-secondary text-xs whitespace-nowrap">{r.movementDate || '--'}</td>
                      <td className="py-3 px-4">
                        <button onClick={() => onStyleClick(r.styleNumber)} className="font-mono text-text-primary hover:text-cyan-400 transition-colors">{r.styleNumber}</button>
                        {r.styleDesc && <p className="text-text-muted text-xs truncate max-w-[140px]">{r.styleDesc}</p>}
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-text-primary">{r.color || '--'}</span>
                        {r.colorDesc && <p className="text-text-muted text-xs truncate max-w-[100px]">{r.colorDesc}</p>}
                      </td>
                      <td className="py-3 px-4 text-text-secondary text-xs max-w-[160px] truncate">{r.warehouse || '--'}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${movementTypeBadge(r.movementType || '')}`}>{r.movementType || '--'}</span>
                      </td>
                      <td className={`py-3 px-4 text-right font-mono font-medium ${r.qty >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{r.qty >= 0 ? '+' : ''}{formatNumber(r.qty)}</td>
                      <td className="py-3 px-4 text-right font-mono text-text-secondary">{formatNumber(r.balance)}</td>
                      <td className="py-3 px-4 text-text-secondary text-xs truncate max-w-[140px]">{r.customerVendor || '--'}</td>
                    </tr>
                  ))}
                  {historyPaged.length === 0 && (
                    <tr><td colSpan={8} className="py-12 text-center text-text-muted">No movements found matching your filters</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {historyTotalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button onClick={() => setHistoryPage(p => Math.max(1, p - 1))} disabled={historyPage === 1}
                className="p-2 rounded-lg bg-surface-primary border border-border-primary text-text-secondary hover:bg-surface-secondary disabled:opacity-30 transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-1">
                {generatePageNumbers(historyPage, historyTotalPages).map((p, i) =>
                  p === '...' ? (
                    <span key={`ellipsis-${i}`} className="px-2 text-text-muted text-sm">...</span>
                  ) : (
                    <button key={p} onClick={() => setHistoryPage(p as number)}
                      className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${historyPage === p ? 'bg-cyan-600 text-white' : 'bg-surface-primary border border-border-primary text-text-secondary hover:bg-surface-secondary'}`}>
                      {p}
                    </button>
                  )
                )}
              </div>
              <button onClick={() => setHistoryPage(p => Math.min(historyTotalPages, p + 1))} disabled={historyPage === historyTotalPages}
                className="p-2 rounded-lg bg-surface-primary border border-border-primary text-text-secondary hover:bg-surface-secondary disabled:opacity-30 transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────

function KPICard({ label, value, icon, accent }: {
  label: string; value: string; icon: React.ReactNode; accent?: 'emerald' | 'rose' | 'amber' | 'indigo';
}) {
  return (
    <div className="bg-surface-primary rounded-xl border border-border-primary p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-text-muted text-sm">{label}</span>
        {icon}
      </div>
      <p className="text-2xl font-semibold font-mono text-text-primary">{value}</p>
    </div>
  );
}

// ─── Pagination helpers ─────────────────────────────────────────────

function generatePageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | '...')[] = [];
  if (current <= 4) {
    for (let i = 1; i <= 5; i++) pages.push(i);
    pages.push('...'); pages.push(total);
  } else if (current >= total - 3) {
    pages.push(1); pages.push('...');
    for (let i = total - 4; i <= total; i++) pages.push(i);
  } else {
    pages.push(1); pages.push('...');
    for (let i = current - 1; i <= current + 1; i++) pages.push(i);
    pages.push('...'); pages.push(total);
  }
  return pages;
}
