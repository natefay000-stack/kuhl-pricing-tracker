'use client';

import { useState, useRef, useEffect } from 'react';
import { Search, Save, RefreshCw, X, Download, FileText, FileSpreadsheet, ChevronDown, Loader2 } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';

interface AppHeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSave?: () => void;
  onRefresh?: () => void;
  onExportPdf?: () => Promise<void>;
  onExportExcel?: () => void;
}

export default function AppHeader({
  searchQuery,
  onSearchChange,
  onSave,
  onRefresh,
  onExportPdf,
  onExportExcel,
}: AppHeaderProps) {
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    if (!exportOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [exportOpen]);

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

          {/* Export Dropdown */}
          {(onExportPdf || onExportExcel) && (
            <div className="relative" ref={dropdownRef}>
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
