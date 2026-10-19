import { h, rp, parseRp, fmtNum, uid, toast, put, add } from '../util.js';
import { state, save, photos, activeReceipt, removeReceipt, applyRate, toSplit, totals } from '../store.js';
import { CHARGE_KEYS, CHARGE_LABELS, lineTotal, receiptTotal, minorUnitFactor } from '../split.js';
import { api } from '../api.js';
import { stepper, receiptTabs, banner, pageHead, stickyBar } from './common.js';

export const title = 'Koreksi Struk';
const ENGINE = { claude: 'Claude', mistral: 'Mistral', 'claude+mistral': 'Claude + Mistral' };

export function render(root, { go }) {
  const wrap = h('div');
  root.replaceChildren(wrap);

  const draw = () => {
    const r = activeReceipt();
    if (!r) return go('/scan');
    wrap.replaceChildren(
      stepper('review'),
      receiptTabs({ current: state.active, onSelect: (i) => { state.active = i; save(); draw(); } }),
      h('div', { style: 'height:var(--sp-md)' }),
      r.currency !== 'IDR' ? foreignView(r, draw) : editor(r, go, draw));
  };
  draw();
}

// ---------------------------------------------------------------- mata uang asing
function foreignView(r, redraw) {
  const code = r.currency;
  const factor = minorUnitFactor(code);
  const fmt = (n) => new Intl.NumberFormat('id-ID', { minimumFractionDigits: factor === 100 ? 2 : 0, maximumFractionDigits: factor === 100 ? 2 : 0 }).format((n || 0) / factor) + ' ' + code;
  const rate = h('input', { class: 'input num-in', inputmode: 'decimal', placeholder: 'mis. 16500', 'aria-label': `Kurs 1 ${code} ke rupiah` });
  const apply = () => {
    const v = parseFloat(String(rate.value).replace(/\./g, '').replace(',', '.'));
    if (!(v > 0)) return toast('Isi kurs dengan angka lebih dari 0');
    applyRate(r, v);
    toast('Nominal dikonversi ke rupiah');
    redraw();
  };
  const sub = r.items.reduce((s, it) => s + lineTotal(it), 0);
  return h('div', { class: 'stack-lg' },
    pageHead('Struk Mata Uang Asing', `Struk ini dalam ${code}. Isi kurs supaya nominal dikonversi ke rupiah.`),
    banner('warn', `Konversi memakai kurs yang kamu isi sendiri, bukan kurs otomatis. Nominal di bawah ini masih dalam ${code}.`),
    h('div', { class: 'card stack' },
      h('div', { class: 't-sm' }, r.merchant || 'Struk'),
      r.items.map((it) => h('div', { class: 'line' }, h('span', null, `${it.qty}x ${it.name}`), h('span', null, fmt(lineTotal(it))))),
      h('hr', { class: 'divider' }),
      h('div', { class: 'line' }, h('span', null, 'Subtotal'), h('span', null, fmt(sub))),
      CHARGE_KEYS.filter((k) => r.charges[k]).map((k) => h('div', { class: 'line fee' }, h('span', null, CHARGE_LABELS[k]), h('span', null, (k === 'discount' ? '-' : '') + fmt(Math.abs(r.charges[k]))))),
      h('div', { class: 'row', style: 'align-items:flex-end;gap:var(--sp-md);flex-wrap:wrap' },
        h('div', { class: 'field grow' }, h('label', null, `Kurs: 1 ${code} = Rp`), rate),
        h('button', { type: 'button', class: 'btn btn-primary', onClick: apply }, 'Terapkan Kurs'))),
    h('div', { class: 'row wrap' },
      h('button', { type: 'button', class: 'btn btn-secondary', onClick: () => { removeReceipt(state.active); location.hash = state.receipts.length ? '#/review' : '#/scan'; } }, 'Hapus Struk Ini')));
}

