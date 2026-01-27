'use client';

import { useState } from 'react';
import { formatCurrency, formatPercent, CUSTOMER_TYPE_LABELS } from '@/types/product';
import { SalesByDimension } from '@/lib/store';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface SalesBreakdownProps {
  salesByCategory: SalesByDimension[];
  salesByChannel: SalesByDimension[];
  salesByDivision?: SalesByDimension[];
}

type ViewMode = 'category' | 'channel' | 'division';

export default function SalesBreakdown({
  salesByCategory,
  salesByChannel,
  salesByDivision = [],
}: SalesBreakdownProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('category');
  const [sortBy, setSortBy] = useState<'revenue' | 'units' | 'margin'>('revenue');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [showAll, setShowAll] = useState(false);

  const getDataForMode = (): SalesByDimension[] => {
    switch (viewMode) {
      case 'category':
        return salesByCategory;
      case 'channel':
        return salesByChannel.map(s => ({
          ...s,
          label: CUSTOMER_TYPE_LABELS[s.key] || s.key,
        }));
      case 'division':
        return salesByDivision;
      default:
        return [];
    }
  };

  const data = getDataForMode();

  if (data.length === 0) {
    return null;
  }

  // Sort data
  const sortedData = [...data].sort((a, b) => {
    const aVal = a[sortBy];
    const bVal = b[sortBy];
    return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
  });

  // Calculate totals
  const totals = data.reduce(
    (acc, item) => ({
      units: acc.units + item.units,
      revenue: acc.revenue + item.revenue,
      profit: acc.profit + item.profit,
    }),
    { units: 0, revenue: 0, profit: 0 }
  );

  const toggleSort = (field: 'revenue' | 'units' | 'margin') => {
    if (sortBy === field) {
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(field);
      setSortDir('desc');
    }
  };

  const SortIcon = ({ field }: { field: 'revenue' | 'units' | 'margin' }) => {
    if (sortBy !== field) return null;
    return sortDir === 'desc' ? (
      <ChevronDown className="w-3 h-3 inline ml-1" />
    ) : (
      <ChevronUp className="w-3 h-3 inline ml-1" />
    );
  };

  const displayData = showAll ? sortedData : sortedData.slice(0, 10);

  return (
    <div className="card">
      <div className="card-header flex items-center justify-between">
        <h3 className="font-display font-semibold">Sales Breakdown</h3>
        <div className="flex items-center gap-1 bg-kuhl-sand/20 rounded-lg p-1">
          <button
            onClick={() => setViewMode('category')}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
              viewMode === 'category'
                ? 'bg-white text-kuhl-stone shadow-sm'
                : 'text-kuhl-stone/60 hover:text-kuhl-stone'
            }`}
          >
            Category
          </button>
          <button
            onClick={() => setViewMode('channel')}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
              viewMode === 'channel'
                ? 'bg-white text-kuhl-stone shadow-sm'
                : 'text-kuhl-stone/60 hover:text-kuhl-stone'
            }`}
          >
            Channel
          </button>
          {salesByDivision.length > 0 && (
            <button
              onClick={() => setViewMode('division')}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                viewMode === 'division'
                  ? 'bg-white text-kuhl-stone shadow-sm'
                  : 'text-kuhl-stone/60 hover:text-kuhl-stone'
              }`}
            >
              Division
          </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="pricing-table">
          <thead>
            <tr>
              <th>{viewMode === 'category' ? 'Category' : viewMode === 'channel' ? 'Channel' : 'Division'}</th>
              <th
                className="text-right cursor-pointer hover:text-kuhl-cyan"
                onClick={() => toggleSort('units')}
              >
                Units <SortIcon field="units" />
              </th>
              <th
                className="text-right cursor-pointer hover:text-kuhl-cyan"
                onClick={() => toggleSort('revenue')}
              >
                Revenue <SortIcon field="revenue" />
              </th>
              <th className="text-right">Profit</th>
              <th
                className="text-right cursor-pointer hover:text-kuhl-cyan"
                onClick={() => toggleSort('margin')}
              >
                Margin <SortIcon field="margin" />
              </th>
              <th className="text-right">% of Total</th>
            </tr>
          </thead>
          <tbody>
            {displayData.map((item) => (
              <tr key={item.key}>
                <td className="font-medium">{item.label || item.key || 'Unknown'}</td>
                <td className="text-right font-mono">{item.units.toLocaleString()}</td>
                <td className="text-right font-mono font-medium">{formatCurrency(item.revenue)}</td>
                <td className="text-right font-mono">{formatCurrency(item.profit)}</td>
                <td className="text-right">
                  <span
                    className={`px-2 py-1 rounded text-sm font-medium ${
                      item.margin >= 50
                        ? 'text-emerald-700 bg-emerald-50'
                        : item.margin >= 40
                        ? 'text-amber-700 bg-amber-50'
                        : 'text-kuhl-rust bg-kuhl-rust/10'
                    }`}
                  >
                    {formatPercent(item.margin)}
                  </span>
                </td>
                <td className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-16 h-2 bg-kuhl-sand/30 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-kuhl-cyan rounded-full"
                        style={{ width: `${(item.revenue / totals.revenue) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm text-kuhl-stone/60 w-12 text-right">
                      {((item.revenue / totals.revenue) * 100).toFixed(1)}%
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold border-t-2 border-kuhl-sand">
              <td>Total</td>
              <td className="text-right font-mono">{totals.units.toLocaleString()}</td>
              <td className="text-right font-mono">{formatCurrency(totals.revenue)}</td>
              <td className="text-right font-mono">{formatCurrency(totals.profit)}</td>
              <td className="text-right">
                <span className="px-2 py-1 rounded text-sm font-medium text-kuhl-stone bg-kuhl-sand/30">
                  {formatPercent(totals.revenue > 0 ? (totals.profit / totals.revenue) * 100 : 0)}
                </span>
              </td>
              <td className="text-right text-kuhl-stone/60">100%</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {sortedData.length > 10 && (
        <div className="p-3 border-t border-kuhl-sand/30">
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-sm text-kuhl-cyan hover:text-kuhl-cyan/80 font-medium"
          >
            {showAll ? 'Show less' : `Show all ${sortedData.length} items`}
          </button>
        </div>
      )}
    </div>
  );
}
