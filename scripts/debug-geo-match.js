#!/usr/bin/env node
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const wb = XLSX.readFile(path.join(__dirname, '..', 'data', '2026-01 invoice.xlsx'));
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { range: 0 });

// Build customer → states map
const custStates = new Map();
rows.forEach(r => {
  const c = (r['Customer Name'] || '').trim();
  const s = (r['Ship To State'] || '').trim();
  if (c && s) {
    if (!custStates.has(c)) custStates.set(c, new Map());
    const stateMap = custStates.get(c);
    stateMap.set(s, (stateMap.get(s) || 0) + 1);
  }
});

// Find customers that ship to multiple states
console.log('=== Customers shipping to 4+ states (bad customer-only fallback) ===');
const multiState = [];
custStates.forEach((states, cust) => {
  if (states.size > 3) {
    const topStates = Array.from(states.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
    multiState.push({ customer: cust, stateCount: states.size, topStates });
  }
});
multiState.sort((a, b) => b.stateCount - a.stateCount);
multiState.slice(0, 15).forEach(c => {
  console.log(`  ${c.customer}: ${c.stateCount} states → ${c.topStates.map(([s, n]) => `${s}(${n})`).join(', ')}`);
});

// Now check: how many sales records used the customer-only fallback?
const sales26SP = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'data-sales-26SP.json'), 'utf-8'));

// Rebuild the lookup maps (same as enrich script)
const lookup1 = new Map(); // customer|style|color|season
const lookup2 = new Map(); // customer|style|season
const lookup3 = new Map(); // customer only

rows.forEach(r => {
  const customer = (r['Customer Name'] || '').trim();
  const style = String(r['Style'] || '').trim();
  const color = String(r['Color'] || '').trim();
  const season = (r['Season'] || '').trim();
  const state = (r['Ship To State'] || '').trim();
  if (!state || !customer || !style) return;

  const key1 = `${customer}|${style}|${color}|${season}`;
  if (!lookup1.has(key1)) lookup1.set(key1, state);

  const key2 = `${customer}|${style}|${season}`;
  if (!lookup2.has(key2)) lookup2.set(key2, state);

  const key3 = `${customer}`;
  if (!lookup3.has(key3)) lookup3.set(key3, state);
});

let matchedBy1 = 0, matchedBy2 = 0, matchedBy3 = 0, unmatched = 0;
sales26SP.forEach(s => {
  const key1 = `${s.customer || ''}|${s.styleNumber || ''}|${s.colorCode || ''}|${s.season || ''}`;
  const key2 = `${s.customer || ''}|${s.styleNumber || ''}|${s.season || ''}`;
  const key3 = `${s.customer || ''}`;

  if (lookup1.has(key1)) matchedBy1++;
  else if (lookup2.has(key2)) matchedBy2++;
  else if (lookup3.has(key3)) matchedBy3++;
  else unmatched++;
});

console.log('\n=== Match breakdown for 26SP ===');
console.log(`  Exact (customer+style+color+season): ${matchedBy1}`);
console.log(`  Medium (customer+style+season): ${matchedBy2}`);
console.log(`  Broad fallback (customer only): ${matchedBy3} ← PROBLEM`);
console.log(`  Unmatched: ${unmatched}`);
console.log(`  Total: ${sales26SP.length}`);
