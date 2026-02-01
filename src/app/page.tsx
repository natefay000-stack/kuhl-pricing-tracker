'use client';

import { useState, useEffect, useMemo } from 'react';
import Sidebar, { ViewId } from '@/components/layout/Sidebar';
import AppHeader from '@/components/layout/AppHeader';
import DashboardView from '@/components/views/DashboardView';
import SeasonView from '@/components/views/SeasonView';
import SalesView from '@/components/views/SalesView';
import CostsView from '@/components/views/CostsView';
import PricingView from '@/components/views/PricingView';
import MarginsView from '@/components/views/MarginsView';
import StyleMasterView from '@/components/views/StyleMasterView';
import LineListView from '@/components/views/LineListView';
import ValidationView from '@/components/views/ValidationView';
import SeasonCompView from '@/components/views/SeasonCompView';
import StyleDetailPanel from '@/components/StyleDetailPanel';
import SmartImportModal from '@/components/SmartImportModal';
import SeasonsAdminModal from '@/components/SeasonsAdminModal';
import { Product, SalesRecord, PricingRecord, CostRecord } from '@/types/product';
import { clearAllData } from '@/lib/db';

// Cache version - increment to invalidate cache
// v2: Added salesAggregations for correct channel/category/gender charts
const CACHE_VERSION = 'v2';
const CACHE_KEY = `kuhl-data-${CACHE_VERSION}`;

// Sales aggregation types (from API)
interface ChannelAggregation {
  channel: string;
  season: string;
  revenue: number;
  units: number;
}

interface CategoryAggregation {
  category: string;
  season: string;
  revenue: number;
  units: number;
}

interface GenderAggregation {
  gender: string;
  season: string;
  revenue: number;
  units: number;
}

interface CustomerAggregation {
  customer: string;
  customerType: string;
  season: string;
  revenue: number;
  units: number;
}

export interface SalesAggregations {
  byChannel: ChannelAggregation[];
  byCategory: CategoryAggregation[];
  byGender: GenderAggregation[];
  byCustomer: CustomerAggregation[];
}

interface CachedData {
  products: Product[];
  sales: SalesRecord[];
  pricing: PricingRecord[];
  costs: CostRecord[];
  salesAggregations?: SalesAggregations;
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
    // Clear old cache first to free up space
    localStorage.removeItem(CACHE_KEY);

