import test from 'node:test';
import assert from 'node:assert/strict';
import { allocate, computeReceipt, applyRounding, computeSession, validateAssignment, receiptTotal, convertToIdr } from '../public/js/split.js';

const people = [{ id: 'a', name: 'Andi' }, { id: 'b', name: 'Bima' }, { id: 'c', name: 'Clara' }];
const sumPay = (r) => r.people.reduce((s, p) => s + p.payTotal, 0);

test('allocate: jumlah selalu persis (largest remainder)', () => {
  assert.deepEqual(allocate(100, [1, 1, 1]), [34, 33, 33]);
  assert.equal(allocate(1, [1, 1, 1]).reduce((s, x) => s + x, 0), 1);
  assert.deepEqual(allocate(-100, [1, 1, 1]), [-34, -33, -33]);
  assert.equal(allocate(99999, [3, 7, 11]).reduce((s, x) => s + x, 0), 99999);
  assert.deepEqual(allocate(10, [0, 0]), [5, 5]); // bobot nol -> rata
});

const baseReceipt = {
  id: 'r1', label: 'Struk 1',
  items: [
    { id: 'i1', name: 'Nasi Goreng', qty: 2, unit_price: 35000, discount: 0 },
    { id: 'i2', name: 'Pizza', qty: 1, unit_price: 90000, discount: 0 },
    { id: 'i3', name: 'Es Teh', qty: 3, unit_price: 8000, discount: 0 },
  ],
  charges: { service_charge: 5200, tax: 18400, discount: 10000, rounding: 0 },
};

test('item bersama dibagi rata, per porsi, dan persentase', () => {
  const r = computeReceipt(baseReceipt, people, {
    i1: { mode: 'equal', shares: { a: 1 } },
    i2: { mode: 'equal', shares: { a: 1, b: 1, c: 1 } },
    i3: { mode: 'portion', shares: { a: 1, b: 2 } },
  });
  const byId = Object.fromEntries(r.people.map((p) => [p.id, p]));
  assert.equal(byId.a.items.find((i) => i.itemId === 'i1').amount, 70000);
  assert.equal(byId.a.items.find((i) => i.itemId === 'i2').amount, 30000);
  assert.equal(byId.a.items.find((i) => i.itemId === 'i3').amount, 8000);
  assert.equal(byId.b.items.find((i) => i.itemId === 'i3').amount, 16000);

  const r2 = computeReceipt(baseReceipt, people, { i2: { mode: 'percent', shares: { a: 50, b: 30, c: 20 } } });
  const pizza = (id) => r2.people.find((p) => p.id === id).items.find((i) => i.itemId === 'i2').amount;
  assert.deepEqual([pizza('a'), pizza('b'), pizza('c')], [45000, 27000, 18000]);
});

test('total semua orang = total struk (tanpa pembulatan)', () => {
  const r = computeReceipt(baseReceipt, people, { i1: { mode: 'equal', shares: { a: 1 } }, i2: { mode: 'equal', shares: { b: 1, c: 1 } } });
  assert.equal(r.grandTotal, receiptTotal(baseReceipt));
  assert.equal(r.people.reduce((s, p) => s + p.total, 0), receiptTotal(baseReceipt));
});

test('biaya proporsional vs rata', () => {
  const rec = { ...baseReceipt, items: [{ id: 'x', name: 'A', qty: 1, unit_price: 90000, discount: 0 }, { id: 'y', name: 'B', qty: 1, unit_price: 30000, discount: 0 }],
    charges: { tax: 12000 }, modes: { tax: 'proportional' } };
  const asg = { x: { mode: 'equal', shares: { a: 1 } }, y: { mode: 'equal', shares: { b: 1 } } };
  const two = people.slice(0, 2);
  let r = computeReceipt(rec, two, asg);
  assert.deepEqual(r.people.map((p) => p.fees.tax), [9000, 3000]);
  r = computeReceipt({ ...rec, modes: { tax: 'equal' } }, two, asg);
  assert.deepEqual(r.people.map((p) => p.fees.tax), [6000, 6000]);
});

