#!/usr/bin/env node
/**
 * Rebuild CBSA metro SVG coordinates from pre-projected county centroids.
 *
 * Uses us-atlas/counties-albers-10m.json (same Albers USA projection as the
 * state paths) so metro bubbles are placed at the geographic centre of their
 * constituent counties.  Output overwrites public/geo/cbsa-metros.json with
 * updated svgX / svgY while preserving every other field.
 */

const { feature } = require('topojson-client');
const { geoPath, geoIdentity } = require('d3-geo');
const fs = require('fs');
const path = require('path');

// ── Load data ──────────────────────────────────────────────────────
const topoPath = path.join(
  __dirname, '..', 'node_modules', 'us-atlas', 'counties-albers-10m.json',
);
const topo = JSON.parse(fs.readFileSync(topoPath, 'utf8'));
const counties = feature(topo, topo.objects.counties);

const metrosPath = path.join(__dirname, '..', 'public', 'geo', 'cbsa-metros.json');
const metros = JSON.parse(fs.readFileSync(metrosPath, 'utf8'));

// ── Build FIPS → county feature index ──────────────────────────────
// County FIPS in the TopoJSON is stored as the feature id (number).
// In cbsa-metros.json county FIPS are zero-padded 5-char strings ("06037").
const fipsToFeature = {};
for (const feat of counties.features) {
  // Feature id can be a number (6037) or string
  const key = String(feat.id).padStart(5, '0');
  fipsToFeature[key] = feat;
}

// ── Projection & path (identity — data is already projected) ──────
const projection = geoIdentity();
const pathGen = geoPath(projection);

// ── Compute centroids ──────────────────────────────────────────────
let updated = 0;
let skipped = 0;
const diffs = [];

for (const [cbsa, metro] of Object.entries(metros)) {
  const countyFips = metro.countyFips || [];
  if (countyFips.length === 0) {
    skipped++;
    continue;
  }

  // Collect county features that exist in the topology
  const feats = countyFips
    .map(fips => fipsToFeature[fips])
    .filter(Boolean);

  if (feats.length === 0) {
    console.warn(`⚠  ${cbsa} ${metro.name}: no matching county features`);
    skipped++;
    continue;
  }

  // Merge into a single FeatureCollection and compute centroid
  const fc = { type: 'FeatureCollection', features: feats };
  const centroid = pathGen.centroid(fc);

  if (!centroid || isNaN(centroid[0]) || isNaN(centroid[1])) {
    console.warn(`⚠  ${cbsa} ${metro.name}: centroid computation failed`);
    skipped++;
    continue;
  }

  const newX = Math.round(centroid[0] * 10) / 10;
  const newY = Math.round(centroid[1] * 10) / 10;
  const oldX = metro.svgX;
  const oldY = metro.svgY;
  const dist = Math.sqrt((newX - oldX) ** 2 + (newY - oldY) ** 2);

  diffs.push({ cbsa, name: metro.shortName, oldX, oldY, newX, newY, dist });

  metro.svgX = newX;
  metro.svgY = newY;
  updated++;
}

// ── Write updated file ────────────────────────────────────────────
fs.writeFileSync(metrosPath, JSON.stringify(metros, null, 2) + '\n');

// ── Report ────────────────────────────────────────────────────────
console.log(`\n✅ Updated ${updated} metros, skipped ${skipped}\n`);

// Show biggest changes
diffs.sort((a, b) => b.dist - a.dist);
console.log('Biggest position changes:');
for (const d of diffs.slice(0, 25)) {
  console.log(
    `  ${d.name.padEnd(22)} Δ${d.dist.toFixed(1).padStart(6)}px  ` +
    `(${d.oldX},${d.oldY}) → (${d.newX},${d.newY})`
  );
}

console.log('\nSmallest changes:');
for (const d of diffs.slice(-10)) {
  console.log(
    `  ${d.name.padEnd(22)} Δ${d.dist.toFixed(1).padStart(6)}px  ` +
    `(${d.oldX},${d.oldY}) → (${d.newX},${d.newY})`
  );
}
