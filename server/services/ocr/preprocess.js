import sharp from 'sharp';

sharp.concurrency(2);
sharp.cache({ items: 20, memory: 100 });

const MAX_INPUT_SIDE = 5000;
const TILE_H = 2000;
const TILE_OVERLAP = 0.15;

/** Deteksi tipe file dari magic bytes (bukan dari ekstensi). */
export function sniffMime(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (buf.subarray(4, 8).toString('latin1') === 'ftyp') {
    const brand = buf.subarray(8, 12).toString('latin1');
    if (/^(heic|heix|hevc|hevx|heim|heis|mif1|msf1|avif)/.test(brand)) return brand === 'avif' ? 'image/avif' : 'image/heic';
  }
  return null;
}

export async function rasterizePdf(buffer) {
  let mupdf;
  try { mupdf = await import('mupdf'); } catch { throw new Error('PDF belum didukung di server ini (paket mupdf tidak terpasang)'); }
  const doc = mupdf.Document.openDocument(buffer, 'application/pdf');
  if (doc.countPages() < 1) throw new Error('PDF kosong');
  const page = doc.loadPage(0);
  const scale = 200 / 72;
  const pixmap = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false, true);
  return Buffer.from(pixmap.asPNG());
}

/**
 * Perkiraan kemiringan teks (derajat, -15..15) dengan projection profile.
 * Mengembalikan 0 bila tidak yakin, supaya tidak salah memutar.
 */
export function estimateSkew(gray, w, h, local = null) {
  let sum = 0;
  for (let i = 0; i < gray.length; i++) sum += gray[i];
  const mean = sum / gray.length;
  const thr = mean * 0.72;
  const xs = [];
  const ys = [];
  const stride = Math.max(1, Math.floor(gray.length / 60000));
  // Piksel "tinta" = lebih gelap dari lingkungan sekitarnya DAN berada di area kertas yang terang
  // (latar gelap yang luas dan noise-nya diabaikan).
  for (let i = 0, n = 0; i < gray.length; i++) {
    const isInk = local ? gray[i] < local[i] - 22 && local[i] > mean : gray[i] < thr;
    if (isInk && n++ % stride === 0) { xs.push(i % w); ys.push((i / w) | 0); }
  }
  if (xs.length < 200) return 0;

  const bins = h + w + 4;
  const hist = new Float64Array(bins);
  const score = (deg) => {
    hist.fill(0);
    const t = (deg * Math.PI) / 180;
    const c = Math.cos(t), s = Math.sin(t);
    const off = w + 2;
    for (let k = 0; k < xs.length; k++) hist[Math.round(ys[k] * c - xs[k] * s) + off]++;
    let sc = 0;
    for (let i = 0; i < bins; i++) sc += hist[i] * hist[i];
    return sc;
  };

  const base = score(0);
  let best = 0, bestScore = base;
  for (let a = -15; a <= 15; a += 1) {
    const sc = score(a);
    if (sc > bestScore) { bestScore = sc; best = a; }
  }
  const center = best;
  for (let a = center - 1; a <= center + 1; a += 0.25) {
    const sc = score(a);
    if (sc > bestScore) { bestScore = sc; best = a; }
  }
  if (Math.abs(best) < 0.75 || bestScore < base * 1.06) return 0;
  return best;
}

const white = { r: 255, g: 255, b: 255, alpha: 1 };

async function makeVariants(buf, { maxLong = 2200, maxWidth = null } = {}) {
  // Foto yang kontrasnya rendah (thermal pudar) mendapat CLAHE juga untuk varian warna.
  const st = await sharp(buf).resize({ width: 400, withoutEnlargement: true }).greyscale().stats();
  const lowContrast = st.channels[0].stdev < 48;

  const sizeOpts = maxWidth
    ? { width: maxWidth, withoutEnlargement: true }
    : { width: maxLong, height: maxLong, fit: 'inside', withoutEnlargement: true };
  let colorPipe = sharp(buf).resize(sizeOpts).normalise({ lower: 1, upper: 99 });
  let bwPipe = sharp(buf).resize(sizeOpts).greyscale().normalise({ lower: 1, upper: 99 });
  if (lowContrast) { try { colorPipe = colorPipe.clahe({ width: 32, height: 32, maxSlope: 2 }); } catch { /* opsional */ } }
  try { bwPipe = bwPipe.clahe({ width: 32, height: 32, maxSlope: 3 }); } catch { /* opsional */ }
  colorPipe = colorPipe.sharpen({ sigma: 0.6 });
  bwPipe = bwPipe.linear(1.2, -18).sharpen({ sigma: 0.8 });
  const [color, bw] = await Promise.all([
    colorPipe.jpeg({ quality: 90 }).toBuffer(),
    bwPipe.jpeg({ quality: 85 }).toBuffer(),
  ]);
  return { color, bw, lowContrast };
}

