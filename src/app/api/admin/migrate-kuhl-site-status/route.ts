import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * One-shot idempotent migration endpoint to create the KuhlSiteStatus table.
 * Safe to re-run; uses IF NOT EXISTS. Remove after first successful call.
 */
export async function POST(_request: NextRequest) {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "KuhlSiteStatus" (
        "id" TEXT NOT NULL,
        "styleNumber" TEXT NOT NULL,
        "isLive" BOOLEAN,
        "siteUrl" TEXT,
        "currentPrice" DOUBLE PRECISION,
        "currentMsrp" DOUBLE PRECISION,
        "source" TEXT,
        "errorMessage" TEXT,
        "lastCheckedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "KuhlSiteStatus_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "KuhlSiteStatus_styleNumber_key" ON "KuhlSiteStatus"("styleNumber");`
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "KuhlSiteStatus_isLive_idx" ON "KuhlSiteStatus"("isLive");`
    );

    const count = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*)::bigint AS count FROM "KuhlSiteStatus"`
    );

    return NextResponse.json({
      success: true,
      message: 'KuhlSiteStatus table created (or already existed).',
      currentRowCount: Number(count[0]?.count ?? 0),
    });
  } catch (error) {
    console.error('migrate-kuhl-site-status error:', error);
    return NextResponse.json(
      { error: 'Migration failed', message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
