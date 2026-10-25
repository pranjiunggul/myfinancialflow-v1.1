import React, { useState } from 'react';
import { Plus, Edit2, Landmark, TrendingUp } from 'lucide-react';
import type { Account, CurrencyCode } from '../../types';
import { formatCurrency } from '../../services/fx';
import { IconRenderer } from '../common/IconRenderer';
import { InvestmentsView } from '../investments/InvestmentsView';

interface AccountsViewProps {
  accounts: Account[];
  baseCurrency: CurrencyCode;
  onOpenNewAccount: () => void;
  onEditAccount: (account: Account) => void;
}

export const AccountsView: React.FC<AccountsViewProps> = ({
  accounts,
  baseCurrency,
  onOpenNewAccount,
  onEditAccount,
}) => {
  const [subTab, setSubTab] = useState<'cash_banks' | 'investments'>('cash_banks');
  const activeAccounts = accounts.filter((a) => !a.isDeleted);

  const totalCalculatedNet = activeAccounts
    .filter((a) => a.includeInNetWorth)
    .reduce((sum, acc) => {
      const approxRate = acc.currency === baseCurrency ? 1.0 : acc.currency === 'USD' ? 16250 : 1.0;
      return sum + acc.currentBalance * approxRate;
    }, 0);

  return (
    <div className="space-y-6 pb-20 sm:pb-8">
      {/* Sub-Tab Navigation: Cash & Bank Accounts vs Non-Cash Investments */}
      <div className="flex items-center space-x-1 p-1 bg-slate-900 border border-slate-800 rounded-2xl w-fit">
        <button
          onClick={() => setSubTab('cash_banks')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            subTab === 'cash_banks'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Landmark className="w-3.5 h-3.5" />
          <span>Cash & Bank Accounts</span>
        </button>

        <button
          onClick={() => setSubTab('investments')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            subTab === 'investments'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5" />
          <span>Investments & Non-Cash</span>
        </button>
      </div>

      {subTab === 'investments' ? (
        <InvestmentsView baseCurrency={baseCurrency} />
      ) : (
        <>
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">Accounts & Wallets</h2>
              <p className="text-xs text-slate-400">
                {activeAccounts.length} accounts configured • Total Net Worth: {formatCurrency(totalCalculatedNet, baseCurrency)}
              </p>
            </div>

            <button
              onClick={onOpenNewAccount}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs sm:text-sm font-bold shadow-lg shadow-blue-600/30 flex items-center space-x-1.5 transition self-start sm:self-auto"
            >
              <Plus className="w-4 h-4" />
              <span>New Account</span>
            </button>
          </div>

          {/* Grid of Accounts */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {activeAccounts.map((acc) => (
          <div
            key={acc.id}
            className="p-5 rounded-3xl bg-slate-900 border border-slate-800/80 hover:border-slate-700 transition flex flex-col justify-between space-y-4 shadow-xl relative overflow-hidden group"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-3">
                <div
                  className="p-3 rounded-2xl shrink-0 shadow-md"
                  style={{ backgroundColor: `${acc.color}20`, color: acc.color }}
                >
                  <IconRenderer name={acc.icon} className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white group-hover:text-blue-400 transition">
                    {acc.name}
                  </h3>
                  <div className="flex items-center space-x-2 text-xs text-slate-400">
                    <span className="uppercase font-semibold tracking-wider">{acc.type}</span>
                    <span>•</span>
                    <span className="font-mono text-slate-300 font-bold">{acc.currency}</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => onEditAccount(acc)}
                className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition"
              >
                <Edit2 className="w-4 h-4" />
              </button>
            </div>

            {/* Balances */}
            <div>
              <span className="text-[11px] text-slate-400 uppercase tracking-wider block font-semibold mb-0.5">
                Current Balance
              </span>
              <div className="text-2xl font-black text-white font-mono tracking-tight">
                {formatCurrency(acc.currentBalance, acc.currency)}
              </div>
              {acc.currency !== baseCurrency && (
                <div className="text-xs text-slate-400 font-mono mt-0.5">
                  ≈ {formatCurrency(acc.currentBalance * (acc.currency === 'USD' ? 16250 : 1.0), baseCurrency)} (Normalized)
                </div>
              )}
            </div>

            {/* Monthly Admin Fee & Net worth pill */}
            <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
              {acc.monthlyAdminFee?.enabled ? (
                <span className="text-amber-400/90 font-mono text-[11px] bg-amber-500/10 px-2 py-0.5 rounded-lg border border-amber-500/20">
                  Fee: {formatCurrency(acc.monthlyAdminFee.amount, acc.currency)} on day {acc.monthlyAdminFee.dayOfMonth}
                </span>
              ) : (
                <span className="text-slate-500 text-[11px]">No recurring admin fee</span>
              )}

              {acc.includeInNetWorth ? (
                <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full font-bold">
                  In Net Worth
                </span>
              ) : (
                <span className="text-[10px] text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">
                  Excluded
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
        </>
      )}
    </div>
  );
};
