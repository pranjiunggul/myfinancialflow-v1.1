@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

title MyFinancialFlow — Skrip Pemasangan & Persiapan Otomatis

echo ==============================================================================
echo  MyFinancialFlow — Skrip Pemasangan Otomatis (One-Click Setup)
echo ==============================================================================
echo  Aplikasi Manajemen Keuangan Pribadi Offline-First, Privat & Cerdas
echo ==============================================================================
echo.

:: -----------------------------------------------------------------------------
:: [1/7] Pemeriksaan Node.js
:: -----------------------------------------------------------------------------
echo [1/7] Memeriksa instalasi Node.js...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [PERINGATAN] Node.js belum terpasang di komputer ini!
    echo Mencoba memasang Node.js LTS secara otomatis melalui Windows Package Manager (winget)...
    where winget >nul 2>&1
    if %errorlevel% equ 0 (
        echo Menjalankan: winget install OpenJS.NodeJS.LTS...
        winget install OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
        if %errorlevel% equ 0 (
            echo.
            echo ==============================================================================
            echo [PENTING] Node.js LTS berhasil dipasang!
            echo Variabel PATH sistem telah diperbarui oleh installer.
            echo Silakan TUTUP jendela Command Prompt ini, lalu JALANKAN ULANG SETUP_FINANCEFLOW.bat
            echo untuk melanjutkan proses instalasi.
            echo ==============================================================================
            pause
            exit /b 0
        ) else (
            echo [GAGAL] Gagal memasang Node.js via winget.
        )
    )
    echo Silakan unduh dan pasang Node.js versi 18 atau 20+ LTS secara manual di:
    echo https://nodejs.org/
    echo Setelah selesai dipasang, jalankan kembali skrip ini.
    pause
    exit /b 1
)

:: Periksa versi Node.js (minimal v18)
for /f "tokens=*" %%v in ('node -v') do set NODE_VERSION=%%v
node -e "process.exit(parseInt(process.versions.node.split('.')[0]) >= 18 ? 0 : 1)" >nul 2>&1
if %errorlevel% neq 0 (
    echo [PERINGATAN] Versi Node.js Anda (%NODE_VERSION%) di bawah standar minimal (v18.0.0+).
    echo Sangat disarankan untuk memperbarui Node.js ke versi LTS terbaru.
    echo Coba jalankan: winget upgrade OpenJS.NodeJS.LTS
    set /p CONTINUE_OLD_NODE="Apakah Anda ingin tetap melanjutkan? [y/N]: "
    if /i not "!CONTINUE_OLD_NODE!"=="y" (
        exit /b 1
    )
) else (
    echo [OK] Node.js %NODE_VERSION% terdeteksi (Memenuhi syarat v18+).
)

:: Periksa npm
where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo [GAGAL] npm tidak ditemukan dalam PATH sistem. Pastikan Node.js terpasang dengan benar.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('npm -v') do set NPM_VERSION=%%v
echo [OK] npm v%NPM_VERSION% siap digunakan.
echo.

:: -----------------------------------------------------------------------------
:: [2/7] Pemeriksaan Cloudflare Wrangler CLI
:: -----------------------------------------------------------------------------
echo [2/7] Memeriksa Cloudflare Wrangler CLI...
call npx --no-install wrangler --version >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=*" %%w in ('call npx --no-install wrangler --version 2^>nul') do set WRANGLER_VER=%%w
    echo [OK] Cloudflare Wrangler !WRANGLER_VER! tersedia.
) else (
    where wrangler >nul 2>&1
    if %errorlevel% equ 0 (
        echo [OK] Cloudflare Wrangler CLI terpasang secara global.
    ) else (
        echo [INFO] Wrangler belum terpasang secara lokal. Memasang Wrangler CLI via npm...
        call npm install -g wrangler
        if %errorlevel% equ 0 (
            echo [OK] Wrangler CLI berhasil dipasang.
        ) else (
            echo [INFO] Pemasangan global dilewati. Sistem akan menggunakan npx wrangler saat dibutuhkan.
        )
    )
)
echo.

