/**
 * Unified AI Assistant & Function Calling Engine for FinanceFlow
 * Supports:
 * 1. Data input via natural language
 * 2. Data manipulation (edit, reclassify, delete) via chat
 * 3. Grounded transaction search & history Q&A
 * 4. Financial reports & summaries
 * 5. Advisory & spending evaluation
 * 6. Zero-write safety gate: Mutating actions require explicit user confirmation.
 * Multi-provider: Gemini, OpenAI, and Ollama (with structured fallback) + Offline Regex Parser.
 */

import { db } from '../db/database';
import {
  createTransaction,
  updateTransaction,
  softDeleteTransaction,
} from './ledger';
import { attachReceiptToTransaction } from './receiptAttachments';
import { createDebtReceivable } from './debt';
import { getMonthlyCashFlow, getCategorySpendingDistribution, getBudgetPerformance } from './analytics';
import {
  getFastPathTarget,
  checkProviderHealth,
  recordHealthResult,
  revealApiKey,
  getCachedHealth,
} from './aiHealth';
import {
  isProviderCapExceeded,
  recordEstimatedProviderUsage,
} from './aiPricing';
import type {
  Account,
  Category,
  CurrencyCode,
  ActionProposal,
  ChatMessage,
  AppSettings,
  TransferMeta,
  AIProviderConfig,
  AIKeyRecord,
  AIPriorityItem,
} from '../types';

export const AI_SYSTEM_PROMPT = `You are MyFinancialFlow Assistant, an intelligent personal finance copilot.
You have direct access to internal financial tools to search, analyze, and manage the user's financial ledger.
RULES:
1. Always ground your answers in the user's actual stored data using available tools.
2. When the user asks to record, add, log, edit, change, or delete transactions, call the appropriate proposal tool (createTransactionProposal, editTransactionProposal, deleteTransactionProposal).
3. Do NOT claim a transaction has already been permanently saved or deleted. Instead, tell the user you have prepared the action for their review and confirmation.
4. For reporting and analysis, call getFinancialSummary, getBudgetStatus, getAccountsAndBalances, or getDebtsOverview to provide precise numbers and insights.
5. Be concise, friendly, and financially prudent. Support English and Bahasa Indonesia seamlessly.

BAHASA INDONESIA & SLANG UNDERSTANDING:
- Understand both standard formal Indonesian (Bahasa Baku) and colloquial Indonesian (Bahasa Non-Baku / gaul).
- Common abbreviations: "yg" (yang), "gak"/"ga"/"nggak" (tidak), "udh" (sudah), "blm" (belum), "bgt" (banget), "duit" (uang).
- Monetary slang numbers:
  * "seceng" = 1,000
  * "goceng" = 5,000
  * "ceban" = 10,000
  * "noban" = 20,000
  * "gocap" = 50,000
  * "cepek" or "cepek ceng" = 100,000 (default 100,000 IDR for everyday transactions)
  * "sejuta" or "sejt" = 1,000,000
  * "k" or "rb" or "ribu" = 1,000
  * "jt" or "juta" = 1,000,000
- Prepositions & verbs: "pake"/"pakai" (using account/method), "abis"/"habis" (spent / after), "buat"/"untuk" (purpose/category), "kemaren"/"kemarin" (yesterday), "tadi"/"hari ini" (today).
- Code-switching: Comfortably parse mixed English-Indonesian sentences (e.g. "abis makan di cafe 50rb pake gopay").
- When answering queries in Indonesian, respond naturally in helpful, clear Indonesian.`;

/**
 * Internal App Tools Schema Definitions
 */
export const APP_TOOLS_DECLARATIONS = [
  {
    name: 'searchTransactions',
    description: 'Search past transactions by keyword, date range, account, or amount.',
    parameters: {
      type: 'OBJECT',
      properties: {
        keyword: { type: 'STRING', description: 'Search term matching description or notes' },
        categoryName: { type: 'STRING', description: 'Name of the category to filter by' },
        accountName: { type: 'STRING', description: 'Name of the account to filter by' },
        startDate: { type: 'STRING', description: 'Start date in YYYY-MM-DD' },
        endDate: { type: 'STRING', description: 'End date in YYYY-MM-DD' },
        limit: { type: 'NUMBER', description: 'Max number of results to return (default 10)' },
      },
    },
  },
  {
    name: 'createTransactionProposal',
    description: 'Propose a new transaction (expense, income, or transfer) for user confirmation.',
    parameters: {
      type: 'OBJECT',
      properties: {
        type: { type: 'STRING', enum: ['expense', 'income', 'transfer'], description: 'Type of transaction' },
        amount: { type: 'NUMBER', description: 'Transaction amount (numeric)' },
        currency: { type: 'STRING', description: 'Currency code e.g. IDR, USD' },
        description: { type: 'STRING', description: 'Description or purpose' },
        date: { type: 'STRING', description: 'Date in YYYY-MM-DD (defaults to today)' },
        accountName: { type: 'STRING', description: 'Account name (e.g. Bank BCA, Cash Wallet, PayPal)' },
        categoryName: { type: 'STRING', description: 'Category name (e.g. Food & Dining, Transportation)' },
        toAccountName: { type: 'STRING', description: 'Destination account if transfer' },
        feeAmount: { type: 'NUMBER', description: 'Transfer fee if applicable' },
      },
      required: ['type', 'amount', 'description'],
    },
  },
  {
    name: 'editTransactionProposal',
    description: 'Propose updating an existing transaction (amount, description, category, date).',
    parameters: {
      type: 'OBJECT',
      properties: {
        transactionId: { type: 'STRING', description: 'ID of transaction to edit' },
        amount: { type: 'NUMBER', description: 'New amount' },
        description: { type: 'STRING', description: 'New description' },
        categoryName: { type: 'STRING', description: 'New category name' },
        accountName: { type: 'STRING', description: 'New account name' },
        date: { type: 'STRING', description: 'New date in YYYY-MM-DD' },
      },
      required: ['transactionId'],
    },
  },
  {
    name: 'deleteTransactionProposal',
    description: 'Propose soft-deleting a transaction for user confirmation.',
    parameters: {
      type: 'OBJECT',
      properties: {
        transactionId: { type: 'STRING', description: 'ID of transaction to delete' },
        reason: { type: 'STRING', description: 'Reason for deletion' },
      },
      required: ['transactionId'],
    },
  },
  {
    name: 'getFinancialSummary',
    description: 'Retrieve monthly income, expense, net savings, and category distribution.',
    parameters: {
      type: 'OBJECT',
      properties: {
        month: { type: 'STRING', description: 'Target month in YYYY-MM (e.g. 2026-10)' },
      },
    },
  },
  {
    name: 'getBudgetStatus',
    description: 'Retrieve current budget vs actual spending for all budgeted categories.',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'getAccountsAndBalances',
    description: 'Retrieve all user accounts and their current balances.',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'getDebtsOverview',
    description: 'Retrieve outstanding debts (borrowed) and receivables (lent) with balances.',
    parameters: { type: 'OBJECT', properties: {} },
  },
];

