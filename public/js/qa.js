import { initTheme } from './theme.js';
import { h, put, rp, toast, copyText, downloadBlob, uid } from './util.js';
import { api } from './api.js';
import { prepareImage, qualityHints } from './imageprep.js';
import * as S from './split.js';
import { CASES, GROUPS } from './qa-cases.js';

initTheme();
const root = document.getElementById('view');
const KEY = 'sb_qa_v1';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
const saved = load();
const qa = { manual: saved.manual || {}, auto: saved.auto || {} };
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(qa)); } catch { /* */ } };
let qaToken = sessionStorage.getItem('sb_qa_token') || '';

const BADGE = { pass: ['badge-ok', 'LULUS'], fail: ['badge-fail', 'GAGAL'], warn: ['badge-warn', 'PERIKSA'], skip: ['badge-neutral', 'LEWATI'], run: ['badge-neutral', '...'] };
const badge = (s) => h('span', { class: `badge ${BADGE[s][0]}` }, BADGE[s][1]);
const fmtBytes = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);

/** Tabel hasil cek: rows = [{name, status, detail}] */
const resultTable = (rows) => h('div', { class: 'qa-scroll' }, h('table', { class: 'qa-table' },
  h('thead', null, h('tr', null, h('th', null, 'Cek'), h('th', null, 'Hasil'), h('th', null, 'Keterangan'))),
  h('tbody', null, rows.map((r) => h('tr', null, h('td', { class: 'strong' }, r.name), h('td', null, badge(r.status)), h('td', { class: 'muted' }, r.detail || ''))))));

const summarize = (rows) => rows.reduce((a, r) => ({ ...a, [r.status]: (a[r.status] || 0) + 1 }), {});
const summaryText = (rows) => { const s = summarize(rows); return `${s.pass || 0} lulus · ${s.fail || 0} gagal${s.warn ? ` · ${s.warn} periksa` : ''}${s.skip ? ` · ${s.skip} dilewati` : ''}`; };

async function safe(fn) { try { return await fn(); } catch (e) { return { status: 'fail', detail: e.message }; } }
const json = async (url, opts) => { const res = await fetch(url, opts); let body = null; try { body = await res.clone().json(); } catch { /* */ } return { res, body, text: body ? '' : await res.text().catch(() => '') }; };

