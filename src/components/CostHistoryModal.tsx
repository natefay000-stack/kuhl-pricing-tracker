'use client';

import { useEffect, useState } from 'react';
import { X, Clock } from 'lucide-react';

interface CostEditEntry {
  id: string;
  field: string;
  oldValue: number | null;
  newValue: number | null;
  editedBy: string;
  note: string | null;
  editedAt: string;
}

interface CostHistoryModalProps {
  costId: string;
  styleNumber: string;
  season: string;
  onClose: () => void;
}

const formatValue = (field: string, v: number | null | undefined): string => {
  if (v == null) return '—';
  if (field === 'margin') return `${(v * 100).toFixed(1)}%`;
  return `$${v.toFixed(2)}`;
};

const formatDate = (iso: string): string => {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
};

export default function CostHistoryModal({
  costId,
  styleNumber,
  season,
  onClose,
}: CostHistoryModalProps) {
  const [edits, setEdits] = useState<CostEditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/data/cost-history?costId=${encodeURIComponent(costId)}`);
        const result = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(result.error || `HTTP ${res.status}`);
        setEdits(result.edits ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [costId]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-surface rounded-xl shadow-2xl border border-primary max-w-2xl w-full mx-4 overflow-hidden max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between gap-3 p-5 border-b border-primary">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
              <Clock className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text-primary">Edit History</h2>
              <p className="text-sm text-text-muted">
                {styleNumber} · {season}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-sm text-red-400">Failed to load: {error}</p>
            </div>
          )}

          {!error && edits === null && (
            <p className="text-sm text-text-muted">Loading…</p>
          )}

          {edits && edits.length === 0 && (
            <p className="text-sm text-text-muted">No edits recorded for this cost yet.</p>
          )}

          {edits && edits.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-primary text-left text-xs uppercase tracking-wide text-text-muted">
                  <th className="py-2 pr-3 font-semibold">When</th>
                  <th className="py-2 pr-3 font-semibold">Who</th>
                  <th className="py-2 pr-3 font-semibold">Field</th>
                  <th className="py-2 pr-3 font-semibold">Change</th>
                  <th className="py-2 pr-3 font-semibold">Note</th>
                </tr>
              </thead>
              <tbody>
                {edits.map((e) => (
                  <tr key={e.id} className="border-b border-primary/50 last:border-0">
                    <td className="py-2 pr-3 text-text-secondary whitespace-nowrap">
                      {formatDate(e.editedAt)}
                    </td>
                    <td className="py-2 pr-3 text-text-primary font-medium whitespace-nowrap">
                      {e.editedBy}
                    </td>
                    <td className="py-2 pr-3 text-text-secondary capitalize">{e.field}</td>
                    <td className="py-2 pr-3 font-mono text-text-primary whitespace-nowrap">
                      {formatValue(e.field, e.oldValue)} → {formatValue(e.field, e.newValue)}
                    </td>
                    <td className="py-2 pr-3 text-text-muted">{e.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
