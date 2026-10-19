import { Router } from 'express';
import multer from 'multer';
import { cfg } from '../config.js';
import { getStore } from '../storage/index.js';
import { sha256 } from '../lib/tokens.js';
import { Limiter } from '../lib/queue.js';
import { rateLimit } from '../lib/ratelimit.js';
import { AppError, bad } from '../lib/errors.js';
import { sniffMime } from '../services/ocr/preprocess.js';
import { scanReceipt, ScanError, PROMPT_VERSION } from '../services/ocr/index.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: cfg.maxUploadBytes, files: 1 } });
const limiter = new Limiter(cfg.scanConcurrency);
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']);
const STATUS = { not_a_receipt: 422, unreadable: 422, too_long: 422, not_configured: 503, all_failed: 502, timeout: 504 };

export const scanRouter = Router();

scanRouter.post('/scan',
  rateLimit({ name: 'scan', max: cfg.scanRatePerMin, windowSec: 60, message: 'Terlalu banyak scan. Tunggu satu menit lalu coba lagi.' }),
  upload.single('image'),
  async (req, res, next) => {
    try {
      if (!req.file) throw bad('no_file', 'Foto struk belum dipilih');
      const mime = sniffMime(req.file.buffer);
      if (!mime || !ALLOWED.has(mime)) throw bad('bad_type', 'Format file tidak didukung. Gunakan JPG, PNG, WebP, HEIC, atau PDF.');

      let clientQuality = {};
      try { clientQuality = JSON.parse(req.body.quality || '{}') || {}; } catch { /* abaikan */ }

      const store = await getStore();
      const key = `${sha256(req.file.buffer)}|${PROMPT_VERSION}`;
      let hit = null;
      try { hit = await store.getCache(key); } catch { /* cache opsional */ }
      if (hit) return res.json({ ok: true, cached: true, data: JSON.parse(hit) });

      const work = limiter.run(() => scanReceipt({ buffer: req.file.buffer, mime, clientQuality }));
      let timer;
      const deadline = new Promise((_, rej) => { timer = setTimeout(() => rej(new ScanError('timeout', 'Pembacaan struk terlalu lama. Coba lagi atau isi manual.')), cfg.scanDeadlineMs); });
      let data;
      try { data = await Promise.race([work, deadline]); } finally { clearTimeout(timer); work.catch(() => {}); }

      if (data.reconciled) { try { await store.setCache(key, JSON.stringify(data)); } catch { /* cache opsional */ } }
      res.json({ ok: true, cached: false, data });
    } catch (e) {
      if (e instanceof ScanError) {
        // Log lengkap (tanpa key) muncul di Vercel Logs. Ke klien hanya kode + pesan singkat, tanpa isi balasan upstream.
        if (e.details?.length) console.error('[scan] gagal:', e.code, JSON.stringify(e.details));
        const details = (e.details || []).map(({ engine, code, message }) => ({ engine, code, message }));
        return next(new AppError(STATUS[e.code] || 500, e.code, e.message, { details }));
      }
      if (e?.message && /Input buffer|unsupported image|heif|VipsJpeg|corrupt/i.test(e.message)) {
        return next(bad('bad_image', 'Foto tidak bisa dibuka. Jika dari iPhone (HEIC), coba ambil screenshot atau simpan sebagai JPG.'));
      }
      next(e);
    }
  });
