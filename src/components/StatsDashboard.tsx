'use client';

import { Package, Layers, DollarSign, TrendingUp, Calendar, Tag, ShoppingCart, Users, Banknote } from 'lucide-react';
import { formatCurrency, formatPercent } from '@/types/product';
import { SalesSummary } from '@/lib/store';

interface StatsProps {
  totalProducts: number;
  totalStyles: number;
  avgCost: number;
  avgPrice: number;
  avgMsrp: number;
  avgMargin: number;
  divisions: number;
  seasons: number;
  salesSummary?: SalesSummary;
}

export default function StatsDashboard({ salesSummary, ...stats }: StatsProps) {
  // Calculate wholesale to MSRP margin
  const retailMargin = stats.avgMsrp > 0 ? ((stats.avgMsrp - stats.avgPrice) / stats.avgMsrp) * 100 : 0;

  const hasSales = salesSummary && salesSummary.totalRevenue > 0;

  const productCards = [
    {
      label: 'Total SKUs',
      value: stats.totalProducts.toLocaleString(),
      icon: Package,
      color: 'text-kuhl-sage',
      bgColor: 'bg-kuhl-sage/10',
    },
    {
      label: 'Unique Styles',
      value: stats.totalStyles.toLocaleString(),
      icon: Layers,
      color: 'text-kuhl-rust',
      bgColor: 'bg-kuhl-rust/10',
    },
    {
      label: 'Seasons',
      value: stats.seasons.toString(),
      icon: Calendar,
      color: 'text-kuhl-clay',
      bgColor: 'bg-kuhl-clay/10',
    },
    {
      label: 'Avg Wholesale',
      value: formatCurrency(stats.avgPrice),
      icon: Tag,
      color: 'text-kuhl-stone',
      bgColor: 'bg-kuhl-stone/10',
    },
    {
      label: 'Avg MSRP',
      value: formatCurrency(stats.avgMsrp),
      icon: DollarSign,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
    },
    {
      label: 'Retail Margin',
      value: formatPercent(retailMargin),
      icon: TrendingUp,
      color: retailMargin >= 50 ? 'text-emerald-600' : 'text-amber-600',
      bgColor: retailMargin >= 50 ? 'bg-emerald-50' : 'bg-amber-50',
    },
  ];

  const salesCards = hasSales ? [
    {
      label: 'Total Revenue',
      value: formatCurrency(salesSummary.totalRevenue),
      icon: Banknote,
      color: 'text-kuhl-cyan',
      bgColor: 'bg-kuhl-cyan/10',
    },
    {
      label: 'Units Booked',
      value: salesSummary.totalUnits.toLocaleString(),
      icon: ShoppingCart,
      color: 'text-violet-600',
      bgColor: 'bg-violet-50',
    },
    {
      label: 'Gross Profit',
      value: formatCurrency(salesSummary.grossProfit),
      icon: TrendingUp,
      color: salesSummary.grossMargin >= 40 ? 'text-emerald-600' : 'text-amber-600',
      bgColor: salesSummary.grossMargin >= 40 ? 'bg-emerald-50' : 'bg-amber-50',
    },
    {
      label: 'Gross Margin',
      value: formatPercent(salesSummary.grossMargin),
      icon: TrendingUp,
      color: salesSummary.grossMargin >= 40 ? 'text-emerald-600' : 'text-amber-600',
      bgColor: salesSummary.grossMargin >= 40 ? 'bg-emerald-50' : 'bg-amber-50',
    },
    {
      label: 'Customers',
      value: salesSummary.uniqueCustomers.toLocaleString(),
      icon: Users,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      label: 'Styles Sold',
      value: salesSummary.uniqueStyles.toLocaleString(),
      icon: Layers,
      color: 'text-kuhl-rust',
      bgColor: 'bg-kuhl-rust/10',
    },
  ] : [];

  return (
    <div className="space-y-4">
      {/* Product Stats */}
      <div>
        <h3 className="text-sm font-medium text-kuhl-stone/60 mb-3">Product Overview</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {productCards.map((card) => (
            <div key={card.label} className="stat-card">
              <div className="flex items-start justify-between mb-2">
                <span className="stat-label">{card.label}</span>
                <div className={`w-8 h-8 rounded-lg ${card.bgColor} flex items-center justify-center`}>
                  <card.icon className={`w-4 h-4 ${card.color}`} />
                </div>
              </div>
              <div className="stat-value">{card.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Sales Stats */}
      {hasSales && (
        <div>
          <h3 className="text-sm font-medium text-kuhl-stone/60 mb-3">Sales Performance</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {salesCards.map((card) => (
              <div key={card.label} className="stat-card">
                <div className="flex items-start justify-between mb-2">
                  <span className="stat-label">{card.label}</span>
                  <div className={`w-8 h-8 rounded-lg ${card.bgColor} flex items-center justify-center`}>
                    <card.icon className={`w-4 h-4 ${card.color}`} />
                  </div>
                </div>
                <div className="stat-value">{card.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
