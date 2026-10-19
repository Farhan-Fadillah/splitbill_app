import { h, rp, fmtDate, debounce, put } from '../util.js';
import { billHistory, removeHistory } from '../store.js';
import { api } from '../api.js';
import { pageHead, empty, banner } from './common.js';

export const title = 'Riwayat';

export async function render(root) {
  const wrap = h('div', { class: 'narrow', style: 'margin:0 auto' });
  root.replaceChildren(wrap);
  const local = billHistory();
  put(wrap,pageHead('Riwayat', 'Tagihan yang pernah kamu buat di perangkat ini.'), h('div', { class: 'stack' }, [1, 2, 3].map(() => h('div', { class: 'skeleton' }))));

  if (!local.length) {
    put(wrap,pageHead('Riwayat', 'Tagihan yang pernah kamu buat di perangkat ini.'),
      empty('Belum ada riwayat', 'Tagihan yang kamu bagikan akan muncul di sini.', h('a', { class: 'btn btn-primary', href: '#/scan' }, 'Mulai Scan Struk')));
    return;
  }
  let bills = [], missing = new Set(), error = null;
  try {
    const res = await api.lookup(local.map((b) => b.ownerToken));
    bills = res.bills; missing = new Set(res.missing);
  } catch (e) { error = e; }

  let query = '', filter = 'all';
  const list = h('div');
  const byToken = new Map(bills.map((b) => [b.ownerToken, b]));

  function paint() {
    const items = local.map((l) => ({ l, b: byToken.get(l.ownerToken) }))
      .filter(({ l, b }) => (b || missing.has(l.ownerToken) || error) && (l.name || '').toLowerCase().includes(query.toLowerCase()))
      .filter(({ b }) => filter === 'all' || (b && (filter === 'lunas' ? b.settled : !b.settled)));
    list.replaceChildren(...(items.length ? items.map(({ l, b }) => {
      if (!b) {
        return h('div', { class: 'list-item' },
          h('div', null, h('div', { class: 'strong' }, l.name), h('div', { class: 't-body-sm muted' }, error ? 'Tidak bisa memuat status' : 'Tagihan sudah kedaluwarsa')),
          h('button', { type: 'button', class: 'btn btn-quiet btn-sm', onClick: () => { removeHistory(l.ownerToken); location.reload(); } }, 'Hapus'));
      }
      return h('a', { class: 'list-item', href: `/b/${b.ownerToken}` },
        h('div', { style: 'min-width:0' }, h('div', { class: 'strong', style: 'overflow-wrap:anywhere' }, b.name),
          h('div', { class: 't-body-sm muted' }, [fmtDate(b.date), `${b.peopleCount} orang`, rp(b.grandTotal)].filter(Boolean).join(' · '))),
        h('span', { class: `badge ${b.settled ? 'badge-ok' : 'badge-warn'}` }, b.settled ? 'Lunas' : `Belum Lunas ${b.paidCount}/${b.payerCount}`));
    }) : [empty('Tidak ada hasil', 'Coba ubah kata kunci atau filter.')]));
  }

  put(wrap,
    pageHead('Riwayat', 'Tagihan yang pernah kamu buat di perangkat ini.'),
    error ? banner('err', error.message) : null,
    h('div', { class: 'stack' },
      h('div', { class: 'row wrap', style: 'gap:var(--sp-md)' },
        h('div', { class: 'field grow' }, h('label', { class: 'sr-only', for: 'q' }, 'Cari tagihan'), h('input', { id: 'q', class: 'input', type: 'search', placeholder: 'Cari nama tagihan', onInput: debounce((e) => { query = e.target.value; paint(); }, 150) })),
        h('div', { class: 'seg', role: 'group', 'aria-label': 'Filter status' }, [['all', 'Semua'], ['belum', 'Belum Lunas'], ['lunas', 'Lunas']].map(([k, label]) =>
          h('button', { type: 'button', 'aria-pressed': String(filter === k), onClick: (e) => { filter = k; [...e.currentTarget.parentNode.children].forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); paint(); } }, label)))),
      list));
  paint();
}
