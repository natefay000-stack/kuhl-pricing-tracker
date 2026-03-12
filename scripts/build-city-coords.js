#!/usr/bin/env node
/**
 * Build US city coordinates lookup from kelvins/US-Cities-Database.
 * Output: public/geo/us-city-coords.json
 * Format: { "CITY_NAME|ST": [lat, lng], ... }
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const CSV_URL = 'https://raw.githubusercontent.com/kelvins/US-Cities-Database/main/csv/us_cities.csv';
const OUTPUT = path.join(__dirname, '..', 'public', 'geo', 'us-city-coords.json');

function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return download(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; continue; }
    current += ch;
  }
  result.push(current.trim());
  return result;
}

async function main() {
  console.log('Downloading US Cities Database...');
  const raw = await download(CSV_URL);
  const lines = raw.split('\n');
  console.log(`Got ${lines.length} lines`);

  const coords = {};
  let count = 0;

  // Header: ID,STATE_CODE,STATE_NAME,CITY,COUNTY,LATITUDE,LONGITUDE
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const parts = parseCSVLine(line);
    if (parts.length < 7) continue;

    const stateCode = parts[1];
    const cityName = parts[3];
    const lat = parseFloat(parts[5]);
    const lng = parseFloat(parts[6]);

    if (!cityName || !stateCode || isNaN(lat) || isNaN(lng)) continue;

    const key = `${cityName.toUpperCase()}|${stateCode}`;
    if (!coords[key]) {
      coords[key] = [Math.round(lat * 10000) / 10000, Math.round(lng * 10000) / 10000];
      count++;
    }
  }

  console.log(`Built ${count} city coordinate entries`);

  // Write output
  fs.writeFileSync(OUTPUT, JSON.stringify(coords));
  const size = fs.statSync(OUTPUT).size;
  console.log(`Written to ${OUTPUT} (${(size / 1024).toFixed(0)} KB)`);
}

main().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
