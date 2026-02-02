import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { seasonsToDelete } = body;

    if (!seasonsToDelete || !Array.isArray(seasonsToDelete)) {
      return NextResponse.json({ error: 'seasonsToDelete array required' }, { status: 400 });
    }

    console.log('Deleting seasons:', seasonsToDelete);

    // Get counts before
    const salesBefore = await prisma.sale.groupBy({
      by: ['season'],
      _count: { id: true },
      orderBy: { season: 'asc' }
    });

    // Delete from all tables
    const salesDeleted = await prisma.sale.deleteMany({
      where: { season: { in: seasonsToDelete } }
    });

    const productsDeleted = await prisma.product.deleteMany({
      where: { season: { in: seasonsToDelete } }
    });

    const pricingDeleted = await prisma.pricing.deleteMany({
      where: { season: { in: seasonsToDelete } }
    });

    const costsDeleted = await prisma.cost.deleteMany({
      where: { season: { in: seasonsToDelete } }
    });

    // Get counts after
    const salesAfter = await prisma.sale.groupBy({
      by: ['season'],
      _count: { id: true },
      orderBy: { season: 'asc' }
    });

    return NextResponse.json({
      success: true,
      deleted: {
        sales: salesDeleted.count,
        products: productsDeleted.count,
        pricing: pricingDeleted.count,
        costs: costsDeleted.count,
      },
      seasonsBefore: salesBefore.map(s => ({ season: s.season, count: s._count.id })),
      seasonsAfter: salesAfter.map(s => ({ season: s.season, count: s._count.id })),
    });
  } catch (error) {
    console.error('Cleanup error:', error);
    return NextResponse.json({
      error: 'Cleanup failed',
      details: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}

// GET - show current season counts
export async function GET() {
  try {
    const sales = await prisma.sale.groupBy({
      by: ['season'],
      _count: { id: true },
      orderBy: { season: 'asc' }
    });

    const products = await prisma.product.groupBy({
      by: ['season'],
      _count: { id: true },
      orderBy: { season: 'asc' }
    });

    return NextResponse.json({
      sales: sales.map(s => ({ season: s.season, count: s._count.id })),
      products: products.map(s => ({ season: s.season, count: s._count.id })),
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
