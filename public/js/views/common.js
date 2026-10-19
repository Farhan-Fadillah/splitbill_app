import { h } from '../util.js';
import { state } from '../store.js';

const STEPS = [
  ['scan', 'Scan'], ['review', 'Koreksi'], ['assign', 'Pembagian'], ['summary', 'Ringkasan'], ['pay', 'Bayar & Share'],
];

/** Indikator langkah. Ini memang urutan nyata, jadi bernomor. */
export function stepper(current) {
  const idx = STEPS.findIndex(([k]) => k === current);
  const hasReceipt = state.receipts.length > 0;
  return h('ol', { class: 'steps', 'aria-label': 'Langkah' },
    STEPS.map(([key, label], i) => {
      const text = `${i + 1}. ${label}`;
      const cls = i === idx ? 'on' : i < idx ? 'done' : '';
      const reachable = i !== idx && (i === 0 || hasReceipt);
      return h('li', null, reachable
        ? h('a', { href: `#/${key}`, class: cls }, text)
        : h('span', { class: cls, 'aria-current': i === idx ? 'step' : null }, text));
    }));
}

/** Tab struk: Struk 1 / Struk 2 / (Gabungan) / + Tambah Struk */
export function receiptTabs({ combined = false, current, onSelect }) {
  const tabs = state.receipts.map((r, i) => h('button', {
    type: 'button', class: 'tab', role: 'tab', 'aria-selected': String(current === i),
    onClick: () => onSelect(i),
  }, r.label));
  if (combined && state.receipts.length > 1) {
    tabs.push(h('button', { type: 'button', class: 'tab', role: 'tab', 'aria-selected': String(current === 'all'), onClick: () => onSelect('all') }, 'Gabungkan semua struk'));
  }
  tabs.push(h('a', { class: 'tab tab-add', href: '#/scan?add=1' }, '+ Tambah Struk'));
  return h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Struk' }, tabs);
}

export const empty = (title, text, action) =>
  h('div', { class: 'empty' }, h('div', { class: 't-sm' }, title), h('p', null, text), action ? h('div', { style: 'margin-top:1rem' }, action) : null);

export const banner = (kind, content) => h('div', { class: `banner banner-${kind}`, role: kind === 'err' ? 'alert' : 'status' }, content);

export function pageHead(title, subtitle) {
  return h('div', { class: 'stack-sm', style: 'margin-bottom:var(--sp-md)' },
    h('h1', { class: 't-lg' }, title), subtitle ? h('p', { class: 'muted t-body-lg' }, subtitle) : null);
}

export const stickyBar = (left, right) =>
  h('div', { class: 'sticky-bar' }, h('div', { class: 'container' }, left, right));
