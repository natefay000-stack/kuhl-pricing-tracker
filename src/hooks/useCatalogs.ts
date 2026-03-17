import { useState, useMemo, useCallback, useEffect } from 'react';
import { Product } from '@/types/product';
import {
  Catalog,
  CatalogOverrides,
  BUILT_IN_CATALOGS,
  getCustomCatalogs,
  saveCustomCatalogs,
  getCatalogOverrides,
  saveCatalogOverrides,
  buildCatalogMembershipMap,
} from '@/lib/catalogs';

export function useCatalogs(products: Product[], season: string) {
  // State
  const [customCatalogs, setCustomCatalogs] = useState<Catalog[]>([]);
  const [overrides, setOverrides] = useState<CatalogOverrides>({});
  const [selectedCatalog, setSelectedCatalog] = useState<string>('master');

  // Load from localStorage on mount
  useEffect(() => {
    setCustomCatalogs(getCustomCatalogs());
    setOverrides(getCatalogOverrides());
  }, []);

  // All catalogs
  const catalogs = useMemo(
    () => [...BUILT_IN_CATALOGS, ...customCatalogs],
    [customCatalogs],
  );

  // Computed membership map — now from product workbook data
  const membershipMap = useMemo(() => {
    return buildCatalogMembershipMap(products, catalogs, overrides, season);
  }, [products, season, catalogs, overrides]);

  // Actions
  const addStyleToCatalog = useCallback(
    (catalogId: string, styleNumber: string) => {
      setOverrides((prev) => {
        const next = { ...prev, [`${catalogId}:${styleNumber}`]: 'add' as const };
        saveCatalogOverrides(next);
        return next;
      });
    },
    [],
  );

  const removeStyleFromCatalog = useCallback(
    (catalogId: string, styleNumber: string) => {
      setOverrides((prev) => {
        const next = { ...prev, [`${catalogId}:${styleNumber}`]: 'remove' as const };
        saveCatalogOverrides(next);
        return next;
      });
    },
    [],
  );

  const resetOverride = useCallback(
    (catalogId: string, styleNumber: string) => {
      setOverrides((prev) => {
        const next = { ...prev };
        delete next[`${catalogId}:${styleNumber}`];
        saveCatalogOverrides(next);
        return next;
      });
    },
    [],
  );

  const createCatalog = useCallback(
    (
      label: string,
      shortLabel: string,
      color: string,
    ) => {
      const newCatalog: Catalog = {
        id: `custom-${Date.now()}`,
        label,
        shortLabel: shortLabel.slice(0, 4).toUpperCase(),
        color,
        isBuiltIn: false,
      };
      setCustomCatalogs((prev) => {
        const next = [...prev, newCatalog];
        saveCustomCatalogs(next);
        return next;
      });
      return newCatalog;
    },
    [],
  );

  const deleteCatalog = useCallback((catalogId: string) => {
    setCustomCatalogs((prev) => {
      const next = prev.filter((c) => c.id !== catalogId);
      saveCustomCatalogs(next);
      return next;
    });
    // Clean up overrides for this catalog
    setOverrides((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((key) => {
        if (key.startsWith(`${catalogId}:`)) delete next[key];
      });
      saveCatalogOverrides(next);
      return next;
    });
  }, []);

  // Get styles for a specific catalog
  const getStylesInCatalog = useCallback(
    (catalogId: string): Set<string> => {
      const styles = new Set<string>();
      membershipMap.forEach((catalogIds, styleNumber) => {
        if (catalogIds.has(catalogId)) styles.add(styleNumber);
      });
      return styles;
    },
    [membershipMap],
  );

  // Check if a specific style override exists
  const getOverrideStatus = useCallback(
    (catalogId: string, styleNumber: string): 'add' | 'remove' | null => {
      return overrides[`${catalogId}:${styleNumber}`] || null;
    },
    [overrides],
  );

  return {
    catalogs,
    selectedCatalog,
    setSelectedCatalog,
    membershipMap,
    overrides,
    addStyleToCatalog,
    removeStyleFromCatalog,
    resetOverride,
    createCatalog,
    deleteCatalog,
    getStylesInCatalog,
    getOverrideStatus,
  };
}
