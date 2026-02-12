import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { normalizeCategory } from '@/types/product';

// Increase limits for large data imports
export const maxDuration = 300; // 5 minutes
export const dynamic = 'force-dynamic';

interface ImportData {
  type: 'products' | 'sales' | 'pricing' | 'costs' | 'inventory';
  season?: string;
  data: Record<string, unknown>[];
  fileName?: string;
  replaceExisting?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const body: ImportData = await request.json();
    const { type, season, data, fileName, replaceExisting = true } = body;

    if (!type || !data || !Array.isArray(data)) {
      return NextResponse.json(
        { error: 'Invalid request: type and data array required' },
        { status: 400 }
      );
    }

    let count = 0;

    // Delete existing data if replaceExisting
    // For sales: if no season specified, delete ALL sales (full refresh)
    // For other types: only delete if season is specified
    if (replaceExisting) {
      switch (type) {
        case 'products':
          if (season) await prisma.product.deleteMany({ where: { season } });
          break;
        case 'sales':
          if (season) {
            await prisma.sale.deleteMany({ where: { season } });
          } else {
            // Full sales refresh - delete all sales
            console.log('Full sales refresh: deleting all existing sales...');
            await prisma.sale.deleteMany({});
          }
          break;
        case 'pricing':
          if (season) await prisma.pricing.deleteMany({ where: { season } });
          break;
        case 'costs':
          if (season) await prisma.cost.deleteMany({ where: { season } });
          break;
        case 'inventory':
          // For inventory movement data, delete all existing records on replace
          await prisma.inventory.deleteMany({});
          break;
      }
    }

    // Insert new data in batches
    const batchSize = 1000;

