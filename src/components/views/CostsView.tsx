'use client';

import { useState, useMemo } from 'react';
import { Product, PricingRecord, CostRecord, SalesRecord } from '@/types/product';
import { sortSeasons } from '@/lib/store';
import { formatCurrency, formatPercentRaw, formatNumber } from '@/utils/format';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Percent,
  ArrowUpDown,
  Search,
  X,
  Download,
  ChevronLeft,
  ChevronRight,
  Package,
  Factory,
  Globe,
  Users,
  Layers,
  AlertTriangle,
} from 'lucide-react';

interface CostsViewProps {
  products: Product[];
  pricing: PricingRecord[];
  costs: CostRecord[];
  sales: SalesRecord[];
  selectedSeason: string;
  selectedDivision: string;
  selectedCategory: string;
  onStyleClick: (styleNumber: string) => void;
}

type SortField = 'styleNumber' | 'styleName' | 'revenue' | 'units' | 'factory' | 'coo' | 'fob' | 'landed' | 'wholesale' | 'msrp' | 'margin' | 'designTeam';
type ViewMode = 'table' | 'byFactory' | 'byCountry' | 'byTeam';

// Calculate margin: (Wholesale - Landed) / Wholesale
function calculateMargin(wholesale: number, landed: number): number | null {
  if (!wholesale || wholesale <= 0 || !landed || landed <= 0) return null;
  return (wholesale - landed) / wholesale;
}

// Get margin color class
function getMarginColorClass(margin: number | null | undefined): string {
  if (margin === null || margin === undefined) return 'text-text-faint';
  const pct = margin * 100;
  if (pct >= 50) return 'text-emerald-600';
  if (pct >= 45) return 'text-cyan-600';
  if (pct >= 40) return 'text-amber-600';
  return 'text-red-600';
}

function getMarginBgClass(margin: number | null | undefined): string {
  if (margin === null || margin === undefined) return 'bg-surface-tertiary';
  const pct = margin * 100;
  if (pct >= 50) return 'bg-emerald-50 dark:bg-emerald-950';
  if (pct >= 45) return 'bg-cyan-50 dark:bg-cyan-950';
  if (pct >= 40) return 'bg-amber-50 dark:bg-amber-950';
  return 'bg-red-50 dark:bg-red-950';
}

