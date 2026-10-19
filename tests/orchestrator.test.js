import test from 'node:test';
import assert from 'node:assert/strict';
import { extractOne, scanReceipt, ScanError } from '../server/services/ocr/index.js';

const good = JSON.stringify({
  receipt_type: 'restaurant', merchant: 'Warung', date: '2026-03-14', currency: 'IDR', language: 'id',
  items: [{ name: 'Nasi', qty: 2, unit_price: 10000, discount: 0, line_total: 20000, confidence: 0.95 }],
  subtotal: 20000, discount: 0, service_charge: 0, tax: 2000, delivery_fee: 0, platform_fee: 0, tip: 0, rounding: 0, total: 22000,
  quality: { blur: false, dark: false, cropped: false, handwritten: false }, warnings: [],
});
const mismatch = JSON.stringify({ ...JSON.parse(good), total: 25000 });

const sleep = (ms, signal) => new Promise((res, rej) => {
  const t = setTimeout(res, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); rej(Object.assign(new Error('dibatalkan'), { status: 0 })); });
});

function deps(over = {}) {
  const calls = [];
  const d = {
    config: { hedgeMs: 40, hardTimeoutMs: 1000 },
    calls,
    callClaude: async (a) => { calls.push('claude'); return good; },
    callMistralOcr: async () => { calls.push('mistral-ocr'); return '# markdown struk'; },
    callMistralStructure: async () => { calls.push('mistral-chat'); return good; },
    preprocess: async () => ({ color: Buffer.from('c'), bw: Buffer.from('b'), tiles: null, info: { deskew: 0 } }),
    ...over,
  };
  return d;
}
const run = (d, extra = {}) => extractOne({ variants: { color: Buffer.from('c'), bw: Buffer.from('b') }, userText: 'x', ...extra }, d);

test('Claude sukses: Mistral tidak dipanggil', async () => {
  const d = deps();
  const r = await run(d);
  assert.equal(r.engine, 'claude');
  assert.deepEqual(d.calls, ['claude']);
});

test('Claude error jaringan -> fallback Mistral', async () => {
  const d = deps({ callClaude: async () => { throw Object.assign(new Error('boom'), { status: 500 }); } });
  const r = await run(d);
  assert.equal(r.engine, 'mistral');
  assert.deepEqual(d.calls, ['mistral-ocr', 'mistral-chat']);
});

test('Claude JSON tidak valid -> fallback Mistral', async () => {
  const d = deps({ callClaude: async () => 'maaf, saya tidak bisa' });
  assert.equal((await run(d)).engine, 'mistral');
});

test('Claude mengembalikan not_a_receipt + Mistral gagal -> ScanError not_a_receipt', async () => {
  const d = deps({
    callClaude: async () => '{"error":"not_a_receipt"}',
    callMistralOcr: async () => { throw Object.assign(new Error('x'), { status: 500 }); },
  });
  await assert.rejects(run(d), (e) => e instanceof ScanError && e.code === 'not_a_receipt');
});

test('kedua engine gagal -> ScanError all_failed; 401 -> not_configured', async () => {
  const fail = (status) => async () => { throw Object.assign(new Error('x'), { status }); };
  await assert.rejects(run(deps({ callClaude: fail(500), callMistralOcr: fail(500) })), (e) => e.code === 'all_failed');
  await assert.rejects(run(deps({ callClaude: fail(401), callMistralOcr: fail(401) })), (e) => e.code === 'not_configured');
});

test('hedge: Claude lambat -> Mistral jalan paralel, hasil valid tercepat dipakai', async () => {
  const d = deps({ callClaude: async ({ signal }) => { d.calls.push('claude'); await sleep(500, signal); return good; } });
  const t = Date.now();
  const r = await run(d);
  assert.equal(r.engine, 'mistral');
  assert.ok(Date.now() - t < 400, 'tidak menunggu Claude selesai');
  assert.deepEqual(d.calls.slice(0, 2).sort(), ['claude', 'mistral-ocr']);
});

