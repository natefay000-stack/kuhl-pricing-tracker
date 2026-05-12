'use client';

import React, { useState, useMemo } from 'react';
import { Download, AlertTriangle, List, Grid3X3 } from 'lucide-react';
import { Product, SalesRecord, normalizeCategory } from '@/types/product';
import { parseSeasonCode, isFutureSeason, isRelevantSeason } from '@/utils/season';
import { formatCurrencyShort } from '@/utils/format';
import { sortSeasons } from '@/lib/store';
import { exportToExcel } from '@/utils/exportData';
import { SourceLegend } from '@/components/SourceBadge';
import { getCombineKey } from '@/utils/combineStyles';
import { matchesDivision, matchesGender } from '@/utils/divisionMap';
import SalesLoadingBanner from '@/components/SalesLoadingBanner';

// ── Types ──────────────────────────────────────────────────────────
type ChannelId = 'total' | 'online' | 'retail' | 'rei' | 'scheels' | 'otherWholesale' | 'allWholesale';

interface RankedStyle {
  rank: number;
  styleNumber: string;
  styleDesc: string;
  revenue: number;
  units: number;
  inF26: boolean;
  trend: 'up' | 'down' | 'flat';
}

interface GapInfo {
  styleNumber: string;
  styleDesc: string;
  missingFrom: ChannelId;
  topIn: string; // e.g. "#1 Online, #2 REI"
}

// Detailed view: separate wholesale channels
const CHANNELS_DETAILED: { id: ChannelId; label: string }[] = [
  { id: 'total', label: 'Total' },
  { id: 'online', label: 'Online' },
  { id: 'retail', label: 'Retail Stores' },
  { id: 'rei', label: 'REI' },
  { id: 'scheels', label: 'Scheels' },
  { id: 'otherWholesale', label: 'Other Wholesale' },
];

// Combined view: all wholesale merged into one column
const CHANNELS_COMBINED: { id: ChannelId; label: string }[] = [
  { id: 'total', label: 'Total' },
  { id: 'online', label: 'Online' },
  { id: 'retail', label: 'Retail Stores' },
  { id: 'allWholesale', label: 'All Wholesale' },
];

// ── Channel classifier ─────────────────────────────────────────────
function classifyChannel(sale: SalesRecord): ChannelId | null {
  const ct = (sale.customerType || '').toUpperCase().trim();
  const custName = (sale.customer || '').toLowerCase();

  if (ct === 'EC') return 'online';
  if (ct === 'WD') return 'retail';
  if (ct === 'BB') return 'rei';
  if (ct === 'WH') {
    if (custName.includes('scheels')) return 'scheels';
    return 'otherWholesale';
  }
  if (ct === 'KI' || ct === 'PS') return 'otherWholesale';
  return null;
}

// ── Props ──────────────────────────────────────────────────────────
interface TopStylesChannelViewProps {
  products: Product[];
  sales: SalesRecord[];
  selectedSeason: string;
  selectedDivision: string;
  selectedGender?: string;
  selectedCategory: string;
  selectedCustomerType?: string;
  selectedCustomer?: string;
  searchQuery?: string;
  onStyleClick: (styleNumber: string) => void;
}

const TOP_N = 10;

// Channel lists / labels used by heatmap (defined once outside component)
const NON_TOTAL_CHANNELS_DETAILED: ChannelId[] = ['online', 'retail', 'rei', 'scheels', 'otherWholesale'];
const NON_TOTAL_CHANNELS_COMBINED: ChannelId[] = ['online', 'retail', 'allWholesale'];
const CHANNEL_SHORT: Record<ChannelId, string> = {
  total: 'Total', online: 'Online', retail: 'Retail', rei: 'REI', scheels: 'Scheels', otherWholesale: 'Other WHS', allWholesale: 'All WHS',
};