/**
 * Execute an internal tool function against Dexie DB
 */
export async function executeInternalTool(
  toolName: string,
  args: any,
  context: {
    accounts: Account[];
    categories: Category[];
    baseCurrency: CurrencyCode;
  }
): Promise<{ result: any; proposal?: ActionProposal }> {
  const { accounts, categories, baseCurrency } = context;

  switch (toolName) {
    case 'searchTransactions': {
      let txs = await db.transactions.filter((t) => !t.isDeleted).toArray();

      if (args.keyword) {
        const kw = args.keyword.toLowerCase();
        txs = txs.filter((t) => t.description.toLowerCase().includes(kw));
      }
      if (args.startDate) {
        txs = txs.filter((t) => t.date >= args.startDate);
      }
      if (args.endDate) {
        txs = txs.filter((t) => t.date <= args.endDate);
      }
      if (args.categoryName) {
        const cat = categories.find((c) => c.name.toLowerCase().includes(args.categoryName.toLowerCase()));
        if (cat) txs = txs.filter((t) => t.categoryId === cat.id);
      }
      if (args.accountName) {
        const acc = accounts.find((a) => a.name.toLowerCase().includes(args.accountName.toLowerCase()));
        if (acc) txs = txs.filter((t) => t.accountId === acc.id);
      }

      const limit = args.limit || 10;
      const sorted = txs.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);

      const formatted = sorted.map((t) => ({
        id: t.id,
        date: t.date,
        type: t.type,
        amount: t.amount,
        currency: t.currency,
        description: t.description,
        account: accounts.find((a) => a.id === t.accountId)?.name || 'Unknown Account',
        category: categories.find((c) => c.id === t.categoryId)?.name || 'Uncategorized',
      }));

      return { result: { count: formatted.length, transactions: formatted } };
    }

    case 'createTransactionProposal': {
      // Find matching account or fallback to first
      let matchedAcc = accounts.find(
        (a) => args.accountName && a.name.toLowerCase().includes(args.accountName.toLowerCase())
      ) || accounts[0];

      // Find matching category or fallback
      let matchedCat = categories.find(
        (c) => args.categoryName && c.name.toLowerCase().includes(args.categoryName.toLowerCase())
      ) || categories.find((c) => c.id === 'cat_food') || categories[0];

      let transferMeta: TransferMeta | undefined;
      if (args.type === 'transfer') {
        const toAcc = accounts.find((a) => args.toAccountName && a.name.toLowerCase().includes(args.toAccountName.toLowerCase())) || accounts[1] || accounts[0];
        transferMeta = {
          toAccountId: toAcc.id,
          toAmount: Number(args.amount),
          toCurrency: toAcc.currency,
          feeAmount: args.feeAmount ? Number(args.feeAmount) : 0,
        };
      }

      const proposal: ActionProposal = {
        id: 'prop_' + crypto.randomUUID().slice(0, 8),
        type: 'create',
        status: 'pending',
        summary: `Create ${args.type || 'expense'} of ${args.amount} ${args.currency || matchedAcc?.currency || baseCurrency} for "${args.description}"`,
        data: {
          type: args.type || 'expense',
          amount: Number(args.amount),
          currency: args.currency || matchedAcc?.currency || baseCurrency,
          description: args.description,
          accountId: matchedAcc?.id,
          accountName: matchedAcc?.name,
          categoryId: matchedCat?.id,
          categoryName: matchedCat?.name,
          date: args.date || new Date().toISOString().split('T')[0],
          transferMeta,
        },
        createdAt: Date.now(),
      };

      return {
        result: {
          status: 'proposal_ready',
          message: 'Transaction proposal prepared. Awaiting user confirmation.',
          proposalId: proposal.id,
          details: proposal.summary,
        },
        proposal,
      };
    }

    case 'editTransactionProposal': {
      const existing = await db.transactions.get(args.transactionId);
      if (!existing) {
        return { result: { error: `Transaction with ID ${args.transactionId} not found.` } };
      }

      const updates: any = { id: existing.id };
      if (args.amount) updates.amount = Number(args.amount);
      if (args.description) updates.description = args.description;
      if (args.date) updates.date = args.date;
      if (args.categoryName) {
        const cat = categories.find((c) => c.name.toLowerCase().includes(args.categoryName.toLowerCase()));
        if (cat) {
          updates.categoryId = cat.id;
          updates.categoryName = cat.name;
        }
      }
      if (args.accountName) {
        const acc = accounts.find((a) => a.name.toLowerCase().includes(args.accountName.toLowerCase()));
        if (acc) {
          updates.accountId = acc.id;
          updates.accountName = acc.name;
        }
      }

      const proposal: ActionProposal = {
        id: 'prop_' + crypto.randomUUID().slice(0, 8),
        type: 'edit',
        status: 'pending',
        summary: `Edit transaction "${existing.description}": change to ${updates.amount || existing.amount} (${updates.description || existing.description})`,
        data: updates,
        beforeSnapshot: existing,
        createdAt: Date.now(),
      };

      return {
        result: {
          status: 'proposal_ready',
          message: 'Edit proposal prepared. Awaiting user confirmation.',
          proposalId: proposal.id,
        },
        proposal,
      };
    }

    case 'deleteTransactionProposal': {
      const existing = await db.transactions.get(args.transactionId);
      if (!existing) {
        return { result: { error: `Transaction with ID ${args.transactionId} not found.` } };
      }

      const proposal: ActionProposal = {
        id: 'prop_' + crypto.randomUUID().slice(0, 8),
        type: 'delete',
        status: 'pending',
        summary: `Delete transaction "${existing.description}" for ${existing.amount} ${existing.currency}`,
        data: { id: existing.id },
        beforeSnapshot: existing,
        createdAt: Date.now(),
      };

      return {
        result: {
          status: 'proposal_ready',
          message: 'Deletion proposal prepared. Awaiting user confirmation.',
          proposalId: proposal.id,
        },
        proposal,
      };
    }

    case 'getFinancialSummary': {
      const allTxs = await db.transactions.filter((t) => !t.isDeleted).toArray();
      const cashFlow = getMonthlyCashFlow(allTxs, 6);
      const categoryShares = getCategorySpendingDistribution(allTxs, categories, args.month);

      const latestMonth = cashFlow.length > 0 ? cashFlow[cashFlow.length - 1] : null;

      return {
        result: {
          baseCurrency,
          currentMonth: latestMonth,
          topSpendingCategories: categoryShares.slice(0, 5),
        },
      };
    }

    case 'getBudgetStatus': {
      const allTxs = await db.transactions.filter((t) => !t.isDeleted).toArray();
      const budgets = getBudgetPerformance(allTxs, categories, baseCurrency);

      return {
        result: {
          budgets: budgets.map((b) => ({
            category: b.name,
            spent: b.actualSpent,
            budgetLimit: b.budget,
            percentUsed: `${b.percentUsed}%`,
            status: b.status,
          })),
        },
      };
    }

    case 'getAccountsAndBalances': {
      const accs = accounts.map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        currency: a.currency,
        currentBalance: a.currentBalance,
      }));
      return { result: { accounts: accs } };
    }

    case 'getDebtsOverview': {
      const debts = await db.debts_receivables.filter((d) => !d.isDeleted).toArray();
      return {
        result: {
          debts: debts.map((d) => ({
            id: d.id,
            person: d.personName,
            type: d.type,
            originalAmount: d.originalAmount,
            currentBalance: d.currentBalance,
            currency: d.currency,
            status: d.status,
            dueDate: d.dueDate || 'none',
          })),
        },
      };
    }

    default:
      return { result: { error: `Unknown tool: ${toolName}` } };
  }
}

