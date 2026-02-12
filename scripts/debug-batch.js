// Debug: try inserting a single row from batch 120 (row 23800) to find the error
const { execSync } = require('child_process');
const XLSX = require('xlsx');

const wb = XLSX.readFile('/Users/nate/Downloads/2026-01 Inventory Movement.xlsx', { type: 'file', cellDates: true });
const rows = XLSX.utils.sheet_to_json(wb.Sheets['Sheet1'], { defval: '' });

function getToken() {
  const raw = execSync('security find-generic-password -s "Supabase CLI" -a "supabase" -w', { encoding: 'utf-8' }).trim();
  const b64 = raw.replace('go-keyring-base64:', '');
  return Buffer.from(b64, 'base64').toString('utf-8');
}

function esc(v) {
  if (v === null || v === undefined || v === '') return 'NULL';
  return "'" + String(v).replace(/'/g, "''") + "'";
}

function parseDate(val) {
  if (!val) return null;
  const str = String(val).trim();
  const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (m) {
    let y = parseInt(m[3]);
    y = y < 50 ? 2000 + y : 1900 + y;
    return new Date(y, parseInt(m[1]) - 1, parseInt(m[2])).toISOString();
  }
  return null;
}

async function main() {
  const token = getToken();
  const PROJECT = 'bphoxjpfwdarlexrvgcg';

  // Try a single row from the failing region
  const testRow = rows[23800];
  const id = 'debug_' + Date.now();
  const dateVal = parseDate(testRow['Date']);

  const sql = `INSERT INTO "Inventory" ("id","styleNumber","styleDesc","color","colorDesc","warehouse","movementType","movementDate","qty","balance","extension","costPrice","wholesalePrice","msrp","divisionDesc","period","createdAt","updatedAt") VALUES (${esc(id)},${esc(testRow['Style'])},${esc(testRow['Style Desc'])},${esc(testRow['Clr'])},${esc(testRow['Clr Desc'])},${esc(testRow['Whse'])},${esc(testRow['Type'])},${dateVal ? esc(dateVal) : 'NULL'},${Number(testRow['Qty'])||0},${Number(testRow['Balance'])||0},${Number(testRow['Extension'])||0},${Number(testRow['Cost/Price'])||0},${Number(testRow['Wholesale Price'])||0},${Number(testRow['MSRP'])||0},${esc(testRow['Division Desc'])},${esc(testRow['Period'])},'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')`;

  console.log('SQL length:', sql.length);
  console.log('Date parsed as:', dateVal);

  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });

  const status = res.status;
  const body = await res.text();
  console.log('Status:', status);
  console.log('Response:', body.substring(0, 500));

  // Now try a batch of 5 rows from the failing region
  console.log('\n--- Trying batch of 5 from row 23800 ---');
  const vals = [];
  for (let i = 23800; i < 23805; i++) {
    const r = rows[i];
    const d = parseDate(r['Date']);
    vals.push(`(${esc('batch_'+i)},${esc(r['Style'])},${esc(r['Style Desc'])},${esc(r['Clr'])},${esc(r['Clr Desc'])},${esc(r['Whse'])},${esc(r['Type'])},${d?esc(d):'NULL'},${Number(r['Qty'])||0},${Number(r['Balance'])||0},${Number(r['Extension'])||0},${Number(r['Cost/Price'])||0},${Number(r['Wholesale Price'])||0},${Number(r['MSRP'])||0},${esc(r['Division Desc'])},${esc(r['Period'])},'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')`);
  }
  const batchSQL = `INSERT INTO "Inventory" ("id","styleNumber","styleDesc","color","colorDesc","warehouse","movementType","movementDate","qty","balance","extension","costPrice","wholesalePrice","msrp","divisionDesc","period","createdAt","updatedAt") VALUES ${vals.join(',')}`;

  const res2 = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: batchSQL }),
  });
  console.log('Batch status:', res2.status);
  console.log('Batch response:', (await res2.text()).substring(0, 500));
}

main().catch(console.error);
