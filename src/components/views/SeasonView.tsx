'use client';

import { useState, useMemo } from 'react';
import { Product, SalesRecord, PricingRecord, CostRecord, CUSTOMER_TYPE_LABELS } from '@/types/product';
import { sortSeasons } from '@/lib/store';
import { ArrowUpDown, TrendingUp, TrendingDown, Minus, Search, X } from 'lucide-react';
import { getCurrentShippingSeason, getSeasonStatus, getSeasonStatusBadge, getCostLabel, SeasonStatus } from '@/lib/season-utils';

type MetricType = 'sales' | 'units' | 'msrp' | 'cost' | 'margin';

// Helper to clean style number by stripping unwanted suffixes (TES, etc.)
function cleanStyleNumber(styleNumber: string): string {
  // Strip "TES" suffix (test styles that shouldn't display with that suffix)
  return styleNumber.replace(/TES$/i, '');
}

// Helper to get base style number by stripping R, X, T suffixes (for combining)
function getBaseStyleNumber(styleNumber: string): string {
  // First clean the style number
  const cleaned = cleanStyleNumber(styleNumber);
  // Match style numbers ending with R, X, or T (case insensitive)
  const match = cleaned.match(/^(.+?)[RXT]$/i);
  return match ? match[1] : cleaned;
}

// Check if style description indicates it's a variant (tall/plus)
function isVariantDescription(styleDesc: string): boolean {
  if (!styleDesc) return false;
  const lower = styleDesc.toLowerCase();
  return lower.includes('tall') || lower.includes('plus');
}

interface SeasonViewProps {
  products: Product[];
  sales: SalesRecord[];
  pricing: PricingRecord[];
  costs: CostRecord[];
  selectedDivision: string;
  selectedCategory: string;
  onStyleClick: (styleNumber: string) => void;
}

