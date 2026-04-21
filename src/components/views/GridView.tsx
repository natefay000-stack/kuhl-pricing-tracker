'use client';

/**
 * Grid View — spreadsheet-feel pivot of style × (season MSRP / Wholesale / Landed / Margin).
 *
 * Interaction model (Excel-ish):
 *   - Click a cell to select it
 *   - Enter / double-click / start typing → enter edit mode
 *   - Tab / Shift+Tab → next / prev cell
 *   - Enter / Shift+Enter → down / up (commit current edit if any)
 *   - Arrow keys (when not editing) → navigate
 *   - Escape → cancel edit
 *   - Cmd/Ctrl+C on selected cell → copy value to clipboard
 *
 * What's editable:
 *   - MSRP / Wholesale cells → call /api/data/update-price
 *   - Landed cells          → call /api/data/update-cost
 *   - Margin cells          → read-only (derived: (wholesale - landed) / wholesale)
 *   - Cells without an underlying Pricing/Cost row are disabled
 *
 * Guardrails:
 *   - PLANNING / PRE-BOOK seasons don't pull prior-season fallback costs
 *     (matches the rule in SeasonView). Blank > fake data.
 *   - editedBy name is prompted once, then remembered in localStorage
 *     (same key as CostEditModal / PriceEditModal).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Product,
  PricingRecord,
  CostRecord,
  SalesRecord,
} from '@/types/product';
import { sortSeasons } from '@/lib/store';
import { isRelevantSeason } from '@/utils/season';
import { getSeasonStatus, getSeasonStatusBadge } from '@/lib/season-utils';
import { matchesDivision } from '@/utils/divisionMap';
import { Check, AlertCircle, Loader2 } from 'lucide-react';

const EDITED_BY_KEY = 'kuhl-edited-by';

interface GridViewProps {
  products: Product[];
  pricing: PricingRecord[];
  costs: CostRecord[];
  sales: SalesRecord[];
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
  /** The underlying row id (pricingId or costId) — null if not editable. */
  rowId: string | null;
}

