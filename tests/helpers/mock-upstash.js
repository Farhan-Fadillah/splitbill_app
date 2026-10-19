// Server Upstash Redis REST tiruan (in-memory) untuk tes. Mendukung perintah yang dipakai aplikasi.
import http from 'node:http';

export function startMockUpstash(token = 'tok_test') {
  const kv = new Map();      // key -> { type:'s'|'h'|'l', v, exp }
  const log = [];
  const alive = (k) => { const e = kv.get(k); if (e && e.exp && e.exp < Date.now()) { kv.delete(k); return null; } return e || null; };

  function exec([cmd, ...a]) {
    const c = String(cmd).toUpperCase();
    log.push(c);
    switch (c) {
      case 'GET': { const e = alive(a[0]); return e ? e.v : null; }
      case 'SET': { const ex = a.findIndex((x) => String(x).toUpperCase() === 'EX'); kv.set(a[0], { type: 's', v: String(a[1]), exp: ex >= 0 ? Date.now() + Number(a[ex + 1]) * 1000 : 0 }); return 'OK'; }
      case 'DEL': return a.reduce((n, k) => n + (kv.delete(k) ? 1 : 0), 0);
      case 'EXPIRE': {
        const e = alive(a[0]); if (!e) return 0;
        if (String(a[2] || '').toUpperCase() === 'NX' && e.exp) return 0;
        e.exp = Date.now() + Number(a[1]) * 1000; return 1;
      }
      case 'INCR': { const e = alive(a[0]) || { type: 's', v: '0', exp: 0 }; e.v = String(Number(e.v) + 1); kv.set(a[0], e); return Number(e.v); }
      case 'HSET': { const e = alive(a[0]) || { type: 'h', v: new Map(), exp: 0 }; let n = 0; for (let i = 1; i < a.length; i += 2) { if (!e.v.has(a[i])) n++; e.v.set(a[i], String(a[i + 1])); } kv.set(a[0], e); return n; }
      case 'HGETALL': { const e = alive(a[0]); return e ? [...e.v.entries()].flat() : []; }
      case 'LPUSH': { const e = alive(a[0]) || { type: 'l', v: [], exp: 0 }; e.v.unshift(...a.slice(1)); kv.set(a[0], e); return e.v.length; }
      case 'LTRIM': { const e = alive(a[0]); if (e) e.v = e.v.slice(Number(a[1]), Number(a[2]) + 1); return 'OK'; }
      default: throw new Error(`ERR unknown command '${cmd}'`);
    }
  }
  const run = (c) => { try { return { result: exec(c) }; } catch (e) { return { error: e.message }; } };

  const server = http.createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    if (req.headers.authorization !== `Bearer ${token}`) { res.writeHead(401, { 'content-type': 'application/json' }); return res.end('{"error":"Unauthorized"}'); }
    const body = JSON.parse(Buffer.concat(chunks).toString() || '[]');
    const out = req.url === '/pipeline' ? body.map(run) : run(body);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(out));
  });
  return new Promise((resolve) => server.listen(0, () => resolve({
    url: `http://127.0.0.1:${server.address().port}`, token, kv, log, close: () => server.close(),
    ttl: (k) => { const e = alive(k); return e?.exp ? Math.round((e.exp - Date.now()) / 1000) : null; },
    keys: (prefix) => [...kv.keys()].filter((k) => k.startsWith(prefix)),
  })));
}
