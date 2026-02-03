'use client';

import React from 'react';

export type DataSource =
  | 'linelist'      // Line List / Products data
  | 'sales'         // Sales data
  | 'pricing'       // Price by Season data
  | 'landed'        // Landed Cost Sheet
  | 'calculated'    // Calculated/derived values
  | 'multiple';     // Multiple sources combined

interface SourceBadgeProps {
  source: DataSource | DataSource[];
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  inline?: boolean;
  className?: string;
}

const SOURCE_CONFIG = {
  linelist: {
    color: 'bg-blue-500',
    label: 'Line List',
    shortLabel: 'LL',
  },
  sales: {
    color: 'bg-purple-500',
    label: 'Sales',
    shortLabel: 'S',
  },
  pricing: {
    color: 'bg-orange-500',
    label: 'Price by Season',
    shortLabel: 'P',
  },
  landed: {
    color: 'bg-emerald-500',
    label: 'Landed Cost',
    shortLabel: 'LC',
  },
  calculated: {
    color: 'bg-gray-500',
    label: 'Calculated',
    shortLabel: 'C',
  },
  multiple: {
    color: 'bg-cyan-500',
    label: 'Multiple Sources',
    shortLabel: 'M',
  },
};

const SIZE_CONFIG = {
  sm: 'w-1.5 h-1.5',
  md: 'w-2 h-2',
  lg: 'w-2.5 h-2.5',
};

export default function SourceBadge({
  source,
  size = 'md',
  showLabel = false,
  inline = true,
  className = ''
}: SourceBadgeProps) {
  const sources = Array.isArray(source) ? source : [source];

  if (sources.length === 0) return null;

  // If multiple different sources, show as "multiple"
  const displaySource = sources.length > 1 ? 'multiple' : sources[0];
  const config = SOURCE_CONFIG[displaySource];

  const tooltipText = sources.length > 1
    ? `Sources: ${sources.map(s => SOURCE_CONFIG[s].label).join(', ')}`
    : config.label;

  if (showLabel) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold text-white ${config.color} ${className}`}
        title={tooltipText}
      >
        <span className={`${SIZE_CONFIG[size]} rounded-full bg-white opacity-50`}></span>
        {config.shortLabel}
      </span>
    );
  }

  return (
    <span
      className={`${inline ? 'inline-block' : 'block'} ${SIZE_CONFIG[size]} rounded-full ${config.color} ${className}`}
      title={tooltipText}
      style={{ flexShrink: 0 }}
    ></span>
  );
}

// Legend component to show all source types
interface SourceLegendProps {
  sources?: DataSource[];
  className?: string;
}

export function SourceLegend({ sources, className = '' }: SourceLegendProps) {
  const displaySources = sources || ['linelist', 'sales', 'pricing', 'landed', 'calculated'];

  return (
    <div className={`flex flex-wrap gap-3 items-center ${className}`}>
      <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Data Sources:</span>
      {displaySources.map((source) => {
        const config = SOURCE_CONFIG[source];
        return (
          <div key={source} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${config.color}`}></span>
            <span className="text-xs font-medium text-gray-600">{config.label}</span>
          </div>
        );
      })}
    </div>
  );
}