// ================================================================== 1. Cek sistem
function systemTab() {
  const out = h('div', { class: 'stack' });
  const tokenIn = h('input', { class: 'input', type: 'password', value: qaToken, placeholder: 'QA_TOKEN (opsional)', autocomplete: 'off', 'aria-label': 'Token QA', onInput: (e) => { qaToken = e.target.value; sessionStorage.setItem('sb_qa_token', qaToken); } });
  const pingOut = h('div', { class: 'stack-sm' });

  async function run(btn) {
    btn.disabled = true; btn.textContent = 'Menjalankan...';
    const rows = [];
    const add = (name, status, detail) => { rows.push({ name, status, detail }); put(out, resultTable(rows)); };

    await safe(async () => {
      const t = Date.now(); const { res, body } = await json('/health');
      add('Server hidup (/health)', res.ok && body?.ok ? 'pass' : 'fail', res.ok ? `${Date.now() - t} ms · penyimpanan: ${body.storage} · Vercel: ${body.vercel ? 'ya' : 'tidak'}` : `HTTP ${res.status}`);
      if (body?.storage === 'unconfigured') add('Penyimpanan', 'fail', 'Belum ada Upstash Redis. Atur UPSTASH_REDIS_REST_URL dan UPSTASH_REDIS_REST_TOKEN.');
      else if (body?.storage === 'sqlite' && body.vercel) add('Penyimpanan', 'fail', 'SQLite tidak cocok di Vercel');
      else if (body?.storage) add('Mode penyimpanan', body.storage === 'sqlite' ? 'warn' : 'pass', body.storage === 'sqlite' ? 'SQLite (lokal/VPS). Normal untuk pengembangan.' : 'Redis (cocok untuk Vercel)');
    }).then((r) => r && add('Server hidup (/health)', 'fail', r.detail));

    let cfg = null;
    await safe(async () => { const { res, body } = await json('/api/config'); cfg = body; add('Konfigurasi publik (/api/config)', res.ok ? 'pass' : 'fail', res.ok ? `batas upload ${fmtBytes(body.maxUploadBytes)} · QA ${body.qaEnabled ? 'aktif' : 'nonaktif'}` : `HTTP ${res.status}`); }).then((r) => r && add('Konfigurasi publik', 'fail', r.detail));

    const assets = ['/css/app.css', '/js/split.js', '/vendor/html2canvas.js', '/vendor/jspdf.js', '/vendor/heic2any.js', '/vendor/inter/inter-latin-wght-normal.woff2'];
    for (const a of assets) {
      const r = await safe(async () => { const res = await fetch(a); const n = (await res.arrayBuffer()).byteLength; add(`Aset ${a}`, res.ok && n > 1000 ? 'pass' : 'fail', `HTTP ${res.status} · ${fmtBytes(n)}`); });
      if (r) add(`Aset ${a}`, 'fail', r.detail);
    }
    for (const [p, needle] of [['/app', 'view'], ['/s/qa-cek', 'view'], ['/b/qa-cek', 'view'], ['/qa', 'QA']]) {
      const r = await safe(async () => { const res = await fetch(p); const t = await res.text(); add(`Rute halaman ${p}`, res.ok && t.includes(needle) ? 'pass' : 'fail', `HTTP ${res.status}`); });
      if (r) add(`Rute halaman ${p}`, 'fail', r.detail);
    }
    await safe(async () => {
      const res = await fetch('/app');
      const csp = res.headers.get('content-security-policy');
      add('Header keamanan (CSP, nosniff)', csp && res.headers.get('x-content-type-options') ? 'pass' : 'warn', csp ? 'CSP aktif' : 'CSP tidak ditemukan pada halaman statis (periksa vercel.json)');
    });
    await safe(async () => { const { res, body } = await json('/api/bills/xxxxxxxxxxxxxxxxxxxxxx'); add('API menolak token tak dikenal', res.status === 404 && body?.ok === false ? 'pass' : 'fail', `HTTP ${res.status}`); });

    // Kemampuan browser
    add('Browser: penyimpanan lokal', (() => { try { localStorage.setItem('qa_t', '1'); localStorage.removeItem('qa_t'); return 'pass'; } catch { return 'fail'; } })(), 'localStorage (dibutuhkan untuk riwayat)');
    add('Browser: HTTPS / konteks aman', window.isSecureContext ? 'pass' : 'warn', window.isSecureContext ? 'Tombol salin berfungsi' : 'Tombol salin ke clipboard bisa gagal');
    add('Browser: pemrosesan gambar', typeof createImageBitmap === 'function' && !!document.createElement('canvas').toBlob ? 'pass' : 'fail', 'createImageBitmap + canvas');
    add('Browser: dialog bottom sheet', typeof HTMLDialogElement === 'function' ? 'pass' : 'fail', '<dialog>');

    // Diagnostik server (butuh token)
    if (qaToken) {
      await safe(async () => {
        const { res, body } = await json('/api/qa/status', { headers: { 'x-qa-token': qaToken } });
        if (res.status === 401) return add('Diagnostik server (QA_TOKEN)', 'fail', 'Token salah');
        if (res.status === 404) return add('Diagnostik server (QA_TOKEN)', 'warn', 'QA_TOKEN belum diatur di server');
        add('Diagnostik server (QA_TOKEN)', res.ok ? 'pass' : 'fail', res.ok ? `Node ${body.runtime.node} · region ${body.runtime.region || '-'} · env ${body.runtime.env || '-'}` : `HTTP ${res.status}`);
        if (!res.ok) return;
        add('Penyimpanan baca/tulis', body.storage.ok ? 'pass' : 'fail', `${body.storage.mode}${body.storage.error ? ` · ${body.storage.error}` : ''}`);
        add('Key Claude (Sumopod) terisi', body.env.sumopod.keySet ? 'pass' : 'fail', `${body.env.sumopod.baseUrl} · gaya ${body.env.sumopod.style} · model ${body.env.sumopod.model}`);
        add('Key Mistral terisi', body.env.mistral.keySet ? 'pass' : 'fail', `OCR ${body.env.mistral.ocrModel} · chat ${body.env.mistral.chatModel}`);
        add('Batas waktu scan', body.limits.scanDeadlineMs <= 58000 || !body.runtime.vercel ? 'pass' : 'warn', `${body.limits.scanDeadlineMs / 1000} dtk (hedge ${body.limits.hedgeMs / 1000} dtk, maxDuration Vercel 60 dtk)`);
      });
    } else add('Diagnostik server', 'skip', 'Isi QA_TOKEN untuk memeriksa key, penyimpanan, dan memanggil Claude/Mistral');

    qa.auto.system = { at: Date.now(), rows }; persist();
    btn.disabled = false; btn.textContent = 'Jalankan Ulang';
    toast(summaryText(rows));
  }

  async function ping(target, btn) {
    btn.disabled = true;
    put(pingOut, h('p', { class: 'muted' }, `Memanggil ${target}...`));
    try {
      const { res, body } = await json('/api/qa/ping', { method: 'POST', headers: { 'content-type': 'application/json', 'x-qa-token': qaToken }, body: JSON.stringify({ target }) });
      if (!res.ok) put(pingOut, h('div', { class: 'banner banner-err' }, body?.error?.message || `HTTP ${res.status}`));
      else {
        const r = body.result;
        if (target === 'models') {
          const d = r.detail;
          put(pingOut, h('div', { class: `banner ${r.ok ? (d.currentExists ? 'banner-ok' : 'banner-warn') : 'banner-err'}` },
            h('strong', null, r.ok ? `${d.count} model tersedia (${r.ms} ms)` : `Gagal mengambil daftar model (${r.ms} ms)`),
            r.ok ? h('div', null, d.currentExists ? `CLAUDE_MODEL "${d.current}" ADA di daftar.` : `CLAUDE_MODEL "${d.current}" TIDAK ADA di daftar. Ganti dengan salah satu nama di bawah.`) : h('div', null, [r.error, r.status ? `HTTP ${r.status}` : '', r.hint].filter(Boolean).join(' · ')),
            r.ok ? h('pre', { class: 'json' }, d.models.join('\n')) : null));
          btn.disabled = false; return;
        }
        put(pingOut, h('div', { class: `banner ${r.ok ? 'banner-ok' : 'banner-err'}` }, h('strong', null, `${target}: ${r.ok ? 'terhubung' : 'gagal'} (${r.ms} ms)`), h('div', null, r.ok ? r.detail : [r.error, r.status ? `HTTP ${r.status}` : '', r.hint].filter(Boolean).join(' · ')), r.body ? h('pre', { class: 'json' }, r.body) : null));
        qa.auto[`ping_${target}`] = { at: Date.now(), ok: r.ok, ms: r.ms, detail: r.ok ? r.detail : r.error }; persist();
      }
    } catch (e) { put(pingOut, h('div', { class: 'banner banner-err' }, e.message)); }
    btn.disabled = false;
  }

  const runBtn = h('button', { type: 'button', class: 'btn btn-primary', onClick: (e) => run(e.currentTarget) }, 'Jalankan Cek Sistem');
  return h('div', { class: 'stack-lg' },
    h('div', { class: 'card stack' },
      h('div', { class: 't-sm' }, 'Cek sistem otomatis'),
      h('p', { class: 'muted' }, 'Memeriksa server, penyimpanan, aset statis, rute halaman, header keamanan, dan kemampuan browser. Token QA (opsional) membuka diagnostik server: status key dan uji panggilan Claude/Mistral.'),
      h('div', { class: 'field' }, h('label', null, 'Token QA (sama dengan environment variable QA_TOKEN)'), tokenIn),
      h('div', { class: 'row wrap' }, runBtn,
        h('button', { type: 'button', class: 'btn btn-secondary', onClick: (e) => ping('claude', e.currentTarget) }, 'Tes Claude (Sumopod)'),
        h('button', { type: 'button', class: 'btn btn-secondary', onClick: (e) => ping('mistral', e.currentTarget) }, 'Tes Mistral OCR'),
        h('button', { type: 'button', class: 'btn btn-secondary', onClick: (e) => ping('models', e.currentTarget) }, 'Lihat Daftar Model')),
      pingOut),
    out);
}

