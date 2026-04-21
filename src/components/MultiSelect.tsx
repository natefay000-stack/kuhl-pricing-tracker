'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check, X } from 'lucide-react';

interface MultiSelectProps {
  label?: string;
  placeholder?: string;
  options: string[];
  values: string[];
  onChange: (next: string[]) => void;
  /** Fixed button width in tailwind class (e.g. 'w-[150px]'). Defaults to 'w-[160px]'. */
  widthClass?: string;
}

/**
 * Popover multi-select. Click to open a checklist of options; selected
 * values show as a compact summary on the trigger button ("Mens", "Mens
 * +2", or "All"). Clicking outside or pressing Escape closes.
 */
export default function MultiSelect({
  label,
  placeholder = 'All',
  options,
  values,
  onChange,
  widthClass = 'w-[160px]',
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const toggle = (v: string) => {
    if (values.includes(v)) onChange(values.filter((x) => x !== v));
    else onChange([...values, v]);
  };

  const summary = (() => {
    if (values.length === 0) return placeholder;
    if (values.length === 1) return values[0];
    return `${values[0]} +${values.length - 1}`;
  })();

  const filtered = query
    ? options.filter((o) => o.toLowerCase().includes(query.toLowerCase()))
    : options;

  return (
    <div ref={rootRef} className={`relative flex flex-col gap-1.5 ${widthClass}`}>
      {label && (
        <label className="text-xs font-bold text-text-secondary uppercase tracking-wide">
          {label}
        </label>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center justify-between gap-2 px-3 py-2 text-sm border-2 rounded-lg focus:outline-none transition-colors ${
          values.length > 0
            ? 'border-cyan-500 bg-cyan-500/5 text-text-primary'
            : 'border-border-primary text-text-secondary hover:border-gray-400 dark:hover:border-gray-600'
        }`}
      >
        <span className="truncate">{summary}</span>
        <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-40 top-full mt-1 left-0 w-full min-w-[220px] bg-surface border-2 border-border-primary rounded-lg shadow-xl overflow-hidden">
          {/* Action row */}
          <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-b border-border-primary bg-surface-tertiary">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter…"
              className="flex-1 px-2 py-1 text-xs bg-surface rounded border border-border-primary focus:outline-none focus:ring-1 focus:ring-cyan-500"
            />
            {values.length > 0 && (
              <button
                onClick={() => onChange([])}
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-text-muted hover:text-red-400 rounded"
                title="Clear selections"
              >
                <X className="w-3 h-3" />
                Clear
              </button>
            )}
          </div>

          {/* Options */}
          <div className="max-h-[280px] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-xs text-text-muted text-center">No matches</div>
            ) : (
              filtered.map((opt) => {
                const checked = values.includes(opt);
                return (
                  <button
                    key={opt}
                    onClick={() => toggle(opt)}
                    className={`flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-cyan-500/5 ${
                      checked ? 'text-text-primary' : 'text-text-secondary'
                    }`}
                  >
                    <span
                      className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                        checked
                          ? 'bg-cyan-600 border-cyan-600'
                          : 'bg-surface border-border-primary'
                      }`}
                    >
                      {checked && <Check className="w-3 h-3 text-white" />}
                    </span>
                    <span className="truncate">{opt}</span>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer count */}
          {values.length > 0 && (
            <div className="px-3 py-1.5 border-t border-border-primary bg-surface-tertiary text-xs text-text-muted">
              {values.length} selected
            </div>
          )}
        </div>
      )}
    </div>
  );
}
