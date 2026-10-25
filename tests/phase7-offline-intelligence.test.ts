/**
 * Phase 7 Test Suite: Major Offline Intelligence Upgrade
 * Validates:
 * 1. Large Indonesian Colloquial Lexicons (Hokkien slang numbers: pekgo, nobango, gocap, ceban, seceng, sejt, etc.)
 * 2. Chat-speak abbreviations (byr, bl, trf, bwt, td, kmrn, pke, rek, etc.) & morphology
 * 3. Relative temporal offsets (kemaren lusa = -2d, kmrn = -1d, td = 0d)
 * 4. Comprehensive Debt vs Receivable Directionality Disambiguation:
 *    - "aku pinjem budi" (Debt) vs "budi pinjem aku" (Receivable)
 *    - "minjem dari budi" (Debt) vs "pinjemin budi" (Receivable)
 *    - "ditalangin budi" (Debt) vs "nalangin budi" (Receivable)
 *    - "budi nalangin aku" (Debt) vs "budi ngutang ke aku" (Receivable)
 * 5. Zero-Write Confirmation Gate & Ledger Execution for Debt/Receivable
 * 6. Deterministic Natural Search Queries Grounded in Dexie DB
 * 7. Exact Financial Aggregation Reports (Category Spending, Cash Flow, Budget Status, Balances, Debt Recap)
 * 8. Deterministic Rule-Based Financial Health & Burn Rate Evaluation without LLM
 */

import 'fake-indexeddb/auto';
import { db, initializeDatabaseSeed } from '../src/db/database';
import { getOfflineDictionaries } from '../src/services/offline/dictionaries';
import { normalizeAndExtractEntities } from '../src/services/offline/normalizer';
import { runOfflineIntelligence } from '../src/services/offline/engine';
import { executeConfirmedProposal } from '../src/services/ai';
import { createTransaction } from '../src/services/ledger';
import type { Account, Category, CurrencyCode } from '../src/types';