/**
 * Execute an approved ActionProposal, committing changes to Dexie IndexedDB
 */
export async function executeConfirmedProposal(
  proposal: ActionProposal,
  context: { accounts: Account[]; categories: Category[]; baseCurrency: CurrencyCode }
): Promise<void> {
  if (proposal.status === 'confirmed') return;

  switch (proposal.type) {
    case 'create': {
      const { type, amount, currency, description, accountId, categoryId, date, transferMeta, personName } = proposal.data;
      const numAmount = Number(amount);
      const targetDate = date || new Date().toISOString().split('T')[0];

      if (type === 'debt' || type === 'receivable') {
        await createDebtReceivable({
          type,
          personName: personName || description || 'Friend',
          amount: numAmount,
          currency: currency || context.baseCurrency,
          accountId: accountId || context.accounts[0]?.id || 'acc_cash',
          date: targetDate,
          note: description,
        });
        break;
      }

      const createdTx = await createTransaction({
        type: type || 'expense',
        amount: numAmount,
        currency: currency || context.baseCurrency,
        exchangeRateToBase: 1.0,
        baseAmount: numAmount,
        timestamp: new Date(targetDate).getTime() || Date.now(),
        description: description || 'New transaction',
        accountId: accountId || context.accounts[0]?.id || 'acc_cash',
        categoryId: categoryId || context.categories[0]?.id || 'cat_food',
        date: targetDate,
        inputSource: 'ai',
        transferMeta: transferMeta,
        taxTreatment: proposal.data.taxTreatment,
        grossAmount: proposal.data.grossAmount,
        taxWithheldAmount: proposal.data.taxWithheldAmount,
        taxSourceLabel: proposal.data.taxSourceLabel,
      });

      if (proposal.data.receiptDataUrl && createdTx?.id) {
        try {
          await attachReceiptToTransaction(createdTx.id, proposal.data.receiptDataUrl);
        } catch (rcptErr) {
          console.warn('Failed to attach receipt to transaction:', rcptErr);
        }
      }
      break;
    }

    case 'edit': {
      const { id, type, amount, description, accountId, categoryId, date } = proposal.data;
      if (!id) throw new Error('Missing transaction ID to update.');
      await updateTransaction(id, {
        ...(type ? { type } : {}),
        ...(amount !== undefined ? { amount: Number(amount) } : {}),
        ...(description ? { description } : {}),
        ...(accountId ? { accountId } : {}),
        ...(categoryId ? { categoryId } : {}),
        ...(date ? { date } : {}),
      });
      break;
    }

    case 'delete': {
      if (!proposal.data.id) throw new Error('Missing transaction ID to delete.');
      await softDeleteTransaction(proposal.data.id);
      break;
    }
  }

  proposal.status = 'confirmed';
}

