import React, { useState, useEffect } from 'react';
import { X, Trash2, AlertCircle } from 'lucide-react';
import type { Category, CategoryType } from '../../types';
import { createCategory, updateCategory, softDeleteCategory } from '../../services/ledger';
import { IconRenderer } from '../common/IconRenderer';

interface CategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  categoryToEdit?: Category | null;
  allCategories: Category[];
}

const CATEGORY_ICONS = [
  'Utensils', 'ShoppingCart', 'Car', 'Zap', 'ShoppingBag', 'HeartPulse',
  'Film', 'GraduationCap', 'Briefcase', 'Laptop', 'TrendingUp', 'Gift',
  'Home', 'Plane', 'Coffee', 'Dumbbell', 'Music', 'Book', 'Smartphone', 'Receipt'
];

const COLOR_OPTIONS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#06b6d4',
  '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#ec4899', '#64748b'
];

export const CategoryModal: React.FC<CategoryModalProps> = ({
  isOpen,
  onClose,
  categoryToEdit,
  allCategories,
}) => {
  const [name, setName] = useState('');
  const [type, setType] = useState<CategoryType>('expense');
  const [icon, setIcon] = useState('Utensils');
  const [color, setColor] = useState('#ef4444');
  const [budgetMonthly, setBudgetMonthly] = useState<string>('');

  // Reassignment state for deletion
  const [isDeleting, setIsDeleting] = useState(false);
  const [replacementCatId, setReplacementCatId] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (categoryToEdit) {
      setName(categoryToEdit.name);
      setType(categoryToEdit.type);
      setIcon(categoryToEdit.icon);
      setColor(categoryToEdit.color);
      setBudgetMonthly(categoryToEdit.budgetMonthly ? categoryToEdit.budgetMonthly.toString() : '');
    } else {
      setName('');
      setType('expense');
      setIcon('Utensils');
      setColor('#ef4444');
      setBudgetMonthly('');
    }
    setIsDeleting(false);
    setErrorMessage('');
  }, [categoryToEdit, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMessage('Category name is required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const parsedBudget = budgetMonthly ? parseFloat(budgetMonthly) : undefined;

      if (categoryToEdit) {
        await updateCategory(categoryToEdit.id, {
          name: name.trim(),
          type,
          icon,
          color,
          budgetMonthly: parsedBudget,
        });
      } else {
        await createCategory({
          name: name.trim(),
          type,
          icon,
          color,
          isSystem: false,
          budgetMonthly: parsedBudget,
        });
      }
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save category');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!categoryToEdit) return;

    try {
      const res = await softDeleteCategory(categoryToEdit.id, replacementCatId || undefined);
      if (!res.success) {
        setIsDeleting(true);
        setErrorMessage(res.message || 'Cannot delete category.');
      } else {
        onClose();
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to delete category');
    }
  };

  // Filter possible replacement categories (excluding current category)
  const availableReplacements = allCategories.filter(
    (c) => c.id !== categoryToEdit?.id && !c.isDeleted && (c.type === categoryToEdit?.type || c.type === 'both')
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl" style={{ backgroundColor: `${color}20`, color }}>
              <IconRenderer name={icon} className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-white">
              {categoryToEdit ? 'Edit Category' : 'New Category'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {errorMessage && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start space-x-2 text-rose-400 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Reassignment Panel if deleting category with active transactions */}
          {isDeleting && (
            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-3">
              <h4 className="text-sm font-semibold text-amber-300">Reassign Existing Transactions</h4>
              <p className="text-xs text-amber-200/80">
                Choose a replacement category to move all active transactions before this category can be removed:
              </p>
              <select
                value={replacementCatId}
                onChange={(e) => setReplacementCatId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
              >
                <option value="">-- Choose Replacement Category --</option>
                {availableReplacements.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleDelete}
                disabled={!replacementCatId}
                className="w-full py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-sm font-semibold transition disabled:opacity-50"
              >
                Confirm Reassignment & Delete
              </button>
            </div>
          )}

          {/* Name & Type */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Category Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Groceries, Freelance, Subscriptions"
              className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Type
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as CategoryType)}
                className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="expense">Expense</option>
                <option value="income">Income</option>
                <option value="both">Both</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Monthly Budget (Optional)
              </label>
              <input
                type="number"
                placeholder="0"
                value={budgetMonthly}
                onChange={(e) => setBudgetMonthly(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Icons Grid */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Select Icon
            </label>
            <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
              {CATEGORY_ICONS.map((ic) => (
                <button
                  key={ic}
                  type="button"
                  onClick={() => setIcon(ic)}
                  className={`p-2 rounded-xl flex items-center justify-center border transition ${
                    icon === ic
                      ? 'border-blue-500 bg-blue-500/20 text-white shadow-md'
                      : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:text-white'
                  }`}
                >
                  <IconRenderer name={ic} className="w-5 h-5" />
                </button>
              ))}
            </div>
          </div>

          {/* Colors Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Color Theme
            </label>
            <div className="flex flex-wrap gap-2.5">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full border-2 transition ${
                    color === c ? 'border-white scale-110 shadow-lg' : 'border-transparent opacity-80 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-800">
            {categoryToEdit && !categoryToEdit.isSystem ? (
              <button
                type="button"
                onClick={handleDelete}
                className="flex items-center space-x-1.5 px-3 py-2 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-xl transition text-sm font-medium"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete</span>
              </button>
            ) : <div />}

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition text-sm font-semibold shadow-lg shadow-blue-600/30 disabled:opacity-50"
              >
                {categoryToEdit ? 'Save Changes' : 'Create Category'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
