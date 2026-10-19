import { z } from 'zod';
import { parseAmount, fmtRp } from '../../lib/money.js';

export const RECEIPT_TYPES = ['restaurant', 'minimarket', 'delivery', 'ecommerce', 'invoice', 'handwritten', 'other'];

const money = z.preprocess((v) => parseAmount(v), z.number().int());
const intQty = z.preprocess((v) => {
  const n = typeof v === 'string' ? parseAmount(v) : v;
  return n === null || n === undefined || n === 0 ? 1 : n;
}, z.number().int().min(1));
const conf = z.preprocess((v) => (v === null || v === undefined ? 0.8 : Number(v)), z.number().min(0).max(1));
const bool = z.preprocess((v) => v === true || v === 'true', z.boolean());

const itemSchema = z.object({
  name: z.preprocess((v) => String(v ?? '').trim().slice(0, 120), z.string().min(1)),
  qty: intQty,
  unit_price: money,
  discount: money.optional().default(0),
  line_total: z.preprocess((v) => (v === null || v === undefined ? undefined : parseAmount(v)), z.number().int().optional()),
  confidence: conf.optional().default(0.8),
});

const resultSchema = z.object({
  receipt_type: z.preprocess((v) => (RECEIPT_TYPES.includes(v) ? v : 'other'), z.string()),
  merchant: z.preprocess((v) => (v ? String(v).trim().slice(0, 80) : null), z.string().nullable()),
  date: z.preprocess((v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null), z.string().nullable()),
  currency: z.preprocess((v) => (typeof v === 'string' && /^[A-Za-z]{3}$/.test(v) ? v.toUpperCase() : 'IDR'), z.string()),
  language: z.preprocess((v) => (typeof v === 'string' ? v.slice(0, 8) : 'id'), z.string()),
  items: z.array(itemSchema),
  subtotal: money.optional().default(0),
  discount: money.optional().default(0),
  service_charge: money.optional().default(0),
  tax: money.optional().default(0),
  delivery_fee: money.optional().default(0),
  platform_fee: money.optional().default(0),
  tip: money.optional().default(0),
  rounding: money.optional().default(0),
  total: money.optional().default(0),
  quality: z
    .object({ blur: bool.optional().default(false), dark: bool.optional().default(false), cropped: bool.optional().default(false), handwritten: bool.optional().default(false) })
    .optional()
    .default({ blur: false, dark: false, cropped: false, handwritten: false }),
  warnings: z.preprocess((v) => (Array.isArray(v) ? v.map(String).slice(0, 12) : []), z.array(z.string())),
});

/** Ambil objek JSON pertama dari balasan model (toleran terhadap ```json fences dan teks pembuka). */
export function extractJson(text) {
  if (typeof text !== 'string') throw new Error('Balasan kosong');
  let s = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const start = s.indexOf('{');
  if (start === -1) throw new Error('Tidak ada objek JSON');
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return JSON.parse(s.slice(start, i + 1));
    }
  }
  throw new Error('JSON tidak lengkap');
}

/** Validasi skema + normalisasi (diskon selalu positif, line_total dihitung bila kosong). */
export function normalizeResult(raw) {
  const parsed = resultSchema.parse(raw);
  parsed.discount = Math.abs(parsed.discount);
  parsed.items = parsed.items.map((it) => {
    const discount = Math.abs(it.discount);
    const computed = it.qty * it.unit_price - discount;
    return { ...it, discount, line_total: it.line_total === undefined ? computed : it.line_total };
  });
  return parsed;
}

const rowOk = (it) => it.line_total === it.qty * it.unit_price - it.discount;

/**
 * Periksa kecocokan matematis. Mengembalikan data yang sudah diperbaiki bila memungkinkan,
 * daftar warning (Bahasa Indonesia), dan skor selisih.
 */
