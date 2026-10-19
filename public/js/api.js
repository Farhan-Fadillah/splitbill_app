export class ApiError extends Error {
  constructor(message, { code = 'error', status = 0, details = [] } = {}) {
    super(message);
    this.code = code; this.status = status; this.details = details;
  }
}

async function request(method, url, body) {
  let res;
  try {
    res = await fetch(url, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError('Tidak bisa terhubung ke server. Periksa koneksi internetmu.', { code: 'network' });
  }
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    const e = json?.error || {};
    throw new ApiError(e.message || `Permintaan gagal (${res.status})`, { code: e.code, status: res.status, details: e.details });
  }
  return json;
}

export const api = {
  config: () => request('GET', '/api/config'),
  createBill: (payload) => request('POST', '/api/bills', payload),
  getBill: (ownerToken) => request('GET', `/api/bills/${ownerToken}`),
  patchBill: (ownerToken, patch) => request('PATCH', `/api/bills/${ownerToken}`, patch),
  deleteBill: (ownerToken) => request('DELETE', `/api/bills/${ownerToken}`),
  lookup: (tokens) => request('POST', '/api/bills/lookup', { tokens }),
  getPublic: (token) => request('GET', `/api/public/${token}`),
  getPerson: (token, pid) => request('GET', `/api/public/${token}/person/${encodeURIComponent(pid)}`),
  markPaid: (token, personId) => request('POST', `/api/public/${token}/paid`, { personId }),
  report: (note, data) => request('POST', '/api/report', { note, data }),

  async uploadQris(file) {
    const fd = new FormData();
    fd.append('image', file);
    let res;
    try { res = await fetch('/api/qris', { method: 'POST', body: fd }); } catch { throw new ApiError('Upload gagal. Periksa koneksi internetmu.', { code: 'network' }); }
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) throw new ApiError(json?.error?.message || 'Upload QRIS gagal', { code: json?.error?.code, status: res.status });
    return json;
  },

  /** Upload foto + baca hasil scan. onUploaded dipanggil saat unggahan selesai (server mulai membaca). */
  scan(blob, quality, { onUploaded } = {}) {
    return new Promise((resolve, reject) => {
      const fd = new FormData();
      fd.append('image', blob, blob.name || 'struk.jpg');
      fd.append('quality', JSON.stringify(quality || {}));
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/scan');
      xhr.timeout = 100000;
      xhr.upload.onload = () => onUploaded?.();
      xhr.onerror = () => reject(new ApiError('Tidak bisa terhubung ke server. Periksa koneksi internetmu.', { code: 'network' }));
      xhr.ontimeout = () => reject(new ApiError('Pembacaan struk terlalu lama. Coba lagi atau isi manual.', { code: 'timeout' }));
      xhr.onload = () => {
        let json = null;
        try { json = JSON.parse(xhr.responseText); } catch { /* */ }
        if (xhr.status >= 200 && xhr.status < 300 && json?.ok) return resolve(json);
        const e = json?.error || {};
        reject(new ApiError(e.message || `Scan gagal (${xhr.status})`, { code: e.code, status: xhr.status, details: e.details }));
      };
      xhr.send(fd);
    });
  },
};
