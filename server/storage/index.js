import { cfg } from '../config.js';
import { AppError } from '../lib/errors.js';
import { createRedisStore } from './redis.js';

let cached = null;

function unconfigured() {
  const fail = async () => {
    throw new AppError(503, 'storage_not_configured', 'Penyimpanan belum diatur. Tambahkan Upstash Redis (UPSTASH_REDIS_REST_URL dan UPSTASH_REDIS_REST_TOKEN) di environment variables Vercel.');
  };
  // Penting: 'then' harus undefined, kalau tidak objek ini dianggap thenable dan `await getStore()` menggantung.
  return new Proxy({ mode: 'unconfigured' }, { get: (t, k) => (k in t ? t[k] : k === 'then' || typeof k === 'symbol' ? undefined : fail) });
}

/** Pilih penyimpanan: Redis bila ada kredensial, SQLite untuk lokal, dan "belum diatur" di Vercel tanpa Redis. */
export async function getStore() {
  if (cached) return cached;
  if (cfg.redis.url && cfg.redis.token) cached = createRedisStore({ ...cfg.redis, ttlDays: cfg.billTtlDays });
  else if (cfg.onVercel) cached = unconfigured();
  else {
    // Hanya untuk lokal/VPS. Di Vercel cabang ini tidak pernah jalan (dan better-sqlite3 dikeluarkan lewat excludeFiles di vercel.json).
    const { createSqliteStore } = await import('./sqlite.js');
    cached = createSqliteStore(cfg);
  }
  return cached;
}
export const resetStoreForTests = () => { cached = null; };
