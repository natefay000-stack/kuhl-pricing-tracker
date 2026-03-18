import { useEffect, useCallback } from 'react';

export interface KeyboardShortcutHandlers {
  onSearch?: () => void;
  onExport?: () => void;
  onRefresh?: () => void;
  onEscape?: () => void;
  onNavigate?: (direction: 'up' | 'down') => void;
}

function isMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
}

function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

export function useKeyboardShortcuts(handlers: KeyboardShortcutHandlers) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const mac = isMac();
      const mod = mac ? e.metaKey : e.ctrlKey;

      // Escape always fires regardless of focus
      if (e.key === 'Escape') {
        handlers.onEscape?.();
        return;
      }

      // Cmd/Ctrl+K — search — works from anywhere (even inputs)
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        handlers.onSearch?.();
        return;
      }

      // Everything below only fires when no input is focused
      if (isInputFocused()) return;

      // Cmd/Ctrl+E — export
      if (mod && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        handlers.onExport?.();
        return;
      }

      // Cmd/Ctrl+Shift+R — refresh data
      if (mod && e.shiftKey && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        handlers.onRefresh?.();
        return;
      }

      // Arrow keys — table navigation
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        handlers.onNavigate?.('up');
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        handlers.onNavigate?.('down');
        return;
      }
    },
    [handlers],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

/** Utility export so components can show the right modifier symbol. */
export function getModifierKey(): string {
  return isMac() ? '\u2318' : 'Ctrl';
}

export { isMac };
