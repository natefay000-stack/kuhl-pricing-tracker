'use client';

import { Product, SalesRecord, PricingRecord, CostRecord } from '@/types/product';

const DB_NAME = 'kuhl_pricing_db';
const DB_VERSION = 1;
const PRODUCTS_STORE = 'products';
const SALES_STORE = 'sales';
const PRICING_STORE = 'pricing';
const COSTS_STORE = 'costs';
const META_STORE = 'meta';

let db: IDBDatabase | null = null;

export async function initDB(): Promise<IDBDatabase> {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);

    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      console.log('Creating KÜHL pricing database...');

      // Products store
      if (!database.objectStoreNames.contains(PRODUCTS_STORE)) {
        const productsStore = database.createObjectStore(PRODUCTS_STORE, { keyPath: 'id', autoIncrement: true });
        productsStore.createIndex('styleNumber', 'styleNumber', { unique: false });
        productsStore.createIndex('styleColor', 'styleColor', { unique: false });
        productsStore.createIndex('season', 'season', { unique: false });
        productsStore.createIndex('divisionDesc', 'divisionDesc', { unique: false });
      }

      // Sales store
      if (!database.objectStoreNames.contains(SALES_STORE)) {
        const salesStore = database.createObjectStore(SALES_STORE, { keyPath: 'id', autoIncrement: true });
        salesStore.createIndex('styleNumber', 'styleNumber', { unique: false });
        salesStore.createIndex('season', 'season', { unique: false });
        salesStore.createIndex('customer', 'customer', { unique: false });
      }

      // Pricing store
      if (!database.objectStoreNames.contains(PRICING_STORE)) {
        const pricingStore = database.createObjectStore(PRICING_STORE, { keyPath: 'id', autoIncrement: true });
        pricingStore.createIndex('styleNumber', 'styleNumber', { unique: false });
        pricingStore.createIndex('season', 'season', { unique: false });
      }

      // Costs store
      if (!database.objectStoreNames.contains(COSTS_STORE)) {
        const costsStore = database.createObjectStore(COSTS_STORE, { keyPath: 'id', autoIncrement: true });
        costsStore.createIndex('styleNumber', 'styleNumber', { unique: false });
        costsStore.createIndex('season', 'season', { unique: false });
      }

      // Meta store for tracking data versions
      if (!database.objectStoreNames.contains(META_STORE)) {
        database.createObjectStore(META_STORE, { keyPath: 'key' });
      }
    };
  });
}

export async function clearAllData(): Promise<void> {
  const database = await initDB();
  const transaction = database.transaction(
    [PRODUCTS_STORE, SALES_STORE, PRICING_STORE, COSTS_STORE, META_STORE],
    'readwrite'
  );

  await Promise.all([
    clearStore(transaction, PRODUCTS_STORE),
    clearStore(transaction, SALES_STORE),
    clearStore(transaction, PRICING_STORE),
    clearStore(transaction, COSTS_STORE),
    clearStore(transaction, META_STORE),
  ]);
}

function clearStore(transaction: IDBTransaction, storeName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const store = transaction.objectStore(storeName);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function saveProducts(products: Product[]): Promise<void> {
  const database = await initDB();
  const transaction = database.transaction(PRODUCTS_STORE, 'readwrite');
  const store = transaction.objectStore(PRODUCTS_STORE);

  for (const product of products) {
    store.add(product);
  }

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function getProducts(): Promise<Product[]> {
  const database = await initDB();
  const transaction = database.transaction(PRODUCTS_STORE, 'readonly');
  const store = transaction.objectStore(PRODUCTS_STORE);
  const request = store.getAll();

  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveSales(sales: SalesRecord[]): Promise<void> {
  const database = await initDB();
  const transaction = database.transaction(SALES_STORE, 'readwrite');
  const store = transaction.objectStore(SALES_STORE);

  for (const sale of sales) {
    store.add(sale);
  }

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function getSales(): Promise<SalesRecord[]> {
  const database = await initDB();
  const transaction = database.transaction(SALES_STORE, 'readonly');
  const store = transaction.objectStore(SALES_STORE);
  const request = store.getAll();

  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
