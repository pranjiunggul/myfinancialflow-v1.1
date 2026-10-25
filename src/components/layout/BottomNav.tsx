import React from 'react';
import {
  LayoutDashboard,
  ReceiptText,
  Landmark,
  HandCoins,
  Settings,
  Sparkles,
} from 'lucide-react';
import { useTranslation } from '../../i18n';

export type TabKey = 'dashboard' | 'transactions' | 'chat' | 'accounts' | 'categories' | 'debts' | 'settings' | 'tax';

interface BottomNavProps {
  currentTab: TabKey;
  onSelectTab: (tab: TabKey) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ currentTab, onSelectTab }) => {
  const { t } = useTranslation();

  const navItems: { key: TabKey; label: string; icon: React.FC<{ className?: string }> }[] = [
    { key: 'dashboard', label: t('nav.dashboard'), icon: LayoutDashboard },
    { key: 'transactions', label: t('nav.ledger'), icon: ReceiptText },
    { key: 'chat', label: t('nav.chat'), icon: Sparkles },
    { key: 'debts', label: t('nav.debts'), icon: HandCoins },
    { key: 'accounts', label: t('nav.accounts'), icon: Landmark },
    { key: 'settings', label: t('nav.settings'), icon: Settings },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 bg-slate-950/90 backdrop-blur-xl border-t border-slate-800/80 px-2 py-1 safe-bottom sm:hidden">
      <div className="grid grid-cols-6 gap-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.key;
          return (
            <button
              key={item.key}
              onClick={() => onSelectTab(item.key)}
              className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl transition ${
                isActive
                  ? 'text-indigo-400 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'scale-110 text-indigo-400' : ''}`} />
              <span className="text-[9px] mt-1 tracking-tight truncate">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