// ================================================================== 2. Uji scan
function scanTab() {
  const out = h('div', { class: 'stack' });
  const file = h('input', { type: 'file', accept: 'image/*,application/pdf,.heic,.heif,.pdf', 'aria-label': 'Pilih file struk' });
  const raw = h('input', { type: 'checkbox' });
  const expected = h('textarea', { class: 'input', rows: '4', placeholder: 'Tempel JSON hasil yang diharapkan (opsional) untuk dibandingkan', 'aria-label': 'Hasil yang diharapkan' });
  const btn = h('button', { type: 'button', class: 'btn btn-primary' }, 'Jalankan Scan');

  btn.addEventListener('click', async () => {
    const f = file.files[0];
    if (!f) return toast('Pilih file dulu');
    btn.disabled = true;
    put(out, h('div', { class: 'skeleton', style: 'height:6rem' }));
    const t0 = performance.now();
    try {
      let blob = f, quality = {}, hints = [], tPrep = 0;
      if (!raw.checked) {
        const p = await prepareImage(f);
        blob = p.blob; quality = { blur: !!p.quality?.blur, dark: !!(p.quality?.dark || p.quality?.overexposed), lowRes: !!p.quality?.lowRes };
        hints = qualityHints(p.quality || {});
        tPrep = Math.round(performance.now() - t0);
      }
      const t1 = performance.now();
      let res;
      try { res = await api.scan(blob, quality); }
      catch (e) {
        put(out, h('div', { class: 'banner banner-err' }, h('strong', null, `Gagal [${e.code || 'error'}${e.status ? ` · HTTP ${e.status}` : ''}]`), h('div', null, e.message), e.details?.length ? h('pre', { class: 'json' }, JSON.stringify(e.details, null, 2)) : null));
        qa.auto.scan = { at: Date.now(), ok: false, error: e.message, code: e.code }; persist();
        btn.disabled = false; return;
      }
      const d = res.data, ms = Math.round(performance.now() - t1);
      const rows = [
        { name: 'Respons server', status: 'pass', detail: `${ms} ms total · server ${d.ms || '-'} ms${res.cached ? ' · dari cache' : ''} · upload ${fmtBytes(blob.size)} · kompres browser ${tPrep} ms` },
        { name: 'Matematika cocok', status: d.reconciled ? 'pass' : 'warn', detail: d.reconciled ? 'Jumlah item = subtotal, subtotal ± biaya = total' : 'Tidak cocok: ' + (d.warnings || []).join(' | ') },
        { name: 'Mesin OCR', status: 'pass', detail: d.engine },
        { name: 'Waktu < 8 dtk (target)', status: ms < 8000 ? 'pass' : 'warn', detail: `${(ms / 1000).toFixed(1)} dtk` },
        { name: 'Pemrosesan gambar server', status: 'pass', detail: JSON.stringify(d.prep) },
      ];
      if (hints.length) rows.push({ name: 'Saran kualitas dari browser', status: 'warn', detail: hints.join(' · ') });
      const flagged = d.items.filter((i) => i.needs_review).length;
      rows.push({ name: 'Baris "Cek ulang"', status: flagged ? 'warn' : 'pass', detail: `${flagged} dari ${d.items.length}` });

      // perbandingan dengan hasil yang diharapkan
      let cmp = null;
      if (expected.value.trim()) {
        try {
          const e = JSON.parse(expected.value);
          const itemsOk = d.items.length === e.items.length && d.items.every((it, i) => it.qty === e.items[i].qty && it.line_total === e.items[i].line_total);
          rows.push({ name: 'Jumlah item', status: d.items.length === e.items.length ? 'pass' : 'fail', detail: `terbaca ${d.items.length}, diharapkan ${e.items.length}` });
          rows.push({ name: 'Qty dan total tiap item', status: itemsOk ? 'pass' : 'fail', detail: itemsOk ? 'cocok semua' : 'ada baris berbeda (lihat tabel)' });
          for (const k of ['subtotal', 'service_charge', 'tax', 'discount', 'delivery_fee', 'platform_fee', 'tip', 'rounding', 'total']) {
            if (e[k] !== undefined && e[k] !== d[k]) rows.push({ name: `Nilai ${k}`, status: 'fail', detail: `terbaca ${rp(d[k])}, diharapkan ${rp(e[k])}` });
          }
          cmp = e;
        } catch (err) { rows.push({ name: 'JSON yang diharapkan', status: 'fail', detail: 'JSON tidak valid: ' + err.message }); }
      }
      qa.auto.scan = { at: Date.now(), ok: true, engine: d.engine, ms, reconciled: d.reconciled, items: d.items.length, total: d.total, file: f.name }; persist();

      put(out,
        h('div', { class: 'card stack' },
          h('div', { class: 'row-between wrap' }, h('div', null, h('div', { class: 't-sm' }, d.merchant || '(tanpa nama)'), h('div', { class: 't-body-sm muted' }, `${d.date || 'tanpa tanggal'} · ${d.receipt_type} · ${d.currency}`)), h('div', { class: 't-md num' }, rp(d.total))),
          resultTable(rows),
          d.warnings?.length ? h('div', { class: 'banner banner-warn' }, h('strong', null, 'Peringatan dari OCR'), h('ul', null, d.warnings.map((w) => h('li', null, w)))) : null),
        h('div', { class: 'card stack-sm' }, h('div', { class: 't-sm' }, 'Item terbaca'),
          h('div', { class: 'qa-scroll' }, h('table', { class: 'qa-table' },
            h('thead', null, h('tr', null, ['Nama', 'Qty', 'Harga', 'Potongan', 'Total', 'Yakin', ''].map((x) => h('th', null, x)))),
            h('tbody', null, d.items.map((it, i) => h('tr', null,
              h('td', null, it.name), h('td', { class: 'num' }, String(it.qty)), h('td', { class: 'num' }, rp(it.unit_price)), h('td', { class: 'num' }, rp(it.discount)), h('td', { class: 'num strong' }, rp(it.line_total)),
              h('td', { class: 'num' }, `${Math.round(it.confidence * 100)}%`),
              h('td', null, it.needs_review ? h('span', { class: 'badge badge-warn' }, 'Cek ulang') : cmp?.items?.[i] && (cmp.items[i].qty !== it.qty || cmp.items[i].line_total !== it.line_total) ? h('span', { class: 'badge badge-fail' }, `harap ${cmp.items[i].qty}× ${rp(cmp.items[i].line_total)}`) : null)))))),
          h('div', { class: 'row-between t-body-sm muted wrap' }, ['subtotal', 'discount', 'service_charge', 'tax', 'delivery_fee', 'platform_fee', 'tip', 'rounding'].filter((k) => d[k]).map((k) => h('span', null, `${S.CHARGE_LABELS[k] || 'Subtotal'}: ${rp(d[k])}`)))),
        h('details', { class: 'card-flat' }, h('summary', { class: 'link' }, 'JSON mentah'),
          h('div', { class: 'row', style: 'margin:var(--sp-sm) 0' }, h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onClick: async () => toast((await copyText(JSON.stringify(d, null, 2))) ? 'JSON disalin' : 'Gagal menyalin') }, 'Salin JSON')),
          h('pre', { class: 'json' }, JSON.stringify(d, null, 2))));
    } catch (e) { put(out, h('div', { class: 'banner banner-err' }, e.message)); }
    btn.disabled = false;
  });

  return h('div', { class: 'stack-lg' },
    h('div', { class: 'card stack' },
      h('div', { class: 't-sm' }, 'Uji pembacaan struk (OCR)'),
      h('p', { class: 'muted' }, 'Mengirim file lewat jalur yang sama dengan aplikasi (kompres di browser, lalu /api/scan) dan menampilkan hasil mentah, waktu, mesin yang dipakai, dan pemeriksaan matematika. Hasil yang lolos validasi disimpan di cache berdasarkan isi file, jadi mengunggah file yang sama akan menampilkan "dari cache".'),
      h('div', { class: 'field' }, h('label', null, 'File struk (JPG, PNG, WebP, HEIC, PDF)'), file),
      h('label', { class: 'check' }, raw, 'Kirim file asli tanpa kompres (uji batas ukuran upload server)'),
      h('div', { class: 'field' }, h('label', null, 'Hasil yang diharapkan (opsional)'), expected),
      btn),
    out);
}

