import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const status: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    databaseUrl: process.env.DATABASE_URL ? 'SET (hidden)' : 'NOT SET',
  };

  // Test database connection
  try {
    // Simple query to test connection
    await prisma.$queryRaw`SELECT 1`;
    status.databaseConnection = 'OK';

    // Get record counts
    const [productCount, saleCount, pricingCount, costCount, importLogCount] = await Promise.all([
      prisma.product.count(),
      prisma.sale.count(),
      prisma.pricing.count(),
      prisma.cost.count(),
      prisma.importLog.count(),
    ]);

    status.counts = {
      products: productCount,
      sales: saleCount,
      pricing: pricingCount,
      costs: costCount,
      importLogs: importLogCount,
    };

    // Get recent import logs
    const recentImports = await prisma.importLog.findMany({
      orderBy: { importedAt: 'desc' },
      take: 5,
      select: {
        fileName: true,
        fileType: true,
        season: true,
        recordCount: true,
        importedAt: true,
      },
    });
    status.recentImports = recentImports;

    // Get unique seasons in data
    const productSeasons = await prisma.product.groupBy({
      by: ['season'],
      _count: true,
    });
    const saleSeasons = await prisma.sale.groupBy({
      by: ['season'],
      _count: true,
    });

    status.seasonBreakdown = {
      products: productSeasons.map(s => ({ season: s.season, count: s._count })),
      sales: saleSeasons.map(s => ({ season: s.season, count: s._count })),
    };

    status.status = 'healthy';
  } catch (error) {
    status.databaseConnection = 'FAILED';
    status.error = error instanceof Error ? error.message : String(error);
    status.status = 'unhealthy';

    return NextResponse.json(status, { status: 500 });
  }

  return NextResponse.json(status);
}
