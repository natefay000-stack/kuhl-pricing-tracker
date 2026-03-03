'use client';

import { useMemo } from 'react';
import { ViewId } from './Sidebar';
import { sortSeasons } from '@/lib/store';
import { getSeasonStatus, type SeasonStatus } from '@/lib/season-utils';
import { CUSTOMER_TYPE_LABELS } from '@/types/product';

interface FilterBarProps {
  activeView: ViewId;
  seasons: string[];
  divisions: string[];
  categories: string[];
  designers: string[];
  customerTypes: string[];
  customers: string[];
  selectedSeason: string;
  selectedDivision: string;
  selectedCategory: string;
  selectedDesigner: string;
  selectedCustomerType: string;
  selectedCustomer: string;
  onSeasonChange: (season: string) => void;
  onDivisionChange: (division: string) => void;
  onCategoryChange: (category: string) => void;
  onDesignerChange: (designer: string) => void;
  onCustomerTypeChange: (ct: string) => void;
  onCustomerChange: (customer: string) => void;
}

// ── Season pill color helpers ───────────────────────────────────────

function getStatusColor(status: SeasonStatus): {
  bg: string; border: string; text: string; label: string;
} {
  switch (status) {
    case 'CLOSED':
      return {
        bg: 'bg-slate-800/60',
        border: 'border-slate-600/40',
        text: 'text-slate-400',
        label: 'Closed',
      };
    case 'SHIPPING':
      return {
        bg: 'bg-emerald-500/20',
        border: 'border-emerald-500/50',
        text: 'text-emerald-400',
        label: 'Selling',
      };
    case 'PRE-BOOK':
      return {
        bg: 'bg-orange-500/20',
        border: 'border-orange-500/50',
        text: 'text-orange-400',
        label: 'Pre-Book',
      };
    case 'PLANNING':
      return {
        bg: 'bg-purple-500/20',
        border: 'border-purple-500/50',
        text: 'text-purple-400',
        label: 'Planning',
      };
  }
}

