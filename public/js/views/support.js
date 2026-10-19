import { h } from '../util.js';
import { api } from '../api.js';
import { pageHead } from './common.js';

export const title = 'Support';

export async function render(root) {
  let cfg = { supportEmail: 'hello@dwimnofan.com', donationUrl: '' };
  try { cfg = await api.config(); } catch { /* pakai default */ }
  const mail = (subject) => `mailto:${cfg.supportEmail}?subject=${encodeURIComponent(subject)}`;
  const item = (label, desc, href) => h('a', { class: 'list-item', href }, h('div', null, h('div', { class: 'strong' }, label), h('div', { class: 't-body-sm muted' }, desc)), h('span', { class: 'muted' }, '›'));
  root.replaceChildren(h('div', { class: 'narrow stack-lg', style: 'margin:0 auto' },
    pageHead('Support', 'Ada kendala atau ide? Kabari kami.'),
    h('div', null,
      item('Email', cfg.supportEmail, mail('Halo SplitBill')),
      item('Lapor bug', 'Ceritakan apa yang terjadi dan di langkah mana', mail('[Bug] SplitBill')),
      item('Request fitur', 'Fitur apa yang kamu butuhkan?', mail('[Fitur] SplitBill')),
      item('Kasih feedback', 'Apa yang sudah bagus dan apa yang kurang?', mail('[Feedback] SplitBill'))),
    h('div', { class: 'card stack-sm' }, h('div', { class: 't-sm' }, 'Nih buat jajan'),
      h('p', { class: 'muted' }, 'SplitBill gratis dipakai. Kalau terbantu, boleh traktir kopi supaya server tetap menyala.'),
      cfg.donationUrl ? h('a', { class: 'btn btn-secondary', href: cfg.donationUrl, target: '_blank', rel: 'noopener' }, 'Traktir Kopi') : h('p', { class: 't-body-sm muted' }, 'Tautan donasi belum diatur.'))));
}
