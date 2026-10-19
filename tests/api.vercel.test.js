// Meniru lingkungan Vercel: VERCEL=1, handler dari api/index.js, penyimpanan Upstash Redis (tiruan).
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startMockUpstash } from './helpers/mock-upstash.js';

let redis, server, base;
before(async () => {
  redis = await startMockUpstash();
  Object.assign(process.env, {
    VERCEL: '1', UPSTASH_REDIS_REST_URL: redis.url, UPSTASH_REDIS_REST_TOKEN: redis.token,
    QA_TOKEN: 'rahasia-qa', SUMOPOD_API_KEY: 'sk-RAHASIA-JANGAN-BOCOR', MISTRAL_API_KEY: 'mstrl-RAHASIA-JANGAN-BOCOR',
    SCAN_RATE_PER_MIN: '3',
  });
  const handler = (await import('../api/index.js')).default; // persis seperti yang dijalankan Vercel
  server = http.createServer(handler);
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); redis.close(); });

const call = async (method, url, body, headers = {}) => {
  const res = await fetch(base + url, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: res.status, json, text, headers: res.headers };
};
const bill = () => ({
  name: 'Makan Siang', date: '2026-03-14', ownerId: 'owner', roundStep: 500,
  people: [{ id: 'owner', name: 'Saya' }, { id: 'p1', name: 'Andi' }, { id: 'p2', name: 'Bima' }],
  receipts: [{ id: 'r1', label: 'Struk 1', items: [{ id: 'i1', name: 'Nasi', qty: 2, unit_price: 35000, discount: 0 }, { id: 'i2', name: 'Pizza', qty: 1, unit_price: 90000, discount: 0 }],
    charges: { tax: 16000, service_charge: 8000, discount: 0, delivery_fee: 0, platform_fee: 0, tip: 0, rounding: 0 },
    assignments: { i1: { mode: 'equal', shares: { p1: 1 } }, i2: { mode: 'equal', shares: { p1: 1, p2: 1, owner: 1 } } } }],
  payment: { holder: 'Saya', bankName: 'BCA', bankNumber: '123', ewallets: [], qrisFile: null },
});

test('health: mode penyimpanan redis, berjalan sebagai Vercel', async () => {
  const r = await call('GET', '/health');
  assert.equal(r.json.storage, 'redis');
  assert.equal(r.json.vercel, true);
});

test('alur tagihan penuh di Redis + TTL 90 hari + data tidak bocor', async () => {
  const c = await call('POST', '/api/bills', bill());
  assert.equal(c.status, 201);
  const { ownerToken, publicToken, grandTotal } = c.json;
  const DAYS90 = 90 * 86400;
  for (const k of [`bill:o:${ownerToken}`, `bill:p:${publicToken}`]) assert.ok(Math.abs(redis.ttl(k) - DAYS90) < 5, `TTL ${k}`);

  const pub = await call('GET', `/api/public/${publicToken}`);
  assert.equal(pub.status, 200);
  assert.ok(!pub.text.includes(ownerToken), 'ownerToken tidak boleh bocor');
  const sum = (await Promise.all(['owner', 'p1', 'p2'].map((id) => call('GET', `/api/public/${publicToken}/person/${id}`)))).reduce((s, x) => s + x.json.person.total, 0);
  assert.equal(sum, grandTotal);

  assert.equal((await call('POST', `/api/public/${publicToken}/paid`, { personId: 'p1' })).json.status, 'menunggu');
  let own = await call('GET', `/api/bills/${ownerToken}`);
  assert.equal(own.json.bill.people.find((p) => p.id === 'p1').status, 'menunggu');
  assert.ok(redis.ttl(`bill:s:${ownerToken}`) > DAYS90 - 5, 'hash status punya TTL');

  await call('PATCH', `/api/bills/${ownerToken}`, { statuses: { p1: 'lunas', p2: 'lunas' }, name: 'Nama Baru' });
  own = await call('GET', `/api/bills/${ownerToken}`);
  assert.equal(own.json.bill.settled, true);
  assert.equal(own.json.bill.name, 'Nama Baru');

  const lk = await call('POST', '/api/bills/lookup', { tokens: [ownerToken, 'tokenpalsu1234567890abcd'] });
  assert.equal(lk.json.bills.length, 1);
  assert.equal(lk.json.missing.length, 1);

  assert.equal((await call('DELETE', `/api/bills/${ownerToken}`)).json.ok, true);
  assert.equal((await call('GET', `/api/bills/${ownerToken}`)).status, 404);
  assert.equal((await call('GET', `/api/public/${publicToken}`)).status, 404, 'tautan teman ikut mati setelah dihapus');
  assert.deepEqual(redis.keys('bill:'), [], 'semua kunci tagihan terhapus');
});

