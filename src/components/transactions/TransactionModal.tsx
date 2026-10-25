import React, { useState, useEffect } from 'react';
import {
  X,
  Trash2,
  TrendingDown,
  TrendingUp,
  ArrowLeftRight,
  HandCoins,
  Receipt,
  Calendar,
  Clock,
  Tag,
  FileText,
  AlertCircle,
  RefreshCw,
  Camera,
  Plus,
  Mic,
} from 'lucide-react';
import type {
  Transaction,
  TransactionType,
  TaxTreatmentType,
  Account,
  Category,
  CurrencyCode,
  ActionProposal,
  AppSettings,
} from '../../types';
import {
  createTransaction,
  updateTransaction,
  softDeleteTransaction,
} from '../../services/ledger';
import { formatCurrency, getExchangeRate } from '../../services/fx';
import {
  isSpeechRecognitionSupported,
  isVoiceInputAcknowledged,
  startVoiceListening,
} from '../../services/voiceInput';
import { IconRenderer } from '../common/IconRenderer';
import { ReceiptScannerModal } from '../chat/ReceiptScannerModal';
import { attachReceiptToTransaction } from '../../services/receiptAttachments';
import { QuickAddCategoryModal } from '../shared/QuickAddCategoryModal';
import { QuickAddAccountModal } from '../shared/QuickAddAccountModal';
import { VoicePrivacyModal } from '../voice/VoicePrivacyModal';

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactionToEdit?: Transaction | null;
  initialType?: TransactionType;
  accounts: Account[];
  categories: Category[];
  baseCurrency: CurrencyCode;
  settings?: AppSettings | null;
}

