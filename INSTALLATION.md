> [!NOTE]
> **Bilingual Documentation / Dokumentasi Dwibahasa**
> - Baca panduan instalasi ini dalam **Bahasa Indonesia**: [INSTALLATION.id.md](INSTALLATION.id.md)
> - Return to Main Documentation: [README.md](README.md)

# MyFinancialFlow V1.1 — Complete Installation & Deployment Guide

This guide provides end-to-end instructions for installing, configuring, running locally, and deploying MyFinancialFlow across all components:
1. Prerequisites
2. Local Development Setup (Zero-Build-Time `.env`)
3. Google Drive Cloud Sync Setup (OAuth 2.0 Web Client)
4. Cloudflare Workers Deployment (`financeflow-relay` & `financeflow-telemetry`)
5. Cloudflare Pages Deployment (Production PWA Hosting)
6. Telegram Bot Integration Setup
7. AI Provider Setup (Groq, Google Gemini, OpenRouter)
8. First-Run Verification Checklist

---

## 1. Prerequisites

Before setting up MyFinancialFlow, ensure your environment meets these requirements:

| Tool | Minimum Version | Recommended | Notes |
| :--- | :--- | :--- | :--- |
| **Node.js** | `v18.0.0` | `v20.x` or `v22.x` LTS | Engine for build tools and test runner (`tsx`) |
| **npm** | `v9.0.0` | `v10.x`+ | Bundled with Node.js |
| **Cloudflare Account** | Free Tier | Free Tier | Required for Workers & Pages hosting |
| **Wrangler CLI** | `v3.0.0`+ | Latest via `npx wrangler` | Cloudflare developer CLI |
| **Web Browser** | Evergreen | Chrome, Edge, Safari, Firefox | Must support PWA, Web Crypto API, and IndexedDB |

---

## 2. Local Development Setup

MyFinancialFlow is designed with a **Zero-Build-Time Configuration** architecture. You do not need to create or maintain a `.env` file to build, run, or test the application. All credentials, API keys, and endpoints are configured client-side inside the app's Settings page and stored securely in browser IndexedDB.

### Quick Start: One-Click Setup Script (Recommended)

To automate prerequisites detection, dependency installation, Cloudflare Wrangler check, and production build verification, run the automated setup script for your platform:

#### Windows:
Double-click `SETUP_FINANCEFLOW.bat` in the repository root, or run:
```cmd
SETUP_FINANCEFLOW.bat
```

#### macOS & Linux:
Run the POSIX setup shell script in terminal:
```bash
chmod +x setup-financeflow.sh
./setup-financeflow.sh
```

**What the setup script does automatically:**
1. Detects Node.js (v18+) and attempts automatic installation via package manager (`winget` on Windows, `brew` on macOS) if missing.
2. Checks Cloudflare Wrangler CLI availability.
3. Offers a Clean Reinstall option (removing old `node_modules` and lockfile) to prevent stale package issues.
4. Initializes `.env` from `.env.example` as a personal reference checklist.
5. Verifies interactive Cloudflare authentication status (`wrangler whoami`).
6. Optionally deploys Cloudflare Workers (`financeflow-relay` and `financeflow-telemetry`).
7. Runs production build verification (`npm run build`).

---

### Manual Step-by-Step Installation (Fallback & Reference)

If you prefer to perform each step manually:

### Step 2.1: Clone & Install

```bash
# Clone the repository
git clone https://github.com/your-username/financeflow.git
cd financeflow

# Install project dependencies
npm install
```

### Step 2.2: Run Development Server

```bash
npm run dev
```
The Vite development server will start at `http://localhost:3000` (or the next available port) and open automatically in your default browser.

### Step 2.3: Run the Integration Test Suite

MyFinancialFlow includes 27 comprehensive automated test suites covering database migrations (v6, v7, v8), offline analytics, tax estimation engine, ledger reconciliation, AI failover, and telemetry persistence.

```bash
npm test
```
*Expected output: All 27 test suites execute sequentially and finish with exit code 0.*

### Step 2.4: Build for Production

```bash
npm run build
```
This runs TypeScript validation (`tsc -b`) and generates optimized production assets in the `dist/` folder.

To preview the production bundle locally:
```bash
npm run preview
```

---

## 3. Google Drive Cloud Sync Setup

