import React, { useState } from 'react';
import { Plus, Edit2, TrendingDown, TrendingUp } from 'lucide-react';
import type { Category, Transaction, CurrencyCode } from '../../types';
import { formatCurrency } from '../../services/fx';
import { IconRenderer } from '../common/IconRenderer';

interface CategoriesViewProps {
  categories: Category[];
  transactions: Transaction[];
  baseCurrency: CurrencyCode;
  onOpenNewCategory: () => void;
  onEditCategory: (category: Category) => void;
}

export const CategoriesView: React.FC<CategoriesViewProps> = ({
  categories,
  transactions,
  baseCurrency,
  onOpenNewCategory,
  onEditCategory,
}) => {
  const [activeTab, setActiveTab] = useState<'expense' | 'income'>('expense');

  const activeCategories = categories.filter(
    (c) => !c.isDeleted && (c.type === activeTab || c.type === 'both')
  );

  // Calculate current month actual spending for each category
  const currentMonth = new Date().toISOString().slice(0, 7);
  const currentMonthTxs = transactions.filter(
    (t) => !t.isDeleted && t.date.startsWith(currentMonth) && t.type === activeTab
  );

  const spentMap = new Map<string, number>();
  for (const tx of currentMonthTxs) {
    const current = spentMap.get(tx.categoryId) || 0;
    spentMap.set(tx.categoryId, current + (tx.baseAmount || tx.amount));
  }

  return (
    <div className="space-y-6 pb-20 sm:pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">Categories & Budgets</h2>
          <p className="text-xs text-slate-400">
            Organize transactions and set monthly budget limits
          </p>
        </div>

        <button
          onClick={onOpenNewCategory}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs sm:text-sm font-bold shadow-lg shadow-blue-600/30 flex items-center space-x-1.5 transition self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>New Category</span>
        </button>
      </div>

      {/* Tabs: Expense vs Income */}
      <div className="flex items-center space-x-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setActiveTab('expense')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-bold transition ${
            activeTab === 'expense'
              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <TrendingDown className="w-4 h-4" />
          <span>Expense Categories</span>
        </button>
        <button
          onClick={() => setActiveTab('income')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-bold transition ${
            activeTab === 'income'
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span>Income Categories</span>
        </button>
      </div>

      {/* Grid of Categories */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {activeCategories.map((cat) => {
          const spent = spentMap.get(cat.id) || 0;
          const budget = cat.budgetMonthly || 0;
          const percentUsed = budget > 0 ? Math.round((spent / budget) * 100) : 0;
          const isOverBudget = budget > 0 && spent > budget;

          return (
            <div
              key={cat.id}
              className="p-5 rounded-3xl bg-slate-900 border border-slate-800/80 hover:border-slate-700 transition flex flex-col justify-between space-y-4 shadow-xl"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  <div
                    className="p-3 rounded-2xl shrink-0 shadow-md"
                    style={{ backgroundColor: `${cat.color}20`, color: cat.color }}
                  >
                    <IconRenderer name={cat.icon} className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center space-x-2">
                      <span>{cat.name}</span>
                      {cat.isSystem && (
                        <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-normal">
                          System
                        </span>
                      )}
                    </h3>
                    <span className="text-xs text-slate-400">
                      This month: {formatCurrency(spent, baseCurrency)}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => onEditCategory(cat)}
                  className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
              </div>

              {/* Budget Progress Bar */}
              {budget > 0 ? (
                <div className="space-y-1.5 pt-2">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className={isOverBudget ? 'text-rose-400 font-bold' : 'text-slate-400'}>
                      {percentUsed}% of budget
                    </span>
                    <span className="text-slate-300">
                      Budget: {formatCurrency(budget, baseCurrency)}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isOverBudget ? 'bg-rose-500' : 'bg-blue-500'
                      }`}
                      style={{ width: `${Math.min(percentUsed, 100)}%` }}
                    />
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-500 pt-2 font-mono">
                  No monthly budget limit set
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
