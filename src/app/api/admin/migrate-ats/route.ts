import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * One-shot idempotent migration endpoint to create AtsInventory +
 * AtsDecision tables in Neon. Will be removed in a follow-up commit.
 */
export async function POST(_request: NextRequest) {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "AtsInventory" (
        "id" TEXT NOT NULL,
        "styleNumber" TEXT NOT NULL,
        "color" TEXT NOT NULL,
        "styleDesc" TEXT,
        "colorDesc" TEXT,
        "gender" TEXT,
        "category" TEXT,
        "styleSegment" TEXT,
        "blockCode" TEXT,
        "classification" TEXT,
        "wholesale" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "msrp" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "styleVendor" TEXT,
        "warehouse" TEXT,
        "unitsATS" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "unitsOnHand" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "unitsAtOnce" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "snapshotDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "AtsInventory_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "AtsInventory_styleNumber_color_key" ON "AtsInventory"("styleNumber", "color");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AtsInventory_classification_idx" ON "AtsInventory"("classification");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AtsInventory_styleNumber_idx" ON "AtsInventory"("styleNumber");`);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "AtsDecision" (
        "id" TEXT NOT NULL,
        "styleNumber" TEXT NOT NULL,
        "color" TEXT NOT NULL,
        "action" TEXT NOT NULL,
        "decidedBy" TEXT NOT NULL,
        "note" TEXT,
        "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "AtsDecision_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AtsDecision_styleNumber_color_idx" ON "AtsDecision"("styleNumber", "color");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AtsDecision_decidedAt_idx" ON "AtsDecision"("decidedAt");`);

    const [ats, dec] = await Promise.all([
      prisma.$queryRawUnsafe<{ count: bigint }[]>(`SELECT COUNT(*)::bigint AS count FROM "AtsInventory"`),
      prisma.$queryRawUnsafe<{ count: bigint }[]>(`SELECT COUNT(*)::bigint AS count FROM "AtsDecision"`),
    ]);

    return NextResponse.json({
      success: true,
      message: 'AtsInventory + AtsDecision tables created (or already existed).',
      atsRowCount: Number(ats[0]?.count ?? 0),
      decisionRowCount: Number(dec[0]?.count ?? 0),
    });
  } catch (error) {
    console.error('migrate-ats error:', error);
    return NextResponse.json(
      { error: 'Migration failed', message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
