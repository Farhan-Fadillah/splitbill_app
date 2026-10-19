import { h, toast, todayIso, put } from '../util.js';
import { state, save, savedPayment, savePayment, clearSavedPayment, addHistory } from '../store.js';
import { api } from '../api.js';
import { paymentBlock } from '../paymentblock.js';
import { defaultBillName } from './summary.js';
import { stepper, banner, pageHead, stickyBar } from './common.js';

export const title = 'Info Pembayaran';
const BANKS = ['BCA', 'Mandiri', 'BNI', 'BRI', 'BSI', 'CIMB Niaga', 'Permata', 'Danamon', 'Jago', 'SeaBank', 'Blu by BCA', 'Lainnya'];
const WALLETS = ['GoPay', 'OVO', 'DANA', 'ShopeePay'];

export function buildPayload() {
  const ids = new Set(state.people.map((p) => p.id));
  const pay = state.payment;
  return {
    name: defaultBillName().slice(0, 80),
    date: state.receipts.find((r) => r.date)?.date || todayIso(),
    ownerId: state.ownerId,
    people: state.people.map((p) => ({ id: p.id, name: p.name })),
    roundStep: state.roundStep,
    receipts: state.receipts.map((r) => {
      const itemIds = new Set(r.items.map((i) => i.id));
      const assignments = {};
      for (const [iid, a] of Object.entries(r.assignments)) {
        if (!itemIds.has(iid)) continue;
        const shares = Object.fromEntries(Object.entries(a.shares).filter(([pid]) => ids.has(pid)));
        if (Object.keys(shares).length) assignments[iid] = { mode: a.mode, shares };
      }
      return {
        id: r.id, label: r.label,
        items: r.items.map((i) => ({ id: i.id, name: (i.name || '').trim() || 'Item', qty: i.qty, unit_price: i.unit_price, discount: i.discount || 0 })),
        charges: r.charges, modes: r.modes, assignments,
      };
    }),
    payment: {
      holder: pay.holder || '', bankName: pay.bankName || '', bankNumber: pay.bankNumber || '',
      ewallets: (pay.ewallets || []).filter((e) => e.number),
      qrisFile: pay.qrisFile || null,
    },
  };
}

