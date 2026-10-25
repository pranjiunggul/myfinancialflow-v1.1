/**
 * Deterministic Offline Intelligence Engine (Tier-1 Upgrade)
 * Fully functional without any AI API key, internet connection, or local LLM.
 *
 * Capabilities:
 * 1. Natural Language Transaction Logging with Debt/Receivable Disambiguation
 * 2. Natural Language Transaction Search & Filtering Grounded in Dexie DB
 * 3. Exact Financial Aggregation & Visual Reports (Cash Flow, Budgets, Balances)
 * 4. Rule-Based Financial Health & Anomaly Evaluation
 */

import { db } from '../../db/database';
import { getOfflineDictionaries } from './dictionaries';
import { normalizeAndExtractEntities } from './normalizer';
import { getMonthlyCashFlow, getCategorySpendingDistribution, getBudgetPerformance } from '../analytics';
import type { Account, Category, CurrencyCode, ActionProposal } from '../../types';

export interface OfflineIntelligenceResult {
  replyText: string;
  proposals: ActionProposal[];
  chartView?: 'net_worth' | 'cash_flow' | 'category_donut' | 'budget_performance';
}

/**
 * Main offline processor dispatching user text to deterministic handlers
 */
export async function runOfflineIntelligence(
  userText: string,
  context: {
    accounts: Account[];
    categories: Category[];
    baseCurrency: CurrencyCode;
  }
): Promise<OfflineIntelligenceResult> {
  const dict = await getOfflineDictionaries();
  const clean = userText.trim().toLowerCase();

  // 1. Check for Rule-Based Financial Insights / Health Evaluation Query
  if (
    /\b(?:evaluasi|analisis|analisa|insight|kesehatan\s*keuangan|apakah\s*saya\s*boros|rekomendasi\s*keuangan)\b/i.test(
      clean
    )
  ) {
    return handleOfflineFinancialEvaluation(clean, context);
  }

  // 2. Check for Natural Language Reports & Aggregations
  // 2a. Category Spending Query (e.g. "berapa pengeluaran makan bulan ini")
  if (
    /\b(?:berapa|total|jumlah|brapa)\b/i.test(clean) &&
    /\b(?:makan|food|bensin|transport|belanja|shopping|listrik|tagihan|bills|obat|kesehatan)\b/i.test(clean)
  ) {
    return handleCategorySpendingQuery(clean, context, dict);
  }

  // 2b. Cash Flow Report (e.g. "rekap arus kas", "laporan bulan ini", "cash flow")
  if (/\b(?:arus\s*kas|cash\s*flow|rekap\s*bulan\s*ini|laporan\s*keuangan)\b/i.test(clean)) {
    return handleCashFlowReport(clean, context);
  }

  // 2c. Budget Status (e.g. "cek budget", "sisa anggaran", "status budget")
  if (/\b(?:budget|anggaran|sisa\s*anggaran|cek\s*budget)\b/i.test(clean)) {
    return handleBudgetStatusReport(clean, context);
  }

  // 2d. Account Balances (e.g. "sisa saldo", "saldo bca", "cek saldo")
  if (/\b(?:saldo|isi\s*rekening|sisa\s*uang)\b/i.test(clean)) {
    return handleAccountBalancesReport(clean, context);
  }

  // 2e. Debts & Receivables Summary (e.g. "ada hutang apa aja", "siapa yg ngutang", "rekap hutang piutang")
  if (/\b(?:hutang\s*apa|piutang\s*apa|siapa\s*ngutang|daftar\s*hutang|status\s*hutang)\b/i.test(clean)) {
    return handleDebtReceivableSummary(clean, context);
  }

  // 3. Check for Natural Search Queries Grounded in Dexie
  // e.g. "cari transaksi kopi bca", "daftar belanja minggu ini", "transaksi kemarin"
  if (
    /\b(?:cari|daftar|histori|riwayat|lihat|temukan)\b/i.test(clean) &&
    /\b(?:transaksi|catatan|belanja|makan|pengeluaran|pembayaran)\b/i.test(clean)
  ) {
    return handleTransactionSearchQuery(clean, context, dict);
  }

  // 4. Fallback to Natural Transaction Phrasing Parser (Tier-1 Upgrade)
  const entities = normalizeAndExtractEntities(
    userText,
    context.accounts,
    context.categories,
    context.baseCurrency,
    dict
  );

  if (entities.amount && entities.amount > 0) {
    // Determine transaction type
    let txType: 'expense' | 'income' | 'transfer' | 'debt' | 'receivable' = 'expense';

    if (entities.debtReceivableMeta?.isDebtOrReceivable) {
      txType = entities.debtReceivableMeta.type;
    } else if (/\b(?:gaji|salary|income|bonus|freelance|terima|dapat|cair|masuk)\b/i.test(entities.normalizedText) && !/\b(?:keluar|bayar|beli)\b/i.test(entities.normalizedText)) {
      txType = 'income';
    } else if (/\b(?:transfer|kirim|pindah|trf|tf)\b/i.test(entities.normalizedText)) {
      txType = 'transfer';
    }

    const proposalId = 'prop_offline_' + crypto.randomUUID().slice(0, 8);
    let summaryText = `[Offline Rule Engine] Log ${txType.toUpperCase()} of ${entities.amount.toLocaleString()} ${entities.currency} for "${entities.description}"`;

    if (entities.debtReceivableMeta?.isDebtOrReceivable) {
      const meta = entities.debtReceivableMeta;
      summaryText = `[Offline Rule Engine] ${meta.directionLabel} — ${entities.amount.toLocaleString()} ${entities.currency} (${meta.type === 'debt' ? 'You owe' : 'Owed to you'})`;
    }

    const proposal: ActionProposal = {
      id: proposalId,
      type: 'create',
      status: 'pending',
      summary: summaryText,
      data: {
        type: txType,
        amount: entities.amount,
        currency: entities.currency,
        description: entities.description,
        accountId: entities.matchedAccount?.id,
        accountName: entities.matchedAccount?.name,
        categoryId: entities.matchedCategory?.id,
        categoryName: entities.matchedCategory?.name,
        date: entities.date,
        personName: entities.debtReceivableMeta?.counterpartyName,
        debtReceivableMeta: entities.debtReceivableMeta,
      },
      createdAt: Date.now(),
    };

    let reply = `I identified a new transaction from your input. Please review the proposal below and click **Confirm & Execute** to commit it to your ledger.`;
    if (entities.debtReceivableMeta?.isDebtOrReceivable) {
      reply = `I detected a ${entities.debtReceivableMeta.type.toUpperCase()} transaction involving **${entities.debtReceivableMeta.counterpartyName}**.\n\n` +
        `**${entities.debtReceivableMeta.directionLabel}**\n` +
        `_${entities.debtReceivableMeta.directionExplanation}_\n\n` +
        `Please verify the direction on the card below before confirming.`;
    }

    return {
      replyText: reply,
      proposals: [proposal],
    };
  }

  // Generic Offline Help Guide
  return {
    replyText:
      `You are in **Offline Intelligence Mode** (no AI API key needed).\n\n` +
      `Here is what you can ask purely offline:\n` +
      `• **Log transactions**: _"beli bensin gocap cash"_, _"kopi kenangan pekgo pke bca"_, _"gaji sejt masuk bca td pagi"_\n` +
      `• **Debt & loans**: _"aku pinjem budi 50k"_ (Debt) or _"pinjemin budi ceban"_ (Receivable)\n` +
      `• **Spending queries**: _"berapa pengeluaran makan bulan ini"_, _"sisa saldo bca"_\n` +
      `• **Reports**: _"rekap arus kas"_, _"cek budget"_, _"status hutang piutang"_\n` +
      `• **Financial evaluation**: _"evaluasi keuangan saya"_ to run rule-based financial health checks.`,
    proposals: [],
  };
}

