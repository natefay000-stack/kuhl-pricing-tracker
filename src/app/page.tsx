'use client';

import { useState, useEffect, useMemo } from 'react';
import Sidebar, { ViewId } from '@/components/layout/Sidebar';
import AppHeader from '@/components/layout/AppHeader';
import FilterBar from '@/components/layout/FilterBar';
import DashboardView from '@/components/views/DashboardView';
import SeasonView from '@/components/views/SeasonView';
import SeasonCompView from '@/components/views/SeasonCompView';
import SalesView from '@/components/views/SalesView';
import CostsView from '@/components/views/CostsView';
import PricingView from '@/components/views/PricingView';
import MarginsView from '@/components/views/MarginsView';
import StyleMasterView from '@/components/views/StyleMasterView';
import LineListView from '@/components/views/LineListView';
import ValidationView from '@/components/views/ValidationView';
import CustomerView from '@/components/views/CustomerView';
import DataSourceMapView from '@/components/views/DataSourceMapView';
import InventoryView from '@/components/views/InventoryView';
import ErrorBoundary from '@/components/ErrorBoundary';
import StyleDetailPanel from '@/components/StyleDetailPanel';
import SmartImportModal from '@/components/SmartImportModal';
import { Product, SalesRecord, PricingRecord, CostRecord, InventoryRecord } from '@/types/product';
import { clearAllData } from '@/lib/db';

// Cache version - increment to invalidate cache
// v6: lightweight cache (core only, sales always streamed from snapshot)
const CACHE_VERSION = 'v6';
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

interface InventoryAggregations {
  totalCount: number;
  byType: { movementType: string; count: number; totalQty: number; totalExtension: number }[];
  byWarehouse: { warehouse: string; count: number; totalQty: number; totalExtension: number }[];
  byPeriod: { period: string; count: number; totalQty: number; totalExtension: number }[];
}

// Lightweight cache — core data only (products, pricing, costs, inventory, aggregations)
// Sales (380K records, ~112MB JSON) are NEVER cached — always streamed from /api/snapshot
interface CachedCoreData {
  products: Product[];
  pricing: PricingRecord[];
  costs: CostRecord[];
  inventory?: InventoryRecord[];
  salesAggregations?: SalesAggregations;
  inventoryAggregations?: InventoryAggregations;
  timestamp: number;
}

// Cache helpers — core data only (~13MB, fits in localStorage)
function getCachedCore(): CachedCoreData | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const data = JSON.parse(cached) as CachedCoreData;
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

function setCachedCore(data: Omit<CachedCoreData, 'timestamp'>) {
  try {
    localStorage.removeItem(CACHE_KEY);
    // Also clean up any old v5 cache that might be bloated with sales
    try { localStorage.removeItem('kuhl-data-v5'); } catch { /* ignore */ }

    const coreData = {
      products: data.products,
      pricing: data.pricing,
      costs: data.costs,
      inventory: data.inventory,
      salesAggregations: data.salesAggregations,
      inventoryAggregations: data.inventoryAggregations,
      timestamp: Date.now(),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(coreData));
  } catch (e) {
    console.warn('Cache write failed:', e);
    localStorage.removeItem(CACHE_KEY);
  }
}

function clearCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
    try { localStorage.removeItem('kuhl-data-v5'); } catch { /* ignore */ }
  } catch (e) {
    console.warn('Cache clear failed:', e);
  }
}

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<SalesRecord[]>([]);
  const [pricing, setPricing] = useState<PricingRecord[]>([]);
  const [costs, setCosts] = useState<CostRecord[]>([]);
  const [inventory, setInventory] = useState<InventoryRecord[]>([]);
  const [salesAggregations, setSalesAggregations] = useState<SalesAggregations | null>(null);
  const [invAggregations, setInvAggregations] = useState<InventoryAggregations | null>(null);
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

        // ── Helper: load sales progressively from /api/data?salesOnly=true ──
        const loadSalesProgressively = async () => {
          const PAGE_SIZE = 50000;
          let page = 0;
          let allSales: SalesRecord[] = [];
          let totalPages = 1;
          while (page < totalPages) {
            try {
              const res = await fetch(`/api/data?salesOnly=true&salesPage=${page}&salesPageSize=${PAGE_SIZE}`);
              if (!res.ok) break;
              const result = await res.json();
              if (!result.success || !result.sales) break;
              allSales = [...allSales, ...result.sales];
              totalPages = result.totalPages || 1;
              setSales(allSales);
              console.log(`Sales page ${page + 1}/${totalPages}: ${allSales.length} total`);
              page++;
            } catch (err) {
              console.warn('Sales page fetch failed:', err);
              break;
            }
          }
          return allSales;
        };

        // ── Helper: try loading sales from snapshot file (local dev) ──
        const loadSalesFromSnapshot = async (): Promise<boolean> => {
          try {
            const res = await fetch('/api/snapshot?file=sales');
            if (res.ok) {
              const salesData = await res.json();
              if (Array.isArray(salesData) && salesData.length > 0) {
                setSales(salesData);
                console.log(`Sales from snapshot: ${salesData.length} records`);
                return true;
              }
            }
          } catch { /* snapshot not available */ }
          return false;
        };

        // ── Step 1: Check lightweight core cache ──
        const cached = getCachedCore();
        if (cached) {
          console.log('Core data from cache, loading sales...');
          setLoadingStatus('Loading from cache...');
          setLoadingProgress(60);

          setProducts(cached.products);
          setPricing(cached.pricing);
          setCosts(cached.costs);
          if (cached.inventory) setInventory(cached.inventory);
          if (cached.salesAggregations) setSalesAggregations(cached.salesAggregations);
          if (cached.inventoryAggregations) setInvAggregations(cached.inventoryAggregations);
          setSales([]);

          setLoadingProgress(80);
          setIsLoading(false); // Show UI immediately

          // Load sales in background — try snapshot first, then progressive API
          const gotSnapshot = await loadSalesFromSnapshot();
          if (!gotSnapshot) {
            await loadSalesProgressively();
          }
          return;
        }

        // ── Step 2: No cache — try snapshot API (local dev) ──
        setLoadingStatus('Loading data...');
        setLoadingProgress(10);
        let coreLoaded = false;

        try {
          const coreRes = await fetch('/api/snapshot?file=core');
          if (coreRes.ok) {
            const core = await coreRes.json();
            if (core.success && core.counts?.products > 0) {
              console.log('Core data from snapshot:', core.counts);
              setLoadingProgress(70);

              const coreProducts = core.data.products || [];
              const corePricing = core.data.pricing || [];
              const coreCosts = core.data.costs || [];
              const coreInventory = core.data.inventory || [];
              const coreSalesAgg = core.salesAggregations || null;
              const coreInvAgg = core.inventoryAggregations || null;

              setProducts(coreProducts);
              setPricing(corePricing);
              setCosts(coreCosts);
              setInventory(coreInventory);
              if (coreSalesAgg) setSalesAggregations(coreSalesAgg);
              if (coreInvAgg) setInvAggregations(coreInvAgg);
              setSales([]);

              setLoadingProgress(80);
              setIsLoading(false);
              coreLoaded = true;

              setCachedCore({
                products: coreProducts, pricing: corePricing, costs: coreCosts,
                inventory: coreInventory,
                salesAggregations: coreSalesAgg || undefined,
                inventoryAggregations: coreInvAgg || undefined,
              });

              // Load sales from snapshot or progressive API
              const gotSnapshot = await loadSalesFromSnapshot();
              if (!gotSnapshot) await loadSalesProgressively();
              return;
            }
          }
        } catch (snapshotErr) {
          console.log('Snapshot not available:', snapshotErr);
        }

        // ── Step 3: No snapshot — load from database API (Vercel production) ──
        if (!coreLoaded) {
          try {
            setLoadingStatus('Loading from database...');
            setLoadingProgress(20);
            const dbResponse = await fetch('/api/data');
            if (dbResponse.ok) {
              const dbResult = await dbResponse.json();
              if (dbResult.success && dbResult.counts?.products > 0) {
                console.log('Core data from database:', dbResult.counts);
                setLoadingProgress(70);

                const dbProducts = dbResult.data.products || [];
                const dbPricing = dbResult.data.pricing || [];
                const dbCosts = dbResult.data.costs || [];
                const dbInventory = dbResult.data.inventory || [];
                const dbSalesAgg = dbResult.salesAggregations || null;
                const dbInvAgg = dbResult.inventoryAggregations || null;

                setProducts(dbProducts);
                setPricing(dbPricing);
                setCosts(dbCosts);
                setInventory(dbInventory);
                if (dbSalesAgg) setSalesAggregations(dbSalesAgg);
                if (dbInvAgg) setInvAggregations(dbInvAgg);
                setSales(dbResult.data.sales || []);

                setLoadingProgress(80);
                setIsLoading(false);
                coreLoaded = true;

                setCachedCore({
                  products: dbProducts, pricing: dbPricing, costs: dbCosts,
                  inventory: dbInventory,
                  salesAggregations: dbSalesAgg || undefined,
                  inventoryAggregations: dbInvAgg || undefined,
                });

                // Load sales progressively in background (API returns 0 sales in full mode)
                if ((dbResult.data.sales || []).length === 0 && dbResult.counts.sales > 0) {
                  console.log(`Loading ${dbResult.counts.sales} sales progressively...`);
                  await loadSalesProgressively();
                }
                if (coreLoaded) return;
              }
            }
          } catch (dbErr) {
            console.log('Database not available:', dbErr);
          }
        }

        // ── Step 4: Fallback — try Excel files (local dev only) ──
        if (!coreLoaded) {
          setLoadingStatus('Checking for local data files...');
          setLoadingProgress(20);

          try {
            const response = await fetch('/api/load-data');
            if (response.ok) {
              setLoadingStatus('Processing data...');
              setLoadingProgress(70);
              const result = await response.json();
              if (result.success) {
                setProducts(result.data.products || []);
                setSales(result.data.sales || []);
                setPricing(result.data.pricing || []);
                setCosts(result.data.costs || []);
                setInventory(result.data.inventory || []);
                coreLoaded = true;
              }
            }
          } catch (excelErr) {
            console.log('Excel files not available:', excelErr);
          }
        }

        if (!coreLoaded) {
          setLoadingStatus('Ready - Import data to get started');
        }

        setLoadingProgress(100);
        setIsLoading(false);
      } catch (err) {
        console.error('Failed to initialize data:', err);
        setLoadingStatus('Ready - Import data to get started');
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

    // Update core cache (sales not cached — too large)
    setCachedCore({ products, pricing, costs, inventory });

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

    // Update core cache
    setCachedCore({ products, pricing, costs, inventory });

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
    inventory?: Record<string, unknown>[];
  }) => {
    console.log('Importing multi-season data:', data.products?.length || 0, 'products', data.pricing?.length || 0, 'pricing', data.costs?.length || 0, 'costs', data.inventory?.length || 0, 'inventory');

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
      setCachedCore({ products: finalProducts, pricing, costs, inventory });
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
      setCachedCore({ products, pricing: newPricing, costs, inventory });
    }

    // For costs: merge with priority — Landed Cost (priority 1) > Standard Cost (priority 2)
    if (data.costs && data.costs.length > 0) {
      const newCosts = data.costs as unknown as CostRecord[];
      const importSource = newCosts[0]?.costSource || 'landed_cost';

      // Find all seasons in the imported data
      const seasonsInFile = new Set<string>();
      newCosts.forEach(c => c.season && seasonsInFile.add(c.season));
      console.log(`Importing ${importSource} costs for seasons:`, Array.from(seasonsInFile));

      let finalCosts: CostRecord[];

      if (importSource === 'landed_cost') {
        // Landed Cost is priority 1 — always wins
        // For matching seasons: replace ALL existing cost records (both landed and standard)
        const costsToKeep = costs.filter(c => !seasonsInFile.has(c.season));
        finalCosts = [...costsToKeep, ...newCosts];
      } else {
        // Standard Cost is priority 2 — only fills gaps, never overwrites landed_cost
        // Keep existing landed_cost records, replace only standard_cost (or add new)
        const costsToKeep = costs.filter(c => {
          if (!seasonsInFile.has(c.season)) return true; // Different season, keep
          if (c.costSource === 'landed_cost') return true; // Landed cost = higher priority, keep
          return false; // Same season, standard_cost or no source — replace
        });

        // From the new standard cost data, exclude styles that already have a landed_cost record
        const landedKeys = new Set(
          costsToKeep
            .filter(c => c.costSource === 'landed_cost' && seasonsInFile.has(c.season))
            .map(c => `${c.styleNumber}-${c.season}`)
        );
        const newCostsFiltered = newCosts.filter(c => !landedKeys.has(`${c.styleNumber}-${c.season}`));

        finalCosts = [...costsToKeep, ...newCostsFiltered];
        console.log(`Standard Cost import: ${newCosts.length} records, ${newCosts.length - newCostsFiltered.length} skipped (landed_cost exists), ${newCostsFiltered.length} applied`);
      }

      setCosts(finalCosts);

      // Persist to database
      try {
        if (importSource === 'landed_cost') {
          // Landed cost: delete all existing for these seasons, then insert
          for (const season of Array.from(seasonsInFile)) {
            console.log(`Deleting all costs for season: ${season} (landed_cost import)`);
            await fetch('/api/data/import', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'costs',
                season,
                data: [],
                fileName: `costs_clear_${season}`,
                replaceExisting: true,
              }),
            });
          }
        } else {
          // Standard cost: only delete existing standard_cost records for these seasons
          // (We can't selectively delete by costSource via the current API, so delete all
          //  non-landed records for these seasons and re-insert the kept ones + new ones)
          for (const season of Array.from(seasonsInFile)) {
            console.log(`Deleting costs for season: ${season} (standard_cost import)`);
            await fetch('/api/data/import', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'costs',
                season,
                data: [],
                fileName: `costs_clear_${season}`,
                replaceExisting: true,
              }),
            });
          }
          // Re-insert the kept landed_cost records for these seasons
          const landedToReinsert = costs.filter(
            c => seasonsInFile.has(c.season) && c.costSource === 'landed_cost'
          );
          if (landedToReinsert.length > 0) {
            const BATCH_SIZE = 1000;
            for (let i = 0; i < landedToReinsert.length; i += BATCH_SIZE) {
              const batch = landedToReinsert.slice(i, i + BATCH_SIZE);
              await fetch('/api/data/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  type: 'costs',
                  data: batch,
                  fileName: 'landed_cost_reinsert',
                  replaceExisting: false,
                }),
              });
            }
            console.log(`Re-inserted ${landedToReinsert.length} landed_cost records`);
          }
        }

        // Insert all the new cost data (already filtered if standard_cost)
        const costsToInsert = importSource === 'landed_cost'
          ? data.costs
          : data.costs.filter((c: Record<string, unknown>) => {
              const landedKeys = new Set(
                costs
                  .filter(ec => ec.costSource === 'landed_cost' && seasonsInFile.has(ec.season))
                  .map(ec => `${ec.styleNumber}-${ec.season}`)
              );
              return !landedKeys.has(`${c.styleNumber}-${c.season}`);
            });

        const BATCH_SIZE = 1000;
        for (let i = 0; i < costsToInsert.length; i += BATCH_SIZE) {
          const batch = costsToInsert.slice(i, i + BATCH_SIZE);
          await fetch('/api/data/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'costs',
              data: batch,
              fileName: `${importSource}_import`,
              replaceExisting: false,
            }),
          });
        }
        console.log(`${importSource} import complete: ${costsToInsert.length} records persisted`);
      } catch (dbErr) {
        console.warn('Could not persist costs to database:', dbErr);
      }

      // Update cache
      setCachedCore({ products, pricing, costs: finalCosts, inventory });
    }

    // For inventory: replace all (movement data has no season partitioning)
    if (data.inventory && data.inventory.length > 0) {
      const newInventory = data.inventory as unknown as InventoryRecord[];
      console.log('Importing inventory movement data:', newInventory.length, 'records');

      setInventory(newInventory);

      // Persist to database — delete all then insert in batches
      try {
        await fetch('/api/data/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'inventory',
            data: [],
            fileName: 'inventory_clear',
            replaceExisting: true,
          }),
        });

        const BATCH_SIZE = 1000;
        for (let i = 0; i < data.inventory.length; i += BATCH_SIZE) {
          const batch = data.inventory.slice(i, i + BATCH_SIZE);
          await fetch('/api/data/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'inventory',
              data: batch,
              fileName: 'inventory_import',
              replaceExisting: false,
            }),
          });
        }
        console.log('Inventory import complete');
      } catch (dbErr) {
        console.warn('Could not persist inventory to database:', dbErr);
      }

      // Update cache
      setCachedCore({ products, pricing, costs, inventory: newInventory });
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
    setCachedCore({ products: newProducts, pricing: newPricing, costs: newCosts, inventory });

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
              Loading data from database. Subsequent visits use cache.
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
      <main className="flex-1 ml-56 bg-surface-secondary">
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
            <ErrorBoundary viewName="Dashboard">
              <DashboardView
                products={products}
                sales={sales}
                costs={costs}
                salesAggregations={salesAggregations}
                selectedSeason={selectedSeason}
                selectedDivision={selectedDivision}
                selectedCategory={selectedCategory}
                onStyleClick={handleStyleClick}
              />
            </ErrorBoundary>
          )}

          {activeView === 'season' && (
            <ErrorBoundary viewName="Season View">
              <SeasonView
                products={products}
                sales={sales}
                pricing={pricing}
                costs={costs}
                selectedDivision={selectedDivision}
                selectedCategory={selectedCategory}
                onStyleClick={handleStyleClick}
              />
            </ErrorBoundary>
          )}

          {activeView === 'seasoncomp' && (
            <ErrorBoundary viewName="Season Comparison">
              <SeasonCompView
                products={products}
                sales={sales}
                onStyleClick={handleStyleClick}
              />
            </ErrorBoundary>
          )}

          {activeView === 'sales' && (
            <ErrorBoundary viewName="Sales">
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
            </ErrorBoundary>
          )}

          {activeView === 'inventory' && (
            <ErrorBoundary viewName="Inventory">
              <InventoryView
                products={products}
                sales={sales}
                inventory={inventory}
                inventoryAggregations={invAggregations || undefined}
                selectedSeason={selectedSeason}
                selectedDivision={selectedDivision}
                selectedCategory={selectedCategory}
                onStyleClick={handleStyleClick}
              />
            </ErrorBoundary>
          )}

          {activeView === 'costs' && (
            <ErrorBoundary viewName="Costs">
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
            </ErrorBoundary>
          )}

          {activeView === 'pricing' && (
            <ErrorBoundary viewName="Pricing">
              <PricingView
                products={products}
                pricing={pricing}
                costs={costs}
                sales={sales}
                selectedDivision={selectedDivision}
                selectedCategory={selectedCategory}
                onStyleClick={handleStyleClick}
              />
            </ErrorBoundary>
          )}

          {activeView === 'products' && (
            <ErrorBoundary viewName="Style Master">
              <StyleMasterView
                products={products}
                sales={sales}
                pricing={pricing}
                costs={costs}
                selectedDivision={selectedDivision}
                selectedCategory={selectedCategory}
              />
            </ErrorBoundary>
          )}

          {activeView === 'margins' && (
            <ErrorBoundary viewName="Margins">
              <MarginsView
                products={products}
                sales={sales}
                costs={costs}
                selectedSeason={selectedSeason}
                selectedDivision={selectedDivision}
                selectedCategory={selectedCategory}
                onStyleClick={handleStyleClick}
              />
            </ErrorBoundary>
          )}

          {activeView === 'customers' && (
            <ErrorBoundary viewName="Customers">
              <CustomerView
                products={products}
                sales={sales}
                onStyleClick={handleStyleClick}
              />
            </ErrorBoundary>
          )}

          {activeView === 'linelist' && (
            <ErrorBoundary viewName="Line List">
              <LineListView
                products={products}
                sales={sales}
                pricing={pricing}
                costs={costs}
                onStyleClick={handleStyleClick}
              />
            </ErrorBoundary>
          )}

          {activeView === 'validation' && (
            <ErrorBoundary viewName="Validation">
              <ValidationView
                products={products}
                sales={sales}
                onStyleClick={handleStyleClick}
              />
            </ErrorBoundary>
          )}

          {activeView === 'datasources' && (
            <ErrorBoundary viewName="Data Sources">
              <DataSourceMapView />
            </ErrorBoundary>
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
    </div>
  );
}
// force deploy Mon Jan 26 22:52:59 MST 2026
