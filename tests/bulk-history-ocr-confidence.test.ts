/**
 * Automated Test Suite:
 * 1. OCR Confidence & False-Success Safety Fix Verification
 *    - Low-confidence OCR results (< 70%) flagged with isLowConfidence === true
 *    - Unparsed total amount is NOT silently defaulted to 0; left undefined/flagged with unparsedAmount === true
 *    - Proposal summary warns [Nominal Belum Terdeteksi]
 * 2. Bulk Transaction History Screenshot OCR Engine Verification
 *    - Multi-row parsing (e.g. ShopeePay, GoPay, BCA mutasi screenshot text)
 *    - Repeated row extraction with amounts, dates, and transaction types (+income, -expense)
 *    - Auto-suggestion of account and category
 *    - Deduplication against existing ledger transactions
 *    - Batch commitment to ledger with atomic balance recalculations
 */

import 'fake-indexeddb/auto';
import { db, initializeDatabaseSeed } from '../src/db/database';
import { parseReceiptText, createProposalFromOCR } from '../src/services/ocr';
import { parseHistoryTextToRows } from '../src/services/bulkHistoryOcr';
import { createTransaction } from '../src/services/ledger';
import type { Account, Category, CurrencyCode } from '../src/types';

async function runTests() {
  console.log('🚀 Starting OCR Confidence UX Fix & Bulk History Screenshot Test Suite...\n');

  await initializeDatabaseSeed();

  const accounts: Account[] = [
    {
      id: 'acc_bca',
      name: 'Bank BCA',
      type: 'bank',
      currency: 'IDR',
      initialBalance: 5000000,
      currentBalance: 5000000,
      icon: 'Landmark',
      color: '#00529C',
      includeInNetWorth: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      deviceId: 'local',
      isDeleted: false,
      version: 1,
    },
    {
      id: 'acc_shopeepay',
      name: 'ShopeePay',
      type: 'ewallet',
      currency: 'IDR',
      initialBalance: 1000000,
      currentBalance: 1000000,
      icon: 'Wallet',
      color: '#EE4D2D',
      includeInNetWorth: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      deviceId: 'local',
      isDeleted: false,
      version: 1,
    },
  ];

  const categories: Category[] = [
    {
      id: 'cat_food',
      name: 'Food & Beverage',
      type: 'expense',
      icon: 'Utensils',
      color: '#ef4444',
      isSystem: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      deviceId: 'local',
      isDeleted: false,
      version: 1,
    },
    {
      id: 'cat_transport',
      name: 'Transportation',
      type: 'expense',
      icon: 'Car',
      color: '#3b82f6',
      isSystem: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      deviceId: 'local',
      isDeleted: false,
      version: 1,
    },
    {
      id: 'cat_income',
      name: 'Salary & Income',
      type: 'income',
      icon: 'Briefcase',
      color: '#10b981',
      isSystem: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      deviceId: 'local',
      isDeleted: false,
      version: 1,
    },
  ];

  // Persist mock accounts and categories to database
  await db.accounts.bulkPut(accounts);
  await db.categories.bulkPut(categories);

  const baseCurrency: CurrencyCode = 'IDR';

  // =========================================================================
  // Test 1: OCR False-Success Safety Fix — Unparsed Amount & Low Confidence
  // =========================================================================
  console.log('--- Test 1: OCR False-Success Safety Fix (Unparsed Amount) ---');

  // Text with blurry/missing total amount
  const blurryReceiptText = `
    KAFE SENJA KOPI
    Jl. Melawai No. 12 Jakarta
    Kasir: Budi
    Pesanan: 2x Kopi Susu Aren
    [Angka buram / tidak terbaca]
    Terima Kasih Atas Kunjungan Anda!
  `;

  const parsedBlurry = parseReceiptText(blurryReceiptText);

  // Assertion A: totalAmount must NOT be 0
  if (parsedBlurry.totalAmount !== undefined) {
    throw new Error(`Expected totalAmount to be undefined for unparsed amount, but got ${parsedBlurry.totalAmount}`);
  }

  // Assertion B: unparsedAmount and isLowConfidence must be flagged
  if (!parsedBlurry.unparsedAmount) {
    throw new Error('Expected unparsedAmount to be true when amount could not be detected!');
  }
  if (!parsedBlurry.isLowConfidence) {
    throw new Error('Expected isLowConfidence to be true when amount is unparsed!');
  }

  console.log('[PASS] Unparsed amount correctly flagged: totalAmount is undefined and unparsedAmount === true.');

  // Assertion C: Proposal summary must NOT say "0 IDR"
  const proposalBlurry = createProposalFromOCR(
    {
      ...parsedBlurry,
      confidence: 45, // low confidence
      imageHash: 'hash_test_blurry',
      isLowConfidence: true,
      unparsedAmount: true,
    },
    accounts,
    categories,
    baseCurrency
  );

  if (proposalBlurry.summary.includes('0 IDR')) {
    throw new Error(`Misleading summary generated! Summary contained "0 IDR": ${proposalBlurry.summary}`);
  }
  if (!proposalBlurry.summary.includes('[Nominal Belum Terdeteksi]')) {
    throw new Error(`Expected summary to contain "[Nominal Belum Terdeteksi]", got: ${proposalBlurry.summary}`);
  }
  if (proposalBlurry.data.amount !== undefined) {
    throw new Error(`Expected proposal.data.amount to be undefined, got: ${proposalBlurry.data.amount}`);
  }

  console.log(`[PASS] Low-confidence proposal generated safely with warning summary: "${proposalBlurry.summary}"`);

  // =========================================================================
  // Test 2: Bulk History Screenshot OCR Multi-Row Parsing
  // =========================================================================
  console.log('\n--- Test 2: Bulk History Screenshot OCR Multi-Row Parsing ---');

  const shopeePayHistoryScreenshotText = `
    ShopeePay Riwayat Transaksi
    Bulan Oktober 2026

    24 Okt 2026
    Pembayaran QRIS Kopi Kenangan Senayan
    - Rp 35.000
    Berhasil

    24 Okt 2026
    Top Up dari Bank BCA
    + Rp 200.000
    Berhasil

    23 Okt 2026
    GrabFood Ayam Geprek Bensu
    - Rp 48.500
    Berhasil

    22 Okt 2026
    Transfer ke Budi Pratama
    - Rp 150.000
    Berhasil
  `;

  const rows = await parseHistoryTextToRows(
    shopeePayHistoryScreenshotText,
    'hash_shopee_history_1',
    accounts,
    categories,
    baseCurrency
  );

  if (rows.length !== 4) {
    throw new Error(`Expected 4 rows parsed from history screenshot, got ${rows.length}`);
  }

  console.log(`[PASS] Detected ${rows.length} discrete transaction rows from ShopeePay screenshot.`);

  // Row 1: QRIS Kopi Kenangan
  const r1 = rows[0];
  if (r1.amount !== 35000 || r1.type !== 'expense') {
    throw new Error(`Row 1 mismatch: expected 35000 expense, got ${r1.amount} ${r1.type}`);
  }
  if (!r1.description.toLowerCase().includes('kopi')) {
    throw new Error(`Row 1 description mismatch: ${r1.description}`);
  }
  if (r1.suggestedAccountId !== 'acc_shopeepay') {
    throw new Error(`Expected account to be auto-detected as ShopeePay, got: ${r1.suggestedAccountId}`);
  }
  if (r1.suggestedCategoryId !== 'cat_food') {
    throw new Error(`Expected category to be auto-suggested as Food & Beverage, got: ${r1.suggestedCategoryId}`);
  }
  console.log(`[PASS] Row 1: ${r1.date} | ${r1.description} | -${r1.amount} IDR (${r1.suggestedCategoryName})`);

  // Row 2: Top Up (Income)
  const r2 = rows[1];
  if (r2.amount !== 200000 || r2.type !== 'income') {
    throw new Error(`Row 2 mismatch: expected 200000 income, got ${r2.amount} ${r2.type}`);
  }
  console.log(`[PASS] Row 2: ${r2.date} | ${r2.description} | +${r2.amount} IDR (Type: ${r2.type})`);

  // Row 3: GrabFood
  const r3 = rows[2];
  if (r3.amount !== 48500 || r3.type !== 'expense') {
    throw new Error(`Row 3 mismatch: expected 48500 expense, got ${r3.amount}`);
  }
  console.log(`[PASS] Row 3: ${r3.date} | ${r3.description} | -${r3.amount} IDR`);

  // =========================================================================
  // Test 3: Deduplication Against Existing Ledger Transactions
  // =========================================================================
  console.log('\n--- Test 3: History Row Deduplication Against Ledger ---');

  // Pre-seed an existing transaction in the ledger matching Row 1
  await createTransaction({
    accountId: 'acc_shopeepay',
    categoryId: 'cat_food',
    type: 'expense',
    amount: 35000,
    currency: 'IDR',
    description: 'Pembayaran QRIS Kopi Kenangan Senayan',
    date: '2026-10-24',
  });

  // Re-run parser over the same screenshot
  const rowsAfterLedgerSeed = await parseHistoryTextToRows(
    shopeePayHistoryScreenshotText,
    'hash_shopee_history_1',
    accounts,
    categories,
    baseCurrency
  );

  const duplicateRow = rowsAfterLedgerSeed[0];
  if (!duplicateRow.isDuplicate) {
    throw new Error('Expected Row 1 to be flagged as isDuplicate === true because it exists in the ledger!');
  }
  if (duplicateRow.selected !== false) {
    throw new Error('Expected duplicate row to be deselected by default for safety!');
  }
  console.log(`[PASS] Duplicate row safely detected: "${duplicateRow.duplicateReason}" (selected: ${duplicateRow.selected})`);

  // Non-duplicates should still be selected by default
  const nonDuplicateRow = rowsAfterLedgerSeed[1];
  if (nonDuplicateRow.isDuplicate) {
    throw new Error('Expected Row 2 to not be flagged as duplicate!');
  }
  if (!nonDuplicateRow.selected) {
    throw new Error('Expected non-duplicate row to remain selected by default!');
  }
  console.log('[PASS] Non-duplicate rows remained selected by default.');

  // =========================================================================
  // Test 4: Batch Import Selected Rows into Ledger
  // =========================================================================
  console.log('\n--- Test 4: Batch Import Execution & Balance Recalculation ---');

  const initialShopeeBalance = (await db.accounts.get('acc_shopeepay'))?.currentBalance || 0;

  // Import selected rows (Row 2, 3, 4: +200k, -48.5k, -150k = net +1.5k)
  const selectedToImport = rowsAfterLedgerSeed.filter((r) => r.selected);
  for (const row of selectedToImport) {
    await createTransaction({
      accountId: row.suggestedAccountId,
      categoryId: row.suggestedCategoryId,
      type: row.type,
      amount: row.amount,
      currency: row.currency,
      description: row.description,
      date: row.date,
    });
  }

  const finalShopeeBalance = (await db.accounts.get('acc_shopeepay'))?.currentBalance || 0;
  const expectedBalance = initialShopeeBalance + 200000 - 48500 - 150000;

  if (finalShopeeBalance !== expectedBalance) {
    throw new Error(`Expected final account balance ${expectedBalance}, got ${finalShopeeBalance}`);
  }

  console.log(`[PASS] Batch imported ${selectedToImport.length} rows. Account balance recalculated accurately: ${initialShopeeBalance} -> ${finalShopeeBalance} IDR.`);

  console.log('\n🎉 ALL OCR CONFIDENCE UX FIX & BULK HISTORY SCREENSHOT TESTS PASSED! 🎉\n');
}

runTests().catch((err) => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
