import { h } from '../util.js';
import { prepareImage, qualityHints } from '../imageprep.js';
import { api, ApiError } from '../api.js';
import { addReceipt, receiptFromScan, manualReceipt, photos, state } from '../store.js';
import { stepper, pageHead, banner } from './common.js';

export const title = 'Scan Struk';

const ENGINE_NAME = { claude: 'Claude', mistral: 'Mistral', enhanced: 'Claude (ulang)' };
/** Terjemahkan kode kegagalan OCR menjadi penjelasan yang bisa ditindaklanjuti. */
export function explainFailure(code, engine = 'claude') {
  const m = engine === 'mistral';
  if (/^http_(401|403)$/.test(code)) return 'API key ditolak';
  if (code === 'http_404') return m ? 'endpoint atau model Mistral tidak ditemukan (periksa MISTRAL_OCR_MODEL dan MISTRAL_CHAT_MODEL)' : 'endpoint atau model tidak ditemukan (periksa SUMOPOD_API_STYLE, SUMOPOD_BASE_URL, dan CLAUDE_MODEL)';
  if (code === 'http_400') return m ? 'permintaan ditolak Mistral (nama model atau format tidak cocok)' : 'permintaan ditolak gateway (format atau nama model tidak cocok)';
  if (code === 'http_413') return 'file terlalu besar untuk gateway';
  if (code === 'http_429') return 'kuota habis atau kena rate limit';
  if (/^http_5\d\d$/.test(code)) return 'gateway sedang bermasalah';
  if (code === 'timeout') return 'gateway terlalu lama membalas';
  if (code === 'network') return 'gateway tidak terjangkau dari server';
  if (code === 'invalid_json') return 'balasan model bukan JSON yang valid';
  if (code === 'schema') return 'format balasan model tidak sesuai';
  if (code === 'unreadable') return 'model menyatakan struk tidak terbaca';
  return code;
}
const MAX_ORIGINAL = 10 * 1024 * 1024; // batas file asli (foto akan dikompres browser)
const OK_EXT = /\.(jpe?g|png|webp|heic|heif|pdf)$/i;

