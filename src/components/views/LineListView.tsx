'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Product, SalesRecord, PricingRecord, CostRecord, normalizeCategory } from '@/types/product';
import { sortSeasons } from '@/lib/store';
import { isFutureSeason } from '@/utils/season';
import { getCurrentShippingSeason, getSeasonStatus, getSeasonStatusBadge } from '@/lib/season-utils';
import { ArrowUpDown, Download, ChevronLeft, ChevronRight, EyeOff, X, Plus, Tag, Check, Minus, RotateCcw, Edit3, FileText } from 'lucide-react';
import { useCatalogs } from '@/hooks/useCatalogs';
import { BUILT_IN_CATALOGS } from '@/lib/catalogs';
import * as XLSX from 'xlsx';
import { SourceLegend } from '@/components/SourceBadge';
import { formatCurrency, formatPercent } from '@/utils/format';
import MultiSelect from '@/components/MultiSelect';
import StyleEditModal from '@/components/StyleEditModal';

// Gender detection from division description
function getGenderFromDivision(divisionDesc: string): 'Men' | 'Women' | 'Unisex' {
  if (!divisionDesc) return 'Unisex';
  const lower = divisionDesc.toLowerCase();
  if (lower.includes("women") || lower.includes("woman")) return 'Women';
  if (lower.includes("men") && !lower.includes("women")) return 'Men';
  return 'Unisex';
}

interface LineListViewProps {
  products: Product[];
  sales: SalesRecord[];
  pricing: PricingRecord[];
  costs: CostRecord[];
  selectedSeason?: string;
  selectedDivision?: string;
  selectedCategory?: string;
  searchQuery?: string;
  onStyleClick: (styleNumber: string) => void;
  onCostUpdated?: (updated: CostRecord) => void;
  onPricingUpdated?: (updated: PricingRecord) => void;
}

type QuickFilter = 'all' | 'new' | 'carryover' | 'topSellers' | 'smu' | 'kore' | 'map' | 'dropped';

interface EnrichedProduct extends Product {
  msrp: number;
  price: number;
  landed: number;
  fob: number;
  margin: number;
  isNew: boolean;
  isCarryOver: boolean;
  topSeller: boolean;
  smu: boolean;
  kore: boolean;
  mapProtected: boolean;
  isDropped?: boolean;
}

interface ColumnGroup {
  id: string;
  label: string;
  columns: { key: string; label: string; width?: string }[];
}

const COLUMN_GROUPS: ColumnGroup[] = [
  {
    id: 'core',
    label: 'Core',
    columns: [
      // FLAGS column hidden until proper flag data is available (CO = Carryover was working, but topSeller/smu/kore/map are not populated)
      { key: 'styleNumber', label: 'Style #', width: '100px' },
      { key: 'styleDesc', label: 'Style Name', width: '200px' },
      { key: 'color', label: 'Color', width: '70px' },
      { key: 'colorDesc', label: 'Color Desc', width: '120px' },
      { key: 'categoryDesc', label: 'Category', width: '100px' },
      { key: 'divisionDesc', label: 'Division', width: '90px' },
    ],
  },
  {
    id: 'pricing',
    label: 'Pricing',
    columns: [
      { key: 'msrp', label: 'US MSRP', width: '80px' },
      { key: 'price', label: 'US WHSL', width: '80px' },
      { key: 'cadMsrp', label: 'CAD MSRP', width: '85px' },
      { key: 'cadPrice', label: 'CAD WHSL', width: '85px' },
      { key: 'landed', label: 'Landed', width: '80px' },
      { key: 'margin', label: 'Margin %', width: '80px' },
    ],
  },
  {
    id: 'team',
    label: 'Team',
    columns: [
      { key: 'designerName', label: 'Designer', width: '120px' },
      { key: 'techDesignerName', label: 'Developer', width: '120px' },
    ],
  },
  {
    id: 'specs',
    label: 'Specs',
    columns: [
      { key: 'productLine', label: 'Product Line', width: '120px' },
      { key: 'labelDesc', label: 'Label', width: '100px' },
    ],
  },
  {
    id: 'sourcing',
    label: 'Sourcing',
    columns: [
      { key: 'factoryName', label: 'Factory', width: '120px' },
      { key: 'countryOfOrigin', label: 'COO', width: '100px' },
      { key: 'fob', label: 'FOB', width: '70px' },
    ],
  },
  {
    id: 'availability',
    label: 'Availability',
    columns: [
      { key: 'carryOver', label: 'C/O', width: '50px' },
      { key: 'sellingSeasons', label: 'Selling Seasons', width: '120px' },
    ],
  },
  {
    id: 'catalogs',
    label: 'Catalogs',
    columns: [
      { key: 'catalogs', label: 'Catalogs', width: '180px' },
    ],
  },
];

const ITEMS_PER_PAGE = 50;

