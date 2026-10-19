// Cek koneksi API tanpa mencetak key. Pemakaian: npm run check:keys
import sharp from 'sharp';
import { cfg } from '../server/config.js';
import { callClaude } from '../server/services/ocr/claude.js';
import { callMistralOcr } from '../server/services/ocr/mistral.js';

const png = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="360" height="120"><rect width="360" height="120" fill="#fff"/><text x="20" y="70" font-size="34" font-family="DejaVu Sans Mono, monospace" fill="#000">TOTAL 25.000</text></svg>')).png().toBuffer();
const jpg = await sharp(png).jpeg().toBuffer();

const mask = (s) => (s ? `${s.slice(0, 4)}…(${s.length} karakter)` : '(kosong)');
console.log(`Sumopod : ${cfg.sumopod.baseUrl}  gaya=${cfg.sumopod.style}  model=${cfg.sumopod.model}  key=${mask(cfg.sumopod.key)}`);
console.log(`Mistral : ${cfg.mistral.baseUrl}  ocr=${cfg.mistral.ocrModel}  chat=${cfg.mistral.chatModel}  key=${mask(cfg.mistral.key)}\n`);

async function check(name, fn) {
  const t = Date.now();
  try { const out = await fn(); console.log(`OK    ${name} (${Date.now() - t} ms) ${out || ''}`); return true; }
  catch (e) {
    const hint = e.status === 401 || e.status === 403 ? 'key ditolak' : e.status === 404 ? 'endpoint/model tidak ditemukan: cek SUMOPOD_API_STYLE dan nama model' : e.status === 429 ? 'kena rate limit/kuota' : '';
    console.log(`GAGAL ${name} (${Date.now() - t} ms): ${e.message}${e.status ? ` [HTTP ${e.status}]` : ''} ${hint}`);
    if (e.body) console.log(`      balasan: ${String(e.body).slice(0, 200)}`);
    return false;
  }
}

const a = await check('Claude (Sumopod)', async () => {
  const text = await callClaude({ image: jpg, userText: 'Read the total amount in this image. Reply with ONLY this JSON: {"error":"unreadable"} if you cannot, otherwise a minimal receipt JSON.' });
  return `balasan ${text.length} karakter`;
});
const b = await check('Mistral OCR', async () => {
  const md = await callMistralOcr({ image: png, mime: 'image/png' });
  return /25/.test(md) ? 'teks terbaca' : `balasan: ${md.slice(0, 40)}`;
});
process.exit(a && b ? 0 : 1);
