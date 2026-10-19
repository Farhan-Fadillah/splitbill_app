import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-api-'));
process.env.DB_PATH = path.join(tmp, 't.sqlite');
process.env.UPLOAD_DIR = path.join(tmp, 'up');
process.env.SUMOPOD_API_KEY = '';
process.env.MISTRAL_API_KEY = '';

let server, base;
before(async () => {
  const { createApp } = await import('../server/index.js');
  await new Promise((r) => { server = createApp().listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

const call = async (method, url, body) => {
  const res = await fetch(base + url, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: await res.json().catch(() => null), headers: res.headers };
};

const bill = () => ({
  name: 'Makan Siang', date: '2026-03-14', ownerId: 'owner', roundStep: 500,
  people: [{ id: 'owner', name: 'Saya' }, { id: 'p1', name: 'Andi' }, { id: 'p2', name: 'Bima' }],
  receipts: [{ id: 'r1', label: 'Struk 1', items: [{ id: 'i1', name: 'Nasi', qty: 2, unit_price: 35000, discount: 0 }, { id: 'i2', name: 'Pizza', qty: 1, unit_price: 90000, discount: 0 }],
    charges: { tax: 16000, service_charge: 8000, discount: 0, delivery_fee: 0, platform_fee: 0, tip: 0, rounding: 0 },
    assignments: { i1: { mode: 'equal', shares: { p1: 1 } }, i2: { mode: 'equal', shares: { p1: 1, p2: 1, owner: 1 } } } }],
  payment: { holder: 'Saya', bankName: 'BCA', bankNumber: '123', ewallets: [], qrisFile: null },
});

test('health & header keamanan', async () => {
  const r = await call('GET', '/health');
  assert.equal(r.json.ok, true);
  assert.ok(r.headers.get('content-security-policy')?.includes("default-src 'self'"));
  assert.equal(r.headers.get('x-powered-by'), null);
});

test('alur tagihan: buat -> publik -> teman bayar -> penagih konfirmasi', async () => {
  const c = await call('POST', '/api/bills', bill());
  assert.equal(c.status, 201);
  const { ownerToken, publicToken, grandTotal } = c.json;
  assert.equal(grandTotal, 70000 + 90000 + 16000 + 8000);
  assert.ok(ownerToken.length >= 22 && publicToken.length >= 22 && ownerToken !== publicToken);

  const pub = await call('GET', `/api/public/${publicToken}`);
  assert.equal(pub.status, 200);
  assert.ok(!JSON.stringify(pub.json).includes(ownerToken), 'ownerToken tidak boleh bocor ke halaman publik');
  assert.equal(pub.json.bill.payerCount, 2);

  const person = await call('GET', `/api/public/${publicToken}/person/p1`);
  assert.equal(person.json.person.status, 'belum');
  const sum = (await Promise.all(['owner', 'p1', 'p2'].map((id) => call('GET', `/api/public/${publicToken}/person/${id}`)))).reduce((s, x) => s + x.json.person.total, 0);
  assert.equal(sum, grandTotal, 'total semua orang harus persis sama dengan total struk');

  assert.equal((await call('POST', `/api/public/${publicToken}/paid`, { personId: 'p1' })).json.status, 'menunggu');
  assert.equal((await call('POST', `/api/public/${publicToken}/paid`, { personId: 'owner' })).status, 400);

  let own = await call('GET', `/api/bills/${ownerToken}`);
  assert.equal(own.json.bill.people.find((p) => p.id === 'p1').status, 'menunggu');
  assert.equal(own.json.bill.waitingCount, 1);
  await call('PATCH', `/api/bills/${ownerToken}`, { statuses: { p1: 'lunas', p2: 'lunas' } });
  own = await call('GET', `/api/bills/${ownerToken}`);
  assert.equal(own.json.bill.settled, true);

  const lk = await call('POST', '/api/bills/lookup', { tokens: [ownerToken, 'tokenpalsu1234567890abcd'] });
  assert.equal(lk.json.bills.length, 1);
});

test('input tidak valid ditolak dengan pesan jelas', async () => {
  const bad = bill(); bad.receipts[0].items[0].qty = 0;
  assert.equal((await call('POST', '/api/bills', bad)).status, 400);
  const bad2 = bill(); bad2.ownerId = 'tidakada';
  assert.equal((await call('POST', '/api/bills', bad2)).status, 400);
  const bad3 = bill(); bad3.people[1].name = '';
  assert.equal((await call('POST', '/api/bills', bad3)).status, 400);
});

test('token tidak dikenal -> 404, endpoint tidak ada -> 404 JSON', async () => {
  assert.equal((await call('GET', '/api/bills/xxxxxxxxxxxxxxxxxxxxxx')).status, 404);
  assert.equal((await call('GET', '/api/public/xxxxxxxxxxxxxxxxxxxxxx')).status, 404);
  assert.equal((await call('GET', '/api/tidakada')).json.ok, false);
});

test('upload scan: tanpa file & file palsu ditolak (cek magic bytes)', async () => {
  let r = await fetch(base + '/api/scan', { method: 'POST' });
  assert.equal(r.status, 400);
  const fd = new FormData();
  fd.append('image', new Blob(['ini bukan gambar'], { type: 'image/jpeg' }), 'x.jpg');
  r = await fetch(base + '/api/scan', { method: 'POST', body: fd });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error.code, 'bad_type');
});

test('upload QRIS: gambar valid diterima, file palsu ditolak', async () => {
  const sharp = (await import('sharp')).default;
  const png = await sharp({ create: { width: 50, height: 50, channels: 3, background: '#000' } }).png().toBuffer();
  const fd = new FormData(); fd.append('image', new Blob([png], { type: 'image/png' }), 'q.png');
  const ok = await fetch(base + '/api/qris', { method: 'POST', body: fd });
  assert.equal(ok.status, 201);
  const { url } = await ok.json();
  assert.ok(url.startsWith('/api/qris/'));
  const img = await fetch(base + url);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/webp');
  const fd2 = new FormData(); fd2.append('image', new Blob(['palsu'], { type: 'image/png' }), 'q.png');
  assert.equal((await fetch(base + '/api/qris', { method: 'POST', body: fd2 })).status, 400);
});

test('halaman statis & rute SPA tersaji', async () => {
  for (const u of ['/', '/app', '/s/abc', '/b/abc', '/css/app.css', '/js/split.js', '/vendor/html2canvas.js', '/vendor/jspdf.js', '/vendor/heic2any.js', '/vendor/inter/inter-latin-wght-normal.woff2']) {
    assert.equal((await fetch(base + u)).status, 200, u);
  }
});
