import React, { useState } from 'react';
import {
  X,
  Upload,
  AlertTriangle,
  RefreshCw,
  Trash2,
  Check,
  Plus,
  Layers,
} from 'lucide-react';
import type { Account, Category, CurrencyCode, AppSettings, TransactionType } from '../../types';
import { scanHistoryScreenshot, type HistoryRowParsedItem } from '../../services/bulkHistoryOcr';
import { createTransaction } from '../../services/ledger';
import { QuickAddCategoryModal } from '../shared/QuickAddCategoryModal';
import { QuickAddAccountModal } from '../shared/QuickAddAccountModal';

interface BulkHistoryImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: Account[];
  categories: Category[];
  baseCurrency: CurrencyCode;
  settings?: AppSettings | null;
  masterPin?: string;
  onSuccess?: (importedCount: number) => void;
}

export const BulkHistoryImportModal: React.FC<BulkHistoryImportModalProps> = ({
  isOpen,
  onClose,
  accounts,
  categories,
  baseCurrency,
  settings,
  masterPin,
  onSuccess,
}) => {
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [parsedRows, setParsedRows] = useState<HistoryRowParsedItem[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  // Quick Add state
  const [quickAddType, setQuickAddType] = useState<'category' | 'account' | null>(null);
  const [targetRowId, setTargetRowId] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const urls = files.map((f) => URL.createObjectURL(f));
    setImagePreviews((prev) => [...prev, ...urls]);

    // Process images sequentially
    setIsProcessing(true);
    setErrorMessage('');
    setProgress(10);
    setStatusText('Memulai analisis screenshot riwayat transaksi...');

    const allNewRows: HistoryRowParsedItem[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setStatusText(`Menganalisis gambar ${i + 1} dari ${files.length}...`);
        setProgress(Math.round(((i + 1) / files.length) * 80));

        const rows = await scanHistoryScreenshot(
          file,
          {
            accounts,
            categories,
            baseCurrency,
            settings,
            masterPin,
          },
          (_p, s) => {
            setStatusText(`Gambar ${i + 1}/${files.length}: ${s}`);
          }
        );

        allNewRows.push(...rows);
      }

      setParsedRows((prev) => [...prev, ...allNewRows]);
      setStatusText(`Selesai! Ditemukan total ${allNewRows.length} transaksi.`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal memproses screenshot riwayat transaksi.');
    } finally {
      setIsProcessing(false);
      setProgress(100);
    }
  };

  const handleToggleSelectRow = (id: string) => {
    setParsedRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, selected: !r.selected } : r))
    );
  };

  const handleSelectAll = (select: boolean) => {
    setParsedRows((prev) => prev.map((r) => ({ ...r, selected: select })));
  };

  const handleUpdateRowField = (id: string, field: keyof HistoryRowParsedItem, value: any) => {
    setParsedRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
  };

  const handleDeleteRow = (id: string) => {
    setParsedRows((prev) => prev.filter((r) => r.id !== id));
  };

  const handleImportSelected = async () => {
    const selectedRows = parsedRows.filter((r) => r.selected);
    if (selectedRows.length === 0) {
      alert('Pilih minimal satu transaksi untuk diimpor.');
      return;
    }

    setIsImporting(true);
    let imported = 0;

    try {
      for (const row of selectedRows) {
        const timestamp = new Date(row.date).getTime() || Date.now();
        await createTransaction({
          accountId: row.suggestedAccountId || accounts[0]?.id || '',
          categoryId: row.suggestedCategoryId || categories[0]?.id || '',
          type: row.type,
          amount: row.amount,
          currency: row.currency || baseCurrency,
          exchangeRateToBase: 1,
          baseAmount: row.amount,
          description: row.description,
          date: row.date,
          timestamp,
          inputSource: 'ocr',
        });
        imported++;
      }

      // Remove imported rows from list
      setParsedRows((prev) => prev.filter((r) => !r.selected));
      onSuccess?.(imported);
      if (parsedRows.length <= selectedRows.length) {
        onClose();
      } else {
        alert(`Berhasil mengimpor ${imported} transaksi ke buku kas!`);
      }
    } catch (err: any) {
      alert(`Gagal mengimpor transaksi: ${err.message}`);
    } finally {
      setIsImporting(false);
    }
  };

  const selectedCount = parsedRows.filter((r) => r.selected).length;
  const totalExpense = parsedRows
    .filter((r) => r.selected && r.type === 'expense')
    .reduce((sum, r) => sum + r.amount, 0);
  const totalIncome = parsedRows
    .filter((r) => r.selected && r.type === 'income')
    .reduce((sum, r) => sum + r.amount, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 text-white shadow-lg shadow-sky-500/20">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center space-x-2">
                <span>Impor Riwayat Transaksi (Multi-Baris Screenshot OCR)</span>
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-400 border border-sky-500/30">
                  Batch OCR
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Deteksi banyak baris transaksi sekaligus dari screenshot mutasi ShopeePay, GoPay, OVO, BCA, Mandiri Livin, dll.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Area */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
          {/* Upload Zone */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-dashed border-slate-700/80 hover:border-sky-500/60 transition flex flex-col items-center justify-center text-center space-y-2">
            <div className="p-3 rounded-2xl bg-sky-500/10 text-sky-400">
              <Upload className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs sm:text-sm font-semibold text-slate-200">
                Pilih atau Tarik Screenshot Riwayat Transaksi
              </p>
              <p className="text-[11px] text-slate-400">
                Mendukung 1 atau beberapa screenshot sekaligus (PNG, JPG, WebP)
              </p>
            </div>
            <label className="cursor-pointer px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-sky-600/30">
              Pilih Gambar Screenshot
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleFilesSelected}
                className="hidden"
                disabled={isProcessing}
              />
            </label>

            {imagePreviews.length > 0 && (
              <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                {imagePreviews.map((src, idx) => (
                  <img
                    key={idx}
                    src={src}
                    alt={`Screenshot ${idx + 1}`}
                    className="w-12 h-16 object-cover rounded-lg border border-slate-700 shadow"
                  />
                ))}
              </div>
            )}
          </div>

          {/* Processing Status */}
          {isProcessing && (
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center space-x-2 text-sky-400 font-semibold">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>{statusText}</span>
                </span>
                <span className="font-mono text-slate-400">{progress}%</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-sky-500 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {errorMessage && (
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Parsed Rows Review Section */}
          {parsedRows.length > 0 && (
            <div className="space-y-3">
              {/* Batch Actions Bar */}
              <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center space-x-3">
                  <label className="flex items-center space-x-2 cursor-pointer font-semibold text-slate-200">
                    <input
                      type="checkbox"
                      checked={selectedCount === parsedRows.length && parsedRows.length > 0}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="w-4 h-4 rounded accent-sky-500"
                    />
                    <span>Pilih Semua ({selectedCount}/{parsedRows.length})</span>
                  </label>
                  <span className="text-slate-500">•</span>
                  <span className="text-rose-400 font-mono font-bold">
                    -{totalExpense.toLocaleString()} {baseCurrency}
                  </span>
                  <span className="text-emerald-400 font-mono font-bold">
                    +{totalIncome.toLocaleString()} {baseCurrency}
                  </span>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setParsedRows([])}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                  >
                    Hapus Semua
                  </button>
                </div>
              </div>

              {/* Rows List */}
              <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                {parsedRows.map((row) => (
                  <div
                    key={row.id}
                    className={`p-3.5 rounded-2xl border transition space-y-2.5 ${
                      row.selected
                        ? 'bg-slate-950 border-slate-700/80'
                        : 'bg-slate-950/40 border-slate-900 opacity-60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center space-x-3 flex-1 min-w-0">
                        <input
                          type="checkbox"
                          checked={row.selected}
                          onChange={() => handleToggleSelectRow(row.id)}
                          className="w-4 h-4 rounded accent-sky-500 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <input
                            type="text"
                            value={row.description}
                            onChange={(e) => handleUpdateRowField(row.id, 'description', e.target.value)}
                            placeholder="Deskripsi transaksi"
                            className="bg-transparent text-white font-semibold text-xs sm:text-sm w-full focus:outline-none focus:ring-1 focus:ring-sky-500 rounded px-1 -mx-1"
                          />
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 shrink-0">
                        <span
                          className={`font-mono font-bold text-xs sm:text-sm ${
                            row.type === 'income'
                              ? 'text-emerald-400'
                              : row.type === 'transfer'
                              ? 'text-indigo-400'
                              : 'text-rose-400'
                          }`}
                        >
                          {row.type === 'income' ? '+' : '-'}
                          {row.amount.toLocaleString()} {row.currency}
                        </span>

                        <button
                          type="button"
                          onClick={() => handleDeleteRow(row.id)}
                          className="p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition"
                          title="Hapus baris ini"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Duplicate Warning Pill */}
                    {row.isDuplicate && (
                      <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] flex items-center space-x-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                        <span>{row.duplicateReason || 'Kemungkinan transaksi duplikat dengan buku kas.'}</span>
                      </div>
                    )}

                    {/* Detail Controls Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      {/* Type Toggle */}
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase font-bold block mb-1">Tipe</span>
                        <select
                          value={row.type}
                          onChange={(e) => handleUpdateRowField(row.id, 'type', e.target.value as TransactionType)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg text-slate-200 text-xs px-2 py-1 focus:outline-none focus:ring-1 focus:ring-sky-500"
                        >
                          <option value="expense">Pengeluaran</option>
                          <option value="income">Pemasukan</option>
                          <option value="transfer">Transfer</option>
                        </select>
                      </div>

                      {/* Date */}
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase font-bold block mb-1">Tanggal</span>
                        <input
                          type="date"
                          value={row.date}
                          onChange={(e) => handleUpdateRowField(row.id, 'date', e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg text-slate-200 text-xs px-2 py-1 focus:outline-none focus:ring-1 focus:ring-sky-500 font-mono"
                        />
                      </div>

                      {/* Account with Quick Add */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] text-slate-500 uppercase font-bold">Rekening</span>
                          <button
                            type="button"
                            onClick={() => {
                              setTargetRowId(row.id);
                              setQuickAddType('account');
                            }}
                            className="text-[10px] text-sky-400 hover:text-sky-300 font-bold flex items-center space-x-0.5"
                          >
                            <Plus className="w-2.5 h-2.5" />
                            <span>Add</span>
                          </button>
                        </div>
                        <select
                          value={row.suggestedAccountId}
                          onChange={(e) => {
                            if (e.target.value === '__new_account__') {
                              setTargetRowId(row.id);
                              setQuickAddType('account');
                            } else {
                              const acc = accounts.find((a) => a.id === e.target.value);
                              if (acc) {
                                handleUpdateRowField(row.id, 'suggestedAccountId', acc.id);
                                handleUpdateRowField(row.id, 'suggestedAccountName', acc.name);
                              }
                            }
                          }}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg text-slate-200 text-xs px-2 py-1 focus:outline-none focus:ring-1 focus:ring-sky-500 truncate"
                        >
                          {accounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name} ({a.currency})
                            </option>
                          ))}
                          <option value="__new_account__">+ Tambah Rekening...</option>
                        </select>
                      </div>

                      {/* Category with Quick Add */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] text-slate-500 uppercase font-bold">Kategori</span>
                          <button
                            type="button"
                            onClick={() => {
                              setTargetRowId(row.id);
                              setQuickAddType('category');
                            }}
                            className="text-[10px] text-sky-400 hover:text-sky-300 font-bold flex items-center space-x-0.5"
                          >
                            <Plus className="w-2.5 h-2.5" />
                            <span>Add</span>
                          </button>
                        </div>
                        <select
                          value={row.suggestedCategoryId}
                          onChange={(e) => {
                            if (e.target.value === '__new_category__') {
                              setTargetRowId(row.id);
                              setQuickAddType('category');
                            } else {
                              const cat = categories.find((c) => c.id === e.target.value);
                              if (cat) {
                                handleUpdateRowField(row.id, 'suggestedCategoryId', cat.id);
                                handleUpdateRowField(row.id, 'suggestedCategoryName', cat.name);
                              }
                            }
                          }}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg text-slate-200 text-xs px-2 py-1 focus:outline-none focus:ring-1 focus:ring-sky-500 truncate"
                        >
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                          <option value="__new_category__">+ Tambah Kategori...</option>
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950/90 border-t border-slate-800 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            {parsedRows.length > 0 && (
              <span>
                {selectedCount} dari {parsedRows.length} transaksi terpilih
              </span>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
            >
              Tutup
            </button>

            <button
              onClick={handleImportSelected}
              disabled={isImporting || selectedCount === 0}
              className="flex items-center space-x-1.5 px-5 py-2 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 disabled:opacity-50 text-white text-xs font-bold shadow-lg shadow-sky-600/20 transition"
            >
              {isImporting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Mengimpor...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Impor {selectedCount} Transaksi ke Buku Kas</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Inline Quick Add Category Modal */}
      <QuickAddCategoryModal
        isOpen={quickAddType === 'category'}
        onClose={() => {
          setQuickAddType(null);
          setTargetRowId(null);
        }}
        onCreated={(newCat) => {
          if (targetRowId) {
            handleUpdateRowField(targetRowId, 'suggestedCategoryId', newCat.id);
            handleUpdateRowField(targetRowId, 'suggestedCategoryName', newCat.name);
          }
          setQuickAddType(null);
          setTargetRowId(null);
        }}
      />

      {/* Inline Quick Add Account Modal */}
      <QuickAddAccountModal
        isOpen={quickAddType === 'account'}
        baseCurrency={baseCurrency}
        onClose={() => {
          setQuickAddType(null);
          setTargetRowId(null);
        }}
        onCreated={(newAcc) => {
          if (targetRowId) {
            handleUpdateRowField(targetRowId, 'suggestedAccountId', newAcc.id);
            handleUpdateRowField(targetRowId, 'suggestedAccountName', newAcc.name);
          }
          setQuickAddType(null);
          setTargetRowId(null);
        }}
      />
    </div>
  );
};