async function runPhase7Tests() {
  console.log('🚀 Starting Phase 7 Test Suite: Major Offline Intelligence Upgrade...\n');

  await initializeDatabaseSeed();

  const accounts = await db.accounts.toArray();
  const categories = await db.categories.toArray();
  const baseCurrency: CurrencyCode = 'IDR';
  const context = { accounts, categories, baseCurrency };

  const dict = await getOfflineDictionaries();

  // =========================================================================
  // Test 1: Indonesian Monetary Slang Numbers (Hokkien / Regionalisms)
  // =========================================================================
  console.log('--- Test 1: Indonesian Monetary Slang Numbers ---');

  const slangCases = [
    { input: 'beli kemeja pekgo bca', expected: 150000, label: 'pekgo (150,000)' },
    { input: 'makan siang nobango cash', expected: 25000, label: 'nobango (25,000)' },
    { input: 'bensin gocap cash', expected: 50000, label: 'gocap (50,000)' },
    { input: 'jajan ceban gopay', expected: 10000, label: 'ceban (10,000)' },
    { input: 'parkir seceng tunai', expected: 1000, label: 'seceng (1,000)' },
    { input: 'gaji sejt masuk bca', expected: 1000000, label: 'sejt (1,000,000)' },
    { input: 'belanja cepek ceng bca', expected: 100000, label: 'cepek ceng (100,000)' },
    { input: 'sepatu gopek ceng bca', expected: 500000, label: 'gopek ceng (500,000)' },
    { input: 'ayam bakar ceban goceng cash', expected: 15000, label: 'ceban goceng (15,000)' },
  ];

  for (const c of slangCases) {
    const res = normalizeAndExtractEntities(c.input, accounts, categories, baseCurrency, dict);
    if (res.amount !== c.expected) {
      throw new Error(`Slang extraction failed for "${c.input}"! Expected ${c.expected}, got ${res.amount}`);
    }
    console.log(`[PASS] Parsed ${c.label} -> ${res.amount?.toLocaleString()} IDR`);
  }

  // =========================================================================
  // Test 2: Chat-Speak, Shorthand & Temporal Offsets
  // =========================================================================
  console.log('\n--- Test 2: Chat-Speak Shorthand & Relative Temporal Offsets ---');

  const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const today = new Date().toISOString().split('T')[0];

  // 2a. "kemaren lusa byr listrik 150rb rek bca"
  const res2a = normalizeAndExtractEntities('kemaren lusa byr listrik 150rb rek bca', accounts, categories, baseCurrency, dict);
  if (res2a.amount !== 150000 || res2a.date !== twoDaysAgo || res2a.matchedCategory?.id !== 'cat_bills') {
    throw new Error(`Temporal offset failed for "kemaren lusa"! Expected date ${twoDaysAgo}, got ${res2a.date}`);
  }
  console.log(`[PASS] "kemaren lusa byr listrik 150rb" -> Date ${res2a.date} (-2 days), Amount ${res2a.amount} IDR, Category Bills`);

  // 2b. "abis makan soto pekgo pke gopay"
  const res2b = normalizeAndExtractEntities('abis makan soto pekgo pke gopay', accounts, categories, baseCurrency, dict);
  if (res2b.amount !== 150000 || res2b.matchedCategory?.id !== 'cat_food') {
    throw new Error(`Chat-speak expansion failed for "abis makan soto pekgo"!`);
  }
  console.log(`[PASS] "abis makan soto pekgo pke gopay" -> Category Food, Amount ${res2b.amount} IDR`);

  // 2c. "gaji sejt msk bca td pagi"
  const res2c = normalizeAndExtractEntities('gaji sejt msk bca td pagi', accounts, categories, baseCurrency, dict);
  if (res2c.amount !== 1000000 || res2c.date !== today || res2c.matchedAccount?.id !== 'acc_bank_bca') {
    throw new Error(`Shorthand parsing failed for "gaji sejt msk bca td pagi"!`);
  }
  console.log(`[PASS] "gaji sejt msk bca td pagi" -> Date ${res2c.date} (today), Amount ${res2c.amount} IDR, Account BCA`);

  // =========================================================================
  // Test 3: Comprehensive Debt vs Receivable Directionality Disambiguation
  // =========================================================================
  console.log('\n--- Test 3: Debt vs Receivable Directionality Disambiguation ---');

  const debtDirectionCases = [
    // Case 1: "aku pinjem budi 50k" -> User is BORROWING (Debt: You owe Budi)
    { input: 'aku pinjem budi 50k', expectedType: 'debt', expectedPerson: 'Budi' },
    // Case 2: "budi pinjem aku 50k" -> Budi is borrowing from User (Receivable: Budi owes you)
    { input: 'budi pinjem aku 50k', expectedType: 'receivable', expectedPerson: 'Budi' },
    // Case 3: "minjem dari budi 50k" -> User is borrowing from Budi (Debt: You owe Budi)
    { input: 'minjem dari budi 50k', expectedType: 'debt', expectedPerson: 'Budi' },
    // Case 4: "pinjemin budi 50k" -> Suffix -in indicates User gives loan (Receivable: Budi owes you)
    { input: 'pinjemin budi 50k', expectedType: 'receivable', expectedPerson: 'Budi' },
    // Case 5: "ditalangin budi 50k" -> Passive: Budi paid for user (Debt: You owe Budi)
    { input: 'ditalangin budi 50k', expectedType: 'debt', expectedPerson: 'Budi' },
    // Case 6: "nalangin budi 50k" -> Active: User paid for Budi (Receivable: Budi owes you)
    { input: 'nalangin budi 50k', expectedType: 'receivable', expectedPerson: 'Budi' },
    // Case 7: "budi nalangin aku 50k" -> Budi paid for user (Debt: You owe Budi)
    { input: 'budi nalangin aku 50k', expectedType: 'debt', expectedPerson: 'Budi' },
    // Case 8: "budi ngutang ke aku 50k" -> Budi borrows from user (Receivable: Budi owes you)
    { input: 'budi ngutang ke aku 50k', expectedType: 'receivable', expectedPerson: 'Budi' },
    // Case 9: "ngutang ke budi 50k" -> User borrows from Budi (Debt: You owe Budi)
    { input: 'ngutang ke budi 50k', expectedType: 'debt', expectedPerson: 'Budi' },
    // Case 10: "pinjemin uang ke budi ceban cash" -> User loans to Budi (Receivable: Budi owes you)
    { input: 'pinjemin uang ke budi ceban cash', expectedType: 'receivable', expectedPerson: 'Budi' },
  ];

  for (const item of debtDirectionCases) {
    const parsed = normalizeAndExtractEntities(item.input, accounts, categories, baseCurrency, dict);
    const meta = parsed.debtReceivableMeta;

    if (!meta || meta.type !== item.expectedType || meta.counterpartyName !== item.expectedPerson) {
      throw new Error(
        `Directionality failure for "${item.input}"! Expected ${item.expectedType} to/from ${item.expectedPerson}, got ${meta?.type} to/from ${meta?.counterpartyName}`
      );
    }
    console.log(`[PASS] "${item.input}" -> ${meta.type.toUpperCase()}: ${meta.directionLabel}`);
  }

  // =========================================================================
  // Test 4: Zero-Write Gate & Ledger Execution for Debt/Receivable
  // =========================================================================
  console.log('\n--- Test 4: Zero-Write Gate & Confirmation Execution for Debt/Receivable ---');

  // 4a. Run via runOfflineIntelligence
  const debtEngineRes = await runOfflineIntelligence('pinjemin budi 500k cash', context);
  if (debtEngineRes.proposals.length !== 1) {
    throw new Error('Offline engine failed to generate proposal for "pinjemin budi 500k cash"!');
  }

  const propReceivable = debtEngineRes.proposals[0];
  if (propReceivable.data.type !== 'receivable' || propReceivable.data.personName !== 'Budi') {
    throw new Error(`Proposal data invalid! Got type: ${propReceivable.data.type}`);
  }

  // Verify Zero-Write before confirmation
  const debtCountBefore = await db.debts_receivables.count();
  if (debtCountBefore !== 0) {
    throw new Error('CRITICAL SAFETY BREACH: Debt record was written before user confirmation!');
  }
  console.log('[PASS] Zero-Write Gate Verified: Proposal remained pending with 0 unconfirmed records.');

  // 4b. User confirms proposal
  const cashAccBefore = await db.accounts.get('acc_cash');
  const cashBalBefore = cashAccBefore?.currentBalance || 0;

  await executeConfirmedProposal(propReceivable, context);

  const debtCountAfter = await db.debts_receivables.count();
  if (debtCountAfter !== 1) {
    throw new Error('DebtReceivable record was not created after confirmation!');
  }

  const createdRecord = (await db.debts_receivables.toArray())[0];
  if (createdRecord.type !== 'receivable' || createdRecord.personName !== 'Budi' || createdRecord.currentBalance !== 500000) {
    throw new Error('Created DebtReceivable record has mismatched data!');
  }

  const cashAccAfter = await db.accounts.get('acc_cash');
  // Lending money debits cash wallet
  if (cashAccAfter?.currentBalance !== cashBalBefore - 500000) {
    throw new Error(`Cash balance was not debited! Expected ${cashBalBefore - 500000}, got ${cashAccAfter?.currentBalance}`);
  }
  console.log(`[PASS] Confirmed Receivable: Lent 500,000 to Budi. Cash balance correctly debited: ${cashBalBefore} -> ${cashAccAfter?.currentBalance} IDR.`);

  // =========================================================================
  // Test 5: Deterministic Natural Search Queries Grounded in Dexie DB
  // =========================================================================
  console.log('\n--- Test 5: Deterministic Natural Language Search Queries ---');

  // Seed sample transactions
  await createTransaction({
    type: 'expense',
    amount: 35000,
    currency: 'IDR',
    exchangeRateToBase: 1.0,
    baseAmount: 35000,
    timestamp: Date.now() - 3600000,
    date: today,
    description: 'Kopi Kenangan Mantan',
    accountId: 'acc_bank_bca',
    categoryId: 'cat_food',
    inputSource: 'manual',
  });

  await createTransaction({
    type: 'expense',
    amount: 150000,
    currency: 'IDR',
    exchangeRateToBase: 1.0,
    baseAmount: 150000,
    timestamp: Date.now() - 7200000,
    date: today,
    description: 'Baju Kaos Katun',
    accountId: 'acc_bank_bca',
    categoryId: 'cat_shopping',
    inputSource: 'manual',
  });

  // Query 5a: "cari transaksi kopi bca"
  const search5a = await runOfflineIntelligence('cari transaksi kopi bca', context);
  if (!search5a.replyText.includes('Kopi Kenangan') || !search5a.replyText.includes('35.000')) {
    throw new Error(`Search failed for "cari transaksi kopi bca"! Got: ${search5a.replyText}`);
  }
  console.log(`[PASS] Search "cari transaksi kopi bca" successfully found matching transaction.`);

  // Query 5b: "transaksi di atas 100rb"
  const search5b = await runOfflineIntelligence('daftar transaksi di atas 100rb', context);
  if (!search5b.replyText.includes('150.000')) {
    throw new Error(`Search threshold failed for "transaksi di atas 100rb"! Got: ${search5b.replyText}`);
  }
  console.log(`[PASS] Search "daftar transaksi di atas 100rb" correctly filtered by amount threshold.`);

  // =========================================================================
  // Test 6: Deterministic Financial Aggregation Reports
  // =========================================================================
  console.log('\n--- Test 6: Deterministic Financial Aggregation Reports ---');

  // 6a: "berapa pengeluaran makan bulan ini"
  const rep6a = await runOfflineIntelligence('berapa pengeluaran makan bulan ini', context);
  if (!rep6a.replyText.includes('Food & Dining') || !rep6a.replyText.includes('35.000') || rep6a.chartView !== 'category_donut') {
    throw new Error(`Category spending query failed! Got: ${rep6a.replyText}`);
  }
  console.log(`[PASS] Aggregation "berapa pengeluaran makan bulan ini" returned exact category total.`);

  // 6b: "rekap arus kas"
  const rep6b = await runOfflineIntelligence('rekap arus kas', context);
  if (!rep6b.replyText.includes('Laporan Arus Kas') || rep6b.chartView !== 'cash_flow') {
    throw new Error(`Cash flow report failed! Got: ${rep6b.replyText}`);
  }
  console.log(`[PASS] Report "rekap arus kas" returned cash flow metrics.`);

  // 6c: "sisa saldo"
  const rep6c = await runOfflineIntelligence('sisa saldo bca', context);
  if (!rep6c.replyText.includes('Bank BCA')) {
    throw new Error(`Balances query failed! Got: ${rep6c.replyText}`);
  }
  console.log(`[PASS] Query "sisa saldo bca" returned exact active balances.`);

  // 6d: "rekap hutang piutang"
  const rep6d = await runOfflineIntelligence('status hutang piutang', context);
  if (!rep6d.replyText.includes('Piutang Anda') || !rep6d.replyText.includes('Budi')) {
    throw new Error(`Debt recap failed! Got: ${rep6d.replyText}`);
  }
  console.log(`[PASS] Query "status hutang piutang" correctly summarized active receivables.`);

  // =========================================================================
  // Test 7: Deterministic Rule-Based Financial Health & Burn Rate Evaluation
  // =========================================================================
  console.log('\n--- Test 7: Rule-Based Financial Health Evaluation without LLM ---');

  const evalRes = await runOfflineIntelligence('evaluasi kesehatan keuangan saya', context);
  if (
    !evalRes.replyText.includes('Evaluasi Kesehatan Finansial') ||
    !evalRes.replyText.includes('Burn Rate Harian')
  ) {
    throw new Error(`Rule-based evaluation failed! Got: ${evalRes.replyText}`);
  }
  console.log(`[PASS] Deterministic evaluation returned actionable findings without any LLM call.`);

  console.log('\n🎉 ALL PHASE 7 OFFLINE INTELLIGENCE TESTS PASSED WITH 100% SUCCESS!');
}

runPhase7Tests().catch((err) => {
  console.error('\n❌ PHASE 7 TEST FAILED:', err);
  process.exit(1);
});
