// Vercel tanpa Redis: aplikasi harus gagal dengan pesan yang jelas, bukan crash.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

let server, base;
before(async () => {
  Object.assign(process.env, { VERCEL: '1' });
  for (const k of ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_URL', 'KV_REST_API_TOKEN', 'QA_TOKEN']) delete process.env[k];
  server = http.createServer((await import('../api/index.js')).default);
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('health menunjukkan penyimpanan belum diatur', async () => {
  const j = await (await fetch(base + '/health')).json();
  assert.equal(j.storage, 'unconfigured');
});

test('membuat tagihan -> 503 dengan petunjuk perbaikan', async () => {
  const res = await fetch(base + '/api/bills', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
    name: 'x', ownerId: 'o', people: [{ id: 'o', name: 'A' }], roundStep: 0,
    receipts: [{ id: 'r', label: 'S', items: [{ id: 'i', name: 'a', qty: 1, unit_price: 1000, discount: 0 }], charges: {}, assignments: {} }], payment: {} }) });
  assert.equal(res.status, 503);
  const j = await res.json();
  assert.equal(j.error.code, 'storage_not_configured');
  assert.match(j.error.message, /UPSTASH_REDIS_REST_URL/);
});

test('QA nonaktif tanpa QA_TOKEN (404)', async () => {
  assert.equal((await fetch(base + '/api/qa/status')).status, 404);
});

test('scan tetap bisa menolak file palsu tanpa storage (cache opsional)', async () => {
  const fd = new FormData(); fd.append('image', new Blob(['bukan gambar'], { type: 'image/jpeg' }), 'x.jpg');
  assert.equal((await fetch(base + '/api/scan', { method: 'POST', body: fd })).status, 400);
});
