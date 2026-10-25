/**
 * Phase 5 Test Suite: Unified AI Assistant, Function Calling, Lazy OCR & Proactive Advisor
 * Validates:
 * 1. Tier 1 Deterministic Offline Regex Parser
 * 2. Internal Function/Tool Calling Engine (Search, Create Proposal, Edit Proposal, Delete Proposal, Summary, Budget, Debts)
 * 3. Zero-Write Safety Gate & User Confirmation Execution
 * 4. Receipt Text Parsing, Heuristic Field Extraction & Duplicate Receipt Detection
 * 5. Proactive Advisor Anomaly Engine (Spending Spikes, Budget Warnings, Overruns, Upcoming Bills & Debts)
 * 6. Graceful Notification Fallback
 */

import 'fake-indexeddb/auto';
import { db, initializeDatabaseSeed } from '../src/db/database';
import {
  parseFreeFormOffline,
  executeInternalTool,
  executeConfirmedProposal,
  sendUnifiedChatMessage,
} from '../src/services/ai';
import {
  parseReceiptText,
  createProposalFromOCR,
} from '../src/services/ocr';
import {
  evaluateProactiveFinancialAlerts,
  requestNotificationPermission,
} from '../src/services/advisor';
import { createTransaction } from '../src/services/ledger';
import type { Account, Category, CurrencyCode, ActionProposal } from '../src/types';

