import React, { useState } from 'react';
import { X, Plus, Trash2, Repeat, Play, CheckCircle } from 'lucide-react';
import type { RecurringRule, Account, Category, CurrencyCode, TransactionType } from '../../types';
import { createRecurringRule, processDueRecurringRules } from '../../services/recurring';
import { db } from '../../db/database';
import { formatCurrency } from '../../services/fx';

interface RecurringRulesModalProps {
  isOpen: boolean;
  onClose: () => void;
  rules: RecurringRule[];
  accounts: Account[];
  categories: Category[];
  baseCurrency: CurrencyCode;
}

export const RecurringRulesModal: React.FC<RecurringRulesModalProps> = ({
  isOpen,
  onClose,
  rules,
  accounts,
  categories,
  baseCurrency,
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [frequency, setFrequency] = useState<RecurringRule['frequency']>('monthly');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [autoPost, setAutoPost] = useState(true);
  const [statusMessage, setStatusMessage] = useState('');

  const activeAccounts = accounts.filter((a) => !a.isDeleted);
  const activeCategories = categories.filter((c) => !c.isDeleted && (c.type === type || c.type === 'both'));

  React.useEffect(() => {
    if (activeAccounts.length > 0 && !accountId) {
      setAccountId(activeAccounts[0].id);
    }
    if (activeCategories.length > 0 && !categoryId) {
      setCategoryId(activeCategories[0].id);
    }
  }, [activeAccounts, activeCategories, accountId, categoryId]);

  if (!isOpen) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (!title.trim() || isNaN(numAmount) || numAmount <= 0) return;

    const account = activeAccounts.find((a) => a.id === accountId);

    await createRecurringRule({
      title: title.trim(),
      type,
      amount: numAmount,
      currency: account?.currency || baseCurrency,
      accountId: accountId || activeAccounts[0]?.id || '',
      categoryId: categoryId || activeCategories[0]?.id || 'cat_bills',
      frequency,
      intervalValue: 1,
      startDate,
      nextExecutionDate: startDate,
      autoPost,
    });

    setIsCreating(false);
    setTitle('');
    setAmount('');
    setStatusMessage('Recurring rule created successfully!');
  };

  const handleRunScheduler = async () => {
    const res = await processDueRecurringRules();
    setStatusMessage(`Processed rules: ${res.processedCount} transaction(s) auto-posted.`);
  };

  const handleDeleteRule = async (id: string) => {
    await db.recurring_rules.update(id, { isDeleted: true, updatedAt: Date.now() });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400">
              <Repeat className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Recurring Rules & Subscriptions</h2>
              <p className="text-xs text-slate-400">Automate recurring bills, salaries, and bank fees</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {statusMessage && (
            <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl flex items-center space-x-2 text-blue-400 text-xs">
              <CheckCircle className="w-4 h-4 shrink-0" />
              <span>{statusMessage}</span>
            </div>
          )}

          {/* Action bar: Add rule + Trigger processor */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => setIsCreating(!isCreating)}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 transition"
            >
              <Plus className="w-4 h-4" />
              <span>{isCreating ? 'Cancel' : 'New Recurring Rule'}</span>
            </button>

            <button
              onClick={handleRunScheduler}
              className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition border border-slate-700"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Process Due Rules Now</span>
            </button>
          </div>

          {/* Create Form */}
          {isCreating && (
            <form onSubmit={handleCreate} className="p-4 bg-slate-950/60 border border-slate-800 rounded-2xl space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">New Recurring Rule</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Title</label>
                  <input
                    type="text"
                    placeholder="e.g. Netflix, Wifi, Salary, Gym"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Amount</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white font-mono text-sm"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Type</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as TransactionType)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs"
                  >
                    <option value="expense">Expense</option>
                    <option value="income">Income</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Frequency</label>
                  <select
                    value={frequency}
                    onChange={(e) => setFrequency(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Bi-weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs"
                    required
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="autoPostCheckbox"
                    checked={autoPost}
                    onChange={(e) => setAutoPost(e.target.checked)}
                    className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                  />
                  <label htmlFor="autoPostCheckbox" className="text-xs text-slate-300 cursor-pointer">
                    Auto-post automatically on scheduled date
                  </label>
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition"
                >
                  Save Rule
                </button>
              </div>
            </form>
          )}

          {/* Rules List */}
          <div className="space-y-2.5">
            {rules.filter((r) => !r.isDeleted).length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-xs">
                No recurring rules set. Click "New Recurring Rule" to add subscriptions or bills.
              </div>
            ) : (
              rules
                .filter((r) => !r.isDeleted)
                .map((r) => {
                  const account = activeAccounts.find((a) => a.id === r.accountId);
                  return (
                    <div
                      key={r.id}
                      className="p-3.5 bg-slate-950/40 border border-slate-800 rounded-2xl flex items-center justify-between text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-white text-sm">{r.title}</span>
                          <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 uppercase text-[10px] font-bold">
                            {r.frequency}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2 text-slate-400">
                          <span>Next: {r.nextExecutionDate}</span>
                          <span>•</span>
                          <span>{account?.name}</span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-3">
                        <span className="font-bold font-mono text-sm text-white">
                          {formatCurrency(r.amount, r.currency)}
                        </span>
                        <button
                          onClick={() => handleDeleteRule(r.id)}
                          className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