/**
 * Handle category spending query (e.g. "berapa pengeluaran makan bulan ini")
 */
async function handleCategorySpendingQuery(
  clean: string,
  context: { accounts: Account[]; categories: Category[]; baseCurrency: CurrencyCode },
  _dict: any
): Promise<OfflineIntelligenceResult> {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const txs = await db.transactions
    .filter((t) => !t.isDeleted && t.type === 'expense' && t.date.startsWith(currentMonth))
    .toArray();

  let targetCat = context.categories[0];
  if (/\b(?:makan|food|kuliner|kopi|cafe|resto)\b/i.test(clean)) {
    targetCat = context.categories.find((c) => c.id === 'cat_food') || targetCat;
  } else if (/\b(?:bensin|transport|bbm|pertamax|ojol|grab|gojek)\b/i.test(clean)) {
    targetCat = context.categories.find((c) => c.id === 'cat_transport') || targetCat;
  } else if (/\b(?:belanja|shopping|baju|sepatu|tokopedia|shopee)\b/i.test(clean)) {
    targetCat = context.categories.find((c) => c.id === 'cat_shopping') || targetCat;
  } else if (/\b(?:listrik|tagihan|bills|pln|pdam|wifi|pulsa)\b/i.test(clean)) {
    targetCat = context.categories.find((c) => c.id === 'cat_bills') || targetCat;
  } else if (/\b(?:obat|kesehatan|health|dokter|apotek)\b/i.test(clean)) {
    targetCat = context.categories.find((c) => c.id === 'cat_health') || targetCat;
  }

  const matchingTxs = txs.filter((t) => t.categoryId === targetCat.id);
  const totalSpent = matchingTxs.reduce((sum, t) => sum + (t.baseAmount || t.amount), 0);

  return {
    replyText:
      `📊 **Rekap Pengeluaran ${targetCat.name} (${currentMonth})**\n\n` +
      `• **Total Belanja**: **${totalSpent.toLocaleString()} ${context.baseCurrency}**\n` +
      `• **Jumlah Transaksi**: ${matchingTxs.length} kali\n` +
      `• **Rata-rata per Transaksi**: ${matchingTxs.length > 0 ? Math.round(totalSpent / matchingTxs.length).toLocaleString() : 0} ${context.baseCurrency}\n\n` +
      (matchingTxs.length > 0
        ? `Transaksi terakhir: _"${matchingTxs[matchingTxs.length - 1].description}" (${matchingTxs[matchingTxs.length - 1].amount.toLocaleString()} ${matchingTxs[matchingTxs.length - 1].currency})_`
        : `Belum ada pengeluaran pada kategori ini bulan ini.`),
    proposals: [],
    chartView: 'category_donut',
  };
}

