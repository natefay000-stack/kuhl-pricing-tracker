import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * One-shot migration endpoint to create the PricingEdit table in Neon.
 * Idempotent (IF NOT EXISTS). Will be removed in a follow-up commit.
 */
export async function POST(_request: NextRequest) {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "PricingEdit" (
        "id" TEXT NOT NULL,
        "pricingId" TEXT NOT NULL,
        "styleNumber" TEXT NOT NULL,
        "season" TEXT NOT NULL,
        "field" TEXT NOT NULL,
        "oldValue" DOUBLE PRECISION,
        "newValue" DOUBLE PRECISION,
        "editedBy" TEXT NOT NULL,
        "note" TEXT,
        "editedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PricingEdit_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PricingEdit_pricingId_idx" ON "PricingEdit"("pricingId");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PricingEdit_styleNumber_season_idx" ON "PricingEdit"("styleNumber", "season");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PricingEdit_editedAt_idx" ON "PricingEdit"("editedAt");`);

    const check = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*)::bigint AS count FROM "PricingEdit"`
    );

    return NextResponse.json({
      success: true,
      message: 'PricingEdit table created (or already existed).',
      currentRowCount: Number(check[0]?.count ?? 0),
    });
  } catch (error) {
    console.error('migrate-pricing-edit error:', error);
    return NextResponse.json(
      { error: 'Migration failed', message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
