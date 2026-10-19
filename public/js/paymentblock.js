import { h, copyText, toast } from './util.js';

/** Blok info pembayaran (dipakai di form pratinjau dan halaman teman). */
export function paymentBlock(p, { title = 'Transfer ke penagih' } = {}) {
  const rows = [];
  const copyBtn = (text) => h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onClick: async () => { toast((await copyText(text)) ? 'Nomor disalin' : 'Tidak bisa menyalin, salin manual'); } }, 'Salin nomor');

  if (p?.bankNumber) {
    rows.push(h('div', { class: 'stack-sm' },
      h('div', { class: 'copy-row' }, h('div', null, h('div', { class: 't-body-sm muted' }, p.bankName || 'Rekening'), h('div', { class: 'mono num strong' }, p.bankNumber)), copyBtn(p.bankNumber.replace(/\s+/g, '')))));
  }
  for (const e of p?.ewallets || []) {
    if (!e.number) continue;
    rows.push(h('div', { class: 'copy-row' }, h('div', null, h('div', { class: 't-body-sm muted' }, e.type), h('div', { class: 'mono num strong' }, e.number)), copyBtn(e.number.replace(/\s+/g, ''))));
  }
  if (p?.holder && rows.length) rows.push(h('div', { class: 't-body-sm' }, h('span', { class: 'muted' }, 'Atas nama: '), h('span', { class: 'strong' }, p.holder)));
  const qris = p?.qrisUrl || (p?.qrisFile ? `/api/qris/${p.qrisFile}` : null);
  if (qris) rows.push(h('div', { class: 'stack-sm' }, h('div', { class: 't-body-sm muted' }, 'QRIS'), h('img', { class: 'qris-img', src: qris, alt: 'Kode QRIS penagih' })));

  return h('div', { class: 'panel stack' }, h('div', { class: 't-label-lg' }, title),
    rows.length ? rows : h('p', { class: 'muted' }, 'Penagih belum mengisi info pembayaran. Tanyakan langsung ke penagih.'));
}
