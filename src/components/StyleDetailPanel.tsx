'use client';

import { useMemo, useState } from 'react';
import { Product, SalesRecord, PricingRecord, CostRecord } from '@/types/product';
import { sortSeasons } from '@/lib/store';
import { X, TrendingUp, TrendingDown, Clock, Edit3, History } from 'lucide-react';
import { formatCurrencyShort } from '@/utils/format';
import { buildCostFallbackLookup } from '@/utils/costFallback';
import CostEditModal from '@/components/CostEditModal';
import CostHistoryModal from '@/components/CostHistoryModal';
import PriceEditModal from '@/components/PriceEditModal';
import PricingHistoryModal from '@/components/PricingHistoryModal';

interface StyleDetailPanelProps {
  styleNumber: string;
  products: Product[];
  sales: SalesRecord[];
  pricing: PricingRecord[];
  costs: CostRecord[];
  onClose: () => void;
  onCostUpdated?: (updated: CostRecord) => void;
  onPricingUpdated?: (updated: PricingRecord) => void;
}

export default function StyleDetailPanel({
  styleNumber,
  products,
  sales,
  pricing,
  costs,
  onClose,
  onCostUpdated,
  onPricingUpdated,
}: StyleDetailPanelProps) {
  const [editing, setEditing] = useState(false);
  const [viewingHistory, setViewingHistory] = useState(false);
  const [editingPrice, setEditingPrice] = useState(false);
  const [viewingPriceHistory, setViewingPriceHistory] = useState(false);
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

  // Most recent Pricing row for this style — what the Edit Price button targets.
  const latestPricingRecord = useMemo(() => {
    const stylePricing = pricing.filter((p) => p.styleNumber === styleNumber);
    if (stylePricing.length === 0) return null;
    const seasons = sortSeasons(stylePricing.map((p) => p.season));
    const latest = seasons[seasons.length - 1];
    return stylePricing.find((p) => p.season === latest) ?? null;
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

  // Get cost/margin info — uses prior-season fallback when current season has no cost
  const costInfo = useMemo(() => {
    const latestPricing = pricingBySeason[pricingBySeason.length - 1];
    if (!latestPricing) return null;

    // First try exact match on the latest pricing season
    let styleCost = costs.find(
      (c) => c.styleNumber === styleNumber && c.season === latestPricing.season && c.landed > 0,
    );
    let fallbackSeason: string | undefined;

    // Otherwise try any cost record for this style
    if (!styleCost) {
      styleCost = costs.find((c) => c.styleNumber === styleNumber && c.landed > 0);
    }

    // If still nothing, use the fallback lookup for prior-season cost
    let landedCost = styleCost?.landed ?? 0;
    if (landedCost <= 0) {
      const fallbackLookup = buildCostFallbackLookup(
        costs,
        products.filter(p => p.season && p.cost > 0).map(p => ({
          styleNumber: p.styleNumber,
          season: p.season,
          cost: p.cost,
        })),
      );
      const result = fallbackLookup.getCostWithFallback(styleNumber, latestPricing.season);
      if (result.cost > 0) {
        landedCost = result.cost;
        if (result.source === 'fallback') fallbackSeason = result.fallbackSeason;
      }
    }

    if (landedCost <= 0) return null;

    const margin = latestPricing.price > 0
      ? ((latestPricing.price - landedCost) / latestPricing.price) * 100
      : 0;

    return {
      cost: landedCost,
      wholesale: latestPricing.price,
      msrp: latestPricing.msrp,
      margin,
      factory: styleCost?.factory,
      coo: styleCost?.countryOfOrigin,
      fallbackSeason,
      // The actual CostRecord row used (only set when no fallback); this is
      // what the Edit button targets by id.
      costRecord: fallbackSeason ? null : (styleCost ?? null),
    };
  }, [costs, products, styleNumber, pricingBySeason]);

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
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-semibold text-text-primary">Pricing by Season</h4>
              {latestPricingRecord && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setEditingPrice(true)}
                    title={`Edit wholesale / MSRP (${latestPricingRecord.season})`}
                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-emerald-400 hover:bg-emerald-500/10 rounded transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    Edit
                  </button>
                  <button
                    onClick={() => setViewingPriceHistory(true)}
                    title="View price edit history"
                    className="p-1 text-text-muted hover:text-amber-400 hover:bg-amber-500/10 rounded transition-colors"
                    aria-label="View price edit history"
                  >
                    <History className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
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
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-semibold text-text-primary">Cost / Margin</h4>
              {costInfo?.costRecord && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setEditing(true)}
                    title="Edit landed / margin"
                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-cyan-400 hover:bg-cyan-500/10 rounded transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    Edit
                  </button>
                  <button
                    onClick={() => setViewingHistory(true)}
                    title="View edit history"
                    className="p-1 text-text-muted hover:text-amber-400 hover:bg-amber-500/10 rounded transition-colors"
                    aria-label="View edit history"
                  >
                    <History className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
            {costInfo ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-secondary">Landed Cost:</span>
                  <span className="font-mono font-medium text-text-primary inline-flex items-center gap-1">
                    ${costInfo.cost.toFixed(2)}
                    {costInfo.fallbackSeason && (
                      <span
                        className="inline-flex items-center"
                        title={`Cost from prior season: ${costInfo.fallbackSeason}`}
                      >
                        <Clock className="w-3.5 h-3.5 text-amber-500" />
                      </span>
                    )}
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

      {editing && costInfo?.costRecord && (
        <CostEditModal
          cost={costInfo.costRecord}
          onClose={() => setEditing(false)}
          onSaved={(updated) => {
            onCostUpdated?.(updated);
            setEditing(false);
          }}
        />
      )}
      {viewingHistory && costInfo?.costRecord && (
        <CostHistoryModal
          costId={costInfo.costRecord.id}
          styleNumber={costInfo.costRecord.styleNumber}
          season={costInfo.costRecord.season}
          onClose={() => setViewingHistory(false)}
        />
      )}

      {editingPrice && latestPricingRecord && (
        <PriceEditModal
          pricing={latestPricingRecord}
          onClose={() => setEditingPrice(false)}
          onSaved={(updated) => {
            onPricingUpdated?.(updated);
            setEditingPrice(false);
          }}
        />
      )}
      {viewingPriceHistory && latestPricingRecord && (
        <PricingHistoryModal
          pricingId={latestPricingRecord.id}
          styleNumber={latestPricingRecord.styleNumber}
          season={latestPricingRecord.season}
          onClose={() => setViewingPriceHistory(false)}
        />
      )}
    </div>
  );
}
