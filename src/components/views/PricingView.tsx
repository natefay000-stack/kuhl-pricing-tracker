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
  Download,
} from 'lucide-react';
import { exportToExcel } from '@/utils/exportData';

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
  costEstimated: boolean; // True if cost was estimated at 50% of wholesale
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
        <span className="text-orange-500 ml-1 text-sm font-bold" title="Source: pricebyseason">◆</span>
      );
    case 'products':
      return (
        <span className="text-blue-500 ml-1 text-sm" title="Source: Line List">○</span>
      );
    case 'sales':
      return (
        <span className="text-gray-500 ml-1 text-sm font-bold" title="Source: Sales">●</span>
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

  // Local filters
  const [filterDivision, setFilterDivision] = useState<string>(selectedDivision || '');
  const [filterCategory, setFilterCategory] = useState<string>(selectedCategory || '');

  // Get unique divisions and categories
  const divisions = useMemo(() => {
    const all = new Set<string>();
    products.forEach(p => p.divisionDesc && all.add(p.divisionDesc));
    return Array.from(all).sort();
  }, [products]);

  const categories = useMemo(() => {
    const all = new Set<string>();
    products.forEach(p => p.categoryDesc && all.add(p.categoryDesc));
    return Array.from(all).sort();
  }, [products]);

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

    // Build fast lookup maps ONCE (O(n) instead of O(n²))
    const pricingMap = new Map<string, PricingRecord>();
    const productsMap = new Map<string, Product>();
    const salesMap = new Map<string, SalesRecord>();

    (pricing || []).forEach(p => {
      const key = `${p.styleNumber}-${p.season}`;
      if (!pricingMap.has(key) && (p.price > 0 || p.msrp > 0)) {
        pricingMap.set(key, p);
      }
    });

    (products || []).forEach(p => {
      const key = `${p.styleNumber}-${p.season}`;
      if (!productsMap.has(key) && (p.price > 0 || p.msrp > 0)) {
        productsMap.set(key, p);
      }
    });

    (sales || []).forEach(s => {
      const key = `${s.styleNumber}-${s.season}`;
      if (!salesMap.has(key) && ((s.wholesalePrice && s.wholesalePrice > 0) || (s.msrp && s.msrp > 0))) {
        salesMap.set(key, s);
      }
    });

    const getPriceForStyleSeason = (styleNumber: string, season: string): PriceData => {
      const key = `${styleNumber}-${season}`;

      // 1. Check pricing table first (highest priority)
      const pricingRecord = pricingMap.get(key);
      if (pricingRecord) {
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
      const productRecord = productsMap.get(key);
      if (productRecord) {
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
      const salesRecord = salesMap.get(key);
      if (salesRecord) {
        return {
          price: salesRecord.wholesalePrice && salesRecord.wholesalePrice > 0 ? salesRecord.wholesalePrice : null,
          msrp: salesRecord.msrp && salesRecord.msrp > 0 ? salesRecord.msrp : null,
          source: 'sales',
          styleDesc: salesRecord.styleDesc || '',
          category: salesRecord.categoryDesc || '',
          division: salesRecord.divisionDesc || '',
        };
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

    // Get all unique style numbers from the selected seasons only (faster)
    const allStyles = new Set<string>();
    pricingMap.forEach((_, key) => {
      const season = key.split('-')[1];
      if (season === fromSeason || season === toSeason) {
        allStyles.add(key.split('-')[0]);
      }
    });
    productsMap.forEach((_, key) => {
      const season = key.split('-')[1];
      if (season === fromSeason || season === toSeason) {
        allStyles.add(key.split('-')[0]);
      }
    });
    salesMap.forEach((_, key) => {
      const season = key.split('-')[1];
      if (season === fromSeason || season === toSeason) {
        allStyles.add(key.split('-')[0]);
      }
    });

    // Build product info lookup for category/division (already in the maps above)
    const productInfo = new Map<string, { category: string; division: string; styleDesc: string }>();
    productsMap.forEach((p, key) => {
      const styleNumber = key.split('-')[0];
      if (!productInfo.has(styleNumber)) {
        productInfo.set(styleNumber, {
          category: p.categoryDesc || '',
          division: p.divisionDesc || '',
          styleDesc: p.styleDesc || '',
        });
      }
    });
    // Also add from sales if not in products
    salesMap.forEach((s, key) => {
      const styleNumber = key.split('-')[0];
      if (!productInfo.has(styleNumber)) {
        productInfo.set(styleNumber, {
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
      // If cost is missing, estimate at 50% of wholesale
      let margin: number | null = null;
      let costEstimated = false;

      if (toPrice !== null && toPrice > 0) {
        let finalCost = cost;

        // If no cost data, estimate at 50% of wholesale
        if (!finalCost) {
          finalCost = toPrice * 0.5;
          costEstimated = true;
        }

        margin = ((toPrice - finalCost) / toPrice) * 100;
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
        costEstimated,
      });
    });

    // Filter by division and category
    return data.filter(d => {
      if (filterDivision && d.division !== filterDivision) return false;
      if (filterCategory && d.category !== filterCategory) return false;
      return true;
    });
  }, [pricing, costs, products, sales, fromSeason, toSeason, filterDivision, filterCategory]);

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

  // Export pricing data
  const handleExport = () => {
    exportToExcel(
      topDeltaStyles.slice(0, 100).map(style => ({
        Style: style.styleNumber,
        Description: style.styleDesc,
        Category: style.categoryDesc,
        Division: style.divisionDesc,
        'From Season': fromSeason,
        'From Price': style.fromPrice?.toFixed(2) || 'N/A',
        'To Season': toSeason,
        'To Price': style.toPrice?.toFixed(2) || 'N/A',
        'Price Delta $': style.priceDelta?.toFixed(2) || 'N/A',
        'Delta %': style.deltaPercent?.toFixed(1) || 'N/A',
        Cost: style.cost?.toFixed(2) || 'N/A',
        'From Margin %': style.fromMargin?.toFixed(1) || 'N/A',
        'To Margin %': style.toMargin?.toFixed(1) || 'N/A',
      })),
      `pricing_analysis_${fromSeason}_to_${toSeason}`
    );
  };

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

        <div className="flex items-center gap-3">
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
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-5 py-3 bg-emerald-500 hover:bg-emerald-600 text-white text-base font-bold rounded-xl transition-colors shadow-lg"
        >
          <Download className="w-5 h-5" />
          Export
        </button>
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

      {/* Filters */}
      <div className="bg-white rounded-xl border-2 border-gray-200 p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-sm font-black text-gray-700 uppercase tracking-wide">Filters</span>
          <div className="flex-1 h-px bg-gray-200"></div>
        </div>
        <div className="flex flex-wrap gap-5 items-end">
          {/* Division Filter */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Division</label>
            <select
              value={filterDivision}
              onChange={(e) => setFilterDivision(e.target.value)}
              className="px-4 py-2.5 text-base border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 min-w-[180px] bg-white"
            >
              <option value="">All Divisions</option>
              {divisions.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          {/* Category Filter */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Category</label>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="px-4 py-2.5 text-base border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 min-w-[160px] bg-white"
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Clear Filters */}
          {(filterDivision || filterCategory) && (
            <button
              onClick={() => { setFilterDivision(''); setFilterCategory(''); }}
              className="flex items-center gap-2 px-4 py-2.5 text-base font-semibold text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Clear
            </button>
          )}
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
                      <div className="inline-flex items-center gap-1">
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
                        {style.costEstimated && (
                          <span
                            className="text-pink-500 text-xs"
                            title="Cost estimated at 50% of wholesale"
                          >
                            ▲
                          </span>
                        )}
                      </div>
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
        <div className="px-6 py-4 border-t-2 border-gray-300 bg-gray-100">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold text-gray-700 uppercase tracking-wide">MSRP/Price Source Legend</span>
            {sortedData.length > 50 && (
              <span className="text-base text-gray-600 font-medium">
                Showing 50 of {formatNumber(sortedData.length)} styles
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-6 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-orange-500 text-lg font-bold">◆</span>
              <span className="text-gray-700">pricebyseason (most accurate)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-blue-500 text-lg">○</span>
              <span className="text-gray-700">Line List</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-500 text-lg font-bold">●</span>
              <span className="text-gray-700">Sales (fallback)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-purple-500 text-lg font-bold">■</span>
              <span className="text-gray-700">Landed Sheet</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-pink-500 text-sm font-bold">▲</span>
              <span className="text-gray-700">Cost estimated (50% of wholesale)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
