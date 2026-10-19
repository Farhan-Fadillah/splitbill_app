import { loadScript } from './util.js';

const MAX_SIDE = 2200;
const TARGET_BYTES = 1.5 * 1024 * 1024;

const isHeic = (f) => /heic|heif/i.test(f.type) || /\.(heic|heif)$/i.test(f.name || '');
const isPdf = (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name || '');

async function decode(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (e) {
    if (!isHeic(file)) throw new Error('Foto tidak bisa dibuka. Coba format JPG atau PNG.');
  }
  // HEIC: konversi di browser (heic2any dimuat hanya bila perlu)
  await loadScript('/vendor/heic2any.js');
  const out = await window.heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
  const blob = Array.isArray(out) ? out[0] : out;
  return createImageBitmap(blob, { imageOrientation: 'from-image' });
}

function drawScaled(bitmap, rotation, maxSide) {
  const rot = ((rotation % 360) + 360) % 360;
  const swap = rot === 90 || rot === 270;
  const w0 = swap ? bitmap.height : bitmap.width;
  const h0 = swap ? bitmap.width : bitmap.height;
  const scale = Math.min(1, maxSide / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * scale));
  const h = Math.max(1, Math.round(h0 * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  ctx.translate(w / 2, h / 2);
  ctx.rotate((rot * Math.PI) / 180);
  const dw = swap ? h : w, dh = swap ? w : h;
  ctx.drawImage(bitmap, -dw / 2, -dh / 2, dw, dh);
  return { canvas, w, h, origW: w0, origH: h0 };
}

/** Cek kualitas ringan: blur (varians Laplacian), gelap/silau (rata-rata luminans), resolusi rendah. */
export function checkQuality(canvas, origW, origH) {
  const target = 640;
  const s = Math.min(1, target / canvas.width);
  const w = Math.max(8, Math.round(canvas.width * s));
  const h = Math.max(8, Math.round(canvas.height * s));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const gray = new Float32Array(w * h);
  let sum = 0;
  for (let i = 0; i < w * h; i++) {
    const g = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    gray[i] = g; sum += g;
  }
  const mean = sum / (w * h);
  let lapSum = 0, lapSq = 0, n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w];
      lapSum += lap; lapSq += lap * lap; n++;
    }
  }
  const variance = lapSq / n - (lapSum / n) ** 2;
  return {
    blur: variance < 45,
    dark: mean < 75,
    overexposed: mean > 240,
    lowRes: Math.min(origW, origH) < 600,
    metrics: { variance: Math.round(variance), mean: Math.round(mean) },
  };
}

export const qualityHints = (q) => [
  q.blur && 'Foto agak buram, coba foto ulang lebih dekat',
  (q.dark || q.overexposed) && 'Foto terlalu gelap/silau',
  q.lowRes && 'Resolusi foto rendah, teks kecil mungkin sulit terbaca',
].filter(Boolean);

function toBlob(canvas, quality) {
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Gagal memproses foto'))), 'image/jpeg', quality));
}

/**
 * Siapkan foto sebelum diunggah: orientasi EXIF, HEIC -> JPEG, perkecil (maks 2200px, tanpa upscale),
 * JPEG q0.88 (turun bertahap bila > ~1,5MB), plus cek kualitas.
 */
export async function prepareImage(file, rotation = 0) {
  if (isPdf(file)) return { blob: file, isPdf: true, quality: {}, previewUrl: null };
  const bitmap = await decode(file);
  const { canvas, origW, origH } = drawScaled(bitmap, rotation, MAX_SIDE);
  bitmap.close?.();
  const quality = checkQuality(canvas, origW, origH);
  let q = 0.88;
  let blob = await toBlob(canvas, q);
  while (blob.size > TARGET_BYTES && q > 0.6) { q -= 0.08; blob = await toBlob(canvas, q); }
  blob.name = 'struk.jpg';
  return { blob, isPdf: false, quality, previewUrl: URL.createObjectURL(blob), width: canvas.width, height: canvas.height };
}
