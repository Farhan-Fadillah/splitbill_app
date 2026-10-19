// Menyalin pustaka frontend dari node_modules ke public/vendor (dijalankan manual; hasilnya di-commit).
// Dengan begitu Vercel/CDN bisa menyajikannya sebagai file statis tanpa folder node_modules.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nm = (p) => path.join(root, 'node_modules', p);
const out = (p) => path.join(root, 'public/vendor', p);
const files = [
  ['@fontsource-variable/inter/files/inter-latin-wght-normal.woff2', 'inter/inter-latin-wght-normal.woff2'],
  ['@fontsource-variable/inter/files/inter-latin-ext-wght-normal.woff2', 'inter/inter-latin-ext-wght-normal.woff2'],
  ['heic2any/dist/heic2any.min.js', 'heic2any.js'],
  ['html2canvas/dist/html2canvas.min.js', 'html2canvas.js'],
  ['jspdf/dist/jspdf.umd.min.js', 'jspdf.js'],
];
for (const [src, dest] of files) {
  fs.mkdirSync(path.dirname(out(dest)), { recursive: true });
  fs.copyFileSync(nm(src), out(dest));
  console.log(`${dest}  ${(fs.statSync(out(dest)).size / 1024).toFixed(0)} KB`);
}
