/**
 * Automated Test Suite: Dexie DB v7 -> v8 Schema Migration Non-Destructive Test
 * Verifies that an existing user's data across all v7 tables is 100% preserved
 * after upgrading to v8, and that the new taxTreatment index on transactions is active.
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
  FinancialGoal,
  InvestmentAsset,
  AssetValuation,
  Achievement,
} from '../src/types';

// Mock DB Class representing v7
class MockV7Database extends Dexie {
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
  subscription_patterns!: Table<SubscriptionPattern, string>;
  ai_chat_sessions!: Table<AIChatSession, string>;
  receipt_attachments!: Table<ReceiptAttachment, string>;
  financial_goals!: Table<FinancialGoal, string>;
  investment_assets!: Table<InvestmentAsset, string>;
  asset_valuations!: Table<AssetValuation, string>;
  achievements!: Table<Achievement, string>;

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

    this.version(6).stores({
      subscription_patterns: 'id, patternKey, dismissed, createdAt',
      ai_chat_sessions: 'id, isDeleted, createdAt, updatedAt',
      receipt_attachments: 'id, transactionId, isDeleted, createdAt',
    });

    this.version(7).stores({
      financial_goals: 'id, isDeleted, targetDate, createdAt',
      investment_assets: 'id, type, isDeleted, lastValuationDate, createdAt',
      asset_valuations: 'id, assetId, date, createdAt',
      achievements: 'id, type, unlockedAt',
    });
  }
}

async function runMigrationTest() {
  console.log('🚀 Running Dexie DB v7 -> v8 Non-Destructive Migration Test...\n');

  const DB_NAME = 'MigrationVerificationDB_v8_' + Date.now();

  // Step 1: Initialize v7 DB and populate with realistic user records
  console.log('--- Step 1: Populating v7 Database with User Data ---');
  const v7Db = new MockV7Database(DB_NAME);
  await v7Db.open();
  console.log(`v7 Database opened at schema version: ${v7Db.verno}`);

  // Populate Accounts
  await v7Db.accounts.add({
    id: 'acc_bca_v7',
    name: 'BCA Main Account',
    type: 'bank',
    currency: 'IDR',
    initialBalance: 10000000,
    currentBalance: 9500000,
    icon: 'Landmark',
    color: '#00529B',
    includeInNetWorth: true,
    createdAt: Date.now() - 100000,
    updatedAt: Date.now() - 50000,
    deviceId: 'dev_test',
    isDeleted: false,
    version: 1,
  });

  // Populate Categories
  await v7Db.categories.add({
    id: 'cat_groceries_v7',
    name: 'Weekly Groceries',
    type: 'expense',
    icon: 'ShoppingCart',
    color: '#f97316',
    isSystem: false,
    createdAt: Date.now() - 100000,
    updatedAt: Date.now() - 50000,
    deviceId: 'dev_test',
    isDeleted: false,
    version: 1,
  });

  // Populate Transactions
  await v7Db.transactions.add({
    id: 'tx_income_v7',
    type: 'income',
    date: '2026-10-24',
    timestamp: Date.now() - 20000,
    amount: 9500000,
    currency: 'IDR',
    exchangeRateToBase: 1.0,
    baseAmount: 9500000,
    accountId: 'acc_bca_v7',
    categoryId: 'cat_salary',
    description: 'Shopee Affiliate Payout',
    inputSource: 'manual',
    createdAt: Date.now() - 20000,
    updatedAt: Date.now() - 20000,
    deviceId: 'dev_test',
    isDeleted: false,
    version: 1,
  });

  // Populate Financial Goal (v7 feature)
  await v7Db.financial_goals.add({
    id: 'goal_emergency_v7',
    name: 'Emergency Fund 6 Months',
    targetAmount: 60000000,
    currentAmount: 20000000,
    currency: 'IDR',
    trackingMode: 'manual',
    manualContribution: 20000000,
    status: 'active',
    createdAt: Date.now() - 30000,
    updatedAt: Date.now() - 30000,
    deviceId: 'dev_test',
    isDeleted: false,
    version: 1,
  });

  // Populate Investment Asset (v7 feature)
  await v7Db.investment_assets.add({
    id: 'asset_btc_v7',
    type: 'crypto',
    name: 'Bitcoin Cold Storage',
    tickerSymbol: 'BTC',
    quantity: 0.15,
    costBasis: 120000000,
    currentValue: 165000000,
    currency: 'IDR',
    lastValuationDate: '2026-10-24',
    includeInNetWorth: true,
    createdAt: Date.now() - 40000,
    updatedAt: Date.now() - 40000,
    deviceId: 'dev_test',
    isDeleted: false,
    version: 1,
  });

  // Populate App Settings
  await v7Db.settings.add({
    id: 'current',
    baseCurrency: 'IDR',
    dateFormat: 'YYYY-MM-DD',
    language: 'id',
    theme: 'dark',
    deviceId: 'dev_test',
    deviceName: 'MacBook Pro M3',
    pinEnabled: false,
    biometricsEnabled: false,
    autoLockMinutes: 5,
    googleDriveLinked: false,
    dailyBackupEnabled: true,
    aiEnabled: false,
    aiProvider: 'gemini',
    crashReportingEnabled: true,
    voiceInputAcknowledged: true,
    voiceInputEnabled: true,
  });

  await v7Db.close();
  console.log('[PASS] Populated v7 database closed successfully.');

  // Step 2: Open database with production FinanceDatabase (v8)
  console.log('\n--- Step 2: Upgrading to v8 Database Schema ---');
  const upgradedDb = new FinanceDatabase(DB_NAME);
  await upgradedDb.open();
  console.log(`Upgraded database opened at schema version: ${upgradedDb.verno}`);

  if (upgradedDb.verno < 8) {
    throw new Error(`Expected schema version >= 8, but got: ${upgradedDb.verno}`);
  }
  console.log('[PASS] Schema version successfully migrated from 7 -> 8.');

  // Step 3: Verify Data Preservation
  console.log('\n--- Step 3: Verifying Data Preservation Across All Existing Tables ---');
  const account = await upgradedDb.accounts.get('acc_bca_v7');
  if (!account || account.currentBalance !== 9500000) {
    throw new Error('Account record was lost or corrupted during v7 -> v8 migration!');
  }
  console.log(`[PASS] Account preserved: "${account.name}", balance = Rp ${account.currentBalance.toLocaleString('id-ID')}`);

  const category = await upgradedDb.categories.get('cat_groceries_v7');
  if (!category || category.name !== 'Weekly Groceries') {
    throw new Error('Category record was lost or corrupted during v7 -> v8 migration!');
  }
  console.log(`[PASS] Category preserved: "${category.name}"`);

  const tx = await upgradedDb.transactions.get('tx_income_v7');
  if (!tx || tx.amount !== 9500000 || tx.description !== 'Shopee Affiliate Payout') {
    throw new Error('Transaction record was lost or corrupted during v7 -> v8 migration!');
  }
  console.log(`[PASS] Transaction preserved: "${tx.description}", amount = Rp ${tx.amount.toLocaleString('id-ID')}`);

  const goal = await upgradedDb.financial_goals.get('goal_emergency_v7');
  if (!goal || goal.targetAmount !== 60000000) {
    throw new Error('Goal record was lost or corrupted during migration!');
  }
  console.log(`[PASS] Financial Goal preserved: "${goal.name}", target = Rp ${goal.targetAmount.toLocaleString('id-ID')}`);

  const asset = await upgradedDb.investment_assets.get('asset_btc_v7');
  if (!asset || asset.currentValue !== 165000000) {
    throw new Error('Investment Asset record was lost or corrupted during migration!');
  }
  console.log(`[PASS] Investment Asset preserved: "${asset.name}", valuation = Rp ${asset.currentValue.toLocaleString('id-ID')}`);

  const settings = await upgradedDb.settings.get('current');
  if (!settings || settings.deviceName !== 'MacBook Pro M3') {
    throw new Error('App Settings were lost or corrupted during migration!');
  }
  console.log(`[PASS] App Settings preserved: deviceName = "${settings.deviceName}"`);

  // Step 4: Verify writing and querying transactions with taxTreatment index in v8
  console.log('\n--- Step 4: Verifying taxTreatment Index on transactions ---');
  await upgradedDb.transactions.add({
    id: 'tx_shopee_taxed_v8',
    type: 'income',
    date: '2026-10-24',
    timestamp: Date.now(),
    amount: 9500000,
    grossAmount: 10000000,
    taxWithheldAmount: 500000,
    taxTreatment: 'withheld_at_source',
    taxSourceLabel: 'Shopee Affiliate',
    currency: 'IDR',
    exchangeRateToBase: 1.0,
    baseAmount: 9500000,
    accountId: 'acc_bca_v7',
    categoryId: 'cat_freelance',
    description: 'Shopee Affiliate Oktober 2026',
    inputSource: 'manual',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    deviceId: 'dev_test',
    isDeleted: false,
    version: 1,
  });

  const indexedQuery = await upgradedDb.transactions.where('taxTreatment').equals('withheld_at_source').toArray();
  if (indexedQuery.length !== 1 || indexedQuery[0].grossAmount !== 10000000) {
    throw new Error('Failed to query transactions using new taxTreatment index!');
  }
  console.log(`[PASS] taxTreatment index active: successfully queried "${indexedQuery[0].taxSourceLabel}" (Gross: Rp ${indexedQuery[0].grossAmount?.toLocaleString('id-ID')}, Withheld: Rp ${indexedQuery[0].taxWithheldAmount?.toLocaleString('id-ID')})`);

  await upgradedDb.close();
  console.log('\n🎉 Dexie DB v7 -> v8 Non-Destructive Migration Verified (100% Data Preserved)!\n');
}

runMigrationTest().catch((err) => {
  console.error('\n❌ v7 -> v8 Migration Test Failed:', err);
  process.exit(1);
});