function formatValue(value: number | null, metric: MetricType): string {
  if (value === null || value === undefined) return '—';

  switch (metric) {
    case 'sales':
      if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
      if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`;
      return `$${value.toFixed(0)}`;
    case 'units':
      return value.toLocaleString();
    case 'msrp':
      // Remove .00 for clean whole numbers on MSRP
      if (value % 1 === 0) return `$${value.toFixed(0)}`;
      return `$${value.toFixed(2)}`;
    case 'cost':
      return `$${value.toFixed(2)}`;
    case 'margin':
      return `${value.toFixed(1)}%`;
    default:
      return String(value);
  }
}

export default function SeasonView({
  products,
  sales,
  pricing,
  costs,
  selectedDivision,
  selectedCategory,
  onStyleClick,
}: SeasonViewProps) {
  const [metric, setMetric] = useState<MetricType>('sales');
  const [sortColumn, setSortColumn] = useState<string>('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [combineStyles, setCombineStyles] = useState(false);

  // Local filters
  const [selectedSeasons, setSelectedSeasons] = useState<string[]>([]);
  const [styleNumberFilter, setStyleNumberFilter] = useState<string>('');
  const [styleNameFilter, setStyleNameFilter] = useState<string>('');
  const [selectedDesigner, setSelectedDesigner] = useState<string>('');
  const [selectedCustomerType, setSelectedCustomerType] = useState<string>('');
  const [selectedCustomer, setSelectedCustomer] = useState<string>('');
  const [localGenderFilter, setLocalGenderFilter] = useState<string>('');
  const [localCategoryFilter, setLocalCategoryFilter] = useState<string>('');
  const [sortBy, setSortBy] = useState<'revenue' | 'units' | 'styles' | 'price' | ''>('');

  // Toggle a season in the selection
  const toggleSeason = (season: string) => {
    setSelectedSeasons((prev) =>
      prev.includes(season)
        ? prev.filter((s) => s !== season)
        : [...prev, season]
    );
  };

  // Select all Spring or all Fall seasons
  const selectSeasonType = (type: 'SP' | 'FA') => {
    const matching = seasons.filter((s) => s.endsWith(type));
    const allSelected = matching.every((s) => selectedSeasons.includes(s));
    if (allSelected) {
      // Deselect all of this type
      setSelectedSeasons((prev) => prev.filter((s) => !s.endsWith(type)));
    } else {
      // Select all of this type
      setSelectedSeasons((prev) => {
        const others = prev.filter((s) => !s.endsWith(type));
        return [...others, ...matching];
      });
    }
  };

  // Get seasons from actual data (products, sales, pricing, costs)
  // Only show seasons 24-27 (hide old seasons 10-23)
  const seasons = useMemo(() => {
    const allSeasons = new Set<string>();
    products.forEach((p) => p.season && allSeasons.add(p.season));
    sales.forEach((s) => s.season && allSeasons.add(s.season));
    pricing.forEach((p) => p.season && allSeasons.add(p.season));
    costs.forEach((c) => c.season && allSeasons.add(c.season));

    // Filter to only show seasons starting with 24, 25, 26, or 27
    const recentSeasons = Array.from(allSeasons).filter((s) =>
      s.startsWith('24') || s.startsWith('25') || s.startsWith('26') || s.startsWith('27')
    );
    return sortSeasons(recentSeasons);
  }, [products, sales, pricing, costs]);

  // Get unique designers
  const designers = useMemo(() => {
    const all = new Set<string>();
    products.forEach((p) => p.designerName && all.add(p.designerName));
    return Array.from(all).sort();
  }, [products]);

  // Get unique genders from divisions
  const genders = useMemo(() => {
    const all = new Set<string>();
    products.forEach((p) => {
      if (p.divisionDesc) {
        const lower = p.divisionDesc.toLowerCase();
        if (lower.includes("men's") && !lower.includes("women's")) all.add("Men's");
        else if (lower.includes("women's")) all.add("Women's");
        else if (lower.includes("unisex")) all.add("Unisex");
      }
    });
    sales.forEach((s) => {
      if (s.divisionDesc) {
        const lower = s.divisionDesc.toLowerCase();
        if (lower.includes("men's") && !lower.includes("women's")) all.add("Men's");
        else if (lower.includes("women's")) all.add("Women's");
        else if (lower.includes("unisex")) all.add("Unisex");
      }
    });
    return Array.from(all).sort();
  }, [products, sales]);

  // Get unique categories
  const categories = useMemo(() => {
    const all = new Set<string>();
    products.forEach((p) => p.categoryDesc && all.add(p.categoryDesc));
    sales.forEach((s) => s.categoryDesc && all.add(s.categoryDesc));
    return Array.from(all).sort();
  }, [products, sales]);

  // Hardcoded list of 6 individual channels (not derived from data which has combinations)
  const customerTypes = ['WH', 'BB', 'WD', 'EC', 'PS', 'KI'];

  // Get unique customers
  const customers = useMemo(() => {
    const all = new Set<string>();
    sales.forEach((s) => s.customer && all.add(s.customer));
    return Array.from(all).sort();
  }, [sales]);

  // Get unique styles from ALL sources (products, sales, pricing, costs)
  const filteredStyles = useMemo(() => {
    const styleMap = new Map<string, { styleNumber: string; styleDesc: string; designerName: string; divisionDesc: string; categoryDesc: string; variantStyles?: Array<{ styleNumber: string; styleDesc: string }> }>();

    // 1st: Add styles from products (Line List) - has most metadata
    products.forEach((p) => {
      const cleanedStyle = cleanStyleNumber(p.styleNumber);
      if (!styleMap.has(cleanedStyle)) {
        styleMap.set(cleanedStyle, {
          styleNumber: cleanedStyle,
          styleDesc: p.styleDesc || '',
          designerName: p.designerName || '',
          divisionDesc: p.divisionDesc || '',
          categoryDesc: p.categoryDesc || '',
        });
      }
    });

    // 2nd: Add styles from pricing that might not be in products
    pricing.forEach((p) => {
      const cleanedStyle = cleanStyleNumber(p.styleNumber);
      if (!styleMap.has(cleanedStyle)) {
        styleMap.set(cleanedStyle, {
          styleNumber: cleanedStyle,
          styleDesc: p.styleDesc || '',
          designerName: '',
          divisionDesc: '',
          categoryDesc: '',
        });
      }
    });

    // 3rd: Add styles from sales that might not be in products or pricing
    sales.forEach((s) => {
      const cleanedStyle = cleanStyleNumber(s.styleNumber);
      if (!styleMap.has(cleanedStyle)) {
        styleMap.set(cleanedStyle, {
          styleNumber: cleanedStyle,
          styleDesc: s.styleDesc || '',
          designerName: '',
          divisionDesc: s.divisionDesc || '',
          categoryDesc: s.categoryDesc || '',
        });
      }
    });

    // 4th: Add styles from costs that might not exist elsewhere
    costs.forEach((c) => {
      const cleanedStyle = cleanStyleNumber(c.styleNumber);
      if (!styleMap.has(cleanedStyle)) {
        styleMap.set(cleanedStyle, {
          styleNumber: cleanedStyle,
          styleDesc: c.styleName || '',
          designerName: '',
          divisionDesc: '',
          categoryDesc: '',
        });
      }
    });

    // Apply filters first
    const filtered = Array.from(styleMap.values()).filter((style) => {
      if (selectedDivision && style.divisionDesc !== selectedDivision) return false;
      if (selectedCategory && style.categoryDesc !== selectedCategory) return false;
      if (localCategoryFilter && style.categoryDesc !== localCategoryFilter) return false;
      if (localGenderFilter) {
        const lower = style.divisionDesc?.toLowerCase() || '';
        if (localGenderFilter === "Men's" && !(lower.includes("men's") && !lower.includes("women's"))) return false;
        if (localGenderFilter === "Women's" && !lower.includes("women's")) return false;
        if (localGenderFilter === "Unisex" && !lower.includes("unisex")) return false;
      }
      if (selectedDesigner && style.designerName !== selectedDesigner) return false;
      if (styleNumberFilter && !style.styleNumber.toLowerCase().includes(styleNumberFilter.toLowerCase())) return false;
      if (styleNameFilter && !style.styleDesc?.toLowerCase().includes(styleNameFilter.toLowerCase())) return false;
      return true;
    });

    // If combining styles, group by base style number
    if (combineStyles) {
      const combinedMap = new Map<string, { styleNumber: string; styleDesc: string; designerName: string; divisionDesc: string; categoryDesc: string; variantStyles: Array<{ styleNumber: string; styleDesc: string }> }>();

      filtered.forEach((style) => {
        const baseStyle = getBaseStyleNumber(style.styleNumber);

        const existing = combinedMap.get(baseStyle);
        if (existing) {
          // Add to variants list if it's a variant (has suffix)
          if (style.styleNumber !== baseStyle) {
            existing.variantStyles.push({
              styleNumber: style.styleNumber,
              styleDesc: style.styleDesc || '',
            });
          }
          // If this is the base style (no suffix), prefer its metadata
          if (style.styleNumber === baseStyle) {
            existing.styleDesc = style.styleDesc || existing.styleDesc;
            existing.designerName = style.designerName || existing.designerName;
            existing.divisionDesc = style.divisionDesc || existing.divisionDesc;
            existing.categoryDesc = style.categoryDesc || existing.categoryDesc;
          }
        } else {
          combinedMap.set(baseStyle, {
            styleNumber: baseStyle,
            styleDesc: style.styleDesc,
            designerName: style.designerName,
            divisionDesc: style.divisionDesc,
            categoryDesc: style.categoryDesc,
            variantStyles: style.styleNumber !== baseStyle ? [{ styleNumber: style.styleNumber, styleDesc: style.styleDesc || '' }] : [],
          });
        }
      });

      return Array.from(combinedMap.values());
    }

    return filtered;
  }, [products, sales, pricing, costs, selectedDivision, selectedCategory, localGenderFilter, localCategoryFilter, selectedDesigner, styleNumberFilter, styleNameFilter, combineStyles]);

  // Build lookup maps for quick access using WATERFALL LOGIC
  // Pricing: 1st pricebyseason → 2nd Line List → 3rd Sales (calculated)
  // Costs: 1st Landed Sheet → 2nd Line List
  const dataLookups = useMemo(() => {
    // Sales by style+season
    const salesByStyleSeason = new Map<string, { revenue: number; units: number }>();
    sales.forEach((s) => {
      if (selectedCustomerType && !s.customerType?.includes(selectedCustomerType)) return;
      if (selectedCustomer && s.customer !== selectedCustomer) return;
      if (selectedSeasons.length > 0 && !selectedSeasons.includes(s.season)) return;

      // Clean style number and use base style if combining styles
      const cleanedStyle = cleanStyleNumber(s.styleNumber);
      const styleKey = combineStyles ? getBaseStyleNumber(cleanedStyle) : cleanedStyle;
      const key = `${styleKey}-${s.season}`;
      const existing = salesByStyleSeason.get(key);
      if (existing) {
        existing.revenue += s.revenue || 0;
        existing.units += s.unitsBooked || 0;
      } else {
        salesByStyleSeason.set(key, {
          revenue: s.revenue || 0,
          units: s.unitsBooked || 0,
        });
      }
    });

    // PRICING WATERFALL FOR MSRP & WHOLESALE ONLY:
    // 1st: pricebyseason (Pricing table)
    // 2nd: Sales table
    // 3rd: Line List (Products table)
    type PricingSource = 'pricebyseason' | 'sales' | 'linelist' | 'none';
    const pricingByStyleSeason = new Map<string, { msrp: number; wholesale: number; source: PricingSource }>();

    // 1st Priority: pricebyseason file (Pricing table)
    pricing.forEach((p) => {
      if (selectedSeasons.length > 0 && !selectedSeasons.includes(p.season)) return;
      const cleanedStyle = cleanStyleNumber(p.styleNumber);
      const styleKey = combineStyles ? getBaseStyleNumber(cleanedStyle) : cleanedStyle;
      const key = `${styleKey}-${p.season}`;
      if (p.msrp > 0 || p.price > 0) {
        // For combined styles, keep the first pricing found (or could average later)
        if (!pricingByStyleSeason.has(key)) {
          pricingByStyleSeason.set(key, { msrp: p.msrp, wholesale: p.price, source: 'pricebyseason' });
        }
      }
    });

    // 2nd Priority: Sales table (only if not already set from pricing)
    sales.forEach((s) => {
      if (selectedSeasons.length > 0 && !selectedSeasons.includes(s.season)) return;
      const cleanedStyle = cleanStyleNumber(s.styleNumber);
      const styleKey = combineStyles ? getBaseStyleNumber(cleanedStyle) : cleanedStyle;
      const key = `${styleKey}-${s.season}`;
      if (!pricingByStyleSeason.has(key) && ((s.msrp && s.msrp > 0) || (s.wholesalePrice && s.wholesalePrice > 0))) {
        pricingByStyleSeason.set(key, {
          msrp: s.msrp || 0,
          wholesale: s.wholesalePrice || 0,
          source: 'sales'
        });
      }
    });

    // 3rd Priority: Line List / Products table (only if not already set)
    products.forEach((p) => {
      if (!p.season) return;
      if (selectedSeasons.length > 0 && !selectedSeasons.includes(p.season)) return;
      const cleanedStyle = cleanStyleNumber(p.styleNumber);
      const styleKey = combineStyles ? getBaseStyleNumber(cleanedStyle) : cleanedStyle;
      const key = `${styleKey}-${p.season}`;
      if (!pricingByStyleSeason.has(key) && (p.msrp > 0 || p.price > 0)) {
        pricingByStyleSeason.set(key, { msrp: p.msrp, wholesale: p.price, source: 'linelist' });
      }
    });

    // Fallback: Calculate implied wholesale from revenue/units if still no pricing
    salesByStyleSeason.forEach((salesData, key) => {
      if (!pricingByStyleSeason.has(key) && salesData.units > 0) {
        const impliedWholesale = salesData.revenue / salesData.units;
        pricingByStyleSeason.set(key, { msrp: 0, wholesale: impliedWholesale, source: 'sales' });
      }
    });

    // COST WATERFALL: Landed Sheet → Line List
    type CostSource = 'landed_sheet' | 'linelist' | 'none';
    const costsByStyleSeason = new Map<string, { landed: number; fob: number; source: CostSource }>();

    // 1st Priority: Landed Request Sheet
    costs.forEach((c) => {
      if (selectedSeasons.length > 0 && !selectedSeasons.includes(c.season)) return;
      const cleanedStyle = cleanStyleNumber(c.styleNumber);
      const styleKey = combineStyles ? getBaseStyleNumber(cleanedStyle) : cleanedStyle;
      const key = `${styleKey}-${c.season}`;
      if ((c.landed > 0 || c.fob > 0) && !costsByStyleSeason.has(key)) {
        costsByStyleSeason.set(key, { landed: c.landed, fob: c.fob, source: 'landed_sheet' });
      }
    });

    // 2nd Priority: Line List costs (only if not already set)
    products.forEach((p) => {
      if (!p.season) return;
      if (selectedSeasons.length > 0 && !selectedSeasons.includes(p.season)) return;
      const cleanedStyle = cleanStyleNumber(p.styleNumber);
      const styleKey = combineStyles ? getBaseStyleNumber(cleanedStyle) : cleanedStyle;
      const key = `${styleKey}-${p.season}`;
      if (!costsByStyleSeason.has(key) && p.cost > 0) {
        costsByStyleSeason.set(key, { landed: p.cost, fob: 0, source: 'linelist' });
      }
    });

    // Track which styles have data for each season (for filtering)
    const stylesWithDataBySeason = new Map<string, Set<string>>();
    seasons.forEach((season) => {
      stylesWithDataBySeason.set(season, new Set());
    });

    // Mark styles that have sales
    salesByStyleSeason.forEach((_, key) => {
      const [styleNumber, season] = key.split('-');
      stylesWithDataBySeason.get(season)?.add(styleNumber);
    });

    // Mark styles that have pricing
    pricingByStyleSeason.forEach((_, key) => {
      const [styleNumber, season] = key.split('-');
      stylesWithDataBySeason.get(season)?.add(styleNumber);
    });

    // Mark styles that have costs
    costsByStyleSeason.forEach((_, key) => {
      const [styleNumber, season] = key.split('-');
      stylesWithDataBySeason.get(season)?.add(styleNumber);
    });

    return { salesByStyleSeason, pricingByStyleSeason, costsByStyleSeason, stylesWithDataBySeason };
  }, [sales, pricing, costs, products, selectedCustomerType, selectedCustomer, selectedSeasons, seasons, combineStyles]);

  // Build pivot data
  const pivotData = useMemo(() => {
    return filteredStyles.map((style) => {
      const seasonData: Record<string, number | null> = {};
      const seasonSources: Record<string, string> = {};

      seasons.forEach((season) => {
        const key = `${style.styleNumber}-${season}`;
        const salesData = dataLookups.salesByStyleSeason.get(key);
        const pricingData = dataLookups.pricingByStyleSeason.get(key);
        const costData = dataLookups.costsByStyleSeason.get(key);

        let value: number | null = null;
        let source = '';

        switch (metric) {
          case 'sales':
            value = salesData?.revenue || null;
            source = salesData ? 'sales' : '';
            break;
          case 'units':
            value = salesData?.units || null;
            source = salesData ? 'sales' : '';
            break;
          case 'msrp':
            value = pricingData?.msrp || null;
            source = pricingData?.source || '';
            break;
          case 'cost':
            value = costData?.landed || null;
            source = costData?.source || '';
            break;
          case 'margin':
            // Calculate margin from wholesale and landed cost
            if (pricingData?.wholesale && pricingData.wholesale > 0 && costData?.landed) {
              value = ((pricingData.wholesale - costData.landed) / pricingData.wholesale) * 100;
              source = `${pricingData.source}/${costData.source}`;
            } else if (salesData && salesData.revenue > 0 && costData?.landed) {
              // Fallback to sales-based margin
              const totalCost = costData.landed * salesData.units;
              value = ((salesData.revenue - totalCost) / salesData.revenue) * 100;
              source = `sales/${costData.source}`;
            }
            break;
        }

        seasonData[season] = value;
        seasonSources[season] = source;
      });

      // Calculate delta (last season vs previous)
      const lastSeason = seasons[seasons.length - 1];
      const prevSeason = seasons[seasons.length - 2];
      let delta: number | null = null;
      let isNew = false;

      if (lastSeason && prevSeason) {
        const lastVal = seasonData[lastSeason];
        const prevVal = seasonData[prevSeason];

        if (lastVal !== null && prevVal !== null && prevVal !== 0) {
          delta = ((lastVal - prevVal) / Math.abs(prevVal)) * 100;
        } else if (lastVal !== null && prevVal === null) {
          isNew = true;
        }
      }

      return {
        ...style,
        seasonData,
        seasonSources,
        delta,
        isNew,
      };
    });
  }, [filteredStyles, seasons, metric, dataLookups]);

  // Filter to show only styles with data for the CURRENT METRIC in displayed seasons
  const relevantPivotData = useMemo(() => {
    // Determine which seasons to display
    const seasonsToDisplay = selectedSeasons.length > 0
      ? sortSeasons(selectedSeasons)
      : seasons;

    // Filter styles that have at least one non-null value for the current metric
    return pivotData.filter((row) => {
      return seasonsToDisplay.some((season) => {
        const value = row.seasonData[season];
        return value !== null && value !== undefined;
      });
    });
  }, [pivotData, seasons, selectedSeasons]);

  // Sort data
  const sortedData = useMemo(() => {
    // If sortBy filter is set, use it for sorting
    if (sortBy) {
      return [...relevantPivotData].sort((a, b) => {
        let aVal = 0;
        let bVal = 0;

        if (sortBy === 'price') {
          // For price, get the average price across seasons (using MSRP metric)
          let aTotal = 0;
          let aCount = 0;
          let bTotal = 0;
          let bCount = 0;

          seasons.forEach((season) => {
            const aData = a.seasonData[season];
            const bData = b.seasonData[season];
            if (aData && metric === 'msrp') {
              aTotal += aData;
              aCount += 1;
            }
            if (bData && metric === 'msrp') {
              bTotal += bData;
              bCount += 1;
            }
          });

          aVal = aCount > 0 ? aTotal / aCount : 0;
          bVal = bCount > 0 ? bTotal / bCount : 0;
        } else {
          // Calculate total across all seasons for the selected metric
          seasons.forEach((season) => {
            const aData = a.seasonData[season];
            const bData = b.seasonData[season];
            if (sortBy === 'revenue' && metric === 'sales') {
              aVal += aData || 0;
              bVal += bData || 0;
            } else if (sortBy === 'units' && metric === 'units') {
              aVal += aData || 0;
              bVal += bData || 0;
            } else if (sortBy === 'styles') {
              // For styles, count non-zero values
              if (aData) aVal += 1;
              if (bData) bVal += 1;
            }
          });
        }

        return bVal - aVal; // Descending order
      });
    }

    if (!sortColumn) {
      // Default sort: by last season descending
      const lastSeason = seasons[seasons.length - 1];
      return [...relevantPivotData].sort((a, b) => {
        const aVal = a.seasonData[lastSeason] || 0;
        const bVal = b.seasonData[lastSeason] || 0;
        return bVal - aVal;
      });
    }

    return [...relevantPivotData].sort((a, b) => {
      let aVal: number | string = 0;
      let bVal: number | string = 0;

      if (sortColumn === 'style') {
        aVal = a.styleNumber;
        bVal = b.styleNumber;
      } else if (sortColumn === 'delta') {
        aVal = a.delta || 0;
        bVal = b.delta || 0;
      } else {
        aVal = a.seasonData[sortColumn] || 0;
        bVal = b.seasonData[sortColumn] || 0;
      }

      if (sortDir === 'asc') {
        return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      }
      return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
    });
  }, [relevantPivotData, sortColumn, sortDir, seasons, sortBy, metric]);

  // Calculate totals
  const totals = useMemo(() => {
    const seasonTotals: Record<string, number> = {};

    seasons.forEach((season) => {
      let total = 0;
      relevantPivotData.forEach((row) => {
        total += row.seasonData[season] || 0;
      });
      seasonTotals[season] = total;
    });

    // Calculate delta for totals
    const lastSeason = seasons[seasons.length - 1];
    const prevSeason = seasons[seasons.length - 2];
    let delta: number | null = null;

    if (lastSeason && prevSeason && seasonTotals[prevSeason] !== 0) {
      delta = ((seasonTotals[lastSeason] - seasonTotals[prevSeason]) / Math.abs(seasonTotals[prevSeason])) * 100;
    }

    return { seasonTotals, delta };
  }, [relevantPivotData, seasons]);

  // Seasons to display (filtered if seasons are selected)
  const displaySeasons = useMemo(() => {
    if (selectedSeasons.length > 0) {
      return sortSeasons(selectedSeasons);
    }
    return seasons;
  }, [seasons, selectedSeasons]);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDir('desc');
    }
  };

  const clearFilters = () => {
    setSelectedSeasons([]);
    setStyleNumberFilter('');
    setStyleNameFilter('');
    setSelectedDesigner('');
    setSelectedCustomerType('');
    setSelectedCustomer('');
    setLocalGenderFilter('');
    setLocalCategoryFilter('');
    setSortBy('');
  };

  const hasFilters = selectedSeasons.length > 0 || styleNumberFilter || styleNameFilter || selectedDesigner || selectedCustomerType || selectedCustomer || localGenderFilter || localCategoryFilter || sortBy;

  const metricButtons = [
    { id: 'sales' as MetricType, label: 'Sales $' },
    { id: 'units' as MetricType, label: 'Units' },
    { id: 'msrp' as MetricType, label: 'MSRP' },
    { id: 'cost' as MetricType, label: 'Cost' },
    { id: 'margin' as MetricType, label: 'Margin %' },
  ];

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-4xl font-display font-bold text-gray-900">Season View</h2>
          <p className="text-base text-gray-500 mt-2">
            Compare performance across seasons
          </p>
        </div>
        {/* Current Season Context */}
        {(() => {
          const currentSeason = getCurrentShippingSeason();
          const status = getSeasonStatus(currentSeason);
          const badge = getSeasonStatusBadge(status);
          return (
            <div className="text-right">
              <div className="text-sm text-gray-500">Current Shipping Season</div>
              <div className="flex items-center justify-end gap-2 mt-1">
                <span className="text-2xl font-mono font-bold text-gray-900">{currentSeason}</span>
                <span className={`text-sm px-2 py-1 rounded ${badge.color}`}>
                  {badge.icon} {badge.label}
                </span>
              </div>
              <div className="text-xs text-gray-400 mt-1">
                {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border-2 border-gray-200 p-5">
        <div className="flex flex-wrap gap-4 items-end">
          {/* Season Multi-Select */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <label className="text-sm font-bold text-gray-600 uppercase tracking-wide">Seasons</label>
              {/* Quick select buttons */}
              <button
                onClick={() => selectSeasonType('SP')}
                className={`text-sm font-semibold px-3 py-1 rounded transition-colors ${
                  seasons.filter((s) => s.endsWith('SP')).every((s) => selectedSeasons.includes(s)) && seasons.filter((s) => s.endsWith('SP')).length > 0
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                All Spring
              </button>
              <button
                onClick={() => selectSeasonType('FA')}
                className={`text-sm font-semibold px-3 py-1 rounded transition-colors ${
                  seasons.filter((s) => s.endsWith('FA')).every((s) => selectedSeasons.includes(s)) && seasons.filter((s) => s.endsWith('FA')).length > 0
                    ? 'bg-orange-100 text-orange-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                All Fall
              </button>
              {selectedSeasons.length > 0 && (
                <button
                  onClick={() => setSelectedSeasons([])}
                  className="text-sm font-semibold px-3 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {seasons.map((season) => {
                const isSelected = selectedSeasons.includes(season);
                const isSpring = season.endsWith('SP');
                return (
                  <button
                    key={season}
                    onClick={() => toggleSeason(season)}
                    className={`px-3 py-1.5 text-sm font-mono font-semibold rounded-md transition-colors ${
                      isSelected
                        ? isSpring
                          ? 'bg-emerald-500 text-white'
                          : 'bg-orange-500 text-white'
                        : isSpring
                        ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                        : 'bg-orange-50 text-orange-700 hover:bg-orange-100'
                    }`}
                  >
                    {season}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Style Number Filter */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold text-gray-600 uppercase tracking-wide">Style #</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={styleNumberFilter}
                onChange={(e) => setStyleNumberFilter(e.target.value)}
                placeholder="Search..."
                className="pl-11 pr-4 py-2.5 text-base border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 w-[140px]"
              />
            </div>
          </div>

          {/* Style Name Filter */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold text-gray-600 uppercase tracking-wide">Style Name</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={styleNameFilter}
                onChange={(e) => setStyleNameFilter(e.target.value)}
                placeholder="Search..."
                className="pl-11 pr-4 py-2.5 text-base border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 w-[180px]"
              />
            </div>
          </div>

          {/* Designer Filter */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold text-gray-600 uppercase tracking-wide">Designer</label>
            <select
              value={selectedDesigner}
              onChange={(e) => setSelectedDesigner(e.target.value)}
              className="px-4 py-2.5 text-base border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 min-w-[160px]"
            >
              <option value="">All Designers</option>
              {designers.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          {/* Customer Type Filter */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold text-gray-600 uppercase tracking-wide">Channel</label>
            <select
              value={selectedCustomerType}
              onChange={(e) => setSelectedCustomerType(e.target.value)}
              className="px-4 py-2.5 text-base border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 min-w-[160px]"
            >
              <option value="">All Channels</option>
              {customerTypes.map((ct) => (
                <option key={ct} value={ct}>{CUSTOMER_TYPE_LABELS[ct] || ct}</option>
              ))}
            </select>
          </div>

          {/* Customer Filter */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold text-gray-600 uppercase tracking-wide">Customer</label>
            <select
              value={selectedCustomer}
              onChange={(e) => setSelectedCustomer(e.target.value)}
              className="px-4 py-2.5 text-base border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 min-w-[200px] max-w-[240px]"
            >
              <option value="">All Customers</option>
              {customers.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Gender Filter */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold text-gray-600 uppercase tracking-wide">Gender</label>
            <select
              value={localGenderFilter}
              onChange={(e) => setLocalGenderFilter(e.target.value)}
              className="px-4 py-2.5 text-base border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 min-w-[140px]"
            >
              <option value="">All Genders</option>
              {genders.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>

          {/* Category Filter */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold text-gray-600 uppercase tracking-wide">Category</label>
            <select
              value={localCategoryFilter}
              onChange={(e) => setLocalCategoryFilter(e.target.value)}
              className="px-4 py-2.5 text-base border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 min-w-[160px]"
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Sort By */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold text-gray-600 uppercase tracking-wide">Sort By</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'revenue' | 'units' | 'styles' | 'price' | '')}
              className="px-4 py-2.5 text-base border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 min-w-[140px]"
            >
              <option value="">Default</option>
              <option value="revenue">Revenue</option>
              <option value="units">Units</option>
              <option value="styles">Styles</option>
              <option value="price">Price</option>
            </select>
          </div>

          {/* Clear Filters */}
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-2 px-4 py-2.5 text-base font-semibold text-cyan-600 hover:text-cyan-700 hover:bg-cyan-50 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Metric Toggle + Combine Styles + Source Legend */}
      <div className="flex items-center gap-6">
        <div className="bg-white rounded-xl border-2 border-gray-200 p-2 inline-flex gap-1">
          {metricButtons.map((btn) => (
            <button
              key={btn.id}
              onClick={() => setMetric(btn.id)}
              className={`px-5 py-2.5 text-base font-bold rounded-lg transition-colors ${
                metric === btn.id
                  ? 'bg-cyan-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {btn.label}
            </button>
          ))}
          <div className="w-px bg-gray-300 mx-1" />
          <button
            onClick={() => setCombineStyles(!combineStyles)}
            className={`px-5 py-2.5 text-base font-bold rounded-lg transition-colors ${
              combineStyles
                ? 'bg-purple-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
            title="Combine style variants (R/X/T suffixes, tall, plus)"
          >
            Combine Styles
          </button>
        </div>

        {/* Source Legend - Priority: pricebyseason > Sales > Line List */}
        <div className="flex items-center gap-4 text-sm text-gray-500">
          <span className="font-semibold">MSRP/Price Source:</span>
          <span className="flex items-center gap-1">
            <span className="text-emerald-500">●</span> pricebyseason
          </span>
          <span className="flex items-center gap-1">
            <span className="text-amber-500">◇</span> Sales
          </span>
          <span className="flex items-center gap-1">
            <span className="text-blue-500">○</span> Line List
          </span>
          <span className="flex items-center gap-1">
            <span className="text-purple-500">■</span> Landed Sheet
          </span>
        </div>
      </div>

      {/* Pivot Table */}
      <div className="bg-white rounded-xl border-2 border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-100 border-b-2 border-gray-300">
                <th
                  className="px-4 py-3 text-left text-sm font-bold text-gray-700 uppercase tracking-wide cursor-pointer hover:text-gray-900 sticky left-0 bg-gray-100 z-10 min-w-[100px] border-r border-gray-200"
                  onClick={() => handleSort('style')}
                >
                  <div className="flex items-center gap-1">
                    Style
                    <ArrowUpDown className="w-4 h-4" />
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 uppercase tracking-wide sticky left-[100px] bg-gray-100 z-10 min-w-[200px] border-r border-gray-200">
                  Description
                </th>
                {displaySeasons.map((season) => {
                  const status = getSeasonStatus(season);
                  const badge = getSeasonStatusBadge(status);
                  const currentSeason = getCurrentShippingSeason();
                  const isCurrent = season === currentSeason;
                  // Abbreviate status labels to keep columns tight
                  const shortLabel = badge.label === 'SHIPPING' ? 'SHIP'
                    : badge.label === 'PRE-BOOK' ? 'PRE'
                    : badge.label === 'PLANNING' ? 'PLAN'
                    : badge.label;
                  return (
                    <th
                      key={season}
                      className={`px-3 py-3 text-right text-sm font-bold text-gray-700 uppercase tracking-wide cursor-pointer hover:text-gray-900 min-w-[100px] border-l border-gray-200 ${isCurrent ? 'bg-cyan-50' : 'bg-gray-100'}`}
                      onClick={() => handleSort(season)}
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        <span className="font-mono text-base">{season}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap ${badge.color}`}>
                          {shortLabel}
                        </span>
                        <ArrowUpDown className="w-3 h-3 flex-shrink-0" />
                      </div>
                    </th>
                  );
                })}
                {displaySeasons.length > 1 && (
                  <th
                    className="px-4 py-3 text-right text-sm font-bold text-gray-700 uppercase tracking-wide cursor-pointer hover:text-gray-900 w-28 border-l-2 border-gray-400 bg-gray-100"
                    onClick={() => handleSort('delta')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Δ
                      <ArrowUpDown className="w-4 h-4" />
                    </div>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {sortedData.slice(0, 100).map((row, index) => (
                <tr
                  key={row.styleNumber}
                  onClick={() => onStyleClick(row.styleNumber)}
                  className={`border-b border-gray-200 cursor-pointer transition-colors ${
                    index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                  } hover:bg-cyan-50`}
                >
                  <td className={`px-4 py-4 sticky left-0 z-10 border-r border-gray-200 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-cyan-50`}>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xl font-bold text-gray-900">
                        {row.styleNumber}
                      </span>
                      {row.variantStyles && row.variantStyles.length > 0 && (
                        <span
                          className="text-xs font-semibold px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded cursor-help"
                          title={`Combined styles:\n${row.variantStyles.map((v: { styleNumber: string; styleDesc: string }) => `• ${v.styleNumber}${v.styleDesc ? ` - ${v.styleDesc}` : ''}`).join('\n')}`}
                        >
                          +{row.variantStyles.length}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className={`px-4 py-4 text-lg text-gray-700 truncate max-w-[280px] sticky left-[100px] z-10 border-r border-gray-200 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-cyan-50`}>
                    {row.styleDesc}
                  </td>
                  {displaySeasons.map((season) => {
                    const value = row.seasonData[season];
                    const source = row.seasonSources[season];
                    // Source indicator: ● pricebyseason, ○ linelist, ◇ sales, ■ landed_sheet
                    const getSourceIndicator = (src: string) => {
                      if (src === 'pricebyseason') return { symbol: '●', color: 'text-emerald-500', title: 'Source: pricebyseason' };
                      if (src === 'linelist') return { symbol: '○', color: 'text-blue-500', title: 'Source: Line List' };
                      if (src === 'sales') return { symbol: '◇', color: 'text-amber-500', title: 'Source: Calculated from Sales' };
                      if (src === 'landed_sheet') return { symbol: '■', color: 'text-purple-500', title: 'Source: Landed Request Sheet' };
                      if (src.includes('/')) return { symbol: '◆', color: 'text-gray-400', title: `Source: ${src}` };
                      return null;
                    };
                    const indicator = source ? getSourceIndicator(source) : null;
                    return (
                      <td
                        key={season}
                        className="px-4 py-4 text-right text-lg font-mono border-l border-gray-200"
                      >
                        {value !== null ? (
                          <span className="text-gray-900 font-medium inline-flex items-center gap-1">
                            {formatValue(value, metric)}
                            {indicator && (
                              <span className={`text-xs ${indicator.color}`} title={indicator.title}>
                                {indicator.symbol}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    );
                  })}
                  {displaySeasons.length > 1 && (
                    <td className="px-4 py-4 text-right border-l-2 border-gray-400">
                      {row.isNew ? (
                        <span className="text-lg font-bold text-cyan-600 bg-cyan-50 px-3 py-1 rounded">
                          NEW
                        </span>
                      ) : row.delta !== null ? (
                        <span
                          className={`text-lg font-mono font-bold flex items-center justify-end gap-1 ${
                            row.delta > 0
                              ? 'text-emerald-600'
                              : row.delta < 0
                              ? 'text-red-600'
                              : 'text-gray-400'
                          }`}
                        >
                          {row.delta > 0 ? (
                            <TrendingUp className="w-5 h-5" />
                          ) : row.delta < 0 ? (
                            <TrendingDown className="w-5 h-5" />
                          ) : (
                            <Minus className="w-5 h-5" />
                          )}
                          {row.delta > 0 ? '+' : ''}
                          {row.delta.toFixed(0)}%
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            {/* Totals Row */}
            <tfoot>
              <tr className="bg-gray-200 border-t-2 border-gray-400">
                <td className="px-4 py-4 sticky left-0 bg-gray-200 text-xl font-bold text-gray-800 border-r border-gray-300">
                  TOTALS
                </td>
                <td className="px-4 py-4 sticky left-[100px] bg-gray-200 border-r border-gray-300"></td>
                {displaySeasons.map((season) => (
                  <td key={season} className="px-4 py-4 text-right font-mono text-lg font-bold text-gray-900 border-l border-gray-300">
                    {formatValue(totals.seasonTotals[season], metric)}
                  </td>
                ))}
                {displaySeasons.length > 1 && (
                  <td className="px-4 py-4 text-right border-l-2 border-gray-400">
                    {totals.delta !== null && (
                      <span
                        className={`font-mono text-lg font-bold ${
                          totals.delta > 0
                            ? 'text-emerald-600'
                            : totals.delta < 0
                            ? 'text-red-600'
                            : 'text-gray-400'
                        }`}
                      >
                        {totals.delta > 0 ? '+' : ''}
                        {totals.delta.toFixed(0)}%
                      </span>
                    )}
                  </td>
                )}
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 bg-gray-100 border-t-2 border-gray-300 flex items-center justify-between text-base text-gray-700">
          <span className="font-semibold">
            Showing {Math.min(sortedData.length, 100)} of {relevantPivotData.length} styles with {metricButtons.find(m => m.id === metric)?.label} data
            {filteredStyles.length > relevantPivotData.length && (
              <span className="text-gray-500 font-normal ml-1">
                ({filteredStyles.length - relevantPivotData.length} hidden)
              </span>
            )}
          </span>
          <span className="font-semibold">
            Sorted by: {sortColumn || seasons[seasons.length - 1]} {sortDir === 'desc' ? '↓' : '↑'}
          </span>
        </div>
      </div>
    </div>
  );
}
