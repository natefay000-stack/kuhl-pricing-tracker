'use client';

import { useState, useMemo, useCallback } from 'react';
import { Product, SalesRecord, InventoryRecord } from '@/types/product';
import { formatNumber, formatCurrencyShort, formatCurrency } from '@/utils/format';
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
  Layers,
  Filter,
} from 'lucide-react';

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
  selectedSeason: string;
  selectedDivision: string;
  selectedCategory: string;
  onStyleClick: (styleNumber: string) => void;
}

type TabId = 'summary' | 'by-warehouse' | 'by-type' | 'history' | 'balance';

type HistorySortField =
  | 'movementDate'
  | 'styleNumber'
  | 'color'
  | 'warehouse'
  | 'movementType'
  | 'qty'
  | 'balance'
  | 'customerVendor';

type BalanceSortField = 'styleNumber' | 'color' | 'balance' | 'totalIn' | 'totalOut';

// ─── Mock Data Generator ────────────────────────────────────────────

const MOCK_STYLES = [
  { style: '5016', name: 'Rydr Pant', colors: ['BADK', 'GMTL', 'KAKI', 'BKOT'], colorDescs: ['Bark Dark', 'Gunmetal', 'Khaki', 'Blackout'], category: 'PANTS', division: "Men's" },
  { style: 'DKK', name: 'Deceptr Pant', colors: ['BADK', 'PITN', 'INKY', 'KAKI'], colorDescs: ['Bark Dark', 'Piton', 'Inkwell', 'Khaki'], category: 'PANTS', division: "Men's" },
  { style: 'DKM', name: 'Resistor Pant', colors: ['BADK', 'GMTL', 'PITN'], colorDescs: ['Bark Dark', 'Gunmetal', 'Piton'], category: 'PANTS', division: "Men's" },
  { style: 'BKBL', name: 'Radikl Pant', colors: ['KBLU', 'BADK', 'BKOT'], colorDescs: ['Klassik Blue', 'Bark Dark', 'Blackout'], category: 'PANTS', division: "Men's" },
  { style: '8218', name: 'Klash Pant', colors: ['MDNT', 'SAGE'], colorDescs: ['Midnight', 'Desert Sage'], category: 'PANTS', division: "Women's" },
  { style: '3024', name: 'Freeflex Roll-Up', colors: ['KAKI', 'INKY'], colorDescs: ['Khaki', 'Inkwell'], category: 'PANTS', division: "Women's" },
  { style: 'JK01', name: 'Interceptr Jacket', colors: ['BLKV', 'SAGE'], colorDescs: ['Blackhawk', 'Desert Sage'], category: 'JACKET', division: "Men's" },
  { style: 'SH15', name: 'Dillingr Flannel', colors: ['RDPL', 'BLPL', 'GRPL'], colorDescs: ['Red Plaid', 'Blue Plaid', 'Green Plaid'], category: 'FLANNEL', division: "Men's" },
];

const MOCK_WAREHOUSES = ['01 - KUHL Clothing DC', '02 - KUHL West', '03 - KUHL East'];
const MOCK_MOVEMENT_TYPES = ['Receipt', 'Shipment', 'Adjustment', 'Transfer In', 'Transfer Out', 'Return'];
const MOCK_PERIODS = ['2025-01', '2025-02', '2025-03', '2025-04', '2025-05', '2025-06'];
const MOCK_CUSTOMERS = ['REI', 'Backcountry', 'Moosejaw', 'Scheels', 'KUHL.com', 'Sun & Ski', 'Mountain Chalet'];

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