:: -----------------------------------------------------------------------------
:: [3/7] Opsi Clean Reinstall & Instalasi Dependensi Proyek
:: -----------------------------------------------------------------------------
echo [3/7] Menyiapkan dependensi proyek (npm install)...
if exist "node_modules" (
    echo Direktori node_modules lama terdeteksi.
    set /p DO_CLEAN="Apakah Anda ingin melakukan Clean Reinstall (hapus node_modules & lockfile)? [y/N]: "
    if /i "!DO_CLEAN!"=="y" (
        echo Membersihkan node_modules dan package-lock.json...
        if exist "node_modules" rmdir /s /q node_modules
        if exist "package-lock.json" del /f /q package-lock.json
        echo [OK] File dependensi lama telah dibersihkan.
    )
)

echo Memasang paket dependensi MyFinancialFlow...
call npm install
if %errorlevel% neq 0 (
    echo [GAGAL] Terjadi kesalahan saat menjalankan npm install!
    echo Periksa koneksi internet Anda atau coba jalankan: npm install secara manual.
    pause
    exit /b 1
)
echo [OK] Seluruh dependensi MyFinancialFlow berhasil dipasang.
echo.

:: -----------------------------------------------------------------------------
:: [4/7] Panduan Konfigurasi Lingkungan (.env)
:: -----------------------------------------------------------------------------
echo [4/7] Memeriksa file referensi konfigurasi lingkungan...
if not exist ".env" (
    if exist ".env.example" (
        copy /y ".env.example" ".env" >nul
        echo [OK] File .env telah dibuat dari .env.example sebagai checklist referensi.
    )
) else (
    echo [OK] File .env sudah ada di direktori proyek.
)

echo.
echo ==============================================================================
echo [INFO ARSITEKTUR ZERO-BUILD-TIME]
echo MyFinancialFlow TIDAK mengharuskan Anda mengisi file .env sebelum build!
echo Seluruh kredensial & API key diisi langsung oleh Anda di dalam aplikasi browser
echo melalui menu Settings (Pengaturan) dan tersimpan aman di IndexedDB perangkat.
echo.
echo File .env dapat Anda gunakan sebagai catatan referensi pribadi:
echo   - GOOGLE_CLIENT_ID    : OAuth Client ID Google Drive Sync (dari Google Cloud Console)
echo   - GROQ_API_KEY        : API Key Groq Llama 3.3 (Gratis di console.groq.com)
echo   - GEMINI_API_KEY      : API Key Google Gemini Flash (Gratis di aistudio.google.com)
echo   - TELEGRAM_BOT_TOKEN  : Token Bot Telegram (dari @BotFather)
echo   - TELEGRAM_RELAY_URL  : URL Worker Relay Cloudflare Anda
echo   - TELEGRAM_SECURITY_PIN: PIN 4-6 digit untuk enkripsi pesan Telegram
echo.
echo Panduan lengkap pembuatan kredensial: Buka INSTALLATION.id.md
echo ==============================================================================
echo.

:: -----------------------------------------------------------------------------
:: [5/7] Pemeriksaan Autentikasi Cloudflare Wrangler
:: -----------------------------------------------------------------------------
echo [5/7] Memeriksa sesi autentikasi Cloudflare...
call npx wrangler whoami >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Anda telah terotentikasi di Cloudflare Wrangler!
) else (
    echo [PERHATIAN] Anda belum login ke akun Cloudflare di komputer ini.
    echo Cloudflare Wrangler membutuhkan otorisasi interaktif via peramban web.
    set /p DO_CF_LOGIN="Apakah Anda ingin membuka browser untuk login ke Cloudflare sekarang? [y/N]: "
    if /i "!DO_CF_LOGIN!"=="y" (
        echo Membuka peramban untuk otorisasi Cloudflare...
        call npx wrangler login
        if %errorlevel% equ 0 (
            echo [OK] Login Cloudflare berhasil diverifikasi!
        ) else (
            echo [INFO] Login dilewati atau dibatalkan. Anda tetap dapat melanjutkan.
        )
    ) else (
        echo [INFO] Login Cloudflare dilewati. Anda dapat login kapan saja nanti dengan: npx wrangler login
    )
)
echo.

