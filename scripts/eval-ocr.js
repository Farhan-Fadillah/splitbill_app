// Evaluasi akurasi OCR pada semua fixture. Pemakaian: npm run eval:ocr
// Tiap tests/fixtures/<nama>.(jpg|png|webp|pdf) harus punya <nama>.expected.json (format sama dengan contoh di system prompt).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sniffMime } from '../server/services/ocr/preprocess.js';
import { scanReceipt } from '../server/services/ocr/index.js';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../tests/fixtures');
const files = fs.readdirSync(dir).filter((f) => /\.(jpe?g|png|webp|pdf)$/i.test(f)).sort();
if (!files.length) { console.log('Belum ada fixture.'); process.exit(0); }

const rows = [];
for (const f of files) {
  const base = f.replace(/\.[^.]+$/, '');
  const expPath = path.join(dir, `${base}.expected.json`);
  if (!fs.existsSync(expPath)) { console.log(`lewati ${f} (tidak ada ${base}.expected.json)`); continue; }
  const exp = JSON.parse(fs.readFileSync(expPath, 'utf8'));
  const buffer = fs.readFileSync(path.join(dir, f));
  const t = Date.now();
  try {
    const r = await scanReceipt({ buffer, mime: sniffMime(buffer) });
    const itemsOk = r.items.length === exp.items.length && r.items.every((it, i) => it.qty === exp.items[i].qty && it.line_total === exp.items[i].line_total);
    rows.push({ file: f, engine: r.engine, ms: Date.now() - t, items: `${r.items.length}/${exp.items.length}`, itemsOk, totalOk: r.total === exp.total, math: r.reconciled });
  } catch (e) {
    rows.push({ file: f, engine: '-', ms: Date.now() - t, items: '-', itemsOk: false, totalOk: false, math: false, error: e.code || e.message });
  }
}
const mark = (b) => (b ? 'ya' : 'TIDAK');
console.log('\nberkas'.padEnd(40), 'engine'.padEnd(16), 'waktu'.padEnd(9), 'item'.padEnd(7), 'item cocok'.padEnd(11), 'total cocok'.padEnd(12), 'matematika');
for (const r of rows) console.log(r.file.padEnd(39), String(r.engine).padEnd(16), `${r.ms}ms`.padEnd(9), r.items.padEnd(7), mark(r.itemsOk).padEnd(11), mark(r.totalOk).padEnd(12), mark(r.math), r.error ? `(${r.error})` : '');
const n = rows.length || 1;
const pct = (k) => Math.round((rows.filter((r) => r[k]).length / n) * 100);
console.log(`\nRingkasan (${rows.length} berkas): item cocok ${pct('itemsOk')}% | total cocok ${pct('totalOk')}% | matematika lolos ${pct('math')}% | rata-rata ${Math.round(rows.reduce((s, r) => s + r.ms, 0) / n)} ms`);
