'use client';

import React, { useState, useMemo } from 'react';
import { Product, SalesRecord, PricingRecord, CostRecord } from '@/types/product';
import { sortSeasons } from '@/lib/store';
import { ArrowUpDown, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import * as XLSX from 'xlsx';

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
      { key: 'flags', label: 'Flags', width: '100px' },
      { key: 'styleNumber', label: 'Style #', width: '80px' },
      { key: 'styleDesc', label: 'Style Name', width: '180px' },
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

  // Get filter options
  const divisions = useMemo(() => {
    const all = new Set<string>();
    products.forEach((p) => p.divisionDesc && all.add(p.divisionDesc));
    return Array.from(all).sort();
  }, [products]);

  const categories = useMemo(() => {
    const all = new Set<string>();
    products.forEach((p) => p.categoryDesc && all.add(p.categoryDesc));
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

  // Get styles in previous season for new/dropped detection
  const previousSeasonStyles = useMemo(() => {
    const prevSeason = getPreviousSeason(selectedSeason);
    if (!prevSeason) return new Set<string>();
    return new Set(
      products.filter((p) => p.season === prevSeason).map((p) => p.styleNumber)
    );
  }, [products, selectedSeason, seasons]);

  const currentSeasonStyles = useMemo(() => {
    return new Set(
      products.filter((p) => p.season === selectedSeason).map((p) => p.styleNumber)
    );
  }, [products, selectedSeason]);

  // Filter and enrich data
  const filteredData = useMemo(() => {
    let data = products.filter((p) => p.season === selectedSeason);

    // Apply filters
    if (divisionFilter) data = data.filter((d) => d.divisionDesc === divisionFilter);
    if (categoryFilter) data = data.filter((d) => d.categoryDesc === categoryFilter);
    if (designerFilter) data = data.filter((d) => d.designerName === designerFilter);
    if (productLineFilter) data = data.filter((d) => d.productLine === productLineFilter);

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
  ]);

  // Sort data
  const sortedData = useMemo(() => {
    return [...filteredData].sort((a, b) => {
      const aVal = (a as Record<string, unknown>)[sortColumn];
      const bVal = (b as Record<string, unknown>)[sortColumn];

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }

      const aStr = String(aVal || '');
      const bStr = String(bVal || '');
      return sortDir === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
    });
  }, [filteredData, sortColumn, sortDir]);

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

    return {
      styles: uniqueStyles.size,
      skus: seasonProducts.length,
      new: newStyles.length,
      dropped: droppedStyles.length,
      designers: uniqueDesigners.size,
    };
  }, [products, selectedSeason, previousSeasonStyles, currentSeasonStyles]);

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

  const getCellValue = (row: EnrichedProduct, key: string): React.ReactNode => {
    if (key === 'flags') {
      return (
        <div className="flex flex-wrap gap-1">
          {row.isNew && (
            <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-xs font-bold rounded">NEW</span>
          )}
          {row.topSeller && (
            <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-700 text-xs font-bold rounded">TOP</span>
          )}
          {row.smu && (
            <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-xs font-bold rounded">SMU</span>
          )}
          {row.kore && (
            <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs font-bold rounded">KORE</span>
          )}
          {row.mapProtected && (
            <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-xs font-bold rounded">MAP</span>
          )}
          {row.isCarryOver && (
            <span className="px-1.5 py-0.5 bg-gray-100 text-gray-700 text-xs font-bold rounded">CO</span>
          )}
          {row.isDropped && (
            <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-xs font-bold rounded">DROP</span>
          )}
        </div>
      );
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
              onChange={(e) => setDivisionFilter(e.target.value)}
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
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-5 gap-4">
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
                    onClick={() => col.key !== 'flags' && handleSort(col.key)}
                    className={`px-3 py-3 text-left text-sm font-bold text-gray-700 uppercase tracking-wide ${
                      col.key !== 'flags' ? 'cursor-pointer hover:text-gray-900' : ''
                    } ${idx < 3 ? 'sticky left-0 bg-gray-100 z-10' : ''}`}
                    style={{
                      minWidth: col.width,
                      left: idx === 0 ? 0 : idx === 1 ? '100px' : idx === 2 ? '180px' : undefined,
                    }}
                  >
                    <div className="flex items-center gap-1">
                      {col.label}
                      {col.key !== 'flags' && <ArrowUpDown className="w-3 h-3" />}
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
                        colIdx < 3 ? 'sticky bg-inherit z-10' : ''
                      } ${col.key === 'styleNumber' ? 'font-mono font-bold text-gray-900' : 'text-gray-700'}`}
                      style={{
                        left: colIdx === 0 ? 0 : colIdx === 1 ? '100px' : colIdx === 2 ? '180px' : undefined,
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
            Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, sortedData.length)} of {sortedData.length} SKUs
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
