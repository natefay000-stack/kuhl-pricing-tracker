#!/usr/bin/env node
/**
 * Migrate data from Railway → Vercel/Supabase
 *
 * Pulls all data from the Railway /api/data endpoint, then pushes
 * each table to the Vercel /api/data/import endpoint in chunks.
 *
 * Usage:  node scripts/migrate-railway-to-vercel.mjs
 */

const RAILWAY_URL = 'https://satisfied-liberation-production-402e.up.railway.app';
const VERCEL_URL  = 'https://kuhl-tracker.vercel.app';

const CHUNK_SIZE = 5000;  // records per import request

async function fetchRailwayData() {
  console.log('📥 Fetching all data from Railway...');
  console.log('   (This may take a minute — 380K+ sales records)');

  const res = await fetch(`${RAILWAY_URL}/api/data`, {
    headers: { 'Accept': 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`Railway returned ${res.status}: ${await res.text()}`);
  }

  const body = await res.json();
  console.log(`   ✅ Received: ${body.data.products.length} products, ${body.data.sales.length} sales, ${body.data.pricing.length} pricing, ${body.data.costs.length} costs`);
  return body.data;
}

async function importChunk(type, chunk, index, total, fileName) {
  const res = await fetch(`${VERCEL_URL}/api/data/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type,
      data: chunk,
      fileName: fileName || `migrate_${type}_chunk_${index}`,
      replaceExisting: index === 0, // Only delete existing on first chunk
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Import ${type} chunk ${index} failed (${res.status}): ${text}`);
  }

  const result = await res.json();
  return result;
}

async function importTable(type, records) {
  const total = records.length;
  const chunks = Math.ceil(total / CHUNK_SIZE);

  console.log(`\n📤 Importing ${total.toLocaleString()} ${type} records in ${chunks} chunk(s)...`);

  let imported = 0;
  for (let i = 0; i < chunks; i++) {
    const chunk = records.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    const result = await importChunk(type, chunk, i, chunks, `migrate_${type}_chunk_${i + 1}`);
    imported += result.count || chunk.length;
    const pct = Math.round((imported / total) * 100);
    process.stdout.write(`   Chunk ${i + 1}/${chunks} — ${imported.toLocaleString()}/${total.toLocaleString()} (${pct}%)\r`);
  }
  console.log(`   ✅ ${type}: ${imported.toLocaleString()} records imported                    `);
  return imported;
}

async function main() {
  console.log('🚀 KUHL Data Migration: Railway → Vercel/Supabase\n');

  // Step 1: Fetch from Railway
  const data = await fetchRailwayData();

  // Step 2: Import tables in order (products first, then deps)
  const results = {};

  // Products first (other tables reference styleNumber)
  results.products = await importTable('products', data.products);

  // Pricing & costs next
  results.pricing = await importTable('pricing', data.pricing);
  results.costs   = await importTable('costs', data.costs);

  // Sales last (biggest table)
  results.sales = await importTable('sales', data.sales);

  // Step 3: Verify
  console.log('\n🔍 Verifying Vercel database...');
  const healthRes = await fetch(`${VERCEL_URL}/api/health`);
  const health = await healthRes.json();
  console.log(`   Products: ${health.counts.products}`);
  console.log(`   Sales:    ${health.counts.sales}`);
  console.log(`   Pricing:  ${health.counts.pricing}`);
  console.log(`   Costs:    ${health.counts.costs}`);

  console.log('\n✅ Migration complete!');
  console.log(`   Site: ${VERCEL_URL}`);
}

main().catch((err) => {
  console.error('\n❌ Migration failed:', err.message);
  process.exit(1);
});