export default function TopStylesChannelView({
  products,
  sales,
  selectedSeason,
  selectedDivision,
  selectedGender = '',
  selectedCategory,
  selectedCustomerType: globalCustomerType = '',
  selectedCustomer: globalCustomer = '',
  searchQuery: globalSearchQuery,
  onStyleClick,
}: TopStylesChannelViewProps) {
  // ── State ──────────────────────────────────────────────────────
  const [hoveredStyle, setHoveredStyle] = useState<string | null>(null);
  const [showGapsOnly, setShowGapsOnly] = useState(false);
  const [gapDetectionEnabled, setGapDetectionEnabled] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'heatmap'>('list');
  const [showRevenue, setShowRevenue] = useState(true);
  const [heatmapExpanded, setHeatmapExpanded] = useState(false);
  const [combineWholesale, setCombineWholesale] = useState(false);
  const [combineStyles, setCombineStyles] = useState(false);

  // Dynamic channel list based on combine toggle
  const CHANNEL_META = combineWholesale ? CHANNELS_COMBINED : CHANNELS_DETAILED;
  const NON_TOTAL_CHANNELS = combineWholesale ? NON_TOTAL_CHANNELS_COMBINED : NON_TOTAL_CHANNELS_DETAILED;

  // ── Local filter state (only for filters not in global header) ──
  const [localRep, setLocalRep] = useState('');

  // ── Derive active seasons from global season selector ─────────
  const selectedSeasons = useMemo(() => {
    if (!selectedSeason) return [] as string[];
    if (selectedSeason === '__ALL_SP__') {
      const seasonSet = new Set<string>();
      products.forEach(p => p.season && seasonSet.add(p.season));
      sales.forEach(s => s.season && seasonSet.add(s.season));
      return sortSeasons(Array.from(seasonSet)).filter(s => isRelevantSeason(s) && s.endsWith('SP'));
    }
    if (selectedSeason === '__ALL_FA__') {
      const seasonSet = new Set<string>();
      products.forEach(p => p.season && seasonSet.add(p.season));
      sales.forEach(s => s.season && seasonSet.add(s.season));
      return sortSeasons(Array.from(seasonSet)).filter(s => isRelevantSeason(s) && s.endsWith('FA'));
    }
    return [selectedSeason];
  }, [selectedSeason, products, sales]);

  // Alias global props for use throughout (keeps rest of code working)
  const localDivision = selectedDivision;
  const localCategory = selectedCategory;
  const localCustomerType = globalCustomerType;
  const localCustomer = globalCustomer;
  const localDesigner = ''; // Designer filter only available via global bar

  // ── Computed filter options ────────────────────────────────────
  const allSeasons = useMemo(() => {
    const seasonSet = new Set<string>();
    products.forEach(p => p.season && seasonSet.add(p.season));
    sales.forEach(s => s.season && seasonSet.add(s.season));
    return sortSeasons(Array.from(seasonSet)).filter(s => isRelevantSeason(s));
  }, [products, sales]);

  const activeSeasons = useMemo(() => {
    if (selectedSeasons.length > 0) return sortSeasons(selectedSeasons);
    return allSeasons.slice(-4);
  }, [allSeasons, selectedSeasons]);

  const reps = useMemo(() => {
    const all = new Set<string>();
    sales.forEach(s => {
      if (s.salesRep) all.add(s.salesRep);
    });
    return Array.from(all).sort();
  }, [sales]);

  // ── Designer style set (for filtering sales by designer) ──────
  const designerStyleSet = useMemo(() => {
    if (!localDesigner) return null;
    const set = new Set<string>();
    products.forEach(p => {
      if (p.designerName === localDesigner) set.add(p.styleNumber);
    });
    return set;
  }, [products, localDesigner]);

  // ── Product-lookup style set (for filtering sales by category via product data) ──
  // Products have richer category data; sales may also have it directly.
  // For division, we filter sales directly using matchesDivision since
  // products often lack divisionDesc while sales have it from the import.
  const productCategoryStyleSet = useMemo(() => {
    if (!localCategory) return null;
    const set = new Set<string>();
    // First try products
    products.forEach(p => {
      if (normalizeCategory(p.categoryDesc) === normalizeCategory(localCategory)) {
        set.add(p.styleNumber);
      }
    });
    // If products matched, use that set; otherwise fall back to sales categoryDesc
    if (set.size > 0) return set;
    return null; // will filter sales directly by categoryDesc instead
  }, [products, localCategory]);

  // ── Determine the "next future season" label for F26 detection ──
  const nextFutureSeason = useMemo(() => {
    const allSeasons = new Set<string>();
    products.forEach(p => p.season && allSeasons.add(p.season));
    sales.forEach(s => s.season && allSeasons.add(s.season));
    const sorted = sortSeasons(Array.from(allSeasons));
    // Find the first future season
    const future = sorted.find(s => isFutureSeason(s));
    if (future) return future;
    // Fallback: latest season + next
    if (sorted.length > 0) {
      const last = sorted[sorted.length - 1];
      const parsed = parseSeasonCode(last);
      if (parsed) {
        const nextType = parsed.type === 'SP' ? 'FA' : 'SP';
        const nextYear = parsed.type === 'FA' ? parsed.year + 1 : parsed.year;
        return `${String(nextYear).slice(-2)}${nextType}`;
      }
    }
    return '26FA';
  }, [products, sales]);

  // Dynamic label from season code (e.g. "26FA" → "F26")
  const futureSeasonLabel = useMemo(() => {
    const parsed = parseSeasonCode(nextFutureSeason);
    if (!parsed) return 'F26';
    const prefix = parsed.type === 'FA' ? 'F' : 'S';
    return `${prefix}${String(parsed.year).slice(-2)}`;
  }, [nextFutureSeason]);

  // ── 1. Filtered sales ─────────────────────────────────────────
  const filteredSales = useMemo(() => {
    const activeSeasonsSet = new Set(activeSeasons);
    return sales.filter(s => {
      if (activeSeasonsSet.size > 0 && !activeSeasonsSet.has(s.season)) return false;
      // Division: filter directly on sales using fuzzy matchesDivision
      if (localDivision && !matchesDivision(s.divisionDesc || '', localDivision)) return false;
      if (selectedGender && !matchesGender(s.gender, selectedGender)) return false;
      // Category: use product-lookup if available, otherwise filter sales directly
      if (localCategory) {
        if (productCategoryStyleSet) {
          if (!productCategoryStyleSet.has(s.styleNumber)) return false;
        } else if (normalizeCategory(s.categoryDesc) !== normalizeCategory(localCategory)) {
          return false;
        }
      }
      if (localCustomerType && s.customerType !== localCustomerType) return false;
      if (localCustomer && s.customer !== localCustomer) return false;
      if (localRep && s.salesRep !== localRep) return false;
      if (designerStyleSet && !designerStyleSet.has(s.styleNumber)) return false;
      if (globalSearchQuery) {
        const q = globalSearchQuery.toLowerCase();
        if (!s.styleNumber?.toLowerCase().includes(q) && !(s.styleDesc || '').toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [sales, activeSeasons, localDivision, selectedGender, localCategory, productCategoryStyleSet, localCustomerType, localCustomer, localRep, designerStyleSet, globalSearchQuery]);

  // ── 2. Channel sales map ──────────────────────────────────────
  // Map<channelId, Map<styleKey, { revenue, units, desc }>>
  // When combineStyles is ON, styleKey = program name (e.g. "Dani Sherpa")
  // When combineStyles is OFF, styleKey = raw style number
  const channelSalesMap = useMemo(() => {
    const allChannelIds: ChannelId[] = ['total', 'online', 'retail', 'rei', 'scheels', 'otherWholesale', 'allWholesale'];
    const map = new Map<ChannelId, Map<string, { revenue: number; units: number; desc: string }>>();
    allChannelIds.forEach(id => map.set(id, new Map()));

    const wholesaleChannels = new Set<ChannelId>(['rei', 'scheels', 'otherWholesale']);

    for (const sale of filteredSales) {
      const ch = classifyChannel(sale);
      if (!ch) continue;
      if (!sale.styleNumber) continue;

      // Use base style number as key when combining, otherwise raw style number
      const styleKey = combineStyles
        ? getCombineKey(sale.styleNumber)
        : sale.styleNumber;
      // For display: use styleDesc (base style's description)
      const displayDesc = sale.styleDesc || '';

      // Add to specific channel
      const chMap = map.get(ch)!;
      const existing = chMap.get(styleKey) || { revenue: 0, units: 0, desc: displayDesc };
      existing.revenue += sale.revenue || 0;
      existing.units += sale.unitsBooked || 0;
      if (!existing.desc && displayDesc) existing.desc = displayDesc;
      chMap.set(styleKey, existing);

      // Add to total
      const totalMap = map.get('total')!;
      const totalExisting = totalMap.get(styleKey) || { revenue: 0, units: 0, desc: displayDesc };
      totalExisting.revenue += sale.revenue || 0;
      totalExisting.units += sale.unitsBooked || 0;
      if (!totalExisting.desc && displayDesc) totalExisting.desc = displayDesc;
      totalMap.set(styleKey, totalExisting);

      // Add to allWholesale if this is a wholesale channel
      if (wholesaleChannels.has(ch)) {
        const whMap = map.get('allWholesale')!;
        const whExisting = whMap.get(styleKey) || { revenue: 0, units: 0, desc: displayDesc };
        whExisting.revenue += sale.revenue || 0;
        whExisting.units += sale.unitsBooked || 0;
        if (!whExisting.desc && displayDesc) whExisting.desc = displayDesc;
        whMap.set(styleKey, whExisting);
      }
    }

    return map;
  }, [filteredSales, combineStyles]);

  // ── 3. F26 style set ──────────────────────────────────────────
  const f26StyleSet = useMemo(() => {
    const set = new Set<string>();
    const activeSeasonsSet = new Set(activeSeasons);
    for (const p of products) {
      // Style is in future plan if:
      // 1. Product exists in the next future season, OR
      // 2. Product has carryForward=true in a currently-active season
      const key = combineStyles
        ? getCombineKey(p.styleNumber)
        : p.styleNumber;
      if (p.season === nextFutureSeason) {
        set.add(key);
      } else if (p.carryForward === true && activeSeasonsSet.has(p.season)) {
        set.add(key);
      }
    }
    return set;
  }, [products, nextFutureSeason, activeSeasons, combineStyles]);

  // ── 4. Prior seasons for trend comparison ─────────────────────
  // Build set of "prior year" equivalents of active seasons (e.g. 26SP→25SP)
  const priorSeasons = useMemo(() => {
    const priors = new Set<string>();
    activeSeasons.forEach(s => {
      const parsed = parseSeasonCode(s);
      if (parsed) {
        const priorYear = parsed.year - 1;
        priors.add(`${String(priorYear).slice(-2)}${parsed.type}`);
      }
    });
    return priors;
  }, [activeSeasons]);

  const priorSalesMap = useMemo(() => {
    if (priorSeasons.size === 0) return new Map<string, Map<string, number>>();
    const allChannelIds: ChannelId[] = ['total', 'online', 'retail', 'rei', 'scheels', 'otherWholesale', 'allWholesale'];
    const map = new Map<ChannelId, Map<string, number>>();
    allChannelIds.forEach(id => map.set(id, new Map()));

    const wholesaleChannels = new Set<ChannelId>(['rei', 'scheels', 'otherWholesale']);

    for (const sale of sales) {
      if (!priorSeasons.has(sale.season)) continue;
      // Apply the same filters as filteredSales so trends compare apples-to-apples
      if (localDivision && !matchesDivision(sale.divisionDesc || '', localDivision)) continue;
      if (selectedGender && !matchesGender(sale.gender, selectedGender)) continue;
      if (localCategory) {
        if (productCategoryStyleSet) {
          if (!productCategoryStyleSet.has(sale.styleNumber)) continue;
        } else if (normalizeCategory(sale.categoryDesc) !== normalizeCategory(localCategory)) continue;
      }
      if (localCustomerType && sale.customerType !== localCustomerType) continue;
      if (localCustomer && sale.customer !== localCustomer) continue;
      if (localRep && sale.salesRep !== localRep) continue;
      if (designerStyleSet && !designerStyleSet.has(sale.styleNumber)) continue;
      const ch = classifyChannel(sale);
      if (!ch) continue;
      if (!sale.styleNumber) continue;

      const styleKey = combineStyles
        ? getCombineKey(sale.styleNumber)
        : sale.styleNumber;

      const chMap = map.get(ch)!;
      chMap.set(styleKey, (chMap.get(styleKey) || 0) + (sale.revenue || 0));

      const totalMap = map.get('total')!;
      totalMap.set(styleKey, (totalMap.get(styleKey) || 0) + (sale.revenue || 0));

      // Also aggregate into allWholesale
      if (wholesaleChannels.has(ch)) {
        const whMap = map.get('allWholesale')!;
        whMap.set(styleKey, (whMap.get(styleKey) || 0) + (sale.revenue || 0));
      }
    }

    return map;
  }, [sales, priorSeasons, localDivision, selectedGender, localCategory, productCategoryStyleSet, localCustomerType, localCustomer, localRep, designerStyleSet, combineStyles]);

  // ── 5. Channel rankings ───────────────────────────────────────
  const channelRankings = useMemo(() => {
    const rankings = new Map<ChannelId, RankedStyle[]>();

    for (const { id: chId } of CHANNEL_META) {
      const chMap = channelSalesMap.get(chId);
      if (!chMap) { rankings.set(chId, []); continue; }

      const sorted = Array.from(chMap.entries())
        .sort((a, b) => b[1].revenue - a[1].revenue)
        .slice(0, TOP_N);

      const priorChMap = priorSalesMap.get(chId as ChannelId);

      const ranked: RankedStyle[] = sorted.map(([styleNum, data], i) => {
        // Trend: compare vs prior season
        let trend: 'up' | 'down' | 'flat' = 'flat';
        if (priorChMap) {
          const priorRev = priorChMap.get(styleNum) || 0;
          if (priorRev > 0) {
            const pctChange = (data.revenue - priorRev) / priorRev;
            if (pctChange > 0.05) trend = 'up';
            else if (pctChange < -0.05) trend = 'down';
          } else if (data.revenue > 0) {
            trend = 'up'; // New style with revenue
          }
        }

        return {
          rank: i + 1,
          styleNumber: styleNum,
          styleDesc: data.desc,
          revenue: data.revenue,
          units: data.units,
          inF26: f26StyleSet.has(styleNum),
          trend,
        };
      });

      rankings.set(chId, ranked);
    }

    return rankings;
  }, [channelSalesMap, f26StyleSet, priorSalesMap, combineWholesale]);

  // ── 6. Cross-channel ranks ────────────────────────────────────
  // Map<styleNumber, Map<channelId, rank>>
  const crossChannelRanks = useMemo(() => {
    const map = new Map<string, Map<ChannelId, number>>();
    Array.from(channelRankings.entries()).forEach(([chId, ranked]) => {
      for (const style of ranked) {
        if (!map.has(style.styleNumber)) map.set(style.styleNumber, new Map());
        map.get(style.styleNumber)!.set(chId, style.rank);
      }
    });
    return map;
  }, [channelRankings]);

  // ── 7. Channel gaps ───────────────────────────────────────────
  const channelGaps = useMemo(() => {
    const gaps: GapInfo[] = [];
    const nonTotalChannels = NON_TOTAL_CHANNELS;

    // Collect all styles that appear in top 10 of any non-total channel
    const allTopStyles = new Set<string>();
    for (const chId of nonTotalChannels) {
      const ranked = channelRankings.get(chId) || [];
      ranked.forEach(s => allTopStyles.add(s.styleNumber));
    }

    // For each top style, check if it's missing from any channel
    Array.from(allTopStyles).forEach(styleNum => {
      const ranks = crossChannelRanks.get(styleNum);
      if (!ranks) return;

      nonTotalChannels.forEach(chId => {
        if (!ranks.has(chId)) {
          // This style is missing from this channel but is top-10 in at least one other
          const topInParts: string[] = [];
          nonTotalChannels.forEach(otherCh => {
            if (otherCh === chId) return;
            const r = ranks.get(otherCh);
            if (r) {
              const label = CHANNEL_META.find(m => m.id === otherCh)?.label || otherCh;
              topInParts.push(`#${r} ${label}`);
            }
          });

          // Get style desc
          const totalRanked = channelRankings.get('total') || [];
          const desc = totalRanked.find(s => s.styleNumber === styleNum)?.styleDesc || styleNum;

          gaps.push({
            styleNumber: styleNum,
            styleDesc: desc,
            missingFrom: chId,
            topIn: topInParts.join(', '),
          });
        }
      });
    });

    return gaps;
  }, [channelRankings, crossChannelRanks, combineWholesale]);

  // ── 8. Summary stats ──────────────────────────────────────────
  const summaryStats = useMemo(() => {
    const allStyles = new Set<string>();
    Array.from(channelRankings.entries()).forEach(([, ranked]) => {
      ranked.forEach((s: RankedStyle) => allStyles.add(s.styleNumber));
    });

    const allStylesArr = Array.from(allStyles);
    const inF26 = allStylesArr.filter(s => f26StyleSet.has(s));
    const notInF26 = allStylesArr.filter(s => !f26StyleSet.has(s));

    // Channel consistency: styles that appear in ALL non-total channels
    const nonTotalChannels = NON_TOTAL_CHANNELS;
    let consistentCount = 0;
    allStylesArr.forEach(styleNum => {
      const ranks = crossChannelRanks.get(styleNum);
      if (!ranks) return;
      const channelsPresent = nonTotalChannels.filter(ch => ranks.has(ch)).length;
      if (channelsPresent === nonTotalChannels.length) consistentCount++;
    });

    const consistencyPct = allStyles.size > 0 ? Math.round((consistentCount / allStyles.size) * 100) : 0;

    // At-risk: top sellers not in F26
    const atRisk = notInF26.map(sn => {
      const totalRanked = channelRankings.get('total') || [];
      const found = totalRanked.find(s => s.styleNumber === sn);
      return { styleNumber: sn, styleDesc: found?.styleDesc || sn };
    });

    return {
      totalStyles: allStyles.size,
      inF26Count: inF26.length,
      notInF26Count: notInF26.length,
      gapCount: channelGaps.length,
      consistencyPct,
      consistentCount,
      atRisk,
    };
  }, [channelRankings, f26StyleSet, crossChannelRanks, channelGaps, combineWholesale]);

  // ── 9. Heatmap rows: ALL styles with top-10 presence in any channel ──
  const heatmapRows = useMemo(() => {
    // Collect every style that's in the top 10 of ANY channel (including total)
    const styleMap = new Map<string, { styleNumber: string; styleDesc: string; revenue: number; inF26: boolean; totalRank: number }>();
    for (const [chId, ranked] of Array.from(channelRankings.entries())) {
      for (const style of ranked) {
        if (!styleMap.has(style.styleNumber)) {
          // Get total revenue for sorting
          const totalData = channelSalesMap.get('total')?.get(style.styleNumber);
          const totalRanked = channelRankings.get('total') || [];
          const totalEntry = totalRanked.find(s => s.styleNumber === style.styleNumber);
          styleMap.set(style.styleNumber, {
            styleNumber: style.styleNumber,
            styleDesc: style.styleDesc,
            revenue: totalData?.revenue || style.revenue,
            inF26: f26StyleSet.has(style.styleNumber),
            totalRank: totalEntry?.rank || 999,
          });
        }
      }
    }

    // Sort by total revenue descending
    const allStyles = Array.from(styleMap.values()).sort((a, b) => b.revenue - a.revenue);

    return allStyles.map((style, i) => {
      const channelData = NON_TOTAL_CHANNELS.map(chId => {
        const chRanked = channelRankings.get(chId) || [];
        const found = chRanked.find(s => s.styleNumber === style.styleNumber);
        if (found) {
          return { chId, rank: found.rank, revenue: found.revenue };
        }
        // Check if style has any sales in this channel (just not top 10)
        const chMap = channelSalesMap.get(chId);
        const salesData = chMap?.get(style.styleNumber);
        if (salesData && salesData.revenue > 0) {
          return { chId, rank: null as number | null, revenue: salesData.revenue }; // has sales but not top 10
        }
        return { chId, rank: null as number | null, revenue: 0 }; // true gap
      });
      return {
        rank: i + 1,
        styleNumber: style.styleNumber,
        styleDesc: style.styleDesc,
        revenue: style.revenue,
        inF26: style.inF26,
        totalRank: style.totalRank,
        channelData,
      };
    });
  }, [channelRankings, channelSalesMap, f26StyleSet, combineWholesale]);

  // Heat color classes based on rank (10 individual levels matching wireframe)
  function getHeatStyle(rank: number | null, hasRevenue: boolean): { bg: string; text: string } {
    if (rank === null) {
      return hasRevenue
        ? { bg: 'bg-surface-secondary', text: 'text-text-faint' }
        : { bg: 'bg-amber-500/[0.12] border border-dashed border-amber-500/40', text: 'text-amber-500' };
    }
    switch (rank) {
      case 1:  return { bg: 'bg-emerald-500/50',     text: 'text-white' };
      case 2:  return { bg: 'bg-emerald-500/35',     text: 'text-white' };
      case 3:  return { bg: 'bg-emerald-500/[0.22]', text: 'text-emerald-400 dark:text-emerald-300' };
      case 4:  return { bg: 'bg-cyan-500/[0.18]',    text: 'text-cyan-600 dark:text-cyan-400' };
      case 5:  return { bg: 'bg-cyan-500/[0.12]',    text: 'text-cyan-600 dark:text-cyan-400' };
      case 6:  return { bg: 'bg-surface-tertiary',    text: 'text-text-muted' };
      case 7:  return { bg: 'bg-surface-secondary',   text: 'text-text-muted' };
      case 8:  return { bg: 'bg-surface-secondary',   text: 'text-text-faint' };
      case 9:  return { bg: 'bg-surface-secondary',   text: 'text-text-faint' };
      case 10: return { bg: 'bg-surface-secondary',   text: 'text-text-faint opacity-70' };
      default: return { bg: 'bg-surface-secondary',   text: 'text-text-faint' };
    }
  }

  // ── Export handler ────────────────────────────────────────────
  const handleExport = () => {
    const rows: Record<string, unknown>[] = [];
    for (const { id: chId, label } of CHANNEL_META) {
      const ranked = channelRankings.get(chId) || [];
      for (const s of ranked) {
        rows.push({
          Channel: label,
          Rank: s.rank,
          StyleNumber: s.styleNumber,
          StyleDesc: s.styleDesc,
          Revenue: s.revenue,
          Units: s.units,
          [`In${futureSeasonLabel}`]: s.inF26 ? 'Yes' : 'No',
          Trend: s.trend,
        });
      }
    }
    const seasonSuffix = activeSeasons.length > 0 ? `_${activeSeasons.join('-')}` : '';
    exportToExcel(rows, `top-styles-by-channel${seasonSuffix}`);
  };

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-4">
      <SalesLoadingBanner />
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-display font-semibold text-text-primary">Top Styles by Channel</h2>
          <p className="text-xs text-text-muted mt-1">
            Identify channel gaps and track {futureSeasonLabel} assortment planning
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setGapDetectionEnabled(!gapDetectionEnabled)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
              gapDetectionEnabled
                ? 'bg-amber-500/15 border border-amber-500/50 text-amber-500'
                : 'bg-surface border border-border-primary text-text-muted hover:bg-hover'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            Gap Detection {gapDetectionEnabled ? 'On' : 'Off'}
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2.5 text-xs font-medium rounded-lg border border-border-primary bg-surface text-text-primary hover:bg-surface-tertiary transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
        </div>
      </div>

      {/* Data Sources Legend */}
      <SourceLegend sources={['sales', 'linelist']} className="bg-surface rounded-lg border border-border-primary p-3" />

      {/* View Controls */}
      <div className="flex flex-wrap gap-3 items-center">
          {/* Sales Rep (page-specific filter) */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-text-muted uppercase tracking-wide">Sales Rep</label>
            <select
              className={`border border-border-primary rounded-lg px-3 py-1.5 text-sm bg-surface min-w-[160px] focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${
                localRep ? 'border-purple-400 bg-purple-500/10' : ''
              }`}
              value={localRep}
              onChange={e => setLocalRep(e.target.value)}
            >
              <option value="">All Reps</option>
              {reps.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          <div className="flex-1" />

          {/* Combine Styles Toggle */}
          <button
            onClick={() => setCombineStyles(!combineStyles)}
            className={`ml-auto flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors border ${
              combineStyles
                ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400'
                : 'bg-surface-secondary border-border-primary text-text-muted hover:text-text-primary'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            Combine Styles{combineStyles ? ' ON' : ''}
          </button>

          {/* Wholesale Combine Toggle */}
          <button
            onClick={() => setCombineWholesale(!combineWholesale)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors border ${
              combineWholesale
                ? 'bg-purple-500/20 border-purple-500/50 text-purple-400'
                : 'bg-surface-secondary border-border-primary text-text-muted hover:text-text-primary'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" />
            </svg>
            {combineWholesale ? 'All Wholesale' : 'Split Channels'}
          </button>

          {/* View Toggle */}
          <div className="flex items-center gap-1 bg-surface-secondary rounded-lg p-1">
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-colors ${
                viewMode === 'list'
                  ? 'bg-blue-500 text-white'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              List
            </button>
            <button
              onClick={() => setViewMode('heatmap')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-colors ${
                viewMode === 'heatmap'
                  ? 'bg-blue-500 text-white'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              <Grid3X3 className="w-3.5 h-3.5" />
              Heatmap
            </button>
          </div>
      </div>

      {/* ═══════════════ LIST VIEW ═══════════════ */}
      {viewMode === 'list' && <>

      {/* Gap Alert Banner */}
      {gapDetectionEnabled && channelGaps.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <h3 className="text-[13px] font-semibold text-amber-500">Channel Gap Alert</h3>
            <p className="text-xs text-text-muted">
              {channelGaps.length} top-selling style{channelGaps.length > 1 ? 's are' : ' is'} missing from a channel.{' '}
              {channelGaps.length <= 3 && channelGaps.map((g, i) => (
                <span key={i}>
                  <strong className="text-text-primary">{g.styleDesc}</strong>
                  {' '}is missing from {CHANNEL_META.find(m => m.id === g.missingFrom)?.label}
                  {i < channelGaps.length - 1 ? '. ' : '.'}
                </span>
              ))}
            </p>
          </div>
          <button
            onClick={() => setShowGapsOnly(!showGapsOnly)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              showGapsOnly
                ? 'bg-amber-500 text-black'
                : 'bg-amber-500/20 text-amber-500 hover:bg-amber-500/30'
            }`}
          >
            {showGapsOnly ? 'Show All' : 'Show Gaps Only'}
          </button>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-5 text-[11px] text-text-muted">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          In {futureSeasonLabel} Plan
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-500" />
          Not in {futureSeasonLabel}
        </div>
        {gapDetectionEnabled && (
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded-sm bg-amber-500/20 border border-amber-500/50" />
            Channel Gap
          </div>
        )}
      </div>

      {/* 6-Column Channel Grid */}
      <div className={`grid gap-2 ${combineWholesale ? 'grid-cols-4' : 'grid-cols-6'}`}>
        {CHANNEL_META.map(({ id: chId, label }) => {
          const ranked = channelRankings.get(chId) || [];
          const chGaps = channelGaps.filter(g => g.missingFrom === chId);
          const isTotal = chId === 'total';

          const isAllWholesale = chId === 'allWholesale';

          return (
            <div
              key={chId}
              className={`rounded-xl border overflow-hidden ${
                isTotal
                  ? 'bg-gradient-to-br from-surface to-blue-500/[0.08] border-blue-500'
                  : isAllWholesale
                  ? 'bg-gradient-to-br from-surface to-purple-500/[0.08] border-purple-500/50'
                  : 'bg-surface border-border-primary'
              }`}
            >
              {/* Channel Header */}
              <div className={`px-2 py-1.5 border-b flex items-center justify-between ${
                isTotal
                  ? 'bg-blue-500/10 border-blue-500/30'
                  : isAllWholesale
                  ? 'bg-purple-500/10 border-purple-500/30'
                  : 'bg-surface-secondary border-border-primary'
              }`}>
                <h3 className={`text-[11px] font-semibold ${isTotal ? 'text-blue-400' : isAllWholesale ? 'text-purple-400' : 'text-text-primary'}`}>
                  {label}
                </h3>
                <span className="text-[9px] text-text-muted">
                  {gapDetectionEnabled && chGaps.length > 0 ? (
                    <span className="text-amber-500">{chGaps.length} gap{chGaps.length > 1 ? 's' : ''}</span>
                  ) : (
                    `Top ${TOP_N}`
                  )}
                </span>
              </div>

              {/* Gap sub-alert */}
              {gapDetectionEnabled && chGaps.length > 0 && !showGapsOnly && (
                <div className="px-3 py-2 bg-amber-500/[0.05] border-b border-amber-500/20">
                  {chGaps.map((g, i) => (
                    <div key={i} className="flex items-center gap-1.5 py-0.5 text-[11px]">
                      <AlertTriangle className="w-3 h-3 text-amber-500 flex-shrink-0" />
                      <span className="text-amber-500 font-medium truncate">{g.styleDesc}</span>
                      <span className="text-text-faint">missing</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Style List */}
              <div className="max-h-[520px] overflow-y-auto">
                {!showGapsOnly && ranked.map(style => {
                  const isHighlighted = hoveredStyle === style.styleNumber;
                  const otherChannels = CHANNEL_META.filter(c => c.id !== chId && c.id !== 'total');
                  const otherRanks = otherChannels.map(c => {
                    const r = crossChannelRanks.get(style.styleNumber)?.get(c.id);
                    return r ? { ch: c.label.split(' ')[0], rank: r } : null;
                  }).filter(Boolean) as { ch: string; rank: number }[];

                  return (
                    <div
                      key={style.styleNumber}
                      className={`px-2 py-1.5 border-b border-border-primary cursor-pointer transition-colors ${
                        isHighlighted ? 'bg-blue-500/10' : 'hover:bg-hover'
                      }`}
                      onMouseEnter={() => setHoveredStyle(style.styleNumber)}
                      onMouseLeave={() => setHoveredStyle(null)}
                      onClick={() => onStyleClick(style.styleNumber)}
                    >
                      {/* Single row: rank · dot · name · revenue */}
                      <div className="flex items-center gap-1 min-w-0">
                        <span className={`font-mono text-[10px] w-[14px] flex-shrink-0 text-center ${
                          isTotal ? 'text-blue-400' : 'text-text-faint'
                        }`}>
                          {style.rank}
                        </span>
                        <span className={`w-[5px] h-[5px] rounded-full flex-shrink-0 ${
                          style.inF26 ? 'bg-emerald-500' : 'bg-red-500'
                        }`} title={style.inF26 ? `In ${futureSeasonLabel}` : `Not in ${futureSeasonLabel}`} />
                        <span className="text-[11px] font-medium text-text-primary truncate min-w-0 flex-1">
                          {style.styleDesc || style.styleNumber}
                        </span>
                        <span className="font-mono text-[11px] text-text-secondary flex-shrink-0 ml-1">
                          {formatCurrencyShort(style.revenue)}
                        </span>
                      </div>

                      {/* Cross-channel ranks (visible on hover, not on Total) */}
                      {!isTotal && isHighlighted && otherRanks.length > 0 && (
                        <div className="mt-1 pt-1 border-t border-border-primary ml-[19px]">
                          <div className="flex flex-wrap gap-1">
                            {otherRanks.map(r => (
                              <span
                                key={r.ch}
                                className={`px-1 py-0.5 rounded text-[9px] ${
                                  r.rank <= 3
                                    ? 'bg-emerald-500/15 text-emerald-400'
                                    : 'bg-surface-secondary text-text-muted'
                                }`}
                              >
                                #{r.rank} {r.ch}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Gap placeholders */}
                {gapDetectionEnabled && chGaps.map((g, i) => (
                  <div key={`gap-${i}`} className="px-3 py-2.5 bg-amber-500/[0.05] border-l-[3px] border-l-amber-500 border-b border-border-primary">
                    <div className="flex items-center gap-1.5 mb-1">
                      <AlertTriangle className="w-3 h-3 text-amber-500" />
                      <span className="text-xs font-medium text-amber-500">{g.styleDesc}</span>
                      <span className="text-[9px] text-text-faint uppercase">Missing</span>
                    </div>
                    <div className="text-[10px] text-text-muted">{g.topIn}</div>
                  </div>
                ))}

                {/* Empty state */}
                {ranked.length === 0 && (!gapDetectionEnabled || chGaps.length === 0) && (
                  <div className="px-3 py-8 text-center text-xs text-text-faint">
                    No sales data for this channel
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* F26 Planning Summary */}
      <div className="rounded-xl bg-surface border border-border-primary p-4">
        <h3 className="text-[13px] font-semibold text-text-primary mb-3">
          {futureSeasonLabel} Planning Summary
        </h3>

        <div className={`grid gap-3 mb-4 ${gapDetectionEnabled ? 'grid-cols-5' : 'grid-cols-4'}`}>
          <div className="rounded-lg bg-surface-secondary p-3">
            <div className="text-[10px] text-text-faint mb-1">Styles in Top 10</div>
            <div className="text-2xl font-semibold font-mono text-text-primary">{summaryStats.totalStyles}</div>
          </div>
          <div className="rounded-lg bg-surface-secondary p-3">
            <div className="text-[10px] text-text-faint mb-1">In {futureSeasonLabel} Plan</div>
            <div className="text-2xl font-semibold font-mono text-emerald-500">{summaryStats.inF26Count}</div>
          </div>
          <div className="rounded-lg bg-surface-secondary p-3">
            <div className="text-[10px] text-text-faint mb-1">Not in {futureSeasonLabel}</div>
            <div className="text-2xl font-semibold font-mono text-red-500">{summaryStats.notInF26Count}</div>
          </div>
          {gapDetectionEnabled && (
            <div className="rounded-lg bg-surface-secondary p-3">
              <div className="text-[10px] text-text-faint mb-1">Channel Gaps</div>
              <div className="text-2xl font-semibold font-mono text-amber-500">{summaryStats.gapCount}</div>
            </div>
          )}
          <div className="rounded-lg bg-gradient-to-br from-surface-secondary to-blue-500/15 border border-blue-500/30 p-3">
            <div className="text-[10px] text-text-faint mb-1">Channel Consistency</div>
            <div className="text-2xl font-semibold font-mono text-blue-400">{summaryStats.consistencyPct}%</div>
            <div className="text-[10px] text-text-faint mt-1">
              {summaryStats.consistentCount} of {summaryStats.totalStyles} in all channels
            </div>
          </div>
        </div>

        {/* At-risk styles */}
        {summaryStats.atRisk.length > 0 && (
          <div className="pt-3 border-t border-border-primary">
            <div className="text-[10px] text-text-faint uppercase tracking-wider mb-2">
              Top Sellers Not in {futureSeasonLabel} Plan
            </div>
            <div className="flex flex-wrap gap-2">
              {summaryStats.atRisk.map(s => (
                <button
                  key={s.styleNumber}
                  onClick={() => onStyleClick(s.styleNumber)}
                  className="px-3 py-1.5 rounded-md text-xs font-medium bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-colors"
                >
                  {s.styleDesc || s.styleNumber}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      </>}
      {/* ═══════════════ END LIST VIEW ═══════════════ */}

      {/* ═══════════════ HEATMAP VIEW ═══════════════ */}
      {viewMode === 'heatmap' && <>

      {/* Heatmap Legend */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-[10px] text-text-muted">
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/50" /> #1</div>
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/35" /> #2-3</div>
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/[0.22]" /> #4-5</div>
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-surface-secondary border border-border-primary" /> #6-10</div>
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-500/[0.12] border border-dashed border-amber-500/40" /> Not in Top 10</div>
          <span className="mx-2 w-px h-3 bg-border-primary" />
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" /> In {futureSeasonLabel}</div>
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" /> Not in {futureSeasonLabel}</div>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-text-faint">
          <span>Low</span>
          <div className="flex h-2.5 rounded-sm overflow-hidden">
            <div className="w-4 bg-surface-secondary" />
            <div className="w-4 bg-cyan-500/[0.12]" />
            <div className="w-4 bg-emerald-500/[0.22]" />
            <div className="w-4 bg-emerald-500/35" />
            <div className="w-4 bg-emerald-500/50" />
          </div>
          <span>High</span>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-5 gap-3">
        <div className="rounded-lg bg-surface border border-border-primary p-3">
          <div className="text-[10px] text-text-faint mb-1">Styles in Top 10</div>
          <div className="text-2xl font-semibold font-mono text-text-primary">{summaryStats.totalStyles}</div>
          <div className="text-[10px] text-text-faint mt-0.5">across all channels</div>
        </div>
        <div className="rounded-lg bg-surface border border-border-primary p-3">
          <div className="text-[10px] text-text-faint mb-1">In {futureSeasonLabel} Plan</div>
          <div className="text-2xl font-semibold font-mono text-emerald-500">{summaryStats.inF26Count}</div>
          <div className="text-[10px] text-text-faint mt-0.5">{summaryStats.totalStyles > 0 ? Math.round((summaryStats.inF26Count / summaryStats.totalStyles) * 100) : 0}% coverage</div>
        </div>
        <div className="rounded-lg bg-surface border border-border-primary p-3">
          <div className="text-[10px] text-text-faint mb-1">Not in {futureSeasonLabel}</div>
          <div className="text-2xl font-semibold font-mono text-red-500">{summaryStats.notInF26Count}</div>
          <div className="text-[10px] text-text-faint mt-0.5">at risk</div>
        </div>
        <div className="rounded-lg bg-surface border border-border-primary p-3">
          <div className="text-[10px] text-text-faint mb-1">Channel Gaps</div>
          <div className="text-2xl font-semibold font-mono text-amber-500">{summaryStats.gapCount}</div>
          <div className="text-[10px] text-text-faint mt-0.5">missing opportunities</div>
        </div>
        <div className="rounded-lg bg-gradient-to-br from-surface to-blue-500/[0.08] border border-blue-500/30 p-3">
          <div className="text-[10px] text-text-faint mb-1">Consistency</div>
          <div className="text-2xl font-semibold font-mono text-blue-400">{summaryStats.consistencyPct}%</div>
          <div className="text-[10px] text-text-faint mt-0.5">{summaryStats.consistentCount} of {summaryStats.totalStyles} in all channels</div>
        </div>
      </div>

      {/* Heatmap Grid */}
      <div className="rounded-xl bg-surface border border-border-primary overflow-hidden">
        {/* Heatmap Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-primary bg-surface-secondary">
          <div>
            <div className="text-[13px] font-semibold text-text-primary">Channel Performance Matrix</div>
            <div className="text-[11px] text-text-muted mt-0.5">
              {localDivision || 'All'}{localCategory ? ` · ${localCategory}` : ''} · Ranked by total revenue · Showing top {heatmapExpanded ? heatmapRows.length : Math.min(TOP_N, heatmapRows.length)}
            </div>
          </div>
          <button
            onClick={() => setShowRevenue(!showRevenue)}
            className={`px-3 py-1.5 rounded-md text-[11px] font-medium transition-colors ${
              showRevenue
                ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                : 'bg-surface border border-border-primary text-text-muted hover:text-text-primary'
            }`}
          >
            {showRevenue ? 'Hide Revenue' : 'Show Revenue'}
          </button>
        </div>

        {/* Grid */}
        <div className="p-4 overflow-x-auto">
          <div className="grid gap-1.5 min-w-[800px]" style={{ gridTemplateColumns: `200px 90px repeat(${NON_TOTAL_CHANNELS.length}, 1fr)` }}>
            {/* Column Headers */}
            <div className="px-3 py-2 text-[11px] font-semibold text-text-muted text-left">Style</div>
            <div className="px-2 py-2 text-[11px] font-semibold text-blue-400 text-center rounded-md bg-blue-500/[0.08]">Total</div>
            {NON_TOTAL_CHANNELS.map(chId => (
              <div key={chId} className="px-2 py-2 text-[11px] font-semibold text-text-muted text-center rounded-md bg-surface-secondary">
                {CHANNEL_SHORT[chId]}
              </div>
            ))}

            {/* Data Rows */}
            {(heatmapExpanded ? heatmapRows : heatmapRows.slice(0, TOP_N)).map(style => (
              <React.Fragment key={style.styleNumber}>
                {/* Style name cell */}
                <div
                  className="flex items-center gap-2 px-3 py-2.5 rounded-md bg-surface-secondary cursor-pointer hover:bg-hover transition-colors"
                  onClick={() => onStyleClick(style.styleNumber)}
                >
                  <span className="font-mono text-[10px] text-text-faint w-[18px] text-center flex-shrink-0">{style.rank}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-medium text-text-primary truncate">{style.styleDesc || style.styleNumber}</div>
                    <div className="text-[10px] text-text-faint mt-0.5">{style.styleNumber}</div>
                  </div>
                  <span className={`w-[6px] h-[6px] rounded-full flex-shrink-0 ${style.inF26 ? 'bg-emerald-500' : 'bg-red-500'}`} />
                </div>

                {/* Total revenue cell */}
                <div className="flex items-center justify-center px-2 py-2.5 rounded-md bg-blue-500/[0.08] font-mono text-[12px] font-semibold text-blue-400">
                  {formatCurrencyShort(style.revenue)}
                </div>

                {/* Channel heat cells */}
                {style.channelData.map(cd => {
                  const isGap = cd.rank === null && cd.revenue === 0;
                  const heat = getHeatStyle(cd.rank, cd.revenue > 0);
                  return (
                    <div
                      key={cd.chId}
                      className={`flex flex-col items-center justify-center py-2 rounded-md transition-all hover:scale-[1.03] cursor-pointer min-h-[48px] ${heat.bg} ${heat.text}`}
                      onClick={() => onStyleClick(style.styleNumber)}
                    >
                      {isGap ? (
                        <span className="text-[10px] font-semibold">GAP</span>
                      ) : cd.rank !== null ? (
                        <>
                          <span className="font-mono text-[16px] font-bold leading-none">{cd.rank}</span>
                          {showRevenue && <span className="text-[9px] mt-1 opacity-80">{formatCurrencyShort(cd.revenue)}</span>}
                        </>
                      ) : (
                        <>
                          <span className="text-[10px]">—</span>
                          {showRevenue && cd.revenue > 0 && <span className="text-[9px] mt-0.5 opacity-60">{formatCurrencyShort(cd.revenue)}</span>}
                        </>
                      )}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border-primary bg-surface-secondary">
          <span className="text-[11px] text-text-faint">
            Showing {heatmapExpanded ? heatmapRows.length : Math.min(TOP_N, heatmapRows.length)} of {heatmapRows.length} styles with Top {TOP_N} presence in at least one channel
          </span>
          {heatmapRows.length > TOP_N && (
            <button
              onClick={() => setHeatmapExpanded(!heatmapExpanded)}
              className="px-3 py-1.5 rounded-md text-[11px] font-medium bg-surface border border-border-primary text-text-muted hover:text-text-primary hover:bg-hover transition-colors"
            >
              {heatmapExpanded ? 'Show Less' : `Load More (${heatmapRows.length - TOP_N})`}
            </button>
          )}
        </div>
      </div>

      {/* At-risk styles (heatmap view) */}
      {summaryStats.atRisk.length > 0 && (
        <div className="rounded-xl bg-surface border border-border-primary p-4">
          <div className="text-[10px] text-text-faint uppercase tracking-wider mb-2">
            Top Sellers Not in {futureSeasonLabel} Plan
          </div>
          <div className="flex flex-wrap gap-2">
            {summaryStats.atRisk.map(s => (
              <button
                key={s.styleNumber}
                onClick={() => onStyleClick(s.styleNumber)}
                className="px-3 py-1.5 rounded-md text-xs font-medium bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-colors"
              >
                {s.styleDesc || s.styleNumber}
              </button>
            ))}
          </div>
        </div>
      )}

      </>}
      {/* ═══════════════ END HEATMAP VIEW ═══════════════ */}

    </div>
  );
}
