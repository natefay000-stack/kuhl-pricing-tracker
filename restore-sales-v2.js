#!/usr/bin/env node
/**
 * Restore sales from snapshot files via API — small batches, careful sequencing.
 * Step 1: Delete all records for a season
 * Step 2: Insert in small 5K chunks (each as its own API call with replaceExisting=false)
 */
const fs = require('fs');
const path = require('path');

const API_URL = 'http://localhost:3000/api/data/import';
const PUBLIC_DIR = path.join(__dirname, 'public');
const CHUNK_SIZE = 5000;

const SEASONS_TO_RESTORE = ['24FA', '24SP', '25FA', '25SP'];

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function getDbCount() {
  const r = await fetch('http://localhost:3000/api/data?salesOnly=true&salesPage=0&salesPageSize=1');
  const d = await r.json();
  return d.totalSales;
}

async function importChunk(season, data, replaceExisting) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'sales', season, data, replaceExisting }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.substring(0, 200)}`);
  }
  return res.json();
}

async function main() {
  const startCount = await getDbCount();
  console.log(`Starting DB count: ${startCount}`);

  for (const season of SEASONS_TO_RESTORE) {
    const snapFile = path.join(PUBLIC_DIR, `data-sales-${season}.json`);
    if (!fs.existsSync(snapFile)) { console.log(`  ${season}: no file`); continue; }

    const snapData = JSON.parse(fs.readFileSync(snapFile, 'utf-8'));
    console.log(`\n=== ${season}: ${snapData.length} records ===`);

    // Step 1: Delete existing + insert first chunk
    const firstChunk = snapData.slice(0, CHUNK_SIZE);
    console.log(`  Deleting existing ${season} + inserting first ${firstChunk.length}...`);
    const r1 = await importChunk(season, firstChunk, true);
    console.log(`  → ${r1.count} records (replace mode)`);
    await sleep(500); // Let DB settle

    // Step 2: Insert remaining chunks (no delete)
    let inserted = firstChunk.length;
    for (let i = CHUNK_SIZE; i < snapData.length; i += CHUNK_SIZE) {
      const chunk = snapData.slice(i, i + CHUNK_SIZE);
      try {
        const r = await importChunk(season, chunk, false);
        inserted += chunk.length;
        process.stdout.write(`  ${season}: ${inserted}/${snapData.length} (${r.count})\r`);
        // Small delay between chunks to avoid overwhelming the connection pool
        await sleep(200);
      } catch (err) {
        console.error(`\n  ERROR at ${inserted}: ${err.message}`);
        break;
      }
    }
    console.log(`\n  ${season}: done — ${inserted} records inserted`);

    // Verify
    await sleep(1000);
    const count = await getDbCount();
    console.log(`  DB total now: ${count}`);
  }

  console.log('\n=== Final verification ===');
  await sleep(2000);
  const finalCount = await getDbCount();
  console.log(`Final DB count: ${finalCount}`);
}

main().catch(e => { console.error(e); process.exit(1); });