/**
 * Handle cash flow summary report
 */
async function handleCashFlowReport(
  _clean: string,
  context: { accounts: Account[]; categories: Category[]; baseCurrency: CurrencyCode }
): Promise<OfflineIntelligenceResult> {
  const [transactions] = await Promise.all([
    db.transactions.filter((t) => !t.isDeleted).toArray(),
  ]);

  const cashFlows = getMonthlyCashFlow(transactions, 6);
  const currentMonth = cashFlows[cashFlows.length - 1];

  if (!currentMonth) {
    return {
      replyText: `Belum ada data transaksi yang cukup untuk menyusun rekap arus kas.`,
      proposals: [],
    };
  }

  const savingsRateText = currentMonth.savingsRate >= 20 ? '✅ Sangat Sehat (≥20%)' : '⚠️ Perlu Penghematan (<20%)';

  return {
    replyText:
      `📈 **Laporan Arus Kas (${currentMonth.month})**\n\n` +
      `• **Pemasukan (Inflow)**: +${currentMonth.income.toLocaleString()} ${context.baseCurrency}\n` +
      `• **Pengeluaran (Outflow)**: -${currentMonth.expense.toLocaleString()} ${context.baseCurrency}\n` +
      `• **Net Cash Flow**: **${currentMonth.net >= 0 ? '+' : ''}${currentMonth.net.toLocaleString()} ${context.baseCurrency}**\n` +
      `• **Savings Rate**: **${currentMonth.savingsRate}%** (${savingsRateText})\n\n` +
      `Grafik perbandingan 6 bulan terakhir ditampilkan di bawah.`,
    proposals: [],
    chartView: 'cash_flow',
  };
}

/**
 * Handle budget status report
 */
async function handleBudgetStatusReport(
  _clean: string,
  context: { accounts: Account[]; categories: Category[]; baseCurrency: CurrencyCode }
): Promise<OfflineIntelligenceResult> {
  const [transactions, categories] = await Promise.all([
    db.transactions.filter((t) => !t.isDeleted).toArray(),
    db.categories.filter((c) => !c.isDeleted).toArray(),
  ]);

  const budgets = getBudgetPerformance(transactions, categories, context.baseCurrency);
  if (budgets.length === 0) {
    return {
      replyText: `Belum ada kategori dengan batas anggaran bulanan yang disetel. Anda dapat mengaturnya di tab **Categories & Budgets**.`,
      proposals: [],
    };
  }

  const lines = budgets.map((b) => {
    const statusIcon = b.status === 'over_budget' ? '🚨' : b.status === 'warning' ? '⚠️' : '✅';
    return `• ${statusIcon} **${b.name}**: ${b.actualSpent.toLocaleString()} / ${b.budget.toLocaleString()} ${context.baseCurrency} (${b.percentUsed}%)`;
  });

  return {
    replyText:
      `🎯 **Status Anggaran Bulanan (${budgets.length} Kategori)**\n\n` +
      lines.join('\n') +
      `\n\nDetail progress bar visual ditampilkan di bawah.`,
    proposals: [],
    chartView: 'budget_performance',
  };
}

/**
 * Handle account balances report
 */
