'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Sidebar, { ViewId, VIEW_LABELS } from '@/components/layout/Sidebar';
import AppHeader, { SearchSuggestion } from '@/components/layout/AppHeader';
import FilterBar from '@/components/layout/FilterBar';
import ErrorBoundary from '@/components/ErrorBoundary';
import StyleDetailPanel from '@/components/StyleDetailPanel';
import SmartImportModal from '@/components/SmartImportModal';
import PersistenceWarningModal from '@/components/PersistenceWarningModal';
import KeyboardShortcutsHelp from '@/components/KeyboardShortcutsHelp';
import { SalesLoadingContext } from '@/components/SalesLoadingBanner';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import retryDynamic from '@/lib/retryDynamic';

// Lazy-load view components with automatic retry on chunk load failure.
// retryDynamic wraps next/dynamic with 3 retries + cache-bust + auto-reload fallback.
const ExecutiveDashboardView = retryDynamic(() => import('@/components/views/ExecutiveDashboardView'));
const DashboardView = retryDynamic(() => import('@/components/views/DashboardView'));
const SeasonView = retryDynamic(() => import('@/components/views/SeasonView'));
const GridView = retryDynamic(() => import('@/components/views/GridView'));
const PullbackView = retryDynamic(() => import('@/components/views/PullbackView'));
const InvOpnMonthView = retryDynamic(() => import('@/components/views/InvOpnMonthView'));
const InvoiceMonthView = retryDynamic(() => import('@/components/views/InvoiceMonthView'));
const SeasonCompView = retryDynamic(() => import('@/components/views/SeasonCompView'));
const SalesView = retryDynamic(() => import('@/components/views/SalesView'));
const CostsView = retryDynamic(() => import('@/components/views/CostsView'));
const PricingView = retryDynamic(() => import('@/components/views/PricingView'));
const MarginsView = retryDynamic(() => import('@/components/views/MarginsView'));
const StyleMasterView = retryDynamic(() => import('@/components/views/StyleMasterView'));
const LineListView = retryDynamic(() => import('@/components/views/LineListView'));
const ValidationView = retryDynamic(() => import('@/components/views/ValidationView'));
const CustomerView = retryDynamic(() => import('@/components/views/CustomerView'));
const DataFlowView = retryDynamic(() => import('@/components/views/DataFlowView'));
const InventoryView = retryDynamic(() => import('@/components/views/InventoryView'));
const TopStylesChannelView = retryDynamic(() => import('@/components/views/TopStylesChannelView'));
const StyleColorPerfView = retryDynamic(() => import('@/components/views/StyleColorPerfView'));
const SellThroughView = retryDynamic(() => import('@/components/views/SellThroughView'));
const TariffView = retryDynamic(() => import('@/components/views/TariffView'));
const InvOpnSeasonView = retryDynamic(() => import('@/components/views/InvOpnSeasonView'));
const GeoHeatmapView = retryDynamic(() => import('@/components/views/GeoHeatmapView'));
const ForecastView = retryDynamic(() => import('@/components/views/ForecastView'));
const SourceFilesView = retryDynamic(() => import('@/components/views/SourceFilesView'));
import { Product, SalesRecord, PricingRecord, CostRecord, InventoryRecord, InventoryOHRecord, InventoryOHAggregations, InvoiceRecord } from '@/types/product';
import { clearAllData } from '@/lib/db';
import { exportViewToPdf } from '@/utils/exportPdf';
import { getViewExportData, ViewDataBundle } from '@/utils/exportViewData';
import { exportMultiSheetExcel } from '@/utils/exportData';
import { normalizeDivisionDesc } from '@/utils/divisionMap';
import { matchesFilter } from '@/utils/filters';
import { loadInvoicesFromCache, saveInvoicesToCache, clearInvoiceCache } from '@/lib/invoice-cache';

// Cache version - increment to invalidate cache
// v10: Bug fixes (memory leak, NaN guard, margin thresholds, show-more tables), dead code cleanup
const CACHE_VERSION = 'v10';
const CACHE_KEY = `kuhl-data-${CACHE_VERSION}`;

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

export interface SalesAggregations {
  byChannel: ChannelAggregation[];
  byCategory: CategoryAggregation[];
  byGender: GenderAggregation[];
  byCustomer: CustomerAggregation[];
}

interface InventoryAggregations {
  totalCount: number;
  byType: { movementType: string; count: number; totalQty: number; totalExtension: number }[];
  byWarehouse: { warehouse: string; count: number; totalQty: number; totalExtension: number }[];
  byPeriod: { period: string; count: number; totalQty: number; totalExtension: number }[];
}

// Lightweight cache — core data only (products, pricing, costs, inventory, aggregations)
// Sales (380K records, ~112MB JSON) are NEVER cached — always streamed from /api/snapshot
interface CachedCoreData {
  products: Product[];
  pricing: PricingRecord[];
  costs: CostRecord[];
  inventory?: InventoryRecord[];
  salesAggregations?: SalesAggregations;
  inventoryAggregations?: InventoryAggregations;
  timestamp: number;
}

// Cache helpers — core data only (~13MB, fits in localStorage)
function getCachedCore(): CachedCoreData | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const data = JSON.parse(cached) as CachedCoreData;
      // Cache valid for 1 hour
      if (Date.now() - data.timestamp < 60 * 60 * 1000) {
        return data;
      }
    }
  } catch (e) {
    console.warn('Cache read failed:', e);
  }
  return null;
}

function setCachedCore(data: Omit<CachedCoreData, 'timestamp'>) {
  try {
    localStorage.removeItem(CACHE_KEY);
    // Also clean up any old v5 cache that might be bloated with sales
    try { localStorage.removeItem('kuhl-data-v5'); } catch { /* ignore */ }

    const coreData = {
      products: data.products,
      pricing: data.pricing,
      costs: data.costs,
      inventory: data.inventory,
      salesAggregations: data.salesAggregations,
      inventoryAggregations: data.inventoryAggregations,
      timestamp: Date.now(),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(coreData));
  } catch (e) {
    console.warn('Cache write failed:', e);
    localStorage.removeItem(CACHE_KEY);
  }
}

function clearCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
    try { localStorage.removeItem('kuhl-data-v5'); } catch { /* ignore */ }
  } catch (e) {
    console.warn('Cache clear failed:', e);
  }
}

// ── Helper: fetch with timeout (prevents hanging on slow/dead servers) ──
async function fetchWithTimeout(url: string, options?: RequestInit & { timeout?: number }): Promise<Response> {
  const { timeout = 15000, ...fetchOptions } = options || {};
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...fetchOptions, signal: controller.signal });
    return res;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`Request timed out after ${Math.round(timeout / 1000)}s: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ── Helper: checked fetch for DB persistence batches ──
// Throws on non-OK response so callers know a batch failed.
async function checkedFetch(url: string, init: RequestInit): Promise<Response> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text().catch(() => '(no body)');
    throw new Error(`DB import failed (${res.status}): ${text}`);
  }
  return res;
}

// Retry wrapper with exponential backoff — reduces transient failures on batch imports
async function checkedFetchWithRetry(url: string, init: RequestInit, maxRetries = 3): Promise<Response> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await checkedFetch(url, init);
    } catch (err) {
      if (attempt === maxRetries) throw err;
      const delay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
      console.warn(`Batch request failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error('Unreachable');
}

