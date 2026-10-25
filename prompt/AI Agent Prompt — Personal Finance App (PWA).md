# Project Brief: Full-Featured Personal Finance Tracker (PWA)

*A prompt/brief for an autonomous coding agent (e.g. Google Antigravity) to design and build this application.*

## 1. Role & Objective

You are a senior full-stack product engineer. Design and build a **personal finance tracking application** that matches or exceeds the quality of the best finance-tracking apps on the Play Store/App Store, while being lightweight, cross-device, offline-capable, and AI-enhanced. Propose the best technology stack for each requirement below (do not assume a single technology unless stated as a hard constraint), and explain trade-offs before implementation.

## 2. Platform & Architecture (Hard Constraint)

- The app must be a **lightweight application runnable in a web browser** — it does not have to be plain static HTML. Choose the best-fitting modern approach (e.g. a **Progressive Web App**) that satisfies *all* of the following simultaneously: installable on both smartphone and PC, works offline, syncs in the background, and performs well on low-spec devices.
- Single codebase preferred, running identically on smartphone (Android/iOS browser or installed PWA) and PC (desktop browser or installed PWA).
- Must remain fully usable with **no internet connection**; sync and AI-via-API features should gracefully degrade to offline mode when unavailable.
- Must run acceptably on **low-spec devices** (older phones, low-RAM PCs) — keep bundle size, memory footprint, and background processing minimal; avoid heavy frameworks/animations that degrade performance on weak hardware.

## 3. Cross-Device Synchronization

