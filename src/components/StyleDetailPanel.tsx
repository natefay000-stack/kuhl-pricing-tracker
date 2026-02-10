'use client';

import { useMemo } from 'react';
import { Product, SalesRecord, PricingRecord, CostRecord } from '@/types/product';
import { sortSeasons } from '@/lib/store';
import { X, TrendingUp, TrendingDown } from 'lucide-react';
import { formatCurrencyShort } from '@/utils/format';

interface StyleDetailPanelProps {
  styleNumber: string;
  products: Product[];
  sales: SalesRecord[];
  pricing: PricingRecord[];
  costs: CostRecord[];
  onClose: () => void;
}

export default function StyleDetailPanel({
  styleNumber,
  products,
  sales,
  pricing,
  costs,
  onClose,
}: StyleDetailPanelProps) {
  // Get style info
  const styleInfo = useMemo(() => {
    const product = products.find((p) => p.styleNumber === styleNumber);
    return product || null;
  }, [products, styleNumber]);

  // Get pricing by season
  const pricingBySeason = useMemo(() => {
    const stylePricing = pricing.filter((p) => p.styleNumber === styleNumber);
    const seasons = sortSeasons(stylePricing.map((p) => p.season));

    return seasons.map((season, index) => {
      const record = stylePricing.find((p) => p.season === season);
      const prevRecord = index > 0 ? stylePricing.find((p) => p.season === seasons[index - 1]) : null;

      let change: number | null = null;
      if (record && prevRecord && prevRecord.price > 0) {
        change = ((record.price - prevRecord.price) / prevRecord.price) * 100;
      }

      return {
        season,
        price: record?.price || 0,
        msrp: record?.msrp || 0,
        change,
      };
    });
  }, [pricing, styleNumber]);

  // Get sales by channel
  const salesByChannel = useMemo(() => {
    const styleSales = sales.filter((s) => s.styleNumber === styleNumber);
    const grouped = new Map<string, { units: number; revenue: number }>();

    styleSales.forEach((s) => {
      const channel = s.customerType || 'Other';
      const existing = grouped.get(channel);
      if (existing) {
        existing.units += s.unitsBooked || 0;
        existing.revenue += s.revenue || 0;
      } else {
        grouped.set(channel, {
          units: s.unitsBooked || 0,
          revenue: s.revenue || 0,
        });
      }
    });

    return Array.from(grouped.entries())
      .map(([channel, data]) => ({ channel, ...data }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [sales, styleNumber]);

  // Get sales by color
  const salesByColor = useMemo(() => {
    const styleSales = sales.filter((s) => s.styleNumber === styleNumber);
    const grouped = new Map<string, number>();
    let totalUnits = 0;

    styleSales.forEach((s) => {
      const color = s.color || 'Unknown';
      grouped.set(color, (grouped.get(color) || 0) + (s.unitsBooked || 0));
      totalUnits += s.unitsBooked || 0;
    });

    return Array.from(grouped.entries())
      .map(([color, units]) => ({
        color,
        units,
        percent: totalUnits > 0 ? (units / totalUnits) * 100 : 0,
      }))
      .sort((a, b) => b.units - a.units)
      .slice(0, 5);
  }, [sales, styleNumber]);

  // Get cost/margin info
  const costInfo = useMemo(() => {
    const styleCost = costs.find((c) => c.styleNumber === styleNumber);
    const latestPricing = pricingBySeason[pricingBySeason.length - 1];

    if (!styleCost || !latestPricing) return null;

    const margin = latestPricing.price > 0
      ? ((latestPricing.price - styleCost.landed) / latestPricing.price) * 100
      : 0;

    return {
      cost: styleCost.landed,
      wholesale: latestPricing.price,
      msrp: latestPricing.msrp,
      margin,
      factory: styleCost.factory,
      coo: styleCost.countryOfOrigin,
    };
  }, [costs, styleNumber, pricingBySeason]);

  const channelLabels: Record<string, string> = {
    WH: 'Wholesale',
    WD: 'Wholesale Direct',
    BB: 'Big Box/REI',
    PS: 'Pro Sales',
    EC: 'E-commerce',
    KI: 'KÜHL Internal',
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 animate-slide-up">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative bg-surface rounded-t-2xl shadow-2xl border-t border-border-primary max-h-[70vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-surface border-b border-border-primary px-6 py-4 flex items-center justify-between z-10">
          <div>
            <div className="flex items-center gap-3">
              <span className="font-mono font-bold text-xl text-text-primary bg-surface-tertiary px-3 py-1 rounded">
                {styleNumber}
              </span>
              <h3 className="font-display font-semibold text-xl text-text-primary">
                {styleInfo?.styleDesc || 'Unknown Style'}
              </h3>
            </div>
            <div className="flex items-center gap-4 mt-2 text-sm text-text-muted">
              {styleInfo?.divisionDesc && (
                <span>Division: <span className="text-text-secondary">{styleInfo.divisionDesc}</span></span>
              )}
              {styleInfo?.categoryDesc && (
                <span>Category: <span className="text-text-secondary">{styleInfo.categoryDesc}</span></span>
              )}
              {styleInfo?.designerName && (
                <span>Designer: <span className="text-text-secondary">{styleInfo.designerName}</span></span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-text-faint hover:text-text-secondary hover:bg-surface-tertiary rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 grid grid-cols-2 gap-6">
          {/* Pricing by Season */}
          <div className="bg-surface-secondary rounded-xl p-5">
            <h4 className="font-semibold text-text-primary mb-4">Pricing by Season</h4>
            <div className="space-y-3">
              {pricingBySeason.length > 0 ? (
                pricingBySeason.map((p, index) => (
                  <div key={p.season} className="flex items-center justify-between">
                    <span className="font-mono text-sm text-text-secondary">{p.season}:</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-medium text-text-primary">
                        ${p.price.toFixed(2)}
                      </span>
                      {p.change !== null && (
                        <span
                          className={`text-xs flex items-center gap-0.5 ${
                            p.change > 0 ? 'text-emerald-600' : 'text-red-600'
                          }`}
                        >
                          {p.change > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {p.change > 0 ? '+' : ''}{p.change.toFixed(0)}%
                        </span>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-text-faint">No pricing data available</p>
              )}
            </div>
          </div>

          {/* Sales by Channel */}
          <div className="bg-surface-secondary rounded-xl p-5">
            <h4 className="font-semibold text-text-primary mb-4">Sales by Channel</h4>
            <div className="space-y-3">
              {salesByChannel.length > 0 ? (
                salesByChannel.slice(0, 5).map((s) => (
                  <div key={s.channel} className="flex items-center justify-between">
                    <span className="text-sm text-text-secondary">
                      {channelLabels[s.channel] || s.channel}:
                    </span>
                    <div className="text-right">
                      <span className="font-mono text-sm text-text-primary">
                        {s.units.toLocaleString()} units
                      </span>
                      <span className="text-xs text-text-faint ml-2">
                        / {formatCurrencyShort(s.revenue)}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-text-faint">No sales data available</p>
              )}
            </div>
          </div>

          {/* Colors */}
          <div className="bg-surface-secondary rounded-xl p-5">
            <h4 className="font-semibold text-text-primary mb-4">Colors</h4>
            <div className="flex flex-wrap gap-2">
              {salesByColor.length > 0 ? (
                salesByColor.map((c) => (
                  <div
                    key={c.color}
                    className="bg-surface border border-border-primary rounded-lg px-3 py-2 text-sm"
                  >
                    <span className="font-mono font-medium text-text-primary">{c.color}</span>
                    <span className="text-text-faint ml-1">{c.percent.toFixed(0)}%</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-text-faint">No color data available</p>
              )}
            </div>
          </div>

          {/* Cost/Margin */}
          <div className="bg-surface-secondary rounded-xl p-5">
            <h4 className="font-semibold text-text-primary mb-4">Cost / Margin</h4>
            {costInfo ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-secondary">Landed Cost:</span>
                  <span className="font-mono font-medium text-text-primary">
                    ${costInfo.cost.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-secondary">Wholesale:</span>
                  <span className="font-mono font-medium text-text-primary">
                    ${costInfo.wholesale.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-secondary">Margin:</span>
                  <span
                    className={`font-mono font-bold px-2 py-0.5 rounded ${
                      costInfo.margin >= 50
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                        : costInfo.margin >= 40
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                        : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                    }`}
                  >
                    {costInfo.margin.toFixed(1)}%
                  </span>
                </div>
                {costInfo.factory && (
                  <div className="pt-2 border-t border-border-primary">
                    <span className="text-xs text-text-faint">
                      Factory: {costInfo.factory} ({costInfo.coo})
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-text-faint">No cost data available</p>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes slide-up {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }
        .animate-slide-up > div:last-child {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
