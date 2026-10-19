# SplitBill

Bagi tagihan dari foto struk. Frontend HTML + CSS + JavaScript murni (tanpa framework dan tanpa build step), backend Node.js (Express) tipis. Penyimpanan: Upstash Redis di Vercel, SQLite untuk lokal/VPS.

OCR: **Claude (lewat gateway Sumopod)** sebagai mesin utama, **Mistral OCR** sebagai cadangan otomatis.

## Menjalankan

```bash
npm install
cp .env.example .env      # lalu isi SUMOPOD_API_KEY dan MISTRAL_API_KEY
npm run check:keys        # uji koneksi API (tidak mencetak key)
npm start                 # http://localhost:3000
```

Butuh Node.js 22 atau lebih baru (syarat `better-sqlite3` 13). `.npmrc` sudah mengatur `ignore-scripts=true`: semua dependensi membawa binary siap pakai, jadi tidak perlu compiler.

### Soal API key
- Key hanya dibaca server dari `.env`. Tidak pernah ada di kode frontend, log, atau git (`.env` sudah di `.gitignore`).
- **Ganti (rotate) key yang pernah ditempel di chat atau tempat publik.** Buat key baru di dashboard Sumopod dan Mistral, lalu hapus yang lama.
- Pasang batas pengeluaran di dashboard kedua penyedia. Endpoint scan bersifat publik (tanpa login), rate limit bawaan 10 scan/menit/IP.

### Jika `check:keys` gagal
| Gejala | Biasanya berarti |
|---|---|
| HTTP 401/403 | key salah atau belum aktif |
| HTTP 404 | `SUMOPOD_API_STYLE` salah (`anthropic` vs `openai`) atau nama model (`CLAUDE_MODEL`) tidak dikenal gateway |
| HTTP 429 | kuota habis atau kena rate limit |

## Alur OCR
1. Browser: koreksi orientasi EXIF, HEIC→JPEG (heic2any), perkecil maks 2200px, JPEG q0.88, cek blur/gelap/resolusi rendah (hanya saran, tidak memblokir).
2. Server (sharp): auto-orient, trim, upscale foto kecil, deskew (±15°), normalisasi kontras, dua varian (`color` untuk Claude, `bw` untuk Mistral), struk panjang dipotong jadi tile dengan overlap 15%, PDF dirender halaman pertama (mupdf).
3. Claude membaca varian `color`. Jika belum menjawab dalam 12 dtk, Mistral dijalankan paralel; hasil valid tercepat dipakai.
4. Gagal (error jaringan, timeout, 429/5xx, JSON rusak, skema salah, atau hitungan tidak cocok) → Mistral OCR + structuring → satu kali retry Claude dengan draft teks Mistral → bila tetap tidak cocok, hasil terbaik dikembalikan **dengan peringatan** (tidak pernah diam-diam salah).
5. Setiap hasil divalidasi: jumlah item = subtotal, subtotal ± biaya = total. Baris meragukan ditandai "Cek ulang".
6. Hasil dicache per SHA-256 file (hanya yang lolos validasi). Foto tidak pernah ditulis ke disk.

## Deploy ke Vercel

Proyek ini sudah siap deploy: `public/` disajikan CDN, seluruh API berjalan sebagai satu fungsi (`api/index.js`), dan `vercel.json` mengatur rute, header keamanan, durasi 60 dtk, serta region Singapura (`sin1`).

1. **Unggah ke GitHub** (atau jalankan `npx vercel` dari folder ini).
2. **Import di Vercel.** Framework Preset: *Other*. Build Command dikosongkan. Output Directory `public` (sudah di `vercel.json`).
3. **Tambah penyimpanan (wajib).** Vercel dashboard → *Storage* → *Marketplace* → **Upstash Redis** → buat database (pilih region Singapura) → *Connect Project*. Variabel `KV_REST_API_URL` dan `KV_REST_API_TOKEN` terisi otomatis. Tanpa ini, membuat tagihan menghasilkan error 503 dengan petunjuk. Disk Vercel bersifat sementara, jadi SQLite tidak bisa dipakai.
4. **Isi Environment Variables** (Settings → Environment Variables): `SUMOPOD_API_KEY`, `SUMOPOD_BASE_URL`, `SUMOPOD_API_STYLE`, `CLAUDE_MODEL`, `MISTRAL_API_KEY`, opsional `QA_TOKEN`, `SUPPORT_EMAIL`, `DONATION_URL`. Setelah mengubah variabel, **redeploy**.
5. **Deploy**, lalu buka `https://<domain-kamu>/qa`, isi `QA_TOKEN`, dan jalankan **Cek Sistem**. Semua baris harus LULUS, lalu jalankan **Uji Alur API** dan **Uji Scan** dengan struk asli.

Hal yang perlu diketahui di Vercel:
- **Batas upload 4MB** (batas body fungsi Vercel 4,5MB). Foto otomatis dikompres browser (~1,5MB) sehingga aman. PDF dikirim apa adanya, jadi PDF di atas 4MB ditolak dengan pesan jelas.
- **Durasi maksimum 60 dtk.** Batas scan diatur 52 dtk supaya selalu membalas dengan pesan rapi sebelum fungsi dihentikan.
- **Request pertama setelah lama sepi lebih lambat** (cold start; pustaka gambar dan PDF dimuat).
- **Data tersimpan di Redis dengan TTL 90 hari** sejak terakhir dibuka (tanpa cron). Pantau kuota gratis Upstash bila trafik tinggi.
- **Pembatas laju** berbasis Redis, berlaku lintas instance.
- `public/vendor/` (font, html2canvas, jsPDF, heic2any) sudah ikut di repo. Jika kamu memperbarui versinya: `npm install` lalu `npm run vendor`.
- `npm run trace:vercel` menampilkan file apa saja yang masuk bundel fungsi dan ukurannya.
- Matikan halaman QA di produksi dengan menghapus `public/qa.html`, atau biarkan: tanpa `QA_TOKEN` diagnostik server mati, dan isi halaman tidak berisi rahasia.

