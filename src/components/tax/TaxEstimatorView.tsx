import React, { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Receipt,
  AlertTriangle,
  Settings,
  Download,
  Printer,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  ExternalLink,
  Plus,
  HelpCircle,
  TrendingDown,
  TrendingUp,
  Scale,
  Calendar,
} from 'lucide-react';
import { db } from '../../db/database';
import {
  calculateAnnualPPh,
  getTaxSettings,
  updateTaxSettings,
  DEFAULT_PTKP_VALUES,
  DEFAULT_TAX_BRACKETS,
  PPH_PERSISTENT_DISCLAIMER_TEXT_ID,
  generateTaxWorksheetCsv,
  generateTaxWorksheetPrintableHtml,
} from '../../services/tax';
import type {
  Transaction,
  CurrencyCode,
  TaxBracketConfig,
} from '../../types';
import { formatCurrency } from '../../services/fx';

interface TaxEstimatorViewProps {
  baseCurrency: CurrencyCode;
  onEditTransaction?: (tx: Transaction) => void;
  onOpenNewTransactionModal?: () => void;
}

export const TaxEstimatorView: React.FC<TaxEstimatorViewProps> = ({
  baseCurrency,
  onEditTransaction,
  onOpenNewTransactionModal,
}) => {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  // Settings state
  const [ptkpStatus, setPtkpStatus] = useState<string>('TK/0');
  const [customPtkpStr, setCustomPtkpStr] = useState<string>('');
  const [otherGrossStr, setOtherGrossStr] = useState<string>('0');
  const [otherWithheldStr, setOtherWithheldStr] = useState<string>('0');
  const [brackets, setBrackets] = useState<TaxBracketConfig[]>([...DEFAULT_TAX_BRACKETS]);
  const [isSavingSettings, setIsSavingSettings] = useState<boolean>(false);

  // Live query for transactions
  const allTransactions = useLiveQuery(() => db.transactions.toArray(), []) || [];

  // Load saved settings from DB on mount
  useEffect(() => {
    async function loadSettings() {
      const saved = await getTaxSettings();
      setPtkpStatus(saved.selectedPtkpStatus || 'TK/0');
      setCustomPtkpStr(saved.customPtkpAmount !== undefined ? saved.customPtkpAmount.toString() : '');
      setOtherGrossStr(saved.otherExternalGrossIncome ? saved.otherExternalGrossIncome.toString() : '0');
      setOtherWithheldStr(saved.otherExternalTaxWithheld ? saved.otherExternalTaxWithheld.toString() : '0');
      setBrackets(saved.brackets && saved.brackets.length > 0 ? saved.brackets : [...DEFAULT_TAX_BRACKETS]);
    }
    loadSettings();
  }, []);

  // Save modified settings
  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    try {
      const customPtkp = customPtkpStr.trim() !== '' ? parseFloat(customPtkpStr) : undefined;
      const otherGross = parseFloat(otherGrossStr) || 0;
      const otherWithheld = parseFloat(otherWithheldStr) || 0;

      await updateTaxSettings({
        selectedPtkpStatus: ptkpStatus,
        customPtkpAmount: customPtkp,
        otherExternalGrossIncome: otherGross,
        otherExternalTaxWithheld: otherWithheld,
        brackets,
      });
    } catch (err) {
      console.warn('Failed to save tax settings:', err);
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleResetBracketsToDefaults = () => {
    setBrackets([...DEFAULT_TAX_BRACKETS]);
  };

  // Perform core calculation
  const calcResult = useMemo(() => {
    const customPtkp = customPtkpStr.trim() !== '' ? parseFloat(customPtkpStr) : undefined;
    const otherGross = parseFloat(otherGrossStr) || 0;
    const otherWithheld = parseFloat(otherWithheldStr) || 0;

    return calculateAnnualPPh(allTransactions, selectedYear, {
      selectedPtkpStatus: ptkpStatus,
      customPtkpAmount: customPtkp,
      otherExternalGrossIncome: otherGross,
      otherExternalTaxWithheld: otherWithheld,
      brackets,
    });
  }, [allTransactions, selectedYear, ptkpStatus, customPtkpStr, otherGrossStr, otherWithheldStr, brackets]);

  // Contributing transactions
  const yearPrefix = `${selectedYear}-`;
  const relevantTransactions = useMemo(() => {
    return allTransactions.filter(
      (tx) =>
        !tx.isDeleted &&
        tx.type === 'income' &&
        tx.date.startsWith(yearPrefix) &&
        (tx.taxTreatment === 'withheld_at_source' || tx.taxTreatment === 'needs_self_calculation')
    );
  }, [allTransactions, yearPrefix]);

  // CSV Export
  const handleExportCsv = () => {
    const csvContent = generateTaxWorksheetCsv(calcResult, allTransactions);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Lembar_Kerja_PPh_${selectedYear}_MyFinancialFlow.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Print / HTML View
  const handlePrintHtml = () => {
    const htmlContent = generateTaxWorksheetPrintableHtml(calcResult, allTransactions);
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
      }, 300);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* 1. Header with Year Selector & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <div className="p-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">Estimator PPh Pribadi (PPh 21 / OP)</h1>
              <p className="text-xs text-slate-400">Alat perencanaan arus kas & simulasi pajak tahunan pribadi</p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2.5">
          {/* Year selector */}
          <div className="flex items-center space-x-1.5 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-300">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-semibold text-slate-400">Tahun:</span>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
              className="bg-transparent font-bold text-white focus:outline-none cursor-pointer"
            >
              {[currentYear + 1, currentYear, currentYear - 1, currentYear - 2].map((yr) => (
                <option key={yr} value={yr} className="bg-slate-900 text-white">
                  {yr}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={handleExportCsv}
            className="flex items-center space-x-1 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition"
            title="Download CSV Worksheet"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Ekspor CSV</span>
          </button>

          <button
            type="button"
            onClick={handlePrintHtml}
            className="flex items-center space-x-1 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition"
            title="Cetak atau simpan lembar kerja sebagai PDF"
          >
            <Printer className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Cetak / PDF</span>
          </button>
        </div>
      </div>

      {/* 2. Persistent Mandatory Disclaimer Banner (Non-Negotiable) */}
      <div className="p-4 bg-amber-950/30 border border-amber-500/40 rounded-2xl space-y-2 text-xs text-amber-200/95 leading-relaxed shadow-lg shadow-amber-950/20">
        <div className="flex items-center space-x-2 font-bold text-amber-300">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>Disclaimer & Batasan Estimasi Pajak Pribadi:</span>
        </div>
        <p>
          {PPH_PERSISTENT_DISCLAIMER_TEXT_ID}
        </p>
        <div className="text-[11px] text-amber-300/80 pt-1 border-t border-amber-500/20 flex flex-wrap items-center justify-between gap-2">
          <span>
            💡 <strong>Penting:</strong> PTKP berlaku 1x untuk total penghasilan. Jika Anda memiliki gaji kantor, masukkan pada kolom <em>"Penghasilan Lain"</em> di pengaturan di bawah agar PTKP tidak terpotong ganda.
          </span>
          <a
            href="https://pajak.go.id"
            target="_blank"
            rel="noreferrer"
            className="text-blue-400 hover:text-blue-300 underline font-semibold flex items-center gap-1 shrink-0"
          >
            Portal Resmi DJP (pajak.go.id) <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* 3. Summary Dashboard Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Gross Taxable Income */}
        <div className="p-4 bg-slate-900/60 border border-slate-800/80 rounded-2xl space-y-1">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
            Total Penghasilan Bruto
          </span>
          <div className="text-xl sm:text-2xl font-black text-white font-mono tracking-tight">
            {formatCurrency(calcResult.totalGrossTaxableIncome, baseCurrency)}
          </div>
          <div className="text-[10px] text-slate-400 truncate">
            Aplikasi: {formatCurrency(calcResult.flaggedGrossIncome, baseCurrency)} | Gaji: {formatCurrency(calcResult.otherExternalGrossIncome, baseCurrency)}
          </div>
        </div>

        {/* PKP */}
        <div className="p-4 bg-slate-900/60 border border-slate-800/80 rounded-2xl space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Penghasilan Kena Pajak (PKP)
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
              {calcResult.ptkpStatus}
            </span>
          </div>
          <div className="text-xl sm:text-2xl font-black text-indigo-400 font-mono tracking-tight">
            {formatCurrency(calcResult.pkp, baseCurrency)}
          </div>
          <div className="text-[10px] text-slate-400 truncate">
            PTKP ({calcResult.ptkpStatus}): -{formatCurrency(calcResult.ptkpAmount, baseCurrency)}
          </div>
        </div>

        {/* PPh Terutang */}
        <div className="p-4 bg-slate-900/60 border border-slate-800/80 rounded-2xl space-y-1">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
            Estimasi PPh Terutang
          </span>
          <div className="text-xl sm:text-2xl font-black text-white font-mono tracking-tight">
            {formatCurrency(calcResult.totalPPhTerutang, baseCurrency)}
          </div>
          <div className="text-[10px] text-slate-400 truncate">
            Kredit Pajak (Dipotong): -{formatCurrency(calcResult.totalTaxCredits, baseCurrency)}
          </div>
        </div>

        {/* Final Position */}
        <div
          className={`p-4 rounded-2xl border space-y-1 ${
            calcResult.status === 'kurang_bayar'
              ? 'bg-rose-950/20 border-rose-900/40 text-rose-300'
              : calcResult.status === 'lebih_bayar'
              ? 'bg-emerald-950/20 border-emerald-900/40 text-emerald-300'
              : 'bg-slate-900/60 border-slate-800 text-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider block">
              {calcResult.status === 'kurang_bayar'
                ? 'Kurang Bayar'
                : calcResult.status === 'lebih_bayar'
                ? 'Lebih Bayar'
                : 'Posisi Nihil'}
            </span>
            {calcResult.status === 'kurang_bayar' ? (
              <TrendingUp className="w-4 h-4 text-rose-400" />
            ) : calcResult.status === 'lebih_bayar' ? (
              <TrendingDown className="w-4 h-4 text-emerald-400" />
            ) : (
              <Scale className="w-4 h-4 text-slate-400" />
            )}
          </div>
          <div className="text-xl sm:text-2xl font-black font-mono tracking-tight">
            {formatCurrency(Math.abs(calcResult.estimatedBalance), baseCurrency)}
          </div>
          <div className="text-[10px] opacity-80 truncate">
            {calcResult.status === 'kurang_bayar'
              ? 'Perlu disisihkan untuk bayar SPT'
              : calcResult.status === 'lebih_bayar'
              ? 'Potensi lebih potong pajak'
              : 'Pajak terutang lunas'}
          </div>
        </div>
      </div>

      {/* 4. Progressive Tax Bracket Breakdown Table (Transparency) */}
      <div className="p-5 bg-slate-900/40 border border-slate-800/80 rounded-3xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Receipt className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-bold text-white">Rincian Perhitungan Tarif Progresif (UU HPP)</h3>
          </div>
          <span className="text-xs text-slate-400">Dasar Pengenaan: PKP {formatCurrency(calcResult.pkp, baseCurrency)}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-2.5 px-3 font-semibold">Lapisan Penghasilan Kena Pajak</th>
                <th className="py-2.5 px-3 font-semibold text-right">Tarif</th>
                <th className="py-2.5 px-3 font-semibold text-right">Dasar Pajak di Lapisan Ini</th>
                <th className="py-2.5 px-3 font-semibold text-right">Pajak Dikenakan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {calcResult.bracketsBreakdown.map((b) => (
                <tr key={b.bracketId} className={b.taxableAmountInBracket > 0 ? 'bg-indigo-500/5' : ''}>
                  <td className="py-2.5 px-3 font-medium text-slate-200">{b.label}</td>
                  <td className="py-2.5 px-3 text-right font-mono text-slate-300 font-bold">{b.rate * 100}%</td>
                  <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                    {formatCurrency(b.taxableAmountInBracket, baseCurrency)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-400">
                    {formatCurrency(b.taxAmountInBracket, baseCurrency)}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-slate-700 bg-slate-900/60 font-bold">
                <td className="py-3 px-3 text-white" colSpan={3}>
                  Total Estimasi PPh Terutang (Pasal 17 UU HPP)
                </td>
                <td className="py-3 px-3 text-right font-mono text-base text-white">
                  {formatCurrency(calcResult.totalPPhTerutang, baseCurrency)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. Configurable Settings Accordion (PTKP, External Salary, Progressive Brackets) */}
      <div className="bg-slate-900/40 border border-slate-800/80 rounded-3xl overflow-hidden transition">
        <button
          type="button"
          onClick={() => setIsSettingsOpen(!isSettingsOpen)}
          className="w-full p-4 sm:p-5 flex items-center justify-between text-left hover:bg-slate-800/30 transition"
        >
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-slate-800 text-slate-300">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-bold text-white">Pengaturan Parameter Pajak (Dapat Disesuaikan)</h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-medium">
                  PTKP & Tarif
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Atur status PTKP, penghasilan luar (gaji kantor), dan sesuaikan batas lapisan tarif progresif
              </p>
            </div>
          </div>
          <div className="text-slate-400">
            {isSettingsOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </div>
        </button>

        {isSettingsOpen && (
          <div className="p-5 border-t border-slate-800/80 space-y-6 bg-slate-950/40">
            {/* PTKP Selector & Override */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-300">
                  Status PTKP (Penghasilan Tidak Kena Pajak)
                </label>
                <select
                  value={ptkpStatus}
                  onChange={(e) => {
                    setPtkpStatus(e.target.value);
                    setCustomPtkpStr('');
                  }}
                  className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs font-semibold focus:outline-none"
                >
                  {Object.entries(DEFAULT_PTKP_VALUES).map(([code, item]) => (
                    <option key={code} value={code}>
                      {item.label} — {item.description}
                    </option>
                  ))}
                </select>
                <span className="text-[11px] text-slate-400 block">
                  Nilai standar 2026 (UU HPP / PMK 101): Rp {DEFAULT_PTKP_VALUES[ptkpStatus]?.amount.toLocaleString('id-ID')} / tahun.
                </span>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-300">
                  Kustomisasi Nominal PTKP (Override Manual)
                </label>
                <input
                  type="number"
                  step="any"
                  value={customPtkpStr}
                  onChange={(e) => setCustomPtkpStr(e.target.value)}
                  placeholder={`Default: ${DEFAULT_PTKP_VALUES[ptkpStatus]?.amount}`}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white font-mono text-sm"
                />
                <span className="text-[11px] text-slate-400 block">
                  Isi jika terdapat ketentuan khusus atau DJP mengubah besaran PTKP di masa mendatang.
                </span>
              </div>
            </div>

            {/* External Income & Withheld Tax (Addressing Single-PTKP Rule) */}
            <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-3">
              <div className="flex items-center space-x-2 text-xs font-bold text-indigo-300">
                <HelpCircle className="w-4 h-4 text-indigo-400" />
                <span>Penghasilan & Pajak Lain yang Sudah Diperhitungkan (Gaji Kantor / Pemberi Kerja)</span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                Secara hukum, PTKP hanya berlaku 1 kali untuk total semua penghasilan. Jika Anda memiliki gaji kantor, isi nominal tahunannya di sini agar estimasi pajak gabungan tidak terpotong PTKP dua kali.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Gaji / Penghasilan Bruto Eksternal Tahunan ({baseCurrency})
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={otherGrossStr}
                    onChange={(e) => setOtherGrossStr(e.target.value)}
                    placeholder="Contoh: 120000000"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white font-mono text-sm"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Diambil dari Bukti Potong 1721-A1 (Penghasilan Bruto)
                  </span>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    PPh 21 yang Sudah Dipotong Kantor ({baseCurrency})
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={otherWithheldStr}
                    onChange={(e) => setOtherWithheldStr(e.target.value)}
                    placeholder="Contoh: 3300000"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white font-mono text-sm"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Diambil dari Bukti Potong 1721-A1 (PPh 21 Terutang & Dilunasi)
                  </span>
                </div>
              </div>
            </div>

            {/* Progressive Bracket Editor */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">Tabel Lapisan Tarif Progresif</h4>
                  <p className="text-[11px] text-slate-400">Sesuaikan batas nominal atau persentase tarif jika aturan berubah</p>
                </div>
                <button
                  type="button"
                  onClick={handleResetBracketsToDefaults}
                  className="flex items-center space-x-1 text-xs text-indigo-400 hover:text-indigo-300 font-semibold"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Reset ke Standar UU HPP</span>
                </button>
              </div>

              <div className="space-y-2">
                {brackets.map((b, index) => (
                  <div key={b.id} className="grid grid-cols-12 gap-2 items-center bg-slate-900/80 p-2.5 rounded-xl border border-slate-800 text-xs">
                    <div className="col-span-5 sm:col-span-6 font-semibold text-slate-300 truncate">
                      {b.label}
                    </div>
                    <div className="col-span-4 sm:col-span-4 flex items-center space-x-1.5">
                      <span className="text-slate-400 text-[11px]">s.d. Rp</span>
                      <input
                        type="number"
                        step="any"
                        value={b.upTo !== null ? b.upTo : ''}
                        disabled={b.upTo === null}
                        placeholder={b.upTo === null ? 'Diatasnya' : 'Batas'}
                        onChange={(e) => {
                          const val = e.target.value.trim() !== '' ? parseFloat(e.target.value) : null;
                          const next = [...brackets];
                          next[index] = { ...next[index], upTo: val };
                          setBrackets(next);
                        }}
                        className="w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded text-right font-mono text-white text-xs disabled:opacity-50"
                      />
                    </div>
                    <div className="col-span-3 sm:col-span-2 flex items-center space-x-1">
                      <input
                        type="number"
                        step="1"
                        min="0"
                        max="100"
                        value={Math.round(b.rate * 100)}
                        onChange={(e) => {
                          const val = (parseFloat(e.target.value) || 0) / 100;
                          const next = [...brackets];
                          next[index] = { ...next[index], rate: val };
                          setBrackets(next);
                        }}
                        className="w-14 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-right font-mono text-white font-bold text-xs"
                      />
                      <span className="text-slate-400 font-bold">%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={handleSaveSettings}
                disabled={isSavingSettings}
                className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-bold text-xs rounded-xl shadow-lg transition flex items-center space-x-2"
              >
                {isSavingSettings ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <span>Simpan Perubahan Pengaturan</span>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 6. Contributing Income Transactions Table */}
      <div className="p-5 bg-slate-900/40 border border-slate-800/80 rounded-3xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <span>Transaksi Penghasilan Terkait ({relevantTransactions.length})</span>
            </h3>
            <p className="text-xs text-slate-400">
              Transaksi masuk yang ditandai dengan perlakuan pajak di tahun {selectedYear}
            </p>
          </div>

          {onOpenNewTransactionModal && (
            <button
              type="button"
              onClick={onOpenNewTransactionModal}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Catat Pemasukan Baru</span>
            </button>
          )}
        </div>

        {relevantTransactions.length === 0 ? (
          <div className="py-12 text-center bg-slate-950/40 border border-slate-800/60 rounded-2xl space-y-3">
            <Receipt className="w-8 h-8 text-slate-600 mx-auto" />
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-slate-300">Belum ada transaksi berbendera pajak di tahun {selectedYear}</h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Saat mencatat pemasukan (gaji sampingan, komisi affiliate, freelance), pilih opsi <strong>"Perlakuan Pajak (PPh)"</strong> agar otomatis diikutsertakan dalam estimasi ini.
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-2.5 px-3 font-semibold">Tanggal</th>
                  <th className="py-2.5 px-3 font-semibold">Label Sumber</th>
                  <th className="py-2.5 px-3 font-semibold">Deskripsi</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Net Diterima</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Bruto Kena Pajak</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Pajak Dipotong</th>
                  <th className="py-2.5 px-3 font-semibold text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {relevantTransactions.map((tx) => {
                  const net = tx.amount || 0;
                  const withheld = tx.taxWithheldAmount || 0;
                  const gross = typeof tx.grossAmount === 'number' && tx.grossAmount > 0
                    ? tx.grossAmount
                    : (tx.taxTreatment === 'withheld_at_source' ? net + withheld : net);

                  return (
                    <tr
                      key={tx.id}
                      onClick={() => onEditTransaction && onEditTransaction(tx)}
                      className="hover:bg-slate-800/30 cursor-pointer transition"
                    >
                      <td className="py-2.5 px-3 font-mono text-slate-400">{tx.date}</td>
                      <td className="py-2.5 px-3 font-bold text-white">
                        {tx.taxSourceLabel || <span className="text-slate-500 font-normal">-</span>}
                      </td>
                      <td className="py-2.5 px-3 text-slate-300 truncate max-w-xs">{tx.description}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                        {formatCurrency(net, tx.currency || baseCurrency)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-white">
                        {formatCurrency(gross, tx.currency || baseCurrency)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-400">
                        {withheld > 0 ? formatCurrency(withheld, tx.currency || baseCurrency) : <span className="text-slate-600">-</span>}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                            tx.taxTreatment === 'withheld_at_source'
                              ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                              : 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                          }`}
                        >
                          {tx.taxTreatment === 'withheld_at_source' ? 'Dipotong' : 'Hitung Sendiri'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