async function handleAccountBalancesReport(
  _clean: string,
  context: { accounts: Account[]; categories: Category[]; baseCurrency: CurrencyCode }
): Promise<OfflineIntelligenceResult> {
  const accounts = await db.accounts.filter((a) => !a.isDeleted).toArray();
  const activeAccounts = accounts.filter((a) => a.includeInNetWorth);
  const totalBalance = activeAccounts.reduce((sum, a) => sum + (a.currency === context.baseCurrency ? a.currentBalance : a.currentBalance), 0);

  const lines = accounts.map(
    (a) => `• **${a.name}** (${a.type}): **${a.currentBalance.toLocaleString()} ${a.currency}**`
  );

  return {
    replyText:
      `💳 **Informasi Saldo Rekening & Dompet**\n\n` +
      lines.join('\n') +
      `\n\n• **Total Saldo Aktif**: **${totalBalance.toLocaleString()} ${context.baseCurrency}**`,
    proposals: [],
  };
}

/**
 * Handle debts and receivables summary
 */
async function handleDebtReceivableSummary(
  _clean: string,
  context: { accounts: Account[]; categories: Category[]; baseCurrency: CurrencyCode }
): Promise<OfflineIntelligenceResult> {
  const debts = await db.debts_receivables.filter((d) => !d.isDeleted && d.status !== 'settled').toArray();

  if (debts.length === 0) {
    return {
      replyText: `🎉 **Bebas Hutang**: Tidak ada catatan hutang maupun piutang aktif yang belum lunas.`,
      proposals: [],
    };
  }

  const myDebts = debts.filter((d) => d.type === 'debt');
  const myReceivables = debts.filter((d) => d.type === 'receivable');

  const totalDebt = myDebts.reduce((sum, d) => sum + d.currentBalance, 0);
  const totalReceivable = myReceivables.reduce((sum, d) => sum + d.currentBalance, 0);

  const debtLines = myDebts.map(
    (d) => `  - Hutang ke **${d.personName}**: ${d.currentBalance.toLocaleString()} ${d.currency} (Jatuh tempo: ${d.dueDate || 'Belum diatur'})`
  );

  const recLines = myReceivables.map(
    (d) => `  - Piutang di **${d.personName}**: ${d.currentBalance.toLocaleString()} ${d.currency} (Jatuh tempo: ${d.dueDate || 'Belum diatur'})`
  );

  return {
    replyText:
      `📑 **Rekap Hutang & Piutang Aktif**\n\n` +
      `💳 **Hutang Anda (Harus Dibayar)**: Total **${totalDebt.toLocaleString()} ${context.baseCurrency}**\n` +
      (debtLines.length > 0 ? debtLines.join('\n') + '\n\n' : '  - Tidak ada hutang.\n\n') +
      `🤝 **Piutang Anda (Harus Ditagih)**: Total **${totalReceivable.toLocaleString()} ${context.baseCurrency}**\n` +
      (recLines.length > 0 ? recLines.join('\n') : '  - Tidak ada piutang.'),
    proposals: [],
  };
}

/**
 * Handle transaction search query
 */
async function handleTransactionSearchQuery(
  clean: string,
  _context: { accounts: Account[]; categories: Category[]; baseCurrency: CurrencyCode },
  _dict: any
): Promise<OfflineIntelligenceResult> {
  const txs = await db.transactions.filter((t) => !t.isDeleted).reverse().sortBy('timestamp');

  // Filter by keywords
  let filtered = txs;
  if (/\bbca\b/i.test(clean)) filtered = filtered.filter((t) => t.accountId === 'acc_bank_bca');
  if (/\bcash|tunai\b/i.test(clean)) filtered = filtered.filter((t) => t.accountId === 'acc_cash');
  if (/\bmakan|kopi|food\b/i.test(clean)) filtered = filtered.filter((t) => t.categoryId === 'cat_food');
  if (/\btransport|bensin\b/i.test(clean)) filtered = filtered.filter((t) => t.categoryId === 'cat_transport');
  if (/\bbelanja|shopping\b/i.test(clean)) filtered = filtered.filter((t) => t.categoryId === 'cat_shopping');

  // Filter by amount threshold (e.g. "di atas 100rb")
  const aboveMatch = clean.match(/di\s*atas\s*(\d+(?:[.,]\d+)?)\s*(k|rb|ribu|jt)?/i);
  if (aboveMatch) {
    let minVal = parseFloat(aboveMatch[1].replace(',', '.'));
    if (aboveMatch[2]?.toLowerCase() === 'k' || aboveMatch[2]?.toLowerCase() === 'rb') minVal *= 1000;
    else if (aboveMatch[2]?.toLowerCase() === 'jt') minVal *= 1000000;
    filtered = filtered.filter((t) => (t.baseAmount || t.amount) >= minVal);
  }

  const results = filtered.slice(0, 5);
  if (results.length === 0) {
    return {
      replyText: `Tidak ditemukan transaksi yang cocok dengan kriteria pencarian offline Anda.`,
      proposals: [],
    };
  }

  const listItems = results.map(
    (t) => `• **${t.date}**: ${t.description} — **${t.amount.toLocaleString()} ${t.currency}**`
  );

  return {
    replyText:
      `🔍 **Ditemukan ${filtered.length} Transaksi Terkait** (Menampilkan 5 terbaru):\n\n` +
      listItems.join('\n'),
    proposals: [],
  };
}