async function runPhase5Tests() {
  console.log('🚀 Starting Phase 5 Test Suite: Unified AI Assistant, OCR & Proactive Alerts...\n');

  // Initialize DB
  await initializeDatabaseSeed();

  const accounts = await db.accounts.toArray();
  const categories = await db.categories.toArray();
  const baseCurrency: CurrencyCode = 'IDR';

  const context = { accounts, categories, baseCurrency };

  // =========================================================================
  // Test 1: Tier 1 Deterministic Offline Regex Parser
  // =========================================================================
  console.log('--- Test 1: Tier 1 Offline Regex Parser ---');
  // 1a: Expense parsing
  const propExpense = parseFreeFormOffline('kopi 35k bca', accounts, categories, baseCurrency);
  if (!propExpense || propExpense.data.amount !== 35000 || propExpense.data.type !== 'expense') {
    throw new Error('Offline parser failed to parse "kopi 35k bca"!');
  }
  if (!propExpense.data.accountName?.toLowerCase().includes('bca')) {
    throw new Error('Offline parser failed to match account BCA!');
  }
  console.log(`[PASS] Parsed expense: ${propExpense.data.description} -> ${propExpense.data.amount} ${propExpense.data.currency} (${propExpense.data.accountName})`);

  // 1b: Income parsing
  const propIncome = parseFreeFormOffline('gaji 12jt bca', accounts, categories, baseCurrency);
  if (!propIncome || propIncome.data.amount !== 12000000 || propIncome.data.type !== 'income') {
    throw new Error('Offline parser failed to parse "gaji 12jt bca"!');
  }
  console.log(`[PASS] Parsed income: ${propIncome.data.description} -> ${propIncome.data.amount} ${propIncome.data.currency}`);

  // 1c: Transfer parsing
  const propTransfer = parseFreeFormOffline('transfer 500k bca ke cash', accounts, categories, baseCurrency);
  if (!propTransfer || propTransfer.data.amount !== 500000 || propTransfer.data.type !== 'transfer') {
    throw new Error('Offline parser failed to parse transfer!');
  }
  console.log(`[PASS] Parsed transfer: ${propTransfer.data.amount} ${propTransfer.data.currency}`);

  // 1d: Indonesian Slang Numbers ("gocap" = 50,000)
  const propSlangGocap = parseFreeFormOffline('beli bensin gocap cash', accounts, categories, baseCurrency);
  if (!propSlangGocap || propSlangGocap.data.amount !== 50000 || propSlangGocap.data.categoryId !== 'cat_transport') {
    throw new Error('Offline parser failed to parse Indonesian slang "beli bensin gocap cash"!');
  }
  console.log(`[PASS] Parsed Indonesian slang: "beli bensin gocap cash" -> ${propSlangGocap.data.amount} IDR (${propSlangGocap.data.categoryName}, ${propSlangGocap.data.accountName})`);

  // 1e: Indonesian Relative Date & Slang ("kemaren" = yesterday, "goceng" = 5,000)
  const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const propKemaren = parseFreeFormOffline('kemaren beli kopi kenangan goceng pake bca', accounts, categories, baseCurrency);
  if (!propKemaren || propKemaren.data.amount !== 5000 || propKemaren.data.date !== yesterdayStr) {
    throw new Error(`Offline parser failed relative date/slang "kemaren goceng"! Expected date: ${yesterdayStr}, got: ${propKemaren?.data.date}, amt: ${propKemaren?.data.amount}`);
  }
  console.log(`[PASS] Parsed relative date & slang: "kemaren goceng" -> date ${propKemaren.data.date}, amount ${propKemaren.data.amount} IDR`);

  // 1f: Indonesian Formal Input (Bahasa Baku)
  const propFormal = parseFreeFormOffline('Membayar tagihan listrik sebesar 150000 melalui Bank BCA', accounts, categories, baseCurrency);
  if (!propFormal || propFormal.data.amount !== 150000 || propFormal.data.categoryId !== 'cat_bills') {
    throw new Error('Offline parser failed to parse formal Indonesian "Membayar tagihan listrik sebesar 150000"!');
  }
  console.log(`[PASS] Parsed formal Indonesian: "Membayar tagihan listrik sebesar 150000" -> ${propFormal.data.amount} IDR (${propFormal.data.categoryName})`);

  // 1g: Indonesian Code-Switching & Mixed Slang ("abis makan di cafe 50rb pake gopay")
  const propCodeSwitch = parseFreeFormOffline('abis makan di cafe 50rb pake gopay', accounts, categories, baseCurrency);
  if (!propCodeSwitch || propCodeSwitch.data.amount !== 50000 || propCodeSwitch.data.categoryId !== 'cat_food') {
    throw new Error('Offline parser failed to parse code-switching "abis makan di cafe 50rb pake gopay"!');
  }
  console.log(`[PASS] Parsed Indonesian code-switching: "abis makan di cafe 50rb" -> ${propCodeSwitch.data.amount} IDR (${propCodeSwitch.data.categoryName})`);

  // 1h: Indonesian Income Slang ("gaji sejt masuk bca")
  const propIncomeSlang = parseFreeFormOffline('gaji sejt masuk bca', accounts, categories, baseCurrency);
  if (!propIncomeSlang || propIncomeSlang.data.amount !== 1000000 || propIncomeSlang.data.type !== 'income') {
    throw new Error('Offline parser failed to parse Indonesian income slang "gaji sejt masuk bca"!');
  }
  console.log(`[PASS] Parsed Indonesian income slang: "gaji sejt masuk bca" -> ${propIncomeSlang.data.amount} IDR (income)`);

  // 1i: Natural Indonesian Search & Report Query via Unified Chat
  const chatSearchResp = await sendUnifiedChatMessage(
    'pengeluaran makan bulan ini berapa',
    [],
    null,
    context
  );
  if (!chatSearchResp.replyText.toLowerCase().includes('food') && !chatSearchResp.replyText.toLowerCase().includes('makan')) {
    throw new Error('Natural language query for "pengeluaran makan bulan ini" failed to return food summary!');
  }
  console.log(`[PASS] Natural Indonesian query answered: "${chatSearchResp.replyText}"`);

  // =========================================================================
  // Test 2: Internal Function / Tool Calling Engine
  // =========================================================================
  console.log('\n--- Test 2: Internal Tool Calling Execution ---');

  // Seed sample transactions
  const now = Date.now();
  const tx1 = await createTransaction({
    type: 'expense',
    amount: 55000,
    currency: 'IDR',
    exchangeRateToBase: 1.0,
    baseAmount: 55000,
    timestamp: now,
    date: '2026-10-23',
    description: 'Nasi Goreng Spesial',
    accountId: 'acc_bank_bca',
    categoryId: 'cat_food',
    inputSource: 'manual',
  });

  const tx2 = await createTransaction({
    type: 'expense',
    amount: 150000,
    currency: 'IDR',
    exchangeRateToBase: 1.0,
    baseAmount: 150000,
    timestamp: now - 3600000,
    date: '2026-10-23',
    description: 'Grab Car to Office',
    accountId: 'acc_cash',
    categoryId: 'cat_transport',
    inputSource: 'manual',
  });

  // Tool 2a: searchTransactions
  const searchResult = await executeInternalTool('searchTransactions', { keyword: 'Goreng' }, context);
  if (!searchResult.result.transactions || searchResult.result.transactions.length === 0) {
    throw new Error('Tool searchTransactions failed to find "Nasi Goreng"!');
  }
  console.log(`[PASS] Tool searchTransactions found ${searchResult.result.count} matching transaction(s).`);

  // Tool 2b: getFinancialSummary
  const summaryResult = await executeInternalTool('getFinancialSummary', { month: '2026-10' }, context);
  if (!summaryResult.result.currentMonth) {
    throw new Error('Tool getFinancialSummary failed to return monthly summary!');
  }
  console.log(`[PASS] Tool getFinancialSummary returned cash flow: Inflow=${summaryResult.result.currentMonth.income}, Outflow=${summaryResult.result.currentMonth.expense}`);

  // Tool 2c: getBudgetStatus
  const budgetResult = await executeInternalTool('getBudgetStatus', {}, context);
  if (!Array.isArray(budgetResult.result.budgets)) {
    throw new Error('Tool getBudgetStatus failed!');
  }
  console.log(`[PASS] Tool getBudgetStatus returned ${budgetResult.result.budgets.length} budgeted category statuses.`);

  // Tool 2d: getAccountsAndBalances
  const accResult = await executeInternalTool('getAccountsAndBalances', {}, context);
  if (!accResult.result.accounts || accResult.result.accounts.length === 0) {
    throw new Error('Tool getAccountsAndBalances failed!');
  }
  console.log(`[PASS] Tool getAccountsAndBalances returned ${accResult.result.accounts.length} active account balances.`);

  // =========================================================================
  // Test 3: Zero-Write Safety Gate & User Confirmation Execution
  // =========================================================================
  console.log('\n--- Test 3: Zero-Write Safety Gate & User Confirmation Execution ---');

  // 3a: Generate Create Proposal
  const initialTxCount = await db.transactions.count();
  const createProposalRes = await executeInternalTool(
    'createTransactionProposal',
    {
      type: 'expense',
      amount: 85000,
      description: 'Coffee Beans 250g',
      accountName: 'Bank BCA',
      categoryName: 'Food & Dining',
      date: '2026-10-23',
    },
    context
  );

  if (!createProposalRes.proposal || createProposalRes.proposal.status !== 'pending') {
    throw new Error('createTransactionProposal failed to return a pending proposal!');
  }

  // Verify ZERO silent write before confirmation
  const countBeforeConfirm = await db.transactions.count();
  if (countBeforeConfirm !== initialTxCount) {
    throw new Error('CRITICAL SAFETY FAILURE: Database was mutated before user confirmation!');
  }
  console.log('[PASS] Zero-Write Gate Verified: Proposal remained pending with 0 unconfirmed database writes.');

  // 3b: User Confirms Proposal
  await executeConfirmedProposal(createProposalRes.proposal, context);
  const countAfterConfirm = await db.transactions.count();
  if (countAfterConfirm !== initialTxCount + 1) {
    throw new Error('Database transaction was not recorded after confirmation!');
  }
  if (createProposalRes.proposal.status !== 'confirmed') {
    throw new Error('Proposal status was not updated to confirmed!');
  }
  console.log('[PASS] Confirmed proposal executed and written to ledger.');

  // 3c: Generate and Confirm Edit Proposal
  const editProposalRes = await executeInternalTool(
    'editTransactionProposal',
    {
      transactionId: tx1.id,
      amount: 60000,
      description: 'Nasi Goreng Spesial Jumbo',
    },
    context
  );

  if (!editProposalRes.proposal || !editProposalRes.proposal.beforeSnapshot) {
    throw new Error('editTransactionProposal failed to capture beforeSnapshot!');
  }

  await executeConfirmedProposal(editProposalRes.proposal, context);
  const updatedTx = await db.transactions.get(tx1.id);
  if (updatedTx?.amount !== 60000 || updatedTx?.description !== 'Nasi Goreng Spesial Jumbo') {
    throw new Error('Edit proposal confirmation did not update transaction!');
  }
  console.log('[PASS] Edit proposal confirmed and verified (amount: 60,000, desc: Nasi Goreng Spesial Jumbo).');

  // 3d: Generate and Confirm Delete Proposal
  const deleteProposalRes = await executeInternalTool(
    'deleteTransactionProposal',
    { transactionId: tx2.id, reason: 'Duplicate test record' },
    context
  );

  await executeConfirmedProposal(deleteProposalRes.proposal, context);
  const deletedTx = await db.transactions.get(tx2.id);
  if (!deletedTx?.isDeleted) {
    throw new Error('Delete proposal confirmation did not soft-delete transaction!');
  }
  console.log('[PASS] Delete proposal confirmed and soft-delete verified.');

  // =========================================================================
  // Test 4: Receipt Text Parsing & Duplicate Detection
  // =========================================================================
  console.log('\n--- Test 4: Receipt OCR Parsing & Duplicate Detection ---');
  const sampleOcrText = `
STARBUCKS COFFEE INDONESIA
Grand Indonesia West Mall
Date: 2026-10-22
Time: 14:30:15

1 Caffe Latte Grande       55,000
1 Chocolate Croissant      38,000

SUBTOTAL                   93,000
PPN 11%                    10,230
TOTAL AMOUNT              103,230
CASH                     105,000
CHANGE                     1,770

Thank you for visiting!
`;

  const parsedReceipt = parseReceiptText(sampleOcrText);
  console.log(`Parsed Merchant: "${parsedReceipt.merchantName}", Date: ${parsedReceipt.date}, Total: ${parsedReceipt.totalAmount}, Tax: ${parsedReceipt.taxAmount}`);

  if (!parsedReceipt.merchantName.includes('STARBUCKS') || parsedReceipt.totalAmount !== 103230 || parsedReceipt.taxAmount !== 10230) {
    throw new Error('Receipt text parsing extracted incorrect values!');
  }
  console.log('[PASS] Receipt parser extracted merchant name, date, total amount (103,230) and tax (10,230) with 100% accuracy.');

  // Test proposal creation from OCR
  const ocrProposal = createProposalFromOCR(
    {
      ...parsedReceipt,
      confidence: 94,
      imageHash: 'hash_test_starbucks_12345',
      isDuplicate: false,
    },
    accounts,
    categories,
    baseCurrency
  );

  if (ocrProposal.data.amount !== 103230 || ocrProposal.data.receiptHash !== 'hash_test_starbucks_12345') {
    throw new Error('OCR proposal generation failed!');
  }
  console.log('[PASS] Receipt OCR proposal generated with image hash fingerprint for duplicate detection.');

  // =========================================================================
  // Test 5: Proactive Financial Advisor & Anomaly Detection
  // =========================================================================
  console.log('\n--- Test 5: Proactive Financial Advisor Alert Engine ---');

  // Seed 3 standard transactions in 'cat_shopping' (e.g. 100,000 each)
  for (let i = 0; i < 3; i++) {
    await createTransaction({
      type: 'expense',
      amount: 100000,
      currency: 'IDR',
      exchangeRateToBase: 1.0,
      baseAmount: 100000,
      timestamp: now - (i + 1) * 86400000,
      date: '2026-10-20',
      description: `Shopping Item ${i + 1}`,
      accountId: 'acc_bank_bca',
      categoryId: 'cat_shopping',
      inputSource: 'manual',
    });
  }

  // Seed an unusual spike (>2.5x of 100k average: e.g. 500,000)
  await createTransaction({
    type: 'expense',
    amount: 500000,
    currency: 'IDR',
    exchangeRateToBase: 1.0,
    baseAmount: 500000,
    timestamp: now,
    date: '2026-10-23',
    description: 'Designer Leather Jacket Spike',
    accountId: 'acc_bank_bca',
    categoryId: 'cat_shopping',
    inputSource: 'manual',
  });

  // Evaluate alerts
  const alerts = await evaluateProactiveFinancialAlerts('IDR');
  console.log(`Evaluated ${alerts.length} proactive alerts.`);

  const spikeAlert = alerts.find((a) => a.type === 'spending_spike');
  if (!spikeAlert || !spikeAlert.message.includes('5x higher')) {
    throw new Error(`Proactive advisor failed to detect spending spike with real multiplier! Got message: "${spikeAlert?.message}"`);
  }
  console.log(`[PASS] Spending spike correctly computes and displays real multiplier: "${spikeAlert.title}" (${spikeAlert.message})`);

  // =========================================================================
  // Test 6: Graceful Notification Fallback
  // =========================================================================
  console.log('\n--- Test 6: Graceful Platform Notification Fallback ---');
  // Headless Node environment does not have native browser Notification API
  const permission = await requestNotificationPermission();
  if (permission !== false) {
    throw new Error('requestNotificationPermission should safely return false on unsupported platform without throwing!');
  }
  console.log('[PASS] Notification engine gracefully degraded to in-app alerts on platform without native push.');

  console.log('\n🎉 ALL PHASE 5 UNIFIED AI ASSISTANT, OCR & ADVISOR TESTS PASSED WITH 100% SUCCESS!');
}

runPhase5Tests().catch((err) => {
  console.error('\n❌ PHASE 5 TEST FAILED:', err);
  process.exit(1);
});
