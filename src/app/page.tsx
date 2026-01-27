'use client';

import { useState, useEffect, useMemo } from 'react';
import Sidebar, { ViewId } from '@/components/layout/Sidebar';
import AppHeader from '@/components/layout/AppHeader';
import FilterBar from '@/components/layout/FilterBar';
import DashboardView from '@/components/views/DashboardView';
import SeasonView from '@/components/views/SeasonView';
import SalesView from '@/components/views/SalesView';
import CostsView from '@/components/views/CostsView';
import PricingView from '@/components/views/PricingView';
import MarginsView from '@/components/views/MarginsView';
import StyleMasterView from '@/components/views/StyleMasterView';
import LineListView from '@/components/views/LineListView';
import StyleDetailPanel from '@/components/StyleDetailPanel';
import SeasonImportModal from '@/components/SeasonImportModal';
import { Product, SalesRecord, PricingRecord, CostRecord } from '@/types/product';
import { clearAllData } from '@/lib/db';

// Cache version - increment to invalidate cache
const CACHE_VERSION = 'v1';
const CACHE_KEY = `kuhl-data-${CACHE_VERSION}`;

interface CachedData {
  products: Product[];
  sales: SalesRecord[];
  pricing: PricingRecord[];
  costs: CostRecord[];
  timestamp: number;
}

// Cache helpers using localStorage (simpler than IndexedDB)
function getCachedData(): CachedData | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const data = JSON.parse(cached) as CachedData;
      // Cache valid for 1 hour
      if (Date.now() - data.timestamp < 60 * 60 * 1000) {
        return data;
      }
    }
  } catch (e) {
    console.warn('Cache read failed:', e);
  }
  return null;
}

function setCachedData(data: Omit<CachedData, 'timestamp'>) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      ...data,
      timestamp: Date.now(),
    }));
  } catch (e) {
    console.warn('Cache write failed:', e);
  }
}

function clearCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch (e) {
    console.warn('Cache clear failed:', e);
  }
}

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<SalesRecord[]>([]);
  const [pricing, setPricing] = useState<PricingRecord[]>([]);
  const [costs, setCosts] = useState<CostRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState<string>('Checking cache...');
  const [loadingProgress, setLoadingProgress] = useState<number>(0);

  // UI State
  const [activeView, setActiveView] = useState<ViewId>('dashboard');
  const [searchQuery, setSearchQuery] = useState('');

  // Filter state
  const [selectedSeason, setSelectedSeason] = useState<string>('');
  const [selectedDivision, setSelectedDivision] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');

  // Style detail panel
  const [selectedStyleNumber, setSelectedStyleNumber] = useState<string | null>(null);

  // Import modal
  const [showImportModal, setShowImportModal] = useState(false);

  // Derive filter options from data
  const seasons = useMemo(() => {
    const all = new Set<string>();
    products.forEach(p => p.season && all.add(p.season));
    sales.forEach(s => s.season && all.add(s.season));
    return Array.from(all).sort();
  }, [products, sales]);

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

  // Load data on mount
  useEffect(() => {
    async function initializeData() {
      try {
        // Check cache first
        setLoadingStatus('Checking cache...');
        setLoadingProgress(5);

        const cached = getCachedData();
        if (cached) {
          console.log('Loading from cache...');
          setLoadingStatus('Loading from cache...');
          setLoadingProgress(50);

          setProducts(cached.products);
          setSales(cached.sales);
          setPricing(cached.pricing);
          setCosts(cached.costs);

          setLoadingProgress(100);
          setIsLoading(false);
          return;
        }

        // Try loading from database first (for deployed environment)
        setLoadingStatus('Connecting to database...');
        setLoadingProgress(10);
        console.log('Trying database API...');

        let data = {
          products: [] as Product[],
          sales: [] as SalesRecord[],
          pricing: [] as PricingRecord[],
          costs: [] as CostRecord[],
        };

        try {
          const dbResponse = await fetch('/api/data');
          if (dbResponse.ok) {
            const dbResult = await dbResponse.json();
            if (dbResult.success && dbResult.counts.products > 0) {
              console.log('Loaded from database:', dbResult.counts);
              setLoadingProgress(70);
              data = {
                products: dbResult.data.products || [],
                sales: dbResult.data.sales || [],
                pricing: dbResult.data.pricing || [],
                costs: dbResult.data.costs || [],
              };
            }
          }
        } catch (dbErr) {
          console.log('Database not available, falling back to Excel files:', dbErr);
        }

        // If database is empty, fall back to Excel files (local dev)
        if (data.products.length === 0) {
          setLoadingStatus('Loading Excel files (this may take a moment)...');
          setLoadingProgress(20);
          console.log('Fetching data from Excel API...');

          const response = await fetch('/api/load-data');
          setLoadingProgress(60);

          if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
          }

          setLoadingStatus('Processing data...');
          setLoadingProgress(70);

          const result = await response.json();
          console.log('Loaded from Excel:', result.counts);

          if (result.success) {
            data = {
              products: result.data.products || [],
              sales: result.data.sales || [],
              pricing: result.data.pricing || [],
              costs: result.data.costs || [],
            };
          }
        }

        setLoadingProgress(85);
        setProducts(data.products);
        setSales(data.sales);
        setPricing(data.pricing);
        setCosts(data.costs);

        // Cache for next time
        setLoadingStatus('Caching data...');
        setLoadingProgress(95);
        setCachedData(data);

        setLoadingProgress(100);
        setIsLoading(false);
      } catch (err) {
        console.error('Failed to initialize data:', err);
        setLoadingStatus(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    initializeData();
  }, []);

  // Handle refresh
  const handleRefresh = async () => {
    if (confirm('Reload data from Excel files? This will clear the cache and reload.')) {
      clearCache();
      setIsLoading(true);
      await clearAllData();
      window.location.reload();
    }
  };

  // Handle style click
  const handleStyleClick = (styleNumber: string) => {
    setSelectedStyleNumber(styleNumber);
  };

  // Handle import from Season Import Modal
  const handleSeasonImport = async (data: {
    products: Record<string, unknown>[];
    costs: Record<string, unknown>[];
    season: string;
  }) => {
    console.log('Importing season data:', data.season, data.products.length, 'products');

    // Remove existing data for this season, then add new data
    const filteredProducts = products.filter(p => p.season !== data.season);
    const filteredCosts = costs.filter(c => c.season !== data.season);

    // Add new products and costs (cast through unknown to satisfy TypeScript)
    const newProducts = [...filteredProducts, ...(data.products as unknown as Product[])];
    const newCosts = [...filteredCosts, ...(data.costs as unknown as CostRecord[])];

    setProducts(newProducts);
    setCosts(newCosts);

    // Update cache with new data
    setCachedData({
      products: newProducts,
      sales,
      pricing,
      costs: newCosts,
    });

    // Also persist to database (for deployed environment)
    try {
      // Import products to database
      if (data.products.length > 0) {
        await fetch('/api/data/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'products',
            season: data.season,
            data: data.products,
            fileName: `${data.season}_import`,
            replaceExisting: true,
          }),
        });
      }

      // Import costs to database
      if (data.costs.length > 0) {
        await fetch('/api/data/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'costs',
            season: data.season,
            data: data.costs,
            fileName: `${data.season}_costs_import`,
            replaceExisting: true,
          }),
        });
      }
      console.log('Data persisted to database');
    } catch (dbErr) {
      console.warn('Could not persist to database (may not be configured):', dbErr);
    }

    // Close the modal
    setShowImportModal(false);

    // Set filter to show the imported season
    setSelectedSeason(data.season);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center max-w-md w-full px-8">
          {/* Logo */}
          <div className="mb-8">
            <h1 className="text-4xl font-black text-white tracking-tight">KÜHL</h1>
            <p className="text-cyan-400 text-sm font-medium mt-1">Pricing Tracker</p>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-gray-700 rounded-full h-2 mb-4 overflow-hidden">
            <div
              className="bg-cyan-500 h-2 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${loadingProgress}%` }}
            />
          </div>

          {/* Status */}
          <p className="text-gray-400 text-sm font-medium">{loadingStatus}</p>

          {/* Tip for slow loads */}
          {loadingProgress > 10 && loadingProgress < 80 && (
            <p className="text-gray-500 text-xs mt-4">
              First load processes 250K+ records. Subsequent loads use cache.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <Sidebar
        activeView={activeView}
        onViewChange={setActiveView}
        onImportClick={() => setShowImportModal(true)}
      />

      {/* Main Content */}
      <main className="flex-1 ml-56 bg-gray-50">
        {/* Header */}
        <AppHeader
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onRefresh={handleRefresh}
        />

        {/* Filter Bar */}
        <FilterBar
          activeView={activeView}
          seasons={seasons}
          divisions={divisions}
          categories={categories}
          selectedSeason={selectedSeason}
          selectedDivision={selectedDivision}
          selectedCategory={selectedCategory}
          onSeasonChange={setSelectedSeason}
          onDivisionChange={setSelectedDivision}
          onCategoryChange={setSelectedCategory}
        />

        {/* View Content */}
        <div className="min-h-[calc(100vh-112px)]">
          {activeView === 'dashboard' && (
            <DashboardView
              products={products}
              sales={sales}
              costs={costs}
              selectedSeason={selectedSeason}
              selectedDivision={selectedDivision}
              selectedCategory={selectedCategory}
              onStyleClick={handleStyleClick}
            />
          )}

          {activeView === 'season' && (
            <SeasonView
              products={products}
              sales={sales}
              pricing={pricing}
              costs={costs}
              selectedDivision={selectedDivision}
              selectedCategory={selectedCategory}
              onStyleClick={handleStyleClick}
            />
          )}

          {activeView === 'sales' && (
            <SalesView
              products={products}
              sales={sales}
              pricing={pricing}
              costs={costs}
              selectedSeason={selectedSeason}
              selectedDivision={selectedDivision}
              selectedCategory={selectedCategory}
              onStyleClick={handleStyleClick}
            />
          )}

          {activeView === 'costs' && (
            <CostsView
              products={products}
              pricing={pricing}
              costs={costs}
              sales={sales}
              selectedSeason={selectedSeason}
              selectedDivision={selectedDivision}
              selectedCategory={selectedCategory}
              onStyleClick={handleStyleClick}
            />
          )}

          {activeView === 'pricing' && (
            <PricingView
              products={products}
              pricing={pricing}
              costs={costs}
              selectedDivision={selectedDivision}
              selectedCategory={selectedCategory}
              onStyleClick={handleStyleClick}
            />
          )}

          {activeView === 'products' && (
            <StyleMasterView
              products={products}
              sales={sales}
              pricing={pricing}
              costs={costs}
              selectedDivision={selectedDivision}
              selectedCategory={selectedCategory}
            />
          )}

          {activeView === 'margins' && (
            <MarginsView
              products={products}
              sales={sales}
              costs={costs}
              selectedSeason={selectedSeason}
              selectedDivision={selectedDivision}
              selectedCategory={selectedCategory}
              onStyleClick={handleStyleClick}
            />
          )}

          {activeView === 'linelist' && (
            <LineListView
              products={products}
              sales={sales}
              pricing={pricing}
              costs={costs}
              onStyleClick={handleStyleClick}
            />
          )}
        </div>
      </main>

      {/* Style Detail Panel */}
      {selectedStyleNumber && (
        <StyleDetailPanel
          styleNumber={selectedStyleNumber}
          products={products}
          sales={sales}
          pricing={pricing}
          costs={costs}
          onClose={() => setSelectedStyleNumber(null)}
        />
      )}

      {/* Season Import Modal */}
      {showImportModal && (
        <SeasonImportModal
          existingSeasons={seasons}
          onImport={handleSeasonImport}
          onClose={() => setShowImportModal(false)}
        />
      )}
    </div>
  );
}
