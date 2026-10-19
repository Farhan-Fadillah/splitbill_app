// Modul hitung pembagian tagihan. MURNI (tanpa DOM, tanpa I/O) supaya bisa dites
// dan dipakai di browser maupun server. Semua uang berupa integer rupiah.

export const CHARGE_KEYS = ['discount', 'service_charge', 'tax', 'delivery_fee', 'platform_fee', 'tip', 'rounding'];

export const CHARGE_LABELS = {
  discount: 'Diskon / Voucher',
  service_charge: 'Service Charge',
  tax: 'PB1 / Pajak',
  delivery_fee: 'Ongkir',
  platform_fee: 'Biaya Platform / Kemasan',
  tip: 'Tip',
  rounding: 'Pembulatan Struk',
};

// 'proportional' = dibagi sesuai nilai pesanan tiap orang, 'equal' = rata
export const DEFAULT_MODES = {
  discount: 'proportional',
  service_charge: 'proportional',
  tax: 'proportional',
  delivery_fee: 'equal',
  platform_fee: 'equal',
  tip: 'proportional',
  rounding: 'equal',
};

export const ROUND_STEPS = [0, 100, 500, 1000];

export const lineTotal = (item) => (item.qty || 0) * (item.unit_price || 0) - (item.discount || 0);

export const receiptSubtotal = (items) => items.reduce((s, it) => s + lineTotal(it), 0);

/** Nilai bersih tiap biaya: diskon bernilai negatif. */
export const signedCharge = (key, amount) => (key === 'discount' ? -Math.abs(amount || 0) : amount || 0);

export function receiptTotal(receipt) {
  const c = receipt.charges || {};
  let total = receiptSubtotal(receipt.items || []);
  for (const k of CHARGE_KEYS) total += signedCharge(k, c[k]);
  return total;
}

/**
 * Bagi `amount` (integer, boleh negatif) menurut `weights` dengan metode largest remainder.
 * Jumlah hasil SELALU persis sama dengan amount.
 */