test('diskon mengurangi tagihan, bernilai positif di input', () => {
  const r = computeReceipt({ ...baseReceipt, charges: { discount: 15000 } }, people, {});
  assert.equal(r.grandTotal, 70000 + 90000 + 24000 - 15000);
});

test('item tanpa penugasan dibagi ke semua orang', () => {
  const r = computeReceipt(baseReceipt, people, {});
  assert.equal(r.people.reduce((s, p) => s + p.itemsTotal, 0), 184000);
  assert.ok(r.people.every((p) => p.items.length === 3));
});

for (const step of [100, 500, 1000]) {
  test(`pembulatan Rp${step}: sisa ditanggung penagih, total tetap persis`, () => {
    const r = computeReceipt(baseReceipt, people, { i1: { mode: 'equal', shares: { a: 1 } }, i2: { mode: 'equal', shares: { b: 1, c: 1 } } });
    const out = applyRounding(r, step, 'a');
    assert.equal(sumPay(out), r.grandTotal);
    for (const p of out.people.filter((x) => x.id !== 'a')) assert.equal(p.payTotal % step, 0);
  });
}

test('pembulatan dibatalkan bila membuat penagih negatif', () => {
  const rec = { id: 'r', label: '', items: [{ id: 'x', name: 'A', qty: 1, unit_price: 100, discount: 0 }], charges: {} };
  const r = computeReceipt(rec, [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], { x: { mode: 'equal', shares: { b: 1 } } });
  const out = applyRounding(r, 1000, 'a');
  assert.equal(sumPay(out), 100);
  assert.ok(out.people.every((p) => p.payTotal >= 0));
});

test('validateAssignment: persentase harus 100', () => {
  assert.equal(validateAssignment({ mode: 'percent', shares: { a: 60, b: 30 } }).ok, false);
  assert.equal(validateAssignment({ mode: 'percent', shares: { a: 60, b: 40 } }).ok, true);
  assert.equal(validateAssignment({ mode: 'portion', shares: { a: 0 } }).ok, false);
  assert.equal(validateAssignment({ mode: 'equal', shares: {} }).ok, false);
});

test('gabungan beberapa struk dijumlah per orang dan tetap persis', () => {
  const r2 = { ...baseReceipt, id: 'r2', label: 'Struk 2', items: [{ id: 'j1', name: 'Kopi', qty: 4, unit_price: 25000, discount: 0 }], charges: { tax: 10000 } };
  const s = computeSession({
    receipts: [{ ...baseReceipt, assignments: { i1: { mode: 'equal', shares: { a: 1 } } } }, { ...r2, assignments: { j1: { mode: 'equal', shares: { a: 1, b: 1, c: 1 } } } }],
    people, ownerId: 'a', roundStep: 500,
  });
  const expected = receiptTotal(baseReceipt) + receiptTotal(r2);
  assert.equal(s.combined.grandTotal, expected);
  assert.equal(sumPay(s.combined), expected);
  s.perReceipt.forEach((pr) => assert.equal(sumPay(pr), pr.grandTotal));
  const bima = s.combined.people.find((p) => p.id === 'b');
  assert.ok(bima.items.some((i) => i.receipt === 'Struk 1') && bima.items.some((i) => i.receipt === 'Struk 2'));
});

test('konversi mata uang asing (JPY & USD sen) ke rupiah dengan kurs manual', () => {
  const jpy = { currency: 'JPY', items: [{ id: 'a', name: 'Onigiri', qty: 2, unit_price: 160, discount: 0 }], discount: 0, service_charge: 0, tax: 0, delivery_fee: 0, platform_fee: 0, tip: 0, rounding: 0 };
  const out = convertToIdr(jpy, 105);
  assert.equal(out.currency, 'IDR');
  assert.equal(out.items[0].unit_price, 16800);
  const usd = { ...jpy, currency: 'USD', items: [{ id: 'a', name: 'Coffee', qty: 1, unit_price: 450, discount: 0 }] };
  assert.equal(convertToIdr(usd, 16000).items[0].unit_price, 72000);
});
