import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// DELETE endpoint to clear all imported data
export async function DELETE(request: NextRequest) {
  try {
    // Check for confirmation parameter
    const { searchParams } = new URL(request.url);
    const confirm = searchParams.get('confirm');

    if (confirm !== 'yes') {
      return NextResponse.json(
        { error: 'Add ?confirm=yes to confirm data deletion' },
        { status: 400 }
      );
    }

    console.log('Starting data reset...');

    // Delete in order to respect foreign key constraints (if any)
    const salesDeleted = await prisma.sale.deleteMany({});
    console.log(`Deleted ${salesDeleted.count} sales`);

    const pricingDeleted = await prisma.pricing.deleteMany({});
    console.log(`Deleted ${pricingDeleted.count} pricing records`);

    const costsDeleted = await prisma.cost.deleteMany({});
    console.log(`Deleted ${costsDeleted.count} cost records`);

    const productsDeleted = await prisma.product.deleteMany({});
    console.log(`Deleted ${productsDeleted.count} products`);

    const logsDeleted = await prisma.importLog.deleteMany({});
    console.log(`Deleted ${logsDeleted.count} import logs`);

    return NextResponse.json({
      success: true,
      message: 'All data has been deleted',
      deleted: {
        sales: salesDeleted.count,
        pricing: pricingDeleted.count,
        costs: costsDeleted.count,
        products: productsDeleted.count,
        importLogs: logsDeleted.count,
      },
    });
  } catch (error) {
    console.error('Error resetting data:', error);
    return NextResponse.json(
      {
        error: 'Failed to reset data',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

// GET endpoint to check current data counts
export async function GET() {
  try {
    const [sales, pricing, costs, products, importLogs] = await Promise.all([
      prisma.sale.count(),
      prisma.pricing.count(),
      prisma.cost.count(),
      prisma.product.count(),
      prisma.importLog.count(),
    ]);

    return NextResponse.json({
      counts: {
        sales,
        pricing,
        costs,
        products,
        importLogs,
      },
      total: sales + pricing + costs + products + importLogs,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to get counts' },
      { status: 500 }
    );
  }
}
