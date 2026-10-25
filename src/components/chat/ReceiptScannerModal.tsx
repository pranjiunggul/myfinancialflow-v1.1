import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import {
  X,
  Camera,
  Upload,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Sparkles,
  ArrowLeftRight,
  TrendingDown,
  TrendingUp,
  Cpu,
  Plus,
  Layers,
} from 'lucide-react';
import { scanReceiptImage, scanReceiptWithAI, createProposalFromOCR } from '../../services/ocr';
import type {
  OCRScanResult,
  ActionProposal,
  Account,
  Category,
  CurrencyCode,
  AppSettings,
  TransactionType,
} from '../../types';
import { QuickAddCategoryModal } from '../shared/QuickAddCategoryModal';
import { QuickAddAccountModal } from '../shared/QuickAddAccountModal';

interface ReceiptScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: Account[];
  categories: Category[];
  baseCurrency: CurrencyCode;
  settings?: AppSettings | null;
  masterPin?: string;
  initialFile?: File | Blob | null;
  onProposalGenerated: (proposal: ActionProposal) => void;
  onSwitchToBulkHistory?: () => void;
}

export const ReceiptScannerModal: React.FC<ReceiptScannerModalProps> = ({
  isOpen,
  onClose,
  accounts,
  categories,
  baseCurrency,
  settings,
  masterPin,
  initialFile,
  onProposalGenerated,
  onSwitchToBulkHistory,
}) => {
  const liveSettings = useLiveQuery(() => db.settings.get('current'));
  const effectiveSettings = settings || liveSettings;

  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [scannedDataUrl, setScannedDataUrl] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<OCRScanResult | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [activeEngine, setActiveEngine] = useState<'ai' | 'tesseract'>('ai');
  const [isAiAvailable, setIsAiAvailable] = useState(true);
  const [currentBlobFile, setCurrentBlobFile] = useState<Blob | null>(null);

  // Editable Form States for Interactive Review
  const [editType, setEditType] = useState<TransactionType>('expense');
  const [editAmount, setEditAmount] = useState<number | ''>('');
  const [editAccountId, setEditAccountId] = useState<string>('');
  const [editToAccountId, setEditToAccountId] = useState<string>('');
  const [editCategoryId, setEditCategoryId] = useState<string>('');
  const [editDate, setEditDate] = useState<string>('');
  const [editDescription, setEditDescription] = useState<string>('');
  const [editFee, setEditFee] = useState<number>(0);

  // Quick Add modal states
  const [isQuickAddCategoryOpen, setIsQuickAddCategoryOpen] = useState(false);
  const [isQuickAddAccountOpen, setIsQuickAddAccountOpen] = useState(false);
  const [isQuickAddToAccountOpen, setIsQuickAddToAccountOpen] = useState(false);

  const isLowConfidence = !!(
    scanResult?.isLowConfidence ||
    (scanResult && scanResult.confidence < 70) ||
    scanResult?.unparsedAmount ||
    !scanResult?.totalAmount ||
    (scanResult?.totalAmount !== undefined && scanResult.totalAmount <= 0)
  );

  // AI Vision is preconfigured and always ready out of the box
  useEffect(() => {
    setIsAiAvailable(true);
    setActiveEngine('ai');
  }, [effectiveSettings]);

  // Handle Initial File passed (e.g. from Clipboard Paste or Drag & Drop)
  useEffect(() => {
    if (isOpen && initialFile) {
      processFile(initialFile);
    }
  }, [isOpen, initialFile]);

  if (!isOpen) return null;

  const processFile = async (file: Blob, engineOverride?: 'ai' | 'tesseract') => {
    setCurrentBlobFile(file);
    setErrorMessage('');
    setScanResult(null);
    setIsScanning(true);
    setProgress(10);
    setStatusText('Membaca file gambar bukti transaksi...');

    const localUrl = URL.createObjectURL(file);
    setPreviewUrl(localUrl);

    try {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setScannedDataUrl(reader.result);
        }
      };
      reader.readAsDataURL(file);
    } catch {}

    const chosenEngine = engineOverride || activeEngine;

    try {
      let result: OCRScanResult | null = null;

      // Try AI Vision first if enabled and configured
      if (chosenEngine === 'ai' || isAiAvailable) {
        try {
          setProgress(30);
          setStatusText('Menganalisis bukti transaksi dengan AI Vision multimodal...');
          result = await scanReceiptWithAI(file, {
            accounts,
            categories,
            baseCurrency,
            settings: effectiveSettings || undefined,
            masterPin,
          });
        } catch (aiErr: any) {
          console.warn('AI Vision scan failed, falling back to local OCR:', aiErr);
        }
      }

      // Fallback to local OCR (Tesseract.js)
      if (!result) {
        setProgress(40);
        setStatusText('Memproses dengan OCR lokal perangkat...');
        result = await scanReceiptImage(file, (p, s) => {
          setProgress(p);
          setStatusText(s);
        });
      }

      setScanResult(result);

      // Auto-populate interactive editable verification form
      const proposal = createProposalFromOCR(result, accounts, categories, baseCurrency);
      setEditType((proposal.data.type as TransactionType) || 'expense');
      setEditAmount(proposal.data.amount && proposal.data.amount > 0 ? proposal.data.amount : '');
      setEditAccountId(proposal.data.accountId || accounts[0]?.id || '');
      setEditToAccountId(proposal.data.transferMeta?.toAccountId || '');
      setEditCategoryId(proposal.data.categoryId || categories[0]?.id || '');
      setEditDate(proposal.data.date || new Date().toISOString().split('T')[0]);
      setEditDescription(proposal.data.description || result.merchantName || 'Transaksi');
      setEditFee(proposal.data.transferMeta?.feeAmount || result.feeAmount || 0);
    } catch (err: any) {
      setErrorMessage(
        err.message || 'Gagal mengenali transaksi dari gambar. Coba ambil foto lebih jelas atau input manual.'
      );
    } finally {
      setIsScanning(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleEnableManualEntry = () => {
    // Open verification form with default values so user isn't blocked
    setEditType('expense');
    setEditAmount(0);
    setEditAccountId(accounts[0]?.id || '');
    setEditCategoryId(categories[0]?.id || '');
    setEditDate(new Date().toISOString().split('T')[0]);
    setEditDescription('Transaksi Rekening');
    setScanResult({
      rawText: 'Input Manual dari Bukti',
      confidence: 100,
      imageHash: 'manual_' + Date.now(),
      totalAmount: 0,
      date: new Date().toISOString().split('T')[0],
      merchantName: 'Transaksi Rekening',
    });
    setErrorMessage('');
  };

  const handleCommitProposal = () => {
    const finalAmountNum = typeof editAmount === 'number' ? editAmount : parseFloat(String(editAmount)) || 0;
    if (!finalAmountNum || finalAmountNum <= 0) {
      setErrorMessage('Nominal transaksi wajib diisi dan harus lebih dari 0.');
      return;
    }

    const selectedAcc = accounts.find((a) => a.id === editAccountId) || accounts[0];
    const selectedDestAcc = accounts.find((a) => a.id === editToAccountId);
    const selectedCat = categories.find((c) => c.id === editCategoryId) || categories[0];
    const currency = selectedAcc?.currency || baseCurrency;

    let summary = '';
    if (editType === 'transfer' && selectedDestAcc) {
      summary = `[Transfer Antar Rekening] Transfer ${finalAmountNum.toLocaleString()} ${currency} dari "${selectedAcc?.name}" ke "${selectedDestAcc.name}"`;
    } else if (editType === 'income') {
      summary = `[Pemasukan Rekening] Terima ${finalAmountNum.toLocaleString()} ${currency} di "${selectedAcc?.name}" dari "${editDescription}"`;
    } else {
      summary = `[Bukti Transaksi] Catat pengeluaran ${finalAmountNum.toLocaleString()} ${currency} untuk "${editDescription}" (${editDate})`;
    }

    const proposalData: any = {
      type: editType,
      amount: finalAmountNum,
      currency,
      description: editDescription,
      accountId: selectedAcc?.id,
      accountName: selectedAcc?.name,
      categoryId: selectedCat?.id,
      categoryName: selectedCat?.name,
      date: editDate,
      receiptHash: scanResult?.imageHash,
      receiptDataUrl: scannedDataUrl || undefined,
      inputSource: 'ocr',
    };

    if (editType === 'transfer' && selectedDestAcc) {
      proposalData.transferMeta = {
        toAccountId: selectedDestAcc.id,
        toAmount: editAmount,
        toCurrency: selectedDestAcc.currency || currency,
        feeAmount: editFee || 0,
      };
    }

    const finalProposal: ActionProposal = {
      id: 'prop_ocr_' + crypto.randomUUID().slice(0, 8),
      type: 'create',
      status: 'pending',
      summary,
      data: proposalData,
      createdAt: Date.now(),
    };

    onProposalGenerated(finalProposal);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-2xl bg-indigo-500/10 text-indigo-400">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center space-x-2">
                <span>Pindai Bukti Transaksi & Struk</span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Mengenali bukti transfer bank (BCA, Mandiri, BRI, BNI), QRIS, e-wallet & nota belanja
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

        {/* Engine Switcher Bar */}
        <div className="px-5 py-2.5 bg-slate-950/50 border-b border-slate-800/80 flex items-center justify-between text-xs">
          <span className="text-slate-400 font-medium">Mode Pemindaian:</span>
          <div className="flex items-center space-x-1.5">
            <button
              type="button"
              onClick={() => {
                setActiveEngine('ai');
                if (currentBlobFile && isAiAvailable) {
                  processFile(currentBlobFile, 'ai');
                }
              }}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg font-medium transition ${
                activeEngine === 'ai'
                  ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>AI Vision Multimodal</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveEngine('tesseract');
                if (currentBlobFile) {
                  processFile(currentBlobFile, 'tesseract');
                }
              }}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg font-medium transition ${
                activeEngine === 'tesseract'
                  ? 'bg-slate-800 text-slate-200 border border-slate-700'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Cpu className="w-3.5 h-3.5 text-slate-400" />
              <span>Offline OCR (Lokal)</span>
            </button>

            {onSwitchToBulkHistory && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onSwitchToBulkHistory();
                }}
                className="flex items-center space-x-1 px-2.5 py-1 rounded-lg font-medium text-sky-400 hover:text-sky-300 hover:bg-sky-500/10 border border-sky-500/20 transition ml-1"
                title="Beralih ke pemindaian riwayat mutasi / banyak baris"
              >
                <Layers className="w-3.5 h-3.5 text-sky-400" />
                <span>Multi-Baris Riwayat</span>
              </button>
            )}
          </div>
        </div>

        {/* Body Content */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
          {/* Multimodal AI Vision Active Status Banner */}
          <div className="p-3 rounded-2xl bg-indigo-950/40 border border-indigo-500/30 text-indigo-200 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
              <span className="font-semibold text-xs text-indigo-200">
                Multimodal AI Vision Aktif (Gemini Flash) &bull; Akurasi 99%
              </span>
            </div>
            <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2.5 py-0.5 rounded-full font-semibold border border-indigo-500/30">
              Siap Pakai
            </span>
          </div>
          {/* File Upload Zone */}
          {!previewUrl && (
            <label className="border-2 border-dashed border-slate-700 hover:border-indigo-500 rounded-3xl p-8 flex flex-col items-center justify-center space-y-3 cursor-pointer transition bg-slate-950/40">
              <div className="p-4 rounded-2xl bg-indigo-500/10 text-indigo-400">
                <Upload className="w-8 h-8" />
              </div>
              <div className="text-center">
                <span className="font-bold text-white text-sm block">Unggah Bukti Transfer / Rekening</span>
                <span className="text-slate-400 text-xs block mt-1">
                  Mendukung screenshot m-banking, struk belanja, atau slip transfer (PNG, JPG, WebP)
                </span>
                <span className="text-[11px] text-indigo-400/90 block mt-2">
                  💡 Tips: Anda juga bisa langsung tekan <kbd className="px-1.5 py-0.5 bg-slate-800 rounded font-mono">Ctrl+V</kbd> untuk paste gambar
                </span>
              </div>
              <input type="file" accept="image/*" capture="environment" onChange={handleFileChange} className="hidden" />
            </label>
          )}

          {/* Image Preview & Progress */}
          {previewUrl && (
            <div className="space-y-3">
              <div className="relative rounded-2xl overflow-hidden border border-slate-800 max-h-52 bg-slate-950 flex items-center justify-center">
                <img src={previewUrl} alt="Preview Bukti Transaksi" className="max-h-52 object-contain" />
                {scanResult?.engineUsed && (
                  <div className="absolute top-2 right-2 px-2.5 py-1 rounded-full bg-slate-900/90 border border-slate-700 text-[10px] font-semibold text-slate-300 shadow flex items-center space-x-1 backdrop-blur-md">
                    {scanResult.engineUsed === 'ai_vision' ? (
                      <>
                        <Sparkles className="w-3 h-3 text-indigo-400" />
                        <span>AI Vision ({scanResult.confidence}%)</span>
                      </>
                    ) : (
                      <>
                        <Cpu className="w-3 h-3 text-emerald-400" />
                        <span>Offline OCR ({scanResult.confidence}%)</span>
                      </>
                    )}
                  </div>
                )}
              </div>

              {isScanning && (
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center space-x-2 text-indigo-400 font-semibold">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>{statusText}</span>
                    </span>
                    <span className="font-mono text-slate-400">{progress}%</span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-indigo-600 h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {errorMessage && (
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 space-y-2">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                <span className="font-semibold">{errorMessage}</span>
              </div>
              <p className="text-[11px] text-rose-300/80">
                Jangan khawatir, Anda tetap bisa memasukkan rincian transaksi secara manual sambil melihat preview foto di atas.
              </p>
              <button
                type="button"
                onClick={handleEnableManualEntry}
                className="mt-1 px-3 py-1.5 bg-rose-600/30 hover:bg-rose-600/40 border border-rose-500/40 rounded-xl text-rose-200 font-semibold text-xs transition"
              >
                ✏️ Isi Rincian Manual dari Foto Ini
              </button>
            </div>
          )}

          {/* Interactive Editable Verification Card */}
          {scanResult && (
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    {isLowConfidence ? (
                      <div className="flex items-center space-x-1.5 text-amber-400 font-bold">
                        <AlertTriangle className="w-4 h-4 text-amber-400" />
                        <span>Perlu Verifikasi Manual ({scanResult.confidence}%)</span>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-1.5 text-emerald-400 font-bold">
                        <CheckCircle className="w-4 h-4" />
                        <span>Rincian Transaksi Dikenali ({scanResult.confidence}%)</span>
                      </div>
                    )}
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                      scanResult.engineUsed === 'ai_vision'
                        ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                        : 'bg-slate-800 text-slate-300 border-slate-700'
                    }`}>
                      {scanResult.engineUsed === 'ai_vision' ? '✨ Multimodal AI Vision' : 'Tesseract OCR'}
                    </span>
                  </div>
                  {scanResult.isDuplicate && (
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center space-x-1">
                      <AlertTriangle className="w-3 h-3" />
                      <span>Kemungkinan Bukti Duplikat</span>
                    </span>
                  )}
                </div>

                {(!scanResult.totalAmount || scanResult.totalAmount <= 0) && (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center space-x-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                    <span>⚠️ Nominal total tidak terdeteksi otomatis dari gambar. Silakan periksa dan masukkan nominal pada kolom di bawah.</span>
                  </div>
                )}

                {scanResult.isDuplicate && (
                  <p className="text-amber-400/90 text-[11px] bg-amber-500/10 p-2.5 rounded-xl border border-amber-500/20">
                    ⚠️ Foto bukti transaksi ini memiliki sidik jari identik dengan transaksi yang sudah dicatat sebelumnya. Periksa kembali untuk mencegah pencatatan ganda.
                  </p>
                )}

                {/* Transaction Type Selector */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
                    Tipe Transaksi
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setEditType('expense')}
                      className={`py-2 px-2 rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 transition ${
                        editType === 'expense'
                          ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/30'
                          : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                      }`}
                    >
                      <TrendingDown className="w-3.5 h-3.5" />
                      <span>Pengeluaran</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setEditType('income')}
                      className={`py-2 px-2 rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 transition ${
                        editType === 'income'
                          ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                          : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                      }`}
                    >
                      <TrendingUp className="w-3.5 h-3.5" />
                      <span>Pemasukan</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setEditType('transfer')}
                      className={`py-2 px-2 rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 transition ${
                        editType === 'transfer'
                          ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30'
                          : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                      }`}
                    >
                      <ArrowLeftRight className="w-3.5 h-3.5" />
                      <span>Transfer Antar Rek</span>
                    </button>
                  </div>
                </div>

                {/* Form Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  {/* Nominal Amount */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-slate-400 font-semibold block text-[11px]">
                        Nominal Transaksi ({baseCurrency})
                      </label>
                      {(!editAmount || Number(editAmount) <= 0) && (
                        <span className="text-[10px] text-amber-400 font-bold flex items-center space-x-1">
                          <AlertTriangle className="w-3 h-3" />
                          <span>Wajib Diisi</span>
                        </span>
                      )}
                    </div>
                    <input
                      type="number"
                      value={editAmount}
                      onChange={(e) => setEditAmount(e.target.value === '' ? '' : parseFloat(e.target.value) || '')}
                      placeholder="0 (Wajib masukkan nominal)"
                      className={`w-full px-3 py-2 bg-slate-900 border rounded-xl text-white font-mono font-bold text-sm focus:outline-none focus:ring-2 ${
                        !editAmount || Number(editAmount) <= 0
                          ? 'border-amber-500/80 ring-1 ring-amber-500/50 bg-amber-500/5'
                          : 'border-slate-700/80 focus:ring-indigo-500'
                      }`}
                    />
                    {typeof editAmount === 'number' && editAmount > 0 && (
                      <span className="text-[10px] text-emerald-400 font-mono block">
                        = Rp {editAmount.toLocaleString('id-ID')}
                      </span>
                    )}
                  </div>

                {/* Date */}
                <div className="space-y-1">
                  <label className="text-slate-400 font-semibold block text-[11px]">Tanggal Transaksi</label>
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-xl text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* Source Account (Dari Rekening) */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-slate-400 font-semibold block text-[11px]">
                      {editType === 'income' ? 'Rekening Tujuan (Masuk ke)' : 'Rekening Sumber (Dari)'}
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsQuickAddAccountOpen(true)}
                      className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold flex items-center space-x-0.5"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Tambah</span>
                    </button>
                  </div>
                  <select
                    value={editAccountId}
                    onChange={(e) => {
                      if (e.target.value === '__new_account__') {
                        setIsQuickAddAccountOpen(true);
                      } else {
                        setEditAccountId(e.target.value);
                      }
                    }}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-xl text-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({acc.currency})
                      </option>
                    ))}
                    <option value="__new_account__">+ Tambah Rekening Baru...</option>
                  </select>
                </div>

                {/* If Transfer: Destination Account */}
                {editType === 'transfer' ? (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-slate-400 font-semibold block text-[11px]">Ke Rekening (Tujuan)</label>
                      <button
                        type="button"
                        onClick={() => setIsQuickAddToAccountOpen(true)}
                        className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold flex items-center space-x-0.5"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Tambah</span>
                      </button>
                    </div>
                    <select
                      value={editToAccountId}
                      onChange={(e) => {
                        if (e.target.value === '__new_account__') {
                          setIsQuickAddToAccountOpen(true);
                        } else {
                          setEditToAccountId(e.target.value);
                        }
                      }}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-xl text-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">Pilih Rekening Tujuan...</option>
                      {accounts
                        .filter((a) => a.id !== editAccountId)
                        .map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.name} ({acc.currency})
                          </option>
                        ))}
                      <option value="__new_account__">+ Tambah Rekening Baru...</option>
                    </select>
                  </div>
                ) : (
                  /* Category */
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-slate-400 font-semibold block text-[11px]">Kategori</label>
                      <button
                        type="button"
                        onClick={() => setIsQuickAddCategoryOpen(true)}
                        className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold flex items-center space-x-0.5"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Tambah</span>
                      </button>
                    </div>
                    <select
                      value={editCategoryId}
                      onChange={(e) => {
                        if (e.target.value === '__new_category__') {
                          setIsQuickAddCategoryOpen(true);
                        } else {
                          setEditCategoryId(e.target.value);
                        }
                      }}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-xl text-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      {categories
                        .filter((c) =>
                          editType === 'income'
                            ? c.type === 'income' || c.type === 'both'
                            : c.type === 'expense' || c.type === 'both'
                        )
                        .map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.name}
                          </option>
                        ))}
                      <option value="__new_category__">+ Tambah Kategori Baru...</option>
                    </select>
                  </div>
                )}

                {/* Description / Merchant / Recipient */}
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-slate-400 font-semibold block text-[11px]">
                    Keterangan / Penerima / Toko
                  </label>
                  <input
                    type="text"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder="Contoh: Transfer ke Budi / Kopi Kenangan"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-xl text-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* Admin / Transfer Fee (if any) */}
                {(editType === 'transfer' || editFee > 0) && (
                  <div className="space-y-1">
                    <label className="text-slate-400 font-semibold block text-[11px]">
                      Biaya Admin / Transfer (Opsional)
                    </label>
                    <input
                      type="number"
                      value={editFee || ''}
                      onChange={(e) => setEditFee(parseFloat(e.target.value) || 0)}
                      placeholder="0"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-xl text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                )}
              </div>

              {/* Raw Extracted Dump (Collapsible) */}
              {scanResult.rawText && (
                <details className="text-[11px] text-slate-500 pt-1">
                  <summary className="cursor-pointer hover:text-slate-400">Lihat Teks Asli Hasil Pemindaian</summary>
                  <pre className="mt-2 p-2.5 bg-slate-900/90 rounded-xl text-[10px] overflow-x-auto whitespace-pre-wrap max-h-28 border border-slate-800">
                    {scanResult.rawText}
                  </pre>
                </details>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950/90 border-t border-slate-800 flex items-center justify-between">
          {previewUrl && !isScanning ? (
            <label className="text-xs text-indigo-400 hover:text-indigo-300 font-medium cursor-pointer transition">
              Ganti Gambar
              <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
            </label>
          ) : (
            <div />
          )}

          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
            >
              Batal
            </button>

            {scanResult && (
              <button
                onClick={handleCommitProposal}
                className="flex items-center space-x-1.5 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-600/30 transition"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Buat Proposal Transaksi</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Inline Quick Add Category Modal */}
      <QuickAddCategoryModal
        isOpen={isQuickAddCategoryOpen}
        onClose={() => setIsQuickAddCategoryOpen(false)}
        initialType={editType === 'income' ? 'income' : 'expense'}
        onCreated={(newCat) => {
          setEditCategoryId(newCat.id);
        }}
      />

      {/* Inline Quick Add Source Account Modal */}
      <QuickAddAccountModal
        isOpen={isQuickAddAccountOpen}
        onClose={() => setIsQuickAddAccountOpen(false)}
        baseCurrency={baseCurrency}
        onCreated={(newAcc) => {
          setEditAccountId(newAcc.id);
        }}
      />

      {/* Inline Quick Add Destination Account Modal */}
      <QuickAddAccountModal
        isOpen={isQuickAddToAccountOpen}
        onClose={() => setIsQuickAddToAccountOpen(false)}
        baseCurrency={baseCurrency}
        onCreated={(newAcc) => {
          setEditToAccountId(newAcc.id);
        }}
      />
    </div>
  );
};
