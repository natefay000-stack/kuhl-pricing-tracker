import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Simple test endpoint to verify data access works
export async function GET() {
  const startTime = Date.now();

  try {
    // Get just counts and a few sample records (fast query)
    const [productCount, saleCount, sampleProducts] = await Promise.all([
      prisma.product.count(),
      prisma.sale.count(),
      prisma.product.findMany({
        take: 3,
        select: {
          styleNumber: true,
          styleDesc: true,
          season: true,
        },
      }),
    ]);

    const duration = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      message: 'Data access working correctly',
      duration: `${duration}ms`,
      counts: {
        products: productCount,
        sales: saleCount,
      },
      sampleProducts,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      duration: `${Date.now() - startTime}ms`,
    }, { status: 500 });
  }
}
