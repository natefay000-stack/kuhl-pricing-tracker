'use client';

import { Search, Save, RefreshCw } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';

interface AppHeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSave?: () => void;
  onRefresh?: () => void;
}

export default function AppHeader({
  searchQuery,
  onSearchChange,
  onSave,
  onRefresh
}: AppHeaderProps) {
  return (
    <header className="h-14 bg-surface border-b border-border-primary flex items-center justify-between px-6 sticky top-0 z-30">
      {/* Search */}
      <div className="relative w-80">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-faint" />
        <input
          type="text"
          placeholder="Search style #, description..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full pl-10 pr-4 py-2 text-sm bg-surface-secondary border border-border-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <ThemeToggle />
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-tertiary rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        )}
        {onSave && (
          <button
            onClick={onSave}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-cyan-600 hover:bg-cyan-700 rounded-lg transition-colors"
          >
            <Save className="w-4 h-4" />
            Save
          </button>
        )}
      </div>
    </header>
  );
}