- The app must run **synchronously across smartphone and PC** — data stays consistent when the same user opens the app on either device.
- Sync is powered by **Google Drive** as the backend sync/storage layer (user's own Drive, via OAuth).
- **Sync trigger:** synchronization happens whenever the app is opened on a smartphone or PC (not necessarily continuous background sync — triggered on app open/resume, with an optional manual "sync now" action).
- **Conflict resolution reference point:** the most recent transaction **by timestamp** is treated as the source of truth for conflicting records (last-write-wins at the field/record level).
- **Data safety on top of last-write-wins:** implement soft-delete (never hard-delete silently) and a per-record **change/audit log** (what changed, when, on which device) so that no data is silently lost when two devices edit or delete the same transaction concurrently. Provide a way for the user to review/recover conflicting or deleted entries.

## 4. Backup & Restore

- Full backup/restore of all data (transactions, accounts, categories, settings).
- Storage locations: **on-device (local)** and **Google Drive**.
- Backup frequency: **daily automatic backup**, plus an **on-demand manual backup** option at any time.
- Backups (both local and Drive) must be **encrypted at rest**.
- Restore must be straightforward from either local or Drive backup, with a preview/confirmation step before overwriting existing data.

## 5. Transactions, Accounts & Categories (CRUD)

- Full **Create / Edit / Delete** support for:
- **Transactions** — fields include at minimum: date, transaction type (income / expense / transfer / debt / receivable), amount, account, category, note/description, currency.
- **Accounts** (e.g. cash wallet, bank accounts, e-wallets, PayPal, etc.) — custom name, icon, starting balance, currency.
- **Categories** — custom name, icon, income/expense type; default categories should exist but remain user-editable; prevent deletion of a category still referenced by transactions (or require reassignment).
- Deleting/editing a transaction must correctly reverse/recalculate all dependent balances (account balances, transfer pairs, debt/receivable status).

## 6. Special Transaction Logic

### 6.1 Transfers between accounts

- When a transaction's category is **"Transfer"**, automatically move the balance from the source account to the destination account (a linked pair of entries, not two independent transactions).
- **Transfer fee:** inter-account transfers often incur a transaction fee. The transfer form must support an optional fee amount (fixed or percentage), which is deducted automatically from the source account (and recorded as its own fee entry/sub-transaction for reporting/audit purposes) separate from the transferred amount itself.

### 6.2 Debt / Receivable (Hutang / Piutang)

- Support a dedicated transaction type for debt (money owed by the user) and receivable (money owed to the user).
- Recording a debt/receivable transaction, and later recording its (partial or full) repayment, must automatically adjust the relevant account balance and the outstanding debt/receivable amount, with a running status (e.g. open / partially paid / settled) per debt/receivable record.

### 6.3 Recurring bank account fees

- Bank-type accounts commonly carry a **monthly administrative fee**. Support configuring a recurring monthly fee per bank account, which is automatically posted as a transaction on a scheduled date each month (with the ability to edit/skip/cancel an individual occurrence).

### 6.4 Recurring transactions (general)

- Beyond bank fees, support generic recurring/scheduled transactions (bills, subscriptions, installments) that auto-generate transactions on their schedule, editable and cancellable per occurrence or as a series.

## 7. Multi-Currency & Live Exchange Rates

- Full multi-currency support, since the user holds a **PayPal account** alongside local bank/cash accounts in a different currency.
- When a transaction involves a currency different from an account's base currency (e.g. PayPal in USD vs. local accounts in IDR), fetch an **up-to-date exchange rate at the moment of the transaction** (via a live FX rate API) and store the rate used with the transaction record for historical accuracy.
- Dashboard and reports should be able to show totals normalized to a single base/reporting currency, while preserving each transaction's original currency and the rate applied.
- Handle offline gracefully: if no live rate is available, fall back to the most recent cached rate and flag the transaction for later rate reconciliation if needed.

## 8. Document/Invoice Reading (OCR)

- Ability to read and extract transaction data from **invoices, receipts, and similar documents** in **image** and **PDF** formats (and similar), using OCR plus structured data extraction (amount, date, merchant/category hints, etc.).
- After extraction, present the parsed result to the user for quick confirmation/correction before saving as a transaction.
- Detect likely **duplicate submissions** (e.g. the same receipt photographed/uploaded twice) and warn the user before creating a duplicate transaction.

## 9. Alternative Input Channel: Telegram

- Input does not have to go through the smartphone/PC app UI — must also support a **Telegram bot** integration.
- The Telegram bot must accept **text, images, documents, and any other suitable message type** as transaction input, processed through the same parsing/OCR/AI pipeline as in-app input, then synced into the same data store.

## 10. Flexible / Unstructured Input Processing

- Input is **not required to follow a rigid/fixed format** — the system must be able to interpret free-form text, images, and documents (e.g. a casual message like "lunch 25k cash" or a messy photographed receipt) and still correctly extract transaction fields, asking the user for clarification only when genuinely ambiguous.

## 11. AI Features

- Provide an AI layer for processing/understanding input data (text, image, document, free-form input as above) and for financial insights.
- Support **two AI modes**:

1. **Cloud AI via API key** (user-supplied key to an LLM provider) — the primary mode for now, used for parsing, OCR post-processing, financial advice, and summaries.
2. **Offline/local LLM** — keep this as an **architected-for-the-future** option, not required in the first build. The user plans to self-host a local LLM later on a capable PC/server; design the AI integration layer so a local model can be plugged in later (e.g. via a swappable AI-provider interface) without major rework. On low-spec devices today, the app should default to the API-key mode (or work without AI at all) rather than attempting local inference.

- **Privacy control:** AI processing of personal financial data must be **opt-in and explicit** — no data should be sent to any third-party LLM/API unless the user has actively enabled the AI feature and configured it.

## 12. AI as Financial Advisor

- Beyond parsing, the AI should act as a **proactive financial advisor**:
- A chat/message interface where the user can ask questions about their finances.
- Proactive **notifications/alerts** — e.g. unusual or unusually large spending, approaching/exceeding a budget limit, upcoming recurring bills, low account balance, automatic weekly/monthly financial summaries, and general saving/spending suggestions based on actual transaction history.

## 13. Dashboard & Analytics

- A **visually polished, data-analyst-quality dashboard** — this must look and function like the output of a skilled data analyst, and this bar must be met **even without AI** (i.e. good data visualization is a core requirement on its own, not an AI feature).
- Should include, at minimum: balance trends over time, income vs. expense breakdowns, spending by category, spending by account, budget-vs-actual, and custom date-range reports.

## 14. Export & Import

- Support exporting and importing the full bookkeeping data in **any reasonable, widely supported file format** the user may need (e.g. CSV, Excel/XLSX, JSON, PDF report). Propose the most appropriate formats for each use case (raw data interchange vs. human-readable report).
- Custom report export by date range, category, and/or account; keep this flexible enough to be useful for basic tax/bookkeeping purposes.

## 15. Security & Privacy

- App lock via **PIN and/or biometric authentication**, since this holds sensitive financial data.
- **Encryption** for data at rest on-device and for all backups (local and Google Drive).
- Clear, explicit user consent before any data is sent to a third-party AI/LLM API.

## 16. Performance Constraints

- The application must remain responsive and fully functional on **low-spec devices** — minimize memory/CPU usage, avoid unnecessary background processes, and keep the initial load lightweight.

## 17. Deliverable Expectations

Before implementation, propose: (a) the recommended tech stack and overall architecture with justification against the constraints above, (b) the data model (transactions, accounts, categories, debts/receivables, recurring rules, FX rates, audit log), (c) the sync/conflict-resolution design in detail, and (d) a phased build plan (e.g. core ledger + CRUD first, then sync/backup, then OCR/Telegram/AI, then advisor features), so the user can review and approve the plan before full build-out begins.
