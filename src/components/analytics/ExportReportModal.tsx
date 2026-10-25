import React, { useState } from 'react';
import {
  X,
  Download,
  FileSpreadsheet,
  FileText,
  Printer,
  Upload,
  CheckCircle,
  Plus,
} from 'lucide-react';
import type {
  Transaction,
  Account,
  Category,
  DebtReceivable,
  CurrencyCode,
} from '../../types';
import {
  exportTransactionsToCSV,
  exportToExcelWorkbook,
  openPrintableReportStatement,
  parseCSVToTransactions,
} from '../../services/export';
import { createTransaction } from '../../services/ledger';
import { formatCurrency } from '../../services/fx';
import { QuickAddCategoryModal } from '../shared/QuickAddCategoryModal';
import { QuickAddAccountModal } from '../shared/QuickAddAccountModal';

interface ExportReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactions: Transaction[];
  accounts: Account[];
  categories: Category[];
  debts: DebtReceivable[];
  baseCurrency: CurrencyCode;
}

export const ExportReportModal: React.FC<ExportReportModalProps> = ({
  isOpen,
  onClose,
  transactions,
  accounts,
  categories,
  debts,
  baseCurrency,
}) => {
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export');
  const [dateRange, setDateRange] = useState<'this_month' | 'last_month' | 'this_year' | 'all'>('this_month');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('all');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');

  // CSV Import state
  const [importPreview, setImportPreview] = useState<Array<Partial<Transaction>>>([]);
  const [targetAccountId, setTargetAccountId] = useState<string>('');
  const [targetCategoryId, setTargetCategoryId] = useState<string>('');
  const [importStatus, setImportStatus] = useState<string>('');
  const [isImporting, setIsImporting] = useState<boolean>(false);

  // Quick Add state
  const [isQuickAddCategoryOpen, setIsQuickAddCategoryOpen] = useState<boolean>(false);
  const [isQuickAddAccountOpen, setIsQuickAddAccountOpen] = useState<boolean>(false);

  const activeAccounts = accounts.filter((a) => !a.isDeleted);
  const activeCategories = categories.filter((c) => !c.isDeleted);

  React.useEffect(() => {
    if (activeAccounts.length > 0 && !targetAccountId) {
      setTargetAccountId(activeAccounts[0].id);
    }
    if (activeCategories.length > 0 && !targetCategoryId) {
      setTargetCategoryId(activeCategories[0].id);
    }
  }, [activeAccounts, activeCategories, targetAccountId, targetCategoryId]);

  if (!isOpen) return null;

  // Filter transactions based on date range and accounts
  const filteredTransactions = transactions.filter((tx) => {
    if (tx.isDeleted) return false;
    if (selectedAccountId !== 'all' && tx.accountId !== selectedAccountId) return false;
    if (selectedCategoryId !== 'all' && tx.categoryId !== selectedCategoryId) return false;

    const today = new Date();
    const curYearMonth = today.toISOString().slice(0, 7); // 'YYYY-MM'
    const curYear = today.getFullYear().toString();

    if (dateRange === 'this_month') {
      return tx.date.startsWith(curYearMonth);
    } else if (dateRange === 'last_month') {
      const lastMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastYearMonth = lastMonthDate.toISOString().slice(0, 7);
      return tx.date.startsWith(lastYearMonth);
    } else if (dateRange === 'this_year') {
      return tx.date.startsWith(curYear);
    }

    return true;
  });

  const handleExportCSV = () => {
    const csvContent = exportTransactionsToCSV(
      filteredTransactions,
      accounts,
      categories,
      baseCurrency
    );

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `myfinancialflow_transactions_${dateRange}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportExcel = () => {
    const xmlContent = exportToExcelWorkbook(
      filteredTransactions,
      accounts,
      categories,
      debts
    );

    const blob = new Blob([xmlContent], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `myfinancialflow_workbook_${new Date().toISOString().split('T')[0]}.xls`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handlePrintPDF = () => {
    const label =
      dateRange === 'this_month'
        ? 'Current Month'
        : dateRange === 'last_month'
        ? 'Previous Month'
        : dateRange === 'this_year'
        ? 'Year to Date'
        : 'All Records';

    openPrintableReportStatement(filteredTransactions, accounts, categories, baseCurrency, label);
  };

  const handleFileSelectForImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const rows = parseCSVToTransactions(
        text,
        targetAccountId || activeAccounts[0]?.id || '',
        targetCategoryId || activeCategories[0]?.id || '',
        baseCurrency
      );
      setImportPreview(rows);
      setImportStatus(`Parsed ${rows.length} valid transaction row(s) from CSV.`);
    } catch {
      setImportStatus('Failed to parse CSV file. Ensure it has standard columns.');
    }
  };

  const handleCommitImport = async () => {
    if (importPreview.length === 0) return;
    setIsImporting(true);
    try {
      let count = 0;
      for (const row of importPreview) {
        if (!row.amount || !row.date) continue;
        await createTransaction({
          type: row.type || 'expense',
          amount: row.amount,
          currency: row.currency || baseCurrency,
          exchangeRateToBase: 1.0,
          baseAmount: row.amount,
          accountId: targetAccountId || activeAccounts[0]?.id || '',
          categoryId: targetCategoryId || activeCategories[0]?.id || 'cat_food',
          date: row.date,
          timestamp: new Date(row.date).getTime() || Date.now(),
          description: row.description || 'Imported CSV item',
          inputSource: 'manual',
        });
        count++;
      }
      setImportStatus(`Successfully imported ${count} transaction(s)!`);
      setImportPreview([]);
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      setImportStatus('Import failed: ' + err.message);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Reports, Export & Import</h2>
              <p className="text-xs text-slate-400">Export data in CSV, Excel, or PDF Statement format</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="flex items-center px-6 border-b border-slate-800 space-x-4 bg-slate-950/40">
          <button
            onClick={() => setActiveTab('export')}
            className={`py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition ${
              activeTab === 'export'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            Export Reports
          </button>
          <button
            onClick={() => setActiveTab('import')}
            className={`py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition ${
              activeTab === 'import'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            Import CSV
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {activeTab === 'export' ? (
            <>
              {/* Filter controls */}
              <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-2xl space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Select Filter & Period
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Time Period</label>
                    <select
                      value={dateRange}
                      onChange={(e) => setDateRange(e.target.value as any)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs font-semibold"
                    >
                      <option value="this_month">This Month</option>
                      <option value="last_month">Last Month</option>
                      <option value="this_year">This Year</option>
                      <option value="all">All Time</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Account Filter</label>
                    <select
                      value={selectedAccountId}
                      onChange={(e) => setSelectedAccountId(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs font-semibold"
                    >
                      <option value="all">All Accounts</option>
                      {activeAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Category Filter</label>
                    <select
                      value={selectedCategoryId}
                      onChange={(e) => setSelectedCategoryId(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs font-semibold"
                    >
                      <option value="all">All Categories</option>
                      {activeCategories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="text-xs text-blue-400 pt-1 font-mono">
                  {filteredTransactions.length} transaction(s) ready for export
                </div>
              </div>

              {/* Export Format Action Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                {/* CSV */}
                <button
                  onClick={handleExportCSV}
                  className="p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-blue-500/50 hover:bg-slate-800/60 transition text-left space-y-2 group shadow-lg"
                >
                  <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400 w-fit group-hover:scale-110 transition">
                    <FileText className="w-5 h-5" />
                  </div>
                  <h4 className="text-sm font-bold text-white">CSV Export</h4>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Standard raw data for Excel, Google Sheets, or custom script processing.
                  </p>
                </button>

                {/* Excel Workbook */}
                <button
                  onClick={handleExportExcel}
                  className="p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-emerald-500/50 hover:bg-slate-800/60 transition text-left space-y-2 group shadow-lg"
                >
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 w-fit group-hover:scale-110 transition">
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                  <h4 className="text-sm font-bold text-white">Excel Workbook (.xls)</h4>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Formatted multi-tab workbook with styled headers and currency formats.
                  </p>
                </button>

                {/* PDF Statement */}
                <button
                  onClick={handlePrintPDF}
                  className="p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-indigo-500/50 hover:bg-slate-800/60 transition text-left space-y-2 group shadow-lg"
                >
                  <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 w-fit group-hover:scale-110 transition">
                    <Printer className="w-5 h-5" />
                  </div>
                  <h4 className="text-sm font-bold text-white">Printable Statement / PDF</h4>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Clean financial statement layout formatted for browser PDF generation.
                  </p>
                </button>
              </div>
            </>
          ) : (
            /* CSV Import Tab */
            <div className="space-y-4">
              {importStatus && (
                <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl flex items-center space-x-2 text-blue-400 text-xs">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  <span>{importStatus}</span>
                </div>
              )}

              <div className="p-5 bg-slate-950/60 border border-slate-800 rounded-2xl space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Select CSV File to Import
                </h4>
                <p className="text-xs text-slate-400">
                  Supports CSV with headers like Date, Amount, Description, and Type.
                </p>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs text-slate-400">Target Account</label>
                      <button
                        type="button"
                        onClick={() => setIsQuickAddAccountOpen(true)}
                        className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold flex items-center space-x-0.5"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Add</span>
                      </button>
                    </div>
                    <select
                      value={targetAccountId}
                      onChange={(e) => {
                        if (e.target.value === '__new_account__') {
                          setIsQuickAddAccountOpen(true);
                        } else {
                          setTargetAccountId(e.target.value);
                        }
                      }}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs font-semibold"
                    >
                      {activeAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                      <option value="__new_account__">+ Add new account...</option>
                    </select>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs text-slate-400">Default Category</label>
                      <button
                        type="button"
                        onClick={() => setIsQuickAddCategoryOpen(true)}
                        className="text-[10px] text-blue-400 hover:text-blue-300 font-bold flex items-center space-x-0.5"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Add</span>
                      </button>
                    </div>
                    <select
                      value={targetCategoryId}
                      onChange={(e) => {
                        if (e.target.value === '__new_category__') {
                          setIsQuickAddCategoryOpen(true);
                        } else {
                          setTargetCategoryId(e.target.value);
                        }
                      }}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs font-semibold"
                    >
                      {activeCategories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                      <option value="__new_category__">+ Add new category...</option>
                    </select>
                  </div>
                </div>

                <div className="pt-2">
                  <label className="flex items-center justify-center space-x-2 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold border border-dashed border-slate-600 cursor-pointer transition">
                    <Upload className="w-4 h-4 text-blue-400" />
                    <span>Choose CSV File</span>
                    <input type="file" accept=".csv" onChange={handleFileSelectForImport} className="hidden" />
                  </label>
                </div>
              </div>

              {/* Preview Rows */}
              {importPreview.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Preview (First {Math.min(importPreview.length, 5)} rows)
                  </h4>
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-800/80">
                    {importPreview.slice(0, 5).map((row, idx) => (
                      <div key={idx} className="p-3 text-xs flex items-center justify-between">
                        <div>
                          <span className="font-bold text-white block">{row.description}</span>
                          <span className="text-slate-500">{row.date} • {row.type}</span>
                        </div>
                        <span className="font-mono font-bold text-emerald-400">
                          {formatCurrency(row.amount || 0, baseCurrency)}
                        </span>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={handleCommitImport}
                    disabled={isImporting}
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-blue-600/30 disabled:opacity-50"
                  >
                    {isImporting ? 'Importing...' : `Confirm & Import ${importPreview.length} Records`}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Inline Quick Add Category Modal */}
      <QuickAddCategoryModal
        isOpen={isQuickAddCategoryOpen}
        onClose={() => setIsQuickAddCategoryOpen(false)}
        initialType="expense"
        onCreated={(newCat) => {
          setTargetCategoryId(newCat.id);
        }}
      />

      {/* Inline Quick Add Account Modal */}
      <QuickAddAccountModal
        isOpen={isQuickAddAccountOpen}
        onClose={() => setIsQuickAddAccountOpen(false)}
        baseCurrency={baseCurrency}
        onCreated={(newAcc) => {
          setTargetAccountId(newAcc.id);
        }}
      />
    </div>
  );
};
