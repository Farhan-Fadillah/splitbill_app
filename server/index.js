import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { cfg } from './config.js';
import { AppError } from './lib/errors.js';
import { getStore } from './storage/index.js';
import { qaRouter } from './routes/qa.js';
import { scanRouter } from './routes/scan.js';
import { billsRouter } from './routes/bills.js';
import { publicRouter } from './routes/public.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (cfg.onVercel) app.set('trust proxy', true);
  else if (cfg.trustProxy !== '0') app.set('trust proxy', /^\d+$/.test(cfg.trustProxy) ? Number(cfg.trustProxy) : cfg.trustProxy);

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));

  // CORS ketat: tanpa daftar origin, API hanya bisa dipakai dari domain yang sama.
  if (cfg.allowedOrigins.length) app.use('/api', cors({ origin: cfg.allowedOrigins }));

  app.use(express.json({ limit: '300kb' }));
  app.get('/health', async (_req, res) => {
    const store = await getStore().catch(() => null);
    res.json({ ok: true, uptime: Math.round(process.uptime()), storage: store?.mode || 'error', vercel: cfg.onVercel });
  });
  app.use('/api', scanRouter, billsRouter, publicRouter, qaRouter);
  app.use('/api', (_req, res) => res.status(404).json({ ok: false, error: { code: 'not_found', message: 'Endpoint tidak ditemukan' } }));

  // Di Vercel, folder public/ disajikan langsung oleh CDN dan rute halaman diatur di vercel.json.
  if (!cfg.onVercel) {
    const pub = path.join(cfg.root, 'public');
    const file = (p) => (_req, res) => res.sendFile(p);
    app.use(express.static(pub, { extensions: ['html'], index: 'index.html', maxAge: 0 }));
    app.get('/app', file(path.join(pub, 'app.html')));
    app.get('/s/:token', file(path.join(pub, 'share.html')));
    app.get('/b/:token', file(path.join(pub, 'owner.html')));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    let status = err.status || 500;
    let code = err.code || 'server_error';
    let message = err.message;
    if (err.name === 'MulterError') {
      status = 400;
      code = err.code === 'LIMIT_FILE_SIZE' ? 'too_large' : 'upload_error';
      message = err.code === 'LIMIT_FILE_SIZE' ? `Ukuran file melebihi batas ${Math.round(cfg.maxUploadBytes / 1048576)}MB` : 'Upload gagal';
    } else if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') {
      status = 400; code = 'bad_json'; message = 'Data yang dikirim tidak valid';
    } else if (status >= 500 && !(err instanceof AppError)) {
      console.error('[error]', err.code || '', err.message);
      message = 'Terjadi kesalahan di server. Coba lagi sebentar.';
    }
    res.status(status).json({ ok: false, error: { code, message, ...(err.extra || {}) } });
  });
  return app;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const store = await getStore();
  const removed = await store.purge();
  if (removed) console.log(`[cleanup] ${removed} tagihan kedaluwarsa dihapus`);
  setInterval(() => store.purge().catch(() => {}), 6 * 3600 * 1000).unref();
  createApp().listen(cfg.port, () => {
    console.log(`SplitBill berjalan di http://localhost:${cfg.port}  (penyimpanan: ${store.mode})`);
    if (!cfg.sumopod.key) console.warn('! SUMOPOD_API_KEY kosong (Claude tidak aktif)');
    if (!cfg.mistral.key) console.warn('! MISTRAL_API_KEY kosong (fallback Mistral tidak aktif)');
    if (cfg.qaToken) console.log('QA aktif di /qa.html (token dari QA_TOKEN)');
  });
}
