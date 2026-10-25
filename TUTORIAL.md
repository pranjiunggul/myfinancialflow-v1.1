> [!NOTE]
> **Dokumentasi Dwibahasa / Bilingual Documentation**
> - Baca panduan ini dalam **Bahasa Inggris / Read in English**: [TUTORIAL.en.md](TUTORIAL.en.md)
> - Kembali ke Dokumentasi Utama: [README.id.md](README.id.md)

# Panduan Lengkap Pengguna MyFinancialFlow

Selamat datang di **MyFinancialFlow**! MyFinancialFlow adalah aplikasi pencatatan dan pengelolaan keuangan pribadi yang bekerja secara offline-first, cepat, privat, dan tanpa biaya langganan. Data keuangan Anda 100% tersimpan aman di browser perangkat Anda sendiri.

Buku panduan ini disusun secara praktis dan ramah pengguna untuk memandu Anda memanfaatkan seluruh fitur MyFinancialFlow secara optimal.

---

## Daftar Isi
1. [Langkah Awal: Pengamanan PIN & Akun Keuangan](#1-langkah-awal-pengamanan-pin--akun-keuangan)
2. [Pencatatan Transaksi Sehari-Hari (Multi-Modal)](#2-pencatatan-transaksi-sehari-hari-multi-modal)
   - [Formulir Input Cepat (Quick-Add)](#21-formulir-input-cepat-quick-add)
   - [Asisten Obrolan AI (Smart AI Chat)](#22-asisten-obrolan-ai-smart-ai-chat)
   - [Pindai Struk Belanja (Receipt OCR)](#23-pindai-struk-belanja-receipt-ocr)
   - [Ekstraksi Screenshot Mutasi Massal (Bulk History OCR)](#24-ekstraksi-screenshot-mutasi-massal-bulk-history-ocr)
   - [Perekaman Suara (Voice Input)](#25-perekaman-suara-voice-input)
   - [Pencatatan Lewat Bot Telegram](#26-pencatatan-lewat-bot-telegram)
3. [Target Finansial (Savings Goals) & Proyeksi Kecepatan](#3-target-finansial-savings-goals--proyeksi-kecepatan)
4. [Portofolio Investasi & Aset Non-Kas](#4-portofolio-investasi--aset-non-kas)
5. [Proyeksi Arus Kas (Cash Flow Forecasting)](#5-proyeksi-arus-kas-cash-flow-forecasting)
6. [Estimator Pajak Penghasilan (PPh 21 / PPh 23 Indonesia)](#6-estimator-pajak-penghasilan-pph-21--pph-23-indonesia)
7. [Sinkronisasi Cloud Antar-Perangkat (Google Drive Sync)](#7-sinkronisasi-cloud-antar-perangkat-google-drive-sync)
8. [Privasi, Cadangan & Hapus Data (Right-to-be-Forgotten)](#8-privasi-cadangan--hapus-data-right-to-be-forgotten)
9. [Tanya Jawab & Solusi Masalah (FAQ & Troubleshooting)](#9-tanya-jawab--solusi-masalah-faq--troubleshooting)

---

## 1. Langkah Awal: Pengamanan PIN & Akun Keuangan

Saat pertama kali membuka MyFinancialFlow, luangkan waktu 2 menit untuk menyiapkan pondasi keuangan Anda:

### 1.1 Pasang PIN Pengaman
1. Buka menu **Pengaturan (Settings)**.
2. Pilih menu **Keamanan & Kunci Aplikasi**.
3. Masukkan 4 hingga 6 digit angka sebagai PIN rahasia Anda. Anda juga bisa mengaktifkan autentikasi biometrik (Fingerprint atau Face ID) jika perangkat Anda mendukungnya.
4. Setiap kali aplikasi dibuka kembali setelah ditutup, layar kunci akan melindungi privasi data Anda dari orang lain.

### 1.2 Daftarkan Akun-Akun Keuangan Anda
Buka tab **Akun (Accounts)** untuk mendaftarkan dompet dan rekening yang aktif Anda gunakan:
- **Rekening Bank Operasional**: Contohnya *BCA Utama*, *Mandiri Gaji*.
- **Dompet Digital (E-Wallet)**: Contohnya *GoPay*, *OVO*, *ShopeePay*.
- **Uang Tunai (Cash)**: Contohnya *Dompet Fisik*.
- **Rekening Tabungan Khusus**: Contohnya *BCA Tabungan Darurat*.

> [!TIP]
> Masukkan saldo awal masing-masing rekening sesuai saldo aktual saat ini agar perhitungan kekayaan bersih langsung akurat sejak hari pertama.

---

## 2. Pencatatan Transaksi Sehari-Hari (Multi-Modal)

MyFinancialFlow menyediakan beragam cara fleksibel untuk mencatat pengeluaran dan pemasukan sesuai kenyamanan Anda.

### 2.1 Formulir Input Cepat (Quick-Add)
- Klik tombol **+** di pojok bawah atau tekan tombol shortcut keyboard **N**.
- Pilih jenis transaksi: **Pengeluaran (Expense)**, **Pemasukan (Income)**, atau **Transfer**.
- Masukkan nominal, pilih akun, dan tentukan kategori.
- Tekan **Simpan (Enter)**. Transaksi langsung tercatat dan saldo akun diperbarui seketika.

### 2.2 Asisten Obrolan AI (Smart AI Chat)
Jika Anda malas mengisi formulir satu per satu, gunakan fitur Asisten AI:
- Buka tab **Asisten AI (AI Chat)**.
- Ketik transaksi dalam kalimat santai bahasa Indonesia:
  - *"Makan siang padang 28rb pakai bca"*
  - *"Beli bensin pertamax 50.000 tunai"*
  - *"Transfer dari mandiri ke gopay 100rb"*
  - *"Terima komisi affiliate shopee 500rb di bca"*
- AI akan langsung mengenali tanggal, nominal, kategori, rekening asal, dan rekening tujuan secara otomatis. Tekan tombol **Konfirmasi** untuk menyetujui transaksi.

### 2.3 Pindai Struk Belanja (Receipt OCR)
Setelah berbelanja di minimarket atau restoran:
1. Tekan ikon **Kamera / Pindai Struk**.
2. Foto struk fisik atau unggah gambar struk dari galeri HP.
3. Mesin OCR akan membaca struk belanja, mendeteksi nama toko (merchant), tanggal, rincian barang, dan total pembayaran secara otomatis.
4. Anda dapat melampirkan foto struk asli ke transaksi tersebut sebagai bukti digital yang rapi. Di MyFinancialFlow V1.1, gambar struk disimpan langsung ke Google Drive di folder terbuka `MyFinancialFlow Data/Receipts/YYYY-MM/` dan dapat dilihat langsung dengan mengklik tautan struk.

> [!NOTE]
> **Kebijakan Cache Struk Offline**: Untuk menjaga ruang penyimpanan perangkat agar tidak melampaui batas kuota 2.0 GB, foto struk lokal yang sudah aman tersinkronisasi ke Google Drive dapat dipangkas secara otomatis dari memori peramban. Jika Anda sedang offline penuh (tanpa koneksi internet), melihat foto struk lama yang sudah dipangkas memerlukan koneksi internet aktif untuk memuat kembali file asli dari Google Drive.

### 2.4 Ekstraksi Screenshot Mutasi Massal (Bulk History OCR)
Punya tangkapan layar (screenshot) mutasi rekening m-banking atau riwayat transaksi e-wallet beberapa hari terakhir?
1. Buka menu **Pindai Riwayat Mutasi (Bulk OCR)**.
2. Unggah satu atau beberapa tangkapan layar mutasi bank sekaligus.
3. Sistem akan memindai baris demi baris mutasi debet/kredit, mengonversinya menjadi daftar transaksi terstruktur, dan menampilkan indikator tingkat akurasi (confidence score).
4. Anda dapat mencentang transaksi yang valid dan memasukkannya ke buku kas sekaligus dalam 1 klik.

### 2.5 Perekaman Suara (Voice Input)
Saat tangan sedang sibuk menyetir atau membawa belanjaan:
1. Tekan tombol **Mikrofon** pada layar input transaksi.
2. Pada penggunaan pertama, berikan izin akses mikrofon peramban Anda.
3. Ucapkan transaksi dengan jelas: *"Beli kopi kenangan dua puluh lima ribu pakai gopay"*.
4. Sistem Web Speech API akan mentranskripsikan suara Anda dan mesin AI langsung mengonversinya menjadi data transaksi siap simpan.

### 2.6 Pencatatan Lewat Bot Telegram
Catat transaksi dari aplikasi Telegram tanpa perlu membuka browser:
1. Buka bot Telegram pribadi Anda yang telah disiapkan (lihat panduan [INSTALLATION.id.md](INSTALLATION.id.md)).
2. Kirim pesan chat biasa atau kirim foto struk ke bot Anda.
3. Buka tab **Inbox** di MyFinancialFlow saat santai. Seluruh catatan dari Telegram akan masuk ke antrean untuk Anda setujui dalam 1 klik.

---

## 3. Target Finansial (Savings Goals) & Proyeksi Kecepatan

Tab **Goals** membantu Anda merencanakan dan mewujudkan target impian (misalnya Dana Darurat, Tabungan Liburan, atau DP Rumah).

### 3.1 Membuat Target Baru
1. Masuk ke tab **Goals** lalu klik **Tambah Target**.
2. Beri nama target, pilih ikon yang menarik, tentukan nominal target (misal: Rp 30.000.000), dan target tanggal pencapaian opsional.
3. **Pilih Mode Pelacakan**:
   - **Mode Rekening Khusus (Dedicated Account)**: Pilih mode ini jika Anda memiliki satu rekening bank yang dibuat *khusus* hanya untuk target ini. Pertumbuhan saldo rekening tersebut otomatis dihitung sebagai progres tabungan.
   - **Mode Setoran Manual (Manual Contribution)**: *Sangat disarankan* jika rekening yang digunakan juga dipakai untuk transaksi sehari-hari (terima gaji, bayar tagihan). Dengan mode ini, Anda menyetor progres secara sadar sehingga tidak terganggu oleh fluktuasi uang belanja harian.

### 3.2 Memahami Proyeksi Kecepatan (90-Day Velocity)
MyFinancialFlow tidak hanya menampilkan persentase statis, tetapi juga menghitung **kecepatan menabung riil Anda selama 90 hari terakhir**:
- Jika rata-rata Anda berhasil menyisihkan Rp 1.500.000 per bulan, sistem akan memproyeksikan tanggal realistis kapan target Anda akan tercapai.
- Jika kecepatan menabung melambat, indikator warna akan memberi tahu apakah target Anda *On Track* (sesuai jadwal) atau *Needs Attention* (perlu perhatian).

---

## 4. Portofolio Investasi & Aset Non-Kas

Kekayaan Anda tidak hanya tersimpan dalam bentuk uang tunai di bank. Tab **Investasi (Investments)** memfasilitasi pelacakan aset non-kas:

### 4.1 Menambahkan Aset Investasi
1. Buka tab **Investasi** dan klik **Tambah Aset**.
2. Pilih jenis instrumen:
   - **Saham (Stocks)**: Masukkan kode emiten (misal: BBCA, ASII) dan total lot/lembar.
   - **Reksadana (Mutual Funds)**: Masukkan nama produk reksadana dan unit penyertaan.
   - **Kripto (Cryptocurrency)**: Masukkan koin (contoh: BTC, ETH, SOL) dan jumlah koin.
   - **Emas & Logam Mulia (Gold)**: Masukkan gramasi emas fisik atau tabungan emas.
   - **Properti & Lainnya (Property)**: Masukkan aset tanah, rumah, kendaraan, atau barang koleksi.
3. Masukkan harga modal beli awal (*cost basis*).

### 4.2 Pembaruan Valuasi (Harga Pasar)
- **Aset Kripto**: Cukup tekan tombol **Update Harga Kripto**. MyFinancialFlow akan mengambil harga pasar terkini secara langsung via CoinGecko.
- **Saham, Emas & Properti**: Klik tombol **Perbarui Nilai** secara berkala (misal: sebulan sekali) untuk memasukkan nilai pasar terkini.
- Sistem akan otomatis membentuk grafik garis riwayat nilai aset dari waktu ke waktu serta menghitung persentase keuntungan/kerugian (*unrealized gain/loss*).

### 4.3 Total Kekayaan Bersih (Net Worth)
MyFinancialFlow menggabungkan seluruh komponen finansial Anda dalam satu angka terpadu:
$$\text{Total Kekayaan Bersih} = \text{Kas di Bank \& Tunai} + \text{Valuasi Seluruh Investasi} - \text{Sisa Saldo Utang}$$

---

## 5. Proyeksi Arus Kas (Cash Flow Forecasting)

Fitur **Proyeksi Arus Kas (Cash Flow Forecast)** bekerja seperti radar finansial yang meneropong kondisi keuangan Anda 30 hingga 180 hari ke depan.

### 5.1 Cara Kerja Simulasi
Mesin simulasi menggabungkan 4 variabel harian:
1. **Saldo Awal**: Total saldo kas likuid Anda hari ini.
2. **Tagihan Rutin Terjadwal**: Memperhitungkan tanggal jatuh tempo listrik, sewa, internet, dan langganan dari tab *Recurring Bills*.
3. **Cicilan Utang Aktif**: Memperhitungkan angsuran pinjaman yang harus dibayar dari tab *Debt*.
4. **Kecepatan Belanja Harian**: Rata-rata pengeluaran belanja harian diskresioner Anda selama 30 hari terakhir.

### 5.2 Membaca Grafik Proyeksi & Peringatan Dini
- **Garis Proyeksi Hijau/Biru**: Menunjukkan tren kenaikan atau kestabilan saldo kas di masa depan.
- **Peringatan Saldo Habis (Depletion Alert)**: Jika pengeluaran diproyeksikan melebihi penerimaan, sistem akan menandai tanggal merah kapan saldo diperkirakan minus. Ini memberi Anda waktu berminggu-minggu lebih awal untuk memotong pengeluaran non-primer.
- **Batas Belanja Aman (Safe-to-Spend)**: Angka harian yang memberi tahu berapa maksimal uang yang boleh Anda belanjakan hari ini tanpa mengganggu pos tagihan dan cicilan wajib mendatang.

---

## 6. Estimator Pajak Penghasilan (PPh 21 / PPh 23 Indonesia)

> [!IMPORTANT]
> **Pernyataan Penyangkalan (Disclaimer)**:
> Fitur ini adalah alat bantu estimasi internal untuk kebutuhan perencanaan keuangan pribadi dan **bukan** merupakan saluran resmi pelaporan SPT Direktorat Jenderal Pajak (DJP). Ketentuan perpajakan resmi tetap mengacu pada peraturan perundang-undangan perpajakan Republik Indonesia yang berlaku.

Bagi pekerja lepas (freelancer), kreator konten, atau pebisnis afiliasi (Shopee/TikTok Affiliate), membedakan antara uang yang masuk ke rekening dan kewajiban pajak seringkali membingungkan.

### 6.1 Menandai Transaksi Pemasukan untuk Pajak
Saat mencatat transaksi jenis **Pemasukan (Income)**, buka opsi **Perlakuan Pajak (Tax Treatment)**:
1. **Pajak Sudah Dipotong Pihak Lain**:
   - Pilih opsi ini untuk komisi yang pajaknya sudah dipotong otomatis oleh perusahaan perantara (contoh: **Shopee Affiliate** yang memotong PPh 21 sebelum transfer).
   - Masukkan nominal potongan pajak (kredit pajak) dari bukti potong.
   - **Keunggulan Dual-Ledger**: Saldo rekening bank Anda akan bertambah sebesar kas bersih (*netto*), sementara kalkulator pajak mencatat nilai penghasilan kotor (*bruto*) dan kredit pajaknya. Tidak ada saldo bank fiktif!
2. **Belum Dipotong (Hitung Mandiri)**:
   - Pilih opsi ini untuk penghasilan yang ditransfer utuh tanpa potongan pajak (contoh: komisi **TikTok Affiliate** atau honor freelance langsung).
   - Sistem akan memasukkan nominal bruto ini ke dalam daftar penghasilan yang pajaknya harus Anda setor sendiri.
3. **Bukan Objek Pajak / Tidak Berlaku**:
   - Untuk transfer antar-rekening sendiri, pengembalian dana belanja (*reimbursement*), atau hadiah/warisan.

### 6.2 Menghitung Estimasi PPh Tahunan
Buka menu **Pajak / Tax Estimator**:
1. **Pilih Status PTKP Anda**: TK/0 (belum menikah, Rp 54 Juta/tahun) hingga K/3 (menikah dengan 3 tanggungan, Rp 72 Juta/tahun).
2. **Gaji Pokok Kantor (Opsional)**: Jika Anda juga berstatus karyawan tetap dan telah menerima gaji yang dipotong PPh 21 oleh kantor, isi estimasi gaji bruto tahunan di kolom ini.
   > **Mengapa ini penting?** Berdasarkan aturan pajak Indonesia, PTKP hanya boleh dikurangkan **satu kali** terhadap total penghasilan gabungan setahun. Fitur ini memastikan PTKP tidak terhitung ganda pada penghasilan sampingan Anda.
3. **Hasil Perhitungan**:
   - Total Penghasilan Bruto Gabungan.
   - Pengurang PTKP dan Penghasilan Kena Pajak (PKP).
   - Pajak Terutang (menggunakan tarif progresif UU HPP: 5%, 15%, 25%, 30%, 35%).
   - Total Kredit Pajak Bukti Potong yang sudah disetor oleh pihak lain.
   - **Hasil Akhir**: Estimasi status **PPh Kurang Bayar** atau **PPh Nihil**.

---

## 7. Sinkronisasi Cloud Antar-Perangkat (Google Drive Sync)

Ingin mencatat transaksi di HP Android/iPhone di siang hari lalu mengecek laporan keuangan di laptop saat malam? Gunakan Google Drive Sync!

### 7.1 Mengaktifkan Sinkronisasi
1. Buka **Pengaturan** > **Cloud Sync (Google Drive)**.
2. Pastikan Google Client ID sudah terpasang (lihat [INSTALLATION.id.md](INSTALLATION.id.md)).
3. Klik tombol **Sign in with Google** dan pilih akun Google pribadi Anda (menggunakan izin akses terbatas `drive.file` pada file aplikasi).
4. Setelah terhubung, status akan berubah menjadi `"Synced Just Now"` berwarna hijau.

### 7.2 Fitur Keamanan & Penyimpanan Transparan
- **Folder Terbuka (MyFinancialFlow Data/)**: Di V1.1, data sinkronisasi disimpan di folder terbuka `MyFinancialFlow Data/` pada Google Drive Anda dalam format JSON terstruktur yang dapat dibaca manusia (`transactions.json`, `accounts.json`, `categories.json`, `goals.json`, `investments.json`, `metadata.json`) serta subfolder `Receipts/YYYY-MM/` untuk gambar struk asli.
- **Deteksi Anti-Manipulasi (Tamper-Evidence)**: Setiap file JSON diverifikasi menggunakan checksum SHA-256 yang tersimpan dalam `manifest.json`. Jika ada file yang diedit langsung di Google Drive di luar aplikasi, sistem akan mendeteksinya sebelum melakukan penggabungan data (merge).
- **Kunci Akun Google (Account Lock)**: Database dikunci pada akun Google pertama yang Anda hubungkan. Kolom `approvedAccountId` dilindungi segel otentikasi kriptografis HMAC. Perubahan akun Google yang tidak sah di luar alur resmi PIN Master akan langsung diblokir secara otomatis demi mencegah pembajakan sinkronisasi.
- **Deteksi Transaksi Kembar (Sync Duplicates)**: Jika Anda sempat mencatat transaksi yang sama di dua perangkat saat offline, sistem akan mendeteksi kemiripannya secara cerdas dan menampilkannya di tab *Duplikat* agar Anda bisa menghapus salah satunya dengan mudah.

---

## 8. Privasi, Cadangan & Hapus Data (Right-to-be-Forgotten)

MyFinancialFlow menganut filosofi kedaulatan data penuh milik pengguna.

### 8.1 Ekspor Cadangan Lengkap (ZIP)
- Kapan saja Anda ingin menyimpan salinan mandiri, buka **Pengaturan** > **Manajemen Data** > **Ekspor Data Penuh (ZIP)**.
- Aplikasi akan mengemas seluruh database dalam format JSON beserta seluruh file foto struk belanja asli Anda ke dalam satu file arsip `.zip`.
- Anda dapat membukanya di komputer manapun tanpa memerlukan koneksi internet atau software khusus.

### 8.2 Pelaporan Crash Anonim (Opt-In)
- Jika aplikasi mengalami kendala teknis, Anda dapat mengaktifkan opsi **Kirim Laporan Crash Anonim** di Pengaturan.
- Fitur ini menerapkan standar keamanan mutlak: hanya 7 data teknis yang dikirim (nama error, pesan error, baris kode, URL, peramban, waktu, versi). **Data transaksi, saldo, nominal uang, dan nama rekening dibuang 100% sebelum dikirim.**

### 8.3 Hak untuk Menghapus Semua Data (Two-Tier Data Wipe)
Jika Anda ingin berhenti menggunakan aplikasi atau ingin mereset buku kas dari nol:
1. Buka **Pengaturan** > **Manajemen Data** > **Hapus Data & Reset**.
2. Anda memiliki dua pilihan:
   - **Hapus Data Lokal**: Mengosongkan IndexedDB pada peramban perangkat ini saja.
   - **Hapus Permanen Termasuk Google Drive**: Menghapus seluruh data lokal sekaligus membersihkan folder `MyFinancialFlow Data/` di Google Drive. Setelah langkah ini selesai, tidak ada jejak data keuangan Anda yang tersisa.

---

## 9. Tanya Jawab & Solusi Masalah (FAQ & Troubleshooting)

### Q: Apakah saya perlu koneksi internet setiap kali membuka MyFinancialFlow?
> **A:** Tidak! MyFinancialFlow bekerja 100% secara offline. Anda bisa mencatat transaksi, melihat laporan grafik, menghitung proyeksi kas, dan menghitung estimasi pajak di tengah hutan tanpa sinyal sekalipun. Saat perangkat kembali terhubung internet, sinkronisasi ke Google Drive akan berjalan otomatis. Namun, harap dicatat: jika foto struk lama Anda telah dipangkas secara otomatis dari penyimpanan lokal untuk menghemat memori HP, Anda memerlukan koneksi internet aktif untuk membuka dan melihat kembali file struk asli tersebut dari Google Drive.

### Q: Apa yang harus dilakukan jika saya lupa PIN pengaman aplikasi?
> **A:** Jika Anda mengaktifkan autentikasi biometrik, Anda bisa membuka aplikasi menggunakan sidik jari atau Face ID lalu mengganti PIN di menu Pengaturan. Jika biometrik tidak aktif dan PIN lupa, Anda dapat mereset database lokal dan memulihkan kembali data Anda dengan login Google Drive Sync yang telah terpasang sebelumnya.

### Q: Mengapa muncul peringatan "Google Account Mismatch"?
> **A:** Peringatan ini muncul jika akun Google yang Anda gunakan untuk login berbeda dari akun Google pemilik awal database. Pastikan Anda login menggunakan akun Google yang sama di seluruh perangkat Anda.

### Q: Kuota token API AI saya habis, apakah aplikasi tetap bisa digunakan?
> **A:** Tentu saja! Seluruh fungsi pencatatan manual, grafik, anggaran, dan kalkulasi tetap berjalan normal. Untuk fitur asisten AI, Anda dapat mendaftarkan API key alternatif (misalnya beralih dari Groq ke Google Gemini) di menu Pengaturan AI.

---

*Selamat mengelola keuangan pribadi dengan lebih bijak, tenang, dan cerdas bersama MyFinancialFlow!*
