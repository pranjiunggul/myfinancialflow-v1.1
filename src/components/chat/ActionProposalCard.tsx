import React, { useState } from 'react';
import {
  Check,
  X,
  ArrowRight,
  AlertCircle,
  Sparkles,
  CheckCircle2,
  Handshake,
  CreditCard,
  RefreshCw,
} from 'lucide-react';
import type { ActionProposal, Account, Category, CurrencyCode } from '../../types';
import { executeConfirmedProposal } from '../../services/ai';
import { QuickAddCategoryModal } from '../shared/QuickAddCategoryModal';
import { QuickAddAccountModal } from '../shared/QuickAddAccountModal';

interface ActionProposalCardProps {
  proposal: ActionProposal;
  accounts: Account[];
  categories: Category[];
  baseCurrency: CurrencyCode;
  onExecuted?: () => void;
}

export const ActionProposalCard: React.FC<ActionProposalCardProps> = ({
  proposal,
  accounts,
  categories,
  baseCurrency,
  onExecuted,
}) => {
  const [isExecuting, setIsExecuting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [currentTxType, setCurrentTxType] = useState(proposal.data.type || 'expense');
  const [, setCardVersion] = useState(0);

  // Quick Add states
  const [isQuickAddCategoryOpen, setIsQuickAddCategoryOpen] = useState(false);
  const [isQuickAddAccountOpen, setIsQuickAddAccountOpen] = useState(false);

  const handleToggleDebtDirection = () => {
    const newType = currentTxType === 'debt' ? 'receivable' : 'debt';
    setCurrentTxType(newType);
    proposal.data.type = newType;
    if (proposal.data.debtReceivableMeta) {
      proposal.data.debtReceivableMeta.type = newType;
      const person = proposal.data.debtReceivableMeta.counterpartyName || 'Friend';
      if (newType === 'receivable') {
        proposal.data.debtReceivableMeta.directionLabel = `🤝 YOU ARE LENDING TO ${person}`;
        proposal.data.debtReceivableMeta.directionExplanation = `${person} OWES YOU ${proposal.data.amount?.toLocaleString()} ${proposal.data.currency}. Tracked as a loan to collect.`;
      } else {
        proposal.data.debtReceivableMeta.directionLabel = `💳 YOU BORROWED FROM ${person}`;
        proposal.data.debtReceivableMeta.directionExplanation = `YOU OWE ${person} ${proposal.data.amount?.toLocaleString()} ${proposal.data.currency}. Tracked as a debt to repay.`;
      }
      proposal.summary = `[Offline Rule Engine] ${proposal.data.debtReceivableMeta.directionLabel} — ${proposal.data.amount?.toLocaleString()} ${proposal.data.currency}`;
    }
  };

  const handleConfirm = async () => {
    setIsExecuting(true);
    setErrorMsg('');
    try {
      await executeConfirmedProposal(proposal, { accounts, categories, baseCurrency });
      onExecuted?.();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to execute proposal');
    } finally {
      setIsExecuting(false);
    }
  };

  const handleCancel = () => {
    proposal.status = 'cancelled';
    onExecuted?.();
  };

  const isPending = proposal.status === 'pending';
  const isConfirmed = proposal.status === 'confirmed';
  const isCancelled = proposal.status === 'cancelled';

  const isDebtOrReceivable =
    currentTxType === 'debt' ||
    currentTxType === 'receivable' ||
    !!proposal.data.debtReceivableMeta?.isDebtOrReceivable;

  const typeColor =
    proposal.type === 'create'
      ? isDebtOrReceivable
        ? currentTxType === 'receivable'
          ? 'border-blue-500/40 bg-blue-500/5'
          : 'border-amber-500/40 bg-amber-500/5'
        : 'border-emerald-500/30 bg-emerald-500/5'
      : proposal.type === 'edit'
      ? 'border-blue-500/30 bg-blue-500/5'
      : 'border-rose-500/30 bg-rose-500/5';

  const badgeColor =
    proposal.type === 'create'
      ? isDebtOrReceivable
        ? currentTxType === 'receivable'
          ? 'bg-blue-500/20 text-blue-400'
          : 'bg-amber-500/20 text-amber-400'
        : 'bg-emerald-500/20 text-emerald-400'
      : proposal.type === 'edit'
      ? 'bg-blue-500/20 text-blue-400'
      : 'bg-rose-500/20 text-rose-400';

  return (
    <div className={`p-4 rounded-2xl border ${typeColor} space-y-3 max-w-md my-2 text-xs`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-1.5">
          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${badgeColor}`}>
            Proposed {proposal.type}
          </span>
        </div>

        {isConfirmed && (
          <span className="flex items-center space-x-1 text-emerald-400 font-bold">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Executed</span>
          </span>
        )}

        {isCancelled && (
          <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">
            Cancelled
          </span>
        )}
      </div>

      <p className="font-semibold text-slate-200 text-sm">
        {proposal.summary}
      </p>

      {/* Prominent Debt vs Receivable Directionality Banner */}
      {isDebtOrReceivable && (
        <div
          className={`p-3.5 rounded-xl border-2 space-y-2 shadow-lg ${
            currentTxType === 'receivable'
              ? 'bg-blue-950/70 border-blue-500 shadow-blue-500/10'
              : 'bg-amber-950/70 border-amber-500 shadow-amber-500/10'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1.5 font-extrabold text-xs tracking-wide">
              {currentTxType === 'receivable' ? (
                <>
                  <Handshake className="w-4 h-4 text-blue-400" />
                  <span className="text-blue-300">
                    🤝 YOU ARE LENDING TO {proposal.data.personName?.toUpperCase() || 'COUNTERPARTY'}
                  </span>
                </>
              ) : (
                <>
                  <CreditCard className="w-4 h-4 text-amber-400" />
                  <span className="text-amber-300">
                    💳 YOU BORROWED FROM {proposal.data.personName?.toUpperCase() || 'COUNTERPARTY'}
                  </span>
                </>
              )}
            </div>

            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                currentTxType === 'receivable'
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              }`}
            >
              {currentTxType === 'receivable' ? 'Asset (Piutang)' : 'Liability (Hutang)'}
            </span>
          </div>

          <p className="text-white font-bold text-sm leading-snug">
            {currentTxType === 'receivable'
              ? `${proposal.data.personName || 'Person'} owes you ${proposal.data.amount?.toLocaleString()} ${proposal.data.currency}`
              : `You owe ${proposal.data.personName || 'Person'} ${proposal.data.amount?.toLocaleString()} ${proposal.data.currency}`}
          </p>

          <p className="text-[11px] text-slate-300 leading-relaxed">
            {currentTxType === 'receivable'
              ? 'Money will be deducted from your account and recorded as a loan to be collected back.'
              : 'Money will be credited into your account and recorded as an outstanding debt you must repay.'}
          </p>

          {isPending && (
            <button
              type="button"
              onClick={handleToggleDebtDirection}
              className="flex items-center space-x-1.5 text-[11px] font-bold text-indigo-400 hover:text-indigo-300 underline pt-1 transition"
            >
              <RefreshCw className="w-3 h-3" />
              <span>
                Wrong direction? Switch to "
                {currentTxType === 'receivable'
                  ? `You Owe ${proposal.data.personName || 'Person'}`
                  : `You are Lending to ${proposal.data.personName || 'Person'}`}
                "
              </span>
            </button>
          )}
        </div>
      )}

      {/* Details Box */}
      {proposal.type === 'create' && (
        <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1 font-mono text-[11px]">
          <div className="flex justify-between">
            <span className="text-slate-400">Amount:</span>
            <span className="text-white font-bold">
              {proposal.data.amount?.toLocaleString()} {proposal.data.currency}
            </span>
          </div>
          <div className="flex justify-between items-center gap-2">
            <span className="text-slate-400">Account:</span>
            {isPending ? (
              <select
                value={proposal.data.accountId || ''}
                onChange={(e) => {
                  if (e.target.value === '__new_account__') {
                    setIsQuickAddAccountOpen(true);
                  } else {
                    const acc = accounts.find((a) => a.id === e.target.value);
                    if (acc) {
                      proposal.data.accountId = acc.id;
                      proposal.data.accountName = acc.name;
                      setCardVersion((v) => v + 1);
                    }
                  }
                }}
                className="bg-slate-800 text-slate-200 text-xs px-2 py-0.5 rounded border border-slate-700 max-w-[170px] truncate focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.currency})
                  </option>
                ))}
                <option value="__new_account__">+ Add new account...</option>
              </select>
            ) : (
              <span className="text-slate-200">{proposal.data.accountName || 'Cash / Default'}</span>
            )}
          </div>
          <div className="flex justify-between items-center gap-2">
            <span className="text-slate-400">Category:</span>
            {isPending ? (
              <select
                value={proposal.data.categoryId || ''}
                onChange={(e) => {
                  if (e.target.value === '__new_category__') {
                    setIsQuickAddCategoryOpen(true);
                  } else {
                    const cat = categories.find((c) => c.id === e.target.value);
                    if (cat) {
                      proposal.data.categoryId = cat.id;
                      proposal.data.categoryName = cat.name;
                      setCardVersion((v) => v + 1);
                    }
                  }
                }}
                className="bg-slate-800 text-slate-200 text-xs px-2 py-0.5 rounded border border-slate-700 max-w-[170px] truncate focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                <option value="__new_category__">+ Add new category...</option>
              </select>
            ) : (
              <span className="text-slate-200">{proposal.data.categoryName || 'General'}</span>
            )}
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Date:</span>
            <span className="text-slate-200">{proposal.data.date}</span>
          </div>
        </div>
      )}

      {/* Edit Diff Box */}
      {proposal.type === 'edit' && proposal.beforeSnapshot && (
        <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1.5 font-mono text-[11px]">
          <div className="flex items-center justify-between text-slate-400 text-[10px] border-b border-slate-800 pb-1">
            <span>Original</span>
            <ArrowRight className="w-3 h-3 text-slate-600" />
            <span>Updated</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-rose-400 line-through">
              {proposal.beforeSnapshot.amount?.toLocaleString()}
            </span>
            <span className="text-emerald-400 font-bold">
              {proposal.data.amount?.toLocaleString() || proposal.beforeSnapshot.amount?.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400 truncate max-w-[140px]">
              {proposal.beforeSnapshot.description}
            </span>
            <span className="text-white truncate max-w-[140px] font-semibold">
              {proposal.data.description || proposal.beforeSnapshot.description}
            </span>
          </div>
        </div>
      )}

      {/* Delete Confirmation Box */}
      {proposal.type === 'delete' && proposal.beforeSnapshot && (
        <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 font-mono text-[11px]">
          <div>Target: {proposal.beforeSnapshot.description}</div>
          <div>Amount: {proposal.beforeSnapshot.amount?.toLocaleString()} {proposal.beforeSnapshot.currency}</div>
        </div>
      )}

      {errorMsg && (
        <div className="p-2 rounded-lg bg-rose-500/20 text-rose-400 flex items-center space-x-1">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Confirmation Actions */}
      {isPending && (
        <div className="flex items-center space-x-2 pt-1">
          <button
            onClick={handleConfirm}
            disabled={isExecuting}
            className="flex-1 flex items-center justify-center space-x-1.5 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition shadow-md shadow-emerald-600/20 disabled:opacity-50"
          >
            <Check className="w-3.5 h-3.5" />
            <span>{isExecuting ? 'Executing...' : 'Confirm & Execute'}</span>
          </button>

          <button
            onClick={handleCancel}
            disabled={isExecuting}
            className="flex items-center justify-center space-x-1 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-semibold transition"
          >
            <X className="w-3.5 h-3.5" />
            <span>Cancel</span>
          </button>
        </div>
      )}

      {/* Inline Quick Add Category Modal */}
      <QuickAddCategoryModal
        isOpen={isQuickAddCategoryOpen}
        onClose={() => setIsQuickAddCategoryOpen(false)}
        initialType={proposal.data.type === 'income' ? 'income' : 'expense'}
        onCreated={(newCat) => {
          proposal.data.categoryId = newCat.id;
          proposal.data.categoryName = newCat.name;
          setCardVersion((v) => v + 1);
        }}
      />

      {/* Inline Quick Add Account Modal */}
      <QuickAddAccountModal
        isOpen={isQuickAddAccountOpen}
        onClose={() => setIsQuickAddAccountOpen(false)}
        baseCurrency={baseCurrency}
        onCreated={(newAcc) => {
          proposal.data.accountId = newAcc.id;
          proposal.data.accountName = newAcc.name;
          setCardVersion((v) => v + 1);
        }}
      />
    </div>
  );
};
