#!/usr/bin/env node
/**
 * Enrich existing sales snapshot files with geographic data from invoice Excel.
 * Reads per-season sales JSONs + invoice file, matches records, adds shipToState.
 */

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
const publicDir = path.join(__dirname, '..', 'public');
const invoiceFile = path.join(dataDir, '2026-01 invoice.xlsx');

if (!fs.existsSync(invoiceFile)) {
  console.error('Invoice file not found:', invoiceFile);
  process.exit(1);
}

console.log('Reading invoice file...');
const wb = XLSX.readFile(invoiceFile);
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { range: 0 });
console.log(`  ${rows.length} invoice rows`);

// Build lookup: customer+style+color+season → state
const lookup = new Map();
let skipped = 0;
rows.forEach(r => {
  const customer = (r['Customer Name'] || '').trim();
  const style = String(r['Style'] || '').trim();
  const color = String(r['Color'] || '').trim();
  const season = (r['Season'] || '').trim();
  const state = (r['Ship To State'] || '').trim();
  if (!state || !customer || !style) { skipped++; return; }

  // Multiple key levels for matching (most specific → least)
  const key1 = `${customer}|${style}|${color}|${season}`;
  if (!lookup.has(key1)) lookup.set(key1, state);

  const key2 = `${customer}|${style}|${season}`;
  if (!lookup.has(key2)) lookup.set(key2, state);

  // Broadest fallback: just customer → state (most customers ship to one state)
  const key3 = `${customer}`;
  if (!lookup.has(key3)) lookup.set(key3, state);
});

console.log(`  ${lookup.size} lookup entries (${skipped} skipped)`);

// Read manifest
const manifestPath = path.join(publicDir, 'data-sales-manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
console.log(`\nEnriching ${manifest.seasons.length} season files...`);

let totalRecords = 0;
let totalMatched = 0;

for (const season of manifest.seasons) {
  const seasonPath = path.join(publicDir, `data-sales-${season}.json`);
  if (!fs.existsSync(seasonPath)) {
    console.log(`  ${season}: file not found, skipping`);
    continue;
  }

  const sales = JSON.parse(fs.readFileSync(seasonPath, 'utf-8'));
  let matched = 0;

  for (const s of sales) {
    // Try matching keys from most to least specific
    const key1 = `${s.customer || ''}|${s.styleNumber || ''}|${s.colorCode || ''}|${s.season || ''}`;
    const key2 = `${s.customer || ''}|${s.styleNumber || ''}|${s.season || ''}`;
    const key3 = `${s.customer || ''}`;

    let state = lookup.get(key1) || lookup.get(key2) || lookup.get(key3);

    if (state) {
      s.shipToState = state;
      matched++;
    }
  }

  totalRecords += sales.length;
  totalMatched += matched;

  // Write back
  fs.writeFileSync(seasonPath, JSON.stringify(sales));
  const sizeMB = (fs.statSync(seasonPath).size / 1024 / 1024).toFixed(1);
  const pct = (matched / sales.length * 100).toFixed(1);
  console.log(`  ${season}: ${matched}/${sales.length} matched (${pct}%) → ${sizeMB} MB`);
}

console.log(`\nDone: ${totalMatched}/${totalRecords} records enriched (${(totalMatched/totalRecords*100).toFixed(1)}%)`);
