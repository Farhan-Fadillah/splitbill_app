import { initTheme } from './theme.js';
import { h, rp, fmtDate, toast, copyText, waLink, statusBadge } from './util.js';
import { api } from './api.js';
import { initials } from './split.js';

initTheme();
const token = location.pathname.split('/').filter(Boolean)[1];
const root = document.getElementById('view');
const publicBase = () => location.origin;
let bill = null;
let timer = null;

const reminderText = (p) => `Halo ${p.name}, pengingat sopan: bagianmu untuk "${bill.name}" sebesar ${rp(p.amount)} belum tercatat. Cek dan bayar di ${publicBase()}/s/${bill.publicToken}. Terima kasih!`;
const allReminderText = (list) => `Halo semua, pengingat untuk "${bill.name}". Yang belum bayar:\n${list.map((p) => `- ${p.name}: ${rp(p.amount)}`).join('\n')}\n\nCek bagianmu dan bayar di ${publicBase()}/s/${bill.publicToken}. Terima kasih!`;

async function removeBill() {
  if (!confirm('Hapus tagihan ini? Tautan untuk teman juga berhenti berfungsi dan tidak bisa dikembalikan.')) return;
  try {
    await api.deleteBill(token);
    try { const list = JSON.parse(localStorage.getItem('sb_bills') || '[]').filter((b) => b.ownerToken !== token); localStorage.setItem('sb_bills', JSON.stringify(list)); } catch { /* */ }
    clearInterval(timer);
    root.replaceChildren(h('div', { class: 'empty' }, h('div', { class: 't-sm' }, 'Tagihan dihapus'), h('p', null, 'Datanya sudah dihapus dari server.'), h('a', { class: 'btn btn-primary', href: '/app#/scan' }, 'Mulai Scan Baru')));
  } catch (e) { toast(e.message); }
}

async function setStatus(pid, status) {
  try { await api.patchBill(token, { statuses: { [pid]: status } }); await load(); }
  catch (e) { toast(e.message); }
}

function draw() {
  const payers = bill.people.filter((p) => !p.isOwner);
  const pending = payers.filter((p) => p.status !== 'lunas');
  const waiting = payers.filter((p) => p.status === 'menunggu');
  const publicUrl = `${publicBase()}/s/${bill.publicToken}`;

  const rows = payers.map((p) => h('div', { class: 'list-item', style: 'flex-wrap:wrap' },
    h('div', { class: 'row', style: 'min-width:0' }, h('span', { class: 'avatar' }, initials(p.name)),
      h('div', null, h('div', { class: 'strong' }, p.name), h('div', { class: 't-body-sm muted num' }, rp(p.amount)))),
    h('div', { class: 'row wrap', style: 'justify-content:flex-end' },
      statusBadge(p.status),
      p.status === 'menunggu' ? h('button', { type: 'button', class: 'btn btn-primary btn-sm', onClick: () => setStatus(p.id, 'lunas') }, 'Konfirmasi') : null,
      p.status === 'lunas'
        ? h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onClick: () => setStatus(p.id, 'belum') }, 'Batalkan')
        : h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onClick: () => setStatus(p.id, 'lunas') }, 'Tandai Lunas'),
      p.status !== 'lunas' ? h('a', { class: 'btn btn-secondary btn-sm', href: waLink(reminderText(p)), target: '_blank', rel: 'noopener' }, 'Kirim Pengingat') : null)));

  root.replaceChildren(h('div', { class: 'stack-lg' },
    h('div', { class: 'stack-sm' }, h('h1', { class: 't-lg' }, bill.name),
      h('p', { class: 'muted' }, [fmtDate(bill.date), `${bill.peopleCount} orang`, `Total ${rp(bill.grandTotal)}`].filter(Boolean).join(' · '))),
    h('div', { class: 'card stack-sm' },
      h('div', { class: 't-md' }, `${bill.paidCount} dari ${bill.payerCount} sudah bayar, ${rp(bill.collected)} terkumpul`),
      h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(bill.payerCount), 'aria-valuenow': String(bill.paidCount) }, h('i', { style: `width:${bill.payerCount ? (bill.paidCount / bill.payerCount) * 100 : 0}%` })),
      h('div', { class: 't-body-sm muted' }, bill.settled ? 'Semua sudah lunas.' : `Sisa ${rp(bill.outstanding)}${waiting.length ? ` · ${waiting.length} menunggu konfirmasi` : ''}`)),
    waiting.length ? h('div', { class: 'banner banner-warn' }, `${waiting.length} teman menandai sudah bayar. Cek mutasi rekeningmu lalu konfirmasi.`) : null,
    h('div', { class: 'row wrap' },
      pending.length ? h('a', { class: 'btn btn-whatsapp', href: waLink(allReminderText(pending)), target: '_blank', rel: 'noopener' }, 'Ingatkan Semua Yang Belum Bayar') : null,
      h('button', { type: 'button', class: 'btn btn-secondary', onClick: async () => toast((await copyText(publicUrl)) ? 'Tautan teman disalin' : 'Salin manual') }, 'Salin Tautan Teman'),
      h('a', { class: 'btn btn-secondary', href: waLink(`Cek bagianmu untuk "${bill.name}" di ${publicUrl}`), target: '_blank', rel: 'noopener' }, 'Bagikan ke WhatsApp')),
    payers.length ? h('div', null, rows) : h('div', { class: 'empty' }, 'Tagihan ini hanya punya satu peserta (kamu), jadi tidak ada yang perlu membayar.'),
    h('div', { class: 'row-between wrap' },
      h('a', { class: 'link', href: '/app#/riwayat' }, 'Lihat semua riwayat'),
      h('button', { type: 'button', class: 'btn btn-danger-quiet btn-sm', onClick: removeBill }, 'Hapus Tagihan Ini'))));
}

async function load() {
  try { bill = (await api.getBill(token)).bill; draw(); }
  catch (e) {
    clearInterval(timer);
    root.replaceChildren(h('div', { class: 'empty' }, h('div', { class: 't-sm' }, e.status === 404 ? 'Tagihan tidak ditemukan' : 'Tidak bisa memuat status'),
      h('p', null, e.status === 404 ? 'Tautan salah atau tagihan sudah kedaluwarsa (90 hari).' : e.message)));
  }
}
load();
timer = setInterval(() => { if (!document.hidden) load(); }, 20000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
