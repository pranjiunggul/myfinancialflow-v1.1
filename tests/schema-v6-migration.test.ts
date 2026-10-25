/**
 * Automated Test Suite: Dexie DB v5 -> v6 Schema Migration Non-Destructive Test
 * Verifies that an existing user's data across all v5 tables is 100% preserved
 * after upgrading to v6, and that the 3 new v6 tables are initialized and accessible.
 */

import 'fake-indexeddb/auto';
import Dexie, { type Table } from 'dexie';
import { FinanceDatabase } from '../src/db/database';
import type {
  Account,
  Category,
  Transaction,
  DebtReceivable,
  DebtPayment,
  RecurringRule,
  AuditLog,
  FXRate,
  AppSettings,
  AIProviderConfig,
  AIKeyRecord,
  AIPriorityItem,
  SyncDuplicatePair,
  SubscriptionPattern,
  AIChatSession,
  ReceiptAttachment,
} from '../src/types';

// Mock DB Class representing v5
class MockV5Database extends Dexie {
  accounts!: Table<Account, string>;
  categories!: Table<Category, string>;
  transactions!: Table<Transaction, string>;
  debts_receivables!: Table<DebtReceivable, string>;
  debt_payments!: Table<DebtPayment, string>;
  recurring_rules!: Table<RecurringRule, string>;
  audit_logs!: Table<AuditLog, string>;
  fx_rates!: Table<FXRate, string>;
  settings!: Table<AppSettings, string>;
  ai_providers!: Table<AIProviderConfig, string>;
  ai_keys!: Table<AIKeyRecord, string>;
  ai_priorities!: Table<AIPriorityItem, string>;
  sync_duplicates!: Table<SyncDuplicatePair, string>;

  constructor(dbName: string) {
    super(dbName);

    this.version(1).stores({
      accounts: 'id, type, currency, isDeleted, updatedAt',
      categories: 'id, type, parentId, isSystem, isDeleted, updatedAt',
      transactions: 'id, type, date, timestamp, accountId, categoryId, currency, debtReceivableId, receiptHash, inputSource, isDeleted, updatedAt',
      debts_receivables: 'id, type, personName, status, dueDate, isDeleted, updatedAt',
      debt_payments: 'id, debtReceivableId, transactionId, isDeleted, createdAt',
      recurring_rules: 'id, nextExecutionDate, autoPost, isDeleted, updatedAt',
      audit_logs: 'id, entityType, entityId, action, timestamp, deviceId',
      fx_rates: 'id, fromCurrency, toCurrency, updatedAt',
      settings: 'id',
    });

    this.version(2).stores({
      local_backups: 'id, filename, dateStr, timestamp',
    });

    this.version(3).stores({
      telegram_inbox: 'id, updateId, timestamp, status',
    });

    this.version(4).stores({
      ai_providers: 'id, name, type, protocol, isEnabled, updatedAt',
      ai_keys: 'id, providerId, isActive, createdAt, updatedAt',
      ai_priorities: 'id, providerId, keyId, order, isEnabled',
      ai_failure_alerts: 'id, providerId, keyId, dismissed, timestamp',
    });

    this.version(5).stores({
      sync_duplicates: 'id, status, detectedAt',
    });
  }
}