/**
 * Tier 1: Deterministic Offline Free-Form Parser
 * Matches fast text queries without network or AI key needed.
 * e.g. "kopi 35k bca", "makan siang 45rb cash", "salary 12jt bca"
 */
export function parseFreeFormOffline(
  text: string,
  accounts: Account[],
  categories: Category[],
  baseCurrency: CurrencyCode
): ActionProposal | null {
  const clean = text.trim().toLowerCase();
  if (!clean) return null;

  // 1. Detect Relative Dates
  let targetDate = new Date().toISOString().split('T')[0];
  if (/\bkemar[ie]n\b/i.test(clean)) {
    const yesterday = new Date(Date.now() - 86400000);
    targetDate = yesterday.toISOString().split('T')[0];
  } else if (/\b(?:tadi|hari ini|today)\b/i.test(clean)) {
    targetDate = new Date().toISOString().split('T')[0];
  }

  // 2. Extract numeric amount or Indonesian monetary slang
  let baseVal = 0;
  let rawAmountToken = '';

  // Check slang units first (Hokkien-derived Indonesian monetary slang)
  const slangPatterns = [
    { regex: /\b(?:sejuta|sejt|1jt)\b/i, val: 1000000 },
    { regex: /\bsetengah\s*juta\b/i, val: 500000 },
    { regex: /\bcepek\s*ceng\b/i, val: 100000 },
    { regex: /\bgocap\b/i, val: 50000 },
    { regex: /\bnoban\b/i, val: 20000 },
    { regex: /\bceban\b/i, val: 10000 },
    { regex: /\bgoceng\b/i, val: 5000 },
    { regex: /\bseceng\b/i, val: 1000 },
    { regex: /\bcepek\b/i, val: 100000 }, // Default daily informal rupiah usage for 100k
  ];

  for (const item of slangPatterns) {
    const match = clean.match(item.regex);
    if (match) {
      baseVal = item.val;
      rawAmountToken = match[0];
      break;
    }
  }

  // If no slang word matched, parse numeric amount with suffixes (k, rb, ribu, jt, juta, m, usd, idr, sgd)
  if (!baseVal) {
    const numMatch = clean.match(/(?:sebesar|senilai|rp\.?|idr)?\s*(\d+(?:[.,]\d+)?)(?:\s*(k|rb|ribu|jt|juta|m|usd|idr|sgd)\b)?/i);
    if (numMatch && numMatch[1]) {
      baseVal = parseFloat(numMatch[1].replace(',', '.'));
      rawAmountToken = numMatch[0];
      const unit = numMatch[2]?.toLowerCase();
      if (unit === 'k' || unit === 'rb' || unit === 'ribu') {
        baseVal *= 1000;
      } else if (unit === 'jt' || unit === 'juta' || unit === 'm') {
        baseVal *= 1000000;
      }
    }
  }

  if (isNaN(baseVal) || baseVal <= 0) return null;

  // 3. Detect transaction type
  let type: 'expense' | 'income' | 'transfer' = 'expense';
  if (/gaji|salary|income|bonus|freelance|terima|dapat|cair|masuk/i.test(clean) && !/keluar|bayar|beli/i.test(clean)) {
    type = 'income';
  } else if (/transfer|kirim|pindah|trf|tf/i.test(clean)) {
    type = 'transfer';
  }

  // 4. Detect Account
  let matchedAcc = accounts.find((a) => clean.includes(a.name.toLowerCase()));
  if (!matchedAcc) {
    if (/bca/i.test(clean)) matchedAcc = accounts.find((a) => a.name.toLowerCase().includes('bca'));
    else if (/mandiri/i.test(clean)) matchedAcc = accounts.find((a) => a.name.toLowerCase().includes('mandiri'));
    else if (/gopay/i.test(clean)) matchedAcc = accounts.find((a) => a.name.toLowerCase().includes('gopay') || a.type === 'ewallet');
    else if (/ovo/i.test(clean)) matchedAcc = accounts.find((a) => a.name.toLowerCase().includes('ovo') || a.type === 'ewallet');
    else if (/dana\b/i.test(clean)) matchedAcc = accounts.find((a) => a.name.toLowerCase().includes('dana') || a.type === 'ewallet');
    else if (/cash|tunai/i.test(clean)) matchedAcc = accounts.find((a) => a.type === 'cash');
    else if (/paypal/i.test(clean)) matchedAcc = accounts.find((a) => a.type === 'paypal');
  }
  if (!matchedAcc) matchedAcc = accounts[0];

  // 5. Detect Category
  let matchedCat: Category | undefined;
  if (/kopi|coffee|makan|lunch|dinner|sarapan|food|cafe|resto|mie|nasi|jajan|kuliner|minum|kenangan/i.test(clean)) {
    matchedCat = categories.find((c) => c.id === 'cat_food' || c.name.toLowerCase().includes('food'));
  } else if (/bensin|fuel|bbm|pertalite|pertamax|solar|grab|gojek|uber|taxi|ojol|parkir|toll|tol|kereta|busway|mrt|transport/i.test(clean)) {
    matchedCat = categories.find((c) => c.id === 'cat_transport' || c.name.toLowerCase().includes('transport'));
  } else if (/listrik|pln|pdam|air|wifi|indihome|internet|pulsa|tagihan|bpjs|pajak|bill/i.test(clean)) {
    matchedCat = categories.find((c) => c.id === 'cat_bills' || c.name.toLowerCase().includes('bills'));
  } else if (/belanja|shopping|baju|sepatu|mall|tokopedia|shopee|lazada|beli/i.test(clean)) {
    matchedCat = categories.find((c) => c.id === 'cat_shopping' || c.name.toLowerCase().includes('shopping'));
  } else if (type === 'income') {
    matchedCat = categories.find((c) => c.type === 'income');
  }
  if (!matchedCat) matchedCat = categories[0];

  // 6. Clean Description
  let desc = clean;
  if (rawAmountToken) {
    desc = desc.replace(rawAmountToken, ' ');
  }
  if (matchedAcc) {
    desc = desc.replace(new RegExp('\\b' + matchedAcc.name.toLowerCase() + '\\b', 'gi'), ' ');
  }
  desc = desc
    .replace(/\b(bca|mandiri|bri|bni|cash|tunai|gopay|ovo|dana|shopeepay|paypal)\b/gi, ' ')
    .replace(/\b(di|ke|via|pake|pakai|using|with|dari|from|melalui|lewat)\b/gi, ' ')
    .replace(/\b(kemar[ie]n|tadi|hari ini|today|yesterday)\b/gi, ' ')
    .replace(/\b(sebesar|senilai|rp\.?|idr|duit)\b/gi, ' ')
    .replace(/\b(masuk|keluar)\b/gi, ' ')
    .replace(/\b(membayar|bayar)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!desc) {
    desc = matchedCat?.name || (type === 'income' ? 'Income' : 'Expense');
  } else {
    desc = desc.charAt(0).toUpperCase() + desc.slice(1);
  }

  return {
    id: 'prop_' + crypto.randomUUID().slice(0, 8),
    type: 'create',
    status: 'pending',
    summary: `[Offline Regex] Log ${type} of ${baseVal.toLocaleString()} ${matchedAcc?.currency || baseCurrency} for "${desc}" in ${matchedAcc?.name}`,
    data: {
      type,
      amount: baseVal,
      currency: matchedAcc?.currency || baseCurrency,
      description: desc,
      accountId: matchedAcc?.id,
      accountName: matchedAcc?.name,
      categoryId: matchedCat?.id,
      categoryName: matchedCat?.name,
      date: targetDate,
    },
    createdAt: Date.now(),
  };
}

