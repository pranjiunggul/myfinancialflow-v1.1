import React, { useState } from 'react';
import { X, Target, ShieldCheck, Plane, Laptop, Car, Home, GraduationCap, Heart, AlertCircle, Info } from 'lucide-react';
import type { FinancialGoal, Account, CurrencyCode } from '../../types';
import { createGoal, updateGoal } from '../../services/goals';

interface GoalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGoalSaved: () => void;
  accounts: Account[];
  baseCurrency: CurrencyCode;
  goalToEdit?: FinancialGoal | null;
}

const GOAL_ICONS = [
  { name: 'Target', icon: Target },
  { name: 'ShieldCheck', icon: ShieldCheck },
  { name: 'Plane', icon: Plane },
  { name: 'Laptop', icon: Laptop },
  { name: 'Car', icon: Car },
  { name: 'Home', icon: Home },
  { name: 'GraduationCap', icon: GraduationCap },
  { name: 'Heart', icon: Heart },
];

const PRESET_COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#f97316', '#eab308'];

export const GoalModal: React.FC<GoalModalProps> = ({
  isOpen,
  onClose,
  onGoalSaved,
  accounts,
  baseCurrency,
  goalToEdit,
}) => {
  const [name, setName] = useState(goalToEdit?.name || '');
  const [icon, setIcon] = useState(goalToEdit?.icon || 'Target');
  const [color, setColor] = useState(goalToEdit?.color || '#10b981');
  const [targetAmount, setTargetAmount] = useState(goalToEdit?.targetAmount ? String(goalToEdit.targetAmount) : '');
  const [targetDate, setTargetDate] = useState(goalToEdit?.targetDate || '');
  const [trackingMode, setTrackingMode] = useState<'manual' | 'linked_account'>(
    goalToEdit?.trackingMode || 'manual'
  );
  const [linkedAccountId, setLinkedAccountId] = useState(goalToEdit?.linkedAccountId || accounts[0]?.id || '');
  const [manualContribution, setManualContribution] = useState(
    goalToEdit?.manualContribution ? String(goalToEdit.manualContribution) : '0'
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const parsedTarget = parseFloat(targetAmount);
    if (!name.trim()) {
      setError('Please enter a goal name.');
      return;
    }
    if (isNaN(parsedTarget) || parsedTarget <= 0) {
      setError('Target amount must be a positive number.');
      return;
    }

    const parsedManual = parseFloat(manualContribution) || 0;
    if (trackingMode === 'linked_account' && !linkedAccountId) {
      setError('Please select a linked account.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (goalToEdit) {
        await updateGoal(goalToEdit.id, {
          name: name.trim(),
          icon,
          color,
          targetAmount: parsedTarget,
          targetDate: targetDate || undefined,
          trackingMode,
          linkedAccountId: trackingMode === 'linked_account' ? linkedAccountId : undefined,
          manualContribution: trackingMode === 'manual' ? parsedManual : 0,
        });
      } else {
        await createGoal({
          name: name.trim(),
          icon,
          color,
          targetAmount: parsedTarget,
          currentAmount: trackingMode === 'manual' ? parsedManual : 0,
          currency: baseCurrency,
          targetDate: targetDate || undefined,
          trackingMode,
          linkedAccountId: trackingMode === 'linked_account' ? linkedAccountId : undefined,
          manualContribution: trackingMode === 'manual' ? parsedManual : 0,
          status: 'active',
        });
      }
      onGoalSaved();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to save goal.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                {goalToEdit ? 'Edit Financial Goal' : 'New Savings Goal'}
              </h2>
              <p className="text-xs text-slate-400">Track progress toward your future milestone</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {error && (
            <div className="flex items-center space-x-2 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Goal Name */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Goal Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Emergency Fund, Japan Trip, DP Rumah"
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-sm"
              required
            />
          </div>

          {/* Target Amount & Target Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Target Amount ({baseCurrency})
              </label>
              <input
                type="number"
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
                placeholder="e.g. 50000000"
                min="1"
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Target Date (Optional)
              </label>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-sm"
              />
            </div>
          </div>

          {/* Icon and Color Picker */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Icon</label>
              <div className="grid grid-cols-4 gap-1.5 p-1.5 bg-slate-950 border border-slate-800 rounded-xl">
                {GOAL_ICONS.map(({ name: iconKey, icon: IconComponent }) => (
                  <button
                    key={iconKey}
                    type="button"
                    onClick={() => setIcon(iconKey)}
                    className={`p-2 rounded-lg flex items-center justify-center transition ${
                      icon === iconKey ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <IconComponent className="w-4 h-4" />
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Accent Color</label>
              <div className="flex items-center space-x-2 p-2 bg-slate-950 border border-slate-800 rounded-xl">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`w-6 h-6 rounded-full transition-transform ${color === c ? 'scale-125 ring-2 ring-white/50' : 'opacity-70 hover:opacity-100'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Tracking Mode Selection */}
          <div className="pt-2">
            <label className="block text-xs font-medium text-slate-300 mb-2">Tracking Method</label>
            <div className="space-y-2">
              {/* Option A: Manual (Default & Suggested) */}
              <label
                className={`flex items-start p-3 rounded-xl border cursor-pointer transition ${
                  trackingMode === 'manual'
                    ? 'bg-emerald-500/10 border-emerald-500/40 text-white'
                    : 'bg-slate-950/50 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <input
                  type="radio"
                  name="trackingMode"
                  value="manual"
                  checked={trackingMode === 'manual'}
                  onChange={() => setTrackingMode('manual')}
                  className="mt-1 text-emerald-500 focus:ring-0"
                />
                <div className="ml-3">
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-semibold text-white">Manual Contribution Tracking</span>
                    <span className="px-2 py-0.5 text-[10px] bg-emerald-500/20 text-emerald-400 font-medium rounded-full">
                      Recommended
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Allocate savings manually or tag transactions. Most accurate for general-purpose accounts.
                  </p>
                </div>
              </label>

              {/* Option B: Linked Account */}
              <label
                className={`flex items-start p-3 rounded-xl border cursor-pointer transition ${
                  trackingMode === 'linked_account'
                    ? 'bg-emerald-500/10 border-emerald-500/40 text-white'
                    : 'bg-slate-950/50 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <input
                  type="radio"
                  name="trackingMode"
                  value="linked_account"
                  checked={trackingMode === 'linked_account'}
                  onChange={() => setTrackingMode('linked_account')}
                  className="mt-1 text-emerald-500 focus:ring-0"
                />
                <div className="ml-3">
                  <span className="text-sm font-semibold text-white">Link to Dedicated Account</span>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Automatically mirrors the current balance of a specific savings account.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Conditional Tracking Fields */}
          {trackingMode === 'manual' ? (
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Current Saved Amount ({baseCurrency})
              </label>
              <input
                type="number"
                value={manualContribution}
                onChange={(e) => setManualContribution(e.target.value)}
                placeholder="0"
                min="0"
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-sm"
              />
            </div>
          ) : (
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Select Dedicated Account</label>
              <select
                value={linkedAccountId}
                onChange={(e) => setLinkedAccountId(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-emerald-500 text-sm"
              >
                {accounts
                  .filter((a) => !a.isDeleted)
                  .map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.currency} {acc.currentBalance.toLocaleString('id-ID')})
                    </option>
                  ))}
              </select>

              {/* Explicit Explanatory Notice per User Requirement */}
              <div className="flex items-start space-x-2.5 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-300/90 text-xs leading-relaxed">
                <Info className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                <span>
                  <strong>Note:</strong> This method works best for a <strong>dedicated savings account</strong> used only for this goal. If this account is also used for regular spending, progress may not accurately reflect your savings toward this goal specifically.
                </span>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 text-sm font-medium transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-sm transition shadow-lg shadow-emerald-500/20 disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : goalToEdit ? 'Save Changes' : 'Create Goal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
