'use client';

import { useState, useMemo } from 'react';
import { Product, PricingRecord, CostRecord, SalesRecord } from '@/types/product';
import {
  TrendingUp,
  TrendingDown,
  ArrowRight,
  ChevronRight,
  Layers,
  Percent,
  DollarSign,
} from 'lucide-react';

interface PricingViewProps {
  products: Product[];
  pricing: PricingRecord[];
  costs: CostRecord[];
  sales: SalesRecord[];
  selectedDivision: string;
  selectedCategory: string;
  onStyleClick: (styleNumber: string) => void;
}

type PriceSource = 'pricing' | 'products' | 'sales';

interface StylePricing {
  styleNumber: string;
  styleDesc: string;
  fromPrice: number | null;
  toPrice: number | null;
  fromMsrp: number | null;
  toMsrp: number | null;
  priceDelta: number | null;
  pricePercentChange: number | null;
  msrpDelta: number | null;
  msrpPercentChange: number | null;
  margin: number | null;
  category: string;
  division: string;
  fromSource: PriceSource | null;
  toSource: PriceSource | null;
}

function formatCurrency(value: number | null): string {
  if (value === null) return '—';
  return `$${value.toFixed(2)}`;
}

function formatDelta(value: number | null): string {
  if (value === null) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}$${value.toFixed(2)}`;
}

function formatPercent(value: number | null): string {
  if (value === null) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

function formatNumber(value: number): string {
  return value.toLocaleString();
}

function SourceIndicator({ source }: { source: PriceSource | null }) {
  if (!source) return null;

  switch (source) {
    case 'pricing':
      return (
        <span className="inline-block w-2 h-2 rounded-full bg-cyan-500 ml-1" title="From pricebyseason" />
      );
    case 'products':
      return (
        <span className="inline-block w-2 h-2 rounded-full border-2 border-gray-400 ml-1" title="From Line List" />
      );
    case 'sales':
      return (
        <span className="inline-block w-2 h-2 rotate-45 bg-amber-500 ml-1" title="From Sales" />
      );
    default:
      return null;
  }
}

export default function PricingView({
  products,
  pricing,
  costs,
  sales,
  selectedDivision,
  selectedCategory,
  onStyleClick,
}: PricingViewProps) {
  // Available seasons from ALL data sources
  const availableSeasons = useMemo(() => {
    const seasons = new Set<string>();
    (pricing || []).forEach(p => p.season && seasons.add(p.season));
    (products || []).forEach(p => p.season && seasons.add(p.season));
    (sales || []).forEach(s => s.season && seasons.add(s.season));
    return Array.from(seasons).sort();
  }, [pricing, products, sales]);

  // Default to last two seasons for comparison
  const [fromSeason, setFromSeason] = useState<string>(() => {
    return availableSeasons.length >= 2 ? availableSeasons[availableSeasons.length - 2] : '';
  });
  const [toSeason, setToSeason] = useState<string>(() => {
    return availableSeasons.length >= 1 ? availableSeasons[availableSeasons.length - 1] : '';
  });

  // Build style pricing comparison - aggregate from ALL sources
  const stylePricingData = useMemo(() => {
    // Helper to get pricing data for a style+season with source tracking
    // Priority: pricing table > products table > sales table
    interface PriceData {
      price: number | null;
      msrp: number | null;
      source: PriceSource | null;
      styleDesc: string;
      category: string;
      division: string;
    }

    const getPriceForStyleSeason = (styleNumber: string, season: string): PriceData => {
      // 1. Check pricing table first (highest priority)
      const pricingRecord = (pricing || []).find(p => p.styleNumber === styleNumber && p.season === season);
      if (pricingRecord && (pricingRecord.price > 0 || pricingRecord.msrp > 0)) {
        return {
          price: pricingRecord.price > 0 ? pricingRecord.price : null,
          msrp: pricingRecord.msrp > 0 ? pricingRecord.msrp : null,
          source: 'pricing',
          styleDesc: pricingRecord.styleDesc || '',
          category: '',
          division: '',
        };
      }

      // 2. Check products table (from Line List imports)
      const productRecord = (products || []).find(p => p.styleNumber === styleNumber && p.season === season);
      if (productRecord && (productRecord.price > 0 || productRecord.msrp > 0)) {
        return {
          price: productRecord.price > 0 ? productRecord.price : null,
          msrp: productRecord.msrp > 0 ? productRecord.msrp : null,
          source: 'products',
          styleDesc: productRecord.styleDesc || '',
          category: productRecord.categoryDesc || '',
          division: productRecord.divisionDesc || '',
        };
      }

      // 3. Check sales table (extract from sales records)
      const salesRecords = (sales || []).filter(s => s.styleNumber === styleNumber && s.season === season);
      if (salesRecords.length > 0) {
        // Get the first record with pricing info
        const withPricing = salesRecords.find(s => (s.wholesalePrice && s.wholesalePrice > 0) || (s.msrp && s.msrp > 0));
        if (withPricing) {
          return {
            price: withPricing.wholesalePrice && withPricing.wholesalePrice > 0 ? withPricing.wholesalePrice : null,
            msrp: withPricing.msrp && withPricing.msrp > 0 ? withPricing.msrp : null,
            source: 'sales',
            styleDesc: withPricing.styleDesc || '',
            category: withPricing.categoryDesc || '',
            division: withPricing.divisionDesc || '',
          };
        }
      }

      return { price: null, msrp: null, source: null, styleDesc: '', category: '', division: '' };
    };

    // Build cost lookup for margin calculation
    const costLookup = new Map<string, number>();
    (costs || []).forEach(c => {
      if (c.season === toSeason && c.landed > 0) {
        costLookup.set(c.styleNumber, c.landed);
      }
    });

    // Get all unique style numbers from ALL sources
    const allStyles = new Set<string>();
    (pricing || []).forEach(p => {
      if (p.season === fromSeason || p.season === toSeason) allStyles.add(p.styleNumber);
    });
    (products || []).forEach(p => {
      if (p.season === fromSeason || p.season === toSeason) allStyles.add(p.styleNumber);
    });
    (sales || []).forEach(s => {
      if (s.season === fromSeason || s.season === toSeason) allStyles.add(s.styleNumber);
    });

    // Build product info lookup for category/division
    const productInfo = new Map<string, { category: string; division: string; styleDesc: string }>();
    (products || []).forEach(p => {
      if (!productInfo.has(p.styleNumber)) {
        productInfo.set(p.styleNumber, {
          category: p.categoryDesc || '',
          division: p.divisionDesc || '',
          styleDesc: p.styleDesc || '',
        });
      }
    });
    // Also add from sales if not in products
    (sales || []).forEach(s => {
      if (!productInfo.has(s.styleNumber)) {
        productInfo.set(s.styleNumber, {
          category: s.categoryDesc || '',
          division: s.divisionDesc || '',
          styleDesc: s.styleDesc || '',
        });
      }
    });

    // Build comparison data
    const data: StylePricing[] = [];
    allStyles.forEach(styleNumber => {
      const fromData = getPriceForStyleSeason(styleNumber, fromSeason);
      const toData = getPriceForStyleSeason(styleNumber, toSeason);
      const info = productInfo.get(styleNumber);
      const cost = costLookup.get(styleNumber);

      const fromPrice = fromData.price;
      const toPrice = toData.price;
      const fromMsrp = fromData.msrp;
      const toMsrp = toData.msrp;

      let priceDelta: number | null = null;
      let pricePercentChange: number | null = null;
      let msrpDelta: number | null = null;
      let msrpPercentChange: number | null = null;

      if (fromPrice !== null && toPrice !== null) {
        priceDelta = toPrice - fromPrice;
        pricePercentChange = fromPrice > 0 ? (priceDelta / fromPrice) * 100 : null;
      }

      if (fromMsrp !== null && toMsrp !== null) {
        msrpDelta = toMsrp - fromMsrp;
        msrpPercentChange = fromMsrp > 0 ? (msrpDelta / fromMsrp) * 100 : null;
      }

      // Calculate margin: (wholesale - cost) / wholesale
      let margin: number | null = null;
      if (toPrice !== null && cost && toPrice > 0) {
        margin = ((toPrice - cost) / toPrice) * 100;
      }

      data.push({
        styleNumber,
        styleDesc: toData.styleDesc || fromData.styleDesc || info?.styleDesc || '',
        fromPrice,
        toPrice,
        fromMsrp,
        toMsrp,
        priceDelta,
        pricePercentChange,
        msrpDelta,
        msrpPercentChange,
        margin,
        category: toData.category || fromData.category || info?.category || '',
        division: toData.division || fromData.division || info?.division || '',
        fromSource: fromData.source,
        toSource: toData.source,
      });
    });

    // Filter by division and category
    return data.filter(d => {
      if (selectedDivision && d.division !== selectedDivision) return false;
      if (selectedCategory && d.category !== selectedCategory) return false;
      return true;
    });
  }, [pricing, costs, products, sales, fromSeason, toSeason, selectedDivision, selectedCategory]);

  // Calculate summary stats
  const stats = useMemo(() => {
    const totalStyles = stylePricingData.length;
    let priceIncreases = 0;
    let priceDecreases = 0;
    let totalIncrease = 0;
    let totalDecrease = 0;
    let marginSum = 0;
    let marginCount = 0;

    stylePricingData.forEach(s => {
      if (s.priceDelta !== null) {
        if (s.priceDelta > 0) {
          priceIncreases++;
          totalIncrease += s.priceDelta;
        } else if (s.priceDelta < 0) {
          priceDecreases++;
          totalDecrease += Math.abs(s.priceDelta);
        }
      }
      if (s.margin !== null) {
        marginSum += s.margin;
        marginCount++;
      }
    });

    const avgIncrease = priceIncreases > 0 ? totalIncrease / priceIncreases : 0;
    const avgDecrease = priceDecreases > 0 ? totalDecrease / priceDecreases : 0;
    const avgMargin = marginCount > 0 ? marginSum / marginCount : 0;

    return {
      totalStyles,
      priceIncreases,
      priceDecreases,
      avgIncrease,
      avgDecrease,
      avgMargin,
    };
  }, [stylePricingData]);

  // Price changes by category
  const changesByCategory = useMemo(() => {
    const grouped = new Map<string, { increases: number; decreases: number; unchanged: number }>();

    stylePricingData.forEach(s => {
      const cat = s.category || 'Unknown';
      if (!grouped.has(cat)) {
        grouped.set(cat, { increases: 0, decreases: 0, unchanged: 0 });
      }
      const entry = grouped.get(cat)!;
      if (s.priceDelta !== null) {
        if (s.priceDelta > 0) {
          entry.increases++;
        } else if (s.priceDelta < 0) {
          entry.decreases++;
        } else {
          entry.unchanged++;
        }
      } else {
        entry.unchanged++;
      }
    });

    return Array.from(grouped.entries())
      .map(([category, data]) => ({
        category,
        ...data,
        total: data.increases + data.decreases + data.unchanged,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [stylePricingData]);

  // Sort the data by price change
  const sortedData = useMemo(() => {
    return [...stylePricingData].sort((a, b) => {
      // Sort by absolute price delta descending (biggest changes first)
      const aDelta = Math.abs(a.priceDelta ?? 0);
      const bDelta = Math.abs(b.priceDelta ?? 0);
      return bDelta - aDelta;
    });
  }, [stylePricingData]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-4xl font-display font-bold text-gray-900">
            Pricing Analysis
          </h2>
          <p className="text-base text-gray-500 mt-2">
            Compare price changes between seasons and analyze margins
          </p>
        </div>

        {/* Season Compare Selector */}
        <div className="flex items-center gap-3 bg-white rounded-xl border-2 border-gray-200 p-4">
          <div>
            <label className="block text-sm font-bold text-gray-600 uppercase tracking-wide mb-1">
              From
            </label>
            <select
              value={fromSeason}
              onChange={(e) => setFromSeason(e.target.value)}
              className="px-3 py-2 bg-gray-50 border-2 border-gray-200 rounded-lg text-base font-mono font-semibold focus:outline-none focus:border-cyan-500"
            >
              <option value="">Select...</option>
              {availableSeasons.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <ArrowRight className="w-5 h-5 text-gray-400 mt-6" />
          <div>
            <label className="block text-sm font-bold text-gray-600 uppercase tracking-wide mb-1">
              To
            </label>
            <select
              value={toSeason}
              onChange={(e) => setToSeason(e.target.value)}
              className="px-3 py-2 bg-gray-50 border-2 border-gray-200 rounded-lg text-base font-mono font-semibold focus:outline-none focus:border-cyan-500"
            >
              <option value="">Select...</option>
              {availableSeasons.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-5 gap-4">
        <div className="bg-white rounded-xl border-2 border-gray-200 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <Layers className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold font-mono text-gray-900">
                {formatNumber(stats.totalStyles)}
              </p>
              <p className="text-sm text-gray-500 font-bold uppercase tracking-wide">
                Styles
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border-2 border-gray-200 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold font-mono text-emerald-600">
                {formatNumber(stats.priceIncreases)}
              </p>
              <p className="text-sm text-gray-500 font-bold uppercase tracking-wide">
                Price Up
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border-2 border-gray-200 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold font-mono text-emerald-600">
                +${stats.avgIncrease.toFixed(2)}
              </p>
              <p className="text-sm text-gray-500 font-bold uppercase tracking-wide">
                Avg Increase
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border-2 border-gray-200 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
              <TrendingDown className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold font-mono text-red-600">
                {formatNumber(stats.priceDecreases)}
              </p>
              <p className="text-sm text-gray-500 font-bold uppercase tracking-wide">
                Price Down
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border-2 border-gray-200 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <Percent className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold font-mono text-gray-900">
                {stats.avgMargin.toFixed(1)}%
              </p>
              <p className="text-sm text-gray-500 font-bold uppercase tracking-wide">
                Avg Margin
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* By Category Breakdown */}
      <div className="bg-white rounded-xl border-2 border-gray-200 shadow-sm">
        <div className="px-6 py-4 border-b-2 border-gray-200">
          <h3 className="text-xl font-bold text-gray-900">Price Changes by Category</h3>
        </div>
        <div className="p-6">
          <div className="space-y-4">
            {changesByCategory.map(({ category, increases, decreases, unchanged, total }) => {
              const incPct = (increases / total) * 100;
              const decPct = (decreases / total) * 100;
              const unchPct = (unchanged / total) * 100;
              return (
                <div key={category} className="flex items-center gap-4">
                  <div className="w-36 text-base text-gray-700 truncate font-medium">{category}</div>
                  <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden flex">
                    {incPct > 0 && (
                      <div
                        className="bg-emerald-500 h-full"
                        style={{ width: `${incPct}%` }}
                        title={`${increases} increases`}
                      />
                    )}
                    {unchPct > 0 && (
                      <div
                        className="bg-gray-300 h-full"
                        style={{ width: `${unchPct}%` }}
                        title={`${unchanged} unchanged`}
                      />
                    )}
                    {decPct > 0 && (
                      <div
                        className="bg-red-500 h-full"
                        style={{ width: `${decPct}%` }}
                        title={`${decreases} decreases`}
                      />
                    )}
                  </div>
                  <div className="w-32 text-right text-sm font-mono">
                    <span className="text-emerald-600">{increases}</span>
                    <span className="text-gray-400 mx-1">/</span>
                    <span className="text-gray-500">{unchanged}</span>
                    <span className="text-gray-400 mx-1">/</span>
                    <span className="text-red-600">{decreases}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100 flex gap-6 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-emerald-500 rounded-full" />
              <span className="text-gray-600">Price Increase</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-gray-300 rounded-full" />
              <span className="text-gray-600">Unchanged</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-500 rounded-full" />
              <span className="text-gray-600">Price Decrease</span>
            </div>
          </div>
        </div>
      </div>

      {/* Pricing Grid */}
      <div className="bg-white rounded-xl border-2 border-gray-200 shadow-sm">
        <div className="px-6 py-4 border-b-2 border-gray-300 bg-gray-100 flex items-center justify-between">
          <h3 className="text-xl font-bold text-gray-900">Pricing Grid</h3>
          <span className="text-sm text-gray-500 font-medium">
            {formatNumber(sortedData.length)} styles • Click row for details
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b-2 border-gray-300 text-left bg-gray-100">
                <th className="px-4 py-3 text-sm font-bold text-gray-700 uppercase tracking-wide border-r border-gray-200">
                  Style
                </th>
                <th className="px-4 py-3 text-sm font-bold text-gray-700 uppercase tracking-wide border-r border-gray-200">
                  Description
                </th>
                <th className="px-4 py-3 text-sm font-bold text-gray-700 uppercase tracking-wide text-right border-l border-gray-200">
                  {fromSeason || 'From'} WH
                </th>
                <th className="px-4 py-3 text-sm font-bold text-gray-700 uppercase tracking-wide text-right border-l border-gray-200">
                  {toSeason || 'To'} WH
                </th>
                <th className="px-4 py-3 text-sm font-bold text-gray-700 uppercase tracking-wide text-center border-l-2 border-gray-400">
                  WH Δ
                </th>
                <th className="px-4 py-3 text-sm font-bold text-gray-700 uppercase tracking-wide text-right border-l border-gray-200">
                  {fromSeason || 'From'} MSRP
                </th>
                <th className="px-4 py-3 text-sm font-bold text-gray-700 uppercase tracking-wide text-right border-l border-gray-200">
                  {toSeason || 'To'} MSRP
                </th>
                <th className="px-4 py-3 text-sm font-bold text-gray-700 uppercase tracking-wide text-center border-l-2 border-gray-400">
                  MSRP Δ
                </th>
                <th className="px-4 py-3 text-sm font-bold text-gray-700 uppercase tracking-wide text-right border-l-2 border-gray-400">
                  Margin
                </th>
                <th className="px-4 py-3 w-10 border-l border-gray-200"></th>
              </tr>
            </thead>
            <tbody>
              {sortedData.slice(0, 50).map((style, index) => (
                <tr
                  key={style.styleNumber}
                  onClick={() => onStyleClick(style.styleNumber)}
                  className={`border-b border-gray-200 cursor-pointer transition-colors ${
                    index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                  } hover:bg-cyan-50`}
                >
                  <td className="px-4 py-4 border-r border-gray-200">
                    <span className="font-mono text-lg font-bold text-gray-900">
                      {style.styleNumber}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-base text-gray-700 max-w-xs truncate border-r border-gray-200">
                    {style.styleDesc}
                  </td>
                  <td className="px-4 py-4 text-base font-mono text-gray-600 text-right border-l border-gray-200">
                    <span className="inline-flex items-center">
                      {formatCurrency(style.fromPrice)}
                      <SourceIndicator source={style.fromSource} />
                    </span>
                  </td>
                  <td className="px-4 py-4 text-base font-mono font-bold text-gray-900 text-right border-l border-gray-200">
                    <span className="inline-flex items-center">
                      {formatCurrency(style.toPrice)}
                      <SourceIndicator source={style.toSource} />
                    </span>
                  </td>
                  <td className="px-4 py-4 text-center border-l-2 border-gray-400">
                    {style.priceDelta !== null && style.priceDelta !== 0 ? (
                      <span
                        className={`text-base font-mono font-bold px-3 py-1 rounded ${
                          style.priceDelta > 0
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {formatDelta(style.priceDelta)}
                      </span>
                    ) : (
                      <span className="text-gray-400 text-base">—</span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-base font-mono text-gray-600 text-right border-l border-gray-200">
                    <span className="inline-flex items-center">
                      {formatCurrency(style.fromMsrp)}
                      <SourceIndicator source={style.fromSource} />
                    </span>
                  </td>
                  <td className="px-4 py-4 text-base font-mono font-bold text-gray-900 text-right border-l border-gray-200">
                    <span className="inline-flex items-center">
                      {formatCurrency(style.toMsrp)}
                      <SourceIndicator source={style.toSource} />
                    </span>
                  </td>
                  <td className="px-4 py-4 text-center border-l-2 border-gray-400">
                    {style.msrpDelta !== null && style.msrpDelta !== 0 ? (
                      <span
                        className={`text-base font-mono font-bold px-3 py-1 rounded ${
                          style.msrpDelta > 0
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {formatDelta(style.msrpDelta)}
                      </span>
                    ) : (
                      <span className="text-gray-400 text-base">—</span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-right border-l-2 border-gray-400">
                    {style.margin !== null ? (
                      <span
                        className={`text-base font-mono font-bold px-3 py-1 rounded ${
                          style.margin >= 50
                            ? 'bg-emerald-100 text-emerald-700'
                            : style.margin >= 40
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {style.margin.toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-gray-400 text-base">—</span>
                    )}
                  </td>
                  <td className="px-4 py-4 border-l border-gray-200">
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-4 border-t-2 border-gray-300 bg-gray-100 flex items-center justify-between">
          <div className="flex gap-6 text-sm">
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-cyan-500" />
              <span className="text-gray-600">Pricing Table</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full border-2 border-gray-400" />
              <span className="text-gray-600">Line List</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rotate-45 bg-amber-500" />
              <span className="text-gray-600">Sales Data</span>
            </div>
          </div>
          {sortedData.length > 50 && (
            <span className="text-base text-gray-600 font-medium">
              Showing 50 of {formatNumber(sortedData.length)} styles
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