In MyFinancialFlow V1.1, data synchronizes to a visible, user-accessible Google Drive folder (`MyFinancialFlow Data/`) using the restricted `drive.file` scope (`https://www.googleapis.com/auth/drive.file`). This scope grants access strictly to folders and files created by this application (never to the user's broader Drive contents). Core financial data is stored in human-readable JSON files with SHA-256 tamper-evidence and HMAC-protected account locking, while receipt attachments are organized in `Receipts/YYYY-MM/` as viewable JPEG images.

### Step 3.1: Create a Google Cloud Project
1. Navigate to the [Google Cloud Console](https://console.cloud.google.com/).
2. Click **Select a project** > **New Project**.
3. Name your project (e.g. `MyFinancialFlow-Sync`) and click **Create**.

### Step 3.2: Enable Google Drive API
1. In the Google Cloud Console, open the sidebar and navigate to **APIs & Services** > **Library**.
2. Search for **Google Drive API**.
3. Click on **Google Drive API** and select **Enable**.

### Step 3.3: Configure OAuth Consent Screen
1. Go to **APIs & Services** > **OAuth consent screen**.
2. Select **External** (unless you are using a Google Workspace organization) and click **Create**.
3. Fill in the required fields:
   - **App name**: `MyFinancialFlow`
   - **User support email**: Your email address
   - **Developer contact information**: Your email address
4. Under **Scopes**, click **Add or Remove Scopes**, add `https://www.googleapis.com/auth/drive.file` and `email` (or `https://www.googleapis.com/auth/userinfo.email`), and save.
5. Under **Test users**, add your own Google email address.

### Step 3.4: Create OAuth 2.0 Web Client ID
1. Navigate to **APIs & Services** > **Credentials**.
2. Click **Create Credentials** > **OAuth client ID**.
3. Set **Application type** to **Web application**.
4. Set **Name** to `MyFinancialFlow Web Client`.
5. Under **Authorized JavaScript origins**, add:
   - `http://localhost:3000` (for local development)
   - `https://financeflow-pwa.pages.dev` (your production Cloudflare Pages URL)
6. Click **Create**.
7. Copy the generated **Client ID** (formatted as `XXXXX.apps.googleusercontent.com`).

### Step 3.5: Enter Client ID into MyFinancialFlow
1. Open MyFinancialFlow in your browser.
2. Go to **Settings** > **Cloud Sync (Google Drive)**.
3. Paste your Google Client ID into the field.
4. Click **Sign in with Google**.
5. Once authenticated, your device identity will be registered and automatic incremental sync will be active.

---

## 4. Cloudflare Workers Deployment

MyFinancialFlow uses two lightweight, privacy-focused Cloudflare Workers:
1. `financeflow-relay`: Webhook relay for incoming Telegram messages, buffering unread messages in Cloudflare KV.
2. `financeflow-telemetry`: Opt-in anonymous crash reporter storing sanitized diagnostic logs (7-field allow-list, zero financial data) with 30-day auto-TTL.

### Step 4.1: Log in to Cloudflare Wrangler
```bash
npx wrangler login
```
Follow the browser prompt to authorize Wrangler with your Cloudflare account.

### Step 4.2: Deploy `financeflow-relay` (Telegram Relay)

1. Create a Cloudflare KV namespace for message buffering:
   ```bash
   npx wrangler kv:namespace create INBOX_KV
   ```
2. Wrangler will output something like:
   ```json
   { "binding": "INBOX_KV", "id": "<YOUR_KV_NAMESPACE_ID>" }
   ```
3. Open `worker/wrangler.relay.json` and ensure the `id` matches your created KV namespace:
   ```json
   {
     "$schema": "../node_modules/wrangler/config-schema.json",
     "name": "financeflow-relay",
     "main": "worker.js",
     "compatibility_date": "2026-10-19",
     "kv_namespaces": [
       {
         "binding": "INBOX_KV",
         "id": "<YOUR_KV_NAMESPACE_ID>"
       }
     ]
   }
   ```
4. Deploy the relay worker:
   ```bash
   npm run deploy:worker
   ```
5. Record your deployed Worker URL: `https://financeflow-relay.<your-subdomain>.workers.dev`.

### Step 4.3: Deploy `financeflow-telemetry` (Crash Reporter)

1. Create a Cloudflare KV namespace for telemetry logs:
   ```bash
   npx wrangler kv:namespace create CRASH_REPORTS_KV
   ```
2. Open `worker/wrangler.telemetry.json` and ensure the `id` matches:
   ```json
   {
     "$schema": "../node_modules/wrangler/config-schema.json",
     "name": "financeflow-telemetry",
     "main": "crash-reporter.js",
     "compatibility_date": "2026-10-19",
     "kv_namespaces": [
       {
         "binding": "CRASH_REPORTS_KV",
         "id": "<YOUR_KV_NAMESPACE_ID>"
       }
     ]
   }
   ```
3. Deploy the telemetry worker:
   ```bash
   npm run deploy:telemetry
   ```
4. Record your deployed Telemetry URL: `https://financeflow-telemetry.<your-subdomain>.workers.dev`.

---

## 5. Cloudflare Pages Deployment (Production PWA)

Deploy the built web application to Cloudflare Pages for ultra-fast worldwide edge hosting.

### Method A: Automated Deployment via Wrangler (Recommended)

1. Build the production bundle:
   ```bash
   npm run build
   ```
2. Deploy directly to Cloudflare Pages:
   ```bash
   npm run deploy:pages
   ```
   *(Or run: `npx wrangler pages deploy dist --project-name financeflow-pwa`)*

3. Wrangler will upload the `dist` directory and output your live deployment URL:
   `https://financeflow-pwa.pages.dev` (or assigned hash subdomain).

### Method B: Git-Connected Cloudflare Pages Dashboard

1. Push your repository to GitHub or GitLab.
2. In the [Cloudflare Dashboard](https://dash.cloudflare.com/), go to **Workers & Pages** > **Create application** > **Pages** > **Connect to Git**.
3. Select your repository.
4. Set the build configuration:
   - **Framework preset**: `Vite`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
5. Click **Save and Deploy**.

---

## 6. Telegram Bot Integration Setup

The Telegram Bot allows you to quickly log transactions on the go using natural language or receipt photos.

### Step 6.1: Create Bot via @BotFather
1. Open Telegram and search for `@BotFather`.
2. Send `/newbot`.
3. Give your bot a display name (e.g. `My MyFinancialFlow Bot`) and a unique username ending in `bot` (e.g. `my_financeflow_bot`).
4. Copy the **HTTP API Bot Token** provided by BotFather (`1234567890:ABCdef...`).

### Step 6.2: Set Webhook to Your Relay Worker
Run this curl command or open the URL in your browser:
```bash
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://financeflow-relay.<your-subdomain>.workers.dev/webhook"
```
*Expected response: `{"ok":true,"result":true,"description":"Webhook was set"}`.*

### Step 6.3: Configure in MyFinancialFlow Settings
1. Open MyFinancialFlow PWA.
2. Go to **Settings** > **Telegram Bot**.
3. Enter your **Bot Token**.
4. Enter your **Relay URL** (`https://financeflow-relay.<your-subdomain>.workers.dev`).
5. Choose a **4 to 6 digit Security PIN** to protect your messages with end-to-end payload encryption.
6. Click **Save & Test Connection**.

### Step 6.4: Authenticate on Telegram
1. Open your bot in Telegram and tap **Start** (or send `/start`).
2. Send `/auth <YOUR_PIN>` (e.g. `/auth 1234`).
3. You will receive a confirmation message that your chat is authorized.
4. Send any transaction: `Beli kopi 25000 pakai BCA` or upload a receipt photo.
5. In MyFinancialFlow, the transaction will appear in your **Inbox** ready for approval.

---

## 7. AI Provider Setup

MyFinancialFlow features a resilient **3-Tier AI Fallback Engine** with automatic failover, health checks, and rate-limit tracking. You can configure one, two, or all three providers:

| Provider | Recommended Model | Pricing / Free Tier | Key Benefits |
| :--- | :--- | :--- | :--- |
| **Groq** | `llama-3.3-70b-versatile` | Free tier available | Ultra-fast token generation (~500ms responses) |
| **Google Gemini** | `gemini-2.5-flash` | Free tier available | Superior multimodal OCR & document parsing |
| **OpenRouter** | Multi-model / Fallback | Pay-as-you-go | Universal failover gateway |

### How to Configure:
1. Open MyFinancialFlow PWA.
2. Go to **Settings** > **AI Assistant & OCR**.
3. Add your API keys:
   - **Groq API Key**: Obtain from [console.groq.com](https://console.groq.com/keys)
   - **Google Gemini API Key**: Obtain from [aistudio.google.com](https://aistudio.google.com/)
   - **OpenRouter API Key**: Obtain from [openrouter.ai](https://openrouter.ai/keys)
4. Click **Test All Providers** to verify connection latency and availability.
5. The system automatically routes queries to the healthiest provider, falling back transparently if rate limits are hit.

---

## 8. First-Run Verification Checklist

Follow this checklist to verify your installation is 100% operational:

- [ ] **1. App Access**: App loads cleanly via `https://your-domain.pages.dev` or `http://localhost:3000`.
- [ ] **2. Security PIN**: Go to Settings, set up your master security PIN / biometric authentication.
- [ ] **3. Accounts**: Create your initial accounts in Accounts tab (e.g., BCA, Mandiri, Cash Wallet).
- [ ] **4. Test Transaction**: Log a manual transaction (e.g. Expense `Rp 50,000` for `Food & Drinks`).
- [ ] **5. AI Parsing**: Open AI Chat Assistant and send `"Makan siang 35rb di warteg cash"`. Verify it parses category, amount, and account correctly.
- [ ] **6. Receipt OCR**: Upload or take a picture of a receipt. Verify that OCR extracts the merchant and total.
- [ ] **7. Financial Goals**: Open Goals tab and create a savings target with velocity projection.
- [ ] **8. Cloud Sync**: Sign in with Google under Settings. Check that the sync status shows `"Synced Just Now"` with green indicator.
- [ ] **9. Offline Test**: Disconnect your internet connection. Create a transaction and edit a budget. Reconnect internet and observe automatic sync resolution.
- [ ] **10. Export Backup**: Go to Settings > Data Management > Export Full Data (ZIP). Verify that a valid archive containing your JSON database and receipts is downloaded.

You are now ready to track and optimize your finances with MyFinancialFlow!
