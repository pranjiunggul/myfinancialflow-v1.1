#!/usr/bin/env bash
# ==============================================================================
# MyFinancialFlow — Skrip Pemasangan & Persiapan Otomatis (macOS & Linux)
# ==============================================================================
# Aplikasi Manajemen Keuangan Pribadi Offline-First, Privat & Cerdas
# ==============================================================================

# Warna ANSI untuk output terminal
BOLD="\033[1m"
GREEN="\033[1;32m"
BLUE="\033[1;34m"
YELLOW="\033[1;33m"
RED="\033[1;31m"
CYAN="\033[1;36m"
RESET="\033[0m"

echo -e "${CYAN}==============================================================================${RESET}"
echo -e "${BOLD} MyFinancialFlow — Skrip Pemasangan Otomatis (One-Click Setup)${RESET}"
echo -e "${CYAN}==============================================================================${RESET}"
echo -e " Aplikasi Manajemen Keuangan Pribadi Offline-First, Privat & Cerdas"
echo -e "${CYAN}==============================================================================${RESET}"
echo ""

# -----------------------------------------------------------------------------
# [1/7] Pemeriksaan Node.js
# -----------------------------------------------------------------------------
echo -e "${BLUE}[1/7] Memeriksa instalasi Node.js...${RESET}"
if ! command -v node >/dev/null 2>&1; then
    echo -e "${YELLOW}[PERINGATAN] Node.js belum terpasang di sistem ini!${RESET}"
    
    # Deteksi Sistem Operasi
    OS="$(uname -s)"
    if [ "$OS" = "Darwin" ]; then
        if command -v brew >/dev/null 2>&1; then
            echo -e "${CYAN}Memasang Node.js LTS via Homebrew (brew install node)...${RESET}"
            brew install node
        else
            echo -e "${RED}[GAGAL] Homebrew tidak terpasang.${RESET}"
            echo "Silakan pasang Node.js v18 atau v20+ LTS dari https://nodejs.org/"
            exit 1
        fi
    elif [ "$OS" = "Linux" ]; then
        echo -e "${YELLOW}Untuk Linux, pasang Node.js v18 atau v20+ LTS menggunakan package manager:${RESET}"
        echo "  - Ubuntu/Debian: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs"
        echo "  - Arch Linux: sudo pacman -S nodejs npm"
        echo "  - Atau pasang nvm: https://github.com/nvm-sh/nvm"
        exit 1
    fi
fi

NODE_VERSION=$(node -v 2>/dev/null)
if ! node -e "process.exit(parseInt(process.versions.node.split('.')[0]) >= 18 ? 0 : 1)" >/dev/null 2>&1; then
    echo -e "${YELLOW}[PERINGATAN] Versi Node.js Anda (${NODE_VERSION}) di bawah syarat minimal (v18.0.0+).${RESET}"
    read -r -p "Apakah Anda ingin tetap mencoba melanjutkan? [y/N]: " CONTINUE_OLD_NODE
    case "$CONTINUE_OLD_NODE" in
        [yY][eE][sS]|[yY]) ;;
        *) echo "Instalasi dibatalkan. Silakan perbarui Node.js."; exit 1 ;;
    esac
else
    echo -e "${GREEN}[OK] Node.js ${NODE_VERSION} terdeteksi (Memenuhi syarat v18+).${RESET}"
fi

if ! command -v npm >/dev/null 2>&1; then
    echo -e "${RED}[GAGAL] npm tidak ditemukan dalam PATH.${RESET}"
    exit 1
fi
NPM_VERSION=$(npm -v 2>/dev/null)
echo -e "${GREEN}[OK] npm v${NPM_VERSION} siap digunakan.${RESET}"
echo ""

# -----------------------------------------------------------------------------
# [2/7] Pemeriksaan Cloudflare Wrangler CLI
# -----------------------------------------------------------------------------
echo -e "${BLUE}[2/7] Memeriksa Cloudflare Wrangler CLI...${RESET}"
if npx --no-install wrangler --version >/dev/null 2>&1; then
    WRANGLER_VER=$(npx --no-install wrangler --version 2>/dev/null | head -n 1)
    echo -e "${GREEN}[OK] Cloudflare Wrangler ${WRANGLER_VER} tersedia.${RESET}"
elif command -v wrangler >/dev/null 2>&1; then
    echo -e "${GREEN}[OK] Cloudflare Wrangler CLI terpasang secara global.${RESET}"