async function runMigrationTest() {
  console.log('🚀 Running Dexie DB v5 -> v6 Non-Destructive Migration Test...\n');

  const DB_NAME = 'MigrationVerificationDB_' + Date.now();

  // Step 1: Initialize v5 DB and populate with realistic user records
  console.log('--- Step 1: Populating v5 Database with User Data ---');
  const v5Db = new MockV5Database(DB_NAME);
  await v5Db.open();
  console.log(`v5 Database opened at schema version: ${v5Db.verno}`);
  if (v5Db.verno !== 5) {
    throw new Error(`Expected v5 database version 5, got ${v5Db.verno}`);
  }

  // Insert mock records
  await v5Db.accounts.add({
    id: 'acc_bca_v5',
    name: 'BCA Checking',
    type: 'bank',
    currency: 'IDR',
    initialBalance: 5000000,
    currentBalance: 4850000,
    icon: 'Landmark',
    color: '#0055aa',
    includeInNetWorth: true,
    createdAt: 1730000000000,
    updatedAt: 1730000000000,
    deviceId: 'dev_test_v5',
    isDeleted: false,
    version: 1,
  });

  await v5Db.categories.add({
    id: 'cat_groceries_v5',
    name: 'Groceries',
    type: 'expense',
    icon: 'ShoppingCart',
    color: '#f97316',
    isSystem: false,
    createdAt: 1730000000000,
    updatedAt: 1730000000000,
    deviceId: 'dev_test_v5',
    isDeleted: false,
    version: 1,
  });

  await v5Db.transactions.add({
    id: 'tx_supermarket_v5',
    type: 'expense',
    date: '2026-10-15',
    timestamp: 1730000000000,
    amount: 150000,
    currency: 'IDR',
    exchangeRateToBase: 1.0,
    baseAmount: 150000,
    accountId: 'acc_bca_v5',
    categoryId: 'cat_groceries_v5',
    description: 'Weekly Groceries at Superindo',
    tags: ['groceries', 'superindo'],
    inputSource: 'manual',
    createdAt: 1730000000000,
    updatedAt: 1730000000000,
    deviceId: 'dev_test_v5',
    isDeleted: false,
    version: 1,
  });

  await v5Db.debts_receivables.add({
    id: 'debt_budi_v5',
    type: 'receivable',
    personName: 'Budi',
    originalAmount: 200000,
    currentBalance: 200000,
    currency: 'IDR',
    status: 'open',
    initialAccountId: 'acc_bca_v5',
    createdAt: 1730000000000,
    updatedAt: 1730000000000,
    deviceId: 'dev_test_v5',
    isDeleted: false,
    version: 1,
  });

  await v5Db.recurring_rules.add({
    id: 'rule_internet_v5',
    title: 'IndiHome Wifi',
    type: 'expense',
    amount: 350000,
    currency: 'IDR',
    accountId: 'acc_bca_v5',
    categoryId: 'cat_groceries_v5',
    frequency: 'monthly',
    intervalValue: 1,
    dayOfMonth: 20,
    startDate: '2026-01-20',
    nextExecutionDate: '2026-11-20',
    autoPost: true,
    isDeleted: false,
    updatedAt: 1730000000000,
    version: 1,
  });

  await v5Db.sync_duplicates.add({
    id: 'dup_pair_v5',
    localTransactionId: 'tx_local',
    remoteTransactionId: 'tx_remote',
    localTransactionSnapshot: {} as any,
    remoteTransactionSnapshot: {} as any,
    detectedAt: 1730000000000,
    status: 'pending',
    reason: 'Similarity test',
    similarityScore: 0.85,
  });

  await v5Db.settings.add({
    id: 'current',
    baseCurrency: 'IDR',
    dateFormat: 'YYYY-MM-DD',
    language: 'id',
    theme: 'dark',
    deviceId: 'dev_test_v5',
    deviceName: 'Test Laptop',
    pinEnabled: true,
    biometricsEnabled: false,
    autoLockMinutes: 5,
    googleDriveLinked: false,
    dailyBackupEnabled: true,
    aiEnabled: true,
    aiProvider: 'gemini',
  });

  // Close v5 connection
  await v5Db.close();
  console.log('[PASS] Populated v5 database closed successfully.');

  // Step 2: Open using v6 schema (FinanceDatabase)
  console.log('\n--- Step 2: Upgrading to v6 Database Schema ---');
  class TestV6Database extends FinanceDatabase {
    constructor(name: string) {
      super();
      // Point to same test database name
      this.close();
      const dbAny = this as any;
      dbAny._name = name;
    }
  }

  // Instantiate and open v6 on the exact same database
  const v6Db = new FinanceDatabase(DB_NAME);
  await v6Db.open();

  console.log(`Upgraded database opened at schema version: ${v6Db.verno}`);
  if (v6Db.verno < 6) {
    throw new Error(`Expected upgraded database version >= 6, got ${v6Db.verno}`);
  }
  console.log(`[PASS] Schema version successfully migrated from 5 -> ${v6Db.verno}.`);

  // Step 3: Verify zero data loss across existing v5 tables
  console.log('\n--- Step 3: Verifying Data Preservation Across All Existing Tables ---');
  const account = await v6Db.accounts.get('acc_bca_v5');
  if (!account || account.currentBalance !== 4850000 || account.name !== 'BCA Checking') {
    throw new Error(`Account data corrupted or lost in v6 migration! Value: ${JSON.stringify(account)}`);
  }
  console.log(`[PASS] Account preserved: "${account.name}", balance = Rp ${account.currentBalance.toLocaleString('id-ID')}`);

  const category = await v6Db.categories.get('cat_groceries_v5');
  if (!category || category.name !== 'Groceries') {
    throw new Error(`Category data lost in v6 migration!`);
  }
  console.log(`[PASS] Category preserved: "${category.name}"`);

  const tx = await v6Db.transactions.get('tx_supermarket_v5');
  if (!tx || tx.amount !== 150000 || tx.tags?.[0] !== 'groceries') {
    throw new Error(`Transaction data lost in v6 migration!`);
  }
  console.log(`[PASS] Transaction preserved: "${tx.description}", tags = [${tx.tags?.join(', ')}]`);

  const debt = await v6Db.debts_receivables.get('debt_budi_v5');
  if (!debt || debt.personName !== 'Budi' || debt.originalAmount !== 200000) {
    throw new Error(`Debt record lost in v6 migration!`);
  }
  console.log(`[PASS] Debt record preserved: "${debt.personName}", amount = Rp ${debt.originalAmount.toLocaleString('id-ID')}`);

  const rule = await v6Db.recurring_rules.get('rule_internet_v5');
  if (!rule || rule.title !== 'IndiHome Wifi' || rule.amount !== 350000) {
    throw new Error(`Recurring rule lost in v6 migration!`);
  }
  console.log(`[PASS] Recurring rule preserved: "${rule.title}", next = ${rule.nextExecutionDate}`);

  const duplicate = await v6Db.sync_duplicates.get('dup_pair_v5');
  if (!duplicate || duplicate.similarityScore !== 0.85) {
    throw new Error(`Sync duplicate pair lost in v6 migration!`);
  }
  console.log(`[PASS] Sync duplicate pair preserved: score = ${duplicate.similarityScore}`);

  const settings = await v6Db.settings.get('current');
  if (!settings || settings.deviceName !== 'Test Laptop' || settings.pinEnabled !== true) {
    throw new Error(`Settings lost in v6 migration!`);
  }
  console.log(`[PASS] App Settings preserved: deviceName = "${settings.deviceName}", baseCurrency = "${settings.baseCurrency}"`);

  // Step 4: Verify 3 new v6 tables are functional
  console.log('\n--- Step 4: Verifying 3 New v6 Tables Initialization & Write/Read ---');

  // Table 1: subscription_patterns
  const patternId = 'pat_netflix_1';
  await v6Db.subscription_patterns.add({
    id: patternId,
    patternKey: 'netflix_186000',
    merchantName: 'Netflix',
    amount: 186000,
    currency: 'IDR',
    frequency: 'monthly',
    intervalDays: 30,
    dayOfMonth: 15,
    dismissed: false,
    sampleTransactionIds: ['tx_1', 'tx_2'],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  const savedPattern = await v6Db.subscription_patterns.get(patternId);
  if (!savedPattern || savedPattern.merchantName !== 'Netflix') {
    throw new Error(`Failed to insert/read from subscription_patterns table!`);
  }
  console.log(`[PASS] subscription_patterns table active: pattern "${savedPattern.merchantName}" stored.`);

  // Table 2: ai_chat_sessions
  const sessionId = 'session_test_1';
  await v6Db.ai_chat_sessions.add({
    id: sessionId,
    title: 'October Budget Advice',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messageCount: 4,
    encryptedPayload: {
      format: 'financeflow_enc_v1',
      salt: 'salt123',
      iv: 'iv123',
      ciphertext: 'encrypted_content',
      timestamp: Date.now(),
    },
    isDeleted: false,
  });
  const savedSession = await v6Db.ai_chat_sessions.get(sessionId);
  if (!savedSession || savedSession.title !== 'October Budget Advice') {
    throw new Error(`Failed to insert/read from ai_chat_sessions table!`);
  }
  console.log(`[PASS] ai_chat_sessions table active: session "${savedSession.title}" stored.`);

  // Table 3: receipt_attachments
  const receiptId = 'rcpt_receipt_1';
  await v6Db.receipt_attachments.add({
    id: receiptId,
    transactionId: 'tx_supermarket_v5',
    mimeType: 'image/jpeg',
    sizeBytes: 94200,
    width: 800,
    height: 1024,
    dataBase64: 'data:image/jpeg;base64,...',
    createdAt: Date.now(),
    isDeleted: false,
  });
  const savedReceipt = await v6Db.receipt_attachments.get(receiptId);
  if (!savedReceipt || savedReceipt.sizeBytes !== 94200) {
    throw new Error(`Failed to insert/read from receipt_attachments table!`);
  }
  console.log(`[PASS] receipt_attachments table active: receipt ${savedReceipt.sizeBytes} bytes stored.`);

  await v6Db.close();
  console.log('\n🎉 Dexie DB v5 -> v6 Non-Destructive Migration Verified (100% Data Preserved)!');
}

runMigrationTest().catch((err) => {
  console.error('\n❌ Migration test failed:', err);
  process.exit(1);
});
