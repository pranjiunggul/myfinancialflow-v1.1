import Dexie, { type Table } from 'dexie';
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
  TelegramInboxItem,
  AIProviderConfig,
  AIKeyRecord,
  AIPriorityItem,
  AIPersistentAlert,
  SubscriptionPattern,
  AIChatSession,
  ReceiptAttachment,
  FinancialGoal,
  InvestmentAsset,
  AssetValuation,
  Achievement,
} from '../types';
import { PRESET_AI_PROVIDERS } from '../services/aiPresets';

export class FinanceDatabase extends Dexie {
  accounts!: Table<Account, string>;
  categories!: Table<Category, string>;
  transactions!: Table<Transaction, string>;
  debts_receivables!: Table<DebtReceivable, string>;
  debt_payments!: Table<DebtPayment, string>;
  recurring_rules!: Table<RecurringRule, string>;
  audit_logs!: Table<AuditLog, string>;
  fx_rates!: Table<FXRate, string>;
  settings!: Table<AppSettings, string>;
  local_backups!: Table<{ id: string; filename: string; dateStr: string; timestamp: number; payload: string; metadata: any }, string>;
  telegram_inbox!: Table<TelegramInboxItem, string>;
  ai_providers!: Table<AIProviderConfig, string>;
  ai_keys!: Table<AIKeyRecord, string>;
  ai_priorities!: Table<AIPriorityItem, string>;
  ai_failure_alerts!: Table<AIPersistentAlert, string>;
  sync_duplicates!: Table<import('../types').SyncDuplicatePair, string>;
  subscription_patterns!: Table<SubscriptionPattern, string>;
  ai_chat_sessions!: Table<AIChatSession, string>;
  receipt_attachments!: Table<ReceiptAttachment, string>;
  financial_goals!: Table<FinancialGoal, string>;
  investment_assets!: Table<InvestmentAsset, string>;
  asset_valuations!: Table<AssetValuation, string>;
  achievements!: Table<Achievement, string>;

  constructor(dbName: string = 'FinanceFlowDB') {
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

    this.version(8).stores({
      transactions: 'id, type, date, timestamp, accountId, categoryId, currency, debtReceivableId, receiptHash, inputSource, taxTreatment, isDeleted, updatedAt',
    });
  }
}

export const db = new FinanceDatabase();

// Device ID Generator & Retriever (Universal Node/Browser safe)
let inMemoryDeviceId: string | null = null;

export function getOrCreateDeviceId(): string {
  if (inMemoryDeviceId) return inMemoryDeviceId;
  const STORAGE_KEY = 'financeflow_device_id';
  let deviceId: string | null = null;
  if (typeof localStorage !== 'undefined') {
    try {
      deviceId = localStorage.getItem(STORAGE_KEY);
    } catch {}
  }
  if (!deviceId) {
    deviceId = 'dev_' + crypto.randomUUID().slice(0, 8);
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, deviceId);
      } catch {}
    }
  }
  inMemoryDeviceId = deviceId;
  return deviceId;
}

// Initial Default Presets
export const DEFAULT_CATEGORIES: Omit<Category, 'deviceId'>[] = [
  // Expense Categories
  { id: 'cat_food', name: 'Food & Dining', type: 'expense', icon: 'Utensils', color: '#ef4444', isSystem: false, isDeleted: false, createdAt: Date.now(), updatedAt: Date.now(), version: 1 },
  { id: 'cat_groceries', name: 'Groceries', type: 'expense', icon: 'ShoppingCart', color: '#f97316', isSystem: false, isDeleted: false, createdAt: Date.now(), updatedAt: Date.now(), version: 1 },
  { id: 'cat_transport', name: 'Transportation', type: 'expense', icon: 'Car', color: '#eab308', isSystem: false, isDeleted: false, createdAt: Date.now(), updatedAt: Date.now(), version: 1 },
  { id: 'cat_bills', name: 'Bills & Utilities', type: 'expense', icon: 'Zap', color: '#06b6d4', isSystem: false, isDeleted: false, createdAt: Date.now(), updatedAt: Date.now(), version: 1 },
  { id: 'cat_shopping', name: 'Shopping', type: 'expense', icon: 'ShoppingBag', color: '#ec4899', isSystem: false, isDeleted: false, createdAt: Date.now(), updatedAt: Date.now(), version: 1 },
  { id: 'cat_health', name: 'Health & Medical', type: 'expense', icon: 'HeartPulse', color: '#10b981', isSystem: false, isDeleted: false, createdAt: Date.now(), updatedAt: Date.now(), version: 1 },
  { id: 'cat_entertainment', name: 'Entertainment', type: 'expense', icon: 'Film', color: '#8b5cf6', isSystem: false, isDeleted: false, createdAt: Date.now(), updatedAt: Date.now(), version: 1 },
  { id: 'cat_education', name: 'Education', type: 'expense', icon: 'GraduationCap', color: '#3b82f6', isSystem: false, isDeleted: false, createdAt: Date.now(), updatedAt: Date.now(), version: 1 },
  { id: 'cat_fees', name: 'Bank & Transfer Fees', type: 'expense', icon: 'Receipt', color: '#64748b', isSystem: true, isDeleted: false, createdAt: Date.now(), updatedAt: Date.now(), version: 1 },

  // Income Categories
  { id: 'cat_salary', name: 'Salary & Wages', type: 'income', icon: 'Briefcase', color: '#22c55e', isSystem: false, isDeleted: false, createdAt: Date.now(), updatedAt: Date.now(), version: 1 },
  { id: 'cat_freelance', name: 'Freelance & Side Income', type: 'income', icon: 'Laptop', color: '#14b8a6', isSystem: false, isDeleted: false, createdAt: Date.now(), updatedAt: Date.now(), version: 1 },
  { id: 'cat_investment', name: 'Investments & Dividends', type: 'income', icon: 'TrendingUp', color: '#3b82f6', isSystem: false, isDeleted: false, createdAt: Date.now(), updatedAt: Date.now(), version: 1 },
  { id: 'cat_gift', name: 'Gifts & Grants', type: 'income', icon: 'Gift', color: '#d946ef', isSystem: false, isDeleted: false, createdAt: Date.now(), updatedAt: Date.now(), version: 1 },

  // System Categories (Special logic)
  { id: 'cat_transfer', name: 'Account Transfer', type: 'both', icon: 'ArrowLeftRight', color: '#6366f1', isSystem: true, isDeleted: false, createdAt: Date.now(), updatedAt: Date.now(), version: 1 },
  { id: 'cat_debt_loan', name: 'Debt / Loan', type: 'both', icon: 'HandCoins', color: '#f59e0b', isSystem: true, isDeleted: false, createdAt: Date.now(), updatedAt: Date.now(), version: 1 },
];

