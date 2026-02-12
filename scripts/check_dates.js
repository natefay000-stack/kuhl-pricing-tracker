const XLSX = require('xlsx');
const wb = XLSX.readFile('/Users/nate/Downloads/2026-01 Inventory Movement.xlsx', { type: 'file', cellDates: true });
const rows = XLSX.utils.sheet_to_json(wb.Sheets['Sheet1'], { defval: '' });

console.log('Row 0 Date:', typeof rows[0]['Date'], rows[0]['Date']);
console.log('Row 23800 Date:', typeof rows[23800]['Date'], rows[23800]['Date']);

let dateObj = 0, dateStr = 0, dateEmpty = 0;
for (const r of rows) {
  const d = r['Date'];
  if (d === '' || d === null || d === undefined) dateEmpty++;
  else if (d instanceof Date) dateObj++;
  else dateStr++;
}
console.log('Date objects:', dateObj, 'String dates:', dateStr, 'Empty:', dateEmpty);
