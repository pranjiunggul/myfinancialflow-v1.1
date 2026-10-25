import React, { useState, useEffect } from 'react';
import { X, Trash2, ShieldAlert } from 'lucide-react';
import type { Account, AccountType, CurrencyCode, Category } from '../../types';
import { createAccount, updateAccount, softDeleteAccount } from '../../services/ledger';
import { IconRenderer } from '../common/IconRenderer';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  accountToEdit?: Account | null;
  categories: Category[];
}

const COMMON_CURRENCIES: CurrencyCode[] = ['IDR', 'USD', 'EUR', 'SGD', 'GBP', 'JPY', 'AUD', 'MYR'];
const ACCOUNT_ICONS = ['Wallet', 'Landmark', 'CreditCard', 'Banknote', 'Coins', 'PiggyBank', 'DollarSign', 'Building'];
const COLOR_OPTIONS = ['#10b981', '#2563eb', '#0284c7', '#f59e0b', '#8b5cf6', '#ec4899', '#ef4444', '#64748b'];

export const AccountModal: React.FC<AccountModalProps> = ({
  isOpen,
  onClose,
  accountToEdit,
  categories,
}) => {
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('bank');
  const [currency, setCurrency] = useState<CurrencyCode>('IDR');
  const [initialBalance, setInitialBalance] = useState<string>('0');
  const [icon, setIcon] = useState('Landmark');
  const [color, setColor] = useState('#2563eb');
  const [includeInNetWorth, setIncludeInNetWorth] = useState(true);

  // Monthly Admin Fee settings
  const [feeEnabled, setFeeEnabled] = useState(false);
  const [feeAmount, setFeeAmount] = useState<string>('15000');
  const [feeDay, setFeeDay] = useState<number>(25);
  const [feeCategory, setFeeCategory] = useState<string>('cat_fees');
  const [feeAutoPost, setFeeAutoPost] = useState(true);

  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (accountToEdit) {
      setName(accountToEdit.name);
      setType(accountToEdit.type);
      setCurrency(accountToEdit.currency);
      setInitialBalance(accountToEdit.initialBalance.toString());
      setIcon(accountToEdit.icon);
      setColor(accountToEdit.color);
      setIncludeInNetWorth(accountToEdit.includeInNetWorth);

      if (accountToEdit.monthlyAdminFee?.enabled) {
        setFeeEnabled(true);
        setFeeAmount(accountToEdit.monthlyAdminFee.amount.toString());
        setFeeDay(accountToEdit.monthlyAdminFee.dayOfMonth);
        setFeeCategory(accountToEdit.monthlyAdminFee.categoryId || 'cat_fees');
        setFeeAutoPost(accountToEdit.monthlyAdminFee.autoPost);
      } else {
        setFeeEnabled(false);
      }
    } else {
      setName('');
      setType('bank');
      setCurrency('IDR');
      setInitialBalance('0');
      setIcon('Landmark');
      setColor('#2563eb');
      setIncludeInNetWorth(true);
      setFeeEnabled(false);
      setFeeAmount('15000');
      setFeeDay(25);
      setFeeCategory('cat_fees');
      setFeeAutoPost(true);
    }
    setErrorMessage('');
  }, [accountToEdit, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMessage('Account name is required.');
      return;
    }

    const parsedInitialBalance = parseFloat(initialBalance) || 0;
    const parsedFeeAmount = parseFloat(feeAmount) || 0;

    setIsSubmitting(true);
    try {
      const monthlyAdminFee = feeEnabled
        ? {
            enabled: true,
            amount: parsedFeeAmount,
            dayOfMonth: feeDay,
            categoryId: feeCategory,
            autoPost: feeAutoPost,
          }
        : undefined;

      if (accountToEdit) {
        await updateAccount(accountToEdit.id, {
          name: name.trim(),
          type,
          currency,
          initialBalance: parsedInitialBalance,
          icon,
          color,
          includeInNetWorth,
          monthlyAdminFee,
        });
      } else {
        await createAccount({
          name: name.trim(),
          type,
          currency,
          initialBalance: parsedInitialBalance,
          icon,
          color,
          includeInNetWorth,
          monthlyAdminFee,
        });
      }
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save account');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!accountToEdit) return;
    if (confirm(`Are you sure you want to delete "${accountToEdit.name}"?`)) {
      const res = await softDeleteAccount(accountToEdit.id);
      if (!res.success) {
        setErrorMessage(res.message || 'Cannot delete account.');
      } else {
        onClose();
      }
    }
  };

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
              {accountToEdit ? 'Edit Account' : 'New Account'}
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
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center space-x-2 text-rose-400 text-sm">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Account Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Account Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Bank BCA, Cash Wallet, PayPal"
              className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {/* Account Type & Currency */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Type
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as AccountType)}
                className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="bank">Bank Account</option>
                <option value="cash">Cash / Physical</option>
                <option value="ewallet">E-Wallet (GoPay/OVO)</option>
                <option value="paypal">PayPal</option>
                <option value="credit_card">Credit Card</option>
                <option value="investment">Investment / Broker</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Currency
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono font-semibold"
              >
                {COMMON_CURRENCIES.map((cur) => (
                  <option key={cur} value={cur}>
                    {cur}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Initial Balance */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Initial / Starting Balance ({currency})
            </label>
            <input
              type="number"
              step="any"
              value={initialBalance}
              onChange={(e) => setInitialBalance(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white font-mono text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Icon & Color Selection */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Icon
              </label>
              <div className="flex flex-wrap gap-2">
                {ACCOUNT_ICONS.map((ic) => (
                  <button
                    key={ic}
                    type="button"
                    onClick={() => setIcon(ic)}
                    className={`p-2 rounded-lg border transition ${
                      icon === ic
                        ? 'border-blue-500 bg-blue-500/20 text-white'
                        : 'border-slate-800 bg-slate-800/60 text-slate-400 hover:text-white'
                    }`}
                  >
                    <IconRenderer name={ic} className="w-4 h-4" />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Theme Color
              </label>
              <div className="flex flex-wrap gap-2">
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
          </div>

          {/* Monthly Bank Admin Fee Configuration */}
          {type === 'bank' && (
            <div className="p-4 bg-slate-800/40 border border-slate-800 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-white">Monthly Admin Fee</h4>
                  <p className="text-xs text-slate-400">Recurring maintenance fee auto-posting</p>
                </div>
                <input
                  type="checkbox"
                  checked={feeEnabled}
                  onChange={(e) => setFeeEnabled(e.target.checked)}
                  className="w-5 h-5 accent-blue-600 rounded cursor-pointer"
                />
              </div>

              {feeEnabled && (
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Fee Amount ({currency})</label>
                    <input
                      type="number"
                      value={feeAmount}
                      onChange={(e) => setFeeAmount(e.target.value)}
                      className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Charge Day (1-31)</label>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={feeDay}
                      onChange={(e) => setFeeDay(parseInt(e.target.value) || 1)}
                      className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white font-mono text-sm"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-slate-400 mb-1">Fee Category</label>
                    <select
                      value={feeCategory}
                      onChange={(e) => setFeeCategory(e.target.value)}
                      className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
                    >
                      <option value="cat_fees">Bank & Transfer Fees (Default)</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Include in Net Worth */}
          <div className="flex items-center justify-between pt-2">
            <span className="text-sm text-slate-300">Include in Net Worth calculations</span>
            <input
              type="checkbox"
              checked={includeInNetWorth}
              onChange={(e) => setIncludeInNetWorth(e.target.checked)}
              className="w-5 h-5 accent-blue-600 rounded cursor-pointer"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-800">
            {accountToEdit ? (
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
                {accountToEdit ? 'Save Changes' : 'Create Account'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
