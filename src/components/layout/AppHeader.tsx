'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Search, Save, RefreshCw, X, Download, FileText, FileSpreadsheet, ChevronDown, Loader2 } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';

export interface SearchSuggestion {
  type: 'style' | 'customer' | 'category' | 'color';
  label: string;
  sublabel?: string;
  value: string;
}

interface AppHeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSave?: () => void;
  onRefresh?: () => void;
  onExportPdf?: () => Promise<void>;
  onExportExcel?: () => void;
  searchSuggestions?: SearchSuggestion[];
  onSuggestionClick?: (suggestion: SearchSuggestion) => void;
}

const SECTION_ORDER: SearchSuggestion['type'][] = ['style', 'customer', 'category', 'color'];

const SECTION_LABELS: Record<SearchSuggestion['type'], string> = {
  style: 'Styles',
  customer: 'Customers',
  category: 'Categories',
  color: 'Colors',
};

const BADGE_COLORS: Record<SearchSuggestion['type'], { bg: string; text: string }> = {
  style: { bg: 'rgba(59,130,246,0.15)', text: 'rgb(96,165,250)' },
  customer: { bg: 'rgba(34,197,94,0.15)', text: 'rgb(74,222,128)' },
  category: { bg: 'rgba(168,85,247,0.15)', text: 'rgb(192,132,252)' },
  color: { bg: 'rgba(249,115,22,0.15)', text: 'rgb(251,146,60)' },
};

const MAX_PER_SECTION = 5;

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query || query.length < 2) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} className="bg-yellow-400/30 text-inherit rounded-sm px-0.5">{part}</mark>
    ) : (
      part
    )
  );
}

