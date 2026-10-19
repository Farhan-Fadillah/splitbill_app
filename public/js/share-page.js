import { initTheme } from './theme.js';
import { h, rp, fmtDate, toast, statusBadge, put } from './util.js';
import { api } from './api.js';
import { paymentBlock } from './paymentblock.js';
import { CHARGE_LABELS, CHARGE_KEYS, initials } from './split.js';

initTheme();
const token = location.pathname.split('/').filter(Boolean)[1];
const root = document.getElementById('view');
const KEY = `sb_me_${token}`;

async function main() {
  let bill;
  try { bill = (await api.getPublic(token)).bill; }
  catch (e) {
    root.replaceChildren(h('div', { class: 'empty' }, h('div', { class: 't-sm' }, e.status === 404 ? 'Tagihan tidak ditemukan' : 'Tidak bisa memuat tagihan'),
      h('p', null, e.status === 404 ? 'Tautan ini salah atau tagihannya sudah kedaluwarsa. Minta tautan baru ke penagih.' : e.message)));
    return;
  }
  document.title = `${bill.name} — SplitBill`;
  let me = null;
  try { me = localStorage.getItem(KEY); } catch { /* */ }
  if (me && !bill.people.some((p) => p.id === me)) me = null;
  const head = h('div', { class: 'stack-sm' },
    h('h1', { class: 't-lg' }, bill.name),
    h('p', { class: 'muted' }, [fmtDate(bill.date), `Penagih: ${bill.ownerName}`, `${bill.paidCount} dari ${bill.payerCount} sudah bayar`].filter(Boolean).join(' · ')));
  const body = h('div', { class: 'stack-lg' });
  root.replaceChildren(h('div', { class: 'stack-lg' }, head, body));

  const pick = () => put(body,h('div', { class: 'card stack' },
    h('div', { class: 't-sm' }, 'Kamu yang mana?'),
    h('p', { class: 'muted' }, 'Pilih namamu untuk melihat bagianmu.'),
    h('div', { class: 'stack-sm' }, bill.people.map((p) => h('button', { type: 'button', class: 'list-item', style: 'cursor:pointer;width:100%;text-align:left', onClick: () => { me = p.id; try { localStorage.setItem(KEY, me); } catch { /* */ } show(); } },
      h('span', { class: 'row' }, h('span', { class: 'avatar' }, initials(p.name)), h('span', { class: 'strong' }, p.name)), p.isOwner ? h('span', { class: 'badge badge-neutral' }, 'Penagih') : null)))));

  async function show() {
    put(body,h('div', { class: 'skeleton', style: 'height:10rem' }));
    let person;
    try { person = (await api.getPerson(token, me)).person; } catch (e) { toast(e.message); return pick(); }
    const multi = new Set(person.items.map((i) => i.receipt)).size > 1;
    const lines = person.items.map((it) => h('div', { class: 'line' }, h('span', null, multi && it.receipt ? `${it.receipt} · ${it.name}` : it.name), h('span', null, rp(it.amount))));
    const fees = CHARGE_KEYS.filter((k) => person.fees[k]).map((k) => h('div', { class: 'line fee' }, h('span', null, CHARGE_LABELS[k]), h('span', null, rp(person.fees[k]))));
    const statusEl = h('span');
    const paidBtn = h('button', { type: 'button', class: 'btn btn-primary btn-block' }, 'Tandai Sudah Bayar');
    const paint = (status) => {
      statusEl.replaceChildren(statusBadge(status));
      paidBtn.hidden = person.isOwner || status !== 'belum';
      note.textContent = status === 'menunggu' ? 'Terima kasih! Menunggu konfirmasi dari penagih.' : status === 'lunas' && !person.isOwner ? 'Pembayaranmu sudah dikonfirmasi penagih.' : '';
      note.hidden = !note.textContent;
    };
    const note = h('p', { class: 'banner banner-ok', hidden: true });
    paidBtn.addEventListener('click', async () => {
      paidBtn.disabled = true;
      try { const r = await api.markPaid(token, me); person.status = r.status; paint(r.status); toast('Ditandai. Menunggu konfirmasi penagih'); }
      catch (e) { toast(e.message); }
      paidBtn.disabled = false;
    });
    put(body,
      h('div', { class: 'card stack' },
        h('div', { class: 'row-between' }, h('div', { class: 'row' }, h('span', { class: 'avatar' }, initials(person.name)), h('span', { class: 't-sm' }, person.name)), statusEl),
        h('div', { class: 'panel stack-sm' }, h('div', { class: 't-label-sm muted' }, 'BAGIANMU'), h('div', { class: 't-lg num', style: 'font-weight:700' }, rp(person.total))),
        h('div', { class: 'stack-sm' }, lines, fees, person.roundingAdjust ? h('div', { class: 'line fee' }, h('span', null, 'Penyesuaian pembulatan'), h('span', null, rp(person.roundingAdjust))) : null),
        note, paidBtn),
      person.isOwner ? null : paymentBlock(bill.payment),
      h('button', { type: 'button', class: 'link', onClick: pick }, 'Bukan kamu? Ganti nama'));
    paint(person.status);
  }
  me ? show() : pick();
}
main();
