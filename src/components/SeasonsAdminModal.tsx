'use client';

import { useState, useEffect } from 'react';
import { X, Plus, Save, Trash2, Calendar, Check, Clock, Archive } from 'lucide-react';

interface SeasonMetadata {
  id: string | null;
  code: string;
  name: string;
  status: 'planning' | 'selling' | 'complete';
  hasSalesData: boolean;
  hasLineList: boolean;
  hasPricing: boolean;
  hasCosts: boolean;
  actualCounts: {
    sales: number;
    products: number;
    pricing: number;
    costs: number;
  };
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
}

interface SeasonsAdminModalProps {
  onClose: () => void;
  onSeasonsUpdated?: () => void;
}

const STATUS_OPTIONS = [
  { value: 'planning', label: 'Planning', icon: Clock, color: 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300' },
  { value: 'selling', label: 'Selling', icon: Check, color: 'bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300' },
  { value: 'complete', label: 'Complete', icon: Archive, color: 'bg-surface-tertiary text-text-secondary' },
];

function formatCount(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return count.toString();
}

export default function SeasonsAdminModal({ onClose, onSeasonsUpdated }: SeasonsAdminModalProps) {
  const [seasons, setSeasons] = useState<SeasonMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch seasons on mount
  useEffect(() => {
    fetchSeasons();
  }, []);

  const fetchSeasons = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/seasons');
      const data = await res.json();

      if (data.success) {
        setSeasons(data.seasons);
      }
    } catch (err) {
      setError('Failed to load seasons');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const saveSeason = async (season: SeasonMetadata) => {
    try {
      setSaving(season.code);
      setError(null);

      const res = await fetch('/api/seasons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(season),
      });

      const data = await res.json();

      if (data.success) {
        // Update local state
        setSeasons(prev => prev.map(s =>
          s.code === season.code ? { ...s, ...data.season } : s
        ));
        onSeasonsUpdated?.();
      } else {
        setError(data.error || 'Failed to save');
      }
    } catch (err) {
      setError('Failed to save season');
      console.error(err);
    } finally {
      setSaving(null);
    }
  };

  const updateSeason = (code: string, updates: Partial<SeasonMetadata>) => {
    setSeasons(prev => prev.map(s =>
      s.code === code ? { ...s, ...updates } : s
    ));
  };

  const getStatusBadge = (status: string) => {
    const opt = STATUS_OPTIONS.find(o => o.value === status) || STATUS_OPTIONS[0];
    const Icon = opt.icon;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-sm font-medium ${opt.color}`}>
        <Icon className="w-4 h-4" />
        {opt.label}
      </span>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border-primary flex items-center justify-between bg-surface-secondary">
          <div>
            <h2 className="text-2xl font-bold text-text-primary">Season Management</h2>
            <p className="text-sm text-text-muted mt-1">
              Configure season status and expected data availability
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-surface-tertiary rounded-lg transition-colors"
          >
            <X className="w-6 h-6 text-text-muted" />
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-600"></div>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-border-primary">
                  <th className="text-left py-3 px-2 text-sm font-bold text-text-secondary uppercase">Season</th>
                  <th className="text-left py-3 px-2 text-sm font-bold text-text-secondary uppercase">Status</th>
                  <th className="text-right py-3 px-2 text-sm font-bold text-text-secondary uppercase">Products</th>
                  <th className="text-right py-3 px-2 text-sm font-bold text-text-secondary uppercase">Pricing</th>
                  <th className="text-right py-3 px-2 text-sm font-bold text-text-secondary uppercase">Costs</th>
                  <th className="text-right py-3 px-2 text-sm font-bold text-text-secondary uppercase">Sales</th>
                  <th className="text-left py-3 px-2 text-sm font-bold text-text-secondary uppercase">Notes</th>
                  <th className="text-center py-3 px-2 text-sm font-bold text-text-secondary uppercase">Save</th>
                </tr>
              </thead>
              <tbody>
                {seasons.map((season) => (
                  <tr key={season.code} className="border-b border-border-secondary hover:bg-hover">
                    <td className="py-3 px-2">
                      <div>
                        <span className="font-mono font-bold text-lg text-text-primary">{season.code}</span>
                        <div className="text-sm text-text-muted">{season.name}</div>
                      </div>
                    </td>
                    <td className="py-3 px-2">
                      <select
                        value={season.status}
                        onChange={(e) => updateSeason(season.code, { status: e.target.value as SeasonMetadata['status'] })}
                        className="px-3 py-2 border border-border-primary rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-cyan-500 bg-surface"
                      >
                        {STATUS_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 px-2 text-right">
                      <span className={`font-mono text-sm ${season.actualCounts?.products > 0 ? 'text-green-600 font-semibold' : 'text-text-faint'}`}>
                        {season.actualCounts ? formatCount(season.actualCounts.products) : '0'}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-right">
                      <span className={`font-mono text-sm ${season.actualCounts?.pricing > 0 ? 'text-green-600 font-semibold' : 'text-text-faint'}`}>
                        {season.actualCounts ? formatCount(season.actualCounts.pricing) : '0'}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-right">
                      <span className={`font-mono text-sm ${season.actualCounts?.costs > 0 ? 'text-green-600 font-semibold' : 'text-text-faint'}`}>
                        {season.actualCounts ? formatCount(season.actualCounts.costs) : '0'}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-right">
                      <span className={`font-mono text-sm ${season.actualCounts?.sales > 0 ? 'text-green-600 font-semibold' : 'text-text-faint'}`}>
                        {season.actualCounts ? formatCount(season.actualCounts.sales) : '0'}
                      </span>
                    </td>
                    <td className="py-3 px-2">
                      <input
                        type="text"
                        value={season.notes || ''}
                        onChange={(e) => updateSeason(season.code, { notes: e.target.value })}
                        placeholder="Notes..."
                        className="w-full px-2 py-1 text-sm border border-border-primary rounded focus:outline-none focus:ring-2 focus:ring-cyan-500 bg-surface"
                      />
                    </td>
                    <td className="py-3 px-2 text-center">
                      <button
                        onClick={() => saveSeason(season)}
                        disabled={saving === season.code}
                        className="px-3 py-1.5 bg-cyan-600 text-white text-sm font-semibold rounded-lg hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {saving === season.code ? (
                          <span className="flex items-center gap-1">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          </span>
                        ) : (
                          <Save className="w-4 h-4" />
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border-primary bg-surface-secondary flex items-center justify-between">
          <div className="text-sm text-text-muted">
            <span className="font-medium">Status meanings:</span>{' '}
            <span className="text-blue-600">Planning</span> = No sales expected,{' '}
            <span className="text-green-600">Selling</span> = Active season,{' '}
            <span className="text-text-secondary">Complete</span> = Historical
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-surface-tertiary text-text-secondary font-semibold rounded-lg hover:bg-surface-tertiary/80 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
