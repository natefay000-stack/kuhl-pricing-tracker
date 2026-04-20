'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Save, DollarSign } from 'lucide-react';
import { PricingRecord } from '@/types/product';

interface PriceEditModalProps {
  pricing: PricingRecord;
  onClose: () => void;
  onSaved: (updated: PricingRecord) => void;
}

const EDITED_BY_KEY = 'kuhl-edited-by'; // same key as CostEditModal so one name fits both

/** Edit wholesale price + MSRP on a single Pricing record. */
export default function PriceEditModal({ pricing, onClose, onSaved }: PriceEditModalProps) {
  const [price, setPrice] = useState<string>(
    pricing.price != null ? String(pricing.price) : '',
  );
  const [msrp, setMsrp] = useState<string>(
    pricing.msrp != null ? String(pricing.msrp) : '',
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const handleSubmit = async () => {
    setError(null);
    const editor = editedBy.trim();
    if (!editor) {
      setError('Please enter your name.');
      return;
    }

    const nextPrice = price.trim() === '' ? null : Number(price);
    if (nextPrice !== null && !Number.isFinite(nextPrice)) {
      setError('Wholesale must be a number.');
      return;
    }
    const nextMsrp = msrp.trim() === '' ? null : Number(msrp);
    if (nextMsrp !== null && !Number.isFinite(nextMsrp)) {
      setError('MSRP must be a number.');
      return;
    }

    const priceChanged =
      nextPrice !== null && Math.abs((pricing.price ?? 0) - nextPrice) > 1e-6;
    const msrpChanged =
      nextMsrp !== null && Math.abs((pricing.msrp ?? 0) - nextMsrp) > 1e-6;

    if (!priceChanged && !msrpChanged) {
      setError('No changes to save.');
      return;
    }

    setSaving(true);
    try {
      const body: Record<string, unknown> = { id: pricing.id, editedBy: editor };
      if (priceChanged) body.price = nextPrice;
      if (msrpChanged) body.msrp = nextMsrp;
      if (note.trim()) body.note = note.trim();

      const res = await fetch('/api/data/update-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || `HTTP ${res.status}`);
      }

      try {
        localStorage.setItem(EDITED_BY_KEY, editor);
      } catch {
        /* ignore quota errors */
      }

      const merged: PricingRecord = {
        ...pricing,
        price: result.updated.price ?? pricing.price,
        msrp: result.updated.msrp ?? pricing.msrp,
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
      <div
        className="absolute inset-0 bg-black/60"
        onClick={() => !saving && onClose()}
      />
      <div className="relative bg-surface rounded-xl shadow-2xl border border-primary max-w-md w-full mx-4 overflow-hidden">
        <div className="flex items-center justify-between gap-3 p-5 border-b border-primary">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text-primary">Edit Price</h2>
              <p className="text-sm text-text-muted">
                {pricing.styleNumber}
                {pricing.styleDesc ? ` — ${pricing.styleDesc}` : ''} · {pricing.season}
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
          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1">
              Wholesale ($)
            </label>
            <input
              ref={firstFieldRef}
              type="number"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              disabled={saving}
              className="w-full px-3 py-2 bg-surface-secondary border border-primary rounded-lg text-text-primary font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <p className="text-xs text-text-muted mt-1">
              Current: {pricing.price != null ? `$${pricing.price.toFixed(2)}` : '—'}
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1">
              MSRP ($)
            </label>
            <input
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
              className="w-full px-3 py-2 bg-surface-secondary border border-primary rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
              className="w-full px-3 py-2 bg-surface-secondary border border-primary rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

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
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