// ================================================================== 3. Uji hitungan
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function mathTests(seed) {
  const rnd = mulberry32(seed);
  const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const rows = [];
  const t = (name, fn) => { try { const d = fn(); rows.push({ name, status: 'pass', detail: d || '' }); } catch (e) { rows.push({ name, status: 'fail', detail: e.message }); } };
  const eq = (a, b, m) => { if (a !== b) throw new Error(`${m}: dapat ${a}, seharusnya ${b}`); };
  const ppl = (n) => Array.from({ length: n }, (_, i) => ({ id: i === 0 ? 'owner' : `p${i}`, name: i === 0 ? 'Saya' : `Teman ${i}` }));

  t('allocate: jumlah selalu persis (2000 percobaan acak)', () => {
    for (let i = 0; i < 2000; i++) {
      const amount = ri(-500000, 500000), w = Array.from({ length: ri(1, 9) }, () => ri(0, 20) / (ri(1, 3)));
      eq(S.allocate(amount, w).reduce((s, x) => s + x, 0), amount, `allocate(${amount}, [${w}])`);
    }
    return '2000 kasus';
  });
  t('hitung struk acak: total semua orang = total struk (500 percobaan)', () => {
    for (let i = 0; i < 500; i++) {
      const people = ppl(ri(1, 8));
      const items = Array.from({ length: ri(1, 10) }, (_, k) => ({ id: `i${k}`, name: `Item ${k}`, qty: ri(1, 5), unit_price: ri(1, 200) * 500, discount: rnd() < 0.2 ? ri(0, 5) * 500 : 0 }));
      const charges = { discount: ri(0, 4) * 1000, service_charge: ri(0, 20) * 500, tax: ri(0, 30) * 500, delivery_fee: ri(0, 20) * 1000, platform_fee: ri(0, 5) * 1000, tip: ri(0, 10) * 1000, rounding: ri(-3, 3) * 50 };
      const modes = Object.fromEntries(S.CHARGE_KEYS.map((k) => [k, rnd() < 0.5 ? 'proportional' : 'equal']));
      const asg = {};
      for (const it of items) if (rnd() < 0.7) {
        const ids = people.filter(() => rnd() < 0.5).map((p) => p.id);
        if (ids.length) { const mode = ['equal', 'portion', 'percent'][ri(0, 2)]; asg[it.id] = { mode, shares: Object.fromEntries(ids.map((id) => [id, mode === 'equal' ? 1 : mode === 'portion' ? ri(1, 4) : 100 / ids.length])) }; }
      }
      const r = { id: 'r', label: 'S', items, charges, modes };
      const res = S.computeReceipt(r, people, asg);
      eq(res.people.reduce((s, p) => s + p.total, 0), S.receiptTotal(r), `struk acak #${i}`);
      for (const step of S.ROUND_STEPS) eq(S.applyRounding(res, step, 'owner').people.reduce((s, p) => s + p.payTotal, 0), res.grandTotal, `pembulatan ${step} pada struk #${i}`);
    }
    return '500 struk × 4 pilihan pembulatan';
  });
  t('pembulatan: teman kelipatan langkah, selisih ke penagih', () => {
    const people = ppl(4);
    const r = { id: 'r', label: 'S', items: [{ id: 'a', name: 'A', qty: 1, unit_price: 123457, discount: 0 }], charges: { tax: 12346 } };
    for (const step of [100, 500, 1000]) {
      const out = S.applyRounding(S.computeReceipt(r, people, {}), step, 'owner');
      for (const p of out.people.filter((x) => x.id !== 'owner')) eq(p.payTotal % step, 0, `kelipatan ${step} untuk ${p.name}`);
    }
  });
  t('validasi persentase 100% dan porsi > 0', () => {
    eq(S.validateAssignment({ mode: 'percent', shares: { a: 60, b: 30 } }).ok, false, '90%');
    eq(S.validateAssignment({ mode: 'percent', shares: { a: 60, b: 40 } }).ok, true, '100%');
    eq(S.validateAssignment({ mode: 'portion', shares: { a: 0 } }).ok, false, 'porsi 0');
    eq(S.validateAssignment({ mode: 'equal', shares: {} }).ok, false, 'kosong');
  });
  t('contoh nyata: pizza dibagi 3 + service/pajak proporsional', () => {
    const people = ppl(3);
    const r = { id: 'r', label: 'S', items: [{ id: 'a', name: 'Nasi', qty: 1, unit_price: 60000, discount: 0 }, { id: 'b', name: 'Pizza', qty: 1, unit_price: 90000, discount: 0 }], charges: { service_charge: 15000 }, modes: { service_charge: 'proportional' } };
    const res = S.computeReceipt(r, people, { a: { mode: 'equal', shares: { owner: 1 } }, b: { mode: 'equal', shares: { owner: 1, p1: 1, p2: 1 } } });
    const by = Object.fromEntries(res.people.map((p) => [p.id, p.total]));
    eq(by.owner, 60000 + 30000 + 15000 * (90000 / 150000), 'penagih');
    eq(by.p1, 30000 + 15000 * (30000 / 150000), 'teman 1');
    eq(res.grandTotal, 165000, 'total');
  });
  t('gabungan dua struk dijumlah per orang', () => {
    const people = ppl(3);
    const mk = (id, price, tax) => ({ id, label: id, items: [{ id: `${id}i`, name: 'X', qty: 1, unit_price: price, discount: 0 }], charges: { tax }, assignments: {} });
    const s = S.computeSession({ receipts: [mk('r1', 100001, 7001), mk('r2', 55555, 3333)], people, ownerId: 'owner', roundStep: 500 });
    eq(s.combined.grandTotal, 100001 + 7001 + 55555 + 3333, 'total gabungan');
    eq(s.combined.people.reduce((a, p) => a + p.payTotal, 0), s.combined.grandTotal, 'jumlah gabungan');
  });
  t('mata uang asing: JPY dan USD (sen) ke rupiah', () => {
    const base = { discount: 0, service_charge: 0, tax: 0, delivery_fee: 0, platform_fee: 0, tip: 0, rounding: 0 };
    eq(S.convertToIdr({ ...base, currency: 'JPY', items: [{ id: 'a', name: 'x', qty: 2, unit_price: 160, discount: 0 }] }, 105).items[0].unit_price, 16800, 'JPY');
    eq(S.convertToIdr({ ...base, currency: 'USD', items: [{ id: 'a', name: 'x', qty: 1, unit_price: 450, discount: 0 }] }, 16000).items[0].unit_price, 72000, 'USD sen');
  });
  t('kasus tepi: satu orang, harga 0, qty besar, potongan penuh', () => {
    const r = { id: 'r', label: 'S', items: [{ id: 'a', name: 'A', qty: 999, unit_price: 1000000, discount: 0 }, { id: 'b', name: 'B', qty: 1, unit_price: 0, discount: 0 }, { id: 'c', name: 'C', qty: 1, unit_price: 5000, discount: 5000 }], charges: {} };
    const res = S.computeReceipt(r, ppl(1), {});
    eq(res.grandTotal, 999000000, 'total'); eq(res.people[0].total, 999000000, 'orang tunggal');
  });
  return rows;
}

