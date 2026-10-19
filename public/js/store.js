import { uid } from './util.js';
import { DEFAULT_MODES, CHARGE_KEYS, computeSession, convertToIdr, receiptTotal, receiptSubtotal } from './split.js';

const KEY = 'sb_session_v1';
export const photos = new Map(); // receiptId -> objectURL (hanya di memori, tidak disimpan)

const fresh = () => ({
  v: 1, receipts: [], active: 0,
  people: [{ id: 'owner', name: 'Saya' }], ownerId: 'owner',
  roundStep: 0, billName: '',
  payment: { holder: '', bankName: '', bankNumber: '', ewallets: [], qrisFile: null, qrisUrl: null },
  created: null,
});

function load() {
  try {
    const s = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    if (s && s.v === 1) return { ...fresh(), ...s };
  } catch { /* */ }
  return fresh();
}

export let state = load();

export function save() {
  try { sessionStorage.setItem(KEY, JSON.stringify(state)); } catch { /* penyimpanan penuh/diblokir */ }
}

export function resetSession() {
  photos.forEach((u) => URL.revokeObjectURL(u));
  photos.clear();
  const keepPay = state.payment;
  state = fresh();
  state.payment = keepPay;
  save();
}

export const activeReceipt = () => state.receipts[state.active] || null;
export const owner = () => state.people.find((p) => p.id === state.ownerId);

function baseCharges() {
  return Object.fromEntries(CHARGE_KEYS.map((k) => [k, 0]));
}

export function manualReceipt() {
  return {
    id: uid('r'), label: `Struk ${state.receipts.length + 1}`, merchant: '', date: null, currency: 'IDR',
    items: [], charges: baseCharges(), modes: { ...DEFAULT_MODES }, assignments: {},
    meta: { source: 'manual', engine: null, warnings: [], quality: {}, reconciled: true, scannedTotal: null },
  };
}

export function receiptFromScan(d) {
  const r = manualReceipt();
  r.merchant = d.merchant || '';
  r.date = d.date || null;
  r.currency = d.currency || 'IDR';
  r.items = d.items.map((it) => ({
    id: uid('i'), name: it.name, qty: it.qty, unit_price: it.unit_price, discount: it.discount || 0,
    confidence: it.confidence ?? 0.8, needs_review: !!it.needs_review,
  }));
  for (const k of CHARGE_KEYS) r.charges[k] = d[k] || 0;
  r.meta = {
    source: 'scan', engine: d.engine, warnings: d.warnings || [], quality: d.quality || {}, reconciled: !!d.reconciled,
    scannedTotal: d.total, scannedSubtotal: d.subtotal, receiptType: d.receipt_type, ms: d.ms,
  };
  return r;
}

export function addReceipt(r) {
  state.receipts.push(r);
  state.active = state.receipts.length - 1;
  state.created = null;
  save();
  return r;
}

export function removeReceipt(index) {
  const [r] = state.receipts.splice(index, 1);
  if (r) { const u = photos.get(r.id); if (u) URL.revokeObjectURL(u); photos.delete(r.id); }
  state.receipts.forEach((x, i) => { if (/^Struk \d+$/.test(x.label)) x.label = `Struk ${i + 1}`; });
  state.active = Math.max(0, Math.min(state.active, state.receipts.length - 1));
  state.created = null;
  save();
}

/** Terapkan kurs manual untuk struk mata uang asing: semua nominal menjadi rupiah (integer). */
export function applyRate(receipt, rate) {
  const flat = { currency: receipt.currency, items: receipt.items, ...receipt.charges };
  const out = convertToIdr(flat, rate);
  receipt.items = out.items;
  for (const k of CHARGE_KEYS) receipt.charges[k] = out[k];
  receipt.meta.original_currency = receipt.currency;
  receipt.meta.rate = rate;
  receipt.currency = 'IDR';
  receipt.meta.scannedTotal = null;
  receipt.meta.warnings = receipt.meta.warnings.filter((w) => !/Struk dalam|sen\b/i.test(w));
  save();
}

export const toSplit = (r) => ({ id: r.id, label: r.label, items: r.items, charges: r.charges, modes: r.modes, assignments: r.assignments });
export const totals = (r) => ({ subtotal: receiptSubtotal(r.items), total: receiptTotal(toSplit(r)) });

export function computeAll() {
  return computeSession({ receipts: state.receipts.map(toSplit), people: state.people, ownerId: state.ownerId, roundStep: state.roundStep });
}

export function addPerson(name) {
  const p = { id: uid('p'), name: name.trim().slice(0, 40) };
  state.people.push(p);
  state.created = null;
  save();
  return p;
}

export function removePerson(id) {
  if (id === state.ownerId) return;
  state.people = state.people.filter((p) => p.id !== id);
  for (const r of state.receipts) {
    for (const [itemId, a] of Object.entries(r.assignments)) {
      delete a.shares[id];
      if (Object.keys(a.shares).length === 0) delete r.assignments[itemId];
    }
  }
  state.created = null;
  save();
}

// ---------- localStorage: teman, info pembayaran, riwayat ----------
const ls = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* */ } },
};

export const savedFriends = () => ls.get('sb_friends', []);
export function addSavedFriend(name) {
  const list = savedFriends();
  if (!list.some((n) => n.toLowerCase() === name.toLowerCase())) { list.push(name); ls.set('sb_friends', list.slice(-40)); }
}
export function removeSavedFriend(name) { ls.set('sb_friends', savedFriends().filter((n) => n !== name)); }

export const savedPayment = () => ls.get('sb_payment', null);
export const savePayment = (p) => ls.set('sb_payment', p);
export const clearSavedPayment = () => { try { localStorage.removeItem('sb_payment'); } catch { /* */ } };

export const billHistory = () => ls.get('sb_bills', []);
export function addHistory(entry) {
  const list = billHistory().filter((b) => b.ownerToken !== entry.ownerToken);
  list.unshift(entry);
  ls.set('sb_bills', list.slice(0, 100));
}
export function removeHistory(ownerToken) { ls.set('sb_bills', billHistory().filter((b) => b.ownerToken !== ownerToken)); }