## Halaman QA (`/qa`)
Satu halaman untuk menguji aplikasi tanpa alat tambahan:

| Tab | Isi |
|---|---|
| Cek Sistem | server, penyimpanan, aset statis, rute halaman, header keamanan, kemampuan browser. Dengan `QA_TOKEN`: status key, uji panggilan Claude dan Mistral |
| Uji Scan | unggah struk, lihat hasil mentah, waktu, mesin, pemeriksaan matematika, dan bandingkan dengan JSON yang diharapkan |
| Uji Hitungan | ratusan struk acak membuktikan total semua orang = total struk, termasuk pembulatan |
| Uji Alur API | buat tagihan uji → teman bayar → penagih konfirmasi → QRIS → hapus |
| Checklist Manual | 80 kasus uji (landing sampai deploy), nilai Lulus/Gagal/Lewati + catatan, tersimpan di browser |
| Laporan | gabungan semuanya, ekspor Markdown atau JSON |

## Skrip
| Perintah | Fungsi |
|---|---|
| `npm test` | tes unit + integrasi API (termasuk mode Vercel + Redis tiruan) |
| `npm run check:keys` | uji koneksi Sumopod dan Mistral |
| `npm run scan:cli -- struk.jpg` | jalankan pipeline OCR pada satu file |
| `npm run eval:ocr` | evaluasi semua fixture di `tests/fixtures` |
| `npm run vendor` | salin pustaka frontend ke `public/vendor` |
| `npm run trace:vercel` | periksa isi bundel fungsi Vercel |
| `node scripts/mock-gateway.js` | gateway palsu untuk pengembangan tanpa key |
| `node scripts/make-sample.js` | buat foto struk sintetis |

Untuk mengukur akurasi sebenarnya, tambahkan **foto struk asli** (15–30 lembar, beragam jenis; sensor data pribadi) ke `tests/fixtures/` beserta `<nama>.expected.json`. Fixture bawaan hanya struk sintetis.

Pengembangan tanpa key asli:
```bash
node scripts/mock-gateway.js &
SUMOPOD_BASE_URL=http://localhost:4010 MISTRAL_BASE_URL=http://localhost:4010 SUMOPOD_API_KEY=x MISTRAL_API_KEY=x npm start
```

## Struktur
```
api/index.js      entry fungsi Vercel
vercel.json       rute, header, durasi, region
server/           index.js, config.js, routes/ (scan, bills, public, qa), storage/ (redis, sqlite), lib/, services/ocr/
public/           index.html, app.html, share.html, owner.html, qa.html, css/, js/, vendor/
scripts/          check-keys, scan-cli, eval-ocr, mock-gateway, make-sample, sync-vendor, trace-vercel
tests/            split, money, validate, orchestrator, api, api.vercel, api.vercel-nostorage (+ helpers/, fixtures/)
```
`public/js/split.js` adalah modul murni yang dipakai browser dan server (server menghitung ulang pembagian saat tagihan dibuat).

## Data dan privasi
- Yang disimpan: hasil bacaan (item, harga, pembagian), info pembayaran, status bayar. Foto struk tidak disimpan. Gambar QRIS disimpan (di Redis pada Vercel, di `uploads/qris/` pada mode lokal) dan dihapus bersama masa berlakunya.
- Penagih bisa menghapus tagihan kapan saja lewat tombol "Hapus Tagihan Ini".
- Tagihan dihapus otomatis 90 hari sejak terakhir dibuka.
- Tautan teman (`/s/...`) dan tautan penagih (`/b/...`) memakai token acak 128-bit. Tanpa login: siapa pun yang punya tautan penagih bisa mengubah status pembayaran.

## Deploy di server biasa (VPS, Railway, Render)
Selain Vercel, aplikasi juga jalan sebagai server Node persisten (`npm start`) dengan SQLite. Atur environment variable seperti `.env.example`. Beri **volume persisten** untuk `data/` dan `uploads/` (atau ubah `DB_PATH` dan `UPLOAD_DIR`). Di belakang proxy, set `TRUST_PROXY=1` supaya rate limit membaca IP asli. Pasang HTTPS (diperlukan untuk tombol salin ke clipboard di domain non-localhost).

## Keterbatasan yang perlu diketahui
- Tidak ada OCR yang 100% akurat, terutama thermal pudar dan tulisan tangan. Karena itu koreksi manual selalu tersedia dan hasil yang meragukan ditandai.
- Crop bebas (seret sudut) belum ada; yang tersedia putar kiri/kanan. Server memangkas tepi dan meluruskan kemiringan otomatis.
- HEIC dikonversi di browser. HEIC yang dikirim langsung ke server mungkin gagal dibaca.
- Pengingat dikirim lewat tautan `wa.me` (kamu yang menekan kirim), bukan terjadwal otomatis.
- Riwayat terikat ke browser/perangkat lewat `localStorage`. Simpan tautan penagih untuk membuka dari perangkat lain.
