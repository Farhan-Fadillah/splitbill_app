import { Router } from 'express';
import crypto from 'node:crypto';
import { cfg } from '../config.js';
import { getStore } from '../storage/index.js';
import { rateLimit } from '../lib/ratelimit.js';
import { AppError, notFound } from '../lib/errors.js';
import { pingClaude, pingMistral } from '../services/ocr/healthcheck.js';

// Endpoint diagnostik untuk halaman /qa.html. Nonaktif (404) kecuali QA_TOKEN diatur.
// Tidak pernah mengembalikan nilai key; hanya "terisi / belum".
export const qaRouter = Router();

const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

qaRouter.use('/qa', rateLimit({ name: 'qa', max: 20, windowSec: 60 }), (req, _res, next) => {
  if (!cfg.qaToken) return next(notFound('Mode QA nonaktif. Atur QA_TOKEN untuk mengaktifkan.'));
  if (!same(req.get('x-qa-token') || '', cfg.qaToken)) return next(new AppError(401, 'bad_token', 'Token QA salah'));
  next();
});

qaRouter.get('/qa/status', async (_req, res) => {
  const store = await getStore();
  let storage = { mode: store.mode, ok: false };
  try { storage = { mode: store.mode, ok: await store.probe() }; } catch (e) { storage = { mode: store.mode, ok: false, error: e.message }; }
  res.json({
    ok: true,
    env: {
      sumopod: { keySet: !!cfg.sumopod.key, baseUrl: cfg.sumopod.baseUrl, style: cfg.sumopod.style, model: cfg.sumopod.model },
      mistral: { keySet: !!cfg.mistral.key, ocrModel: cfg.mistral.ocrModel, chatModel: cfg.mistral.chatModel },
    },
    storage,
    runtime: { node: process.version, vercel: cfg.onVercel, region: process.env.VERCEL_REGION || null, env: process.env.VERCEL_ENV || process.env.NODE_ENV || null },
    limits: { maxUploadBytes: cfg.maxUploadBytes, scanDeadlineMs: cfg.scanDeadlineMs, hedgeMs: cfg.hedgeMs, scanRatePerMin: cfg.scanRatePerMin },
  });
});

qaRouter.post('/qa/ping', async (req, res) => {
  const target = req.body?.target;
  if (target !== 'claude' && target !== 'mistral') throw new AppError(400, 'bad_target', 'target harus claude atau mistral');
  res.json({ ok: true, target, result: await (target === 'claude' ? pingClaude() : pingMistral()) });
});
