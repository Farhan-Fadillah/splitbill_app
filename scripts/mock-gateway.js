// Gateway palsu untuk pengembangan/tes tanpa API key asli.
// Meniru: Sumopod (anthropic /v1/messages & openai /v1/chat/completions) dan Mistral (/v1/ocr, /v1/chat/completions).
// Jalankan: node scripts/mock-gateway.js   lalu set SUMOPOD_BASE_URL=http://localhost:4010 MISTRAL_BASE_URL=http://localhost:4010
// Perilaku Claude diatur env MOCK_CLAUDE = ok | 500 | invalid | slow | mismatch
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const expected = fs.readFileSync(path.join(root, 'tests/fixtures/sample-restaurant.expected.json'), 'utf8');
const port = Number(process.env.MOCK_PORT || 4010);
const log = [];

const send = (res, status, obj) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };

http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString();
  let body = {};
  try { body = JSON.parse(raw || '{}'); } catch { /* */ }
  const mode = process.env.MOCK_CLAUDE || 'ok';
  const rec = (what) => { log.push(what); if (process.env.MOCK_VERBOSE) console.log('[mock]', what); };

  if (req.url === '/_log') return send(res, 200, log);

  if (req.url === '/v1/messages') {
    const img = body.messages?.[0]?.content?.find((b) => b.type === 'image');
    const okShape = req.headers['x-api-key'] && body.system?.[0]?.text?.includes('receipt') && img?.source?.type === 'base64' && Buffer.from(img.source.data, 'base64')[0] === 0xff;
    rec(`claude:${okShape ? 'shape-ok' : 'BAD-SHAPE'}:${mode}`);
    if (!okShape) return send(res, 400, { error: 'bad request shape' });
    if (mode === '500') return send(res, 500, { error: 'upstream' });
    if (mode === 'slow') await new Promise((r) => setTimeout(r, 4000));
    const text = mode === 'invalid' ? 'maaf tidak bisa' : mode === 'mismatch' ? JSON.stringify({ ...JSON.parse(expected), total: 999999 }) : '```json\n' + expected + '\n```';
    return send(res, 200, { id: 'msg_mock', type: 'message', role: 'assistant', content: [{ type: 'text', text }] });
  }
  if (req.url === '/v1/ocr') {
    rec('mistral-ocr');
    if (!req.headers.authorization?.startsWith('Bearer ') || !body.document?.image_url?.startsWith('data:image/')) return send(res, 400, { error: 'bad ocr request' });
    return send(res, 200, { pages: [{ index: 0, markdown: '# WARUNG MAKAN SEDAP\nNasi Goreng Spesial 2 x 35.000 70.000\n...' }] });
  }
  if (req.url === '/v1/chat/completions') {
    rec(`chat:${body.response_format?.type || 'plain'}`);
    return send(res, 200, { choices: [{ message: { role: 'assistant', content: expected } }] });
  }
  send(res, 404, { error: 'not found' });
}).listen(port, () => console.log(`Mock gateway di http://localhost:${port} (MOCK_CLAUDE=${process.env.MOCK_CLAUDE || 'ok'})`));
