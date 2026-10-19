// Penyimpanan untuk Vercel: Upstash Redis lewat REST (tanpa dependensi tambahan).
// Env: UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (atau KV_REST_API_URL + KV_REST_API_TOKEN dari integrasi Vercel).
// Semua kunci punya TTL = 90 hari sejak terakhir dibuka, jadi tidak perlu cron pembersih.
const DAY = 86400;

export function createRedisStore({ url, token, ttlDays = 90 }) {
  const TTL = ttlDays * DAY;
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

  async function post(path, body) {
    let res;
    try { res = await fetch(url + path, { method: 'POST', headers, body: JSON.stringify(body) }); }
    catch (e) { throw new Error(`Redis tidak terjangkau: ${e.cause?.code || e.message}`); }
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`Redis HTTP ${res.status}: ${json?.error || ''}`);
    return json;
  }
  const cmd = async (c) => { const j = await post('', c); if (j.error) throw new Error(j.error); return j.result; };
  const pipe = async (cs) => {
    const arr = await post('/pipeline', cs);
    return arr.map((x) => { if (x.error) throw new Error(x.error); return x.result; });
  };
  const pairs = (flat) => { const o = {}; for (let i = 0; i < (flat || []).length; i += 2) o[flat[i]] = flat[i + 1]; return o; };
  const parse = (s) => { try { return JSON.parse(s); } catch { return null; } };

  const kO = (t) => `bill:o:${t}`, kP = (t) => `bill:p:${t}`, kS = (t) => `bill:s:${t}`;

  async function load(ownerToken) {
    const [raw, st] = await pipe([['GET', kO(ownerToken)], ['HGETALL', kS(ownerToken)]]);
    const r = raw && parse(raw);
    if (!r) return null;
    const statuses = {};
    for (const [pid, v] of Object.entries(pairs(st))) { const o = parse(v); if (o) statuses[pid] = o; }
    return { ownerToken, publicToken: r.publicToken, data: r.data, statuses, createdAt: r.createdAt, updatedAt: r.updatedAt };
  }

  return {
    mode: 'redis',
    async createBill({ ownerToken, publicToken, data }) {
      const t = Date.now();
      await pipe([
        ['SET', kO(ownerToken), JSON.stringify({ data, publicToken, createdAt: t, updatedAt: t }), 'EX', TTL],
        ['SET', kP(publicToken), ownerToken, 'EX', TTL],
      ]);
    },
    getBillByOwner: load,
    async getBillByPublic(publicToken) {
      const ot = await cmd(['GET', kP(publicToken)]);
      return ot ? load(ot) : null;
    },
    async setStatus(ownerToken, pid, value) {
      await pipe([['HSET', kS(ownerToken), pid, JSON.stringify(value)], ['EXPIRE', kS(ownerToken), TTL]]);
    },
    async updateBillData(ownerToken, data) {
      const raw = await cmd(['GET', kO(ownerToken)]);
      const r = raw && parse(raw);
      if (!r) return;
      await cmd(['SET', kO(ownerToken), JSON.stringify({ ...r, data, updatedAt: Date.now() }), 'EX', TTL]);
    },
    async touch(ownerToken, publicToken) {
      const c = [['EXPIRE', kO(ownerToken), TTL], ['EXPIRE', kS(ownerToken), TTL]];
      if (publicToken) c.push(['EXPIRE', kP(publicToken), TTL]);
      await pipe(c);
    },
    async deleteBill(ownerToken) {
      const raw = await cmd(['GET', kO(ownerToken)]);
      const r = raw && parse(raw);
      if (!r) return false;
      await pipe([['DEL', kO(ownerToken)], ['DEL', kP(r.publicToken)], ['DEL', kS(ownerToken)]]);
      return true;
    },

    async getCache(key) { return cmd(['GET', `scan:${key}`]); },
    async setCache(key, json) { await cmd(['SET', `scan:${key}`, json, 'EX', 30 * DAY]); },

    async putQris(file, buffer) { await cmd(['SET', `qris:${file}`, buffer.toString('base64'), 'EX', TTL]); },
    async getQris(file) {
      const b64 = await cmd(['GET', `qris:${file}`]);
      if (!b64) return null;
      cmd(['EXPIRE', `qris:${file}`, TTL]).catch(() => {});
      return Buffer.from(b64, 'base64');
    },

    async incr(key, windowSec) {
      const [n] = await pipe([['INCR', key], ['EXPIRE', key, windowSec, 'NX']]);
      return n;
    },
    async addReport(note, data) { await pipe([['LPUSH', 'reports', JSON.stringify({ note, data, at: Date.now() })], ['LTRIM', 'reports', 0, 499]]); },
    async probe() { const k = 'qa:probe'; await cmd(['SET', k, String(Date.now()), 'EX', 60]); return (await cmd(['GET', k])) !== null; },
    async purge() { return 0; }, // TTL Redis yang mengurus kedaluwarsa
  };
}
