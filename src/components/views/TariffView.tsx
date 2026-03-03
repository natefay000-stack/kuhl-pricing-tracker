'use client';

import { useState, useMemo, useEffect } from 'react';
import { Product, SalesRecord, CostRecord } from '@/types/product';
import { matchesSeason, sortSeasons } from '@/lib/store';
import { matchesDivision } from '@/utils/divisionMap';
import {
  formatCurrency,
  formatCurrencyShort,
  formatPercent,
  formatNumber,
  getMarginColor,
  getMarginBg,
} from '@/utils/format';
import { buildCSV } from '@/utils/exportData';
import {
  Scale,
  Globe,
  DollarSign,
  TrendingDown,
  AlertTriangle,
  Download,
  Plus,
  X,
  ChevronRight,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────

interface TariffScenario {
  id: string;
  name: string;
  countryRates: Record<string, number>; // country → tariff rate as decimal (0.25 = 25%)
  isBaseline: boolean;
}

interface EnrichedCostRow {
  styleNumber: string;
  styleName: string;
  season: string;
  countryOfOrigin: string;
  factory: string;
  divisionDesc: string;
  categoryDesc: string;
  fob: number;
  currentDutyCost: number;
  currentTariffCost: number;
  freightCost: number;
  overheadCost: number;
  currentLanded: number;
  suggestedWholesale: number;
  currentMargin: number | null; // as percentage 0-100
  revenue: number;
  units: number;
}

interface CountryExposure {
  country: string;
  styleCount: number;
  totalFob: number;
  avgFob: number;
  totalRevenue: number;
  revenuePct: number;
  currentAvgTariffRate: number;
  avgLanded: number;
  avgMargin: number | null;
}

interface ScenarioStyleResult {
  styleNumber: string;
  styleName: string;
  countryOfOrigin: string;
  fob: number;
  currentLanded: number;
  currentMargin: number | null;
  scenarioLanded: number;
  scenarioMargin: number | null;
  marginDelta: number | null;
  wholesaleToMaintain: number | null;
  wholesale: number;
  revenue: number;
}

interface ScenarioResult {
  scenario: TariffScenario;
  results: ScenarioStyleResult[];
  aggregate: {
    avgMargin: number | null;
    avgMarginDelta: number | null;
    stylesBelowTarget: number;
    revenueAtRisk: number;
    avgLandedIncreasePct: number;
  };
}

// ── Helpers ────────────────────────────────────────────────────────

function normalizeCountry(raw: string): string {
  if (!raw || !raw.trim()) return 'Unknown';
  return raw.trim().replace(/\b\w/g, c => c.toUpperCase()).replace(/\B\w+/g, w => w.toLowerCase());
}

// ── Props ──────────────────────────────────────────────────────────

interface TariffViewProps {
  products: Product[];
  sales: SalesRecord[];
  costs: CostRecord[];
  selectedSeason: string;
  selectedDivision: string;
  selectedCategory: string;
  searchQuery?: string;
  onStyleClick: (styleNumber: string) => void;
}

// ── Component ──────────────────────────────────────────────────────

export default function TariffView({
  products,
  sales,
  costs,
  selectedSeason,
  selectedDivision,
  selectedCategory,
  searchQuery: globalSearchQuery = '',
  onStyleClick,
}: TariffViewProps) {

  // ── State ──────────────────────────────────────────────────────
  const [activeSection, setActiveSection] = useState<'exposure' | 'scenarios' | 'impact'>('exposure');
  const [targetMargin, setTargetMargin] = useState(48);
  const [activeScenarioId, setActiveScenarioId] = useState('scenario-1');
  const [scenarios, setScenarios] = useState<TariffScenario[]>([
    { id: 'scenario-1', name: 'Current', countryRates: {}, isBaseline: true },
    { id: 'scenario-2', name: 'Proposed', countryRates: {}, isBaseline: false },
  ]);
  const [displayLimit, setDisplayLimit] = useState(50);
  const [sortField, setSortField] = useState<'marginDelta' | 'revenue' | 'fob' | 'styleNumber'>('marginDelta');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // ── Available seasons ──────────────────────────────────────────
  const availableSeasons = useMemo(() => {
    const s = new Set<string>();
    costs.forEach(c => c.season && s.add(c.season));
    return sortSeasons(Array.from(s));
  }, [costs]);

  const filterSeason = selectedSeason;

  // ── Enriched Data (costs + sales + products) ───────────────────
  const enrichedData = useMemo(() => {
    // Sales lookup by styleNumber-season
    const salesLookup = new Map<string, { revenue: number; units: number }>();
    sales.forEach(s => {
      const key = `${s.styleNumber}-${s.season}`;
      const existing = salesLookup.get(key) || { revenue: 0, units: 0 };
      existing.revenue += s.revenue || 0;
      existing.units += s.unitsBooked || 0;
      salesLookup.set(key, existing);
    });

    // Product lookup for division/category
    const productLookup = new Map<string, Product>();
    products.forEach(p => {
      if (!productLookup.has(p.styleNumber)) productLookup.set(p.styleNumber, p);
    });

    // Deduplicate costs by styleNumber+season (keep highest priority)
    const costMap = new Map<string, CostRecord>();
    costs.forEach(c => {
      const key = `${c.styleNumber}-${c.season}`;
      const existing = costMap.get(key);
      if (!existing || (c.costSource === 'landed_cost' && existing.costSource !== 'landed_cost')) {
        costMap.set(key, c);
      }
    });

    const rows: EnrichedCostRow[] = [];

    costMap.forEach((c, key) => {
      // Apply global filters
      if (filterSeason && filterSeason !== '__ALL_SP__' && filterSeason !== '__ALL_FA__') {
        if (c.season !== filterSeason) return;
      } else if (filterSeason === '__ALL_SP__' && !c.season?.toUpperCase().endsWith('SP')) {
        return;
      } else if (filterSeason === '__ALL_FA__' && !c.season?.toUpperCase().endsWith('FA')) {
        return;
      }

      const prod = productLookup.get(c.styleNumber);
      const divDesc = prod?.divisionDesc || '';
      const catDesc = prod?.categoryDesc || '';

      if (selectedDivision && !matchesDivision(divDesc, selectedDivision)) return;
      if (selectedCategory && catDesc !== selectedCategory) return;

      if (globalSearchQuery) {
        const q = globalSearchQuery.toLowerCase();
        const searchable = `${c.styleNumber} ${c.styleName} ${c.countryOfOrigin} ${c.factory}`.toLowerCase();
        if (!searchable.includes(q)) return;
      }

      const salesData = salesLookup.get(key) || { revenue: 0, units: 0 };
      const wholesale = c.suggestedWholesale || 0;
      const landed = c.landed || 0;
      const margin = wholesale > 0 ? ((wholesale - landed) / wholesale) * 100 : null;

      rows.push({
        styleNumber: c.styleNumber,
        styleName: c.styleName,
        season: c.season,
        countryOfOrigin: normalizeCountry(c.countryOfOrigin),
        factory: c.factory,
        divisionDesc: divDesc,
        categoryDesc: catDesc,
        fob: c.fob || 0,
        currentDutyCost: c.dutyCost || 0,
        currentTariffCost: c.tariffCost || 0,
        freightCost: c.freightCost || 0,
        overheadCost: c.overheadCost || 0,
        currentLanded: landed,
        suggestedWholesale: wholesale,
        currentMargin: margin,
        revenue: salesData.revenue,
        units: salesData.units,
      });
    });

    return rows;
  }, [costs, sales, products, filterSeason, selectedDivision, selectedCategory, globalSearchQuery]);

  // ── Country Exposure ───────────────────────────────────────────
  const countryExposure = useMemo(() => {
    const byCountry = new Map<string, {
      styles: Set<string>; totalFob: number; totalTariffCost: number;
      totalLanded: number; totalWholesale: number; totalRevenue: number;
      count: number;
    }>();

    enrichedData.forEach(row => {
      const country = row.countryOfOrigin;
      let agg = byCountry.get(country);
      if (!agg) {
        agg = { styles: new Set(), totalFob: 0, totalTariffCost: 0, totalLanded: 0, totalWholesale: 0, totalRevenue: 0, count: 0 };
        byCountry.set(country, agg);
      }
      agg.styles.add(row.styleNumber);
      agg.totalFob += row.fob;
      agg.totalTariffCost += row.currentTariffCost;
      agg.totalLanded += row.currentLanded;
      agg.totalWholesale += row.suggestedWholesale;
      agg.totalRevenue += row.revenue;
      agg.count++;
    });

    const totalRevenue = enrichedData.reduce((s, r) => s + r.revenue, 0);

    const result: CountryExposure[] = [];
    byCountry.forEach((agg, country) => {
      const avgMargin = agg.totalWholesale > 0
        ? ((agg.totalWholesale - agg.totalLanded) / agg.totalWholesale) * 100
        : null;

      result.push({
        country,
        styleCount: agg.styles.size,
        totalFob: agg.totalFob,
        avgFob: agg.count > 0 ? agg.totalFob / agg.count : 0,
        totalRevenue: agg.totalRevenue,
        revenuePct: totalRevenue > 0 ? (agg.totalRevenue / totalRevenue) * 100 : 0,
        currentAvgTariffRate: agg.totalFob > 0 ? agg.totalTariffCost / agg.totalFob : 0,
        avgLanded: agg.count > 0 ? agg.totalLanded / agg.count : 0,
        avgMargin,
      });
    });

    return result.sort((a, b) => b.totalRevenue - a.totalRevenue);
  }, [enrichedData]);

  // ── Summary KPIs ───────────────────────────────────────────────
  const summaryKPIs = useMemo(() => {
    const totalStyles = new Set(enrichedData.map(r => r.styleNumber)).size;
    const countries = countryExposure.length;
    const totalFob = enrichedData.reduce((s, r) => s + r.fob, 0);
    const totalTariff = enrichedData.reduce((s, r) => s + r.currentTariffCost, 0);
    const weightedTariffRate = totalFob > 0 ? (totalTariff / totalFob) * 100 : 0;
    const highRiskRevenue = countryExposure
      .filter(c => c.revenuePct > 30)
      .reduce((s, c) => s + c.totalRevenue, 0);

    return { totalStyles, countries, weightedTariffRate, highRiskRevenue };
  }, [enrichedData, countryExposure]);

  // ── Auto-populate baseline scenario from data ──────────────────
  useEffect(() => {
    if (countryExposure.length === 0) return;
    const currentRates: Record<string, number> = {};
    countryExposure.forEach(ce => {
      currentRates[ce.country] = ce.currentAvgTariffRate;
    });

    setScenarios(prev => prev.map(s => {
      if (s.isBaseline) return { ...s, countryRates: currentRates };
      // For non-baseline, merge current rates as defaults (don't overwrite user edits)
      const merged = { ...currentRates };
      Object.entries(s.countryRates).forEach(([k, v]) => { merged[k] = v; });
      return { ...s, countryRates: merged };
    }));
  }, [countryExposure]);

  // ── Scenario Calculations ──────────────────────────────────────
  const scenarioResults: ScenarioResult[] = useMemo(() => {
    return scenarios.map(scenario => {
      const results: ScenarioStyleResult[] = enrichedData.map(row => {
        const tariffRate = scenario.countryRates[row.countryOfOrigin] ?? 0;
        const newTariffCost = row.fob * tariffRate;
        const newLanded = row.fob + newTariffCost + row.currentDutyCost + row.freightCost + row.overheadCost;
        const wholesale = row.suggestedWholesale;
        const newMargin = wholesale > 0 ? ((wholesale - newLanded) / wholesale) * 100 : null;
        const marginDelta = (newMargin !== null && row.currentMargin !== null)
          ? newMargin - row.currentMargin : null;

        const targetRate = targetMargin / 100;
        const wholesaleToMaintain = targetRate < 1 ? newLanded / (1 - targetRate) : null;

        return {
          styleNumber: row.styleNumber,
          styleName: row.styleName,
          countryOfOrigin: row.countryOfOrigin,
          fob: row.fob,
          currentLanded: row.currentLanded,
          currentMargin: row.currentMargin,
          scenarioLanded: newLanded,
          scenarioMargin: newMargin,
          marginDelta,
          wholesaleToMaintain,
          wholesale,
          revenue: row.revenue,
        };
      });

      const withMargin = results.filter(r => r.scenarioMargin !== null);
      const avgMargin = withMargin.length > 0
        ? withMargin.reduce((s, r) => s + r.scenarioMargin!, 0) / withMargin.length : null;
      const withCurrentMargin = results.filter(r => r.currentMargin !== null);
      const currentAvg = withCurrentMargin.length > 0
        ? withCurrentMargin.reduce((s, r) => s + r.currentMargin!, 0) / withCurrentMargin.length : null;
      const avgMarginDelta = (avgMargin !== null && currentAvg !== null) ? avgMargin - currentAvg : null;

      const belowTarget = withMargin.filter(r => r.scenarioMargin! < targetMargin).length;
      const revenueAtRisk = results
        .filter(r => r.scenarioMargin !== null && r.scenarioMargin! < targetMargin)
        .reduce((s, r) => s + r.revenue, 0);

      const withLanded = results.filter(r => r.currentLanded > 0);
      const avgLandedIncreasePct = withLanded.length > 0
        ? withLanded.reduce((s, r) => s + ((r.scenarioLanded - r.currentLanded) / r.currentLanded) * 100, 0) / withLanded.length
        : 0;

      return {
        scenario,
        results,
        aggregate: { avgMargin, avgMarginDelta, stylesBelowTarget: belowTarget, revenueAtRisk, avgLandedIncreasePct },
      };
    });
  }, [scenarios, enrichedData, targetMargin]);

  // ── Impact table (worst-case scenario per style) ───────────────
  const impactRows = useMemo(() => {
    if (scenarioResults.length === 0 || enrichedData.length === 0) return [];

    // Build map of style → worst margin delta across non-baseline scenarios
    const styleMap = new Map<string, {
      styleNumber: string; styleName: string; countryOfOrigin: string;
      fob: number; currentLanded: number; currentMargin: number | null;
      wholesale: number; revenue: number;
      scenarioMargins: { name: string; margin: number | null; landed: number }[];
      worstDelta: number | null;
      worstWholesaleToMaintain: number | null;
    }>();

    // Use the first scenario's results as the base row set
    const baseResults = scenarioResults[0].results;

    baseResults.forEach((r, idx) => {
      const scenarioMargins = scenarioResults.map(sr => ({
        name: sr.scenario.name,
        margin: sr.results[idx]?.scenarioMargin ?? null,
        landed: sr.results[idx]?.scenarioLanded ?? 0,
      }));

      // Find worst delta from non-baseline scenarios
      let worstDelta: number | null = null;
      let worstWholesaleToMaintain: number | null = null;
      scenarioResults.forEach(sr => {
        if (sr.scenario.isBaseline) return;
        const row = sr.results[idx];
        if (row && row.marginDelta !== null) {
          if (worstDelta === null || row.marginDelta < worstDelta) {
            worstDelta = row.marginDelta;
            worstWholesaleToMaintain = row.wholesaleToMaintain;
          }
        }
      });

      styleMap.set(r.styleNumber, {
        styleNumber: r.styleNumber,
        styleName: r.styleName,
        countryOfOrigin: r.countryOfOrigin,
        fob: r.fob,
        currentLanded: r.currentLanded,
        currentMargin: r.currentMargin,
        wholesale: r.wholesale,
        revenue: r.revenue,
        scenarioMargins,
        worstDelta,
        worstWholesaleToMaintain,
      });
    });

    const rows = Array.from(styleMap.values());

    // Sort
    rows.sort((a, b) => {
      let aVal: number, bVal: number;
      switch (sortField) {
        case 'marginDelta': aVal = a.worstDelta ?? 0; bVal = b.worstDelta ?? 0; break;
        case 'revenue': aVal = a.revenue; bVal = b.revenue; break;
        case 'fob': aVal = a.fob; bVal = b.fob; break;
        default: return sortDir === 'asc' ? a.styleNumber.localeCompare(b.styleNumber) : b.styleNumber.localeCompare(a.styleNumber);
      }
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    });

    return rows;
  }, [scenarioResults, enrichedData, sortField, sortDir]);

  // ── Price adjustment summary ───────────────────────────────────
  const priceAdjustmentSummary = useMemo(() => {
    // Use the worst non-baseline scenario
    const nonBaseline = scenarioResults.filter(sr => !sr.scenario.isBaseline);
    if (nonBaseline.length === 0) return null;

    // Find the scenario with lowest avg margin
    const worstScenario = nonBaseline.reduce((worst, sr) => {
      if (worst === null) return sr;
      if ((sr.aggregate.avgMargin ?? 100) < (worst.aggregate.avgMargin ?? 100)) return sr;
      return worst;
    }, null as ScenarioResult | null);

    if (!worstScenario) return null;

    const needsIncrease = worstScenario.results.filter(r =>
      r.wholesaleToMaintain !== null && r.wholesale > 0 && r.wholesaleToMaintain > r.wholesale
    );

    const increases = needsIncrease.map(r => ({
      style: r.styleNumber,
      from: r.wholesale,
      to: r.wholesaleToMaintain!,
      increase: r.wholesaleToMaintain! - r.wholesale,
      increasePct: ((r.wholesaleToMaintain! - r.wholesale) / r.wholesale) * 100,
    }));

    const avgIncrease = increases.length > 0
      ? increases.reduce((s, r) => s + r.increase, 0) / increases.length : 0;
    const avgIncreasePct = increases.length > 0
      ? increases.reduce((s, r) => s + r.increasePct, 0) / increases.length : 0;
    const maxIncrease = increases.length > 0
      ? increases.reduce((max, r) => r.increase > max.increase ? r : max, increases[0]) : null;

    return {
      scenarioName: worstScenario.scenario.name,
      stylesNeedingIncrease: increases.length,
      totalStyles: worstScenario.results.length,
      avgIncrease,
      avgIncreasePct,
      maxIncrease,
    };
  }, [scenarioResults]);

  // ── Handlers ───────────────────────────────────────────────────
  const addScenario = () => {
    if (scenarios.length >= 3) return;
    const id = `scenario-${Date.now()}`;
    const baselineRates = scenarios.find(s => s.isBaseline)?.countryRates || {};
    setScenarios(prev => [...prev, { id, name: `Scenario ${prev.length + 1}`, countryRates: { ...baselineRates }, isBaseline: false }]);
    setActiveScenarioId(id);
  };

  const removeScenario = (id: string) => {
    setScenarios(prev => prev.filter(s => s.id !== id));
    if (activeScenarioId === id) setActiveScenarioId(scenarios[0]?.id || '');
  };

  const updateScenarioName = (id: string, name: string) => {
    setScenarios(prev => prev.map(s => s.id === id ? { ...s, name } : s));
  };

  const updateCountryRate = (scenarioId: string, country: string, rate: number) => {
    setScenarios(prev => prev.map(s => {
      if (s.id !== scenarioId || s.isBaseline) return s;
      return { ...s, countryRates: { ...s.countryRates, [country]: rate } };
    }));
  };

  const applyQuickRate = (scenarioId: string, rate: number) => {
    setScenarios(prev => prev.map(s => {
      if (s.id !== scenarioId || s.isBaseline) return s;
      const newRates: Record<string, number> = {};
      Object.keys(s.countryRates).forEach(c => { newRates[c] = rate; });
      return { ...s, countryRates: newRates };
    }));
  };

  const resetToBaseline = (scenarioId: string) => {
    const baselineRates = scenarios.find(s => s.isBaseline)?.countryRates || {};
    setScenarios(prev => prev.map(s =>
      s.id === scenarioId ? { ...s, countryRates: { ...baselineRates } } : s
    ));
  };

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const handleExport = () => {
    const headers = ['Style #', 'Style Name', 'Country', 'FOB', 'Current Landed', 'Current Margin %', 'Wholesale',
      ...scenarios.flatMap(s => [`${s.name} Landed`, `${s.name} Margin %`]),
      'Worst Margin Delta', `Wholesale to Maintain ${targetMargin}%`
    ];
    const rows = impactRows.map(row => [
      row.styleNumber, row.styleName, row.countryOfOrigin,
      row.fob.toFixed(2), row.currentLanded.toFixed(2),
      row.currentMargin !== null ? row.currentMargin.toFixed(1) : '',
      row.wholesale.toFixed(2),
      ...row.scenarioMargins.flatMap(sm => [
        sm.landed.toFixed(2),
        sm.margin !== null ? sm.margin.toFixed(1) : '',
      ]),
      row.worstDelta !== null ? row.worstDelta.toFixed(1) : '',
      row.worstWholesaleToMaintain !== null ? row.worstWholesaleToMaintain.toFixed(2) : '',
    ]);

    const csv = buildCSV(headers, rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `tariff_impact_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // ── Active scenario for builder ────────────────────────────────
  const activeScenario = scenarios.find(s => s.id === activeScenarioId) || scenarios[0];
  const activeScenarioResult = scenarioResults.find(sr => sr.scenario.id === activeScenarioId);

  // ── Empty state ────────────────────────────────────────────────
  if (costs.length === 0) {
    return (
      <div className="p-6">
        <h2 className="text-4xl font-display font-bold text-text-primary mb-6">Tariff Impact Analysis</h2>
        <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-xl p-8 text-center">
          <Scale className="w-16 h-16 text-amber-500 mx-auto mb-4" />
          <p className="text-xl text-amber-800 dark:text-amber-200 font-bold">No cost data available</p>
          <p className="text-amber-600 dark:text-amber-400 text-base mt-2">
            Import landed cost data to begin tariff impact analysis.
          </p>
        </div>
      </div>
    );
  }

  const noCountryData = countryExposure.length === 1 && countryExposure[0].country === 'Unknown';

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-4xl font-display font-bold text-text-primary">
            Tariff Impact Analysis
            {filterSeason && (
              <span className="ml-3 text-2xl font-mono text-cyan-600 dark:text-cyan-400">{filterSeason}</span>
            )}
          </h2>
          <p className="text-base text-text-muted mt-1">
            Model tariff scenarios, analyze margin impact, and calculate price adjustments
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-surface rounded-lg border border-border-primary px-3 py-2">
            <span className="text-sm font-bold text-text-secondary">Target Margin</span>
            <input
              type="number"
              value={targetMargin}
              onChange={e => setTargetMargin(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
              className="w-16 text-center font-mono font-bold text-lg bg-transparent border border-border-primary rounded px-1 py-0.5 text-text-primary"
            />
            <span className="text-sm text-text-muted">%</span>
          </div>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-surface border border-border-primary text-text-secondary hover:text-text-primary hover:bg-hover transition-colors font-medium text-sm"
          >
            <Download className="w-4 h-4" /> Export
          </button>
        </div>
      </div>

      {/* Section tabs */}
      <div className="flex items-center gap-1 bg-surface-secondary rounded-lg p-1 border border-border-primary w-fit">
        {[
          { id: 'exposure' as const, label: 'Country Exposure', icon: Globe },
          { id: 'scenarios' as const, label: 'Scenario Builder', icon: Scale },
          { id: 'impact' as const, label: 'Impact Analysis', icon: TrendingDown },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSection(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeSection === tab.id
                ? 'bg-surface text-text-primary shadow-sm border border-border-primary'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* COO Warning */}
      {noCountryData && (
        <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-3 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
          <p className="text-sm text-amber-800 dark:text-amber-200">
            No country of origin data found in cost records. Tariff analysis requires COO data in your landed cost sheets.
          </p>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* SECTION 1: Country Exposure Dashboard                      */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {activeSection === 'exposure' && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-surface rounded-xl border-2 border-border-primary p-5">
              <div className="text-xs font-bold text-text-muted uppercase tracking-wide">Styles with Cost Data</div>
              <div className="text-3xl font-bold font-mono text-text-primary mt-2">{formatNumber(summaryKPIs.totalStyles)}</div>
            </div>
            <div className="bg-surface rounded-xl border-2 border-border-primary p-5">
              <div className="text-xs font-bold text-text-muted uppercase tracking-wide">Countries</div>
              <div className="text-3xl font-bold font-mono text-text-primary mt-2">{summaryKPIs.countries}</div>
            </div>
            <div className="bg-surface rounded-xl border-2 border-border-primary p-5">
              <div className="text-xs font-bold text-text-muted uppercase tracking-wide">Wtd. Avg Tariff Rate</div>
              <div className="text-3xl font-bold font-mono text-cyan-600 dark:text-cyan-400 mt-2">
                {summaryKPIs.weightedTariffRate.toFixed(1)}%
              </div>
            </div>
            <div className="bg-surface rounded-xl border-2 border-border-primary p-5">
              <div className="text-xs font-bold text-text-muted uppercase tracking-wide">High-Risk Revenue</div>
              <div className="text-3xl font-bold font-mono text-red-600 dark:text-red-400 mt-2">
                {formatCurrencyShort(summaryKPIs.highRiskRevenue)}
              </div>
              <div className="text-xs text-text-faint mt-1">&gt;30% concentration</div>
            </div>
          </div>

          {/* Country Breakdown Table */}
          <div className="bg-surface rounded-xl border-2 border-border-primary shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-border-primary">
              <h3 className="text-lg font-bold text-text-primary">Country Breakdown</h3>
              <p className="text-sm text-text-muted mt-1">Revenue concentration and tariff exposure by country of origin</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-surface-secondary border-b-2 border-border-strong">
                    <th className="px-4 py-3 text-left text-sm font-bold text-text-secondary uppercase tracking-wide">Country</th>
                    <th className="px-4 py-3 text-right text-sm font-bold text-text-secondary uppercase tracking-wide"># Styles</th>
                    <th className="px-4 py-3 text-right text-sm font-bold text-text-secondary uppercase tracking-wide">Total FOB</th>
                    <th className="px-4 py-3 text-right text-sm font-bold text-text-secondary uppercase tracking-wide">Tariff Rate</th>
                    <th className="px-4 py-3 text-right text-sm font-bold text-text-secondary uppercase tracking-wide">Avg Landed</th>
                    <th className="px-4 py-3 text-right text-sm font-bold text-text-secondary uppercase tracking-wide">Revenue</th>
                    <th className="px-4 py-3 text-sm font-bold text-text-secondary uppercase tracking-wide" style={{ minWidth: 180 }}>Revenue %</th>
                    <th className="px-4 py-3 text-right text-sm font-bold text-text-secondary uppercase tracking-wide">Avg Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {countryExposure.map((ce, idx) => (
                    <tr key={ce.country} className={`border-b border-border-primary ${idx % 2 === 0 ? 'bg-surface' : 'bg-surface-secondary'} hover:bg-hover transition-colors`}>
                      <td className="px-4 py-3">
                        <span className="font-bold text-text-primary text-base">{ce.country}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-text-secondary">{ce.styleCount}</td>
                      <td className="px-4 py-3 text-right font-mono text-text-secondary">{formatCurrencyShort(ce.totalFob)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-mono font-bold text-cyan-600 dark:text-cyan-400">
                          {(ce.currentAvgTariffRate * 100).toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-text-secondary">{formatCurrency(ce.avgLanded)}</td>
                      <td className="px-4 py-3 text-right font-mono font-medium text-text-primary">{formatCurrencyShort(ce.totalRevenue)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2.5 bg-surface-tertiary rounded-full overflow-hidden">
                            <div
                              className={`h-2.5 rounded-full transition-all ${
                                ce.revenuePct > 30 ? 'bg-red-500' : ce.revenuePct > 15 ? 'bg-amber-500' : 'bg-emerald-500'
                              }`}
                              style={{ width: `${Math.min(ce.revenuePct, 100)}%` }}
                            />
                          </div>
                          <span className="font-mono text-sm text-text-secondary w-12 text-right">{ce.revenuePct.toFixed(1)}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {ce.avgMargin !== null ? (
                          <span className={`font-mono font-bold px-2 py-0.5 rounded ${getMarginBg(ce.avgMargin)} ${getMarginColor(ce.avgMargin)}`}>
                            {ce.avgMargin.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-text-faint">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {countryExposure.length === 0 && (
              <div className="px-6 py-8 text-center text-text-muted">No cost data matches current filters</div>
            )}
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* SECTION 2: Scenario Builder                                */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {activeSection === 'scenarios' && (
        <>
          {/* Scenario Tabs */}
          <div className="flex items-center gap-2 flex-wrap">
            {scenarios.map(s => (
              <button
                key={s.id}
                onClick={() => setActiveScenarioId(s.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all ${
                  activeScenarioId === s.id
                    ? 'bg-cyan-600 text-white shadow-md'
                    : 'bg-surface-secondary text-text-secondary border border-border-primary hover:bg-hover'
                }`}
              >
                {s.name}
                {s.isBaseline && <span className="text-xs opacity-70">(baseline)</span>}
                {!s.isBaseline && (
                  <X
                    className="w-3.5 h-3.5 opacity-60 hover:opacity-100"
                    onClick={e => { e.stopPropagation(); removeScenario(s.id); }}
                  />
                )}
              </button>
            ))}
            {scenarios.length < 3 && (
              <button
                onClick={addScenario}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 border-dashed border-border-primary text-text-muted hover:text-text-primary hover:border-border-strong transition-colors text-sm font-medium"
              >
                <Plus className="w-4 h-4" /> Add Scenario
              </button>
            )}
          </div>

          {/* Active Scenario Editor */}
          {activeScenario && (
            <div className="bg-surface rounded-xl border-2 border-border-primary shadow-sm">
              {/* Scenario Header */}
              <div className="px-6 py-4 border-b border-border-primary flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Scale className="w-5 h-5 text-cyan-500" />
                  {activeScenario.isBaseline ? (
                    <span className="text-lg font-bold text-text-primary">{activeScenario.name}</span>
                  ) : (
                    <input
                      type="text"
                      value={activeScenario.name}
                      onChange={e => updateScenarioName(activeScenario.id, e.target.value)}
                      className="text-lg font-bold text-text-primary bg-transparent border-b-2 border-border-primary focus:border-cyan-500 outline-none px-1 py-0.5"
                    />
                  )}
                  {activeScenario.isBaseline && (
                    <span className="text-xs bg-cyan-100 dark:bg-cyan-900 text-cyan-700 dark:text-cyan-300 px-2 py-0.5 rounded-full font-medium">
                      Rates from data
                    </span>
                  )}
                </div>
                {!activeScenario.isBaseline && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-text-muted font-medium">Quick set:</span>
                    {[10, 25, 46, 54].map(pct => (
                      <button
                        key={pct}
                        onClick={() => applyQuickRate(activeScenario.id, pct / 100)}
                        className="px-2.5 py-1 rounded text-xs font-bold bg-surface-tertiary text-text-secondary hover:bg-hover hover:text-text-primary border border-border-primary transition-colors"
                      >
                        {pct}%
                      </button>
                    ))}
                    <button
                      onClick={() => resetToBaseline(activeScenario.id)}
                      className="px-2.5 py-1 rounded text-xs font-bold text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950 border border-amber-200 dark:border-amber-800 transition-colors"
                    >
                      Reset
                    </button>
                  </div>
                )}
              </div>

              {/* Country Rate Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-surface-secondary border-b-2 border-border-strong">
                      <th className="px-4 py-3 text-left text-sm font-bold text-text-secondary uppercase tracking-wide">Country</th>
                      <th className="px-4 py-3 text-right text-sm font-bold text-text-secondary uppercase tracking-wide"># Styles</th>
                      <th className="px-4 py-3 text-right text-sm font-bold text-text-secondary uppercase tracking-wide">Revenue</th>
                      <th className="px-4 py-3 text-right text-sm font-bold text-text-secondary uppercase tracking-wide">Current Rate</th>
                      <th className="px-4 py-3 text-center text-sm font-bold text-text-secondary uppercase tracking-wide" style={{ minWidth: 140 }}>
                        {activeScenario.isBaseline ? 'Rate' : 'New Rate'}
                      </th>
                      <th className="px-4 py-3 text-right text-sm font-bold text-text-secondary uppercase tracking-wide">Delta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {countryExposure.map((ce, idx) => {
                      const baselineRate = scenarios.find(s => s.isBaseline)?.countryRates[ce.country] ?? 0;
                      const scenarioRate = activeScenario.countryRates[ce.country] ?? 0;
                      const delta = scenarioRate - baselineRate;

                      return (
                        <tr key={ce.country} className={`border-b border-border-primary ${idx % 2 === 0 ? 'bg-surface' : 'bg-surface-secondary'}`}>
                          <td className="px-4 py-3 font-bold text-text-primary">{ce.country}</td>
                          <td className="px-4 py-3 text-right font-mono text-text-secondary">{ce.styleCount}</td>
                          <td className="px-4 py-3 text-right font-mono text-text-secondary">{formatCurrencyShort(ce.totalRevenue)}</td>
                          <td className="px-4 py-3 text-right font-mono text-text-muted">{(baselineRate * 100).toFixed(1)}%</td>
                          <td className="px-4 py-3 text-center">
                            {activeScenario.isBaseline ? (
                              <span className="font-mono font-bold text-cyan-600 dark:text-cyan-400">
                                {(scenarioRate * 100).toFixed(1)}%
                              </span>
                            ) : (
                              <div className="flex items-center justify-center gap-1">
                                <input
                                  type="number"
                                  value={parseFloat((scenarioRate * 100).toFixed(1))}
                                  onChange={e => updateCountryRate(activeScenario.id, ce.country, (Number(e.target.value) || 0) / 100)}
                                  step="0.1"
                                  className="w-20 text-center font-mono font-bold bg-surface border-2 border-border-primary rounded-md px-2 py-1.5 text-text-primary focus:border-cyan-500 outline-none"
                                />
                                <span className="text-sm text-text-muted">%</span>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {!activeScenario.isBaseline && Math.abs(delta) > 0.001 ? (
                              <span className={`font-mono font-bold ${delta > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                {delta > 0 ? '+' : ''}{(delta * 100).toFixed(1)}%
                              </span>
                            ) : (
                              <span className="text-text-faint">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Scenario Preview */}
              {activeScenarioResult && (
                <div className="px-6 py-4 border-t-2 border-border-strong bg-surface-tertiary">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <div className="text-xs font-bold text-text-muted uppercase">Avg Margin</div>
                      <div className={`text-2xl font-bold font-mono mt-1 ${getMarginColor(activeScenarioResult.aggregate.avgMargin ?? 0)}`}>
                        {activeScenarioResult.aggregate.avgMargin !== null ? `${activeScenarioResult.aggregate.avgMargin.toFixed(1)}%` : '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-bold text-text-muted uppercase">Margin Delta</div>
                      <div className={`text-2xl font-bold font-mono mt-1 ${
                        (activeScenarioResult.aggregate.avgMarginDelta ?? 0) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                      }`}>
                        {activeScenarioResult.aggregate.avgMarginDelta !== null
                          ? `${activeScenarioResult.aggregate.avgMarginDelta >= 0 ? '+' : ''}${activeScenarioResult.aggregate.avgMarginDelta.toFixed(1)}%`
                          : '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-bold text-text-muted uppercase">Below {targetMargin}% Target</div>
                      <div className="text-2xl font-bold font-mono text-text-primary mt-1">
                        {activeScenarioResult.aggregate.stylesBelowTarget}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-bold text-text-muted uppercase">Revenue at Risk</div>
                      <div className="text-2xl font-bold font-mono text-red-600 dark:text-red-400 mt-1">
                        {formatCurrencyShort(activeScenarioResult.aggregate.revenueAtRisk)}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* SECTION 3: Impact Analysis                                 */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {activeSection === 'impact' && (
        <>
          {/* Scenario Comparison Cards */}
          <div className={`grid gap-4 ${scenarioResults.length === 3 ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1 md:grid-cols-2'}`}>
            {scenarioResults.map(sr => (
              <div key={sr.scenario.id} className={`bg-surface rounded-xl border-2 p-5 shadow-sm ${
                sr.scenario.isBaseline ? 'border-border-primary' : 'border-cyan-500/30'
              }`}>
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-bold text-lg text-text-primary">{sr.scenario.name}</h4>
                  {sr.scenario.isBaseline && (
                    <span className="text-xs bg-surface-tertiary text-text-muted px-2 py-0.5 rounded-full">baseline</span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs font-bold text-text-muted uppercase">Avg Margin</div>
                    <div className={`text-2xl font-bold font-mono mt-1 ${getMarginColor(sr.aggregate.avgMargin ?? 0)}`}>
                      {sr.aggregate.avgMargin !== null ? `${sr.aggregate.avgMargin.toFixed(1)}%` : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-bold text-text-muted uppercase">Margin Delta</div>
                    <div className={`text-2xl font-bold font-mono mt-1 ${
                      (sr.aggregate.avgMarginDelta ?? 0) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                    }`}>
                      {sr.aggregate.avgMarginDelta !== null
                        ? `${sr.aggregate.avgMarginDelta >= 0 ? '+' : ''}${sr.aggregate.avgMarginDelta.toFixed(1)}%`
                        : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-bold text-text-muted uppercase">Below Target</div>
                    <div className="text-2xl font-bold font-mono text-text-primary mt-1">{sr.aggregate.stylesBelowTarget}</div>
                  </div>
                  <div>
                    <div className="text-xs font-bold text-text-muted uppercase">Revenue at Risk</div>
                    <div className="text-2xl font-bold font-mono text-red-600 dark:text-red-400 mt-1">
                      {formatCurrencyShort(sr.aggregate.revenueAtRisk)}
                    </div>
                  </div>
                </div>
                {!sr.scenario.isBaseline && sr.aggregate.avgLandedIncreasePct !== 0 && (
                  <div className="mt-3 pt-3 border-t border-border-primary text-sm text-text-muted">
                    Avg landed cost {sr.aggregate.avgLandedIncreasePct > 0 ? 'increase' : 'decrease'}:{' '}
                    <span className={`font-mono font-bold ${sr.aggregate.avgLandedIncreasePct > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {sr.aggregate.avgLandedIncreasePct > 0 ? '+' : ''}{sr.aggregate.avgLandedIncreasePct.toFixed(1)}%
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Price Adjustment Summary */}
          {priceAdjustmentSummary && priceAdjustmentSummary.stylesNeedingIncrease > 0 && (
            <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-xl p-5">
              <h4 className="font-bold text-base text-amber-800 dark:text-amber-200 mb-3 flex items-center gap-2">
                <DollarSign className="w-5 h-5" />
                Price Adjustment to Maintain {targetMargin}% Margin ({priceAdjustmentSummary.scenarioName})
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-amber-600 dark:text-amber-400">Avg wholesale increase: </span>
                  <span className="font-mono font-bold text-amber-800 dark:text-amber-200">
                    +{formatCurrency(priceAdjustmentSummary.avgIncrease)} (+{priceAdjustmentSummary.avgIncreasePct.toFixed(1)}%)
                  </span>
                </div>
                <div>
                  <span className="text-amber-600 dark:text-amber-400">Styles requiring increase: </span>
                  <span className="font-mono font-bold text-amber-800 dark:text-amber-200">
                    {priceAdjustmentSummary.stylesNeedingIncrease} of {priceAdjustmentSummary.totalStyles}
                  </span>
                </div>
                {priceAdjustmentSummary.maxIncrease && (
                  <div>
                    <span className="text-amber-600 dark:text-amber-400">Max increase: </span>
                    <span className="font-mono font-bold text-amber-800 dark:text-amber-200">
                      +{formatCurrency(priceAdjustmentSummary.maxIncrease.increase)} ({priceAdjustmentSummary.maxIncrease.style})
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Style-Level Impact Table */}
          <div className="bg-surface rounded-xl border-2 border-border-primary shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-border-primary">
              <h3 className="text-lg font-bold text-text-primary">Style-Level Impact</h3>
              <p className="text-sm text-text-muted mt-1">
                Showing {Math.min(displayLimit, impactRows.length)} of {formatNumber(impactRows.length)} styles
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-surface-secondary border-b-2 border-border-strong">
                    <th
                      className="px-4 py-3 text-left text-sm font-bold text-text-secondary uppercase tracking-wide cursor-pointer hover:text-text-primary"
                      onClick={() => handleSort('styleNumber')}
                    >
                      Style # {sortField === 'styleNumber' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-bold text-text-secondary uppercase tracking-wide">Name</th>
                    <th className="px-4 py-3 text-left text-sm font-bold text-text-secondary uppercase tracking-wide">COO</th>
                    <th
                      className="px-4 py-3 text-right text-sm font-bold text-text-secondary uppercase tracking-wide cursor-pointer hover:text-text-primary"
                      onClick={() => handleSort('fob')}
                    >
                      FOB {sortField === 'fob' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-bold text-text-secondary uppercase tracking-wide">Cur. Margin</th>
                    {/* Dynamic scenario columns */}
                    {scenarios.map(s => (
                      <th key={s.id} className="px-4 py-3 text-right text-sm font-bold text-text-secondary uppercase tracking-wide border-l border-border-primary">
                        {s.name}
                      </th>
                    ))}
                    <th
                      className="px-4 py-3 text-right text-sm font-bold text-text-secondary uppercase tracking-wide border-l-2 border-border-strong cursor-pointer hover:text-text-primary"
                      onClick={() => handleSort('marginDelta')}
                    >
                      Worst Δ {sortField === 'marginDelta' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-bold text-text-secondary uppercase tracking-wide">
                      WS to Maintain
                    </th>
                    <th
                      className="px-4 py-3 text-right text-sm font-bold text-text-secondary uppercase tracking-wide cursor-pointer hover:text-text-primary"
                      onClick={() => handleSort('revenue')}
                    >
                      Revenue {sortField === 'revenue' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                    </th>
                    <th className="px-4 py-3 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {impactRows.slice(0, displayLimit).map((row, idx) => (
                    <tr
                      key={row.styleNumber}
                      onClick={() => onStyleClick(row.styleNumber)}
                      className={`border-b border-border-primary cursor-pointer transition-colors ${
                        idx % 2 === 0 ? 'bg-surface' : 'bg-surface-secondary'
                      } hover:bg-hover-accent`}
                    >
                      <td className="px-4 py-3">
                        <span className="font-mono font-bold text-text-primary">{row.styleNumber}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-text-secondary max-w-[200px] truncate">{row.styleName}</td>
                      <td className="px-4 py-3 text-sm text-text-secondary">{row.countryOfOrigin}</td>
                      <td className="px-4 py-3 text-right font-mono text-text-secondary">{formatCurrency(row.fob)}</td>
                      <td className="px-4 py-3 text-right">
                        {row.currentMargin !== null ? (
                          <span className={`font-mono font-bold px-2 py-0.5 rounded text-sm ${getMarginBg(row.currentMargin)} ${getMarginColor(row.currentMargin)}`}>
                            {row.currentMargin.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-text-faint">—</span>
                        )}
                      </td>
                      {/* Dynamic scenario margin columns */}
                      {row.scenarioMargins.map((sm, sIdx) => (
                        <td key={sIdx} className="px-4 py-3 text-right border-l border-border-primary">
                          {sm.margin !== null ? (
                            <span className={`font-mono font-bold px-2 py-0.5 rounded text-sm ${getMarginBg(sm.margin)} ${getMarginColor(sm.margin)}`}>
                              {sm.margin.toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-text-faint">—</span>
                          )}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-right border-l-2 border-border-strong">
                        {row.worstDelta !== null ? (
                          <span className={`font-mono font-bold text-sm ${
                            row.worstDelta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                          }`}>
                            {row.worstDelta >= 0 ? '+' : ''}{row.worstDelta.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-text-faint">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-text-secondary text-sm">
                        {row.worstWholesaleToMaintain !== null ? formatCurrency(row.worstWholesaleToMaintain) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-text-secondary text-sm">
                        {row.revenue > 0 ? formatCurrencyShort(row.revenue) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <ChevronRight className="w-4 h-4 text-text-faint" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Show More */}
            {impactRows.length > displayLimit ? (
              <div className="px-6 py-4 border-t-2 border-border-strong bg-surface-tertiary text-center">
                <button
                  onClick={() => setDisplayLimit(prev => Math.min(prev + 50, impactRows.length))}
                  className="text-base text-accent hover:text-accent-hover font-medium transition-colors"
                >
                  Showing {displayLimit} of {formatNumber(impactRows.length)} styles — Show More
                </button>
              </div>
            ) : impactRows.length > 50 ? (
              <div className="px-6 py-4 border-t-2 border-border-strong bg-surface-tertiary text-center">
                <button
                  onClick={() => setDisplayLimit(50)}
                  className="text-base text-text-secondary hover:text-text-primary font-medium transition-colors"
                >
                  Showing all {formatNumber(impactRows.length)} styles — Show Less
                </button>
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