export const TransactionModal: React.FC<TransactionModalProps> = ({
  isOpen,
  onClose,
  transactionToEdit,
  initialType,
  accounts,
  categories,
  baseCurrency,
  settings,
}) => {
  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState<string>('');
  const [accountId, setAccountId] = useState<string>('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [date, setDate] = useState<string>('');
  const [time, setTime] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [tagsInput, setTagsInput] = useState<string>('');

  // Transfer specific fields
  const [toAccountId, setToAccountId] = useState<string>('');
  const [toAmount, setToAmount] = useState<string>('');
  const [hasTransferFee, setHasTransferFee] = useState<boolean>(false);
  const [feeAmount, setFeeAmount] = useState<string>('0');
  const [feeCategoryId, setFeeCategoryId] = useState<string>('cat_fees');

  // Debt/Receivable fields
  const [personName, setPersonName] = useState<string>('');
  const [dueDate, setDueDate] = useState<string>('');
  const [isDebtRepayment, setIsDebtRepayment] = useState<boolean>(false);

  // Indonesian Personal Income Tax (PPh) Estimator fields
  const [taxTreatment, setTaxTreatment] = useState<TaxTreatmentType>('not_applicable');
  const [taxWithheldAmount, setTaxWithheldAmount] = useState<string>('');
  const [grossAmount, setGrossAmount] = useState<string>('');
  const [taxSourceLabel, setTaxSourceLabel] = useState<string>('');

  // FX state
  const [exchangeRateToBase, setExchangeRateToBase] = useState<number>(1.0);
  const [isFetchingFx, setIsFetchingFx] = useState<boolean>(false);

  // Scanner Modal & Receipt Metadata state
  const [isScannerOpen, setIsScannerOpen] = useState<boolean>(false);
  const [receiptHash, setReceiptHash] = useState<string>('');
  const [pendingReceiptImage, setPendingReceiptImage] = useState<string | null>(null);

  // Quick Add states
  const [isQuickAddCategoryOpen, setIsQuickAddCategoryOpen] = useState<boolean>(false);
  const [isQuickAddAccountOpen, setIsQuickAddAccountOpen] = useState<boolean>(false);
  const [isQuickAddToAccountOpen, setIsQuickAddToAccountOpen] = useState<boolean>(false);

  // Voice Input state
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState<boolean>(false);
  const [isListening, setIsListening] = useState<boolean>(false);
  const stopListeningRef = React.useRef<(() => void) | null>(null);

  const handleMicClick = async () => {
    if (!isSpeechRecognitionSupported()) return;

    const isAcknowledged = await isVoiceInputAcknowledged();
    if (!isAcknowledged) {
      setIsVoiceModalOpen(true);
      return;
    }

    if (isListening) {
      if (stopListeningRef.current) stopListeningRef.current();
      setIsListening(false);
      return;
    }

    setIsListening(true);
    const stopFn = startVoiceListening({
      onResult: (transcript) => {
        setDescription(transcript);
      },
      onError: (err) => {
        console.warn('Voice recognition error:', err);
        setIsListening(false);
      },
      onEnd: () => {
        setIsListening(false);
      },
      lang: 'id-ID',
    });
    stopListeningRef.current = stopFn;
  };

  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const handleProposalFromScanner = (proposal: ActionProposal) => {
    if (proposal.data.type) setType(proposal.data.type);
    if (proposal.data.amount) setAmount(proposal.data.amount.toString());
    if (proposal.data.accountId) setAccountId(proposal.data.accountId);
    if (proposal.data.categoryId) setCategoryId(proposal.data.categoryId);
    if (proposal.data.date) setDate(proposal.data.date);
    if (proposal.data.description) setDescription(proposal.data.description);
    if (proposal.data.transferMeta?.toAccountId) {
      setToAccountId(proposal.data.transferMeta.toAccountId);
      setToAmount(proposal.data.transferMeta.toAmount?.toString() || proposal.data.amount?.toString() || '');
    }
    if (proposal.data.transferMeta?.feeAmount && proposal.data.transferMeta.feeAmount > 0) {
      setHasTransferFee(true);
      setFeeAmount(proposal.data.transferMeta.feeAmount.toString());
    }
    if (proposal.data.receiptHash) setReceiptHash(proposal.data.receiptHash);
    if (proposal.data.receiptDataUrl) setPendingReceiptImage(proposal.data.receiptDataUrl);
  };

  const activeAccounts = accounts.filter((a) => !a.isDeleted);
  const selectedAccount = activeAccounts.find((a) => a.id === accountId);
  const destinationAccount = activeAccounts.find((a) => a.id === toAccountId);

  // Initialize or reset form
  useEffect(() => {
    if (transactionToEdit) {
      setType(transactionToEdit.type);
      setAmount(transactionToEdit.amount.toString());
      setAccountId(transactionToEdit.accountId);
      setCategoryId(transactionToEdit.categoryId);
      setDate(transactionToEdit.date);
      setTime(transactionToEdit.time || '12:00');
      setDescription(transactionToEdit.description);
      setTagsInput(transactionToEdit.tags?.join(', ') || '');
      setExchangeRateToBase(transactionToEdit.exchangeRateToBase || 1.0);

      if (transactionToEdit.transferMeta) {
        setToAccountId(transactionToEdit.transferMeta.toAccountId);
        setToAmount(transactionToEdit.transferMeta.toAmount.toString());
        if (transactionToEdit.transferMeta.feeAmount && transactionToEdit.transferMeta.feeAmount > 0) {
          setHasTransferFee(true);
          setFeeAmount(transactionToEdit.transferMeta.feeAmount.toString());
          setFeeCategoryId(transactionToEdit.transferMeta.feeCategoryId || 'cat_fees');
        } else {
          setHasTransferFee(false);
        }
      }

      if (transactionToEdit.taxTreatment) {
        setTaxTreatment(transactionToEdit.taxTreatment);
        setTaxWithheldAmount(transactionToEdit.taxWithheldAmount ? transactionToEdit.taxWithheldAmount.toString() : '');
        setGrossAmount(transactionToEdit.grossAmount ? transactionToEdit.grossAmount.toString() : '');
        setTaxSourceLabel(transactionToEdit.taxSourceLabel || '');
      } else {
        setTaxTreatment('not_applicable');
        setTaxWithheldAmount('');
        setGrossAmount('');
        setTaxSourceLabel('');
      }
    } else {
      const now = new Date();
      setType(initialType || 'expense');
      setAmount('');
      setAccountId(activeAccounts[0]?.id || '');
      setToAccountId(activeAccounts[1]?.id || '');
      setDate(now.toISOString().split('T')[0]);
      setTime(now.toTimeString().slice(0, 5));
      setDescription('');
      setTagsInput('');
      setHasTransferFee(false);
      setFeeAmount('0');
      setFeeCategoryId('cat_fees');
      setPersonName('');
      setDueDate('');
      setIsDebtRepayment(false);
      setTaxTreatment('not_applicable');
      setTaxWithheldAmount('');
      setGrossAmount('');
      setTaxSourceLabel('');
    }
    setErrorMessage('');
  }, [transactionToEdit, isOpen, activeAccounts.length]);

  // Set default category when type or category changes
  useEffect(() => {
    if (transactionToEdit) return;

    if (type === 'transfer') {
      setCategoryId('cat_transfer');
    } else if (type === 'debt' || type === 'receivable') {
      setCategoryId('cat_debt_loan');
    } else {
      const filteredCats = categories.filter(
        (c) => !c.isDeleted && !c.isSystem && (c.type === type || c.type === 'both')
      );
      if (filteredCats.length > 0 && !filteredCats.some((c) => c.id === categoryId)) {
        setCategoryId(filteredCats[0].id);
      }
    }
  }, [type, categories, transactionToEdit]);

  // Recalculate FX rate to base reporting currency whenever account changes
  useEffect(() => {
    async function updateFx() {
      if (!selectedAccount) return;
      setIsFetchingFx(true);
      try {
        const { rate } = await getExchangeRate(selectedAccount.currency, baseCurrency);
        setExchangeRateToBase(rate);
      } catch {
        setExchangeRateToBase(1.0);
      } finally {
        setIsFetchingFx(false);
      }
    }
    updateFx();
  }, [selectedAccount, baseCurrency]);

  // Auto-calculate destination amount for transfers if currencies match or differ
  useEffect(() => {
    async function updateTransferDestAmount() {
      if (type !== 'transfer' || !amount || !selectedAccount || !destinationAccount) return;
      const numAmount = parseFloat(amount) || 0;

      if (selectedAccount.currency === destinationAccount.currency) {
        setToAmount(numAmount.toString());
      } else {
        const { rate } = await getExchangeRate(selectedAccount.currency, destinationAccount.currency);
        const converted = Math.round(numAmount * rate * 100) / 100;
        setToAmount(converted.toString());
      }
    }
    updateTransferDestAmount();
  }, [type, amount, selectedAccount, destinationAccount]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setErrorMessage('Please enter a valid amount greater than 0.');
      return;
    }

    if (!accountId) {
      setErrorMessage('Please select an account.');
      return;
    }

    if (type === 'transfer') {
      if (!toAccountId) {
        setErrorMessage('Please select a destination account for transfer.');
        return;
      }
      if (toAccountId === accountId) {
        setErrorMessage('Source and destination accounts must be different.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const parsedTags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const parsedFee = hasTransferFee ? parseFloat(feeAmount) || 0 : 0;
      const parsedToAmount = type === 'transfer' ? parseFloat(toAmount) || numAmount : 0;

      const baseAmount = numAmount * (exchangeRateToBase || 1.0);

      const transferMeta =
        type === 'transfer' && destinationAccount
          ? {
              toAccountId,
              toAmount: parsedToAmount,
              toCurrency: destinationAccount.currency,
              feeAmount: parsedFee > 0 ? parsedFee : undefined,
              feeCategoryId: parsedFee > 0 ? feeCategoryId : undefined,
            }
          : undefined;

      const dateObj = new Date(`${date}T${time || '12:00'}`);
      const timestamp = dateObj.getTime() || Date.now();

      const parsedWithheld = taxTreatment === 'withheld_at_source' ? parseFloat(taxWithheldAmount) || 0 : undefined;
      const parsedGross = type === 'income' && taxTreatment !== 'not_applicable'
        ? (parseFloat(grossAmount) || (numAmount + (parsedWithheld || 0)))
        : undefined;

      const taxPayload = type === 'income' ? {
        taxTreatment,
        grossAmount: parsedGross,
        taxWithheldAmount: parsedWithheld,
        taxSourceLabel: taxSourceLabel.trim() || undefined,
      } : {
        taxTreatment: 'not_applicable' as TaxTreatmentType,
        grossAmount: undefined,
        taxWithheldAmount: undefined,
        taxSourceLabel: undefined,
      };

      if (transactionToEdit) {
        await updateTransaction(transactionToEdit.id, {
          type,
          amount: numAmount,
          currency: selectedAccount?.currency || baseCurrency,
          exchangeRateToBase,
          baseAmount,
          accountId,
          categoryId: categoryId || 'cat_food',
          date,
          time,
          timestamp,
          description: description.trim() || `${type.toUpperCase()} transaction`,
          tags: parsedTags,
          transferMeta,
          ...taxPayload,
        });
      } else {
        const createdTx = await createTransaction({
          type,
          amount: numAmount,
          currency: selectedAccount?.currency || baseCurrency,
          exchangeRateToBase,
          baseAmount,
          accountId,
          categoryId: categoryId || 'cat_food',
          date,
          time,
          timestamp,
          description: description.trim() || `${type.toUpperCase()} transaction`,
          tags: parsedTags,
          transferMeta,
          debtRepaymentType: isDebtRepayment ? 'principal' : undefined,
          inputSource: receiptHash ? 'ocr' : 'manual',
          receiptHash: receiptHash || undefined,
          ...taxPayload,
        });

        if (pendingReceiptImage && createdTx?.id) {
          try {
            await attachReceiptToTransaction(createdTx.id, pendingReceiptImage);
          } catch (rcptErr) {
            console.warn('Failed to attach receipt image:', rcptErr);
          }
        }
      }

      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save transaction');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!transactionToEdit) return;
    if (confirm('Move this transaction to Trash?')) {
      await softDeleteTransaction(transactionToEdit.id);
      onClose();
    }
  };

  const filteredCategories = categories.filter((c) => {
    if (c.isDeleted) return false;
    if (type === 'transfer') return c.id === 'cat_transfer';
    if (type === 'debt' || type === 'receivable') return c.id === 'cat_debt_loan';
    return c.type === type || c.type === 'both';
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Type Selector Tabs */}
        <div className="grid grid-cols-5 p-2 bg-slate-950/80 border-b border-slate-800">
          <button
            type="button"
            onClick={() => setType('expense')}
            className={`py-2 px-1 rounded-xl text-xs font-bold flex flex-col items-center space-y-1 transition ${
              type === 'expense'
                ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <TrendingDown className="w-4 h-4" />
            <span>Expense</span>
          </button>

          <button
            type="button"
            onClick={() => setType('income')}
            className={`py-2 px-1 rounded-xl text-xs font-bold flex flex-col items-center space-y-1 transition ${
              type === 'income'
                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            <span>Income</span>
          </button>

          <button
            type="button"
            onClick={() => setType('transfer')}
            className={`py-2 px-1 rounded-xl text-xs font-bold flex flex-col items-center space-y-1 transition ${
              type === 'transfer'
                ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <ArrowLeftRight className="w-4 h-4" />
            <span>Transfer</span>
          </button>

          <button
            type="button"
            onClick={() => setType('debt')}
            className={`py-2 px-1 rounded-xl text-xs font-bold flex flex-col items-center space-y-1 transition ${
              type === 'debt'
                ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/30 font-extrabold'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <HandCoins className="w-4 h-4" />
            <span>Debt</span>
          </button>

          <button
            type="button"
            onClick={() => setType('receivable')}
            className={`py-2 px-1 rounded-xl text-xs font-bold flex flex-col items-center space-y-1 transition ${
              type === 'receivable'
                ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Receipt className="w-4 h-4" />
            <span>Receivable</span>
          </button>
        </div>

        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-slate-800/80 bg-slate-900/40">
          <span className="text-xs uppercase tracking-wider font-semibold text-slate-400">
            {transactionToEdit ? 'Edit Transaction' : 'Record New Transaction'}
          </span>
          <div className="flex items-center space-x-2">
            {!transactionToEdit && (
              <button
                type="button"
                onClick={() => setIsScannerOpen(true)}
                className="flex items-center space-x-1.5 px-3 py-1 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-xl text-xs font-semibold transition"
                title="Pindai bukti transfer bank atau struk belanja"
              >
                <Camera className="w-3.5 h-3.5 text-indigo-400" />
                <span>Pindai Bukti / Rekening</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1">
          {errorMessage && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center space-x-2 text-rose-400 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Big Amount Input */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Amount ({selectedAccount?.currency || baseCurrency})
              </label>
              {selectedAccount && selectedAccount.currency !== baseCurrency && (
                <div className="flex items-center space-x-1 text-xs text-blue-400 font-mono">
                  <RefreshCw className={`w-3 h-3 ${isFetchingFx ? 'animate-spin' : ''}`} />
                  <span>
                    1 {selectedAccount.currency} ≈ {formatCurrency(exchangeRateToBase, baseCurrency)}
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center space-x-3">
              <span className="text-2xl sm:text-3xl font-extrabold text-slate-400 font-mono">
                {selectedAccount?.currency || baseCurrency}
              </span>
              <input
                type="number"
                step="any"
                autoFocus
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-transparent text-white font-mono text-3xl sm:text-4xl font-extrabold focus:outline-none placeholder-slate-700"
                required
              />
            </div>
          </div>

          {/* Account Selection */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                {type === 'transfer' ? 'From Account (Source)' : 'Account'}
              </label>
              <button
                type="button"
                onClick={() => setIsQuickAddAccountOpen(true)}
                className="text-[11px] font-bold text-indigo-400 hover:text-indigo-300 flex items-center space-x-1 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Account</span>
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {activeAccounts.map((acc) => (
                <button
                  key={acc.id}
                  type="button"
                  onClick={() => setAccountId(acc.id)}
                  className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between ${
                    accountId === acc.id
                      ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500/50'
                      : 'border-slate-800 bg-slate-800/40 hover:bg-slate-800/80'
                  }`}
                >
                  <div className="flex items-center space-x-2 mb-1.5">
                    <div className="p-1.5 rounded-lg" style={{ backgroundColor: `${acc.color}20`, color: acc.color }}>
                      <IconRenderer name={acc.icon} className="w-4 h-4" />
                    </div>
                    <span className="text-sm font-semibold text-white truncate">{acc.name}</span>
                  </div>
                  <span className="text-xs text-slate-400 font-mono">
                    {formatCurrency(acc.currentBalance, acc.currency)}
                  </span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => setIsQuickAddAccountOpen(true)}
                className="p-3 rounded-2xl border border-dashed border-slate-700 hover:border-indigo-500/60 bg-slate-900/30 hover:bg-indigo-500/10 text-slate-400 hover:text-indigo-300 transition flex flex-col items-center justify-center space-y-1 text-center"
              >
                <Plus className="w-4 h-4" />
                <span className="text-xs font-semibold">+ New Account</span>
              </button>
            </div>
          </div>

          {/* Transfer Destination and Fee Fields */}
          {type === 'transfer' && (
            <div className="p-4 bg-indigo-950/20 border border-indigo-900/40 rounded-2xl space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-indigo-300 uppercase tracking-wider">
                    To Account (Destination)
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsQuickAddToAccountOpen(true)}
                    className="text-[11px] font-bold text-indigo-400 hover:text-indigo-300 flex items-center space-x-1 transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Account</span>
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {activeAccounts
                    .filter((a) => a.id !== accountId)
                    .map((acc) => (
                      <button
                        key={acc.id}
                        type="button"
                        onClick={() => setToAccountId(acc.id)}
                        className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between ${
                          toAccountId === acc.id
                            ? 'border-indigo-500 bg-indigo-500/20 ring-1 ring-indigo-500/50'
                            : 'border-slate-800 bg-slate-800/40 hover:bg-slate-800/80'
                        }`}
                      >
                        <div className="flex items-center space-x-2 mb-1.5">
                          <div className="p-1.5 rounded-lg" style={{ backgroundColor: `${acc.color}20`, color: acc.color }}>
                            <IconRenderer name={acc.icon} className="w-4 h-4" />
                          </div>
                          <span className="text-sm font-semibold text-white truncate">{acc.name}</span>
                        </div>
                        <span className="text-xs text-slate-400 font-mono">
                          {formatCurrency(acc.currentBalance, acc.currency)}
                        </span>
                      </button>
                    ))}
                  <button
                    type="button"
                    onClick={() => setIsQuickAddToAccountOpen(true)}
                    className="p-3 rounded-2xl border border-dashed border-slate-700 hover:border-indigo-500/60 bg-slate-900/30 hover:bg-indigo-500/10 text-slate-400 hover:text-indigo-300 transition flex flex-col items-center justify-center space-y-1 text-center"
                  >
                    <Plus className="w-4 h-4" />
                    <span className="text-xs font-semibold">+ New Account</span>
                  </button>
                </div>
              </div>

              {/* Converted Amount Preview if differing currencies */}
              {destinationAccount && (
                <div className="flex items-center justify-between p-3 bg-slate-900/80 rounded-xl border border-slate-800 text-sm">
                  <span className="text-slate-400">Recipient Receives:</span>
                  <div className="flex items-center space-x-2">
                    <input
                      type="number"
                      step="any"
                      value={toAmount}
                      onChange={(e) => setToAmount(e.target.value)}
                      className="w-28 px-2 py-1 bg-slate-800 border border-slate-700 rounded-lg text-white font-mono text-right font-bold"
                    />
                    <span className="text-indigo-400 font-mono font-bold">{destinationAccount.currency}</span>
                  </div>
                </div>
              )}

              {/* Transfer Fee Toggle */}
              <div className="pt-2 border-t border-indigo-900/30">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300">Deduct Transfer Fee (Bank / Admin Fee)</span>
                  <input
                    type="checkbox"
                    checked={hasTransferFee}
                    onChange={(e) => setHasTransferFee(e.target.checked)}
                    className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
                  />
                </div>

                {hasTransferFee && (
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Fee Amount ({selectedAccount?.currency})</label>
                      <input
                        type="number"
                        step="any"
                        value={feeAmount}
                        onChange={(e) => setFeeAmount(e.target.value)}
                        placeholder="e.g. 2500 or 6500"
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white font-mono text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Fee Category</label>
                      <select
                        value={feeCategoryId}
                        onChange={(e) => {
                          if (e.target.value === '__new_category__') {
                            setIsQuickAddCategoryOpen(true);
                          } else {
                            setFeeCategoryId(e.target.value);
                          }
                        }}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm"
                      >
                        <option value="cat_fees">Bank & Transfer Fees</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                        <option value="__new_category__">+ Add new category...</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Category Selector (for income / expense) */}
          {type !== 'transfer' && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Category
                </label>
                <button
                  type="button"
                  onClick={() => setIsQuickAddCategoryOpen(true)}
                  className="text-[11px] font-bold text-blue-400 hover:text-blue-300 flex items-center space-x-1 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Category</span>
                </button>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-36 overflow-y-auto p-1">
                {filteredCategories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategoryId(cat.id)}
                    className={`p-2.5 rounded-xl border text-center transition flex flex-col items-center space-y-1 ${
                      categoryId === cat.id
                        ? 'border-blue-500 bg-blue-500/20 text-white font-bold'
                        : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:text-white'
                    }`}
                  >
                    <div className="p-1.5 rounded-lg" style={{ backgroundColor: `${cat.color}20`, color: cat.color }}>
                      <IconRenderer name={cat.icon} className="w-4 h-4" />
                    </div>
                    <span className="text-xs truncate w-full">{cat.name}</span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setIsQuickAddCategoryOpen(true)}
                  className="p-2.5 rounded-xl border border-dashed border-slate-700 hover:border-blue-500/60 bg-slate-900/30 hover:bg-blue-500/10 text-slate-400 hover:text-blue-300 transition flex flex-col items-center justify-center space-y-1 text-center"
                >
                  <Plus className="w-4 h-4" />
                  <span className="text-xs font-semibold">+ New</span>
                </button>
              </div>
            </div>
          )}

          {/* Feature: Indonesian Personal Income Tax (PPh) Treatment (for Income) */}
          {type === 'income' && (
            <div className="p-4 bg-emerald-950/20 border border-emerald-900/40 rounded-2xl space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Receipt className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold text-emerald-300 uppercase tracking-wider">
                    Perlakuan Pajak Penghasilan (PPh)
                  </span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-900/60 text-emerald-300 font-medium">
                  Estimator
                </span>
              </div>

              {/* 3 Option Pills */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setTaxTreatment('not_applicable')}
                  className={`p-2.5 rounded-xl border text-xs font-semibold transition text-left sm:text-center ${
                    taxTreatment === 'not_applicable'
                      ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40'
                      : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="font-bold">Bukan Objek / N/A</div>
                  <div className="text-[10px] text-slate-400 font-normal">Transfer, hadiah, dsb.</div>
                </button>

                <button
                  type="button"
                  onClick={() => setTaxTreatment('withheld_at_source')}
                  className={`p-2.5 rounded-xl border text-xs font-semibold transition text-left sm:text-center ${
                    taxTreatment === 'withheld_at_source'
                      ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40'
                      : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="font-bold">Dipotong Pihak Lain</div>
                  <div className="text-[10px] text-slate-400 font-normal">Ada bukti potong (Shopee, dll)</div>
                </button>

                <button
                  type="button"
                  onClick={() => setTaxTreatment('needs_self_calculation')}
                  className={`p-2.5 rounded-xl border text-xs font-semibold transition text-left sm:text-center ${
                    taxTreatment === 'needs_self_calculation'
                      ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40'
                      : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="font-bold">Hitung Sendiri</div>
                  <div className="text-[10px] text-slate-400 font-normal">Belum dipotong (TikTok, dll)</div>
                </button>
              </div>

              {/* Sub-fields for Withheld at source */}
              {taxTreatment === 'withheld_at_source' && (
                <div className="p-3 bg-slate-900/70 border border-slate-800/80 rounded-xl space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-slate-300 mb-1">
                        Pajak Dipotong / Bukti Potong ({selectedAccount?.currency || baseCurrency})
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={taxWithheldAmount}
                        onChange={(e) => {
                          const val = e.target.value;
                          setTaxWithheldAmount(val);
                          const net = parseFloat(amount) || 0;
                          const w = parseFloat(val) || 0;
                          setGrossAmount((net + w).toString());
                        }}
                        placeholder="Contoh: 500000"
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white font-mono text-sm"
                      />
                      <span className="text-[10px] text-slate-400 mt-1 block">
                        Akan dicatat sebagai kredit pajak (pengurang PPh terutang).
                      </span>
                    </div>

                    <div>
                      <label className="block text-[11px] text-slate-300 mb-1">
                        Penghasilan Bruto ({selectedAccount?.currency || baseCurrency})
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={grossAmount}
                        onChange={(e) => setGrossAmount(e.target.value)}
                        placeholder="Bruto sebelum potong pajak"
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-emerald-400 font-mono text-sm font-bold"
                      />
                      <span className="text-[10px] text-slate-400 mt-1 block">
                        Net masuk rekening: {amount ? `${amount} ${selectedAccount?.currency || baseCurrency}` : '0'}.
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Sub-fields for Needs self calculation */}
              {taxTreatment === 'needs_self_calculation' && (
                <div className="p-3 bg-slate-900/70 border border-slate-800/80 rounded-xl space-y-2">
                  <div>
                    <label className="block text-[11px] text-slate-300 mb-1">
                      Penghasilan Bruto Kena Pajak ({selectedAccount?.currency || baseCurrency})
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={grossAmount || amount}
                      onChange={(e) => setGrossAmount(e.target.value)}
                      placeholder="Bruto kena pajak"
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-emerald-400 font-mono text-sm font-bold"
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      Akan diakumulasikan ke perhitungan tarif progresif tahunan di menu Pajak.
                    </span>
                  </div>
                </div>
              )}

              {/* Source label tag */}
              {taxTreatment !== 'not_applicable' && (
                <div>
                  <label className="block text-[11px] text-slate-300 mb-1">
                    Label Sumber Penghasilan / Keterangan Pajak (Opsional)
                  </label>
                  <input
                    type="text"
                    value={taxSourceLabel}
                    onChange={(e) => setTaxSourceLabel(e.target.value)}
                    placeholder="Contoh: Shopee Affiliate, TikTok Affiliate, Google AdSense"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-xs mb-1.5"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {['Shopee Affiliate', 'TikTok Creator', 'Google AdSense', 'Klien Freelance', 'Royalti / Lisensi'].map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => setTaxSourceLabel(chip)}
                        className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                      >
                        + {chip}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Debt / Receivable Details */}
          {(type === 'debt' || type === 'receivable') && (
            <div className="p-4 bg-amber-950/20 border border-amber-900/40 rounded-2xl space-y-3">
              <h4 className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                {type === 'debt' ? 'Debt Details (Owed to Someone)' : 'Receivable Details (Owed to You)'}
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    {type === 'debt' ? 'Lender / Creditor Name' : 'Borrower / Debtor Name'}
                  </label>
                  <input
                    type="text"
                    value={personName}
                    onChange={(e) => setPersonName(e.target.value)}
                    placeholder="e.g. John Doe, Bank"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm"
                  />
                </div>
              </div>
              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="repaymentToggle"
                  checked={isDebtRepayment}
                  onChange={(e) => setIsDebtRepayment(e.target.checked)}
                  className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                />
                <label htmlFor="repaymentToggle" className="text-xs text-slate-300 cursor-pointer">
                  {type === 'debt'
                    ? 'This is a Repayment (settling existing debt)'
                    : 'This is a Collection (receiving repayment from borrower)'}
                </label>
              </div>
            </div>
          )}

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Date
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
                <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Time
              </label>
              <div className="relative">
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <Clock className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Note / Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Note / Description
            </label>
            <div className="flex items-center space-x-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="What is this transaction for?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <FileText className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
              </div>
              {isSpeechRecognitionSupported() && (
                <button
                  type="button"
                  onClick={handleMicClick}
                  className={`p-2.5 rounded-xl border transition ${
                    isListening
                      ? 'bg-rose-500/20 border-rose-500 text-rose-400 animate-pulse'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                  }`}
                  title={isListening ? 'Listening... click to stop' : 'Voice Input (Indonesian/English)'}
                >
                  <Mic className="w-4 h-4 text-purple-400" />
                </button>
              )}
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Tags (Comma separated)
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="coffee, meeting, client"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <Tag className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            </div>
          </div>

          {/* View Receipt in Google Drive (V1.1 Feature) */}
          {transactionToEdit?.receiptUrl && (
            <div className="p-3.5 rounded-2xl bg-blue-950/20 border border-blue-500/30 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-xl bg-blue-500/20 text-blue-400">
                  <Receipt className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">Bukti Struk di Google Drive</h4>
                  <p className="text-[11px] text-slate-400">Tersimpan di MyFinancialFlow Data/Receipts/</p>
                </div>
              </div>
              <a
                href={transactionToEdit.receiptUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition flex items-center space-x-1"
              >
                <span>Buka Struk ↗</span>
              </a>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-800">
            {transactionToEdit ? (
              <button
                type="button"
                onClick={handleDelete}
                className="flex items-center space-x-1.5 px-3 py-2 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-xl transition text-sm font-medium"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete</span>
              </button>
            ) : (
              <div />
            )}

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
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition text-sm font-bold shadow-lg shadow-blue-600/30 disabled:opacity-50"
              >
                {transactionToEdit ? 'Save Changes' : 'Save Transaction'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Embedded Receipt & Bank Transfer Scanner Modal */}
      <ReceiptScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        accounts={accounts}
        categories={categories}
        baseCurrency={baseCurrency}
        settings={settings}
        onProposalGenerated={handleProposalFromScanner}
      />

      {/* Inline Quick Add Category Modal */}
      <QuickAddCategoryModal
        isOpen={isQuickAddCategoryOpen}
        onClose={() => setIsQuickAddCategoryOpen(false)}
        initialType={type === 'income' ? 'income' : 'expense'}
        onCreated={(newCat) => {
          setCategoryId(newCat.id);
        }}
      />

      {/* Inline Quick Add Account Modal */}
      <QuickAddAccountModal
        isOpen={isQuickAddAccountOpen}
        onClose={() => setIsQuickAddAccountOpen(false)}
        baseCurrency={baseCurrency}
        onCreated={(newAcc) => {
          setAccountId(newAcc.id);
        }}
      />

      {/* Inline Quick Add Destination Account Modal */}
      <QuickAddAccountModal
        isOpen={isQuickAddToAccountOpen}
        onClose={() => setIsQuickAddToAccountOpen(false)}
        baseCurrency={baseCurrency}
        onCreated={(newAcc) => {
          setToAccountId(newAcc.id);
        }}
      />

      {/* Voice Privacy Disclosure Modal */}
      <VoicePrivacyModal
        isOpen={isVoiceModalOpen}
        onClose={() => setIsVoiceModalOpen(false)}
        onAcknowledged={() => {
          setIsVoiceModalOpen(false);
          handleMicClick();
        }}
      />
    </div>
  );
};
