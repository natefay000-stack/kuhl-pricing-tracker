'use client';

import { ViewId } from './Sidebar';

interface FilterBarProps {
  activeView: ViewId;
  seasons: string[];
  divisions: string[];
  categories: string[];
  selectedSeason: string;
  selectedDivision: string;
  selectedCategory: string;
  onSeasonChange: (season: string) => void;
  onDivisionChange: (division: string) => void;
  onCategoryChange: (category: string) => void;
}

export default function FilterBar({
  activeView,
  seasons,
  divisions,
  categories,
  selectedSeason,
  selectedDivision,
  selectedCategory,
  onSeasonChange,
  onDivisionChange,
  onCategoryChange,
}: FilterBarProps) {
  return (
    <div className="h-12 bg-surface-secondary border-b border-border-primary flex items-center gap-4 px-6 sticky top-14 z-20">
      {/* Season filter */}
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-text-muted uppercase tracking-wide">
          Season:
        </label>
        <select
          value={selectedSeason}
          onChange={(e) => onSeasonChange(e.target.value)}
          className="px-3 py-1.5 text-sm bg-surface border border-border-strong rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500"
        >
          <option value="">All</option>
          {seasons.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {/* Division filter */}
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-text-muted uppercase tracking-wide">
          Division:
        </label>
        <select
          value={selectedDivision}
          onChange={(e) => onDivisionChange(e.target.value)}
          className="px-3 py-1.5 text-sm bg-surface border border-border-strong rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500"
        >
          <option value="">All</option>
          {divisions.map((div) => (
            <option key={div} value={div}>
              {div}
            </option>
          ))}
        </select>
      </div>

      {/* Category filter */}
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-text-muted uppercase tracking-wide">
          Category:
        </label>
        <select
          value={selectedCategory}
          onChange={(e) => onCategoryChange(e.target.value)}
          className="px-3 py-1.5 text-sm bg-surface border border-border-strong rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500"
        >
          <option value="">All</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
