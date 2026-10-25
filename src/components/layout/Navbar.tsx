import React from 'react';
import { Plus, Wifi, WifiOff, Send, Globe } from 'lucide-react';
import type { CurrencyCode } from '../../types';
import { SyncStatusBadge } from '../sync/SyncStatusBadge';
import { useTranslation } from '../../i18n';

interface NavbarProps {
  baseCurrency: CurrencyCode;
  onOpenNewTransaction: () => void;
  isOnline: boolean;
  onOpenSettings: () => void;
  onOpenConflictModal?: () => void;
  onOpenTelegramInbox?: () => void;
  pendingTelegramCount?: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  baseCurrency,
  onOpenNewTransaction,
  isOnline,
  onOpenSettings,
  onOpenConflictModal,
  onOpenTelegramInbox,
  pendingTelegramCount = 0,
}) => {
  const { t, language, setLanguage } = useTranslation();

  const handleToggleLanguage = () => {
    const nextLang = language === 'id' ? 'en' : 'id';
    setLanguage(nextLang);
  };
  return (
    <header className="sticky top-0 z-30 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800/80 px-4 lg:px-8 py-3.5 safe-top">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <span className="text-white font-black text-lg">M</span>
          </div>
          <div>
            <h1 className="text-base font-extrabold text-white tracking-tight flex items-center space-x-2">
              <span>MyFinancialFlow</span>
              <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                V1.1
              </span>
            </h1>
            <p className="text-[11px] text-slate-400 font-medium">Offline-First Ledger</p>
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center space-x-2.5">
          {/* Cloud Sync Status Badge */}
          <SyncStatusBadge
            onOpenConflictModal={onOpenConflictModal}
            onTriggerSync={onOpenSettings}
          />

          {/* Online/Offline status */}
          <div
            className={`hidden sm:flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
              isOnline
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
            }`}
          >
            {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            <span>{isOnline ? t('nav.online') : t('nav.offline')}</span>
          </div>

          {/* Quick Language Toggle Pill */}
          <button
            onClick={handleToggleLanguage}
            title={language === 'id' ? 'Ganti ke Bahasa Inggris (Switch to English)' : 'Switch to Bahasa Indonesia'}
            className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 text-xs font-bold text-slate-200 transition"
          >
            <Globe className="w-3.5 h-3.5 text-indigo-400" />
            <span className="font-mono text-xs">{language.toUpperCase()}</span>
          </button>

          {/* Base Currency Pill */}
          <button
            onClick={onOpenSettings}
            className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 text-xs font-bold text-slate-200 transition"
          >
            <span className="text-slate-400 text-[10px] uppercase">{t('nav.base')}:</span>
            <span className="font-mono text-blue-400">{baseCurrency}</span>
          </button>

          {/* Telegram Inbound Tray Pill */}
          {onOpenTelegramInbox && (
            <button
              onClick={onOpenTelegramInbox}
              title="Open Telegram Inbound Review Tray"
              className="relative p-2 rounded-lg bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 text-sky-400 hover:text-sky-300 transition"
            >
              <Send className="w-4 h-4 -rotate-12 translate-x-0.5" />
              {pendingTelegramCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-sky-500 text-white text-[9px] font-black flex items-center justify-center animate-pulse">
                  {pendingTelegramCount > 9 ? '9+' : pendingTelegramCount}
                </span>
              )}
            </button>
          )}

          {/* Quick Add Button */}
          <button
            onClick={onOpenNewTransaction}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs sm:text-sm font-bold shadow-lg shadow-blue-600/30 transition transform active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">{t('nav.addTransaction')}</span>
            <span className="sm:hidden">{t('nav.add')}</span>
          </button>
        </div>
      </div>
    </header>
  );
};