else
    echo -e "${YELLOW}[INFO] Wrangler belum terpasang. Memasang Wrangler CLI secara global via npm...${RESET}"
    npm install -g wrangler || echo -e "${CYAN}[INFO] Pemasangan global dilewati. npx wrangler akan digunakan.${RESET}"
fi
echo ""

# -----------------------------------------------------------------------------
# [3/7] Opsi Clean Reinstall & Instalasi Dependensi
# -----------------------------------------------------------------------------
echo -e "${BLUE}[3/7] Menyiapkan dependensi proyek (npm install)...${RESET}"
if [ -d "node_modules" ]; then
    echo "Direktori node_modules lama terdeteksi."
    read -r -p "Apakah Anda ingin melakukan Clean Reinstall (hapus node_modules & lockfile)? [y/N]: " DO_CLEAN
    case "$DO_CLEAN" in
        [yY][eE][sS]|[yY])
            echo -e "${CYAN}Membersihkan node_modules dan package-lock.json...${RESET}"
            rm -rf node_modules package-lock.json
            echo -e "${GREEN}[OK] Dependensi lama berhasil dibersihkan.${RESET}"
            ;;
    esac
fi

echo -e "Menjalankan: ${CYAN}npm install${RESET}..."
npm install
if [ $? -ne 0 ]; then
    echo -e "${RED}[GAGAL] npm install mengalami kendala! Periksa koneksi internet Anda.${RESET}"
    exit 1
fi
echo -e "${GREEN}[OK] Seluruh paket dependensi MyFinancialFlow berhasil dipasang.${RESET}"
echo ""

# -----------------------------------------------------------------------------
# [4/7] Panduan Konfigurasi Lingkungan (.env)
# -----------------------------------------------------------------------------
echo -e "${BLUE}[4/7] Memeriksa file referensi konfigurasi lingkungan...${RESET}"
if [ ! -f ".env" ] && [ -f ".env.example" ]; then
    cp .env.example .env
    echo -e "${GREEN}[OK] File .env telah dibuat dari .env.example sebagai checklist referensi.${RESET}"
else
    echo -e "${GREEN}[OK] File .env sudah ada di direktori proyek.${RESET}"
fi

echo ""
echo -e "${CYAN}==============================================================================${RESET}"
echo -e "${BOLD}[INFO ARSITEKTUR ZERO-BUILD-TIME]${RESET}"
echo "MyFinancialFlow TIDAK mengharuskan Anda mengisi file .env sebelum build!"
echo "Seluruh kredensial & API key diatur langsung oleh Anda di dalam aplikasi browser"
echo "melalui menu Settings (Pengaturan) dan disimpan aman di IndexedDB perangkat Anda."
echo ""
echo "File .env dapat Anda gunakan sebagai catatan referensi:"
echo "  - GOOGLE_CLIENT_ID    : OAuth Client ID Google Drive Sync"
echo "  - GROQ_API_KEY        : API Key Groq Llama 3.3 (Gratis di console.groq.com)"
echo "  - GEMINI_API_KEY      : API Key Google Gemini Flash (Gratis di aistudio.google.com)"
echo "  - TELEGRAM_BOT_TOKEN  : Token Bot Telegram (dari @BotFather)"
echo "  - TELEGRAM_RELAY_URL  : URL Worker Relay Cloudflare Anda"
echo "  - TELEGRAM_SECURITY_PIN: PIN 4-6 digit untuk enkripsi pesan Telegram"
echo ""
echo -e "Panduan lengkap kredensial: ${BOLD}Buka INSTALLATION.id.md${RESET}"
echo -e "${CYAN}==============================================================================${RESET}"
echo ""

# -----------------------------------------------------------------------------
# [5/7] Pemeriksaan Autentikasi Cloudflare Wrangler
# -----------------------------------------------------------------------------
echo -e "${BLUE}[5/7] Memeriksa sesi autentikasi Cloudflare...${RESET}"
if npx wrangler whoami >/dev/null 2>&1; then
    echo -e "${GREEN}[OK] Anda telah terotentikasi di Cloudflare Wrangler!${RESET}"
else
    echo -e "${YELLOW}[PERHATIAN] Anda belum login ke akun Cloudflare di komputer ini.${RESET}"
    echo "Cloudflare Wrangler membutuhkan otorisasi interaktif via peramban web."
    read -r -p "Apakah Anda ingin membuka browser untuk login ke Cloudflare sekarang? [y/N]: " DO_CF_LOGIN
    case "$DO_CF_LOGIN" in
        [yY][eE][sS]|[yY])
            echo -e "${CYAN}Membuka browser untuk login Cloudflare...${RESET}"
            npx wrangler login || echo -e "${YELLOW}[INFO] Login dibatalkan atau dilewati.${RESET}"
            ;;
        *)
            echo -e "${CYAN}[INFO] Login dilewati. Anda dapat login nanti via: npx wrangler login${RESET}"
            ;;
    esac