export function render(root, { go }) {
  let original = null, rotation = 0, prepared = null;
  let busy = false, stage = 0, error = null, processing = false;
  const adding = state.receipts.length > 0;
  let maxUpload = 10 * 1024 * 1024; // diperbarui dari /api/config (di Vercel: 4MB)
  api.config().then((c) => { if (c.maxUploadBytes) maxUpload = c.maxUploadBytes; }).catch(() => {});
  const wrap = h('div', { class: 'narrow', style: 'margin:0 auto' });
  root.replaceChildren(wrap);

  const fileInput = h('input', { type: 'file', class: 'sr-only', accept: 'image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,.heic,.heif,.pdf', 'aria-label': 'Pilih foto struk', tabindex: '-1', onChange: (e) => pick(e.target.files[0]) });
  const camInput = h('input', { type: 'file', class: 'sr-only', accept: 'image/*', capture: 'environment', 'aria-label': 'Ambil foto struk', tabindex: '-1', onChange: (e) => pick(e.target.files[0]) });

  async function pick(file) {
    if (!file) return;
    error = null;
    if (!OK_EXT.test(file.name || '') && !/^image\/|application\/pdf/.test(file.type)) { error = { message: 'Format file tidak didukung. Gunakan JPG, PNG, WebP, HEIC, atau PDF.' }; return draw(); }
    if (file.size > MAX_ORIGINAL) { error = { message: 'Ukuran file melebihi 10MB. Perkecil atau foto ulang.' }; return draw(); }
    if (/pdf/i.test(file.type) || /\.pdf$/i.test(file.name || '')) {
      if (file.size > maxUpload) { error = { message: `PDF melebihi batas ${Math.round(maxUpload / 1048576)}MB di server ini. Ambil screenshot halaman struk atau kompres PDF-nya.` }; return draw(); }
    }
    original = file; rotation = 0;
    await prep();
  }

  async function prep() {
    processing = true; draw();
    try {
      if (prepared?.previewUrl) URL.revokeObjectURL(prepared.previewUrl);
      prepared = await prepareImage(original, rotation);
      if (prepared.blob.size > maxUpload) throw new Error(`Foto masih terlalu besar (${(prepared.blob.size / 1048576).toFixed(1)}MB, batas ${Math.round(maxUpload / 1048576)}MB). Coba foto ulang dengan resolusi lebih rendah.`);
    } catch (e) { prepared = null; original = null; error = { message: e.message }; }
    processing = false; draw();
  }

  const clear = () => { if (prepared?.previewUrl) URL.revokeObjectURL(prepared.previewUrl); original = null; prepared = null; error = null; rotation = 0; draw(); };
  const rotate = async (d) => { rotation = (rotation + d + 360) % 360; await prep(); };

  async function startScan() {
    if (!prepared || busy) return;
    busy = true; error = null; stage = 0; draw();
    const q = prepared.quality || {};
    try {
      await new Promise((r) => setTimeout(r, 350)); // beri waktu teks "Mengoptimalkan foto..."
      const res = await api.scan(prepared.blob, { blur: !!q.blur, dark: !!(q.dark || q.overexposed), lowRes: !!q.lowRes }, { onUploaded: () => { stage = 1; draw(); } });
      stage = 2; draw();
      await new Promise((r) => setTimeout(r, 350));
      const r = addReceipt(receiptFromScan(res.data));
      if (prepared.previewUrl) photos.set(r.id, prepared.previewUrl);
      go('/review');
    } catch (e) {
      busy = false;
      error = e instanceof ApiError ? e : { message: 'Terjadi kesalahan tak terduga. Coba lagi.' };
      draw();
    }
  }

  function manualWithPhoto() {
    const r = addReceipt(manualReceipt());
    if (prepared?.previewUrl) photos.set(r.id, prepared.previewUrl);
    go('/review');
  }

  const STAGES = ['Mengoptimalkan foto...', 'Membaca struk...', 'Memeriksa total...'];

  function draw() {
    const hints = prepared ? qualityHints(prepared.quality || {}) : [];
    const zone = prepared || processing
      ? h('div', { class: 'dropzone has-photo', style: 'cursor:default' },
        processing ? h('div', { class: 'stack-sm', style: 'align-items:center' }, h('div', { class: 'skeleton', style: 'width:12rem;height:14rem' }), h('p', { class: 'muted' }, 'Mengoptimalkan foto...')) :
          prepared.isPdf ? h('div', { class: 'stack-sm', style: 'align-items:center' }, h('div', { class: 't-sm' }, original.name), h('p', { class: 'muted' }, 'PDF siap dibaca (halaman pertama)')) :
            h('img', { class: 'preview', src: prepared.previewUrl, alt: 'Pratinjau foto struk' }),
        !busy && !processing && !prepared.isPdf ? h('div', { class: 'row wrap', style: 'justify-content:center' },
          h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onClick: () => rotate(-90) }, 'Putar Kiri'),
          h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onClick: () => rotate(90) }, 'Putar Kanan')) : null)
      : h('div', {
        class: 'dropzone', tabindex: '0', role: 'button', 'aria-label': 'Unggah foto struk',
        onClick: (e) => { if (!e.target.closest('button')) fileInput.click(); },
        onKeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } },
        onDragover: (e) => { e.preventDefault(); e.currentTarget.classList.add('drag'); },
        onDragleave: (e) => e.currentTarget.classList.remove('drag'),
        onDrop: (e) => { e.preventDefault(); e.currentTarget.classList.remove('drag'); pick(e.dataTransfer.files[0]); },
      },
        h('div', { class: 't-sm' }, 'Unggah foto struk'),
        h('p', { class: 'muted' }, 'Tarik file ke sini, atau pilih dari perangkat'),
        h('p', { class: 't-body-sm muted' }, 'JPG, PNG, WebP, HEIC, atau PDF · maksimal 10MB'),
        h('div', { class: 'row wrap', style: 'justify-content:center;margin-top:var(--sp-sm)' },
          h('button', { type: 'button', class: 'btn btn-primary', onClick: () => fileInput.click() }, 'Pilih File'),
          h('button', { type: 'button', class: 'btn btn-secondary', onClick: () => camInput.click() }, 'Ambil Foto')));

    const errBox = error ? banner('err', h('div', { class: 'stack-sm' },
      h('strong', null, error.code === 'not_a_receipt' ? 'Foto ini sepertinya bukan struk' : 'Struk belum bisa dibaca'),
      h('span', null, error.message),
      error.details?.length ? h('details', null,
        h('summary', { class: 'link', style: 'min-height:2rem' }, 'Detail teknis'),
        h('ul', { class: 't-body-sm', style: 'margin:.25rem 0 0 1.1rem;padding:0' }, error.details.map((d) => h('li', null, `${ENGINE_NAME[d.engine] || d.engine}: ${explainFailure(d.code, d.engine)} [${d.code}]`))),
        h('p', { class: 't-body-sm', style: 'margin-top:.25rem' }, 'Pemilik situs: buka halaman /qa, lalu jalankan "Tes Claude" dan "Tes Mistral OCR" untuk melihat pesan lengkap.')) : null,
      prepared ? h('div', { class: 'row wrap' },
        error.code !== 'not_a_receipt' && error.code !== 'bad_type' ? h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onClick: startScan }, 'Coba Lagi') : null,
        h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onClick: clear }, 'Ganti Foto'),
        h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onClick: manualWithPhoto }, 'Input Manual (foto tetap terlihat)')) : null)) : null;

    wrap.replaceChildren(
      stepper('scan'),
      pageHead(adding ? 'Tambah Struk' : 'Scan Struk', adding ? 'Struk tambahan akan digabung per orang di ringkasan.' : 'Unggah foto struk atau screenshot e-receipt untuk dibaca otomatis.'),
      h('div', { class: 'card stack' },
        zone, fileInput, camInput,
        hints.length ? h('ul', { class: 'hints' }, hints.map((t) => h('li', null, banner('warn', t)))) : null,
        !prepared && !processing ? h('p', { class: 't-body-sm muted' }, 'Tips: pastikan foto terang, tidak miring, dan seluruh struk terlihat dari atas sampai total.') : null,
        errBox,
        busy ? h('div', { class: 'stack-sm', role: 'status' },
          h('div', { class: 'progress' }, h('i', { style: `width:${[25, 65, 92][stage]}%` })),
          h('p', { class: 'muted' }, STAGES[stage])) : null,
        h('div', { class: 'row wrap', style: 'gap:var(--sp-md)' },
          h('button', { type: 'button', class: 'btn btn-secondary grow', disabled: !prepared || busy, onClick: clear }, 'Hapus Foto'),
          h('button', { type: 'button', class: 'btn btn-primary grow', disabled: !prepared || busy || processing, onClick: startScan }, busy ? 'Memproses...' : 'Scan Struk'))),
      h('p', { style: 'margin-top:var(--sp-md);text-align:center' }, 'Tidak ada foto? ', h('a', { class: 'link', href: '#/manual' }, 'Input manual')));
  }
  draw();
}
