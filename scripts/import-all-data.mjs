import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const API = 'http://localhost:3000/api';

async function importFile(filename, fileType) {
  const filePath = path.join(dataDir, filename);
  if (!fs.existsSync(filePath)) {
    console.log('  ⚠️  File not found: ' + filename);
    return null;
  }
  const fileBuffer = fs.readFileSync(filePath);

  const blob = new Blob([fileBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const formData = new FormData();
  formData.append('file', blob, filename);
  formData.append('fileType', fileType);

  console.log(
    '📤 Parsing: ' + filename + ' (' + fileType + ', ' + (fileBuffer.length / 1024 / 1024).toFixed(1) + ' MB)...'
  );

  const response = await fetch(API + '/import-file', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    console.error('  ❌ Parse failed: ' + response.status + ' ' + text.substring(0, 300));
    return null;
  }

  const result = await response.json();
  console.log('  📊 Parsed: ' + (result.summary || ''));
  return result;
}

async function sendToDb(type, data, season, fileName) {
  const BATCH_SIZE = 2000;
  let total = 0;

  for (let i = 0; i < data.length; i += BATCH_SIZE) {
    const batch = data.slice(i, i + BATCH_SIZE);
    const isFirst = i === 0;

    const response = await fetch(API + '/data/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type,
        data: batch,
        season: season || undefined,
        fileName: fileName || type + '_import',
        replaceExisting: isFirst,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('  ❌ DB write failed at batch ' + (i / BATCH_SIZE + 1) + ': ' + text.substring(0, 300));
      return total;
    }

    total += batch.length;
    if (data.length > BATCH_SIZE) {
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(data.length / BATCH_SIZE);
      console.log('     Batch ' + batchNum + '/' + totalBatches + ': ' + total + '/' + data.length);
    }
  }

  return total;
}

async function main() {
  console.log('🚀 Importing pricing, products, and costs to database...\n');

  // 1. PRICING
  console.log('═══ PRICING ═══');
  const pricingResult = await importFile('pricebyseason1.23.26.xlsx', 'pricing');
  if (pricingResult && pricingResult.pricing) {
    const count = await sendToDb('pricing', pricingResult.pricing, null, 'pricebyseason1.23.26.xlsx');
    console.log('  ✅ Wrote ' + count + ' pricing records to DB\n');
  }

  // 2. LINE LIST (PRODUCTS) - Main file
  console.log('═══ LINE LIST (Main) ═══');
  const llResult = await importFile('FC LL 1.23.2026.xlsx', 'lineList');
  if (llResult && llResult.products) {
    const count = await sendToDb('products', llResult.products, null, 'FC LL 1.23.2026.xlsx');
    console.log('  ✅ Wrote ' + count + ' product records to DB\n');
  }

  // 3. LINE LIST - F27
  console.log('═══ LINE LIST (F27) ═══');
  const f27Result = await importFile('F27 Line List 1.30.26.xlsx', 'lineList');
  if (f27Result && f27Result.products) {
    // Use season-specific replace so we don't wipe the main line list
    const count = await sendToDb('products', f27Result.products, '27FA', 'F27 Line List 1.30.26.xlsx');
    console.log('  ✅ Wrote ' + count + ' product records to DB\n');
  }

  // 4. LINE LIST - SP27
  console.log('═══ LINE LIST (SP27) ═══');
  const sp27Result = await importFile('SP27 Line List 1.23.26.xlsx', 'lineList');
  if (sp27Result && sp27Result.products) {
    const count = await sendToDb('products', sp27Result.products, '27SP', 'SP27 Line List 1.23.26.xlsx');
    console.log('  ✅ Wrote ' + count + ' product records to DB\n');
  }

  // 5. LANDED COSTS
  console.log('═══ LANDED COSTS ═══');
  const costsResult = await importFile('Landed Request Sheet 2.18.xlsx', 'landed');
  if (costsResult && costsResult.costs) {
    const count = await sendToDb('costs', costsResult.costs, null, 'Landed Request Sheet 2.18.xlsx');
    console.log('  ✅ Wrote ' + count + ' cost records to DB\n');
  }

  // Verify
  console.log('═══ VERIFYING ═══');
  const health = await fetch(API + '/health').then(r => r.json());
  console.log('Products: ' + health.counts.products);
  console.log('Pricing:  ' + health.counts.pricing);
  console.log('Costs:    ' + health.counts.costs);
  console.log('Sales:    ' + health.counts.sales);

  console.log('\n🎉 All imports complete!');
}

main().catch((e) => console.error('Fatal error:', e.message));
