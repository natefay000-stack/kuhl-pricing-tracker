import { NextRequest, NextResponse } from 'next/server';
import { parseSalesXLSX } from '@/lib/xlsx-import';

// Increase limits for large file uploads
export const maxDuration = 300; // 5 minutes
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const salesFile = formData.get('sales') as File | null;

    if (!salesFile) {
      return NextResponse.json(
        { error: 'Sales file is required' },
        { status: 400 }
      );
    }

    console.log('Processing sales-only import');
    console.log('Sales file:', salesFile.name, salesFile.size);

    // Parse Sales Data
    const salesBuffer = await salesFile.arrayBuffer();
    const salesData = parseSalesXLSX(salesBuffer);
    console.log('Parsed Sales Data:', salesData.length, 'items');

    // Group by season to show stats
    const seasonCounts: Record<string, number> = {};
    for (const sale of salesData) {
      const season = sale.season || 'Unknown';
      seasonCounts[season] = (seasonCounts[season] || 0) + 1;
    }

    // Convert sales data to app format
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
      unitsOpen: 0,
      revenue: s.revenue,
      shipped: 0,
      cost: 0,
      wholesalePrice: 0,
      msrp: 0,
      netUnitPrice: s.unitsBooked > 0 ? s.revenue / s.unitsBooked : 0,
      divisionDesc: s.divisionDesc,
      categoryDesc: s.categoryDesc,
      gender: '',
      salesRep: '',
      orderType: '',
    }));

    return NextResponse.json({
      success: true,
      stats: {
        totalSales: salesAppData.length,
        seasonBreakdown: seasonCounts,
      },
      data: {
        sales: salesAppData,
      },
    });
  } catch (error) {
    console.error('Sales import error:', error);
    return NextResponse.json(
      {
        error: 'Failed to process sales import',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