/**
 * Protocol Executor: OpenAI-Compatible (DeepSeek, OpenRouter, Groq, OpenAI, Mistral, Custom)
 */
async function callOpenAICompatible(
  prov: AIProviderConfig,
  model: string,
  plainKey: string,
  userText: string,
  history: ChatMessage[],
  context: { accounts: Account[]; categories: Category[]; baseCurrency: CurrencyCode },
  fetchFn: typeof fetch
): Promise<{ replyText: string; proposals: ActionProposal[]; chartView?: any }> {
  const chatUrl = `${prov.baseUrl.replace(/\/+$/, '')}/chat/completions`;

  const openAiTools = APP_TOOLS_DECLARATIONS.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: {
        type: 'object',
        properties: t.parameters.properties,
        required: (t.parameters as any).required || [],
      },
    },
  }));

  const messages: any[] = [
    { role: 'system', content: AI_SYSTEM_PROMPT },
    ...history.slice(-6).map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: userText },
  ];

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (prov.authHeaderFormat) {
    if (prov.authHeaderFormat.includes('{KEY}')) {
      const [headerName, ...valParts] = prov.authHeaderFormat.split(':');
      if (headerName && valParts.length > 0) {
        headers[headerName.trim()] = valParts.join(':').trim().replace('{KEY}', plainKey);
      } else {
        headers['Authorization'] = prov.authHeaderFormat.replace('{KEY}', plainKey);
      }
    } else {
      headers['Authorization'] = `Bearer ${plainKey}`;
    }
  } else {
    headers['Authorization'] = `Bearer ${plainKey}`;
  }

  const proposals: ActionProposal[] = [];

  const resp = await fetchFn(chatUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: model || prov.selectedModel || 'gpt-4o-mini',
      messages,
      tools: openAiTools,
    }),
  });

  if (!resp.ok) {
    throw new Error(`${prov.name} API error: HTTP ${resp.status} ${resp.statusText}`);
  }

  const data = await resp.json();
  const choice = data.choices?.[0]?.message;

  if (choice?.tool_calls?.length) {
    for (const tc of choice.tool_calls) {
      const name = tc.function.name;
      const args = JSON.parse(tc.function.arguments || '{}');
      const { result, proposal } = await executeInternalTool(name, args, context);
      if (proposal) proposals.push(proposal);

      messages.push(choice);
      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: JSON.stringify(result),
      });
    }

    const followUpResp = await fetchFn(chatUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: model || prov.selectedModel || 'gpt-4o-mini', messages }),
    });

    if (followUpResp.ok) {
      const followUpData = await followUpResp.json();
      return {
        replyText: followUpData.choices?.[0]?.message?.content || 'Action proposal ready.',
        proposals,
      };
    }
  }

  return {
    replyText: choice?.content || 'Here are the details from your inquiry.',
    proposals,
  };
}

/**
 * Protocol Executor: Google Gemini
 */
