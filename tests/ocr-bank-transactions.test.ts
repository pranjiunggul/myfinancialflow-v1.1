/**
 * Test Suite: Indonesian Bank Account & Transaction Image Recognition (OCR Engine)
 * Tests:
 * 1. BCA Mobile / myBCA Transfer Receipt parsing (Amounts with Indonesian dots & commas, recipient, ref no)
 * 2. Mandiri Livin' Transfer Receipt parsing (Indonesian date "Okt", nominal, admin fee, total, accounts)
 * 3. BRImo Transfer to E-Wallet (DANA/OVO/GoPay, amount, notes/catatan)
 * 4. QRIS Merchant Payment Receipt
 * 5. Mutasi Rekening / Transfer Masuk (Income)
 * 6. Action Proposal mapping: Account matching, Category matching, TransferMeta, and Type detection
 */

import { parseReceiptText, createProposalFromOCR, parseCurrencyAmount, parseIndonesianDate } from '../src/services/ocr';
import type { Account, Category, CurrencyCode } from '../src/types';

async function runTests() {
  console.log('🚀 Starting Indonesian Bank Account & OCR Transaction Parser Test Suite...\n');

  // Sample Mock Accounts
  const accounts: Account[] = [
    {
      id: 'acc_bca',
      name: 'Bank BCA',
      type: 'bank',
      currency: 'IDR',
      initialBalance: 10000000,
      currentBalance: 10000000,
      icon: 'Landmark',
      color: '#00529C',
      includeInNetWorth: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      deviceId: 'dev_test',
      isDeleted: false,
      version: 1,
    },
    {
      id: 'acc_mandiri',
      name: 'Tabungan Mandiri',
      type: 'bank',
      currency: 'IDR',
      initialBalance: 5000000,
      currentBalance: 5000000,
      icon: 'Landmark',
      color: '#FDB813',
      includeInNetWorth: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      deviceId: 'dev_test',
      isDeleted: false,
      version: 1,
    },
    {
      id: 'acc_dana',
      name: 'DANA Dompet Digital',
      type: 'ewallet',
      currency: 'IDR',
      initialBalance: 200000,
      currentBalance: 200000,
      icon: 'Wallet',
      color: '#118EEA',
      includeInNetWorth: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      deviceId: 'dev_test',
      isDeleted: false,
      version: 1,
    },
  ];

  // Sample Mock Categories
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
      deviceId: 'dev_test',
      isDeleted: false,
      version: 1,
    },
    {
      id: 'cat_salary',
      name: 'Salary & Income',
      type: 'income',
      icon: 'Briefcase',
      color: '#10b981',
      isSystem: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      deviceId: 'dev_test',
      isDeleted: false,
      version: 1,
    },
    {
      id: 'cat_transfer',
      name: 'Account Transfer',
      type: 'both',
      icon: 'ArrowLeftRight',
      color: '#6366f1',
      isSystem: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      deviceId: 'dev_test',
      isDeleted: false,
      version: 1,
    },
  ];

  const baseCurrency: CurrencyCode = 'IDR';

  // --- Test 1: Number & Indonesian Date Parser ---
  console.log('--- Test 1: Indonesian Currency & Date Resolution ---');
  if (parseCurrencyAmount('150.000') !== 150000) throw new Error('parseCurrencyAmount("150.000") failed');
  if (parseCurrencyAmount('150.000,00') !== 150000) throw new Error('parseCurrencyAmount("150.000,00") failed');
  if (parseCurrencyAmount('1.500.000') !== 1500000) throw new Error('parseCurrencyAmount("1.500.000") failed');
  if (parseCurrencyAmount('2.500') !== 2500) throw new Error('parseCurrencyAmount("2.500") failed');
  if (parseIndonesianDate('24 Okt 2026') !== '2026-10-24') throw new Error('parseIndonesianDate("24 Okt 2026") failed');
  if (parseIndonesianDate('15 Desember 2026') !== '2026-12-15') throw new Error('parseIndonesianDate("15 Desember 2026") failed');
  console.log('[PASS] Indonesian Rupiah formatting and Indonesian month date strings parsed with 100% precision.');

  // --- Test 2: BCA Mobile Transfer Receipt ---
  console.log('\n--- Test 2: BCA Mobile Transfer Receipt Parsing ---');
  const bcaSample = `
m-Transfer
BERHASIL
24/10/2026 14:32:05
No. Referensi: 9283748291
Sumber Dana: 1234567890 (BCA)
Rekening Tujuan: 0987654321
Nama Penerima: AHMAD FAUZI
Bank: BCA
Jumlah: Rp 150.000,00
Berita: Uang makan
`;
  const bcaResult = parseReceiptText(bcaSample);
  if (bcaResult.totalAmount !== 150000) throw new Error(`BCA totalAmount expected 150000, got ${bcaResult.totalAmount}`);
  if (bcaResult.date !== '2026-10-24') throw new Error(`BCA date expected 2026-10-24, got ${bcaResult.date}`);
  if (bcaResult.recipientName !== 'AHMAD FAUZI') throw new Error(`BCA recipient expected AHMAD FAUZI, got ${bcaResult.recipientName}`);
  if (bcaResult.referenceNumber !== '9283748291') throw new Error(`BCA ref expected 9283748291, got ${bcaResult.referenceNumber}`);
  console.log('[PASS] BCA Mobile transfer: correctly parsed amount 150,000 IDR, recipient "AHMAD FAUZI", ref no "9283748291".');

  // --- Test 3: Mandiri Livin' Transfer Receipt with Admin Fee ---
  console.log('\n--- Test 3: Mandiri Livin Transfer with Admin Fee ---');
  const mandiriSample = `
Transfer Berhasil
24 Okt 2026, 09:30 WIB
Nominal Transfer
Rp 250.000
Biaya Transfer
Rp 2.500
Total Transaksi
Rp 252.500
Dari: Mandiri - 123456789
Kepada: SITI AMINAH - BRI
Catatan: Bayar kas
`;
  const mandiriResult = parseReceiptText(mandiriSample);
  if (mandiriResult.totalAmount !== 252500) throw new Error(`Mandiri totalAmount expected 252500, got ${mandiriResult.totalAmount}`);
  if (mandiriResult.nominalAmount !== 250000) throw new Error(`Mandiri nominalAmount expected 250000, got ${mandiriResult.nominalAmount}`);
  if (mandiriResult.feeAmount !== 2500) throw new Error(`Mandiri feeAmount expected 2500, got ${mandiriResult.feeAmount}`);
  if (mandiriResult.date !== '2026-10-24') throw new Error(`Mandiri date expected 2026-10-24, got ${mandiriResult.date}`);
  console.log('[PASS] Mandiri Livin transfer: correctly parsed Nominal (250,000), Fee (2,500), Total (252,500), Date (2026-10-24).');

  // --- Test 4: Transfer Between User Accounts (BCA -> DANA) ---
  console.log('\n--- Test 4: Transfer Between User Accounts (BCA to DANA) ---');
  const briToDanaSample = `
Transaksi Berhasil
24/10/2026 12:45
Nominal: Rp. 500.000
Biaya Admin: Rp. 0
Sumber Dana: Bank BCA - 1234567890
Tujuan: DANA - 08123456789
Catatan: Top up dana
`;
  const danaResult = parseReceiptText(briToDanaSample);
  const danaProposal = createProposalFromOCR(
    { ...danaResult, confidence: 95, imageHash: 'hash_dana_123' },
    accounts,
    categories,
    baseCurrency
  );

  if (danaProposal.data.type !== 'transfer') {
    throw new Error(`Expected proposal type 'transfer', got '${danaProposal.data.type}'`);
  }
  if (danaProposal.data.accountId !== 'acc_bca') {
    throw new Error(`Expected source account 'acc_bca', got '${danaProposal.data.accountId}'`);
  }
  if (danaProposal.data.transferMeta?.toAccountId !== 'acc_dana') {
    throw new Error(`Expected dest account 'acc_dana', got '${danaProposal.data.transferMeta?.toAccountId}'`);
  }
  console.log('[PASS] Account-to-account transfer automatically mapped source account "Bank BCA" and destination "DANA Dompet Digital".');

  // --- Test 5: Transfer Masuk (Income) Recognition ---
  console.log('\n--- Test 5: Mutasi Transfer Masuk (Income) Parsing ---');
  const transferMasukSample = `
m-Transfer
TRANSFER MASUK
24 Okt 2026
Dari: PT TEKNOLOGI JAYA
Ke: BCA - 1234567890
Jumlah: Rp 5.000.000,00
Berita: Gaji Oktober
`;
  const masukResult = parseReceiptText(transferMasukSample);
  const masukProposal = createProposalFromOCR(
    { ...masukResult, confidence: 96, imageHash: 'hash_gaji_999' },
    accounts,
    categories,
    baseCurrency
  );

  if (masukProposal.data.type !== 'income') {
    throw new Error(`Expected proposal type 'income', got '${masukProposal.data.type}'`);
  }
  if (masukProposal.data.amount !== 5000000) {
    throw new Error(`Expected amount 5,000,000, got ${masukProposal.data.amount}`);
  }
  if (masukProposal.data.accountId !== 'acc_bca') {
    throw new Error(`Expected destination account 'acc_bca', got '${masukProposal.data.accountId}'`);
  }
  console.log('[PASS] Mutasi Transfer Masuk: correctly recognized as INCOME of 5,000,000 IDR deposited into "Bank BCA".');

  // --- Test 6: QRIS Merchant Payment Recognition ---
  console.log('\n--- Test 6: QRIS Payment Slip Parsing ---');
  const qrisSample = `
QRIS
Pembayaran Berhasil
24/10/2026 19:10
Merchant: KOPI KENANGAN SENAYAN
Nominal: Rp 38.500
Sumber Dana: Bank BCA
No Ref: 20261024098234
`;
  const qrisResult = parseReceiptText(qrisSample);
  const qrisProposal = createProposalFromOCR(
    { ...qrisResult, confidence: 94, imageHash: 'hash_qris_44' },
    accounts,
    categories,
    baseCurrency
  );

  if (qrisProposal.data.type !== 'expense') {
    throw new Error(`Expected QRIS type 'expense', got '${qrisProposal.data.type}'`);
  }
  if (qrisProposal.data.amount !== 38500) {
    throw new Error(`Expected amount 38,500, got ${qrisProposal.data.amount}`);
  }
  if (!qrisProposal.data.description?.includes('KOPI KENANGAN')) {
    throw new Error(`Expected description to include KOPI KENANGAN, got '${qrisProposal.data.description}'`);
  }
  console.log('[PASS] QRIS payment: correctly identified merchant "KOPI KENANGAN SENAYAN", amount 38,500 IDR, expense type.');

  console.log('\n🎉 ALL INDONESIAN BANK ACCOUNT & OCR TRANSACTION PARSER TESTS PASSED WITH 100% SUCCESS!');
}

runTests().catch((err) => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
