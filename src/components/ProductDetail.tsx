'use client';

import { X, DollarSign, Calendar, Tag, User, Layers, ShoppingCart, TrendingUp } from 'lucide-react';
import { Product, SalesRecord, PricingRecord, calculateMargins, formatCurrency, formatPercent, getMarginClass, CUSTOMER_TYPE_LABELS } from '@/types/product';
import { getSalesForStyle, getSalesSummary, getSalesByDimension, getPricingForStyle } from '@/lib/store';

interface ProductDetailProps {
  product: Product;
  sales?: SalesRecord[];
  pricing?: PricingRecord[];
  onClose: () => void;
}

export default function ProductDetail({ product, sales = [], pricing = [], onClose }: ProductDetailProps) {
  const margins = calculateMargins(product.cost, product.price, product.msrp);

  // Get sales for this specific style
  const styleSales = getSalesForStyle(sales, product.styleNumber);
  const styleSalesSummary = getSalesSummary(styleSales);
  const salesByChannel = getSalesByDimension(styleSales, 'customerType');

  // Get pricing history for this style
  const stylePricing = getPricingForStyle(pricing, product.styleNumber);

  const hasSales = styleSalesSummary.totalRevenue > 0;
  const hasPricingHistory = stylePricing.length > 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-kuhl-stone text-kuhl-cream px-6 py-4 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-lg font-bold">{product.styleNumber}</span>
              <span className="text-kuhl-sand">•</span>
              <span className="font-mono text-sm bg-kuhl-earth px-2 py-0.5 rounded">{product.color}</span>
              <span className="text-kuhl-sand">•</span>
              <span className="text-sm text-kuhl-sand">{product.currency || 'USD'}</span>
            </div>
            <h2 className="text-xl font-display font-bold mt-1">{product.styleDesc}</h2>
            <p className="text-kuhl-sand text-sm">{product.colorDesc}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-kuhl-earth rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Sales Performance - Show first if there's sales data */}
          {hasSales && (
            <section>
              <h3 className="font-display font-semibold text-kuhl-stone mb-4 flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-kuhl-cyan" />
                Sales Performance
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-kuhl-cyan/10 rounded-xl p-3">
                  <div className="text-xs text-kuhl-stone/60 mb-1">Revenue</div>
                  <div className="text-lg font-display font-bold text-kuhl-cyan">
                    {formatCurrency(styleSalesSummary.totalRevenue)}
                  </div>
                </div>
                <div className="bg-violet-50 rounded-xl p-3">
                  <div className="text-xs text-kuhl-stone/60 mb-1">Units Booked</div>
                  <div className="text-lg font-display font-bold text-violet-600">
                    {styleSalesSummary.totalUnits.toLocaleString()}
                  </div>
                </div>
                <div className="bg-emerald-50 rounded-xl p-3">
                  <div className="text-xs text-kuhl-stone/60 mb-1">Gross Profit</div>
                  <div className="text-lg font-display font-bold text-emerald-600">
                    {formatCurrency(styleSalesSummary.grossProfit)}
                  </div>
                </div>
                <div className="bg-amber-50 rounded-xl p-3">
                  <div className="text-xs text-kuhl-stone/60 mb-1">Margin</div>
                  <div className="text-lg font-display font-bold text-amber-600">
                    {formatPercent(styleSalesSummary.grossMargin)}
                  </div>
                </div>
              </div>

              {/* Sales by Channel */}
              {salesByChannel.length > 0 && (
                <div className="mt-4">
                  <div className="text-xs text-kuhl-stone/60 mb-2">Sales by Channel</div>
                  <div className="space-y-2">
                    {salesByChannel.slice(0, 5).map(channel => (
                      <div key={channel.key} className="flex items-center gap-3">
                        <div className="w-20 text-xs font-medium truncate">
                          {CUSTOMER_TYPE_LABELS[channel.key] || channel.key}
                        </div>
                        <div className="flex-1 h-2 bg-kuhl-sand/30 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-kuhl-cyan rounded-full"
                            style={{ width: `${(channel.revenue / styleSalesSummary.totalRevenue) * 100}%` }}
                          />
                        </div>
                        <div className="w-24 text-xs font-mono text-right">
                          {formatCurrency(channel.revenue)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Pricing Section */}
          <section>
            <h3 className="font-display font-semibold text-kuhl-stone mb-4 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-kuhl-sage" />
              Pricing
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-kuhl-cream rounded-xl p-4">
                <div className="text-sm text-kuhl-stone/60 mb-1">Wholesale</div>
                <div className="text-2xl font-display font-bold">{formatCurrency(product.price)}</div>
              </div>
              <div className="bg-kuhl-cream rounded-xl p-4">
                <div className="text-sm text-kuhl-stone/60 mb-1">MSRP</div>
                <div className="text-2xl font-display font-bold">{formatCurrency(product.msrp)}</div>
              </div>
            </div>

            {/* Margins */}
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div className="border border-kuhl-sand/30 rounded-lg p-3">
                <div className="text-xs text-kuhl-stone/60 mb-1">Retail Margin</div>
                <div className={`text-lg font-bold px-2 py-0.5 rounded inline-block ${getMarginClass(margins.wholesaleToMsrp)}`}>
                  {formatPercent(margins.wholesaleToMsrp)}
                </div>
                <div className="text-xs text-kuhl-stone/50 mt-1">{margins.wholesaleToMsrpMultiplier.toFixed(2)}x multiplier</div>
              </div>
              {margins.hasCost && (
                <div className="border border-kuhl-sand/30 rounded-lg p-3">
                  <div className="text-xs text-kuhl-stone/60 mb-1">Cost</div>
                  <div className="text-lg font-bold text-kuhl-stone">
                    {formatCurrency(product.cost)}
                  </div>
                  <div className="text-xs text-kuhl-stone/50 mt-1">
                    {margins.fullMultiplier?.toFixed(2)}x full markup
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Pricing History */}
          {hasPricingHistory && (
            <section>
              <h3 className="font-display font-semibold text-kuhl-stone mb-3 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-kuhl-sage" />
                Pricing History
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-kuhl-sand/30">
                      <th className="text-left py-2 text-kuhl-stone/60 font-medium">Season</th>
                      <th className="text-right py-2 text-kuhl-stone/60 font-medium">Wholesale</th>
                      <th className="text-right py-2 text-kuhl-stone/60 font-medium">MSRP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stylePricing.map((p, i) => (
                      <tr key={p.id} className="border-b border-kuhl-sand/20">
                        <td className="py-2 font-mono font-medium">{p.season}</td>
                        <td className="py-2 text-right font-mono">{formatCurrency(p.price)}</td>
                        <td className="py-2 text-right font-mono">{formatCurrency(p.msrp)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* CAD Pricing if available */}
          {(product.cadPrice || product.cadMsrp) && (
            <section>
              <h3 className="font-display font-semibold text-kuhl-stone mb-4 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-kuhl-rust" />
                CAD Pricing
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-kuhl-rust/5 rounded-xl p-4">
                  <div className="text-sm text-kuhl-stone/60 mb-1">Wholesale</div>
                  <div className="text-2xl font-display font-bold">
                    {formatCurrency(product.cadPrice, 'CAD')}
                  </div>
                </div>
                <div className="bg-kuhl-rust/5 rounded-xl p-4">
                  <div className="text-sm text-kuhl-stone/60 mb-1">MSRP</div>
                  <div className="text-2xl font-display font-bold">
                    {formatCurrency(product.cadMsrp, 'CAD')}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Season Info */}
          <section>
            <h3 className="font-display font-semibold text-kuhl-stone mb-3 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-kuhl-sage" />
              Season Info
            </h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-kuhl-stone/60">Season</dt>
                <dd className="font-mono font-medium bg-kuhl-stone/5 px-2 py-0.5 rounded">{product.season || '—'}</dd>
              </div>
              {product.seasonDesc && (
                <div className="flex justify-between">
                  <dt className="text-kuhl-stone/60">Description</dt>
                  <dd className="font-medium">{product.seasonDesc}</dd>
                </div>
              )}
              {product.styleSeason && (
                <div className="flex justify-between">
                  <dt className="text-kuhl-stone/60">Style Season</dt>
                  <dd className="font-medium">{product.styleSeason}</dd>
                </div>
              )}
              {product.colorSeason && (
                <div className="flex justify-between">
                  <dt className="text-kuhl-stone/60">Color Season</dt>
                  <dd className="font-medium">{product.colorSeason}</dd>
                </div>
              )}
              {product.sellingSeasons && (
                <div className="flex justify-between">
                  <dt className="text-kuhl-stone/60">Selling Seasons</dt>
                  <dd className="font-medium text-right max-w-[150px] truncate">{product.sellingSeasons}</dd>
                </div>
              )}
            </dl>
          </section>

          {/* Product Info */}
          {(product.divisionDesc || product.categoryDesc || product.productLineDesc) && (
            <section>
              <h3 className="font-display font-semibold text-kuhl-stone mb-3 flex items-center gap-2">
                <Layers className="w-5 h-5 text-kuhl-clay" />
                Classification
              </h3>
              <dl className="space-y-2 text-sm">
                {product.divisionDesc && (
                  <div className="flex justify-between">
                    <dt className="text-kuhl-stone/60">Division</dt>
                    <dd className="font-medium">{product.divisionDesc}</dd>
                  </div>
                )}
                {product.categoryDesc && (
                  <div className="flex justify-between">
                    <dt className="text-kuhl-stone/60">Category</dt>
                    <dd className="font-medium">{product.categoryDesc}</dd>
                  </div>
                )}
                {product.productLineDesc && (
                  <div className="flex justify-between">
                    <dt className="text-kuhl-stone/60">Product Line</dt>
                    <dd className="font-medium">{product.productLineDesc}</dd>
                  </div>
                )}
                {product.styleSegmentDesc && (
                  <div className="flex justify-between">
                    <dt className="text-kuhl-stone/60">Style Segment</dt>
                    <dd className="font-medium">{product.styleSegmentDesc}</dd>
                  </div>
                )}
                {product.labelDesc && (
                  <div className="flex justify-between">
                    <dt className="text-kuhl-stone/60">Label</dt>
                    <dd className="font-medium">{product.labelDesc}</dd>
                  </div>
                )}
              </dl>
            </section>
          )}

          {/* People */}
          {(product.designerName || product.techDesignerName) && (
            <section>
              <h3 className="font-display font-semibold text-kuhl-stone mb-3 flex items-center gap-2">
                <User className="w-5 h-5 text-kuhl-rust" />
                People
              </h3>
              <dl className="space-y-2 text-sm">
                {product.designerName && (
                  <div className="flex justify-between">
                    <dt className="text-kuhl-stone/60">Designer</dt>
                    <dd className="font-medium">{product.designerName}</dd>
                  </div>
                )}
                {product.techDesignerName && (
                  <div className="flex justify-between">
                    <dt className="text-kuhl-stone/60">Tech Designer</dt>
                    <dd className="font-medium">{product.techDesignerName}</dd>
                  </div>
                )}
              </dl>
            </section>
          )}

          {/* Notes */}
          {product.styleColorNotes && (
            <section>
              <h3 className="font-display font-semibold text-kuhl-stone mb-3 flex items-center gap-2">
                <Tag className="w-5 h-5 text-kuhl-sage" />
                Notes
              </h3>
              <p className="text-sm bg-kuhl-cream p-4 rounded-lg">{product.styleColorNotes}</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
