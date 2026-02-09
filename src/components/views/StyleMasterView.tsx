'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { Product, SalesRecord, PricingRecord, CostRecord } from '@/types/product';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  X,
  Circle,
  Package,
} from 'lucide-react';
import { formatCurrency, formatCurrencyShort, formatPercent, formatNumber } from '@/utils/format';

interface StyleMasterViewProps {
  products: Product[];
  sales: SalesRecord[];
  pricing: PricingRecord[];
  costs: CostRecord[];
  selectedDivision: string;
  selectedCategory: string;
  initialStyleNumber?: string;
}

type TabId = 'codes' | 'info' | 'additional' | 'colors';

interface StyleColor {
  color: string;
  colorDesc: string;
  colorSeason: string;
  status: 'Active' | 'Discontinued';
  styleColor: string;
  webAvailable: boolean;
}

interface SeasonPricing {
  season: string;
  cost: number;
  wholesale: number;
  msrp: number;
  margin: number;
}

interface SeasonSales {
  season: string;
  units: number;
  revenue: number;
  customers: number;
  topChannel: string;
  topChannelPct: number;
}

const CHANNEL_LABELS: Record<string, string> = {
  'WH': 'Wholesale',
  'WD': 'Wholesale Direct',
  'BB': 'Big Box/REI',
  'PS': 'Pro Sales',
  'EC': 'E-commerce',
  'KI': 'KÜHL Internal',
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

export default function StyleMasterView({
  products,
  sales,
  pricing,
  costs,
  selectedDivision,
  selectedCategory,
  initialStyleNumber,
}: StyleMasterViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [selectedStyleNumber, setSelectedStyleNumber] = useState<string | null>(initialStyleNumber || null);
  const [activeTab, setActiveTab] = useState<TabId>('codes');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Get unique styles (deduplicated by style number)
  const uniqueStyles = useMemo(() => {
    const styleMap = new Map<string, Product>();
    products.forEach(p => {
      if (!styleMap.has(p.styleNumber)) {
        styleMap.set(p.styleNumber, p);
      }
    });
    return Array.from(styleMap.values()).sort((a, b) =>
      a.styleNumber.localeCompare(b.styleNumber)
    );
  }, [products]);

  // Filter styles by division/category
  const filteredStyles = useMemo(() => {
    return uniqueStyles.filter(s => {
      if (selectedDivision && s.divisionDesc !== selectedDivision) return false;
      if (selectedCategory && s.categoryDesc !== selectedCategory) return false;
      return true;
    });
  }, [uniqueStyles, selectedDivision, selectedCategory]);

  // Search results
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return filteredStyles
      .filter(s =>
        s.styleNumber.toLowerCase().includes(q) ||
        s.styleDesc.toLowerCase().includes(q)
      )
      .slice(0, 15);
  }, [filteredStyles, searchQuery]);

  // Auto-select first style if none selected
  useEffect(() => {
    if (!selectedStyleNumber && filteredStyles.length > 0) {
      setSelectedStyleNumber(filteredStyles[0].styleNumber);
    }
  }, [filteredStyles, selectedStyleNumber]);

  // Get current style index for prev/next navigation
  const currentStyleIndex = useMemo(() => {
    if (!selectedStyleNumber) return -1;
    return filteredStyles.findIndex(s => s.styleNumber === selectedStyleNumber);
  }, [filteredStyles, selectedStyleNumber]);

  // Get all data for selected style
  const styleData = useMemo(() => {
    if (!selectedStyleNumber) return null;

    // Get base style info
    const baseStyle = products.find(p => p.styleNumber === selectedStyleNumber);
    if (!baseStyle) return null;

    // Get all colors for this style
    const colors: StyleColor[] = products
      .filter(p => p.styleNumber === selectedStyleNumber)
      .map(p => ({
        color: p.color,
        colorDesc: p.colorDesc,
        colorSeason: p.colorSeason || p.season,
        status: (p.colorDisc === 'Y' || p.inventoryClassification === 'D') ? 'Discontinued' as const : 'Active' as const,
        styleColor: p.styleColor,
        webAvailable: p.colorAvailWeb === 'Y',
      }))
      .filter((c, i, arr) => arr.findIndex(x => x.color === c.color) === i); // Dedupe by color

    // Get pricing history
    const pricingHistory: SeasonPricing[] = [];
    const pricingByStyle = pricing.filter(p => p.styleNumber === selectedStyleNumber);
    const costByStyle = costs.filter(c => c.styleNumber === selectedStyleNumber);

    // Build pricing by season
    const seasonSet = new Set<string>();
    pricingByStyle.forEach(p => p.season && seasonSet.add(p.season));
    costByStyle.forEach(c => c.season && seasonSet.add(c.season));

    Array.from(seasonSet).sort().forEach(season => {
      const priceRecord = pricingByStyle.find(p => p.season === season);
      const costRecord = costByStyle.find(c => c.season === season);

      const wholesale = priceRecord?.price || baseStyle.price || 0;
      const msrp = priceRecord?.msrp || baseStyle.msrp || 0;
      const cost = costRecord?.landed || costRecord?.fob || priceRecord?.cost || 0;
      const margin = wholesale > 0 && cost > 0 ? ((wholesale - cost) / wholesale) * 100 : 0;

      pricingHistory.push({
        season,
        cost,
        wholesale,
        msrp,
        margin,
      });
    });

    // If no pricing history, add current
    if (pricingHistory.length === 0 && baseStyle.price > 0) {
      pricingHistory.push({
        season: baseStyle.season || 'Current',
        cost: baseStyle.cost || 0,
        wholesale: baseStyle.price,
        msrp: baseStyle.msrp,
        margin: baseStyle.price > 0 && baseStyle.cost > 0
          ? ((baseStyle.price - baseStyle.cost) / baseStyle.price) * 100
          : 0,
      });
    }

    // Get sales history by season
    const salesByStyle = sales.filter(s => s.styleNumber === selectedStyleNumber);
    const salesBySeason = new Map<string, {
      units: number;
      revenue: number;
      customers: Set<string>;
      channels: Record<string, number>;
    }>();

    salesByStyle.forEach(s => {
      if (!s.season) return;
      if (!salesBySeason.has(s.season)) {
        salesBySeason.set(s.season, {
          units: 0,
          revenue: 0,
          customers: new Set(),
          channels: {},
        });
      }
      const entry = salesBySeason.get(s.season)!;
      entry.units += s.unitsBooked || 0;
      entry.revenue += s.revenue || 0;
      if (s.customer) entry.customers.add(s.customer);
      const channel = s.customerType || 'Other';
      entry.channels[channel] = (entry.channels[channel] || 0) + (s.revenue || 0);
    });

    const salesHistory: SeasonSales[] = Array.from(salesBySeason.entries())
      .map(([season, data]) => {
        // Find top channel
        let topChannel = '';
        let topChannelRev = 0;
        Object.entries(data.channels).forEach(([ch, rev]) => {
          if (rev > topChannelRev) {
            topChannel = ch;
            topChannelRev = rev;
          }
        });
        const topChannelPct = data.revenue > 0 ? (topChannelRev / data.revenue) * 100 : 0;

        return {
          season,
          units: data.units,
          revenue: data.revenue,
          customers: data.customers.size,
          topChannel,
          topChannelPct,
        };
      })
      .sort((a, b) => a.season.localeCompare(b.season));

    return {
      style: baseStyle,
      colors,
      pricingHistory,
      salesHistory,
    };
  }, [products, sales, pricing, costs, selectedStyleNumber]);

  // Navigation handlers
  const goToPrevStyle = () => {
    if (currentStyleIndex > 0) {
      setSelectedStyleNumber(filteredStyles[currentStyleIndex - 1].styleNumber);
    }
  };

  const goToNextStyle = () => {
    if (currentStyleIndex < filteredStyles.length - 1) {
      setSelectedStyleNumber(filteredStyles[currentStyleIndex + 1].styleNumber);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && !showSearchResults) {
        goToPrevStyle();
      } else if (e.key === 'ArrowRight' && !showSearchResults) {
        goToNextStyle();
      } else if ((e.ctrlKey && e.key === 'f') || e.key === '/') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'Escape') {
        setShowSearchResults(false);
        setSearchQuery('');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentStyleIndex, filteredStyles, showSearchResults]);

  const handleSearchSelect = (styleNumber: string) => {
    setSelectedStyleNumber(styleNumber);
    setSearchQuery('');
    setShowSearchResults(false);
  };

  const tabs: { id: TabId; label: string }[] = [
    { id: 'codes', label: 'Style Codes' },
    { id: 'info', label: 'Style Info' },
    { id: 'additional', label: "Add'l Info" },
    { id: 'colors', label: 'Colors' },
  ];

  if (!styleData) {
    return (
      <div className="p-6">
        <h2 className="text-4xl font-display font-bold text-gray-900 mb-4">Style Master</h2>
        <div className="bg-white rounded-xl border-2 border-gray-200 p-12 text-center">
          <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 text-lg">No styles found matching your filters.</p>
          <p className="text-gray-400 text-sm mt-2">Try adjusting the division or category filters.</p>
        </div>
      </div>
    );
  }

  const { style, colors, pricingHistory, salesHistory } = styleData;
  const isActive = style.inventoryClassification !== 'D';

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-4xl font-display font-bold text-gray-900">Style Master</h2>
          <p className="text-base text-gray-500 mt-1">
            Detailed product information and history
          </p>
        </div>

        {/* Search Box */}
        <div className="relative w-80">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search style number or description..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowSearchResults(true);
              }}
              onFocus={() => setShowSearchResults(true)}
              className="w-full pl-10 pr-10 py-3 border-2 border-gray-200 rounded-xl text-base focus:outline-none focus:border-cyan-500"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setShowSearchResults(false);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Search Results Dropdown */}
          {showSearchResults && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border-2 border-gray-200 rounded-xl shadow-lg z-50 max-h-80 overflow-auto">
              {searchResults.map(s => (
                <button
                  key={s.styleNumber}
                  onClick={() => handleSearchSelect(s.styleNumber)}
                  className="w-full px-4 py-3 text-left hover:bg-cyan-50 flex items-center gap-3 border-b border-gray-100 last:border-0"
                >
                  <span className="font-mono font-semibold text-gray-900 bg-gray-100 px-2 py-0.5 rounded">
                    {s.styleNumber}
                  </span>
                  <span className="text-gray-700 truncate">{s.styleDesc}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Style Card */}
      <div className="bg-white rounded-xl border-2 border-gray-200 shadow-sm overflow-hidden">
        {/* Style Header */}
        <div className="px-6 py-5 border-b-2 border-gray-200 bg-gray-50">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-4">
                <span className="text-4xl font-mono font-bold text-gray-900">
                  {style.styleNumber}
                </span>
                <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold ${
                  isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                }`}>
                  <Circle className={`w-2 h-2 fill-current`} />
                  {isActive ? 'Active' : 'Discontinued'}
                </span>
              </div>
              <h3 className="text-2xl font-semibold text-gray-700 mt-2">{style.styleDesc}</h3>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">
                <span className="font-bold">Season:</span>{' '}
                <span className="font-mono">{style.season || style.styleSeason}</span>
                {style.seasonDesc && <span className="text-gray-400"> ({style.seasonDesc})</span>}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                <span className="font-bold">Last Changed:</span>{' '}
                {formatDate(style.dateChangedStyle)}
              </p>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="border-b-2 border-gray-200">
          <div className="flex">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-6 py-3 text-sm font-bold uppercase tracking-wide transition-colors ${
                  activeTab === tab.id
                    ? 'bg-white text-cyan-600 border-b-2 border-cyan-600 -mb-[2px]'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeTab === 'codes' && (
            <div className="grid grid-cols-2 gap-6">
              {/* Classification */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-100 px-4 py-3 border-b border-gray-200">
                  <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Classification</h4>
                </div>
                <div className="divide-y divide-gray-100">
                  <div className="grid grid-cols-[140px_1fr] items-center">
                    <span className="px-4 py-3 text-sm font-medium text-gray-500 bg-gray-50 border-r border-gray-100">Division</span>
                    <span className="px-4 py-3 text-sm font-mono text-gray-900">{style.divisionDesc || '—'}</span>
                  </div>
                  <div className="grid grid-cols-[140px_1fr] items-center">
                    <span className="px-4 py-3 text-sm font-medium text-gray-500 bg-gray-50 border-r border-gray-100">Category</span>
                    <span className="px-4 py-3 text-sm font-mono text-gray-900">{style.categoryDesc || '—'}</span>
                  </div>
                  <div className="grid grid-cols-[140px_1fr] items-center">
                    <span className="px-4 py-3 text-sm font-medium text-gray-500 bg-gray-50 border-r border-gray-100">Label</span>
                    <span className="px-4 py-3 text-sm font-mono text-gray-900">{style.labelDesc || '—'}</span>
                  </div>
                  <div className="grid grid-cols-[140px_1fr] items-center">
                    <span className="px-4 py-3 text-sm font-medium text-gray-500 bg-gray-50 border-r border-gray-100">Product Line</span>
                    <span className="px-4 py-3 text-sm font-mono text-gray-900">{style.productLineDesc || style.productLine || '—'}</span>
                  </div>
                  <div className="grid grid-cols-[140px_1fr] items-center">
                    <span className="px-4 py-3 text-sm font-medium text-gray-500 bg-gray-50 border-r border-gray-100">Style Segment</span>
                    <span className="px-4 py-3 text-sm font-mono text-gray-900">{style.styleSegmentDesc || style.styleSegment || '—'}</span>
                  </div>
                  <div className="grid grid-cols-[140px_1fr] items-center">
                    <span className="px-4 py-3 text-sm font-medium text-gray-500 bg-gray-50 border-r border-gray-100">Master Segment</span>
                    <span className="px-4 py-3 text-sm font-mono text-gray-900">{style.masterSegmentDesc || '—'}</span>
                  </div>
                  <div className="grid grid-cols-[140px_1fr] items-center">
                    <span className="px-4 py-3 text-sm font-medium text-gray-500 bg-gray-50 border-r border-gray-100">Merch Collection</span>
                    <span className="px-4 py-3 text-sm font-mono text-gray-900">{style.merchandiseCollectionDesc || '—'}</span>
                  </div>
                </div>
              </div>

              {/* Sourcing */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-100 px-4 py-3 border-b border-gray-200">
                  <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Sourcing</h4>
                </div>
                <div className="divide-y divide-gray-100">
                  <div className="grid grid-cols-[140px_1fr] items-center">
                    <span className="px-4 py-3 text-sm font-medium text-gray-500 bg-gray-50 border-r border-gray-100">Country of Origin</span>
                    <span className="px-4 py-3 text-sm font-mono text-gray-900">{style.countryOfOrigin || '—'}</span>
                  </div>
                  <div className="grid grid-cols-[140px_1fr] items-center">
                    <span className="px-4 py-3 text-sm font-medium text-gray-500 bg-gray-50 border-r border-gray-100">Factory</span>
                    <span className="px-4 py-3 text-sm font-mono text-gray-900">{style.factoryName || '—'}</span>
                  </div>
                  <div className="grid grid-cols-[140px_1fr] items-center">
                    <span className="px-4 py-3 text-sm font-medium text-gray-500 bg-gray-50 border-r border-gray-100">Primary Supplier</span>
                    <span className="px-4 py-3 text-sm font-mono text-gray-900 truncate">{style.primarySupplier || '—'}</span>
                  </div>
                  <div className="grid grid-cols-[140px_1fr] items-center">
                    <span className="px-4 py-3 text-sm font-medium text-gray-500 bg-gray-50 border-r border-gray-100">HTS Code</span>
                    <span className="px-4 py-3 text-sm font-mono text-gray-900">{style.htsCode || '—'}</span>
                  </div>
                  <div className="grid grid-cols-[140px_1fr] items-center">
                    <span className="px-4 py-3 text-sm font-medium text-gray-500 bg-gray-50 border-r border-gray-100">Designer</span>
                    <span className="px-4 py-3 text-sm font-mono text-gray-900">{style.designerName || '—'}</span>
                  </div>
                  <div className="grid grid-cols-[140px_1fr] items-center">
                    <span className="px-4 py-3 text-sm font-medium text-gray-500 bg-gray-50 border-r border-gray-100">Tech Designer</span>
                    <span className="px-4 py-3 text-sm font-mono text-gray-900">{style.techDesignerName || '—'}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'info' && (
            <div className="grid grid-cols-2 gap-6">
              {/* Specifications */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-100 px-4 py-3 border-b border-gray-200">
                  <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Specifications</h4>
                </div>
                <div className="divide-y divide-gray-100">
                  <div className="grid grid-cols-[140px_1fr] items-center">
                    <span className="px-4 py-3 text-sm font-medium text-gray-500 bg-gray-50 border-r border-gray-100">Carry Over</span>
                    <span className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-sm font-semibold ${
                        style.carryOver ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-600'
                      }`}>
                        {style.carryOver ? 'Yes' : 'No'}
                      </span>
                    </span>
                  </div>
                  <div className="grid grid-cols-[140px_1fr] items-center">
                    <span className="px-4 py-3 text-sm font-medium text-gray-500 bg-gray-50 border-r border-gray-100">Carry Forward</span>
                    <span className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-sm font-semibold ${
                        style.carryForward ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-600'
                      }`}>
                        {style.carryForward ? 'Yes' : 'No'}
                      </span>
                    </span>
                  </div>
                  <div className="grid grid-cols-[140px_1fr] items-center">
                    <span className="px-4 py-3 text-sm font-medium text-gray-500 bg-gray-50 border-r border-gray-100">Currency</span>
                    <span className="px-4 py-3 text-sm font-mono text-gray-900">{style.currency || 'USD'}</span>
                  </div>
                  <div className="grid grid-cols-[140px_1fr] items-center">
                    <span className="px-4 py-3 text-sm font-medium text-gray-500 bg-gray-50 border-r border-gray-100">Inventory Class</span>
                    <span className="px-4 py-3 text-sm font-mono text-gray-900">
                      {style.inventoryClassificationDesc || style.inventoryClassification || '—'}
                    </span>
                  </div>
                  <div className="grid grid-cols-[140px_1fr] items-center">
                    <span className="px-4 py-3 text-sm font-medium text-gray-500 bg-gray-50 border-r border-gray-100">Style Disc</span>
                    <span className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-sm font-semibold ${
                        style.styleDisc === 'Y' ? 'bg-red-100 text-red-700' : 'bg-gray-200 text-gray-600'
                      }`}>
                        {style.styleDisc === 'Y' ? 'Yes' : 'No'}
                      </span>
                    </span>
                  </div>
                  {style.styleDiscReason && (
                    <div className="grid grid-cols-[140px_1fr] items-center">
                      <span className="px-4 py-3 text-sm font-medium text-gray-500 bg-gray-50 border-r border-gray-100">Disc Reason</span>
                      <span className="px-4 py-3 text-sm font-mono text-gray-900">{style.styleDiscReason}</span>
                    </div>
                  )}
                  <div className="grid grid-cols-[140px_1fr] items-center">
                    <span className="px-4 py-3 text-sm font-medium text-gray-500 bg-gray-50 border-r border-gray-100">Web Available</span>
                    <span className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-sm font-semibold ${
                        style.colorAvailWeb === 'Y' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-600'
                      }`}>
                        {style.colorAvailWeb === 'Y' ? 'Yes' : 'No'}
                      </span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Dates */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-100 px-4 py-3 border-b border-gray-200">
                  <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Dates</h4>
                </div>
                <div className="divide-y divide-gray-100">
                  <div className="grid grid-cols-[160px_1fr] items-center">
                    <span className="px-4 py-3 text-sm font-medium text-gray-500 bg-gray-50 border-r border-gray-100">Date Opened</span>
                    <span className="px-4 py-3 text-sm font-mono text-gray-900">{formatDate(style.dateOpened)}</span>
                  </div>
                  <div className="grid grid-cols-[160px_1fr] items-center">
                    <span className="px-4 py-3 text-sm font-medium text-gray-500 bg-gray-50 border-r border-gray-100">Date Changed (Style)</span>
                    <span className="px-4 py-3 text-sm font-mono text-gray-900">{formatDate(style.dateChangedStyle)}</span>
                  </div>
                  <div className="grid grid-cols-[160px_1fr] items-center">
                    <span className="px-4 py-3 text-sm font-medium text-gray-500 bg-gray-50 border-r border-gray-100">Date Added (Color)</span>
                    <span className="px-4 py-3 text-sm font-mono text-gray-900">{formatDate(style.dateAddedColor)}</span>
                  </div>
                  <div className="grid grid-cols-[160px_1fr] items-center">
                    <span className="px-4 py-3 text-sm font-medium text-gray-500 bg-gray-50 border-r border-gray-100">Date Changed (Color)</span>
                    <span className="px-4 py-3 text-sm font-mono text-gray-900">{formatDate(style.dateChangedColor)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'additional' && (
            <div className="space-y-6">
              {/* Notes */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-100 px-4 py-3 border-b border-gray-200">
                  <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Notes</h4>
                </div>
                <div className="p-4 bg-white">
                  <p className="text-gray-700 whitespace-pre-wrap text-sm">
                    {style.styleColorNotes || 'No notes available.'}
                  </p>
                </div>
              </div>

              {/* Selling Seasons */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-100 px-4 py-3 border-b border-gray-200">
                  <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Selling Seasons</h4>
                </div>
                <div className="p-4 bg-white">
                  <p className="font-mono text-gray-900 text-sm">
                    {style.sellingSeasons || '—'}
                  </p>
                </div>
              </div>

              {/* CAD Info */}
              {(style.cadPrice || style.cadMsrp) && (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="bg-gray-100 px-4 py-3 border-b border-gray-200">
                    <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide">CAD Pricing</h4>
                  </div>
                  <div className="grid grid-cols-3 divide-x divide-gray-100">
                    <div className="p-4 text-center">
                      <span className="text-sm font-medium text-gray-500 block mb-1">CAD Price</span>
                      <span className="font-mono text-lg font-semibold text-gray-900">{formatCurrency(style.cadPrice)}</span>
                    </div>
                    <div className="p-4 text-center">
                      <span className="text-sm font-medium text-gray-500 block mb-1">CAD MSRP</span>
                      <span className="font-mono text-lg font-semibold text-gray-900">{formatCurrency(style.cadMsrp)}</span>
                    </div>
                    <div className="p-4 text-center">
                      <span className="text-sm font-medium text-gray-500 block mb-1">Last Cost Sheet</span>
                      <span className="font-mono text-lg font-semibold text-gray-900">{formatCurrency(style.cadLastCostSheet)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'colors' && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-100 px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Colors</h4>
                <span className="text-sm text-gray-500 font-medium">{colors.length} total</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 text-left bg-gray-50">
                      <th className="px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wide">Code</th>
                      <th className="px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wide">Color Name</th>
                      <th className="px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wide">Status</th>
                      <th className="px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wide">Season</th>
                      <th className="px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wide text-center">Web</th>
                      <th className="px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wide">Style/Color</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {colors.map((c, i) => (
                      <tr key={c.color + i} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <span className="font-mono font-semibold text-gray-900 bg-gray-100 px-2 py-0.5 rounded text-sm">
                            {c.color}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">{c.colorDesc}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                            c.status === 'Active'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-red-100 text-red-700'
                          }`}>
                            {c.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-sm text-gray-700">{c.colorSeason}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                            c.webAvailable
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-gray-200 text-gray-500'
                          }`}>
                            {c.webAvailable ? 'Yes' : 'No'}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-sm text-gray-500">{c.styleColor}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Pricing by Season */}
        <div className="border-t-2 border-gray-200 px-6 py-5">
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-100 px-4 py-3 border-b border-gray-200">
              <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Pricing by Season</h4>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 text-left bg-gray-50">
                    <th className="px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wide">Season</th>
                    <th className="px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wide text-right">Cost</th>
                    <th className="px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wide text-right">Wholesale</th>
                    <th className="px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wide text-right">MSRP</th>
                    <th className="px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wide text-right">Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {pricingHistory.map((p, i) => (
                    <tr
                      key={p.season + i}
                      className={`${
                        p.season === style.season ? 'bg-cyan-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <td className="px-4 py-3">
                        <span className="font-mono font-semibold text-gray-900 text-sm">{p.season}</span>
                        {p.season === style.season && (
                          <span className="ml-2 text-xs bg-cyan-200 text-cyan-800 px-1.5 py-0.5 rounded">Current</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-sm text-gray-700 text-right">{formatCurrency(p.cost)}</td>
                      <td className="px-4 py-3 font-mono font-semibold text-sm text-gray-900 text-right">{formatCurrency(p.wholesale)}</td>
                      <td className="px-4 py-3 font-mono text-sm text-gray-900 text-right">{formatCurrency(p.msrp)}</td>
                      <td className="px-4 py-3 text-right">
                        {p.margin > 0 ? (
                          <span className={`font-mono font-semibold text-sm px-2 py-0.5 rounded ${
                            p.margin >= 50
                              ? 'bg-emerald-100 text-emerald-700'
                              : p.margin >= 40
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-red-100 text-red-700'
                          }`}>
                            {formatPercent(p.margin)}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {pricingHistory.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-gray-500 text-sm">
                        No pricing history available
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Sales History */}
        <div className="border-t-2 border-gray-200 px-6 py-5">
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-100 px-4 py-3 border-b border-gray-200">
              <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Sales History</h4>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 text-left bg-gray-50">
                    <th className="px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wide">Season</th>
                    <th className="px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wide text-right">Units</th>
                    <th className="px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wide text-right">Revenue</th>
                    <th className="px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wide text-right">Customers</th>
                    <th className="px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wide">Top Channel</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {salesHistory.map((s, i) => (
                    <tr key={s.season + i} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono font-semibold text-sm text-gray-900">{s.season}</td>
                      <td className="px-4 py-3 font-mono text-sm text-gray-700 text-right">{formatNumber(s.units)}</td>
                      <td className="px-4 py-3 font-mono font-semibold text-sm text-gray-900 text-right">{formatCurrencyShort(s.revenue)}</td>
                      <td className="px-4 py-3 font-mono text-sm text-gray-700 text-right">{formatNumber(s.customers)}</td>
                      <td className="px-4 py-3">
                        {s.topChannel && (
                          <span className="text-sm text-gray-700">
                            <span className="font-semibold">{s.topChannel}</span>
                            <span className="text-gray-500 ml-1">({formatPercent(s.topChannelPct)})</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {salesHistory.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-gray-500 text-sm">
                        No sales history available
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Navigation Footer */}
        <div className="border-t-2 border-gray-200 px-6 py-4 flex items-center justify-between bg-gray-50">
          <button
            onClick={goToPrevStyle}
            disabled={currentStyleIndex <= 0}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              currentStyleIndex <= 0
                ? 'text-gray-300 cursor-not-allowed'
                : 'text-gray-700 hover:bg-gray-200'
            }`}
          >
            <ChevronLeft className="w-5 h-5" />
            <span>Prev</span>
            {currentStyleIndex > 0 && (
              <span className="font-mono text-gray-500">
                [{filteredStyles[currentStyleIndex - 1].styleNumber}]
              </span>
            )}
          </button>

          <span className="text-sm text-gray-500">
            {currentStyleIndex + 1} of {filteredStyles.length} styles
          </span>

          <button
            onClick={goToNextStyle}
            disabled={currentStyleIndex >= filteredStyles.length - 1}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              currentStyleIndex >= filteredStyles.length - 1
                ? 'text-gray-300 cursor-not-allowed'
                : 'text-gray-700 hover:bg-gray-200'
            }`}
          >
            {currentStyleIndex < filteredStyles.length - 1 && (
              <span className="font-mono text-gray-500">
                [{filteredStyles[currentStyleIndex + 1].styleNumber}]
              </span>
            )}
            <span>Next</span>
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