function mathTab() {
  const out = h('div', { class: 'stack' });
  let seed = 20261019;
  const runBtn = h('button', { type: 'button', class: 'btn btn-primary' }, 'Jalankan Uji Hitungan');
  const run = () => {
    const rows = mathTests(seed);
    qa.auto.math = { at: Date.now(), rows, seed }; persist();
    put(out, h('div', { class: 'card stack' }, h('div', { class: 'row-between wrap' }, h('div', { class: 't-sm' }, summaryText(rows)), h('span', { class: 't-body-sm muted' }, `seed ${seed}`)), resultTable(rows)));
  };
  runBtn.addEventListener('click', () => { seed = ((Math.random() * 1e9) | 0); run(); });
  return h('div', { class: 'stack-lg' },
    h('div', { class: 'card stack' }, h('div', { class: 't-sm' }, 'Uji hitungan pembagian (di browser)'),
      h('p', { class: 'muted' }, 'Menjalankan modul hitung yang sama dengan aplikasi pada ratusan struk acak. Yang dibuktikan: total semua orang selalu persis sama dengan total struk, termasuk setelah pembulatan. Tiap klik memakai seed acak baru; seed ditampilkan agar kegagalan bisa diulang.'),
      h('div', { class: 'row wrap' }, runBtn, h('button', { type: 'button', class: 'btn btn-secondary', onClick: run }, 'Ulangi seed yang sama'))),
    out);
}

