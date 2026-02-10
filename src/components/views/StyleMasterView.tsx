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
        <h2 className="text-4xl font-display font-bold text-text-primary mb-4">Style Master</h2>
        <div className="bg-surface rounded-xl border-2 border-border-primary p-12 text-center">
          <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-text-muted text-lg">No styles found matching your filters.</p>
          <p className="text-text-faint text-sm mt-2">Try adjusting the division or category filters.</p>
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
          <h2 className="text-4xl font-display font-bold text-text-primary">Style Master</h2>
          <p className="text-base text-text-muted mt-1">
            Detailed product information and history
          </p>
        </div>

        {/* Search Box */}
        <div className="relative w-80">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-faint" />
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
              className="w-full pl-10 pr-10 py-3 border-2 border-border-primary rounded-xl text-base focus:outline-none focus:border-cyan-500"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setShowSearchResults(false);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-faint hover:text-text-secondary"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Search Results Dropdown */}
          {showSearchResults && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-surface border-2 border-border-primary rounded-xl shadow-lg z-50 max-h-80 overflow-auto">
              {searchResults.map(s => (
                <button
                  key={s.styleNumber}
                  onClick={() => handleSearchSelect(s.styleNumber)}
                  className="w-full px-4 py-3 text-left hover:bg-hover-accent flex items-center gap-3 border-b border-border-secondary last:border-0"
                >
                  <span className="font-mono font-semibold text-text-primary bg-surface-tertiary px-2 py-0.5 rounded">
                    {s.styleNumber}
                  </span>
                  <span className="text-text-secondary truncate">{s.styleDesc}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Style Card */}
      <div className="bg-surface rounded-xl border-2 border-border-primary shadow-sm overflow-hidden">
        {/* Style Header */}
        <div className="px-6 py-5 border-b-2 border-border-primary bg-surface-secondary">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-4">
                <span className="text-4xl font-mono font-bold text-text-primary">
                  {style.styleNumber}
                </span>
                <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold ${
                  isActive ? 'bg-emerald-100 dark:bg-emerald-900 text-emerald-700' : 'bg-red-100 dark:bg-red-900 text-red-700'
                }`}>
                  <Circle className={`w-2 h-2 fill-current`} />
                  {isActive ? 'Active' : 'Discontinued'}
                </span>
              </div>
              <h3 className="text-2xl font-semibold text-text-secondary mt-2">{style.styleDesc}</h3>
            </div>
            <div className="text-right">
              <p className="text-sm text-text-muted">
                <span className="font-bold">Season:</span>{' '}
                <span className="font-mono">{style.season || style.styleSeason}</span>
                {style.seasonDesc && <span className="text-text-faint"> ({style.seasonDesc})</span>}
              </p>
              <p className="text-sm text-text-muted mt-1">
                <span className="font-bold">Last Changed:</span>{' '}
                {formatDate(style.dateChangedStyle)}
              </p>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="border-b-2 border-border-primary">
          <div className="flex">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-6 py-3 text-sm font-bold uppercase tracking-wide transition-colors ${
                  activeTab === tab.id
                    ? 'bg-surface text-cyan-600 border-b-2 border-cyan-600 -mb-[2px]'
                    : 'text-text-muted hover:text-text-secondary hover:bg-hover'
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
              <div className="border border-border-primary rounded-lg overflow-hidden">
                <div className="bg-surface-tertiary px-4 py-3 border-b border-border-primary">
                  <h4 className="text-sm font-bold text-text-secondary uppercase tracking-wide">Classification</h4>
                </div>
                <div className="divide-y divide-border-secondary">
                  <div className="grid grid-cols-[140px_1fr] items-center">
                    <span className="px-4 py-3 text-sm font-medium text-text-muted bg-surface-secondary border-r border-border-secondary">Division</span>
                    <span className="px-4 py-3 text-sm font-mono text-text-primary">{style.divisionDesc || '—'}</span>
                  </div>
                  <div className="grid grid-cols-[140px_1fr] items-center">
                    <span className="px-4 py-3 text-sm font-medium text-text-muted bg-surface-secondary border-r border-border-secondary">Category</span>
                    <span className="px-4 py-3 text-sm font-mono text-text-primary">{style.categoryDesc || '—'}</span>
                  </div>
                  <div className="grid grid-cols-[140px_1fr] items-center">
                    <span className="px-4 py-3 text-sm font-medium text-text-muted bg-surface-secondary border-r border-border-secondary">Label</span>
                    <span className="px-4 py-3 text-sm font-mono text-text-primary">{style.labelDesc || '—'}</span>
                  </div>
                  <div className="grid grid-cols-[140px_1fr] items-center">
                    <span className="px-4 py-3 text-sm font-medium text-text-muted bg-surface-secondary border-r border-border-secondary">Product Line</span>
                    <span className="px-4 py-3 text-sm font-mono text-text-primary">{style.productLineDesc || style.productLine || '—'}</span>
                  </div>
                  <div className="grid grid-cols-[140px_1fr] items-center">
                    <span className="px-4 py-3 text-sm font-medium text-text-muted bg-surface-secondary border-r border-border-secondary">Style Segment</span>
                    <span className="px-4 py-3 text-sm font-mono text-text-primary">{style.styleSegmentDesc || style.styleSegment || '—'}</span>
                  </div>
                  <div className="grid grid-cols-[140px_1fr] items-center">
                    <span className="px-4 py-3 text-sm font-medium text-text-muted bg-surface-secondary border-r border-border-secondary">Master Segment</span>
                    <span className="px-4 py-3 text-sm font-mono text-text-primary">{style.masterSegmentDesc || '—'}</span>
                  </div>
                  <div className="grid grid-cols-[140px_1fr] items-center">
                    <span className="px-4 py-3 text-sm font-medium text-text-muted bg-surface-secondary border-r border-border-secondary">Merch Collection</span>
                    <span className="px-4 py-3 text-sm font-mono text-text-primary">{style.merchandiseCollectionDesc || '—'}</span>
                  </div>
                </div>
              </div>

              {/* Sourcing */}
              <div className="border border-border-primary rounded-lg overflow-hidden">
                <div className="bg-surface-tertiary px-4 py-3 border-b border-border-primary">
                  <h4 className="text-sm font-bold text-text-secondary uppercase tracking-wide">Sourcing</h4>
                </div>
                <div className="divide-y divide-border-secondary">
                  <div className="grid grid-cols-[140px_1fr] items-center">
                    <span className="px-4 py-3 text-sm font-medium text-text-muted bg-surface-secondary border-r border-border-secondary">Country of Origin</span>
                    <span className="px-4 py-3 text-sm font-mono text-text-primary">{style.countryOfOrigin || '—'}</span>
                  </div>
                  <div className="grid grid-cols-[140px_1fr] items-center">
                    <span className="px-4 py-3 text-sm font-medium text-text-muted bg-surface-secondary border-r border-border-secondary">Factory</span>
                    <span className="px-4 py-3 text-sm font-mono text-text-primary">{style.factoryName || '—'}</span>
                  </div>
                  <div className="grid grid-cols-[140px_1fr] items-center">
                    <span className="px-4 py-3 text-sm font-medium text-text-muted bg-surface-secondary border-r border-border-secondary">Primary Supplier</span>
                    <span className="px-4 py-3 text-sm font-mono text-text-primary truncate">{style.primarySupplier || '—'}</span>
                  </div>
                  <div className="grid grid-cols-[140px_1fr] items-center">
                    <span className="px-4 py-3 text-sm font-medium text-text-muted bg-surface-secondary border-r border-border-secondary">HTS Code</span>
                    <span className="px-4 py-3 text-sm font-mono text-text-primary">{style.htsCode || '—'}</span>
                  </div>
                  <div className="grid grid-cols-[140px_1fr] items-center">
                    <span className="px-4 py-3 text-sm font-medium text-text-muted bg-surface-secondary border-r border-border-secondary">Designer</span>
                    <span className="px-4 py-3 text-sm font-mono text-text-primary">{style.designerName || '—'}</span>
                  </div>
                  <div className="grid grid-cols-[140px_1fr] items-center">
                    <span className="px-4 py-3 text-sm font-medium text-text-muted bg-surface-secondary border-r border-border-secondary">Tech Designer</span>
                    <span className="px-4 py-3 text-sm font-mono text-text-primary">{style.techDesignerName || '—'}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'info' && (
            <div className="grid grid-cols-2 gap-6">
              {/* Specifications */}
              <div className="border border-border-primary rounded-lg overflow-hidden">
                <div className="bg-surface-tertiary px-4 py-3 border-b border-border-primary">
                  <h4 className="text-sm font-bold text-text-secondary uppercase tracking-wide">Specifications</h4>
                </div>
                <div className="divide-y divide-border-secondary">
                  <div className="grid grid-cols-[140px_1fr] items-center">
                    <span className="px-4 py-3 text-sm font-medium text-text-muted bg-surface-secondary border-r border-border-secondary">Carry Over</span>
                    <span className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-sm font-semibold ${
                        style.carryOver ? 'bg-blue-100 dark:bg-blue-900 text-blue-700' : 'bg-surface-tertiary text-text-secondary'
                      }`}>
                        {style.carryOver ? 'Yes' : 'No'}
                      </span>
                    </span>
                  </div>
                  <div className="grid grid-cols-[140px_1fr] items-center">
                    <span className="px-4 py-3 text-sm font-medium text-text-muted bg-surface-secondary border-r border-border-secondary">Carry Forward</span>
                    <span className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-sm font-semibold ${
                        style.carryForward ? 'bg-blue-100 dark:bg-blue-900 text-blue-700' : 'bg-surface-tertiary text-text-secondary'
                      }`}>
                        {style.carryForward ? 'Yes' : 'No'}
                      </span>
                    </span>
                  </div>
                  <div className="grid grid-cols-[140px_1fr] items-center">
                    <span className="px-4 py-3 text-sm font-medium text-text-muted bg-surface-secondary border-r border-border-secondary">Currency</span>
                    <span className="px-4 py-3 text-sm font-mono text-text-primary">{style.currency || 'USD'}</span>
                  </div>
                  <div className="grid grid-cols-[140px_1fr] items-center">
                    <span className="px-4 py-3 text-sm font-medium text-text-muted bg-surface-secondary border-r border-border-secondary">Inventory Class</span>
                    <span className="px-4 py-3 text-sm font-mono text-text-primary">
                      {style.inventoryClassificationDesc || style.inventoryClassification || '—'}
                    </span>
                  </div>
                  <div className="grid grid-cols-[140px_1fr] items-center">
                    <span className="px-4 py-3 text-sm font-medium text-text-muted bg-surface-secondary border-r border-border-secondary">Style Disc</span>
                    <span className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-sm font-semibold ${
                        style.styleDisc === 'Y' ? 'bg-red-100 dark:bg-red-900 text-red-700' : 'bg-surface-tertiary text-text-secondary'
                      }`}>
                        {style.styleDisc === 'Y' ? 'Yes' : 'No'}
                      </span>
                    </span>
                  </div>
                  {style.styleDiscReason && (
                    <div className="grid grid-cols-[140px_1fr] items-center">
                      <span className="px-4 py-3 text-sm font-medium text-text-muted bg-surface-secondary border-r border-border-secondary">Disc Reason</span>
                      <span className="px-4 py-3 text-sm font-mono text-text-primary">{style.styleDiscReason}</span>
                    </div>
                  )}
                  <div className="grid grid-cols-[140px_1fr] items-center">
                    <span className="px-4 py-3 text-sm font-medium text-text-muted bg-surface-secondary border-r border-border-secondary">Web Available</span>
                    <span className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-sm font-semibold ${
                        style.colorAvailWeb === 'Y' ? 'bg-emerald-100 dark:bg-emerald-900 text-emerald-700' : 'bg-surface-tertiary text-text-secondary'
                      }`}>
                        {style.colorAvailWeb === 'Y' ? 'Yes' : 'No'}
                      </span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Dates */}
              <div className="border border-border-primary rounded-lg overflow-hidden">
                <div className="bg-surface-tertiary px-4 py-3 border-b border-border-primary">
                  <h4 className="text-sm font-bold text-text-secondary uppercase tracking-wide">Dates</h4>
                </div>
                <div className="divide-y divide-border-secondary">
                  <div className="grid grid-cols-[160px_1fr] items-center">
                    <span className="px-4 py-3 text-sm font-medium text-text-muted bg-surface-secondary border-r border-border-secondary">Date Opened</span>
                    <span className="px-4 py-3 text-sm font-mono text-text-primary">{formatDate(style.dateOpened)}</span>
                  </div>
                  <div className="grid grid-cols-[160px_1fr] items-center">
                    <span className="px-4 py-3 text-sm font-medium text-text-muted bg-surface-secondary border-r border-border-secondary">Date Changed (Style)</span>
                    <span className="px-4 py-3 text-sm font-mono text-text-primary">{formatDate(style.dateChangedStyle)}</span>
                  </div>
                  <div className="grid grid-cols-[160px_1fr] items-center">
                    <span className="px-4 py-3 text-sm font-medium text-text-muted bg-surface-secondary border-r border-border-secondary">Date Added (Color)</span>
                    <span className="px-4 py-3 text-sm font-mono text-text-primary">{formatDate(style.dateAddedColor)}</span>
                  </div>
                  <div className="grid grid-cols-[160px_1fr] items-center">
                    <span className="px-4 py-3 text-sm font-medium text-text-muted bg-surface-secondary border-r border-border-secondary">Date Changed (Color)</span>
                    <span className="px-4 py-3 text-sm font-mono text-text-primary">{formatDate(style.dateChangedColor)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'additional' && (
            <div className="space-y-6">
              {/* Notes */}
              <div className="border border-border-primary rounded-lg overflow-hidden">
                <div className="bg-surface-tertiary px-4 py-3 border-b border-border-primary">
                  <h4 className="text-sm font-bold text-text-secondary uppercase tracking-wide">Notes</h4>
                </div>
                <div className="p-4 bg-surface">
                  <p className="text-text-secondary whitespace-pre-wrap text-sm">
                    {style.styleColorNotes || 'No notes available.'}
                  </p>
                </div>
              </div>

              {/* Selling Seasons */}
              <div className="border border-border-primary rounded-lg overflow-hidden">
                <div className="bg-surface-tertiary px-4 py-3 border-b border-border-primary">
                  <h4 className="text-sm font-bold text-text-secondary uppercase tracking-wide">Selling Seasons</h4>
                </div>
                <div className="p-4 bg-surface">
                  <p className="font-mono text-text-primary text-sm">
                    {style.sellingSeasons || '—'}
                  </p>
                </div>
              </div>

              {/* CAD Info */}
              {(style.cadPrice || style.cadMsrp) && (
                <div className="border border-border-primary rounded-lg overflow-hidden">
                  <div className="bg-surface-tertiary px-4 py-3 border-b border-border-primary">
                    <h4 className="text-sm font-bold text-text-secondary uppercase tracking-wide">CAD Pricing</h4>
                  </div>
                  <div className="grid grid-cols-3 divide-x divide-border-secondary">
                    <div className="p-4 text-center">
                      <span className="text-sm font-medium text-text-muted block mb-1">CAD Price</span>
                      <span className="font-mono text-lg font-semibold text-text-primary">{formatCurrency(style.cadPrice)}</span>
                    </div>
                    <div className="p-4 text-center">
                      <span className="text-sm font-medium text-text-muted block mb-1">CAD MSRP</span>
                      <span className="font-mono text-lg font-semibold text-text-primary">{formatCurrency(style.cadMsrp)}</span>
                    </div>
                    <div className="p-4 text-center">
                      <span className="text-sm font-medium text-text-muted block mb-1">Last Cost Sheet</span>
                      <span className="font-mono text-lg font-semibold text-text-primary">{formatCurrency(style.cadLastCostSheet)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'colors' && (
            <div className="border border-border-primary rounded-lg overflow-hidden">
              <div className="bg-surface-tertiary px-4 py-3 border-b border-border-primary flex items-center justify-between">
                <h4 className="text-sm font-bold text-text-secondary uppercase tracking-wide">Colors</h4>
                <span className="text-sm text-text-muted font-medium">{colors.length} total</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border-primary text-left bg-surface-secondary">
                      <th className="px-4 py-3 text-xs font-bold text-text-secondary uppercase tracking-wide">Code</th>
                      <th className="px-4 py-3 text-xs font-bold text-text-secondary uppercase tracking-wide">Color Name</th>
                      <th className="px-4 py-3 text-xs font-bold text-text-secondary uppercase tracking-wide">Status</th>
                      <th className="px-4 py-3 text-xs font-bold text-text-secondary uppercase tracking-wide">Season</th>
                      <th className="px-4 py-3 text-xs font-bold text-text-secondary uppercase tracking-wide text-center">Web</th>
                      <th className="px-4 py-3 text-xs font-bold text-text-secondary uppercase tracking-wide">Style/Color</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-secondary">
                    {colors.map((c, i) => (
                      <tr key={c.color + i} className="hover:bg-hover">
                        <td className="px-4 py-3">
                          <span className="font-mono font-semibold text-text-primary bg-surface-tertiary px-2 py-0.5 rounded text-sm">
                            {c.color}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-text-secondary">{c.colorDesc}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                            c.status === 'Active'
                              ? 'bg-emerald-100 dark:bg-emerald-900 text-emerald-700'
                              : 'bg-red-100 dark:bg-red-900 text-red-700'
                          }`}>
                            {c.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-sm text-text-secondary">{c.colorSeason}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                            c.webAvailable
                              ? 'bg-blue-100 dark:bg-blue-900 text-blue-700'
                              : 'bg-surface-tertiary text-text-muted'
                          }`}>
                            {c.webAvailable ? 'Yes' : 'No'}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-sm text-text-muted">{c.styleColor}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Pricing by Season */}
        <div className="border-t-2 border-border-primary px-6 py-5">
          <div className="border border-border-primary rounded-lg overflow-hidden">
            <div className="bg-surface-tertiary px-4 py-3 border-b border-border-primary">
              <h4 className="text-sm font-bold text-text-secondary uppercase tracking-wide">Pricing by Season</h4>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border-primary text-left bg-surface-secondary">
                    <th className="px-4 py-3 text-xs font-bold text-text-secondary uppercase tracking-wide">Season</th>
                    <th className="px-4 py-3 text-xs font-bold text-text-secondary uppercase tracking-wide text-right">Cost</th>
                    <th className="px-4 py-3 text-xs font-bold text-text-secondary uppercase tracking-wide text-right">Wholesale</th>
                    <th className="px-4 py-3 text-xs font-bold text-text-secondary uppercase tracking-wide text-right">MSRP</th>
                    <th className="px-4 py-3 text-xs font-bold text-text-secondary uppercase tracking-wide text-right">Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-secondary">
                  {pricingHistory.map((p, i) => (
                    <tr
                      key={p.season + i}
                      className={`${
                        p.season === style.season ? 'bg-cyan-50' : 'hover:bg-hover'
                      }`}
                    >
                      <td className="px-4 py-3">
                        <span className="font-mono font-semibold text-text-primary text-sm">{p.season}</span>
                        {p.season === style.season && (
                          <span className="ml-2 text-xs bg-cyan-200 text-cyan-800 px-1.5 py-0.5 rounded">Current</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-sm text-text-secondary text-right">{formatCurrency(p.cost)}</td>
                      <td className="px-4 py-3 font-mono font-semibold text-sm text-text-primary text-right">{formatCurrency(p.wholesale)}</td>
                      <td className="px-4 py-3 font-mono text-sm text-text-primary text-right">{formatCurrency(p.msrp)}</td>
                      <td className="px-4 py-3 text-right">
                        {p.margin > 0 ? (
                          <span className={`font-mono font-semibold text-sm px-2 py-0.5 rounded ${
                            p.margin >= 50
                              ? 'bg-emerald-100 dark:bg-emerald-900 text-emerald-700'
                              : p.margin >= 40
                              ? 'bg-amber-100 dark:bg-amber-900 text-amber-700'
                              : 'bg-red-100 dark:bg-red-900 text-red-700'
                          }`}>
                            {formatPercent(p.margin)}
                          </span>
                        ) : (
                          <span className="text-text-faint">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {pricingHistory.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-text-muted text-sm">
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
        <div className="border-t-2 border-border-primary px-6 py-5">
          <div className="border border-border-primary rounded-lg overflow-hidden">
            <div className="bg-surface-tertiary px-4 py-3 border-b border-border-primary">
              <h4 className="text-sm font-bold text-text-secondary uppercase tracking-wide">Sales History</h4>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border-primary text-left bg-surface-secondary">
                    <th className="px-4 py-3 text-xs font-bold text-text-secondary uppercase tracking-wide">Season</th>
                    <th className="px-4 py-3 text-xs font-bold text-text-secondary uppercase tracking-wide text-right">Units</th>
                    <th className="px-4 py-3 text-xs font-bold text-text-secondary uppercase tracking-wide text-right">Revenue</th>
                    <th className="px-4 py-3 text-xs font-bold text-text-secondary uppercase tracking-wide text-right">Customers</th>
                    <th className="px-4 py-3 text-xs font-bold text-text-secondary uppercase tracking-wide">Top Channel</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-secondary">
                  {salesHistory.map((s, i) => (
                    <tr key={s.season + i} className="hover:bg-hover">
                      <td className="px-4 py-3 font-mono font-semibold text-sm text-text-primary">{s.season}</td>
                      <td className="px-4 py-3 font-mono text-sm text-text-secondary text-right">{formatNumber(s.units)}</td>
                      <td className="px-4 py-3 font-mono font-semibold text-sm text-text-primary text-right">{formatCurrencyShort(s.revenue)}</td>
                      <td className="px-4 py-3 font-mono text-sm text-text-secondary text-right">{formatNumber(s.customers)}</td>
                      <td className="px-4 py-3">
                        {s.topChannel && (
                          <span className="text-sm text-text-secondary">
                            <span className="font-semibold">{s.topChannel}</span>
                            <span className="text-text-muted ml-1">({formatPercent(s.topChannelPct)})</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {salesHistory.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-text-muted text-sm">
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
        <div className="border-t-2 border-border-primary px-6 py-4 flex items-center justify-between bg-surface-secondary">
          <button
            onClick={goToPrevStyle}
            disabled={currentStyleIndex <= 0}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              currentStyleIndex <= 0
                ? 'text-gray-300 cursor-not-allowed'
                : 'text-text-secondary hover:bg-surface-tertiary'
            }`}
          >
            <ChevronLeft className="w-5 h-5" />
            <span>Prev</span>
            {currentStyleIndex > 0 && (
              <span className="font-mono text-text-muted">
                [{filteredStyles[currentStyleIndex - 1].styleNumber}]
              </span>
            )}
          </button>

          <span className="text-sm text-text-muted">
            {currentStyleIndex + 1} of {filteredStyles.length} styles
          </span>

          <button
            onClick={goToNextStyle}
            disabled={currentStyleIndex >= filteredStyles.length - 1}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              currentStyleIndex >= filteredStyles.length - 1
                ? 'text-gray-300 cursor-not-allowed'
                : 'text-text-secondary hover:bg-surface-tertiary'
            }`}
          >
            {currentStyleIndex < filteredStyles.length - 1 && (
              <span className="font-mono text-text-muted">
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