/**
 * Pipeline utama. Input: buffer asli (jpg/png/webp/pdf). Output: varian "color" untuk Claude,
 * "bw" untuk Mistral/retry, dan tile bila struk sangat panjang.
 */
export async function preprocess(buffer, mime) {
  const info = { deskew: 0, trimmed: false, upscaled: false, tall: false, notes: [] };
  const input = mime === 'application/pdf' ? await rasterizePdf(buffer) : buffer;

  // 1) orientasi EXIF, flatten transparansi, batasi ukuran awal
  let buf = await sharp(input, { failOn: 'none', limitInputPixels: 120e6 })
    .rotate()
    .flatten({ background: white })
    .resize({ width: MAX_INPUT_SIDE, height: MAX_INPUT_SIDE, fit: 'inside', withoutEnlargement: true })
    .toColourspace('srgb')
    .png({ compressionLevel: 1 })
    .toBuffer();
  let meta = await sharp(buf).metadata();
  const area0 = meta.width * meta.height;

  // 2) trim tepi seragam (dibatalkan jika memotong terlalu banyak)
  try {
    const t = await sharp(buf).trim({ threshold: 18 }).toBuffer({ resolveWithObject: true });
    if (t.info.width * t.info.height >= area0 * 0.4 && t.info.width > 100 && t.info.height > 100) {
      buf = await sharp(t.data).png({ compressionLevel: 1 }).toBuffer();
      info.trimmed = true;
    }
  } catch { /* gambar seragam / tidak bisa di-trim */ }
  meta = await sharp(buf).metadata();

  // 3) perbesar 2x untuk foto kecil (teks kecil terbantu)
  if (Math.min(meta.width, meta.height) < 1000) {
    const factor = Math.min(2, 4400 / Math.max(meta.width, meta.height));
    if (factor > 1.05) {
      buf = await sharp(buf)
        .resize({ width: Math.round(meta.width * factor), kernel: 'lanczos3' })
        .png({ compressionLevel: 1 })
        .toBuffer();
      info.upscaled = true;
    }
  }

  // 4) deskew
  try {
    const small = await sharp(buf).resize({ width: 480, withoutEnlargement: true }).greyscale().raw().toBuffer({ resolveWithObject: true });
    const { width: sw, height: sh } = small.info;
    const local = await sharp(small.data, { raw: { width: sw, height: sh, channels: 1 } }).blur(6).toColourspace('b-w').raw().toBuffer();
    const angle = estimateSkew(small.data, sw, sh, local);
    if (angle !== 0) {
      buf = await sharp(buf).rotate(-angle, { background: white }).png({ compressionLevel: 1 }).toBuffer();
      info.deskew = angle;
    }
  } catch { /* lewati bila gagal */ }

  // 5) margin putih kecil
  buf = await sharp(buf)
    .extend({ top: 12, bottom: 12, left: 12, right: 12, background: white })
    .png({ compressionLevel: 1 })
    .toBuffer();
  meta = await sharp(buf).metadata();
  info.width = meta.width;
  info.height = meta.height;

  // 6) varian + tile untuk struk panjang
  if (meta.height / meta.width > 3) {
    info.tall = true;
    const full = await makeVariants(buf, { maxWidth: 1400 });
    const colorMeta = await sharp(full.color).metadata();
    const step = Math.floor(TILE_H * (1 - TILE_OVERLAP));
    const tiles = [];
    for (let top = 0; ; top += step) {
      const height = Math.min(TILE_H, colorMeta.height - top);
      if (height < 200 && tiles.length > 0) break;
      const region = { left: 0, top, width: colorMeta.width, height };
      const [color, bw] = await Promise.all([
        sharp(full.color).extract(region).jpeg({ quality: 90 }).toBuffer(),
        sharp(full.bw).extract(region).jpeg({ quality: 85 }).toBuffer(),
      ]);
      tiles.push({ color, bw });
      if (top + TILE_H >= colorMeta.height) break;
    }
    info.lowContrast = full.lowContrast;
    return { color: full.color, bw: full.bw, tiles, info };
  }

  const variants = await makeVariants(buf);
  info.lowContrast = variants.lowContrast;
  return { color: variants.color, bw: variants.bw, tiles: null, info };
}
