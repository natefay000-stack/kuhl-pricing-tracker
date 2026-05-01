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

// Cache valid for 1 hour. After that the page re-fetches in foreground
// (we still serve the stale cache instantly while the refresh streams in).
const CACHE_TTL_MS = 60 * 60 * 1000;

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
}

/** Return cached invoices if still fresh; null otherwise. */
export async function loadInvoicesFromCache(): Promise<{
  invoices: InvoiceRecord[];
  ageMs: number;
  stale: boolean;
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
    return { invoices, ageMs, stale: ageMs > CACHE_TTL_MS };
  } catch (err) {
    console.warn('Invoice cache read failed:', err);
    return null;
  }
}

/** Replace the cached invoice set. */
export async function saveInvoicesToCache(invoices: InvoiceRecord[]): Promise<void> {
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
      meta.put({ count: invoices.length, savedAt: Date.now() } as InvoiceCacheMeta, META_KEY);
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
