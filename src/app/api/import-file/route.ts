import { NextRequest, NextResponse } from 'next/server';
import {
  parseLineListXLSX,
  parsePricingXLSX,
  parseLandedSheetXLSX,
  parseSalesXLSX,
  mergeSeasonData,
  convertToAppFormats,
} from '@/lib/xlsx-import';
import { normalizeCategory } from '@/types/product';

export const maxDuration = 300; // 5 minutes
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const fileType = formData.get('fileType') as string;
    const season = formData.get('season') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!fileType) {
      return NextResponse.json({ error: 'File type not specified' }, { status: 400 });
    }

    console.log(`Processing ${fileType} file:`, file.name, file.size);
    const buffer = await file.arrayBuffer();

    switch (fileType) {
      case 'sales': {
        const salesData = parseSalesXLSX(buffer);
        console.log('Parsed sales:', salesData.length, 'records');

        // Group by season for summary
        const seasonCounts: Record<string, number> = {};
        for (const sale of salesData) {
          const s = sale.season || 'Unknown';
          seasonCounts[s] = (seasonCounts[s] || 0) + 1;
        }

        const salesAppData = salesData.map((s, index) => ({
          id: `sale-${index}`,
          styleNumber: s.styleNumber,
          styleDesc: s.styleDesc,
          colorCode: s.colorCode,
          colorDesc: s.colorDesc,
          season: s.season,
          seasonType: 'Main',
          customer: s.customer,
          customerType: s.customerType,
          unitsBooked: s.unitsBooked,
          unitsOpen: s.unitsOpen || 0,
          revenue: s.revenue,
          shipped: s.shipped || 0,
          cost: s.cost || 0,
          wholesalePrice: s.wholesalePrice || 0,
          msrp: s.msrp || 0,
          netUnitPrice: s.netUnitPrice || (s.unitsBooked > 0 ? s.revenue / s.unitsBooked : 0),
          divisionDesc: s.divisionDesc,
          categoryDesc: normalizeCategory(s.categoryDesc),
          gender: s.gender || '',
          salesRep: s.salesRep || '',
          orderType: s.orderType || '',
        }));

        const seasonSummary = Object.entries(seasonCounts)
          .sort(([a], [b]) => b.localeCompare(a))
          .map(([s, count]) => `${s}: ${count.toLocaleString()}`)
          .join(', ');

        return NextResponse.json({
          success: true,
          fileType: 'sales',
          summary: `${salesAppData.length.toLocaleString()} sales records across ${Object.keys(seasonCounts).length} seasons (${seasonSummary})`,
          seasonBreakdown: seasonCounts,
          sales: salesAppData,
        });
      }

      case 'costs':
      case 'landed': {
        const landedData = parseLandedSheetXLSX(buffer);
        console.log('Parsed landed costs:', landedData.length, 'records');

        // Group by season for summary
        const seasonCounts: Record<string, number> = {};
        for (const cost of landedData) {
          const s = cost.season || 'Unknown';
          seasonCounts[s] = (seasonCounts[s] || 0) + 1;
        }

        const costsAppData = landedData.map((c, index) => ({
          id: `cost-${index}`,
          styleNumber: c.styleNumber,
          styleName: c.styleName,
          season: c.season,
          seasonType: 'Main',
          factory: c.factory,
          countryOfOrigin: c.countryOfOrigin,
          fob: c.fob,
          landed: c.landed,
          dutyCost: c.dutyCost,
          tariffCost: c.tariffCost,
          freightCost: c.freightCost,
          overheadCost: c.overheadCost,
          suggestedMsrp: c.suggestedMsrp,
          suggestedWholesale: c.suggestedWholesale,
          margin: c.margin,
          designTeam: c.designTeam,
          developer: c.developer,
        }));

        const seasonSummary = Object.entries(seasonCounts)
          .sort(([a], [b]) => b.localeCompare(a))
          .map(([s, count]) => `${s}: ${count.toLocaleString()}`)
          .join(', ');

        return NextResponse.json({
          success: true,
          fileType: 'landed',
          summary: `${costsAppData.length.toLocaleString()} cost records across ${Object.keys(seasonCounts).length} seasons (${seasonSummary})`,
          seasonBreakdown: seasonCounts,
          costs: costsAppData,
        });
      }

      case 'pricing': {
        const pricingData = parsePricingXLSX(buffer);
        console.log('Parsed pricing:', pricingData.length, 'records');

        // Group by season for summary
        const seasonCounts: Record<string, number> = {};
        for (const p of pricingData) {
          const s = p.season || 'Unknown';
          seasonCounts[s] = (seasonCounts[s] || 0) + 1;
        }

        const pricingAppData = pricingData.map((p, index) => ({
          id: `price-${index}`,
          styleNumber: p.styleNumber,
          styleDesc: p.styleDesc,
          colorCode: p.colorCode,
          colorDesc: p.colorDesc,
          season: p.season,
          seasonType: 'Main',
          seasonDesc: p.seasonDesc || '',
          price: p.price,
          msrp: p.msrp,
          cost: p.cost,
        }));

        const seasonSummary = Object.entries(seasonCounts)
          .sort(([a], [b]) => b.localeCompare(a))
          .map(([s, count]) => `${s}: ${count.toLocaleString()}`)
          .join(', ');

        return NextResponse.json({
          success: true,
          fileType: 'pricing',
          summary: `${pricingAppData.length.toLocaleString()} pricing records across ${Object.keys(seasonCounts).length} seasons (${seasonSummary})`,
          seasonBreakdown: seasonCounts,
          pricing: pricingAppData,
        });
      }

      case 'lineList': {
        const lineListData = parseLineListXLSX(buffer);
        console.log('Parsed line list:', lineListData.length, 'records');

        // Count records by season (from the file's Season column)
        const seasonCounts: Record<string, number> = {};
        for (const item of lineListData) {
          const s = item.season || 'Unknown';
          seasonCounts[s] = (seasonCounts[s] || 0) + 1;
        }
        console.log('Seasons in file:', seasonCounts);

        // If user provided a season override, use it; otherwise use seasons from file
        // Merge with empty landed data (no cost overrides at this point)
        const mergedResult = mergeSeasonData(lineListData, [], season || '');
        const appData = convertToAppFormats(mergedResult, season || undefined); // season can be undefined

        const seasonSummary = Object.entries(seasonCounts)
          .sort(([a], [b]) => b.localeCompare(a))
          .map(([s, count]) => `${s}: ${count.toLocaleString()}`)
          .join(', ');

        return NextResponse.json({
          success: true,
          fileType: 'lineList',
          seasonBreakdown: seasonCounts,
          summary: `${appData.products.length.toLocaleString()} products across ${Object.keys(seasonCounts).length} seasons (${seasonSummary})`,
          products: appData.products,
          costs: appData.costs,
        });
      }

      default:
        return NextResponse.json({ error: `Unknown file type: ${fileType}` }, { status: 400 });
    }
  } catch (error) {
    console.error('Import file error:', error);
    return NextResponse.json(
      {
        error: 'Failed to process file',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
