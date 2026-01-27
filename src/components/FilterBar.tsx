'use client';

import { Search, X } from 'lucide-react';
import { FilterState } from '@/types/product';

interface FilterBarProps {
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  divisions: string[];
  categories: string[];
  seasons: string[];
  productLines: string[];
  designers: string[];
}

export default function FilterBar({
  filters,
  onFilterChange,
  divisions,
  categories,
  seasons,
  productLines,
  designers,
}: FilterBarProps) {
  const updateFilter = (key: keyof FilterState, value: any) => {
    onFilterChange({ ...filters, [key]: value });
  };

  const clearFilters = () => {
    onFilterChange({
      search: '',
      division: '',
      category: '',
      season: '',
      productLine: '',
      designer: '',
      carryOver: 'all',
      priceMin: null,
      priceMax: null,
    });
  };

  const hasActiveFilters = 
    filters.search || 
    filters.division || 
    filters.category || 
    filters.season || 
    filters.productLine || 
    filters.designer || 
    filters.carryOver !== 'all' ||
    filters.priceMin !== null ||
    filters.priceMax !== null;

  return (
    <div className="bg-white border-b border-kuhl-sand/30 sticky top-0 z-10">
      <div className="max-w-[1600px] mx-auto px-6 py-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-kuhl-stone/40" />
            <input
              type="search"
              placeholder="Search styles, colors, descriptions..."
              value={filters.search}
              onChange={(e) => updateFilter('search', e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm"
            />
          </div>

          {/* Season filter - primary filter */}
          {seasons.length > 0 && (
            <select
              value={filters.season}
              onChange={(e) => updateFilter('season', e.target.value)}
              className="text-sm min-w-[140px]"
            >
              <option value="">All Seasons</option>
              {seasons.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          )}

          {/* Division filter - only show if we have data */}
          {divisions.length > 0 && (
            <select
              value={filters.division}
              onChange={(e) => updateFilter('division', e.target.value)}
              className="text-sm min-w-[120px]"
            >
              <option value="">All Divisions</option>
              {divisions.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          )}

          {/* Category filter - only show if we have data */}
          {categories.length > 0 && (
            <select
              value={filters.category}
              onChange={(e) => updateFilter('category', e.target.value)}
              className="text-sm min-w-[120px]"
            >
              <option value="">All Categories</option>
              {categories.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}

          {/* Product Line filter - only show if we have data */}
          {productLines.length > 0 && (
            <select
              value={filters.productLine}
              onChange={(e) => updateFilter('productLine', e.target.value)}
              className="text-sm min-w-[140px]"
            >
              <option value="">All Product Lines</option>
              {productLines.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          )}

          {/* Clear filters */}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 px-3 py-2 text-sm text-kuhl-rust hover:bg-kuhl-rust/10 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
              Clear
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
