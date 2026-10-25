import React, { useState } from 'react';
import { X, Plus, AlertCircle } from 'lucide-react';
import type { Account, AccountType, CurrencyCode } from '../../types';
import { createAccount } from '../../services/ledger';
import { IconRenderer } from '../common/IconRenderer';

interface QuickAddAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (account: Account) => void;
  baseCurrency?: CurrencyCode;
}

const COMMON_CURRENCIES: CurrencyCode[] = ['IDR', 'USD', 'EUR', 'SGD', 'GBP', 'JPY', 'AUD', 'MYR'];

const ACCOUNT_ICONS = [
  'Landmark',
  'Wallet',
  'CreditCard',
  'Smartphone',
  'PiggyBank',
  'Coins',
  'TrendingUp',
  'Building',
];

const ACCOUNT_COLORS = [
  '#2563eb', // Blue
  '#10b981', // Emerald
  '#8b5cf6', // Violet
  '#f59e0b', // Amber
  '#ef4444', // Red
  '#06b6d4', // Cyan
  '#ec4899', // Pink
  '#64748b', // Slate
];

export const QuickAddAccountModal: React.FC<QuickAddAccountModalProps> = ({
  isOpen,
  onClose,
  onCreated,
  baseCurrency = 'IDR',
}) => {
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('bank');
  const [currency, setCurrency] = useState<CurrencyCode>(baseCurrency);
  const [initialBalance, setInitialBalance] = useState('0');
  const [icon, setIcon] = useState('Landmark');
  const [color, setColor] = useState('#2563eb');

  // Optional Monthly Admin Fee
  const [hasAdminFee, setHasAdminFee] = useState(false);
  const [adminFeeAmount, setAdminFeeAmount] = useState('15000');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setErrorMessage('Account name is required.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const parsedBalance = parseFloat(initialBalance) || 0;
      const created = await createAccount({
        name: trimmed,
        type,
        currency,
        initialBalance: parsedBalance,
        icon,
        color,
        includeInNetWorth: true,
        monthlyAdminFee: hasAdminFee && type === 'bank'
          ? {
              enabled: true,
              amount: parseFloat(adminFeeAmount) || 15000,
              dayOfMonth: 25,
              categoryId: 'cat_fees',
              autoPost: true,
            }
          : undefined,
      });

      // Clear state and notify parent
      setName('');
      setInitialBalance('0');
      setHasAdminFee(false);
      onCreated(created);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to create account');
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
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400">
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Quick Add Account</h3>
              <p className="text-[11px] text-slate-400">Add account without interrupting your transaction</p>
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

          {/* Account Name */}
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
              Account Name *
            </label>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Bank Mandiri, SeaBank, GoPay, Cash Saku"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-600"
              required
            />
          </div>

          {/* Account Type & Currency */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                Type
              </label>
              <select
                value={type}
                onChange={(e) => {
                  const newType = e.target.value as AccountType;
                  setType(newType);
                  if (newType === 'cash') setIcon('Wallet');
                  else if (newType === 'bank') setIcon('Landmark');
                  else if (newType === 'ewallet') setIcon('Smartphone');
                  else if (newType === 'credit_card') setIcon('CreditCard');
                }}
                className="w-full px-3 py-2 rounded-xl bg-slate-950/80 border border-slate-700 text-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="bank">Bank Account</option>
                <option value="cash">Cash / Physical Wallet</option>
                <option value="ewallet">E-Wallet</option>
                <option value="credit_card">Credit Card</option>
                <option value="investment">Investment</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                Currency
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950/80 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {COMMON_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Initial / Starting Balance */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Starting Balance ({currency})
            </label>
            <input
              type="number"
              step="any"
              value={initialBalance}
              onChange={(e) => setInitialBalance(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-slate-950/80 border border-slate-700 text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Color & Icon Selection */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                Color
              </label>
              <div className="flex flex-wrap gap-1.5 p-2 rounded-xl bg-slate-950/60 border border-slate-800">
                {ACCOUNT_COLORS.map((c) => (
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
              <div className="grid grid-cols-4 gap-1.5 p-2 rounded-xl bg-slate-950/60 border border-slate-800">
                {ACCOUNT_ICONS.map((ic) => (
                  <button
                    key={ic}
                    type="button"
                    onClick={() => setIcon(ic)}
                    className={`p-1.5 rounded-lg flex items-center justify-center transition ${
                      icon === ic
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    <IconRenderer name={ic} className="w-4 h-4" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Optional Bank Admin Fee */}
          {type === 'bank' && (
            <div className="p-3 rounded-xl bg-slate-950/40 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-300 font-semibold">Monthly Admin Fee</span>
                <input
                  type="checkbox"
                  checked={hasAdminFee}
                  onChange={(e) => setHasAdminFee(e.target.checked)}
                  className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
                />
              </div>
              {hasAdminFee && (
                <div className="pt-1">
                  <input
                    type="number"
                    step="any"
                    value={adminFeeAmount}
                    onChange={(e) => setAdminFeeAmount(e.target.value)}
                    placeholder="Fee amount (e.g. 15000)"
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              )}
            </div>
          )}

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
              className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold transition shadow-lg shadow-indigo-600/20"
            >
              {isSubmitting ? 'Saving...' : 'Save & Select'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