export default function FilterBar({
  activeView,
  seasons,
  divisions,
  categories,
  designers,
  customerTypes,
  customers,
  selectedSeason,
  selectedDivision,
  selectedCategory,
  selectedDesigner,
  selectedCustomerType,
  selectedCustomer,
  onSeasonChange,
  onDivisionChange,
  onCategoryChange,
  onDesignerChange,
  onCustomerTypeChange,
  onCustomerChange,
}: FilterBarProps) {
  // Sort seasons chronologically and attach status
  const sortedSeasons = useMemo(() => {
    const sorted = sortSeasons(seasons);
    return sorted.map(code => ({
      code,
      status: getSeasonStatus(code),
    }));
  }, [seasons]);

  // Quick filter helpers
  const handleAllSpring = () => {
    // If already filtering spring, clear it
    if (selectedSeason.endsWith('SP') || selectedSeason === '__ALL_SP__') {
      onSeasonChange('');
    } else {
      onSeasonChange('__ALL_SP__');
    }
  };

  const handleAllFall = () => {
    if (selectedSeason.endsWith('FA') || selectedSeason === '__ALL_FA__') {
      onSeasonChange('');
    } else {
      onSeasonChange('__ALL_FA__');
    }
  };

  const handleSeasonPillClick = (code: string) => {
    if (selectedSeason === code) {
      onSeasonChange('');
    } else {
      onSeasonChange(code);
    }
  };

  const isSpringActive = selectedSeason === '__ALL_SP__';
  const isFallActive = selectedSeason === '__ALL_FA__';

  return (
    <div
      className="sticky top-14 z-20"
      style={{
        background: 'var(--color-surface-secondary)',
        backdropFilter: 'blur(var(--glass-blur)) saturate(var(--glass-saturate))',
        WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(var(--glass-saturate))',
        borderBottom: '1px solid var(--glass-border)',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.05)',
      }}
    >
      {/* ── Row 1: Season Pills ─────────────────────────────────── */}
      <div className="px-6 py-3" style={{ borderBottom: '1px solid var(--color-border-secondary)' }}>
        <div className="flex items-center gap-4 flex-wrap">
          {/* Label + quick filters */}
          <span className="text-[10px] font-semibold text-text-faint uppercase tracking-widest mr-1">
            Quick Season Filter
          </span>

          {/* All Spring button */}
          <button
            onClick={handleAllSpring}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
              isSpringActive
                ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30'
                : 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'
            }`}
          >
            All Spring
          </button>

          {/* All Fall button */}
          <button
            onClick={handleAllFall}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
              isFallActive
                ? 'bg-orange-500 text-white shadow-sm shadow-orange-500/30'
                : 'bg-orange-500/15 text-orange-400 hover:bg-orange-500/25'
            }`}
          >
            All Fall
          </button>

          {/* Separator */}
          <div className="w-px h-6 bg-border-primary/50" />

          {/* Individual season pills */}
          <div className="flex items-center gap-2 flex-wrap">
            {sortedSeasons.map(({ code, status }) => {
              const colors = getStatusColor(status);
              const isActive = selectedSeason === code;
              return (
                <button
                  key={code}
                  onClick={() => handleSeasonPillClick(code)}
                  className={`flex flex-col items-center px-3 py-1.5 rounded-lg border text-center transition-all min-w-[56px] ${
                    isActive
                      ? `${colors.bg} border-white/30 ring-2 ring-white/20 shadow-sm`
                      : `${colors.bg} ${colors.border} hover:border-white/20`
                  }`}
                >
                  <span className={`text-xs font-bold leading-tight ${isActive ? 'text-white' : colors.text}`}>
                    {code}
                  </span>
                  <span className={`text-[9px] leading-tight ${isActive ? 'text-white/80' : 'text-text-faint'}`}>
                    {colors.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Row 2: Dropdown Filters ─────────────────────────────── */}
      <div className="px-6 py-2.5 flex items-center gap-6 flex-wrap">
        {/* Division */}
        <div className="flex flex-col gap-1">
          <label className="text-[9px] font-semibold text-text-faint uppercase tracking-widest">
            Division
          </label>
          <select
            value={selectedDivision}
            onChange={(e) => onDivisionChange(e.target.value)}
            className={`px-3 py-2 rounded-lg text-sm font-medium bg-surface-tertiary border text-text-primary focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 min-w-[160px] ${
              selectedDivision ? 'border-cyan-500/50' : 'border-border-primary'
            }`}
          >
            <option value="">All Divisions</option>
            {divisions.map((div) => (
              <option key={div} value={div}>{div}</option>
            ))}
          </select>
        </div>

        {/* Category */}
        <div className="flex flex-col gap-1">
          <label className="text-[9px] font-semibold text-text-faint uppercase tracking-widest">
            Category
          </label>
          <select
            value={selectedCategory}
            onChange={(e) => onCategoryChange(e.target.value)}
            className={`px-3 py-2 rounded-lg text-sm font-medium bg-surface-tertiary border text-text-primary focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 min-w-[160px] ${
              selectedCategory ? 'border-cyan-500/50' : 'border-border-primary'
            }`}
          >
            <option value="">All Categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        {/* Designer */}
        <div className="flex flex-col gap-1">
          <label className="text-[9px] font-semibold text-text-faint uppercase tracking-widest">
            Designer
          </label>
          <select
            value={selectedDesigner}
            onChange={(e) => onDesignerChange(e.target.value)}
            className={`px-3 py-2 rounded-lg text-sm font-medium bg-surface-tertiary border text-text-primary focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 min-w-[160px] ${
              selectedDesigner ? 'border-cyan-500/50' : 'border-border-primary'
            }`}
          >
            <option value="">All Designers</option>
            {designers.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>

        {/* Customer Type */}
        <div className="flex flex-col gap-1">
          <label className="text-[9px] font-semibold text-text-faint uppercase tracking-widest">
            Customer Type
          </label>
          <select
            value={selectedCustomerType}
            onChange={(e) => onCustomerTypeChange(e.target.value)}
            className={`px-3 py-2 rounded-lg text-sm font-medium bg-surface-tertiary border text-text-primary focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 min-w-[160px] ${
              selectedCustomerType ? 'border-cyan-500/50' : 'border-border-primary'
            }`}
          >
            <option value="">All Types</option>
            {customerTypes.map((ct) => (
              <option key={ct} value={ct}>{CUSTOMER_TYPE_LABELS[ct] || ct}</option>
            ))}
          </select>
        </div>

        {/* Customer */}
        <div className="flex flex-col gap-1">
          <label className="text-[9px] font-semibold text-text-faint uppercase tracking-widest">
            Customer
          </label>
          <select
            value={selectedCustomer}
            onChange={(e) => onCustomerChange(e.target.value)}
            className={`px-3 py-2 rounded-lg text-sm font-medium bg-surface-tertiary border text-text-primary focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 min-w-[170px] ${
              selectedCustomer ? 'border-cyan-500/50' : 'border-border-primary'
            }`}
          >
            <option value="">All Customers</option>
            {customers.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
