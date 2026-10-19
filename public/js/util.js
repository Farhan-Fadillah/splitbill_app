// Utilitas kecil. Semua teks dari pengguna dimasukkan lewat textContent (aman dari XSS).
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** h('div', {class:'x', onClick:fn}, 'teks', child, [children]) */
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (/^on[A-Z]/.test(k) && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') el.value = v;
    else if (['checked', 'disabled', 'hidden', 'selected', 'required', 'multiple', 'open'].includes(k)) el[k] = !!v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  const add = (c) => {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) c.forEach(add);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  };
  children.forEach(add);
  return el;
}

/** Ratakan array bersarang dan buang null/false (append bawaan DOM akan mencetak "null"). */
export const flat = (kids) => kids.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false);
export const put = (el, ...kids) => { el.replaceChildren(...flat(kids)); return el; };
export const add = (el, ...kids) => { el.append(...flat(kids)); return el; };

export const rp = (n) => {
  const v = Math.round(Number(n) || 0);
  return (v < 0 ? '-Rp ' : 'Rp ') + new Intl.NumberFormat('id-ID').format(Math.abs(v));
};

/** "1.250.000" / "Rp 15.000" / "-5000" -> integer */
export const parseRp = (s) => {
  const str = String(s ?? '').trim();
  const neg = /^[^\d]*-/.test(str);
  const n = parseInt(str.replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? (neg ? -n : n) : 0;
};
export const fmtNum = (n) => new Intl.NumberFormat('id-ID').format(Math.round(Number(n) || 0));

export const uid = (p = 'x') => `${p}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;

export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}
export const todayIso = () => new Date().toISOString().slice(0, 10);

export function debounce(fn, ms = 200) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function toast(message) {
  let wrap = document.querySelector('.toast-wrap');
  if (!wrap) { wrap = h('div', { class: 'toast-wrap', role: 'status', 'aria-live': 'polite' }); document.body.append(wrap); }
  const t = h('div', { class: 'toast' }, message);
  wrap.replaceChildren(t);
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.remove(), 2400);
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const ta = h('textarea', { style: 'position:fixed;opacity:0' }, text);
    document.body.append(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* */ }
    ta.remove();
    return ok;
  }
}

export const waLink = (text) => 'https://wa.me/?text=' + encodeURIComponent(text);

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-src="${src}"]`)) return resolve();
    const s = h('script', { src, 'data-src': src });
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Gagal memuat ' + src));
    document.head.append(s);
  });
}

export const STATUS_LABEL = { belum: 'Belum Bayar', menunggu: 'Menunggu Konfirmasi', lunas: 'Sudah Bayar' };
export const STATUS_CLASS = { belum: 'badge-warn', menunggu: 'badge-neutral', lunas: 'badge-ok' };
export const statusBadge = (s) => h('span', { class: `badge ${STATUS_CLASS[s] || 'badge-warn'}` }, STATUS_LABEL[s] || s);
