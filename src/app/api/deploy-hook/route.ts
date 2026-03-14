import { NextResponse } from 'next/server';
import { triggerSnapshotRebuild } from '@/lib/deploy-hook';

export const dynamic = 'force-dynamic';

/**
 * POST /api/deploy-hook
 * Triggers a Vercel redeploy to rebuild static JSON snapshots from the database.
 * Called after successful data imports. Fire-and-forget from the client side.
 */
export async function POST() {
  const result = await triggerSnapshotRebuild();
  return NextResponse.json(result);
}
