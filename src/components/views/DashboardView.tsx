'use client';

import { useState, useEffect } from 'react';
import { DollarSign, Package, TrendingUp, Layers, Users, Store, RefreshCw } from 'lucide-react';

interface DashboardViewProps {
  selectedSeason: string;
  onSeasonChange?: (season: string) => void;
}

interface SeasonSummary {
  products: number;
  sales: { revenue: number; units: number; styles: number; customers: number };
  costs: number;
  pricing: number;
}

interface CategoryData {
  category: string;
  revenue: number;
  units: number;
  revenuePercent: number;
}

interface GenderData {
  gender: string;
  revenue: number;
  units: number;
  revenuePercent: number;
}

interface ChannelData {
  channel: string;
  channelLabel: string;
  revenue: number;
  units: number;
  revenuePercent: number;
}

interface CustomerData {
  rank: number;
  customer: string;
  customerType: string;
  revenue: number;
  units: number;
}

function formatCurrency(value: number): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

function formatNumber(value: number): string {
  return value.toLocaleString();
}

// Skeleton loader component
function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl p-6 border border-gray-200 animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-24 mb-4"></div>
      <div className="h-8 bg-gray-200 rounded w-32"></div>
    </div>
  );
}

function SkeletonChart() {
  return (
    <div className="bg-white rounded-xl p-6 border border-gray-200 animate-pulse">
      <div className="h-5 bg-gray-200 rounded w-32 mb-6"></div>
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="flex items-center gap-4">
            <div className="h-4 bg-gray-200 rounded w-20"></div>
            <div className="flex-1 h-6 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded w-16"></div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DashboardView({ selectedSeason, onSeasonChange }: DashboardViewProps) {
  // Data state
  const [seasons, setSeasons] = useState<string[]>([]);
  const [summary, setSummary] = useState<SeasonSummary | null>(null);
  const [categories, setCategories] = useState<CategoryData[]>([]);
  const [genders, setGenders] = useState<GenderData[]>([]);
  const [channels, setChannels] = useState<ChannelData[]>([]);
  const [topCustomers, setTopCustomers] = useState<CustomerData[]>([]);

  // Loading states
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [loadingGenders, setLoadingGenders] = useState(true);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [loadingCustomers, setLoadingCustomers] = useState(true);

  const [error, setError] = useState<string | null>(null);

  // Load summary data (fast - runs first)
  useEffect(() => {
    async function loadSummary() {
      setLoadingSummary(true);
      try {
        const res = await fetch('/api/dashboard/summary');
        if (!res.ok) throw new Error('Failed to load summary');
        const data = await res.json();

        if (data.success) {
          setSeasons(data.seasons || []);

          // Get summary for selected season or first available
          const targetSeason = selectedSeason || data.seasons?.[0];
          if (targetSeason && data.seasonSummaries?.[targetSeason]) {
            setSummary(data.seasonSummaries[targetSeason]);
          } else if (data.totals) {
            // Fallback to totals
            setSummary({
              products: data.totals.products,
              sales: {
                revenue: data.totals.salesRevenue,
                units: data.totals.salesUnits,
                styles: 0,
                customers: 0,
              },
              costs: data.totals.costs,
              pricing: data.totals.pricing,
            });
          }
        }
      } catch (err) {
        console.error('Summary load error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        setLoadingSummary(false);
      }
    }
    loadSummary();
  }, [selectedSeason]);

  // Load breakdown data in parallel (after summary)
  useEffect(() => {
    const seasonParam = selectedSeason ? `?season=${selectedSeason}` : '';

    // Load categories
    async function loadCategories() {
      setLoadingCategories(true);
      try {
        const res = await fetch(`/api/dashboard/by-category${seasonParam}`);
        if (res.ok) {
          const data = await res.json();
          if (data.success) setCategories(data.categories || []);
        }
      } catch (err) {
        console.error('Categories load error:', err);
      } finally {
        setLoadingCategories(false);
      }
    }

    // Load genders
    async function loadGenders() {
      setLoadingGenders(true);
      try {
        const res = await fetch(`/api/dashboard/by-gender${seasonParam}`);
        if (res.ok) {
          const data = await res.json();
          if (data.success) setGenders(data.genders || []);
        }
      } catch (err) {
        console.error('Genders load error:', err);
      } finally {
        setLoadingGenders(false);
      }
    }

    // Load channels
    async function loadChannels() {
      setLoadingChannels(true);
      try {
        const res = await fetch(`/api/dashboard/by-channel${seasonParam}`);
        if (res.ok) {
          const data = await res.json();
          if (data.success) setChannels(data.channels || []);
        }
      } catch (err) {
        console.error('Channels load error:', err);
      } finally {
        setLoadingChannels(false);
      }
    }

    // Load top customers
    async function loadCustomers() {
      setLoadingCustomers(true);
      try {
        const res = await fetch(`/api/dashboard/top-customers${seasonParam}&limit=10`);
        if (res.ok) {
          const data = await res.json();
          if (data.success) setTopCustomers(data.customers || []);
        }
      } catch (err) {
        console.error('Customers load error:', err);
      } finally {
        setLoadingCustomers(false);
      }
    }

    // Fire all in parallel
    loadCategories();
    loadGenders();
    loadChannels();
    loadCustomers();
  }, [selectedSeason]);

  const GENDER_COLORS: Record<string, string> = {
    "Men's": '#2563eb',
    "Women's": '#9333ea',
    "Unisex": '#6b7280',
  };

  const CHANNEL_COLORS: Record<string, string> = {
    'WH': '#16a34a',
    'BB': '#dc2626',
    'WD': '#2563eb',
    'EC': '#9333ea',
    'PS': '#d97706',
    'KI': '#0891b2',
  };

  if (error) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700"
        >
          <RefreshCw className="w-4 h-4 inline mr-2" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Season Selector */}
      {seasons.length > 0 && (
        <div className="flex items-center gap-4">
          <label className="text-sm font-bold text-gray-600 uppercase">Season:</label>
          <select
            value={selectedSeason}
            onChange={(e) => onSeasonChange?.(e.target.value)}
            className="px-4 py-2 border-2 border-gray-200 rounded-lg bg-white"
          >
            <option value="">All Seasons</option>
            {seasons.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {loadingSummary ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : summary ? (
          <>
            <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-xl p-6 border border-emerald-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-emerald-700 uppercase tracking-wide">Revenue</span>
                <DollarSign className="w-5 h-5 text-emerald-600" />
              </div>
              <div className="text-3xl font-bold text-gray-900">
                {formatCurrency(summary.sales.revenue)}
              </div>
            </div>

            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 border border-blue-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-blue-700 uppercase tracking-wide">Units</span>
                <Package className="w-5 h-5 text-blue-600" />
              </div>
              <div className="text-3xl font-bold text-gray-900">
                {formatNumber(summary.sales.units)}
              </div>
            </div>

            <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-6 border border-purple-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-purple-700 uppercase tracking-wide">Styles</span>
                <Layers className="w-5 h-5 text-purple-600" />
              </div>
              <div className="text-3xl font-bold text-gray-900">
                {formatNumber(summary.products)}
              </div>
            </div>

            <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl p-6 border border-amber-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-amber-700 uppercase tracking-wide">Customers</span>
                <Users className="w-5 h-5 text-amber-600" />
              </div>
              <div className="text-3xl font-bold text-gray-900">
                {formatNumber(summary.sales.customers)}
              </div>
            </div>
          </>
        ) : (
          <div className="col-span-4 text-center py-8 text-gray-500">
            No data available. Import data to get started.
          </div>
        )}
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By Category */}
        {loadingCategories ? (
          <SkeletonChart />
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h3 className="text-lg font-bold text-gray-900">By Category</h3>
            </div>
            <div className="p-6 space-y-3">
              {categories.length === 0 ? (
                <p className="text-gray-500 text-center py-4">No data</p>
              ) : (
                categories.slice(0, 8).map((item) => (
                  <div key={item.category} className="flex items-center gap-4">
                    <span className="w-24 text-sm text-gray-700 truncate font-medium">
                      {item.category}
                    </span>
                    <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full"
                        style={{ width: `${Math.min(item.revenuePercent, 100)}%` }}
                      />
                    </div>
                    <span className="w-20 text-right text-sm font-mono text-gray-900">
                      {formatCurrency(item.revenue)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* By Gender */}
        {loadingGenders ? (
          <SkeletonChart />
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h3 className="text-lg font-bold text-gray-900">By Gender</h3>
            </div>
            <div className="p-6 space-y-3">
              {genders.length === 0 ? (
                <p className="text-gray-500 text-center py-4">No data</p>
              ) : (
                genders.map((item) => (
                  <div key={item.gender} className="flex items-center gap-4">
                    <span
                      className="w-24 text-sm font-medium px-2 py-1 rounded"
                      style={{
                        backgroundColor: `${GENDER_COLORS[item.gender] || '#6b7280'}20`,
                        color: GENDER_COLORS[item.gender] || '#6b7280',
                      }}
                    >
                      {item.gender}
                    </span>
                    <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(item.revenuePercent, 100)}%`,
                          backgroundColor: GENDER_COLORS[item.gender] || '#6b7280',
                        }}
                      />
                    </div>
                    <span className="w-12 text-right text-sm text-gray-500">
                      {item.revenuePercent.toFixed(0)}%
                    </span>
                    <span className="w-20 text-right text-sm font-mono text-gray-900">
                      {formatCurrency(item.revenue)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* By Channel */}
        {loadingChannels ? (
          <SkeletonChart />
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h3 className="text-lg font-bold text-gray-900">By Channel</h3>
            </div>
            <div className="p-6 space-y-3">
              {channels.length === 0 ? (
                <p className="text-gray-500 text-center py-4">No data</p>
              ) : (
                channels.map((item) => (
                  <div key={item.channel} className="flex items-center gap-4">
                    <span
                      className="w-28 text-sm font-medium px-2 py-1 rounded truncate"
                      style={{
                        backgroundColor: `${CHANNEL_COLORS[item.channel] || '#6b7280'}20`,
                        color: CHANNEL_COLORS[item.channel] || '#6b7280',
                      }}
                    >
                      {item.channelLabel}
                    </span>
                    <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(item.revenuePercent, 100)}%`,
                          backgroundColor: CHANNEL_COLORS[item.channel] || '#6b7280',
                        }}
                      />
                    </div>
                    <span className="w-12 text-right text-sm text-gray-500">
                      {item.revenuePercent.toFixed(0)}%
                    </span>
                    <span className="w-20 text-right text-sm font-mono text-gray-900">
                      {formatCurrency(item.revenue)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Top Customers */}
        {loadingCustomers ? (
          <SkeletonChart />
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h3 className="text-lg font-bold text-gray-900">Top 10 Customers</h3>
            </div>
            <div className="p-6">
              {topCustomers.length === 0 ? (
                <p className="text-gray-500 text-center py-4">No data</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b">
                      <th className="pb-2 font-medium">#</th>
                      <th className="pb-2 font-medium">Customer</th>
                      <th className="pb-2 font-medium text-right">Revenue</th>
                      <th className="pb-2 font-medium text-right">Units</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topCustomers.map((c) => (
                      <tr key={c.customer} className="border-b border-gray-100">
                        <td className="py-2 text-gray-400">{c.rank}</td>
                        <td className="py-2 font-medium text-gray-900 truncate max-w-[200px]">
                          {c.customer}
                        </td>
                        <td className="py-2 text-right font-mono">{formatCurrency(c.revenue)}</td>
                        <td className="py-2 text-right font-mono text-gray-600">
                          {formatNumber(c.units)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