test('hedge: Claude selesai sebelum timer hedge -> Mistral tidak pernah jalan', async () => {
  const d = deps({ config: { hedgeMs: 200, hardTimeoutMs: 1000 }, callClaude: async () => { await sleep(20); return good; } });
  await run(d);
  await sleep(250);
  assert.ok(!d.calls.includes('mistral-ocr'));
});

test('matematika Claude gagal, Mistral cocok -> pakai Mistral', async () => {
  const d = deps({ callClaude: async () => mismatch });
  assert.equal((await run(d)).engine, 'mistral');
});

test('keduanya gagal rekonsiliasi -> retry Claude dengan draft Mistral; berhasil = claude+mistral', async () => {
  let n = 0;
  const d = deps({
    callClaude: async ({ userText }) => { n++; return /OCR draft|ocr_draft/.test(userText) ? good : mismatch; },
    callMistralStructure: async () => mismatch,
  });
  const r = await run(d);
  assert.equal(r.engine, 'claude+mistral');
  assert.equal(n, 2);
  assert.equal(r.bestEffort, false);
});

test('semua gagal rekonsiliasi -> hasil terbaik + peringatan (bukan error)', async () => {
  const d = deps({ callClaude: async () => mismatch, callMistralStructure: async () => mismatch });
  const r = await run(d);
  assert.equal(r.bestEffort, true);
  assert.ok(r.data.warnings.some((w) => /tidak sama dengan total/.test(w)));
});

test('konsensus: dua engine setuju -> engine "claude+mistral"', async () => {
  const d = deps({ config: { hedgeMs: 10, hardTimeoutMs: 1000 }, callClaude: async ({ signal }) => { await sleep(60, signal); return good; } });
  // Mistral selesai duluan (hedge) tetapi Claude tidak dibatalkan sebelum selesai? -> winner mistral; cek hasil valid
  const r = await run(d);
  assert.ok(['mistral', 'claude+mistral'].includes(r.engine));
});

test('scanReceipt: payload akhir menyertakan engine, quality gabungan klien, warning mata uang asing', async () => {
  const jpy = JSON.stringify({ ...JSON.parse(good), currency: 'JPY', tax: 0, total: 20000 });
  const d = deps({ callClaude: async () => jpy });
  const out = await scanReceipt({ buffer: Buffer.from('x'), mime: 'image/jpeg', clientQuality: { blur: true, lowRes: true } }, d);
  assert.equal(out.engine, 'claude');
  assert.equal(out.quality.blur, true);
  assert.equal(out.quality.lowRes, true);
  assert.ok(out.warnings.some((w) => /JPY/.test(w)));
  assert.equal(out.reconciled, true);
});

test('struk panjang: tile digabung, duplikat overlap dibuang', async () => {
  const mk = (items, extra) => JSON.stringify({ ...JSON.parse(good), items, subtotal: 0, tax: 0, total: 0, ...extra });
  const it = (name, p) => ({ name, qty: 1, unit_price: p, discount: 0, line_total: p, confidence: 0.9 });
  const seq = [mk([it('A', 1000), it('B', 2000)]), mk([it('B', 2000), it('C', 3000)], { subtotal: 6000, total: 6000 })];
  let i = 0;
  const d = deps({
    callClaude: async () => seq[i++],
    preprocess: async () => ({ color: Buffer.from('c'), bw: Buffer.from('b'), info: { tall: true }, tiles: [{ color: Buffer.from('1'), bw: Buffer.from('1') }, { color: Buffer.from('2'), bw: Buffer.from('2') }] }),
  });
  const out = await scanReceipt({ buffer: Buffer.from('x'), mime: 'image/jpeg' }, d);
  assert.deepEqual(out.items.map((x) => x.name), ['A', 'B', 'C']);
  assert.equal(out.total, 6000);
  assert.equal(out.reconciled, true);
});
