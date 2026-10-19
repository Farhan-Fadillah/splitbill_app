// Penyimpanan lokal (pengembangan / VPS): SQLite + file untuk QRIS.
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export function createSqliteStore(cfg) {
  fs.mkdirSync(path.dirname(cfg.dbPath), { recursive: true });
  fs.mkdirSync(path.join(cfg.uploadDir, 'qris'), { recursive: true });
  const db = new Database(cfg.dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS bills (id INTEGER PRIMARY KEY AUTOINCREMENT, owner_token TEXT NOT NULL UNIQUE, public_token TEXT NOT NULL UNIQUE,
      data TEXT NOT NULL, statuses TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_bills_updated ON bills(updated_at);
    CREATE TABLE IF NOT EXISTS scan_cache (key TEXT PRIMARY KEY, result TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS reports (id INTEGER PRIMARY KEY AUTOINCREMENT, note TEXT, data TEXT, created_at INTEGER NOT NULL);
  `);
  const now = () => Date.now();
  const rec = (row) => row && ({ ownerToken: row.owner_token, publicToken: row.public_token, data: JSON.parse(row.data), statuses: JSON.parse(row.statuses), createdAt: row.created_at, updatedAt: row.updated_at });
  const windows = new Map();

  return {
    mode: 'sqlite',
    async createBill({ ownerToken, publicToken, data }) {
      db.prepare('INSERT INTO bills (owner_token, public_token, data, statuses, created_at, updated_at) VALUES (?,?,?,?,?,?)').run(ownerToken, publicToken, JSON.stringify(data), '{}', now(), now());
    },
    async getBillByOwner(t) { return rec(db.prepare('SELECT * FROM bills WHERE owner_token = ?').get(t)); },
    async getBillByPublic(t) { return rec(db.prepare('SELECT * FROM bills WHERE public_token = ?').get(t)); },
    async setStatus(ownerToken, pid, value) {
      const row = db.prepare('SELECT id, statuses FROM bills WHERE owner_token = ?').get(ownerToken);
      if (!row) return;
      const st = JSON.parse(row.statuses); st[pid] = value;
      db.prepare('UPDATE bills SET statuses = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(st), now(), row.id);
    },
    async updateBillData(ownerToken, data) { db.prepare('UPDATE bills SET data = ?, updated_at = ? WHERE owner_token = ?').run(JSON.stringify(data), now(), ownerToken); },
    async touch(ownerToken) { db.prepare('UPDATE bills SET updated_at = ? WHERE owner_token = ?').run(now(), ownerToken); },
    async deleteBill(ownerToken) { return db.prepare('DELETE FROM bills WHERE owner_token = ?').run(ownerToken).changes > 0; },

    async getCache(key) { return db.prepare('SELECT result FROM scan_cache WHERE key = ?').get(key)?.result ?? null; },
    async setCache(key, json) { db.prepare('INSERT OR REPLACE INTO scan_cache (key, result, created_at) VALUES (?,?,?)').run(key, json, now()); },

    async putQris(file, buffer) { fs.writeFileSync(path.join(cfg.uploadDir, 'qris', file), buffer); },
    async getQris(file) { try { return fs.readFileSync(path.join(cfg.uploadDir, 'qris', file)); } catch { return null; } },

    async incr(key, windowSec) {
      const t = now();
      const w = windows.get(key);
      if (!w || w.reset < t) { windows.set(key, { n: 1, reset: t + windowSec * 1000 }); return 1; }
      return ++w.n;
    },
    async addReport(note, data) { db.prepare('INSERT INTO reports (note, data, created_at) VALUES (?,?,?)').run(note, data, now()); },
    async probe() { db.prepare('SELECT 1').get(); return true; },

    async purge() {
      const cutoff = now() - cfg.billTtlDays * 86400000;
      const rows = db.prepare('SELECT id, data FROM bills WHERE updated_at < ?').all(cutoff);
      db.prepare('DELETE FROM bills WHERE updated_at < ?').run(cutoff);
      for (const r of rows) {
        try {
          const qr = JSON.parse(r.data)?.payment?.qrisFile;
          if (!qr || !/^[a-f0-9-]+\.webp$/.test(qr)) continue;
          if (!db.prepare('SELECT 1 FROM bills WHERE data LIKE ? LIMIT 1').get(`%${qr}%`)) fs.rmSync(path.join(cfg.uploadDir, 'qris', qr), { force: true });
        } catch { /* abaikan */ }
      }
      db.prepare('DELETE FROM scan_cache WHERE created_at < ?').run(now() - 30 * 86400000);
      return rows.length;
    },
  };
}
