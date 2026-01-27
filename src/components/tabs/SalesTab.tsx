'use client';

import { useState, useMemo } from 'react';
import { SalesRecord, formatCurrency, formatPercent, CUSTOMER_TYPE_LABELS } from '@/types/product';
import { getSalesSummary, getSalesByDimension, filterSales, getUniqueSalesValues, sortSeasons, compareSeasons } from '@/lib/store';
import { Search, Filter, TrendingUp, Users, ShoppingCart, Banknote, BarChart3 } from 'lucide-react';

interface SalesTabProps {
  sales: SalesRecord[];
}

type ViewMode = 'overview' | 'by-style' | 'by-customer';

export default function SalesTab({ sales }: SalesTabProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  const [seasonFilter, setSeasonFilter] = useState<string>('');
  const [divisionFilter, setDivisionFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [channelFilter, setChannelFilter] = useState<string>('');
  const [search, setSearch] = useState('');

  // Get unique values for filters
  const seasons = useMemo(() => sortSeasons(getUniqueSalesValues(sales, 'season')), [sales]);
  const divisions = useMemo(() => getUniqueSalesValues(sales, 'divisionDesc'), [sales]);
  const categories = useMemo(() => getUniqueSalesValues(sales, 'categoryDesc'), [sales]);
  const channels = useMemo(() => getUniqueSalesValues(sales, 'customerType'), [sales]);

  // Filter sales
  const filteredSales = useMemo(() => {
    let filtered = filterSales(sales, {
      season: seasonFilter || undefined,
      division: divisionFilter || undefined,
      category: categoryFilter || undefined,
      customerType: channelFilter || undefined,
    });

    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(s =>
        s.styleNumber?.toLowerCase().includes(searchLower) ||
        s.styleDesc?.toLowerCase().includes(searchLower) ||
        s.customer?.toLowerCase().includes(searchLower)
      );
    }

    return filtered;
  }, [sales, seasonFilter, divisionFilter, categoryFilter, channelFilter, search]);

  // Aggregations
  const summary = useMemo(() => getSalesSummary(filteredSales), [filteredSales]);
  const bySeason = useMemo(() => {
    const data = getSalesByDimension(filteredSales, 'season');
    return data.sort((a, b) => compareSeasons(a.key, b.key));
  }, [filteredSales]);
  const byCategory = useMemo(() => getSalesByDimension(filteredSales, 'categoryDesc'), [filteredSales]);
  const byDivision = useMemo(() => getSalesByDimension(filteredSales, 'divisionDesc'), [filteredSales]);
  const byChannel = useMemo(() => getSalesByDimension(filteredSales, 'customerType'), [filteredSales]);
  const byStyle = useMemo(() => getSalesByDimension(filteredSales, 'styleNumber'), [filteredSales]);

  const clearFilters = () => {
    setSeasonFilter('');
    setDivisionFilter('');
    setCategoryFilter('');
    setChannelFilter('');
    setSearch('');
  };

  const hasFilters = seasonFilter || divisionFilter || categoryFilter || channelFilter || search;

  if (sales.length === 0) {
    return (
      <div className="text-center py-20">
        <div className="text-kuhl-stone/40 text-lg">No sales data available</div>
        <p className="text-kuhl-stone/30 mt-2">Sales data will appear here once loaded</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="stat-card">
          <div className="flex items-start justify-between mb-2">
            <span className="stat-label">Total Revenue</span>
            <div className="w-8 h-8 rounded-lg bg-kuhl-cyan/10 flex items-center justify-center">
              <Banknote className="w-4 h-4 text-kuhl-cyan" />
            </div>
          </div>
          <div className="stat-value">{formatCurrency(summary.totalRevenue)}</div>
        </div>
        <div className="stat-card">
          <div className="flex items-start justify-between mb-2">
            <span className="stat-label">Units Booked</span>
            <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center">
              <ShoppingCart className="w-4 h-4 text-violet-600" />
            </div>
          </div>
          <div className="stat-value">{summary.totalUnits.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="flex items-start justify-between mb-2">
            <span className="stat-label">Gross Profit</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            </div>
          </div>
          <div className="stat-value">{formatCurrency(summary.grossProfit)}</div>
        </div>
        <div className="stat-card">
          <div className="flex items-start justify-between mb-2">
            <span className="stat-label">Gross Margin</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-amber-600" />
            </div>
          </div>
          <div className="stat-value">{formatPercent(summary.grossMargin)}</div>
        </div>
        <div className="stat-card">
          <div className="flex items-start justify-between mb-2">
            <span className="stat-label">Customers</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <Users className="w-4 h-4 text-blue-600" />
            </div>
          </div>
          <div className="stat-value">{summary.uniqueCustomers.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="flex items-start justify-between mb-2">
            <span className="stat-label">Styles Sold</span>
            <div className="w-8 h-8 rounded-lg bg-kuhl-rust/10 flex items-center justify-center">
              <ShoppingCart className="w-4 h-4 text-kuhl-rust" />
            </div>
          </div>
          <div className="stat-value">{summary.uniqueStyles.toLocaleString()}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-4 items-center">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-kuhl-stone/40" />
            <input
              type="text"
              placeholder="Search styles or customers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-kuhl-sand/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-kuhl-cyan/30"
            />
          </div>

          <select
            value={seasonFilter}
            onChange={(e) => setSeasonFilter(e.target.value)}
            className="px-3 py-2 border border-kuhl-sand/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-kuhl-cyan/30"
          >
            <option value="">All Seasons</option>
            {seasons.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <select
            value={divisionFilter}
            onChange={(e) => setDivisionFilter(e.target.value)}
            className="px-3 py-2 border border-kuhl-sand/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-kuhl-cyan/30"
          >
            <option value="">All Divisions</option>
            {divisions.map(d => <option key={d} value={d}>{d}</option>)}
          </select>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 border border-kuhl-sand/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-kuhl-cyan/30"
          >
            <option value="">All Categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <select
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
            className="px-3 py-2 border border-kuhl-sand/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-kuhl-cyan/30"
          >
            <option value="">All Channels</option>
            {channels.map(c => (
              <option key={c} value={c}>{CUSTOMER_TYPE_LABELS[c] || c}</option>
            ))}
          </select>

          {hasFilters && (
            <button
              onClick={clearFilters}
              className="text-sm text-kuhl-cyan hover:text-kuhl-cyan/80"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* View Toggle */}
      <div className="flex items-center gap-1 bg-white border border-kuhl-sand/50 rounded-lg p-1 w-fit">
        <button
          onClick={() => setViewMode('overview')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            viewMode === 'overview'
              ? 'bg-kuhl-stone text-white'
              : 'text-kuhl-stone/60 hover:text-kuhl-stone hover:bg-kuhl-sand/20'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setViewMode('by-style')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            viewMode === 'by-style'
              ? 'bg-kuhl-stone text-white'
              : 'text-kuhl-stone/60 hover:text-kuhl-stone hover:bg-kuhl-sand/20'
          }`}
        >
          By Style
        </button>
        <button
          onClick={() => setViewMode('by-customer')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            viewMode === 'by-customer'
              ? 'bg-kuhl-stone text-white'
              : 'text-kuhl-stone/60 hover:text-kuhl-stone hover:bg-kuhl-sand/20'
          }`}
        >
          By Customer
        </button>
      </div>

      {/* Content based on view mode */}
      {viewMode === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* By Season */}
          <div className="card">
            <div className="card-header">
              <h3 className="font-display font-semibold">Sales by Season</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="pricing-table">
                <thead>
                  <tr>
                    <th className="w-24">Season</th>
                    <th className="text-right w-28">Units</th>
                    <th className="text-right w-32">Revenue</th>
                    <th className="text-right w-24">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {bySeason.map(row => (
                    <tr key={row.key}>
                      <td>
                        <span className="font-mono font-medium bg-kuhl-stone/5 px-2 py-1 rounded">{row.key}</span>
                      </td>
                      <td className="text-right font-mono">{row.units.toLocaleString()}</td>
                      <td className="text-right font-mono font-medium">{formatCurrency(row.revenue)}</td>
                      <td className="text-right">
                        <span className={`inline-block w-16 text-center px-2 py-1 rounded text-xs font-medium ${
                          row.margin >= 40 ? 'text-emerald-700 bg-emerald-50' : 'text-amber-700 bg-amber-50'
                        }`}>
                          {formatPercent(row.margin)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* By Channel */}
          <div className="card">
            <div className="card-header">
              <h3 className="font-display font-semibold">Sales by Channel</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="pricing-table">
                <thead>
                  <tr>
                    <th>Channel</th>
                    <th className="text-right w-28">Units</th>
                    <th className="text-right w-32">Revenue</th>
                    <th className="text-right w-36">% Total</th>
                  </tr>
                </thead>
                <tbody>
                  {byChannel.map(row => (
                    <tr key={row.key}>
                      <td className="font-medium">{CUSTOMER_TYPE_LABELS[row.key] || row.key}</td>
                      <td className="text-right font-mono">{row.units.toLocaleString()}</td>
                      <td className="text-right font-mono font-medium">{formatCurrency(row.revenue)}</td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-2 bg-kuhl-sand/30 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-kuhl-cyan rounded-full"
                              style={{ width: `${(row.revenue / summary.totalRevenue) * 100}%` }}
                            />
                          </div>
                          <span className="font-mono text-xs w-14 text-right">
                            {((row.revenue / summary.totalRevenue) * 100).toFixed(1)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* By Category */}
          <div className="card">
            <div className="card-header">
              <h3 className="font-display font-semibold">Sales by Category</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="pricing-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th className="text-right w-28">Units</th>
                    <th className="text-right w-32">Revenue</th>
                    <th className="text-right w-24">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {byCategory.slice(0, 10).map(row => (
                    <tr key={row.key}>
                      <td className="font-medium">{row.key || 'Unknown'}</td>
                      <td className="text-right font-mono">{row.units.toLocaleString()}</td>
                      <td className="text-right font-mono font-medium">{formatCurrency(row.revenue)}</td>
                      <td className="text-right">
                        <span className={`inline-block w-16 text-center px-2 py-1 rounded text-xs font-medium ${
                          row.margin >= 40 ? 'text-emerald-700 bg-emerald-50' : 'text-amber-700 bg-amber-50'
                        }`}>
                          {formatPercent(row.margin)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* By Division */}
          <div className="card">
            <div className="card-header">
              <h3 className="font-display font-semibold">Sales by Division</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="pricing-table">
                <thead>
                  <tr>
                    <th>Division</th>
                    <th className="text-right w-28">Units</th>
                    <th className="text-right w-32">Revenue</th>
                    <th className="text-right w-36">% Total</th>
                  </tr>
                </thead>
                <tbody>
                  {byDivision.map(row => (
                    <tr key={row.key}>
                      <td className="font-medium">{row.key || 'Unknown'}</td>
                      <td className="text-right font-mono">{row.units.toLocaleString()}</td>
                      <td className="text-right font-mono font-medium">{formatCurrency(row.revenue)}</td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-2 bg-kuhl-sand/30 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-kuhl-rust rounded-full"
                              style={{ width: `${(row.revenue / summary.totalRevenue) * 100}%` }}
                            />
                          </div>
                          <span className="font-mono text-xs w-14 text-right">
                            {((row.revenue / summary.totalRevenue) * 100).toFixed(1)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {viewMode === 'by-style' && (
        <div className="card">
          <div className="card-header">
            <h3 className="font-display font-semibold">Top Styles by Revenue</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="pricing-table">
              <thead>
                <tr>
                  <th className="w-24">Style</th>
                  <th className="text-right w-28">Units</th>
                  <th className="text-right w-32">Revenue</th>
                  <th className="text-right w-32">Profit</th>
                  <th className="text-right w-24">Margin</th>
                  <th className="text-right w-24">% Total</th>
                </tr>
              </thead>
              <tbody>
                {byStyle.slice(0, 50).map((row) => (
                  <tr key={row.key}>
                    <td>
                      <span className="font-mono font-medium bg-kuhl-stone/5 px-2 py-1 rounded">{row.key}</span>
                    </td>
                    <td className="text-right font-mono">{row.units.toLocaleString()}</td>
                    <td className="text-right font-mono font-medium">{formatCurrency(row.revenue)}</td>
                    <td className="text-right font-mono">{formatCurrency(row.profit)}</td>
                    <td className="text-right">
                      <span className={`inline-block w-16 text-center px-2 py-1 rounded text-xs font-medium ${
                        row.margin >= 40 ? 'text-emerald-700 bg-emerald-50' : 'text-amber-700 bg-amber-50'
                      }`}>
                        {formatPercent(row.margin)}
                      </span>
                    </td>
                    <td className="text-right font-mono text-kuhl-stone/60">
                      {((row.revenue / summary.totalRevenue) * 100).toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {byStyle.length > 50 && (
            <div className="px-4 py-3 bg-kuhl-sand/10 text-sm text-kuhl-stone/60 text-center">
              Showing top 50 of {byStyle.length.toLocaleString()} styles
            </div>
          )}
        </div>
      )}

      {viewMode === 'by-customer' && (
        <div className="card">
          <div className="card-header">
            <h3 className="font-display font-semibold">Sales by Customer</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="pricing-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th className="text-right w-24">Orders</th>
                  <th className="text-right w-28">Units</th>
                  <th className="text-right w-32">Revenue</th>
                  <th className="text-right w-28">Avg Order</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  // Group by customer
                  const byCustomer = new Map<string, { orders: number; units: number; revenue: number }>();
                  filteredSales.forEach(s => {
                    const key = s.customer || 'Unknown';
                    if (!byCustomer.has(key)) {
                      byCustomer.set(key, { orders: 0, units: 0, revenue: 0 });
                    }
                    const curr = byCustomer.get(key)!;
                    curr.orders++;
                    curr.units += s.unitsBooked || 0;
                    curr.revenue += s.revenue || 0;
                  });

                  return Array.from(byCustomer.entries())
                    .sort((a, b) => b[1].revenue - a[1].revenue)
                    .slice(0, 50)
                    .map(([customer, data]) => (
                      <tr key={customer}>
                        <td className="font-medium max-w-[400px] truncate">{customer}</td>
                        <td className="text-right font-mono">{data.orders.toLocaleString()}</td>
                        <td className="text-right font-mono">{data.units.toLocaleString()}</td>
                        <td className="text-right font-mono font-medium">{formatCurrency(data.revenue)}</td>
                        <td className="text-right font-mono text-kuhl-stone/60">
                          {formatCurrency(data.revenue / data.orders)}
                        </td>
                      </tr>
                    ));
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