export default function LineListView({
  products,
  sales,
  pricing,
  costs,
  selectedSeason: globalSeason = '',
  selectedDivision: globalDivision = '',
  selectedCategory: globalCategory = '',
  searchQuery: globalSearchQuery,
  onStyleClick,
  onCostUpdated,
  onPricingUpdated,
}: LineListViewProps) {
  // Get unique seasons
  const seasons = useMemo(() => {
    const allSeasons = new Set<string>();
    products.forEach((p) => p.season && allSeasons.add(p.season));
    return sortSeasons(Array.from(allSeasons));
  }, [products]);

  // State
  const [selectedSeason, setSelectedSeason] = useState<string>(seasons[seasons.length - 1] || '');
  const [divisionFilter, setDivisionFilter] = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [designerFilter, setDesignerFilter] = useState<string[]>([]);
  const [productLineFilter, setProductLineFilter] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  // Inline edit modal — opens StyleEditModal with the matching Pricing + Cost rows.
  const [editingStyleSeason, setEditingStyleSeason] = useState<{ styleNumber: string; season: string } | null>(null);

  // Sync global search → local search
  useEffect(() => {
    if (globalSearchQuery !== undefined && globalSearchQuery !== searchQuery) {
      setSearchQuery(globalSearchQuery);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalSearchQuery]);
  const [visibleGroups, setVisibleGroups] = useState<Record<string, boolean>>({
    core: true,
    pricing: true,
    team: false,
    specs: false,
    sourcing: false,
    availability: false,
    catalogs: true,
  });
  const [sortColumn, setSortColumn] = useState<string>('styleNumber');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // Sync global FilterBar → local state
  useEffect(() => {
    if (!globalSeason || globalSeason === '__ALL_SP__' || globalSeason === '__ALL_FA__') return;
    if (seasons.includes(globalSeason) && globalSeason !== selectedSeason) {
      setSelectedSeason(globalSeason);
    }
  }, [globalSeason, seasons]);

  useEffect(() => {
    // Wrap the global single-string filter into the local array shape.
    if (globalDivision) {
      if (divisionFilter.length !== 1 || divisionFilter[0] !== globalDivision) {
        setDivisionFilter([globalDivision]);
      }
    } else if (divisionFilter.length > 0 && !globalDivision) {
      // Don't clobber local user picks when no global filter is set.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalDivision]);

  useEffect(() => {
    if (globalCategory) {
      if (categoryFilter.length !== 1 || categoryFilter[0] !== globalCategory) {
        setCategoryFilter([globalCategory]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalCategory]);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [hideNoSales, setHideNoSales] = useState<boolean>(false);
  const [hideNoPricing, setHideNoPricing] = useState<boolean>(false);
  const [rollUpStyles, setRollUpStyles] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'flat' | 'grouped'>('flat');

  const {
    catalogs,
    selectedCatalog,
    setSelectedCatalog,
    membershipMap,
    addStyleToCatalog,
    removeStyleFromCatalog,
    resetOverride,
    createCatalog,
    deleteCatalog,
    getStylesInCatalog,
    getOverrideStatus,
  } = useCatalogs(products, selectedSeason);

  // State for "Create Catalog" modal
  const [showCreateCatalog, setShowCreateCatalog] = useState(false);
  const [newCatalogName, setNewCatalogName] = useState('');
  const [newCatalogShort, setNewCatalogShort] = useState('');
  const [newCatalogColor, setNewCatalogColor] = useState('blue');

  // Catalog popover state
  const [catalogPopoverStyle, setCatalogPopoverStyle] = useState<string | null>(null);

  // Close popover on click outside
  useEffect(() => {
    if (!catalogPopoverStyle) return;
    const handler = () => setCatalogPopoverStyle(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [catalogPopoverStyle]);

  // Get filter options
  const divisions = useMemo(() => {
    const all = new Set<string>();
    products.forEach((p) => p.divisionDesc && all.add(p.divisionDesc));
    return Array.from(all).sort();
  }, [products]);

  const categories = useMemo(() => {
    const all = new Set<string>();
    products.forEach((p) => {
      if (p.categoryDesc) {
        all.add(normalizeCategory(p.categoryDesc));
      }
    });
    return Array.from(all).sort();
  }, [products]);

  const designers = useMemo(() => {
    const all = new Set<string>();
    products.forEach((p) => p.designerName && all.add(p.designerName));
    return Array.from(all).sort();
  }, [products]);

  const productLines = useMemo(() => {
    const all = new Set<string>();
    products.forEach((p) => p.productLine && all.add(p.productLine));
    return Array.from(all).sort();
  }, [products]);

  // Get previous season for "new" and "dropped" calculations
  const getPreviousSeason = (season: string): string => {
    const idx = seasons.indexOf(season);
    return idx > 0 ? seasons[idx - 1] : '';
  };

  // Build cost lookup
  const costLookup = useMemo(() => {
    const lookup = new Map<string, { landed: number; fob: number }>();
    costs.forEach((c) => {
      const key = `${c.styleNumber}-${c.season}`;
      if (c.landed > 0 || c.fob > 0) {
        lookup.set(key, { landed: c.landed, fob: c.fob });
      }
    });
    return lookup;
  }, [costs]);

  // Build pricing lookup
  const pricingLookup = useMemo(() => {
    const lookup = new Map<string, { msrp: number; price: number }>();
    pricing.forEach((p) => {
      const key = `${p.styleNumber}-${p.season}`;
      lookup.set(key, { msrp: p.msrp, price: p.price });
    });
    return lookup;
  }, [pricing]);

  // Build set of all styles that have ANY sales
  const stylesWithSales = useMemo(() => {
    const styles = new Set<string>();
    sales.forEach((s) => {
      if (s.styleNumber && (s.revenue > 0 || s.unitsBooked > 0)) {
        styles.add(s.styleNumber);
      }
    });
    return styles;
  }, [sales]);

  // Check if current season is a future season (dynamic based on current date)
  const isSelectedSeasonFuture = useMemo(() => {
    if (selectedSeason === 'ALL') return false;
    return isFutureSeason(selectedSeason);
  }, [selectedSeason]);

  // Get styles in previous season for new/dropped detection
  const previousSeasonStyles = useMemo(() => {
    if (selectedSeason === 'ALL') return new Set<string>();
    const prevSeason = getPreviousSeason(selectedSeason);
    if (!prevSeason) return new Set<string>();
    return new Set(
      products.filter((p) => p.season === prevSeason).map((p) => p.styleNumber)
    );
  }, [products, selectedSeason, seasons]);

  const currentSeasonStyles = useMemo(() => {
    return new Set(
      selectedSeason === 'ALL'
        ? products.map((p) => p.styleNumber)
        : products.filter((p) => p.season === selectedSeason).map((p) => p.styleNumber)
    );
  }, [products, selectedSeason]);

  // Filter and enrich data
  const filteredData = useMemo(() => {
    let data = selectedSeason === 'ALL'
      ? products
      : products.filter((p) => p.season === selectedSeason);

    // Apply filters (multi-select: empty array = no filter, otherwise OR within the field)
    if (divisionFilter.length > 0) data = data.filter((d) => divisionFilter.includes(d.divisionDesc));
    if (categoryFilter.length > 0) data = data.filter((d) => categoryFilter.includes(normalizeCategory(d.categoryDesc)));
    if (designerFilter.length > 0) data = data.filter((d) => designerFilter.includes(d.designerName));
    if (productLineFilter.length > 0) data = data.filter((d) => productLineFilter.includes(d.productLine));

    // Hide styles with no sales (only for historical seasons)
    if (hideNoSales && !isSelectedSeasonFuture) {
      data = data.filter((d) => stylesWithSales.has(d.styleNumber));
    }

    // Hide rows with no Pricing AND no Cost record for the row's season —
    // these are catalog placeholders with nothing to review.
    if (hideNoPricing) {
      data = data.filter((d) => {
        const pr = pricingLookup.get(`${d.styleNumber}-${d.season}`);
        const co = costLookup.get(`${d.styleNumber}-${d.season}`);
        const hasPrice = !!pr && ((pr.msrp ?? 0) > 0 || (pr.price ?? 0) > 0);
        const hasCost = !!co && ((co.landed ?? 0) > 0);
        const hasLineList = (d.msrp ?? 0) > 0 || (d.price ?? 0) > 0 || (d.cost ?? 0) > 0;
        return hasPrice || hasCost || hasLineList;
      });
    }

    // Catalog filter
    if (selectedCatalog !== 'master') {
      const catalogStyles = getStylesInCatalog(selectedCatalog);
      data = data.filter((d) => catalogStyles.has(d.styleNumber));
    }

    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      data = data.filter(
        (d) =>
          d.styleNumber.toLowerCase().includes(q) ||
          d.styleDesc?.toLowerCase().includes(q) ||
          d.color?.toLowerCase().includes(q) ||
          d.colorDesc?.toLowerCase().includes(q)
      );
    }

    // Enrich with calculated fields
    const enriched = data.map((item) => {
      const costKey = `${item.styleNumber}-${item.season}`;
      const pricingKey = `${item.styleNumber}-${item.season}`;
      const costData = costLookup.get(costKey);
      const pricingData = pricingLookup.get(pricingKey);

      const msrp = pricingData?.msrp || item.msrp || 0;
      const price = pricingData?.price || item.price || 0;
      const landed = costData?.landed || item.cost || 0;
      const fob = costData?.fob || 0;
      const margin = price > 0 && landed > 0 ? ((price - landed) / price) * 100 : 0;

      const isNew = !previousSeasonStyles.has(item.styleNumber);
      const isCarryOver = item.carryOver === true || (item as unknown as Record<string, unknown>).carryOver === 'Y';

      return {
        ...item,
        msrp,
        price,
        landed,
        fob,
        margin,
        isNew,
        isCarryOver,
        // Placeholder flags - would come from actual data
        topSeller: false,
        smu: false,
        kore: false,
        mapProtected: false,
        isDropped: false,
      };
    });

    // Apply quick filters
    let filtered = enriched;
    if (quickFilter === 'new') filtered = enriched.filter((d) => d.isNew);
    if (quickFilter === 'carryover') filtered = enriched.filter((d) => d.isCarryOver);
    if (quickFilter === 'topSellers') filtered = enriched.filter((d) => d.topSeller);
    if (quickFilter === 'smu') filtered = enriched.filter((d) => d.smu);
    if (quickFilter === 'kore') filtered = enriched.filter((d) => d.kore);
    if (quickFilter === 'map') filtered = enriched.filter((d) => d.mapProtected);
    if (quickFilter === 'dropped') {
      // Show styles from previous season that are not in current
      const prevSeason = getPreviousSeason(selectedSeason);
      if (prevSeason) {
        const droppedStyles = products
          .filter((p) => p.season === prevSeason && !currentSeasonStyles.has(p.styleNumber))
          .map((item) => ({
            ...item,
            msrp: item.msrp || 0,
            price: item.price || 0,
            landed: 0,
            fob: 0,
            margin: 0,
            isNew: false,
            isCarryOver: false,
            topSeller: false,
            smu: false,
            kore: false,
            mapProtected: false,
            isDropped: true,
          }));
        return droppedStyles;
      }
      return [];
    }

    return filtered;
  }, [
    products,
    selectedSeason,
    divisionFilter,
    categoryFilter,
    designerFilter,
    productLineFilter,
    searchQuery,
    quickFilter,
    costLookup,
    pricingLookup,
    previousSeasonStyles,
    currentSeasonStyles,
    seasons,
    hideNoSales,
    hideNoPricing,
    isSelectedSeasonFuture,
    stylesWithSales,
    selectedCatalog,
    getStylesInCatalog,
    membershipMap,
  ]);

  // Roll up to style level (aggregate colors into one row per style)
  const rolledUpData = useMemo(() => {
    if (!rollUpStyles) return filteredData;

    const styleMap = new Map<string, EnrichedProduct & { colorCount: number }>();

    filteredData.forEach((item) => {
      const existing = styleMap.get(item.styleNumber);
      if (existing) {
        // Aggregate: increment color count, keep first row's data
        existing.colorCount++;
      } else {
        styleMap.set(item.styleNumber, {
          ...item,
          color: '', // Clear color since we're rolling up
          colorDesc: '', // Clear color desc
          colorCount: 1,
        });
      }
    });

    return Array.from(styleMap.values());
  }, [filteredData, rollUpStyles]);

  // Sort data
  const sortedData = useMemo(() => {
    return [...rolledUpData].sort((a, b) => {
      const aVal = (a as Record<string, unknown>)[sortColumn];
      const bVal = (b as Record<string, unknown>)[sortColumn];

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }

      const aStr = String(aVal || '');
      const bStr = String(bVal || '');
      return sortDir === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
    });
  }, [rolledUpData, sortColumn, sortDir]);

  // Paginate
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return sortedData.slice(start, start + ITEMS_PER_PAGE);
  }, [sortedData, currentPage]);

  const totalPages = Math.ceil(sortedData.length / ITEMS_PER_PAGE);

  // Stats — line-review-tuned: counts plus deltas vs prior same-type season,
  // average MSRP, blended margin, and the existing no-sales count.
  const stats = useMemo(() => {
    const seasonProducts = products.filter((p) => p.season === selectedSeason);
    const uniqueStyles = new Set(seasonProducts.map((p) => p.styleNumber));
    const uniqueDesigners = new Set(seasonProducts.map((p) => p.designerName).filter(Boolean));
    const newStyles = Array.from(uniqueStyles).filter((s) => !previousSeasonStyles.has(s));
    const droppedStyles = Array.from(previousSeasonStyles).filter((s) => !currentSeasonStyles.has(s));
    const carryoverStyles = Array.from(uniqueStyles).filter((s) => previousSeasonStyles.has(s));
    const noSalesStyles = Array.from(uniqueStyles).filter((s) => !stylesWithSales.has(s));

    // Avg MSRP + blended margin across the unique styles in this season
    let msrpSum = 0;
    let msrpCount = 0;
    let revenueWtdMargin = 0;
    let marginWeight = 0;
    const seenStyles = new Set<string>();
    seasonProducts.forEach((p) => {
      if (seenStyles.has(p.styleNumber)) return;
      seenStyles.add(p.styleNumber);
      const pricingData = pricingLookup.get(`${p.styleNumber}-${p.season}`);
      const costData = costLookup.get(`${p.styleNumber}-${p.season}`);
      const msrp = pricingData?.msrp || p.msrp || 0;
      const price = pricingData?.price || p.price || 0;
      const landed = costData?.landed || p.cost || 0;
      if (msrp > 0) { msrpSum += msrp; msrpCount++; }
      if (price > 0 && landed > 0) {
        revenueWtdMargin += (price - landed); // numerator pieces
        marginWeight += price;
      }
    });
    const avgMsrp = msrpCount > 0 ? msrpSum / msrpCount : 0;
    const blendedMargin = marginWeight > 0 ? (revenueWtdMargin / marginWeight) * 100 : 0;

    // Prior same-type season delta on style count + avg MSRP
    const prevSeason = (() => {
      // Walk back through seasons to find the most recent same-type
      const idx = seasons.indexOf(selectedSeason);
      if (idx <= 0) return '';
      const isSpring = selectedSeason.endsWith('SP');
      for (let i = idx - 1; i >= 0; i--) {
        if (seasons[i].endsWith(isSpring ? 'SP' : 'FA')) return seasons[i];
      }
      return '';
    })();
    let priorStylesCount = 0;
    let priorMsrpSum = 0;
    let priorMsrpCount = 0;
    if (prevSeason) {
      const priorSeen = new Set<string>();
      products.filter((p) => p.season === prevSeason).forEach((p) => {
        if (priorSeen.has(p.styleNumber)) return;
        priorSeen.add(p.styleNumber);
        priorStylesCount++;
        const priorPricing = pricingLookup.get(`${p.styleNumber}-${p.season}`);
        const priorMsrp = priorPricing?.msrp || p.msrp || 0;
        if (priorMsrp > 0) { priorMsrpSum += priorMsrp; priorMsrpCount++; }
      });
    }
    const priorAvgMsrp = priorMsrpCount > 0 ? priorMsrpSum / priorMsrpCount : 0;
    const stylesDelta = priorStylesCount > 0 ? uniqueStyles.size - priorStylesCount : null;
    const msrpDelta = priorAvgMsrp > 0 ? avgMsrp - priorAvgMsrp : null;

    return {
      styles: uniqueStyles.size,
      skus: seasonProducts.length,
      new: newStyles.length,
      dropped: droppedStyles.length,
      carryover: carryoverStyles.length,
      designers: uniqueDesigners.size,
      noSales: noSalesStyles.length,
      avgMsrp,
      blendedMargin,
      priorSeason: prevSeason,
      stylesDelta,
      msrpDelta,
    };
  }, [products, selectedSeason, previousSeasonStyles, currentSeasonStyles, stylesWithSales, pricingLookup, costLookup, seasons]);

  // Category stats with gender awareness
  const categoryStats = useMemo(() => {
    const seasonProducts = products.filter((p) => p.season === selectedSeason);
    const categoryMap = new Map<string, {
      name: string;
      genders: Set<string>;
      totalStyles: number;
      menStyles: number;
      womenStyles: number;
      totalNew: number;
      menNew: number;
      womenNew: number;
    }>();

    // Build style-level data first (dedupe by style number)
    const styleData = new Map<string, { category: string; gender: string; isNew: boolean }>();
    seasonProducts.forEach((p) => {
      const category = normalizeCategory(p.categoryDesc) || 'Other';
      const gender = getGenderFromDivision(p.divisionDesc);
      const isNew = !previousSeasonStyles.has(p.styleNumber);

      // Only count each style once (first occurrence)
      if (!styleData.has(p.styleNumber)) {
        styleData.set(p.styleNumber, { category, gender, isNew });
      }
    });

    // Aggregate by category
    styleData.forEach(({ category, gender, isNew }) => {
      if (!categoryMap.has(category)) {
        categoryMap.set(category, {
          name: category,
          genders: new Set(),
          totalStyles: 0,
          menStyles: 0,
          womenStyles: 0,
          totalNew: 0,
          menNew: 0,
          womenNew: 0,
        });
      }

      const cat = categoryMap.get(category)!;
      cat.genders.add(gender);
      cat.totalStyles++;
      if (isNew) cat.totalNew++;

      if (gender === 'Men') {
        cat.menStyles++;
        if (isNew) cat.menNew++;
      } else if (gender === 'Women') {
        cat.womenStyles++;
        if (isNew) cat.womenNew++;
      } else {
        // Unisex counts for both
        cat.menStyles++;
        cat.womenStyles++;
        if (isNew) {
          cat.menNew++;
          cat.womenNew++;
        }
      }
    });

    return Array.from(categoryMap.values()).sort((a, b) => b.totalStyles - a.totalStyles);
  }, [products, selectedSeason, previousSeasonStyles]);

  // Single primary division for the gender-aware category cards. When the
  // user picks more than one division (or none), we don't try to infer a
  // gender; the cards revert to total counts.
  const primaryDivision = divisionFilter.length === 1 ? divisionFilter[0] : '';

  // Get visible categories based on division filter
  const visibleCategories = useMemo(() => {
    if (!primaryDivision) return categoryStats;

    const genderFilter = getGenderFromDivision(primaryDivision);
    return categoryStats.filter((cat) => {
      if (genderFilter === 'Men') return cat.menStyles > 0;
      if (genderFilter === 'Women') return cat.womenStyles > 0;
      return true;
    });
  }, [categoryStats, primaryDivision]);

  // Get style count for a category based on current division filter
  const getCategoryStyleCount = (cat: typeof categoryStats[0]) => {
    if (!primaryDivision) return cat.totalStyles;
    const genderFilter = getGenderFromDivision(primaryDivision);
    if (genderFilter === 'Men') return cat.menStyles;
    if (genderFilter === 'Women') return cat.womenStyles;
    return cat.totalStyles;
  };

  const getCategoryNewCount = (cat: typeof categoryStats[0]) => {
    if (!primaryDivision) return cat.totalNew;
    const genderFilter = getGenderFromDivision(primaryDivision);
    if (genderFilter === 'Men') return cat.menNew;
    if (genderFilter === 'Women') return cat.womenNew;
    return cat.totalNew;
  };

  // All categories totals for the "All" card
  const allCategoryTotals = useMemo(() => {
    let styles = 0;
    let newCount = 0;
    visibleCategories.forEach((cat) => {
      styles += getCategoryStyleCount(cat);
      newCount += getCategoryNewCount(cat);
    });
    return { styles, new: newCount };
  }, [visibleCategories, primaryDivision]);

  // Visible columns
  const visibleColumns = useMemo(() => {
    return COLUMN_GROUPS.filter((g) => visibleGroups[g.id]).flatMap((g) => g.columns);
  }, [visibleGroups]);

  // Handlers
  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDir('asc');
    }
  };

  const toggleColumnGroup = (groupId: string) => {
    if (groupId === 'core') return; // Core always visible
    setVisibleGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  // Group sorted rows by category (only used when viewMode === 'grouped')
  const groupedByCategory = useMemo(() => {
    const groups = new Map<string, typeof sortedData>();
    sortedData.forEach((row) => {
      const cat = normalizeCategory(row.categoryDesc) || 'Uncategorized';
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(row);
    });
    return Array.from(groups.entries())
      .map(([category, rows]) => {
        const styleCount = new Set(rows.map((r) => r.styleNumber)).size;
        const newCount = rows.filter((r) => r.isNew).length;
        // Avg MSRP / blended margin in this group
        let msrpSum = 0;
        let msrpCount = 0;
        let revWtdMargin = 0;
        let marginWeight = 0;
        const seenStyles = new Set<string>();
        rows.forEach((r) => {
          if (seenStyles.has(r.styleNumber)) return;
          seenStyles.add(r.styleNumber);
          if (r.msrp > 0) { msrpSum += r.msrp; msrpCount++; }
          if (r.price > 0 && r.landed > 0) {
            revWtdMargin += r.price - r.landed;
            marginWeight += r.price;
          }
        });
        return {
          category,
          rows,
          styleCount,
          newCount,
          avgMsrp: msrpCount > 0 ? msrpSum / msrpCount : 0,
          blendedMargin: marginWeight > 0 ? (revWtdMargin / marginWeight) * 100 : 0,
        };
      })
      .sort((a, b) => b.styleCount - a.styleCount);
  }, [sortedData]);

  // Tracks which category sections are collapsed in grouped view
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const toggleCategoryCollapse = (cat: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  // PDF export — line-review document grouped by category
  const exportToPDF = async () => {
    const { default: jsPDF } = await import('jspdf');
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 36;
    let y = margin;

    const writeText = (text: string, x: number, yPos: number, opts: { size?: number; bold?: boolean; color?: [number, number, number] } = {}) => {
      doc.setFontSize(opts.size ?? 10);
      doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
      const c = opts.color ?? [40, 40, 40];
      doc.setTextColor(c[0], c[1], c[2]);
      doc.text(text, x, yPos);
    };

    const newPageIfNeeded = (lineHeight: number) => {
      if (y + lineHeight > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
    };

    // Title block
    writeText('KÜHL Line List', margin, y, { size: 18, bold: true });
    writeText(
      `${selectedSeason} · ${stats.styles} styles · ${stats.skus} SKUs · Avg MSRP $${stats.avgMsrp.toFixed(0)} · Blended margin ${stats.blendedMargin.toFixed(1)}%`,
      margin,
      y + 16,
      { size: 9, color: [120, 120, 120] },
    );
    writeText(new Date().toLocaleString(), pageWidth - margin, y, { size: 9, color: [140, 140, 140] });
    // Right-align the date by computing offset
    doc.setFontSize(9);
    const dateStr = new Date().toLocaleString();
    const dateWidth = doc.getTextWidth(dateStr);
    doc.text(dateStr, pageWidth - margin - dateWidth, y);
    y += 36;

    const cols = [
      { key: 'styleNumber', label: 'Style', width: 60 },
      { key: 'styleDesc', label: 'Description', width: 150 },
      { key: 'designerName', label: 'Designer', width: 80 },
      { key: 'colorDesc', label: 'Color', width: 70 },
      { key: 'msrp', label: 'MSRP', width: 50, num: true, currency: true },
      { key: 'price', label: 'WHSL', width: 50, num: true, currency: true },
      { key: 'landed', label: 'Landed', width: 50, num: true, currency: true },
      { key: 'margin', label: 'Margin', width: 50, num: true, percent: true },
      { key: 'flags', label: 'Status', width: 70 },
    ] as const;

    const drawHeaderRow = () => {
      doc.setFillColor(245, 245, 248);
      doc.rect(margin, y - 11, pageWidth - margin * 2, 16, 'F');
      let x = margin + 4;
      cols.forEach((c) => {
        writeText(c.label, x, y, { size: 8, bold: true, color: [80, 80, 80] });
        x += c.width;
      });
      y += 12;
      doc.setDrawColor(200, 200, 200);
      doc.line(margin, y - 4, pageWidth - margin, y - 4);
    };

    const drawDataRow = (row: typeof sortedData[number]) => {
      let x = margin + 4;
      cols.forEach((c) => {
        let txt = '';
        if (c.key === 'flags') {
          const flags: string[] = [];
          if (row.isDropped) flags.push('DROP');
          if (row.isNew) flags.push('NEW');
          else if (row.isCarryOver) flags.push('C/O');
          txt = flags.join(' ');
        } else if (c.key === 'margin') {
          txt = row.margin > 0 ? `${row.margin.toFixed(0)}%` : '—';
        } else if (c.key === 'msrp' || c.key === 'price' || c.key === 'landed') {
          const v = (row as unknown as Record<string, number>)[c.key];
          txt = v > 0 ? `$${v.toFixed(0)}` : '—';
        } else {
          const v = (row as unknown as Record<string, unknown>)[c.key];
          txt = v != null ? String(v) : '';
        }
        // Truncate
        const maxChars = Math.floor(c.width / 4.5);
        if (txt.length > maxChars) txt = txt.slice(0, maxChars - 1) + '…';
        writeText(txt, x, y, { size: 8 });
        x += c.width;
      });
      y += 12;
    };

    // Render either grouped sections or one flat table
    const sourceGroups = viewMode === 'grouped'
      ? groupedByCategory
      : [{ category: 'All Styles', rows: sortedData, styleCount: stats.styles, newCount: stats.new, avgMsrp: stats.avgMsrp, blendedMargin: stats.blendedMargin }];

    sourceGroups.forEach((group) => {
      newPageIfNeeded(40);
      // Section header
      doc.setFillColor(220, 230, 245);
      doc.rect(margin, y - 12, pageWidth - margin * 2, 18, 'F');
      writeText(group.category, margin + 6, y, { size: 11, bold: true, color: [40, 70, 120] });
      const summary = `${group.styleCount} styles · +${group.newCount} new · Avg MSRP $${group.avgMsrp.toFixed(0)} · Margin ${group.blendedMargin.toFixed(1)}%`;
      const summaryWidth = doc.getTextWidth(summary);
      writeText(summary, pageWidth - margin - summaryWidth - 6, y, { size: 8, color: [80, 80, 80] });
      y += 14;
      drawHeaderRow();

      group.rows.forEach((row) => {
        newPageIfNeeded(14);
        drawDataRow(row);
      });
      y += 10;
    });

    doc.save(`KUHL_Line_List_${selectedSeason}_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const exportToExcel = () => {
    const exportData = sortedData.map((row) => {
      const obj: Record<string, unknown> = {
        Season: row.season || selectedSeason,
      };
      visibleColumns.forEach((col) => {
        if (col.key === 'flags') {
          const flags = [];
          if (row.isNew) flags.push('NEW');
          if (row.topSeller) flags.push('TOP');
          if (row.smu) flags.push('SMU');
          if (row.kore) flags.push('KORE');
          if (row.mapProtected) flags.push('MAP');
          if (row.isCarryOver) flags.push('CO');
          obj['Flags'] = flags.join(', ');
        } else if (col.key === 'margin') {
          obj[col.label] = row.margin > 0 ? `${row.margin.toFixed(1)}%` : '';
        } else if (col.key === 'carryOver') {
          obj[col.label] = row.isCarryOver ? 'Y' : 'N';
        } else {
          obj[col.label] = (row as unknown as Record<string, unknown>)[col.key];
        }
      });
      // Add catalog membership to export
      const styleCats = membershipMap.get(row.styleNumber);
      if (styleCats && styleCats.size > 0) {
        obj['Catalogs'] = catalogs.filter(c => styleCats.has(c.id)).map(c => c.label).join(', ');
      } else {
        obj['Catalogs'] = '';
      }
      return obj;
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Line List ${selectedSeason}`);
    XLSX.writeFile(wb, `KUHL_LineList_${selectedSeason}.xlsx`);
  };

  const getCellValue = (row: EnrichedProduct & { colorCount?: number }, key: string): React.ReactNode => {
    // Style number renders with status chips (NEW / CARRYOVER / DROPPED / DISC).
    if (key === 'styleNumber') {
      const styleDisc = (row as unknown as Record<string, unknown>).styleDisc;
      const isDisc = styleDisc === 'Y' || styleDisc === true;
      return (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span>{row.styleNumber}</span>
          {row.isDropped && (
            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300">
              DROPPED
            </span>
          )}
          {isDisc && (
            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300">
              DISC
            </span>
          )}
          {row.isNew && !row.isDropped && (
            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-cyan-100 dark:bg-cyan-900 text-cyan-700 dark:text-cyan-300">
              NEW
            </span>
          )}
          {row.isCarryOver && !row.isNew && !row.isDropped && (
            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-surface-tertiary text-text-muted">
              C/O
            </span>
          )}
        </div>
      );
    }
    // Handle rolled-up color columns
    if (rollUpStyles && key === 'color') {
      const count = row.colorCount || 1;
      return (
        <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-400 text-xs font-bold rounded">
          {count} color{count !== 1 ? 's' : ''}
        </span>
      );
    }
    if (rollUpStyles && key === 'colorDesc') {
      return '—';
    }
    if (key === 'msrp' || key === 'price' || key === 'landed' || key === 'fob') {
      return formatCurrency((row as unknown as Record<string, number>)[key]);
    }
    if (key === 'cadMsrp' || key === 'cadPrice') {
      const val = (row as unknown as Record<string, number>)[key];
      return val ? formatCurrency(val) : '—';
    }
    if (key === 'margin') {
      return formatPercent(row.margin);
    }
    if (key === 'carryOver') {
      return row.isCarryOver ? 'Y' : 'N';
    }
    if (key === 'categoryDesc') {
      return normalizeCategory(row.categoryDesc) || '—';
    }
    if (key === 'catalogs') {
      const styleCatalogs = membershipMap.get(row.styleNumber) || new Set();
      const isPopoverOpen = catalogPopoverStyle === row.styleNumber;

      return (
        <div className="relative flex flex-wrap gap-1 items-center">
          {catalogs.map((cat) => {
            const isIn = styleCatalogs.has(cat.id);
            const override = getOverrideStatus(cat.id, row.styleNumber);
            if (!isIn) return null;

            const badgeColors: Record<string, string> = {
              red: 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400',
              green: 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400',
              purple: 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-400',
              amber: 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400',
              blue: 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400',
              cyan: 'bg-cyan-100 dark:bg-cyan-900/50 text-cyan-700 dark:text-cyan-400',
              orange: 'bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-400',
            };

            return (
              <span
                key={cat.id}
                className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-bold rounded ${badgeColors[cat.color] || badgeColors.blue}`}
                title={override === 'add' ? `Manually added to ${cat.label}` : cat.label}
              >
                {cat.shortLabel}
                {override === 'add' && <span className="text-[10px] opacity-60">*</span>}
              </span>
            );
          })}
          {styleCatalogs.size === 0 && <span className="text-xs text-text-faint">—</span>}

          {/* Edit button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setCatalogPopoverStyle(isPopoverOpen ? null : row.styleNumber);
            }}
            className="ml-auto opacity-0 group-hover/row:opacity-100 w-5 h-5 flex items-center justify-center rounded hover:bg-surface-tertiary text-text-muted hover:text-text-secondary transition-all"
            title="Edit catalog membership"
          >
            <Tag className="w-3 h-3" />
          </button>

          {/* Popover */}
          {isPopoverOpen && (
            <div className="absolute right-0 top-full mt-1 z-50 bg-surface rounded-xl border-2 border-border-primary shadow-xl p-3 min-w-[200px]">
              <div className="text-xs font-bold text-text-muted uppercase tracking-wide mb-2">Catalogs</div>
              {catalogs.map((cat) => {
                const isIn = styleCatalogs.has(cat.id);
                const override = getOverrideStatus(cat.id, row.styleNumber);
                return (
                  <button
                    key={cat.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isIn) {
                        if (override === 'add') {
                          resetOverride(cat.id, row.styleNumber);
                        } else {
                          removeStyleFromCatalog(cat.id, row.styleNumber);
                        }
                      } else {
                        if (override === 'remove') {
                          resetOverride(cat.id, row.styleNumber);
                        } else {
                          addStyleToCatalog(cat.id, row.styleNumber);
                        }
                      }
                    }}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      isIn ? 'text-text-primary' : 'text-text-muted'
                    } hover:bg-surface-tertiary`}
                  >
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                      isIn ? 'bg-cyan-600 border-cyan-600' : 'border-border-strong'
                    }`}>
                      {isIn && <Check className="w-3 h-3 text-white" />}
                    </div>
                    {cat.label}
                    {override && (
                      <span className="text-[10px] text-amber-500 ml-auto">
                        {override === 'add' ? 'added' : 'removed'}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      );
    }
    const val = (row as unknown as Record<string, unknown>)[key];
    return val !== null && val !== undefined ? String(val) : '—';
  };

  const quickFilterButtons: { id: QuickFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'new', label: 'New' },
    { id: 'carryover', label: 'Carryover' },
    // Hidden until flag data (topSeller/smu/kore/map) is populated in Product model:
    // { id: 'topSellers', label: 'Top Sellers' },
    // { id: 'smu', label: 'SMU' },
    // { id: 'kore', label: 'KORE' },
    // { id: 'map', label: 'MAP' },
    { id: 'dropped', label: 'Dropped' },
  ];

  return (
    <div className="p-6 space-y-4">
      {/* Header — mirrors Season View */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-4xl font-display font-bold text-text-primary">Line List</h2>
          <p className="text-base text-text-muted mt-2">
            Internal product database — {selectedSeason} · {stats.styles} styles · {stats.skus} SKUs
          </p>
        </div>
        <div className="flex items-center gap-3">
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
          <button
            onClick={exportToPDF}
            title="Print-ready PDF grouped by category — for line review meetings"
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
          >
            <FileText className="w-4 h-4" />
            PDF
          </button>
          <button
            onClick={exportToExcel}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700 transition-colors"
          >
            <Download className="w-4 h-4" />
            Excel
          </button>
        </div>
      </div>

      {/* Data Sources Legend */}
      <SourceLegend sources={['linelist', 'pricing', 'landed', 'sales', 'calculated']} className="bg-surface rounded-xl border-2 border-border-primary p-4" />

      {/* Filters Row 1 */}
      <div className="bg-surface rounded-xl border-2 border-border-primary p-4">
        <div className="flex flex-wrap gap-4 items-end">
          {/* Season */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold text-text-secondary uppercase tracking-wide">Season</label>
            <select
              value={selectedSeason}
              onChange={(e) => {
                setSelectedSeason(e.target.value);
                setCurrentPage(1);
              }}
              className="px-4 py-2.5 text-base border-2 border-border-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 min-w-[120px] font-mono font-bold"
            >
              <option value="ALL">ALL</option>
              {seasons.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <MultiSelect
            label="Division"
            placeholder="All divisions"
            options={divisions}
            values={divisionFilter}
            onChange={(next) => {
              setDivisionFilter(next);
              setCategoryFilter([]);
              setCurrentPage(1);
            }}
            widthClass="w-[180px]"
          />

          <MultiSelect
            label="Category"
            placeholder="All categories"
            options={categories}
            values={categoryFilter}
            onChange={(next) => { setCategoryFilter(next); setCurrentPage(1); }}
            widthClass="w-[180px]"
          />

          <MultiSelect
            label="Designer"
            placeholder="All designers"
            options={designers}
            values={designerFilter}
            onChange={(next) => { setDesignerFilter(next); setCurrentPage(1); }}
            widthClass="w-[180px]"
          />

          <MultiSelect
            label="Product Line"
            placeholder="All product lines"
            options={productLines}
            values={productLineFilter}
            onChange={(next) => { setProductLineFilter(next); setCurrentPage(1); }}
            widthClass="w-[180px]"
          />

          {/* Search */}
          <div className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
            <label className="text-sm font-bold text-text-secondary uppercase tracking-wide">Search</label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Style #, name, color..."
              className="px-4 py-2.5 text-base border-2 border-border-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500"
            />
          </div>

          {/* Roll Up Styles Toggle */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold text-text-secondary uppercase tracking-wide">View</label>
            <label className="flex items-center gap-2 px-4 py-2.5 bg-surface-secondary border-2 border-border-primary rounded-lg cursor-pointer hover:bg-surface-tertiary transition-colors">
              <input
                type="checkbox"
                checked={rollUpStyles}
                onChange={(e) => {
                  setRollUpStyles(e.target.checked);
                  setCurrentPage(1);
                }}
                className="w-4 h-4 rounded border-border-strong text-cyan-600 focus:ring-cyan-500"
              />
              <span className="text-sm font-medium text-text-secondary whitespace-nowrap">
                Roll up styles
              </span>
            </label>
          </div>

          {/* Hide No Sales Toggle - only for historical seasons */}
          {!isSelectedSeasonFuture && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-bold text-text-secondary uppercase tracking-wide">Filter</label>
              <label className="flex items-center gap-2 px-4 py-2.5 bg-surface-secondary border-2 border-border-primary rounded-lg cursor-pointer hover:bg-surface-tertiary transition-colors">
                <input
                  type="checkbox"
                  checked={hideNoSales}
                  onChange={(e) => {
                    setHideNoSales(e.target.checked);
                    setCurrentPage(1);
                  }}
                  className="w-4 h-4 rounded border-border-strong text-cyan-600 focus:ring-cyan-500"
                />
                <span className="text-sm font-medium text-text-secondary whitespace-nowrap">
                  Hide no-sales styles
                </span>
              </label>
            </div>
          )}

          {/* Hide rows with no pricing AND no cost record */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold text-text-secondary uppercase tracking-wide invisible">x</label>
            <label
              className="flex items-center gap-2 px-4 py-2.5 bg-surface-secondary border-2 border-border-primary rounded-lg cursor-pointer hover:bg-surface-tertiary transition-colors"
              title="Hide rows that have no Pricing or Cost record for the row's season — usually catalog placeholders with nothing to review."
            >
              <input
                type="checkbox"
                checked={hideNoPricing}
                onChange={(e) => {
                  setHideNoPricing(e.target.checked);
                  setCurrentPage(1);
                }}
                className="w-4 h-4 rounded border-border-strong text-cyan-600 focus:ring-cyan-500"
              />
              <span className="text-sm font-medium text-text-secondary whitespace-nowrap">
                Hide blank rows
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* Catalog Tabs */}
      <div className="bg-surface rounded-xl border-2 border-border-primary p-4">
        <div className="flex items-center gap-2 mb-3">
          <Tag className="w-4 h-4 text-text-muted" />
          <span className="text-xs font-bold text-text-muted uppercase tracking-wide">Catalog</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Master tab */}
          <button
            onClick={() => { setSelectedCatalog('master'); setCurrentPage(1); }}
            className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${
              selectedCatalog === 'master'
                ? 'bg-cyan-600 text-white shadow-md'
                : 'bg-surface-secondary text-text-secondary hover:bg-surface-tertiary border border-border-primary'
            }`}
          >
            Master
            <span className="ml-1.5 text-xs opacity-75">({stats.styles})</span>
          </button>

          {/* Catalog tabs */}
          {catalogs.map((cat) => {
            const count = getStylesInCatalog(cat.id).size;
            const colorClasses: Record<string, { active: string; inactive: string }> = {
              red: { active: 'bg-red-600 text-white', inactive: 'border-red-300 dark:border-red-800 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950' },
              green: { active: 'bg-green-600 text-white', inactive: 'border-green-300 dark:border-green-800 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950' },
              purple: { active: 'bg-purple-600 text-white', inactive: 'border-purple-300 dark:border-purple-800 text-purple-700 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950' },
              amber: { active: 'bg-amber-600 text-white', inactive: 'border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950' },
              blue: { active: 'bg-blue-600 text-white', inactive: 'border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950' },
              cyan: { active: 'bg-cyan-600 text-white', inactive: 'border-cyan-300 dark:border-cyan-800 text-cyan-700 dark:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-950' },
              orange: { active: 'bg-orange-600 text-white', inactive: 'border-orange-300 dark:border-orange-800 text-orange-700 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950' },
            };
            const colors = colorClasses[cat.color] || colorClasses.blue;
            const isActive = selectedCatalog === cat.id;

            return (
              <div key={cat.id} className="relative group">
                <button
                  onClick={() => { setSelectedCatalog(cat.id); setCurrentPage(1); }}
                  className={`px-4 py-2 text-sm font-bold rounded-lg transition-all border ${
                    isActive ? colors.active + ' shadow-md border-transparent' : colors.inactive
                  }`}
                >
                  {cat.label}
                  <span className="ml-1.5 text-xs opacity-75">({count})</span>
                </button>
                {/* Delete button for custom catalogs */}
                {!cat.isBuiltIn && (
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteCatalog(cat.id); if (selectedCatalog === cat.id) setSelectedCatalog('master'); }}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-red-600"
                    title="Delete catalog"
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}

          {/* Add Custom Catalog button */}
          <button
            onClick={() => setShowCreateCatalog(true)}
            className="px-3 py-2 text-sm font-bold rounded-lg border-2 border-dashed border-border-primary text-text-muted hover:border-cyan-500 hover:text-cyan-600 transition-all flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            Custom
          </button>
        </div>
      </div>

      {/* Create Catalog Modal */}
      {showCreateCatalog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowCreateCatalog(false)}>
          <div className="bg-surface rounded-2xl border-2 border-border-primary p-6 w-[400px] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold text-text-primary mb-4">Create Custom Catalog</h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-bold text-text-secondary uppercase tracking-wide">Name</label>
                <input
                  type="text"
                  value={newCatalogName}
                  onChange={(e) => {
                    setNewCatalogName(e.target.value);
                    if (!newCatalogShort || newCatalogShort === newCatalogName.slice(0, 4).toUpperCase()) {
                      setNewCatalogShort(e.target.value.slice(0, 4).toUpperCase());
                    }
                  }}
                  placeholder="e.g., Cabela's"
                  className="mt-1 w-full px-4 py-2.5 text-base border-2 border-border-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-sm font-bold text-text-secondary uppercase tracking-wide">Short Label (3-4 chars)</label>
                <input
                  type="text"
                  value={newCatalogShort}
                  onChange={(e) => setNewCatalogShort(e.target.value.slice(0, 4).toUpperCase())}
                  placeholder="e.g., CAB"
                  className="mt-1 w-full px-4 py-2.5 text-base border-2 border-border-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 font-mono"
                  maxLength={4}
                />
              </div>
              <div>
                <label className="text-sm font-bold text-text-secondary uppercase tracking-wide">Color</label>
                <div className="flex gap-2 mt-1">
                  {['blue', 'cyan', 'green', 'amber', 'orange', 'red', 'purple'].map((color) => (
                    <button
                      key={color}
                      onClick={() => setNewCatalogColor(color)}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${
                        newCatalogColor === color ? 'border-text-primary scale-110' : 'border-transparent'
                      } bg-${color}-500`}
                    />
                  ))}
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowCreateCatalog(false)}
                  className="flex-1 px-4 py-2.5 text-base font-semibold text-text-secondary border-2 border-border-primary rounded-lg hover:bg-surface-tertiary transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (newCatalogName.trim()) {
                      createCatalog(newCatalogName.trim(), newCatalogShort || newCatalogName.slice(0, 4), newCatalogColor);
                      setShowCreateCatalog(false);
                      setNewCatalogName('');
                      setNewCatalogShort('');
                      setNewCatalogColor('blue');
                    }
                  }}
                  disabled={!newCatalogName.trim()}
                  className="flex-1 px-4 py-2.5 text-base font-semibold bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors disabled:opacity-50"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stat Cards — line-review tuned */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-surface-secondary rounded-xl p-4 border-l-4 border-cyan-500">
          <div className="text-xs text-text-muted uppercase tracking-wide">Styles</div>
          <div className="mt-1 font-mono font-bold text-2xl text-text-primary">{stats.styles.toLocaleString()}</div>
          <div className="text-xs text-text-muted mt-1">
            {stats.skus.toLocaleString()} SKUs
            {stats.stylesDelta !== null && (
              <span className={`ml-2 font-semibold ${stats.stylesDelta >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                {stats.stylesDelta >= 0 ? '+' : ''}{stats.stylesDelta} vs {stats.priorSeason}
              </span>
            )}
          </div>
        </div>
        <div className="bg-surface-secondary rounded-xl p-4 border-l-4 border-emerald-500">
          <div className="text-xs text-text-muted uppercase tracking-wide">New</div>
          <div className="mt-1 font-mono font-bold text-2xl text-emerald-600 dark:text-emerald-400">{stats.new.toLocaleString()}</div>
          <div className="text-xs text-text-muted mt-1">
            {stats.styles > 0 ? `${((stats.new / stats.styles) * 100).toFixed(0)}% of line` : '—'}
          </div>
        </div>
        <div className="bg-surface-secondary rounded-xl p-4 border-l-4 border-slate-500">
          <div className="text-xs text-text-muted uppercase tracking-wide">Carryover</div>
          <div className="mt-1 font-mono font-bold text-2xl text-text-primary">{stats.carryover.toLocaleString()}</div>
          <div className="text-xs text-text-muted mt-1">
            {stats.styles > 0 ? `${((stats.carryover / stats.styles) * 100).toFixed(0)}% of line` : '—'}
          </div>
        </div>
        <div className="bg-surface-secondary rounded-xl p-4 border-l-4 border-amber-500">
          <div className="text-xs text-text-muted uppercase tracking-wide">Dropped</div>
          <div className="mt-1 font-mono font-bold text-2xl text-amber-600 dark:text-amber-400">{stats.dropped.toLocaleString()}</div>
          <div className="text-xs text-text-muted mt-1">vs {stats.priorSeason || '—'}</div>
        </div>
        <div className="bg-surface-secondary rounded-xl p-4 border-l-4 border-blue-500">
          <div className="text-xs text-text-muted uppercase tracking-wide">Avg MSRP</div>
          <div className="mt-1 font-mono font-bold text-2xl text-text-primary">
            {stats.avgMsrp > 0 ? `$${stats.avgMsrp.toFixed(0)}` : '—'}
          </div>
          <div className="text-xs text-text-muted mt-1">
            {stats.msrpDelta !== null && (
              <span className={`font-semibold ${stats.msrpDelta >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                {stats.msrpDelta >= 0 ? '+' : ''}${stats.msrpDelta.toFixed(0)} vs {stats.priorSeason}
              </span>
            )}
          </div>
        </div>
        <div className="bg-surface-secondary rounded-xl p-4 border-l-4 border-purple-500">
          <div className="text-xs text-text-muted uppercase tracking-wide">Blended Margin</div>
          <div className={`mt-1 font-mono font-bold text-2xl ${
            stats.blendedMargin >= 50 ? 'text-emerald-500'
              : stats.blendedMargin >= 40 ? 'text-amber-500'
              : 'text-red-500'
          }`}>
            {stats.blendedMargin > 0 ? `${stats.blendedMargin.toFixed(1)}%` : '—'}
          </div>
          <div className="text-xs text-text-muted mt-1">
            {stats.designers} designers
            {!isSelectedSeasonFuture && stats.noSales > 0 && (
              <span className="ml-2 text-amber-500">· {stats.noSales} no sales</span>
            )}
          </div>
        </div>
      </div>

      {/* Category Cards */}
      <div className="bg-surface rounded-xl border-2 border-border-primary p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-text-muted uppercase tracking-wide">Categories</span>
            {primaryDivision && (
              <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full font-medium">
                {getGenderFromDivision(primaryDivision)}&apos;s
              </span>
            )}
          </div>
          {categoryFilter.length > 0 && (
            <button
              onClick={() => setCategoryFilter([])}
              className="text-xs text-text-muted hover:text-text-secondary flex items-center gap-1"
            >
              <X className="w-3 h-3" />
              Clear filter
            </button>
          )}
        </div>

        <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-9 gap-3">
          {/* All Categories Card */}
          <button
            onClick={() => setCategoryFilter([])}
            className={`relative p-4 rounded-xl border-2 transition-all text-center ${
              categoryFilter.length === 0
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/50 shadow-md'
                : 'border-border-primary bg-surface hover:border-border-strong hover:shadow-sm'
            }`}
          >
            <div className={`text-2xl font-bold ${categoryFilter.length === 0 ? 'text-blue-600 dark:text-blue-400' : 'text-text-primary'}`}>
              {allCategoryTotals.styles}
            </div>
            <div className="text-xs text-text-muted uppercase tracking-wide mt-1">All</div>
            <div className={`text-xs mt-2 ${categoryFilter.length === 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-emerald-500'}`}>
              +{allCategoryTotals.new} new
            </div>
            {categoryFilter.length === 0 && (
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full"></div>
            )}
          </button>

          {/* Individual Category Cards — click to toggle that category in the multi-select. */}
          {visibleCategories.map((cat) => {
            const styleCount = getCategoryStyleCount(cat);
            const newCount = getCategoryNewCount(cat);
            const isSelected = categoryFilter.includes(cat.name);

            return (
              <button
                key={cat.name}
                onClick={() =>
                  setCategoryFilter((prev) =>
                    prev.includes(cat.name) ? prev.filter((c) => c !== cat.name) : [...prev, cat.name],
                  )
                }
                className={`relative p-4 rounded-xl border-2 transition-all text-center ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/50 shadow-md'
                    : 'border-border-primary bg-surface hover:border-border-strong hover:shadow-sm'
                }`}
              >
                <div className={`text-2xl font-bold ${isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-text-primary'}`}>
                  {styleCount}
                </div>
                <div className="text-xs text-text-muted uppercase tracking-wide mt-1 truncate" title={cat.name}>
                  {cat.name}
                </div>
                <div className={`text-xs mt-2 ${newCount > 0 ? 'text-emerald-500' : 'text-text-faint'}`}>
                  {newCount > 0 ? `+${newCount} new` : '—'}
                </div>
                {isSelected && (
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full"></div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Quick Filters */}
      <div className="bg-surface rounded-xl border-2 border-border-primary p-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-text-secondary uppercase mr-2">Quick Filters:</span>
          {quickFilterButtons.map((btn) => (
            <button
              key={btn.id}
              onClick={() => {
                setQuickFilter(btn.id);
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 text-sm font-semibold rounded-lg transition-colors ${
                quickFilter === btn.id
                  ? 'bg-cyan-600 text-white'
                  : 'bg-surface-tertiary text-text-secondary hover:bg-surface-tertiary'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* Column Groups + View Mode */}
      <div className="bg-surface rounded-xl border-2 border-border-primary p-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold text-text-secondary uppercase mr-2">Columns:</span>
          {COLUMN_GROUPS.map((group) => (
            <button
              key={group.id}
              onClick={() => toggleColumnGroup(group.id)}
              disabled={group.id === 'core'}
              className={`px-3 py-1.5 text-sm font-semibold rounded-lg transition-colors ${
                visibleGroups[group.id]
                  ? 'bg-cyan-100 dark:bg-cyan-900 text-cyan-700 dark:text-cyan-300 border-2 border-cyan-300 dark:border-cyan-700'
                  : 'bg-surface-tertiary text-text-muted border-2 border-transparent hover:bg-surface-tertiary'
              } ${group.id === 'core' ? 'cursor-default' : ''}`}
            >
              {group.label}
            </button>
          ))}
          <span className="text-sm font-bold text-text-secondary uppercase mx-2 ml-6">View:</span>
          <div className="inline-flex rounded-lg border-2 border-border-primary overflow-hidden">
            <button
              onClick={() => setViewMode('flat')}
              className={`px-3 py-1.5 text-sm font-semibold transition-colors ${
                viewMode === 'flat' ? 'bg-cyan-600 text-white' : 'bg-surface-tertiary text-text-muted hover:bg-surface-secondary'
              }`}
            >
              Flat
            </button>
            <button
              onClick={() => setViewMode('grouped')}
              className={`px-3 py-1.5 text-sm font-semibold transition-colors ${
                viewMode === 'grouped' ? 'bg-cyan-600 text-white' : 'bg-surface-tertiary text-text-muted hover:bg-surface-secondary'
              }`}
            >
              Grouped by Category
            </button>
          </div>
        </div>
      </div>

      {/* Data Table — Flat */}
      {viewMode === 'flat' && (
      <div className="bg-surface rounded-xl border-2 border-border-primary shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-surface-tertiary border-b-2 border-border-strong">
                {visibleColumns.map((col, idx) => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className={`px-3 py-3 text-left text-sm font-bold text-text-secondary uppercase tracking-wide cursor-pointer hover:text-text-primary ${
                      idx < 2 ? 'sticky left-0 bg-surface-tertiary z-10' : ''
                    }`}
                    style={{
                      minWidth: col.width,
                      left: idx === 0 ? 0 : idx === 1 ? '100px' : undefined,
                    }}
                  >
                    <div className="flex items-center gap-1">
                      {col.label}
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                ))}
                <th className="px-2 py-3 text-center text-xs font-bold text-text-muted uppercase tracking-wide" style={{ minWidth: '70px' }}>
                  Edit
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedData.map((row, rowIdx) => (
                <tr
                  key={`${row.styleNumber}-${row.color}-${rowIdx}`}
                  onClick={() => onStyleClick(row.styleNumber)}
                  className={`group/row border-b border-border-primary cursor-pointer transition-colors ${
                    rowIdx % 2 === 0 ? 'bg-surface' : 'bg-surface-secondary'
                  } hover:bg-hover-accent`}
                >
                  {visibleColumns.map((col, colIdx) => (
                    <td
                      key={col.key}
                      className={`px-3 py-3 text-sm ${
                        colIdx < 2 ? 'sticky bg-inherit z-10' : ''
                      } ${col.key === 'styleNumber' ? 'font-mono font-bold text-text-primary' : 'text-text-secondary'} ${
                        row.isDropped ? 'opacity-60 line-through' : ''
                      }`}
                      style={{
                        left: colIdx === 0 ? 0 : colIdx === 1 ? '100px' : undefined,
                      }}
                    >
                      {getCellValue(row, col.key)}
                    </td>
                  ))}
                  <td className="px-2 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => setEditingStyleSeason({ styleNumber: row.styleNumber, season: row.season })}
                      title="Edit MSRP / Wholesale / Landed / Margin"
                      className="p-1.5 rounded text-text-muted hover:text-cyan-400 hover:bg-cyan-500/10 transition-colors"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-5 py-4 bg-surface-tertiary border-t-2 border-border-strong flex items-center justify-between">
          <span className="text-sm font-semibold text-text-secondary">
            Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, sortedData.length)} of {sortedData.length} {rollUpStyles ? 'styles' : 'SKUs'}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="flex items-center gap-1 px-3 py-1.5 text-sm font-semibold rounded-lg bg-surface border-2 border-border-strong text-text-secondary hover:bg-hover disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
              Prev
            </button>
            <span className="text-sm font-mono text-text-secondary">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="flex items-center gap-1 px-3 py-1.5 text-sm font-semibold rounded-lg bg-surface border-2 border-border-strong text-text-secondary hover:bg-hover disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
      )}

      {/* Data — Grouped by category */}
      {viewMode === 'grouped' && (
        <div className="space-y-3">
          {groupedByCategory.length === 0 && (
            <div className="bg-surface rounded-xl border-2 border-border-primary p-6 text-center text-text-muted">
              No styles match these filters.
            </div>
          )}
          {groupedByCategory.map((group) => {
            const collapsed = collapsedCategories.has(group.category);
            return (
              <div key={group.category} className="bg-surface rounded-xl border-2 border-border-primary overflow-hidden">
                <button
                  onClick={() => toggleCategoryCollapse(group.category)}
                  className="w-full flex items-center justify-between gap-4 px-5 py-3 bg-surface-tertiary hover:bg-surface-secondary transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <ChevronRight className={`w-4 h-4 text-text-muted transition-transform ${collapsed ? '' : 'rotate-90'}`} />
                    <span className="text-base font-bold text-text-primary">{group.category}</span>
                    <span className="text-xs text-text-muted">
                      {group.styleCount} styles{group.newCount > 0 ? ` · +${group.newCount} new` : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-text-muted">
                    <span>Avg MSRP <span className="font-mono font-semibold text-text-primary">${group.avgMsrp.toFixed(0)}</span></span>
                    <span>Margin <span className={`font-mono font-semibold ${
                      group.blendedMargin >= 50 ? 'text-emerald-500'
                        : group.blendedMargin >= 40 ? 'text-amber-500'
                        : 'text-red-500'
                    }`}>{group.blendedMargin.toFixed(1)}%</span></span>
                  </div>
                </button>
                {!collapsed && (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="bg-surface-secondary border-b border-border-primary">
                          {visibleColumns.map((col) => (
                            <th
                              key={col.key}
                              onClick={() => handleSort(col.key)}
                              className="px-3 py-2 text-left text-xs font-bold text-text-muted uppercase tracking-wide cursor-pointer hover:text-text-primary"
                              style={{ minWidth: col.width }}
                            >
                              {col.label}
                            </th>
                          ))}
                          <th className="px-2 py-2 text-center text-xs font-bold text-text-muted uppercase">Edit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.rows.map((row, rIdx) => (
                          <tr
                            key={`${row.styleNumber}-${row.color}-${rIdx}`}
                            onClick={() => onStyleClick(row.styleNumber)}
                            className={`border-b border-border-primary cursor-pointer hover:bg-hover-accent ${
                              rIdx % 2 === 0 ? 'bg-surface' : 'bg-surface-secondary/50'
                            }`}
                          >
                            {visibleColumns.map((col) => (
                              <td
                                key={col.key}
                                className={`px-3 py-2 text-sm ${col.key === 'styleNumber' ? 'font-mono font-bold text-text-primary' : 'text-text-secondary'} ${
                                  row.isDropped ? 'opacity-60 line-through' : ''
                                }`}
                              >
                                {getCellValue(row, col.key)}
                              </td>
                            ))}
                            <td className="px-2 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() =>
                                  setEditingStyleSeason({ styleNumber: row.styleNumber, season: row.season })
                                }
                                title="Edit MSRP / Wholesale / Landed / Margin"
                                className="p-1.5 rounded text-text-muted hover:text-cyan-400 hover:bg-cyan-500/10"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editingStyleSeason && (
        <StyleEditModal
          cost={
            costs.find(
              (c) =>
                c.styleNumber === editingStyleSeason.styleNumber &&
                c.season === editingStyleSeason.season,
            ) ?? null
          }
          pricing={
            pricing.find(
              (p) =>
                p.styleNumber === editingStyleSeason.styleNumber &&
                p.season === editingStyleSeason.season,
            ) ?? null
          }
          onClose={() => setEditingStyleSeason(null)}
          onSaved={(updates) => {
            if (updates.cost) onCostUpdated?.(updates.cost);
            if (updates.pricing) onPricingUpdated?.(updates.pricing);
            setEditingStyleSeason(null);
          }}
        />
      )}
    </div>
  );
}
