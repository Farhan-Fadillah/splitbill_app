// fetch dengan timeout, abort, dan retry satu kali (429/5xx/jaringan) dengan backoff pendek.
export class HttpError extends Error {
  constructor(message, { status = 0, retryable = false, body = '' } = {}) {
    super(message);
    this.status = status;
    this.retryable = retryable;
    this.body = body;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function once(url, init, timeoutMs, outerSignal) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error('timeout')), timeoutMs);
  const onAbort = () => ctrl.abort(outerSignal.reason);
  if (outerSignal) {
    if (outerSignal.aborted) ctrl.abort(outerSignal.reason);
    else outerSignal.addEventListener('abort', onAbort, { once: true });
  }
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await res.text();
    if (!res.ok) {
      throw new HttpError(`HTTP ${res.status}`, { status: res.status, retryable: res.status === 429 || res.status >= 500, body: text.slice(0, 500) });
    }
    try { return JSON.parse(text); } catch { throw new HttpError('Balasan bukan JSON', { status: res.status, body: text.slice(0, 200) }); }
  } catch (e) {
    if (e instanceof HttpError) throw e;
    if (outerSignal?.aborted) throw new HttpError('dibatalkan', { retryable: false });
    const timedOut = ctrl.signal.aborted;
    throw new HttpError(timedOut ? 'timeout' : `jaringan: ${e.cause?.code || e.message}`, { retryable: !timedOut });
  } finally {
    clearTimeout(timer);
    outerSignal?.removeEventListener('abort', onAbort);
  }
}

export async function postJson(url, headers, body, { timeoutMs = 30000, signal, retry = true } = {}) {
  const init = { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) };
  try {
    return await once(url, init, timeoutMs, signal);
  } catch (e) {
    if (retry && e instanceof HttpError && e.retryable && !signal?.aborted) {
      await sleep(600 + Math.random() * 400);
      return once(url, init, timeoutMs, signal);
    }
    throw e;
  }
}
