import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/import-check?type=sales&season=27FA
 *
 * Returns the current record count for a given data type and season,
 * so the UI can warn before overwriting existing data.
 */
export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get('type');
  const season = request.nextUrl.searchParams.get('season');

  if (!type) {
    return NextResponse.json({ error: 'type parameter required' }, { status: 400 });
  }

  try {
    let existingCount = 0;
    const where = season ? { season } : {};

    switch (type) {
      case 'lineList':
      case 'products':
        existingCount = await prisma.product.count({ where });
        break;
      case 'sales':
        existingCount = await prisma.sale.count({ where });
        break;
      case 'invoice':
        existingCount = await prisma.invoice.count({ where });
        break;
      case 'pricing':
        existingCount = await prisma.pricing.count({ where });
        break;
      case 'costs':
      case 'landed':
        existingCount = await prisma.cost.count({ where });
        break;
      case 'inventory':
        existingCount = await prisma.inventory.count();
        break;
    }

    // Get last import info for this type
    const lastImport = await prisma.importLog.findFirst({
      where: { fileType: type },
      orderBy: { importedAt: 'desc' },
    });

    return NextResponse.json({
      type,
      season: season || 'all',
      existingCount,
      hasExistingData: existingCount > 0,
      lastImport: lastImport
        ? {
            fileName: lastImport.fileName,
            recordCount: lastImport.recordCount,
            importedAt: lastImport.importedAt,
          }
        : null,
      warning: existingCount > 0
        ? `This will replace ${existingCount.toLocaleString()} existing ${type} records${season ? ` for season ${season}` : ''}.`
        : null,
    });
  } catch (error) {
    console.error('Import check error:', error);
    return NextResponse.json(
      { error: 'Failed to check existing data' },
      { status: 500 }
    );
  }
}
