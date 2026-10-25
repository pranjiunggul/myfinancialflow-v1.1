> [!NOTE]
> **Bilingual Documentation / Dokumentasi Dwibahasa**
> - Baca dokumentasi ini dalam **Bahasa Indonesia**: [README.id.md](README.id.md)
> - Panduan Instalasi Lengkap: [INSTALLATION.md](INSTALLATION.md) | [INSTALLATION.id.md](INSTALLATION.id.md)
> - Panduan Pengguna (User Guide): [TUTORIAL.md](TUTORIAL.md) (ID) | [TUTORIAL.en.md](TUTORIAL.en.md) (EN)

# MyFinancialFlow V1.1 — Smart, Offline-First Personal Finance PWA

MyFinancialFlow is a privacy-first, offline-capable Progressive Web Application (PWA) designed to track personal finances, cash flow, investments, savings goals, and tax liabilities with zero vendor lock-in. 

It combines reactive client-side database storage (Dexie.js / IndexedDB), multi-modal transaction entry (voice, receipt OCR, AI chat, Telegram bot), resilient multi-provider AI parsing (Groq, Google Gemini, OpenRouter), and transparent cloud sync via Google Drive's visible `MyFinancialFlow Data/` folder with tamper-evidence and viewable receipt storage.

---

## Key Capabilities & Features

### 1. Multi-Modal Transaction Ingestion
- **Quick-Add**: Rapid inline entry with keyboard shortcuts, auto-categorization, and transfer shortcuts.
- **Smart AI Chat Assistant**: Conversational logging in natural Indonesian or English (e.g., *"Makan siang 35rb di warteg bca"*), powered by a 3-tier failover engine (Groq, Gemini, OpenRouter).
- **Receipt OCR & Bulk History Extraction**: Powered by Tesseract.js and multimodal Gemini. Parse physical receipts or bulk bank transfer screenshot history in one batch.
- **Voice Input**: Web Speech API integration with explicit privacy consent, Indonesian language support, and intelligent AI intent extraction.
- **Telegram Bot Inbox**: Record transactions on the move via a private Telegram bot; messages are buffered via an edge relay worker (`financeflow-relay` using Cloudflare KV) with PIN-based end-to-end payload encryption.

### 2. Indonesian Personal Income Tax (PPh) Estimator
- **Dual-Ledger Tracking**: Separates **Gross Taxable Income** from **Net Cash Received**, ensuring accurate bank reconciliation without under-reporting taxable revenue.
- **Preset Platform Treatments**:
  - *Tax Withheld at Source*: Logs withholding tax credits (e.g. Shopee Affiliate PPh 21 Bukti Potong).
  - *Not Yet Withheld*: Tracks gross income requiring self-calculation (e.g. TikTok Affiliate, direct freelance).
  - *Non-Taxable / Excluded*: Internal transfers, reimbursements, gifts.
- **Configurable Tax Rules**:
  - Single-PTKP rule across employment and side income.
  - Configurable PTKP brackets: TK/0 (Rp 54M) through K/3 (Rp 72M).
  - Progressive PPh 21 tax brackets (5% up to 35% above Rp 5B).
  - Dedicated field for primary employer salary already taxed via corporate payroll.
  - Persistent non-official estimation disclaimer.

### 3. Financial Goals (Savings Goals) & Velocity
- **Smart Progress Tracking**: Real-time progress bars comparing current vs. target amounts.
- **90-Day Velocity Projections**: Dynamically calculates projected completion dates based on the user's actual 90-day net saving velocity, rather than unrealistic linear timelines.
- **Dual Tracking Modes**:
  - *Dedicated Account Mode*: Progress tracked automatically against balance growth in a dedicated savings account.
  - *Manual Contribution Mode*: Progress tracked via explicit goal deposits (recommended for multi-purpose accounts).

### 4. Investment & Non-Cash Asset Tracking
- **Multi-Asset Portfolio**: Dedicated tracking for Stocks, Mutual Funds, Crypto, Gold/Precious Metals, and Real Estate/Property.
- **Hybrid Valuation**:
  - Periodic manual valuation entries with full historical valuation logs.
  - Optional live auto-fetch for major cryptocurrencies via public CoinGecko API.
- **Net Worth Integration**: Computes true total net worth (Liquid Cash + Investments - Outstanding Debts).

### 5. Cash Flow Forecasting
- **3 to 6-Month Projections**: Daily balance projections combining current account balances, recurring bills, active debt amortization, and discretionary spending velocity.
- **Depletion Alerts**: Flags the exact projected date when any account or total liquid balance risks depletion below zero.
- **Safe-to-Spend Metric**: Daily allowance calculated after reserving upcoming fixed obligations and debt payments.

