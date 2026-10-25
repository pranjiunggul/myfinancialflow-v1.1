> [!NOTE]
> **Dokumentasi Dwibahasa / Bilingual Documentation**
> - Read this installation guide in **English**: [INSTALLATION.md](INSTALLATION.md)
> - Kembali ke Dokumentasi Utama: [README.id.md](README.id.md)

# MyFinancialFlow V1.1 — Panduan Lengkap Instalasi & Deployment

Panduan ini berisi instruksi menyeluruh untuk menginstal, mengonfigurasi, menjalankan di lingkungan lokal (development), dan mendeploy MyFinancialFlow di seluruh komponen:
1. Prasyarat Sistem
2. Pengaturan Lingkungan Lokal (Zero-Build-Time `.env`)
3. Pengaturan Cloud Sync Google Drive (OAuth 2.0 Web Client)
4. Deployment Cloudflare Workers (`financeflow-relay` & `financeflow-telemetry`)
5. Deployment Cloudflare Pages (Hosting PWA Produksi)
6. Integrasi Telegram Bot
7. Konfigurasi Provider AI (Groq, Google Gemini, OpenRouter)
8. Checklist Verifikasi Pertama Kali

---

## 1. Prasyarat Sistem

Sebelum memulai instalasi MyFinancialFlow, pastikan perangkat Anda memenuhi spesifikasi berikut:

| Perangkat Lunak | Versi Minimal | Rekomendasi | Catatan |
| :--- | :--- | :--- | :--- |
| **Node.js** | `v18.0.0` | `v20.x` atau `v22.x` LTS | Mesin runtime untuk kompilasi dan runner pengujian (`tsx`) |
| **npm** | `v9.0.0` | `v10.x`+ | Bawaan saat menginstal Node.js |
| **Akun Cloudflare** | Free Tier | Free Tier | Diperlukan untuk hosting Workers & Pages |
| **Wrangler CLI** | `v3.0.0`+ | Versi terbaru via `npx wrangler` | CLI resmi pengembang Cloudflare |
| **Browser Web** | Modern | Chrome, Edge, Safari, Firefox | Wajib mendukung fitur PWA, Web Crypto API, & IndexedDB |

---

## 2. Pengaturan Lingkungan Lokal (Local Development)

MyFinancialFlow didesain dengan arsitektur **Zero-Build-Time Configuration**. Anda **tidak perlu** membuat atau mengelola file `.env` untuk mem-build, menjalankan, atau menguji aplikasi. Semua kredensial rahasia, API key, dan URL endpoint diatur langsung oleh pengguna di halaman Pengaturan (Settings) aplikasi dan disimpan secara aman dan terenkripsi di IndexedDB browser pengguna.

### Cara Cepat: Skrip Pemasangan Otomatis (Direkomendasikan)

Untuk mendeteksi prasyarat, memasang dependensi, memeriksa Cloudflare Wrangler, dan memverifikasi build produksi secara otomatis dalam satu klik, gunakan skrip berikut:

#### Pengguna Windows:
Klik ganda file `SETUP_FINANCEFLOW.bat` di folder utama proyek, atau jalankan via Command Prompt:
```cmd
SETUP_FINANCEFLOW.bat
```

#### Pengguna macOS & Linux:
Jalankan skrip bash POSIX berikut di terminal:
```bash
chmod +x setup-financeflow.sh
./setup-financeflow.sh
```

**Kemampuan Otomatis Skrip Setup:**
1. Mendeteksi Node.js (v18+) dan menginstal otomatis via package manager (`winget` di Windows, `brew` di macOS) jika belum terpasang.
2. Memeriksa ketersediaan Cloudflare Wrangler CLI.
3. Memberikan opsi *Clean Reinstall* (membersihkan `node_modules` lama dan lockfile) untuk mencegah konflik dependensi.
4. Menyiapkan file `.env` dari `.env.example` sebagai catatan checklist referensi.
5. Memeriksa status login Cloudflare (`wrangler whoami`).
6. Opsi langsung mendeploy Cloudflare Workers (`financeflow-relay` dan `financeflow-telemetry`).
7. Memverifikasi build produksi (`npm run build`).

---

### Langkah Manual Bertahap (Sebagai Cadangan & Referensi)

Jika Anda ingin melakukan instalasi secara mandiri per langkah:

### Langkah 2.1: Clone & Pasang Dependencies

```bash
# Clone repositori proyek
git clone https://github.com/your-username/financeflow.git
cd financeflow

# Pasang seluruh dependency
npm install
```

### Langkah 2.2: Jalankan Development Server

```bash
npm run dev
```
Development server Vite akan berjalan di `http://localhost:3000` (atau port berikutnya jika port 3000 terpakai) dan otomatis membuka browser Anda.

