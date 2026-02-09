'use client';

import { useState, useMemo } from 'react';
import { SalesRecord, Product, PricingRecord, CostRecord, CUSTOMER_TYPE_LABELS, normalizeCategory } from '@/types/product';
import { sortSeasons } from '@/lib/store';
import { formatCurrencyShort, formatNumber } from '@/utils/format';
import {
  Banknote,
  ShoppingCart,
  Users,
  Package,
  Receipt,
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  ArrowUpDown,
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

// Gender colors for By Gender chart
const GENDER_COLORS: Record<string, string> = {
  "Men's": '#2563eb',    // blue-600
  "Women's": '#9333ea',  // purple-600
  "Unisex": '#6b7280',   // gray-500
  "Display": '#6b7280',  // gray-500
  "Unknown": '#6b7280',  // gray-500
};

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

type SortField = 'styleNumber' | 'styleDesc' | 'gender' | 'categoryDesc' | 'units' | 'revenue' | 'customerCount';

interface ActiveFilters {
  category: string;
  gender: string;
  customer: string;
}

// Derive gender from divisionDesc (e.g., "Men's Tops" -> "Men's", "Women's Bottoms" -> "Women's")
function getGenderFromDivision(divisionDesc: string): string {
  if (!divisionDesc) return 'Unknown';
  const lower = divisionDesc.toLowerCase();
  if (lower.includes("men's") && !lower.includes("women's")) return "Men's";
  if (lower.includes("women's") || lower.includes("woman")) return "Women's";
  if (lower.includes("unisex") || lower.includes("accessories")) return "Unisex";
  return "Unknown";
}

// Get the previous season code (e.g., 26FA → 25FA, 26SP → 25SP)
function getPreviousSeason(season: string): string | null {
  if (!season || season.length !== 4) return null;
  const yearNum = parseInt(season.slice(0, 2), 10);
  const type = season.slice(2); // SP or FA
  if (isNaN(yearNum)) return null;
  return `${(yearNum - 1).toString().padStart(2, '0')}${type}`;
}

// Calculate percentage change
function calcChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return ((current - previous) / previous) * 100;
}

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
  // Local filters (filter bar)
  const [filterSeason, setFilterSeason] = useState<string>(selectedSeason || '');
  const [filterCategory, setFilterCategory] = useState<string>(selectedCategory || '');
  const [filterStyleNumber, setFilterStyleNumber] = useState<string>('');
  const [filterCustomer, setFilterCustomer] = useState<string>('');
  const [filterCustomerType, setFilterCustomerType] = useState<string>('');
  const [filterSalesRep, setFilterSalesRep] = useState<string>('');

  // Active filters from chart clicks
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>({
    category: '',
    gender: '',
    customer: '',
  });

  // Table state
  const [sortField, setSortField] = useState<SortField>('revenue');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;

  // Get all unique values for filter dropdowns
  const seasons = useMemo(() => {
    const allSeasons = new Set<string>();
    sales.forEach((s) => s.season && allSeasons.add(s.season));
    return sortSeasons(Array.from(allSeasons));
  }, [sales]);

  const categories = useMemo(() => {
    const all = new Set<string>();
    sales.forEach((s) => {
      if (s.categoryDesc) {
        all.add(normalizeCategory(s.categoryDesc));
      }
    });
    return Array.from(all).sort();
  }, [sales]);

  // FIXED: Use hardcoded list of 6 channels - DO NOT derive from sales data
  // The sales data has comma-joined customerTypes from style aggregation
  const customerTypes = ['WH', 'BB', 'WD', 'EC', 'PS', 'KI'];

  const customers = useMemo(() => {
    const all = new Set<string>();
    sales.forEach((s) => s.customer && all.add(s.customer));
    return Array.from(all).sort();
  }, [sales]);

  const salesReps = useMemo(() => {
    const all = new Set<string>();
    sales.forEach((s) => s.salesRep && all.add(s.salesRep));
    return Array.from(all).sort();
  }, [sales]);

  // Base filtered sales (by filter bar)
  const baseFilteredSales = useMemo(() => {
    return sales.filter((s) => {
      if (filterSeason && s.season !== filterSeason) return false;
      if (filterCategory && normalizeCategory(s.categoryDesc) !== filterCategory) return false;
      if (filterCustomerType && s.customerType !== filterCustomerType) return false;
      if (filterCustomer && s.customer !== filterCustomer) return false;
      if (filterSalesRep && s.salesRep !== filterSalesRep) return false;
      if (filterStyleNumber && !s.styleNumber?.toLowerCase().includes(filterStyleNumber.toLowerCase())) return false;
      // Also respect parent filters
      if (selectedDivision && s.divisionDesc !== selectedDivision) return false;
      return true;
    });
  }, [sales, filterSeason, filterCategory, filterCustomerType, filterCustomer, filterSalesRep, filterStyleNumber, selectedDivision]);

  // Further filtered by active chart filters
  const filteredSales = useMemo(() => {
    return baseFilteredSales.filter((s) => {
      if (activeFilters.category && normalizeCategory(s.categoryDesc) !== activeFilters.category) return false;
      if (activeFilters.gender && getGenderFromDivision(s.divisionDesc) !== activeFilters.gender) return false;
      if (activeFilters.customer && s.customer !== activeFilters.customer) return false;
      return true;
    });
  }, [baseFilteredSales, activeFilters]);

  // Clear all local filters
  const clearLocalFilters = () => {
    setFilterSeason('');
    setFilterCategory('');
    setFilterStyleNumber('');
    setFilterCustomer('');
    setFilterCustomerType('');
    setFilterSalesRep('');
    setCurrentPage(1);
  };

  const hasLocalFilters = filterSeason || filterCategory || filterStyleNumber || filterCustomer || filterCustomerType || filterSalesRep;

  // Summary stats with period-over-period comparison
  const summary = useMemo(() => {
    const totalRevenue = filteredSales.reduce((sum, s) => sum + (s.revenue || 0), 0);
    const totalUnits = filteredSales.reduce((sum, s) => sum + (s.unitsBooked || 0), 0);
    const uniqueCustomers = new Set(filteredSales.map((s) => s.customer).filter(Boolean)).size;
    const uniqueStyles = new Set(filteredSales.map((s) => s.styleNumber).filter(Boolean)).size;
    const avgOrder = uniqueCustomers > 0 ? totalRevenue / uniqueCustomers : 0;

    // Calculate previous period stats for comparison
    const prevSeason = filterSeason ? getPreviousSeason(filterSeason) : null;
    let prevRevenue = 0, prevUnits = 0, prevCustomers = 0, prevStyles = 0, prevAvgOrder = 0;
    let comparisonLabel = '';

    if (prevSeason) {
      // Get sales from previous season with same filters (except season)
      const prevSales = sales.filter((s) => {
        if (s.season !== prevSeason) return false;
        if (filterCategory && normalizeCategory(s.categoryDesc) !== filterCategory) return false;
        if (filterCustomerType && s.customerType !== filterCustomerType) return false;
        if (filterCustomer && s.customer !== filterCustomer) return false;
        if (filterSalesRep && s.salesRep !== filterSalesRep) return false;
        if (filterStyleNumber && !s.styleNumber?.toLowerCase().includes(filterStyleNumber.toLowerCase())) return false;
        if (selectedDivision && s.divisionDesc !== selectedDivision) return false;
        // Also apply chart filters
        if (activeFilters.category && normalizeCategory(s.categoryDesc) !== activeFilters.category) return false;
        if (activeFilters.gender && getGenderFromDivision(s.divisionDesc) !== activeFilters.gender) return false;
        if (activeFilters.customer && s.customer !== activeFilters.customer) return false;
        return true;
      });

      prevRevenue = prevSales.reduce((sum, s) => sum + (s.revenue || 0), 0);
      prevUnits = prevSales.reduce((sum, s) => sum + (s.unitsBooked || 0), 0);
      const prevCustomerSet = new Set(prevSales.map((s) => s.customer).filter(Boolean));
      prevCustomers = prevCustomerSet.size;
      prevStyles = new Set(prevSales.map((s) => s.styleNumber).filter(Boolean)).size;
      prevAvgOrder = prevCustomers > 0 ? prevRevenue / prevCustomers : 0;
      comparisonLabel = `vs ${prevSeason}`;
    }

    return {
      totalRevenue,
      totalUnits,
      uniqueCustomers,
      uniqueStyles,
      avgOrder,
      // Changes (null if no comparison available)
      revenueChange: prevSeason ? calcChange(totalRevenue, prevRevenue) : null,
      unitsChange: prevSeason ? calcChange(totalUnits, prevUnits) : null,
      customersChange: prevSeason ? calcChange(uniqueCustomers, prevCustomers) : null,
      stylesChange: prevSeason ? calcChange(uniqueStyles, prevStyles) : null,
      avgOrderChange: prevSeason ? calcChange(avgOrder, prevAvgOrder) : null,
      comparisonLabel,
    };
  }, [filteredSales, filterSeason, filterCategory, filterCustomerType, filterCustomer, filterSalesRep, filterStyleNumber, selectedDivision, activeFilters, sales]);

  // By Channel (for chart) - use PRE-COMPUTED aggregations from API (not style-aggregated sales)
  // This is critical: the API aggregates by individual customerType from raw sales records
  // Build a lookup map: styleNumber -> gender from Line List (products)
  const productGenderMap = useMemo(() => {
    const map = new Map<string, string>();
    products.forEach((p) => {
      if (p.styleNumber && p.divisionDesc) {
        // Derive gender from divisionDesc in Line List
        const divLower = p.divisionDesc.toLowerCase();
        let gender = 'Unknown';
        if (divLower.includes("men's") && !divLower.includes("women's")) {
          gender = "Men's";
        } else if (divLower.includes("women's") || divLower.includes("woman")) {
          gender = "Women's";
        } else if (divLower.includes("unisex")) {
          gender = "Unisex";
        } else if (divLower.includes("display")) {
          gender = "Display";
        }
        if (gender !== 'Unknown') {
          map.set(p.styleNumber, gender);
        }
      }
    });
    return map;
  }, [products]);

  // By Category (for chart) - use PRE-COMPUTED aggregations from API
  const byCategory = useMemo(() => {
    if (!salesAggregations?.byCategory) {
      return [];
    }

    // Filter by season if selected
    let categoryData = salesAggregations.byCategory;
    if (filterSeason) {
      categoryData = categoryData.filter(c => c.season === filterSeason);
    }

    // Group by category
    const grouped = new Map<string, { revenue: number; units: number }>();
    categoryData.forEach((c) => {
      const key = normalizeCategory(c.category) || 'Other';
      const existing = grouped.get(key);
      if (existing) {
        existing.revenue += c.revenue;
        existing.units += c.units;
      } else {
        grouped.set(key, { revenue: c.revenue, units: c.units });
      }
    });

    const result = Array.from(grouped.entries())
      .map(([key, data]) => ({ key, revenue: data.revenue, units: data.units }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);

    const maxRevenue = Math.max(...result.map((r) => r.revenue), 1);
    return result.map((r) => ({ ...r, percent: (r.revenue / maxRevenue) * 100 }));
  }, [salesAggregations, filterSeason]);

  // By Gender (for chart) - compute from filteredSales, prioritizing Line List gender
  const byGenderChart = useMemo(() => {
    // Aggregate from filteredSales, using productGenderMap for Line List priority
    const grouped = new Map<string, { revenue: number; units: number }>();

    filteredSales.forEach((s) => {
      // Priority 1: Look up style in Line List (products)
      let gender = productGenderMap.get(s.styleNumber);

      // Priority 2: Fall back to deriving from sales record's divisionDesc
      if (!gender) {
        gender = getGenderFromDivision(s.divisionDesc);
      }

      const existing = grouped.get(gender);
      if (existing) {
        existing.revenue += s.revenue || 0;
        existing.units += s.unitsBooked || 0;
      } else {
        grouped.set(gender, { revenue: s.revenue || 0, units: s.unitsBooked || 0 });
      }
    });

    const total = Array.from(grouped.values()).reduce((sum, g) => sum + g.revenue, 0);
    const maxRevenue = Math.max(...Array.from(grouped.values()).map(g => g.revenue), 1);

    return Array.from(grouped.entries())
      .map(([key, data]) => ({
        key,
        revenue: data.revenue,
        units: data.units,
        percent: (data.revenue / maxRevenue) * 100, // For bar width
        sharePercent: total > 0 ? (data.revenue / total) * 100 : 0, // For percentage display
        color: GENDER_COLORS[key] || '#6b7280',
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [filteredSales, productGenderMap]);

  // Top Customers - use PRE-COMPUTED aggregations from API
  const topCustomers = useMemo(() => {
    if (!salesAggregations?.byCustomer) {
      return [];
    }

    // Filter by season if selected
    let customerData = salesAggregations.byCustomer;
    if (filterSeason) {
      customerData = customerData.filter(c => c.season === filterSeason);
    }

    // Group by customer
    const grouped = new Map<string, { revenue: number; units: number }>();
    customerData.forEach((c) => {
      const existing = grouped.get(c.customer);
      if (existing) {
        existing.revenue += c.revenue;
        existing.units += c.units;
      } else {
        grouped.set(c.customer, { revenue: c.revenue, units: c.units });
      }
    });

    return Array.from(grouped.entries())
      .map(([customer, data]) => ({ customer, revenue: data.revenue, units: data.units }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
  }, [salesAggregations, filterSeason]);

  // Sales by Style (for table)
  const salesByStyle = useMemo(() => {
    const grouped = new Map<
      string,
      {
        styleNumber: string;
        styleDesc: string;
        gender: string;
        categoryDesc: string;
        units: number;
        revenue: number;
        customers: Set<string>;
      }
    >();

    filteredSales.forEach((s) => {
      const key = s.styleNumber;
      if (!key) return;

      if (!grouped.has(key)) {
        grouped.set(key, {
          styleNumber: key,
          styleDesc: s.styleDesc || '',
          gender: getGenderFromDivision(s.divisionDesc),
          categoryDesc: normalizeCategory(s.categoryDesc) || '',
          units: 0,
          revenue: 0,
          customers: new Set(),
        });
      }

      const entry = grouped.get(key)!;
      entry.units += s.unitsBooked || 0;
      entry.revenue += s.revenue || 0;
      if (s.customer) entry.customers.add(s.customer);
    });

    return Array.from(grouped.values()).map((s) => ({
      ...s,
      customerCount: s.customers.size,
    }));
  }, [filteredSales]);

  // Sorted and paginated styles
  const sortedStyles = useMemo(() => {
    const sorted = [...salesByStyle].sort((a, b) => {
      let aVal: string | number = a[sortField];
      let bVal: string | number = b[sortField];

      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();

      if (sortDir === 'asc') {
        return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      }
      return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
    });

    return sorted;
  }, [salesByStyle, sortField, sortDir]);

  const paginatedStyles = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedStyles.slice(start, start + pageSize);
  }, [sortedStyles, currentPage]);

  const totalPages = Math.ceil(sortedStyles.length / pageSize);

  // Handlers
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
    setCurrentPage(1);
  };

  const setFilter = (type: keyof ActiveFilters, value: string) => {
    setActiveFilters((prev) => ({
      ...prev,
      [type]: prev[type] === value ? '' : value,
    }));
    setCurrentPage(1);
  };

  const clearAllFilters = () => {
    setActiveFilters({ category: '', gender: '', customer: '' });
    setCurrentPage(1);
  };

  const hasActiveFilters = activeFilters.category || activeFilters.gender || activeFilters.customer;

  // Export CSV
  const exportCSV = () => {
    const headers = ['Style', 'Description', 'Gender', 'Category', 'Units', 'Revenue', 'Customers'];
    const rows = sortedStyles.map((s) => [
      s.styleNumber,
      `"${s.styleDesc}"`,
      s.gender,
      s.categoryDesc,
      s.units,
      s.revenue.toFixed(2),
      s.customerCount,
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales-by-style-${filterSeason || 'all'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Gender colors
  const genderColors: Record<string, string> = {
    "Men's": '#0891b2',
    "Women's": '#be185d',
    Unisex: '#7c3aed',
    Unknown: '#6b7280',
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-4xl font-display font-bold text-gray-900">
          Sales View{filterSeason ? `: ${filterSeason}` : ''}
        </h2>
        <p className="text-base text-gray-500 mt-2">Detailed sales analysis with interactive filtering</p>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-xl border border-gray-300 p-5 shadow-sm">
        <div className="flex flex-wrap gap-4 items-end">
          {/* Season */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold text-gray-600 uppercase tracking-wide">Season</label>
            <select
              value={filterSeason}
              onChange={(e) => { setFilterSeason(e.target.value); setCurrentPage(1); }}
              className="px-4 py-2.5 text-base border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 min-w-[120px] bg-white"
            >
              <option value="">All Seasons</option>
              {seasons.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Category */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold text-gray-600 uppercase tracking-wide">Category</label>
            <select
              value={filterCategory}
              onChange={(e) => { setFilterCategory(e.target.value); setCurrentPage(1); }}
              className="px-4 py-2.5 text-base border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 min-w-[160px] bg-white"
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Style Number */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold text-gray-600 uppercase tracking-wide">Style #</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={filterStyleNumber}
                onChange={(e) => { setFilterStyleNumber(e.target.value); setCurrentPage(1); }}
                placeholder="Search..."
                className="pl-11 pr-4 py-2.5 text-base border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 w-[140px] bg-white"
              />
            </div>
          </div>

          {/* Customer Type */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold text-gray-600 uppercase tracking-wide">Channel</label>
            <select
              value={filterCustomerType}
              onChange={(e) => { setFilterCustomerType(e.target.value); setCurrentPage(1); }}
              className="px-4 py-2.5 text-base border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 min-w-[160px] bg-white"
            >
              <option value="">All Channels</option>
              {customerTypes.map((ct) => (
                <option key={ct} value={ct}>{CUSTOMER_TYPE_LABELS[ct] || ct}</option>
              ))}
            </select>
          </div>

          {/* Customer */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold text-gray-600 uppercase tracking-wide">Customer</label>
            <select
              value={filterCustomer}
              onChange={(e) => { setFilterCustomer(e.target.value); setCurrentPage(1); }}
              className="px-4 py-2.5 text-base border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 min-w-[200px] max-w-[240px] bg-white"
            >
              <option value="">All Customers</option>
              {customers.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Sales Rep */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold text-gray-600 uppercase tracking-wide">Sales Rep</label>
            <select
              value={filterSalesRep}
              onChange={(e) => { setFilterSalesRep(e.target.value); setCurrentPage(1); }}
              className="px-4 py-2.5 text-base border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 min-w-[160px] bg-white"
            >
              <option value="">All Reps</option>
              {salesReps.map((sr) => (
                <option key={sr} value={sr}>{sr}</option>
              ))}
            </select>
          </div>

          {/* Clear Filters */}
          {hasLocalFilters && (
            <button
              onClick={clearLocalFilters}
              className="flex items-center gap-2 px-4 py-2.5 text-base font-semibold text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors border-2 border-transparent"
            >
              <X className="w-5 h-5" />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Active Chart Filter Chips */}
      {hasActiveFilters && (
        <div className="flex items-center gap-3 flex-wrap bg-gray-50 rounded-xl px-5 py-4 border border-gray-300">
          <span className="text-base font-bold text-gray-600">Filters:</span>
          {activeFilters.gender && (
            <button
              onClick={() => setFilter('gender', activeFilters.gender)}
              className="inline-flex items-center gap-2 px-4 py-1.5 bg-blue-100 text-blue-700 rounded-full text-base font-semibold hover:bg-blue-200 transition-colors"
            >
              Gender: {activeFilters.gender}
              <X className="w-4 h-4" />
            </button>
          )}
          {activeFilters.category && (
            <button
              onClick={() => setFilter('category', activeFilters.category)}
              className="inline-flex items-center gap-2 px-4 py-1.5 bg-emerald-100 text-emerald-700 rounded-full text-base font-semibold hover:bg-emerald-200 transition-colors"
            >
              Category: {activeFilters.category}
              <X className="w-4 h-4" />
            </button>
          )}
          {activeFilters.customer && (
            <button
              onClick={() => setFilter('customer', activeFilters.customer)}
              className="inline-flex items-center gap-2 px-4 py-1.5 bg-amber-100 text-amber-700 rounded-full text-base font-semibold hover:bg-amber-200 transition-colors"
            >
              Customer: {activeFilters.customer.length > 20 ? activeFilters.customer.slice(0, 20) + '...' : activeFilters.customer}
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={clearAllFilters}
            className="text-base text-gray-500 hover:text-gray-700 underline font-medium"
          >
            Clear All
          </button>
        </div>
      )}

      {/* Summary Stats */}
      <div className="bg-white rounded-xl border border-gray-300 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-gray-800">Summary</h3>
          {summary.comparisonLabel && (
            <span className="text-sm text-gray-500 font-medium">{summary.comparisonLabel}</span>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-5">
          <div className="bg-cyan-50 rounded-xl p-5 border border-cyan-300">
            <div className="flex items-start justify-between mb-3">
              <span className="text-sm font-bold text-cyan-700 uppercase tracking-wide">Revenue</span>
              <Banknote className="w-6 h-6 text-cyan-600" />
            </div>
            <div className="text-3xl font-display font-bold text-gray-900">{formatCurrencyShort(summary.totalRevenue)}</div>
            {summary.revenueChange !== null && (
              <div className={`text-sm font-semibold mt-2 ${summary.revenueChange >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {summary.revenueChange >= 0 ? '+' : ''}{summary.revenueChange.toFixed(1)}%
              </div>
            )}
          </div>

          <div className="bg-violet-50 rounded-xl p-5 border border-violet-300">
            <div className="flex items-start justify-between mb-3">
              <span className="text-sm font-bold text-violet-700 uppercase tracking-wide">Units</span>
              <ShoppingCart className="w-6 h-6 text-violet-600" />
            </div>
            <div className="text-3xl font-display font-bold text-gray-900">{formatNumber(summary.totalUnits)}</div>
            {summary.unitsChange !== null && (
              <div className={`text-sm font-semibold mt-2 ${summary.unitsChange >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {summary.unitsChange >= 0 ? '+' : ''}{summary.unitsChange.toFixed(1)}%
              </div>
            )}
          </div>

          <div className="bg-blue-50 rounded-xl p-5 border border-blue-300">
            <div className="flex items-start justify-between mb-3">
              <span className="text-sm font-bold text-blue-700 uppercase tracking-wide">Customers</span>
              <Users className="w-6 h-6 text-blue-600" />
            </div>
            <div className="text-3xl font-display font-bold text-gray-900">{formatNumber(summary.uniqueCustomers)}</div>
            {summary.customersChange !== null && (
              <div className={`text-sm font-semibold mt-2 ${summary.customersChange >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {summary.customersChange >= 0 ? '+' : ''}{summary.customersChange.toFixed(1)}%
              </div>
            )}
          </div>

          <div className="bg-emerald-50 rounded-xl p-5 border border-emerald-300">
            <div className="flex items-start justify-between mb-3">
              <span className="text-sm font-bold text-emerald-700 uppercase tracking-wide">Styles</span>
              <Package className="w-6 h-6 text-emerald-600" />
            </div>
            <div className="text-3xl font-display font-bold text-gray-900">{formatNumber(summary.uniqueStyles)}</div>
            {summary.stylesChange !== null && (
              <div className={`text-sm font-semibold mt-2 ${summary.stylesChange >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {summary.stylesChange >= 0 ? '+' : ''}{summary.stylesChange.toFixed(1)}%
              </div>
            )}
          </div>

          <div className="bg-amber-50 rounded-xl p-5 border border-amber-300">
            <div className="flex items-start justify-between mb-3">
              <span className="text-sm font-bold text-amber-700 uppercase tracking-wide">Avg Order</span>
              <Receipt className="w-6 h-6 text-amber-600" />
            </div>
            <div className="text-3xl font-display font-bold text-gray-900">{formatCurrencyShort(summary.avgOrder)}</div>
            {summary.avgOrderChange !== null && (
              <div className={`text-sm font-semibold mt-2 ${summary.avgOrderChange >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {summary.avgOrderChange >= 0 ? '+' : ''}{summary.avgOrderChange.toFixed(1)}%
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By Gender - Horizontal bar chart */}
        <div className="bg-white rounded-xl border border-gray-300 shadow-sm overflow-hidden">
          <div className="bg-gray-50 px-6 py-4 border-b border-gray-300">
            <h3 className="text-xl font-bold text-gray-900">By Gender</h3>
          </div>
          <div className="p-6 space-y-4">
            {byGenderChart.length === 0 ? (
              <p className="text-gray-500 text-center py-4">No gender data available</p>
            ) : (
              byGenderChart.map((item) => (
                <button
                  key={item.key}
                  onClick={() => setFilter('gender', item.key)}
                  className={`w-full flex items-center gap-4 p-3 rounded-lg transition-colors ${
                    activeFilters.gender === item.key
                      ? 'bg-gray-100 ring-2 ring-offset-1'
                      : 'hover:bg-gray-50'
                  }`}
                  style={{
                    ...(activeFilters.gender === item.key && { ['--tw-ring-color' as string]: item.color }),
                  }}
                >
                  <span
                    className="w-20 font-medium text-sm px-2 py-1 rounded"
                    style={{ backgroundColor: `${item.color}20`, color: item.color }}
                  >
                    {item.key}
                  </span>
                  <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${item.percent}%`, backgroundColor: item.color }}
                    />
                  </div>
                  <span className="w-16 text-right font-mono text-sm text-gray-500">
                    {item.sharePercent?.toFixed(0)}%
                  </span>
                  <span className="w-24 text-right font-mono text-base font-semibold text-gray-900">
                    {formatCurrencyShort(item.revenue)}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        {/* By Category */}
        <div className="bg-white rounded-xl border border-gray-300 shadow-sm overflow-hidden">
          <div className="bg-gray-50 px-6 py-4 border-b border-gray-300">
            <h3 className="text-xl font-bold text-gray-900">By Category</h3>
          </div>
          <div className="p-6 space-y-4">
            {byCategory.length === 0 ? (
              <p className="text-gray-500 text-center py-4">No category data available</p>
            ) : (
              byCategory.map((item) => (
                <button
                  key={item.key}
                  onClick={() => setFilter('category', item.key)}
                  className={`w-full flex items-center gap-4 p-3 rounded-lg transition-colors ${
                    activeFilters.category === item.key
                      ? 'bg-emerald-100 ring-2 ring-emerald-500'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <span className="flex-1 text-left text-base text-gray-700 truncate font-medium">{item.key}</span>
                  <div className="w-36 h-6 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all"
                      style={{ width: `${item.percent}%` }}
                    />
                  </div>
                  <span className="w-24 text-right font-mono text-base font-semibold text-gray-900">
                    {formatCurrencyShort(item.revenue)}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Top 10 Customers - Full width */}
      <div className="bg-white rounded-xl border border-gray-300 shadow-sm overflow-hidden">
        <div className="bg-gray-50 px-6 py-4 border-b border-gray-300">
          <h3 className="text-xl font-bold text-gray-900">Top 10 Customers</h3>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-3">
          {topCustomers.length === 0 ? (
            <p className="text-gray-500 text-center py-4 col-span-2">No customer data available</p>
          ) : (
            topCustomers.map((item, index) => (
              <button
                key={item.customer}
                onClick={() => setFilter('customer', item.customer)}
                className={`w-full flex items-center justify-between p-3 rounded-lg transition-colors ${
                  activeFilters.customer === item.customer
                    ? 'bg-amber-100 ring-2 ring-amber-500'
                    : 'hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600">
                    {index + 1}
                  </span>
                  <span className="text-sm text-gray-700 truncate max-w-[200px] font-medium">{item.customer}</span>
                </div>
                <span className="font-mono text-sm font-semibold text-gray-900">{formatCurrencyShort(item.revenue)}</span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Sales by Style Table */}
      <div className="bg-white rounded-xl border border-gray-300 shadow-sm overflow-hidden">
        <div className="bg-gray-50 px-6 py-4 border-b border-gray-300 flex items-center justify-between">
          <h3 className="text-xl font-bold text-gray-900">Sales by Style</h3>
          <button
            onClick={exportCSV}
            className="inline-flex items-center gap-2 px-4 py-2 text-base font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Download className="w-5 h-5" />
            Export CSV
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-100 border-b-2 border-gray-300">
                <th
                  className="px-4 py-3 text-left text-sm font-bold text-gray-700 uppercase tracking-wide cursor-pointer hover:text-gray-900 border-r border-gray-200"
                  onClick={() => handleSort('styleNumber')}
                >
                  <div className="flex items-center gap-1">
                    Style
                    <ArrowUpDown className="w-4 h-4" />
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-left text-sm font-bold text-gray-700 uppercase tracking-wide cursor-pointer hover:text-gray-900 border-r border-gray-200"
                  onClick={() => handleSort('styleDesc')}
                >
                  <div className="flex items-center gap-1">
                    Description
                    <ArrowUpDown className="w-4 h-4" />
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-left text-sm font-bold text-gray-700 uppercase tracking-wide cursor-pointer hover:text-gray-900 border-l border-gray-200"
                  onClick={() => handleSort('gender')}
                >
                  <div className="flex items-center gap-1">
                    Gender
                    <ArrowUpDown className="w-4 h-4" />
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-left text-sm font-bold text-gray-700 uppercase tracking-wide cursor-pointer hover:text-gray-900 border-l border-gray-200"
                  onClick={() => handleSort('categoryDesc')}
                >
                  <div className="flex items-center gap-1">
                    Category
                    <ArrowUpDown className="w-4 h-4" />
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-right text-sm font-bold text-gray-700 uppercase tracking-wide cursor-pointer hover:text-gray-900 border-l border-gray-200"
                  onClick={() => handleSort('units')}
                >
                  <div className="flex items-center justify-end gap-1">
                    Units
                    <ArrowUpDown className="w-4 h-4" />
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-right text-sm font-bold text-gray-700 uppercase tracking-wide cursor-pointer hover:text-gray-900 border-l border-gray-200"
                  onClick={() => handleSort('revenue')}
                >
                  <div className="flex items-center justify-end gap-1">
                    Revenue
                    <ArrowUpDown className="w-4 h-4" />
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-right text-sm font-bold text-gray-700 uppercase tracking-wide cursor-pointer hover:text-gray-900 border-l border-gray-200"
                  onClick={() => handleSort('customerCount')}
                >
                  <div className="flex items-center justify-end gap-1">
                    Cust
                    <ArrowUpDown className="w-4 h-4" />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedStyles.map((style, index) => (
                <tr
                  key={style.styleNumber}
                  onClick={() => onStyleClick(style.styleNumber)}
                  className={`border-b border-gray-200 cursor-pointer transition-colors ${
                    index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                  } hover:bg-cyan-50`}
                >
                  <td className="px-4 py-4 border-r border-gray-200">
                    <span className="font-mono text-lg font-bold text-gray-900">
                      {style.styleNumber}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-base text-gray-700 truncate max-w-[220px] border-r border-gray-200">{style.styleDesc}</td>
                  <td className="px-4 py-4 border-l border-gray-200">
                    <span
                      className="text-base font-semibold px-2.5 py-1 rounded"
                      style={{
                        backgroundColor: `${genderColors[style.gender] || '#6b7280'}20`,
                        color: genderColors[style.gender] || '#6b7280',
                      }}
                    >
                      {style.gender || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-base text-gray-700 border-l border-gray-200">{style.categoryDesc || '—'}</td>
                  <td className="px-4 py-4 text-right font-mono text-base font-medium text-gray-900 border-l border-gray-200">
                    {formatNumber(style.units)}
                  </td>
                  <td className="px-4 py-4 text-right font-mono text-base font-bold text-gray-900 border-l border-gray-200">
                    {formatCurrencyShort(style.revenue)}
                  </td>
                  <td className="px-4 py-4 text-right font-mono text-base text-gray-700 border-l border-gray-200">{style.customerCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-5 py-4 bg-gray-100 border-t-2 border-gray-300 flex items-center justify-between">
          <span className="text-base text-gray-600">
            Showing {(currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, sortedStyles.length)} of{' '}
            {sortedStyles.length} styles
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="inline-flex items-center gap-1 px-4 py-2 text-base font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-5 h-5" />
              Prev
            </button>
            <span className="text-base text-gray-600 font-medium">
              Page {currentPage} of {totalPages || 1}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="inline-flex items-center gap-1 px-4 py-2 text-base font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
