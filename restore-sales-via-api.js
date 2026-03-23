#!/usr/bin/env node
/**
 * Restore missing sales from snapshot files via the running dev server API.
 * This avoids TLS issues with direct Neon connections from Node.js 25.
 */
const fs = require('fs');
const path = require('path');

const API_URL = 'http://localhost:3000/api/data/import';
const PUBLIC_DIR = path.join(__dirname, 'public');

// Seasons that need restoration (DB has significantly fewer records than snapshot)
const SEASONS_TO_RESTORE = ['24FA', '24SP', '25FA', '25SP'];

async function main() {
  for (const season of SEASONS_TO_RESTORE) {
    const snapFile = path.join(PUBLIC_DIR, `data-sales-${season}.json`);
    if (!fs.existsSync(snapFile)) {
      console.log(`  ${season}: snapshot file not found, skipping`);
      continue;
    }

    const snapData = JSON.parse(fs.readFileSync(snapFile, 'utf-8'));
    console.log(`\n--- ${season}: ${snapData.length} records from snapshot ---`);

    // Send to the import API (it handles delete + insert in a transaction)
    // The import API has a 1000 batch size, so we'll send in chunks to avoid
    // hitting request body size limits
    const CHUNK_SIZE = 10000;
    for (let i = 0; i < snapData.length; i += CHUNK_SIZE) {
      const chunk = snapData.slice(i, i + CHUNK_SIZE);
      const isFirst = i === 0;

      const body = {
        type: 'sales',
        season: season,
        data: chunk,
        replaceExisting: isFirst, // Only delete existing on the first chunk
      };

      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error(`  ERROR chunk ${i}-${i + chunk.length}: ${res.status} ${text.substring(0, 200)}`);
        break;
      }

      const result = await res.json();
      console.log(`  ${season} chunk ${i}-${i + chunk.length}: ${result.count || 'OK'} records imported`);
    }
  }

  // Verify final counts
  console.log('\nVerifying...');
  const countRes = await fetch('http://localhost:3000/api/data?salesOnly=true&salesPage=0&salesPageSize=1');
  const countData = await countRes.json();
  console.log(`DB total sales: ${countData.totalSales}`);
  console.log('Expected: ~469,413');
}

main().catch(e => { console.error(e); process.exit(1); });