function formatRevenue(value: number): string {
  if (value === 0) return '$0';
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(1)}K`;
  }
  return `$${value.toFixed(0)}`;
}

export default function CostsView({
  products,
  pricing,
  costs,
  sales,
  selectedSeason,
  selectedDivision,
  selectedCategory,
  onStyleClick,
}: CostsViewProps) {
  // Filters
  const [filterSeason, setFilterSeason] = useState<string>('');
  const [filterStyleNumber, setFilterStyleNumber] = useState<string>('');
  const [filterFactory, setFilterFactory] = useState<string>('');
  const [filterCountry, setFilterCountry] = useState<string>('');
  const [filterTeam, setFilterTeam] = useState<string>('');
  const [filterDeveloper, setFilterDeveloper] = useState<string>('');

  // Table state
  const [sortField, setSortField] = useState<SortField>('revenue');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;

  // Calculate sales by style+season (keyed by "styleNumber-season")
  // This ensures each season's costs show only that season's sales
  const salesByStyleSeason = useMemo(() => {
    return sales.reduce((acc, r) => {
      const key = `${r.styleNumber}-${r.season}`;
      if (!acc[key]) {
        acc[key] = { revenue: 0, units: 0 };
      }
      acc[key].revenue += r.revenue || 0;
      acc[key].units += r.unitsBooked || 0;
      return acc;
    }, {} as Record<string, { revenue: number; units: number }>);
  }, [sales]);

  // View mode
  const [viewMode, setViewMode] = useState<ViewMode>('table');

  // Get unique values for filters (from both costs AND products)
  const seasons = useMemo(() => {
    const all = new Set<string>();
    costs.forEach((c) => c.season && all.add(c.season));
    products.forEach((p) => p.season && all.add(p.season));
    return sortSeasons(Array.from(all));
  }, [costs, products]);

  const factories = useMemo(() => {
    const all = new Set<string>();
    costs.forEach((c) => c.factory && all.add(c.factory));
    products.forEach((p) => p.factoryName && all.add(p.factoryName));
    return Array.from(all).sort();
  }, [costs, products]);

  const countries = useMemo(() => {
    const all = new Set<string>();
    costs.forEach((c) => c.countryOfOrigin && all.add(c.countryOfOrigin));
    products.forEach((p) => p.countryOfOrigin && all.add(p.countryOfOrigin));
    return Array.from(all).sort();
  }, [costs, products]);

  const designTeams = useMemo(() => {
    const all = new Set<string>();
    costs.forEach((c) => c.designTeam && all.add(c.designTeam));
    products.forEach((p) => p.divisionDesc && all.add(p.divisionDesc));
    return Array.from(all).sort();
  }, [costs, products]);

  const developers = useMemo(() => {
    const all = new Set<string>();
    costs.forEach((c) => c.developer && all.add(c.developer));
    products.forEach((p) => p.techDesignerName && all.add(p.techDesignerName));
    return Array.from(all).sort();
  }, [costs, products]);

  // Group costs by Style # + Season and aggregate, supplementing with Product data for missing styles
  const filteredCostsWithSales = useMemo(() => {
    // First, group costs by styleNumber + season
    const grouped = new Map<string, {
      styleNumber: string;
      styleName: string;
      season: string;
      factories: Set<string>;
      countries: Set<string>;
      teams: Set<string>;
      developers: Set<string>;
      fob: number;
      landed: number;
      suggestedWholesale: number;
      suggestedMsrp: number;
      count: number;
      costSource: string; // 'landed_cost' | 'standard_cost' | 'product'
    }>();

    costs.forEach((c) => {
      // Apply filters (except factory/country/team/developer - those are applied after merge)
      if (filterSeason && c.season !== filterSeason) return;
      if (filterStyleNumber && !c.styleNumber.toLowerCase().includes(filterStyleNumber.toLowerCase())) return;

      const key = `${c.styleNumber}-${c.season}`;
      const existing = grouped.get(key);

      if (existing) {
        existing.count++;
        if (c.factory) existing.factories.add(c.factory);
        if (c.countryOfOrigin) existing.countries.add(c.countryOfOrigin);
        if (c.designTeam) existing.teams.add(c.designTeam);
        if (c.developer) existing.developers.add(c.developer);
        // Keep first non-zero values for pricing
        if (!existing.fob && c.fob) existing.fob = c.fob;
        if (!existing.landed && c.landed) existing.landed = c.landed;
        if (!existing.suggestedWholesale && c.suggestedWholesale) existing.suggestedWholesale = c.suggestedWholesale;
        if (!existing.suggestedMsrp && c.suggestedMsrp) existing.suggestedMsrp = c.suggestedMsrp;
        // Upgrade source if this record is higher priority
        if (c.costSource === 'landed_cost') existing.costSource = 'landed_cost';
      } else {
        grouped.set(key, {
          styleNumber: c.styleNumber,
          styleName: c.styleName || '',
          season: c.season,
          factories: new Set(c.factory ? [c.factory] : []),
          countries: new Set(c.countryOfOrigin ? [c.countryOfOrigin] : []),
          teams: new Set(c.designTeam ? [c.designTeam] : []),
          developers: new Set(c.developer ? [c.developer] : []),
          fob: c.fob || 0,
          landed: c.landed || 0,
          suggestedWholesale: c.suggestedWholesale || 0,
          suggestedMsrp: c.suggestedMsrp || 0,
          count: 1,
          costSource: c.costSource || 'standard_cost',
        });
      }
    });

    // Supplement with Product data for styles that have NO cost records
    products.forEach((p) => {
      if (filterSeason && p.season !== filterSeason) return;
      if (filterStyleNumber && !p.styleNumber.toLowerCase().includes(filterStyleNumber.toLowerCase())) return;

      const key = `${p.styleNumber}-${p.season}`;
      if (grouped.has(key)) {
        // Already have cost data — but supplement missing fields from product
        const existing = grouped.get(key)!;
        if (!existing.landed && p.cost) existing.landed = p.cost;
        if (!existing.suggestedWholesale && p.price) existing.suggestedWholesale = p.price;
        if (!existing.suggestedMsrp && p.msrp) existing.suggestedMsrp = p.msrp;
        if (p.factoryName && existing.factories.size === 0) existing.factories.add(p.factoryName);
        if (p.countryOfOrigin && existing.countries.size === 0) existing.countries.add(p.countryOfOrigin);
        if (p.divisionDesc && existing.teams.size === 0) existing.teams.add(p.divisionDesc);
        return;
      }

      // No cost record exists — create a synthetic one from product data
      grouped.set(key, {
        styleNumber: p.styleNumber,
        styleName: p.styleDesc || '',
        season: p.season,
        factories: new Set(p.factoryName ? [p.factoryName] : []),
        countries: new Set(p.countryOfOrigin ? [p.countryOfOrigin] : []),
        teams: new Set(p.divisionDesc ? [p.divisionDesc] : []),
        developers: new Set(p.techDesignerName ? [p.techDesignerName] : []),
        fob: 0,
        landed: p.cost || 0,
        suggestedWholesale: p.price || 0,
        suggestedMsrp: p.msrp || 0,
        count: 1,
        costSource: 'product',
      });
    });

    // Apply factory/country/team/developer filters after merge
    const filtered = Array.from(grouped.values()).filter((g) => {
      const factory = g.factories.size === 1 ? Array.from(g.factories)[0] : g.factories.size > 1 ? 'Multiple' : '';
      const coo = g.countries.size === 1 ? Array.from(g.countries)[0] : g.countries.size > 1 ? 'Multiple' : '';
      const team = g.teams.size === 1 ? Array.from(g.teams)[0] : g.teams.size > 1 ? 'Multiple' : '';
      const dev = g.developers.size === 1 ? Array.from(g.developers)[0] : g.developers.size > 1 ? 'Multiple' : '';

      if (filterFactory && factory !== filterFactory) return false;
      if (filterCountry && coo !== filterCountry) return false;
      if (filterTeam && team !== filterTeam) return false;
      if (filterDeveloper && dev !== filterDeveloper) return false;
      return true;
    });

    // Convert to array with aggregated values
    return filtered.map((g) => {
      const salesKey = `${g.styleNumber}-${g.season}`;
      const salesData = salesByStyleSeason[salesKey] || { revenue: 0, units: 0 };
      const margin = calculateMargin(g.suggestedWholesale, g.landed);

      return {
        styleNumber: g.styleNumber,
        styleName: g.styleName,
        season: g.season,
        factory: g.factories.size === 1 ? Array.from(g.factories)[0] : g.factories.size > 1 ? 'Multiple' : '',
        countryOfOrigin: g.countries.size === 1 ? Array.from(g.countries)[0] : g.countries.size > 1 ? 'Multiple' : '',
        designTeam: g.teams.size === 1 ? Array.from(g.teams)[0] : g.teams.size > 1 ? 'Multiple' : '',
        developer: g.developers.size === 1 ? Array.from(g.developers)[0] : g.developers.size > 1 ? 'Multiple' : '',
        fob: g.fob,
        landed: g.landed,
        suggestedWholesale: g.suggestedWholesale,
        suggestedMsrp: g.suggestedMsrp,
        margin,
        revenue: salesData.revenue,
        units: salesData.units,
        colorCount: g.count,
        costSource: g.costSource,
      };
    });
  }, [costs, products, filterSeason, filterStyleNumber, filterFactory, filterCountry, filterTeam, filterDeveloper, salesByStyleSeason]);

  // Sort data
  const sortedData = useMemo(() => {
    return [...filteredCostsWithSales].sort((a, b) => {
      let aVal: string | number = 0;
      let bVal: string | number = 0;

      switch (sortField) {
        case 'styleNumber':
          aVal = a.styleNumber;
          bVal = b.styleNumber;
          break;
        case 'styleName':
          aVal = (a.styleName || '').toLowerCase();
          bVal = (b.styleName || '').toLowerCase();
          break;
        case 'revenue':
          aVal = a.revenue || 0;
          bVal = b.revenue || 0;
          break;
        case 'units':
          aVal = a.units || 0;
          bVal = b.units || 0;
          break;
        case 'factory':
          aVal = (a.factory || '').toLowerCase();
          bVal = (b.factory || '').toLowerCase();
          break;
        case 'coo':
          aVal = (a.countryOfOrigin || '').toLowerCase();
          bVal = (b.countryOfOrigin || '').toLowerCase();
          break;
        case 'fob':
          aVal = a.fob || 0;
          bVal = b.fob || 0;
          break;
        case 'landed':
          aVal = a.landed || 0;
          bVal = b.landed || 0;
          break;
        case 'wholesale':
          aVal = a.suggestedWholesale || 0;
          bVal = b.suggestedWholesale || 0;
          break;
        case 'msrp':
          aVal = a.suggestedMsrp || 0;
          bVal = b.suggestedMsrp || 0;
          break;
        case 'margin':
          aVal = a.margin || 0;
          bVal = b.margin || 0;
          break;
        case 'designTeam':
          aVal = (a.designTeam || '').toLowerCase();
          bVal = (b.designTeam || '').toLowerCase();
          break;
      }

      if (sortDir === 'asc') {
        return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      }
      return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
    });
  }, [filteredCostsWithSales, sortField, sortDir]);

  // Paginated data
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage]);

  const totalPages = Math.ceil(sortedData.length / pageSize);

  // Summary statistics
  const summary = useMemo(() => {
    const withFob = filteredCostsWithSales.filter((c) => c.fob > 0);
    const withLanded = filteredCostsWithSales.filter((c) => c.landed > 0);
    const withMargin = filteredCostsWithSales.filter((c) => c.margin !== null && c.margin !== undefined && isFinite(c.margin));

    const avgFob = withFob.length > 0
      ? withFob.reduce((sum, c) => sum + c.fob, 0) / withFob.length
      : 0;

    const avgLanded = withLanded.length > 0
      ? withLanded.reduce((sum, c) => sum + c.landed, 0) / withLanded.length
      : 0;

    const avgMargin = withMargin.length > 0
      ? withMargin.reduce((sum, c) => sum + (c.margin || 0), 0) / withMargin.length
      : null;

    const uniqueStyles = filteredCostsWithSales.length; // Already grouped by style+season
    const uniqueFactories = new Set(filteredCostsWithSales.map((c) => c.factory).filter(f => f && f !== 'Multiple')).size;
    const uniqueCountries = new Set(filteredCostsWithSales.map((c) => c.countryOfOrigin).filter(f => f && f !== 'Multiple')).size;

    // Total revenue and units
    const totalRevenue = filteredCostsWithSales.reduce((sum, c) => sum + c.revenue, 0);
    const totalUnits = filteredCostsWithSales.reduce((sum, c) => sum + c.units, 0);

    // Margin distribution (only for valid margins)
    const marginBuckets = {
      excellent: withMargin.filter((c) => (c.margin || 0) >= 0.50).length,
      good: withMargin.filter((c) => (c.margin || 0) >= 0.45 && (c.margin || 0) < 0.50).length,
      fair: withMargin.filter((c) => (c.margin || 0) >= 0.40 && (c.margin || 0) < 0.45).length,
      poor: withMargin.filter((c) => (c.margin || 0) > 0 && (c.margin || 0) < 0.40).length,
    };

    // Missing Costs: styles in products (filtered by season) that don't have cost data
    const costStyleNumbers = new Set(filteredCostsWithSales.map(c => c.styleNumber));
    const productStyleNumbers = new Set(
      products
        .filter(p => !filterSeason || p.season === filterSeason)
        .map(p => p.styleNumber)
    );
    const missingCosts = Array.from(productStyleNumbers).filter(s => !costStyleNumbers.has(s)).length;
    const totalProductStyles = productStyleNumbers.size;

    return {
      totalRecords: filteredCostsWithSales.length,
      totalRevenue,
      totalUnits,
      uniqueStyles,
      uniqueFactories,
      uniqueCountries,
      avgFob,
      avgLanded,
      avgMargin,
      marginBuckets,
      missingCosts,
      totalProductStyles,
    };
  }, [filteredCostsWithSales, products, filterSeason]);

  // Group by Factory
  const byFactory = useMemo(() => {
    const grouped = new Map<string, { count: number; fobSum: number; fobCount: number; landedSum: number; landedCount: number; marginSum: number; marginCount: number }>();

    filteredCostsWithSales.forEach((c) => {
      const key = c.factory || 'Unknown';
      const existing = grouped.get(key);
      const hasValidMargin = c.margin !== null && c.margin !== undefined && isFinite(c.margin);

      if (existing) {
        existing.count++;
        if (c.fob > 0) { existing.fobSum += c.fob; existing.fobCount++; }
        if (c.landed > 0) { existing.landedSum += c.landed; existing.landedCount++; }
        if (hasValidMargin) { existing.marginSum += c.margin!; existing.marginCount++; }
      } else {
        grouped.set(key, {
          count: 1,
          fobSum: c.fob > 0 ? c.fob : 0,
          fobCount: c.fob > 0 ? 1 : 0,
          landedSum: c.landed > 0 ? c.landed : 0,
          landedCount: c.landed > 0 ? 1 : 0,
          marginSum: hasValidMargin ? c.margin! : 0,
          marginCount: hasValidMargin ? 1 : 0,
        });
      }
    });

    return Array.from(grouped.entries())
      .map(([factory, data]) => ({
        factory,
        count: data.count,
        avgFob: data.fobCount > 0 ? data.fobSum / data.fobCount : 0,
        avgLanded: data.landedCount > 0 ? data.landedSum / data.landedCount : 0,
        avgMargin: data.marginCount > 0 ? data.marginSum / data.marginCount : null,
      }))
      .sort((a, b) => b.count - a.count);
  }, [filteredCostsWithSales]);

  // Group by Country
  const byCountry = useMemo(() => {
    const grouped = new Map<string, { count: number; fobSum: number; fobCount: number; landedSum: number; landedCount: number; marginSum: number; marginCount: number }>();

    filteredCostsWithSales.forEach((c) => {
      const key = c.countryOfOrigin || 'Unknown';
      const existing = grouped.get(key);
      const hasValidMargin = c.margin !== null && c.margin !== undefined && isFinite(c.margin);

      if (existing) {
        existing.count++;
        if (c.fob > 0) { existing.fobSum += c.fob; existing.fobCount++; }
        if (c.landed > 0) { existing.landedSum += c.landed; existing.landedCount++; }
        if (hasValidMargin) { existing.marginSum += c.margin!; existing.marginCount++; }
      } else {
        grouped.set(key, {
          count: 1,
          fobSum: c.fob > 0 ? c.fob : 0,
          fobCount: c.fob > 0 ? 1 : 0,
          landedSum: c.landed > 0 ? c.landed : 0,
          landedCount: c.landed > 0 ? 1 : 0,
          marginSum: hasValidMargin ? c.margin! : 0,
          marginCount: hasValidMargin ? 1 : 0,
        });
      }
    });

    return Array.from(grouped.entries())
      .map(([country, data]) => ({
        country,
        count: data.count,
        avgFob: data.fobCount > 0 ? data.fobSum / data.fobCount : 0,
        avgLanded: data.landedCount > 0 ? data.landedSum / data.landedCount : 0,
        avgMargin: data.marginCount > 0 ? data.marginSum / data.marginCount : null,
      }))
      .sort((a, b) => b.count - a.count);
  }, [filteredCostsWithSales]);

  // Group by Design Team
  const byTeam = useMemo(() => {
    const grouped = new Map<string, { count: number; fobSum: number; fobCount: number; landedSum: number; landedCount: number; marginSum: number; marginCount: number }>();

    filteredCostsWithSales.forEach((c) => {
      const key = c.designTeam || 'Unknown';
      const existing = grouped.get(key);
      const hasValidMargin = c.margin !== null && c.margin !== undefined && isFinite(c.margin);

      if (existing) {
        existing.count++;
        if (c.fob > 0) { existing.fobSum += c.fob; existing.fobCount++; }
        if (c.landed > 0) { existing.landedSum += c.landed; existing.landedCount++; }
        if (hasValidMargin) { existing.marginSum += c.margin!; existing.marginCount++; }
      } else {
        grouped.set(key, {
          count: 1,
          fobSum: c.fob > 0 ? c.fob : 0,
          fobCount: c.fob > 0 ? 1 : 0,
          landedSum: c.landed > 0 ? c.landed : 0,
          landedCount: c.landed > 0 ? 1 : 0,
          marginSum: hasValidMargin ? c.margin! : 0,
          marginCount: hasValidMargin ? 1 : 0,
        });
      }
    });

    return Array.from(grouped.entries())
      .map(([team, data]) => ({
        team,
        count: data.count,
        avgFob: data.fobCount > 0 ? data.fobSum / data.fobCount : 0,
        avgLanded: data.landedCount > 0 ? data.landedSum / data.landedCount : 0,
        avgMargin: data.marginCount > 0 ? data.marginSum / data.marginCount : null,
      }))
      .sort((a, b) => b.count - a.count);
  }, [filteredCostsWithSales]);

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

  const clearFilters = () => {
    setFilterSeason('');
    setFilterStyleNumber('');
    setFilterFactory('');
    setFilterCountry('');
    setFilterTeam('');
    setFilterDeveloper('');
    setCurrentPage(1);
  };

  const hasFilters = filterSeason || filterStyleNumber || filterFactory || filterCountry || filterTeam || filterDeveloper;

  // Export CSV
  const exportCSV = () => {
    const headers = ['Style #', 'Style Name', 'Season', 'Factory', 'Country', 'Design Team', 'Developer', 'FOB', 'Landed', 'Margin %'];

    const rows = sortedData.map((c) => [
      c.styleNumber,
      `"${c.styleName || ''}"`,
      c.season,
      c.factory,
      c.countryOfOrigin,
      c.designTeam,
      c.developer,
      c.fob?.toFixed(2) || '',
      c.landed?.toFixed(2) || '',
      c.margin ? (c.margin * 100).toFixed(1) : '',
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `landed-costs-${filterSeason || 'all'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // No cost data message
  if (costs.length === 0) {
    return (
      <div className="p-6">
        <h2 className="text-4xl font-display font-bold text-text-primary mb-6">Landed Costs</h2>
        <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-xl p-8 text-center">
          <DollarSign className="w-16 h-16 text-amber-500 mx-auto mb-4" />
          <p className="text-xl text-amber-800 dark:text-amber-200 font-bold">No landed cost data available</p>
          <p className="text-amber-600 dark:text-amber-400 text-base mt-2">
            Make sure the &quot;Landed Request Sheet.xlsx&quot; file is in the data folder and refresh the data.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-4xl font-display font-bold text-text-primary">
            Landed Costs
            {(filterSeason || selectedSeason) && (
              <span className="ml-3 text-2xl font-mono text-cyan-600">
                {filterSeason || selectedSeason}
              </span>
            )}
          </h2>
          <p className="text-base text-text-muted mt-2">
            FOB, landed costs, and margins from the Landed Request Sheet
            {(filterSeason || selectedSeason) && (
              <span className="ml-2 text-cyan-600 font-medium">
                • Revenue/Units for {filterSeason || selectedSeason} only
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1 bg-surface rounded-lg border border-border-primary p-1.5">
          <button
            onClick={() => setViewMode('table')}
            className={`px-4 py-2 text-base font-bold rounded-md transition-colors ${
              viewMode === 'table' ? 'bg-cyan-600 text-white' : 'text-text-secondary hover:bg-surface-tertiary'
            }`}
          >
            Table
          </button>
          <button
            onClick={() => setViewMode('byFactory')}
            className={`px-4 py-2 text-base font-bold rounded-md transition-colors ${
              viewMode === 'byFactory' ? 'bg-cyan-600 text-white' : 'text-text-secondary hover:bg-surface-tertiary'
            }`}
          >
            By Factory
          </button>
          <button
            onClick={() => setViewMode('byCountry')}
            className={`px-4 py-2 text-base font-bold rounded-md transition-colors ${
              viewMode === 'byCountry' ? 'bg-cyan-600 text-white' : 'text-text-secondary hover:bg-surface-tertiary'
            }`}
          >
            By Country
          </button>
          <button
            onClick={() => setViewMode('byTeam')}
            className={`px-4 py-2 text-base font-bold rounded-md transition-colors ${
              viewMode === 'byTeam' ? 'bg-cyan-600 text-white' : 'text-text-secondary hover:bg-surface-tertiary'
            }`}
          >
            By Team
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-surface rounded-xl border-2 border-border-primary p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-sm font-black text-text-secondary uppercase tracking-wide">Filters</span>
          <div className="flex-1 h-px bg-border-primary"></div>
        </div>
        <div className="flex flex-wrap gap-5 items-end">
          {/* Season Filter */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-text-muted uppercase tracking-wider">Season</label>
            <select
              value={filterSeason}
              onChange={(e) => { setFilterSeason(e.target.value); setCurrentPage(1); }}
              className="px-4 py-2.5 text-base border-2 border-border-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 min-w-[120px] bg-surface"
            >
              <option value="">All Seasons</option>
              {seasons.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Style # Filter */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-text-muted uppercase tracking-wider">Style #</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-faint" />
              <input
                type="text"
                value={filterStyleNumber}
                onChange={(e) => { setFilterStyleNumber(e.target.value); setCurrentPage(1); }}
                placeholder="Search..."
                className="pl-11 pr-4 py-2.5 text-base border-2 border-border-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 w-[140px] bg-surface"
              />
            </div>
          </div>

          {/* Factory Filter */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-text-muted uppercase tracking-wider">Factory</label>
            <select
              value={filterFactory}
              onChange={(e) => { setFilterFactory(e.target.value); setCurrentPage(1); }}
              className="px-4 py-2.5 text-base border-2 border-border-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 min-w-[160px] bg-surface"
            >
              <option value="">All Factories</option>
              {factories.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>

          {/* Country Filter */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-text-muted uppercase tracking-wider">Country</label>
            <select
              value={filterCountry}
              onChange={(e) => { setFilterCountry(e.target.value); setCurrentPage(1); }}
              className="px-4 py-2.5 text-base border-2 border-border-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 min-w-[140px] bg-surface"
            >
              <option value="">All Countries</option>
              {countries.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Design Team Filter */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-text-muted uppercase tracking-wider">Team</label>
            <select
              value={filterTeam}
              onChange={(e) => { setFilterTeam(e.target.value); setCurrentPage(1); }}
              className="px-4 py-2.5 text-base border-2 border-border-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 min-w-[140px] bg-surface"
            >
              <option value="">All Teams</option>
              {designTeams.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Developer Filter */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-text-muted uppercase tracking-wider">Developer</label>
            <select
              value={filterDeveloper}
              onChange={(e) => { setFilterDeveloper(e.target.value); setCurrentPage(1); }}
              className="px-4 py-2.5 text-base border-2 border-border-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 min-w-[160px] bg-surface"
            >
              <option value="">All Developers</option>
              {developers.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Clear Filters */}
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-2 px-4 py-2.5 text-base font-semibold text-text-muted hover:text-text-secondary hover:bg-surface-tertiary rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
              Clear
            </button>
          )}

          {/* Export */}
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 px-4 py-2.5 text-base font-semibold text-text-secondary hover:text-text-primary hover:bg-surface-tertiary rounded-lg transition-colors"
          >
            <Download className="w-5 h-5" />
            Export
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <div className="bg-surface rounded-xl border-2 border-border-primary p-5 shadow-sm">
          <div className="flex items-start justify-between mb-3">
            <span className="text-sm font-bold text-text-secondary uppercase tracking-wide">Records</span>
            <Layers className="w-6 h-6 text-text-faint" />
          </div>
          <div className="text-3xl font-display font-bold text-text-primary">{summary.totalRecords.toLocaleString()}</div>
          <div className="text-sm text-text-muted mt-1">{summary.uniqueStyles} styles</div>
        </div>

        <div className="bg-surface rounded-xl border-2 border-border-primary p-5 shadow-sm">
          <div className="flex items-start justify-between mb-3">
            <span className="text-sm font-bold text-text-secondary uppercase tracking-wide">Avg FOB</span>
            <DollarSign className="w-6 h-6 text-blue-500" />
          </div>
          <div className="text-3xl font-display font-bold text-text-primary">{formatCurrency(summary.avgFob)}</div>
          <div className="text-sm text-text-muted mt-1">factory cost</div>
        </div>

        <div className="bg-surface rounded-xl border-2 border-border-primary p-5 shadow-sm">
          <div className="flex items-start justify-between mb-3">
            <span className="text-sm font-bold text-text-secondary uppercase tracking-wide">Avg Landed</span>
            <DollarSign className="w-6 h-6 text-violet-500" />
          </div>
          <div className="text-3xl font-display font-bold text-text-primary">{formatCurrency(summary.avgLanded)}</div>
          <div className="text-sm text-text-muted mt-1">total cost</div>
        </div>

        <div className="bg-surface rounded-xl border-2 border-border-primary p-5 shadow-sm">
          <div className="flex items-start justify-between mb-3">
            <span className="text-sm font-bold text-text-secondary uppercase tracking-wide">Avg Margin</span>
            <Percent className="w-6 h-6 text-emerald-500" />
          </div>
          <div className={`text-3xl font-display font-bold ${getMarginColorClass(summary.avgMargin)}`}>
            {formatPercentRaw(summary.avgMargin)}
          </div>
        </div>

        <div className="bg-surface rounded-xl border-2 border-border-primary p-5 shadow-sm">
          <div className="flex items-start justify-between mb-3">
            <span className="text-sm font-bold text-text-secondary uppercase tracking-wide">Factories</span>
            <Factory className="w-6 h-6 text-orange-500" />
          </div>
          <div className="text-3xl font-display font-bold text-text-primary">{summary.uniqueFactories}</div>
        </div>

        <div className="bg-surface rounded-xl border-2 border-border-primary p-5 shadow-sm">
          <div className="flex items-start justify-between mb-3">
            <span className="text-sm font-bold text-text-secondary uppercase tracking-wide">Countries</span>
            <Globe className="w-6 h-6 text-cyan-500" />
          </div>
          <div className="text-3xl font-display font-bold text-text-primary">{summary.uniqueCountries}</div>
        </div>

        {/* Missing Costs Card */}
        <div className={`rounded-xl border-2 p-5 shadow-sm ${
          summary.missingCosts > 0 ? 'bg-amber-50 dark:bg-amber-950 border-amber-300 dark:border-amber-700' : 'bg-emerald-50 dark:bg-emerald-950 border-emerald-300 dark:border-emerald-700'
        }`}>
          <div className="flex items-start justify-between mb-3">
            <span className="text-sm font-bold text-text-secondary uppercase tracking-wide">Missing</span>
            <AlertTriangle className={`w-6 h-6 ${summary.missingCosts > 0 ? 'text-amber-500' : 'text-emerald-500'}`} />
          </div>
          <div className={`text-3xl font-display font-bold ${
            summary.missingCosts > 0 ? 'text-amber-600' : 'text-emerald-600'
          }`}>
            {summary.missingCosts}
          </div>
          <div className="text-sm text-text-muted mt-1">
            of {summary.totalProductStyles} styles
          </div>
        </div>
      </div>

      {/* Margin Distribution */}
      <div className="bg-surface rounded-xl border-2 border-border-primary p-5 shadow-sm">
        <h3 className="text-lg font-bold text-text-primary mb-4">Margin Distribution</h3>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="w-4 h-4 rounded-full bg-emerald-500"></span>
            <span className="text-base font-medium text-text-secondary">50%+ ({summary.marginBuckets.excellent})</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-4 rounded-full bg-cyan-500"></span>
            <span className="text-base font-medium text-text-secondary">45-50% ({summary.marginBuckets.good})</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-4 rounded-full bg-amber-500"></span>
            <span className="text-base font-medium text-text-secondary">40-45% ({summary.marginBuckets.fair})</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-4 rounded-full bg-red-500"></span>
            <span className="text-base font-medium text-text-secondary">&lt;40% ({summary.marginBuckets.poor})</span>
          </div>
        </div>
      </div>

      {/* View Content */}
      {viewMode === 'table' && (
        <div className="bg-surface rounded-xl border-2 border-border-primary shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-surface-tertiary border-b-2 border-border-strong">
                  <th
                    className="px-4 py-3 text-left text-sm font-bold text-text-secondary uppercase tracking-wide cursor-pointer hover:text-text-primary border-r border-border-primary"
                    onClick={() => handleSort('styleNumber')}
                  >
                    <div className="flex items-center gap-1">
                      Style #
                      <ArrowUpDown className="w-4 h-4" />
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-left text-sm font-bold text-text-secondary uppercase tracking-wide cursor-pointer hover:text-text-primary border-r border-border-primary"
                    onClick={() => handleSort('styleName')}
                  >
                    <div className="flex items-center gap-1">
                      Style Name
                      <ArrowUpDown className="w-4 h-4" />
                    </div>
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-bold text-text-secondary uppercase tracking-wide border-l border-border-primary">
                    Season
                  </th>
                  <th
                    className="px-4 py-3 text-right text-sm font-bold text-text-secondary uppercase tracking-wide cursor-pointer hover:text-text-primary border-l border-border-primary"
                    onClick={() => handleSort('revenue')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Revenue
                      <ArrowUpDown className="w-4 h-4" />
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-right text-sm font-bold text-text-secondary uppercase tracking-wide cursor-pointer hover:text-text-primary border-l border-border-primary"
                    onClick={() => handleSort('units')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Units
                      <ArrowUpDown className="w-4 h-4" />
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-left text-sm font-bold text-text-secondary uppercase tracking-wide cursor-pointer hover:text-text-primary border-l border-border-primary"
                    onClick={() => handleSort('factory')}
                  >
                    <div className="flex items-center gap-1">
                      Factory
                      <ArrowUpDown className="w-4 h-4" />
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-left text-sm font-bold text-text-secondary uppercase tracking-wide cursor-pointer hover:text-text-primary border-l border-border-primary"
                    onClick={() => handleSort('coo')}
                  >
                    <div className="flex items-center gap-1">
                      COO
                      <ArrowUpDown className="w-4 h-4" />
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-right text-sm font-bold text-text-secondary uppercase tracking-wide cursor-pointer hover:text-text-primary border-l border-border-primary"
                    onClick={() => handleSort('fob')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      FOB
                      <ArrowUpDown className="w-4 h-4" />
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-right text-sm font-bold text-text-secondary uppercase tracking-wide cursor-pointer hover:text-text-primary border-l border-border-primary"
                    onClick={() => handleSort('landed')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Landed
                      <ArrowUpDown className="w-4 h-4" />
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-right text-sm font-bold text-text-secondary uppercase tracking-wide cursor-pointer hover:text-text-primary border-l border-border-primary"
                    onClick={() => handleSort('wholesale')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Wholesale
                      <ArrowUpDown className="w-4 h-4" />
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-right text-sm font-bold text-text-secondary uppercase tracking-wide cursor-pointer hover:text-text-primary border-l border-border-primary"
                    onClick={() => handleSort('msrp')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      MSRP
                      <ArrowUpDown className="w-4 h-4" />
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-right text-sm font-bold text-text-secondary uppercase tracking-wide cursor-pointer hover:text-text-primary border-l-2 border-border-strong"
                    onClick={() => handleSort('margin')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Margin
                      <ArrowUpDown className="w-4 h-4" />
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-left text-sm font-bold text-text-secondary uppercase tracking-wide cursor-pointer hover:text-text-primary border-l border-border-primary"
                    onClick={() => handleSort('designTeam')}
                  >
                    <div className="flex items-center gap-1">
                      Team
                      <ArrowUpDown className="w-4 h-4" />
                    </div>
                  </th>
                  <th className="px-3 py-3 text-center text-xs font-bold text-text-muted uppercase tracking-wide border-l border-border-primary">
                    Src
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedData.map((cost, index) => (
                  <tr
                    key={`${cost.styleNumber}-${cost.season}-${index}`}
                    onClick={() => onStyleClick(cost.styleNumber)}
                    className={`border-b border-border-primary cursor-pointer transition-colors ${
                      index % 2 === 0 ? 'bg-surface' : 'bg-surface-secondary'
                    } hover:bg-hover-accent`}
                  >
                    <td className="px-4 py-4 border-r border-border-primary">
                      <span className="font-mono text-lg font-bold text-text-primary">
                        {cost.styleNumber}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-base text-text-secondary truncate max-w-[200px] border-r border-border-primary">
                      {cost.styleName || '—'}
                    </td>
                    <td className="px-4 py-4 border-l border-border-primary">
                      <span className={`text-base font-mono font-semibold px-2.5 py-1 rounded ${
                        cost.season?.endsWith('SP') ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400' : 'bg-orange-50 dark:bg-orange-950 text-orange-700 dark:text-orange-400'
                      }`}>
                        {cost.season}
                      </span>
                    </td>
                    <td className={`px-4 py-4 text-right font-mono text-base border-l border-border-primary ${
                      cost.revenue === 0
                        ? 'text-text-faint italic'
                        : cost.revenue >= 100000
                        ? 'text-emerald-600 font-bold'
                        : 'text-text-primary font-medium'
                    }`}>
                      {formatRevenue(cost.revenue)}
                    </td>
                    <td className={`px-4 py-4 text-right font-mono text-base border-l border-border-primary ${
                      cost.units === 0
                        ? 'text-text-faint italic'
                        : 'text-text-primary font-medium'
                    }`}>
                      {cost.units === 0 ? '0' : formatNumber(cost.units)}
                    </td>
                    <td className="px-4 py-4 text-base text-text-secondary border-l border-border-primary">{cost.factory || '—'}</td>
                    <td className="px-4 py-4 text-base text-text-secondary border-l border-border-primary">{cost.countryOfOrigin || '—'}</td>
                    <td className="px-4 py-4 text-right font-mono text-base font-medium text-text-primary border-l border-border-primary">
                      {formatCurrency(cost.fob)}
                    </td>
                    <td className="px-4 py-4 text-right font-mono text-base font-bold text-text-primary border-l border-border-primary">
                      {formatCurrency(cost.landed)}
                    </td>
                    <td className="px-4 py-4 text-right font-mono text-base font-medium text-text-primary border-l border-border-primary">
                      {formatCurrency(cost.suggestedWholesale)}
                    </td>
                    <td className="px-4 py-4 text-right font-mono text-base font-medium text-text-primary border-l border-border-primary">
                      {formatCurrency(cost.suggestedMsrp)}
                    </td>
                    <td className="px-4 py-4 text-right border-l-2 border-border-strong">
                      <span className={`font-mono text-base font-bold px-3 py-1 rounded ${getMarginBgClass(cost.margin)} ${getMarginColorClass(cost.margin)}`}>
                        {formatPercentRaw(cost.margin)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-base text-text-secondary border-l border-border-primary">{cost.designTeam || '—'}</td>
                    <td className="px-3 py-4 text-center border-l border-border-primary">
                      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                        cost.costSource === 'landed_cost'
                          ? 'bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-400'
                          : cost.costSource === 'standard_cost'
                          ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-400'
                          : 'bg-surface-tertiary text-text-muted dark:bg-gray-800 dark:text-gray-400'
                      }`} title={
                        cost.costSource === 'landed_cost'
                          ? 'Landed Cost Sheet (Priority 1)'
                          : cost.costSource === 'standard_cost'
                          ? 'Standard Cost Sheet (Priority 2)'
                          : 'From Line List'
                      }>
                        {cost.costSource === 'landed_cost' ? 'LC' : cost.costSource === 'standard_cost' ? 'SC' : 'LL'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="px-5 py-4 bg-surface-tertiary border-t-2 border-border-strong flex items-center justify-between">
            <span className="text-base text-text-secondary">
              Showing {((currentPage - 1) * pageSize) + 1}-{Math.min(currentPage * pageSize, sortedData.length)} of{' '}
              {sortedData.length} records
            </span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="inline-flex items-center gap-1 px-4 py-2 text-base font-semibold text-text-secondary hover:text-text-primary hover:bg-surface-tertiary rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-5 h-5" />
                Prev
              </button>
              <span className="text-base text-text-secondary font-medium">
                Page {currentPage} of {totalPages || 1}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="inline-flex items-center gap-1 px-4 py-2 text-base font-semibold text-text-secondary hover:text-text-primary hover:bg-surface-tertiary rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* By Factory View */}
      {viewMode === 'byFactory' && (
        <div className="bg-surface rounded-xl border-2 border-border-primary shadow-sm overflow-hidden">
          <div className="bg-surface-secondary px-6 py-4 border-b-2 border-border-primary">
            <h3 className="text-xl font-bold text-text-primary">Cost Analysis by Factory</h3>
          </div>
          <div className="divide-y divide-border-secondary">
            {byFactory.map((item) => (
              <button
                key={item.factory}
                onClick={() => { setFilterFactory(item.factory); setViewMode('table'); }}
                className="w-full px-6 py-5 flex items-center justify-between hover:bg-hover transition-colors"
              >
                <div className="flex items-center gap-4">
                  <Factory className="w-6 h-6 text-text-faint" />
                  <div className="text-left">
                    <div className="text-lg font-semibold text-text-primary">{item.factory}</div>
                    <div className="text-base text-text-muted">{item.count} records</div>
                  </div>
                </div>
                <div className="flex items-center gap-8 text-right">
                  <div>
                    <div className="text-sm font-bold text-text-muted uppercase">Avg FOB</div>
                    <div className="font-mono text-lg font-semibold text-text-primary">{formatCurrency(item.avgFob)}</div>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-text-muted uppercase">Avg Landed</div>
                    <div className="font-mono text-lg font-semibold text-text-primary">{formatCurrency(item.avgLanded)}</div>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-text-muted uppercase">Avg Margin</div>
                    <div className={`font-mono text-lg font-semibold ${getMarginColorClass(item.avgMargin)}`}>
                      {formatPercentRaw(item.avgMargin)}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* By Country View */}
      {viewMode === 'byCountry' && (
        <div className="bg-surface rounded-xl border-2 border-border-primary shadow-sm overflow-hidden">
          <div className="bg-surface-secondary px-6 py-4 border-b-2 border-border-primary">
            <h3 className="text-xl font-bold text-text-primary">Cost Analysis by Country</h3>
          </div>
          <div className="divide-y divide-border-secondary">
            {byCountry.map((item) => (
              <button
                key={item.country}
                onClick={() => { setFilterCountry(item.country); setViewMode('table'); }}
                className="w-full px-6 py-5 flex items-center justify-between hover:bg-hover transition-colors"
              >
                <div className="flex items-center gap-4">
                  <Globe className="w-6 h-6 text-text-faint" />
                  <div className="text-left">
                    <div className="text-lg font-semibold text-text-primary">{item.country}</div>
                    <div className="text-base text-text-muted">{item.count} records</div>
                  </div>
                </div>
                <div className="flex items-center gap-8 text-right">
                  <div>
                    <div className="text-sm font-bold text-text-muted uppercase">Avg FOB</div>
                    <div className="font-mono text-lg font-semibold text-text-primary">{formatCurrency(item.avgFob)}</div>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-text-muted uppercase">Avg Landed</div>
                    <div className="font-mono text-lg font-semibold text-text-primary">{formatCurrency(item.avgLanded)}</div>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-text-muted uppercase">Avg Margin</div>
                    <div className={`font-mono text-lg font-semibold ${getMarginColorClass(item.avgMargin)}`}>
                      {formatPercentRaw(item.avgMargin)}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* By Team View */}
      {viewMode === 'byTeam' && (
        <div className="bg-surface rounded-xl border-2 border-border-primary shadow-sm overflow-hidden">
          <div className="bg-surface-secondary px-6 py-4 border-b-2 border-border-primary">
            <h3 className="text-xl font-bold text-text-primary">Cost Analysis by Design Team</h3>
          </div>
          <div className="divide-y divide-border-secondary">
            {byTeam.map((item) => (
              <button
                key={item.team}
                onClick={() => { setFilterTeam(item.team); setViewMode('table'); }}
                className="w-full px-6 py-5 flex items-center justify-between hover:bg-hover transition-colors"
              >
                <div className="flex items-center gap-4">
                  <Users className="w-6 h-6 text-text-faint" />
                  <div className="text-left">
                    <div className="text-lg font-semibold text-text-primary">{item.team}</div>
                    <div className="text-base text-text-muted">{item.count} records</div>
                  </div>
                </div>
                <div className="flex items-center gap-8 text-right">
                  <div>
                    <div className="text-sm font-bold text-text-muted uppercase">Avg FOB</div>
                    <div className="font-mono text-lg font-semibold text-text-primary">{formatCurrency(item.avgFob)}</div>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-text-muted uppercase">Avg Landed</div>
                    <div className="font-mono text-lg font-semibold text-text-primary">{formatCurrency(item.avgLanded)}</div>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-text-muted uppercase">Avg Margin</div>
                    <div className={`font-mono text-lg font-semibold ${getMarginColorClass(item.avgMargin)}`}>
                      {formatPercentRaw(item.avgMargin)}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
