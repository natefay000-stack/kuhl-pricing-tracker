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

        // Detect cost source type from the data
        const costSourceType = landedData.length > 0 ? landedData[0].costSource : 'landed_cost';
        console.log(`Cost source type: ${costSourceType}`);

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
          costSource: c.costSource,
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

      case 'inventory': {
        // Parse inventory movement data — generic xlsx parsing with column mapping
        const XLSX = require('xlsx');
        const workbook = XLSX.read(buffer, { type: 'array', cellDates: true, cellNF: false, cellText: false });
        const sheetName = workbook.SheetNames[0];
        const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
        console.log('Parsed inventory:', rawRows.length, 'records');

        // Map columns to our field names
        const COLUMN_MAP: Record<string, string> = {
          'Style': 'styleNumber', 'Style Desc': 'styleDesc',
          'Clr': 'color', 'Clr Desc': 'colorDesc', 'Color Type': 'colorType',
          'Style Category': 'styleCategory', 'Style Cat Desc': 'styleCatDesc',
          'Whse': 'warehouse', 'Type': 'movementType', 'Date': 'movementDate',
          'User': 'user', 'Group': 'group', 'Group Desc.': 'groupDesc', 'Group Desc': 'groupDesc',
          'Reference': 'reference', 'Customer/Vendor': 'customerVendor',
          'Rea': 'reasonCode', 'Rea Desc': 'reasonDesc',
          'Cost/Price': 'costPrice', 'Wholesale Price': 'wholesalePrice', 'MSRP': 'msrp',
          'Size Pricing': 'sizePricing', 'Division': 'division', 'Division Desc': 'divisionDesc',
          'Label': 'label', 'Label Desc': 'labelDesc', 'Period': 'period',
          'Qty': 'qty', 'Balance': 'balance', 'Extension': 'extension',
          'ProdMgr': 'prodMgr', 'Old Style #': 'oldStyleNumber',
          'Pantone/CSI Desc': 'pantoneCsiDesc', 'Control #': 'controlNumber',
          'ASN Status #': 'asnStatus', 'Store': 'store', 'Sales Order #': 'salesOrderNumber',
          'Segment Code': 'segmentCode', 'Segment Description': 'segmentDesc',
          'Cost Code': 'costCode', 'Cost Description': 'costDesc',
        };

        const NUMBER_FIELDS = new Set(['costPrice', 'wholesalePrice', 'msrp', 'qty', 'balance', 'extension']);

        const inventoryData = rawRows.map((row: Record<string, unknown>, index: number) => {
          const record: Record<string, unknown> = { id: `inv-${index}` };
          for (const [excelCol, fieldName] of Object.entries(COLUMN_MAP)) {
            const val = row[excelCol];
            if (val === undefined || val === null || val === '') {
              record[fieldName] = NUMBER_FIELDS.has(fieldName) ? 0 : null;
            } else if (NUMBER_FIELDS.has(fieldName)) {
              record[fieldName] = Number(val) || 0;
            } else if (fieldName === 'movementDate') {
              record[fieldName] = val instanceof Date ? val.toISOString() : String(val);
            } else {
              record[fieldName] = String(val).trim();
            }
          }
          if (!record.styleNumber) record.styleNumber = '';
          return record;
        });

        return NextResponse.json({
          success: true,
          fileType: 'inventory',
          summary: `${inventoryData.length.toLocaleString()} inventory movement records`,
          inventory: inventoryData,
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
