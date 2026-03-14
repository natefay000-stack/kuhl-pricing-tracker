/**
 * Trigger a Vercel deploy to rebuild snapshots from the database.
 * Uses a deploy hook URL stored in VERCEL_DEPLOY_HOOK environment variable.
 *
 * Setup:
 * 1. Go to Vercel Dashboard → Your Project → Settings → Git → Deploy Hooks
 * 2. Create a hook (e.g., name: "Snapshot Rebuild", branch: "main")
 * 3. Copy the URL and add it as VERCEL_DEPLOY_HOOK in your environment variables
 *
 * The hook is fire-and-forget — it does not block the import response.
 * A 30-second debounce prevents multiple deploys during multi-file imports.
 */

let lastDeployTime = 0;
const DEBOUNCE_MS = 30_000; // 30 seconds

export async function triggerSnapshotRebuild(): Promise<{
  triggered: boolean;
  reason?: string;
}> {
  const hookUrl = process.env.VERCEL_DEPLOY_HOOK;

  if (!hookUrl) {
    return { triggered: false, reason: 'VERCEL_DEPLOY_HOOK not configured' };
  }

  const now = Date.now();
  if (now - lastDeployTime < DEBOUNCE_MS) {
    return { triggered: false, reason: 'Debounced — deploy already triggered recently' };
  }

  lastDeployTime = now;

  try {
    // Fire-and-forget: don't await the full response
    fetch(hookUrl, { method: 'POST' }).catch((err) => {
      console.error('[Deploy Hook] Failed to trigger:', err);
    });

    console.log('[Deploy Hook] Triggered Vercel redeploy for snapshot rebuild');
    return { triggered: true };
  } catch (err) {
    return {
      triggered: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