async function callGemini(
  prov: AIProviderConfig,
  model: string,
  plainKey: string,
  userText: string,
  history: ChatMessage[],
  context: { accounts: Account[]; categories: Category[]; baseCurrency: CurrencyCode },
  fetchFn: typeof fetch
): Promise<{ replyText: string; proposals: ActionProposal[]; chartView?: any }> {
  const chosenModel = model || prov.selectedModel || 'gemini-3.8-flash';
  const url = `${prov.baseUrl.replace(/\/+$/, '')}/models/${chosenModel}:generateContent?key=${plainKey}`;

  const geminiTools = [
    {
      functionDeclarations: APP_TOOLS_DECLARATIONS.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
    },
  ];

  const contents: any[] = history.slice(-6).map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
  contents.push({ role: 'user', parts: [{ text: userText }] });

  const requestBody = {
    contents,
    systemInstruction: { parts: [{ text: AI_SYSTEM_PROMPT }] },
    tools: geminiTools,
  };

  const resp = await fetchFn(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  if (!resp.ok) {
    throw new Error(`Gemini API error: HTTP ${resp.status} ${resp.statusText}`);
  }

  const data = await resp.json();
  const candidate = data.candidates?.[0];
  const parts = candidate?.content?.parts || [];

  let reply = '';
  const proposals: ActionProposal[] = [];

  for (const part of parts) {
    if (part.text) {
      reply += part.text;
    }

    if (part.functionCall) {
      const { name, args } = part.functionCall;
      const { result, proposal } = await executeInternalTool(name, args, context);
      if (proposal) proposals.push(proposal);

      const followUpBody = {
        contents: [
          ...contents,
          { role: 'model', parts: [{ functionCall: part.functionCall }] },
          {
            role: 'user',
            parts: [{ functionResponse: { name, response: result } }],
          },
        ],
        systemInstruction: { parts: [{ text: AI_SYSTEM_PROMPT }] },
      };

      const followUpResp = await fetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(followUpBody),
      });

      if (followUpResp.ok) {
        const followUpData = await followUpResp.json();
        const followUpText = followUpData.candidates?.[0]?.content?.parts?.[0]?.text;
        if (followUpText) reply = followUpText;
      }
    }
  }

  return {
    replyText: reply || 'I evaluated your request. Please review any generated action cards below.',
    proposals,
  };
}

/**
 * Protocol Executor: Anthropic Messages API
 */
async function callAnthropic(
  prov: AIProviderConfig,
  model: string,
  plainKey: string,
  userText: string,
  history: ChatMessage[],
  context: { accounts: Account[]; categories: Category[]; baseCurrency: CurrencyCode },
  fetchFn: typeof fetch
): Promise<{ replyText: string; proposals: ActionProposal[]; chartView?: any }> {
  const chosenModel = model || prov.selectedModel || 'claude-3-5-sonnet-20241022';
  const url = `${prov.baseUrl.replace(/\/+$/, '')}/messages`;

  const anthropicTools = APP_TOOLS_DECLARATIONS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: {
      type: 'object',
      properties: t.parameters.properties,
      required: (t.parameters as any).required || [],
    },
  }));

  const messages = [
    ...history.slice(-6).map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    })),
    { role: 'user', content: userText },
  ];

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': plainKey,
    'anthropic-version': '2023-06-01',
  };

  const resp = await fetchFn(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: chosenModel,
      system: AI_SYSTEM_PROMPT,
      messages,
      tools: anthropicTools,
      max_tokens: 1024,
    }),
  });

  if (!resp.ok) {
    throw new Error(`Anthropic API error: HTTP ${resp.status} ${resp.statusText}`);
  }

  const data = await resp.json();
  const contentBlocks: any[] = data.content || [];
  let reply = '';
  const proposals: ActionProposal[] = [];

  for (const block of contentBlocks) {
    if (block.type === 'text') {
      reply += block.text;
    } else if (block.type === 'tool_use') {
      const { name, input } = block;
      const { result, proposal } = await executeInternalTool(name, input, context);
      if (proposal) proposals.push(proposal);

      // Follow-up
      const followUpMessages = [
        ...messages,
        { role: 'assistant', content: contentBlocks },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify(result),
            },
          ],
        },
      ];

      const followUpResp = await fetchFn(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: chosenModel,
          system: AI_SYSTEM_PROMPT,
          messages: followUpMessages,
          max_tokens: 1024,
        }),
      });

      if (followUpResp.ok) {
        const followUpData = await followUpResp.json();
        const followUpText = (followUpData.content || [])
          .filter((b: any) => b.type === 'text')
          .map((b: any) => b.text)
          .join('\n');
        if (followUpText) reply = followUpText;
      }
    }
  }

  return {
    replyText: reply || 'Here are the details from your inquiry.',
    proposals,
  };
}

/**
 * Protocol Executor: Local Ollama
 */
async function callOllama(
  prov: AIProviderConfig,
  model: string,
  userText: string,
  history: ChatMessage[],
  context: { accounts: Account[]; categories: Category[]; baseCurrency: CurrencyCode },
  fetchFn: typeof fetch
): Promise<{ replyText: string; proposals: ActionProposal[]; chartView?: any }> {
  const chosenModel = model || prov.selectedModel || 'llama3.2';
  const url = `${prov.baseUrl.replace(/\/+$/, '')}/api/chat`;

  const promptWithStructure = `${AI_SYSTEM_PROMPT}
If the user wants to log, edit, or delete a transaction, reply ONLY with a JSON object in this format:
{"action": "createTransactionProposal", "parameters": {"type": "expense", "amount": 25000, "description": "Coffee", "accountName": "BCA", "categoryName": "Food"}}
Otherwise, reply with your conversational answer.`;

  const resp = await fetchFn(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: chosenModel,
      messages: [
        { role: 'system', content: promptWithStructure },
        ...history.slice(-4).map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: userText },
      ],
      stream: false,
    }),
  });

  if (!resp.ok) {
    throw new Error(`Ollama connection error: HTTP ${resp.status}`);
  }

  const data = await resp.json();
  const content = data.message?.content || '';
  const proposals: ActionProposal[] = [];

  const jsonMatch = content.match(/\{[\s\S]*?"action"[\s\S]*?\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      const { proposal } = await executeInternalTool(parsed.action, parsed.parameters, context);
      if (proposal) proposals.push(proposal);
      return {
        replyText: 'I prepared an action based on your local model response. Please confirm below.',
        proposals,
      };
    } catch {
      // Plain text fallback
    }
  }

  return { replyText: content, proposals };
}

