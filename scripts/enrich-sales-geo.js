#!/usr/bin/env node
/**
 * Add invoice records (with geographic data) to sales snapshot files.
 * Invoice records have shipToState, shippedAtNet, etc. that the heat map needs.
 *
 * These records are tagged with dataSource: 'invoice' so views can distinguish
 * them from booking records if needed.
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

// Season code mapping: "26SP" → "26SP", "S26" → "26SP", "F25" → "25FA", etc.
function normalizeSeason(raw) {
  if (!raw) return '';
  const s = String(raw).trim().toUpperCase();
  // Already in correct format (e.g., "26SP", "25FA")
  if (/^\d{2}(SP|FA)$/.test(s)) return s;
  // Format like "S26" → "26SP", "F25" → "25FA"
  const m = s.match(/^([SF])(\d{2})$/);
  if (m) return m[2] + (m[1] === 'S' ? 'SP' : 'FA');
  // Full format like "26SPRING" → "26SP"
  if (/^\d{2}SPRING/.test(s)) return s.slice(0, 2) + 'SP';
  if (/^\d{2}FALL/.test(s)) return s.slice(0, 2) + 'FA';
  return s;
}

function parseNumber(val) {
  if (val === null || val === undefined || val === '') return 0;
  const n = Number(val);
  return isNaN(n) ? 0 : n;
}

console.log('Reading invoice file...');
const wb = XLSX.readFile(invoiceFile);
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { range: 0 });
console.log(`  ${rows.length} invoice rows`);

// Convert invoice rows to sales records
const invoiceRecords = [];
const seasonCounts = {};

for (const r of rows) {
  const state = (r['Ship To State'] || '').trim();
  if (!state) continue; // Skip records without state

  const season = normalizeSeason(r['Season']);
  if (!season) continue;

  const styleNumber = String(r['Style'] || '').trim();
  if (!styleNumber) continue;

  const record = {
    styleNumber,
    season,
    styleDesc: (r['Style Description'] || '').trim() || undefined,
    colorCode: String(r['Color'] || '').trim() || undefined,
    colorDesc: (r['Color Description'] || '').trim() || undefined,
    customer: (r['Customer Name'] || '').trim() || undefined,
    customerType: (r['Customer Type'] || '').trim() || undefined,
    gender: (r['Gender Description'] || '').trim() || undefined,
    orderType: (r['Order Type'] || '').trim() || undefined,
    divisionDesc: undefined, // Invoice doesn't have division
    categoryDesc: undefined, // Invoice doesn't have category
    // Financial fields — revenue stays 0 to avoid double-counting in other views.
    // The heat map uses shippedAtNet || revenue, so it picks up the geo data correctly.
    shippedAtNet: parseNumber(r['$ Shipped at Net Price']),
    revenue: 0,
    unitsBooked: 0,
    unitsShipped: parseNumber(r['Units Shipped']) || 1, // Default to 1 if not present
    // Geographic fields
    shipToState: state,
    // Tagging
    dataSource: 'invoice',
  };

  // Clean undefined fields
  Object.keys(record).forEach(k => {
    if (record[k] === undefined || record[k] === '') delete record[k];
  });

  invoiceRecords.push(record);
  seasonCounts[season] = (seasonCounts[season] || 0) + 1;
}

console.log(`  ${invoiceRecords.length} records with state data`);
console.log('  By season:', Object.entries(seasonCounts).sort().map(([s, n]) => `${s}: ${n}`).join(', '));

// Read manifest and get existing season list
const manifestPath = path.join(publicDir, 'data-sales-manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

// First, strip any prior invoice records from existing snapshot files
console.log('\nCleaning prior invoice records from snapshots...');
for (const season of manifest.seasons) {
  const seasonPath = path.join(publicDir, `data-sales-${season}.json`);
  if (!fs.existsSync(seasonPath)) continue;

  const sales = JSON.parse(fs.readFileSync(seasonPath, 'utf-8'));
  const beforeCount = sales.length;

  // Remove any prior invoice records AND clear bad shipToState from previous enrichment
  const cleaned = sales.filter(s => s.dataSource !== 'invoice').map(s => {
    delete s.shipToState;
    delete s.dataSource;
    return s;
  });

  if (cleaned.length !== beforeCount) {
    fs.writeFileSync(seasonPath, JSON.stringify(cleaned));
    console.log(`  ${season}: removed ${beforeCount - cleaned.length} prior invoice records`);
  }
}

// Now add invoice records to per-season files
console.log('\nAdding invoice records to season files...');
const invoiceBySeason = {};
for (const rec of invoiceRecords) {
  if (!invoiceBySeason[rec.season]) invoiceBySeason[rec.season] = [];
  invoiceBySeason[rec.season].push(rec);
}

// Collect all seasons (existing + new from invoices)
const allSeasons = new Set([...manifest.seasons, ...Object.keys(invoiceBySeason)]);
let totalAdded = 0;

for (const season of [...allSeasons].sort()) {
  const seasonPath = path.join(publicDir, `data-sales-${season}.json`);
  let sales = [];

  if (fs.existsSync(seasonPath)) {
    sales = JSON.parse(fs.readFileSync(seasonPath, 'utf-8'));
  }

  const invoiceForSeason = invoiceBySeason[season] || [];
  if (invoiceForSeason.length === 0) continue;

  sales.push(...invoiceForSeason);
  totalAdded += invoiceForSeason.length;

  fs.writeFileSync(seasonPath, JSON.stringify(sales));
  const sizeMB = (fs.statSync(seasonPath).size / 1024 / 1024).toFixed(1);
  console.log(`  ${season}: added ${invoiceForSeason.length} invoice records (total: ${sales.length}) → ${sizeMB} MB`);
}

// Update manifest with any new seasons
const updatedSeasons = [...allSeasons].sort();
if (updatedSeasons.length !== manifest.seasons.length || !updatedSeasons.every((s, i) => s === manifest.seasons[i])) {
  manifest.seasons = updatedSeasons;
  manifest.totalSales += totalAdded;
  manifest.buildTime = new Date().toISOString();
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  console.log(`\nUpdated manifest: ${updatedSeasons.length} seasons, ${manifest.totalSales} total records`);
}

console.log(`\nDone: added ${totalAdded} invoice records with geo data across ${Object.keys(invoiceBySeason).length} seasons`);
