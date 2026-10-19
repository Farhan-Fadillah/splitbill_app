import { Router } from 'express';
import { z } from 'zod';
import { getStore } from '../storage/index.js';
import { newToken, isToken } from '../lib/tokens.js';
import { bad, notFound } from '../lib/errors.js';
import { computeSession } from '../../public/js/split.js';

const id = z.string().min(1).max(40).regex(/^[\w-]+$/);
const rp = z.number().int().min(0).max(1_000_000_000);
const item = z.object({
  id, name: z.string().trim().min(1).max(120),
  qty: z.number().int().min(1).max(999), unit_price: rp, discount: rp.optional().default(0),
});
const mode = z.enum(['proportional', 'equal']);
const charges = z.object({
  discount: rp.optional().default(0), service_charge: rp.optional().default(0), tax: rp.optional().default(0),
  delivery_fee: rp.optional().default(0), platform_fee: rp.optional().default(0), tip: rp.optional().default(0),
  rounding: z.number().int().min(-1_000_000).max(1_000_000).optional().default(0),
});
const assignment = z.object({ mode: z.enum(['equal', 'portion', 'percent']), shares: z.record(id, z.number().min(0).max(100000)) });
const receipt = z.object({
  id, label: z.string().trim().max(60).default(''),
  items: z.array(item).max(300),
  charges,
  modes: z.record(z.string(), mode).optional().default({}),
  assignments: z.record(z.string(), assignment).optional().default({}),
});
const payment = z.object({
  holder: z.string().trim().max(60).optional().default(''),
  bankName: z.string().trim().max(40).optional().default(''),
  bankNumber: z.string().trim().max(40).optional().default(''),
  ewallets: z.array(z.object({ type: z.enum(['GoPay', 'OVO', 'DANA', 'ShopeePay']), number: z.string().trim().max(30) })).max(4).optional().default([]),
  qrisFile: z.string().regex(/^[a-f0-9-]+\.webp$/).optional().nullable(),
}).optional().default({});
const billSchema = z.object({
  name: z.string().trim().min(1).max(80),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  ownerId: id,
  people: z.array(z.object({ id, name: z.string().trim().min(1).max(40) })).min(1).max(30),
  receipts: z.array(receipt).min(1).max(10),
  roundStep: z.union([z.literal(0), z.literal(100), z.literal(500), z.literal(1000)]).default(0),
  payment,
});

const statusSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  statuses: z.record(id, z.enum(['belum', 'menunggu', 'lunas'])).optional(),
});

export const billsRouter = Router();

export async function loadByOwner(token) {
  if (!isToken(token)) throw notFound();
  const rec = await (await getStore()).getBillByOwner(token);
  if (!rec) throw notFound();
  return rec;
}

const summary = (rec) => {
  const { data, statuses } = rec;
  const payers = data.result.combined.people.filter((p) => p.id !== data.ownerId);
  const paid = payers.filter((p) => statuses[p.id]?.status === 'lunas');
  const waiting = payers.filter((p) => statuses[p.id]?.status === 'menunggu');
  return {
    name: data.name, date: data.date, createdAt: rec.createdAt,
    ownerToken: rec.ownerToken, publicToken: rec.publicToken,
    grandTotal: data.result.combined.grandTotal,
    peopleCount: data.people.length, payerCount: payers.length,
    paidCount: paid.length, waitingCount: waiting.length,
    collected: paid.reduce((s, p) => s + p.payTotal, 0),
    outstanding: payers.filter((p) => statuses[p.id]?.status !== 'lunas').reduce((s, p) => s + p.payTotal, 0),
    settled: payers.length > 0 && paid.length === payers.length,
  };
};

billsRouter.post('/bills', async (req, res) => {
  const parsed = billSchema.safeParse(req.body);
  if (!parsed.success) throw bad('invalid_bill', 'Data tagihan tidak valid: ' + parsed.error.issues[0].path.join('.') + ' ' + parsed.error.issues[0].message);
  const b = parsed.data;
  const ids = new Set(b.people.map((p) => p.id));
  if (ids.size !== b.people.length) throw bad('invalid_bill', 'ID peserta ganda');
  if (!ids.has(b.ownerId)) throw bad('invalid_bill', 'Penagih tidak ada di daftar peserta');

  const result = computeSession({ receipts: b.receipts, people: b.people, ownerId: b.ownerId, roundStep: b.roundStep });
  const ownerToken = newToken(16);
  const publicToken = newToken(16);
  const store = await getStore();
  await store.createBill({ ownerToken, publicToken, data: { ...b, result } });
  res.status(201).json({ ok: true, ownerToken, publicToken, grandTotal: result.combined.grandTotal });
});

billsRouter.get('/bills/:ownerToken', async (req, res) => {
  const rec = await loadByOwner(req.params.ownerToken);
  const { data, statuses } = rec;
  const people = data.result.combined.people.map((p) => ({
    id: p.id, name: p.name, amount: p.payTotal, isOwner: p.id === data.ownerId,
    status: p.id === data.ownerId ? 'lunas' : statuses[p.id]?.status || 'belum', at: statuses[p.id]?.at || null,
  }));
  (await getStore()).touch(rec.ownerToken, rec.publicToken).catch(() => {});
  res.json({ ok: true, bill: { ...summary(rec), people, payment: data.payment, ownerId: data.ownerId } });
});

billsRouter.patch('/bills/:ownerToken', async (req, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) throw bad('invalid_patch', 'Perubahan tidak valid');
  const rec = await loadByOwner(req.params.ownerToken);
  const store = await getStore();
  const valid = new Set(rec.data.people.map((p) => p.id));
  if (parsed.data.name) { rec.data.name = parsed.data.name; await store.updateBillData(rec.ownerToken, rec.data); }
  for (const [pid, status] of Object.entries(parsed.data.statuses || {})) {
    if (!valid.has(pid) || pid === rec.data.ownerId) continue;
    const value = { status, at: Date.now() };
    await store.setStatus(rec.ownerToken, pid, value);
    rec.statuses[pid] = value;
  }
  res.json({ ok: true, ...summary(rec) });
});

billsRouter.delete('/bills/:ownerToken', async (req, res) => {
  await loadByOwner(req.params.ownerToken);
  await (await getStore()).deleteBill(req.params.ownerToken);
  res.json({ ok: true });
});

billsRouter.post('/bills/lookup', async (req, res) => {
  const tokens = Array.isArray(req.body?.tokens) ? req.body.tokens.filter(isToken).slice(0, 50) : [];
  const store = await getStore();
  const recs = await Promise.all(tokens.map((t) => store.getBillByOwner(t).catch(() => null)));
  const found = [], missing = [];
  recs.forEach((r, i) => (r ? found.push(summary(r)) : missing.push(tokens[i])));
  res.json({ ok: true, bills: found, missing });
});
