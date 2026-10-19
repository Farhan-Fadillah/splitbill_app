import { initTheme, initMenu } from './theme.js';
import { toast } from './util.js';

initTheme();
initMenu();

const $ = (id) => document.getElementById(id);
const mobile = $('preview-content-mobile'), slip = $('preview-content-slip');
const bMobile = $('btn-view-mobile'), bSlip = $('btn-view-slip');
function show(which) {
  const m = which === 'mobile';
  mobile.hidden = !m; slip.hidden = m;
  bMobile.setAttribute('aria-pressed', String(m)); bSlip.setAttribute('aria-pressed', String(!m));
}
bMobile.addEventListener('click', () => show('mobile'));
bSlip.addEventListener('click', () => show('slip'));

let dark = false;
$('btn-toggle-demo-dark').addEventListener('click', (e) => {
  dark = !dark;
  $('sim-frame').classList.toggle('dark-demo', dark);
  $('demo-mode-label').textContent = dark ? 'Dark' : 'Light';
  e.currentTarget.setAttribute('aria-pressed', String(dark));
});

let paid = true;
$('demo-pay-btn').addEventListener('click', (e) => {
  paid = !paid;
  $('demo-paid').textContent = paid ? 'Sudah Bayar ✓' : 'Belum Bayar';
  e.currentTarget.textContent = paid ? 'Tandai Sudah Bayar' : 'Tandai Sudah Bayar';
});

$('demo-copy-btn').addEventListener('click', async () => {
  const text = $('slip-text').innerText;
  try { await navigator.clipboard.writeText(text); toast('Teks disalin'); } catch { toast('Tidak bisa menyalin, salin manual'); }
});
