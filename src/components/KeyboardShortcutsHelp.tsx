'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { X } from 'lucide-react';
import { isMac } from '@/hooks/useKeyboardShortcuts';

interface Shortcut {
  keys: string[];
  description: string;
}

function buildShortcuts(mac: boolean): Shortcut[] {
  const mod = mac ? '\u2318' : 'Ctrl';
  return [
    { keys: [mod, 'K'], description: 'Focus search' },
    { keys: [mod, 'E'], description: 'Open export menu' },
    { keys: [mod, '\u21e7', 'R'], description: 'Refresh data' },
    { keys: ['Esc'], description: 'Close panels / modals' },
    { keys: ['\u2191'], description: 'Navigate up (table)' },
    { keys: ['\u2193'], description: 'Navigate down (table)' },
    { keys: ['?'], description: 'Show this help' },
  ];
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[1.5rem] bg-surface-tertiary border border-border-primary rounded-md px-1.5 py-0.5 text-xs font-mono text-text-secondary">
      {children}
    </kbd>
  );
}

export default function KeyboardShortcutsHelp() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const mac = typeof navigator !== 'undefined' ? isMac() : true;
  const shortcuts = buildShortcuts(mac);

  // Listen for '?' key to toggle
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Don't trigger from inputs
      if (e.key === '?' && !isInputElement(e)) {
        e.preventDefault();
        setOpen((prev) => !prev);
        return;
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // Click outside to close
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    },
    [],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center"
      onClick={handleBackdropClick}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Panel */}
      <div
        ref={panelRef}
        className="relative bg-surface rounded-xl shadow-2xl border border-border-primary max-w-sm w-full mx-4 overflow-hidden animate-fade-in"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-primary">
          <h2 className="text-sm font-semibold text-text-primary tracking-wide uppercase">
            Keyboard Shortcuts
          </h2>
          <button
            onClick={() => setOpen(false)}
            className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-secondary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Shortcuts list */}
        <div className="px-5 py-4 space-y-3">
          {shortcuts.map((s, i) => (
            <div key={i} className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">{s.description}</span>
              <div className="flex items-center gap-1 ml-4 flex-shrink-0">
                {s.keys.map((k, j) => (
                  <Kbd key={j}>{k}</Kbd>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div className="px-5 py-3 border-t border-border-primary">
          <p className="text-xs text-text-muted text-center">
            Press <Kbd>?</Kbd> to toggle this panel
          </p>
        </div>
      </div>
    </div>
  );
}

/** Check whether the event target is an input-like element. */
function isInputElement(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if (el.isContentEditable) return true;
  return false;
}