/**
 * Main Dispatcher: Unified AI Assistant with Proactive Health-Checked Fast-Path,
 * Multi-Provider Priority Rollover Safety Net, and Guaranteed 3-Tier Fallback Order:
 * 1. Cloud Priority Chain (Selected via cached health status)
 * 2. Local Ollama (Automatic fallback step)
 * 3. Phase 7 Deterministic Offline Intelligence Engine (Guaranteed zero-drop fallback)
 */
export async function sendUnifiedChatMessage(
  userText: string,
  history: ChatMessage[],
  settings: AppSettings | null,
  context: {
    accounts: Account[];
    categories: Category[];
    baseCurrency: CurrencyCode;
    masterPin?: string;
  },
  fetchFn = fetch
): Promise<{
  replyText: string;
  proposals: ActionProposal[];
  chartView?: 'net_worth' | 'cash_flow' | 'category_donut' | 'budget_performance';
  servingProvider?: string;
  servingModel?: string;
  failoverChain?: Array<{
    provider: string;
    model: string;
    reason: string;
  }>;
}> {
  // If AI is disabled by user settings, immediately drop to deterministic Phase 7 engine
  if (settings && !settings.aiEnabled) {
    const { runOfflineIntelligence } = await import('./offline/engine');
    const offlineResult = await runOfflineIntelligence(userText, context);
    return {
      ...offlineResult,
      servingProvider: 'Offline Intelligence',
      servingModel: 'Deterministic Rules Engine',
    };
  }

  const failoverChain: Array<{ provider: string; model: string; reason: string }> = [];

  // Query database for configured providers, keys, and user priorities
  let dbPriorities: AIPriorityItem[] = [];
  let dbProviders: AIProviderConfig[] = [];
  let dbKeys: AIKeyRecord[] = [];

  try {
    dbPriorities = await db.ai_priorities.filter((p) => p.isEnabled).sortBy('order');
    dbProviders = await db.ai_providers.filter((p) => p.isEnabled).toArray();
    dbKeys = await db.ai_keys.filter((k) => k.isActive).toArray();
  } catch (err) {
    console.warn('[AI] Error loading providers from DB:', err);
  }

  const defaultGeminiKey = typeof atob !== 'undefined'
    ? atob('QVEuQWI4Uk42S0ZldTViNlFVaHBRX00yNWg0aDZBWVMwUlU1cjI1eUhFTGMxMllncm5obEE=')
    : (typeof Buffer !== 'undefined' ? Buffer.from('QVEuQWI4Uk42S0ZldTViNlFVaHBRX00yNWg0aDZBWVMwUlU1cjI1eUhFTGMxMllncm5obEE=', 'base64').toString('utf-8') : '');

  // Only consider online AI providers if settings is enabled (or in production app where settings exists)
  const isAiActive = settings ? settings.aiEnabled !== false : false;

  const effectiveApiKey = settings?.aiApiKey || defaultGeminiKey;
  const effectiveProvider = settings?.aiProvider || 'gemini';

  // Backward compatibility & default preset: If AI is active and no priorities/providers exist in DB yet
  if (isAiActive && dbPriorities.length === 0) {
    const matchedProv = dbProviders.find((p) =>
      p.id === `prov_${effectiveProvider}` || p.protocol === (effectiveProvider === 'gemini' ? 'gemini' : 'openai_compatible')
    ) || {
      id: `prov_${effectiveProvider}`,
      name: effectiveProvider === 'gemini' ? 'Google Gemini' : 'OpenAI',
      type: 'preset',
      protocol: effectiveProvider === 'gemini' ? 'gemini' : 'openai_compatible',
      baseUrl: effectiveProvider === 'gemini' ? 'https://generativelanguage.googleapis.com/v1beta' : 'https://api.openai.com/v1',
      availableModels: [effectiveProvider === 'gemini' ? 'gemini-3.8-flash' : 'gpt-4o-mini'],
      selectedModel: effectiveProvider === 'gemini' ? 'gemini-3.8-flash' : 'gpt-4o-mini',
      isEnabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      version: 1,
    };

    if (!dbProviders.some((p) => p.id === matchedProv.id)) {
      dbProviders.push(matchedProv as any);
    }
    dbPriorities.push({
      id: 'prio_legacy',
      providerId: matchedProv.id,
      keyId: 'legacy_key',
      order: 1,
      isEnabled: true,
    });
  }

  // Tier 1 & 2: Build candidate list
  interface Candidate {
    provider: AIProviderConfig;
    key?: AIKeyRecord;
    model: string;
    targetId: string;
    legacyApiKey?: string;
  }

  const candidates: Candidate[] = [];

  // 1. Check fast path: consult cached health status
  const fastPath = await getFastPathTarget(dbPriorities, dbProviders, dbKeys);
  if (fastPath) {
    candidates.push({
      provider: fastPath.provider,
      key: fastPath.key,
      model: fastPath.model,
      targetId: `${fastPath.provider.id}:${fastPath.key?.id || 'default'}`,
    });
  }

  // 2. Add remaining priority chain items (in order)
  for (const prio of dbPriorities) {
    if (fastPath && prio.id === fastPath.priority.id) continue;
    const prov = dbProviders.find((p) => p.id === prio.providerId);
    if (!prov || !prov.isEnabled) continue;

    const key = dbKeys.find((k) => k.id === prio.keyId);
    if (prov.protocol !== 'ollama' && !key && prio.keyId !== 'legacy_key') continue;

    candidates.push({
      provider: prov,
      key,
      model: prio.modelOverride || prov.selectedModel,
      targetId: `${prov.id}:${key?.id || 'default'}`,
      legacyApiKey: prio.keyId === 'legacy_key' ? effectiveApiKey : undefined,
    });
  }

  // 3. Add default Local Ollama fallback if not already in candidates
  const ollamaProv = dbProviders.find((p) => p.protocol === 'ollama');
  if (ollamaProv && !candidates.some((c) => c.provider.id === ollamaProv.id)) {
    candidates.push({
      provider: ollamaProv,
      model: ollamaProv.selectedModel || 'llama3.2',
      targetId: ollamaProv.id,
    });
  }

  // 4. Ultimate fallback: if AI is active and no candidate reached, add preset Gemini candidate
  if (isAiActive && candidates.length === 0) {
    candidates.push({
      provider: {
        id: 'prov_gemini',
        name: 'Google Gemini',
        type: 'preset',
        protocol: 'gemini',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        availableModels: ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite'],
        selectedModel: 'gemini-3.8-flash',
        isEnabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
      },
      model: 'gemini-3.8-flash',
      targetId: 'prov_gemini:default',
      legacyApiKey: defaultGeminiKey,
    });
  }

  // If top candidate has no cached health status (cold start / first load), perform JIT check
  if (candidates.length > 0) {
    const top = candidates[0];
    const topHealth = getCachedHealth(top.targetId) || getCachedHealth(top.provider.id);
    if (!topHealth) {
      let topPlainKey: string | undefined = top.legacyApiKey;
      if (!topPlainKey && top.key && context.masterPin) {
        try {
          topPlainKey = await revealApiKey(top.key, context.masterPin);
        } catch {
          topPlainKey = undefined;
        }
      }
      const jitRes = await checkProviderHealth(top.provider, topPlainKey, { fetchFn });
      await recordHealthResult({
        targetId: top.targetId,
        providerId: top.provider.id,
        keyId: top.key?.id,
        providerName: top.provider.name,
        keyLabel: top.key?.label,
        result: jitRes,
      });
    }
  }

  // Execute Candidates Loop with Multi-Provider Rollover Safety Net
  for (const candidate of candidates) {
    const { provider, key, model, targetId, legacyApiKey } = candidate;

    // Feature 4: Check if provider has exceeded its self-computed estimated monthly spending cap
    const capCheck = isProviderCapExceeded(provider);
    if (capCheck.isExceeded) {
      failoverChain.push({
        provider: provider.name,
        model,
        reason: capCheck.reason || 'Estimated monthly spending cap reached',
      });
      continue;
    }

    let plainKey: string | undefined = legacyApiKey;
    if (!plainKey && provider.protocol !== 'ollama' && key) {
      if (!context.masterPin) {
        // Hard PIN Requirement: Missing PIN means key cannot be decrypted
        const errReason = `Cannot decrypt API key for ${provider.name} (app locked or PIN required).`;
        failoverChain.push({ provider: provider.name, model, reason: errReason });
        continue;
      }
      try {
        plainKey = await revealApiKey(key, context.masterPin);
      } catch (decErr: any) {
        const errReason = `Key decryption failed for ${provider.name} (${decErr.message}).`;
        failoverChain.push({ provider: provider.name, model, reason: errReason });
        await recordHealthResult({
          targetId,
          providerId: provider.id,
          keyId: key.id,
          providerName: provider.name,
          keyLabel: key.label,
          result: { status: 'unreachable', error: errReason },
        });
        continue;
      }
    }

    try {
      let response: { replyText: string; proposals: ActionProposal[]; chartView?: any };

      if (provider.protocol === 'ollama') {
        response = await callOllama(provider, model, userText, history, context, fetchFn);
      } else if (provider.protocol === 'gemini') {
        if (!plainKey) throw new Error('Missing API key');
        response = await callGemini(provider, model, plainKey, userText, history, context, fetchFn);
      } else if (provider.protocol === 'anthropic') {
        if (!plainKey) throw new Error('Missing API key');
        response = await callAnthropic(provider, model, plainKey, userText, history, context, fetchFn);
      } else {
        if (!plainKey) throw new Error('Missing API key');
        response = await callOpenAICompatible(provider, model, plainKey, userText, history, context, fetchFn);
      }

      // Successful response: record healthy status (resets consecutiveFailures)
      await recordHealthResult({
        targetId,
        providerId: provider.id,
        keyId: key?.id,
        providerName: provider.name,
        keyLabel: key?.label,
        result: { status: 'healthy' },
      });

      // Feature 4: Record self-computed estimated usage for spending cap tracking
      if (provider.id) {
        const approxPromptTokens = Math.round((userText.length + 400) / 4);
        const approxCompletionTokens = Math.round((response.replyText.length) / 4);
        recordEstimatedProviderUsage(provider.id, model, approxPromptTokens, approxCompletionTokens).catch(console.warn);
      }

      return {
        replyText: response.replyText,
        proposals: response.proposals,
        chartView: response.chartView,
        servingProvider: provider.name,
        servingModel: model,
        failoverChain: failoverChain.length > 0 ? failoverChain : undefined,
      };
    } catch (err: any) {
      console.warn(`[AI Failover] ${provider.name} (${model}) failed:`, err.message);
      failoverChain.push({
        provider: provider.name,
        model,
        reason: err.message,
      });

      // Update cached health to degraded (if 429) or unreachable
      const isDegraded = /429|quota|rate limit/i.test(err.message);
      await recordHealthResult({
        targetId,
        providerId: provider.id,
        keyId: key?.id,
        providerName: provider.name,
        keyLabel: key?.label,
        result: {
          status: isDegraded ? 'degraded' : 'unreachable',
          error: err.message,
        },
      });

      // Continue to next candidate in the priority chain!
    }
  }

  // Tier 3: All online providers and Ollama failed (or none were available)
  // Gracefully drop to Phase 7 Deterministic Offline Intelligence Engine
  const { runOfflineIntelligence } = await import('./offline/engine');
  const offlineResult = await runOfflineIntelligence(userText, context);

  return {
    ...offlineResult,
    servingProvider: 'Offline Intelligence',
    servingModel: 'Deterministic Rules Engine',
    failoverChain: failoverChain.length > 0 ? failoverChain : undefined,
  };
}
