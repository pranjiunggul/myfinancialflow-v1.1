import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  ExternalLink,
  CreditCard,
} from 'lucide-react';
import { db } from '../../db/database';
import { formatCurrency } from '../../services/fx';
import type { Account, Transaction, CurrencyCode } from '../../types';

interface FastGlanceViewProps {
  baseCurrency: CurrencyCode;
  onOpenFullApp: () => void;
}

export const FastGlanceView: React.FC<FastGlanceViewProps> = ({
  baseCurrency,
  onOpenFullApp,
}) => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [todaySpend, setTodaySpend] = useState<number>(0);
  const [recentTxs, setRecentTxs] = useState<Transaction[]>([]);
  const [netWorth, setNetWorth] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadGlanceData() {
      try {
        const todayStr = new Date().toISOString().split('T')[0];
        const [accs, txs] = await Promise.all([
          db.accounts.filter((a) => !a.isDeleted).toArray(),
          db.transactions
            .filter((t) => !t.isDeleted && t.date === todayStr)
            .reverse()
            .sortBy('timestamp'),
        ]);

        const activeAccounts = accs.filter((a) => a.includeInNetWorth);
        const totalNW = activeAccounts.reduce((sum, a) => sum + (a.currentBalance || 0), 0);
        const todayExpenses = txs
          .filter((t) => t.type === 'expense')
          .reduce((sum, t) => sum + (t.baseAmount || t.amount), 0);

        setAccounts(accs);
        setNetWorth(totalNW);
        setTodaySpend(todayExpenses);
        setRecentTxs(txs.slice(0, 4));

        // Update PWA App Badge if supported
        if (typeof navigator !== 'undefined' && 'setAppBadge' in navigator) {
          try {
            if (txs.length > 0) {
              (navigator as any).setAppBadge(txs.length);
            } else {
              (navigator as any).clearAppBadge();
            }
          } catch {}
        }
      } catch (err) {
        console.warn('Failed to load fast glance data:', err);
      } finally {
        setIsLoading(false);
      }
    }

    loadGlanceData();
  }, [baseCurrency]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white text-xs">
        <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin mr-2" />
        <span>Loading instant glance...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white p-4 max-w-md mx-auto flex flex-col justify-between">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 rounded-lg bg-indigo-600/30 text-indigo-400 border border-indigo-500/30">
              <Sparkles className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold tracking-wider text-slate-300 uppercase">
              Fast Glance Widget
            </span>
          </div>

          <button
            onClick={onOpenFullApp}
            className="flex items-center space-x-1 text-xs text-indigo-400 hover:text-indigo-300 font-semibold"
          >
            <span>Open Full App</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Net Worth Card */}
        <div className="p-5 rounded-3xl bg-gradient-to-br from-indigo-950/70 to-slate-900 border border-indigo-500/30 shadow-xl">
          <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-300/80">
            Current Net Worth
          </p>
          <h2 className="text-3xl font-black text-white mt-1">
            {formatCurrency(netWorth, baseCurrency)}
          </h2>
          <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between text-xs">
            <span className="text-slate-400">Today's Total Spend:</span>
            <span className="font-bold text-rose-400">
              -{formatCurrency(todaySpend, baseCurrency)}
            </span>
          </div>
        </div>

        {/* Account Balances Quick-List */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 px-1">
            Account Balances
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {accounts.slice(0, 4).map((acc) => (
              <div
                key={acc.id}
                className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between"
              >
                <div className="flex items-center space-x-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span className="text-xs font-semibold text-slate-200 truncate">{acc.name}</span>
                </div>
                <p className="text-sm font-bold text-white mt-2 font-mono">
                  {formatCurrency(acc.currentBalance, acc.currency)}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Today's Transactions */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 px-1">
            Today's Activity ({recentTxs.length})
          </h3>
          {recentTxs.length === 0 ? (
            <div className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800 text-center text-xs text-slate-500">
              No transactions recorded today yet.
            </div>
          ) : (
            <div className="space-y-1.5">
              {recentTxs.map((tx) => (
                <div
                  key={tx.id}
                  className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between text-xs"
                >
                  <span className="text-slate-300 font-medium truncate max-w-[200px]">
                    {tx.description}
                  </span>
                  <span
                    className={`font-mono font-bold ${
                      tx.type === 'expense' ? 'text-rose-400' : 'text-emerald-400'
                    }`}
                  >
                    {tx.type === 'expense' ? '-' : '+'}
                    {formatCurrency(tx.amount, tx.currency)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer Info on Platform Limitations */}
      <div className="pt-4 pb-2 text-center text-[10px] text-slate-500 border-t border-slate-900">
        <p>
          💡 Mobile browser PWA limitation: Native home screen interactive widgets are currently
          restricted by Android/iOS browser sandboxes. Use App Icon Shortcuts for instant access.
        </p>
      </div>
    </div>
  );
};
