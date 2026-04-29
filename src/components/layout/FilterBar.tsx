'use client';

import { useMemo } from 'react';
import { ViewId } from './Sidebar';
import { sortSeasons } from '@/lib/store';
import { getSeasonStatus, type SeasonStatus } from '@/lib/season-utils';
import MultiSelect from '@/components/MultiSelect';

interface FilterBarProps {
  activeView: ViewId;
  seasons: string[];
  divisions: string[];
  categories: string[];
  designers: string[];
  customerTypes: string[];
  customers: string[];
  years: string[];
  months: string[];
  selectedSeason: string;
  selectedDivision: string;
  selectedCategory: string;
  selectedDesigner: string;
  selectedCustomerType: string;
  selectedCustomer: string;
  selectedMonth: string;
  selectedYear: string;
  onSeasonChange: (season: string) => void;
  onDivisionChange: (division: string) => void;
  onCategoryChange: (category: string) => void;
  onDesignerChange: (designer: string) => void;
  onCustomerTypeChange: (ct: string) => void;
  onCustomerChange: (customer: string) => void;
  onMonthChange: (month: string) => void;
  onYearChange: (year: string) => void;
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
  seasons,
  divisions,
  categories,
  designers,
  customerTypes,
  customers,
  years,
  months,
  selectedSeason,
  selectedDivision,
  selectedCategory,
  selectedDesigner,
  selectedCustomerType,
  selectedCustomer,
  selectedMonth,
  selectedYear,
  onSeasonChange,
  onDivisionChange,
  onCategoryChange,
  onDesignerChange,
  onCustomerTypeChange,
  onCustomerChange,
  onMonthChange,
  onYearChange,
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
      <div className="px-6 py-2.5 flex items-end gap-6 flex-wrap">
        <MultiSelect
          label="Division"
          placeholder="All Divisions"
          options={divisions}
          values={selectedDivision ? selectedDivision.split('|').filter(Boolean) : []}
          onChange={(arr) => onDivisionChange(arr.join('|'))}
          widthClass="w-[160px]"
        />
        <MultiSelect
          label="Category"
          placeholder="All Categories"
          options={categories}
          values={selectedCategory ? selectedCategory.split('|').filter(Boolean) : []}
          onChange={(arr) => onCategoryChange(arr.join('|'))}
          widthClass="w-[160px]"
        />
        <MultiSelect
          label="Designer"
          placeholder="All Designers"
          options={designers}
          values={selectedDesigner ? selectedDesigner.split('|').filter(Boolean) : []}
          onChange={(arr) => onDesignerChange(arr.join('|'))}
          widthClass="w-[160px]"
        />
        <MultiSelect
          label="Customer Type"
          placeholder="All Types"
          options={customerTypes}
          values={selectedCustomerType ? selectedCustomerType.split('|').filter(Boolean) : []}
          onChange={(arr) => onCustomerTypeChange(arr.join('|'))}
          widthClass="w-[160px]"
        />
        <MultiSelect
          label="Customer"
          placeholder="All Customers"
          options={customers}
          values={selectedCustomer ? selectedCustomer.split('|').filter(Boolean) : []}
          onChange={(arr) => onCustomerChange(arr.join('|'))}
          widthClass="w-[170px]"
        />

        {/* Separator before date filters */}
        {years.length > 0 && (
          <div className="w-px h-10 bg-border-primary/50 self-end mb-2" />
        )}

        {years.length > 0 && (
          <MultiSelect
            label="Year"
            placeholder="All Years"
            options={years}
            values={selectedYear ? selectedYear.split('|').filter(Boolean) : []}
            onChange={(arr) => onYearChange(arr.join('|'))}
            widthClass="w-[110px]"
          />
        )}
        {years.length > 0 && (
          <MultiSelect
            label="Month"
            placeholder="All Months"
            options={months}
            values={selectedMonth ? selectedMonth.split('|').filter(Boolean) : []}
            onChange={(arr) => onMonthChange(arr.join('|'))}
            widthClass="w-[140px]"
          />
        )}
      </div>
    </div>
  );
}