interface SaveState {
  status: 'idle' | 'saving' | 'ok' | 'error';
  message?: string;
  // Tick counter — when status === 'ok' we fade out after a moment
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

// Margin input accepts 0-1 decimal or 0-100 percent — normalize on save
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
  selectedDivision,
  selectedCategory,
  searchQuery,
  onStyleClick,
  onPricingUpdated,
  onCostUpdated,
}: GridViewProps) {
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
    try {
      localStorage.setItem(EDITED_BY_KEY, trimmed);
    } catch { /* ignore */ }
    setShowNamePrompt(false);
    if (pendingSave) {
      pendingSave();
      setPendingSave(null);
    }
  };

  // ── Data prep ──
  const seasons = useMemo(() => {
    const set = new Set<string>();
    pricing.forEach((p) => p.season && set.add(p.season));
    costs.forEach((c) => c.season && set.add(c.season));
    products.forEach((p) => p.season && set.add(p.season));
    sales.forEach((s) => s.season && set.add(s.season));
    return sortSeasons(Array.from(set).filter((s) => isRelevantSeason(s)));
  }, [pricing, costs, products, sales]);

  // Lookups keyed by style+season
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

  // Product lookup (first-seen per style) for description + line-list price/cost fallback
  const productByStyle = useMemo(() => {
    const m = new Map<string, Product>();
    products.forEach((p) => {
      if (!m.has(p.styleNumber)) m.set(p.styleNumber, p);
    });
    return m;
  }, [products]);

  // Build row set from all (style, season) pairs that exist in any source
  const rowStyles = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => p.styleNumber && set.add(p.styleNumber));
    pricing.forEach((p) => p.styleNumber && set.add(p.styleNumber));
    costs.forEach((c) => c.styleNumber && set.add(c.styleNumber));

    const arr = Array.from(set);
    const q = (searchQuery ?? '').trim().toLowerCase();
    return arr
      .filter((sn) => {
        const p = productByStyle.get(sn);
        if (!p) return true;
        if (selectedDivision && !matchesDivision(p.divisionDesc ?? '', selectedDivision)) return false;
        if (selectedCategory && p.categoryDesc !== selectedCategory) return false;
        if (q) {
          const hit =
            sn.toLowerCase().includes(q) ||
            (p.styleDesc ?? '').toLowerCase().includes(q);
          if (!hit) return false;
        }
        return true;
      })
      .sort((a, b) => a.localeCompare(b));
  }, [products, pricing, costs, productByStyle, selectedDivision, selectedCategory, searchQuery]);

  // ── Cell value lookup ──
  // Returns { value, rowId, editable } — rowId is the underlying DB id for
  // the cell's field source (Pricing.id for msrp/price, Cost.id for landed)
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
        // Line-list cost fallback only if product is in this season
        const fallbackV = !v && prod?.season === season ? prod.cost : 0;
        const effective = v || fallbackV || 0;
        return { value: effective || null, rowId: costRow?.id ?? null, editable: !!costRow };
      }
      // margin — derived, read-only
      const pricingRec = pricingBySS.get(`${styleNumber}-${season}`);
      const costRec = costBySS.get(`${styleNumber}-${season}`);
      const whsl = pricingRec?.price ?? 0;
      let landedV = costRec?.landed ?? 0;
      if (!landedV && canUseCostFallback(season)) {
        // Only pad from line-list when fallback is allowed
        if (prod?.season === season && prod.cost > 0) landedV = prod.cost;
      }
      const m = whsl > 0 && landedV > 0 ? (whsl - landedV) / whsl : null;
      return { value: m, rowId: null, editable: false };
    },
    [pricingBySS, costBySS, productByStyle],
  );

  // ── Selection + edit state ──
  const totalCols = 2 + seasons.length * FIELD_ORDER.length; // Style + Desc + (MSRP/Whsl/Landed/Margin) per season
  const totalRows = rowStyles.length;

  const [selected, setSelected] = useState<CellCoord>({ row: 0, col: 2 });
  const [editing, setEditing] = useState<CellCoord | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [saveStates, setSaveStates] = useState<Map<string, SaveState>>(new Map());

  const editInputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Translate col index → CellMeta (null for the 2 pinned cols)
  const colMeta = useCallback((col: number): CellMeta | null => {
    if (col < 2) return null;
    const offset = col - 2;
    const seasonIdx = Math.floor(offset / FIELD_ORDER.length);
    const fieldIdx = offset % FIELD_ORDER.length;
    const season = seasons[seasonIdx];
    const field = FIELD_ORDER[fieldIdx];
    return { season, field, rowId: null };
  }, [seasons]);

  const cellKey = (row: number, col: number) => `${row}:${col}`;

  const isCellSelected = (row: number, col: number) =>
    selected.row === row && selected.col === col;
  const isCellEditing = (row: number, col: number) =>
    editing !== null && editing.row === row && editing.col === col;

  // Move selection, clamping to data columns (skip pinned style/desc cols when navigating)
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

  // ── Save handlers ──
  const writeSaveState = (key: string, next: SaveState) => {
    setSaveStates((prev) => {
      const n = new Map(prev);
      n.set(key, next);
      return n;
    });
    // Auto-clear "ok" after 1.5s
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

      // Parse input
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

      // No-op check
      const current = getCell(styleNumber, meta.season, meta.field).value ?? 0;
      if (Math.abs(current - numericValue) < 1e-6) {
        return;
      }

      // Require a name
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

  // ── Keyboard handling (global, when container focused) ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onKey = (e: KeyboardEvent) => {
      if (editing) return; // in edit mode, input handles keys

      // Copy
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
        case 'ArrowUp':
          moveSelection(-1, 0); e.preventDefault(); break;
        case 'ArrowDown':
          moveSelection(1, 0); e.preventDefault(); break;
        case 'ArrowLeft':
          moveSelection(0, -1); e.preventDefault(); break;
        case 'ArrowRight':
          moveSelection(0, 1); e.preventDefault(); break;
        case 'Tab':
          moveSelection(0, e.shiftKey ? -1 : 1); e.preventDefault(); break;
        case 'Enter': {
          // Enter edit mode if editable
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
          // Otherwise move down
          moveSelection(1, 0);
          e.preventDefault();
          break;
        }
        default:
          // Start typing to edit
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
  }, [editing, selected, rowStyles, seasons]);

  // Focus input when entering edit mode
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

  // ── Render helpers ──
  const renderHeader = () => {
    return (
      <tr className="bg-surface-tertiary">
        <th
          className="sticky left-0 top-0 z-30 bg-surface-tertiary border-b border-r border-gray-300 dark:border-gray-700 px-3 py-2 text-xs font-bold text-text-secondary uppercase tracking-wide min-w-[100px]"
        >
          Style #
        </th>
        <th
          className="sticky left-[100px] top-0 z-30 bg-surface-tertiary border-b border-r border-gray-300 dark:border-gray-700 px-3 py-2 text-xs font-bold text-text-secondary uppercase tracking-wide min-w-[220px]"
        >
          Description
        </th>
        {seasons.map((season) => {
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
  };

  const renderSubHeader = () => {
    return (
      <tr className="bg-surface-secondary">
        <th className="sticky left-0 top-[36px] z-30 bg-surface-secondary border-b border-r border-gray-300 dark:border-gray-700 px-3 py-1.5 min-w-[100px]" />
        <th className="sticky left-[100px] top-[36px] z-30 bg-surface-secondary border-b border-r border-gray-300 dark:border-gray-700 px-3 py-1.5 min-w-[220px]" />
        {seasons.map((season) =>
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
  };

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
      'px-2',
      'py-1',
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
        // double-click → edit
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

  // ── Render ──
  if (seasons.length === 0) {
    return (
      <div className="p-6 text-text-muted">
        <p>No seasons with pricing or cost data yet.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Formula-bar-ish header */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-300 dark:border-gray-700 bg-surface-tertiary text-sm">
        <span className="text-text-muted">Cell:</span>
        <span className="font-mono text-text-primary">
          {(() => {
            const styleNumber = rowStyles[selected.row];
            const meta = colMeta(selected.col);
            if (!styleNumber || !meta) return '—';
            return `${styleNumber} · ${meta.season} · ${FIELD_LABEL[meta.field]}`;
          })()}
        </span>
        <span className="text-text-muted ml-4">Value:</span>
        <span className="font-mono text-text-primary">
          {(() => {
            const styleNumber = rowStyles[selected.row];
            const meta = colMeta(selected.col);
            if (!styleNumber || !meta) return '—';
            const { value } = getCell(styleNumber, meta.season, meta.field);
            return formatCellValue(meta.field, value) || '(empty)';
          })()}
        </span>
        <span className="text-text-muted ml-auto text-xs">
          {totalRows.toLocaleString()} styles × {seasons.length} seasons · Tab / arrows to navigate · Enter to edit
        </span>
      </div>

      <div
        ref={containerRef}
        tabIndex={0}
        className="flex-1 overflow-auto bg-surface focus:outline-none"
      >
        <table className="border-separate border-spacing-0">
          <thead>
            {renderHeader()}
            {renderSubHeader()}
          </thead>
          <tbody>
            {rowStyles.map((_, row) => renderRow(row))}
          </tbody>
        </table>
      </div>

      {/* Name prompt modal */}
      {showNamePrompt && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => {
              setShowNamePrompt(false);
              setPendingSave(null);
            }}
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
                  if (e.key === 'Escape') {
                    setShowNamePrompt(false);
                    setPendingSave(null);
                  }
                }}
                placeholder="e.g. Shelby"
                className="w-full px-3 py-2 bg-surface-secondary border border-primary rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => {
                    setShowNamePrompt(false);
                    setPendingSave(null);
                  }}
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