export async function initializeDatabaseSeed(): Promise<void> {
  const deviceId = getOrCreateDeviceId();
  const DEFAULT_GOOGLE_CLIENT_ID = '399676065593-thqgf84omcb9756qe0ss7u5n0bjju3t9.apps.googleusercontent.com';
  const DEFAULT_GEMINI_KEY = typeof atob !== 'undefined'
    ? atob('QVEuQWI4Uk42S0ZldTViNlFVaHBRX00yNWg0aDZBWVMwUlU1cjI1eUhFTGMxMllncm5obEE=')
    : (typeof Buffer !== 'undefined' ? Buffer.from('QVEuQWI4Uk42S0ZldTViNlFVaHBRX00yNWg0aDZBWVMwUlU1cjI1eUhFTGMxMllncm5obEE=', 'base64').toString('utf-8') : '');

  // Seed default settings if not present
  const existingSettings = await db.settings.get('current');
  if (!existingSettings) {
    const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad/i.test(navigator.userAgent);
    await db.settings.put({
      id: 'current',
      baseCurrency: 'IDR',
      dateFormat: 'YYYY-MM-DD',
      language: 'en',
      theme: 'dark',
      deviceId,
      deviceName: isMobile ? 'Mobile Device' : 'Desktop Browser',
      pinEnabled: false,
      biometricsEnabled: false,
      autoLockMinutes: 0,
      googleDriveLinked: false,
      googleDriveClientId: DEFAULT_GOOGLE_CLIENT_ID,
      dailyBackupEnabled: true,
      aiEnabled: true,
      aiProvider: 'gemini',
      aiApiKey: DEFAULT_GEMINI_KEY,
    });
  } else {
    const updates: Partial<AppSettings> = {};
    if (!existingSettings.googleDriveClientId || existingSettings.googleDriveClientId.includes('client_secret_')) {
      updates.googleDriveClientId = DEFAULT_GOOGLE_CLIENT_ID;
    }
    if (!existingSettings.aiApiKey) {
      updates.aiApiKey = DEFAULT_GEMINI_KEY;
      updates.aiEnabled = true;
      updates.aiProvider = 'gemini';
    }
    if (Object.keys(updates).length > 0) {
      await db.settings.update('current', updates);
    }
  }

  // Seed categories if empty
  const categoryCount = await db.categories.count();
  if (categoryCount === 0) {
    const categoriesWithDevice: Category[] = DEFAULT_CATEGORIES.map(cat => ({
      ...cat,
      deviceId,
    }));
    await db.categories.bulkPut(categoriesWithDevice);
  }

  // Seed default sample accounts if empty
  const accountCount = await db.accounts.count();
  if (accountCount === 0) {
    const sampleAccounts: Account[] = [
      {
        id: 'acc_cash',
        name: 'Cash Wallet',
        type: 'cash',
        currency: 'IDR',
        initialBalance: 500000,
        currentBalance: 500000,
        icon: 'Wallet',
        color: '#10b981',
        includeInNetWorth: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        deviceId,
        isDeleted: false,
        version: 1,
      },
      {
        id: 'acc_bank_bca',
        name: 'Bank BCA',
        type: 'bank',
        currency: 'IDR',
        initialBalance: 5000000,
        currentBalance: 5000000,
        icon: 'Landmark',
        color: '#2563eb',
        includeInNetWorth: true,
        monthlyAdminFee: {
          enabled: true,
          amount: 15000,
          dayOfMonth: 25,
          categoryId: 'cat_fees',
          autoPost: true,
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
        deviceId,
        isDeleted: false,
        version: 1,
      },
      {
        id: 'acc_paypal_usd',
        name: 'PayPal USD',
        type: 'paypal',
        currency: 'USD',
        initialBalance: 150,
        currentBalance: 150,
        icon: 'CreditCard',
        color: '#0284c7',
        includeInNetWorth: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        deviceId,
        isDeleted: false,
        version: 1,
      },
    ];
    await db.accounts.bulkPut(sampleAccounts);
  }

  // Seed default AI providers if table is empty
  const providerCount = await db.ai_providers.count();
  if (providerCount === 0) {
    const now = Date.now();
    const seededProviders: AIProviderConfig[] = PRESET_AI_PROVIDERS.map((p) => ({
      ...p,
      createdAt: now,
      updatedAt: now,
      version: 1,
    }));
    await db.ai_providers.bulkPut(seededProviders);
  }
}
