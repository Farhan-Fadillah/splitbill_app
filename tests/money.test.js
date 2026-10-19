import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAmount } from '../server/lib/money.js';

const cases = [
  ['1.250.000', 1250000], ['1,250,000', 1250000], ['12.500,00', 12500], ['12,500.00', 12500],
  ['12500', 12500], ['15.000', 15000], ['Rp 15.000', 15000], ['Rp.15.000,-', 15000], ['IDR 1.531.800', 1531800],
  ['12.5k', 12500], ['12,5rb', 12500], ['25rb', 25000], ['12rb', 12000], ['-1.000', -1000], ['(1.000)', -1000],
  [12500, 12500], [null, 0], ['', 0], ['7,50', 8], ['1.5jt', 1500000],
];
for (const [input, expected] of cases) {
  test(`parseAmount(${JSON.stringify(input)}) = ${expected}`, () => assert.equal(parseAmount(input), expected));
}
test('float murni ditolak, sampah menjadi NaN', () => {
  assert.ok(Number.isNaN(parseAmount(12500.5)));
  assert.ok(Number.isNaN(parseAmount('abc')));
  assert.ok(Number.isNaN(parseAmount({})));
});
