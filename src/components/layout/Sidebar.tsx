import React from 'react';
import {
  LayoutDashboard,
  ReceiptText,
  Landmark,
  FolderTree,
  HandCoins,
  Settings,
  Sparkles,
  History,
  Repeat,
  ShieldCheck,
  Send,
  Scale,
} from 'lucide-react';
import type { TabKey } from './BottomNav';
import { useTranslation } from '../../i18n';

interface SidebarProps {
  currentTab: TabKey;
  onSelectTab: (tab: TabKey) => void;
  onOpenAuditLogs: () => void;
  onOpenRecurringRules: () => void;
  onOpenTelegramInbox?: () => void;
  pendingTelegramCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  onOpenAuditLogs,
  onOpenRecurringRules,
  onOpenTelegramInbox,
  pendingTelegramCount = 0,
}) => {
  const { t } = useTranslation();

  const navItems: { key: TabKey; label: string; icon: React.FC<{ className?: string }> }[] = [
    { key: 'dashboard', label: t('nav.overview'), icon: LayoutDashboard },
    { key: 'chat', label: t('nav.chat'), icon: Sparkles },
    { key: 'transactions', label: t('nav.transactions'), icon: ReceiptText },
    { key: 'debts', label: t('nav.debts'), icon: HandCoins },
    { key: 'accounts', label: t('nav.accounts'), icon: Landmark },
    { key: 'categories', label: t('nav.categories'), icon: FolderTree },
    { key: 'settings', label: t('nav.settings'), icon: Settings },
  ];

  return (
    <aside className="hidden sm:flex flex-col w-64 border-r border-slate-800/80 bg-slate-950/40 p-4 shrink-0 min-h-[calc(100vh-65px)]">
      <div className="space-y-1.5 flex-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.key;
          return (
            <button
              key={item.key}
              onClick={() => onSelectTab(item.key)}
              className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition ${
                isActive
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <Icon className="w-5 h-5 shrink-0" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Secondary Tools: Recurring & Audit Trail & Telegram */}
      <div className="pt-4 border-t border-slate-800/80 space-y-1">
        {onOpenTelegramInbox && (
          <button
            onClick={onOpenTelegramInbox}
            className="w-full flex items-center justify-between px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-900/60 transition"
          >
            <div className="flex items-center space-x-3">
              <Send className="w-4 h-4 text-sky-400 -rotate-12 translate-x-0.5" />
              <span>{t('nav.telegram')}</span>
            </div>
            {pendingTelegramCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-sky-500/20 text-sky-400 font-bold text-[10px] border border-sky-500/30">
                {pendingTelegramCount}
              </span>
            )}
          </button>
        )}

        <button
          onClick={onOpenRecurringRules}
          className="w-full flex items-center space-x-3 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-900/60 transition"
        >
          <Repeat className="w-4 h-4 text-indigo-400" />
          <span>{t('nav.recurring')}</span>
        </button>

        <button
          onClick={onOpenAuditLogs}
          className="w-full flex items-center space-x-3 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-900/60 transition"
        >
          <History className="w-4 h-4 text-blue-400" />
          <span>{t('nav.audit')}</span>
        </button>

        <button
          onClick={() => onSelectTab('tax')}
          className={`w-full flex items-center space-x-3 px-3.5 py-2 rounded-xl text-xs font-semibold transition ${
            currentTab === 'tax'
              ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-900/60'
          }`}
        >
          <Scale className="w-4 h-4 text-emerald-400" />
          <span>Estimator Pajak (PPh)</span>
        </button>
      </div>

      {/* Offline Status Badge */}
      <div className="mt-4 p-3 rounded-2xl bg-slate-900/60 border border-slate-800/60 text-xs">
        <div className="flex items-center space-x-2 text-emerald-400 font-semibold mb-1">
          <ShieldCheck className="w-4 h-4 shrink-0" />
          <span>Zero-Knowledge Guard</span>
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          100% Client-side. API keys & balances never leave your device unencrypted.
        </p>
      </div>
    </aside>
  );
};
