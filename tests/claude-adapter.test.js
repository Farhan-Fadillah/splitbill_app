import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { callClaude } from '../server/services/ocr/claude.js';

function gateway(handler) {
  const calls = [];
  const srv = http.createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
    calls.push({ url: req.url, body, headers: req.headers });
    const out = handler(req.url, body, calls.length);
    res.writeHead(out.status, { 'content-type': 'application/json' }); res.end(JSON.stringify(out.json));
  });
  return new Promise((r) => srv.listen(0, () => r({ srv, calls, url: `http://127.0.0.1:${srv.address().port}` })));
}
const mk = (url, style) => ({ sumopod: { key: 'k', baseUrl: url, style, model: 'm' }, hedgeMs: 1000, hardTimeoutMs: 3000 });
const args = (config) => ({ image: Buffer.from([0xff, 0xd8, 0xff]), userText: 'x', config });
const OPENAI_OK = { status: 200, json: { choices: [{ message: { content: '{"ok":1}' } }] } };
const ANTHRO_OK = { status: 200, json: { content: [{ type: 'text', text: '{"ok":2}' }] } };

test('format anthropic dikonfigurasi tetapi gateway hanya OpenAI -> otomatis beralih dan berhasil', async () => {
  const g = await gateway((url) => (url === '/v1/chat/completions' ? OPENAI_OK : { status: 404, json: { error: 'no route' } }));
  const text = await callClaude(args(mk(g.url, 'anthropic')));
  assert.equal(text, '{"ok":1}');
  assert.deepEqual(g.calls.map((c) => c.url), ['/v1/messages', '/v1/chat/completions']);
  // panggilan berikutnya langsung memakai format yang terbukti berhasil
  g.calls.length = 0;
  await callClaude(args(mk(g.url, 'anthropic')));
  assert.deepEqual(g.calls.map((c) => c.url), ['/v1/chat/completions']);
  g.srv.close();
});

test('format openai dikonfigurasi tetapi gateway hanya Anthropic -> beralih', async () => {
  const g = await gateway((url) => (url === '/v1/messages' ? ANTHRO_OK : { status: 404, json: {} }));
  assert.equal(await callClaude(args(mk(g.url, 'openai'))), '{"ok":2}');
  g.srv.close();
});

test('kedua format 404 -> melempar error asli (404), bukan error format kedua', async () => {
  const g = await gateway(() => ({ status: 404, json: { error: 'model not found' } }));
  await assert.rejects(callClaude(args(mk(g.url, 'anthropic'))), (e) => e.status === 404 && /HTTP 404/.test(e.message));
  g.srv.close();
});

test('401 tidak memicu pergantian format', async () => {
  const g = await gateway(() => ({ status: 401, json: { error: 'bad key' } }));
  await assert.rejects(callClaude(args(mk(g.url, 'anthropic'))), (e) => e.status === 401);
  assert.equal(g.calls.length, 1);
  g.srv.close();
});

test('model menolak temperature (400) -> diulang tanpa temperature', async () => {
  const g = await gateway((url, body) => (body.temperature !== undefined ? { status: 400, json: { error: 'temperature is deprecated for this model' } } : ANTHRO_OK));
  assert.equal(await callClaude(args(mk(g.url, 'anthropic'))), '{"ok":2}');
  assert.equal(g.calls.length, 2);
  assert.equal(g.calls[1].body.temperature, undefined);
  g.srv.close();
});

test('gambar dikirim dalam bentuk yang benar untuk tiap format', async () => {
  const g = await gateway((url) => (url === '/v1/chat/completions' ? OPENAI_OK : ANTHRO_OK));
  await callClaude(args(mk(g.url, 'anthropic')));
  const a = g.calls[0].body.messages[0].content.find((b) => b.type === 'image');
  assert.equal(a.source.type, 'base64'); assert.ok(g.calls[0].headers['x-api-key']);
  g.calls.length = 0;
  const g2 = await gateway(() => OPENAI_OK);
  await callClaude(args(mk(g2.url, 'openai')));
  const o = g2.calls[0].body.messages[1].content.find((b) => b.type === 'image_url');
  assert.match(o.image_url.url, /^data:image\/jpeg;base64,/);
  assert.match(g2.calls[0].headers.authorization, /^Bearer /);
  g.srv.close(); g2.srv.close();
});
