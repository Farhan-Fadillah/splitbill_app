import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import crypto from 'node:crypto';
import { cfg } from '../config.js';
import { getStore } from '../storage/index.js';
import { rateLimit } from '../lib/ratelimit.js';
import { isToken } from '../lib/tokens.js';
import { bad, notFound } from '../lib/errors.js';
import { sniffMime } from '../services/ocr/preprocess.js';

export const publicRouter = Router();

async function loadByPublic(token) {
  if (!isToken(token)) throw notFound();
  const rec = await (await getStore()).getBillByPublic(token);
  if (!rec) throw notFound();
  return rec;
}

// Data aman untuk teman: tidak pernah menyertakan ownerToken.
publicRouter.get('/public/:token', async (req, res) => {
  const { data, statuses, ownerToken, publicToken } = await loadByPublic(req.params.token);
  (await getStore()).touch(ownerToken, publicToken).catch(() => {});
  const payers = data.people.filter((p) => p.id !== data.ownerId);
  res.json({
    ok: true,
    bill: {
      name: data.name, date: data.date, grandTotal: data.result.combined.grandTotal,
      people: data.people.map((p) => ({ id: p.id, name: p.name, isOwner: p.id === data.ownerId })),
      ownerName: data.people.find((p) => p.id === data.ownerId)?.name,
      payment: data.payment,
      paidCount: payers.filter((p) => statuses[p.id]?.status === 'lunas').length,
      payerCount: payers.length,
    },
  });
});

publicRouter.get('/public/:token/person/:pid', async (req, res) => {
  const { data, statuses } = await loadByPublic(req.params.token);
  const p = data.result.combined.people.find((x) => x.id === req.params.pid);
  if (!p) throw notFound('Nama tidak ditemukan di tagihan ini');
  const isOwner = p.id === data.ownerId;
  res.json({
    ok: true,
    person: {
      id: p.id, name: p.name, isOwner, items: p.items, fees: p.fees, itemsTotal: p.itemsTotal, feesTotal: p.feesTotal,
      subtotal: p.total, roundingAdjust: p.roundingAdjust, total: p.payTotal,
      status: isOwner ? 'lunas' : statuses[p.id]?.status || 'belum',
    },
  });
});

// Teman menandai sudah bayar -> "menunggu" sampai penagih mengonfirmasi.
publicRouter.post('/public/:token/paid', rateLimit({ name: 'paid', max: 30, windowSec: 60 }), async (req, res) => {
  const rec = await loadByPublic(req.params.token);
  const pid = String(req.body?.personId || '');
  if (!rec.data.people.some((p) => p.id === pid) || pid === rec.data.ownerId) throw bad('invalid_person', 'Peserta tidak valid');
  let status = rec.statuses[pid]?.status || 'belum';
  if (status !== 'lunas') {
    status = 'menunggu';
    await (await getStore()).setStatus(rec.ownerToken, pid, { status, at: Date.now() });
  }
  res.json({ ok: true, status });
});

// ---- QRIS: maks 2MB, di-re-encode ke WebP kecil, disimpan di storage ----
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: cfg.maxQrisBytes, files: 1 } });
const QRIS_RE = /^[a-f0-9-]+\.webp$/;

publicRouter.post('/qris', rateLimit({ name: 'qris', max: 10, windowSec: 60 }), upload.single('image'), async (req, res) => {
  if (!req.file) throw bad('no_file', 'Gambar QRIS belum dipilih');
  const mime = sniffMime(req.file.buffer);
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) throw bad('bad_type', 'QRIS harus berupa gambar JPG, PNG, atau WebP');
  let out;
  for (const quality of [92, 80, 68, 55]) {
    out = await sharp(req.file.buffer, { limitInputPixels: 40e6 }).rotate().resize({ width: 900, height: 900, fit: 'inside', withoutEnlargement: true }).webp({ quality }).toBuffer();
    if (out.length <= 450 * 1024) break; // batas aman untuk Redis REST
  }
  const file = `${crypto.randomUUID()}.webp`;
  await (await getStore()).putQris(file, out);
  res.status(201).json({ ok: true, file, url: `/api/qris/${file}` });
});

publicRouter.get('/qris/:file', async (req, res) => {
  if (!QRIS_RE.test(req.params.file)) throw notFound();
  const buf = await (await getStore()).getQris(req.params.file);
  if (!buf) throw notFound('Gambar QRIS tidak ditemukan');
  res.set({ 'content-type': 'image/webp', 'cache-control': 'public, max-age=86400, immutable', 'x-content-type-options': 'nosniff' }).send(buf);
});

// ---- Laporan hasil scan yang salah (hanya data hasil parsing, tanpa foto) ----
publicRouter.post('/report', rateLimit({ name: 'report', max: 5, windowSec: 60 }), async (req, res) => {
  const note = String(req.body?.note || '').slice(0, 500);
  const data = JSON.stringify(req.body?.data || {}).slice(0, 50_000);
  await (await getStore()).addReport(note, data);
  res.status(201).json({ ok: true });
});

publicRouter.get('/config', (_req, res) => res.json({
  ok: true, supportEmail: cfg.supportEmail, donationUrl: cfg.donationUrl, maxUploadBytes: cfg.maxUploadBytes, qaEnabled: !!cfg.qaToken,
}));
