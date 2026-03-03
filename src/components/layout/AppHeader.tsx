'use client';

import { Search, Save, RefreshCw, X } from 'lucide-react';
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
    <header
      className="h-14 flex items-center justify-between px-6 sticky top-0 z-30"
      style={{
        background: 'var(--color-surface)',
        backdropFilter: 'blur(var(--glass-blur)) saturate(var(--glass-saturate))',
        WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(var(--glass-saturate))',
        borderBottom: '1px solid var(--glass-border)',
        boxShadow: '0 1px 0 var(--glass-border), 0 4px 16px rgba(0, 0, 0, 0.06)',
      }}
    >
      {/* Search */}
      <div className="relative w-80">
        <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${searchQuery ? 'text-blue-500' : 'text-text-faint'}`} />
        <input
          type="text"
          placeholder="Search all views by style # or name..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className={`w-full pl-10 ${searchQuery ? 'pr-8' : 'pr-4'} py-2 text-sm bg-surface-secondary border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 ${searchQuery ? 'border-blue-500/50' : 'border-border-primary'}`}
        />
        {searchQuery && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-faint hover:text-text-primary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
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
