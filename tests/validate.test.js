import test from 'node:test';
import assert from 'node:assert/strict';
import { extractJson, normalizeResult, reconcile, mergeTiles } from '../server/services/ocr/validate.js';

const sample = () => ({
  receipt_type: 'restaurant', merchant: 'Warung', date: '2026-03-14', currency: 'IDR', language: 'id',
  items: [
    { name: 'Nasi Goreng', qty: 2, unit_price: 35000, discount: 0, line_total: 70000, confidence: 0.97 },
    { name: 'Es Teh', qty: 2, unit_price: 8000, discount: 0, line_total: 16000, confidence: 0.96 },
    { name: 'Ayam Bakar', qty: 1, unit_price: 42000, discount: 0, line_total: 42000, confidence: 0.97 },
  ],
  subtotal: 128000, discount: 0, service_charge: 6400, tax: 13440, delivery_fee: 0, platform_fee: 0, tip: 0, rounding: 160, total: 148000,
  quality: { blur: false, dark: false, cropped: false, handwritten: false }, warnings: [],
});

test('extractJson: fence ```json, teks pembuka, dan kurung dalam string', () => {
  assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('Berikut hasilnya:\n{"a":{"b":"x}y"}} terima kasih'), { a: { b: 'x}y' } });
  assert.throws(() => extractJson('tidak ada json'));
  assert.throws(() => extractJson('{"a":1'));
});

test('struk yang benar lolos rekonsiliasi', () => {
  const r = reconcile(normalizeResult(sample()));
  assert.equal(r.reconciled, true);
  assert.equal(r.data.items.every((i) => !i.needs_review), true);
});

test('angka string berformat & diskon negatif dinormalkan', () => {
  const s = sample();
  s.items[0].unit_price = '35.000'; s.items[0].line_total = '70.000'; s.discount = -0;
  s.items[2].discount = -1000; s.items[2].line_total = 41000; s.subtotal = 127000; s.total = 146000 - 1000 + 1000;
  s.total = 127000 + 6400 + 13440 + 160;
  const d = normalizeResult(s);
  assert.equal(d.items[0].unit_price, 35000);
  assert.equal(d.items[2].discount, 1000);
  assert.equal(reconcile(d).reconciled, true);
});

test('float pada rupiah ditolak oleh skema', () => {
  const s = sample(); s.items[0].unit_price = 35000.5;
  assert.throws(() => normalizeResult(s));
});

test('subtotal salah: warning spesifik + baris confidence rendah ditandai Cek ulang', () => {
  const s = sample(); s.subtotal = 138000; s.items[1].confidence = 0.6;
  const r = reconcile(normalizeResult(s));
  assert.equal(r.reconciled, false);
  assert.ok(r.warnings.some((w) => /Total item Rp 128\.000 tidak sama dengan subtotal Rp 138\.000/.test(w)));
  assert.equal(r.data.items[1].needs_review, true);
  assert.equal(r.data.items[0].needs_review, false);
});

test('total akhir tidak cocok terdeteksi', () => {
  const s = sample(); s.total = 150000;
  const r = reconcile(normalizeResult(s));
  assert.equal(r.reconciled, false);
  assert.ok(r.warnings.some((w) => /tidak sama dengan total/.test(w)));
});

test('qty*harga tidak cocok tetapi line_total cocok subtotal: unit_price diperbaiki', () => {
  const s = sample(); s.items[0].unit_price = 3500; // salah baca: 35000 -> 3500
  const r = reconcile(normalizeResult(s));
  assert.equal(r.data.items[0].unit_price, 35000);
  assert.equal(r.reconciled, true);
});

test('pajak inklusif (tax=0) tetap lolos', () => {
  const s = { ...sample(), service_charge: 0, tax: 0, rounding: 0, subtotal: 128000, total: 128000, warnings: ['Pajak sudah termasuk harga'] };
  assert.equal(reconcile(normalizeResult(s)).reconciled, true);
});

test('mergeTiles: duplikat di area overlap dibuang, total dari tile terakhir', () => {
  const mk = (items, extra = {}) => normalizeResult({ ...sample(), items, subtotal: 0, discount: 0, service_charge: 0, tax: 0, rounding: 0, total: 0, ...extra });
  const A = { name: 'A', qty: 1, unit_price: 1000, discount: 0, line_total: 1000, confidence: 0.9 };
  const B = { name: 'B', qty: 1, unit_price: 2000, discount: 0, line_total: 2000, confidence: 0.9 };
  const C = { name: 'C', qty: 1, unit_price: 3000, discount: 0, line_total: 3000, confidence: 0.9 };
  const t1 = mk([A, B], { merchant: 'Toko X' });
  const t2 = mk([B, C], { merchant: null, subtotal: 6000, total: 6000, date: null });
  const m = mergeTiles([t1, t2]);
  assert.deepEqual(m.items.map((i) => i.name), ['A', 'B', 'C']);
  assert.equal(m.total, 6000);
  assert.equal(m.merchant, 'Toko X');
  assert.equal(reconcile(m).reconciled, true);
});

test('dua item identik yang memang beda (bukan overlap) tidak dibuang di tengah daftar', () => {
  const mk = (items) => normalizeResult({ ...sample(), items, subtotal: 0, service_charge: 0, tax: 0, rounding: 0, total: 0 });
  const A = { name: 'Aqua', qty: 1, unit_price: 4000, discount: 0, line_total: 4000, confidence: 0.9 };
  const X = { name: 'Roti', qty: 1, unit_price: 9000, discount: 0, line_total: 9000, confidence: 0.9 };
  const m = mergeTiles([mk([A, X]), mk([X, A])]);
  assert.deepEqual(m.items.map((i) => i.name), ['Aqua', 'Roti', 'Aqua']);
});
