'use client';

import { Sparkles, RotateCcw } from 'lucide-react';

export interface ChannelMetric {
  units: number;
  revenue: number;
  avgNetPrice: number;
  listPriceRatio: number; // avgNetPrice / list (MSRP or wholesale)
}

interface MarginScenarioPanelProps {
  futureSeason: string;
  availableBasisSeasons: string[];
  basisSeason: string;
  onBasisChange: (s: string) => void;
  basisMetrics: Record<string, ChannelMetric>; // per-channel aggregate for basis season
  primaryChannels: string[];
  channelLabels: Record<string, string>;
  channelColors: Record<string, { bg: string; text: string; light: string }>;
  mix: Record<string, number>; // effective mix pct (0-100) per channel
  naturalMix: Record<string, number>;
  isOverridden: boolean;
  onMixChange: (mix: Record<string, number>) => void;
  onReset: () => void;
}

/**
 * Controls for projecting weighted margin on future (forecast) seasons.
 *
 * The user picks a basis season with real sales (e.g. 26SP) and the UI
 * takes its per-channel net-to-list ratios + channel mix as the assumption.
 * Sliders let you override the mix to explore "what if more goes to REI"
 * type scenarios. Parent re-computes weighted margins from the effective
 * mix on every change.
 */
export default function MarginScenarioPanel({
  futureSeason,
  availableBasisSeasons,
  basisSeason,
  onBasisChange,
  basisMetrics,
  primaryChannels,
  channelLabels,
  channelColors,
  mix,
  naturalMix,
  isOverridden,
  onMixChange,
  onReset,
}: MarginScenarioPanelProps) {
  const mixTotal = primaryChannels.reduce((sum, c) => sum + (mix[c] ?? 0), 0);

  const handleSlider = (channel: string, value: number) => {
    const next = { ...mix, [channel]: value };
    onMixChange(next);
  };

  return (
    <div className="mb-4 p-4 rounded-lg border border-cyan-500/40 bg-cyan-500/5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-semibold text-text-primary">
            Scenario · {futureSeason}
          </span>
          <span className="text-xs text-text-muted">
            (projected — no actual sales yet)
          </span>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-text-muted">
            Basis season:
            <select
              value={basisSeason}
              onChange={(e) => onBasisChange(e.target.value)}
              className="px-2 py-1 text-xs font-semibold rounded bg-surface border border-primary text-text-primary focus:outline-none focus:ring-1 focus:ring-cyan-500"
            >
              {availableBasisSeasons.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={onReset}
            disabled={!isOverridden}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-text-muted hover:text-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Reset sliders to basis season's natural mix"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset mix
          </button>
        </div>
      </div>

      {/* Sliders */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
        {primaryChannels.map((c) => {
          const m = basisMetrics[c];
          const pct = mix[c] ?? 0;
          const natural = naturalMix[c] ?? 0;
          const colors = channelColors[c];
          const label = channelLabels[c] ?? c;
          const disabled = !m || m.units === 0;
          return (
            <div key={c} className="flex items-center gap-2 py-1">
              <span
                className={`inline-block w-2.5 h-2.5 rounded ${colors?.bg ?? 'bg-gray-400'}`}
              />
              <span className="w-28 shrink-0 text-xs font-medium text-text-secondary">
                {label}
              </span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={pct}
                onChange={(e) => handleSlider(c, Number(e.target.value))}
                disabled={disabled}
                className="flex-1 accent-cyan-500 disabled:opacity-30"
              />
              <span className="w-12 text-right text-xs font-mono text-text-primary">
                {pct.toFixed(0)}%
              </span>
              <span className="w-24 text-right text-xs font-mono text-text-muted">
                {disabled
                  ? 'no data'
                  : `(${natural.toFixed(0)}% base)`}
              </span>
            </div>
          );
        })}
      </div>

      {/* Footer total */}
      <div className="mt-3 pt-3 border-t border-cyan-500/20 flex items-center justify-between text-xs">
        <span className="text-text-muted">
          Weighted margins below are projected using{' '}
          <strong className="text-text-secondary">{basisSeason}</strong> per-channel
          pricing ratios applied to{' '}
          <strong className="text-text-secondary">{futureSeason}</strong> prices + costs.
        </span>
        <span
          className={`font-mono font-semibold ${
            Math.abs(mixTotal - 100) < 0.5
              ? 'text-emerald-500'
              : 'text-amber-500'
          }`}
          title={
            Math.abs(mixTotal - 100) < 0.5
              ? 'Mix sums to 100%'
              : 'Mix does not sum to 100% — will be normalized during computation'
          }
        >
          Total: {mixTotal.toFixed(0)}%
        </span>
      </div>
    </div>
  );
}
