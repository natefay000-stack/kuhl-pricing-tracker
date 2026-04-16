'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Save, Edit3 } from 'lucide-react';
import { CostRecord } from '@/types/product';

interface CostEditModalProps {
  cost: CostRecord;
  onClose: () => void;
  onSaved: (updated: CostRecord) => void;
}

const EDITED_BY_KEY = 'kuhl-edited-by'; // remember last name across edits

/**
 * Modal to edit landed cost and margin on a single Cost record.
 *
 * Margin input accepts either 0-1 decimal (e.g. 0.52) or 0-100 percent
 * (e.g. 52) — anything >= 1.5 is assumed to be a percent and divided by 100.
 * Stored margin is always a 0-1 ratio, matching the import pipeline.
 */
export default function CostEditModal({ cost, onClose, onSaved }: CostEditModalProps) {
  const [landed, setLanded] = useState<string>(
    cost.landed != null ? String(cost.landed) : ''
  );
  const [marginInput, setMarginInput] = useState<string>(
    cost.margin != null ? String(cost.margin) : ''
  );
  const [editedBy, setEditedBy] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem(EDITED_BY_KEY) ?? '';
  });
  const [note, setNote] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstFieldRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const normalizeMargin = (raw: string): number | null => {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return NaN; // signals invalid
    // Heuristic: values >= 1.5 are assumed to be percent (e.g. 52 -> 0.52)
    return n >= 1.5 ? n / 100 : n;
  };

  const handleSubmit = async () => {
    setError(null);
    const editor = editedBy.trim();
    if (!editor) {
      setError('Please enter your name.');
      return;
    }

    const nextLanded = landed.trim() === '' ? null : Number(landed);
    if (nextLanded !== null && !Number.isFinite(nextLanded)) {
      setError('Landed must be a number.');
      return;
    }

    const nextMargin = normalizeMargin(marginInput);
    if (Number.isNaN(nextMargin)) {
      setError('Margin must be a number (decimal like 0.52 or percent like 52).');
      return;
    }

    const landedChanged =
      nextLanded !== null && Math.abs((cost.landed ?? 0) - nextLanded) > 1e-6;
    const marginChanged =
      nextMargin !== null &&
      (cost.margin == null || Math.abs((cost.margin ?? 0) - nextMargin) > 1e-6);

    if (!landedChanged && !marginChanged) {
      setError('No changes to save.');
      return;
    }

    setSaving(true);
    try {
      const body: Record<string, unknown> = { id: cost.id, editedBy: editor };
      if (landedChanged) body.landed = nextLanded;
      if (marginChanged) body.margin = nextMargin;
      if (note.trim()) body.note = note.trim();

      const res = await fetch('/api/data/update-cost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || `HTTP ${res.status}`);
      }

      // Remember the editor name for next time
      try {
        localStorage.setItem(EDITED_BY_KEY, editor);
      } catch {
        /* ignore quota errors */
      }

      // Merge DB response back into CostRecord shape (preserve enriched fields)
      const merged: CostRecord = {
        ...cost,
        landed: result.updated.landed ?? cost.landed,
        margin: result.updated.margin ?? cost.margin,
      };
      onSaved(merged);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={() => !saving && onClose()}
      />

      {/* Modal card */}
      <div className="relative bg-surface rounded-xl shadow-2xl border border-primary max-w-md w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 p-5 border-b border-primary">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-cyan-500/20 flex items-center justify-center">
              <Edit3 className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text-primary">Edit Cost</h2>
              <p className="text-sm text-text-muted">
                {cost.styleNumber}
                {cost.styleName ? ` — ${cost.styleName}` : ''} · {cost.season}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="text-text-muted hover:text-text-primary disabled:opacity-50"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1">
              Landed ($)
            </label>
            <input
              ref={firstFieldRef}
              type="number"
              step="0.01"
              value={landed}
              onChange={(e) => setLanded(e.target.value)}
              disabled={saving}
              className="w-full px-3 py-2 bg-surface-secondary border border-primary rounded-lg text-text-primary font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
            <p className="text-xs text-text-muted mt-1">
              Current: {cost.landed != null ? `$${cost.landed.toFixed(2)}` : '—'}
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1">
              Margin
            </label>
            <input
              type="number"
              step="0.01"
              value={marginInput}
              onChange={(e) => setMarginInput(e.target.value)}
              disabled={saving}
              className="w-full px-3 py-2 bg-surface-secondary border border-primary rounded-lg text-text-primary font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
            <p className="text-xs text-text-muted mt-1">
              Current: {cost.margin != null ? `${(cost.margin * 100).toFixed(1)}%` : '—'} · Enter
              0.52 or 52 — both work.
            </p>
          </div>

          <div className="pt-2 border-t border-primary">
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1">
              Your name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={editedBy}
              onChange={(e) => setEditedBy(e.target.value)}
              disabled={saving}
              placeholder="e.g. Shelby"
              className="w-full px-3 py-2 bg-surface-secondary border border-primary rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1">
              Note (optional)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={saving}
              placeholder="Why this change?"
              className="w-full px-3 py-2 bg-surface-secondary border border-primary rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-5 border-t border-primary">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
