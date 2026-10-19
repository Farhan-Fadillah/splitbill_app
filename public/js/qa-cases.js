// Kasus uji manual untuk halaman /qa.html. Tiap kasus: langkah singkat + hasil yang diharapkan.
export const CASES = [
  // ---------------------------------------------------------------- Landing
  { id: 'LND-1', group: 'Landing', title: 'Landing tampil lengkap', steps: ['Buka /', 'Scroll sampai footer'], expect: 'Hero, fitur, cara pakai, simulasi, FAQ, dan footer tampil. Tidak ada teks "null" atau "[object". Tidak ada scroll horizontal.' },
  { id: 'LND-2', group: 'Landing', title: 'Tombol utama mengarah benar', steps: ['Klik "Mulai Scan Struk"', 'Kembali, klik "Input Manual"'], expect: 'Pertama ke /app#/scan. Kedua membuka layar Koreksi dengan daftar item kosong.' },
  { id: 'LND-3', group: 'Landing', title: 'Simulasi interaktif', steps: ['Ganti "Mobile View" ke "WhatsApp Slip"', 'Klik "Mode Demo"', 'Klik "Tandai Sudah Bayar"'], expect: 'Tampilan berganti, mode demo gelap/terang berubah, status demo berganti.' },
  { id: 'LND-4', group: 'Landing', title: 'Klaim di landing jujur', steps: ['Baca status strip, metrik, dan FAQ'], expect: 'Tidak ada klaim akurasi pasti (mis. "99%" atau "100% akurat").' },

  // ---------------------------------------------------------------- Scan
  { id: 'SCN-1', group: 'Scan', title: 'Unggah foto struk JPG', steps: ['Buka Scan Struk', 'Pilih foto struk asli (JPG)', 'Klik "Scan Struk"'], expect: 'Pratinjau tampil, teks progres berganti (Mengoptimalkan, Membaca, Memeriksa), lalu pindah ke Koreksi dengan item terisi.' },
  { id: 'SCN-2', group: 'Scan', title: 'Tombol nonaktif tanpa foto', steps: ['Buka Scan Struk tanpa memilih file'], expect: '"Scan Struk" dan "Hapus Foto" nonaktif.' },
  { id: 'SCN-3', group: 'Scan', title: 'Hapus foto', steps: ['Pilih foto', 'Klik "Hapus Foto"'], expect: 'Kembali ke area unggah kosong.' },
  { id: 'SCN-4', group: 'Scan', title: 'Drag and drop', steps: ['Seret file gambar ke area unggah (desktop)'], expect: 'Area menyala saat diseret, foto terbaca setelah dilepas.' },
  { id: 'SCN-5', group: 'Scan', title: 'Kamera di ponsel', steps: ['Di ponsel, klik "Ambil Foto"', 'Foto sebuah struk'], expect: 'Kamera terbuka, hasil foto muncul sebagai pratinjau.' },
  { id: 'SCN-6', group: 'Scan', title: 'Foto iPhone (HEIC)', steps: ['Pilih foto HEIC dari iPhone'], expect: 'Dikonversi di browser dan bisa di-scan. Jika gagal, ada pesan yang jelas.' },
  { id: 'SCN-7', group: 'Scan', title: 'PDF', steps: ['Pilih PDF struk kecil (di bawah 4MB)', 'Scan'], expect: 'Halaman pertama terbaca. PDF di atas batas server ditolak dengan pesan yang menyebut batasnya.' },
  { id: 'SCN-8', group: 'Scan', title: 'Peringatan kualitas', steps: ['Pilih foto sengaja buram atau gelap'], expect: 'Muncul saran ("agak buram" / "terlalu gelap") tetapi tetap bisa lanjut scan.' },
  { id: 'SCN-9', group: 'Scan', title: 'Putar foto', steps: ['Pilih foto', 'Klik "Putar Kanan" dua kali'], expect: 'Pratinjau berputar 180 derajat, hasil scan memakai orientasi baru.' },
  { id: 'SCN-10', group: 'Scan', title: 'Bukan struk', steps: ['Unggah foto selfie atau pemandangan', 'Scan'], expect: 'Pesan "Foto ini sepertinya bukan struk" dengan pilihan ganti foto atau input manual.' },
  { id: 'SCN-11', group: 'Scan', title: 'Struk miring / gelap / pudar', steps: ['Scan foto miring, remang, dan thermal pudar'], expect: 'Item terbaca atau, jika ragu, baris ditandai "Cek ulang". Tidak ada angka yang tampak sah tetapi salah tanpa peringatan.' },
  { id: 'SCN-12', group: 'Scan', title: 'Struk panjang', steps: ['Scan struk supermarket yang panjang (banyak item)'], expect: 'Item tidak ganda di sambungan potongan, total cocok atau ada peringatan.' },
  { id: 'SCN-13', group: 'Scan', title: 'Struk bahasa/mata uang asing', steps: ['Scan struk berbahasa Inggris, lalu struk mata uang asing'], expect: 'Bahasa Inggris terbaca. Mata uang asing menampilkan layar kurs manual dan baru bisa lanjut setelah kurs diisi.' },
  { id: 'SCN-14', group: 'Scan', title: 'Screenshot aplikasi pesan-antar', steps: ['Scan screenshot GoFood/GrabFood/ShopeeFood'], expect: 'Ongkir, biaya layanan/platform, dan voucher masuk ke kolom yang benar.' },
  { id: 'SCN-15', group: 'Scan', title: 'Server gagal / offline', steps: ['Matikan internet (atau blokir /api/scan) lalu scan'], expect: 'Pesan error jelas, foto tetap ada, tersedia "Coba Lagi" dan "Input Manual (foto tetap terlihat)".' },
  { id: 'SCN-16', group: 'Scan', title: 'Batas kecepatan', steps: ['Scan lebih dari 10 kali dalam semenit (atau sesuai SCAN_RATE_PER_MIN)'], expect: 'Pesan "Terlalu banyak scan" dan bisa dicoba lagi setelah satu menit.' },

  // ---------------------------------------------------------------- Review
  { id: 'REV-1', group: 'Koreksi', title: 'Edit item inline', steps: ['Ubah nama, qty, harga, dan potongan satu item'], expect: 'Total baris dan "Total dihitung" berubah langsung tanpa memuat ulang.' },
  { id: 'REV-2', group: 'Koreksi', title: 'Tambah dan hapus item', steps: ['Klik "Tambah Item", isi', 'Hapus satu item dengan ×'], expect: 'Baris muncul/hilang, total menyesuaikan, hapus semua memunculkan keadaan kosong.' },
  { id: 'REV-3', group: 'Koreksi', title: 'Tanda "Cek ulang"', steps: ['Scan struk yang kurang jelas', 'Edit baris yang bertanda'], expect: 'Baris meragukan berlatar kuning dengan label; label hilang setelah diedit.' },
  { id: 'REV-4', group: 'Koreksi', title: 'Banner selisih total', steps: ['Ubah satu harga sehingga beda dari total struk'], expect: 'Muncul banner kuning berisi selisih. Mengembalikan angka memunculkan banner hijau.' },
  { id: 'REV-5', group: 'Koreksi', title: 'Biaya tambahan dan toggle', steps: ['Isi service/pajak/ongkir/tip/pembulatan', 'Ganti Proporsional/Rata'], expect: 'Ringkasan memuat tiap biaya dengan keterangan cara bagi. Pembulatan boleh negatif.' },
  { id: 'REV-6', group: 'Koreksi', title: 'Foto di samping daftar', steps: ['Desktop: lihat panel foto', 'Ponsel: buka "Foto struk asli", perbesar'], expect: 'Foto tampil di samping (desktop) atau bisa dibuka/ditutup (ponsel), bisa diperbesar dan digeser.' },
  { id: 'REV-7', group: 'Koreksi', title: 'Input manual', steps: ['Buka #/manual', 'Isi 2 item'], expect: 'Mulai dari daftar kosong, "Lanjut Atur Pembagian" aktif setelah total lebih dari 0.' },
  { id: 'REV-8', group: 'Koreksi', title: 'Lanjut diblokir bila kosong', steps: ['Hapus semua item'], expect: 'Tombol Lanjut nonaktif dengan petunjuk.' },

  // ---------------------------------------------------------------- Pembagian
  { id: 'ASG-1', group: 'Pembagian', title: 'Tambah dan hapus teman', steps: ['Tambah 3 nama (Enter dan tombol)', 'Hapus satu'], expect: 'Chip muncul/hilang. Nama ganda ditolak. Nama baru masuk "Teman tersimpan".' },
  { id: 'ASG-2', group: 'Pembagian', title: 'Bagi rata item bersama', steps: ['Ketuk item, centang 3 orang, mode Bagi Rata, Simpan'], expect: 'Jumlah per orang tampil di daftar dan jumlahnya persis sama dengan harga item.' },
  { id: 'ASG-3', group: 'Pembagian', title: 'Per porsi', steps: ['Mode Per Porsi, isi 2 dan 1'], expect: 'Pembagian 2:1 dengan pratinjau jumlah langsung.' },
  { id: 'ASG-4', group: 'Pembagian', title: 'Persentase harus 100%', steps: ['Mode Persentase, isi 60 dan 30', 'Ubah jadi 60 dan 40'], expect: 'Pada 90% muncul pesan dan Simpan nonaktif. Pada 100% Simpan aktif.' },
  { id: 'ASG-5', group: 'Pembagian', title: 'Item belum dipilih', steps: ['Biarkan satu item tanpa pilihan'], expect: 'Ada banner jumlah item belum dipilih dan item dibagi rata ke semua orang.' },
  { id: 'ASG-6', group: 'Pembagian', title: 'Pembulatan', steps: ['Pilih Rp500 lalu buka Ringkasan'], expect: 'Nominal teman kelipatan 500, selisih ada di baris "Penyesuaian pembulatan" milik penagih, total tidak berubah.' },
  { id: 'ASG-7', group: 'Pembagian', title: 'Hapus teman yang sudah dipilih', steps: ['Pilih teman di item', 'Hapus teman itu'], expect: 'Pilihan item terkait ikut bersih dan total tetap benar.' },

  // ---------------------------------------------------------------- Ringkasan
  { id: 'SUM-1', group: 'Ringkasan', title: 'Kartu per orang', steps: ['Buka Ringkasan'], expect: 'Satu kartu per orang berisi item, biaya, dan total. Jumlah semua total sama dengan total tagihan.' },
  { id: 'SUM-2', group: 'Ringkasan', title: 'Beberapa struk', steps: ['Klik "+ Tambah Struk", scan struk kedua', 'Atur pembagian', 'Buka tab "Gabungkan semua struk"'], expect: 'Tab Struk 1/2 dan Gabungan muncul. Total gabungan per orang = jumlah kedua struk.' },
  { id: 'SUM-3', group: 'Ringkasan', title: 'Simpan gambar', steps: ['Klik "Simpan sebagai Gambar"'], expect: 'File PNG terunduh dan isinya sama dengan kartu di layar.' },
  { id: 'SUM-4', group: 'Ringkasan', title: 'Unduh PDF', steps: ['Klik "Unduh PDF"'], expect: 'PDF terunduh, terbaca, dan tidak terpotong (termasuk bila banyak orang).' },

  // ---------------------------------------------------------------- Pembayaran & share
  { id: 'PAY-1', group: 'Bayar & Share', title: 'Isi info pembayaran', steps: ['Isi bank, nomor rekening, e-wallet', 'Lihat pratinjau'], expect: 'Pratinjau "Tampilan di halaman teman" ikut berubah saat mengetik.' },
  { id: 'PAY-2', group: 'Bayar & Share', title: 'Unggah QRIS', steps: ['Unggah gambar QRIS', 'Coba file di atas 2MB dan file non-gambar'], expect: 'QRIS tampil di pratinjau. File terlalu besar atau salah format ditolak dengan pesan.' },
  { id: 'PAY-3', group: 'Bayar & Share', title: 'Simpan untuk berikutnya', steps: ['Centang simpan, buat tautan', 'Mulai split baru, buka Info Pembayaran'], expect: 'Data pembayaran terisi otomatis. Tanpa centang, tidak tersimpan.' },
  { id: 'PAY-4', group: 'Bayar & Share', title: 'Buat tautan', steps: ['Klik "Buat Tautan & Bagikan"'], expect: 'Pindah ke layar Tautan dengan tautan teman dan tautan pribadi berbeda.' },
  { id: 'PAY-5', group: 'Bayar & Share', title: 'Share ke WhatsApp', steps: ['Klik "Share ke WhatsApp"', 'Buka "Pratinjau pesan WhatsApp"'], expect: 'WhatsApp terbuka dengan teks rincian, rekening, dan tautan. Pratinjau pesan sama dengan isi yang terkirim.' },
  { id: 'PAY-6', group: 'Bayar & Share', title: 'Tautan tidak dobel', steps: ['Dari layar tautan kembali, tanpa mengubah apa pun klik buat tautan lagi'], expect: 'Tautan yang sama dipakai, bukan tagihan baru di Riwayat.' },

  // ---------------------------------------------------------------- Halaman teman
  { id: 'FRD-1', group: 'Halaman Teman', title: 'Buka tanpa login', steps: ['Buka tautan teman di jendela penyamaran/ponsel lain'], expect: 'Judul tagihan, tanggal, dan daftar nama tampil tanpa login.' },
  { id: 'FRD-2', group: 'Halaman Teman', title: 'Hanya bagian sendiri', steps: ['Pilih nama', 'Periksa isi halaman dan respons jaringan'], expect: 'Hanya rincian orang itu yang tampil. Tautan pribadi penagih tidak muncul di mana pun.' },
  { id: 'FRD-3', group: 'Halaman Teman', title: 'Info pembayaran dan salin', steps: ['Klik "Salin nomor"', 'Tempel di tempat lain'], expect: 'Nomor tersalin. Jika gagal, ada pesan "salin manual" (butuh HTTPS).' },
  { id: 'FRD-4', group: 'Halaman Teman', title: 'Tandai sudah bayar', steps: ['Klik "Tandai Sudah Bayar"'], expect: 'Status jadi "Menunggu Konfirmasi", tombol hilang, dan bertahan setelah halaman dimuat ulang.' },
  { id: 'FRD-5', group: 'Halaman Teman', title: 'Ingat nama pilihan', steps: ['Muat ulang halaman'], expect: 'Nama yang dipilih diingat. "Ganti nama" memunculkan daftar lagi.' },
  { id: 'FRD-6', group: 'Halaman Teman', title: 'Tautan salah / kedaluwarsa', steps: ['Buka /s/tokensalah1234567890'], expect: 'Pesan "Tagihan tidak ditemukan", bukan halaman rusak.' },

  // ---------------------------------------------------------------- Status penagih
  { id: 'OWN-1', group: 'Status Penagih', title: 'Progres pembayaran', steps: ['Buka tautan pribadi /b/...'], expect: 'Menampilkan "X dari Y sudah bayar, Rp ... terkumpul" dan batang progres benar.' },
  { id: 'OWN-2', group: 'Status Penagih', title: 'Konfirmasi dan batalkan', steps: ['Teman menandai bayar', 'Klik "Konfirmasi"', 'Klik "Batalkan"'], expect: 'Status Menunggu → Sudah Bayar → Belum Bayar, angka progres ikut berubah.' },
  { id: 'OWN-3', group: 'Status Penagih', title: 'Tandai lunas manual', steps: ['Klik "Tandai Lunas" pada teman yang belum bayar'], expect: 'Status jadi Sudah Bayar tanpa menunggu teman.' },
  { id: 'OWN-4', group: 'Status Penagih', title: 'Pengingat', steps: ['Klik "Kirim Pengingat" pada satu teman', 'Klik "Ingatkan Semua Yang Belum Bayar"'], expect: 'WhatsApp terbuka dengan pesan sopan berisi nama, nominal, dan tautan. Hanya yang belum lunas yang disebut.' },
  { id: 'OWN-5', group: 'Status Penagih', title: 'Pembaruan otomatis', steps: ['Biarkan halaman penagih terbuka', 'Di perangkat lain teman menandai bayar'], expect: 'Dalam sekitar 20 detik status berubah tanpa memuat ulang.' },
  { id: 'OWN-6', group: 'Status Penagih', title: 'Hapus tagihan', steps: ['Klik "Hapus Tagihan Ini" dan setujui', 'Buka tautan teman'], expect: 'Tagihan hilang dari Riwayat dan tautan teman menampilkan "tidak ditemukan".' },

  // ---------------------------------------------------------------- Riwayat & Support
  { id: 'HIS-1', group: 'Riwayat & Support', title: 'Daftar riwayat', steps: ['Buat 2 tagihan', 'Buka Riwayat'], expect: 'Dua tagihan tampil dengan nama, tanggal, jumlah orang, total, dan status.' },
  { id: 'HIS-2', group: 'Riwayat & Support', title: 'Cari dan filter', steps: ['Ketik sebagian nama', 'Pilih filter Lunas / Belum Lunas'], expect: 'Daftar menyesuaikan, dan "Tidak ada hasil" muncul bila kosong.' },
  { id: 'HIS-3', group: 'Riwayat & Support', title: 'Riwayat kosong', steps: ['Buka Riwayat di browser baru'], expect: 'Keadaan kosong dengan ajakan memulai scan.' },
  { id: 'HIS-4', group: 'Riwayat & Support', title: 'Halaman Support', steps: ['Buka Support', 'Klik tiap tautan'], expect: 'Email, lapor bug, request fitur, dan feedback membuka aplikasi email dengan subjek yang sesuai. Kartu donasi tampil.' },

  // ---------------------------------------------------------------- Tampilan
  { id: 'UI-1', group: 'Tampilan', title: 'Mode gelap', steps: ['Klik tombol mode di header di setiap halaman', 'Muat ulang'], expect: 'Seluruh layar terbaca di mode gelap, pilihan diingat, dan mengikuti pengaturan sistem bila belum memilih.' },
  { id: 'UI-2', group: 'Tampilan', title: 'Ponsel 375px', steps: ['Buka tiap layar di lebar 375px'], expect: 'Tidak ada scroll horizontal, tombol utama tidak tertutup bar bawah, menu hamburger berfungsi.' },
  { id: 'UI-3', group: 'Tampilan', title: 'Desktop lebar', steps: ['Buka Koreksi dan Pembagian di 1440px'], expect: 'Foto di samping daftar, tata letak tidak melebar berlebihan.' },
  { id: 'UI-4', group: 'Tampilan', title: 'Muat ulang di tengah alur', steps: ['Di layar Pembagian, tekan muat ulang'], expect: 'Data sesi (item, teman, pilihan) tetap ada. Hanya foto asli yang hilang dengan keterangan.' },

  // ---------------------------------------------------------------- Aksesibilitas
  { id: 'A11Y-1', group: 'Aksesibilitas', title: 'Keyboard', steps: ['Navigasi seluruh alur hanya dengan Tab, Enter, Spasi, Esc'], expect: 'Semua kontrol terjangkau, fokus terlihat jelas, dialog pembagian bisa ditutup dengan Esc.' },
  { id: 'A11Y-2', group: 'Aksesibilitas', title: 'Target sentuh', steps: ['Di ponsel, ketuk tombol dan chip'], expect: 'Target nyaman diketuk (sekitar 44px), tidak salah ketuk.' },
  { id: 'A11Y-3', group: 'Aksesibilitas', title: 'Pembaca layar', steps: ['Aktifkan VoiceOver/TalkBack di layar Koreksi dan Pembagian'], expect: 'Input punya label, tombol hapus menyebut nama item, status dibacakan.' },
  { id: 'A11Y-4', group: 'Aksesibilitas', title: 'Kontras', steps: ['Periksa teks kecil di mode terang dan gelap'], expect: 'Teks mudah dibaca, status tidak hanya dibedakan oleh warna.' },

  // ---------------------------------------------------------------- Keamanan
  { id: 'SEC-1', group: 'Keamanan & Privasi', title: 'Key tidak terlihat', steps: ['Buka DevTools > Network dan Sources, cari "sk-" dan "mstrl"'], expect: 'Tidak ada key API di kode atau respons mana pun.' },
  { id: 'SEC-2', group: 'Keamanan & Privasi', title: 'XSS', steps: ['Beri nama teman dan item: <img src=x onerror=alert(1)>'], expect: 'Tampil sebagai teks biasa di semua layar (termasuk halaman teman dan PDF), tidak ada alert.' },
  { id: 'SEC-3', group: 'Keamanan & Privasi', title: 'Tautan penagih tidak bocor', steps: ['Buka tautan teman, periksa respons /api/public/...'], expect: 'Tidak ada token penagih di dalamnya.' },
  { id: 'SEC-4', group: 'Keamanan & Privasi', title: 'File berbahaya', steps: ['Ganti nama file teks menjadi .jpg lalu unggah'], expect: 'Ditolak dengan pesan format tidak didukung.' },
  { id: 'SEC-5', group: 'Keamanan & Privasi', title: 'Foto tidak disimpan', steps: ['Scan struk, periksa penyimpanan server/Redis'], expect: 'Hanya data hasil bacaan yang tersimpan, tidak ada file foto struk.' },

  // ---------------------------------------------------------------- Deploy
  { id: 'DEP-1', group: 'Deploy Vercel', title: 'Cek Sistem hijau', steps: ['Buka tab "Cek Sistem" di halaman ini dan jalankan'], expect: 'Semua cek LULUS (dengan token QA: penyimpanan Redis OK, key Claude dan Mistral terisi dan merespons).' },
  { id: 'DEP-2', group: 'Deploy Vercel', title: 'Rute halaman', steps: ['Buka langsung /app, /s/abc, /b/abc, /qa'], expect: 'Semua membuka halaman yang benar (bukan 404 Vercel).' },
  { id: 'DEP-3', group: 'Deploy Vercel', title: 'Data bertahan antar request', steps: ['Buat tagihan', 'Tunggu beberapa menit, buka tautan teman dari perangkat lain'], expect: 'Tagihan masih ada (membuktikan penyimpanan Redis, bukan memori fungsi).' },
  { id: 'DEP-4', group: 'Deploy Vercel', title: 'Batas ukuran upload', steps: ['Uji Scan: centang "kirim file asli" dengan file di atas 4,5MB'], expect: 'Ditolak dengan pesan jelas (bukan layar putih). Foto biasa tetap lolos karena dikompres browser.' },
  { id: 'DEP-5', group: 'Deploy Vercel', title: 'Waktu scan dalam batas', steps: ['Scan 5 struk berbeda dan catat waktunya'], expect: 'Tiap scan selesai di bawah batas fungsi (60 dtk). Struk panjang tidak kena timeout.' },
  { id: 'DEP-6', group: 'Deploy Vercel', title: 'PDF di Vercel', steps: ['Scan PDF kecil di URL produksi'], expect: 'Berhasil dibaca (membuktikan modul PDF ikut terbundel).' },
  { id: 'DEP-7', group: 'Deploy Vercel', title: 'Mode QA aman', steps: ['Tanpa QA_TOKEN buka /api/qa/status', 'Dengan token salah'], expect: 'Tanpa token terkonfigurasi: 404. Token salah: 401. Nilai key tidak pernah tampil.' },
];

export const GROUPS = [...new Set(CASES.map((c) => c.group))];
