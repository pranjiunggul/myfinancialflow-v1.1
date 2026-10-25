import React, { useMemo } from 'react';
import type { Transaction, Category, CurrencyCode } from '../../types';
import { getBudgetPerformance, getProjectedMonthBurn } from '../../services/analytics';
import { formatCurrency } from '../../services/fx';
import { IconRenderer } from '../common/IconRenderer';

interface BudgetPerformanceWidgetProps {
  transactions: Transaction[];
  categories: Category[];
  baseCurrency: CurrencyCode;
  onOpenCategoriesTab: () => void;
}

export const BudgetPerformanceWidget: React.FC<BudgetPerformanceWidgetProps> = ({
  transactions,
  categories,
  baseCurrency,
  onOpenCategoriesTab,
}) => {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const budgets = useMemo(() => {
    return getBudgetPerformance(transactions, categories, currentMonth);
  }, [transactions, categories, currentMonth]);

  const currentMonthExpense = transactions
    .filter((t) => !t.isDeleted && t.type === 'expense' && t.date.startsWith(currentMonth))
    .reduce((sum, t) => sum + (t.baseAmount || t.amount), 0);

  const burn = useMemo(() => {
    return getProjectedMonthBurn(currentMonthExpense);
  }, [currentMonthExpense]);

  const overBudgetCount = budgets.filter((b) => b.status === 'over_budget').length;

  return (
    <div className="p-5 sm:p-6 rounded-3xl bg-slate-900/60 border border-slate-800/80 space-y-5 shadow-xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center space-x-2">
            <span>Budget vs. Actual Performance</span>
            {overBudgetCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 text-[10px] font-bold border border-rose-500/30">
                {overBudgetCount} Over Budget
              </span>
            )}
          </h3>
          <p className="text-xs text-slate-400">
            Day {burn.daysPassed} of {burn.daysTotal} in current billing cycle
          </p>
        </div>

        <button
          onClick={onOpenCategoriesTab}
          className="text-xs text-blue-400 hover:text-blue-300 font-bold self-start sm:self-auto"
        >
          Manage Budgets
        </button>
      </div>

      {/* Burn Rate Forecast Card */}
      <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-2xl grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
        <div>
          <span className="text-slate-400 block mb-0.5">Daily Spending Pace</span>
          <span className="text-white font-mono font-bold text-sm">
            {formatCurrency(burn.dailyBurnAverage, baseCurrency)}/day
          </span>
        </div>
        <div>
          <span className="text-slate-400 block mb-0.5">Projected Month-End</span>
          <span className="text-amber-400 font-mono font-bold text-sm">
            {formatCurrency(burn.projectedMonthEnd, baseCurrency)}
          </span>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <span className="text-slate-400 block mb-0.5">Current Spent</span>
          <span className="text-white font-mono font-bold text-sm">
            {formatCurrency(currentMonthExpense, baseCurrency)}
          </span>
        </div>
      </div>

      {/* Category Budget Bars */}
      {budgets.length === 0 ? (
        <div className="py-8 text-center text-slate-500 text-xs">
          No categories have monthly budgets configured yet.{' '}
          <button onClick={onOpenCategoriesTab} className="text-blue-400 underline">
            Set budget limits in Categories
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {budgets.map((b) => {
            const isOver = b.status === 'over_budget';
            const isWarning = b.status === 'warning';

            return (
              <div key={b.categoryId} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-2">
                    <div
                      className="p-1 rounded-lg shrink-0"
                      style={{ backgroundColor: `${b.color}20`, color: b.color }}
                    >
                      <IconRenderer name={b.icon} className="w-3.5 h-3.5" />
                    </div>
                    <span className="font-semibold text-slate-200">{b.name}</span>
                    {isOver && (
                      <span className="text-[10px] text-rose-400 font-bold bg-rose-500/10 px-1.5 py-0.2 rounded">
                        +{formatCurrency(Math.abs(b.remaining), baseCurrency)} Over
                      </span>
                    )}
                  </div>

                  <div className="flex items-center space-x-2 font-mono">
                    <span className={`font-bold ${isOver ? 'text-rose-400' : isWarning ? 'text-amber-400' : 'text-slate-200'}`}>
                      {formatCurrency(b.actualSpent, baseCurrency)}
                    </span>
                    <span className="text-slate-500">/ {formatCurrency(b.budget, baseCurrency)}</span>
                    <span className="text-slate-400 text-[11px] font-semibold">({b.percentUsed}%)</span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      isOver ? 'bg-rose-500 shadow-md shadow-rose-500/50' : isWarning ? 'bg-amber-500' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(b.percentUsed, 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
