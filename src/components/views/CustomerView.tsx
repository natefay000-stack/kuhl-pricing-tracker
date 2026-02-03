'use client';

import React, { useState, useMemo } from 'react';
import { Product, SalesRecord, normalizeCategory } from '@/types/product';
import { sortSeasons } from '@/lib/store';
import { Search, Download, ChevronRight, Users } from 'lucide-react';
import { exportToExcel } from '@/utils/exportData';

interface CustomerViewProps {
  products: Product[];
  sales: SalesRecord[];
  onStyleClick: (styleNumber: string) => void;
}

type CustomerMetrics = {
  customer: string;
  customerType: string;
  revenue: number;
  units: number;
  styles: Set<string>;
  orders: number;
  margin: number | null;
};

export default function CustomerView({
  products,
  sales,
  onStyleClick,
}: CustomerViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSeason, setSelectedSeason] = useState<string>('');
  const [selectedCustomerType, setSelectedCustomerType] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedGender, setSelectedGender] = useState<string>('');
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'category' | 'gender' | 'color' | 'style' | 'trend' | 'margin'>('category');
  const [styleSearchQuery, setStyleSearchQuery] = useState('');

  // Get available seasons
  const allSeasons = useMemo(() => {
    const seasonSet = new Set<string>();
    sales.forEach((s) => s.season && seasonSet.add(s.season));
    return sortSeasons(Array.from(seasonSet)).filter((s) => /^(24|25|26|27)/.test(s));
  }, [sales]);

  // Default to most recent season
  const activeSeason = selectedSeason || allSeasons[allSeasons.length - 1] || '';

  // Get unique customer types
  const customerTypes = useMemo(() => {
    const types = new Set<string>();
    sales.forEach((s) => s.customerType && types.add(s.customerType));
    return Array.from(types).sort();
  }, [sales]);

  // Get categories
  const categories = useMemo(() => {
    const cats = new Set<string>();
    products.forEach((p) => p.categoryDesc && cats.add(normalizeCategory(p.categoryDesc)));
    return Array.from(cats).sort();
  }, [products]);

  // Gender detection
  const getGenderFromDivision = (divisionDesc: string): 'Men' | 'Women' | 'Unisex' => {
    if (!divisionDesc) return 'Unisex';
    const lower = divisionDesc.toLowerCase();
    if (lower.includes('women') || lower.includes('woman')) return 'Women';
    if (lower.includes('men') && !lower.includes('women')) return 'Men';
    return 'Unisex';
  };

  // Calculate customer metrics
  const customerMetrics = useMemo(() => {
    const metricsMap = new Map<string, CustomerMetrics>();

    sales.forEach((sale) => {
      if (sale.season !== activeSeason) return;
      if (selectedCustomerType && sale.customerType !== selectedCustomerType) return;
      if (selectedCategory) {
        const saleCategory = normalizeCategory(sale.categoryDesc);
        if (saleCategory !== selectedCategory) return;
      }
      if (selectedGender) {
        const gender = getGenderFromDivision(sale.divisionDesc || '');
        if (gender !== selectedGender) return;
      }

      const customer = sale.customer || 'Unknown';

      if (!metricsMap.has(customer)) {
        metricsMap.set(customer, {
          customer,
          customerType: sale.customerType || '',
          revenue: 0,
          units: 0,
          styles: new Set(),
          orders: 0,
          margin: null,
        });
      }

      const metrics = metricsMap.get(customer)!;
      metrics.revenue += sale.revenue || 0;
      metrics.units += sale.unitsBooked || 0;
      if (sale.styleNumber) metrics.styles.add(sale.styleNumber);
      metrics.orders += 1;
    });

    return Array.from(metricsMap.values()).sort((a, b) => b.revenue - a.revenue);
  }, [sales, activeSeason, selectedCustomerType, selectedCategory, selectedGender]);

  // Filter by search
  const filteredCustomers = useMemo(() => {
    if (!searchQuery) return customerMetrics;
    const query = searchQuery.toLowerCase();
    return customerMetrics.filter((c) => c.customer.toLowerCase().includes(query));
  }, [customerMetrics, searchQuery]);

  // Total stats
  const totalStats = useMemo(() => {
    const total = {
      revenue: 0,
      customers: filteredCustomers.length,
      units: 0,
      styles: new Set<string>(),
    };

    filteredCustomers.forEach((c) => {
      total.revenue += c.revenue;
      total.units += c.units;
      c.styles.forEach((s) => total.styles.add(s));
    });

    return {
      revenue: total.revenue,
      customers: total.customers,
      avgOrderValue: total.customers > 0 ? total.revenue / total.customers : 0,
      totalStyles: total.styles.size,
      topCustomerRevenue: filteredCustomers[0]?.revenue || 0,
    };
  }, [filteredCustomers]);

  // Format currency
  const formatCurrency = (val: number): string => {
    if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `$${(val / 1000).toFixed(0)}K`;
    return `$${val.toLocaleString()}`;
  };

  // Format number
  const formatNumber = (val: number): string => {
    if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `${(val / 1000).toFixed(1)}K`;
    return val.toLocaleString();
  };

  // Get customer type color
  const getCustomerTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      BB: 'bg-blue-100 text-blue-700',
      WH: 'bg-teal-100 text-teal-700',
      EC: 'bg-purple-100 text-purple-700',
      PS: 'bg-orange-100 text-orange-700',
      KI: 'bg-green-100 text-green-700',
      WD: 'bg-red-100 text-red-700',
    };
    return colors[type] || 'bg-gray-100 text-gray-700';
  };

  // Export current view data
  const handleExport = () => {
    if (selectedCustomer) {
      // Export detail view data based on active tab
      exportToExcel(
        customerCategoryData.map(d => ({
          Category: d.category,
          Revenue: d.revenue,
          Units: d.units,
          Styles: d.styles,
          'Rev/Style': d.revPerStyle.toFixed(2),
          '% of Total': d.pctOfTotal.toFixed(1) + '%',
        })),
        `customer_${selectedCustomer}_${activeTab}_${activeSeason}`
      );
    } else {
      // Export customer list
      exportToExcel(
        filteredCustomers.map((c, idx) => ({
          Rank: idx + 1,
          Customer: c.customer,
          Type: c.customerType,
          Revenue: c.revenue.toFixed(2),
          Units: c.units,
          Styles: c.styles.size,
          'Rev/Style': c.styles.size > 0 ? (c.revenue / c.styles.size).toFixed(2) : '0',
        })),
        `customers_${activeSeason}`
      );
    }
  };

  // Customer detail data - By Category
  const customerCategoryData = useMemo(() => {
    if (!selectedCustomer) return [];

    const categoryMap = new Map<string, { revenue: number; units: number; styles: Set<string> }>();

    sales.forEach(sale => {
      if (sale.customer !== selectedCustomer) return;
      if (sale.season !== activeSeason) return;

      const category = normalizeCategory(sale.categoryDesc) || 'Other';
      if (!categoryMap.has(category)) {
        categoryMap.set(category, { revenue: 0, units: 0, styles: new Set() });
      }

      const cat = categoryMap.get(category)!;
      cat.revenue += sale.revenue || 0;
      cat.units += sale.unitsBooked || 0;
      if (sale.styleNumber) cat.styles.add(sale.styleNumber);
    });

    const totalRevenue = Array.from(categoryMap.values()).reduce((sum, c) => sum + c.revenue, 0);

    return Array.from(categoryMap.entries())
      .map(([category, data]) => ({
        category,
        revenue: data.revenue,
        units: data.units,
        styles: data.styles.size,
        revPerStyle: data.styles.size > 0 ? data.revenue / data.styles.size : 0,
        pctOfTotal: totalRevenue > 0 ? (data.revenue / totalRevenue) * 100 : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [selectedCustomer, sales, activeSeason]);

  // Customer detail data - By Gender
  const customerGenderData = useMemo(() => {
    if (!selectedCustomer) return [];

    const genderMap = new Map<string, { revenue: number; units: number; styles: Set<string> }>();

    sales.forEach(sale => {
      if (sale.customer !== selectedCustomer) return;
      if (sale.season !== activeSeason) return;

      const gender = getGenderFromDivision(sale.divisionDesc || '');
      if (!genderMap.has(gender)) {
        genderMap.set(gender, { revenue: 0, units: 0, styles: new Set() });
      }

      const g = genderMap.get(gender)!;
      g.revenue += sale.revenue || 0;
      g.units += sale.unitsBooked || 0;
      if (sale.styleNumber) g.styles.add(sale.styleNumber);
    });

    return Array.from(genderMap.entries())
      .map(([gender, data]) => ({
        gender,
        revenue: data.revenue,
        units: data.units,
        styles: data.styles.size,
        revPerStyle: data.styles.size > 0 ? data.revenue / data.styles.size : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [selectedCustomer, sales, activeSeason]);

  // Customer detail data - By Color
  const customerColorData = useMemo(() => {
    if (!selectedCustomer) return [];

    const colorMap = new Map<string, { revenue: number; units: number; styles: Set<string> }>();

    sales.forEach(sale => {
      if (sale.customer !== selectedCustomer) return;
      if (sale.season !== activeSeason) return;

      const color = sale.colorDesc || 'Unknown';
      if (!colorMap.has(color)) {
        colorMap.set(color, { revenue: 0, units: 0, styles: new Set() });
      }

      const c = colorMap.get(color)!;
      c.revenue += sale.revenue || 0;
      c.units += sale.unitsBooked || 0;
      if (sale.styleNumber) c.styles.add(sale.styleNumber);
    });

    const totalRevenue = Array.from(colorMap.values()).reduce((sum, c) => sum + c.revenue, 0);

    return Array.from(colorMap.entries())
      .map(([color, data]) => ({
        color,
        revenue: data.revenue,
        units: data.units,
        styles: data.styles.size,
        pctOfTotal: totalRevenue > 0 ? (data.revenue / totalRevenue) * 100 : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [selectedCustomer, sales, activeSeason]);

  // Customer detail data - By Style
  const customerStyleData = useMemo(() => {
    if (!selectedCustomer) return [];

    const styleMap = new Map<string, {
      styleDesc: string;
      categoryDesc: string;
      divisionDesc: string;
      revenue: number;
      units: number;
      price: number;
    }>();

    sales.forEach(sale => {
      if (sale.customer !== selectedCustomer) return;
      if (sale.season !== activeSeason) return;

      const styleNumber = sale.styleNumber;
      if (!styleMap.has(styleNumber)) {
        styleMap.set(styleNumber, {
          styleDesc: sale.styleDesc || '',
          categoryDesc: normalizeCategory(sale.categoryDesc) || '',
          divisionDesc: sale.divisionDesc || '',
          revenue: 0,
          units: 0,
          price: sale.wholesalePrice || 0,
        });
      }

      const s = styleMap.get(styleNumber)!;
      s.revenue += sale.revenue || 0;
      s.units += sale.unitsBooked || 0;
    });

    const allStyles = Array.from(styleMap.entries())
      .map(([styleNumber, data]) => ({
        styleNumber,
        styleDesc: data.styleDesc,
        category: data.categoryDesc,
        gender: getGenderFromDivision(data.divisionDesc),
        revenue: data.revenue,
        units: data.units,
        price: data.price,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    // Filter by search query
    if (!styleSearchQuery) return allStyles;
    const query = styleSearchQuery.toLowerCase();
    return allStyles.filter(s =>
      s.styleNumber.toLowerCase().includes(query) ||
      s.styleDesc.toLowerCase().includes(query)
    );
  }, [selectedCustomer, sales, activeSeason, styleSearchQuery]);

  // Customer detail data - Season Trend
  const customerSeasonData = useMemo(() => {
    if (!selectedCustomer) return [];

    const seasonMap = new Map<string, { revenue: number; units: number; styles: Set<string> }>();

    sales.forEach(sale => {
      if (sale.customer !== selectedCustomer) return;

      const season = sale.season;
      if (!seasonMap.has(season)) {
        seasonMap.set(season, { revenue: 0, units: 0, styles: new Set() });
      }

      const s = seasonMap.get(season)!;
      s.revenue += sale.revenue || 0;
      s.units += sale.unitsBooked || 0;
      if (sale.styleNumber) s.styles.add(sale.styleNumber);
    });

    return Array.from(seasonMap.entries())
      .map(([season, data]) => ({
        season,
        revenue: data.revenue,
        units: data.units,
        styles: data.styles.size,
        revPerStyle: data.styles.size > 0 ? data.revenue / data.styles.size : 0,
      }))
      .sort((a, b) => a.season.localeCompare(b.season));
  }, [selectedCustomer, sales]);

  return (
    <div className="p-6 space-y-6">
      {/* Search Bar */}
      <div className="max-w-md">
        <div className="bg-white border-2 border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <Search className="w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search customer name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 outline-none text-sm font-medium"
          />
        </div>
      </div>

      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-black text-gray-900 tracking-tight">Customers</h1>
          <p className="text-base text-gray-500 mt-1">
            Analyze customer performance by category, gender, and season
          </p>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-5 py-3 bg-emerald-500 hover:bg-emerald-600 text-white text-base font-bold rounded-xl transition-colors shadow-lg"
        >
          <Download className="w-5 h-5" />
          Export {selectedCustomer ? 'Detail' : 'List'}
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border-2 border-gray-200 p-5">
        <div className="flex gap-6 flex-wrap items-end">
          <div>
            <label className="block text-sm font-bold text-gray-500 uppercase tracking-wide mb-2">Season</label>
            <select
              className="border-2 border-gray-200 rounded-xl px-4 py-3 text-base font-semibold bg-white min-w-[140px] focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
              value={activeSeason}
              onChange={(e) => setSelectedSeason(e.target.value)}
            >
              {allSeasons.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-500 uppercase tracking-wide mb-2">Customer Type</label>
            <select
              className="border-2 border-gray-200 rounded-xl px-4 py-3 text-base font-semibold bg-white min-w-[140px] focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
              value={selectedCustomerType}
              onChange={(e) => setSelectedCustomerType(e.target.value)}
            >
              <option value="">All Types</option>
              {customerTypes.map((ct) => (
                <option key={ct} value={ct}>{ct}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-500 uppercase tracking-wide mb-2">Category</label>
            <select
              className="border-2 border-gray-200 rounded-xl px-4 py-3 text-base font-semibold bg-white min-w-[180px] focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-500 uppercase tracking-wide mb-2">Gender</label>
            <select
              className="border-2 border-gray-200 rounded-xl px-4 py-3 text-base font-semibold bg-white min-w-[120px] focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
              value={selectedGender}
              onChange={(e) => setSelectedGender(e.target.value)}
            >
              <option value="">All</option>
              <option value="Men">Men's</option>
              <option value="Women">Women's</option>
              <option value="Unisex">Unisex</option>
            </select>
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-5 gap-4">
        <div className="bg-white border-2 border-gray-200 rounded-xl p-5">
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Total Revenue</div>
          <div className="text-3xl font-black text-gray-900">{formatCurrency(totalStats.revenue)}</div>
        </div>
        <div className="bg-white border-2 border-gray-200 rounded-xl p-5">
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Active Customers</div>
          <div className="text-3xl font-black text-gray-900">{totalStats.customers}</div>
        </div>
        <div className="bg-white border-2 border-gray-200 rounded-xl p-5">
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Avg Order Value</div>
          <div className="text-3xl font-black text-gray-900">{formatCurrency(totalStats.avgOrderValue)}</div>
        </div>
        <div className="bg-white border-2 border-gray-200 rounded-xl p-5">
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Total Styles</div>
          <div className="text-3xl font-black text-gray-900">{totalStats.totalStyles}</div>
        </div>
        <div className="bg-white border-2 border-gray-200 rounded-xl p-5">
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Top Customer Rev</div>
          <div className="text-3xl font-black text-gray-900">{formatCurrency(totalStats.topCustomerRevenue)}</div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-2 gap-6">
        {/* Revenue by Customer Type Bar Chart */}
        <div className="bg-white rounded-xl border-2 border-gray-200 p-6">
          <h3 className="text-xl font-bold text-gray-900 mb-4">Revenue by Customer Type</h3>
          <div className="space-y-3">
            {(() => {
              const typeRevenue = new Map<string, number>();
              customerMetrics.forEach(c => {
                const current = typeRevenue.get(c.customerType) || 0;
                typeRevenue.set(c.customerType, current + c.revenue);
              });
              const sorted = Array.from(typeRevenue.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 6);
              const maxRevenue = sorted[0]?.[1] || 1;

              return sorted.map(([type, revenue]) => (
                <div key={type}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-gray-700">{type}</span>
                    <span className="text-sm font-bold text-gray-900">{formatCurrency(revenue)}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-6">
                    <div
                      className={`h-6 rounded-full ${getCustomerTypeColor(type).replace('text-', 'bg-').replace('100', '500')}`}
                      style={{ width: `${(revenue / maxRevenue) * 100}%` }}
                    ></div>
                  </div>
                </div>
              ));
            })()}
          </div>
        </div>

        {/* Top 10 Customers Donut Chart */}
        <div className="bg-white rounded-xl border-2 border-gray-200 p-6">
          <h3 className="text-xl font-bold text-gray-900 mb-4">Top 10 Customers - Revenue Share</h3>
          <div className="flex items-center justify-center gap-8">
            {(() => {
              const top10 = filteredCustomers.slice(0, 10);
              const top10Revenue = top10.reduce((sum, c) => sum + c.revenue, 0);
              const totalRevenue = totalStats.revenue;
              const top10Pct = totalRevenue > 0 ? (top10Revenue / totalRevenue) * 100 : 0;

              const colors = ['#3b82f6', '#0d9488', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#ec4899', '#6366f1', '#14b8a6', '#f97316'];

              let currentAngle = 0;
              const segments = top10.map((customer, idx) => {
                const pct = (customer.revenue / totalRevenue) * 100;
                const angle = (pct / 100) * 360;
                const segment = {
                  customer: customer.customer,
                  revenue: customer.revenue,
                  pct,
                  startAngle: currentAngle,
                  endAngle: currentAngle + angle,
                  color: colors[idx % colors.length],
                };
                currentAngle += angle;
                return segment;
              });

              return (
                <>
                  <svg width="180" height="180" viewBox="0 0 180 180">
                    <circle cx="90" cy="90" r="70" fill="none" stroke="#e5e7eb" strokeWidth="28"/>
                    {segments.map((seg, idx) => {
                      const startRad = (seg.startAngle - 90) * Math.PI / 180;
                      const endRad = (seg.endAngle - 90) * Math.PI / 180;
                      const largeArc = seg.endAngle - seg.startAngle > 180 ? 1 : 0;

                      const x1 = 90 + 70 * Math.cos(startRad);
                      const y1 = 90 + 70 * Math.sin(startRad);
                      const x2 = 90 + 70 * Math.cos(endRad);
                      const y2 = 90 + 70 * Math.sin(endRad);

                      return (
                        <path
                          key={idx}
                          d={`M 90 90 L ${x1} ${y1} A 70 70 0 ${largeArc} 1 ${x2} ${y2} Z`}
                          fill={seg.color}
                          opacity="0.9"
                        />
                      );
                    })}
                    <circle cx="90" cy="90" r="45" fill="white"/>
                    <text x="90" y="85" textAnchor="middle" fontSize="16" fontWeight="700" fill="#111827">Top 10</text>
                    <text x="90" y="102" textAnchor="middle" fontSize="13" fill="#6b7280">{top10Pct.toFixed(1)}%</text>
                  </svg>
                  <div className="space-y-2">
                    {top10.slice(0, 5).map((c, idx) => (
                      <div key={c.customer} className="flex items-center gap-2 text-sm">
                        <div className="w-3 h-3 rounded" style={{ backgroundColor: colors[idx] }}></div>
                        <span className="text-gray-700 flex-1 truncate max-w-[120px]">{c.customer}</span>
                        <span className="font-semibold text-gray-900">{formatCurrency(c.revenue)}</span>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Customer Table */}
      {!selectedCustomer && (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-black text-gray-900">
              All Customers
              <span className="text-base font-normal text-gray-500 ml-3">
                {filteredCustomers.length} customers · Sorted by revenue
              </span>
            </h2>
          </div>

          <div className="bg-white rounded-xl border-2 border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b-2 border-gray-200">
                  <tr>
                    <th className="text-left text-xs font-black text-gray-600 uppercase tracking-wider px-6 py-4 w-12">#</th>
                    <th className="text-left text-xs font-black text-gray-600 uppercase tracking-wider px-6 py-4">Customer</th>
                    <th className="text-left text-xs font-black text-gray-600 uppercase tracking-wider px-6 py-4">Type</th>
                    <th className="text-right text-xs font-black text-gray-600 uppercase tracking-wider px-6 py-4">Revenue</th>
                    <th className="text-right text-xs font-black text-gray-600 uppercase tracking-wider px-6 py-4">Units</th>
                    <th className="text-right text-xs font-black text-gray-600 uppercase tracking-wider px-6 py-4">Styles</th>
                    <th className="text-right text-xs font-black text-gray-600 uppercase tracking-wider px-6 py-4">Avg Order</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredCustomers.slice(0, 50).map((customer, idx) => (
                    <tr
                      key={customer.customer}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => setSelectedCustomer(customer.customer)}
                    >
                      <td className="px-6 py-4 text-sm text-gray-400">{idx + 1}</td>
                      <td className="px-6 py-4">
                        <span className="text-base font-bold text-blue-600 hover:underline">
                          {customer.customer}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-xs font-bold px-3 py-1 rounded-full ${getCustomerTypeColor(customer.customerType)}`}>
                          {customer.customerType}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right text-base font-semibold text-gray-900">
                        {formatCurrency(customer.revenue)}
                      </td>
                      <td className="px-6 py-4 text-right text-base font-semibold text-gray-700">
                        {formatNumber(customer.units)}
                      </td>
                      <td className="px-6 py-4 text-right text-base font-semibold text-gray-700">
                        {customer.styles.size}
                      </td>
                      <td className="px-6 py-4 text-right text-base font-semibold text-gray-700">
                        {formatCurrency(customer.revenue / customer.orders)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Customer Detail View */}
      {selectedCustomer && (
        <div className="space-y-6">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <button
              onClick={() => setSelectedCustomer(null)}
              className="text-blue-600 hover:underline font-medium"
            >
              Customers
            </button>
            <ChevronRight className="w-4 h-4" />
            <span className="text-gray-900 font-semibold">{selectedCustomer}</span>
          </div>

          {/* Customer Detail Card */}
          <div className="bg-white rounded-xl border-2 border-gray-200 p-6">
            <div className="flex items-center justify-between mb-6 pb-6 border-b-2 border-gray-200">
              <div>
                <h2 className="text-3xl font-black text-gray-900">{selectedCustomer}</h2>
                <p className="text-sm text-gray-500 mt-1">{activeSeason}</p>
              </div>
              <span className={`text-sm font-bold px-4 py-2 rounded-xl ${getCustomerTypeColor(filteredCustomers.find(c => c.customer === selectedCustomer)?.customerType || '')}`}>
                {filteredCustomers.find(c => c.customer === selectedCustomer)?.customerType}
              </span>
            </div>

            {/* Mini Stats */}
            <div className="grid grid-cols-4 gap-4">
              {(() => {
                const customerData = filteredCustomers.find(c => c.customer === selectedCustomer);
                if (!customerData) return null;
                return (
                  <>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Revenue</div>
                      <div className="text-2xl font-black text-gray-900">{formatCurrency(customerData.revenue)}</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Units</div>
                      <div className="text-2xl font-black text-gray-900">{formatNumber(customerData.units)}</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Styles Ordered</div>
                      <div className="text-2xl font-black text-gray-900">{customerData.styles.size}</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Avg Order</div>
                      <div className="text-2xl font-black text-gray-900">{formatCurrency(customerData.revenue / customerData.orders)}</div>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>

          {/* Tabs */}
          <div className="border-b-2 border-gray-200">
            <div className="flex gap-0">
              {[
                { id: 'category', label: 'By Category' },
                { id: 'gender', label: 'By Gender' },
                { id: 'color', label: 'By Color' },
                { id: 'style', label: 'By Style' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`px-6 py-3 text-sm font-semibold border-b-2 -mb-0.5 transition-colors ${
                    activeTab === tab.id
                      ? 'text-blue-600 border-blue-600'
                      : 'text-gray-500 border-transparent hover:text-gray-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tab Content */}
          {activeTab === 'category' && (
            <div className="bg-white rounded-xl border-2 border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b-2 border-gray-200">
                    <tr>
                      <th className="text-left text-xs font-black text-gray-600 uppercase tracking-wider px-6 py-4">Category</th>
                      <th className="text-right text-xs font-black text-gray-600 uppercase tracking-wider px-6 py-4">Revenue</th>
                      <th className="text-right text-xs font-black text-gray-600 uppercase tracking-wider px-6 py-4">Units</th>
                      <th className="text-right text-xs font-black text-gray-600 uppercase tracking-wider px-6 py-4">Styles</th>
                      <th className="text-right text-xs font-black text-gray-600 uppercase tracking-wider px-6 py-4">Rev/Style</th>
                      <th className="text-right text-xs font-black text-gray-600 uppercase tracking-wider px-6 py-4">% of Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {customerCategoryData.map((cat) => (
                      <tr key={cat.category} className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-base font-bold text-gray-900">{cat.category}</td>
                        <td className="px-6 py-4 text-right font-semibold text-gray-900">{formatCurrency(cat.revenue)}</td>
                        <td className="px-6 py-4 text-right text-gray-700">{formatNumber(cat.units)}</td>
                        <td className="px-6 py-4 text-right text-gray-700">{cat.styles}</td>
                        <td className="px-6 py-4 text-right text-gray-700">{formatCurrency(cat.revPerStyle)}</td>
                        <td className="px-6 py-4 text-right text-gray-700">{cat.pctOfTotal.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'gender' && (
            <div className="space-y-6">
              {/* Gender Donut Chart */}
              <div className="bg-white rounded-xl border-2 border-gray-200 p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Revenue by Gender</h3>
                <div className="flex items-center justify-center gap-12">
                  {(() => {
                    const totalRevenue = customerGenderData.reduce((sum, g) => sum + g.revenue, 0);
                    const genderColors: Record<string, string> = {
                      'Men': '#3b82f6',
                      'Women': '#ec4899',
                      'Unisex': '#a78bfa',
                    };

                    let currentAngle = 0;
                    const segments = customerGenderData.map((gender) => {
                      const pct = totalRevenue > 0 ? (gender.revenue / totalRevenue) * 100 : 0;
                      const angle = (pct / 100) * 360;
                      const segment = {
                        gender: gender.gender,
                        revenue: gender.revenue,
                        pct,
                        startAngle: currentAngle,
                        endAngle: currentAngle + angle,
                        color: genderColors[gender.gender] || '#9ca3af',
                      };
                      currentAngle += angle;
                      return segment;
                    });

                    return (
                      <>
                        <svg width="160" height="160" viewBox="0 0 160 160">
                          <circle cx="80" cy="80" r="60" fill="none" stroke="#e5e7eb" strokeWidth="24"/>
                          {segments.map((seg, idx) => {
                            const startRad = (seg.startAngle - 90) * Math.PI / 180;
                            const endRad = (seg.endAngle - 90) * Math.PI / 180;
                            const largeArc = seg.endAngle - seg.startAngle > 180 ? 1 : 0;

                            const x1 = 80 + 60 * Math.cos(startRad);
                            const y1 = 80 + 60 * Math.sin(startRad);
                            const x2 = 80 + 60 * Math.cos(endRad);
                            const y2 = 80 + 60 * Math.sin(endRad);

                            return (
                              <path
                                key={idx}
                                d={`M 80 80 L ${x1} ${y1} A 60 60 0 ${largeArc} 1 ${x2} ${y2} Z`}
                                fill={seg.color}
                                opacity="0.9"
                              />
                            );
                          })}
                          <circle cx="80" cy="80" r="38" fill="white"/>
                        </svg>
                        <div className="space-y-3">
                          {customerGenderData.map((g) => (
                            <div key={g.gender} className="flex items-center gap-3">
                              <div className="w-4 h-4 rounded" style={{ backgroundColor: genderColors[g.gender] || '#9ca3af' }}></div>
                              <span className="text-sm font-medium text-gray-700 w-20">{g.gender}</span>
                              <span className="text-sm font-bold text-gray-900">
                                {formatCurrency(g.revenue)} ({totalRevenue > 0 ? ((g.revenue / totalRevenue) * 100).toFixed(0) : 0}%)
                              </span>
                            </div>
                          ))}
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Gender Table */}
              <div className="bg-white rounded-xl border-2 border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b-2 border-gray-200">
                      <tr>
                        <th className="text-left text-xs font-black text-gray-600 uppercase tracking-wider px-6 py-4">Gender</th>
                        <th className="text-right text-xs font-black text-gray-600 uppercase tracking-wider px-6 py-4">Revenue</th>
                        <th className="text-right text-xs font-black text-gray-600 uppercase tracking-wider px-6 py-4">Units</th>
                        <th className="text-right text-xs font-black text-gray-600 uppercase tracking-wider px-6 py-4">Styles</th>
                        <th className="text-right text-xs font-black text-gray-600 uppercase tracking-wider px-6 py-4">Rev/Style</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {customerGenderData.map((g) => (
                        <tr key={g.gender} className="hover:bg-gray-50">
                          <td className="px-6 py-4 text-base font-bold text-gray-900">{g.gender}</td>
                          <td className="px-6 py-4 text-right font-semibold text-gray-900">{formatCurrency(g.revenue)}</td>
                          <td className="px-6 py-4 text-right text-gray-700">{formatNumber(g.units)}</td>
                          <td className="px-6 py-4 text-right text-gray-700">{g.styles}</td>
                          <td className="px-6 py-4 text-right text-gray-700">{formatCurrency(g.revPerStyle)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'color' && (
            <div className="bg-white rounded-xl border-2 border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b-2 border-gray-200">
                    <tr>
                      <th className="text-left text-xs font-black text-gray-600 uppercase tracking-wider px-6 py-4">Color</th>
                      <th className="text-right text-xs font-black text-gray-600 uppercase tracking-wider px-6 py-4">Revenue</th>
                      <th className="text-right text-xs font-black text-gray-600 uppercase tracking-wider px-6 py-4">Units</th>
                      <th className="text-right text-xs font-black text-gray-600 uppercase tracking-wider px-6 py-4">Styles Using</th>
                      <th className="text-right text-xs font-black text-gray-600 uppercase tracking-wider px-6 py-4">% of Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {customerColorData.slice(0, 20).map((color) => (
                      <tr key={color.color} className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-base font-bold text-gray-900">{color.color}</td>
                        <td className="px-6 py-4 text-right font-semibold text-gray-900">{formatCurrency(color.revenue)}</td>
                        <td className="px-6 py-4 text-right text-gray-700">{formatNumber(color.units)}</td>
                        <td className="px-6 py-4 text-right text-gray-700">{color.styles}</td>
                        <td className="px-6 py-4 text-right text-gray-700">{color.pctOfTotal.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'style' && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="relative flex-1 max-w-md">
                  <input
                    type="text"
                    placeholder="Search by style # or description..."
                    value={styleSearchQuery}
                    onChange={(e) => setStyleSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  />
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                </div>
                {styleSearchQuery && (
                  <span className="text-sm text-gray-500">
                    Found {customerStyleData.length} matching styles
                  </span>
                )}
              </div>

              <div className="bg-white rounded-xl border-2 border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b-2 border-gray-200">
                      <tr>
                        <th className="text-left text-xs font-black text-gray-600 uppercase tracking-wider px-6 py-4">Style #</th>
                        <th className="text-left text-xs font-black text-gray-600 uppercase tracking-wider px-6 py-4">Description</th>
                        <th className="text-left text-xs font-black text-gray-600 uppercase tracking-wider px-6 py-4">Category</th>
                        <th className="text-left text-xs font-black text-gray-600 uppercase tracking-wider px-6 py-4">Gender</th>
                        <th className="text-right text-xs font-black text-gray-600 uppercase tracking-wider px-6 py-4">Revenue</th>
                        <th className="text-right text-xs font-black text-gray-600 uppercase tracking-wider px-6 py-4">Units</th>
                        <th className="text-right text-xs font-black text-gray-600 uppercase tracking-wider px-6 py-4">Price</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {customerStyleData.slice(0, 25).map((style) => (
                        <tr
                          key={style.styleNumber}
                          className="hover:bg-gray-50 cursor-pointer"
                          onClick={() => onStyleClick(style.styleNumber)}
                        >
                          <td className="px-6 py-4 font-mono text-base font-bold text-blue-600">{style.styleNumber}</td>
                          <td className="px-6 py-4 text-sm text-gray-700 max-w-[200px] truncate">{style.styleDesc}</td>
                          <td className="px-6 py-4 text-sm text-gray-700">{style.category}</td>
                          <td className="px-6 py-4 text-sm text-gray-700">{style.gender}</td>
                          <td className="px-6 py-4 text-right font-semibold text-gray-900">{formatCurrency(style.revenue)}</td>
                          <td className="px-6 py-4 text-right text-gray-700">{formatNumber(style.units)}</td>
                          <td className="px-6 py-4 text-right text-gray-700">${style.price.toFixed(0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'trend' && (
            <div className="bg-white rounded-xl border-2 border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b-2 border-gray-200">
                    <tr>
                      <th className="text-left text-xs font-black text-gray-600 uppercase tracking-wider px-6 py-4">Season</th>
                      <th className="text-right text-xs font-black text-gray-600 uppercase tracking-wider px-6 py-4">Revenue</th>
                      <th className="text-right text-xs font-black text-gray-600 uppercase tracking-wider px-6 py-4">Units</th>
                      <th className="text-right text-xs font-black text-gray-600 uppercase tracking-wider px-6 py-4">Styles</th>
                      <th className="text-right text-xs font-black text-gray-600 uppercase tracking-wider px-6 py-4">Rev/Style</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {customerSeasonData.map((s) => (
                      <tr key={s.season} className="hover:bg-gray-50">
                        <td className="px-6 py-4 font-mono text-base font-bold text-gray-900">{s.season}</td>
                        <td className="px-6 py-4 text-right font-semibold text-gray-900">{formatCurrency(s.revenue)}</td>
                        <td className="px-6 py-4 text-right text-gray-700">{formatNumber(s.units)}</td>
                        <td className="px-6 py-4 text-right text-gray-700">{s.styles}</td>
                        <td className="px-6 py-4 text-right text-gray-700">{formatCurrency(s.revPerStyle)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'margin' && (
            <div className="space-y-6">
              <div className="bg-gray-50 rounded-xl border-2 border-gray-200 p-6">
                <p className="text-sm text-gray-600 mb-4">
                  Margin analysis by category for {selectedCustomer}
                </p>
                <p className="text-sm text-gray-500">
                  <span className="font-semibold text-blue-600 hover:underline cursor-pointer">
                    → View full margin breakdown in Margins page
                  </span>
                </p>
              </div>

              <div className="bg-white rounded-xl border-2 border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b-2 border-gray-200">
                      <tr>
                        <th className="text-left text-xs font-black text-gray-600 uppercase tracking-wider px-6 py-4">Category</th>
                        <th className="text-right text-xs font-black text-gray-600 uppercase tracking-wider px-6 py-4">Revenue</th>
                        <th className="text-right text-xs font-black text-gray-600 uppercase tracking-wider px-6 py-4">Units</th>
                        <th className="text-right text-xs font-black text-gray-600 uppercase tracking-wider px-6 py-4">Avg Price</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {customerCategoryData.map((cat) => (
                        <tr key={cat.category} className="hover:bg-gray-50">
                          <td className="px-6 py-4 text-base font-bold text-gray-900">{cat.category}</td>
                          <td className="px-6 py-4 text-right font-semibold text-gray-900">{formatCurrency(cat.revenue)}</td>
                          <td className="px-6 py-4 text-right text-gray-700">{formatNumber(cat.units)}</td>
                          <td className="px-6 py-4 text-right text-gray-700">
                            {cat.units > 0 ? formatCurrency(cat.revenue / cat.units) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
