import { getStore } from '../storage/index.js';

/**
 * Pembatas laju berbasis storage (jendela tetap). Di Vercel memakai Redis sehingga berlaku lintas instance.
 * Jika storage bermasalah, permintaan tetap diloloskan (fail-open) supaya aplikasi tidak ikut mati.
 */
export function rateLimit({ name, max, windowSec = 60, message = 'Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.' }) {
  return async (req, res, next) => {
    try {
      const store = await getStore();
      const bucket = Math.floor(Date.now() / (windowSec * 1000));
      const n = await store.incr(`rl:${name}:${req.ip || 'anon'}:${bucket}`, windowSec);
      res.setHeader('RateLimit-Limit', String(max));
      res.setHeader('RateLimit-Remaining', String(Math.max(0, max - n)));
      if (n > max) {
        res.setHeader('Retry-After', String(windowSec));
        return res.status(429).json({ ok: false, error: { code: 'rate_limited', message } });
      }
    } catch { /* fail-open */ }
    next();
  };
}