// ================================================================== 4. Uji alur API (smoke)
function apiTab() {
  const out = h('div', { class: 'stack' });
  const btn = h('button', { type: 'button', class: 'btn btn-primary' }, 'Jalankan Uji Alur API');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    const rows = [];
    const add = (name, ok, detail, status) => { rows.push({ name, status: status || (ok ? 'pass' : 'fail'), detail }); put(out, h('div', { class: 'card stack' }, resultTable(rows))); return ok; };
    let ownerToken = null, publicToken = null;
    try {
      const people = [{ id: 'owner', name: 'QA Penagih' }, { id: 'p1', name: 'QA Andi' }, { id: 'p2', name: 'QA Bima' }];
      const payload = {
        name: `QA ${new Date().toLocaleTimeString('id-ID')}`, date: new Date().toISOString().slice(0, 10), ownerId: 'owner', roundStep: 500, people,
        receipts: [{ id: 'r1', label: 'Struk 1', items: [{ id: 'i1', name: 'Nasi', qty: 2, unit_price: 35000, discount: 0 }, { id: 'i2', name: 'Pizza', qty: 1, unit_price: 90000, discount: 0 }],
          charges: { tax: 16000, service_charge: 8000, discount: 0, delivery_fee: 0, platform_fee: 0, tip: 0, rounding: 0 }, assignments: { i1: { mode: 'equal', shares: { p1: 1 } }, i2: { mode: 'equal', shares: { p1: 1, p2: 1, owner: 1 } } } }],
        payment: { holder: 'QA', bankName: 'BCA', bankNumber: '1234567890', ewallets: [{ type: 'GoPay', number: '0812000000' }], qrisFile: null },
      };
      const expectTotal = 70000 + 90000 + 16000 + 8000;
      let t = performance.now();
      const c = await api.createBill(payload); ownerToken = c.ownerToken; publicToken = c.publicToken;
      add('Buat tagihan (POST /api/bills)', c.grandTotal === expectTotal, `${Math.round(performance.now() - t)} ms · total ${rp(c.grandTotal)} (server menghitung ulang)`);
      add('Token berbeda dan cukup panjang', ownerToken !== publicToken && ownerToken.length >= 22 && publicToken.length >= 22, `${ownerToken.length} karakter`);

      t = performance.now();
      const o = await api.getBill(ownerToken);
      add('Baca sebagai penagih', o.bill.peopleCount === 3 && o.bill.payerCount === 2, `${Math.round(performance.now() - t)} ms`);

      const pub = await api.getPublic(publicToken);
      add('Halaman publik tidak membocorkan tautan penagih', !JSON.stringify(pub).includes(ownerToken), 'ownerToken tidak ada di respons');
      const parts = await Promise.all(people.map((p) => api.getPerson(publicToken, p.id)));
      const sum = parts.reduce((s, x) => s + x.person.total, 0);
      add('Total semua orang = total struk', sum === expectTotal, `${rp(sum)} (pembulatan Rp500 diserap penagih)`);
      add('Nominal teman kelipatan 500', parts.filter((x) => !x.person.isOwner).every((x) => x.person.total % 500 === 0), parts.map((x) => `${x.person.name} ${rp(x.person.total)}`).join(' · '));

      const paid = await api.markPaid(publicToken, 'p1');
      add('Teman menandai bayar → "menunggu"', paid.status === 'menunggu', paid.status);
      let own = await api.getBill(ownerToken);
      add('Penagih melihat status menunggu', own.bill.people.find((p) => p.id === 'p1').status === 'menunggu' && own.bill.waitingCount === 1, 'sinkron antar peran');
      let ownerBlocked = false; try { await api.markPaid(publicToken, 'owner'); } catch { ownerBlocked = true; }
      add('Penagih tidak bisa ditandai bayar lewat tautan publik', ownerBlocked, 'ditolak (400)');

      await api.patchBill(ownerToken, { statuses: { p1: 'lunas', p2: 'lunas' } });
      own = await api.getBill(ownerToken);
      add('Konfirmasi penagih → lunas semua', own.bill.settled && own.bill.paidCount === 2, `terkumpul ${rp(own.bill.collected)}`);
      const lk = await api.lookup([ownerToken, 'tokenpalsu1234567890abcd']);
      add('Lookup riwayat (ditemukan + tidak ditemukan)', lk.bills.length === 1 && lk.missing.length === 1, '1 ditemukan, 1 hilang');

      // QRIS
      const cv = document.createElement('canvas'); cv.width = cv.height = 120; const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, 120, 120); cx.fillStyle = '#000'; for (let i = 0; i < 60; i++) cx.fillRect((i * 37) % 110, (i * 53) % 110, 8, 8);
      const png = await new Promise((r) => cv.toBlob(r, 'image/png'));
      try {
        const q = await api.uploadQris(new File([png], 'qris-test.png', { type: 'image/png' }));
        const img = await fetch(q.url);
        add('Unggah dan baca QRIS', img.ok && img.headers.get('content-type') === 'image/webp', `${q.url} · ${fmtBytes((await img.arrayBuffer()).byteLength)}`);
      } catch (e) { add('Unggah dan baca QRIS', false, e.message); }

      // hapus
      await api.deleteBill(ownerToken);
      let g1 = 0, g2 = 0;
      try { await api.getBill(ownerToken); } catch (e) { g1 = e.status; }
      try { await api.getPublic(publicToken); } catch (e) { g2 = e.status; }
      add('Hapus tagihan: tautan penagih dan teman ikut mati', g1 === 404 && g2 === 404, `HTTP ${g1} dan ${g2}`);
      ownerToken = null;
    } catch (e) {
      add('Alur terhenti', false, `${e.message}${e.code ? ` [${e.code}]` : ''}`);
      if (ownerToken) { try { await api.deleteBill(ownerToken); add('Bersihkan data uji', true, 'tagihan uji dihapus', 'skip'); } catch { add('Bersihkan data uji', false, 'gagal menghapus, akan kedaluwarsa otomatis dalam 90 hari', 'warn'); } }
    }
    qa.auto.api = { at: Date.now(), rows }; persist();
    toast(summaryText(rows));
    btn.disabled = false;
  });
  return h('div', { class: 'stack-lg' },
    h('div', { class: 'card stack' }, h('div', { class: 't-sm' }, 'Uji alur API ujung ke ujung'),
      h('p', { class: 'muted' }, 'Membuat tagihan uji, memeriksa pembagian dan pembulatan, alur teman → penagih, QRIS, riwayat, lalu menghapus tagihan itu. Membuktikan penyimpanan server (Redis di Vercel) benar-benar bekerja.'), btn),
    out);
}