export default function AppHeader({
  searchQuery,
  onSearchChange,
  onSave,
  onRefresh,
  onExportPdf,
  onExportExcel,
  searchSuggestions,
  onSuggestionClick,
}: AppHeaderProps) {
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const exportDropdownRef = useRef<HTMLDivElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Group and filter suggestions
  const groupedSuggestions = useMemo(() => {
    if (!searchSuggestions || searchQuery.length < 2) return null;

    const groups: Partial<Record<SearchSuggestion['type'], SearchSuggestion[]>> = {};
    for (const suggestion of searchSuggestions) {
      if (!groups[suggestion.type]) groups[suggestion.type] = [];
      if (groups[suggestion.type]!.length < MAX_PER_SECTION) {
        groups[suggestion.type]!.push(suggestion);
      }
    }

    // Build ordered flat list and section info
    const orderedTypes = SECTION_ORDER.filter(type => groups[type] && groups[type]!.length > 0);
    if (orderedTypes.length === 0) return null;

    const flatList: SearchSuggestion[] = [];
    const sections: { type: SearchSuggestion['type']; startIndex: number; count: number }[] = [];

    for (const type of orderedTypes) {
      const items = groups[type]!;
      sections.push({ type, startIndex: flatList.length, count: items.length });
      flatList.push(...items);
    }

    return { sections, flatList };
  }, [searchSuggestions, searchQuery]);

  const hasSuggestions = groupedSuggestions !== null && groupedSuggestions.flatList.length > 0;
  const showDropdown = suggestionsOpen && hasSuggestions && searchQuery.length >= 2;

  // Close export dropdown on click outside
  useEffect(() => {
    if (!exportOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [exportOpen]);

  // Close suggestions dropdown on click outside
  useEffect(() => {
    if (!suggestionsOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setSuggestionsOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [suggestionsOpen]);

  // Open suggestions when query changes and has 2+ chars
  useEffect(() => {
    if (searchQuery.length >= 2 && hasSuggestions) {
      setSuggestionsOpen(true);
      setActiveIndex(-1);
    } else {
      setSuggestionsOpen(false);
      setActiveIndex(-1);
    }
  }, [searchQuery, hasSuggestions]);

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex < 0 || !suggestionsRef.current) return;
    const items = suggestionsRef.current.querySelectorAll('[data-suggestion-index]');
    const activeItem = items[activeIndex] as HTMLElement | undefined;
    if (activeItem) {
      activeItem.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  const handleSelectSuggestion = useCallback((suggestion: SearchSuggestion) => {
    onSuggestionClick?.(suggestion);
    setSuggestionsOpen(false);
    setActiveIndex(-1);
  }, [onSuggestionClick]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown || !groupedSuggestions) return;

    const totalItems = groupedSuggestions.flatList.length;

    if (e.key === 'Escape') {
      e.preventDefault();
      setSuggestionsOpen(false);
      setActiveIndex(-1);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(prev => (prev < totalItems - 1 ? prev + 1 : 0));
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => (prev > 0 ? prev - 1 : totalItems - 1));
      return;
    }

    if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      handleSelectSuggestion(groupedSuggestions.flatList[activeIndex]);
      return;
    }
  }, [showDropdown, groupedSuggestions, activeIndex, handleSelectSuggestion]);

  return (
    <>
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
        <div className="relative w-80" ref={searchContainerRef}>
          <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${searchQuery ? 'text-blue-500' : 'text-text-faint'}`} />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search styles, customers, categories..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              if (searchQuery.length >= 2 && hasSuggestions) {
                setSuggestionsOpen(true);
              }
            }}
            className={`w-full pl-10 ${searchQuery ? 'pr-8' : 'pr-4'} py-2 text-sm bg-surface-secondary border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 ${searchQuery ? 'border-blue-500/50' : 'border-border-primary'}`}
            role="combobox"
            aria-expanded={showDropdown}
            aria-haspopup="listbox"
            aria-autocomplete="list"
            aria-activedescendant={activeIndex >= 0 ? `suggestion-${activeIndex}` : undefined}
          />
          {searchQuery && (
            <button
              onClick={() => {
                onSearchChange('');
                setSuggestionsOpen(false);
                setActiveIndex(-1);
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-faint hover:text-text-primary transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {/* Search Suggestions Dropdown */}
          {showDropdown && groupedSuggestions && (
            <div
              ref={suggestionsRef}
              className="absolute left-0 right-0 top-full mt-1.5 rounded-lg shadow-xl overflow-hidden z-50 border max-h-80 overflow-y-auto"
              style={{
                background: 'var(--color-surface)',
                borderColor: 'var(--color-border-primary)',
              }}
              role="listbox"
            >
              {groupedSuggestions.sections.map((section) => (
                <div key={section.type}>
                  {/* Section Header */}
                  <div
                    className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-faint select-none sticky top-0"
                    style={{ background: 'var(--color-surface)' }}
                  >
                    {SECTION_LABELS[section.type]}
                  </div>

                  {/* Section Items */}
                  {groupedSuggestions.flatList
                    .slice(section.startIndex, section.startIndex + section.count)
                    .map((suggestion, i) => {
                      const globalIndex = section.startIndex + i;
                      const isActive = globalIndex === activeIndex;
                      const badge = BADGE_COLORS[suggestion.type];

                      return (
                        <button
                          key={`${suggestion.type}-${suggestion.value}-${i}`}
                          id={`suggestion-${globalIndex}`}
                          data-suggestion-index={globalIndex}
                          role="option"
                          aria-selected={isActive}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors cursor-pointer"
                          style={{
                            background: isActive ? 'var(--color-surface-secondary)' : 'transparent',
                          }}
                          onMouseEnter={() => setActiveIndex(globalIndex)}
                          onMouseDown={(e) => {
                            e.preventDefault(); // prevent blur on input
                            handleSelectSuggestion(suggestion);
                          }}
                        >
                          {/* Type Badge */}
                          <span
                            className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full capitalize"
                            style={{
                              background: badge.bg,
                              color: badge.text,
                            }}
                          >
                            {suggestion.type}
                          </span>

                          {/* Label & Sublabel */}
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium text-text-primary truncate block">
                              {highlightMatch(suggestion.label, searchQuery)}
                            </span>
                            {suggestion.sublabel && (
                              <span className="text-xs text-text-secondary truncate block">
                                {highlightMatch(suggestion.sublabel, searchQuery)}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <ThemeToggle />

          {/* Export Dropdown */}
          {(onExportPdf || onExportExcel) && (
            <div className="relative" ref={exportDropdownRef}>
              <button
                onClick={() => setExportOpen(o => !o)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-tertiary rounded-lg transition-colors"
              >
                <Download className="w-4 h-4" />
                Export
                <ChevronDown className={`w-3 h-3 transition-transform ${exportOpen ? 'rotate-180' : ''}`} />
              </button>

              {exportOpen && (
                <div
                  className="absolute right-0 top-full mt-1 w-52 rounded-lg shadow-xl overflow-hidden z-50 border"
                  style={{
                    background: 'var(--color-surface)',
                    borderColor: 'var(--color-border-primary)',
                  }}
                >
                  {onExportPdf && (
                    <button
                      onClick={async () => {
                        setExportOpen(false);
                        setExporting(true);
                        try { await onExportPdf(); }
                        catch (err) { console.error('PDF export failed:', err); }
                        finally { setExporting(false); }
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-secondary transition-colors"
                    >
                      <FileText className="w-4 h-4 text-red-400" />
                      Export as PDF
                    </button>
                  )}
                  {onExportExcel && (
                    <button
                      onClick={() => {
                        setExportOpen(false);
                        onExportExcel();
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-secondary transition-colors"
                    >
                      <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                      Export as Excel
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

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

      {/* PDF generating overlay */}
      {exporting && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9999]">
          <div
            className="px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 border"
            style={{
              background: 'var(--color-surface)',
              borderColor: 'var(--color-border-primary)',
            }}
          >
            <Loader2 className="w-5 h-5 animate-spin text-cyan-500" />
            <span className="text-sm font-medium text-text-primary">Generating PDF...</span>
          </div>
        </div>
      )}
    </>
  );
}
