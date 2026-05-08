'use client';

import type { InvoiceRecord } from '@/types/product';

/**
 * IndexedDB-backed cache for the invoice array.
 *
 * Why IndexedDB: invoices are 500K+ rows / ~80 MB JSON, which exceeds the
 * ~5 MB localStorage quota. IndexedDB has no practical size limit on
 * modern browsers (up to ~50% of free disk on Chrome/Safari).
 *
 * Usage:
 *   const cached = await loadInvoicesFromCache();
 *   if (cached && cached.length > 0) setInvoices(cached);
 *   ...later, after fetching from API:
 *   await saveInvoicesToCache(allInvoices);
 *   ...after an import that mutates data:
 *   await clearInvoiceCache();
 */

const DB_NAME = 'kuhl-data';
const DB_VERSION = 1;
const STORE = 'invoices';
const META_STORE = 'meta';
const META_KEY = 'invoices';

// Cache valid for 24 hours. The browser still re-fetches sooner than this
// after any import (cache is rewritten with the merged set). For idle
// reloads — refresh, navigate away/back — we want to skip the 5-minute
// API roundtrip entirely. New imports invalidate the cache.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

interface InvoiceCacheMeta {
  count: number;
  savedAt: number;
  // Server version captured when the cache was written. Compared against
  // /api/data/invoices/version on next load to skip pagination entirely
  // when the DB hasn't changed. Older caches (pre-versioning) won't have
  // this field; treat them as stale-by-default to force one re-fetch.
  version?: string | null;
  // True when the cache was written mid-fetch as a checkpoint, false when
  // the full pagination completed. Partial caches still load (so the user
  // sees something) but get topped up to full on next visit.
  partial?: boolean;
}

/** Return cached invoices if still fresh; null otherwise. */
export async function loadInvoicesFromCache(): Promise<{
  invoices: InvoiceRecord[];
  ageMs: number;
  stale: boolean;
  version: string | null;
  partial: boolean;
} | null> {
  try {
    const db = await openDb();
    const meta = await new Promise<InvoiceCacheMeta | null>((resolve, reject) => {
      const tx = db.transaction(META_STORE, 'readonly');
      const req = tx.objectStore(META_STORE).get(META_KEY);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
    if (!meta || meta.count === 0) {
      db.close();
      return null;
    }
    const ageMs = Date.now() - meta.savedAt;
    const invoices = await new Promise<InvoiceRecord[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result as InvoiceRecord[]);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return {
      invoices,
      ageMs,
      stale: ageMs > CACHE_TTL_MS,
      version: meta.version ?? null,
      partial: meta.partial ?? false,
    };
  } catch (err) {
    console.warn('Invoice cache read failed:', err);
    return null;
  }
}

/** Replace the cached invoice set. Pass `version` from the server-side
 *  /api/data/invoices/version probe so we can short-circuit on next load.
 *  Pass `partial: true` for in-progress checkpoints during pagination.
 */
export async function saveInvoicesToCache(
  invoices: InvoiceRecord[],
  opts?: { version?: string | null; partial?: boolean },
): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE, META_STORE], 'readwrite');
      const store = tx.objectStore(STORE);
      const meta = tx.objectStore(META_STORE);
      store.clear();
      // putAll is not standard — write in chunks via put().
      // IndexedDB transactions auto-commit when the queue drains, so we
      // pipeline puts within a single tx for speed.
      for (const inv of invoices) store.put(inv);
      meta.put(
        {
          count: invoices.length,
          savedAt: Date.now(),
          version: opts?.version ?? null,
          partial: opts?.partial ?? false,
        } as InvoiceCacheMeta,
        META_KEY,
      );
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    console.warn('Invoice cache write failed:', err);
  }
}

/** Force the next page load to re-fetch from the API. Call after imports. */
export async function clearInvoiceCache(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE, META_STORE], 'readwrite');
      tx.objectStore(STORE).clear();
      tx.objectStore(META_STORE).delete(META_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    console.warn('Invoice cache clear failed:', err);
  }
}
