'use client';

import { SeasonSummary, formatCurrency, formatPercent, getMarginClass } from '@/types/product';
import { SalesByDimension } from '@/lib/store';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface SeasonComparisonProps {
  summaries: SeasonSummary[];
  salesBySeason?: SalesByDimension[];
}

export default function SeasonComparison({ summaries, salesBySeason = [] }: SeasonComparisonProps) {
  if (summaries.length === 0) {
    return null;
  }

  // Create a map of sales by season for quick lookup
  const salesMap = new Map(salesBySeason.map(s => [s.key, s]));

  const getChangeIndicator = (current: number, previous: number | null) => {
    if (previous === null || previous === 0) return null;
    const change = ((current - previous) / previous) * 100;

    if (Math.abs(change) < 0.5) {
      return <Minus className="w-4 h-4 text-kuhl-stone/40" />;
    }
    if (change > 0) {
      return (
        <span className="flex items-center gap-1 text-emerald-600 text-xs">
          <TrendingUp className="w-3 h-3" />
          +{change.toFixed(1)}%
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 text-kuhl-rust text-xs">
        <TrendingDown className="w-3 h-3" />
        {change.toFixed(1)}%
      </span>
    );
  };

  const hasSales = salesBySeason.length > 0;

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="font-display font-semibold">Season Comparison</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="pricing-table">
          <thead>
            <tr>
              <th>Season</th>
              <th className="text-right">Products</th>
              <th className="text-right">Avg Wholesale</th>
              <th className="text-right">Avg MSRP</th>
              <th className="text-right">Retail Margin</th>
              {hasSales && (
                <>
                  <th className="text-right border-l border-kuhl-sand/30 pl-4">Units</th>
                  <th className="text-right">Revenue</th>
                  <th className="text-right">Profit</th>
                  <th className="text-right">Margin</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {summaries.map((summary, index) => {
              const prevSummary = summaries[index + 1] || null;
              const seasonSales = salesMap.get(summary.season);
              const prevSeasonSales = prevSummary ? salesMap.get(prevSummary.season) : null;

              return (
                <tr key={summary.season}>
                  <td>
                    <div>
                      <span className="font-mono font-medium bg-kuhl-stone/5 px-2 py-1 rounded">
                        {summary.season}
                      </span>
                      {summary.seasonDesc && (
                        <div className="text-xs text-kuhl-stone/50 mt-1">{summary.seasonDesc}</div>
                      )}
                    </div>
                  </td>
                  <td className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {summary.productCount.toLocaleString()}
                      {prevSummary && getChangeIndicator(summary.productCount, prevSummary.productCount)}
                    </div>
                  </td>
                  <td className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="font-mono font-medium">{formatCurrency(summary.avgPrice)}</span>
                      {prevSummary && getChangeIndicator(summary.avgPrice, prevSummary.avgPrice)}
                    </div>
                  </td>
                  <td className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="font-mono">{formatCurrency(summary.avgMsrp)}</span>
                      {prevSummary && getChangeIndicator(summary.avgMsrp, prevSummary.avgMsrp)}
                    </div>
                  </td>
                  <td className="text-right">
                    <span className={`px-2 py-1 rounded text-sm font-medium ${getMarginClass(summary.avgMargin)}`}>
                      {formatPercent(summary.avgMargin)}
                    </span>
                  </td>
                  {hasSales && (
                    <>
                      <td className="text-right border-l border-kuhl-sand/30 pl-4">
                        {seasonSales ? (
                          <div className="flex items-center justify-end gap-2">
                            {seasonSales.units.toLocaleString()}
                            {prevSeasonSales && getChangeIndicator(seasonSales.units, prevSeasonSales.units)}
                          </div>
                        ) : (
                          <span className="text-kuhl-stone/30">—</span>
                        )}
                      </td>
                      <td className="text-right">
                        {seasonSales ? (
                          <div className="flex items-center justify-end gap-2">
                            <span className="font-mono font-medium">{formatCurrency(seasonSales.revenue)}</span>
                            {prevSeasonSales && getChangeIndicator(seasonSales.revenue, prevSeasonSales.revenue)}
                          </div>
                        ) : (
                          <span className="text-kuhl-stone/30">—</span>
                        )}
                      </td>
                      <td className="text-right">
                        {seasonSales ? (
                          <span className="font-mono">{formatCurrency(seasonSales.profit)}</span>
                        ) : (
                          <span className="text-kuhl-stone/30">—</span>
                        )}
                      </td>
                      <td className="text-right">
                        {seasonSales ? (
                          <span className={`px-2 py-1 rounded text-sm font-medium ${getMarginClass(seasonSales.margin)}`}>
                            {formatPercent(seasonSales.margin)}
                          </span>
                        ) : (
                          <span className="text-kuhl-stone/30">—</span>
                        )}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
