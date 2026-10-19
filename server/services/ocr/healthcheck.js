import sharp from 'sharp';
import { cfg } from '../../config.js';
import { callClaude } from './claude.js';
import { callMistralOcr } from './mistral.js';

const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="120"><rect width="360" height="120" fill="#fff"/><text x="20" y="70" font-size="34" font-family="DejaVu Sans Mono, monospace" fill="#000">TOTAL 25.000</text></svg>';
const hintFor = (e) => (e.status === 401 || e.status === 403 ? 'Key ditolak. Periksa nilai key di environment variables.'
  : e.status === 404 ? 'Endpoint atau model tidak ditemukan. Periksa SUMOPOD_API_STYLE (anthropic/openai) dan CLAUDE_MODEL.'
    : e.status === 429 ? 'Kena rate limit atau kuota habis.' : e.message === 'timeout' ? 'Timeout. Gateway lambat atau tidak terjangkau.' : '');

async function run(fn) {
  const t = Date.now();
  try { const detail = await fn(); return { ok: true, ms: Date.now() - t, detail }; }
  catch (e) { return { ok: false, ms: Date.now() - t, error: e.message, status: e.status || null, hint: hintFor(e), body: e.body ? String(e.body).slice(0, 200) : undefined }; }
}

export const pingClaude = () => run(async () => {
  if (!cfg.sumopod.key) throw Object.assign(new Error('SUMOPOD_API_KEY belum diisi'), { status: 401 });
  const jpg = await sharp(Buffer.from(svg)).jpeg().toBuffer();
  const text = await callClaude({ image: jpg, userText: 'Read the total amount in this image. Reply with a minimal receipt JSON, or {"error":"unreadable"}.' });
  return `Balasan diterima (${text.length} karakter)`;
});

export const pingMistral = () => run(async () => {
  if (!cfg.mistral.key) throw Object.assign(new Error('MISTRAL_API_KEY belum diisi'), { status: 401 });
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  const md = await callMistralOcr({ image: png, mime: 'image/png' });
  return /25/.test(md) ? 'Teks "25.000" terbaca' : `Terhubung, balasan: ${md.slice(0, 40)}`;
});
