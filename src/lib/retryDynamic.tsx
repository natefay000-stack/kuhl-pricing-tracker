/**
 * retryDynamic — drop-in replacement for next/dynamic that auto-retries
 * failed chunk loads with cache-busting.
 *
 * ChunkLoadError happens when the browser tries to fetch a JS chunk whose
 * hash has changed (e.g. after a redeploy or hot-reload).  This wrapper:
 *   1. Catches the import() rejection
 *   2. Retries up to 3 times with exponential backoff
 *   3. On final failure, does a hard page reload (clears stale chunks)
 */

import dynamic from 'next/dynamic';
import React from 'react';

// Simple loading skeleton matching the app's design
function ChunkLoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-[300px] p-8">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-text-muted">Loading view...</span>
      </div>
    </div>
  );
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

function isChunkLoadError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.name === 'ChunkLoadError' ||
      error.message.includes('Loading chunk') ||
      error.message.includes('Failed to fetch dynamically imported module') ||
      error.message.includes('Importing a module script failed')
    );
  }
  return false;
}

/**
 * Wrap an `() => import(...)` factory with retry logic.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function retryImport(
  importFn: () => Promise<any>,
  retries = MAX_RETRIES,
): () => Promise<any> {
  return async () => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await importFn();
      } catch (error) {
        if (!isChunkLoadError(error) || attempt === retries) {
          // On final chunk error, trigger a hard reload to clear stale cache
          if (isChunkLoadError(error) && attempt === retries) {
            console.warn(
              '[retryDynamic] All retries exhausted for chunk load. Reloading page...',
            );
            await new Promise(r => setTimeout(r, 200));
            window.location.reload();
            // Return a never-resolving promise since we're reloading
            return new Promise(() => {});
          }
          throw error;
        }

        console.warn(
          `[retryDynamic] Chunk load failed (attempt ${attempt + 1}/${retries}), retrying...`,
        );

        // Exponential backoff: 1s, 2s, 3s
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
      }
    }

    throw new Error('retryImport: unexpected code path');
  };
}

/**
 * Drop-in replacement for `next/dynamic` with chunk retry + loading skeleton.
 *
 * Usage:
 *   const MyView = retryDynamic(() => import('@/components/views/MyView'));
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function retryDynamic<P = any>(
  importFn: () => Promise<{ default: React.ComponentType<P> }>,
) {
  // Use `any` cast at the dynamic() boundary — Next.js dynamic imports
  // are inherently type-erased at runtime, so this is safe.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return dynamic(retryImport(importFn) as any, {
    ssr: false,
    loading: ChunkLoadingFallback,
  }) as React.ComponentType<P>;
}
