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

// GET endpoint - check counts or delete with confirm parameter
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const confirm = searchParams.get('confirm');

    // If confirm=yes, perform the delete
    if (confirm === 'yes') {
      console.log('Starting data reset via GET...');

      // Delete in batches to avoid timeout/space issues
      let salesDeleted = 0;
      let batchSize = 10000;

      // Delete sales in batches (largest table)
      while (true) {
        const batch = await prisma.sale.findMany({ take: batchSize, select: { id: true } });
        if (batch.length === 0) break;
        await prisma.sale.deleteMany({
          where: { id: { in: batch.map(s => s.id) } }
        });
        salesDeleted += batch.length;
        console.log(`Deleted ${salesDeleted} sales so far...`);
      }

      const pricingDeleted = await prisma.pricing.deleteMany({});
      const costsDeleted = await prisma.cost.deleteMany({});
      const productsDeleted = await prisma.product.deleteMany({});
      const logsDeleted = await prisma.importLog.deleteMany({});

      return NextResponse.json({
        success: true,
        message: 'All data has been deleted',
        deleted: {
          sales: salesDeleted,
          pricing: pricingDeleted.count,
          costs: costsDeleted.count,
          products: productsDeleted.count,
          importLogs: logsDeleted.count,
        },
      });
    }

    // Otherwise just show counts
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
      hint: 'Add ?confirm=yes to delete all data',
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: 'Failed', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