:: -----------------------------------------------------------------------------
:: [6/7] Opsi Deployment Cloudflare Workers (Relay & Telemetri)
:: -----------------------------------------------------------------------------
echo [6/7] Opsi Deployment Cloudflare Workers...
echo MyFinancialFlow memiliki dua Cloudflare Worker:
echo   1. financeflow-relay      : Relay webhook penampung pesan Telegram Bot
echo   2. financeflow-telemetry  : Pelapor crash error privat dengan auto-TTL 30 hari
echo.
set /p DO_DEPLOY_WORKERS="Apakah Anda ingin mendeploy kedua Cloudflare Workers sekarang? [y/N]: "
if /i "!DO_DEPLOY_WORKERS!"=="y" (
    echo Mendeploy financeflow-relay...
    call npm run deploy:worker
    if %errorlevel% neq 0 (
        echo [PERINGATAN] Gagal mendeploy financeflow-relay. Pastikan ID KV di worker/wrangler.relay.json valid.
    ) else (
        echo [OK] financeflow-relay berhasil dideploy!
    )
    
    echo Mendeploy financeflow-telemetry...
    call npm run deploy:telemetry
    if %errorlevel% neq 0 (
        echo [PERINGATAN] Gagal mendeploy financeflow-telemetry. Pastikan ID KV di worker/wrangler.telemetry.json valid.
    ) else (
        echo [OK] financeflow-telemetry berhasil dideploy!
    )
) else (
    echo [INFO] Deployment worker dilewati. Anda dapat mendeploy nanti secara manual.
    echo (Petunjuk detail tersedia di INSTALLATION.id.md Bagian 4)
)
echo.

:: -----------------------------------------------------------------------------
:: [7/7] Verifikasi Build Produksi
:: -----------------------------------------------------------------------------
echo [7/7] Menjalankan verifikasi build produksi (npm run build)...
call npm run build
if %errorlevel% neq 0 (
    echo [GAGAL] Build produksi mengalami kendala kompilasi TypeScript atau Vite!
    echo Periksa pesan error di atas untuk rincian perbaikan.
    pause
    exit /b 1
)
echo [OK] Verifikasi build produksi berhasil 100%! Folder dist/ siap digunakan.
echo.

:: -----------------------------------------------------------------------------
:: Banner Sukses Akhir
:: -----------------------------------------------------------------------------
echo ==============================================================================
echo  🎉 SELAMAT! PEMASANGAN FINANCEFLOW TELAH SELESAI DENGAN SUKSES!
echo ==============================================================================
echo.
echo  Langkah selanjutnya untuk mulai menggunakan aplikasi:
echo.
echo  1. Jalankan development server lokal:
echo     ^> npm run dev
echo     Aplikasi akan terbuka otomatis di browser: http://localhost:3000
echo.
echo  2. Checklist Pertama Kali Buka Aplikasi (First-Run Checklist):
echo     [+] Buka menu Pengaturan ^> Keamanan: Pasang PIN Pengaman aplikasi
echo     [+] Buka tab Akun: Daftarkan rekening bank, e-wallet, dan uang tunai Anda
echo     [+] Buka menu Pengaturan ^> AI Assistant: Masukkan API Key Groq atau Gemini
echo     [+] Buka menu Pengaturan ^> Cloud Sync: Hubungkan Google Drive untuk backup
echo     [+] Buat Target Finansial pertama Anda di tab Goals
echo.
echo  Buku Panduan Lengkap:
echo    - Tutorial Penggunaan : TUTORIAL.md (Bahasa Indonesia) / TUTORIAL.en.md (English)
echo    - Panduan Instalasi   : INSTALLATION.id.md / INSTALLATION.md
echo    - Arsitektur Sistem   : ARCHITECTURE.id.md / ARCHITECTURE.md
echo ==============================================================================
echo.
pause
