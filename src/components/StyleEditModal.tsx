'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Save, Edit3, Loader2 } from 'lucide-react';
import { CostRecord, PricingRecord } from '@/types/product';

interface StyleEditModalProps {
  /** Cost row for the style+season being edited. null if this style has no Cost row yet. */
  cost?: CostRecord | null;
  /** Pricing row for the style+season. null if no Pricing row yet. */
  pricing?: PricingRecord | null;
  onClose: () => void;
  /** Called with each record that was actually updated (either, both, or neither). */
  onSaved?: (updates: { cost?: CostRecord; pricing?: PricingRecord }) => void;
}

const EDITED_BY_KEY = 'kuhl-edited-by';

/**
 * Unified edit modal for MSRP, Wholesale (Pricing table) + Landed cost +
 * Margin (Cost table). Replaces the separate CostEditModal and
 * PriceEditModal — single save button, hits /api/data/update-price and
 * /api/data/update-cost as needed.
 *
 * Margin input accepts 0–1 (e.g. 0.52) or 0–100 (e.g. 52) and normalizes
 * to a ratio on submit.
 */
export default function StyleEditModal({ cost, pricing, onClose, onSaved }: StyleEditModalProps) {
  const styleNumber = pricing?.styleNumber ?? cost?.styleNumber ?? '';
  const styleDesc = pricing?.styleDesc ?? cost?.styleName ?? '';
  const season = pricing?.season ?? cost?.season ?? '';

  const [msrp, setMsrp] = useState<string>(
    pricing?.msrp != null ? String(pricing.msrp) : ''
  );
  const [wholesale, setWholesale] = useState<string>(
    pricing?.price != null ? String(pricing.price) : ''
  );
  const [landed, setLanded] = useState<string>(
    cost?.landed != null ? String(cost.landed) : ''
  );
  const [marginInput, setMarginInput] = useState<string>(
    cost?.margin != null ? String(cost.margin) : ''
  );
  const [editorName, setEditorName] = useState<string>(() => {
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const normalizeMargin = (raw: string): number | null => {
    const t = raw.replace('%', '').trim();
    if (!t) return null;
    const n = Number(t);
    if (!Number.isFinite(n)) return NaN;
    return n >= 1.5 ? n / 100 : n;
  };

  const parseNum = (raw: string): number | null => {
    const t = raw.replace(/[$,\s]/g, '').trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : NaN;
  };

  const handleSubmit = async () => {
    setError(null);
    const editor = editorName.trim();
    if (!editor) {
      setError('Please enter your name.');
      return;
    }

    // Parse + validate
    const nextMsrp = parseNum(msrp);
    if (Number.isNaN(nextMsrp)) return setError('MSRP must be a number.');
    const nextWholesale = parseNum(wholesale);
    if (Number.isNaN(nextWholesale)) return setError('Wholesale must be a number.');
    const nextLanded = parseNum(landed);
    if (Number.isNaN(nextLanded)) return setError('Landed must be a number.');
    const nextMargin = normalizeMargin(marginInput);
    if (Number.isNaN(nextMargin)) return setError('Margin must be a number (0.52 or 52 — both work).');

    // Pricing diffs
    const priceChanged = pricing != null && nextWholesale != null &&
      Math.abs((pricing.price ?? 0) - nextWholesale) > 1e-6;
    const msrpChanged = pricing != null && nextMsrp != null &&
      Math.abs((pricing.msrp ?? 0) - nextMsrp) > 1e-6;

    // Cost diffs
    const landedChanged = cost != null && nextLanded != null &&
      Math.abs((cost.landed ?? 0) - nextLanded) > 1e-6;
    const marginChanged = cost != null && nextMargin != null &&
      (cost.margin == null || Math.abs((cost.margin ?? 0) - nextMargin) > 1e-6);

    if (!priceChanged && !msrpChanged && !landedChanged && !marginChanged) {
      setError('No changes to save.');
      return;
    }

    setSaving(true);
    try {
      try { localStorage.setItem(EDITED_BY_KEY, editor); } catch { /* ignore */ }

      const trimmedNote = note.trim() || undefined;
      const updates: { cost?: CostRecord; pricing?: PricingRecord } = {};

      // ── Pricing update (if applicable) ──
      if ((priceChanged || msrpChanged) && pricing) {
        const body: Record<string, unknown> = { id: pricing.id, editedBy: editor };
        if (priceChanged) body.price = nextWholesale;
        if (msrpChanged) body.msrp = nextMsrp;
        if (trimmedNote) body.note = trimmedNote;
        const res = await fetch('/api/data/update-price', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || `Price update HTTP ${res.status}`);
        updates.pricing = {
          ...pricing,
          price: result.updated?.price ?? pricing.price,
          msrp: result.updated?.msrp ?? pricing.msrp,
        };
      }

      // ── Cost update (if applicable) ──
      if ((landedChanged || marginChanged) && cost) {
        const body: Record<string, unknown> = { id: cost.id, editedBy: editor };
        if (landedChanged) body.landed = nextLanded;
        if (marginChanged) body.margin = nextMargin;
        if (trimmedNote) body.note = trimmedNote;
        const res = await fetch('/api/data/update-cost', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || `Cost update HTTP ${res.status}`);
        updates.cost = {
          ...cost,
          landed: result.updated?.landed ?? cost.landed,
          margin: result.updated?.margin ?? cost.margin,
        };
      }

      onSaved?.(updates);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  // Derived: if wholesale and landed both exist, show the computed margin next to the input
  const computedMarginDisplay = (() => {
    const w = parseNum(wholesale);
    const l = parseNum(landed);
    if (w == null || l == null || w <= 0 || l <= 0 || Number.isNaN(w) || Number.isNaN(l)) return null;
    return ((w - l) / w) * 100;
  })();

  const nothingToEdit = !cost && !pricing;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={() => !saving && onClose()}
      />
      <div className="relative bg-surface rounded-xl shadow-2xl border border-primary max-w-md w-full mx-4 overflow-hidden">
        <div className="flex items-center justify-between gap-3 p-5 border-b border-primary">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-cyan-500/20 flex items-center justify-center">
              <Edit3 className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text-primary">Edit Style</h2>
              <p className="text-sm text-text-muted">
                {styleNumber}
                {styleDesc ? ` — ${styleDesc}` : ''}
                {season ? ` · ${season}` : ''}
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

        <div className="p-5 space-y-4">
          {nothingToEdit && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-sm text-amber-600 dark:text-amber-300">
              No Pricing or Cost row exists for this style+season. Import via xlsx first.
            </div>
          )}

          {pricing && (
            <>
              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1">
                  MSRP ($)
                </label>
                <input
                  ref={firstFieldRef}
                  type="number"
                  step="0.01"
                  value={msrp}
                  onChange={(e) => setMsrp(e.target.value)}
                  disabled={saving}
                  className="w-full px-3 py-2 bg-surface-secondary border border-primary rounded-lg text-text-primary font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <p className="text-xs text-text-muted mt-1">
                  Current: {pricing.msrp != null ? `$${pricing.msrp.toFixed(2)}` : '—'}
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1">
                  Wholesale ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={wholesale}
                  onChange={(e) => setWholesale(e.target.value)}
                  disabled={saving}
                  className="w-full px-3 py-2 bg-surface-secondary border border-primary rounded-lg text-text-primary font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <p className="text-xs text-text-muted mt-1">
                  Current: {pricing.price != null ? `$${pricing.price.toFixed(2)}` : '—'}
                </p>
              </div>
            </>
          )}

          {cost && (
            <>
              <div className={pricing ? 'pt-2 border-t border-primary' : ''}>
                <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1">
                  Landed ($)
                </label>
                <input
                  ref={pricing ? undefined : firstFieldRef}
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
                  Current: {cost.margin != null ? `${(cost.margin * 100).toFixed(1)}%` : '—'} · Enter 0.52 or 52 — both work.
                  {computedMarginDisplay != null && (
                    <span className="ml-2 text-cyan-600 dark:text-cyan-400">
                      (implied from whsl/landed: {computedMarginDisplay.toFixed(1)}%)
                    </span>
                  )}
                </p>
              </div>
            </>
          )}

          {(pricing || cost) && (
            <>
              <div className="pt-2 border-t border-primary">
                <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1">
                  Your name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={editorName}
                  onChange={(e) => setEditorName(e.target.value)}
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
            </>
          )}

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
        </div>

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
            disabled={saving || nothingToEdit}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
