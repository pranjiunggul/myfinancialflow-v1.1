import React, { useState } from 'react';
import { X, Plus, AlertCircle } from 'lucide-react';
import type { Category, CategoryType } from '../../types';
import { createCategory } from '../../services/ledger';
import { IconRenderer } from '../common/IconRenderer';

interface QuickAddCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (category: Category) => void;
  initialType?: CategoryType;
}

const QUICK_ICONS = [
  'Tag',
  'Utensils',
  'Coffee',
  'ShoppingCart',
  'ShoppingBag',
  'Car',
  'Zap',
  'HeartPulse',
  'Laptop',
  'Home',
  'Briefcase',
  'Gift',
  'Plane',
  'Film',
];

const QUICK_COLORS = [
  '#ef4444', // Red
  '#f97316', // Orange
  '#eab308', // Amber
  '#22c55e', // Emerald
  '#14b8a6', // Teal
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
  '#6366f1', // Indigo
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#64748b', // Slate
];

export const QuickAddCategoryModal: React.FC<QuickAddCategoryModalProps> = ({
  isOpen,
  onClose,
  onCreated,
  initialType = 'expense',
}) => {
  const [name, setName] = useState('');
  const [type, setType] = useState<CategoryType>(initialType);
  const [icon, setIcon] = useState('Tag');
  const [color, setColor] = useState('#3b82f6');
  const [budgetMonthly, setBudgetMonthly] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setErrorMessage('Category name is required.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const parsedBudget = budgetMonthly.trim() ? parseFloat(budgetMonthly) : undefined;
      const created = await createCategory({
        name: trimmed,
        type,
        icon,
        color,
        isSystem: false,
        budgetMonthly: parsedBudget,
      });

      // Clear state and notify parent
      setName('');
      setBudgetMonthly('');
      onCreated(created);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to create category');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80 bg-slate-950/60">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400">
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Quick Add Category</h3>
              <p className="text-[11px] text-slate-400">Add without leaving your current transaction</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMessage && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center space-x-2 text-rose-400 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Name Input */}
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
              Category Name *
            </label>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Skincare, Pet Supplies, Freelance"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-600"
              required
            />
          </div>

          {/* Type Selector (Expense vs Income vs Both) */}
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
              Category Type
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['expense', 'income', 'both'] as const).map((catType) => (
                <button
                  key={catType}
                  type="button"
                  onClick={() => setType(catType)}
                  className={`py-2 px-2 rounded-xl text-xs font-bold capitalize transition border ${
                    type === catType
                      ? catType === 'expense'
                        ? 'bg-rose-500/20 border-rose-500 text-rose-300'
                        : catType === 'income'
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                        : 'bg-blue-500/20 border-blue-500 text-blue-300'
                      : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {catType}
                </button>
              ))}
            </div>
          </div>

          {/* Color & Icon Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                Color
              </label>
              <div className="flex flex-wrap gap-1.5 p-2 rounded-xl bg-slate-950/60 border border-slate-800">
                {QUICK_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`w-6 h-6 rounded-full transition transform hover:scale-110 ${
                      color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-900 scale-110' : ''
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                Icon
              </label>
              <div className="grid grid-cols-4 gap-1.5 p-2 rounded-xl bg-slate-950/60 border border-slate-800 max-h-24 overflow-y-auto">
                {QUICK_ICONS.map((ic) => (
                  <button
                    key={ic}
                    type="button"
                    onClick={() => setIcon(ic)}
                    className={`p-1.5 rounded-lg flex items-center justify-center transition ${
                      icon === ic
                        ? 'bg-blue-500 text-white'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    <IconRenderer name={ic} className="w-4 h-4" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Monthly Budget (Optional) */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Monthly Budget Limit (Optional)
            </label>
            <input
              type="number"
              step="any"
              value={budgetMonthly}
              onChange={(e) => setBudgetMonthly(e.target.value)}
              placeholder="e.g. 500000"
              className="w-full px-3.5 py-2 rounded-xl bg-slate-950/80 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center space-x-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold transition shadow-lg shadow-blue-600/20"
            >
              {isSubmitting ? 'Saving...' : 'Save & Select'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