fi
echo ""

# -----------------------------------------------------------------------------
# [6/7] Opsi Deployment Cloudflare Workers (Relay & Telemetri)
# -----------------------------------------------------------------------------
echo -e "${BLUE}[6/7] Opsi Deployment Cloudflare Workers...${RESET}"
echo "MyFinancialFlow memiliki dua Cloudflare Worker:"
echo "  1. financeflow-relay      : Relay webhook penampung pesan Telegram Bot"
echo "  2. financeflow-telemetry  : Pelapor crash error privat dengan auto-TTL 30 hari"
echo ""
read -r -p "Apakah Anda ingin mendeploy kedua Cloudflare Workers sekarang? [y/N]: " DO_DEPLOY_WORKERS
case "$DO_DEPLOY_WORKERS" in
    [yY][eE][sS]|[yY])
        echo -e "${CYAN}Mendeploy financeflow-relay...${RESET}"
        npm run deploy:worker || echo -e "${YELLOW}[PERINGATAN] Gagal deploy financeflow-relay. Cek ID KV di worker/wrangler.relay.json${RESET}"
        
        echo -e "${CYAN}Mendeploy financeflow-telemetry...${RESET}"
        npm run deploy:telemetry || echo -e "${YELLOW}[PERINGATAN] Gagal deploy financeflow-telemetry. Cek ID KV di worker/wrangler.telemetry.json${RESET}"
        ;;
    *)
        echo -e "${CYAN}[INFO] Deployment worker dilewati. Anda dapat menjalankannya nanti.${RESET}"
        echo "(Petunjuk detail tersedia di INSTALLATION.id.md Bagian 4)"
        ;;
esac
echo ""

# -----------------------------------------------------------------------------
# [7/7] Verifikasi Build Produksi
# -----------------------------------------------------------------------------
echo -e "${BLUE}[7/7] Menjalankan verifikasi build produksi (npm run build)...${RESET}"
npm run build
if [ $? -ne 0 ]; then
    echo -e "${RED}[GAGAL] Build produksi mengalami kendala kompilasi!${RESET}"
    exit 1
fi
echo -e "${GREEN}[OK] Verifikasi build produksi berhasil 100%! Folder dist/ siap digunakan.${RESET}"
echo ""

# -----------------------------------------------------------------------------
# Banner Sukses Akhir
# -----------------------------------------------------------------------------
echo -e "${CYAN}==============================================================================${RESET}"
echo -e "${BOLD}${GREEN} 🎉 SELAMAT! PEMASANGAN FINANCEFLOW TELAH SELESAI DENGAN SUKSES!${RESET}"
echo -e "${CYAN}==============================================================================${RESET}"
echo ""
echo -e " Langkah selanjutnya untuk mulai menggunakan aplikasi:"
echo ""
echo -e " 1. Jalankan development server lokal:"
echo -e "    ${BOLD}${CYAN}> npm run dev${RESET}"
echo -e "    Aplikasi akan terbuka otomatis di browser: ${BOLD}http://localhost:3000${RESET}"
echo ""
echo -e " 2. Checklist Pertama Kali Buka Aplikasi (First-Run Checklist):"
echo -e "    [+] Buka menu Pengaturan > Keamanan: Pasang PIN Pengaman aplikasi"
echo -e "    [+] Buka tab Akun: Daftarkan rekening bank, e-wallet, dan uang tunai Anda"
echo -e "    [+] Buka menu Pengaturan > AI Assistant: Masukkan API Key Groq atau Gemini"
echo -e "    [+] Buka menu Pengaturan > Cloud Sync: Hubungkan Google Drive untuk backup"
echo -e "    [+] Buat Target Finansial pertama Anda di tab Goals"
echo ""
echo -e " Buku Panduan Lengkap:"
echo -e "   - Tutorial Penggunaan : ${BOLD}TUTORIAL.md (ID) / TUTORIAL.en.md (EN)${RESET}"
echo -e "   - Panduan Instalasi   : ${BOLD}INSTALLATION.id.md / INSTALLATION.md${RESET}"
echo -e "   - Arsitektur Sistem   : ${BOLD}ARCHITECTURE.id.md / ARCHITECTURE.md${RESET}"
echo -e "${CYAN}==============================================================================${RESET}"
echo ""
