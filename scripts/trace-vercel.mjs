// Memeriksa file apa saja yang akan dibundel Vercel untuk api/index.js (pakai @vercel/nft, pelacak yang sama).
import { nodeFileTrace } from '@vercel/nft';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { fileList, warnings } = await nodeFileTrace([path.join(root, 'api/index.js')], { base: root, processCwd: root });
const files = [...fileList];
const has = (re) => files.filter((f) => re.test(f));
const report = [
  ['prompt sistem OCR', has(/prompts\/system\.txt$/)],
  ['split.js (dipakai server)', has(/public\/js\/split\.js$/)],
  ['sharp (binary linux)', has(/@img\/sharp-linux-x64.*\.node$|sharp-linux-x64/)],
  ['mupdf (wasm)', has(/mupdf.*\.wasm$/)],
  ['better-sqlite3 (tidak dipakai di Vercel; dibuang lewat excludeFiles di vercel.json)', has(/better-sqlite3\/.*\.node$/)],
];
console.log(`${files.length} file akan dibundel\n`);
for (const [name, list] of report) console.log(`${list.length ? 'ADA  ' : 'TIDAK'} ${name}${list.length ? `  (${list[0]})` : ''}`);
const sizeMb = (await Promise.all(files.map((f) => import('node:fs').then((fs) => { try { return fs.statSync(path.join(root, f)).size; } catch { return 0; } })))).reduce((a, b) => a + b, 0) / 1048576;
console.log(`\nperkiraan ukuran tak terkompres: ${sizeMb.toFixed(0)} MB (batas fungsi Vercel 250 MB)`);
if (warnings.size) console.log(`\n${warnings.size} peringatan pelacakan (biasanya aman):`, [...warnings].slice(0, 3).map((w) => w.message.slice(0, 100)));
