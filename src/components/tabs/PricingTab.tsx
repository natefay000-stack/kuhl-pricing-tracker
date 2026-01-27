'use client';

import { useState, useMemo } from 'react';
import { PricingRecord, CostRecord, formatCurrency, formatPercent } from '@/types/product';
import { sortSeasons } from '@/lib/store';
import { TrendingUp, TrendingDown, Search, Filter, DollarSign } from 'lucide-react';

interface PricingTabProps {
  pricing: PricingRecord[];
  costs?: CostRecord[];
}

export default function PricingTab({ pricing, costs = [] }: PricingTabProps) {
  const [search, setSearch] = useState('');
  const [selectedSeason, setSelectedSeason] = useState<string>('');
  const [showCosts, setShowCosts] = useState(true);
  const [sortBy, setSortBy] = useState<'style' | 'price' | 'msrp' | 'change'>('style');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // Get unique seasons sorted (SP before FA within same year)
  const seasons = useMemo(() => {
    const uniqueSeasons = Array.from(new Set(pricing.map(p => p.season)));
    return sortSeasons(uniqueSeasons);
  }, [pricing]);

  // Build a lookup map for costs by style+season
  const costsByStyleSeason = useMemo(() => {
    const map = new Map<string, CostRecord>();
    costs.forEach(cost => {
      const key = `${cost.styleNumber}-${cost.season}`;
      // Keep the latest/most complete cost record for each style+season
      if (!map.has(key) || (cost.landed > 0 && (map.get(key)?.landed || 0) === 0)) {
        map.set(key, cost);
      }
    });
    return map;
  }, [costs]);

  // Group pricing by style to show across seasons
  const pricingByStyle = useMemo(() => {
    const grouped = new Map<string, Map<string, PricingRecord>>();

    pricing.forEach(record => {
      if (!grouped.has(record.styleNumber)) {
        grouped.set(record.styleNumber, new Map());
      }
      grouped.get(record.styleNumber)!.set(record.season, record);
    });

    return grouped;
  }, [pricing]);

  // Filter and sort styles
  const filteredStyles = useMemo(() => {
    let styles = Array.from(pricingByStyle.entries());

    // Search filter
    if (search) {
      const searchLower = search.toLowerCase();
      styles = styles.filter(([styleNumber, seasonMap]) => {
        const firstRecord = Array.from(seasonMap.values())[0];
        return (
          styleNumber.toLowerCase().includes(searchLower) ||
          firstRecord?.styleDesc?.toLowerCase().includes(searchLower)
        );
      });
    }

    // Season filter - only show styles that have the selected season
    if (selectedSeason) {
      styles = styles.filter(([_, seasonMap]) => seasonMap.has(selectedSeason));
    }

    // Sort
    styles.sort(([aStyle, aMap], [bStyle, bMap]) => {
      let aVal: string | number = aStyle;
      let bVal: string | number = bStyle;

      if (sortBy === 'price' || sortBy === 'msrp') {
        const aRecords = Array.from(aMap.values());
        const bRecords = Array.from(bMap.values());
        const aLatest = aRecords[aRecords.length - 1];
        const bLatest = bRecords[bRecords.length - 1];
        aVal = sortBy === 'price' ? aLatest?.price || 0 : aLatest?.msrp || 0;
        bVal = sortBy === 'price' ? bLatest?.price || 0 : bLatest?.msrp || 0;
      }

      if (sortDir === 'asc') {
        return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      }
      return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
    });

    return styles;
  }, [pricingByStyle, search, selectedSeason, sortBy, sortDir]);

  const toggleSort = (field: typeof sortBy) => {
    if (sortBy === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDir('asc');
    }
  };

  // Calculate price change between seasons
  const getPriceChange = (seasonMap: Map<string, PricingRecord>, season: string, field: 'price' | 'msrp') => {
    const seasonIndex = seasons.indexOf(season);
    if (seasonIndex <= 0) return null;

    const current = seasonMap.get(season);
    const previous = seasonMap.get(seasons[seasonIndex - 1]);

    if (!current || !previous) return null;

    const currentVal = current[field];
    const previousVal = previous[field];

    if (!previousVal) return null;

    return ((currentVal - previousVal) / previousVal) * 100;
  };

  if (pricing.length === 0) {
    return (
      <div className="text-center py-20">
        <div className="text-kuhl-stone/40 text-lg">No pricing data available</div>
        <p className="text-kuhl-stone/30 mt-2">Pricing data will appear here once loaded</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="stat-card">
          <div className="stat-label">Total Styles</div>
          <div className="stat-value">{pricingByStyle.size.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Seasons</div>
          <div className="stat-value">{seasons.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Price Records</div>
          <div className="stat-value">{pricing.length.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Cost Records</div>
          <div className="stat-value">{costs.length.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Latest Season</div>
          <div className="stat-value font-mono">{seasons[seasons.length - 1] || '—'}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-kuhl-stone/40" />
          <input
            type="text"
            placeholder="Search styles..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-kuhl-sand/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-kuhl-cyan/30"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-kuhl-stone/40" />
          <select
            value={selectedSeason}
            onChange={(e) => setSelectedSeason(e.target.value)}
            className="px-3 py-2 border border-kuhl-sand/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-kuhl-cyan/30"
          >
            <option value="">All Seasons</option>
            {seasons.map(season => (
              <option key={season} value={season}>{season}</option>
            ))}
          </select>
        </div>

        {costs.length > 0 && (
          <label className="flex items-center gap-2 text-sm text-kuhl-stone/70 cursor-pointer">
            <input
              type="checkbox"
              checked={showCosts}
              onChange={(e) => setShowCosts(e.target.checked)}
              className="rounded border-kuhl-sand/50 text-kuhl-sage focus:ring-kuhl-sage/50"
            />
            <DollarSign className="w-4 h-4" />
            Show Landed Costs
          </label>
        )}
      </div>

      {/* Pricing Grid */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-kuhl-sand/30 border-b-2 border-kuhl-sand/50">
                <th
                  className="text-left px-4 py-3 font-display font-semibold text-kuhl-stone/70 text-xs uppercase tracking-wider cursor-pointer hover:text-kuhl-cyan sticky left-0 bg-kuhl-sand/30 w-24"
                  onClick={() => toggleSort('style')}
                >
                  Style {sortBy === 'style' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                <th className="text-left px-4 py-3 font-display font-semibold text-kuhl-stone/70 text-xs uppercase tracking-wider min-w-[180px]">
                  Description
                </th>
                {seasons.map(season => (
                  <th key={season} className="text-center px-3 py-3 font-display font-semibold text-kuhl-stone/70 text-xs uppercase tracking-wider w-32">
                    <span className="font-mono bg-kuhl-stone/10 rounded px-2 py-1 inline-block text-kuhl-stone">
                      {season}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredStyles.slice(0, 100).map(([styleNumber, seasonMap]) => {
                const firstRecord = Array.from(seasonMap.values())[0];
                return (
                  <tr key={styleNumber} className="border-b border-kuhl-sand/20 hover:bg-kuhl-sand/10">
                    <td className="px-4 py-3 sticky left-0 bg-white">
                      <span className="font-mono font-medium bg-kuhl-stone/5 px-2 py-1 rounded">{styleNumber}</span>
                    </td>
                    <td className="px-4 py-3 text-kuhl-stone/70 max-w-[200px] truncate">
                      {firstRecord?.styleDesc || '—'}
                    </td>
                    {seasons.map(season => {
                      const record = seasonMap.get(season);
                      const priceChange = getPriceChange(seasonMap, season, 'price');
                      const costKey = `${styleNumber}-${season}`;
                      const costRecord = costsByStyleSeason.get(costKey);

                      return (
                        <td key={season} className="px-3 py-3 text-center">
                          {record ? (
                            <div className="space-y-0.5">
                              <div className="font-mono font-medium text-kuhl-stone">
                                {formatCurrency(record.price)}
                              </div>
                              <div className="text-xs text-kuhl-stone/50 font-mono">
                                {formatCurrency(record.msrp)}
                              </div>
                              {showCosts && costRecord && costRecord.landed > 0 && (
                                <div className="text-xs text-kuhl-cyan font-mono flex items-center justify-center gap-0.5">
                                  <DollarSign className="w-3 h-3" />
                                  {formatCurrency(costRecord.landed)}
                                </div>
                              )}
                              {priceChange !== null && priceChange !== 0 && (
                                <div className={`text-xs flex items-center justify-center gap-0.5 ${
                                  priceChange > 0 ? 'text-emerald-600' : 'text-kuhl-rust'
                                }`}>
                                  {priceChange > 0 ? (
                                    <TrendingUp className="w-3 h-3" />
                                  ) : (
                                    <TrendingDown className="w-3 h-3" />
                                  )}
                                  <span className="font-mono">{priceChange > 0 ? '+' : ''}{priceChange.toFixed(1)}%</span>
                                </div>
                              )}
                              {showCosts && costRecord && costRecord.landed > 0 && record.price > 0 && (
                                <div className="text-xs text-kuhl-sage/80 font-mono">
                                  {formatPercent(((record.price - costRecord.landed) / record.price) * 100)} margin
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-kuhl-stone/20">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredStyles.length > 100 && (
          <div className="px-4 py-3 bg-kuhl-sand/10 text-sm text-kuhl-stone/60 text-center">
            Showing 100 of {filteredStyles.length.toLocaleString()} styles
          </div>
        )}

        {filteredStyles.length === 0 && (
          <div className="px-4 py-8 text-center text-kuhl-stone/40">
            No styles match your search
          </div>
        )}
      </div>
    </div>
  );
}
