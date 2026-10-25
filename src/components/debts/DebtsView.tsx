import React, { useState } from 'react';
import {
  HandCoins,
  Receipt,
  Plus,
  Trash2,
  Calendar,
  User,
} from 'lucide-react';
import type { DebtReceivable, Account, CurrencyCode } from '../../types';
import { formatCurrency } from '../../services/fx';
import { softDeleteDebtReceivable } from '../../services/debt';
import { DebtRepaymentModal } from './DebtRepaymentModal';

interface DebtsViewProps {
  debts: DebtReceivable[];
  accounts: Account[];
  baseCurrency: CurrencyCode;
  onOpenNewDebt: () => void;
}

export const DebtsView: React.FC<DebtsViewProps> = ({
  debts,
  accounts,
  baseCurrency,
  onOpenNewDebt,
}) => {
  const [activeTab, setActiveTab] = useState<'debt' | 'receivable'>('debt');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'settled'>('all');
  const [selectedDebtForRepayment, setSelectedDebtForRepayment] = useState<DebtReceivable | null>(null);

  const activeDebts = debts.filter((d) => !d.isDeleted && d.type === activeTab);

  const filteredDebts = activeDebts.filter((d) => {
    if (statusFilter === 'open') return d.status === 'open' || d.status === 'partially_paid';
    if (statusFilter === 'settled') return d.status === 'settled';
    return true;
  });

  // Calculate totals
  const totalDebtsOwed = debts
    .filter((d) => !d.isDeleted && d.type === 'debt' && d.status !== 'settled')
    .reduce((sum, d) => sum + d.currentBalance, 0);

  const totalReceivablesOwed = debts
    .filter((d) => !d.isDeleted && d.type === 'receivable' && d.status !== 'settled')
    .reduce((sum, d) => sum + d.currentBalance, 0);

  const handleDelete = async (debt: DebtReceivable) => {
    if (confirm(`Are you sure you want to delete this ${debt.type} record? All linked transactions will also be moved to Trash.`)) {
      await softDeleteDebtReceivable(debt.id);
    }
  };

  return (
    <div className="space-y-6 pb-20 sm:pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            Debts & Receivables
          </h2>
          <p className="text-xs text-slate-400">
            Track money you owe (Hutang) and money owed to you (Piutang)
          </p>
        </div>

        <button
          onClick={onOpenNewDebt}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs sm:text-sm font-bold shadow-lg shadow-blue-600/30 flex items-center space-x-1.5 transition self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>New Debt / Receivable</span>
        </button>
      </div>

      {/* KPI Cards: Debt vs Receivable */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800/80 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
              Total Outstanding Debts (Owed by You)
            </span>
            <div className="text-2xl font-black text-amber-400 font-mono">
              {formatCurrency(totalDebtsOwed, baseCurrency)}
            </div>
            <span className="text-[11px] text-slate-500 mt-1 block">
              {debts.filter((d) => !d.isDeleted && d.type === 'debt' && d.status !== 'settled').length} active obligations
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
            <HandCoins className="w-6 h-6" />
          </div>
        </div>

        <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800/80 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
              Total Receivables (Owed to You)
            </span>
            <div className="text-2xl font-black text-sky-400 font-mono">
              {formatCurrency(totalReceivablesOwed, baseCurrency)}
            </div>
            <span className="text-[11px] text-slate-500 mt-1 block">
              {debts.filter((d) => !d.isDeleted && d.type === 'receivable' && d.status !== 'settled').length} active debtors
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-sky-500/10 text-sky-400 flex items-center justify-center shrink-0">
            <Receipt className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Type Switcher Tabs & Status Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setActiveTab('debt')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-bold transition ${
              activeTab === 'debt'
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <HandCoins className="w-4 h-4" />
            <span>Money I Owe (Debts)</span>
          </button>
          <button
            onClick={() => setActiveTab('receivable')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-bold transition ${
              activeTab === 'receivable'
                ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Receipt className="w-4 h-4" />
            <span>Money Owed to Me (Receivables)</span>
          </button>
        </div>

        <div className="flex items-center space-x-1.5 self-start sm:self-auto">
          {(['all', 'open', 'settled'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition ${
                statusFilter === s
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800/60 text-slate-400 hover:text-white'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Debt Records Grid */}
      {filteredDebts.length === 0 ? (
        <div className="py-16 text-center bg-slate-900/30 border border-slate-800/60 rounded-3xl space-y-2">
          <p className="text-slate-400 text-sm">
            No {activeTab === 'debt' ? 'debts' : 'receivables'} found for this filter.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredDebts.map((item) => {
            const paidAmount = item.originalAmount - item.currentBalance;
            const progress = Math.min(100, Math.round((paidAmount / item.originalAmount) * 100));
            const isSettled = item.status === 'settled';

            return (
              <div
                key={item.id}
                className={`p-5 rounded-3xl bg-slate-900 border transition flex flex-col justify-between space-y-4 shadow-xl ${
                  isSettled ? 'border-slate-800/60 opacity-75' : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <div
                      className={`p-3 rounded-2xl ${
                        item.type === 'debt' ? 'bg-amber-500/10 text-amber-400' : 'bg-sky-500/10 text-sky-400'
                      }`}
                    >
                      <User className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white">{item.personName}</h3>
                      <div className="flex items-center space-x-2 text-xs text-slate-400">
                        {item.dueDate ? (
                          <span className="flex items-center space-x-1">
                            <Calendar className="w-3.5 h-3.5 text-slate-500" />
                            <span>Due: {item.dueDate}</span>
                          </span>
                        ) : (
                          <span>No due date</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <span
                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      isSettled
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : item.status === 'partially_paid'
                        ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                        : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    }`}
                  >
                    {item.status.replace('_', ' ')}
                  </span>
                </div>

                {/* Balance Progress */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">
                      Remaining: <strong className="text-white font-mono">{formatCurrency(item.currentBalance, item.currency)}</strong>
                    </span>
                    <span className="text-slate-400 font-mono">
                      of {formatCurrency(item.originalAmount, item.currency)}
                    </span>
                  </div>

                  <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isSettled ? 'bg-emerald-500' : item.type === 'debt' ? 'bg-amber-500' : 'bg-sky-500'
                      }`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                {/* Actions Footer */}
                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between">
                  <button
                    onClick={() => handleDelete(item)}
                    className="p-2 text-slate-500 hover:text-rose-400 rounded-lg transition"
                    title="Delete record"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>

                  {!isSettled && (
                    <button
                      onClick={() => setSelectedDebtForRepayment(item)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold text-white transition shadow-md ${
                        item.type === 'debt'
                          ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/20'
                          : 'bg-sky-600 hover:bg-sky-500 shadow-sky-600/20'
                      }`}
                    >
                      Record Repayment
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Repayment Modal */}
      <DebtRepaymentModal
        isOpen={!!selectedDebtForRepayment}
        onClose={() => setSelectedDebtForRepayment(null)}
        debt={selectedDebtForRepayment}
        accounts={accounts}
      />
    </div>
  );
};
