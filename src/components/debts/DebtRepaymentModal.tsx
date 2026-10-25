import React, { useState } from 'react';
import { X, HandCoins, Receipt, AlertCircle } from 'lucide-react';
import type { DebtReceivable, Account } from '../../types';
import { recordDebtRepayment } from '../../services/debt';
import { formatCurrency } from '../../services/fx';

interface DebtRepaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  debt: DebtReceivable | null;
  accounts: Account[];
}

export const DebtRepaymentModal: React.FC<DebtRepaymentModalProps> = ({
  isOpen,
  onClose,
  debt,
  accounts,
}) => {
  const [amount, setAmount] = useState<string>('');
  const [accountId, setAccountId] = useState<string>('');
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [note, setNote] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const activeAccounts = accounts.filter((a) => !a.isDeleted);

  React.useEffect(() => {
    if (debt) {
      setAmount(debt.currentBalance.toString());
      setAccountId(debt.initialAccountId || activeAccounts[0]?.id || '');
      setDate(new Date().toISOString().split('T')[0]);
      setNote('');
      setErrorMessage('');
    }
  }, [debt, activeAccounts.length]);

  if (!isOpen || !debt) return null;

  const isDebt = debt.type === 'debt';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setErrorMessage('Please enter a valid repayment amount greater than 0.');
      return;
    }
    if (numAmount > debt.currentBalance) {
      setErrorMessage(`Repayment cannot exceed the remaining balance of ${formatCurrency(debt.currentBalance, debt.currency)}.`);
      return;
    }
    if (!accountId) {
      setErrorMessage('Please select an account for the repayment.');
      return;
    }

    setIsSubmitting(true);
    try {
      await recordDebtRepayment({
        debtReceivableId: debt.id,
        amount: numAmount,
        accountId,
        date,
        note: note.trim() || undefined,
      });
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to record repayment');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center space-x-3">
            <div
              className={`p-2.5 rounded-xl ${
                isDebt ? 'bg-amber-500/20 text-amber-400' : 'bg-sky-500/20 text-sky-400'
              }`}
            >
              {isDebt ? <HandCoins className="w-5 h-5" /> : <Receipt className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                {isDebt ? 'Record Debt Repayment' : 'Collect Receivable Repayment'}
              </h2>
              <p className="text-xs text-slate-400">{debt.personName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMessage && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center space-x-2 text-rose-400 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Remaining Balance Info */}
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between text-xs">
            <span className="text-slate-400 font-semibold uppercase tracking-wider">Remaining Balance</span>
            <span className="text-white font-mono font-bold text-sm">
              {formatCurrency(debt.currentBalance, debt.currency)}
            </span>
          </div>

          {/* Amount */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Repayment Amount ({debt.currency})
              </label>
              <button
                type="button"
                onClick={() => setAmount(debt.currentBalance.toString())}
                className="text-xs text-blue-400 hover:text-blue-300 font-bold"
              >
                Pay Full Balance
              </button>
            </div>
            <input
              type="number"
              step="any"
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white font-mono text-xl font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {/* Account Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              {isDebt ? 'Pay From Account (Outflow)' : 'Deposit To Account (Inflow)'}
            </label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {activeAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({formatCurrency(a.currentBalance, a.currency)})
                </option>
              ))}
            </select>
          </div>

          {/* Date */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Payment Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm"
              required
            />
          </div>

          {/* Note */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Note (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Partial repayment via transfer"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm placeholder-slate-500"
            />
          </div>

          {/* Action */}
          <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-400 hover:text-white rounded-xl text-sm font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`px-5 py-2 text-white rounded-xl text-sm font-bold shadow-lg transition disabled:opacity-50 ${
                isDebt
                  ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/30'
                  : 'bg-sky-600 hover:bg-sky-500 shadow-sky-600/30'
              }`}
            >
              Confirm Repayment
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
