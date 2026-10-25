import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, initializeDatabaseSeed } from './db/database';
import { recalculateAllAccountBalances } from './services/ledger';
import { processDueRecurringRules } from './services/recurring';
import type {
  Account,
  Category,
  Transaction,
  CurrencyCode,
  TransactionType,
} from './types';

// Layout
import { Navbar } from './components/layout/Navbar';
import { Sidebar } from './components/layout/Sidebar';
import { BottomNav, type TabKey } from './components/layout/BottomNav';

// Views
import { DashboardView } from './components/dashboard/DashboardView';
import { FastGlanceView } from './components/dashboard/FastGlanceView';
import { TransactionListView } from './components/transactions/TransactionListView';
import { AccountsView } from './components/accounts/AccountsView';
import { CategoriesView } from './components/categories/CategoriesView';
import { DebtsView } from './components/debts/DebtsView';
import { SettingsView } from './components/settings/SettingsView';
import { AIChatView } from './components/chat/AIChatView';
import { TaxEstimatorView } from './components/tax/TaxEstimatorView';
import { TaxDisclaimerModal } from './components/tax/TaxDisclaimerModal';
import { evaluateProactiveFinancialAlerts } from './services/advisor';
import { startHealthCheckScheduler } from './services/aiHealth';

// Modals
import { TransactionModal } from './components/transactions/TransactionModal';
import { AccountModal } from './components/accounts/AccountModal';
import { CategoryModal } from './components/categories/CategoryModal';
import { AuditHistoryModal } from './components/audit/AuditHistoryModal';
import { RecurringRulesModal } from './components/recurring/RecurringRulesModal';
import { SecuritySetupModal } from './components/security/SecuritySetupModal';
import { AppLockModal } from './components/security/AppLockModal';
import { ExportReportModal } from './components/analytics/ExportReportModal';
import { ConflictReviewModal } from './components/sync/ConflictReviewModal';
import { TelegramInboxModal } from './components/telegram/TelegramInboxModal';
import { BulkHistoryImportModal } from './components/transactions/BulkHistoryImportModal';
import { getRecentConflicts } from './services/sync';
import type { SyncConflictRecord } from './types';

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<TabKey>('dashboard');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isAppLocked, setIsAppLocked] = useState(false);
  const [sessionPin, setSessionPin] = useState<string | undefined>();
  const [isGlanceMode, setIsGlanceMode] = useState<boolean>(() => typeof window !== 'undefined' && window.location.search.includes('mode=glance'));

  // Modals state
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [txToEdit, setTxToEdit] = useState<Transaction | null>(null);
  const [txInitialType, setTxInitialType] = useState<TransactionType | undefined>();

  const [isAccModalOpen, setIsAccModalOpen] = useState(false);
  const [accToEdit, setAccToEdit] = useState<Account | null>(null);

  const [isCatModalOpen, setIsCatModalOpen] = useState(false);
  const [catToEdit, setCatToEdit] = useState<Category | null>(null);

  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [isRecurringModalOpen, setIsRecurringModalOpen] = useState(false);
  const [isSecuritySetupOpen, setIsSecuritySetupOpen] = useState(false);
  const [isExportReportOpen, setIsExportReportOpen] = useState(false);
  const [isConflictModalOpen, setIsConflictModalOpen] = useState(false);
  const [isTelegramModalOpen, setIsTelegramModalOpen] = useState(false);
  const [isBulkHistoryModalOpen, setIsBulkHistoryModalOpen] = useState(false);
  const [isTaxDisclaimerOpen, setIsTaxDisclaimerOpen] = useState(false);
  const [activeConflicts, setActiveConflicts] = useState<SyncConflictRecord[]>([]);

  // Live Dexie database queries
  const accounts = useLiveQuery(() => db.accounts.toArray(), []) || [];
  const categories = useLiveQuery(() => db.categories.toArray(), []) || [];
  const transactions = useLiveQuery(() => db.transactions.toArray(), []) || [];
  const debts = useLiveQuery(() => db.debts_receivables.toArray(), []) || [];
  const recurringRules = useLiveQuery(() => db.recurring_rules.toArray(), []) || [];
  const auditLogs = useLiveQuery(() => db.audit_logs.toArray(), []) || [];
  const telegramItems = useLiveQuery(() => db.telegram_inbox.toArray(), []) || [];
  const settings = useLiveQuery(() => db.settings.get('current'), []);

  const pendingTelegramCount = telegramItems.filter((i) => i.status === 'pending').length;
  const baseCurrency: CurrencyCode = settings?.baseCurrency || 'IDR';

  // App Initialization & Recurring Rules Engine
  useEffect(() => {
    async function init() {
      await initializeDatabaseSeed();
      await recalculateAllAccountBalances();

      // Automatically evaluate and post any due recurring rules or bank admin fees
      await processDueRecurringRules();

      const currentSettings = await db.settings.get('current');
      if (currentSettings?.pinEnabled && currentSettings?.pinHash) {
        setIsAppLocked(true);
      }

      // Proactively evaluate financial insights and alerts
      await evaluateProactiveFinancialAlerts(currentSettings?.baseCurrency || 'IDR');

      setIsInitialized(true);
    }
    init();

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Start proactive background AI health checking scheduler
    const stopHealthScheduler = startHealthCheckScheduler({
      getMasterPin: () => sessionPin,
      intervalMs: 5 * 60 * 1000,
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      stopHealthScheduler();
    };
  }, []);

  const handleOpenNewTransaction = (defaultType?: 'expense' | 'income' | 'transfer' | 'debt' | 'receivable') => {
    setTxToEdit(null);
    setTxInitialType(defaultType);
    setIsTxModalOpen(true);
  };

  const handleEditTransaction = (tx: Transaction) => {
    setTxToEdit(tx);
    setIsTxModalOpen(true);
  };

  const handleOpenNewAccount = () => {
    setAccToEdit(null);
    setIsAccModalOpen(true);
  };

  const handleEditAccount = (acc: Account) => {
    setAccToEdit(acc);
    setIsAccModalOpen(true);
  };

  const handleOpenNewCategory = () => {
    setCatToEdit(null);
    setIsCatModalOpen(true);
  };

  const handleEditCategory = (cat: Category) => {
    setCatToEdit(cat);
    setIsCatModalOpen(true);
  };

  const handleUpdateBaseCurrency = async (newBase: CurrencyCode) => {
    await db.settings.update('current', { baseCurrency: newBase });
  };

  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center animate-pulse">
          <span className="text-white font-black text-2xl">F</span>
        </div>
        <p className="text-xs uppercase tracking-widest font-bold text-slate-400">
          Loading FinanceFlow Ledger...
        </p>
      </div>
    );
  }

  if (isGlanceMode) {
    return (
      <FastGlanceView
        baseCurrency={baseCurrency}
        onOpenFullApp={() => {
          setIsGlanceMode(false);
          if (typeof window !== 'undefined' && window.history.replaceState) {
            window.history.replaceState({}, '', '/');
          }
        }}
      />
    );
  }

  const handleSelectTab = (tab: TabKey) => {
    if (tab === 'tax' && !settings?.taxEstimatorAcknowledged) {
      setIsTaxDisclaimerOpen(true);
      return;
    }
    setCurrentTab(tab);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Navbar */}
      <Navbar
        baseCurrency={baseCurrency}
        onOpenNewTransaction={() => handleOpenNewTransaction()}
        isOnline={isOnline}
        onOpenSettings={() => setCurrentTab('settings')}
        onOpenConflictModal={() => {
          setActiveConflicts(getRecentConflicts());
          setIsConflictModalOpen(true);
        }}
        onOpenTelegramInbox={() => setIsTelegramModalOpen(true)}
        pendingTelegramCount={pendingTelegramCount}
      />

      <div className="flex-1 flex max-w-7xl w-full mx-auto">
        {/* Desktop Sidebar */}
        <Sidebar
          currentTab={currentTab}
          onSelectTab={handleSelectTab}
          onOpenAuditLogs={() => setIsAuditModalOpen(true)}
          onOpenRecurringRules={() => setIsRecurringModalOpen(true)}
          onOpenTelegramInbox={() => setIsTelegramModalOpen(true)}
          pendingTelegramCount={pendingTelegramCount}
        />

        {/* Main Content Area */}
        <main className="flex-1 px-4 sm:px-8 py-6 max-w-5xl overflow-y-auto">
          {currentTab === 'dashboard' && (
            <DashboardView
              accounts={accounts}
              transactions={transactions}
              categories={categories}
              baseCurrency={baseCurrency}
              onOpenNewTransaction={handleOpenNewTransaction}
              onEditTransaction={handleEditTransaction}
              onSelectTab={handleSelectTab}
              onOpenExportReport={() => setIsExportReportOpen(true)}
            />
          )}

          {currentTab === 'transactions' && (
            <TransactionListView
              transactions={transactions}
              accounts={accounts}
              categories={categories}
              baseCurrency={baseCurrency}
              onOpenNewTransaction={() => handleOpenNewTransaction()}
              onEditTransaction={handleEditTransaction}
              onOpenBulkHistory={() => setIsBulkHistoryModalOpen(true)}
            />
          )}

          {currentTab === 'debts' && (
            <DebtsView
              debts={debts}
              accounts={accounts}
              baseCurrency={baseCurrency}
              onOpenNewDebt={() => handleOpenNewTransaction('debt')}
            />
          )}

          {currentTab === 'chat' && (
            <AIChatView
              accounts={accounts}
              categories={categories}
              baseCurrency={baseCurrency}
              settings={settings || null}
              masterPin={sessionPin}
              onOpenSettings={() => setCurrentTab('settings')}
              onNavigateTab={(tab) => handleSelectTab(tab as any)}
            />
          )}

          {currentTab === 'accounts' && (
            <AccountsView
              accounts={accounts}
              baseCurrency={baseCurrency}
              onOpenNewAccount={handleOpenNewAccount}
              onEditAccount={handleEditAccount}
            />
          )}

          {currentTab === 'categories' && (
            <CategoriesView
              categories={categories}
              transactions={transactions}
              baseCurrency={baseCurrency}
              onOpenNewCategory={handleOpenNewCategory}
              onEditCategory={handleEditCategory}
            />
          )}

          {currentTab === 'tax' && (
            <TaxEstimatorView
              baseCurrency={baseCurrency}
              onEditTransaction={handleEditTransaction}
              onOpenNewTransactionModal={() => handleOpenNewTransaction('income')}
            />
          )}

          {currentTab === 'settings' && (
            <SettingsView
              settings={settings || null}
              baseCurrency={baseCurrency}
              masterPin={sessionPin}
              onUpdateBaseCurrency={handleUpdateBaseCurrency}
              onOpenAuditLogs={() => setIsAuditModalOpen(true)}
              onOpenSecuritySetup={() => setIsSecuritySetupOpen(true)}
              onOpenRecurringRules={() => setIsRecurringModalOpen(true)}
              onOpenTelegramInbox={() => setIsTelegramModalOpen(true)}
            />
          )}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <BottomNav currentTab={currentTab} onSelectTab={handleSelectTab} />

      {/* Modals */}
      <TransactionModal
        isOpen={isTxModalOpen}
        onClose={() => setIsTxModalOpen(false)}
        transactionToEdit={txToEdit}
        initialType={txInitialType}
        accounts={accounts}
        categories={categories}
        baseCurrency={baseCurrency}
        settings={settings}
      />

      <AccountModal
        isOpen={isAccModalOpen}
        onClose={() => setIsAccModalOpen(false)}
        accountToEdit={accToEdit}
        categories={categories}
      />

      <CategoryModal
        isOpen={isCatModalOpen}
        onClose={() => setIsCatModalOpen(false)}
        categoryToEdit={catToEdit}
        allCategories={categories}
      />

      <AuditHistoryModal
        isOpen={isAuditModalOpen}
        onClose={() => setIsAuditModalOpen(false)}
        logs={auditLogs}
      />

      <RecurringRulesModal
        isOpen={isRecurringModalOpen}
        onClose={() => setIsRecurringModalOpen(false)}
        rules={recurringRules}
        accounts={accounts}
        categories={categories}
        baseCurrency={baseCurrency}
      />

      <SecuritySetupModal
        isOpen={isSecuritySetupOpen}
        onClose={() => setIsSecuritySetupOpen(false)}
        settings={settings || null}
      />

      <ExportReportModal
        isOpen={isExportReportOpen}
        onClose={() => setIsExportReportOpen(false)}
        transactions={transactions}
        accounts={accounts}
        categories={categories}
        debts={debts}
        baseCurrency={baseCurrency}
      />

      {/* Conflict Review Modal */}
      {isConflictModalOpen && (
        <ConflictReviewModal
          conflicts={activeConflicts}
          onClose={() => setIsConflictModalOpen(false)}
          onConflictResolved={() => setActiveConflicts(getRecentConflicts())}
        />
      )}

      {/* Telegram Inbound Inbox Modal */}
      <TelegramInboxModal
        isOpen={isTelegramModalOpen}
        onClose={() => setIsTelegramModalOpen(false)}
        accounts={accounts}
        categories={categories}
        baseCurrency={baseCurrency}
      />

      {/* Multi-Row History Screenshot OCR Modal */}
      <BulkHistoryImportModal
        isOpen={isBulkHistoryModalOpen}
        onClose={() => setIsBulkHistoryModalOpen(false)}
        accounts={accounts}
        categories={categories}
        baseCurrency={baseCurrency}
        settings={settings || null}
        masterPin={sessionPin}
      />

      {/* Indonesian PPh Tax Estimator First-Use Disclaimer Gate */}
      <TaxDisclaimerModal
        isOpen={isTaxDisclaimerOpen}
        onAcknowledge={() => {
          setIsTaxDisclaimerOpen(false);
          setCurrentTab('tax');
        }}
        onCancel={() => {
          setIsTaxDisclaimerOpen(false);
        }}
      />

      {/* App Lock Screen Overlay */}
      <AppLockModal
        isLocked={isAppLocked}
        pinCanary={settings?.pinHash}
        biometricsEnabled={!!settings?.biometricsEnabled}
        onUnlock={(pin) => {
          setIsAppLocked(false);
          setSessionPin(pin);
        }}
      />
    </div>
  );
};
