import { h, rp, toast, copyText, waLink, fmtDate } from '../util.js';
import { state, computeAll, resetSession } from '../store.js';
import { stepper, pageHead, banner } from './common.js';

export const title = 'Bagikan';

export function buildWaText(url) {
  const { combined } = computeAll();
  const pay = state.payment;
  const lines = [`*RINCIAN SPLITBILL*`, state.created?.name || 'Tagihan', `Total: ${rp(combined.grandTotal)}`, ''];
  combined.people.filter((p) => p.id !== state.ownerId).forEach((p, i) => lines.push(`${i + 1}. ${p.name}: ${rp(p.payTotal)}`));
  const pays = [];
  if (pay.bankNumber) pays.push(`${pay.bankName || 'Rekening'} ${pay.bankNumber.replace(/\s+/g, '')}${pay.holder ? ` a.n. ${pay.holder}` : ''}`);
  (pay.ewallets || []).forEach((e) => pays.push(`${e.type} ${e.number}`));
  if (pays.length || pay.qrisFile) { lines.push('', 'Transfer ke:'); pays.forEach((x) => lines.push(x)); if (pay.qrisFile) lines.push('QRIS tersedia di tautan'); }
  lines.push('', 'Cek bagianmu dan tandai sudah bayar di:', url);
  return lines.join('\n');
}

export function render(root, { go }) {
  const c = state.created;
  if (!c) { location.replace('#/pay'); return; }
  const publicUrl = `${location.origin}/s/${c.publicToken}`;
  const ownerUrl = `${location.origin}/b/${c.ownerToken}`;
  const text = buildWaText(publicUrl);
  const { combined } = computeAll();

  root.replaceChildren(h('div', { class: 'narrow stack-lg', style: 'margin:0 auto' },
    stepper('pay'),
    pageHead('Tautan Siap Dibagikan', `${c.name} · ${rp(combined.grandTotal)}`),
    banner('ok', 'Tagihan tersimpan. Teman cukup membuka tautan, tanpa login.'),
    h('div', { class: 'card stack' },
      h('a', { class: 'btn btn-whatsapp btn-block', href: waLink(text), target: '_blank', rel: 'noopener' }, 'Share ke WhatsApp'),
      h('div', { class: 'field' }, h('label', null, 'Tautan untuk teman'), h('div', { class: 'row' }, h('input', { class: 'input', readonly: true, value: publicUrl, 'aria-label': 'Tautan untuk teman', onFocus: (e) => e.target.select() }), h('button', { type: 'button', class: 'btn btn-secondary', onClick: async () => toast((await copyText(publicUrl)) ? 'Tautan disalin' : 'Salin manual') }, 'Salin'))),
      h('details', null, h('summary', { class: 'link' }, 'Pratinjau pesan WhatsApp'), h('pre', { class: 'panel mono t-body-sm', style: 'white-space:pre-wrap;margin-top:var(--sp-sm)' }, text))),
    h('div', { class: 'card stack' },
      h('div', { class: 't-sm' }, 'Pantau pembayaran'),
      h('p', { class: 'muted' }, 'Lihat siapa yang sudah bayar, konfirmasi, dan kirim pengingat. Simpan tautan ini bila ingin membukanya dari perangkat lain.'),
      h('a', { class: 'btn btn-primary', href: `/b/${c.ownerToken}` }, 'Lihat Status Pembayaran'),
      h('div', { class: 'row' }, h('input', { class: 'input', readonly: true, value: ownerUrl, 'aria-label': 'Tautan pribadi penagih', onFocus: (e) => e.target.select() }), h('button', { type: 'button', class: 'btn btn-secondary', onClick: async () => toast((await copyText(ownerUrl)) ? 'Tautan disalin' : 'Salin manual') }, 'Salin')),
      h('p', { class: 't-body-sm muted' }, 'Jangan bagikan tautan pribadi ini ke teman. Siapa pun yang memilikinya bisa mengubah status pembayaran.')),
    h('div', { class: 'row wrap' },
      h('a', { class: 'btn btn-secondary', href: '#/summary' }, 'Kembali ke Ringkasan'),
      h('button', { type: 'button', class: 'btn btn-secondary', onClick: () => { if (confirm('Mulai split bill baru? Data sesi ini akan dikosongkan (tagihan yang sudah dibuat tetap tersimpan di Riwayat).')) { resetSession(); go('/scan'); } } }, 'Split Bill Baru'))));
}
