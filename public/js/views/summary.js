import { h, rp, fmtDate, todayIso, toast, loadScript, downloadBlob } from '../util.js';
import { state, save, computeAll, totals } from '../store.js';
import { CHARGE_LABELS, CHARGE_KEYS, initials } from '../split.js';
import { stepper, receiptTabs, banner, pageHead, stickyBar } from './common.js';

export const title = 'Ringkasan';

export const defaultBillName = () => {
  const first = state.receipts.find((r) => r.merchant);
  return state.billName || (first ? first.merchant : `Tagihan ${fmtDate(todayIso())}`);
};

export function render(root, { go }) {
  const wrap = h('div');
  root.replaceChildren(wrap);
  let current = state.receipts.length > 1 && state.active >= state.receipts.length ? 'all' : Math.min(state.active, state.receipts.length - 1);

  function personCard(p, isOwner, combined) {
    const itemLines = p.items.map((it) => h('div', { class: 'line' }, h('span', null, combined && state.receipts.length > 1 && it.receipt ? `${it.receipt} · ${it.name}` : it.name || '(tanpa nama)'), h('span', null, rp(it.amount))));
    const feeLines = CHARGE_KEYS.filter((k) => p.fees[k]).map((k) => h('div', { class: 'line fee' }, h('span', null, CHARGE_LABELS[k]), h('span', null, rp(p.fees[k]))));
    return h('article', { class: 'person-card' },
      h('div', { class: 'row-between' },
        h('div', { class: 'row' }, h('span', { class: 'avatar' }, initials(p.name)), h('span', { class: 't-sm' }, p.name)),
        isOwner ? h('span', { class: 'badge badge-neutral' }, 'Penagih') : null),
      h('div', { class: 'lines' },
        itemLines.length ? itemLines : h('span', { class: 't-body-sm muted' }, 'Tidak ada item'),
        feeLines,
        p.roundingAdjust ? h('div', { class: 'line fee' }, h('span', null, 'Penyesuaian pembulatan'), h('span', null, rp(p.roundingAdjust))) : null),
      h('div', { class: 'total-line' }, h('span', null, 'Total'), h('span', { style: 'color:var(--primary)' }, rp(p.payTotal))));
  }

  function draw() {
    const session = computeAll();
    const res = current === 'all' ? session.combined : session.perReceipt[current];
    const nameInput = h('input', { class: 'input', value: defaultBillName(), maxlength: '80', 'aria-label': 'Nama tagihan', onInput: (e) => { state.billName = e.target.value; state.created = null; save(); } });
    const bad = state.receipts.some((r) => totals(r).total <= 0);
    const exportArea = h('div', { class: 'export-sheet stack', id: 'export-area' },
      h('div', { class: 'row-between wrap' },
        h('div', null, h('div', { class: 't-md' }, defaultBillName()), h('div', { class: 't-body-sm muted' }, [fmtDate(state.receipts[0]?.date) || fmtDate(todayIso()), `${state.people.length} orang`, current === 'all' ? 'Gabungan semua struk' : state.receipts[current].label].join(' · '))),
        h('div', { class: 'right' }, h('div', { class: 't-label-sm muted' }, 'TOTAL TAGIHAN'), h('div', { class: 't-md num' }, rp(res.grandTotal)))),
      h('div', { class: 'cards-grid' }, res.people.map((p) => personCard(p, p.id === state.ownerId, current === 'all'))),
      h('div', { class: 't-body-sm muted', style: 'text-align:center' }, 'Dihitung dengan SplitBill'));

    wrap.replaceChildren(
      stepper('summary'),
      receiptTabs({ combined: true, current, onSelect: (i) => { current = i; if (i !== 'all') { state.active = i; save(); } draw(); } }),
      h('div', { style: 'height:var(--sp-md)' }),
      pageHead('Ringkasan per Orang', 'Cek bagian tiap orang sebelum dibagikan.'),
      h('div', { class: 'stack-lg' },
        h('div', { class: 'card field' }, h('label', null, 'Nama tagihan'), nameInput),
        bad ? banner('err', 'Ada struk dengan total Rp 0. Kembali ke langkah Koreksi untuk memperbaikinya.') : null,
        exportArea,
        h('div', { class: 'row wrap' },
          h('button', { type: 'button', class: 'btn btn-secondary', onClick: (e) => exportImage(e.currentTarget) }, 'Simpan sebagai Gambar'),
          h('button', { type: 'button', class: 'btn btn-secondary', onClick: (e) => exportPdf(e.currentTarget) }, 'Unduh PDF'))),
      stickyBar(h('span', { class: 'num t-sm' }, rp(res.grandTotal)), h('button', { type: 'button', class: 'btn btn-primary', disabled: bad, onClick: () => go('/pay') }, 'Lanjut: Info Pembayaran')));
  }
  draw();
}

async function renderCanvas() {
  await loadScript('/vendor/html2canvas.js');
  const el = document.getElementById('export-area');
  return window.html2canvas(el, { scale: 2, backgroundColor: getComputedStyle(document.body).backgroundColor, useCORS: true });
}

async function withBusy(btn, label, fn) {
  const old = btn.textContent;
  btn.disabled = true; btn.textContent = label;
  try { await fn(); } catch (e) { toast('Gagal membuat file. Coba lagi.'); console.error(e); }
  btn.disabled = false; btn.textContent = old;
}

const fileBase = () => 'splitbill-' + defaultBillName().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

const exportImage = (btn) => withBusy(btn, 'Membuat gambar...', async () => {
  const canvas = await renderCanvas();
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
  downloadBlob(blob, fileBase() + '.png');
});

const exportPdf = (btn) => withBusy(btn, 'Membuat PDF...', async () => {
  const canvas = await renderCanvas();
  await loadScript('/vendor/jspdf.js');
  const pdf = new window.jspdf.jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth(), pageH = pdf.internal.pageSize.getHeight(), m = 24;
  const imgW = pageW - m * 2, usableH = pageH - m * 2;
  const pxPerPage = Math.floor((usableH * canvas.width) / imgW);
  for (let y = 0, page = 0; y < canvas.height; y += pxPerPage, page++) {
    const sliceH = Math.min(pxPerPage, canvas.height - y);
    const part = document.createElement('canvas');
    part.width = canvas.width; part.height = sliceH;
    part.getContext('2d').drawImage(canvas, 0, y, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
    if (page > 0) pdf.addPage();
    pdf.addImage(part.toDataURL('image/jpeg', 0.92), 'JPEG', m, m, imgW, (sliceH * imgW) / canvas.width);
  }
  downloadBlob(pdf.output('blob'), fileBase() + '.pdf');
});
