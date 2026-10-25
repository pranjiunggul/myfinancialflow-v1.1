import React, { useState, useMemo } from 'react';
import {
  Search,
  Plus,
  Trash2,
  RotateCcw,
  Calendar,
  Layers,
  CheckSquare,
  Square,
  Tag,
  FolderSync,
  X,
  Paperclip,
} from 'lucide-react';
import type {
  Transaction,
  Account,
  Category,
  CurrencyCode,
} from '../../types';
import { formatCurrency } from '../../services/fx';
import {
  restoreTransaction,
  bulkSoftDeleteTransactions,
  bulkReassignCategory,
  bulkReassignAccount,
  bulkUpdateTags,
} from '../../services/ledger';
import { IconRenderer } from '../common/IconRenderer';

interface TransactionListViewProps {
  transactions: Transaction[];
  accounts: Account[];
  categories: Category[];
  baseCurrency: CurrencyCode;
  onOpenNewTransaction: () => void;
  onEditTransaction: (tx: Transaction) => void;
  onOpenBulkHistory?: () => void;
}

export const TransactionListView: React.FC<TransactionListViewProps> = ({
  transactions,
  accounts,
  categories,
  baseCurrency,
  onOpenNewTransaction,
  onEditTransaction,
  onOpenBulkHistory,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('month');
  const [showTrash, setShowTrash] = useState(false);

  // Feature 6: Multi-Select Mode State
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedTxIds, setSelectedTxIds] = useState<Set<string>>(new Set());
  const [bulkModalType, setBulkModalType] = useState<'category' | 'account' | 'tag' | null>(null);
  const [targetCategoryId, setTargetCategoryId] = useState('');
  const [targetAccountId, setTargetAccountId] = useState('');
  const [tagsToAddInput, setTagsToAddInput] = useState('');
  const [tagsToRemoveInput, setTagsToRemoveInput] = useState('');

  const toggleSelect = (id: string) => {
    setSelectedTxIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedTxIds.size === filteredTransactions.length) {
      setSelectedTxIds(new Set());
    } else {
      setSelectedTxIds(new Set(filteredTransactions.map((t) => t.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedTxIds.size === 0) return;
    if (window.confirm(`Are you sure you want to delete ${selectedTxIds.size} transactions?`)) {
      await bulkSoftDeleteTransactions(Array.from(selectedTxIds));
      setSelectedTxIds(new Set());
      setIsSelectionMode(false);
    }
  };

  const handleApplyBulkCategory = async () => {
    if (!targetCategoryId || selectedTxIds.size === 0) return;
    await bulkReassignCategory(Array.from(selectedTxIds), targetCategoryId);
    setBulkModalType(null);
    setSelectedTxIds(new Set());
    setIsSelectionMode(false);
  };

  const handleApplyBulkAccount = async () => {
    if (!targetAccountId || selectedTxIds.size === 0) return;
    await bulkReassignAccount(Array.from(selectedTxIds), targetAccountId);
    setBulkModalType(null);
    setSelectedTxIds(new Set());
    setIsSelectionMode(false);
  };

  const handleApplyBulkTags = async () => {
    if (selectedTxIds.size === 0) return;
    const addArr = tagsToAddInput.split(',').map((s) => s.trim()).filter(Boolean);
    const remArr = tagsToRemoveInput.split(',').map((s) => s.trim()).filter(Boolean);
    await bulkUpdateTags(Array.from(selectedTxIds), addArr, remArr);
    setBulkModalType(null);
    setTagsToAddInput('');
    setTagsToRemoveInput('');
    setSelectedTxIds(new Set());
    setIsSelectionMode(false);
  };

  // Filter items
  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      // Trash view toggle
      if (showTrash) {
        if (!tx.isDeleted) return false;
      } else {
        if (tx.isDeleted) return false;
      }

      // Type filter
      if (selectedType !== 'all' && tx.type !== selectedType) {
        return false;
      }

      // Account filter
      if (selectedAccountId !== 'all' && tx.accountId !== selectedAccountId && tx.transferMeta?.toAccountId !== selectedAccountId) {
        return false;
      }

      // Date range filter
      if (dateFilter !== 'all') {
        const today = new Date().toISOString().split('T')[0];
        if (dateFilter === 'today' && tx.date !== today) return false;
        if (dateFilter === 'month') {
          const currentMonth = today.slice(0, 7);
          if (!tx.date.startsWith(currentMonth)) return false;
        }
      }

      // Text search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesDesc = tx.description.toLowerCase().includes(query);
        const matchesAmount = tx.amount.toString().includes(query);
        const matchesTags = tx.tags?.some((t) => t.toLowerCase().includes(query));
        const cat = categories.find((c) => c.id === tx.categoryId);
        const matchesCat = cat?.name.toLowerCase().includes(query);
        return matchesDesc || matchesAmount || matchesTags || matchesCat;
      }

      return true;
    });
  }, [transactions, showTrash, selectedType, selectedAccountId, dateFilter, searchQuery, categories]);

  // Group transactions by date
  const groupedByDate = useMemo(() => {
    const groups = new Map<string, Transaction[]>();
    // Sort descending by timestamp / date
    const sorted = [...filteredTransactions].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    for (const tx of sorted) {
      const existing = groups.get(tx.date) || [];
      existing.push(tx);
      groups.set(tx.date, existing);
    }
    return Array.from(groups.entries());
  }, [filteredTransactions]);

  const activeAccounts = accounts.filter((a) => !a.isDeleted);

  return (
    <div className="space-y-5 pb-20 sm:pb-8">
      {/* Top Header & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            {showTrash ? 'Trash & Deleted Ledger' : 'Transactions Ledger'}
          </h2>
          <p className="text-xs text-slate-400">
            {showTrash
              ? 'Soft-deleted transactions preserved for recovery'
              : `${filteredTransactions.length} records found`}
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => {
              setIsSelectionMode(!isSelectionMode);
              setSelectedTxIds(new Set());
            }}
            className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition ${
              isSelectionMode
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <CheckSquare className="w-3.5 h-3.5" />
            <span>{isSelectionMode ? 'Cancel Select' : 'Select'}</span>
          </button>

          <button
            onClick={() => setShowTrash(!showTrash)}
            className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition ${
              showTrash
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{showTrash ? 'Exit Trash' : 'View Trash'}</span>
          </button>

          {!showTrash && (
            <div className="flex items-center space-x-2">
              {onOpenBulkHistory && (
                <button
                  onClick={onOpenBulkHistory}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-sky-400 hover:text-sky-300 border border-slate-700/80 rounded-xl text-xs sm:text-sm font-semibold flex items-center space-x-1.5 transition shadow-sm"
                  title="Scan & Impor Riwayat Transaksi dari Screenshot Multi-Baris"
                >
                  <Layers className="w-4 h-4 text-sky-400" />
                  <span className="hidden sm:inline">Scan Riwayat</span>
                  <span className="sm:hidden">Riwayat</span>
                </button>
              )}

              <button
                onClick={onOpenNewTransaction}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs sm:text-sm font-bold shadow-lg shadow-blue-600/30 flex items-center space-x-1.5 transition"
              >
                <Plus className="w-4 h-4" />
                <span>Add</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Filter and Search Bar Controls */}
      <div className="p-4 bg-slate-900/60 border border-slate-800/80 rounded-2xl space-y-3">
        {/* Search Input */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search by description, amount, category, or tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-800/80 border border-slate-700/60 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
        </div>

        {/* Filter Badges: Type & Date */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          {/* Type Filter Tabs */}
          <div className="flex flex-wrap gap-1">
            {['all', 'expense', 'income', 'transfer', 'debt', 'receivable'].map((t) => (
              <button
                key={t}
                onClick={() => setSelectedType(t)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold uppercase tracking-wider transition ${
                  selectedType === t
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-800/60 text-slate-400 hover:text-white'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Account Filter & Date Range */}
          <div className="flex items-center space-x-2">
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="px-2.5 py-1 bg-slate-800 border border-slate-700 rounded-lg text-xs font-semibold text-slate-300 focus:outline-none"
            >
              <option value="all">All Accounts</option>
              {activeAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>

            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as any)}
              className="px-2.5 py-1 bg-slate-800 border border-slate-700 rounded-lg text-xs font-semibold text-slate-300 focus:outline-none"
            >
              <option value="month">This Month</option>
              <option value="today">Today</option>
              <option value="all">All Time</option>
            </select>
          </div>
        </div>
      </div>

      {/* Grouped Transaction List */}
      {groupedByDate.length === 0 ? (
        <div className="py-16 text-center bg-slate-900/20 border border-slate-800/60 rounded-3xl space-y-2">
          <p className="text-slate-400 text-sm">No transactions match your current filters.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {groupedByDate.map(([dateString, txList]) => {
            // Daily totals
            const dayExpense = txList
              .filter((t) => t.type === 'expense')
              .reduce((sum, t) => sum + (t.baseAmount || t.amount), 0);

            const dayIncome = txList
              .filter((t) => t.type === 'income')
              .reduce((sum, t) => sum + (t.baseAmount || t.amount), 0);

            return (
              <div key={dateString} className="space-y-2">
                {/* Date Header with Daily Subtotals */}
                <div className="flex items-center justify-between px-2 text-xs font-bold text-slate-400">
                  <div className="flex items-center space-x-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-500" />
                    <span>{dateString}</span>
                  </div>
                  <div className="flex items-center space-x-3 font-mono text-[11px]">
                    {dayIncome > 0 && <span className="text-emerald-400">+{formatCurrency(dayIncome, baseCurrency)}</span>}
                    {dayExpense > 0 && <span className="text-rose-400">-{formatCurrency(dayExpense, baseCurrency)}</span>}
                  </div>
                </div>

                {/* Day's Transactions Card */}
                <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl divide-y divide-slate-800/60 overflow-hidden">
                  {txList.map((tx) => {
                    const account = accounts.find((a) => a.id === tx.accountId);
                    const destAccount = tx.transferMeta?.toAccountId
                      ? accounts.find((a) => a.id === tx.transferMeta?.toAccountId)
                      : null;
                    const category = categories.find((c) => c.id === tx.categoryId);

                    const isExpense = tx.type === 'expense';
                    const isIncome = tx.type === 'income';
                    const isTransfer = tx.type === 'transfer';
                    const isDebt = tx.type === 'debt';
                    const isReceivable = tx.type === 'receivable';

                    return (
                      <div
                        key={tx.id}
                        onClick={() => {
                          if (isSelectionMode) {
                            toggleSelect(tx.id);
                          } else if (!showTrash) {
                            onEditTransaction(tx);
                          }
                        }}
                        className={`p-3.5 flex items-center justify-between transition ${
                          selectedTxIds.has(tx.id)
                            ? 'bg-blue-950/30 border-l-4 border-l-blue-500'
                            : showTrash
                            ? 'opacity-70 bg-rose-950/10'
                            : 'hover:bg-slate-800/40 cursor-pointer'
                        }`}
                      >
                        <div className="flex items-center space-x-3">
                          {isSelectionMode && (
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleSelect(tx.id);
                              }}
                              className="text-slate-400 hover:text-white shrink-0 pr-1 cursor-pointer"
                            >
                              {selectedTxIds.has(tx.id) ? (
                                <CheckSquare className="w-5 h-5 text-blue-400" />
                              ) : (
                                <Square className="w-5 h-5 text-slate-600" />
                              )}
                            </div>
                          )}
                          <div
                            className="p-2.5 rounded-xl shrink-0"
                            style={{
                              backgroundColor: isTransfer
                                ? '#6366f120'
                                : category
                                ? `${category.color}20`
                                : '#3b82f620',
                              color: isTransfer ? '#818cf8' : category ? category.color : '#60a5fa',
                            }}
                          >
                            <IconRenderer
                              name={
                                isTransfer
                                  ? 'ArrowLeftRight'
                                  : isDebt
                                  ? 'HandCoins'
                                  : isReceivable
                                  ? 'Receipt'
                                  : category?.icon || 'Receipt'
                              }
                              className="w-5 h-5"
                            />
                          </div>
                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="text-sm font-bold text-white truncate max-w-[160px] sm:max-w-xs">
                                {tx.description}
                              </span>
                              {isTransfer && (
                                <span className="text-[10px] bg-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded font-semibold">
                                  {account?.name} → {destAccount?.name}
                                </span>
                              )}
                              {tx.transferMeta?.feeAmount && tx.transferMeta.feeAmount > 0 && (
                                <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-mono">
                                  Fee: {formatCurrency(tx.transferMeta.feeAmount, tx.currency)}
                                </span>
                              )}
                              {tx.taxTreatment === 'withheld_at_source' && (
                                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.5 rounded font-medium">
                                  PPh Dipotong{tx.taxSourceLabel ? ` • ${tx.taxSourceLabel}` : ''}
                                </span>
                              )}
                              {tx.taxTreatment === 'needs_self_calculation' && (
                                <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded font-medium">
                                  PPh Sendiri{tx.taxSourceLabel ? ` • ${tx.taxSourceLabel}` : ''}
                                </span>
                              )}
                              {tx.receiptUrl && (
                                <a
                                  href={tx.receiptUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center space-x-1 text-[10px] bg-blue-500/10 text-blue-400 hover:text-blue-300 border border-blue-500/20 px-1.5 py-0.5 rounded font-medium transition"
                                  title="Lihat bukti struk di Google Drive"
                                >
                                  <Paperclip className="w-2.5 h-2.5" />
                                  <span>Struk ↗</span>
                                </a>
                              )}
                            </div>
                            <div className="flex items-center space-x-2 text-xs text-slate-400 mt-0.5">
                              <span>{tx.time || '12:00'}</span>
                              <span>•</span>
                              <span className="text-slate-300">{account?.name}</span>
                              {category && !isTransfer && (
                                <>
                                  <span>•</span>
                                  <span className="text-slate-400">{category.name}</span>
                                </>
                              )}
                            </div>
                            {tx.tags && tx.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {tx.tags.map((t) => (
                                  <span key={t} className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded font-mono">
                                    #{t}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Amount & Actions */}
                        <div className="flex items-center space-x-3">
                          <div className="text-right">
                            <span
                              className={`text-sm font-bold font-mono ${
                                isExpense
                                  ? 'text-rose-400'
                                  : isIncome
                                  ? 'text-emerald-400'
                                  : isTransfer
                                  ? 'text-indigo-400'
                                  : isDebt
                                  ? 'text-amber-400'
                                  : 'text-sky-400'
                              }`}
                            >
                              {isExpense ? '-' : isIncome ? '+' : ''}
                              {formatCurrency(tx.amount, tx.currency)}
                            </span>
                            {tx.currency !== baseCurrency && (
                              <span className="text-[11px] text-slate-400 font-mono block">
                                ≈ {formatCurrency(tx.baseAmount, baseCurrency)}
                              </span>
                            )}
                          </div>

                          {showTrash && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                restoreTransaction(tx.id);
                              }}
                              title="Restore Transaction"
                              className="p-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 rounded-lg transition"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Feature 6: Floating Bulk Action Bar */}
      {isSelectionMode && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900/95 border border-slate-700/80 backdrop-blur-md rounded-2xl shadow-2xl px-4 py-3 flex items-center space-x-3 text-xs animate-fade-in max-w-lg w-[92%] sm:w-auto">
          <div className="font-bold text-white shrink-0 pr-2 border-r border-slate-700">
            {selectedTxIds.size} selected
          </div>

          <button
            onClick={handleSelectAll}
            className="text-slate-300 hover:text-white font-medium"
          >
            {selectedTxIds.size === filteredTransactions.length ? 'Deselect All' : 'Select All'}
          </button>

          {selectedTxIds.size > 0 && (
            <>
              <button
                onClick={() => setBulkModalType('category')}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-indigo-300 flex items-center space-x-1 font-semibold"
                title="Change Category"
              >
                <FolderSync className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Category</span>
              </button>

              <button
                onClick={() => setBulkModalType('account')}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 flex items-center space-x-1 font-semibold"
                title="Change Account"
              >
                <FolderSync className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Account</span>
              </button>

              <button
                onClick={() => setBulkModalType('tag')}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-300 flex items-center space-x-1 font-semibold"
                title="Manage Tags"
              >
                <Tag className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Tags</span>
              </button>

              <button
                onClick={handleBulkDelete}
                className="px-2.5 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 flex items-center space-x-1 font-semibold"
                title="Delete Selected"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
            </>
          )}

          <button
            onClick={() => {
              setIsSelectionMode(false);
              setSelectedTxIds(new Set());
            }}
            className="p-1 text-slate-400 hover:text-white ml-auto"
            title="Cancel Selection"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Bulk Action Modals */}
      {bulkModalType === 'category' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 max-w-sm w-full space-y-4">
            <h4 className="text-sm font-bold text-white">Reassign Category ({selectedTxIds.size} transactions)</h4>
            <select
              value={targetCategoryId}
              onChange={(e) => setTargetCategoryId(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2 text-xs"
            >
              <option value="">Select target category...</option>
              {categories.filter((c) => !c.isDeleted).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setBulkModalType(null)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleApplyBulkCategory}
                disabled={!targetCategoryId}
                className="px-3.5 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg disabled:opacity-40"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkModalType === 'account' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 max-w-sm w-full space-y-4">
            <h4 className="text-sm font-bold text-white">Reassign Account ({selectedTxIds.size} transactions)</h4>
            <select
              value={targetAccountId}
              onChange={(e) => setTargetAccountId(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2 text-xs"
            >
              <option value="">Select target account...</option>
              {accounts.filter((a) => !a.isDeleted).map((a) => (
                <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
              ))}
            </select>
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setBulkModalType(null)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleApplyBulkAccount}
                disabled={!targetAccountId}
                className="px-3.5 py-1.5 text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white rounded-lg disabled:opacity-40"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkModalType === 'tag' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 max-w-sm w-full space-y-4">
            <h4 className="text-sm font-bold text-white">Manage Tags ({selectedTxIds.size} transactions)</h4>
            <div>
              <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                Tags to Add (comma separated)
              </label>
              <input
                type="text"
                placeholder="e.g. liburan-bali, reimbursement"
                value={tagsToAddInput}
                onChange={(e) => setTagsToAddInput(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                Tags to Remove (comma separated)
              </label>
              <input
                type="text"
                placeholder="e.g. pending"
                value={tagsToRemoveInput}
                onChange={(e) => setTagsToRemoveInput(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2 text-xs"
              />
            </div>
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setBulkModalType(null)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleApplyBulkTags}
                className="px-3.5 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