test('QRIS tersimpan di Redis dan disajikan lewat /api/qris/:file', async () => {
  const sharp = (await import('sharp')).default;
  const png = await sharp({ create: { width: 300, height: 300, channels: 3, background: '#123456' } }).png().toBuffer();
  const fd = new FormData(); fd.append('image', new Blob([png], { type: 'image/png' }), 'q.png');
  const up = await fetch(base + '/api/qris', { method: 'POST', body: fd });
  assert.equal(up.status, 201);
  const { url, file } = await up.json();
  assert.ok(redis.keys('qris:').length === 1);
  const img = await fetch(base + url);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/webp');
  assert.ok((await img.arrayBuffer()).byteLength > 100);
  assert.equal((await fetch(base + '/api/qris/..%2f..%2fetc.webp')).status, 404);
  assert.equal((await fetch(base + `/api/qris/${file.replace(/.$/, '0')}`)).status, 404);
});

test('batas upload di Vercel 4MB dilaporkan ke klien', async () => {
  const r = await call('GET', '/api/config');
  assert.equal(r.json.maxUploadBytes, 4 * 1024 * 1024);
  assert.equal(r.json.qaEnabled, true);
});

test('rate limit scan berbasis Redis (3/menit) -> request ke-4 ditolak 429', async () => {
  const send = async () => {
    const fd = new FormData(); fd.append('image', new Blob(['bukan gambar'], { type: 'image/jpeg' }), 'x.jpg');
    return (await fetch(base + '/api/scan', { method: 'POST', body: fd })).status;
  };
  const codes = [await send(), await send(), await send(), await send()];
  assert.deepEqual(codes, [400, 400, 400, 429]);
  assert.ok(redis.keys('rl:scan:').length >= 1);
});

test('QA: butuh token, tidak pernah membocorkan key', async () => {
  assert.equal((await call('GET', '/api/qa/status')).status, 401);
  assert.equal((await call('GET', '/api/qa/status', null, { 'x-qa-token': 'salah' })).status, 401);
  const ok = await call('GET', '/api/qa/status', null, { 'x-qa-token': 'rahasia-qa' });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.storage.ok, true);
  assert.equal(ok.json.env.sumopod.keySet, true);
  assert.ok(!ok.text.includes('RAHASIA-JANGAN-BOCOR'), 'nilai key tidak boleh muncul di respons QA');
  const ping = await call('POST', '/api/qa/ping', { target: 'mistral' }, { 'x-qa-token': 'rahasia-qa' });
  assert.equal(ping.status, 200);
  assert.equal(ping.json.result.ok, false); // gateway asli tidak terjangkau dari tes, dan harus gagal dengan rapi
  assert.ok(!ping.text.includes('RAHASIA-JANGAN-BOCOR'));
  assert.equal((await call('POST', '/api/qa/ping', { target: 'x' }, { 'x-qa-token': 'rahasia-qa' })).status, 400);
});

test('Express tidak menyajikan file statis di Vercel (CDN yang melayani)', async () => {
  assert.equal((await fetch(base + '/app.html')).status, 404);
});