export function allocate(amount, weights) {
  const n = weights.length;
  if (n === 0) return [];
  const sign = amount < 0 ? -1 : 1;
  const a = Math.abs(Math.round(amount));
  let w = weights.map((x) => (Number.isFinite(x) && x > 0 ? x : 0));
  let totalW = w.reduce((s, x) => s + x, 0);
  if (totalW <= 0) { w = weights.map(() => 1); totalW = n; }

  const raw = w.map((x) => (a * x) / totalW);
  const floors = raw.map(Math.floor);
  let remainder = a - floors.reduce((s, x) => s + x, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((p, q) => q.frac - p.frac || p.i - q.i);
  for (let k = 0; remainder > 0 && k < order.length; k++, remainder--) floors[order[k].i] += 1;
  return floors.map((x) => sign * x);
}

/** Validasi satu penugasan item. */
export function validateAssignment(a) {
  if (!a || !a.shares) return { ok: true };
  const entries = Object.entries(a.shares).filter(([, v]) => v !== undefined && v !== null);
  if (entries.length === 0) return { ok: false, message: 'Pilih minimal satu orang' };
  if (a.mode === 'percent') {
    const sum = entries.reduce((s, [, v]) => s + (Number(v) || 0), 0);
    if (Math.abs(sum - 100) > 0.01) return { ok: false, message: `Total persentase ${round2(sum)}%, harus 100%` };
  }
  if (a.mode === 'portion') {
    if (entries.some(([, v]) => !(Number(v) > 0))) return { ok: false, message: 'Porsi harus lebih dari 0' };
  }
  return { ok: true };
}

const round2 = (n) => Math.round(n * 100) / 100;

function weightsFor(assignment, peopleIds) {
  if (!assignment || !assignment.shares) return null;
  const ids = Object.keys(assignment.shares).filter((id) => peopleIds.includes(id));
  if (ids.length === 0) return null;
  const mode = assignment.mode || 'equal';
  const weights = ids.map((id) => (mode === 'equal' ? 1 : Number(assignment.shares[id]) || 0));
  if (weights.every((x) => x <= 0)) return null;
  return { ids, weights };
}

/**
 * Hitung pembagian satu struk (tanpa pembulatan pembayaran).
 * receipt: { id, label, items:[{id,name,qty,unit_price,discount}], charges:{...}, modes:{...} }
 * assignments: { [itemId]: { mode:'equal'|'portion'|'percent', shares:{[personId]: number} } }
 * Item tanpa penugasan dibagi rata ke semua orang.
 */
export function computeReceipt(receipt, people, assignments = {}) {
  const ids = people.map((p) => p.id);
  const out = new Map(people.map((p) => [p.id, { id: p.id, name: p.name, items: [], fees: {}, itemsTotal: 0, feesTotal: 0, total: 0 }]));
  if (people.length === 0) return { people: [], subtotal: 0, grandTotal: 0 };

  const modes = { ...DEFAULT_MODES, ...(receipt.modes || {}) };
  const items = receipt.items || [];

  for (const item of items) {
    const cost = lineTotal(item);
    const w = weightsFor(assignments[item.id], ids) || { ids, weights: ids.map(() => 1) };
    const parts = allocate(cost, w.weights);
    w.ids.forEach((pid, idx) => {
      const p = out.get(pid);
      p.items.push({ receipt: receipt.label || '', itemId: item.id, name: item.name, amount: parts[idx] });
      p.itemsTotal += parts[idx];
    });
  }

  const subtotal = receiptSubtotal(items);
  const charges = receipt.charges || {};
  for (const key of CHARGE_KEYS) {
    const signed = signedCharge(key, charges[key]);
    if (!signed) continue;
    const weights = modes[key] === 'proportional' ? ids.map((id) => Math.max(out.get(id).itemsTotal, 0)) : ids.map(() => 1);
    const parts = allocate(signed, weights);
    ids.forEach((pid, idx) => {
      const p = out.get(pid);
      p.fees[key] = (p.fees[key] || 0) + parts[idx];
      p.feesTotal += parts[idx];
    });
  }

  let grandTotal = 0;
  for (const p of out.values()) { p.total = p.itemsTotal + p.feesTotal; grandTotal += p.total; }
  return { people: [...out.values()], subtotal, grandTotal };
}

/**
 * Pembulatan nominal transfer. Orang selain penagih dibulatkan ke kelipatan `step`
 * (terdekat), selisihnya ditanggung penagih sehingga total keseluruhan tetap persis.
 * Jika hasil untuk penagih menjadi negatif, pembulatan dibatalkan.
 */
export function applyRounding(result, step, ownerId) {
  const people = result.people.map((p) => ({ ...p, payTotal: p.total, roundingAdjust: 0 }));
  if (!step || step <= 1 || !people.some((p) => p.id === ownerId)) return { ...result, people };
  const rounded = people.map((p) => (p.id === ownerId ? p : { ...p, payTotal: Math.round(p.total / step) * step }));
  const others = rounded.filter((p) => p.id !== ownerId).reduce((s, p) => s + p.payTotal, 0);
  const ownerPay = result.grandTotal - others;
  if (ownerPay < 0) return { ...result, people };
  const final = rounded.map((p) => {
    const payTotal = p.id === ownerId ? ownerPay : p.payTotal;
    return { ...p, payTotal, roundingAdjust: payTotal - p.total };
  });
  return { ...result, people: final };
}

/** Gabungkan hasil beberapa struk (belum dibulatkan) menjadi satu tagihan per orang. */
export function mergeResults(results, people) {
  const merged = new Map(people.map((p) => [p.id, { id: p.id, name: p.name, items: [], fees: {}, itemsTotal: 0, feesTotal: 0, total: 0 }]));
  let grandTotal = 0;
  let subtotal = 0;
  for (const r of results) {
    subtotal += r.subtotal;
    grandTotal += r.grandTotal;
    for (const p of r.people) {
      const m = merged.get(p.id);
      if (!m) continue;
      m.items.push(...p.items);
      for (const [k, v] of Object.entries(p.fees)) m.fees[k] = (m.fees[k] || 0) + v;
      m.itemsTotal += p.itemsTotal;
      m.feesTotal += p.feesTotal;
      m.total += p.total;
    }
  }
  return { people: [...merged.values()], subtotal, grandTotal };
}

/**
 * Hitung seluruh sesi: tiap struk + gabungan, lengkap dengan pembulatan.
 * receipts: [{ id,label,items,charges,modes,assignments }]
 */
export function computeSession({ receipts, people, ownerId, roundStep = 0 }) {
  const raw = receipts.map((r) => computeReceipt(r, people, r.assignments || {}));
  const perReceipt = raw.map((r) => applyRounding(r, roundStep, ownerId));
  const combined = applyRounding(mergeResults(raw, people), roundStep, ownerId);
  return { perReceipt, combined };
}

/** Konversi struk mata uang asing ke rupiah dengan kurs manual dari pengguna. */
const ZERO_DECIMAL = new Set(['IDR', 'JPY', 'KRW', 'VND']);
export const minorUnitFactor = (code) => (ZERO_DECIMAL.has(String(code).toUpperCase()) ? 1 : 100);

export function convertToIdr(data, rate) {
  const factor = minorUnitFactor(data.currency);
  const conv = (n) => Math.round(((n || 0) / factor) * rate);
  const items = data.items.map((it) => {
    const unit = conv(it.unit_price);
    const discount = conv(it.discount);
    return { ...it, unit_price: unit, discount, line_total: it.qty * unit - discount };
  });
  const out = { ...data, currency: 'IDR', items, original_currency: data.currency, rate };
  for (const k of CHARGE_KEYS) out[k] = conv(data[k]);
  out.subtotal = receiptSubtotal(items);
  out.total = receiptTotal({ items, charges: out });
  return out;
}

export const initials = (name = '') => {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
};