// ================================================================== 5. Checklist manual
function manualTab() {
  let group = 'Semua', statusFilter = 'all';
  const list = h('div'); const summary = h('div', { class: 'card stack-sm' });
  const get = (id) => qa.manual[id] || { status: null, note: '' };
  const set = (id, patch) => { qa.manual[id] = { ...get(id), ...patch, at: Date.now() }; persist(); paintSummary(); };

  function paintSummary() {
    const c = { pass: 0, fail: 0, skip: 0, todo: 0 };
    CASES.forEach((x) => { c[get(x.id).status || 'todo']++; });
    const done = CASES.length - c.todo;
    put(summary, h('div', { class: 'row-between wrap' }, h('div', { class: 't-sm' }, `${done} dari ${CASES.length} kasus dinilai`), h('div', { class: 'row wrap' }, h('span', { class: 'badge badge-ok' }, `${c.pass} lulus`), h('span', { class: 'badge badge-fail' }, `${c.fail} gagal`), h('span', { class: 'badge badge-neutral' }, `${c.skip} dilewati`), h('span', { class: 'badge badge-warn' }, `${c.todo} belum`))),
      h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(CASES.length), 'aria-valuenow': String(done) }, h('i', { style: `width:${(done / CASES.length) * 100}%` })));
  }

  function paint() {
    const items = CASES.filter((c) => (group === 'Semua' || c.group === group) && (statusFilter === 'all' || (statusFilter === 'todo' ? !get(c.id).status : get(c.id).status === statusFilter)));
    put(list, items.length ? items.map((c) => {
      const cur = get(c.id);
      const card = h('div', { class: `qa-case${cur.status === 'fail' ? ' fail' : cur.status === 'pass' ? ' pass' : ''}` });
      const seg = h('div', { class: 'seg', role: 'group', 'aria-label': `Hasil ${c.id}` });
      const paintSeg = () => put(seg, [['pass', 'Lulus'], ['fail', 'Gagal'], ['skip', 'Lewati']].map(([k, label]) => h('button', { type: 'button', 'aria-pressed': String(get(c.id).status === k), onClick: () => { set(c.id, { status: get(c.id).status === k ? null : k }); card.className = `qa-case${get(c.id).status === 'fail' ? ' fail' : get(c.id).status === 'pass' ? ' pass' : ''}`; paintSeg(); } }, label)));
      paintSeg();
      put(card,
        h('div', { class: 'row-between wrap' }, h('div', null, h('span', { class: 'pill' }, c.id), ' ', h('span', { class: 'strong' }, c.title)), seg),
        h('ol', { class: 't-body-sm' }, c.steps.map((s) => h('li', null, s))),
        h('p', { class: 't-body-sm' }, h('span', { class: 'strong' }, 'Harapan: '), c.expect),
        h('input', { class: 'input', placeholder: 'Catatan (mis. perangkat, apa yang terjadi)', value: cur.note || '', 'aria-label': `Catatan ${c.id}`, onInput: (e) => set(c.id, { note: e.target.value }) }));
      return card;
    }) : h('div', { class: 'empty' }, 'Tidak ada kasus pada filter ini.'));
  }

  const groupSel = h('select', { class: 'input', 'aria-label': 'Filter kelompok', onChange: (e) => { group = e.target.value; paint(); } }, ['Semua', ...GROUPS].map((g) => h('option', { value: g }, g)));
  const statusSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Filter status' });
  const paintStatusSeg = () => put(statusSeg, [['all', 'Semua'], ['todo', 'Belum'], ['fail', 'Gagal'], ['pass', 'Lulus']].map(([k, label]) => h('button', { type: 'button', 'aria-pressed': String(statusFilter === k), onClick: () => { statusFilter = k; paintStatusSeg(); paint(); } }, label)));
  paintStatusSeg(); paintSummary(); paint();
  return h('div', { class: 'stack-lg' }, summary,
    h('div', { class: 'row wrap', style: 'gap:var(--sp-md)' }, h('div', { class: 'field', style: 'min-width:12rem' }, groupSel), statusSeg,
      h('button', { type: 'button', class: 'btn btn-quiet btn-sm', onClick: () => { if (confirm('Hapus semua penilaian manual?')) { qa.manual = {}; persist(); paintSummary(); paint(); } } }, 'Reset penilaian')),
    list);
}

