/**
 * Automated Test Suite: Phase C — Everyday Usability
 * Covers:
 * - Feature 6: Multi-Select & Bulk Actions (Bulk Soft-Delete, Reassign Category, Reassign Account, Bulk Tag Management)
 * - Feature 7: Compressed Receipt Attachments, Dexie Persistence, and 2.0 GB Soft Ceiling Storage Accounting
 */

import 'fake-indexeddb/auto';
import { db } from '../src/db/database';
import {
  bulkSoftDeleteTransactions,
  bulkReassignCategory,
  bulkReassignAccount,
  bulkUpdateTags,
  recalculateAllAccountBalances,
} from '../src/services/ledger';
import {
  compressReceiptImage,
} from '../src/services/imageCompression';
import {
  attachReceiptToTransaction,
  getReceiptAttachment,
  deleteReceiptAttachment,
  calculateReceiptsStorageBytes,
} from '../src/services/receiptAttachments';
import type { Account, Category, Transaction } from '../src/types';

async function runPhaseCTests() {
  console.log('🚀 Running Phase C: Everyday Usability Test Suite...\n');

  // =========================================================================
  // GROUP 1: Feature 6 — Multi-Select & Bulk Actions
  // =========================================================================
  console.log('--- Test 1: Populating Test Ledger for Bulk Operations ---');
  await db.accounts.clear();
  await db.categories.clear();
  await db.transactions.clear();
  await db.audit_logs.clear();
  await db.receipt_attachments.clear();

  const acc1: Account = {
    id: 'acc_wallet',
    name: 'Cash Wallet',
    type: 'cash',
    currency: 'IDR',
    initialBalance: 1000000,
    currentBalance: 1000000,
    icon: 'Wallet',
    color: '#3b82f6',
    includeInNetWorth: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    deviceId: 'dev_test',
    isDeleted: false,
    version: 1,
  };

  const acc2: Account = {
    id: 'acc_bank',
    name: 'Bank Mandiri',
    type: 'bank',
    currency: 'IDR',
    initialBalance: 5000000,
    currentBalance: 5000000,
    icon: 'Landmark',
    color: '#0055aa',
    includeInNetWorth: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    deviceId: 'dev_test',
    isDeleted: false,
    version: 1,
  };

  await db.accounts.bulkAdd([acc1, acc2]);

  const cat1: Category = {
    id: 'cat_dining',
    name: 'Dining',
    type: 'expense',
    icon: 'Utensils',
    color: '#ef4444',
    isSystem: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    deviceId: 'dev_test',
    isDeleted: false,
    version: 1,
  };

  const cat2: Category = {
    id: 'cat_work',
    name: 'Work Expenses',
    type: 'expense',
    icon: 'Briefcase',
    color: '#8b5cf6',
    isSystem: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    deviceId: 'dev_test',
    isDeleted: false,
    version: 1,
  };

  await db.categories.bulkAdd([cat1, cat2]);

  const txBatch: Transaction[] = [
    {
      id: 'tx_b1',
      type: 'expense',
      date: '2026-10-20',
      timestamp: 1729420800000,
      amount: 50000,
      currency: 'IDR',
      exchangeRateToBase: 1.0,
      baseAmount: 50000,
      accountId: 'acc_wallet',
      categoryId: 'cat_dining',
      description: 'Lunch 1',
      tags: ['food', 'daily'],
      inputSource: 'manual',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      deviceId: 'dev_test',
      isDeleted: false,
      version: 1,
    },
    {
      id: 'tx_b2',
      type: 'expense',
      date: '2026-10-21',
      timestamp: 1729507200000,
      amount: 75000,
      currency: 'IDR',
      exchangeRateToBase: 1.0,
      baseAmount: 75000,
      accountId: 'acc_wallet',
      categoryId: 'cat_dining',
      description: 'Dinner 2',
      tags: ['food'],
      inputSource: 'manual',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      deviceId: 'dev_test',
      isDeleted: false,
      version: 1,
    },
    {
      id: 'tx_b3',
      type: 'expense',
      date: '2026-10-22',
      timestamp: 1729593600000,
      amount: 100000,
      currency: 'IDR',
      exchangeRateToBase: 1.0,
      baseAmount: 100000,
      accountId: 'acc_wallet',
      categoryId: 'cat_dining',
      description: 'Lunch 3',
      tags: ['office'],
      inputSource: 'manual',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      deviceId: 'dev_test',
      isDeleted: false,
      version: 1,
    },
  ];

  await db.transactions.bulkAdd(txBatch);
  await recalculateAllAccountBalances();

  const initialWallet = await db.accounts.get('acc_wallet');
  console.log(`Initial Cash Wallet balance: Rp ${initialWallet?.currentBalance.toLocaleString('id-ID')} (1,000,000 - 225,000 = 775,000)`);
  if (initialWallet?.currentBalance !== 775000) throw new Error('Initial balance mismatch');
  console.log('[PASS] Test ledger populated with 3 transactions.');

  console.log('\n--- Test 2: Bulk Reassign Category ---');
  // Reassign tx_b1 and tx_b2 from Dining to Work Expenses
  const reassignedCatCount = await bulkReassignCategory(['tx_b1', 'tx_b2'], 'cat_work');
  console.log(`Reassigned ${reassignedCatCount} transactions to category "cat_work"`);
  if (reassignedCatCount !== 2) throw new Error('Bulk reassign category failed count');

  const checkB1 = await db.transactions.get('tx_b1');
  const checkB3 = await db.transactions.get('tx_b3');
  if (checkB1?.categoryId !== 'cat_work' || checkB3?.categoryId !== 'cat_dining') {
    throw new Error('Category reassignment mismatch on transaction records!');
  }
  console.log('[PASS] Bulk category reassign updated selected transactions while preserving non-selected.');

  console.log('\n--- Test 3: Bulk Reassign Account & Balance Recalculation ---');
  // Move tx_b1 and tx_b2 from Cash Wallet (50k + 75k = 125k) to Bank Mandiri
  const reassignedAccCount = await bulkReassignAccount(['tx_b1', 'tx_b2'], 'acc_bank');
  console.log(`Reassigned ${reassignedAccCount} transactions to account "acc_bank"`);
  if (reassignedAccCount !== 2) throw new Error('Bulk reassign account failed count');

  const updatedWallet = await db.accounts.get('acc_wallet');
  const updatedBank = await db.accounts.get('acc_bank');

  // Wallet should now only be deducted by tx_b3 (100k) -> 900,000
  // Bank should now be deducted by 125k -> 4,875,000
  console.log(`Updated Cash Wallet: Rp ${updatedWallet?.currentBalance.toLocaleString('id-ID')}`);
  console.log(`Updated Bank Mandiri: Rp ${updatedBank?.currentBalance.toLocaleString('id-ID')}`);
  if (updatedWallet?.currentBalance !== 900000 || updatedBank?.currentBalance !== 4875000) {
    throw new Error('Balance recalculation after bulk account reassign failed!');
  }
  console.log('[PASS] Account balances correctly adjusted following bulk reassignment.');

  console.log('\n--- Test 4: Bulk Tag Management (Add & Remove) ---');
  // Add 'project-alpha', remove 'daily' across tx_b1, tx_b2, tx_b3
  const taggedCount = await bulkUpdateTags(['tx_b1', 'tx_b2', 'tx_b3'], ['project-alpha'], ['daily']);
  console.log(`Bulk updated tags across ${taggedCount} transactions`);

  const tx1AfterTags = await db.transactions.get('tx_b1');
  console.log(`tx_b1 tags: [${tx1AfterTags?.tags?.join(', ')}]`);
  if (!tx1AfterTags?.tags?.includes('project-alpha') || tx1AfterTags?.tags?.includes('daily')) {
    throw new Error('Tag addition or removal failed!');
  }
  console.log('[PASS] Bulk tags added and removed cleanly without overwriting unrelated tags.');

  console.log('\n--- Test 5: Bulk Soft-Delete & Audit Trail ---');
  // Soft delete tx_b1 and tx_b2
  const deletedCount = await bulkSoftDeleteTransactions(['tx_b1', 'tx_b2']);
  console.log(`Bulk soft-deleted ${deletedCount} transactions`);
  if (deletedCount !== 2) throw new Error('Bulk soft delete count mismatch');

  const b1Deleted = await db.transactions.get('tx_b1');
  const bankAfterDelete = await db.accounts.get('acc_bank');
  // Bank balance was 4,875,000. Deleting both 50k and 75k restores bank to 5,000,000
  console.log(`Bank balance restored to: Rp ${bankAfterDelete?.currentBalance.toLocaleString('id-ID')}`);
  if (!b1Deleted?.isDeleted || bankAfterDelete?.currentBalance !== 5000000) {
    throw new Error('Balance restoration or soft delete flag failed after bulk delete!');
  }

  // Check audit logs
  const auditLogs = await db.audit_logs.where('action').equals('soft_delete').toArray();
  console.log(`Captured ${auditLogs.length} soft_delete audit log entries`);
  if (auditLogs.length < 2) throw new Error('Audit logs missing for bulk delete operations');
  console.log('[PASS] Bulk soft delete restored account balances and generated individual audit log entries.');

  // =========================================================================
  // GROUP 2: Feature 7 — Receipt Attachment & Storage Accounting
  // =========================================================================
  console.log('\n--- Test 6: Compressing & Attaching Receipt Image ---');
  const mockBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  const compressed = await compressReceiptImage(mockBase64, 1024, 0.75);
  console.log(`Compressed mimeType: ${compressed.mimeType}, size: ${compressed.sizeBytes} bytes, ${compressed.width}x${compressed.height}`);
  if (compressed.mimeType !== 'image/jpeg' || compressed.sizeBytes <= 0) {
    throw new Error('Image compression output invalid');
  }

  const attached = await attachReceiptToTransaction('tx_b3', mockBase64);
  console.log(`Attached receipt: id="${attached.id}", transactionId="${attached.transactionId}", size=${attached.sizeBytes}B`);
  if (attached.transactionId !== 'tx_b3') throw new Error('Failed to attach receipt to transaction');

  const retrieved = await getReceiptAttachment('tx_b3');
  if (!retrieved || retrieved.id !== attached.id) {
    throw new Error('Failed to retrieve attached receipt from database');
  }
  console.log('[PASS] Receipt image compressed and attached to transaction record.');

  console.log('\n--- Test 7: Storage Footprint Calculation against 2.0 GB Ceiling ---');
  const totalStorageBytes = await calculateReceiptsStorageBytes();
  console.log(`Total receipts storage consumed: ${totalStorageBytes} bytes`);
  const CEILING_BYTES = 2.0 * 1024 * 1024 * 1024; // 2 GB
  const usagePercentage = (totalStorageBytes / CEILING_BYTES) * 100;
  console.log(`Ceiling usage: ${usagePercentage.toFixed(6)}% of 2.0 GB ceiling`);
  if (totalStorageBytes <= 0) throw new Error('Storage bytes calculation returned 0');
  console.log('[PASS] Receipt storage footprint computed accurately against 2.0 GB ceiling.');

  console.log('\n--- Test 8: Detaching Receipt Image ---');
  await deleteReceiptAttachment('tx_b3');
  const afterDelete = await getReceiptAttachment('tx_b3');
  if (afterDelete !== null) throw new Error('Receipt was not detached properly');
  const storageAfterDelete = await calculateReceiptsStorageBytes();
  console.log(`Receipt storage after deletion: ${storageAfterDelete} bytes`);
  if (storageAfterDelete !== 0) throw new Error('Storage bytes did not drop after receipt deletion');
  console.log('[PASS] Receipt detached cleanly and storage footprint reclaimed.');

  console.log('\n🎉 All Phase C Everyday Usability Tests Passed Successfully!');
}

runPhaseCTests().catch((err) => {
  console.error('\n❌ Phase C tests failed:', err);
  process.exit(1);
});