### Langkah 2.3: Jalankan Rangkaian Pengujian Otomatis

MyFinancialFlow dilengkapi dengan 27 rangkaian integration test otomatis yang menguji migrasi database (v6, v7, v8), analitik offline, mesin estimasi pajak PPh, rekonsiliasi pembukuan (ledger), failover otomatis AI, dan persistensi telemetri crash.

```bash
npm test
```
*Hasil yang diharapkan: Seluruh 27 test suite berjalan secara berurutan dan selesai dengan kode keluar 0 (lolos 100%).*

### Langkah 2.4: Build untuk Produksi

```bash
npm run build
```
Perintah ini akan menjalankan pemeriksaan TypeScript (`tsc -b`) dan menghasilkan aset produksi yang optimal di dalam folder `dist/`.

Untuk melihat pratinjau hasil build lokal:
```bash
npm run preview
```

---

## 3. Pengaturan Cloud Sync Google Drive

Pada MyFinancialFlow V1.1, sinkronisasi data dilakukan ke folder terbuka `MyFinancialFlow Data/` di Google Drive menggunakan izin akses terisolasi `drive.file` (`https://www.googleapis.com/auth/drive.file`). Izin ini secara ketat hanya dapat mengakses file dan folder yang dibuat oleh aplikasi ini (tidak dapat melihat isi Google Drive Anda yang lain). Data keuangan utama disimpan dalam file JSON terstruktur yang dapat dibaca manusia dilengkapi checksum integritas SHA-256 dan segel HMAC untuk penguncian akun Google, serta subfolder `Receipts/YYYY-MM/` untuk menyimpan foto struk belanja dalam format file JPEG standar yang dapat langsung dibuka.

