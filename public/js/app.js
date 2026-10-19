import { initTheme, initMenu } from './theme.js';
import { state, addReceipt, manualReceipt } from './store.js';
import { $$, h } from './util.js';

import * as scan from './views/scan.js';
import * as review from './views/review.js';
import * as assign from './views/assign.js';
import * as summary from './views/summary.js';
import * as pay from './views/pay.js';
import * as share from './views/share.js';
import * as history from './views/history.js';
import * as support from './views/support.js';

initTheme();
initMenu();

const routes = { scan, review, assign, summary, pay, share, riwayat: history, support };
const needsReceipt = new Set(['review', 'assign', 'summary', 'pay', 'share']);
const root = document.getElementById('view');
let cleanup = null;

export const go = (path) => { location.hash = '#' + path; };

function parse() {
  const raw = location.hash.replace(/^#/, '') || '/scan';
  const [path, qs] = raw.split('?');
  return { name: path.replace(/^\//, '') || 'scan', query: new URLSearchParams(qs || '') };
}

async function render() {
  if (typeof cleanup === 'function') { try { cleanup(); } catch { /* */ } }
  cleanup = null;
  const { name, query } = parse();

  if (name === 'manual') {
    addReceipt(manualReceipt());
    location.replace('#/review');
    return;
  }
  const view = routes[name];
  if (!view) { location.replace('#/scan'); return; }
  if (needsReceipt.has(name) && state.receipts.length === 0) { location.replace('#/scan'); return; }

  $$('.nav a[data-route]').forEach((a) => {
    if (a.dataset.route.split(',').includes(name)) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  root.replaceChildren(h('div', { class: 'skeleton', style: 'height:8rem' }));
  window.scrollTo({ top: 0 });
  document.title = 'SplitBill — ' + (view.title || 'Aplikasi');
  cleanup = (await view.render(root, { query, go })) || null;
}

window.addEventListener('hashchange', render);
render();