function generateMockMovements(): InventoryRecord[] {
  const records: InventoryRecord[] = [];
  const rand = seededRandom(42);
  let id = 0;

  for (const style of MOCK_STYLES) {
    for (let ci = 0; ci < style.colors.length; ci++) {
      const color = style.colors[ci];
      const colorDesc = style.colorDescs[ci];

      // Generate 8-20 movements per style/color
      const movementCount = Math.floor(rand() * 13) + 8;
      let runningBalance = 0;

      for (let m = 0; m < movementCount; m++) {
        const typeIdx = Math.floor(rand() * MOCK_MOVEMENT_TYPES.length);
        const movementType = MOCK_MOVEMENT_TYPES[typeIdx];
        const warehouse = MOCK_WAREHOUSES[Math.floor(rand() * MOCK_WAREHOUSES.length)];
        const period = MOCK_PERIODS[Math.floor(rand() * MOCK_PERIODS.length)];

        // Determine qty based on movement type
        let qty: number;
        if (movementType === 'Receipt' || movementType === 'Transfer In' || movementType === 'Return') {
          qty = Math.floor(rand() * 500) + 10;
        } else if (movementType === 'Shipment' || movementType === 'Transfer Out') {
          qty = -(Math.floor(rand() * 300) + 5);
        } else {
          // Adjustment: can be positive or negative
          qty = Math.floor(rand() * 200) - 100;
        }

        runningBalance += qty;
        if (runningBalance < 0) runningBalance = Math.floor(rand() * 50);

        const costPrice = Math.floor(rand() * 40) + 20;
        const wholesalePrice = costPrice * 2;
        const msrp = wholesalePrice * 2;

        // Generate a realistic date within the period range
        const periodMonth = parseInt(period.split('-')[1]);
        const day = Math.floor(rand() * 28) + 1;
        const movementDate = `2025-${String(periodMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        const customer = movementType === 'Shipment'
          ? MOCK_CUSTOMERS[Math.floor(rand() * MOCK_CUSTOMERS.length)]
          : movementType === 'Receipt'
            ? 'Factory Direct'
            : undefined;

        records.push({
          id: `mock-mv-${id++}`,
          styleNumber: style.style,
          styleDesc: style.name,
          color,
          colorDesc,
          styleCategory: style.category,
          styleCatDesc: style.category,
          warehouse,
          movementType,
          movementDate,
          customerVendor: customer,
          costPrice,
          wholesalePrice,
          msrp,
          division: style.division,
          divisionDesc: style.division,
          period,
          qty,
          balance: runningBalance,
          extension: Math.abs(qty) * costPrice,
          reasonCode: movementType === 'Adjustment' ? 'ADJ' : undefined,
          reasonDesc: movementType === 'Adjustment' ? 'Inventory Count' : undefined,
        });
      }
    }
  }

  return records;
}

// ─── Utility Functions ──────────────────────────────────────────────

function getBalanceStatus(balance: number): 'healthy' | 'low' | 'zero' | 'negative' {
  if (balance < 0) return 'negative';
  if (balance === 0) return 'zero';
  if (balance < 50) return 'low';
  return 'healthy';
}

function balanceBadgeClass(status: string): string {
  switch (status) {
    case 'healthy': return 'bg-emerald-500/15 text-emerald-400';
    case 'low': return 'bg-amber-500/15 text-amber-400';
    case 'zero': return 'bg-red-500/15 text-red-400';
    case 'negative': return 'bg-purple-500/15 text-purple-400';
    default: return '';
  }
}

function balanceBadgeLabel(status: string): string {
  switch (status) {
    case 'healthy': return 'Healthy';
    case 'low': return 'Low';
    case 'zero': return 'Zero';
    case 'negative': return 'Negative';
    default: return '';
  }
}

// Movement type color mapping for bars & badges
function movementTypeColor(type: string): string {
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

// ─── Component ──────────────────────────────────────────────────────

const TABS: { id: TabId; label: string; icon: typeof Package }[] = [
  { id: 'summary', label: 'Summary', icon: BarChart3 },
  { id: 'by-warehouse', label: 'By Warehouse', icon: Warehouse },
  { id: 'by-type', label: 'By Movement Type', icon: Layers },
  { id: 'history', label: 'Movement History', icon: ClipboardList },
  { id: 'balance', label: 'Current Balance', icon: Package },
];

export default function InventoryView({
  products,
  sales,
  inventory,
  inventoryAggregations,
  selectedSeason,
  selectedDivision,
  selectedCategory,
  onStyleClick,
}: InventoryViewProps) {
  const [activeTab, setActiveTab] = useState<TabId>('summary');

  // History tab state
  const [historySearch, setHistorySearch] = useState('');
  const [historyWarehouse, setHistoryWarehouse] = useState('');
  const [historyType, setHistoryType] = useState('');
  const [historyPeriod, setHistoryPeriod] = useState('');
  const [historyStyle, setHistoryStyle] = useState('');
  const [historySortField, setHistorySortField] = useState<HistorySortField>('movementDate');
  const [historySortDir, setHistorySortDir] = useState<'asc' | 'desc'>('desc');
  const [historyPage, setHistoryPage] = useState(1);
  const historyPageSize = 50;

  // Warehouse tab state
  const [warehouseFilter, setWarehouseFilter] = useState('');

  // Movement type tab state
  const [expandedType, setExpandedType] = useState<string | null>(null);

  // Balance tab state
  const [balanceSortField, setBalanceSortField] = useState<BalanceSortField>('balance');
  const [balanceSortDir, setBalanceSortDir] = useState<'asc' | 'desc'>('desc');
  const [balanceSearch, setBalanceSearch] = useState('');

  // ── Resolve data (real or mock) ─────────────────────────────────
  const data = useMemo<InventoryRecord[]>(() => {
    if (inventory.length > 0) return inventory;
    return generateMockMovements();
  }, [inventory]);

  // ── Unique filter options ───────────────────────────────────────
  const warehouses = useMemo(() => {
    const s = new Set<string>();
    data.forEach((r) => r.warehouse && s.add(r.warehouse));
    return Array.from(s).sort();
  }, [data]);

  const movementTypes = useMemo(() => {
    const s = new Set<string>();
    data.forEach((r) => r.movementType && s.add(r.movementType));
    return Array.from(s).sort();
  }, [data]);

  const periods = useMemo(() => {
    const s = new Set<string>();
    data.forEach((r) => r.period && s.add(r.period));
    return Array.from(s).sort();
  }, [data]);

  const styles = useMemo(() => {
    const s = new Set<string>();
    data.forEach((r) => r.styleNumber && s.add(r.styleNumber));
    return Array.from(s).sort();
  }, [data]);

  // ── Summary computations (from server-side aggregations when available) ───
  const agg = inventoryAggregations;

  const summaryStats = useMemo(() => {
    if (agg) {
      let totalIn = 0;
      let totalOut = 0;
      agg.byType.forEach((t) => {
        if (t.totalQty > 0) totalIn += t.totalQty;
        else totalOut += Math.abs(t.totalQty);
      });
      return { totalMovements: agg.totalCount, totalIn, totalOut, netChange: totalIn - totalOut };
    }
    // Fallback: compute from local data (mock or small datasets)
    let totalIn = 0, totalOut = 0;
    data.forEach((r) => { if (r.qty > 0) totalIn += r.qty; else totalOut += Math.abs(r.qty); });
    return { totalMovements: data.length, totalIn, totalOut, netChange: totalIn - totalOut };
  }, [agg, data]);

  // Movement by type breakdown
  const byTypeBreakdown = useMemo(() => {
    if (agg) {
      return agg.byType.map((t) => ({
        type: t.movementType,
        totalQty: t.totalQty,
        absQty: Math.abs(t.totalQty),
        count: t.count,
      })).sort((a, b) => b.absQty - a.absQty);
    }
    const map = new Map<string, { type: string; totalQty: number; absQty: number; count: number }>();
    data.forEach((r) => {
      const type = r.movementType || 'Unknown';
      const existing = map.get(type);
      if (existing) { existing.totalQty += r.qty; existing.absQty += Math.abs(r.qty); existing.count += 1; }
      else { map.set(type, { type, totalQty: r.qty, absQty: Math.abs(r.qty), count: 1 }); }
    });
    return Array.from(map.values()).sort((a, b) => b.absQty - a.absQty);
  }, [agg, data]);

  const maxTypeAbsQty = useMemo(() => Math.max(...byTypeBreakdown.map((t) => t.absQty), 1), [byTypeBreakdown]);

  // Top 10 styles by movement volume (from local data — limited set)
  const topStyles = useMemo(() => {
    const map = new Map<string, { styleNumber: string; styleDesc: string; absQty: number; count: number; netQty: number }>();
    data.forEach((r) => {
      const key = r.styleNumber;
      const existing = map.get(key);
      if (existing) { existing.absQty += Math.abs(r.qty); existing.count += 1; existing.netQty += r.qty; }
      else { map.set(key, { styleNumber: r.styleNumber, styleDesc: r.styleDesc || '', absQty: Math.abs(r.qty), count: 1, netQty: r.qty }); }
    });
    return Array.from(map.values()).sort((a, b) => b.absQty - a.absQty).slice(0, 10);
  }, [data]);

  const maxStyleAbsQty = useMemo(() => Math.max(...topStyles.map((s) => s.absQty), 1), [topStyles]);

  // Movement by warehouse
  const byWarehouseSummary = useMemo(() => {
    if (agg) {
      return agg.byWarehouse.map((w) => ({
        warehouse: w.warehouse,
        totalIn: w.totalQty > 0 ? w.totalQty : 0,
        totalOut: w.totalQty < 0 ? Math.abs(w.totalQty) : 0,
        net: w.totalQty,
        count: w.count,
        totalExtension: w.totalExtension,
      })).sort((a, b) => b.count - a.count);
    }
    const map = new Map<string, { warehouse: string; totalIn: number; totalOut: number; net: number; count: number; totalExtension: number }>();
    data.forEach((r) => {
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
      return agg.byPeriod.map((p) => ({
        period: p.period,
        totalIn: p.totalQty > 0 ? p.totalQty : 0,
        totalOut: p.totalQty < 0 ? Math.abs(p.totalQty) : 0,
        net: p.totalQty,
        count: p.count,
      })).sort((a, b) => a.period.localeCompare(b.period));
    }
    const map = new Map<string, { period: string; totalIn: number; totalOut: number; net: number; count: number }>();
    data.forEach((r) => {
      const period = r.period || 'Unknown';
      const existing = map.get(period);
      const inQty = r.qty > 0 ? r.qty : 0;
      const outQty = r.qty < 0 ? Math.abs(r.qty) : 0;
      if (existing) { existing.totalIn += inQty; existing.totalOut += outQty; existing.net += r.qty; existing.count += 1; }
      else { map.set(period, { period, totalIn: inQty, totalOut: outQty, net: r.qty, count: 1 }); }
    });
    return Array.from(map.values()).sort((a, b) => a.period.localeCompare(b.period));
  }, [agg, data]);

  // ── By Warehouse tab ────────────────────────────────────────────
  const warehouseFilteredData = useMemo(() => {
    if (!warehouseFilter) return data;
    return data.filter((r) => r.warehouse === warehouseFilter);
  }, [data, warehouseFilter]);

  const warehouseFilteredStyles = useMemo(() => {
    const map = new Map<string, { styleNumber: string; styleDesc: string; totalIn: number; totalOut: number; net: number; count: number }>();
    warehouseFilteredData.forEach((r) => {
      const key = r.styleNumber;
      const existing = map.get(key);
      const inQty = r.qty > 0 ? r.qty : 0;
      const outQty = r.qty < 0 ? Math.abs(r.qty) : 0;
      if (existing) {
        existing.totalIn += inQty;
        existing.totalOut += outQty;
        existing.net += r.qty;
        existing.count += 1;
      } else {
        map.set(key, { styleNumber: r.styleNumber, styleDesc: r.styleDesc || '', totalIn: inQty, totalOut: outQty, net: r.qty, count: 1 });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [warehouseFilteredData]);

  // ── By Movement Type tab ────────────────────────────────────────
  const byTypeDetailed = useMemo(() => {
    const map = new Map<string, {
      type: string;
      totalQty: number;
      absQty: number;
      count: number;
      avgQty: number;
      topStyles: { styleNumber: string; styleDesc: string; absQty: number }[];
    }>();

    // First pass: group by type
    const typeStyles = new Map<string, Map<string, { styleNumber: string; styleDesc: string; absQty: number }>>();

    data.forEach((r) => {
      const type = r.movementType || 'Unknown';
      const existing = map.get(type);
      if (existing) {
        existing.totalQty += r.qty;
        existing.absQty += Math.abs(r.qty);
        existing.count += 1;
      } else {
        map.set(type, { type, totalQty: r.qty, absQty: Math.abs(r.qty), count: 1, avgQty: 0, topStyles: [] });
        typeStyles.set(type, new Map());
      }

      // Track style breakdown per type
      const styleMap = typeStyles.get(type)!;
      const sKey = r.styleNumber;
      const se = styleMap.get(sKey);
      if (se) {
        se.absQty += Math.abs(r.qty);
      } else {
        styleMap.set(sKey, { styleNumber: r.styleNumber, styleDesc: r.styleDesc || '', absQty: Math.abs(r.qty) });
      }
    });

    // Compute avg and top styles
    map.forEach((v, key) => {
      v.avgQty = v.count > 0 ? v.absQty / v.count : 0;
      const sm = typeStyles.get(key);
      if (sm) {
        v.topStyles = Array.from(sm.values()).sort((a, b) => b.absQty - a.absQty).slice(0, 5);
      }
    });

    return Array.from(map.values()).sort((a, b) => b.absQty - a.absQty);
  }, [data]);

  // ── History tab ─────────────────────────────────────────────────
  const historyFiltered = useMemo(() => {
    let result = data;

    if (historyWarehouse) result = result.filter((r) => r.warehouse === historyWarehouse);
    if (historyType) result = result.filter((r) => r.movementType === historyType);
    if (historyPeriod) result = result.filter((r) => r.period === historyPeriod);
    if (historyStyle) result = result.filter((r) => r.styleNumber === historyStyle);
    if (historySearch) {
      const q = historySearch.toLowerCase();
      result = result.filter(
        (r) =>
          r.styleNumber?.toLowerCase().includes(q) ||
          r.styleDesc?.toLowerCase().includes(q) ||
          r.colorDesc?.toLowerCase().includes(q) ||
          r.customerVendor?.toLowerCase().includes(q) ||
          r.reference?.toLowerCase().includes(q)
      );
    }

    return result;
  }, [data, historyWarehouse, historyType, historyPeriod, historyStyle, historySearch]);

  const historySorted = useMemo(() => {
    const sorted = [...historyFiltered];
    const dir = historySortDir === 'asc' ? 1 : -1;
    sorted.sort((a, b) => {
      switch (historySortField) {
        case 'movementDate':
          return dir * ((a.movementDate || '').localeCompare(b.movementDate || ''));
        case 'styleNumber':
          return dir * a.styleNumber.localeCompare(b.styleNumber);
        case 'color':
          return dir * ((a.color || '').localeCompare(b.color || ''));
        case 'warehouse':
          return dir * ((a.warehouse || '').localeCompare(b.warehouse || ''));
        case 'movementType':
          return dir * ((a.movementType || '').localeCompare(b.movementType || ''));
        case 'qty':
          return dir * (a.qty - b.qty);
        case 'balance':
          return dir * (a.balance - b.balance);
        case 'customerVendor':
          return dir * ((a.customerVendor || '').localeCompare(b.customerVendor || ''));
        default:
          return 0;
      }
    });
    return sorted;
  }, [historyFiltered, historySortField, historySortDir]);

  const historyTotalPages = Math.max(1, Math.ceil(historySorted.length / historyPageSize));
  const historyPaged = useMemo(() => {
    const start = (historyPage - 1) * historyPageSize;
    return historySorted.slice(start, start + historyPageSize);
  }, [historySorted, historyPage]);

  const toggleHistorySort = useCallback(
    (field: HistorySortField) => {
      if (historySortField === field) {
        setHistorySortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setHistorySortField(field);
        setHistorySortDir(field === 'movementDate' ? 'desc' : 'asc');
      }
      setHistoryPage(1);
    },
    [historySortField]
  );

  const clearHistoryFilters = useCallback(() => {
    setHistorySearch('');
    setHistoryWarehouse('');
    setHistoryType('');
    setHistoryPeriod('');
    setHistoryStyle('');
    setHistoryPage(1);
  }, []);

  const hasHistoryFilters = historySearch || historyWarehouse || historyType || historyPeriod || historyStyle;

  // ── Current Balance tab ─────────────────────────────────────────
  const currentBalances = useMemo(() => {
    // Find the latest movement per style+color and take its balance
    const latest = new Map<string, {
      styleNumber: string;
      styleDesc: string;
      color: string;
      colorDesc: string;
      balance: number;
      movementDate: string;
      totalIn: number;
      totalOut: number;
      movementCount: number;
    }>();

    // First pass: collect all movements per style+color
    const allByKey = new Map<string, InventoryRecord[]>();
    data.forEach((r) => {
      const key = `${r.styleNumber}|${r.color || ''}`;
      const arr = allByKey.get(key);
      if (arr) arr.push(r);
      else allByKey.set(key, [r]);
    });

    // Second pass: compute balance from latest record + totals
    allByKey.forEach((records, key) => {
      // Sort by date descending to find the latest
      const sorted = [...records].sort((a, b) => (b.movementDate || '').localeCompare(a.movementDate || ''));
      const latestRecord = sorted[0];

      let totalIn = 0;
      let totalOut = 0;
      records.forEach((r) => {
        if (r.qty > 0) totalIn += r.qty;
        else totalOut += Math.abs(r.qty);
      });

      latest.set(key, {
        styleNumber: latestRecord.styleNumber,
        styleDesc: latestRecord.styleDesc || '',
        color: latestRecord.color || '',
        colorDesc: latestRecord.colorDesc || '',
        balance: latestRecord.balance,
        movementDate: latestRecord.movementDate || '',
        totalIn,
        totalOut,
        movementCount: records.length,
      });
    });

    let result = Array.from(latest.values());

    // Apply search filter
    if (balanceSearch) {
      const q = balanceSearch.toLowerCase();
      result = result.filter(
        (r) =>
          r.styleNumber.toLowerCase().includes(q) ||
          r.styleDesc.toLowerCase().includes(q) ||
          r.colorDesc.toLowerCase().includes(q)
      );
    }

    // Sort
    const dir = balanceSortDir === 'asc' ? 1 : -1;
    result.sort((a, b) => {
      switch (balanceSortField) {
        case 'styleNumber':
          return dir * a.styleNumber.localeCompare(b.styleNumber);
        case 'color':
          return dir * a.color.localeCompare(b.color);
        case 'balance':
          return dir * (a.balance - b.balance);
        case 'totalIn':
          return dir * (a.totalIn - b.totalIn);
        case 'totalOut':
          return dir * (a.totalOut - b.totalOut);
        default:
          return 0;
      }
    });

    return result;
  }, [data, balanceSearch, balanceSortField, balanceSortDir]);

  const toggleBalanceSort = useCallback(
    (field: BalanceSortField) => {
      if (balanceSortField === field) {
        setBalanceSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setBalanceSortField(field);
        setBalanceSortDir('desc');
      }
    },
    [balanceSortField]
  );

  // ── Render helpers ──────────────────────────────────────────────

  const SortIcon = ({ field, currentField, currentDir }: { field: string; currentField: string; currentDir: 'asc' | 'desc' }) => {
    if (field !== currentField) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-30" />;
    return currentDir === 'asc' ? <ArrowUp className="w-3 h-3 ml-1" /> : <ArrowDown className="w-3 h-3 ml-1" />;
  };

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Tab bar */}
      <div className="flex gap-1 bg-surface-secondary rounded-xl p-1 overflow-x-auto">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors
                ${activeTab === tab.id
                  ? 'bg-surface-tertiary text-text-primary shadow-sm'
                  : 'text-text-secondary hover:text-text-primary hover:bg-hover'
                }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Mock data notice */}
      {inventory.length === 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 text-amber-400 text-sm">
          Showing simulated movement data. Upload FG Inventory Movement data to see real metrics.
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          SUMMARY TAB
          ═══════════════════════════════════════════════════════════════ */}
      {activeTab === 'summary' && (
        <div className="space-y-6">
          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard
              label="Total Movements"
              value={formatNumber(summaryStats.totalMovements)}
              icon={<ClipboardList className="w-5 h-5 text-blue-400" />}
            />
            <KPICard
              label="Total Units In"
              value={formatNumber(summaryStats.totalIn)}
              icon={<TrendingUp className="w-5 h-5 text-emerald-400" />}
              accent="emerald"
            />
            <KPICard
              label="Total Units Out"
              value={formatNumber(summaryStats.totalOut)}
              icon={<TrendingDown className="w-5 h-5 text-rose-400" />}
              accent="rose"
            />
            <KPICard
              label="Net Change"
              value={`${summaryStats.netChange >= 0 ? '+' : ''}${formatNumber(summaryStats.netChange)}`}
              icon={<Package className="w-5 h-5 text-indigo-400" />}
              accent={summaryStats.netChange >= 0 ? 'emerald' : 'rose'}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Movement by Type */}
            <div className="bg-surface-secondary rounded-xl border border-border-primary p-5">
              <h3 className="text-text-primary font-semibold mb-4">Movement by Type</h3>
              <div className="space-y-3">
                {byTypeBreakdown.map((t) => (
                  <div key={t.type} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className={`inline-block w-2 h-2 rounded-full ${movementTypeColor(t.type)}`} />
                        <span className="text-text-primary">{t.type}</span>
                        <span className="text-text-faint">({formatNumber(t.count)})</span>
                      </div>
                      <span className={`font-mono text-sm ${t.totalQty >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {t.totalQty >= 0 ? '+' : ''}{formatNumber(t.totalQty)}
                      </span>
                    </div>
                    <div className="w-full bg-surface-tertiary rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${movementTypeColor(t.type)} transition-all`}
                        style={{ width: `${(t.absQty / maxTypeAbsQty) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top 10 Styles by Movement Volume */}
            <div className="bg-surface-secondary rounded-xl border border-border-primary p-5">
              <h3 className="text-text-primary font-semibold mb-4">Top 10 Styles by Movement Volume</h3>
              <div className="space-y-3">
                {topStyles.map((s, idx) => (
                  <div key={s.styleNumber} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-text-faint w-5 text-right font-mono text-xs">{idx + 1}</span>
                        <button
                          onClick={() => onStyleClick(s.styleNumber)}
                          className="text-text-primary hover:text-blue-400 transition-colors"
                        >
                          {s.styleNumber}
                        </button>
                        <span className="text-text-faint truncate max-w-[120px]">{s.styleDesc}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm text-text-secondary">
                          {formatNumber(s.absQty)} units
                        </span>
                        <span className={`font-mono text-xs ${s.netQty >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {s.netQty >= 0 ? '+' : ''}{formatNumber(s.netQty)}
                        </span>
                      </div>
                    </div>
                    <div className="w-full bg-surface-tertiary rounded-full h-1.5 ml-7">
                      <div
                        className="h-1.5 rounded-full bg-blue-500 transition-all"
                        style={{ width: `${(s.absQty / maxStyleAbsQty) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
                {topStyles.length === 0 && (
                  <p className="text-text-faint text-sm text-center py-6">No movement data</p>
                )}
              </div>
            </div>

            {/* Movement by Warehouse */}
            <div className="bg-surface-secondary rounded-xl border border-border-primary p-5">
              <h3 className="text-text-primary font-semibold mb-4">Movement by Warehouse</h3>
              <div className="space-y-2">
                {byWarehouseSummary.map((w) => (
                  <div
                    key={w.warehouse}
                    className="flex items-center justify-between p-3 rounded-lg bg-surface-tertiary"
                  >
                    <div>
                      <p className="text-text-primary text-sm font-medium">{w.warehouse}</p>
                      <p className="text-text-faint text-xs">{formatNumber(w.count)} movements</p>
                    </div>
                    <div className="flex items-center gap-4 text-sm font-mono">
                      <span className="text-emerald-400">+{formatNumber(w.totalIn)}</span>
                      <span className="text-rose-400">-{formatNumber(w.totalOut)}</span>
                      <span className={w.net >= 0 ? 'text-text-primary' : 'text-amber-400'}>
                        Net: {w.net >= 0 ? '+' : ''}{formatNumber(w.net)}
                      </span>
                    </div>
                  </div>
                ))}
                {byWarehouseSummary.length === 0 && (
                  <p className="text-text-faint text-sm text-center py-6">No warehouse data</p>
                )}
              </div>
            </div>

            {/* Movement by Period */}
            <div className="bg-surface-secondary rounded-xl border border-border-primary p-5">
              <h3 className="text-text-primary font-semibold mb-4">Movement by Period</h3>
              <div className="space-y-2">
                {byPeriodSummary.map((p) => (
                  <div
                    key={p.period}
                    className="flex items-center justify-between p-3 rounded-lg bg-surface-tertiary"
                  >
                    <div>
                      <p className="text-text-primary text-sm font-medium font-mono">{p.period}</p>
                      <p className="text-text-faint text-xs">{formatNumber(p.count)} movements</p>
                    </div>
                    <div className="flex items-center gap-4 text-sm font-mono">
                      <span className="text-emerald-400">+{formatNumber(p.totalIn)}</span>
                      <span className="text-rose-400">-{formatNumber(p.totalOut)}</span>
                      <span className={p.net >= 0 ? 'text-text-primary' : 'text-amber-400'}>
                        Net: {p.net >= 0 ? '+' : ''}{formatNumber(p.net)}
                      </span>
                    </div>
                  </div>
                ))}
                {byPeriodSummary.length === 0 && (
                  <p className="text-text-faint text-sm text-center py-6">No period data</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          BY WAREHOUSE TAB
          ═══════════════════════════════════════════════════════════════ */}
      {activeTab === 'by-warehouse' && (
        <div className="space-y-6">
          {/* Warehouse table */}
          <div className="bg-surface-secondary rounded-xl border border-border-primary overflow-hidden">
            <div className="p-4 border-b border-border-primary flex items-center justify-between">
              <h3 className="text-text-primary font-semibold">Warehouses</h3>
              {warehouseFilter && (
                <button
                  onClick={() => setWarehouseFilter('')}
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 transition-colors"
                >
                  <X className="w-3 h-3" />
                  Clear filter
                </button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-primary text-text-faint text-xs uppercase tracking-wider">
                    <th className="text-left py-3 px-4">Warehouse</th>
                    <th className="text-right py-3 px-4">Movements</th>
                    <th className="text-right py-3 px-4">Units In</th>
                    <th className="text-right py-3 px-4">Units Out</th>
                    <th className="text-right py-3 px-4">Net</th>
                    <th className="text-right py-3 px-4">Extension</th>
                  </tr>
                </thead>
                <tbody>
                  {byWarehouseSummary.map((w) => (
                    <tr
                      key={w.warehouse}
                      onClick={() => setWarehouseFilter(w.warehouse === warehouseFilter ? '' : w.warehouse)}
                      className={`border-b border-border-primary cursor-pointer transition-colors
                        ${w.warehouse === warehouseFilter
                          ? 'bg-blue-500/10'
                          : 'hover:bg-hover'
                        }`}
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <Warehouse className="w-4 h-4 text-text-faint" />
                          <span className="text-text-primary font-medium">{w.warehouse}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-text-secondary">{formatNumber(w.count)}</td>
                      <td className="py-3 px-4 text-right font-mono text-emerald-400">+{formatNumber(w.totalIn)}</td>
                      <td className="py-3 px-4 text-right font-mono text-rose-400">-{formatNumber(w.totalOut)}</td>
                      <td className={`py-3 px-4 text-right font-mono ${w.net >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {w.net >= 0 ? '+' : ''}{formatNumber(w.net)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-text-secondary">{formatCurrencyShort(w.totalExtension)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Filtered style breakdown (when a warehouse is selected) */}
          {warehouseFilter && (
            <div className="bg-surface-secondary rounded-xl border border-border-primary overflow-hidden">
              <div className="p-4 border-b border-border-primary">
                <h3 className="text-text-primary font-semibold">
                  Styles in {warehouseFilter}
                  <span className="ml-2 text-text-faint font-normal text-sm">
                    ({formatNumber(warehouseFilteredStyles.length)} styles)
                  </span>
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border-primary text-text-faint text-xs uppercase tracking-wider">
                      <th className="text-left py-3 px-4">Style</th>
                      <th className="text-left py-3 px-4">Description</th>
                      <th className="text-right py-3 px-4">Movements</th>
                      <th className="text-right py-3 px-4">In</th>
                      <th className="text-right py-3 px-4">Out</th>
                      <th className="text-right py-3 px-4">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {warehouseFilteredStyles.slice(0, 25).map((s) => (
                      <tr key={s.styleNumber} className="border-b border-border-primary hover:bg-hover transition-colors">
                        <td className="py-3 px-4">
                          <button
                            onClick={() => onStyleClick(s.styleNumber)}
                            className="text-text-primary font-mono hover:text-blue-400 transition-colors"
                          >
                            {s.styleNumber}
                          </button>
                        </td>
                        <td className="py-3 px-4 text-text-secondary">{s.styleDesc}</td>
                        <td className="py-3 px-4 text-right font-mono text-text-secondary">{formatNumber(s.count)}</td>
                        <td className="py-3 px-4 text-right font-mono text-emerald-400">+{formatNumber(s.totalIn)}</td>
                        <td className="py-3 px-4 text-right font-mono text-rose-400">-{formatNumber(s.totalOut)}</td>
                        <td className={`py-3 px-4 text-right font-mono ${s.net >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {s.net >= 0 ? '+' : ''}{formatNumber(s.net)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          BY MOVEMENT TYPE TAB
          ═══════════════════════════════════════════════════════════════ */}
      {activeTab === 'by-type' && (
        <div className="space-y-4">
          {byTypeDetailed.map((t) => (
            <div key={t.type} className="bg-surface-secondary rounded-xl border border-border-primary overflow-hidden">
              <button
                onClick={() => setExpandedType(expandedType === t.type ? null : t.type)}
                className="w-full p-4 flex items-center justify-between hover:bg-hover transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ${movementTypeBadge(t.type)}`}>
                    {t.type}
                  </span>
                  <span className="text-text-faint text-sm">{formatNumber(t.count)} movements</span>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className={`font-mono text-sm ${t.totalQty >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {t.totalQty >= 0 ? '+' : ''}{formatNumber(t.totalQty)} total
                    </p>
                    <p className="text-text-faint text-xs font-mono">
                      avg {formatNumber(Math.round(t.avgQty))} per movement
                    </p>
                  </div>
                  {expandedType === t.type ? (
                    <ChevronLeft className="w-4 h-4 text-text-faint rotate-90" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-text-faint -rotate-90" />
                  )}
                </div>
              </button>

              {expandedType === t.type && (
                <div className="border-t border-border-primary">
                  <div className="p-4">
                    <h4 className="text-text-secondary text-xs uppercase tracking-wider mb-3">Top Styles</h4>
                    <div className="space-y-2">
                      {t.topStyles.map((s) => (
                        <div key={s.styleNumber} className="flex items-center justify-between p-2 rounded-lg bg-surface-tertiary">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => onStyleClick(s.styleNumber)}
                              className="font-mono text-sm text-text-primary hover:text-blue-400 transition-colors"
                            >
                              {s.styleNumber}
                            </button>
                            <span className="text-text-faint text-sm">{s.styleDesc}</span>
                          </div>
                          <span className="font-mono text-sm text-text-secondary">
                            {formatNumber(s.absQty)} units
                          </span>
                        </div>
                      ))}
                      {t.topStyles.length === 0 && (
                        <p className="text-text-faint text-sm text-center py-4">No styles</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
          {byTypeDetailed.length === 0 && (
            <div className="bg-surface-secondary rounded-xl border border-border-primary p-8 text-center">
              <p className="text-text-faint">No movement type data available</p>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          MOVEMENT HISTORY TAB
          ═══════════════════════════════════════════════════════════════ */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="bg-surface-secondary rounded-xl border border-border-primary p-4">
            <div className="flex flex-wrap items-center gap-3">
              {/* Search */}
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-faint" />
                <input
                  type="text"
                  value={historySearch}
                  onChange={(e) => { setHistorySearch(e.target.value); setHistoryPage(1); }}
                  placeholder="Search style, color, customer..."
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-surface-tertiary border border-border-primary text-text-primary placeholder:text-text-faint text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Warehouse filter */}
              <select
                value={historyWarehouse}
                onChange={(e) => { setHistoryWarehouse(e.target.value); setHistoryPage(1); }}
                className="px-3 py-2 rounded-lg bg-surface-tertiary border border-border-primary text-text-primary text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">All Warehouses</option>
                {warehouses.map((w) => <option key={w} value={w}>{w}</option>)}
              </select>

              {/* Movement type filter */}
              <select
                value={historyType}
                onChange={(e) => { setHistoryType(e.target.value); setHistoryPage(1); }}
                className="px-3 py-2 rounded-lg bg-surface-tertiary border border-border-primary text-text-primary text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">All Types</option>
                {movementTypes.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>

              {/* Period filter */}
              <select
                value={historyPeriod}
                onChange={(e) => { setHistoryPeriod(e.target.value); setHistoryPage(1); }}
                className="px-3 py-2 rounded-lg bg-surface-tertiary border border-border-primary text-text-primary text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">All Periods</option>
                {periods.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>

              {/* Style filter */}
              <select
                value={historyStyle}
                onChange={(e) => { setHistoryStyle(e.target.value); setHistoryPage(1); }}
                className="px-3 py-2 rounded-lg bg-surface-tertiary border border-border-primary text-text-primary text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">All Styles</option>
                {styles.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>

              {hasHistoryFilters && (
                <button
                  onClick={clearHistoryFilters}
                  className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 transition-colors"
                >
                  <X className="w-3 h-3" />
                  Clear
                </button>
              )}
            </div>

            <div className="mt-3 flex items-center justify-between text-xs text-text-faint">
              <span>{formatNumber(historyFiltered.length)} movements</span>
              <span>
                Page {historyPage} of {historyTotalPages}
              </span>
            </div>
          </div>

          {/* Table */}
          <div className="bg-surface-secondary rounded-xl border border-border-primary overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-primary text-text-faint text-xs uppercase tracking-wider">
                    {[
                      { field: 'movementDate' as HistorySortField, label: 'Date' },
                      { field: 'styleNumber' as HistorySortField, label: 'Style' },
                      { field: 'color' as HistorySortField, label: 'Color' },
                      { field: 'warehouse' as HistorySortField, label: 'Warehouse' },
                      { field: 'movementType' as HistorySortField, label: 'Type' },
                      { field: 'qty' as HistorySortField, label: 'Qty' },
                      { field: 'balance' as HistorySortField, label: 'Balance' },
                      { field: 'customerVendor' as HistorySortField, label: 'Customer/Vendor' },
                    ].map((col) => (
                      <th
                        key={col.field}
                        onClick={() => toggleHistorySort(col.field)}
                        className={`py-3 px-4 cursor-pointer hover:text-text-secondary transition-colors
                          ${col.field === 'qty' || col.field === 'balance' ? 'text-right' : 'text-left'}`}
                      >
                        <span className="inline-flex items-center">
                          {col.label}
                          <SortIcon field={col.field} currentField={historySortField} currentDir={historySortDir} />
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {historyPaged.map((r) => (
                    <tr key={r.id} className="border-b border-border-primary hover:bg-hover transition-colors">
                      <td className="py-3 px-4 font-mono text-text-secondary text-xs whitespace-nowrap">
                        {r.movementDate || '--'}
                      </td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => onStyleClick(r.styleNumber)}
                          className="font-mono text-text-primary hover:text-blue-400 transition-colors"
                        >
                          {r.styleNumber}
                        </button>
                        {r.styleDesc && (
                          <p className="text-text-faint text-xs truncate max-w-[140px]">{r.styleDesc}</p>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-text-primary">{r.color || '--'}</span>
                        {r.colorDesc && (
                          <p className="text-text-faint text-xs truncate max-w-[100px]">{r.colorDesc}</p>
                        )}
                      </td>
                      <td className="py-3 px-4 text-text-secondary text-xs max-w-[160px] truncate">
                        {r.warehouse || '--'}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${movementTypeBadge(r.movementType || '')}`}>
                          {r.movementType || '--'}
                        </span>
                      </td>
                      <td className={`py-3 px-4 text-right font-mono font-medium ${r.qty >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {r.qty >= 0 ? '+' : ''}{formatNumber(r.qty)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-text-secondary">
                        {formatNumber(r.balance)}
                      </td>
                      <td className="py-3 px-4 text-text-secondary text-xs truncate max-w-[140px]">
                        {r.customerVendor || '--'}
                      </td>
                    </tr>
                  ))}
                  {historyPaged.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-text-faint">
                        No movements found matching your filters
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {historyTotalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                disabled={historyPage === 1}
                className="p-2 rounded-lg bg-surface-secondary border border-border-primary text-text-secondary hover:bg-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-1">
                {generatePageNumbers(historyPage, historyTotalPages).map((p, i) =>
                  p === '...' ? (
                    <span key={`ellipsis-${i}`} className="px-2 text-text-faint text-sm">...</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setHistoryPage(p as number)}
                      className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors
                        ${historyPage === p
                          ? 'bg-blue-500 text-white'
                          : 'bg-surface-secondary border border-border-primary text-text-secondary hover:bg-hover'
                        }`}
                    >
                      {p}
                    </button>
                  )
                )}
              </div>
              <button
                onClick={() => setHistoryPage((p) => Math.min(historyTotalPages, p + 1))}
                disabled={historyPage === historyTotalPages}
                className="p-2 rounded-lg bg-surface-secondary border border-border-primary text-text-secondary hover:bg-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          CURRENT BALANCE TAB
          ═══════════════════════════════════════════════════════════════ */}
      {activeTab === 'balance' && (
        <div className="space-y-4">
          {/* Search */}
          <div className="bg-surface-secondary rounded-xl border border-border-primary p-4">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-faint" />
              <input
                type="text"
                value={balanceSearch}
                onChange={(e) => setBalanceSearch(e.target.value)}
                placeholder="Search style or color..."
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-surface-tertiary border border-border-primary text-text-primary placeholder:text-text-faint text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <p className="mt-2 text-xs text-text-faint">
              {formatNumber(currentBalances.length)} style/color combinations
            </p>
          </div>

          {/* Balance summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {(['healthy', 'low', 'zero', 'negative'] as const).map((status) => {
              const count = currentBalances.filter((b) => getBalanceStatus(b.balance) === status).length;
              return (
                <div key={status} className="bg-surface-secondary rounded-xl border border-border-primary p-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${balanceBadgeClass(status)}`}>
                      {balanceBadgeLabel(status)}
                    </span>
                  </div>
                  <p className="text-2xl font-mono font-semibold text-text-primary">{formatNumber(count)}</p>
                  <p className="text-text-faint text-xs mt-1">style/color combos</p>
                </div>
              );
            })}
          </div>

          {/* Balance table */}
          <div className="bg-surface-secondary rounded-xl border border-border-primary overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-primary text-text-faint text-xs uppercase tracking-wider">
                    {[
                      { field: 'styleNumber' as BalanceSortField, label: 'Style', align: 'left' },
                      { field: 'color' as BalanceSortField, label: 'Color', align: 'left' },
                      { field: 'balance' as BalanceSortField, label: 'Current Balance', align: 'right' },
                      { field: 'totalIn' as BalanceSortField, label: 'Total In', align: 'right' },
                      { field: 'totalOut' as BalanceSortField, label: 'Total Out', align: 'right' },
                    ].map((col) => (
                      <th
                        key={col.field}
                        onClick={() => toggleBalanceSort(col.field)}
                        className={`py-3 px-4 cursor-pointer hover:text-text-secondary transition-colors ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                      >
                        <span className="inline-flex items-center">
                          {col.label}
                          <SortIcon field={col.field} currentField={balanceSortField} currentDir={balanceSortDir} />
                        </span>
                      </th>
                    ))}
                    <th className="py-3 px-4 text-left">Status</th>
                    <th className="py-3 px-4 text-right">Movements</th>
                    <th className="py-3 px-4 text-left">Last Movement</th>
                  </tr>
                </thead>
                <tbody>
                  {currentBalances.map((b) => {
                    const status = getBalanceStatus(b.balance);
                    return (
                      <tr key={`${b.styleNumber}-${b.color}`} className="border-b border-border-primary hover:bg-hover transition-colors">
                        <td className="py-3 px-4">
                          <button
                            onClick={() => onStyleClick(b.styleNumber)}
                            className="font-mono text-text-primary hover:text-blue-400 transition-colors"
                          >
                            {b.styleNumber}
                          </button>
                          {b.styleDesc && (
                            <p className="text-text-faint text-xs truncate max-w-[140px]">{b.styleDesc}</p>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-text-primary">{b.color || '--'}</span>
                          {b.colorDesc && (
                            <p className="text-text-faint text-xs truncate max-w-[100px]">{b.colorDesc}</p>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className={`font-mono font-semibold ${
                            b.balance > 0 ? 'text-text-primary' : b.balance === 0 ? 'text-text-faint' : 'text-rose-400'
                          }`}>
                            {formatNumber(b.balance)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-emerald-400">
                          +{formatNumber(b.totalIn)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-rose-400">
                          -{formatNumber(b.totalOut)}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${balanceBadgeClass(status)}`}>
                            {balanceBadgeLabel(status)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-text-secondary text-xs">
                          {formatNumber(b.movementCount)}
                        </td>
                        <td className="py-3 px-4 font-mono text-text-faint text-xs whitespace-nowrap">
                          {b.movementDate || '--'}
                        </td>
                      </tr>
                    );
                  })}
                  {currentBalances.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-text-faint">
                        No balance data found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────

function KPICard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent?: 'emerald' | 'rose' | 'amber' | 'indigo';
}) {
  return (
    <div className="bg-surface-secondary rounded-xl border border-border-primary p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-text-faint text-sm">{label}</span>
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
    pages.push('...');
    pages.push(total);
  } else if (current >= total - 3) {
    pages.push(1);
    pages.push('...');
    for (let i = total - 4; i <= total; i++) pages.push(i);
  } else {
    pages.push(1);
    pages.push('...');
    for (let i = current - 1; i <= current + 1; i++) pages.push(i);
    pages.push('...');
    pages.push(total);
  }

  return pages;
}