### Langkah 3.1: Buat Proyek di Google Cloud Console
1. Buka [Google Cloud Console](https://console.cloud.google.com/).
2. Klik dropdown **Select a project** > **New Project**.
3. Beri nama proyek Anda (misalnya `MyFinancialFlow-Sync`) dan klik **Create**.

### Langkah 3.2: Aktifkan Google Drive API
1. Pada Google Cloud Console, buka menu samping lalu pilih **APIs & Services** > **Library**.
2. Cari **Google Drive API**.
3. Klik **Google Drive API** lalu tekan tombol **Enable**.

### Langkah 3.3: Konfigurasi Layar Persetujuan OAuth (OAuth Consent Screen)
1. Buka menu **APIs & Services** > **OAuth consent screen**.
2. Pilih tipe user **External** lalu klik **Create**.
3. Isi informasi yang diperlukan:
   - **App name**: `MyFinancialFlow`
   - **User support email**: Alamat email Google Anda
   - **Developer contact information**: Alamat email Google Anda
4. Pada bagian **Scopes**, klik **Add or Remove Scopes**, centang atau masukkan `https://www.googleapis.com/auth/drive.file` dan `email` (atau `https://www.googleapis.com/auth/userinfo.email`), lalu simpan.
5. Pada bagian **Test users**, tambahkan alamat email Google yang akan Anda gunakan untuk login.

### Langkah 3.4: Buat OAuth 2.0 Web Client ID
1. Masuk ke **APIs & Services** > **Credentials**.
2. Klik tombol **Create Credentials** > **OAuth client ID**.
3. Pilih **Application type**: **Web application**.
4. Beri nama: `MyFinancialFlow Web Client`.
5. Di bagian **Authorized JavaScript origins**, tambahkan:
   - `http://localhost:3000` (untuk pengujian lokal)
   - `https://financeflow-pwa.pages.dev` (alamat domain Cloudflare Pages produksi Anda)
6. Klik **Create**.
7. Salin **Client ID** yang dihasilkan (berformat `XXXXX.apps.googleusercontent.com`).

### Langkah 3.5: Masukkan Client ID ke MyFinancialFlow
1. Buka aplikasi MyFinancialFlow di browser Anda.
2. Buka menu **Settings** > **Cloud Sync (Google Drive)**.
3. Tempel (paste) Google Client ID Anda ke kolom yang tersedia.
4. Klik tombol **Sign in with Google**.
5. Setelah login berhasil, identitas perangkat Anda akan terdaftar dan fitur sync otomatis antar-perangkat akan aktif.

---

## 4. Deployment Cloudflare Workers

MyFinancialFlow memanfaatkan dua Cloudflare Worker ringan yang menjaga privasi:
1. `financeflow-relay`: Webhook relay untuk menerima pesan Telegram bot dan menyimpannya sementara di Cloudflare KV sebelum diunduh oleh aplikasi PWA.
2. `financeflow-telemetry`: Pelapor crash opt-in anonim yang hanya menyimpan log diagnostik teknis (7 kolom yang diizinkan tanpa data finansial sedikit pun) dengan retensi otomatis 30 hari (auto-TTL).

### Langkah 4.1: Login ke Cloudflare Wrangler
```bash
npx wrangler login
```
Ikuti instruksi di browser untuk mengotorisasi Wrangler dengan akun Cloudflare Anda.

### Langkah 4.2: Deploy `financeflow-relay` (Relay Telegram)

1. Buat KV namespace untuk buffer pesan:
   ```bash
   npx wrangler kv:namespace create INBOX_KV
   ```
2. Wrangler akan memberikan output ID KV:
   ```json
   { "binding": "INBOX_KV", "id": "<ID_KV_NAMESPACE_ANDA>" }
   ```
3. Buka file `worker/wrangler.relay.json` dan pastikan `id` sesuai dengan ID yang baru dibuat:
   ```json
   {
     "$schema": "../node_modules/wrangler/config-schema.json",
     "name": "financeflow-relay",
     "main": "worker.js",
     "compatibility_date": "2026-10-19",
     "kv_namespaces": [
       {
         "binding": "INBOX_KV",
         "id": "<ID_KV_NAMESPACE_ANDA>"
       }
     ]
   }
   ```
4. Deploy worker relay:
   ```bash
   npm run deploy:worker
   ```
5. Simpan URL worker yang didapatkan: `https://financeflow-relay.<subdomain-anda>.workers.dev`.

### Langkah 4.3: Deploy `financeflow-telemetry` (Pelapor Crash)

1. Buat KV namespace untuk penyimpanan laporan error:
   ```bash
   npx wrangler kv:namespace create CRASH_REPORTS_KV
   ```
2. Buka file `worker/wrangler.telemetry.json` dan pastikan `id` sesuai:
   ```json
   {
     "$schema": "../node_modules/wrangler/config-schema.json",
     "name": "financeflow-telemetry",
     "main": "crash-reporter.js",
     "compatibility_date": "2026-10-19",
     "kv_namespaces": [
       {
         "binding": "CRASH_REPORTS_KV",
         "id": "<ID_KV_NAMESPACE_ANDA>"
       }
     ]
   }
   ```
3. Deploy worker telemetri:
   ```bash
   npm run deploy:telemetry
   ```
4. Simpan URL telemetri yang didapatkan: `https://financeflow-telemetry.<subdomain-anda>.workers.dev`.

---

## 5. Deployment Cloudflare Pages (PWA Produksi)

Deploy aplikasi web statis ke Cloudflare Pages untuk hosting edge berkecepatan tinggi global tanpa biaya.

### Metode A: Deploy Otomatis via Wrangler (Direkomendasikan)

1. Bangun bundle produksi:
   ```bash
   npm run build
   ```
2. Unggah langsung ke Cloudflare Pages:
   ```bash
   npm run deploy:pages
   ```
   *(Atau jalankan: `npx wrangler pages deploy dist --project-name financeflow-pwa`)*

3. Wrangler akan mengunggah folder `dist` dan menampilkan URL live produksi Anda:
   `https://financeflow-pwa.pages.dev` (atau subdomain yang ditentukan).

### Metode B: Sambungkan Repositori Git di Dashboard Cloudflare Pages

1. Push repository Anda ke GitHub atau GitLab.
2. Di [Cloudflare Dashboard](https://dash.cloudflare.com/), pilih **Workers & Pages** > **Create application** > **Pages** > **Connect to Git**.
3. Pilih repositori proyek Anda.
4. Masukkan konfigurasi build:
   - **Framework preset**: `Vite`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
5. Klik **Save and Deploy**.

---

## 6. Integrasi Telegram Bot

Telegram Bot memungkinkan pencatatan transaksi secara cepat kapan saja melalui chat teks natural atau foto struk belanja.

### Langkah 6.1: Buat Bot melalui @BotFather
1. Buka Telegram dan cari akun resmi `@BotFather`.
2. Kirim perintah `/newbot`.
3. Berikan nama tampilan bot (misal: `MyFinancialFlow Catatan`) dan username unik yang berakhiran `bot` (misal: `catatan_financeflow_bot`).
4. Salin **HTTP API Bot Token** yang diberikan oleh BotFather (`1234567890:ABCdef...`).

### Langkah 6.2: Daftarkan Webhook ke Worker Relay
Jalankan perintah curl ini di terminal atau buka URL berikut di browser:
```bash
curl "https://api.telegram.org/bot<TOKEN_BOT_ANDA>/setWebhook?url=https://financeflow-relay.<subdomain-anda>.workers.dev/webhook"
```
*Hasil yang diharapkan: `{"ok":true,"result":true,"description":"Webhook was set"}`.*

### Langkah 6.3: Konfigurasi di Halaman Pengaturan MyFinancialFlow
1. Buka aplikasi MyFinancialFlow PWA Anda.
2. Masuk ke **Settings** > **Telegram Bot**.
3. Masukkan **Bot Token**.
4. Masukkan **Relay URL** (`https://financeflow-relay.<subdomain-anda>.workers.dev`).
5. Buat **PIN Keamanan 4–6 digit angka** untuk mengaktifkan enkripsi pesan end-to-end.
6. Klik **Simpan & Uji Koneksi**.

### Langkah 6.4: Otorisasi di Telegram
1. Buka obrolan dengan bot Anda di Telegram dan tekan tombol **Start** (atau kirim `/start`).
2. Kirim `/auth <PIN_ANDA>` (misal: `/auth 1234`).
3. Bot akan mengonfirmasi bahwa chat Anda telah berhasil diotorisasi.
4. Coba kirim transaksi: `Beli kopi 25000 pakai BCA` atau kirim foto struk belanja.
5. Di aplikasi MyFinancialFlow, transaksi akan muncul di tab **Inbox** siap untuk Anda tinjau dan setujui.

---

## 7. Konfigurasi Provider AI

MyFinancialFlow dilengkapi **Mesin Fallback AI 3-Tingkat** dengan failover otomatis, pemantauan kesehatan koneksi, dan pelacakan limit penggunaan token. Anda dapat memakai salah satu atau ketiga provider sekaligus:

| Provider | Model yang Disarankan | Skema Harga / Kuota Gratis | Keunggulan Utama |
| :--- | :--- | :--- | :--- |
| **Groq** | `llama-3.3-70b-versatile` | Tersedia kuota gratis cepat | Respon super cepat (~500ms) untuk asisten chat |
| **Google Gemini** | `gemini-2.5-flash` | Tersedia tier gratis harian | Sangat akurat dalam OCR multimodal dan baca struk |
| **OpenRouter** | Multi-model / Fallback | Pay-as-you-go | Gateway cadangan universal jika penyedia lain limit |

### Cara Memasang API Key:
1. Buka MyFinancialFlow PWA.
2. Buka menu **Settings** > **AI Assistant & OCR**.
3. Masukkan API Key Anda:
   - **Groq API Key**: Didapatkan gratis di [console.groq.com/keys](https://console.groq.com/keys)
   - **Google Gemini API Key**: Didapatkan gratis di [aistudio.google.com](https://aistudio.google.com/)
   - **OpenRouter API Key**: Didapatkan di [openrouter.ai/keys](https://openrouter.ai/keys)
4. Klik **Uji Semua Provider** untuk memeriksa koneksi dan latensi.
5. Sistem akan secara otomatis mengarahkan permintaan ke provider paling prima dan berpindah otomatis jika salah satu provider mencapai batas kuota (rate limit).

---

## 8. Checklist Verifikasi Pertama Kali

Ikuti panduan ceklis ini untuk memastikan seluruh sistem terpasang dan berjalan 100%:

- [ ] **1. Akses Web**: Aplikasi terbuka dengan sempurna via `https://domain-anda.pages.dev` atau `http://localhost:3000`.
- [ ] **2. PIN Pengaman**: Buka Settings dan atur PIN proteksi lokal / biometrik.
- [ ] **3. Akun Keuangan**: Buat akun-akun awal Anda di tab Akun (contoh: Rekening BCA, Mandiri, Dompet Tunai).
- [ ] **4. Uji Transaksi Manual**: Catat satu pengeluaran manual (misal: Pengeluaran `Rp 50.000` kategori `Makanan & Minuman`).
- [ ] **5. Parsing Teks AI**: Buka Asisten AI dan ketik `"Makan siang 35rb di warteg cash"`. Pastikan kategori, nominal, dan akun terisi otomatis dengan benar.
- [ ] **6. OCR Struk**: Unggah foto struk belanja. Periksa apakah sistem berhasil mendeteksi nama merchant dan total belanja.
- [ ] **7. Target Finansial (Goals)**: Buka tab Goals dan buat satu target tabungan dengan kalkulasi proyeksi kecepatan saving.
- [ ] **8. Sinkronisasi Cloud**: Login akun Google Anda di Settings > Cloud Sync. Pastikan indikator status berubah hijau: `"Synced Just Now"`.
- [ ] **9. Uji Mode Offline**: Putuskan koneksi internet. Buat transaksi baru. Sambungkan kembali internet dan pastikan data tersinkronisasi otomatis tanpa konflik.
- [ ] **10. Ekspor Cadangan**: Masuk ke Settings > Data Management > Export Full Data (ZIP). Pastikan file ZIP terunduh berisi data JSON dan lampiran struk lengkap.

Selamat! MyFinancialFlow Anda kini telah siap digunakan sepenuhnya untuk mengelola keuangan harian dengan aman dan cerdas.
