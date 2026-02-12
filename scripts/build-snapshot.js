#!/usr/bin/env node
/**
 * Build a static JSON snapshot of all data from Supabase.
 * Output: public/data-snapshot.json
 *
 * The frontend loads this directly — no API calls needed on page load.
 * Run this whenever data changes: node scripts/build-snapshot.js
 */

const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://bphoxjpfwdarlexrvgcg.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwaG94anBmd2RhcmxleHJ2Z2NnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYzNTI5NDYsImV4cCI6MjA4MTkyODk0Nn0.WUUB29yvD3PrM23fClfI0xtC5yt8ZaIe9z-L8jdq2cU';

const headers = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Accept': 'application/json',
};

async function fetchTable(table, select = '*', order = '') {
  const rows = [];
  const PAGE = 1000;
  let offset = 0;
  while (true) {
    let url = `${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}&limit=${PAGE}&offset=${offset}`;
    if (order) url += `&order=${encodeURIComponent(order)}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`${table} fetch failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
    process.stdout.write(`\r  ${table}: ${rows.length} rows...`);
  }
  console.log(`\r  ${table}: ${rows.length} rows`);
  return rows;
}

async function fetchSalesRPC(offset, limit) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_sales_page`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ p_offset: offset, p_limit: limit }),
  });
  if (!res.ok) throw new Error(`Sales RPC failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// Compute aggregations in-process (avoids Supabase statement timeout)
function computeInventoryAggregations(inventory) {
  const typeMap = new Map();
  const whMap = new Map();
  const periodMap = new Map();

  for (const r of inventory) {
    const mt = r.movementType || 'Unknown';
    const te = typeMap.get(mt) || { count: 0, totalQty: 0, totalExtension: 0 };
    te.count++; te.totalQty += r.qty || 0; te.totalExtension += r.extension || 0;
    typeMap.set(mt, te);

    const wh = r.warehouse || 'Unknown';
    const we = whMap.get(wh) || { count: 0, totalQty: 0, totalExtension: 0 };
    we.count++; we.totalQty += r.qty || 0; we.totalExtension += r.extension || 0;
    whMap.set(wh, we);

    const p = r.period || 'Unknown';
    const pe = periodMap.get(p) || { count: 0, totalQty: 0, totalExtension: 0 };
    pe.count++; pe.totalQty += r.qty || 0; pe.totalExtension += r.extension || 0;
    periodMap.set(p, pe);
  }

  return {
    totalCount: inventory.length,
    byType: Array.from(typeMap.entries()).map(([k, v]) => ({ movementType: k, ...v })),
    byWarehouse: Array.from(whMap.entries()).map(([k, v]) => ({ warehouse: k, ...v })),
    byPeriod: Array.from(periodMap.entries()).map(([k, v]) => ({ period: k, ...v })).sort((a, b) => a.period.localeCompare(b.period)),
  };
}

function computeSalesAggregations(sales) {
  const channelMap = new Map();
  const categoryMap = new Map();
  const genderMap = new Map();
  const customerMap = new Map();

  for (const s of sales) {
    if (s.customerType) {
      const ck = `${s.season}-${s.customerType}`;
      const ce = channelMap.get(ck);
      if (ce) { ce.revenue += s.revenue || 0; ce.units += s.unitsBooked || 0; }
      else channelMap.set(ck, { channel: s.customerType, season: s.season || '', revenue: s.revenue || 0, units: s.unitsBooked || 0 });
    }

    const catKey = `${s.season}-${s.categoryDesc || 'Other'}`;
    const catE = categoryMap.get(catKey);
    if (catE) { catE.revenue += s.revenue || 0; catE.units += s.unitsBooked || 0; }
    else categoryMap.set(catKey, { category: s.categoryDesc || 'Other', season: s.season || '', revenue: s.revenue || 0, units: s.unitsBooked || 0 });

    const div = (s.divisionDesc || '').toLowerCase();
    let gender = 'Unisex';
    if (div.includes("women") || div.includes("woman")) gender = "Women's";
    else if (div.includes("men's") || div.includes("mens")) gender = "Men's";
    const gk = `${s.season}-${gender}`;
    const ge = genderMap.get(gk);
    if (ge) { ge.revenue += s.revenue || 0; ge.units += s.unitsBooked || 0; }
    else genderMap.set(gk, { gender, season: s.season || '', revenue: s.revenue || 0, units: s.unitsBooked || 0 });

    if (s.customer) {
      const custKey = `${s.season}-${s.customer}`;
      const custE = customerMap.get(custKey);
      if (custE) { custE.revenue += s.revenue || 0; custE.units += s.unitsBooked || 0; }
      else customerMap.set(custKey, { customer: s.customer, customerType: s.customerType || '', season: s.season || '', revenue: s.revenue || 0, units: s.unitsBooked || 0 });
    }
  }

  return {
    byChannel: Array.from(channelMap.values()),
    byCategory: Array.from(categoryMap.values()),
    byGender: Array.from(genderMap.values()),
    byCustomer: Array.from(customerMap.values()),
  };
}

async function main() {
  const startTime = Date.now();
  console.log('Building data snapshot from Supabase...\n');

  // Fetch small tables in parallel
  console.log('Fetching tables...');
  const [products, pricing, costs] = await Promise.all([
    fetchTable('Product', '*', 'season.desc'),
    fetchTable('Pricing', '*', 'season.desc'),
    fetchTable('Cost', '*', 'season.desc'),
  ]);

  // Fetch inventory
  const inventory = await fetchTable('Inventory', '*', 'movementDate.desc,styleNumber.asc');

  // Fetch all sales via RPC (50K per call, no row limit)
  console.log('  Fetching sales via RPC...');
  const sales = [];
  const SALES_PAGE = 50000;
  let offset = 0;
  while (true) {
    const batch = await fetchSalesRPC(offset, SALES_PAGE);
    if (!batch || batch.length === 0) break;
    sales.push(...batch);
    process.stdout.write(`\r  Sales: ${sales.length} rows...`);
    if (batch.length < SALES_PAGE) break;
    offset += SALES_PAGE;
  }
  console.log(`\r  Sales: ${sales.length} rows`);

  // Compute aggregations locally (fast — avoids Supabase timeout)
  console.log('\nComputing aggregations...');
  const inventoryAggregations = computeInventoryAggregations(inventory);
  const salesAggregations = computeSalesAggregations(sales);
  console.log('  Done.');

  const snapshot = {
    success: true,
    buildTime: new Date().toISOString(),
    counts: {
      products: products.length,
      sales: sales.length,
      pricing: pricing.length,
      costs: costs.length,
      inventory: inventory.length,
    },
    data: {
      products,
      sales,
      pricing,
      costs,
      inventory,
    },
    salesAggregations,
    inventoryAggregations,
  };

  const outPath = path.join(__dirname, '..', 'public', 'data-snapshot.json');
  fs.writeFileSync(outPath, JSON.stringify(snapshot));
  const sizeMB = (fs.statSync(outPath).size / 1024 / 1024).toFixed(1);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nSnapshot built in ${elapsed}s`);
  console.log(`Output: ${outPath} (${sizeMB} MB)`);
  console.log(`Counts: ${products.length} products, ${sales.length} sales, ${pricing.length} pricing, ${costs.length} costs, ${inventory.length} inventory`);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
