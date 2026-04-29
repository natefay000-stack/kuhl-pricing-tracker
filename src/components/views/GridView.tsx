'use client';

/**
 * Grid View — spreadsheet-feel pivot of style × (season MSRP / Wholesale / Landed / Margin).
 *
 * Header + filter bar match Season View's styling so the two feel like
 * siblings. All filters are local state (same pattern as SeasonView);
 * only the global `selectedSeason` prop is synced into the local
 * seasons-pills selection.
 *
 * Editable cells hit the same /api/data/update-price + /api/data/update-cost
 * endpoints that power the modal flows, with full audit trail.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Product,
  PricingRecord,
  CostRecord,
  SalesRecord,
  CUSTOMER_TYPE_LABELS,
} from '@/types/product';
import { sortSeasons } from '@/lib/store';
import { isRelevantSeason } from '@/utils/season';
import {
  getCurrentShippingSeason,
  getSeasonStatus,
  getSeasonStatusBadge,
} from '@/lib/season-utils';
import { matchesDivision } from '@/utils/divisionMap';
import { matchesFilter } from '@/utils/filters';
import { cleanStyleNumber } from '@/utils/combineStyles';
import { Check, AlertCircle, Loader2, Search, X } from 'lucide-react';

const EDITED_BY_KEY = 'kuhl-edited-by';

interface GridViewProps {
  products: Product[];
  pricing: PricingRecord[];
  costs: CostRecord[];
  sales: SalesRecord[];
  selectedSeason?: string;
  selectedDivision: string;
  selectedCategory: string;
  searchQuery?: string;
  onStyleClick: (styleNumber: string) => void;
  onPricingUpdated?: (updated: PricingRecord) => void;
  onCostUpdated?: (updated: CostRecord) => void;
}

type FieldKey = 'msrp' | 'price' | 'landed' | 'margin';

interface CellCoord {
  row: number;
  col: number;
}

interface CellMeta {
  field: FieldKey;
  season: string;
}

interface SaveState {
  status: 'idle' | 'saving' | 'ok' | 'error';
  message?: string;
  at?: number;
}

const FIELD_ORDER: FieldKey[] = ['msrp', 'price', 'landed', 'margin'];
const FIELD_LABEL: Record<FieldKey, string> = {
  msrp: 'MSRP',
  price: 'Whsl',
  landed: 'Landed',
  margin: 'Margin',
};

const canUseCostFallback = (season: string): boolean => {
  const status = getSeasonStatus(season);
  return status !== 'PLANNING' && status !== 'PRE-BOOK';
};

function formatCellValue(field: FieldKey, v: number | null): string {
  if (v == null || Number.isNaN(v)) return '';
  if (field === 'margin') return `${(v * 100).toFixed(1)}%`;
  return `$${v.toFixed(2)}`;
}

function parseInputValue(raw: string): number | null {
  const trimmed = raw.replace(/[$,\s]/g, '').trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function normalizeMarginInput(raw: string): number | null {
  const n = parseInputValue(raw.replace('%', ''));
  if (n == null) return null;
  return n >= 1.5 ? n / 100 : n;
}

export default function GridView({
  products,
  pricing,
  costs,
  sales,
  selectedSeason: globalSeason = '',
  selectedDivision,
  selectedCategory,
  searchQuery: globalSearchQuery,
  onStyleClick,
  onPricingUpdated,
  onCostUpdated,
}: GridViewProps) {
  // ── Local filters (mirror Season View) ──
  const [selectedSeasons, setSelectedSeasons] = useState<string[]>([]);
  const [styleNumberFilter, setStyleNumberFilter] = useState<string>('');
  const [styleNameFilter, setStyleNameFilter] = useState<string>('');
  const [selectedDesigner, setSelectedDesigner] = useState<string>('');
  const [selectedCustomerType, setSelectedCustomerType] = useState<string>('');
  const [selectedCustomer, setSelectedCustomer] = useState<string>('');
  const [localGenderFilter, setLocalGenderFilter] = useState<string>('');
  const [localCategoryFilter, setLocalCategoryFilter] = useState<string>('');
  // Default-on: skip styles that have no MSRP / Wholesale / Landed across any
  // of the displayed season columns. Keeps the grid scannable — off-season
  // and carry-over styles don't clutter the view when you're reviewing a
  // handful of seasons.
  const [hideEmptyRows, setHideEmptyRows] = useState<boolean>(true);

  // ── Editor name ──
  const [editorName, setEditorName] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem(EDITED_BY_KEY) ?? '';
  });
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [pendingSave, setPendingSave] = useState<null | (() => Promise<void>)>(null);

  const ensureName = useCallback((thenSave: () => Promise<void>): boolean => {
    if (editorName.trim()) return true;
    setPendingSave(() => thenSave);
    setShowNamePrompt(true);
    return false;
  }, [editorName]);

  const commitName = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setEditorName(trimmed);
    try { localStorage.setItem(EDITED_BY_KEY, trimmed); } catch { /* ignore */ }
    setShowNamePrompt(false);
    if (pendingSave) {
      pendingSave();
      setPendingSave(null);
    }
  };

  // ── Seasons + relevant-to-UI sets ──
  const allSeasons = useMemo(() => {
    const set = new Set<string>();
    pricing.forEach((p) => p.season && set.add(p.season));
    costs.forEach((c) => c.season && set.add(c.season));
    products.forEach((p) => p.season && set.add(p.season));
    sales.forEach((s) => s.season && set.add(s.season));
    return sortSeasons(Array.from(set).filter((s) => isRelevantSeason(s)));
  }, [pricing, costs, products, sales]);

  // Sync global FilterBar season → local selectedSeasons
  useEffect(() => {
    if (!globalSeason) return;
    if (globalSeason === '__ALL_SP__') {
      setSelectedSeasons(allSeasons.filter((s) => s.endsWith('SP')));
    } else if (globalSeason === '__ALL_FA__') {
      setSelectedSeasons(allSeasons.filter((s) => s.endsWith('FA')));
    } else if (allSeasons.includes(globalSeason)) {
      setSelectedSeasons([globalSeason]);
    }
  }, [globalSeason, allSeasons]);

  const toggleSeason = (season: string) => {
    setSelectedSeasons((prev) =>
      prev.includes(season) ? prev.filter((s) => s !== season) : [...prev, season],
    );
  };

  const selectSeasonType = (type: 'SP' | 'FA') => {
    const matching = allSeasons.filter((s) => s.endsWith(type));
    const allSelected = matching.every((s) => selectedSeasons.includes(s));
    if (allSelected) {
      setSelectedSeasons((prev) => prev.filter((s) => !s.endsWith(type)));
    } else {
      setSelectedSeasons((prev) => {
        const others = prev.filter((s) => !s.endsWith(type));
        return [...others, ...matching];
      });
    }
  };

  // Columns to render: narrowed to selectedSeasons when set
  const displaySeasons = useMemo(() => {
    if (selectedSeasons.length > 0) return sortSeasons(selectedSeasons);
    return allSeasons;
  }, [allSeasons, selectedSeasons]);

  // ── Derived filter option lists ──
  const designers = useMemo(() => {
    const all = new Set<string>();
    products.forEach((p) => p.designerName && all.add(p.designerName));
    return Array.from(all).sort();
  }, [products]);

  const genders = useMemo(() => {
    const all = new Set<string>();
    products.forEach((p) => {
      if (p.divisionDesc) {
        const lower = p.divisionDesc.toLowerCase();
        if (lower.includes('women') || lower.includes('woman')) all.add("Women's");
        else if (lower.includes('men')) all.add("Men's");
        else if (lower.includes('unisex')) all.add('Unisex');
      }
    });
    return Array.from(all).sort();
  }, [products]);

  const categories = useMemo(() => {
    const all = new Set<string>();
    products.forEach((p) => p.categoryDesc && all.add(p.categoryDesc));
    return Array.from(all).sort();
  }, [products]);

  const customerTypes = ['WH', 'BB', 'WD', 'EC', 'PS', 'KI'];

  const customers = useMemo(() => {
    const all = new Set<string>();
    sales.forEach((s) => s.customer && all.add(s.customer));
    return Array.from(all).sort();
  }, [sales]);

  // Sets of styles that satisfy the sales-related filters (customer type / customer)
  const stylesMatchingSalesFilter = useMemo(() => {
    if (!selectedCustomerType && !selectedCustomer) return null; // no filter
    const ctTokens = selectedCustomerType ? selectedCustomerType.split('|').filter(Boolean) : [];
    const custTokens = selectedCustomer ? selectedCustomer.split('|').filter(Boolean) : [];
    const set = new Set<string>();
    sales.forEach((s) => {
      if (ctTokens.length > 0) {
        const types = (s.customerType ?? '').split(',').map((t) => t.trim().toUpperCase());
        if (!ctTokens.some((tok) => types.includes(tok))) return;
      }
      if (custTokens.length > 0 && !custTokens.includes(s.customer ?? '')) return;
      if (s.styleNumber) set.add(s.styleNumber);
    });
    return set;
  }, [sales, selectedCustomerType, selectedCustomer]);

  // ── Lookups ──
  const pricingBySS = useMemo(() => {
    const m = new Map<string, PricingRecord>();
    pricing.forEach((p) => m.set(`${p.styleNumber}-${p.season}`, p));
    return m;
  }, [pricing]);

  const costBySS = useMemo(() => {
    const m = new Map<string, CostRecord>();
    costs.forEach((c) => m.set(`${c.styleNumber}-${c.season}`, c));
    return m;
  }, [costs]);

  const productByStyle = useMemo(() => {
    const m = new Map<string, Product>();
    products.forEach((p) => {
      const key = cleanStyleNumber(p.styleNumber);
      if (!m.has(key)) m.set(key, p);
    });
    return m;
  }, [products]);

  // ── Rows ──
  const rowStyles = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => p.styleNumber && set.add(cleanStyleNumber(p.styleNumber)));
    pricing.forEach((p) => p.styleNumber && set.add(p.styleNumber));
    costs.forEach((c) => c.styleNumber && set.add(c.styleNumber));

    const q = (globalSearchQuery ?? '').trim().toLowerCase();
    const styleNumQ = styleNumberFilter.trim().toLowerCase();
    const styleNameQ = styleNameFilter.trim().toLowerCase();

    // When hide-empty is on, a row only survives if at least one
    // displayed season has a populated MSRP / wholesale / landed value.
    const rowHasAnyData = (sn: string): boolean => {
      for (const season of displaySeasons) {
        const pr = pricingBySS.get(`${sn}-${season}`);
        if (pr && ((pr.msrp ?? 0) > 0 || (pr.price ?? 0) > 0)) return true;
        const c = costBySS.get(`${sn}-${season}`);
        if (c && (c.landed ?? 0) > 0) return true;
        // Fallback: if the Product record is in this exact season, count
        // its line-list price/cost as data too (matches getCell behavior).
        const p = productByStyle.get(sn);
        if (p && p.season === season && ((p.price ?? 0) > 0 || (p.msrp ?? 0) > 0 || (p.cost ?? 0) > 0)) {
          return true;
        }
      }
      return false;
    };

    return Array.from(set)
      .filter((sn) => {
        const p = productByStyle.get(sn);
        // Division / category (global)
        if (p) {
          if (!matchesDivision(p.divisionDesc ?? '', selectedDivision)) return false;
          if (!matchesFilter(p.categoryDesc, selectedCategory)) return false;
        }
        // Local designer
        if (!matchesFilter(p?.designerName, selectedDesigner)) return false;
        // Local gender (from division)
        if (localGenderFilter) {
          const div = (p?.divisionDesc ?? '').toLowerCase();
          if (localGenderFilter === "Women's" && !(div.includes('women') || div.includes('woman'))) return false;
          if (localGenderFilter === "Men's" && !div.includes('men')) return false;
          if (localGenderFilter === 'Unisex' && !div.includes('unisex')) return false;
        }
        // Local category
        if (localCategoryFilter && p?.categoryDesc !== localCategoryFilter) return false;
        // Customer / channel filters (require style to appear in matching sales)
        if (stylesMatchingSalesFilter && !stylesMatchingSalesFilter.has(sn)) return false;
        // Searches
        if (q) {
          const hit = sn.toLowerCase().includes(q) || (p?.styleDesc ?? '').toLowerCase().includes(q);
          if (!hit) return false;
        }
        if (styleNumQ && !sn.toLowerCase().includes(styleNumQ)) return false;
        if (styleNameQ && !(p?.styleDesc ?? '').toLowerCase().includes(styleNameQ)) return false;
        // Hide empty rows (last check — cheapest to run after everything else)
        if (hideEmptyRows && !rowHasAnyData(sn)) return false;
        return true;
      })
      .sort((a, b) => a.localeCompare(b));
  }, [
    products,
    pricing,
    costs,
    productByStyle,
    pricingBySS,
    costBySS,
    displaySeasons,
    selectedDivision,
    selectedCategory,
    selectedDesigner,
    localGenderFilter,
    localCategoryFilter,
    stylesMatchingSalesFilter,
    globalSearchQuery,
    styleNumberFilter,
    styleNameFilter,
    hideEmptyRows,
  ]);

  const hasFilters =
    selectedSeasons.length > 0 ||
    !!styleNumberFilter ||
    !!styleNameFilter ||
    !!selectedDesigner ||
    !!selectedCustomerType ||
    !!selectedCustomer ||
    !!localGenderFilter ||
    !!localCategoryFilter;

  const clearFilters = () => {
    setSelectedSeasons([]);
    setStyleNumberFilter('');
    setStyleNameFilter('');
    setSelectedDesigner('');
    setSelectedCustomerType('');
    setSelectedCustomer('');
    setLocalGenderFilter('');
    setLocalCategoryFilter('');
  };

  // ── Cell lookup ──
  const getCell = useCallback(
    (styleNumber: string, season: string, field: FieldKey): {
      value: number | null;
      rowId: string | null;
      editable: boolean;
    } => {
      const pricingRow = pricingBySS.get(`${styleNumber}-${season}`);
      const costRow = costBySS.get(`${styleNumber}-${season}`);
      const prod = productByStyle.get(styleNumber);

      if (field === 'msrp') {
        const v = pricingRow?.msrp ?? (prod?.season === season ? prod.msrp : 0) ?? 0;
        return { value: v || null, rowId: pricingRow?.id ?? null, editable: !!pricingRow };
      }
      if (field === 'price') {
        const v = pricingRow?.price ?? (prod?.season === season ? prod.price : 0) ?? 0;
        return { value: v || null, rowId: pricingRow?.id ?? null, editable: !!pricingRow };
      }
      if (field === 'landed') {
        const v = costRow?.landed ?? 0;
        const fallbackV = !v && prod?.season === season ? prod.cost : 0;
        const effective = v || fallbackV || 0;
        return { value: effective || null, rowId: costRow?.id ?? null, editable: !!costRow };
      }
      // margin — derived
      const whsl = pricingRow?.price ?? 0;
      let landedV = costRow?.landed ?? 0;
      if (!landedV && canUseCostFallback(season)) {
        if (prod?.season === season && prod.cost > 0) landedV = prod.cost;
      }
      const m = whsl > 0 && landedV > 0 ? (whsl - landedV) / whsl : null;
      return { value: m, rowId: null, editable: false };
    },
    [pricingBySS, costBySS, productByStyle],
  );

  // ── Selection + edit state ──
  const totalCols = 2 + displaySeasons.length * FIELD_ORDER.length;
  const totalRows = rowStyles.length;

  const [selected, setSelected] = useState<CellCoord>({ row: 0, col: 2 });
  const [editing, setEditing] = useState<CellCoord | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [saveStates, setSaveStates] = useState<Map<string, SaveState>>(new Map());

  const editInputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const colMeta = useCallback((col: number): CellMeta | null => {
    if (col < 2) return null;
    const offset = col - 2;
    const seasonIdx = Math.floor(offset / FIELD_ORDER.length);
    const fieldIdx = offset % FIELD_ORDER.length;
    const season = displaySeasons[seasonIdx];
    const field = FIELD_ORDER[fieldIdx];
    if (!season || !field) return null;
    return { season, field };
  }, [displaySeasons]);

  const cellKey = (row: number, col: number) => `${row}:${col}`;

  const isCellSelected = (row: number, col: number) =>
    selected.row === row && selected.col === col;
  const isCellEditing = (row: number, col: number) =>
    editing !== null && editing.row === row && editing.col === col;

  const moveSelection = (dRow: number, dCol: number) => {
    setSelected((prev) => {
      let r = prev.row + dRow;
      let c = prev.col + dCol;
      if (r < 0) r = 0;
      if (r > totalRows - 1) r = totalRows - 1;
      if (c < 2) c = 2;
      if (c > totalCols - 1) c = totalCols - 1;
      return { row: r, col: c };
    });
  };

  // Clamp selection when data shrinks
  useEffect(() => {
    setSelected((prev) => ({
      row: Math.min(prev.row, Math.max(0, totalRows - 1)),
      col: Math.min(prev.col, Math.max(2, totalCols - 1)),
    }));
  }, [totalRows, totalCols]);

  // ── Saves ──
  const writeSaveState = (key: string, next: SaveState) => {
    setSaveStates((prev) => {
      const n = new Map(prev);
      n.set(key, next);
      return n;
    });
    if (next.status === 'ok') {
      setTimeout(() => {
        setSaveStates((prev) => {
          const n = new Map(prev);
          n.delete(key);
          return n;
        });
      }, 1500);
    }
  };

  const saveCell = useCallback(
    async (row: number, col: number, rawValue: string) => {
      const meta = colMeta(col);
      if (!meta) return;
      const styleNumber = rowStyles[row];
      if (!styleNumber) return;
      const { rowId, editable } = getCell(styleNumber, meta.season, meta.field);
      if (!editable || !rowId) return;

      const key = cellKey(row, col);

      let numericValue: number | null;
      if (meta.field === 'margin') {
        numericValue = normalizeMarginInput(rawValue);
      } else {
        numericValue = parseInputValue(rawValue);
      }
      if (numericValue == null) {
        writeSaveState(key, { status: 'error', message: 'Invalid number' });
        return;
      }

      const current = getCell(styleNumber, meta.season, meta.field).value ?? 0;
      if (Math.abs(current - numericValue) < 1e-6) return;

      const doSave = async () => {
        writeSaveState(key, { status: 'saving' });
        try {
          if (meta.field === 'msrp' || meta.field === 'price') {
            const body: Record<string, unknown> = {
              id: rowId,
              editedBy: editorName || localStorage.getItem(EDITED_BY_KEY) || '',
              [meta.field]: numericValue,
            };
            const res = await fetch('/api/data/update-price', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || `HTTP ${res.status}`);
            if (result.updated) onPricingUpdated?.(result.updated);
            writeSaveState(key, { status: 'ok', at: Date.now() });
          } else if (meta.field === 'landed') {
            const body: Record<string, unknown> = {
              id: rowId,
              editedBy: editorName || localStorage.getItem(EDITED_BY_KEY) || '',
              landed: numericValue,
            };
            const res = await fetch('/api/data/update-cost', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || `HTTP ${res.status}`);
            if (result.updated) onCostUpdated?.(result.updated);
            writeSaveState(key, { status: 'ok', at: Date.now() });
          }
        } catch (err) {
          writeSaveState(key, {
            status: 'error',
            message: err instanceof Error ? err.message : String(err),
          });
        }
      };

      if (!ensureName(doSave)) return;
      await doSave();
    },
    [colMeta, rowStyles, getCell, editorName, onPricingUpdated, onCostUpdated, ensureName],
  );

  // ── Keyboard ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onKey = (e: KeyboardEvent) => {
      if (editing) return;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') {
        const styleNumber = rowStyles[selected.row];
        const meta = colMeta(selected.col);
        if (styleNumber && meta) {
          const { value } = getCell(styleNumber, meta.season, meta.field);
          const text = formatCellValue(meta.field, value);
          navigator.clipboard?.writeText(text).catch(() => {});
          e.preventDefault();
        }
        return;
      }

      switch (e.key) {
        case 'ArrowUp': moveSelection(-1, 0); e.preventDefault(); break;
        case 'ArrowDown': moveSelection(1, 0); e.preventDefault(); break;
        case 'ArrowLeft': moveSelection(0, -1); e.preventDefault(); break;
        case 'ArrowRight': moveSelection(0, 1); e.preventDefault(); break;
        case 'Tab': moveSelection(0, e.shiftKey ? -1 : 1); e.preventDefault(); break;
        case 'Enter': {
          const styleNumber = rowStyles[selected.row];
          const meta = colMeta(selected.col);
          if (styleNumber && meta && meta.field !== 'margin') {
            const { value, editable } = getCell(styleNumber, meta.season, meta.field);
            if (editable) {
              setEditValue(value != null ? String(value) : '');
              setEditing({ row: selected.row, col: selected.col });
              e.preventDefault();
              return;
            }
          }
          moveSelection(1, 0);
          e.preventDefault();
          break;
        }
        default:
          if (
            !e.metaKey && !e.ctrlKey && !e.altKey &&
            e.key.length === 1 &&
            /[-0-9.$%]/.test(e.key)
          ) {
            const styleNumber = rowStyles[selected.row];
            const meta = colMeta(selected.col);
            if (styleNumber && meta && meta.field !== 'margin') {
              const { editable } = getCell(styleNumber, meta.season, meta.field);
              if (editable) {
                setEditValue(e.key);
                setEditing({ row: selected.row, col: selected.col });
                e.preventDefault();
              }
            }
          }
      }
    };

    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, selected, rowStyles, displaySeasons]);

  useEffect(() => {
    if (editing && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editing]);

  const commitEdit = async (advance: 'down' | 'right' | 'none') => {
    if (!editing) return;
    const { row, col } = editing;
    const value = editValue;
    setEditing(null);
    setEditValue('');
    await saveCell(row, col, value);
    if (advance === 'down') moveSelection(1, 0);
    else if (advance === 'right') moveSelection(0, 1);
  };

  const cancelEdit = () => {
    setEditing(null);
    setEditValue('');
  };

  // ── Render helpers (grid itself) ──
  const renderGridHeader = () => (
    <tr className="bg-surface-tertiary">
      <th className="sticky left-0 top-0 z-30 bg-surface-tertiary border-b border-r border-gray-300 dark:border-gray-700 px-3 py-2 text-xs font-bold text-text-secondary uppercase tracking-wide min-w-[100px]">
        Style #
      </th>
      <th className="sticky left-[100px] top-0 z-30 bg-surface-tertiary border-b border-r border-gray-300 dark:border-gray-700 px-3 py-2 text-xs font-bold text-text-secondary uppercase tracking-wide min-w-[220px]">
        Description
      </th>
      {displaySeasons.map((season) => {
        const badge = getSeasonStatusBadge(getSeasonStatus(season));
        return (
          <th
            key={season}
            colSpan={FIELD_ORDER.length}
            className="sticky top-0 z-20 bg-surface-tertiary border-b border-l-2 border-gray-400 dark:border-gray-600 px-2 py-2 text-center text-xs font-bold text-text-secondary"
          >
            <div className="flex items-center justify-center gap-1.5">
              <span className="font-mono text-sm">{season}</span>
              <span className={`text-[9px] px-1 py-0.5 rounded ${badge.color}`}>
                {badge.label === 'SHIPPING' ? 'SHIP' : badge.label === 'PRE-BOOK' ? 'PRE' : badge.label === 'PLANNING' ? 'PLAN' : badge.label}
              </span>
            </div>
          </th>
        );
      })}
    </tr>
  );

  const renderGridSubHeader = () => (
    <tr className="bg-surface-secondary">
      <th className="sticky left-0 top-[36px] z-30 bg-surface-secondary border-b border-r border-gray-300 dark:border-gray-700 px-3 py-1.5 min-w-[100px]" />
      <th className="sticky left-[100px] top-[36px] z-30 bg-surface-secondary border-b border-r border-gray-300 dark:border-gray-700 px-3 py-1.5 min-w-[220px]" />
      {displaySeasons.map((season) =>
        FIELD_ORDER.map((field, idx) => (
          <th
            key={`${season}-${field}`}
            className={`sticky top-[36px] z-20 bg-surface-secondary border-b border-gray-300 dark:border-gray-700 px-2 py-1.5 text-center text-[10px] font-semibold text-text-muted uppercase ${
              idx === 0 ? 'border-l-2 border-l-gray-400 dark:border-l-gray-600' : 'border-l border-gray-300 dark:border-gray-700'
            } min-w-[70px]`}
          >
            {FIELD_LABEL[field]}
          </th>
        )),
      )}
    </tr>
  );

  const renderCell = (row: number, col: number) => {
    const styleNumber = rowStyles[row];
    const meta = colMeta(col);
    if (!meta) return null;
    const { value, editable } = getCell(styleNumber, meta.season, meta.field);
    const key = cellKey(row, col);
    const saveState = saveStates.get(key);
    const isSel = isCellSelected(row, col);
    const isEd = isCellEditing(row, col);
    const isFieldBoundary = (col - 2) % FIELD_ORDER.length === 0;

    const baseClasses = [
      'relative',
      'px-2', 'py-1',
      'text-right',
      'font-mono',
      'text-[13px]',
      'text-text-primary',
      'border-b',
      'border-gray-200',
      'dark:border-gray-800',
      'min-w-[70px]',
      'h-[28px]',
      isFieldBoundary ? 'border-l-2 border-l-gray-400 dark:border-l-gray-600' : 'border-l border-gray-200 dark:border-gray-800',
      editable ? 'cursor-cell hover:bg-cyan-500/5' : 'bg-surface-tertiary/30 text-text-muted cursor-not-allowed',
      isSel && !isEd ? 'ring-2 ring-inset ring-cyan-500 bg-cyan-500/10' : '',
      isEd ? 'ring-2 ring-inset ring-emerald-500 bg-emerald-500/5' : '',
    ].filter(Boolean).join(' ');

    const displayValue = formatCellValue(meta.field, value);

    const onCellClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      setSelected({ row, col });
      if (!editable) return;
      if (e.detail === 2) {
        setEditValue(value != null ? String(value) : '');
        setEditing({ row, col });
      }
    };

    return (
      <td key={col} className={baseClasses} onClick={onCellClick}>
        {isEd ? (
          <input
            ref={editInputRef}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={() => commitEdit('none')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                commitEdit(e.shiftKey ? 'none' : 'down');
                e.preventDefault();
              } else if (e.key === 'Tab') {
                commitEdit('right');
                e.preventDefault();
              } else if (e.key === 'Escape') {
                cancelEdit();
                e.preventDefault();
              }
            }}
            className="w-full h-full bg-transparent text-right font-mono text-[13px] text-text-primary focus:outline-none"
          />
        ) : (
          <span>{displayValue}</span>
        )}
        {saveState?.status === 'saving' && (
          <Loader2 className="absolute top-0.5 right-0.5 w-3 h-3 text-cyan-400 animate-spin" />
        )}
        {saveState?.status === 'ok' && (
          <Check className="absolute top-0.5 right-0.5 w-3 h-3 text-emerald-500" />
        )}
        {saveState?.status === 'error' && (
          <span title={saveState.message}>
            <AlertCircle className="absolute top-0.5 right-0.5 w-3 h-3 text-red-500" />
          </span>
        )}
      </td>
    );
  };

  const renderRow = (row: number) => {
    const styleNumber = rowStyles[row];
    const prod = productByStyle.get(styleNumber);

    return (
      <tr key={styleNumber} className="even:bg-surface/40">
        <td
          className="sticky left-0 z-10 bg-surface even:bg-surface-secondary/80 border-b border-r border-gray-300 dark:border-gray-700 px-3 py-1 font-mono text-[13px] font-semibold text-text-primary cursor-pointer hover:text-cyan-400 min-w-[100px]"
          onClick={() => onStyleClick(styleNumber)}
          title="Open style detail"
        >
          {styleNumber}
        </td>
        <td
          className="sticky left-[100px] z-10 bg-surface even:bg-surface-secondary/80 border-b border-r border-gray-300 dark:border-gray-700 px-3 py-1 text-[13px] text-text-secondary truncate max-w-[220px] min-w-[220px]"
          title={prod?.styleDesc ?? ''}
        >
          {prod?.styleDesc ?? ''}
        </td>
        {Array.from({ length: totalCols - 2 }, (_, i) => renderCell(row, i + 2))}
      </tr>
    );
  };

  // ── Outer render (Season-View-style header + filters, then grid) ──
  const selectedStyleInfo = (() => {
    const styleNumber = rowStyles[selected.row];
    const meta = colMeta(selected.col);
    if (!styleNumber || !meta) return null;
    const { value } = getCell(styleNumber, meta.season, meta.field);
    return { styleNumber, meta, value };
  })();

  return (
    <div className="p-6 space-y-4">
      {/* Header ── mirrors Season View */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-4xl font-display font-bold text-text-primary">Grid</h2>
          <p className="text-base text-text-muted mt-2">
            Spreadsheet-feel editing across seasons. Tab to navigate, Enter to edit.
          </p>
        </div>
        {(() => {
          const currentSeason = getCurrentShippingSeason();
          const status = getSeasonStatus(currentSeason);
          const badge = getSeasonStatusBadge(status);
          return (
            <div className="text-right">
              <div className="text-sm text-text-muted">Current Shipping Season</div>
              <div className="flex items-center justify-end gap-2 mt-1">
                <span className="text-2xl font-mono font-bold text-text-primary">{currentSeason}</span>
                <span className={`text-sm px-2 py-1 rounded ${badge.color}`}>
                  {badge.icon} {badge.label}
                </span>
              </div>
              <div className="text-xs text-text-faint mt-1">
                {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Filters ── mirrors Season View */}
      <div className="bg-surface rounded-xl border-2 border-border-primary p-5">
        <div className="flex flex-wrap gap-4 items-end">
          {/* Season Multi-Select */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <label className="text-sm font-bold text-text-secondary uppercase tracking-wide">Seasons</label>
              <button
                onClick={() => selectSeasonType('SP')}
                className={`text-sm font-semibold px-3 py-1 rounded transition-colors ${
                  allSeasons.filter((s) => s.endsWith('SP')).every((s) => selectedSeasons.includes(s)) && allSeasons.filter((s) => s.endsWith('SP')).length > 0
                    ? 'bg-emerald-100 dark:bg-emerald-900 text-emerald-700'
                    : 'bg-surface-tertiary text-text-secondary hover:bg-surface-tertiary'
                }`}
              >
                All Spring
              </button>
              <button
                onClick={() => selectSeasonType('FA')}
                className={`text-sm font-semibold px-3 py-1 rounded transition-colors ${
                  allSeasons.filter((s) => s.endsWith('FA')).every((s) => selectedSeasons.includes(s)) && allSeasons.filter((s) => s.endsWith('FA')).length > 0
                    ? 'bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300'
                    : 'bg-surface-tertiary text-text-secondary hover:bg-surface-tertiary'
                }`}
              >
                All Fall
              </button>
              {selectedSeasons.length > 0 && (
                <button
                  onClick={() => setSelectedSeasons([])}
                  className="text-sm font-semibold px-3 py-1 rounded bg-surface-tertiary text-text-secondary hover:bg-surface-tertiary"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {allSeasons.map((season) => {
                const isSelected = selectedSeasons.includes(season);
                const isSpring = season.endsWith('SP');
                return (
                  <button
                    key={season}
                    onClick={() => toggleSeason(season)}
                    className={`px-3 py-1.5 text-sm font-mono font-semibold rounded-md transition-colors ${
                      isSelected
                        ? isSpring ? 'bg-emerald-500 text-white' : 'bg-orange-500 text-white'
                        : isSpring
                        ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 hover:bg-emerald-100'
                        : 'bg-orange-50 dark:bg-orange-950 text-orange-700 hover:bg-orange-100'
                    }`}
                  >
                    {season}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Style # */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold text-text-secondary uppercase tracking-wide">Style #</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-faint" />
              <input
                type="text"
                value={styleNumberFilter}
                onChange={(e) => setStyleNumberFilter(e.target.value)}
                placeholder="Search..."
                className="pl-11 pr-4 py-2.5 text-base border-2 border-border-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 w-[140px]"
              />
            </div>
          </div>

          {/* Style Name */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold text-text-secondary uppercase tracking-wide">Style Name</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-faint" />
              <input
                type="text"
                value={styleNameFilter}
                onChange={(e) => setStyleNameFilter(e.target.value)}
                placeholder="Search..."
                className="pl-11 pr-4 py-2.5 text-base border-2 border-border-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 w-[180px]"
              />
            </div>
          </div>

          {/* Designer */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold text-text-secondary uppercase tracking-wide">Designer</label>
            <select
              value={selectedDesigner}
              onChange={(e) => setSelectedDesigner(e.target.value)}
              className="px-4 py-2.5 text-base border-2 border-border-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 min-w-[160px]"
            >
              <option value="">All Designers</option>
              {designers.map((d) => (<option key={d} value={d}>{d}</option>))}
            </select>
          </div>

          {/* Channel */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold text-text-secondary uppercase tracking-wide">Channel</label>
            <select
              value={selectedCustomerType}
              onChange={(e) => setSelectedCustomerType(e.target.value)}
              className="px-4 py-2.5 text-base border-2 border-border-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 min-w-[160px]"
            >
              <option value="">All Channels</option>
              {customerTypes.map((ct) => (<option key={ct} value={ct}>{CUSTOMER_TYPE_LABELS[ct] || ct}</option>))}
            </select>
          </div>

          {/* Customer */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold text-text-secondary uppercase tracking-wide">Customer</label>
            <select
              value={selectedCustomer}
              onChange={(e) => setSelectedCustomer(e.target.value)}
              className="px-4 py-2.5 text-base border-2 border-border-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 min-w-[200px] max-w-[240px]"
            >
              <option value="">All Customers</option>
              {customers.map((c) => (<option key={c} value={c}>{c}</option>))}
            </select>
          </div>

          {/* Gender */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold text-text-secondary uppercase tracking-wide">Gender</label>
            <select
              value={localGenderFilter}
              onChange={(e) => setLocalGenderFilter(e.target.value)}
              className="px-4 py-2.5 text-base border-2 border-border-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 min-w-[140px]"
            >
              <option value="">All Genders</option>
              {genders.map((g) => (<option key={g} value={g}>{g}</option>))}
            </select>
          </div>

          {/* Category */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold text-text-secondary uppercase tracking-wide">Category</label>
            <select
              value={localCategoryFilter}
              onChange={(e) => setLocalCategoryFilter(e.target.value)}
              className="px-4 py-2.5 text-base border-2 border-border-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 min-w-[160px]"
            >
              <option value="">All Categories</option>
              {categories.map((c) => (<option key={c} value={c}>{c}</option>))}
            </select>
          </div>

          {/* Hide-empty-rows toggle */}
          <label
            className="flex items-center gap-2 px-3 py-2.5 text-sm font-semibold rounded-lg cursor-pointer select-none border-2 border-border-primary hover:bg-hover-accent"
            title="Hide style rows that have no MSRP / Wholesale / Landed data in any of the displayed season columns."
          >
            <input
              type="checkbox"
              checked={hideEmptyRows}
              onChange={(e) => setHideEmptyRows(e.target.checked)}
              className="w-4 h-4 accent-cyan-600"
            />
            <span className="text-text-secondary">Hide empty rows</span>
          </label>

          {/* Clear Filters */}
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-2 px-4 py-2.5 text-base font-semibold text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 hover:bg-hover-accent rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Formula-bar-ish strip */}
      <div className="flex items-center gap-3 px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-surface-tertiary text-sm">
        <span className="text-text-muted">Cell:</span>
        <span className="font-mono text-text-primary">
          {selectedStyleInfo
            ? `${selectedStyleInfo.styleNumber} · ${selectedStyleInfo.meta.season} · ${FIELD_LABEL[selectedStyleInfo.meta.field]}`
            : '—'}
        </span>
        <span className="text-text-muted ml-4">Value:</span>
        <span className="font-mono text-text-primary">
          {selectedStyleInfo
            ? formatCellValue(selectedStyleInfo.meta.field, selectedStyleInfo.value) || '(empty)'
            : '—'}
        </span>
        <span className="text-text-muted ml-auto text-xs">
          {totalRows.toLocaleString()} styles × {displaySeasons.length} seasons · Tab / arrows to navigate · Enter to edit
        </span>
      </div>

      {/* Grid */}
      {displaySeasons.length === 0 ? (
        <div className="p-6 text-text-muted bg-surface rounded-xl border-2 border-border-primary">
          No seasons match your filters.
        </div>
      ) : (
        <div
          ref={containerRef}
          tabIndex={0}
          className="bg-surface rounded-xl border-2 border-border-primary overflow-auto focus:outline-none"
          style={{ maxHeight: 'calc(100vh - 360px)' }}
        >
          <table className="border-separate border-spacing-0">
            <thead>
              {renderGridHeader()}
              {renderGridSubHeader()}
            </thead>
            <tbody>
              {rowStyles.map((_, row) => renderRow(row))}
            </tbody>
          </table>
        </div>
      )}

      {/* Name prompt modal */}
      {showNamePrompt && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => { setShowNamePrompt(false); setPendingSave(null); }}
          />
          <div className="relative bg-surface rounded-xl shadow-2xl border border-primary max-w-sm w-full mx-4 overflow-hidden">
            <div className="p-5 border-b border-primary">
              <h2 className="text-lg font-semibold text-text-primary">Your name</h2>
              <p className="text-sm text-text-muted mt-1">
                Edits are logged in the audit trail. Who should we attribute this to?
              </p>
            </div>
            <div className="p-5 space-y-4">
              <input
                type="text"
                value={editorName}
                autoFocus
                onChange={(e) => setEditorName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitName(editorName);
                  if (e.key === 'Escape') { setShowNamePrompt(false); setPendingSave(null); }
                }}
                placeholder="e.g. Shelby"
                className="w-full px-3 py-2 bg-surface-secondary border border-primary rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => { setShowNamePrompt(false); setPendingSave(null); }}
                  className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary"
                >
                  Cancel
                </button>
                <button
                  onClick={() => commitName(editorName)}
                  disabled={!editorName.trim()}
                  className="px-4 py-2 text-sm font-medium bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg disabled:opacity-50"
                >
                  Save &amp; Continue
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
