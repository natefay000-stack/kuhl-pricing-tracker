import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

interface ImportData {
  type: 'products' | 'sales' | 'pricing' | 'costs';
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

    // Delete existing data for this season if replaceExisting
    if (replaceExisting && season) {
      switch (type) {
        case 'products':
          await prisma.product.deleteMany({ where: { season } });
          break;
        case 'sales':
          await prisma.sale.deleteMany({ where: { season } });
          break;
        case 'pricing':
          await prisma.pricing.deleteMany({ where: { season } });
          break;
        case 'costs':
          await prisma.cost.deleteMany({ where: { season } });
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
            categoryDesc: String(item.categoryDesc || item.category || ''),
            category: String(item.category || ''),
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
            categoryDesc: String(item.categoryDesc || ''),
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
          }));
          await prisma.cost.createMany({ data: batch, skipDuplicates: true });
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