export function reconcile(input, tolerance = 1) {
  const data = JSON.parse(JSON.stringify(input));
  const warnings = [...data.warnings];
  const add = (m) => { if (!warnings.includes(m)) warnings.push(m); };
  const flagged = new Set();

  const sumPrinted = () => data.items.reduce((s, it) => s + it.line_total, 0);
  const sumComputed = () => data.items.reduce((s, it) => s + it.qty * it.unit_price - it.discount, 0);

  // 1) pasangan qty*harga vs line_total
  if (!data.items.every(rowOk)) {
    if (data.subtotal && Math.abs(sumPrinted() - data.subtotal) <= tolerance) {
      // line_total cocok dengan subtotal → percaya line_total, perbaiki unit_price bila habis dibagi
      data.items.forEach((it, i) => {
        if (rowOk(it)) return;
        const unit = (it.line_total + it.discount) / it.qty;
        if (Number.isInteger(unit) && unit >= 0) it.unit_price = unit;
        flagged.add(i);
      });
      add('Beberapa harga satuan disesuaikan dengan total baris');
    } else if (data.subtotal && Math.abs(sumComputed() - data.subtotal) <= tolerance) {
      data.items.forEach((it, i) => {
        if (rowOk(it)) return;
        it.line_total = it.qty * it.unit_price - it.discount;
        flagged.add(i);
      });
      add('Total beberapa baris dihitung ulang dari qty × harga');
    } else {
      data.items.forEach((it, i) => { if (!rowOk(it)) flagged.add(i); });
    }
  }

  // 2) subtotal
  const sum = sumPrinted();
  if (!data.subtotal && data.items.length) data.subtotal = sum;
  let score = 0;
  let reconciled = true;
  if (Math.abs(sum - data.subtotal) > tolerance) {
    reconciled = false;
    score += Math.abs(sum - data.subtotal);
    add(`Total item ${fmtRp(sum)} tidak sama dengan subtotal ${fmtRp(data.subtotal)}`);
  }

  // 3) total akhir
  const calc = data.subtotal - data.discount + data.service_charge + data.tax + data.delivery_fee + data.platform_fee + data.tip + data.rounding;
  if (!data.total && data.quality.cropped) {
    add('Total tidak terlihat di foto, mohon isi manual');
    reconciled = false;
  } else if (Math.abs(calc - data.total) > tolerance) {
    reconciled = false;
    score += Math.abs(calc - data.total);
    add(`Subtotal + biaya ${fmtRp(calc)} tidak sama dengan total ${fmtRp(data.total)}`);
  }
  if (data.items.length === 0) { reconciled = false; add('Tidak ada item yang terbaca'); score += 1e9; }

  data.items.forEach((it, i) => {
    it.needs_review = flagged.has(i) || it.confidence < 0.5 || (!reconciled && it.confidence < 0.7);
  });
  data.warnings = warnings;
  return { reconciled, warnings, data, score };
}

/** Gabungkan hasil beberapa potongan (tile) dari struk panjang. */
const keyOf = (it) => `${it.name.toLowerCase().replace(/\s+/g, ' ').trim()}|${it.unit_price}|${it.qty}`;
const CHARGES = ['discount', 'service_charge', 'tax', 'delivery_fee', 'platform_fee', 'tip', 'rounding'];

export function mergeTiles(tiles) {
  if (tiles.length === 1) return tiles[0];
  const items = [];
  for (const tile of tiles) {
    // Overlap = akhiran daftar sebelumnya yang sama persis dengan awalan tile ini (urutan terjaga).
    let k = Math.min(6, items.length, tile.items.length);
    for (; k > 0; k--) {
      const tail = items.slice(-k).map(keyOf);
      if (tile.items.slice(0, k).every((it, i) => keyOf(it) === tail[i])) break;
    }
    items.push(...tile.items.slice(k));
  }
  const first = (f) => tiles.map((t) => t[f]).find((v) => v);
  const lastNonZero = (f) => [...tiles].reverse().map((t) => t[f]).find((v) => v) || 0;
  const merged = {
    ...tiles[tiles.length - 1],
    receipt_type: first('receipt_type') || 'other',
    merchant: first('merchant') || null,
    date: first('date') || null,
    items,
    subtotal: lastNonZero('subtotal'),
    total: tiles[tiles.length - 1].total || 0,
    quality: {
      blur: tiles.some((t) => t.quality.blur), dark: tiles.some((t) => t.quality.dark),
      cropped: tiles[0].quality.cropped || tiles[tiles.length - 1].quality.cropped, handwritten: tiles.some((t) => t.quality.handwritten),
    },
    warnings: [...new Set(tiles.flatMap((t) => t.warnings))],
  };
  for (const c of CHARGES) merged[c] = lastNonZero(c);
  if (!merged.total) merged.total = lastNonZero('total');
  return merged;
}
