'use client';

import React, { useState, useMemo } from 'react';
import { Product, SalesRecord, PricingRecord, CostRecord, normalizeCategory } from '@/types/product';
import { sortSeasons } from '@/lib/store';
import { ArrowUpDown, Download, ChevronLeft, ChevronRight, EyeOff, X } from 'lucide-react';
import * as XLSX from 'xlsx';

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
  onStyleClick: (styleNumber: string) => void;
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
];

const ITEMS_PER_PAGE = 50;

export default function LineListView({
  products,
  sales,
  pricing,
  costs,
  onStyleClick,
}: LineListViewProps) {
  // Get unique seasons
  const seasons = useMemo(() => {
    const allSeasons = new Set<string>();
    products.forEach((p) => p.season && allSeasons.add(p.season));
    return sortSeasons(Array.from(allSeasons));
  }, [products]);

  // State
  const [selectedSeason, setSelectedSeason] = useState<string>(seasons[seasons.length - 1] || '');
  const [divisionFilter, setDivisionFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [designerFilter, setDesignerFilter] = useState<string>('');
  const [productLineFilter, setProductLineFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [visibleGroups, setVisibleGroups] = useState<Record<string, boolean>>({
    core: true,
    pricing: true,
    team: false,
    specs: false,
    sourcing: false,
    availability: false,
  });
  const [sortColumn, setSortColumn] = useState<string>('styleNumber');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [hideNoSales, setHideNoSales] = useState<boolean>(false);
  const [rollUpStyles, setRollUpStyles] = useState<boolean>(false);

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

  // Check if current season is a future season (27SP or later)
  const isFutureSeason = useMemo(() => {
    if (selectedSeason === 'ALL') return false;
    const futureSessions = ['27SP', '27FA', '28SP', '28FA', '29SP', '29FA'];
    return futureSessions.includes(selectedSeason);
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

    // Apply filters
    if (divisionFilter) data = data.filter((d) => d.divisionDesc === divisionFilter);
    if (categoryFilter) data = data.filter((d) => normalizeCategory(d.categoryDesc) === categoryFilter);
    if (designerFilter) data = data.filter((d) => d.designerName === designerFilter);
    if (productLineFilter) data = data.filter((d) => d.productLine === productLineFilter);

    // Hide styles with no sales (only for historical seasons)
    if (hideNoSales && !isFutureSeason) {
      data = data.filter((d) => stylesWithSales.has(d.styleNumber));
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
    isFutureSeason,
    stylesWithSales,
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

  // Stats
  const stats = useMemo(() => {
    const seasonProducts = products.filter((p) => p.season === selectedSeason);
    const uniqueStyles = new Set(seasonProducts.map((p) => p.styleNumber));
    const uniqueDesigners = new Set(seasonProducts.map((p) => p.designerName).filter(Boolean));
    const newStyles = Array.from(uniqueStyles).filter((s) => !previousSeasonStyles.has(s));
    const droppedStyles = Array.from(previousSeasonStyles).filter((s) => !currentSeasonStyles.has(s));

    // Count styles with no sales (only meaningful for historical seasons)
    const noSalesStyles = Array.from(uniqueStyles).filter((s) => !stylesWithSales.has(s));

    return {
      styles: uniqueStyles.size,
      skus: seasonProducts.length,
      new: newStyles.length,
      dropped: droppedStyles.length,
      designers: uniqueDesigners.size,
      noSales: noSalesStyles.length,
    };
  }, [products, selectedSeason, previousSeasonStyles, currentSeasonStyles, stylesWithSales]);

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

  // Get visible categories based on division filter
  const visibleCategories = useMemo(() => {
    if (!divisionFilter) return categoryStats;

    const genderFilter = getGenderFromDivision(divisionFilter);
    return categoryStats.filter((cat) => {
      if (genderFilter === 'Men') return cat.menStyles > 0;
      if (genderFilter === 'Women') return cat.womenStyles > 0;
      return true;
    });
  }, [categoryStats, divisionFilter]);

  // Get style count for a category based on current division filter
  const getCategoryStyleCount = (cat: typeof categoryStats[0]) => {
    if (!divisionFilter) return cat.totalStyles;
    const genderFilter = getGenderFromDivision(divisionFilter);
    if (genderFilter === 'Men') return cat.menStyles;
    if (genderFilter === 'Women') return cat.womenStyles;
    return cat.totalStyles;
  };

  const getCategoryNewCount = (cat: typeof categoryStats[0]) => {
    if (!divisionFilter) return cat.totalNew;
    const genderFilter = getGenderFromDivision(divisionFilter);
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
  }, [visibleCategories, divisionFilter]);

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

  const exportToExcel = () => {
    const exportData = sortedData.map((row) => {
      const obj: Record<string, unknown> = {};
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
      return obj;
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Line List ${selectedSeason}`);
    XLSX.writeFile(wb, `KUHL_LineList_${selectedSeason}.xlsx`);
  };

  const formatCurrency = (val: number) => (val > 0 ? `$${val.toFixed(2)}` : '—');
  const formatPercent = (val: number) => (val > 0 ? `${val.toFixed(1)}%` : '—');

  const getCellValue = (row: EnrichedProduct & { colorCount?: number }, key: string): React.ReactNode => {
    // Handle rolled-up color columns
    if (rollUpStyles && key === 'color') {
      const count = row.colorCount || 1;
      return (
        <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded">
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
    const val = (row as unknown as Record<string, unknown>)[key];
    return val !== null && val !== undefined ? String(val) : '—';
  };

  const quickFilterButtons: { id: QuickFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'new', label: 'New' },
    { id: 'carryover', label: 'Carryover' },
    { id: 'topSellers', label: 'Top Sellers' },
    { id: 'smu', label: 'SMU' },
    { id: 'kore', label: 'KORE' },
    { id: 'map', label: 'MAP' },
    { id: 'dropped', label: 'Dropped' },
  ];

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-4xl font-display font-bold text-gray-900">Line List</h2>
          <p className="text-base text-gray-500 mt-2">
            Internal product database for {selectedSeason}
          </p>
        </div>
        <button
          onClick={exportToExcel}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700 transition-colors"
        >
          <Download className="w-4 h-4" />
          Export Excel
        </button>
      </div>

      {/* Filters Row 1 */}
      <div className="bg-white rounded-xl border-2 border-gray-200 p-4">
        <div className="flex flex-wrap gap-4 items-end">
          {/* Season */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold text-gray-600 uppercase tracking-wide">Season</label>
            <select
              value={selectedSeason}
              onChange={(e) => {
                setSelectedSeason(e.target.value);
                setCurrentPage(1);
              }}
              className="px-4 py-2.5 text-base border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 min-w-[120px] font-mono font-bold"
            >
              <option value="ALL">ALL</option>
              {seasons.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Division */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold text-gray-600 uppercase tracking-wide">Division</label>
            <select
              value={divisionFilter}
              onChange={(e) => {
                setDivisionFilter(e.target.value);
                setCategoryFilter(''); // Reset category when division changes
              }}
              className="px-4 py-2.5 text-base border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 min-w-[120px]"
            >
              <option value="">All</option>
              {divisions.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          {/* Category */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold text-gray-600 uppercase tracking-wide">Category</label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-4 py-2.5 text-base border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 min-w-[120px]"
            >
              <option value="">All</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Designer */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold text-gray-600 uppercase tracking-wide">Designer</label>
            <select
              value={designerFilter}
              onChange={(e) => setDesignerFilter(e.target.value)}
              className="px-4 py-2.5 text-base border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 min-w-[140px]"
            >
              <option value="">All</option>
              {designers.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          {/* Product Line */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold text-gray-600 uppercase tracking-wide">Product Line</label>
            <select
              value={productLineFilter}
              onChange={(e) => setProductLineFilter(e.target.value)}
              className="px-4 py-2.5 text-base border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 min-w-[140px]"
            >
              <option value="">All</option>
              {productLines.map((pl) => (
                <option key={pl} value={pl}>{pl}</option>
              ))}
            </select>
          </div>

          {/* Search */}
          <div className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
            <label className="text-sm font-bold text-gray-600 uppercase tracking-wide">Search</label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Style #, name, color..."
              className="px-4 py-2.5 text-base border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500"
            />
          </div>

          {/* Roll Up Styles Toggle */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold text-gray-600 uppercase tracking-wide">View</label>
            <label className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-2 border-gray-200 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
              <input
                type="checkbox"
                checked={rollUpStyles}
                onChange={(e) => {
                  setRollUpStyles(e.target.checked);
                  setCurrentPage(1);
                }}
                className="w-4 h-4 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500"
              />
              <span className="text-sm font-medium text-gray-700 whitespace-nowrap">
                Roll up styles
              </span>
            </label>
          </div>

          {/* Hide No Sales Toggle - only for historical seasons */}
          {!isFutureSeason && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-bold text-gray-600 uppercase tracking-wide">Filter</label>
              <label className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-2 border-gray-200 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
                <input
                  type="checkbox"
                  checked={hideNoSales}
                  onChange={(e) => {
                    setHideNoSales(e.target.checked);
                    setCurrentPage(1);
                  }}
                  className="w-4 h-4 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500"
                />
                <span className="text-sm font-medium text-gray-700 whitespace-nowrap">
                  Hide no-sales styles
                </span>
              </label>
            </div>
          )}
        </div>
      </div>

      {/* Stat Cards */}
      <div className={`grid gap-4 ${isFutureSeason ? 'grid-cols-5' : 'grid-cols-6'}`}>
        <div className="bg-white rounded-xl border-2 border-gray-200 p-4 text-center">
          <p className="text-3xl font-bold font-mono text-gray-900">{stats.styles.toLocaleString()}</p>
          <p className="text-sm text-gray-500 font-bold uppercase mt-1">Styles</p>
        </div>
        <div className="bg-white rounded-xl border-2 border-gray-200 p-4 text-center">
          <p className="text-3xl font-bold font-mono text-gray-900">{stats.skus.toLocaleString()}</p>
          <p className="text-sm text-gray-500 font-bold uppercase mt-1">SKUs</p>
        </div>
        <div className="bg-white rounded-xl border-2 border-gray-200 p-4 text-center">
          <p className="text-3xl font-bold font-mono text-emerald-600">{stats.new.toLocaleString()}</p>
          <p className="text-sm text-gray-500 font-bold uppercase mt-1">New</p>
        </div>
        <div className="bg-white rounded-xl border-2 border-gray-200 p-4 text-center">
          <p className="text-3xl font-bold font-mono text-red-600">{stats.dropped.toLocaleString()}</p>
          <p className="text-sm text-gray-500 font-bold uppercase mt-1">Dropped</p>
        </div>
        <div className="bg-white rounded-xl border-2 border-gray-200 p-4 text-center">
          <p className="text-3xl font-bold font-mono text-gray-900">{stats.designers}</p>
          <p className="text-sm text-gray-500 font-bold uppercase mt-1">Designers</p>
        </div>
        {/* No Sales - only show for historical seasons */}
        {!isFutureSeason && (
          <div className={`rounded-xl border-2 p-4 text-center ${stats.noSales > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'}`}>
            <div className="flex items-center justify-center gap-2">
              <p className={`text-3xl font-bold font-mono ${stats.noSales > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                {stats.noSales.toLocaleString()}
              </p>
              {stats.noSales > 0 && hideNoSales && <EyeOff className="w-5 h-5 text-amber-500" />}
            </div>
            <p className="text-sm text-gray-500 font-bold uppercase mt-1">No Sales</p>
          </div>
        )}
      </div>

      {/* Category Cards */}
      <div className="bg-white rounded-xl border-2 border-gray-200 p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Categories</span>
            {divisionFilter && (
              <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full font-medium">
                {getGenderFromDivision(divisionFilter)}&apos;s
              </span>
            )}
          </div>
          {categoryFilter && (
            <button
              onClick={() => setCategoryFilter('')}
              className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
            >
              <X className="w-3 h-3" />
              Clear filter
            </button>
          )}
        </div>

        <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-9 gap-3">
          {/* All Categories Card */}
          <button
            onClick={() => setCategoryFilter('')}
            className={`relative p-4 rounded-xl border-2 transition-all text-center ${
              !categoryFilter
                ? 'border-blue-500 bg-blue-50 shadow-md'
                : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
            }`}
          >
            <div className={`text-2xl font-bold ${!categoryFilter ? 'text-blue-600' : 'text-gray-900'}`}>
              {allCategoryTotals.styles}
            </div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mt-1">All</div>
            <div className={`text-xs mt-2 ${!categoryFilter ? 'text-emerald-600' : 'text-emerald-500'}`}>
              +{allCategoryTotals.new} new
            </div>
            {!categoryFilter && (
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full"></div>
            )}
          </button>

          {/* Individual Category Cards */}
          {visibleCategories.map((cat) => {
            const styleCount = getCategoryStyleCount(cat);
            const newCount = getCategoryNewCount(cat);
            const isSelected = categoryFilter === cat.name;

            return (
              <button
                key={cat.name}
                onClick={() => setCategoryFilter(cat.name)}
                className={`relative p-4 rounded-xl border-2 transition-all text-center ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50 shadow-md'
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                }`}
              >
                <div className={`text-2xl font-bold ${isSelected ? 'text-blue-600' : 'text-gray-900'}`}>
                  {styleCount}
                </div>
                <div className="text-xs text-gray-500 uppercase tracking-wide mt-1 truncate" title={cat.name}>
                  {cat.name}
                </div>
                <div className={`text-xs mt-2 ${newCount > 0 ? 'text-emerald-500' : 'text-gray-400'}`}>
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
      <div className="bg-white rounded-xl border-2 border-gray-200 p-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-gray-600 uppercase mr-2">Quick Filters:</span>
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
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* Column Groups */}
      <div className="bg-white rounded-xl border-2 border-gray-200 p-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-gray-600 uppercase mr-2">Columns:</span>
          {COLUMN_GROUPS.map((group) => (
            <button
              key={group.id}
              onClick={() => toggleColumnGroup(group.id)}
              disabled={group.id === 'core'}
              className={`px-3 py-1.5 text-sm font-semibold rounded-lg transition-colors ${
                visibleGroups[group.id]
                  ? 'bg-cyan-100 text-cyan-700 border-2 border-cyan-300'
                  : 'bg-gray-100 text-gray-500 border-2 border-transparent hover:bg-gray-200'
              } ${group.id === 'core' ? 'cursor-default' : ''}`}
            >
              {group.label}
            </button>
          ))}
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-xl border-2 border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-100 border-b-2 border-gray-300">
                {visibleColumns.map((col, idx) => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className={`px-3 py-3 text-left text-sm font-bold text-gray-700 uppercase tracking-wide cursor-pointer hover:text-gray-900 ${
                      idx < 2 ? 'sticky left-0 bg-gray-100 z-10' : ''
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
              </tr>
            </thead>
            <tbody>
              {paginatedData.map((row, rowIdx) => (
                <tr
                  key={`${row.styleNumber}-${row.color}-${rowIdx}`}
                  onClick={() => onStyleClick(row.styleNumber)}
                  className={`border-b border-gray-200 cursor-pointer transition-colors ${
                    rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                  } hover:bg-cyan-50`}
                >
                  {visibleColumns.map((col, colIdx) => (
                    <td
                      key={col.key}
                      className={`px-3 py-3 text-sm ${
                        colIdx < 2 ? 'sticky bg-inherit z-10' : ''
                      } ${col.key === 'styleNumber' ? 'font-mono font-bold text-gray-900' : 'text-gray-700'}`}
                      style={{
                        left: colIdx === 0 ? 0 : colIdx === 1 ? '100px' : undefined,
                      }}
                    >
                      {getCellValue(row, col.key)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-5 py-4 bg-gray-100 border-t-2 border-gray-300 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-700">
            Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, sortedData.length)} of {sortedData.length} {rollUpStyles ? 'styles' : 'SKUs'}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="flex items-center gap-1 px-3 py-1.5 text-sm font-semibold rounded-lg bg-white border-2 border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
              Prev
            </button>
            <span className="text-sm font-mono text-gray-600">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="flex items-center gap-1 px-3 py-1.5 text-sm font-semibold rounded-lg bg-white border-2 border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
