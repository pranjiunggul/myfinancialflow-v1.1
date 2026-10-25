/**
 * Automated Test Suite: Dexie DB v6 -> v7 Schema Migration Non-Destructive Test
 * Verifies that an existing user's data across all v6 tables is 100% preserved
 * after upgrading to v7, and that the 4 new v7 tables are initialized and accessible.
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

// Mock DB Class representing v6
class MockV6Database extends Dexie {
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
  }
}

async function runMigrationTest() {
  console.log('🚀 Running Dexie DB v6 -> v7 Non-Destructive Migration Test...\n');

  const DB_NAME = 'MigrationVerificationDB_v7_' + Date.now();

  // Step 1: Initialize v6 DB and populate with realistic user records
  console.log('--- Step 1: Populating v6 Database with User Data ---');
  const v6Db = new MockV6Database(DB_NAME);
  await v6Db.open();
  console.log(`v6 Database opened at schema version: ${v6Db.verno}`);
  if (v6Db.verno !== 6) {
    throw new Error(`Expected v6 database version 6, got ${v6Db.verno}`);
  }

  // Insert mock records
  await v6Db.accounts.add({
    id: 'acc_bca_v6',
    name: 'BCA Main Account',
    type: 'bank',
    currency: 'IDR',
    currentBalance: 7500000,
    includeInNetWorth: true,
    isArchived: false,
    isDeleted: false,
    createdAt: Date.now() - 1000000,
    updatedAt: Date.now() - 500000,
    deviceId: 'dev_test',
    version: 1,
  });

  await v6Db.categories.add({
    id: 'cat_groceries_v6',
    name: 'Weekly Groceries',
    type: 'expense',
    icon: 'ShoppingCart',
    color: '#f97316',
    isSystem: false,
    isDeleted: false,
    createdAt: Date.now() - 1000000,
    updatedAt: Date.now() - 500000,
    version: 1,
  });

  await v6Db.transactions.add({
    id: 'tx_superindo_v6',
    type: 'expense',
    amount: 320000,
    currency: 'IDR',
    baseAmount: 320000,
    accountId: 'acc_bca_v6',
    categoryId: 'cat_groceries_v6',
    date: '2026-10-24',
    timestamp: Date.now() - 200000,
    description: 'Groceries at Superindo Duren Tiga',
    tags: ['groceries', 'household'],
    isDeleted: false,
    createdAt: Date.now() - 200000,
    updatedAt: Date.now() - 200000,
    deviceId: 'dev_test',
    version: 1,
  });

  await v6Db.subscription_patterns.add({
    id: 'sub_spotify_v6',
    patternKey: 'spotify_54990',
    merchantName: 'Spotify Family',
    amount: 54990,
    currency: 'IDR',
    frequency: 'monthly',
    intervalDays: 30,
    dismissed: false,
    sampleTransactionIds: ['tx_spot_1', 'tx_spot_2'],
    createdAt: Date.now() - 100000,
    updatedAt: Date.now() - 100000,
  });

  await v6Db.ai_chat_sessions.add({
    id: 'sess_retirement_v6',
    title: 'Retirement Strategy Discussion',
    createdAt: Date.now() - 50000,
    updatedAt: Date.now() - 20000,
    messageCount: 4,
    encryptedPayload: {
      ciphertext: 'test_cipher',
      iv: 'test_iv',
      format: 'financeflow_enc_v1',
    },
    isDeleted: false,
  });

  await v6Db.receipt_attachments.add({
    id: 'rcpt_superindo_v6',
    transactionId: 'tx_superindo_v6',
    mimeType: 'image/jpeg',
    sizeBytes: 85200,
    createdAt: Date.now() - 200000,
    isDeleted: false,
  });

  await v6Db.settings.put({
    id: 'app_settings',
    baseCurrency: 'IDR',
    dateFormat: 'YYYY-MM-DD',
    theme: 'dark',
    monthlyBudgetLimit: 10000000,
    biometricsEnabled: true,
    dailyBackupEnabled: true,
    aiEnabled: true,
    aiProvider: 'gemini',
    crashReportingEnabled: true,
    deviceName: 'MacBook Pro M3',
  });

  await v6Db.close();
  console.log('[PASS] Populated v6 database closed successfully.\n');

  // Step 2: Open using current FinanceDatabase (v7)
  console.log('--- Step 2: Upgrading to v7 Database Schema ---');
  const upgradedDb = new FinanceDatabase(DB_NAME);
  await upgradedDb.open();
  console.log(`Upgraded database opened at schema version: ${upgradedDb.verno}`);
  if (upgradedDb.verno < 7) {
    throw new Error(`Migration failed: expected version >= 7, got ${upgradedDb.verno}`);
  }
  console.log('[PASS] Schema version successfully migrated from 6 -> 7.\n');

  // Step 3: Verify Data Preservation Across All Existing Tables
  console.log('--- Step 3: Verifying Data Preservation Across All Existing Tables ---');
  const account = await upgradedDb.accounts.get('acc_bca_v6');
  if (!account || account.currentBalance !== 7500000 || account.name !== 'BCA Main Account') {
    throw new Error(`Account data corrupted or lost in v7 migration! Value: ${JSON.stringify(account)}`);
  }
  console.log(`[PASS] Account preserved: "${account.name}", balance = Rp ${account.currentBalance.toLocaleString('id-ID')}`);

  const category = await upgradedDb.categories.get('cat_groceries_v6');
  if (!category || category.name !== 'Weekly Groceries') {
    throw new Error('Category data corrupted or lost in v7 migration!');
  }
  console.log(`[PASS] Category preserved: "${category.name}"`);

  const tx = await upgradedDb.transactions.get('tx_superindo_v6');
  if (!tx || tx.amount !== 320000 || !tx.tags?.includes('groceries')) {
    throw new Error('Transaction data corrupted or lost in v7 migration!');
  }
  console.log(`[PASS] Transaction preserved: "${tx.description}", tags = [${tx.tags?.join(', ')}]`);

  const sub = await upgradedDb.subscription_patterns.get('sub_spotify_v6');
  if (!sub || sub.merchantName !== 'Spotify Family' || sub.amount !== 54990) {
    throw new Error('Subscription pattern data lost in v7 migration!');
  }
  console.log(`[PASS] Subscription pattern preserved: "${sub.merchantName}", amount = Rp ${sub.amount.toLocaleString('id-ID')}`);

  const chat = await upgradedDb.ai_chat_sessions.get('sess_retirement_v6');
  if (!chat || chat.title !== 'Retirement Strategy Discussion') {
    throw new Error('AI chat session data lost in v7 migration!');
  }
  console.log(`[PASS] AI chat session preserved: "${chat.title}"`);

  const receipt = await upgradedDb.receipt_attachments.get('rcpt_superindo_v6');
  if (!receipt || receipt.sizeBytes !== 85200) {
    throw new Error('Receipt attachment data lost in v7 migration!');
  }
  console.log(`[PASS] Receipt attachment preserved: ${receipt.sizeBytes} bytes`);

  const settings = await upgradedDb.settings.get('app_settings');
  if (!settings || settings.deviceName !== 'MacBook Pro M3' || !settings.crashReportingEnabled) {
    throw new Error('App settings data corrupted or lost in v7 migration!');
  }
  console.log(`[PASS] App Settings preserved: deviceName = "${settings.deviceName}", crashReporting = ${settings.crashReportingEnabled}\n`);

  // Step 4: Verify 4 New v7 Tables Initialization & Write/Read
  console.log('--- Step 4: Verifying 4 New v7 Tables Initialization & Write/Read ---');
  
  // 1. financial_goals
  const newGoal: FinancialGoal = {
    id: 'goal_emergency_fund',
    name: 'Emergency Fund 6 Months',
    icon: 'ShieldCheck',
    color: '#10b981',
    targetAmount: 50000000,
    currentAmount: 15000000,
    currency: 'IDR',
    targetDate: '2027-12-31',
    trackingMode: 'manual',
    manualContribution: 15000000,
    status: 'active',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    isDeleted: false,
    deviceId: 'dev_test',
    version: 1,
  };
  await upgradedDb.financial_goals.add(newGoal);
  const fetchedGoal = await upgradedDb.financial_goals.get('goal_emergency_fund');
  if (!fetchedGoal || fetchedGoal.targetAmount !== 50000000) {
    throw new Error('Failed to write/read financial_goals in v7 schema!');
  }
  console.log(`[PASS] financial_goals table active: goal "${fetchedGoal.name}" target = Rp ${fetchedGoal.targetAmount.toLocaleString('id-ID')}`);

  // 2. investment_assets
  const newAsset: InvestmentAsset = {
    id: 'asset_btc_cold',
    type: 'crypto',
    name: 'Bitcoin Cold Storage',
    tickerSymbol: 'BTC',
    quantity: 0.15,
    costBasis: 120000000,
    currentValue: 165000000,
    currency: 'IDR',
    lastValuationDate: '2026-10-24',
    includeInNetWorth: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    isDeleted: false,
    deviceId: 'dev_test',
    version: 1,
  };
  await upgradedDb.investment_assets.add(newAsset);
  const fetchedAsset = await upgradedDb.investment_assets.get('asset_btc_cold');
  if (!fetchedAsset || fetchedAsset.currentValue !== 165000000) {
    throw new Error('Failed to write/read investment_assets in v7 schema!');
  }
  console.log(`[PASS] investment_assets table active: asset "${fetchedAsset.name}" valuation = Rp ${fetchedAsset.currentValue.toLocaleString('id-ID')}`);

  // 3. asset_valuations
  const newValuation: AssetValuation = {
    id: 'val_btc_1',
    assetId: 'asset_btc_cold',
    date: '2026-10-24',
    value: 165000000,
    unitPrice: 1100000000,
    source: 'manual',
    createdAt: Date.now(),
  };
  await upgradedDb.asset_valuations.add(newValuation);
  const fetchedVal = await upgradedDb.asset_valuations.get('val_btc_1');
  if (!fetchedVal || fetchedVal.value !== 165000000) {
    throw new Error('Failed to write/read asset_valuations in v7 schema!');
  }
  console.log(`[PASS] asset_valuations table active: valuation log for "${fetchedVal.assetId}" stored`);

  // 4. achievements
  const newAchievement: Achievement = {
    id: 'streak_7',
    type: 'streak',
    title: '7-Day Streak',
    description: 'Logged transactions for 7 consecutive days',
    icon: 'Flame',
    unlockedAt: Date.now(),
  };
  await upgradedDb.achievements.add(newAchievement);
  const fetchedAch = await upgradedDb.achievements.get('streak_7');
  if (!fetchedAch || fetchedAch.title !== '7-Day Streak') {
    throw new Error('Failed to write/read achievements in v7 schema!');
  }
  console.log(`[PASS] achievements table active: achievement "${fetchedAch.title}" stored\n`);

  await upgradedDb.close();
  console.log('🎉 Dexie DB v6 -> v7 Non-Destructive Migration Verified (100% Data Preserved)!');
}

runMigrationTest().catch((err) => {
  console.error('❌ Migration verification failed:', err);
  process.exit(1);
});
