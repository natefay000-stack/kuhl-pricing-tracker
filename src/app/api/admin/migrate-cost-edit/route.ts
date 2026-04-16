import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * One-shot migration endpoint to create the CostEdit table in Neon.
 *
 * Required because local `prisma db push` can't reach Neon from the dev
 * environment (TLS errors), but Vercel serverless functions can.
 *
 * Usage (one-time):
 *   curl -X POST "https://<site>/api/admin/migrate-cost-edit"
 *
 * Safe to remove after the table exists. Uses IF NOT EXISTS so re-running
 * is a no-op. No auth check — this endpoint is intentionally temporary and
 * will be deleted in a follow-up commit. All it does is create a table if
 * it doesn't already exist.
 */
export async function POST(_request: NextRequest) {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "CostEdit" (
        "id" TEXT NOT NULL,
        "costId" TEXT NOT NULL,
        "styleNumber" TEXT NOT NULL,
        "season" TEXT NOT NULL,
        "field" TEXT NOT NULL,
        "oldValue" DOUBLE PRECISION,
        "newValue" DOUBLE PRECISION,
        "editedBy" TEXT NOT NULL,
        "note" TEXT,
        "editedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "CostEdit_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "CostEdit_costId_idx" ON "CostEdit"("costId");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "CostEdit_styleNumber_season_idx" ON "CostEdit"("styleNumber", "season");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "CostEdit_editedAt_idx" ON "CostEdit"("editedAt");`);

    const check = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*)::bigint AS count FROM "CostEdit"`
    );

    return NextResponse.json({
      success: true,
      message: 'CostEdit table created (or already existed).',
      currentRowCount: Number(check[0]?.count ?? 0),
    });
  } catch (error) {
    console.error('migrate-cost-edit error:', error);
    return NextResponse.json(
      { error: 'Migration failed', message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
