/**
 * Maps each view to its exportable data for global Excel export.
 * Uses the same filtered data that page.tsx passes to views.
 */

import { ViewId } from '@/components/layout/Sidebar';
import {
  Product,
  SalesRecord,
  PricingRecord,
  CostRecord,
  InventoryRecord,
} from '@/types/product';
import { matchesFilter } from '@/utils/filters';
import { matchesDivision } from '@/utils/divisionMap';

export interface ViewDataBundle {
  products: Product[];
  sales: SalesRecord[];
  pricing: PricingRecord[];
  costs: CostRecord[];
  inventory: InventoryRecord[];
  selectedSeason: string;
  selectedDivision: string;
  selectedCategory: string;
  searchQuery: string;
}

export interface ExcelSheet {
  name: string;
  data: Record<string, unknown>[];
}

// ── Common filter helpers ───────────────────────────────────────────

function matchesSeason(season: string, filter: string): boolean {
  if (!filter) return true;
  if (filter === '__ALL_SP__') return season.endsWith('SP');
  if (filter === '__ALL_FA__') return season.endsWith('FA');
  return season === filter;
}

function matchesSearch(row: Record<string, unknown>, q: string): boolean {
  if (!q) return true;
  const lower = q.toLowerCase();
  return Object.values(row).some(v =>
    v != null && String(v).toLowerCase().includes(lower)
  );
}