    // Try to cache all data
    const fullData = { ...data, timestamp: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(fullData));
  } catch (e) {
    // If quota exceeded, try caching without sales (largest dataset)
    console.warn('Full cache failed, trying without sales:', e);
    try {
      localStorage.removeItem(CACHE_KEY);
      const reducedData = {
        products: data.products,
        sales: [], // Skip sales to save space
        pricing: data.pricing,
        costs: data.costs,
        timestamp: Date.now(),
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(reducedData));
      console.log('Cached without sales data');
    } catch (e2) {
      console.warn('Cache completely failed, will load from server:', e2);
      localStorage.removeItem(CACHE_KEY);
    }
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
  const [salesAggregations, setSalesAggregations] = useState<SalesAggregations | null>(null);
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

  // Seasons admin modal
  const [showSeasonsModal, setShowSeasonsModal] = useState(false);

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
      // Timeout to skip loading if taking too long (for local dev without DB)
      const loadingTimeout = setTimeout(() => {
        console.log('Loading timeout - showing empty state');
        setLoadingStatus('Ready - no data loaded');
        setIsLoading(false);
      }, 3000);

      try {
        // Check cache first
        setLoadingStatus('Checking cache...');
        setLoadingProgress(5);

        const cached = getCachedData();
        if (cached) {
          clearTimeout(loadingTimeout);
          console.log('Loading from cache...');
          setLoadingStatus('Loading from cache...');
          setLoadingProgress(50);

          setProducts(cached.products);
          setSales(cached.sales);
          setPricing(cached.pricing);
          setCosts(cached.costs);
          if (cached.salesAggregations) {
            setSalesAggregations(cached.salesAggregations);
          }

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
          salesAggregations: null as SalesAggregations | null,
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
                salesAggregations: dbResult.salesAggregations || null,
              };
            }
          }
        } catch (dbErr) {
          console.log('Database not available, falling back to Excel files:', dbErr);
        }

        // If database is empty, try Excel files (local dev only)
        if (data.products.length === 0) {
          setLoadingStatus('Checking for local data files...');
          setLoadingProgress(20);
          console.log('Fetching data from Excel API...');

          try {
            const response = await fetch('/api/load-data');
            setLoadingProgress(60);

            if (response.ok) {
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
                  salesAggregations: null, // Excel fallback doesn't have aggregations
                };
              }
            }
          } catch (excelErr) {
            console.log('Excel files not available:', excelErr);
          }
        }

        // If still no data, show empty state (user needs to import)
        if (data.products.length === 0) {
          console.log('No data found - user needs to import via Season Import Modal');
          setLoadingStatus('Ready - Import data to get started');
        }

        setLoadingProgress(85);
        setProducts(data.products);
        setSales(data.sales);
        setPricing(data.pricing);
        setCosts(data.costs);
        if (data.salesAggregations) {
          setSalesAggregations(data.salesAggregations);
        }

        // Cache for next time
        setLoadingStatus('Caching data...');
        setLoadingProgress(95);
        setCachedData({
          products: data.products,
          sales: data.sales,
          pricing: data.pricing,
          costs: data.costs,
          salesAggregations: data.salesAggregations || undefined,
        });

        setLoadingProgress(100);
        clearTimeout(loadingTimeout);
        setIsLoading(false);
      } catch (err) {
        console.error('Failed to initialize data:', err);
        setLoadingStatus('Ready - Import data to get started');
        clearTimeout(loadingTimeout);
        setIsLoading(false);
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

  // Handle sales-only import (all seasons at once)
  const handleSalesOnlyImport = async (data: {
    sales: Record<string, unknown>[];
  }) => {
    console.log('Importing sales-only data:', data.sales.length, 'records');

    // Replace all sales with new data
    const newSales = data.sales as unknown as SalesRecord[];
    setSales(newSales);

    // Update cache
    setCachedData({
      products,
      sales: newSales,
      pricing,
      costs,
    });

    // Persist to database (full refresh - no season filter)
    try {
      const BATCH_SIZE = 1000;
      const totalBatches = Math.ceil(data.sales.length / BATCH_SIZE);
      console.log(`Importing ${data.sales.length} sales records in ${totalBatches} batches`);

      for (let i = 0; i < data.sales.length; i += BATCH_SIZE) {
        const batch = data.sales.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        console.log(`Importing sales batch ${batchNum}/${totalBatches}`);

        await fetch('/api/data/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'sales',
            // No season - will delete all sales on first batch
            data: batch,
            fileName: `full_sales_import_batch_${batchNum}`,
            replaceExisting: i === 0, // Only replace on first batch
          }),
        });
      }
      console.log('Sales data persisted to database');
    } catch (dbErr) {
      console.warn('Could not persist to database:', dbErr);
    }

    // Close the modal
    setShowImportModal(false);
  };

  // Handle sales REPLACE import - delete existing sales for specified seasons, then insert new
  const handleSalesReplaceImport = async (data: {
    sales: Record<string, unknown>[];
    seasons: string[];
  }) => {
    console.log('REPLACE import:', data.sales.length, 'sales records for seasons:', data.seasons);

    // Keep sales from seasons NOT being replaced
    const seasonsSet = new Set(data.seasons);
    const salesToKeep = sales.filter(s => !seasonsSet.has(s.season));
    const newSales = data.sales as unknown as SalesRecord[];
    const finalSales = [...salesToKeep, ...newSales];

    setSales(finalSales);

    // Update cache
    setCachedData({
      products,
      sales: finalSales,
      pricing,
      costs,
    });

    // Persist to database - delete then insert for each season
    try {
      // First, delete existing sales for each season
      for (const season of data.seasons) {
        console.log(`Deleting existing sales for season: ${season}`);
        await fetch('/api/data/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'sales',
            season,
            data: [], // Empty data with replaceExisting will just delete
            fileName: `sales_clear_${season}`,
            replaceExisting: true,
          }),
        });
      }

      // Then insert all new sales in batches
      const BATCH_SIZE = 5000;
      const totalBatches = Math.ceil(data.sales.length / BATCH_SIZE);
      console.log(`Inserting ${data.sales.length} sales records in ${totalBatches} batches`);

      for (let i = 0; i < data.sales.length; i += BATCH_SIZE) {
        const batch = data.sales.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        console.log(`Inserting sales batch ${batchNum}/${totalBatches}`);

        await fetch('/api/data/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'sales',
            data: batch,
            fileName: `sales_replace_batch_${batchNum}`,
            replaceExisting: false, // Already deleted, just insert
          }),
        });
      }
      console.log('Sales REPLACE import complete');
    } catch (dbErr) {
      console.warn('Could not persist sales to database:', dbErr);
    }

    // Close the modal
    setShowImportModal(false);
  };

  // Handle multi-season import (products, pricing, or costs that span multiple seasons)
  const handleMultiSeasonImport = async (data: {
    products?: Record<string, unknown>[];
    pricing?: Record<string, unknown>[];
    costs?: Record<string, unknown>[];
  }) => {
    console.log('Importing multi-season data:', data.products?.length || 0, 'products', data.pricing?.length || 0, 'pricing', data.costs?.length || 0, 'costs');

    // For products: clean slate per season - delete existing products for each season in file, then add new
    if (data.products && data.products.length > 0) {
      const newProducts = data.products as unknown as Product[];

      // Find all seasons in the imported data
      const seasonsInFile = new Set<string>();
      newProducts.forEach(p => p.season && seasonsInFile.add(p.season));
      console.log('Seasons in imported Line List:', Array.from(seasonsInFile));

      // Keep products from seasons NOT in the file, replace those that ARE in the file
      const productsToKeep = products.filter(p => !seasonsInFile.has(p.season));
      const finalProducts = [...productsToKeep, ...newProducts];
      setProducts(finalProducts);

      // Persist to database - delete then insert for each season
      try {
        // First, delete existing products for each season in the file
        for (const season of Array.from(seasonsInFile)) {
          console.log(`Deleting existing products for season: ${season}`);
          await fetch('/api/data/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'products',
              season,
              data: [], // Empty data with replaceExisting will just delete
              fileName: `line_list_clear_${season}`,
              replaceExisting: true,
            }),
          });
        }

        // Then insert all new products in batches
        const BATCH_SIZE = 1000;
        for (let i = 0; i < data.products.length; i += BATCH_SIZE) {
          const batch = data.products.slice(i, i + BATCH_SIZE);
          await fetch('/api/data/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'products',
              data: batch,
              fileName: 'line_list_import',
              replaceExisting: false, // Already deleted, just insert
            }),
          });
        }
        console.log('Line List import complete');
      } catch (dbErr) {
        console.warn('Could not persist products to database:', dbErr);
      }

      // Update cache
      setCachedData({
        products: finalProducts,
        sales,
        pricing,
        costs,
      });
    }

    // For pricing: replace all pricing with new data
    if (data.pricing && data.pricing.length > 0) {
      const newPricing = data.pricing as unknown as PricingRecord[];
      setPricing(newPricing);

      // Persist to database
      try {
        const BATCH_SIZE = 1000;
        for (let i = 0; i < data.pricing.length; i += BATCH_SIZE) {
          const batch = data.pricing.slice(i, i + BATCH_SIZE);
          await fetch('/api/data/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'pricing',
              data: batch,
              fileName: 'multi_season_pricing_import',
              replaceExisting: i === 0,
            }),
          });
        }
      } catch (dbErr) {
        console.warn('Could not persist pricing to database:', dbErr);
      }

      // Update cache
      setCachedData({
        products,
        sales,
        pricing: newPricing,
        costs,
      });
    }

    // For costs: replace all costs with new data
    if (data.costs && data.costs.length > 0) {
      const newCosts = data.costs as unknown as CostRecord[];
      setCosts(newCosts);

      // Persist to database
      try {
        const BATCH_SIZE = 1000;
        for (let i = 0; i < data.costs.length; i += BATCH_SIZE) {
          const batch = data.costs.slice(i, i + BATCH_SIZE);
          await fetch('/api/data/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'costs',
              data: batch,
              fileName: 'multi_season_costs_import',
              replaceExisting: i === 0,
            }),
          });
        }
      } catch (dbErr) {
        console.warn('Could not persist costs to database:', dbErr);
      }

      // Update cache
      setCachedData({
        products,
        sales,
        pricing,
        costs: newCosts,
      });
    }

    // Close the modal
    setShowImportModal(false);
  };

  // Handle import from Season Import Modal
  const handleSeasonImport = async (data: {
    products: Record<string, unknown>[];
    pricing: Record<string, unknown>[];
    costs: Record<string, unknown>[];
    sales: Record<string, unknown>[];
    season: string;
  }) => {
    console.log('Importing season data:', data.season, data.products.length, 'products', data.pricing?.length || 0, 'pricing', data.sales?.length || 0, 'sales');

    // Remove existing data for this season, then add new data
    const filteredProducts = products.filter(p => p.season !== data.season);
    const filteredPricing = pricing.filter(p => p.season !== data.season);
    const filteredCosts = costs.filter(c => c.season !== data.season);
    const filteredSales = sales.filter(s => s.season !== data.season);

    // Add new products, pricing, costs, and sales (cast through unknown to satisfy TypeScript)
    const newProducts = [...filteredProducts, ...(data.products as unknown as Product[])];
    const newPricing = [...filteredPricing, ...(data.pricing as unknown as PricingRecord[])];
    const newCosts = [...filteredCosts, ...(data.costs as unknown as CostRecord[])];
    const newSales = [...filteredSales, ...(data.sales as unknown as SalesRecord[])];

    setProducts(newProducts);
    setPricing(newPricing);
    setCosts(newCosts);
    setSales(newSales);

    // Update cache with new data
    setCachedData({
      products: newProducts,
      sales: newSales,
      pricing: newPricing,
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

      // Import pricing to database
      if (data.pricing && data.pricing.length > 0) {
        await fetch('/api/data/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'pricing',
            season: data.season,
            data: data.pricing,
            fileName: `${data.season}_pricing_import`,
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

      // Import sales to database in batches (for large files)
      if (data.sales && data.sales.length > 0) {
        const BATCH_SIZE = 500;
        const totalBatches = Math.ceil(data.sales.length / BATCH_SIZE);
        console.log(`Importing ${data.sales.length} sales records in ${totalBatches} batches`);

        for (let i = 0; i < data.sales.length; i += BATCH_SIZE) {
          const batch = data.sales.slice(i, i + BATCH_SIZE);
          const batchNum = Math.floor(i / BATCH_SIZE) + 1;
          console.log(`Importing sales batch ${batchNum}/${totalBatches}`);

          await fetch('/api/data/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'sales',
              season: data.season,
              data: batch,
              fileName: `${data.season}_sales_import_batch_${batchNum}`,
              replaceExisting: i === 0, // Only replace on first batch
            }),
          });
        }
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
        onSeasonsClick={() => setShowSeasonsModal(true)}
      />

      {/* Main Content */}
      <main className="flex-1 ml-56 bg-gray-50">
        {/* Header */}
        <AppHeader
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onRefresh={handleRefresh}
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

          {activeView === 'seasoncomp' && (
            <SeasonCompView
              products={products}
              sales={sales}
              onStyleClick={handleStyleClick}
            />
          )}

          {activeView === 'sales' && (
            <SalesView
              products={products}
              sales={sales}
              pricing={pricing}
              costs={costs}
              salesAggregations={salesAggregations}
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
              sales={sales}
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

          {activeView === 'validation' && (
            <ValidationView
              products={products}
              sales={sales}
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

      {/* Smart Import Modal */}
      {showImportModal && (
        <SmartImportModal
          existingSeasons={seasons}
          onImport={handleSeasonImport}
          onImportSalesOnly={handleSalesOnlyImport}
          onImportMultiSeason={handleMultiSeasonImport}
          onImportSalesReplace={handleSalesReplaceImport}
          onClose={() => setShowImportModal(false)}
        />
      )}

      {/* Seasons Admin Modal */}
      {showSeasonsModal && (
        <SeasonsAdminModal
          onClose={() => setShowSeasonsModal(false)}
          onSeasonsUpdated={() => {
            // Could refresh data here if needed
          }}
        />
      )}
    </div>
  );
}
// force deploy Mon Jan 26 22:52:59 MST 2026