export function render(root, { go }) {
  const p = state.payment;
  const stored = savedPayment();
  if (stored && !p.holder && !p.bankNumber && !p.ewallets?.length && !p.qrisFile) Object.assign(p, stored);
  if (!p.holder) p.holder = state.people.find((x) => x.id === state.ownerId)?.name || '';
  p.ewallets = p.ewallets || [];
  let remember = !!stored;
  let busy = false;

  const wrap = h('div', { class: 'narrow', style: 'margin:0 auto' });
  root.replaceChildren(wrap);
  const preview = h('div');
  const refreshPreview = () => preview.replaceChildren(paymentBlock(p));
  const touch = () => { state.created = null; save(); refreshPreview(); };

  const txt = (key, label, attrs = {}) => h('div', { class: 'field' }, h('label', null, label),
    h('input', { class: 'input', value: p[key] || '', maxlength: '60', onInput: (e) => { p[key] = e.target.value; touch(); }, ...attrs }));

  const bankList = h('datalist', { id: 'bank-list' }, BANKS.map((b) => h('option', { value: b })));
  const walletRows = WALLETS.map((type) => {
    const cur = p.ewallets.find((e) => e.type === type);
    return h('div', { class: 'field' }, h('label', null, `${type} (nomor HP)`),
      h('input', { class: 'input', inputmode: 'tel', maxlength: '30', value: cur?.number || '', placeholder: 'mis. 0812xxxxxxxx', onInput: (e) => {
        const v = e.target.value.trim();
        p.ewallets = p.ewallets.filter((x) => x.type !== type);
        if (v) p.ewallets.push({ type, number: v });
        touch();
      } }));
  });

  const qrisBox = h('div', { class: 'stack-sm' });
  const paintQris = () => {
    const url = p.qrisUrl || (p.qrisFile ? `/api/qris/${p.qrisFile}` : null);
    const input = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', class: 'sr-only', id: 'qris-file', onChange: async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      if (f.size > 2 * 1024 * 1024) return toast('Gambar QRIS maksimal 2MB');
      try { const r = await api.uploadQris(f); p.qrisFile = r.file; p.qrisUrl = r.url; touch(); paintQris(); toast('QRIS terunggah'); }
      catch (err) { toast(err.message); }
    } });
    put(qrisBox,
      h('div', { class: 'label' }, 'Gambar QRIS (opsional, maks 2MB)'),
      url ? h('img', { class: 'qris-img', src: url, alt: 'QRIS' }) : null,
      h('div', { class: 'row wrap' },
        h('label', { class: 'btn btn-secondary btn-sm', for: 'qris-file', style: 'cursor:pointer' }, url ? 'Ganti QRIS' : 'Unggah QRIS'),
        url ? h('button', { type: 'button', class: 'btn btn-danger-quiet btn-sm', onClick: () => { p.qrisFile = null; p.qrisUrl = null; touch(); paintQris(); } }, 'Hapus') : null),
      input);
  };
  paintQris();
  refreshPreview();

  const createBtn = h('button', { type: 'button', class: 'btn btn-primary', onClick: create }, 'Buat Tautan & Bagikan');

  async function create() {
    if (busy) return;
    const payload = buildPayload();
    const hash = JSON.stringify(payload);
    if (state.created?.hash === hash) return go('/share');
    busy = true; createBtn.disabled = true; createBtn.textContent = 'Membuat tautan...';
    try {
      const res = await api.createBill(payload);
      state.created = { ownerToken: res.ownerToken, publicToken: res.publicToken, hash, name: payload.name };
      addHistory({ ownerToken: res.ownerToken, publicToken: res.publicToken, name: payload.name, createdAt: Date.now() });
      if (remember) savePayment({ holder: p.holder, bankName: p.bankName, bankNumber: p.bankNumber, ewallets: p.ewallets, qrisFile: p.qrisFile, qrisUrl: p.qrisUrl });
      else clearSavedPayment();
      save();
      go('/share');
    } catch (e) {
      busy = false; createBtn.disabled = false; createBtn.textContent = 'Buat Tautan & Bagikan';
      toast(e.message);
    }
  }

  const hasAny = () => p.bankNumber || p.ewallets.length || p.qrisFile;
  wrap.replaceChildren(
    stepper('pay'),
    pageHead('Info Pembayaran', 'Supaya teman langsung tahu harus transfer ke mana. Boleh dilewati, tetapi sebaiknya diisi.'),
    h('div', { class: 'stack-lg' },
      h('div', { class: 'card stack' },
        txt('holder', 'Nama penagih', { placeholder: 'Nama penerima transfer' }),
        h('div', { class: 'grid-2', style: 'gap:var(--sp-md)' },
          h('div', { class: 'field' }, h('label', null, 'Bank'), h('input', { class: 'input', list: 'bank-list', maxlength: '40', value: p.bankName || '', placeholder: 'mis. BCA', onInput: (e) => { p.bankName = e.target.value; touch(); } })),
          txt('bankNumber', 'Nomor rekening', { inputmode: 'numeric', placeholder: 'mis. 8831092144' })),
        bankList,
        h('div', { class: 'grid-2', style: 'gap:var(--sp-md)' }, walletRows),
        qrisBox,
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: remember, onChange: (e) => { remember = e.target.checked; } }), 'Simpan untuk tagihan berikutnya (di perangkat ini)')),
      h('div', { class: 'stack-sm' }, h('div', { class: 't-sm' }, 'Tampilan di halaman teman'), preview),
      banner('info', 'Teman membuka tautan tanpa login, memilih namanya, dan hanya melihat bagiannya sendiri.')),
    stickyBar(h('span', { class: 't-body-sm muted' }, hasAny() ? 'Info pembayaran terisi' : 'Belum ada info pembayaran'), createBtn));
}