function filterProducts(bundle: ViewDataBundle): Product[] {
  return bundle.products.filter(p => {
    if (!matchesSeason(p.season, bundle.selectedSeason)) return false;
    if (!matchesDivision(p.divisionDesc ?? '', bundle.selectedDivision)) return false;
    if (!matchesFilter(p.categoryDesc, bundle.selectedCategory)) return false;
    if (bundle.searchQuery) {
      const q = bundle.searchQuery.toLowerCase();
      if (
        !p.styleNumber.toLowerCase().includes(q) &&
        !p.styleDesc.toLowerCase().includes(q) &&
        !(p.colorDesc || '').toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });
}

function filterSales(bundle: ViewDataBundle): SalesRecord[] {
  return bundle.sales.filter(s => {
    if (!matchesSeason(s.season, bundle.selectedSeason)) return false;
    if (!matchesDivision(s.divisionDesc ?? '', bundle.selectedDivision)) return false;
    if (!matchesFilter(s.categoryDesc, bundle.selectedCategory)) return false;
    if (bundle.searchQuery) {
      const q = bundle.searchQuery.toLowerCase();
      if (
        !s.styleNumber.toLowerCase().includes(q) &&
        !s.styleDesc.toLowerCase().includes(q) &&
        !(s.customer || '').toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });
}

function filterCosts(bundle: ViewDataBundle): CostRecord[] {
  return bundle.costs.filter(c => {
    if (!matchesSeason(c.season, bundle.selectedSeason)) return false;
    if (bundle.searchQuery) {
      const q = bundle.searchQuery.toLowerCase();
      if (
        !c.styleNumber.toLowerCase().includes(q) &&
        !c.styleName.toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });
}

function filterPricing(bundle: ViewDataBundle): PricingRecord[] {
  return bundle.pricing.filter(p => {
    if (!matchesSeason(p.season, bundle.selectedSeason)) return false;
    if (bundle.searchQuery) {
      const q = bundle.searchQuery.toLowerCase();
      if (
        !p.styleNumber.toLowerCase().includes(q) &&
        !p.styleDesc.toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });
}

// ── View-specific data builders ─────────────────────────────────────

function buildDashboardData(b: ViewDataBundle): ExcelSheet[] {
  const prods = filterProducts(b);
  const sl = filterSales(b);
  return [
    {
      name: 'Products',
      data: prods.map(p => ({
        'Style': p.styleNumber, 'Description': p.styleDesc, 'Season': p.season,
        'Division': p.divisionDesc, 'Category': p.categoryDesc,
        'MSRP': p.msrp, 'Wholesale': p.price, 'Cost': p.cost,
      })),
    },
    {
      name: 'Sales Summary',
      data: sl.map(s => ({
        'Style': s.styleNumber, 'Description': s.styleDesc, 'Season': s.season,
        'Customer': s.customer, 'Revenue': s.revenue, 'Units Booked': s.unitsBooked,
        'Division': s.divisionDesc, 'Category': s.categoryDesc,
      })),
    },
  ];
}

function buildSalesData(b: ViewDataBundle): ExcelSheet[] {
  const sl = filterSales(b);
  return [{
    name: 'Sales',
    data: sl.map(s => ({
      'Style': s.styleNumber, 'Description': s.styleDesc,
      'Color': s.colorCode || s.color, 'Color Desc': s.colorDesc,
      'Season': s.season, 'Customer': s.customer, 'Customer Type': s.customerType,
      'Revenue': s.revenue, 'Units Booked': s.unitsBooked,
      'Units Shipped': s.unitsShipped || 0, 'Units Returned': s.unitsReturned || 0,
      'Wholesale Price': s.wholesalePrice, 'MSRP': s.msrp, 'Net Unit Price': s.netUnitPrice,
      'Division': s.divisionDesc, 'Category': s.categoryDesc, 'Gender': s.gender,
      'Invoice Date': s.invoiceDate || '', 'Accounting Period': s.accountingPeriod || '',
      'Ship To State': s.shipToState || '',
    })),
  }];
}

function buildPricingData(b: ViewDataBundle): ExcelSheet[] {
  const pr = filterPricing(b);
  return [{
    name: 'Pricing',
    data: pr.map(p => ({
      'Style': p.styleNumber, 'Description': p.styleDesc, 'Season': p.season,
      'Wholesale': p.price, 'MSRP': p.msrp, 'Cost': p.cost,
      'Margin %': p.price > 0 ? ((p.price - p.cost) / p.price * 100).toFixed(1) : '',
    })),
  }];
}

function buildCostsData(b: ViewDataBundle): ExcelSheet[] {
  const cs = filterCosts(b);
  return [{
    name: 'Costs',
    data: cs.map(c => ({
      'Style': c.styleNumber, 'Name': c.styleName, 'Season': c.season,
      'Factory': c.factory, 'Country': c.countryOfOrigin,
      'FOB': c.fob, 'Landed': c.landed,
      'Duty': c.dutyCost, 'Tariff': c.tariffCost, 'Freight': c.freightCost, 'Overhead': c.overheadCost,
      'Suggested MSRP': c.suggestedMsrp, 'Suggested Wholesale': c.suggestedWholesale,
      'Margin %': c.margin,
    })),
  }];
}

function buildProductsData(b: ViewDataBundle): ExcelSheet[] {
  const prods = filterProducts(b);
  return [{
    name: 'Style Master',
    data: prods.map(p => ({
      'Style': p.styleNumber, 'Description': p.styleDesc,
      'Color': p.color, 'Color Desc': p.colorDesc,
      'Season': p.season, 'Division': p.divisionDesc, 'Category': p.categoryDesc,
      'MSRP': p.msrp, 'Wholesale': p.price, 'Cost': p.cost,
      'Designer': p.designerName, 'Label': p.labelDesc,
      'Country': p.countryOfOrigin || '', 'Factory': p.factoryName || '',
      'Carry Over': p.carryOver ? 'Y' : 'N', 'Carry Forward': p.carryForward ? 'Y' : 'N',
    })),
  }];
}

function buildCustomersData(b: ViewDataBundle): ExcelSheet[] {
  const sl = filterSales(b);
  // Aggregate by customer
  const map = new Map<string, { revenue: number; units: number; type: string }>();
  for (const s of sl) {
    const key = s.customer || 'Unknown';
    const prev = map.get(key) || { revenue: 0, units: 0, type: '' };
    prev.revenue += s.revenue;
    prev.units += s.unitsBooked;
    if (!prev.type && s.customerType) prev.type = s.customerType;
    map.set(key, prev);
  }
  return [{
    name: 'Customers',
    data: Array.from(map.entries())
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .map(([name, d]) => ({
        'Customer': name, 'Type': d.type, 'Revenue': d.revenue, 'Units': d.units,
      })),
  }];
}

function buildMarginsData(b: ViewDataBundle): ExcelSheet[] {
  const sl = filterSales(b);
  const cs = filterCosts(b);
  const costMap = new Map<string, CostRecord>();
  for (const c of cs) costMap.set(c.styleNumber, c);

  // Aggregate sales by style
  const styleMap = new Map<string, { desc: string; revenue: number; units: number; season: string }>();
  for (const s of sl) {
    const prev = styleMap.get(s.styleNumber) || { desc: s.styleDesc, revenue: 0, units: 0, season: s.season };
    prev.revenue += s.revenue;
    prev.units += s.unitsBooked;
    styleMap.set(s.styleNumber, prev);
  }

  return [{
    name: 'Margins',
    data: Array.from(styleMap.entries()).map(([style, d]) => {
      const cost = costMap.get(style);
      return {
        'Style': style, 'Description': d.desc, 'Season': d.season,
        'Revenue': d.revenue, 'Units': d.units,
        'Landed Cost': cost?.landed || '', 'FOB': cost?.fob || '',
        'Margin %': cost?.margin || '',
      };
    }),
  }];
}

function buildInventoryData(b: ViewDataBundle): ExcelSheet[] {
  const inv = b.inventory.filter(i => {
    if (b.searchQuery) {
      const q = b.searchQuery.toLowerCase();
      if (
        !(i.styleNumber || '').toLowerCase().includes(q) &&
        !(i.styleDesc || '').toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });
  return [{
    name: 'Inventory',
    data: inv.map(i => ({
      'Style': i.styleNumber, 'Description': i.styleDesc,
      'Color': i.color, 'Color Desc': i.colorDesc,
      'Warehouse': i.warehouse || '', 'Type': i.movementType || '',
      'Qty': i.qty, 'Balance': i.balance, 'Extension': i.extension,
      'Period': i.period || '', 'Date': i.movementDate || '',
    })),
  }];
}

function buildLineListData(b: ViewDataBundle): ExcelSheet[] {
  const prods = filterProducts(b);
  return [{
    name: 'Line List',
    data: prods.map(p => ({
      'Style': p.styleNumber, 'Description': p.styleDesc,
      'Color': p.color, 'Color Desc': p.colorDesc,
      'Season': p.season, 'Division': p.divisionDesc, 'Category': p.categoryDesc,
      'Product Line': p.productLineDesc, 'Label': p.labelDesc,
      'MSRP': p.msrp, 'Wholesale': p.price, 'Cost': p.cost,
      'Designer': p.designerName, 'Tech Designer': p.techDesignerName,
      'Country': p.countryOfOrigin || '', 'Factory': p.factoryName || '',
      'Carry Over': p.carryOver ? 'Y' : 'N', 'Carry Forward': p.carryForward ? 'Y' : 'N',
      'Selling Seasons': p.sellingSeasons,
    })),
  }];
}

function buildTariffsData(b: ViewDataBundle): ExcelSheet[] {
  const cs = filterCosts(b);
  return [{
    name: 'Tariff Impact',
    data: cs.filter(c => c.tariffCost > 0 || c.dutyCost > 0).map(c => ({
      'Style': c.styleNumber, 'Name': c.styleName, 'Season': c.season,
      'Country': c.countryOfOrigin, 'Factory': c.factory,
      'FOB': c.fob, 'Duty': c.dutyCost, 'Tariff': c.tariffCost,
      'Landed': c.landed, 'Margin %': c.margin,
    })),
  }];
}

function buildGeoData(b: ViewDataBundle): ExcelSheet[] {
  const sl = filterSales(b);
  // Aggregate by state
  const stateMap = new Map<string, { revenue: number; units: number }>();
  for (const s of sl) {
    const state = s.shipToState || 'Unknown';
    const prev = stateMap.get(state) || { revenue: 0, units: 0 };
    prev.revenue += s.shippedAtNet || s.revenue;
    prev.units += s.unitsShipped || s.unitsBooked;
    stateMap.set(state, prev);
  }
  return [{
    name: 'Sales by State',
    data: Array.from(stateMap.entries())
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .map(([state, d]) => ({
        'State': state, 'Revenue': d.revenue, 'Units': d.units,
      })),
  }];
}

function buildSeasonData(b: ViewDataBundle): ExcelSheet[] {
  const prods = filterProducts(b);
  const sl = filterSales(b);
  return [
    {
      name: 'Season Products',
      data: prods.map(p => ({
        'Style': p.styleNumber, 'Description': p.styleDesc,
        'Season': p.season, 'Division': p.divisionDesc, 'Category': p.categoryDesc,
        'MSRP': p.msrp, 'Wholesale': p.price, 'Cost': p.cost,
      })),
    },
    {
      name: 'Season Sales',
      data: sl.map(s => ({
        'Style': s.styleNumber, 'Description': s.styleDesc, 'Season': s.season,
        'Customer': s.customer, 'Revenue': s.revenue, 'Units': s.unitsBooked,
      })),
    },
  ];
}

function buildSellThroughData(b: ViewDataBundle): ExcelSheet[] {
  const sl = filterSales(b);
  return [{
    name: 'Sell-Through',
    data: sl.map(s => ({
      'Style': s.styleNumber, 'Description': s.styleDesc, 'Season': s.season,
      'Customer': s.customer, 'Units Booked': s.unitsBooked,
      'Units Shipped': s.unitsShipped || 0, 'Units Returned': s.unitsReturned || 0,
      'Revenue': s.revenue,
    })),
  }];
}

function buildValidationData(b: ViewDataBundle): ExcelSheet[] {
  const sl = filterSales(b);
  const prods = filterProducts(b);
  // Simple: export both datasets so user can cross-reference
  return [
    {
      name: 'Products',
      data: prods.map(p => ({
        'Style': p.styleNumber, 'Description': p.styleDesc, 'Season': p.season,
        'Division': p.divisionDesc, 'Category': p.categoryDesc,
        'MSRP': p.msrp, 'Wholesale': p.price, 'Cost': p.cost,
      })),
    },
    {
      name: 'Sales',
      data: sl.map(s => ({
        'Style': s.styleNumber, 'Description': s.styleDesc, 'Season': s.season,
        'Customer': s.customer, 'Revenue': s.revenue, 'Units': s.unitsBooked,
      })),
    },
  ];
}

// ── Main entry point ────────────────────────────────────────────────

export function getViewExportData(
  activeView: ViewId,
  bundle: ViewDataBundle,
): { sheets: ExcelSheet[]; filename: string } | null {
  switch (activeView) {
    case 'dashboard':
      return { sheets: buildDashboardData(bundle), filename: 'KUHL_Dashboard' };
    case 'season':
      return { sheets: buildSeasonData(bundle), filename: 'KUHL_Season' };
    case 'seasoncomp':
      return { sheets: buildSeasonData(bundle), filename: 'KUHL_Season_Comparison' };
    case 'sales':
      return { sheets: buildSalesData(bundle), filename: 'KUHL_Sales' };
    case 'topstyles':
      return { sheets: buildSalesData(bundle), filename: 'KUHL_Top_Styles' };
    case 'inventory':
      return { sheets: buildInventoryData(bundle), filename: 'KUHL_Inventory' };
    case 'sellthrough':
      return { sheets: buildSellThroughData(bundle), filename: 'KUHL_Sell_Through' };
    case 'costs':
      return { sheets: buildCostsData(bundle), filename: 'KUHL_Costs' };
    case 'tariffs':
      return { sheets: buildTariffsData(bundle), filename: 'KUHL_Tariffs' };
    case 'pricing':
      return { sheets: buildPricingData(bundle), filename: 'KUHL_Pricing' };
    case 'products':
      return { sheets: buildProductsData(bundle), filename: 'KUHL_Style_Master' };
    case 'margins':
      return { sheets: buildMarginsData(bundle), filename: 'KUHL_Margins' };
    case 'customers':
      return { sheets: buildCustomersData(bundle), filename: 'KUHL_Customers' };
    case 'linelist':
      return { sheets: buildLineListData(bundle), filename: 'KUHL_Line_List' };
    case 'validation':
      return { sheets: buildValidationData(bundle), filename: 'KUHL_Validation' };
    case 'stylecolor':
      return { sheets: buildSalesData(bundle), filename: 'KUHL_Style_Color' };
    case 'invopnseason':
      return { sheets: buildSalesData(bundle), filename: 'KUHL_Inv_Opn_Season' };
    case 'geoheatmap':
      return { sheets: buildGeoData(bundle), filename: 'KUHL_Geo_Heatmap' };

    // Consolidated views — fallthrough to parent export
    case 'executive':
      return { sheets: buildDashboardData(bundle), filename: 'KUHL_Executive' };
    case 'datasources':
      return null;

    default:
      return null;
  }
}
