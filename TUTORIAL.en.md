> [!NOTE]
> **Bilingual Documentation / Dokumentasi Dwibahasa**
> - Read this guide in **Bahasa Indonesia**: [TUTORIAL.md](TUTORIAL.md)
> - Return to Main Documentation: [README.md](README.md)

# MyFinancialFlow — Complete User Guide & Tutorial

Welcome to **MyFinancialFlow**! MyFinancialFlow is an offline-first, private, fast personal finance tracker and wealth management Progressive Web App (PWA). There are no monthly subscription fees, no ads, and no central tracking servers. Your financial data lives 100% inside your own device browser.

This comprehensive guide walks you through every feature and workflow in MyFinancialFlow.

---

## Table of Contents
1. [Initial Setup: Master PIN & Starting Accounts](#1-initial-setup-master-pin--starting-accounts)
2. [Daily Multi-Modal Transaction Logging](#2-daily-multi-modal-transaction-logging)
   - [Quick-Add Entry](#21-quick-add-entry)
   - [Conversational AI Chat Assistant](#22-conversational-ai-chat-assistant)
   - [Receipt Scanning (OCR)](#23-receipt-scanning-ocr)
   - [Bulk Account Mutation Extraction (Bulk History OCR)](#24-bulk-account-mutation-extraction-bulk-history-ocr)
   - [Voice Input](#25-voice-input)
   - [Telegram Bot Ingestion](#26-telegram-bot-ingestion)
3. [Financial Goals (Savings Targets) & Velocity](#3-financial-goals-savings-targets--velocity)
4. [Investment Portfolio & Non-Cash Assets](#4-investment-portfolio--non-cash-assets)
5. [Cash Flow Forecasting & Safe-to-Spend](#5-cash-flow-forecasting--safe-to-spend)
6. [Indonesian Personal Income Tax (PPh) Estimator](#6-indonesian-personal-income-tax-pph-estimator)
7. [Multi-Device Cloud Sync (Google Drive)](#7-multi-device-cloud-sync-google-drive)
8. [Privacy, Data Export & Data Erasure (Right-to-be-Forgotten)](#8-privacy-data-export--data-erasure-right-to-be-forgotten)
9. [Frequently Asked Questions & Troubleshooting (FAQ)](#9-frequently-asked-questions--troubleshooting-faq)

---

## 1. Initial Setup: Master PIN & Starting Accounts

When you first launch MyFinancialFlow, spend 2 minutes configuring your financial baseline:

### 1.1 Configure Security PIN
1. Open the **Settings** menu.
2. Select **Security & App Lock**.
3. Set a 4 to 6-digit numeric PIN. If supported by your hardware, enable Biometric Unlock (Fingerprint or Face ID).
4. Each time the application is relaunched after being backgrounded or closed, the security barrier will protect your sensitive data from prying eyes.

### 1.2 Register Your Accounts
Navigate to the **Accounts** tab to create the accounts you use day-to-day:
- **Checking / Operational Bank Accounts**: e.g. *BCA Main*, *Chase Checking*.
- **Digital Wallets (E-Wallets)**: e.g. *GoPay*, *OVO*, *PayPal*.
- **Physical Cash**: e.g. *Cash Wallet*.
- **Dedicated Savings Accounts**: e.g. *Emergency Fund Vault*.

> [!TIP]
> Enter starting balances matching your actual real-world accounts today so your Net Worth calculation is immediately accurate.

---

## 2. Daily Multi-Modal Transaction Logging

MyFinancialFlow offers multiple flexible input methods tailored for any situation:

### 2.1 Quick-Add Entry
- Tap the **+** button in the bottom navigation or press keyboard shortcut **N**.
- Choose transaction type: **Expense**, **Income**, or **Transfer**.
- Enter the amount, choose the relevant account, and pick a category.
- Press **Save (Enter)**. The transaction is instantly recorded in the ledger and account balances update with zero lag.

### 2.2 Conversational AI Chat Assistant
If you prefer natural language over filling forms:
- Open the **AI Chat** tab.
- Type naturally in English or Indonesian:
  - *"Lunch at warteg 35k with BCA"*
  - *"Groceries 120,000 cash"*
  - *"Transferred 500k from BCA to GoPay"*
  - *"Received affiliate commission 750k into Mandiri"*
- The AI assistant extracts the date, amount, category, and accounts automatically. Review the parsed card and click **Confirm** to record it.

### 2.3 Receipt Scanning (OCR)
After dining out or shopping at a supermarket:
1. Tap the **Camera / Scan Receipt** button.
2. Take a photo of the receipt or upload an existing image from your gallery.
3. The on-device OCR engine detects the merchant name, date, line items, and total amount.
4. You can keep the receipt image attached to the transaction record. In MyFinancialFlow V1.1, receipt images are automatically uploaded to Google Drive into organized visible subfolders (`MyFinancialFlow Data/Receipts/YYYY-MM/`) as standard JPEG files viewable directly in Drive or via transaction links.

> [!NOTE]
> **Offline Receipt Caching Policy**: To conserve local device memory and stay well below the 2.0 GB ceiling, local receipt image caches are automatically pruned from the browser once safely backed up to Google Drive. Viewing older pruned receipts while completely offline requires an active internet connection to stream the original image from Google Drive.

### 2.4 Bulk Account Mutation Extraction (Bulk History OCR)
Have screenshots of your mobile banking mutations or e-wallet transaction history?
1. Open the **Bulk History OCR** tool.
2. Upload one or multiple transaction history screenshots simultaneously.
3. The system scans each row of credits and debits, structuring them into a table with confidence indicators.
4. Review the detected entries and commit them to your ledger in one batch.

### 2.5 Voice Input
When your hands are busy driving or carrying groceries:
1. Tap the **Microphone** icon on the transaction input bar.
2. Grant browser microphone permission on first use.
3. Speak clearly: *"Bought coffee twenty five thousand with GoPay"*.
4. Web Speech API transcribes your speech and the AI parser converts it into a structured transaction.

### 2.6 Telegram Bot Ingestion
Record transactions quickly on Telegram without opening your browser:
1. Open your configured private Telegram bot (see [INSTALLATION.md](INSTALLATION.md)).
2. Send a text message or forward a receipt image to your bot.
3. Whenever you open MyFinancialFlow, check the **Inbox** tab. Your Telegram messages are buffered securely, ready to be approved in one click.

---

## 3. Financial Goals (Savings Targets) & Velocity

The **Goals** tab enables you to set and achieve tangible savings targets (e.g. Emergency Fund, Vacation Savings, Down Payment).

### 3.1 Creating a New Goal
1. Open the **Goals** tab and click **New Goal**.
2. Specify a title, choose an icon, enter the target amount, and set an optional deadline.
3. **Select Progress Tracking Mode**:
   - **Dedicated Account Mode**: Recommended if you maintain a dedicated savings account exclusively for this goal. Balance growth in this account automatically updates goal progress.
   - **Manual Contribution Mode**: Highly recommended if your account is also used for everyday living expenses (groceries, bills, salary deposits). In this mode, you log explicit deposits toward the goal, preventing misleading swings from regular spending.

### 3.2 90-Day Velocity Projections
Unlike simple linear progress bars, MyFinancialFlow dynamically measures your **net saving velocity over the past 90 days**:
- If you save an average of Rp 1,500,000 per month, the engine projects the exact realistic date you will hit 100%.
- If your recent saving rate slows down, the color-coded badge updates to warn that the goal *Needs Attention*.

---

## 4. Investment Portfolio & Non-Cash Assets

Your total wealth is rarely just cash in checking accounts. The **Investments** tab tracks your broader asset portfolio:

### 4.1 Adding Investment Assets
1. Open **Investments** and click **Add Asset**.
2. Select the asset classification:
   - **Stocks**: Ticker symbol (e.g. BBCA, AAPL) and number of shares/lots.
   - **Mutual Funds**: Fund name and units owned.
   - **Cryptocurrency**: Coin identifier (e.g. BTC, ETH, SOL) and unit quantity.
   - **Gold & Precious Metals**: Weight in grams and storage type.
   - **Real Estate / Property**: Land, homes, vehicles, or physical collections.
3. Record the initial purchase cost basis.

### 4.2 Periodic Valuation & Market Sync
- **Cryptocurrency**: Simply click **Update Crypto Prices**. Live market prices are pulled automatically from CoinGecko.
- **Stocks, Gold, and Property**: Click **Record Valuation** periodically (e.g. monthly) to enter the updated market worth.
- Historical valuation logs are preserved, generating visual performance charts and tracking unrealized gains and losses over time.

### 4.3 Integrated Net Worth
MyFinancialFlow combines all financial pillars into one real-time metric:
$$\text{Net Worth} = \text{Liquid Cash} + \text{Investment Asset Valuations} - \text{Outstanding Debt Balances}$$

---

## 5. Cash Flow Forecasting & Safe-to-Spend

The **Cash Flow Forecast** acts as an early-warning radar projecting your liquidity 30 to 180 days into the future.

### 5.1 Simulation Engine
The simulation synthesizes four daily metrics:
1. **Starting Balances**: Current liquid cash across all non-archived accounts.
2. **Recurring Obligations**: Scheduled bills, utilities, and subscriptions from the *Recurring Bills* register.
3. **Debt Amortization**: Upcoming debt and loan installments from the *Debt* register.
4. **Discretionary Spending Velocity**: 30-day moving average of everyday variable expenses.

### 5.2 Interpreting Warnings & Safe-to-Spend
- **Balance Depletion Warning**: If projected outflows outpace inflows, the system flags the exact future date when total liquid reserves are expected to dip below zero, giving you advance notice to curb non-essential spending.
- **Safe-to-Spend Metric**: A daily allowance figure indicating the maximum amount you can safely spend today without defaulting on upcoming fixed bills and loan obligations.

---

## 6. Indonesian Personal Income Tax (PPh) Estimator

> [!IMPORTANT]
> **Legal Disclaimer**:
> This tool is strictly an internal estimation assistant for personal financial tracking. It is **not** an official tax filing platform for the Directorate General of Taxes (DJP). Official tax compliance must always follow prevailing Indonesian tax laws and regulations.

For freelancers, content creators, and affiliate marketers (Shopee/TikTok Affiliate), distinguishing received cash from taxable gross income is essential.

### 6.1 Flagging Income Transactions
When adding or editing an **Income** transaction, configure the **Tax Treatment** field:
1. **Tax Already Withheld at Source**:
   - Use this for platforms that automatically deduct withholding tax before transfer (e.g. **Shopee Affiliate** PPh 21 withholding).
   - Enter the withholding tax amount from the payment slip (*bukti potong*).
   - **Dual-Ledger Magic**: Your bank account balance increases strictly by the net cash received, while the tax estimator logs the full gross revenue and tax credit. No artificial bank balance inflation!
2. **Not Yet Withheld (Needs Self-Calculation)**:
   - Use this for gross payments received without deductions (e.g. **TikTok Affiliate** commissions or direct freelance invoices).
   - Gross amounts are routed to the taxable pool for self-assessment.
3. **Not Taxable / Excluded**:
   - Internal transfers, reimbursements, or gifts/inheritances.

### 6.2 Annual Tax Estimation Dashboard
Navigate to the **Pajak / Tax Estimator** section:
1. **Select PTKP Bracket**: Choose your personal status from TK/0 (Rp 54M/yr) to K/3 (Rp 72M/yr).
2. **Employer Salary Baseline (Optional)**: If you also earn a regular employee salary where PPh 21 is already managed by corporate payroll, enter the annual gross amount here.
   > **Why is this necessary?** Under Indonesian tax regulations (UU HPP), PTKP is applied **only once** across a taxpayer's combined annual income. This field ensures PTKP is not erroneously deducted a second time against side income alone.
3. **Review Results**:
   - Combined Gross Taxable Income.
   - PTKP Deduction and Taxable Income (PKP).
   - Progressive PPh 21 Tiers (5%, 15%, 25%, 30%, 35%).
   - Total Withholding Tax Credits (*Kredit Pajak Bukti Potong*).
   - **Net Result**: Estimated Underpayment (*Kurang Bayar*) or Settled (*Nihil*).

---

## 7. Multi-Device Cloud Sync (Google Drive)

Log expenses on your phone during the day and review analytics on your desktop at night with Google Drive Sync.

### 7.1 Activating Cloud Sync
1. Open **Settings** > **Cloud Sync (Google Drive)**.
2. Confirm your Google Client ID is configured (see [INSTALLATION.md](INSTALLATION.md)).
3. Click **Sign in with Google** and select your personal Google account (using scoped `drive.file` permissions restricted only to files created by this app).
4. Once connected, the status badge will indicate `"Synced Just Now"` with a green indicator.

### 7.2 Safety Architecture & Visible Storage
- **Visible Data Folder (MyFinancialFlow Data/)**: In V1.1, sync data is stored directly in your Google Drive inside a visible `MyFinancialFlow Data/` folder in structured, human-readable JSON files (`transactions.json`, `accounts.json`, `categories.json`, `goals.json`, `investments.json`, `metadata.json`) along with organized receipt images in `Receipts/YYYY-MM/`.
- **Lightweight Tamper-Evidence**: Each JSON file is verified using a SHA-256 checksum stored in `manifest.json`. If a file is edited externally in Google Drive outside the app, the sync engine flags it as modified prior to merging.
- **Google Account Lock**: For security, MyFinancialFlow locks synchronization to the first Google account authenticated on a device. The `approvedAccountId` field is sealed with an HMAC signature; unauthorized tampering with the account lock is hard-blocked to prevent cloud takeover.
- **Duplicate Detection**: If you record the same transaction offline on two devices, the fuzzy-matching engine detects the duplicate and prompts you to resolve it cleanly.

---

## 8. Privacy, Data Export & Data Erasure (Right-to-be-Forgotten)

You maintain absolute ownership and sovereignty over your data.

### 8.1 Full Archive Export (ZIP)
- Under **Settings** > **Data Management**, select **Export Full Data (ZIP)**.
- MyFinancialFlow packages your complete JSON database alongside all original receipt image attachments into a single standard `.zip` file.
- The archive can be unpacked and viewed on any operating system without special software.

### 8.2 Opt-In Anonymous Crash Telemetry
- If you encounter technical bugs, you can opt in to send anonymous crash reports to the developer.
- **Zero Financial Data Guarantee**: Only 7 technical diagnostic fields are included (error name, message, stack, URL, browser, timestamp, version). Transaction amounts, account names, and balances are permanently blocked.

### 8.3 Two-Tier Data Wipe (Right-to-be-Forgotten)
If you wish to reset your account or permanently delete your financial footprint:
1. Navigate to **Settings** > **Data Management** > **Wipe Data & Reset**.
2. Select your erasure tier:
   - **Wipe Local Database**: Resets IndexedDB in your current browser only.
   - **Wipe Local & Google Drive Data**: Cleanses local storage and permanently purges all files in the `MyFinancialFlow Data/` folder on Google Drive. No data remains on any cloud node.

---

## 9. Frequently Asked Questions & Troubleshooting (FAQ)

### Q: Do I need an internet connection to use MyFinancialFlow?
> **A:** Absolutely not! MyFinancialFlow is offline-first. You can record transactions, generate charts, calculate taxes, and project cash flows completely offline. Changes automatically queue and synchronize to Google Drive once connectivity is restored. However, please note: if older receipt images have been pruned from your local device cache to conserve phone memory, viewing those specific receipts requires an active internet connection to stream the original image from Google Drive.

### Q: What should I do if I forget my security PIN?
> **A:** If Biometric Unlock was previously enabled, you can unlock using your fingerprint or Face ID and update your PIN in Settings. If biometrics are unavailable and the PIN is lost, you can perform a local reset and restore your ledger from your connected Google Drive backup.

### Q: Why do I see a "Google Account Mismatch" alert?
> **A:** This safeguard triggers if the signed-in Google account differs from the account initially approved as the database owner. Ensure you log in with the exact same Google account across all devices.

### Q: My AI API rate limit was exceeded. Will the app stop working?
> **A:** No! All manual logging, charts, analytics, and calculators continue operating normally. For the AI assistant, the 3-tier engine will automatically fall back to another configured provider (e.g. from Groq to Gemini), or you can input fresh API keys in Settings.

---

*Take control of your financial future with privacy, precision, and confidence using MyFinancialFlow!*