// ---------------------------------------------------------------- editor utama
function editor(r, go, redraw) {
  const split = () => toSplit(r);
  const photoUrl = photos.get(r.id);
  const foot = { total: h('span', { class: 'num t-sm' }), hint: h('span', { class: 't-body-sm muted' }) };
  const summaryBox = h('div', { class: 'card stack-sm' });
  const mismatchBox = h('div');
  const nextBtn = h('button', { type: 'button', class: 'btn btn-primary', onClick: () => go('/assign') }, 'Lanjut Atur Pembagian');

  function refresh() {
    const t = receiptTotal(split());
    const sub = r.items.reduce((s, it) => s + lineTotal(it), 0);
    put(summaryBox,
      h('div', { class: 't-sm' }, 'Ringkasan Struk'),
      h('div', { class: 'sum-row' }, h('span', { class: 'muted' }, 'Subtotal item'), h('span', { class: 'num' }, rp(sub))),
      CHARGE_KEYS.filter((k) => r.charges[k]).map((k) => h('div', { class: 'sum-row' },
        h('span', { class: 'muted' }, `${CHARGE_LABELS[k]} (${r.modes[k] === 'equal' ? 'rata' : 'proporsional'})`),
        h('span', { class: 'num' }, (k === 'discount' ? '-' : '') + rp(Math.abs(r.charges[k]))))),
      h('div', { class: 'sum-row big' }, h('span', null, 'Total dihitung'), h('span', { class: 'num', style: 'color:var(--primary)' }, rp(t))));

    const scanned = r.meta.scannedTotal;
    mismatchBox.replaceChildren();
    if (scanned && scanned !== t) {
      mismatchBox.append(banner('warn', `Total di struk ${rp(scanned)}, sedangkan hasil hitungan ${rp(t)} (selisih ${rp(Math.abs(t - scanned))}). Periksa angka di atas, atau abaikan jika kamu memang sudah mengubahnya.`));
    } else if (scanned && scanned === t && r.meta.source === 'scan') {
      mismatchBox.append(banner('ok', `Total cocok dengan struk (${rp(scanned)}).`));
    }
    foot.total.textContent = rp(t);
    const ok = r.items.length > 0 && t > 0;
    nextBtn.disabled = !ok;
    foot.hint.textContent = r.items.length === 0 ? 'Tambahkan minimal satu item' : t <= 0 ? 'Total harus lebih dari Rp 0' : `${r.items.length} item`;
    save();
  }

  // ----- baris item -----
  const itemsBox = h('div');
  function itemRow(it) {
    const total = h('div', { class: 'total-cell', 'aria-live': 'polite' }, rp(lineTotal(it)));
    const badge = h('span', { class: 'badge badge-warn' }, 'Cek ulang');
    const row = h('div', { class: `item-row${it.needs_review ? ' warn' : ''}` });
    const reviewed = () => { if (it.needs_review) { it.needs_review = false; row.classList.remove('warn'); badge.remove(); } };
    const upd = () => { total.textContent = rp(lineTotal(it)); reviewed(); refresh(); };

    const name = h('input', { class: 'input', value: it.name, 'aria-label': 'Nama item', maxlength: '120', onInput: (e) => { it.name = e.target.value; reviewed(); save(); } });
    const qty = h('input', { class: 'input num-in', type: 'number', min: '1', max: '999', inputmode: 'numeric', value: it.qty, 'aria-label': 'Jumlah', onInput: (e) => { it.qty = Math.max(1, Math.min(999, parseInt(e.target.value, 10) || 1)); upd(); } });
    const money = (key, label) => {
      const el = h('input', { class: 'input num-in', inputmode: 'numeric', value: fmtNum(it[key]), 'aria-label': label, onInput: (e) => { it[key] = Math.max(0, parseRp(e.target.value)); upd(); }, onBlur: (e) => { e.target.value = fmtNum(it[key]); } });
      return el;
    };
    const del = h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Hapus item ${it.name || ''}`, title: 'Hapus item', onClick: () => {
      const i = r.items.indexOf(it);
      if (i >= 0) r.items.splice(i, 1);
      delete r.assignments[it.id];
      row.remove(); refresh();
      if (r.items.length === 0) renderEmpty();
    } }, '×');

    add(row,
      h('div', { class: 'item-top' }, h('div', { class: 'field grow' }, h('label', null, 'Nama item'), name), del),
      h('div', { class: 'item-nums' },
        h('div', { class: 'field' }, h('label', null, 'Qty'), qty),
        h('div', { class: 'field' }, h('label', null, 'Harga satuan'), money('unit_price', 'Harga satuan')),
        h('div', { class: 'field' }, h('label', null, 'Potongan'), money('discount', 'Potongan item')),
        h('div', { class: 'field total-cell-wrap' }, h('label', null, 'Total'), total)),
      it.needs_review ? h('div', null, badge, ' ', h('span', { class: 't-body-sm' }, 'Angka ini kurang jelas terbaca. Cocokkan dengan foto.')) : null);
    return row;
  }
  const renderEmpty = () => {
    if (r.items.length === 0) itemsBox.replaceChildren(h('div', { class: 'empty' }, h('div', { class: 't-sm' }, 'Belum ada item'), h('p', null, r.meta.source === 'scan' ? 'Tidak ada item yang terbaca. Tambahkan item secara manual sambil melihat foto.' : 'Mulai dengan menambahkan item dari struk.')));
  };
  const addItem = () => {
    const it = { id: uid('i'), name: '', qty: 1, unit_price: 0, discount: 0, confidence: 1, needs_review: false };
    r.items.push(it);
    if (r.items.length === 1) itemsBox.replaceChildren();
    const row = itemRow(it);
    itemsBox.append(row);
    refresh();
    row.querySelector('input')?.focus();
  };
  if (r.items.length) r.items.forEach((it) => itemsBox.append(itemRow(it))); else renderEmpty();

  // ----- biaya tambahan -----
  const chargeRow = (key) => {
    const input = h('input', {
      class: 'input num-in', inputmode: 'numeric', value: fmtNum(r.charges[key]), 'aria-label': CHARGE_LABELS[key],
      onInput: (e) => { const v = parseRp(e.target.value); r.charges[key] = key === 'rounding' ? v : Math.max(0, v); refresh(); },
      onBlur: (e) => { e.target.value = fmtNum(r.charges[key]); },
    });
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': `Cara bagi ${CHARGE_LABELS[key]}` });
    const paint = () => seg.replaceChildren(
      ...[['proportional', 'Proporsional'], ['equal', 'Rata']].map(([m, label]) =>
        h('button', { type: 'button', 'aria-pressed': String(r.modes[key] === m), onClick: () => { r.modes[key] = m; paint(); refresh(); } }, label)));
    paint();
    return h('div', { class: 'charge-row' }, h('label', { class: 't-label-lg' }, CHARGE_LABELS[key]), input, seg);
  };

  // ----- panel foto -----
  let zoom = 1;
  const img = photoUrl ? h('img', { src: photoUrl, alt: 'Foto struk asli', style: 'width:100%' }) : null;
  const setZoom = (z) => { zoom = Math.max(1, Math.min(4, z)); img.style.width = `${zoom * 100}%`; };
  const photoPane = photoUrl
    ? h('details', { class: 'photo-pane card-flat', open: matchMedia('(min-width: 1001px)').matches },
      h('summary', { class: 't-label-lg', style: 'cursor:pointer;min-height:2.75rem;display:flex;align-items:center' }, 'Foto struk asli'),
      h('div', { class: 'photo-scroll' }, img),
      h('div', { class: 'row wrap', style: 'margin-top:var(--sp-sm)' },
        h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onClick: () => setZoom(zoom - 0.5) }, 'Perkecil'),
        h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onClick: () => setZoom(zoom + 0.5) }, 'Perbesar'),
        h('button', { type: 'button', class: 'btn btn-quiet btn-sm', onClick: () => setZoom(1) }, 'Reset')),
      h('p', { class: 't-body-sm muted', style: 'margin-top:var(--sp-xs)' }, 'Cubit layar untuk memperbesar, geser untuk melihat bagian lain.'))
    : r.meta.source === 'scan'
      ? h('div', { class: 'photo-pane panel t-body-sm muted' }, 'Foto tidak tersedia setelah halaman dimuat ulang.')
      : null;

  // ----- peringatan -----
  const warns = (r.meta.warnings || []).filter(Boolean);
  const q = r.meta.quality || {};
  const qualityNotes = [q.blur && 'Foto agak buram', q.dark && 'Foto gelap', q.cropped && 'Struk terpotong', q.handwritten && 'Tulisan tangan'].filter(Boolean);
  const warnBanner = warns.length || qualityNotes.length
    ? banner('warn', h('div', null, h('strong', null, 'Periksa hasil scan'), h('ul', null, [...warns, ...qualityNotes.filter((n) => !warns.includes(n))].map((w) => h('li', null, w)))))
    : null;

  const report = async () => {
    if (!confirm('Kirim data hasil baca (tanpa foto) untuk membantu memperbaiki akurasi?')) return;
    try { await api.report('hasil scan salah', { engine: r.meta.engine, type: r.meta.receiptType, items: r.items.map(({ name, qty, unit_price, discount }) => ({ name, qty, unit_price, discount })), charges: r.charges, scannedTotal: r.meta.scannedTotal }); toast('Terima kasih, laporan terkirim'); }
    catch (e) { toast(e.message); }
  };

  refresh();
  return h('div', { class: 'stack-lg' },
    pageHead('Cek & Koreksi', r.meta.source === 'scan' ? 'Pastikan item dan harga sudah sesuai struk. Ketuk kolom untuk mengubah.' : 'Masukkan item dari struk. Kamu bisa menambah dan menghapus baris.'),
    warnBanner,
    r.meta.source === 'scan' && r.meta.engine
      ? h('p', { class: 't-body-sm muted' }, `Dibaca oleh ${ENGINE[r.meta.engine] || r.meta.engine}${r.meta.ms ? ` dalam ${(r.meta.ms / 1000).toFixed(1)} dtk` : ''}. `, h('button', { type: 'button', class: 'link', style: 'min-height:2rem', onClick: report }, 'Laporkan hasil yang salah')) : null,
    h('div', { class: 'review-grid' },
      photoPane || h('div'),
      h('div', { class: 'stack-lg' },
        h('div', { class: 'card stack' },
          h('div', { class: 'grid-2', style: 'gap:var(--sp-md)' },
            h('div', { class: 'field' }, h('label', null, 'Nama tempat'), h('input', { class: 'input', value: r.merchant, maxlength: '80', placeholder: 'mis. Warung Makan Sedap', onInput: (e) => { r.merchant = e.target.value; save(); } })),
            h('div', { class: 'field' }, h('label', null, 'Tanggal'), h('input', { class: 'input', type: 'date', value: r.date || '', onInput: (e) => { r.date = e.target.value || null; save(); } }))),
          h('div', { class: 't-sm' }, 'Item'),
          itemsBox,
          h('button', { type: 'button', class: 'btn btn-secondary', onClick: addItem }, 'Tambah Item')),
        h('div', { class: 'card stack-sm' },
          h('div', { class: 't-sm' }, 'Biaya Tambahan'),
          h('p', { class: 't-body-sm muted' }, 'Proporsional: dibagi sesuai nilai pesanan tiap orang. Rata: sama besar untuk semua orang. Diskon diisi sebagai angka positif.'),
          CHARGE_KEYS.map(chargeRow)),
        mismatchBox,
        summaryBox,
        state.receipts.length > 1 ? h('div', null, h('button', { type: 'button', class: 'btn btn-danger-quiet', onClick: () => { if (confirm(`Hapus ${r.label}?`)) { removeReceipt(state.active); location.hash = '#/review'; } } }, `Hapus ${r.label}`)) : null)),
    stickyBar(h('div', { class: 'stack-sm', style: 'gap:0' }, foot.total, foot.hint), nextBtn));
}
