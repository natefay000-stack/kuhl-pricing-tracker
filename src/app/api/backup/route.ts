import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes for large exports

/**
 * GET /api/backup
 *
 * Creates a JSON snapshot of all database tables for backup purposes.
 * Query params:
 *   ?tables=products,sales  — export specific tables (default: all)
 *   ?counts=true            — return only record counts (fast check)
 */
export async function GET(request: NextRequest) {
  const tablesParam = request.nextUrl.searchParams.get('tables');
  const countsOnly = request.nextUrl.searchParams.get('counts') === 'true';

  const allTables = ['products', 'sales', 'pricing', 'costs', 'inventory', 'importLogs'];
  const requestedTables = tablesParam
    ? tablesParam.split(',').map(t => t.trim().toLowerCase())
    : allTables;

  try {
    // Fast path: just return record counts
    if (countsOnly) {
      const [products, sales, pricing, costs, inventory, invoicesCount, importLogs] = await Promise.all([
        prisma.product.count(),
        prisma.sale.count(),
        prisma.pricing.count(),
        prisma.cost.count(),
        prisma.inventory.count(),
        prisma.invoice.count(),
        prisma.importLog.count(),
      ]);

      return NextResponse.json({
        counts: { products, sales, pricing, costs, inventory, invoices: invoicesCount, importLogs },
        total: products + sales + pricing + costs + inventory + invoicesCount,
        timestamp: new Date().toISOString(),
      });
    }

    // Full backup: export all requested tables
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const backup: Record<string, any> = {
      metadata: {
        exportedAt: new Date().toISOString(),
        tables: requestedTables,
        version: '1.0',
      },
    };

    if (requestedTables.includes('products')) {
      backup.products = await prisma.product.findMany();
    }
    if (requestedTables.includes('sales')) {
      backup.sales = await prisma.sale.findMany();
    }
    if (requestedTables.includes('pricing')) {
      backup.pricing = await prisma.pricing.findMany();
    }
    if (requestedTables.includes('costs')) {
      backup.costs = await prisma.cost.findMany();
    }
    if (requestedTables.includes('inventory')) {
      backup.inventory = await prisma.inventory.findMany();
    }
    if (requestedTables.includes('invoices')) {
      backup.invoices = await prisma.invoice.findMany();
    }
    if (requestedTables.includes('importlogs')) {
      backup.importLogs = await prisma.importLog.findMany({
        orderBy: { importedAt: 'desc' },
      });
    }

    // Add counts
    backup.metadata.counts = {};
    for (const [key, value] of Object.entries(backup)) {
      if (key !== 'metadata' && Array.isArray(value)) {
        backup.metadata.counts[key] = value.length;
      }
    }

    const json = JSON.stringify(backup);
    const filename = `kuhl-backup-${new Date().toISOString().slice(0, 10)}.json`;

    return new NextResponse(json, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Backup error:', error);
    return NextResponse.json(
      { error: 'Failed to create backup', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