### 6. Cloud Sync & Visible Google Drive Storage
- **Visible Google Drive Storage**: Stores human-readable, structured JSON files (`transactions.json`, `accounts.json`, `categories.json`, `goals.json`, `investments.json`, `metadata.json`) inside a visible `MyFinancialFlow Data/` folder in the user's Google Drive (`drive.file` scope).
- **Receipt Image Storage**: Automatically uploads receipt attachments into organized `MyFinancialFlow Data/Receipts/YYYY-MM/` subfolders as standard viewable JPEG images accessible directly in Google Drive or within transactions.
- **Lightweight Tamper-Evidence**: Generates SHA-256 checksums per file stored in `manifest.json`, plus an HMAC seal for `approvedAccountId`. Detects external modifications and hard-blocks unauthorized Google Account Lock changes.
- **Device Identity & Account Lock**: Enforces a single approved Google account across all devices to prevent data contamination.
- **Cross-Device Duplicate Detection**: Intelligent fuzzy matching alerts users to duplicate transactions entered across different offline devices.
- **Conflict Resolution**: Vector clock and last-write-wins strategy with tombstone deletion support.

### 7. Local Encryption, Data Portability & Storage Balance
- **Encrypted Local Storage**: All local on-device database data (IndexedDB) and local daily OPFS snapshots (`.enc`) remain strictly protected under your Master PIN.
- **Deliberate Cloud Readability Tradeoff**: As of V1.1, the Google Drive cloud copy is stored unencrypted in structured JSON and standard image formats for user transparency, zero vendor lock-in, and easy external readability.
- **Offline Receipt Caching Policy**: Local receipt image caches are automatically pruned once backed up to Drive to honor the 2.0 GB device ceiling. Viewing older pruned receipts while fully offline requires an active internet connection to stream from Drive.
- **Opt-In Anonymous Crash Telemetry**: Diagnostic crash reports submitted to `financeflow-telemetry` worker enforce a strict 7-field technical allow-list with **zero financial data** and 30-day auto-TTL in Cloudflare KV.
- **Right-to-be-Forgotten**: Two-tier data wipe (local DB reset + Google Drive `MyFinancialFlow Data` wipe).
- **Full Data Portability**: Zero-dependency ZIP export containing full JSON database and raw receipt image attachments.

### 8. Motivation & Gamification
- **Financial Health Score**: Dynamic 0-100 scoring based on savings rate, budget discipline, emergency fund ratio, and logging consistency.
- **Streaks & Badges**: Tracks daily logging streaks and unlocks achievement badges.
- **MyFinancialFlow Wrapped**: Spotify-style interactive month/year-in-review visual slides.

---

## Technical Architecture & Stack

| Layer | Technology | Description |
| :--- | :--- | :--- |
| **Frontend Framework** | React 19 + TypeScript 5.7 | Modern component architecture, functional hooks |
| **Styling & Icons** | Tailwind CSS 3.4 + Lucide React | Clean, responsive design with dark mode aesthetic |
| **Client Database** | Dexie.js 4.0 (IndexedDB) | Reactive IndexedDB with **Schema v8** (23 tables) — `'FinanceFlowDB'` |
| **Build & PWA** | Vite 6 + `vite-plugin-pwa` | Instant HMR, offline service worker, PWA installable |
| **Edge Compute** | Cloudflare Workers & Pages | Edge hosting and serverless relays |
| **Edge Storage** | Cloudflare KV | `INBOX_KV` (Telegram relay) & `CRASH_REPORTS_KV` (telemetry) |
| **Cloud Sync** | Google Drive API v3 | Visible `MyFinancialFlow Data/` storage via `drive.file` scope with SHA-256 tamper-evidence |
| **AI Inference** | Groq, Gemini, OpenRouter | 3-tier fallback engine with token rate-limiting & failover |
| **Local OCR** | Tesseract.js | In-browser client-side OCR for offline receipt parsing |
| **Automated Testing** | `tsx` + `fake-indexeddb` | 28 integration test suites |

---

## Documentation Index

Explore the comprehensive bilingual documentation suite:

| Document | English Version | Indonesian Version (Bahasa) |
| :--- | :--- | :--- |
| **Installation & Deployment** | [INSTALLATION.md](INSTALLATION.md) | [INSTALLATION.id.md](INSTALLATION.id.md) |
| **User Guide & Tutorial** | [TUTORIAL.en.md](TUTORIAL.en.md) | [TUTORIAL.md](TUTORIAL.md) |
| **System Architecture** | [ARCHITECTURE.md](ARCHITECTURE.md) | [ARCHITECTURE.id.md](ARCHITECTURE.id.md) |
| **Network & Deployment Topology** | [TOPOLOGY.md](TOPOLOGY.md) | [TOPOLOGY.id.md](TOPOLOGY.id.md) |

---

## Quick Start (Automated Setup)

Clone the repository and run the automated setup script for your platform:

```bash
# Windows
SETUP_FINANCEFLOW.bat

# macOS / Linux
chmod +x setup-financeflow.sh && ./setup-financeflow.sh
```

Or follow manual steps:

```bash
# 1. Clone repository
git clone https://github.com/pranjiunggul/myfinancialflow-v1.1.git
cd myfinancialflow-v1.1

# 2. Install dependencies (no .env required!)
npm install

# 3. Run development server
npm run dev

# 4. Run test suites (28 integration tests)
npm test

# 5. Build production bundle
npm run build
```

See [INSTALLATION.md](INSTALLATION.md) for full deployment instructions for Google Drive Sync, Cloudflare Workers, and Telegram Bot setup.

---

## License

This project is licensed under the MIT License — see the LICENSE file for details.
