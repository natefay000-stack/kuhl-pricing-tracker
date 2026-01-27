import { NextRequest, NextResponse } from 'next/server';
import {
  parseLineListXLSX,
  parseLandedSheetXLSX,
  mergeSeasonData,
  convertToAppFormats,
} from '@/lib/xlsx-import';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const lineListFile = formData.get('lineList') as File | null;
    const landedFile = formData.get('landed') as File | null;
    const season = formData.get('season') as string;

    if (!lineListFile) {
      return NextResponse.json(
        { error: 'Line List file is required' },
        { status: 400 }
      );
    }

    if (!season) {
      return NextResponse.json(
        { error: 'Season is required' },
        { status: 400 }
      );
    }

    console.log('Processing import for season:', season);
    console.log('Line List file:', lineListFile.name, lineListFile.size);

    // Parse Line List
    const lineListBuffer = await lineListFile.arrayBuffer();
    const lineListData = parseLineListXLSX(lineListBuffer);
    console.log('Parsed Line List:', lineListData.length, 'items');

    // Parse Landed Sheet if provided
    let landedData: ReturnType<typeof parseLandedSheetXLSX> = [];
    if (landedFile) {
      console.log('Landed file:', landedFile.name, landedFile.size);
      const landedBuffer = await landedFile.arrayBuffer();
      landedData = parseLandedSheetXLSX(landedBuffer);
      console.log('Parsed Landed Sheet:', landedData.length, 'items');
    }

    // Merge data
    const mergedResult = mergeSeasonData(lineListData, landedData, season);
    console.log('Merged result:', {
      products: mergedResult.products.length,
      landedMatches: mergedResult.stats.landedCostMatches,
    });

    // Convert to app formats
    const appData = convertToAppFormats(mergedResult, season);

    return NextResponse.json({
      success: true,
      season,
      stats: {
        lineListCount: mergedResult.stats.lineListCount,
        landedCostMatches: mergedResult.stats.landedCostMatches,
        productsCount: appData.products.length,
        costsCount: appData.costs.length,
      },
      data: {
        products: appData.products,
        costs: appData.costs,
      },
      preview: mergedResult.products.slice(0, 10).map(p => ({
        styleNumber: p.styleNumber,
        styleName: p.styleName,
        colorCode: p.colorCode,
        msrp: p.usMsrp,
        wholesale: p.usWholesale,
        landed: p.landed,
        margin: p.margin,
        costSource: p.costSource,
      })),
    });
  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json(
      {
        error: 'Failed to process import',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