/**
 * Handle offline rule-based financial evaluation & advisory
 */
async function handleOfflineFinancialEvaluation(
  _clean: string,
  context: { accounts: Account[]; categories: Category[]; baseCurrency: CurrencyCode }
): Promise<OfflineIntelligenceResult> {
  const [transactions, categories, debts] = await Promise.all([
    db.transactions.filter((t) => !t.isDeleted).toArray(),
    db.categories.filter((c) => !c.isDeleted).toArray(),
    db.debts_receivables.filter((d) => !d.isDeleted && d.status !== 'settled').toArray(),
  ]);

  const currentMonthStr = new Date().toISOString().slice(0, 7);
  const monthlyCashFlows = getMonthlyCashFlow(transactions, 1);
  const currentFlow = monthlyCashFlows[0] || { income: 0, expense: 0, net: 0, savingsRate: 0 };

  const currentMonthTxs = transactions.filter((t) => t.date.startsWith(currentMonthStr) && t.type === 'expense');
  const catShares = getCategorySpendingDistribution(currentMonthTxs, categories, context.baseCurrency);

  const findings: string[] = [];

  // Finding 1: Savings Rate Health
  if (currentFlow.income > 0) {
    if (currentFlow.savingsRate >= 30) {
      findings.push(`🌟 **Tingkat Tabungan Sangat Bagus**: Savings rate Anda mencapai **${currentFlow.savingsRate}%**, jauh di atas batas ideal 20%.`);
    } else if (currentFlow.savingsRate >= 15) {
      findings.push(`👍 **Tingkat Tabungan Cukup Sehat**: Savings rate Anda berada pada **${currentFlow.savingsRate}%** (target ideal ≥20%).`);
    } else {
      findings.push(`⚠️ **Peringatan Tabungan Tipis**: Savings rate Anda hanya **${currentFlow.savingsRate}%**. Disarankan memangkas pos pengeluaran diskresioner.`);
    }
  }

  // Finding 2: Category Concentration Risk (>35% of total expense in one category)
  if (catShares.length > 0 && catShares[0].percentage >= 35) {
    findings.push(`📊 **Konsentrasi Pengeluaran**: Pos **${catShares[0].name}** mendominasi **${catShares[0].percentage}%** dari seluruh pengeluaran bulan ini (${catShares[0].total.toLocaleString()} ${context.baseCurrency}).`);
  }

  // Finding 3: Month-End Burn Rate Projection
  const today = new Date();
  const daysPassed = today.getDate() || 1;
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const dailyBurn = currentFlow.expense / daysPassed;
  const projectedTotal = Math.round(dailyBurn * daysInMonth);

  findings.push(`🔥 **Burn Rate Harian**: Anda menghabiskan rata-rata **${Math.round(dailyBurn).toLocaleString()} ${context.baseCurrency}/hari**. Proyeksi pengeluaran hingga akhir bulan: **${projectedTotal.toLocaleString()} ${context.baseCurrency}**.`);

  // Finding 4: Outstanding Liabilities
  const activeDebts = debts.filter((d) => d.type === 'debt');
  if (activeDebts.length > 0) {
    const totalDebtBal = activeDebts.reduce((sum, d) => sum + d.currentBalance, 0);
    findings.push(`💳 **Kewajiban Hutang**: Anda memiliki ${activeDebts.length} hutang aktif senilai **${totalDebtBal.toLocaleString()} ${context.baseCurrency}**. Prioritaskan pelunasan untuk menghindari bunga/denda.`);
  }

  return {
    replyText:
      `🩺 **Evaluasi Kesehatan Finansial (Offline Rule Engine)**\n\n` +
      findings.join('\n\n') +
      `\n\n_Evaluasi ini disusun secara lokal dan deterministik tanpa menggunakan LLM atau pengiriman data keluar._`,
    proposals: [],
    chartView: 'cash_flow',
  };
}
