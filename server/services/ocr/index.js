import { cfg } from '../../config.js';
import { callClaude } from './claude.js';
import { callMistralOcr, callMistralStructure } from './mistral.js';
import { preprocess } from './preprocess.js';
import { extractJson, normalizeResult, reconcile, mergeTiles } from './validate.js';
import { PROMPT_VERSION, standardMessage, tileMessage, mistralStructureMessage, enhancedRetryMessage } from './prompts/user.js';

export { PROMPT_VERSION };

export class ScanError extends Error {
  constructor(code, message, details = []) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export const defaultDeps = { callClaude, callMistralOcr, callMistralStructure, preprocess, config: cfg };

const errCode = (e) => {
  if (!e) return 'unknown';
  if (e.message === 'timeout') return 'timeout';
  if (e.status) return `http_${e.status}`;
  return 'network';
};

/** Ubah teks balasan model menjadi "attempt" {engine, data, check} atau {engine, error}. */
function parseAttempt(engine, text) {
  let raw;
  try { raw = extractJson(text); } catch (e) { return { engine, error: { code: 'invalid_json', message: e.message } }; }
  if (raw && typeof raw === 'object' && raw.error) return { engine, error: { code: String(raw.error) } };
  try {
    const data = normalizeResult(raw);
    const check = reconcile(data);
    return { engine, data: check.data, check };
  } catch (e) {
    return { engine, error: { code: 'schema', message: String(e.message).slice(0, 200) } };
  }
}

async function claudeAttempt(deps, image, userText, signal) {
  try {
    const text = await deps.callClaude({ image, userText, signal, config: deps.config });
    return parseAttempt('claude', text);
  } catch (e) {
    return { engine: 'claude', error: { code: errCode(e), message: e.message, body: e.body } };
  }
}

async function mistralAttempt(deps, image, signal) {
  let rawText = null;
  try {
    rawText = await deps.callMistralOcr({ image, signal, config: deps.config });
    const text = await deps.callMistralStructure({ userText: mistralStructureMessage(rawText), signal, config: deps.config });
    return { ...parseAttempt('mistral', text), rawText };
  } catch (e) {
    return { engine: 'mistral', rawText, error: { code: errCode(e), message: e.message, body: e.body } };
  }
}

/**
 * Ekstrak satu gambar (atau satu tile) dengan rantai fallback:
 * Claude (+hedge Mistral setelah hedgeMs) -> Mistral -> Claude ulang dengan draft Mistral -> hasil terbaik + peringatan.
 * partial=true (tile struk panjang): cukup lolos skema, belum perlu cocok secara matematis.
 */
export async function extractOne({ variants, userText, partial = false }, deps = defaultDeps) {
  const ctrl = new AbortController();
  const attempts = {};
  const good = (a) => !!(a && a.data && (partial || a.check.reconciled));

  let mistralP = null;
  const startMistral = () => (mistralP ??= mistralAttempt(deps, variants.bw, ctrl.signal).then((a) => (attempts.mistral = a)));
  const claudeP = claudeAttempt(deps, variants.color, userText, ctrl.signal).then((a) => (attempts.claude = a));

  let hedgeTimer;
  let winner = await new Promise((resolve) => {
    let pending = 1;
    const settle = (a) => {
      if (good(a)) resolve(a);
      else if (--pending === 0) resolve(null);
    };
    claudeP.then(settle);
    hedgeTimer = setTimeout(() => { pending++; startMistral().then(settle); }, deps.config.hedgeMs);
  });
  clearTimeout(hedgeTimer);

  // Fallback: Mistral
  if (!winner) {
    const m = await startMistral();
    if (good(m)) winner = m;
  }

  // Satu kali retry: Claude + draft teks Mistral
  if (!winner && !partial) {
    const draft = attempts.mistral?.rawText;
    const base = [attempts.claude, attempts.mistral].filter((a) => a?.data).sort((a, b) => a.check.score - b.check.score)[0];
    if (draft && base) {
      const mismatch = base.check.warnings.filter((w) => /tidak sama/.test(w)).join('; ') || 'totals do not reconcile';
      const retry = await claudeAttempt(deps, variants.bw, enhancedRetryMessage(mismatch, draft), ctrl.signal);
      attempts.enhanced = retry;
      if (good(retry)) winner = { ...retry, engine: 'claude+mistral' };
    }
  }

  let bestEffort = false;
  if (!winner) {
    const pool = Object.values(attempts).filter((a) => a?.data);
    if (pool.length) {
      pool.sort((a, b) => a.check.score - b.check.score || (a.engine === 'claude' ? -1 : 1));
      winner = { ...pool[0] };
      bestEffort = true;
    }
  }

  // Konsensus: bila mesin lain sudah selesai dan juga lolos, bandingkan.
  if (winner && !bestEffort && !partial && winner.engine !== 'claude+mistral') {
    const other = winner.engine === 'claude' ? attempts.mistral : attempts.claude;
    if (good(other)) {
      const sameTotal = Math.abs(other.data.total - winner.data.total) <= 1;
      if (sameTotal && other.data.items.length === winner.data.items.length) {
        winner = {
          ...winner,
          engine: 'claude+mistral',
          data: { ...winner.data, items: winner.data.items.map((it) => ({ ...it, confidence: Math.min(1, +(it.confidence + 0.05).toFixed(2)) })) },
        };
      } else if (!sameTotal) {
        const claudeSide = winner.engine === 'claude' ? winner : other;
        winner = { ...claudeSide, data: { ...claudeSide.data, warnings: [...claudeSide.data.warnings, 'Dua mesin OCR membaca total yang berbeda, mohon periksa'] } };
      }
    }
  }

  ctrl.abort(); // batalkan permintaan yang masih berjalan

  if (winner) return { ...winner, bestEffort, attempts: summarize(attempts) };

  const all = Object.entries(attempts).filter(([, a]) => a?.error);
  const details = all.map(([k, a]) => ({ engine: k, code: a.error.code, message: String(a.error.message || '').slice(0, 160), body: a.error.body ? String(a.error.body).slice(0, 300) : undefined }));
  const verdicts = all.map(([, a]) => a.error.code).filter((c) => c === 'not_a_receipt' || c === 'unreadable');
  if (verdicts.length && verdicts.every((c) => c === 'not_a_receipt')) {
    throw new ScanError('not_a_receipt', 'Foto ini sepertinya bukan struk', details);
  }
  const unauth = all.some(([, a]) => /^http_(401|403)$/.test(a.error.code));
  throw new ScanError(
    unauth ? 'not_configured' : 'all_failed',
    unauth ? 'API key OCR ditolak. Periksa SUMOPOD_API_KEY / MISTRAL_API_KEY di file .env.' : 'Struk belum bisa dibaca otomatis. Coba foto ulang atau isi manual.',
    details,
  );
}

const summarize = (attempts) =>
  Object.fromEntries(Object.entries(attempts).filter(([, a]) => a).map(([k, a]) => [k, a.error ? { error: a.error.code } : { reconciled: a.check.reconciled }]));

/** Alur lengkap: preprocess -> (tile?) -> ekstraksi -> validasi akhir -> payload bersih. */
export async function scanReceipt({ buffer, mime, clientQuality = {} }, deps = defaultDeps) {
  const started = Date.now();
  const pre = await deps.preprocess(buffer, mime);
  const textStd = standardMessage(clientQuality);
  let result;

  if (pre.tiles && pre.tiles.length > 1) {
    if (pre.tiles.length > 8) throw new ScanError('too_long', 'Struk terlalu panjang untuk dibaca sekaligus. Foto per bagian lalu tambahkan sebagai struk terpisah.');
    const n = pre.tiles.length;
    const outs = [];
    for (let i = 0; i < n; i += 3) {
      const chunk = pre.tiles.slice(i, i + 3);
      outs.push(...(await Promise.all(chunk.map((t, j) => extractOne({ variants: t, userText: tileMessage(i + j + 1, n), partial: true }, deps)))));
    }
    const merged = mergeTiles(outs.map((o) => o.data));
    const check = reconcile(merged);
    const engines = new Set(outs.map((o) => o.engine));
    result = { engine: engines.size === 1 ? [...engines][0] : 'claude+mistral', data: check.data, check, bestEffort: !check.reconciled };
  } else {
    result = await extractOne({ variants: pre, userText: textStd }, deps);
  }

  const d = result.data;
  const q = clientQuality || {};
  const warnings = [...d.warnings];
  if (result.bestEffort && !warnings.some((w) => /periksa|cek/i.test(w))) warnings.push('Angka belum cocok dengan total struk, mohon periksa ulang');
  if (d.currency !== 'IDR') warnings.push(`Struk dalam ${d.currency}. Isi kurs manual untuk mengonversi ke rupiah`);

  return {
    ...d,
    warnings: [...new Set(warnings)],
    quality: {
      blur: d.quality.blur || !!q.blur,
      dark: d.quality.dark || !!q.dark,
      cropped: d.quality.cropped,
      handwritten: d.quality.handwritten,
      lowRes: !!q.lowRes,
    },
    reconciled: result.check.reconciled,
    engine: result.engine,
    prep: { deskew: pre.info.deskew, tall: pre.info.tall, trimmed: pre.info.trimmed, upscaled: pre.info.upscaled },
    ms: Date.now() - started,
  };
}