// Abort controller ref shared between background loaders and import handlers.
// When an import starts we abort any in-flight background sales load.
let salesLoadAbort: AbortController | null = null;

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<SalesRecord[]>([]);
  const [pricing, setPricing] = useState<PricingRecord[]>([]);
  const [costs, setCosts] = useState<CostRecord[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [inventory, setInventory] = useState<InventoryRecord[]>([]);
  const [inventoryOH, setInventoryOH] = useState<InventoryOHRecord[]>([]);
  const [ohAggregations, setOHAggregations] = useState<InventoryOHAggregations | null>(null);
  const [salesAggregations, setSalesAggregations] = useState<SalesAggregations | null>(null);
  const [invAggregations, setInvAggregations] = useState<InventoryAggregations | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState<string>('Checking cache...');
  const [loadingProgress, setLoadingProgress] = useState<number>(0);
  const [loadingSlow, setLoadingSlow] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [sessionOnlyMode, setSessionOnlyMode] = useState(false);
  const [sessionOnlyTypes, setSessionOnlyTypes] = useState<string[]>([]);
  const [showPersistenceModal, setShowPersistenceModal] = useState(false);
  const [persistenceErrorDetail, setPersistenceErrorDetail] = useState('');
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesLoadingProgress, setSalesLoadingProgress] = useState('');
  const [dataTimestamp, setDataTimestamp] = useState<number | null>(null);

  // UI State
  const [activeView, setActiveView] = useState<ViewId>('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Filter state
  const [selectedSeason, setSelectedSeason] = useState<string>('');
  const [selectedDivision, setSelectedDivision] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedDesigner, setSelectedDesigner] = useState<string>('');
  const [selectedCustomerType, setSelectedCustomerType] = useState<string>('');
  const [selectedCustomer, setSelectedCustomer] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState<string>('');

  // Reset filters when navigating between views
  const handleViewChange = useCallback((view: ViewId) => {
    setActiveView(view);
    setSelectedDivision('');
    setSelectedCategory('');
    setSelectedDesigner('');
    setSelectedCustomerType('');
    setSelectedCustomer('');
    setSelectedMonth('');
    setSelectedYear('');
    setSearchQuery('');
  }, []);

  // Style detail panel
  const [selectedStyleNumber, setSelectedStyleNumber] = useState<string | null>(null);

  // Import modal
  const [showImportModal, setShowImportModal] = useState(false);

  // Ref for PDF export capture
  const viewContentRef = useRef<HTMLDivElement>(null);

  // Derive filter options from data
  const seasons = useMemo(() => {
    const all = new Set<string>();
    products.forEach(p => p.season && all.add(p.season));
    sales.forEach(s => s.season && all.add(s.season));
    invoices.forEach(i => i.season && all.add(i.season));
    // Filter out seasons before 2023 (year prefix < 23)
    return Array.from(all)
      .filter(s => {
        const yearMatch = s.match(/^(\d{2})/);
        return yearMatch ? parseInt(yearMatch[1], 10) >= 23 : false;
      })
      .sort();
  }, [products, sales, invoices]);

  const divisions = useMemo(() => {
    const DIVISION_CODE_TO_NAME: Record<string, string> = { '01': 'Men', '02': 'Women', '08': 'Unisex' };
    const all = new Set<string>();
    products.forEach(p => {
      if (!p.divisionDesc) return;
      all.add(DIVISION_CODE_TO_NAME[p.divisionDesc] || p.divisionDesc);
    });
    // Also extract divisions from sales when products aren't loaded yet
    if (all.size === 0) {
      sales.forEach(s => {
        if (!s.divisionDesc) return;
        all.add(DIVISION_CODE_TO_NAME[s.divisionDesc] || s.divisionDesc);
      });
    }
    return Array.from(all).sort();
  }, [products, sales]);

  const categories = useMemo(() => {
    const all = new Set<string>();
    products.forEach(p => p.categoryDesc && all.add(p.categoryDesc));
    // Also extract categories from sales when products aren't loaded yet
    if (all.size === 0) {
      sales.forEach(s => s.categoryDesc && all.add(s.categoryDesc));
    }
    return Array.from(all).sort();
  }, [products, sales]);

  const designers = useMemo(() => {
    const all = new Set<string>();
    products.forEach(p => p.designerName && all.add(p.designerName));
    return Array.from(all).sort();
  }, [products]);

  const customerTypes = useMemo(() => {
    const all = new Set<string>();
    sales.forEach(s => {
      if (s.customerType) {
        // customerType can be comma-separated
        s.customerType.split(',').forEach(ct => {
          const trimmed = ct.trim();
          if (trimmed) all.add(trimmed);
        });
      }
    });
    return Array.from(all).sort();
  }, [sales]);

  const customerNames = useMemo(() => {
    const all = new Set<string>();
    sales.forEach(s => s.customer && s.customer !== 'Unknown' && all.add(s.customer));
    return Array.from(all).sort();
  }, [sales]);

  // Derive available years and months from sales accounting periods / invoice dates
  const availableYears = useMemo(() => {
    const yrs = new Set<string>();
    sales.forEach(s => {
      // accountingPeriod format: "202601" (YYYYMM)
      if (s.accountingPeriod && s.accountingPeriod.length >= 4) {
        yrs.add(s.accountingPeriod.substring(0, 4));
      } else if (s.invoiceDate) {
        const d = new Date(s.invoiceDate);
        if (!isNaN(d.getTime())) yrs.add(String(d.getFullYear()));
      }
    });
    return Array.from(yrs).sort();
  }, [sales]);

  const availableMonths = useMemo(() => {
    const mos = new Set<string>();
    sales.forEach(s => {
      // Filter by selected year first (if one is set)
      let yr: string | null = null;
      let mo: string | null = null;
      if (s.accountingPeriod && s.accountingPeriod.length >= 6) {
        yr = s.accountingPeriod.substring(0, 4);
        mo = s.accountingPeriod.substring(4, 6);
      } else if (s.invoiceDate) {
        const d = new Date(s.invoiceDate);
        if (!isNaN(d.getTime())) {
          yr = String(d.getFullYear());
          mo = String(d.getMonth() + 1).padStart(2, '0');
        }
      }
      if (mo && matchesFilter(yr, selectedYear)) {
        mos.add(mo);
      }
    });
    return Array.from(mos).sort();
  }, [sales, selectedYear]);

  // Pre-filter sales by selected year/month so all views benefit automatically
  // ── Derived: stock-on-hand snapshot from the Inventory table ──
  // The InventoryView's "On-Hand" tab reads from `inventoryOH` (a Supabase-
  // era separate dataset). When users import the FG Inventory stock-by-size
  // report it lands in the regular Inventory table with movementType='OH';
  // bridge those rows into InventoryOHRecord shape so the On-Hand tab
  // populates without a schema migration.
  const derivedInventoryOH = useMemo<InventoryOHRecord[]>(() => {
    if (inventoryOH.length > 0) return inventoryOH; // explicit OH wins
    // Canonical sales-record division codes (01=Men's, 02=Women's,
    // 08=Unisex, 06=Accessories). Stored numerically to fit
    // InventoryOHRecord.division: number — consumers zero-pad to '01' etc.
    const divisionToCode = (name: string | null | undefined): number | undefined => {
      if (!name) return undefined;
      const n = name.toLowerCase();
      if (n.includes('men') && !n.includes('women')) return 1;
      if (n.includes('women')) return 2;
      if (n.includes('unisex')) return 8;
      if (n.includes('accessor')) return 6;
      return undefined;
    };
    const CATEGORY_DESC_TO_CODE: Record<string, string> = {
      'PANTS': 'PANT', 'SHORTS': 'SHOR', 'SHORT SLEEVE': 'SHRT', 'JACKET': 'JACK',
      'LONG SLEEVE': 'LONG', 'FLEECE': 'FLEE', 'HEADWEAR': 'HEAD', 'SWEATER': 'SWEA',
      'FLANNEL': 'FLAN', 'SLEEVELESS': 'SLEE', 'DRESS': 'DRES', 'SKORTS': 'SKOR',
      'VEST': 'VEST', 'UNDERWEAR': 'UNDE', 'LEGGINGS': 'LEGG', 'BASELAYER': 'BASE',
      'BAGS': 'BAGS', 'SKIRTS': 'SKIR', 'MISCELLANEOUS': 'MISC',
    };
    const categoryToCode = (desc: string | null | undefined): string | undefined => {
      if (!desc) return undefined;
      const d = desc.toUpperCase().trim();
      return CATEGORY_DESC_TO_CODE[d] || (d.length <= 4 ? d : d.slice(0, 4));
    };

    // ── Build lookup tables for season + cost backfill ──
    // Season inference: many OH reports omit season per row. We pick the
    // most recent season we have a Pricing record for, per style.
    // Cost backfill: the SKU-detail OH report has wholesale/MSRP but no
    // Std Cost. We use the latest landed cost from the Cost table.
    const seasonByStyle = new Map<string, string>();
    {
      // sortSeasons orders chronologically; iterate latest-last so the
      // map ends up holding the most recent season per style.
      const sorted = [...pricing].sort((a, b) => {
        // crude: 26FA > 26SP > 25FA > 25SP …
        const ax = (a.season || '').match(/(\d{2})(SP|FA)/);
        const bx = (b.season || '').match(/(\d{2})(SP|FA)/);
        if (!ax) return -1;
        if (!bx) return 1;
        const ay = parseInt(ax[1], 10), by = parseInt(bx[1], 10);
        if (ay !== by) return ay - by;
        return ax[2] === 'FA' ? 1 : -1;
      });
      for (const p of sorted) {
        if (p.styleNumber && p.season) seasonByStyle.set(p.styleNumber, p.season);
      }
    }
    // Cost fallback chain (most-authoritative first):
    //   1. Cost.landed (full build-up: FOB + duty + freight + tariff + overhead)
    //   2. Pricing.cost (set by cost-by-season pricing imports)
    //   3. Product.cost (catalog-level)
    // Within each source, take the most recent season we have.
    const costByStyle = new Map<string, number>();
    const seasonRank = (s: string | undefined): number => {
      const m = (s || '').match(/(\d{2})(SP|FA)/);
      if (!m) return -1;
      return parseInt(m[1], 10) * 10 + (m[2] === 'FA' ? 1 : 0);
    };
    // Tier 3: Product.cost (lowest priority — write first, overwritten by tiers 1/2)
    for (const p of products) {
      if (p.styleNumber && p.cost && p.cost > 0) costByStyle.set(p.styleNumber, p.cost);
    }
    // Tier 2: Pricing.cost (sorted oldest→newest so latest sticks)
    {
      const sorted = [...pricing].sort((a, b) => seasonRank(a.season) - seasonRank(b.season));
      for (const p of sorted) {
        if (p.styleNumber && p.cost && p.cost > 0) costByStyle.set(p.styleNumber, p.cost);
      }
    }
    // Tier 1: Cost.landed (overwrites the others — most authoritative)
    {
      const sorted = [...costs].sort((a, b) => seasonRank(a.season) - seasonRank(b.season));
      for (const c of sorted) {
        if (c.styleNumber && c.landed > 0) costByStyle.set(c.styleNumber, c.landed);
      }
    }

    return inventory
      .filter((r) => (r.movementType ?? '').toUpperCase() === 'OH')
      .map((r) => {
        let sizeBreakdown: Record<string, number> = {};
        if (r.sizePricing) {
          try {
            const parsed = JSON.parse(r.sizePricing);
            if (parsed && typeof parsed === 'object' && parsed.sizeBreakdown) {
              sizeBreakdown = parsed.sizeBreakdown;
            }
          } catch { /* not JSON, ignore */ }
        }
        // Backfill missing season + cost from latest pricing/cost records
        const inferredSeason = r.period ?? seasonByStyle.get(r.styleNumber);
        const inferredCost = (r.costPrice && r.costPrice > 0)
          ? r.costPrice
          : (costByStyle.get(r.styleNumber) ?? 0);
        return {
          id: r.id ?? `oh-${r.styleNumber}-${r.color ?? ''}-${r.warehouse ?? ''}`,
          snapshotDate: r.movementDate ?? new Date().toISOString(),
          styleNumber: r.styleNumber,
          styleDesc: r.styleDesc,
          season: inferredSeason ?? undefined,
          category: categoryToCode(r.styleCategory),
          division: divisionToCode(r.divisionDesc),
          prodType: undefined,
          prodLine: undefined,
          stdPrice: r.wholesalePrice ?? 0,
          msrp: r.msrp ?? 0,
          outletMsrp: 0,
          stdCost: inferredCost,
          color: r.color,
          colorDesc: r.colorDesc,
          colorType: r.colorType ?? undefined,
          segmentCode: r.segmentCode ?? undefined,
          garmentClass: undefined,
          garmentClassDesc: undefined,
          warehouse: r.warehouse ? Number(r.warehouse) || undefined : undefined,
          sizeType: undefined,
          inventoryClassification: r.labelDesc ?? undefined,
          sizeBreakdown,
          totalQty: r.qty ?? 0,
        };
      });
  }, [inventoryOH, inventory, pricing, costs, products]);

  const dateFilteredSales = useMemo(() => {
    if (!selectedYear && !selectedMonth) return sales;
    return sales.filter(s => {
      let yr: string | null = null;
      let mo: string | null = null;
      if (s.accountingPeriod && s.accountingPeriod.length >= 6) {
        yr = s.accountingPeriod.substring(0, 4);
        mo = s.accountingPeriod.substring(4, 6);
      } else if (s.invoiceDate) {
        const d = new Date(s.invoiceDate);
        if (!isNaN(d.getTime())) {
          yr = String(d.getFullYear());
          mo = String(d.getMonth() + 1).padStart(2, '0');
        }
      }
      // If there's no date info on this record, keep it (don't hide non-invoice data)
      if (!yr && !mo) return true;
      if (!matchesFilter(yr, selectedYear)) return false;
      if (!matchesFilter(mo, selectedMonth)) return false;
      return true;
    });
  }, [sales, selectedYear, selectedMonth]);

  // Build lookups from booking/product data to enrich invoice records.
  // Invoice Excel files are missing customerType, divisionDesc, etc.
  // We can inherit these from booking data using customer name + style number.
  const invoiceEnrichment = useMemo(() => {
    const customerTypeMap = new Map<string, string>();
    const styleInfoMap = new Map<string, { divisionDesc: string; categoryDesc: string }>();

    // From booking sales: customer → customerType, style → division/category
    sales.forEach(s => {
      if (s.customer && s.customerType && !customerTypeMap.has(s.customer)) {
        customerTypeMap.set(s.customer, s.customerType);
      }
      if (s.styleNumber && s.divisionDesc && !styleInfoMap.has(s.styleNumber)) {
        styleInfoMap.set(s.styleNumber, {
          divisionDesc: s.divisionDesc,
          categoryDesc: s.categoryDesc || '',
        });
      }
    });

    // From products: style → division/category (fills gaps booking data might miss)
    products.forEach(p => {
      if (p.styleNumber && p.divisionDesc && !styleInfoMap.has(p.styleNumber)) {
        styleInfoMap.set(p.styleNumber, {
          divisionDesc: p.divisionDesc,
          categoryDesc: p.categoryDesc || '',
        });
      }
    });

    return { customerTypeMap, styleInfoMap };
  }, [sales, products]);

  // Invoice-only sales for Geo Heat Map — records with an invoiceNumber are invoice data.
  // Enrich with missing fields inherited from booking/product data.
  const invoiceOnlySales = useMemo(() => {
    const { customerTypeMap, styleInfoMap } = invoiceEnrichment;

    return dateFilteredSales
      .filter(s => s.invoiceNumber != null && s.invoiceNumber !== '')
      .map(s => {
        const patches: Partial<SalesRecord> = {};
        let needsPatch = false;

        // Inherit customerType from booking data by customer name
        if (!s.customerType && s.customer && customerTypeMap.has(s.customer)) {
          patches.customerType = customerTypeMap.get(s.customer)!;
          needsPatch = true;
        }

        // Normalize division codes to display names
        if (s.divisionDesc) {
          const normalized = normalizeDivisionDesc(s.divisionDesc);
          if (normalized !== s.divisionDesc) {
            patches.divisionDesc = normalized;
            needsPatch = true;
          }
        } else if (s.styleNumber) {
          const info = styleInfoMap.get(s.styleNumber);
          if (info?.divisionDesc) {
            patches.divisionDesc = info.divisionDesc;
            needsPatch = true;
          }
        }

        // Inherit categoryDesc if missing
        if (!s.categoryDesc && s.styleNumber) {
          const info = styleInfoMap.get(s.styleNumber);
          if (info?.categoryDesc) {
            patches.categoryDesc = info.categoryDesc;
            needsPatch = true;
          }
        }

        return needsPatch ? { ...s, ...patches } : s;
      });
  }, [dateFilteredSales, invoiceEnrichment]);

  // Enrich invoices (from Invoice table) with customerType/division/category from sales/products
  const enrichedInvoices = useMemo(() => {
    const { customerTypeMap, styleInfoMap } = invoiceEnrichment;
    return invoices.map(inv => {
      const patches: Partial<InvoiceRecord> = {};
      let needsPatch = false;

      if (!inv.customerType && inv.customer && customerTypeMap.has(inv.customer)) {
        patches.customerType = customerTypeMap.get(inv.customer)!;
        needsPatch = true;
      }

      // Normalize division: convert raw codes (01, 02, 06, 08) to display names
      if (inv.divisionDesc) {
        const normalized = normalizeDivisionDesc(inv.divisionDesc);
        if (normalized !== inv.divisionDesc) {
          patches.divisionDesc = normalized;
          needsPatch = true;
        }
      } else if (inv.styleNumber) {
        const info = styleInfoMap.get(inv.styleNumber);
        if (info?.divisionDesc) { patches.divisionDesc = info.divisionDesc; needsPatch = true; }
      }

      if (!inv.categoryDesc && inv.styleNumber) {
        const info = styleInfoMap.get(inv.styleNumber);
        if (info?.categoryDesc) { patches.categoryDesc = info.categoryDesc; needsPatch = true; }
      }

      return needsPatch ? { ...inv, ...patches } : inv;
    });
  }, [invoices, invoiceEnrichment]);

  // Invoice-specific filter options — the Geo Heat Map only shows invoice data,
  // so its filter dropdowns should reflect what's in that dataset (not all sales).
  // Combine invoiceOnlySales (legacy) + enrichedInvoices (new Invoice table) for filter options
  const allInvoiceData = useMemo(() => {
    const combined: Array<{ customerType?: string; customer?: string; divisionDesc?: string; categoryDesc?: string }> = [
      ...invoiceOnlySales,
      ...enrichedInvoices,
    ];
    return combined;
  }, [invoiceOnlySales, enrichedInvoices]);

  const invoiceCustomerTypes = useMemo(() => {
    const all = new Set<string>();
    allInvoiceData.forEach(s => {
      if (s.customerType) {
        s.customerType.split(',').forEach(ct => {
          const trimmed = ct.trim();
          if (trimmed) all.add(trimmed);
        });
      }
    });
    return Array.from(all).sort();
  }, [allInvoiceData]);

  const invoiceCustomerNames = useMemo(() => {
    const all = new Set<string>();
    allInvoiceData.forEach(s => s.customer && s.customer !== 'Unknown' && all.add(s.customer));
    return Array.from(all).sort();
  }, [allInvoiceData]);

  const invoiceDivisions = useMemo(() => {
    const all = new Set<string>();
    allInvoiceData.forEach(s => s.divisionDesc && all.add(s.divisionDesc));
    return Array.from(all).sort();
  }, [allInvoiceData]);

  const invoiceCategories = useMemo(() => {
    const all = new Set<string>();
    allInvoiceData.forEach(s => s.categoryDesc && all.add(s.categoryDesc));
    return Array.from(all).sort();
  }, [allInvoiceData]);

  // ── Search suggestions — combine styles, customers, categories, colors ──
  const searchSuggestions = useMemo((): SearchSuggestion[] => {
    if (!searchQuery || searchQuery.length < 2) return [];
    const q = searchQuery.toLowerCase();
    const results: SearchSuggestion[] = [];

    // Styles
    const seenStyles = new Set<string>();
    products.forEach(p => {
      if (seenStyles.size >= 5) return;
      const match = p.styleNumber?.toLowerCase().includes(q) || p.styleDesc?.toLowerCase().includes(q);
      if (match && p.styleNumber && !seenStyles.has(p.styleNumber)) {
        seenStyles.add(p.styleNumber);
        results.push({ type: 'style', label: p.styleDesc || p.styleNumber, sublabel: p.styleNumber, value: p.styleNumber });
      }
    });

    // Customers
    const seenCustomers = new Set<string>();
    sales.forEach(s => {
      if (seenCustomers.size >= 5) return;
      if (s.customer && s.customer !== 'Unknown' && s.customer.toLowerCase().includes(q) && !seenCustomers.has(s.customer)) {
        seenCustomers.add(s.customer);
        results.push({ type: 'customer', label: s.customer, sublabel: s.customerType || undefined, value: s.customer });
      }
    });

    // Categories
    categories.forEach(cat => {
      if (results.filter(r => r.type === 'category').length >= 5) return;
      if (cat.toLowerCase().includes(q)) {
        results.push({ type: 'category', label: cat, value: cat });
      }
    });

    // Colors
    const seenColors = new Set<string>();
    products.forEach(p => {
      if (seenColors.size >= 5) return;
      if (p.colorDesc && p.colorDesc.toLowerCase().includes(q) && !seenColors.has(p.colorDesc)) {
        seenColors.add(p.colorDesc);
        results.push({ type: 'color', label: p.colorDesc, sublabel: p.styleNumber, value: p.colorDesc });
      }
    });

    return results;
  }, [searchQuery, products, sales, categories]);

  // Handle search suggestion click
  const handleSuggestionClick = useCallback((suggestion: SearchSuggestion) => {
    if (suggestion.type === 'style') {
      setSelectedStyleNumber(suggestion.value);
    } else {
      setSearchQuery(suggestion.value);
    }
  }, []);

  // ── Keyboard shortcuts ──
  const searchInputRef = useRef<HTMLInputElement>(null);

  useKeyboardShortcuts({
    onSearch: () => {
      // Focus the search input in AppHeader
      const input = document.querySelector<HTMLInputElement>('header input[type="text"]');
      input?.focus();
    },
    onEscape: () => {
      setSelectedStyleNumber(null);
    },
  });

  // Record counts for sidebar
  const recordCounts = useMemo(() => ({
    products: products.length,
    sales: sales.length,
    costs: costs.length,
  }), [products.length, sales.length, costs.length]);

  // ── Helper: yield to event loop so React can paint status updates ──
  const tick = () => new Promise<void>(r => setTimeout(r, 0));

  // Load data on mount
  useEffect(() => {
    let cancelled = false;

    // ── Helper: load sales progressively from /api/data?salesOnly=true ──
    const loadSalesProgressively = async () => {
      const controller = new AbortController();
      salesLoadAbort = controller;
      const PAGE_SIZE = 10000;
      let page = 0;
      let allSales: SalesRecord[] = [];
      let totalPages = 1;
      setSalesLoading(true);
      setSalesLoadingProgress('Loading sales...');
      while (page < totalPages) {
        if (controller.signal.aborted) { console.log('Sales load aborted by import'); break; }
        try {
          const res = await fetch(`/api/data?salesOnly=true&salesPage=${page}&salesPageSize=${PAGE_SIZE}`, { signal: controller.signal });
          if (!res.ok) break;
          const result = await res.json();
          if (!result.success || !result.sales) break;
          allSales = [...allSales, ...result.sales];
          totalPages = result.totalPages || 1;
          setSales(allSales);
          setSalesLoadingProgress(`Loading sales... ${Math.round(((page + 1) / totalPages) * 100)}% (${allSales.length.toLocaleString()} records)`);
          console.log(`Sales page ${page + 1}/${totalPages}: ${allSales.length} total`);
          page++;
        } catch (err: unknown) {
          if (err instanceof DOMException && err.name === 'AbortError') { console.log('Sales load aborted'); break; }
          console.warn('Sales page fetch failed:', err);
          break;
        }
      }
      salesLoadAbort = null;
      setSalesLoading(false);
      setSalesLoadingProgress('');
      return allSales;
    };

    // ── Helper: try loading sales from per-season snapshot files ──
    const loadSalesFromSnapshot = async (): Promise<boolean> => {
      try {
        setSalesLoading(true);
        setSalesLoadingProgress('Loading sales manifest...');

        // Try new per-season format first (manifest + per-season files)
        const manifestRes = await fetchWithTimeout('/data-sales-manifest.json', { timeout: 15000 });
        if (manifestRes.ok) {
          const manifest = await manifestRes.json();
          if (manifest.seasons && manifest.seasons.length > 0) {
            setSalesLoadingProgress(`Loading sales (${manifest.seasons.length} seasons)...`);
            // Load all season files in parallel from static CDN
            const seasonPromises = manifest.seasons.map(async (season: string) => {
              const res = await fetchWithTimeout(`/data-sales-${season}.json`, { timeout: 60000 });
              if (res.ok) return res.json();
              return [];
            });
            const seasonArrays = await Promise.all(seasonPromises);
            const allSalesData = seasonArrays.flat();
            if (allSalesData.length > 0) {
              setSales(allSalesData);
              setSalesLoading(false);
              setSalesLoadingProgress('');
              console.log(`Sales from snapshot: ${allSalesData.length} records (${manifest.seasons.length} seasons)`);
              return true;
            }
          }
        }

        // Fallback: old single-file format via API
        setSalesLoadingProgress('Loading sales from snapshot...');
        const res = await fetchWithTimeout('/api/snapshot?file=sales', { timeout: 120000 });
        if (res.ok) {
          const salesData = await res.json();
          const salesArray = Array.isArray(salesData) ? salesData : salesData?.sales;
          if (Array.isArray(salesArray) && salesArray.length > 0) {
            setSales(salesArray);
            setSalesLoading(false);
            setSalesLoadingProgress('');
            console.log(`Sales from snapshot: ${salesArray.length} records`);
            return true;
          }
        }
        setSalesLoading(false);
        setSalesLoadingProgress('');
      } catch {
        setSalesLoading(false);
        setSalesLoadingProgress('');
        /* snapshot not available */
      }
      return false;
    };

    // ── Helper: load invoices from DB API (paginated) or snapshot file ──
    // Invoice dataset is ~120k rows, which exceeds Vercel's 4.5 MB serverless
    // response limit. The API returns pages of ~4k rows; we loop until done
    // and progressively update state so the UI can start rendering partway.
    const loadInvoicesFromAnySource = async (opts?: { skipCache?: boolean }) => {
      // Probe the server's lightweight version endpoint up-front. If our
      // cached data carries the same version string, the DB hasn't changed
      // since we wrote it and we can skip the 30-90s pagination entirely.
      let serverVersion: string | null = null;
      try {
        const vRes = await fetch('/api/data/invoices/version');
        if (vRes.ok) {
          const vData = await vRes.json();
          serverVersion = vData?.version ?? null;
        }
      } catch { /* non-fatal — proceed without version check */ }

      // Try 0: IndexedDB cache from a prior session.
      let hasCached = false;
      let cacheIsCurrent = false;
      if (!opts?.skipCache) {
        try {
          const cached = await loadInvoicesFromCache();
          if (cached && cached.invoices.length > 0) {
            setInvoices(cached.invoices);
            hasCached = true;
            // Cache is "current" when the server's version matches what we
            // saved AND the cache was a complete (non-partial) write. A
            // partial cache (interrupted load) always re-fetches to top up.
            cacheIsCurrent = !!serverVersion && cached.version === serverVersion && !cached.partial;
            console.log(
              `Invoices loaded from IndexedDB cache: ${cached.invoices.length}` +
              ` (age: ${Math.round(cached.ageMs / 1000)}s, stale: ${cached.stale},` +
              ` version: ${cached.version ?? 'pre-versioning'} vs server ${serverVersion ?? '?'},` +
              ` partial: ${cached.partial})`,
            );
            if (cacheIsCurrent) return; // server version matches → skip fetch
            // Otherwise: refresh in background without clobbering the rendered set
          }
        } catch { /* non-fatal */ }
      }

      // Try 1: Database API. Page size 5000 (max) + 4-way parallel fetch so
      // 1M+ rows finish in ~30s instead of 5min.
      try {
        const pageSize = 5000;
        // First fetch tells us total → we then fan out.
        const firstRes = await fetch(`/api/data/invoices?page=1&pageSize=${pageSize}`);
        if (!firstRes.ok) throw new Error(`HTTP ${firstRes.status}`);
        const firstResult = await firstRes.json();
        const firstBatch: InvoiceRecord[] = firstResult.invoices ?? [];
        const total: number = firstResult.total ?? firstBatch.length;
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        const all: InvoiceRecord[] = new Array(total);
        firstBatch.forEach((inv, i) => { all[i] = inv; });
        if (!hasCached) setInvoices(firstBatch);

        // Fetch remaining pages in parallel windows of 4. Checkpoint the
        // cache every CHECKPOINT_WINDOWS so an interrupted load (closed
        // tab, network drop) leaves usable data behind. Marked partial so
        // the next visit re-fetches to top up rather than trusting it.
        const PARALLEL = 4;
        const CHECKPOINT_WINDOWS = 10; // ~200K rows between checkpoint writes
        const pagesNeeded: number[] = [];
        for (let p = 2; p <= totalPages; p++) pagesNeeded.push(p);
        let writeCursor = firstBatch.length;
        let windowsSinceCheckpoint = 0;
        while (pagesNeeded.length > 0) {
          const window = pagesNeeded.splice(0, PARALLEL);
          const results = await Promise.all(
            window.map(p =>
              fetch(`/api/data/invoices?page=${p}&pageSize=${pageSize}`)
                .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
            )
          );
          for (const result of results) {
            const batch: InvoiceRecord[] = result.invoices ?? [];
            for (const inv of batch) {
              all[writeCursor++] = inv;
            }
          }
          if (!hasCached) setInvoices(all.slice(0, writeCursor));
          windowsSinceCheckpoint++;
          if (windowsSinceCheckpoint >= CHECKPOINT_WINDOWS && pagesNeeded.length > 0) {
            windowsSinceCheckpoint = 0;
            const checkpointSlice = all.slice(0, writeCursor).filter(Boolean);
            // Fire-and-forget — don't block pagination on disk I/O
            saveInvoicesToCache(checkpointSlice, { version: serverVersion, partial: true })
              .catch(() => { /* non-fatal */ });
          }
        }
        const final = all.slice(0, writeCursor).filter(Boolean);
        console.log(`Invoices loaded from DB API: ${final.length} (parallel x${PARALLEL}, pageSize ${pageSize})`);
        setInvoices(final);
        saveInvoicesToCache(final, { version: serverVersion, partial: false })
          .catch(() => { /* non-fatal */ });
        return;
      } catch (err) {
        console.warn('DB API invoice load failed, trying snapshot:', err);
      }

      // Try 2: Static snapshot file (fallback if API is down)
      try {
        const res = await fetch('/data-invoices.json');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            console.log(`Invoices loaded from snapshot: ${data.length}`);
            setInvoices(data);
            return;
          }
        }
      } catch { /* fall through */ }

      console.warn('No invoice data available from any source');
    };

    // ── Helper: apply core data to state ──
    const applyCoreData = (core: {
      products: Product[]; pricing: PricingRecord[]; costs: CostRecord[];
      inventory?: InventoryRecord[]; inventoryOH?: InventoryOHRecord[];
      invoices?: InvoiceRecord[];
      salesAggregations?: SalesAggregations | null; inventoryAggregations?: InventoryAggregations | null;
      ohAggregations?: InventoryOHAggregations | null;
    }) => {
      setProducts(core.products);
      setPricing(core.pricing);
      setCosts(core.costs);
      if (core.inventory) setInventory(core.inventory);
      if (core.inventoryOH) setInventoryOH(core.inventoryOH);
      if (core.salesAggregations) setSalesAggregations(core.salesAggregations);
      if (core.inventoryAggregations) setInvAggregations(core.inventoryAggregations);
      if (core.ohAggregations) setOHAggregations(core.ohAggregations);
      if (core.invoices && core.invoices.length > 0) {
        setInvoices(core.invoices);
      } else {
        // Invoice data lives in separate file or DB — always load it
        loadInvoicesFromAnySource();
      }
      setSales([]);
      setDataTimestamp(Date.now());
    };

    async function initializeData() {
      if (cancelled) return;
      // Show "taking too long" controls after 5 seconds
      setLoadingSlow(false);
      const slowTimer = setTimeout(() => setLoadingSlow(true), 5000);

      try {
        // ── Step 1: Check localStorage cache (synchronous, ~instant) ──
        setLoadingStatus('Checking cache...');
        setLoadingProgress(5);
        await tick(); // let React paint the initial status
        if (cancelled) { clearTimeout(slowTimer); return; }

        const cached = getCachedCore();
        if (cached) {
          console.log('Core data from cache, loading sales...');
          applyCoreData(cached);
          setLoadingProgress(80);
          setIsLoading(false); // Show UI immediately — sales load in background
          clearTimeout(slowTimer);
          setLoadingSlow(false);

          // OH data is too large for localStorage — fetch in background
          fetchWithTimeout('/api/data', { timeout: 30000 })
            .then(r => r.ok ? r.json() : null)
            .then(d => {
              if (d?.data?.inventoryOH) setInventoryOH(d.data.inventoryOH);
              if (d?.ohAggregations) setOHAggregations(d.ohAggregations);
              if (d?.inventoryAggregations) setInvAggregations(d.inventoryAggregations);
            })
            .catch(() => console.warn('Background OH fetch failed'));

          const gotSnapshot = await loadSalesFromSnapshot();
          if (!gotSnapshot) await loadSalesProgressively();
          return;
        }

        // ── Step 2: No cache — try snapshot API (local dev) ──
        setLoadingStatus('Loading data...');
        setLoadingProgress(10);
        await tick();
        if (cancelled) { clearTimeout(slowTimer); return; }

        try {
          const coreRes = await fetchWithTimeout('/api/snapshot?file=core', { timeout: 15000 });
          if (coreRes.ok) {
            const core = await coreRes.json();
            if (core.success && (core.counts?.products > 0 || core.counts?.sales > 0)) {
              console.log('Core data from snapshot:', core.counts);
              setLoadingProgress(70);

              applyCoreData({
                products: core.data.products || [],
                pricing: core.data.pricing || [],
                costs: core.data.costs || [],
                inventory: core.data.inventory || [],
                inventoryOH: core.data.inventoryOH || [],
                salesAggregations: core.salesAggregations,
                inventoryAggregations: core.inventoryAggregations,
                ohAggregations: core.ohAggregations,
              });

              setLoadingProgress(80);
              setIsLoading(false);
              clearTimeout(slowTimer);
              setLoadingSlow(false);

              setCachedCore({
                products: core.data.products || [], pricing: core.data.pricing || [], costs: core.data.costs || [],
                inventory: core.data.inventory || [],
                salesAggregations: core.salesAggregations || undefined,
                inventoryAggregations: core.inventoryAggregations || undefined,
              });

              // Load invoices from snapshot or DB
              loadInvoicesFromAnySource();

              const gotSnapshot = await loadSalesFromSnapshot();
              if (!gotSnapshot) await loadSalesProgressively();
              return;
            }
          }
        } catch (snapshotErr) {
          console.log('Snapshot not available:', snapshotErr);
        }

        // ── Step 3: No snapshot — try database API (Vercel production) ──
        setLoadingStatus('Loading from database...');
        setLoadingProgress(20);
        await tick();
        if (cancelled) { clearTimeout(slowTimer); return; }

        try {
          const dbResponse = await fetchWithTimeout('/api/data', { timeout: 30000 });
          if (dbResponse.ok) {
            const dbResult = await dbResponse.json();
            if (dbResult.success && (dbResult.counts?.products > 0 || dbResult.counts?.sales > 0)) {
              console.log('Core data from database:', dbResult.counts);
              setLoadingProgress(70);

              applyCoreData({
                products: dbResult.data.products || [],
                pricing: dbResult.data.pricing || [],
                costs: dbResult.data.costs || [],
                inventory: dbResult.data.inventory || [],
                inventoryOH: dbResult.data.inventoryOH || [],
                salesAggregations: dbResult.salesAggregations,
                inventoryAggregations: dbResult.inventoryAggregations,
                ohAggregations: dbResult.ohAggregations,
              });
              setSales(dbResult.data.sales || []);

              setLoadingProgress(80);
              setIsLoading(false);
              clearTimeout(slowTimer);
              setLoadingSlow(false);

              setCachedCore({
                products: dbResult.data.products || [], pricing: dbResult.data.pricing || [], costs: dbResult.data.costs || [],
                inventory: dbResult.data.inventory || [],
                salesAggregations: dbResult.salesAggregations || undefined,
                inventoryAggregations: dbResult.inventoryAggregations || undefined,
              });

              if ((dbResult.data.sales || []).length === 0 && dbResult.counts.sales > 0) {
                console.log(`Loading ${dbResult.counts.sales} sales progressively...`);
                await loadSalesProgressively();
              }
              return;
            }
          }
        } catch (dbErr) {
          console.log('Database not available:', dbErr);
        }

        // ── Step 4: Fallback — try Excel files (local dev only) ──
        setLoadingStatus('Checking for local data files...');
        setLoadingProgress(20);
        await tick();
        if (cancelled) { clearTimeout(slowTimer); return; }

        try {
          const response = await fetchWithTimeout('/api/load-data', { timeout: 120000 });
          if (response.ok) {
            setLoadingStatus('Processing data...');
            setLoadingProgress(70);
            const result = await response.json();
            if (result.success) {
              setProducts(result.data.products || []);
              setSales(result.data.sales || []);
              setPricing(result.data.pricing || []);
              setCosts(result.data.costs || []);
              setInventory(result.data.inventory || []);
              setLoadingProgress(100);
              setIsLoading(false);
              return;
            }
          }
        } catch (excelErr) {
          console.log('Excel files not available:', excelErr);
        }

        // ── No data source worked — show empty state ──
        setLoadingStatus('Ready - Import data to get started');
        setLoadingProgress(100);
        setIsLoading(false);
      } catch (err) {
        console.error('Failed to initialize data:', err);
        setLoadingStatus('Ready - Import data to get started');
        setIsLoading(false);
      } finally {
        clearTimeout(slowTimer);
        setLoadingSlow(false);
      }
    }

    initializeData();
    return () => { cancelled = true; };
  }, []);

  // Handle refresh
  const handleRefresh = async () => {
    if (confirm('Reload data from Excel files? This will clear the cache and reload.')) {
      clearCache();
      setIsLoading(true);
      await clearAllData();
      window.location.reload();
    }
  };

  // ── Export handlers ────────────────────────────────────────────────
  const handleExportPdf = useCallback(async () => {
    const el = viewContentRef.current;
    if (!el) return;
    await exportViewToPdf(el, VIEW_LABELS[activeView] || activeView);
  }, [activeView]);

  const handleExportExcel = useCallback(() => {
    const bundle: ViewDataBundle = {
      products,
      sales: dateFilteredSales,
      pricing,
      costs,
      inventory,
      selectedSeason,
      selectedDivision,
      selectedCategory,
      searchQuery,
    };
    const result = getViewExportData(activeView, bundle);
    if (!result) {
      alert('Excel export is not available for this view. Use PDF export instead.');
      return;
    }
    exportMultiSheetExcel(result.sheets, result.filename);
  }, [activeView, products, dateFilteredSales, pricing, costs, inventory, selectedSeason, selectedDivision, selectedCategory, searchQuery]);

  // Handle style click
  const handleStyleClick = (styleNumber: string) => {
    setSelectedStyleNumber(styleNumber);
  };

  // Called by StyleEditModal after a successful save. Replace the matching
  // cost in local state (no full re-fetch) and sync to localStorage.
  const handleCostUpdated = (updated: CostRecord) => {
    setCosts((prev) => {
      const next = prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c));
      // Keep the cached-core snapshot in sync
      setCachedCore({ products, pricing, costs: next, inventory });
      return next;
    });
  };

  // Same pattern for inline pricing edits.
  const handlePricingUpdated = (updated: PricingRecord) => {
    setPricing((prev) => {
      const next = prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p));
      setCachedCore({ products, pricing: next, costs, inventory });
      return next;
    });
  };

  // Handle sales-only import (all seasons at once)
  const handleSalesOnlyImport = async (data: {
    sales: Record<string, unknown>[];
  }) => {
    // Cancel any background sales loading to prevent race conditions
    if (salesLoadAbort) { salesLoadAbort.abort(); salesLoadAbort = null; }
    setImportError(null);
    setSessionOnlyMode(false);
    setSessionOnlyTypes([]);
    console.log('Importing sales-only data:', data.sales.length, 'records');

    // Replace all sales with new data
    const newSales = data.sales as unknown as SalesRecord[];
    setSales(newSales);

    // Invalidate cache — sales aggregations are now stale
    try { localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }

    // Persist to database (full refresh - no season filter)
    try {
      const BATCH_SIZE = 10000;
      const totalBatches = Math.ceil(data.sales.length / BATCH_SIZE);
      console.log(`Importing ${data.sales.length} sales records in ${totalBatches} batches`);

      for (let i = 0; i < data.sales.length; i += BATCH_SIZE) {
        const batch = data.sales.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        console.log(`Importing sales batch ${batchNum}/${totalBatches}`);

        await checkedFetchWithRetry('/api/data/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'sales',
            data: batch,
            fileName: `full_sales_import_batch_${batchNum}`,
            replaceExisting: i === 0,
          }),
        });
      }
      console.log('Sales data persisted to database');
      try { await fetch('/api/deploy-hook', { method: 'POST' }); } catch { /* non-blocking */ }
    } catch (dbErr) {
      const detail = dbErr instanceof Error ? dbErr.message : String(dbErr);
      console.error('Sales DB persist error:', detail);
      setSessionOnlyMode(true);
      setSessionOnlyTypes(prev => [...new Set([...prev, 'Sales'])]);
      setPersistenceErrorDetail(detail);
      setShowPersistenceModal(true);
    }
  };

  // Handle sales REPLACE import - delete existing sales for specified seasons, then insert new
  const handleSalesReplaceImport = async (data: {
    sales: Record<string, unknown>[];
    seasons: string[];
  }) => {
    if (!data.sales || !Array.isArray(data.sales)) {
      console.warn('handleSalesReplaceImport called with no sales data — ignoring');
      return;
    }
    // Cancel any background sales loading to prevent race conditions
    if (salesLoadAbort) { salesLoadAbort.abort(); salesLoadAbort = null; }
    setImportError(null);
    setSessionOnlyMode(false);
    setSessionOnlyTypes([]);
    console.log('REPLACE import:', data.sales.length, 'sales records for seasons:', data.seasons);

    // Keep sales from seasons NOT being replaced
    const seasonsSet = new Set(data.seasons);
    const salesToKeep = sales.filter(s => !seasonsSet.has(s.season));
    const newSales = data.sales as unknown as SalesRecord[];
    const finalSales = [...salesToKeep, ...newSales];

    setSales(finalSales);

    // Invalidate cache — sales aggregations are now stale
    try { localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }

    // Persist to database — process one season at a time (delete + insert)
    // so a failure mid-way doesn't wipe seasons we haven't re-inserted yet
    try {
      const BATCH_SIZE = 2000; // Small enough to complete within Vercel's timeout
      const salesBySeason: Record<string, Record<string, unknown>[]> = {};
      for (const s of data.sales) {
        const season = (s.season as string) || 'Unknown';
        if (!salesBySeason[season]) salesBySeason[season] = [];
        salesBySeason[season].push(s);
      }

      const seasonList = Object.keys(salesBySeason);
      console.log(`Persisting ${data.sales.length} sales across ${seasonList.length} seasons in ${BATCH_SIZE}-record chunks`);

      for (const season of seasonList) {
        const seasonSales = salesBySeason[season];
        // First batch for this season: delete existing + insert (replaceExisting: true)
        // Subsequent batches: append only (replaceExisting: false)
        const totalBatches = Math.ceil(seasonSales.length / BATCH_SIZE);

        for (let i = 0; i < seasonSales.length; i += BATCH_SIZE) {
          const batch = seasonSales.slice(i, i + BATCH_SIZE);
          const batchNum = Math.floor(i / BATCH_SIZE) + 1;
          const isFirstBatch = i === 0;

          console.log(`${season} batch ${batchNum}/${totalBatches} (${batch.length} records${isFirstBatch ? ', replacing' : ''})`);

          await checkedFetchWithRetry('/api/data/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'sales',
              season,
              data: batch,
              fileName: `sales_${season}_batch_${batchNum}`,
              replaceExisting: isFirstBatch,
            }),
          });
        }
        console.log(`✓ ${season}: ${seasonSales.length} records saved`);
      }

      console.log('Sales REPLACE import complete');
      // Trigger snapshot rebuild after successful DB write
      try { await fetch('/api/deploy-hook', { method: 'POST' }); } catch { /* non-blocking */ }
    } catch (dbErr) {
      const detail = dbErr instanceof Error ? dbErr.message : String(dbErr);
      console.error('Sales DB persist error:', detail);
      setSessionOnlyMode(true);
      setSessionOnlyTypes(prev => [...new Set([...prev, 'Sales'])]);
      setPersistenceErrorDetail(detail);
      setShowPersistenceModal(true);
    }
  };

  // Handle invoice import — writes to separate Invoice table, never touches Sales
  const handleInvoiceImport = async (data: {
    invoices: Record<string, unknown>[];
    seasons: string[];
  }) => {
    if (!data.invoices || !Array.isArray(data.invoices)) {
      console.warn('handleInvoiceImport called with no invoice data — ignoring');
      return;
    }
    console.log('Invoice import:', data.invoices.length, 'records for seasons:', data.seasons);

    // Update local state — APPEND ONLY (do NOT filter by season).
    // The previous code stripped every existing invoice that shared a season
    // tag with the imported file, then re-added the new batch. That wiped
    // Q1 2024 from the in-memory state when a Q2 2024 file was imported,
    // even though the DB itself was unaffected. Now we merge by natural key
    // (invoiceNumber + styleNumber + colorCode + customer) so re-imports
    // overwrite their own rows but never touch the rest of the season.
    const newInvoices = data.invoices as unknown as InvoiceRecord[];
    const keyOf = (inv: InvoiceRecord) =>
      inv.invoiceNumber
        ? `${inv.invoiceNumber}|${inv.styleNumber}|${inv.colorCode ?? ''}|${inv.customer ?? ''}`
        : `_NOKEY_${inv.id}`;
    const newKeys = new Set(newInvoices.map(keyOf));
    const merged = [
      ...invoices.filter(inv => !newKeys.has(keyOf(inv))),
      ...newInvoices,
    ];
    setInvoices(merged);
    // The merged set may be partial if the in-memory `invoices` array hadn't
    // finished streaming the full DB before import. Don't poison the cache
    // with a partial set — clear it instead so the next page load does a
    // clean re-fetch of the authoritative DB state.
    clearInvoiceCache().catch(() => { /* non-fatal */ });

    // Persist to database in chunks per season
    try {
      const BATCH_SIZE = 2000;
      const invoicesBySeason: Record<string, Record<string, unknown>[]> = {};
      for (const inv of data.invoices) {
        const season = (inv.season as string) || 'Unknown';
        if (!invoicesBySeason[season]) invoicesBySeason[season] = [];
        invoicesBySeason[season].push(inv);
      }

      // ── APPEND-ONLY for invoice imports ──
      // Previously the first batch of each season ran with replaceExisting=true,
      // which deletes every existing Invoice row for that season before
      // inserting the new batch. That's destructive for invoice data because
      // invoices are time-based, not season-based — importing just Q1 2024
      // would wipe Q2-Q4 2024 invoices that share the same '24SP' tag.
      // We now always append, leaving DB de-duplication to a separate concern
      // (composite unique index on invoiceNumber+styleNumber+colorCode).
      for (const season of Object.keys(invoicesBySeason)) {
        const seasonInvoices = invoicesBySeason[season];
        const totalBatches = Math.ceil(seasonInvoices.length / BATCH_SIZE);

        for (let i = 0; i < seasonInvoices.length; i += BATCH_SIZE) {
          const batch = seasonInvoices.slice(i, i + BATCH_SIZE);
          const batchNum = Math.floor(i / BATCH_SIZE) + 1;

          console.log(`Invoice ${season} batch ${batchNum}/${totalBatches} (${batch.length} records, appending)`);

          await checkedFetchWithRetry('/api/data/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'invoice',
              season,
              data: batch,
              fileName: `invoice_${season}_batch_${batchNum}`,
              replaceExisting: false, // never wipe — invoices are time-based, not season-based
            }),
          });
        }
        console.log(`✓ Invoice ${season}: ${seasonInvoices.length} records appended`);
      }
      console.log('Invoice import complete');
      try { await fetch('/api/deploy-hook', { method: 'POST' }); } catch { /* non-blocking */ }
    } catch (dbErr) {
      const detail = dbErr instanceof Error ? dbErr.message : String(dbErr);
      console.error('Invoice DB persist error:', detail);
      setSessionOnlyMode(true);
      setSessionOnlyTypes(prev => [...new Set([...prev, 'Invoice'])]);
      setPersistenceErrorDetail(detail);
      setShowPersistenceModal(true);
    }
  };

  // Handle direct-to-DB import — large sales files already written to DB by API
  // Just need to reload sales data from the database
  const handleDirectToDbImport = async () => {
    // Cancel any background sales loading to prevent race conditions
    if (salesLoadAbort) { salesLoadAbort.abort(); salesLoadAbort = null; }
    setImportError(null);
    setSessionOnlyMode(false);
    setSessionOnlyTypes([]);
    console.log('Direct-to-DB import complete — reloading sales from database...');

    try {
      // Reload sales progressively from the database
      const PAGE_SIZE = 10000;
      let page = 0;
      let allSales: SalesRecord[] = [];
      let totalPages = 1;
      while (page < totalPages) {
        const res = await checkedFetch(`/api/data?salesOnly=true&salesPage=${page}&salesPageSize=${PAGE_SIZE}`, {});
        const result = await res.json();
        if (!result.success || !result.sales) break;
        allSales = [...allSales, ...result.sales];
        totalPages = result.totalPages || 1;
        setSales(allSales);
        console.log(`Reloading sales page ${page + 1}/${totalPages}: ${allSales.length} total`);
        page++;
      }
      console.log(`Sales reload complete: ${allSales.length} records`);

      // Invalidate core cache so next page load refreshes from DB
      // (sales themselves aren't cached, but aggregations may be stale)
      try { localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }

      // Trigger snapshot rebuild (data already in DB from server-side write)
      try { await fetch('/api/deploy-hook', { method: 'POST' }); } catch { /* non-blocking */ }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error('Sales reload error:', detail);
      setSessionOnlyMode(true);
      setSessionOnlyTypes(prev => [...new Set([...prev, 'Sales'])]);
      setPersistenceErrorDetail(detail);
      setShowPersistenceModal(true);
    }
  };

  // Handle multi-season import (products, pricing, or costs that span multiple seasons)
  const handleMultiSeasonImport = async (data: {
    products?: Record<string, unknown>[];
    pricing?: Record<string, unknown>[];
    costs?: Record<string, unknown>[];
    inventory?: Record<string, unknown>[];
  }) => {
    // Cancel any background sales loading to prevent race conditions
    if (salesLoadAbort) { salesLoadAbort.abort(); salesLoadAbort = null; }
    setImportError(null);
    setSessionOnlyMode(false);
    setSessionOnlyTypes([]);
    console.log('Importing multi-season data:', data.products?.length || 0, 'products', data.pricing?.length || 0, 'pricing', data.costs?.length || 0, 'costs', data.inventory?.length || 0, 'inventory');

    // Track final values for a single cache write at the end
    let finalProducts = products;
    let finalPricing = pricing;
    let finalCosts = costs;
    let finalInventory = inventory;
    const dbErrors: string[] = [];

    // For products: clean slate per season - delete existing products for each season in file, then add new
    if (data.products && data.products.length > 0) {
      const newProducts = data.products as unknown as Product[];

      // Find all seasons in the imported data
      const seasonsInFile = new Set<string>();
      newProducts.forEach(p => p.season && seasonsInFile.add(p.season));
      console.log('Seasons in imported Line List:', Array.from(seasonsInFile));

      // Keep products from seasons NOT in the file, replace those that ARE in the file
      const productsToKeep = products.filter(p => !seasonsInFile.has(p.season));
      finalProducts = [...productsToKeep, ...newProducts];
      setProducts(finalProducts);

      // Persist to database - delete then insert for each season
      try {
        for (const season of Array.from(seasonsInFile)) {
          console.log(`Deleting existing products for season: ${season}`);
          await checkedFetchWithRetry('/api/data/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'products',
              season,
              data: [],
              fileName: `line_list_clear_${season}`,
              replaceExisting: true,
            }),
          });
        }

        const BATCH_SIZE = 10000;
        for (let i = 0; i < data.products.length; i += BATCH_SIZE) {
          const batch = data.products.slice(i, i + BATCH_SIZE);
          await checkedFetchWithRetry('/api/data/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'products',
              data: batch,
              fileName: 'line_list_import',
              replaceExisting: false,
            }),
          });
        }
        console.log('Line List import complete');
      } catch (dbErr) {
        dbErrors.push(`Products: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`);
      }
    }

    // For pricing: replace all pricing with new data
    if (data.pricing && data.pricing.length > 0) {
      const newPricing = data.pricing as unknown as PricingRecord[];
      finalPricing = newPricing;
      setPricing(newPricing);

      // Persist to database
      try {
        const BATCH_SIZE = 10000;
        for (let i = 0; i < data.pricing.length; i += BATCH_SIZE) {
          const batch = data.pricing.slice(i, i + BATCH_SIZE);
          await checkedFetchWithRetry('/api/data/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'pricing',
              data: batch,
              fileName: 'multi_season_pricing_import',
              replaceExisting: i === 0,
            }),
          });
        }
      } catch (dbErr) {
        dbErrors.push(`Pricing: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`);
      }
    }

    // For costs: merge with priority — Landed Cost (priority 1) > Standard Cost (priority 2)
    if (data.costs && data.costs.length > 0) {
      const newCosts = data.costs as unknown as CostRecord[];
      const importSource = newCosts[0]?.costSource || 'landed_cost';

      // Find all seasons in the imported data
      const seasonsInFile = new Set<string>();
      newCosts.forEach(c => c.season && seasonsInFile.add(c.season));
      console.log(`Importing ${importSource} costs for seasons:`, Array.from(seasonsInFile));

      let mergedCosts: CostRecord[];

      if (importSource === 'landed_cost') {
        // Landed Cost is priority 1 — always wins
        // For matching seasons: replace ALL existing cost records (both landed and standard)
        const costsToKeep = finalCosts.filter(c => !seasonsInFile.has(c.season));
        mergedCosts = [...costsToKeep, ...newCosts];
      } else {
        // Standard Cost is priority 2 — only fills gaps, never overwrites landed_cost
        // Keep existing landed_cost records, replace only standard_cost (or add new)
        const costsToKeep = finalCosts.filter(c => {
          if (!seasonsInFile.has(c.season)) return true; // Different season, keep
          if (c.costSource === 'landed_cost') return true; // Landed cost = higher priority, keep
          return false; // Same season, standard_cost or no source — replace
        });

        // From the new standard cost data, exclude styles that already have a landed_cost record
        const landedKeys = new Set(
          costsToKeep
            .filter(c => c.costSource === 'landed_cost' && seasonsInFile.has(c.season))
            .map(c => `${c.styleNumber}-${c.season}`)
        );
        const newCostsFiltered = newCosts.filter(c => !landedKeys.has(`${c.styleNumber}-${c.season}`));

        mergedCosts = [...costsToKeep, ...newCostsFiltered];
        console.log(`Standard Cost import: ${newCosts.length} records, ${newCosts.length - newCostsFiltered.length} skipped (landed_cost exists), ${newCostsFiltered.length} applied`);
      }

      finalCosts = mergedCosts;
      setCosts(finalCosts);

      // Persist to database
      try {
        if (importSource === 'landed_cost') {
          // Landed cost: delete all existing for these seasons, then insert
          for (const season of Array.from(seasonsInFile)) {
            console.log(`Deleting all costs for season: ${season} (landed_cost import)`);
            await checkedFetchWithRetry('/api/data/import', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'costs',
                season,
                data: [],
                fileName: `costs_clear_${season}`,
                replaceExisting: true,
              }),
            });
          }
        } else {
          // Standard cost: only delete existing standard_cost records for these seasons
          // (We can't selectively delete by costSource via the current API, so delete all
          //  non-landed records for these seasons and re-insert the kept ones + new ones)
          for (const season of Array.from(seasonsInFile)) {
            console.log(`Deleting costs for season: ${season} (standard_cost import)`);
            await checkedFetchWithRetry('/api/data/import', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'costs',
                season,
                data: [],
                fileName: `costs_clear_${season}`,
                replaceExisting: true,
              }),
            });
          }
          // Re-insert the kept landed_cost records for these seasons
          const landedToReinsert = finalCosts.filter(
            c => seasonsInFile.has(c.season) && c.costSource === 'landed_cost'
          );
          if (landedToReinsert.length > 0) {
            const BATCH_SIZE = 10000;
            for (let i = 0; i < landedToReinsert.length; i += BATCH_SIZE) {
              const batch = landedToReinsert.slice(i, i + BATCH_SIZE);
              await checkedFetchWithRetry('/api/data/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  type: 'costs',
                  data: batch,
                  fileName: 'landed_cost_reinsert',
                  replaceExisting: false,
                }),
              });
            }
            console.log(`Re-inserted ${landedToReinsert.length} landed_cost records`);
          }
        }

        // Insert all the new cost data (already filtered if standard_cost)
        const costsToInsert = importSource === 'landed_cost'
          ? data.costs
          : data.costs.filter((c: Record<string, unknown>) => {
              const landedKeysDb = new Set(
                finalCosts
                  .filter(ec => ec.costSource === 'landed_cost' && seasonsInFile.has(ec.season))
                  .map(ec => `${ec.styleNumber}-${ec.season}`)
              );
              return !landedKeysDb.has(`${c.styleNumber}-${c.season}`);
            });

        const BATCH_SIZE = 10000;
        for (let i = 0; i < costsToInsert.length; i += BATCH_SIZE) {
          const batch = costsToInsert.slice(i, i + BATCH_SIZE);
          await checkedFetchWithRetry('/api/data/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'costs',
              data: batch,
              fileName: `${importSource}_import`,
              replaceExisting: false,
            }),
          });
        }
        console.log(`${importSource} import complete: ${costsToInsert.length} records persisted`);
      } catch (dbErr) {
        dbErrors.push(`Costs: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`);
      }
    }

    // For inventory: replace all (movement data has no season partitioning)
    if (data.inventory && data.inventory.length > 0) {
      const newInventory = data.inventory as unknown as InventoryRecord[];
      console.log('Importing inventory movement data:', newInventory.length, 'records');

      finalInventory = newInventory;
      setInventory(finalInventory);

      // Persist to database — delete all then insert in batches
      try {
        await checkedFetchWithRetry('/api/data/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'inventory',
            data: [],
            fileName: 'inventory_clear',
            replaceExisting: true,
          }),
        });

        // 10K-row inventory batches blew through Vercel's 4.5MB serverless
        // payload limit (FUNCTION_PAYLOAD_TOO_LARGE / 413). 2K is the same
        // chunk size the sales import uses and stays comfortably under.
        const BATCH_SIZE = 2000;
        const totalBatches = Math.ceil(data.inventory.length / BATCH_SIZE);
        console.log(`Persisting ${data.inventory.length} inventory rows in ${totalBatches} batches of ${BATCH_SIZE}`);
        for (let i = 0; i < data.inventory.length; i += BATCH_SIZE) {
          const batch = data.inventory.slice(i, i + BATCH_SIZE);
          const batchNum = Math.floor(i / BATCH_SIZE) + 1;
          await checkedFetchWithRetry('/api/data/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'inventory',
              data: batch,
              fileName: 'inventory_import',
              replaceExisting: false,
            }),
          });
          console.log(`Inventory batch ${batchNum}/${totalBatches} written (${batch.length} rows)`);
        }
        console.log('Inventory import complete');
      } catch (dbErr) {
        dbErrors.push(`Inventory: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`);
      }
    }

    // Single cache write with all final values (avoids stale closures from sequential writes)
    setCachedCore({ products: finalProducts, pricing: finalPricing, costs: finalCosts, inventory: finalInventory });

    // Surface any DB persistence errors via session-only mode
    if (dbErrors.length > 0) {
      const failedTypes = dbErrors.map(e => e.split(':')[0]);
      const detail = dbErrors.join('\n');
      console.error('DB persistence errors:', detail);
      setSessionOnlyMode(true);
      setSessionOnlyTypes(prev => [...new Set([...prev, ...failedTypes])]);
      setPersistenceErrorDetail(detail);
      setShowPersistenceModal(true);
    } else {
      // All succeeded — trigger snapshot rebuild
      try { await fetch('/api/deploy-hook', { method: 'POST' }); } catch { /* non-blocking */ }
    }
  };

  // Handle import from Season Import Modal
  const handleSeasonImport = async (data: {
    products: Record<string, unknown>[];
    pricing: Record<string, unknown>[];
    costs: Record<string, unknown>[];
    sales: Record<string, unknown>[];
    season: string;
  }) => {
    // Cancel any background sales loading to prevent race conditions
    if (salesLoadAbort) { salesLoadAbort.abort(); salesLoadAbort = null; }
    setImportError(null);
    setSessionOnlyMode(false);
    setSessionOnlyTypes([]);
    console.log('Importing season data:', data.season, data.products.length, 'products', data.pricing?.length || 0, 'pricing', data.sales?.length || 0, 'sales');

    // Remove existing data for this season, then add new data
    const filteredProducts = products.filter(p => p.season !== data.season);
    const filteredPricing = pricing.filter(p => p.season !== data.season);
    const filteredCosts = costs.filter(c => c.season !== data.season);
    const filteredSales = sales.filter(s => s.season !== data.season);

    // Add new products, pricing, costs, and sales (cast through unknown to satisfy TypeScript)
    const newProducts = [...filteredProducts, ...(data.products as unknown as Product[])];
    const newPricing = [...filteredPricing, ...(data.pricing as unknown as PricingRecord[])];
    const newCosts = [...filteredCosts, ...(data.costs as unknown as CostRecord[])];
    const newSales = [...filteredSales, ...(data.sales as unknown as SalesRecord[])];

    setProducts(newProducts);
    setPricing(newPricing);
    setCosts(newCosts);
    setSales(newSales);

    // Update cache with new data
    setCachedCore({ products: newProducts, pricing: newPricing, costs: newCosts, inventory });

    // Also persist to database (for deployed environment)
    const dbErrors: string[] = [];

    // Import products to database
    if (data.products.length > 0) {
      try {
        await checkedFetchWithRetry('/api/data/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'products',
            season: data.season,
            data: data.products,
            fileName: `${data.season}_import`,
            replaceExisting: true,
          }),
        });
      } catch (dbErr) {
        dbErrors.push(`Products: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`);
      }
    }

    // Import pricing to database
    if (data.pricing && data.pricing.length > 0) {
      try {
        await checkedFetchWithRetry('/api/data/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'pricing',
            season: data.season,
            data: data.pricing,
            fileName: `${data.season}_pricing_import`,
            replaceExisting: true,
          }),
        });
      } catch (dbErr) {
        dbErrors.push(`Pricing: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`);
      }
    }

    // Import costs to database
    if (data.costs.length > 0) {
      try {
        await checkedFetchWithRetry('/api/data/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'costs',
            season: data.season,
            data: data.costs,
            fileName: `${data.season}_costs_import`,
            replaceExisting: true,
          }),
        });
      } catch (dbErr) {
        dbErrors.push(`Costs: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`);
      }
    }

    // Import sales to database in batches (for large files)
    if (data.sales && data.sales.length > 0) {
      try {
        const BATCH_SIZE = 500;
        const totalBatches = Math.ceil(data.sales.length / BATCH_SIZE);
        console.log(`Importing ${data.sales.length} sales records in ${totalBatches} batches`);

        for (let i = 0; i < data.sales.length; i += BATCH_SIZE) {
          const batch = data.sales.slice(i, i + BATCH_SIZE);
          const batchNum = Math.floor(i / BATCH_SIZE) + 1;
          console.log(`Importing sales batch ${batchNum}/${totalBatches}`);

          await checkedFetchWithRetry('/api/data/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'sales',
              season: data.season,
              data: batch,
              fileName: `${data.season}_sales_import_batch_${batchNum}`,
              replaceExisting: i === 0, // Only replace on first batch
            }),
          });
        }
      } catch (dbErr) {
        dbErrors.push(`Sales: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`);
      }
    }

    if (dbErrors.length > 0) {
      const failedTypes = dbErrors.map(e => e.split(':')[0]);
      const detail = dbErrors.join('\n');
      console.error('DB persistence errors:', detail);
      setSessionOnlyMode(true);
      setSessionOnlyTypes(prev => [...new Set([...prev, ...failedTypes])]);
      setPersistenceErrorDetail(detail);
      setShowPersistenceModal(true);
    } else {
      console.log('Data persisted to database');
      // Trigger snapshot rebuild after successful DB write
      try { await fetch('/api/deploy-hook', { method: 'POST' }); } catch { /* non-blocking */ }
    }

    // Set filter to show the imported season
    setSelectedSeason(data.season);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center max-w-md w-full px-8">
          {/* Logo */}
          <div className="mb-8">
            <h1 className="text-4xl font-black text-white tracking-tight">KÜHL</h1>
            <p className="text-cyan-400 text-sm font-medium mt-1">Pricing Tracker</p>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-gray-700 rounded-full h-2 mb-4 overflow-hidden">
            <div
              className="bg-cyan-500 h-2 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${loadingProgress}%` }}
            />
          </div>

          {/* Status */}
          <p className="text-gray-400 text-sm font-medium">{loadingStatus}</p>

          {/* Tip for slow loads */}
          {!loadingSlow && loadingProgress > 10 && loadingProgress < 80 && (
            <p className="text-gray-500 text-xs mt-4">
              Loading data from database. Subsequent visits use cache.
            </p>
          )}

          {/* Taking too long — show retry/skip */}
          {loadingSlow && (
            <div className="mt-6 space-y-3">
              <p className="text-amber-400 text-xs">
                Taking longer than expected. The server may still be starting up.
              </p>
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => window.location.reload()}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Retry
                </button>
                <button
                  onClick={() => {
                    clearCache();
                    setIsLoading(false);
                    setLoadingStatus('Ready - Import data to get started');
                  }}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm font-medium rounded-lg transition-colors"
                >
                  Skip &amp; Import Data
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <Sidebar
        activeView={activeView}
        onViewChange={handleViewChange}
        onImportClick={() => setShowImportModal(true)}
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
        dataTimestamp={dataTimestamp || undefined}
        recordCounts={recordCounts}
      />

      {/* Main Content */}
      <main className={`flex-1 bg-surface-secondary transition-all duration-200 ease-in-out ${sidebarCollapsed ? 'ml-[60px]' : 'ml-56'}`}>
        {/* Header */}
        <AppHeader
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onRefresh={handleRefresh}
          onExportPdf={handleExportPdf}
          onExportExcel={handleExportExcel}
          searchSuggestions={searchSuggestions}
          onSuggestionClick={handleSuggestionClick}
        />

        {/* Filter Bar — on Geo Heat Map, use invoice-specific options since the view only shows invoice data */}
        <FilterBar
          activeView={activeView}
          seasons={seasons}
          divisions={activeView === 'geoheatmap' ? invoiceDivisions : divisions}
          categories={activeView === 'geoheatmap' ? invoiceCategories : categories}
          designers={designers}
          customerTypes={activeView === 'geoheatmap' ? invoiceCustomerTypes : customerTypes}
          customers={activeView === 'geoheatmap' ? invoiceCustomerNames : customerNames}
          years={availableYears}
          months={availableMonths}
          selectedSeason={selectedSeason}
          selectedDivision={selectedDivision}
          selectedCategory={selectedCategory}
          selectedDesigner={selectedDesigner}
          selectedCustomerType={selectedCustomerType}
          selectedCustomer={selectedCustomer}
          selectedMonth={selectedMonth}
          selectedYear={selectedYear}
          onSeasonChange={setSelectedSeason}
          onDivisionChange={setSelectedDivision}
          onCategoryChange={setSelectedCategory}
          onDesignerChange={setSelectedDesigner}
          onCustomerTypeChange={setSelectedCustomerType}
          onCustomerChange={setSelectedCustomer}
          onMonthChange={setSelectedMonth}
          onYearChange={setSelectedYear}
        />

        {/* Session-only warning banner — persists until successful re-import */}
        {sessionOnlyMode && (
          <div className="mx-4 mt-2 p-3 bg-amber-500/15 border border-amber-500/40 rounded-xl flex items-center gap-3">
            <span className="text-amber-400 text-lg flex-shrink-0">⚠</span>
            <span className="text-amber-300 text-sm font-medium flex-1">
              Data loaded for this session only ({sessionOnlyTypes.join(', ')}). Changes will be lost on refresh.
              <button
                onClick={() => { setShowPersistenceModal(false); setShowImportModal(true); }}
                className="ml-2 underline hover:text-amber-200 transition-colors"
              >
                Re-import
              </button>
            </span>
          </div>
        )}

        {/* Legacy import error banner (fallback) */}
        {importError && !sessionOnlyMode && (
          <div className="mx-4 mt-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-3">
            <span className="text-red-400 text-sm font-medium flex-1 whitespace-pre-line">{importError}</span>
            <button
              onClick={() => setImportError(null)}
              className="text-red-400 hover:text-red-300 text-sm font-bold px-2"
            >
              ✕
            </button>
          </div>
        )}

        {/* View Content */}
        <SalesLoadingContext.Provider value={{ salesLoading, salesLoadingProgress }}>
        <div ref={viewContentRef} className="min-h-[calc(100vh-112px)]">
          {activeView === 'executive' && (
            <ErrorBoundary viewName="Executive Dashboard">
              <ExecutiveDashboardView invoices={invoices} sales={sales} products={products} />
            </ErrorBoundary>
          )}

          {activeView === 'dashboard' && (
            <ErrorBoundary viewName="Dashboard">
              <DashboardView
                products={products}
                sales={dateFilteredSales}
                costs={costs}
                salesAggregations={salesAggregations}
                selectedSeason={selectedSeason}
                selectedDivision={selectedDivision}
                selectedCategory={selectedCategory}
                searchQuery={searchQuery}
                onStyleClick={handleStyleClick}
              />
            </ErrorBoundary>
          )}

          {activeView === 'season' && (
            <ErrorBoundary viewName="Season View">
              <SeasonView
                products={products}
                sales={dateFilteredSales}
                pricing={pricing}
                costs={costs}
                selectedSeason={selectedSeason}
                selectedDivision={selectedDivision}
                selectedCategory={selectedCategory}
                searchQuery={searchQuery}
                onStyleClick={handleStyleClick}
              />
            </ErrorBoundary>
          )}

          {activeView === 'grid' && (
            <ErrorBoundary viewName="Grid">
              <GridView
                products={products}
                pricing={pricing}
                costs={costs}
                sales={dateFilteredSales}
                selectedSeason={selectedSeason}
                selectedDivision={selectedDivision}
                selectedCategory={selectedCategory}
                searchQuery={searchQuery}
                onStyleClick={handleStyleClick}
                onPricingUpdated={handlePricingUpdated}
                onCostUpdated={handleCostUpdated}
              />
            </ErrorBoundary>
          )}

          {activeView === 'pullback' && (
            <ErrorBoundary viewName="Pullback">
              <PullbackView
                sales={dateFilteredSales}
                invoices={invoices}
                costs={costs}
                onStyleClick={handleStyleClick}
              />
            </ErrorBoundary>
          )}

          {activeView === 'invopnmonth' && (
            <ErrorBoundary viewName="Inv-Opn Month">
              <InvOpnMonthView
                invoices={invoices}
                sales={sales}
                products={products}
                selectedSeason={selectedSeason}
                onStyleClick={handleStyleClick}
              />
            </ErrorBoundary>
          )}

          {activeView === 'invoicemonth' && (
            <ErrorBoundary viewName="Invoice Month">
              <InvoiceMonthView
                invoices={invoices}
                products={products}
                selectedSeason={selectedSeason}
                onStyleClick={handleStyleClick}
              />
            </ErrorBoundary>
          )}

          {activeView === 'seasoncomp' && (
            <ErrorBoundary viewName="Season Comparison">
              <SeasonCompView
                products={products}
                sales={dateFilteredSales}
                selectedSeason={selectedSeason}
                selectedDivision={selectedDivision}
                selectedCategory={selectedCategory}
                searchQuery={searchQuery}
                onStyleClick={handleStyleClick}
              />
            </ErrorBoundary>
          )}

          {activeView === 'sales' && (
            <ErrorBoundary viewName="Sales">
              <SalesView
                products={products}
                sales={dateFilteredSales}
                pricing={pricing}
                costs={costs}
                inventoryOH={derivedInventoryOH}
                salesAggregations={salesAggregations}
                selectedSeason={selectedSeason}
                selectedDivision={selectedDivision}
                selectedCategory={selectedCategory}
                selectedCustomerType={selectedCustomerType}
                selectedCustomer={selectedCustomer}
                searchQuery={searchQuery}
                onStyleClick={handleStyleClick}
              />
            </ErrorBoundary>
          )}

          {activeView === 'topstyles' && (
            <ErrorBoundary viewName="Top Styles">
              <TopStylesChannelView
                products={products}
                sales={dateFilteredSales}
                selectedSeason={selectedSeason}
                selectedDivision={selectedDivision}
                selectedCategory={selectedCategory}
                selectedCustomerType={selectedCustomerType}
                selectedCustomer={selectedCustomer}
                searchQuery={searchQuery}
                onStyleClick={handleStyleClick}
              />
            </ErrorBoundary>
          )}

          {activeView === 'inventory' && (
            <ErrorBoundary viewName="Inventory">
              <InventoryView
                products={products}
                sales={dateFilteredSales}
                inventory={inventory}
                inventoryAggregations={invAggregations || undefined}
                inventoryOH={derivedInventoryOH}
                ohAggregations={ohAggregations || undefined}
                selectedSeason={selectedSeason}
                selectedDivision={selectedDivision}
                selectedCategory={selectedCategory}
                searchQuery={searchQuery}
                onStyleClick={handleStyleClick}
              />
            </ErrorBoundary>
          )}

          {activeView === 'sellthrough' && (
            <ErrorBoundary viewName="Sell-Through">
              <SellThroughView
                products={products}
                sales={dateFilteredSales}
                inventoryOH={derivedInventoryOH}
                selectedSeason={selectedSeason}
                selectedDivision={selectedDivision}
                selectedCategory={selectedCategory}
                searchQuery={searchQuery}
                onStyleClick={handleStyleClick}
              />
            </ErrorBoundary>
          )}

          {activeView === 'forecast' && (
            <ErrorBoundary viewName="Forecast">
              <ForecastView
                products={products}
                sales={dateFilteredSales}
                pricing={pricing}
                costs={costs}
                inventoryOH={derivedInventoryOH}
                selectedSeason={selectedSeason}
                selectedDivision={selectedDivision}
                selectedCategory={selectedCategory}
                searchQuery={searchQuery}
                onStyleClick={handleStyleClick}
              />
            </ErrorBoundary>
          )}

          {activeView === 'costs' && (
            <ErrorBoundary viewName="Costs">
              <CostsView
                products={products}
                pricing={pricing}
                costs={costs}
                sales={dateFilteredSales}
                selectedSeason={selectedSeason}
                selectedDivision={selectedDivision}
                selectedCategory={selectedCategory}
                searchQuery={searchQuery}
                onStyleClick={handleStyleClick}
                onCostUpdated={handleCostUpdated}
                onPricingUpdated={handlePricingUpdated}
              />
            </ErrorBoundary>
          )}

          {activeView === 'tariffs' && (
            <ErrorBoundary viewName="Tariffs">
              <TariffView
                products={products}
                sales={dateFilteredSales}
                costs={costs}
                selectedSeason={selectedSeason}
                selectedDivision={selectedDivision}
                selectedCategory={selectedCategory}
                searchQuery={searchQuery}
                onStyleClick={handleStyleClick}
              />
            </ErrorBoundary>
          )}

          {activeView === 'pricing' && (
            <ErrorBoundary viewName="Pricing">
              <PricingView
                products={products}
                pricing={pricing}
                costs={costs}
                sales={dateFilteredSales}
                selectedSeason={selectedSeason}
                selectedDivision={selectedDivision}
                selectedCategory={selectedCategory}
                searchQuery={searchQuery}
                onStyleClick={handleStyleClick}
                onPricingUpdated={handlePricingUpdated}
                onCostUpdated={handleCostUpdated}
              />
            </ErrorBoundary>
          )}

          {activeView === 'products' && (
            <ErrorBoundary viewName="Style Master">
              <StyleMasterView
                products={products}
                sales={dateFilteredSales}
                pricing={pricing}
                costs={costs}
                selectedSeason={selectedSeason}
                selectedDivision={selectedDivision}
                selectedCategory={selectedCategory}
                searchQuery={searchQuery}
              />
            </ErrorBoundary>
          )}

          {activeView === 'margins' && (
            <ErrorBoundary viewName="Margins">
              <MarginsView
                products={products}
                sales={dateFilteredSales}
                costs={costs}
                pricing={pricing}
                selectedSeason={selectedSeason}
                selectedDivision={selectedDivision}
                selectedCategory={selectedCategory}
                searchQuery={searchQuery}
                onStyleClick={handleStyleClick}
              />
            </ErrorBoundary>
          )}

          {activeView === 'customers' && (
            <ErrorBoundary viewName="Customers">
              <CustomerView
                products={products}
                sales={dateFilteredSales}
                selectedSeason={selectedSeason}
                selectedDivision={selectedDivision}
                selectedCategory={selectedCategory}
                selectedCustomerType={selectedCustomerType}
                searchQuery={searchQuery}
                onStyleClick={handleStyleClick}
              />
            </ErrorBoundary>
          )}

          {activeView === 'linelist' && (
            <ErrorBoundary viewName="Line List">
              <LineListView
                products={products}
                sales={dateFilteredSales}
                pricing={pricing}
                costs={costs}
                selectedSeason={selectedSeason}
                selectedDivision={selectedDivision}
                selectedCategory={selectedCategory}
                searchQuery={searchQuery}
                onStyleClick={handleStyleClick}
                onCostUpdated={handleCostUpdated}
                onPricingUpdated={handlePricingUpdated}
              />
            </ErrorBoundary>
          )}

          {activeView === 'validation' && (
            <ErrorBoundary viewName="Validation">
              <ValidationView
                products={products}
                sales={dateFilteredSales}
                costs={costs}
                pricing={pricing}
                searchQuery={searchQuery}
                onStyleClick={handleStyleClick}
              />
            </ErrorBoundary>
          )}

          {activeView === 'datasources' && (
            <ErrorBoundary viewName="Data Flow">
              <DataFlowView />
            </ErrorBoundary>
          )}

          {activeView === 'stylecolor' && (
            <ErrorBoundary viewName="Style/Color Performance">
              <StyleColorPerfView
                products={products}
                sales={dateFilteredSales}
                costs={costs}
                selectedSeason={selectedSeason}
                selectedDivision={selectedDivision}
                selectedCategory={selectedCategory}
                selectedCustomerType={selectedCustomerType}
                selectedCustomer={selectedCustomer}
                searchQuery={searchQuery}
                onStyleClick={handleStyleClick}
              />
            </ErrorBoundary>
          )}

          {activeView === 'geoheatmap' && (
            <ErrorBoundary viewName="Geo Heat Map">
              <GeoHeatmapView
                sales={invoiceOnlySales}
                invoices={enrichedInvoices}
                selectedSeason={selectedSeason}
                selectedDivision={selectedDivision}
                selectedCategory={selectedCategory}
                selectedCustomerType={selectedCustomerType}
                selectedCustomer={selectedCustomer}
              />
            </ErrorBoundary>
          )}
          {activeView === 'invopnseason' && (
            <ErrorBoundary viewName="Inv-Opn Season">
              <InvOpnSeasonView
                products={products}
                sales={dateFilteredSales}
                selectedSeason={selectedSeason}
                selectedDivision={selectedDivision}
                selectedCategory={selectedCategory}
                searchQuery={searchQuery}
                onStyleClick={handleStyleClick}
              />
            </ErrorBoundary>
          )}

          {activeView === 'sourcefiles' && (
            <ErrorBoundary viewName="Source Files">
              <SourceFilesView />
            </ErrorBoundary>
          )}
        </div>
        </SalesLoadingContext.Provider>
      </main>

      {/* Style Detail Panel */}
      {selectedStyleNumber && (
        <StyleDetailPanel
          styleNumber={selectedStyleNumber}
          products={products}
          sales={sales}
          pricing={pricing}
          costs={costs}
          selectedSeason={selectedSeason}
          selectedDivision={selectedDivision}
          selectedCategory={selectedCategory}
          onClose={() => setSelectedStyleNumber(null)}
          onCostUpdated={handleCostUpdated}
          onPricingUpdated={handlePricingUpdated}
        />
      )}

      {/* Smart Import Modal */}
      {showImportModal && (
        <SmartImportModal
          existingSeasons={seasons}
          onImport={handleSeasonImport}
          onImportSalesOnly={handleSalesOnlyImport}
          onImportMultiSeason={handleMultiSeasonImport}
          onImportSalesReplace={handleSalesReplaceImport}
          onImportInvoice={handleInvoiceImport}
          onImportDirectToDb={handleDirectToDbImport}
          onClose={() => setShowImportModal(false)}
        />
      )}

      {/* Keyboard Shortcuts Help — toggled by pressing ? */}
      <KeyboardShortcutsHelp />

      {/* Persistence Warning Modal — blocks UI when DB writes fail */}
      {showPersistenceModal && (
        <PersistenceWarningModal
          failedTypes={sessionOnlyTypes}
          errorDetails={persistenceErrorDetail}
          onAcknowledge={() => setShowPersistenceModal(false)}
          onRetryImport={() => {
            setShowPersistenceModal(false);
            setShowImportModal(true);
          }}
        />
      )}
    </div>
  );
}
