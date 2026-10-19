// Membuat foto struk sintetis (untuk uji pipeline & demo).
// Pemakaian: node scripts/make-sample.js [keluaran.jpg] [sudutDerajat] [gelap 0..1]
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const out = process.argv[2] || 'tests/fixtures/sample-restaurant.jpg';
const angle = Number(process.argv[3] ?? 6);
const dim = Number(process.argv[4] ?? 0.85);

// [kiri, kanan, ukuran, tebal, rata]
const rows = [
  ['WARUNG MAKAN SEDAP', '', 26, 700, 'c'], ['Jl. Merdeka No. 12, Jakarta', '', 15, 400, 'c'], ['14/03/2026  19:42   Meja 7', '', 15, 400, 'c'], ['--------------------------------', '', 15, 400, 'c'],
  ['Nasi Goreng Spesial', '', 18, 400, 'l'], ['2 x 35.000', '70.000', 18, 400, 'l'],
  ['Es Teh Manis', '', 18, 400, 'l'], ['2 x 8.000', '16.000', 18, 400, 'l'],
  ['Ayam Bakar', '', 18, 400, 'l'], ['1 x 42.000', '42.000', 18, 400, 'l'],
  ['--------------------------------', '', 15, 400, 'c'],
  ['Subtotal', '128.000', 18, 400, 'l'], ['Service 5%', '6.400', 18, 400, 'l'],
  ['PB1 10%', '13.440', 18, 400, 'l'], ['Pembulatan', '160', 18, 400, 'l'],
  ['TOTAL', '148.000', 20, 700, 'l'], ['--------------------------------', '', 15, 400, 'c'], ['Terima kasih', '', 16, 400, 'c'],
];
let y = 50;
const text = rows.map(([l, r, size, w, a]) => {
  y += size + 16;
  const font = `font-family="DejaVu Sans Mono, monospace" font-size="${size}" font-weight="${w}" fill="#1a1a1a"`;
  if (a === 'c') return `<text x="230" y="${y}" ${font} text-anchor="middle">${l}</text>`;
  return `<text x="40" y="${y}" ${font}>${l}</text>` + (r ? `<text x="420" y="${y}" ${font} text-anchor="end">${r}</text>` : '');
}).join('');
const H = y + 60;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="460" height="${H}"><rect width="460" height="${H}" fill="#fbfbf6"/>${text}</svg>`;

const paper = await sharp(Buffer.from(svg)).png().toBuffer();
const rotated = await sharp(paper).rotate(angle, { background: { r: 70, g: 62, b: 55, alpha: 1 } }).png().toBuffer();
const meta = await sharp(rotated).metadata();
const final = await sharp({ create: { width: meta.width + 160, height: meta.height + 160, channels: 3, background: { r: 70, g: 62, b: 55 } } })
  .composite([{ input: rotated, left: 80, top: 80 }])
  .modulate({ brightness: dim })
  .jpeg({ quality: 82 })
  .toBuffer();
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, final);
console.log(`Tersimpan: ${out} (${(final.length / 1024).toFixed(0)} KB, miring ${angle}°)`);