    switch (type) {
      case 'products':
        for (let i = 0; i < data.length; i += batchSize) {
          const batch = data.slice(i, i + batchSize).map((item) => ({
            styleNumber: String(item.styleNumber || ''),
            styleDesc: String(item.styleDesc || item.styleName || ''),
            color: String(item.color || item.colorCode || ''),
            colorDesc: String(item.colorDesc || item.colorDescription || ''),
            styleColor: String(item.styleColor || ''),
            season: String(item.season || season || ''),
            seasonType: String(item.seasonType || 'Main'),
            divisionDesc: String(item.divisionDesc || item.division || ''),
            categoryDesc: normalizeCategory(String(item.categoryDesc || item.category || '')),
            category: normalizeCategory(String(item.category || '')),
            productLine: String(item.productLine || ''),
            productLineDesc: String(item.productLineDesc || ''),
            labelDesc: String(item.labelDesc || item.label || ''),
            designerName: String(item.designerName || item.designer || ''),
            techDesignerName: String(item.techDesignerName || item.developer || ''),
            countryOfOrigin: String(item.countryOfOrigin || ''),
            factoryName: String(item.factoryName || item.factory || ''),
            msrp: Number(item.msrp || item.usMsrp || 0),
            price: Number(item.price || item.usWholesale || 0),
            cost: Number(item.cost || item.landed || 0),
            cadMsrp: item.cadMsrp ? Number(item.cadMsrp) : null,
            cadPrice: item.cadPrice ? Number(item.cadPrice) : null,
            carryOver: Boolean(item.carryOver),
            carryForward: Boolean(item.carryForward),
            sellingSeasons: String(item.sellingSeasons || ''),
            htsCode: String(item.htsCode || ''),
            styleColorNotes: String(item.styleColorNotes || ''),
          }));
          await prisma.product.createMany({ data: batch, skipDuplicates: true });
          count += batch.length;
        }
        break;

      case 'sales':
        for (let i = 0; i < data.length; i += batchSize) {
          const batch = data.slice(i, i + batchSize).map((item) => ({
            styleNumber: String(item.styleNumber || ''),
            styleDesc: String(item.styleDesc || ''),
            colorCode: String(item.colorCode || item.color || ''),
            colorDesc: String(item.colorDesc || ''),
            season: String(item.season || season || ''),
            seasonType: String(item.seasonType || 'Main'),
            customer: String(item.customer || ''),
            customerType: String(item.customerType || ''),
            salesRep: String(item.salesRep || ''),
            divisionDesc: String(item.divisionDesc || ''),
            categoryDesc: normalizeCategory(String(item.categoryDesc || '')),
            gender: String(item.gender || ''),
            unitsBooked: Number(item.unitsBooked || 0),
            unitsOpen: Number(item.unitsOpen || 0),
            revenue: Number(item.revenue || 0),
            shipped: Number(item.shipped || 0),
            cost: Number(item.cost || 0),
            wholesalePrice: Number(item.wholesalePrice || 0),
            msrp: Number(item.msrp || 0),
            netUnitPrice: Number(item.netUnitPrice || 0),
            orderType: String(item.orderType || ''),
          }));
          await prisma.sale.createMany({ data: batch });
          count += batch.length;
        }
        break;

      case 'pricing':
        for (let i = 0; i < data.length; i += batchSize) {
          const batch = data.slice(i, i + batchSize).map((item) => ({
            styleNumber: String(item.styleNumber || ''),
            styleDesc: String(item.styleDesc || ''),
            colorCode: String(item.colorCode || item.color || ''),
            colorDesc: String(item.colorDesc || ''),
            season: String(item.season || season || ''),
            seasonType: String(item.seasonType || 'Main'),
            seasonDesc: String(item.seasonDesc || ''),
            price: Number(item.price || 0),
            msrp: Number(item.msrp || 0),
            cost: Number(item.cost || 0),
          }));
          await prisma.pricing.createMany({ data: batch, skipDuplicates: true });
          count += batch.length;
        }
        break;

      case 'costs':
        for (let i = 0; i < data.length; i += batchSize) {
          const batch = data.slice(i, i + batchSize).map((item) => ({
            styleNumber: String(item.styleNumber || ''),
            styleName: String(item.styleName || item.styleDesc || ''),
            season: String(item.season || season || ''),
            seasonType: String(item.seasonType || 'Main'),
            factory: String(item.factory || ''),
            countryOfOrigin: String(item.countryOfOrigin || ''),
            designTeam: String(item.designTeam || ''),
            developer: String(item.developer || ''),
            fob: Number(item.fob || 0),
            landed: Number(item.landed || 0),
            dutyCost: Number(item.dutyCost || 0),
            tariffCost: Number(item.tariffCost || 0),
            freightCost: Number(item.freightCost || 0),
            overheadCost: Number(item.overheadCost || 0),
            suggestedMsrp: item.suggestedMsrp ? Number(item.suggestedMsrp) : null,
            suggestedWholesale: item.suggestedWholesale ? Number(item.suggestedWholesale) : null,
            margin: item.margin ? Number(item.margin) : null,
            costSource: item.costSource ? String(item.costSource) : null,
          }));
          await prisma.cost.createMany({ data: batch, skipDuplicates: true });
          count += batch.length;
        }
        break;

      case 'inventory':
        for (let i = 0; i < data.length; i += batchSize) {
          const batch = data.slice(i, i + batchSize).map((item) => ({
            styleNumber: String(item['Style'] || item.styleNumber || ''),
            styleDesc: String(item['Style Desc'] || item.styleDesc || ''),
            color: String(item['Clr'] || item.color || ''),
            colorDesc: String(item['Clr Desc'] || item.colorDesc || ''),
            colorType: item['Color Type'] ? String(item['Color Type']) : null,
            styleCategory: item['Style Category'] ? String(item['Style Category']) : null,
            styleCatDesc: item['Style Cat Desc'] ? String(item['Style Cat Desc']) : null,
            warehouse: item['Whse'] || item.warehouse ? String(item['Whse'] || item.warehouse) : null,
            movementType: item['Type'] || item.movementType ? String(item['Type'] || item.movementType) : null,
            movementDate: item['Date'] || item.movementDate ? new Date(String(item['Date'] || item.movementDate)) : null,
            user: item['User'] ? String(item['User']) : null,
            group: item['Group'] ? String(item['Group']) : null,
            groupDesc: item['Group Desc.'] || item['Group Desc'] ? String(item['Group Desc.'] || item['Group Desc']) : null,
            reference: item['Reference'] ? String(item['Reference']) : null,
            customerVendor: item['Customer/Vendor'] ? String(item['Customer/Vendor']) : null,
            reasonCode: item['Rea'] ? String(item['Rea']) : null,
            reasonDesc: item['Rea Desc'] ? String(item['Rea Desc']) : null,
            costPrice: Number(item['Cost/Price'] || item.costPrice || 0),
            wholesalePrice: Number(item['Wholesale Price'] || item.wholesalePrice || 0),
            msrp: Number(item['MSRP'] || item.msrp || 0),
            sizePricing: item['Size Pricing'] ? String(item['Size Pricing']) : null,
            division: item['Division'] ? String(item['Division']) : null,
            divisionDesc: item['Division Desc'] ? String(item['Division Desc']) : null,
            label: item['Label'] ? String(item['Label']) : null,
            labelDesc: item['Label Desc'] ? String(item['Label Desc']) : null,
            period: item['Period'] ? String(item['Period']) : null,
            qty: Number(item['Qty'] || item.qty || 0),
            balance: Number(item['Balance'] || item.balance || 0),
            extension: Number(item['Extension'] || item.extension || 0),
            prodMgr: item['ProdMgr'] ? String(item['ProdMgr']) : null,
            oldStyleNumber: item['Old Style #'] ? String(item['Old Style #']) : null,
            pantoneCsiDesc: item['Pantone/CSI Desc'] ? String(item['Pantone/CSI Desc']) : null,
            controlNumber: item['Control #'] ? String(item['Control #']) : null,
            asnStatus: item['ASN Status #'] ? String(item['ASN Status #']) : null,
            store: item['Store'] ? String(item['Store']) : null,
            salesOrderNumber: item['Sales Order #'] ? String(item['Sales Order #']) : null,
            segmentCode: item['Segment Code'] ? String(item['Segment Code']) : null,
            segmentDesc: item['Segment Description'] ? String(item['Segment Description']) : null,
            costCode: item['Cost Code'] ? String(item['Cost Code']) : null,
            costDesc: item['Cost Description'] ? String(item['Cost Description']) : null,
          }));
          await prisma.inventory.createMany({ data: batch, skipDuplicates: true });
          count += batch.length;
        }
        break;
    }

    // Log the import
    await prisma.importLog.create({
      data: {
        fileName: fileName || `${type}_import`,
        fileType: type,
        season: season || null,
        recordCount: count,
      },
    });

    return NextResponse.json({
      success: true,
      type,
      season,
      count,
      message: `Imported ${count} ${type} records`,
    });
  } catch (error) {
    console.error('Error importing data:', error);
    return NextResponse.json(
      {
        error: 'Failed to import data',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