// ================================================================== 6. Laporan
function reportMarkdown() {
  const lines = [];
  const d = new Date();
  lines.push(`# Laporan QA SplitBill`, '', `- Tanggal: ${d.toLocaleString('id-ID')}`, `- URL: ${location.origin}`, `- Browser: ${navigator.userAgent}`, `- Layar: ${innerWidth}×${innerHeight} (dpr ${devicePixelRatio})`, `- Koneksi: ${navigator.onLine ? 'online' : 'offline'}${navigator.connection?.effectiveType ? ` (${navigator.connection.effectiveType})` : ''}`, '');
  const sec = (title, a) => {
    if (!a) return lines.push(`## ${title}`, '', '_Belum dijalankan._', '');
    lines.push(`## ${title}`, `_dijalankan ${new Date(a.at).toLocaleString('id-ID')}_`, '');
    if (a.rows) { lines.push(`Ringkasan: ${summaryText(a.rows)}`, '', '| Cek | Hasil | Keterangan |', '|---|---|---|'); a.rows.forEach((r) => lines.push(`| ${r.name} | ${BADGE[r.status][1]} | ${(r.detail || '').replace(/\|/g, '/').replace(/\n/g, ' ')} |`)); }
    lines.push('');
  };
  sec('Cek sistem', qa.auto.system);
  ['claude', 'mistral'].forEach((t) => { const p = qa.auto[`ping_${t}`]; if (p) lines.push(`- Ping ${t}: ${p.ok ? 'OK' : 'GAGAL'} (${p.ms} ms) ${p.detail || ''}`); });
  lines.push('');
  lines.push('## Uji scan terakhir', '');
  const sc = qa.auto.scan;
  lines.push(sc ? (sc.ok ? `- ${sc.file}: engine ${sc.engine}, ${sc.ms} ms, ${sc.items} item, total ${rp(sc.total)}, matematika ${sc.reconciled ? 'cocok' : 'TIDAK cocok'}` : `- GAGAL: [${sc.code}] ${sc.error}`) : '_Belum dijalankan._', '');
  sec('Uji hitungan', qa.auto.math);
  sec('Uji alur API', qa.auto.api);

  const c = { pass: 0, fail: 0, skip: 0, todo: 0 };
  CASES.forEach((x) => { c[(qa.manual[x.id] || {}).status || 'todo']++; });
  lines.push('## Checklist manual', '', `Ringkasan: ${c.pass} lulus, ${c.fail} gagal, ${c.skip} dilewati, ${c.todo} belum dinilai (dari ${CASES.length})`, '');
  const fails = CASES.filter((x) => qa.manual[x.id]?.status === 'fail');
  if (fails.length) { lines.push('### Temuan (gagal)', ''); fails.forEach((x) => lines.push(`- **${x.id} ${x.title}**: ${qa.manual[x.id].note || '(tanpa catatan)'}  \n  Harapan: ${x.expect}`)); lines.push(''); }
  const noted = CASES.filter((x) => qa.manual[x.id]?.note && qa.manual[x.id].status !== 'fail');
  if (noted.length) { lines.push('### Catatan lain', ''); noted.forEach((x) => lines.push(`- ${x.id} ${x.title} [${(qa.manual[x.id].status || 'belum').toUpperCase()}]: ${qa.manual[x.id].note}`)); lines.push(''); }
  GROUPS.forEach((g) => {
    lines.push(`### ${g}`, '');
    CASES.filter((x) => x.group === g).forEach((x) => lines.push(`- [${{ pass: 'x', fail: '!', skip: '-' }[(qa.manual[x.id] || {}).status] || ' '}] ${x.id} ${x.title}`));
    lines.push('');
  });
  return lines.join('\n');
}

function reportTab() {
  const pre = h('pre', { class: 'json' });
  const refresh = () => { pre.textContent = reportMarkdown(); };
  refresh();
  return h('div', { class: 'stack-lg' },
    h('div', { class: 'card stack' }, h('div', { class: 't-sm' }, 'Laporan QA'),
      h('p', { class: 'muted' }, 'Gabungan hasil cek otomatis dan checklist manual, siap ditempel ke issue tracker atau dikirim ke tim.'),
      h('div', { class: 'row wrap' },
        h('button', { type: 'button', class: 'btn btn-primary', onClick: async () => { refresh(); toast((await copyText(pre.textContent)) ? 'Laporan disalin' : 'Gagal menyalin'); } }, 'Salin (Markdown)'),
        h('button', { type: 'button', class: 'btn btn-secondary', onClick: () => { refresh(); downloadBlob(new Blob([pre.textContent], { type: 'text/markdown' }), `qa-splitbill-${new Date().toISOString().slice(0, 10)}.md`); } }, 'Unduh .md'),
        h('button', { type: 'button', class: 'btn btn-secondary', onClick: () => downloadBlob(new Blob([JSON.stringify({ at: Date.now(), url: location.origin, ua: navigator.userAgent, ...qa }, null, 2)], { type: 'application/json' }), `qa-splitbill-${new Date().toISOString().slice(0, 10)}.json`) }, 'Unduh .json'),
        h('button', { type: 'button', class: 'btn btn-quiet', onClick: refresh }, 'Segarkan'))),
    pre);
}

// ================================================================== rangka halaman
const TABS = [['sistem', 'Cek Sistem', systemTab], ['scan', 'Uji Scan', scanTab], ['hitung', 'Uji Hitungan', mathTab], ['api', 'Uji Alur API', apiTab], ['manual', 'Checklist Manual', manualTab], ['laporan', 'Laporan', reportTab]];
const built = {};
const panel = h('div');
const tabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Bagian QA' });
let current = (location.hash || '#sistem').slice(1);
if (!TABS.some(([k]) => k === current)) current = 'sistem';

function show(key) {
  current = key; history.replaceState(null, '', '#' + key);
  put(tabs, TABS.map(([k, label]) => h('button', { type: 'button', class: 'tab', role: 'tab', 'aria-selected': String(k === key), onClick: () => show(k) }, label)));
  if (key === 'laporan') delete built[key]; // selalu segar
  built[key] ||= TABS.find(([k]) => k === key)[2]();
  put(panel, built[key]);
}

put(root,
  h('div', { class: 'stack' }, h('h1', { class: 't-lg' }, 'QA SplitBill'),
    h('p', { class: 'muted t-body-lg' }, 'Uji sistem, OCR, hitungan, dan alur API, lalu nilai checklist manual. Penilaian tersimpan di browser ini dan bisa diekspor sebagai laporan.'),
    h('div', { class: 'banner banner-info' }, 'Halaman ini tidak berisi rahasia. Diagnostik server (status key, uji Claude/Mistral) hanya jalan jika QA_TOKEN diatur di server. Hapus file qa.html bila tidak ingin dibuka publik.')),
  h('div', { style: 'height:var(--sp-md)' }), tabs, h('div', { style: 'height:var(--sp-md)' }), panel);
show(current);
