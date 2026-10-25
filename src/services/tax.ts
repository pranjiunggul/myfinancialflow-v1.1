/**
 * Indonesian Personal Income Tax (PPh) Estimator Service
 *
 * IMPORTANT LEGAL & REGULATORY NOTICE:
 * This service is an ESTIMATION AND CASH-FLOW PLANNING TOOL ONLY.
 * It is NOT an official tax filing system, DJP Coretax client, or legal tax advice.
 *
 * Key Architectural Decisions:
 * 1. Dual Ledger: The main financial ledger tracks actual NET cash deposited in accounts.
 *    The tax estimator tracks GROSS amounts and records withheld tax as TAX CREDITS.
 * 2. Single-PTKP Rule: PTKP applies ONCE per individual across all income sources.
 *    Supports adding external salary/income so side-income doesn't erroneously claim PTKP a second time.
 * 3. Configurable Rates: All PTKP values and brackets are fully editable and user-customizable.
 */

import { db } from '../db/database';
import type {
  Transaction,
  TaxSettings,
  TaxBracketConfig,
  AnnualPPhCalculationResult,
  BracketTaxDetail,
} from '../types';

export const PPH_PERSISTENT_DISCLAIMER_TEXT =
  "This is a personal estimation tool only. Indonesian tax rules for different income types (e.g. employment vs. freelance/'pekerjaan bebas' income like affiliate commissions, which may use deemed-profit norms (Norma Perhitungan Penghasilan Neto) rather than gross income) are complex and can vary by individual circumstance. IMPORTANT: PTKP (Penghasilan Tidak Kena Pajak) applies legally ONCE against your TOTAL combined annual income from all sources. If you have employment salary or other income not captured in this tool or the manual external income field, this estimate may understate your true combined tax liability. This tool does NOT account for every possible deduction, income category rule, or regulatory nuance, and tax regulations can change. Always verify your actual tax obligations via the official DJP Coretax system (pajak.go.id) or a registered tax consultant before filing your SPT Tahunan.";

export const PPH_PERSISTENT_DISCLAIMER_TEXT_ID =
  "Ini adalah alat estimasi pribadi semata. Aturan perpajakan Indonesia untuk berbagai jenis penghasilan (misal karyawan tetap vs pekerjaan bebas/freelance/komisi affiliate yang dapat menggunakan Norma Perhitungan Penghasilan Neto/NPPN daripada penghasilan bruto) bersifat kompleks dan bervariasi sesuai kondisi masing-masing. PENTING: PTKP (Penghasilan Tidak Kena Pajak) secara hukum berlaku SATU KALI untuk TOTAL penghasilan tahunan gabungan dari semua sumber. Jika Anda memiliki gaji kantor atau penghasilan lain yang belum tercatat di aplikasi ini atau belum diisi pada kolom penghasilan lain, estimasi ini dapat memperkecil (understate) kewajiban pajak riil gabungan Anda. Alat ini TIDAK menggantikan perhitungan resmi SPT Tahunan. Selalu verifikasi kewajiban pajak Anda melalui sistem Coretax DJP (pajak.go.id) atau konsultan pajak terdaftar.";

export const DEFAULT_PTKP_VALUES: Record<string, { label: string; amount: number; description: string }> = {
  'TK/0': { label: 'TK/0', amount: 54_000_000, description: 'Tidak Kawin, 0 Tanggungan (Rp 54 Juta/thn)' },
  'TK/1': { label: 'TK/1', amount: 58_500_000, description: 'Tidak Kawin, 1 Tanggungan (Rp 58.5 Juta/thn)' },
  'TK/2': { label: 'TK/2', amount: 63_000_000, description: 'Tidak Kawin, 2 Tanggungan (Rp 63 Juta/thn)' },
  'TK/3': { label: 'TK/3', amount: 67_500_000, description: 'Tidak Kawin, 3 Tanggungan (Rp 67.5 Juta/thn)' },
  'K/0':  { label: 'K/0',  amount: 58_500_000, description: 'Kawin, 0 Tanggungan (Rp 58.5 Juta/thn)' },
  'K/1':  { label: 'K/1',  amount: 63_000_000, description: 'Kawin, 1 Tanggungan (Rp 63 Juta/thn)' },
  'K/2':  { label: 'K/2',  amount: 67_500_000, description: 'Kawin, 2 Tanggungan (Rp 67.5 Juta/thn)' },
  'K/3':  { label: 'K/3',  amount: 72_000_000, description: 'Kawin, 3 Tanggungan (Rp 72 Juta/thn)' },
};

export const DEFAULT_TAX_BRACKETS: TaxBracketConfig[] = [
  { id: 'b1', label: 'Lapisan 1: 5% (s.d. Rp 60.000.000)', upTo: 60_000_000, rate: 0.05 },
  { id: 'b2', label: 'Lapisan 2: 15% (> Rp 60.000.000 s.d. Rp 250.000.000)', upTo: 250_000_000, rate: 0.15 },
  { id: 'b3', label: 'Lapisan 3: 25% (> Rp 250.000.000 s.d. Rp 500.000.000)', upTo: 500_000_000, rate: 0.25 },
  { id: 'b4', label: 'Lapisan 4: 30% (> Rp 500.000.000 s.d. Rp 5.000.000.000)', upTo: 5_000_000_000, rate: 0.30 },
  { id: 'b5', label: 'Lapisan 5: 35% (> Rp 5.000.000.000)', upTo: null, rate: 0.35 },
];

/**
 * Retrieves the current TaxSettings from IndexedDB or returns 2026 UU HPP defaults
 */
export async function getTaxSettings(): Promise<TaxSettings> {
  const settings = await db.settings.get('current');
  if (settings?.taxSettings) {
    return settings.taxSettings;
  }

  return {
    selectedPtkpStatus: 'TK/0',
    customPtkpAmount: undefined,
    otherExternalGrossIncome: 0,
    otherExternalTaxWithheld: 0,
    brackets: [...DEFAULT_TAX_BRACKETS],
  };
}

/**
 * Updates TaxSettings in IndexedDB
 */
export async function updateTaxSettings(updates: Partial<TaxSettings>): Promise<TaxSettings> {
  const current = await getTaxSettings();
  const next: TaxSettings = { ...current, ...updates };

  await db.settings.update('current', {
    taxSettings: next,
    taxEstimatorEnabled: true,
  });

  return next;
}

/**
 * Acknowledges the first-use tax estimator disclaimer gate
 */
export async function acknowledgeTaxEstimatorDisclaimer(): Promise<void> {
  await db.settings.update('current', {
    taxEstimatorAcknowledged: true,
    taxEstimatorEnabled: true,
  });
}

/**
 * Calculates progressive tax across an array of brackets given PKP
 */
export function calculateProgressiveTax(
  pkp: number,
  brackets: TaxBracketConfig[] = DEFAULT_TAX_BRACKETS
): { breakdown: BracketTaxDetail[]; totalTax: number } {
  if (pkp <= 0) {
    return {
      breakdown: brackets.map((b) => ({
        bracketId: b.id,
        label: b.label,
        rate: b.rate,
        taxableAmountInBracket: 0,
        taxAmountInBracket: 0,
      })),
      totalTax: 0,
    };
  }

  // Sort brackets by threshold (null/infinity goes last)
  const sortedBrackets = [...brackets].sort((a, b) => {
    if (a.upTo === null) return 1;
    if (b.upTo === null) return -1;
    return a.upTo - b.upTo;
  });

  let remainingPKP = pkp;
  let previousLimit = 0;
  let totalTax = 0;
  const breakdown: BracketTaxDetail[] = [];

  for (const b of sortedBrackets) {
    const currentLimit = b.upTo !== null ? b.upTo : Infinity;
    const bracketSpan = currentLimit - previousLimit;

    if (remainingPKP > 0) {
      const taxableInThisBracket = Math.min(remainingPKP, bracketSpan);
      const taxForThisBracket = Math.round(taxableInThisBracket * b.rate);

      breakdown.push({
        bracketId: b.id,
        label: b.label,
        rate: b.rate,
        taxableAmountInBracket: taxableInThisBracket,
        taxAmountInBracket: taxForThisBracket,
      });

      totalTax += taxForThisBracket;
      remainingPKP -= taxableInThisBracket;
    } else {
      breakdown.push({
        bracketId: b.id,
        label: b.label,
        rate: b.rate,
        taxableAmountInBracket: 0,
        taxAmountInBracket: 0,
      });
    }

    previousLimit = currentLimit;
  }

  return { breakdown, totalTax };
}

/**
 * Core PPh Calculation Engine
 * Aggregates flagged income in the calendar year, applies single PTKP (including optional external salary),
 * computes progressive brackets, subtracts tax credits, and outputs a transparent breakdown.
 */
export function calculateAnnualPPh(
  transactions: Transaction[],
  year: number,
  options?: {
    selectedPtkpStatus?: string;
    customPtkpAmount?: number;
    otherExternalGrossIncome?: number;
    otherExternalTaxWithheld?: number;
    brackets?: TaxBracketConfig[];
  }
): AnnualPPhCalculationResult {
  const ptkpStatus = options?.selectedPtkpStatus || 'TK/0';
  const effectivePTKP =
    typeof options?.customPtkpAmount === 'number' && options.customPtkpAmount >= 0
      ? options.customPtkpAmount
      : DEFAULT_PTKP_VALUES[ptkpStatus]?.amount ?? 54_000_000;

  const brackets = options?.brackets && options.brackets.length > 0
    ? options.brackets
    : DEFAULT_TAX_BRACKETS;

  const otherGross = options?.otherExternalGrossIncome || 0;
  const otherWithheld = options?.otherExternalTaxWithheld || 0;

  // Filter transactions for the tax year with tax treatment applied
  const yearPrefix = `${year}-`;
  const relevantTransactions = transactions.filter((tx) => {
    if (tx.isDeleted) return false;
    if (tx.type !== 'income') return false;
    if (!tx.date.startsWith(yearPrefix)) return false;
    return (
      tx.taxTreatment === 'withheld_at_source' ||
      tx.taxTreatment === 'needs_self_calculation'
    );
  });

  let flaggedGrossIncome = 0;
  let flaggedNetReceived = 0;
  let flaggedTaxWithheld = 0;

  for (const tx of relevantTransactions) {
    const net = tx.amount || 0;
    const withheld = tx.taxWithheldAmount || 0;
    const gross = typeof tx.grossAmount === 'number' && tx.grossAmount > 0
      ? tx.grossAmount
      : (tx.taxTreatment === 'withheld_at_source' ? net + withheld : net);

    flaggedNetReceived += net;
    flaggedGrossIncome += gross;
    flaggedTaxWithheld += withheld;
  }

  const totalGrossTaxableIncome = flaggedGrossIncome + otherGross;
  const pkp = Math.max(0, totalGrossTaxableIncome - effectivePTKP);

  const { breakdown, totalTax: totalPPhTerutang } = calculateProgressiveTax(pkp, brackets);

  const totalTaxCredits = flaggedTaxWithheld + otherWithheld;
  const estimatedBalance = totalPPhTerutang - totalTaxCredits;

  let status: 'kurang_bayar' | 'lebih_bayar' | 'nihil' = 'nihil';
  if (estimatedBalance > 0) {
    status = 'kurang_bayar';
  } else if (estimatedBalance < 0) {
    status = 'lebih_bayar';
  }

  return {
    year,
    flaggedIncomeCount: relevantTransactions.length,
    flaggedGrossIncome,
    flaggedNetReceived,
    otherExternalGrossIncome: otherGross,
    totalGrossTaxableIncome,
    ptkpStatus,
    ptkpAmount: effectivePTKP,
    pkp,
    bracketsBreakdown: breakdown,
    totalPPhTerutang,
    flaggedTaxWithheld,
    otherExternalTaxWithheld: otherWithheld,
    totalTaxCredits,
    estimatedBalance,
    status,
  };
}

/**
 * Generates an exportable CSV worksheet for tax planning / consultant review
 */
export function generateTaxWorksheetCsv(
  result: AnnualPPhCalculationResult,
  transactions: Transaction[]
): string {
  const lines: string[] = [];

  lines.push('INDONESIAN PERSONAL INCOME TAX (PPH) ESTIMATION WORKSHEET');
  lines.push('STATUS: PERSONAL ESTIMATION ONLY - NOT AN OFFICIAL TAX RETURN (SPT TAHUNAN)');
  lines.push(`TAX YEAR: ${result.year}`);
  lines.push(`GENERATED AT: ${new Date().toISOString()}`);
  lines.push('');

  lines.push('--- SUMMARY OF CALCULATIONS ---');
  lines.push(`Flagged Income Records In App,${result.flaggedIncomeCount}`);
  lines.push(`Flagged Net Cash Received (IDR),${result.flaggedNetReceived}`);
  lines.push(`Flagged Gross Income (IDR),${result.flaggedGrossIncome}`);
  lines.push(`Other External Income (e.g. Salary),${result.otherExternalGrossIncome}`);
  lines.push(`Total Combined Gross Taxable Income (IDR),${result.totalGrossTaxableIncome}`);
  lines.push(`PTKP Status Applied,${result.ptkpStatus}`);
  lines.push(`PTKP Deduction Amount (IDR),${result.ptkpAmount}`);
  lines.push(`Penghasilan Kena Pajak (PKP) (IDR),${result.pkp}`);
  lines.push(`Estimated PPh Terutang (Gross Tax Due) (IDR),${result.totalPPhTerutang}`);
  lines.push(`Tax Withheld at Source from Flagged Income (IDR),${result.flaggedTaxWithheld}`);
  lines.push(`Tax Withheld on External Income (IDR),${result.otherExternalTaxWithheld}`);
  lines.push(`Total Tax Credits (IDR),${result.totalTaxCredits}`);
  lines.push(`Estimated Final Balance (IDR),${result.estimatedBalance}`);
  lines.push(`Tax Position,${result.status.toUpperCase().replace('_', ' ')}`);
  lines.push('');

  lines.push('--- PROGRESSIVE BRACKET BREAKDOWN ---');
  lines.push('Bracket Label,Tax Rate %,Taxable Amount in Bracket (IDR),Tax Due for Bracket (IDR)');
  for (const b of result.bracketsBreakdown) {
    lines.push(`"${b.label}",${b.rate * 100}%,${b.taxableAmountInBracket},${b.taxAmountInBracket}`);
  }
  lines.push('');

  lines.push('--- CONTRIBUTING FLAGGED INCOME TRANSACTIONS ---');
  lines.push('Date,Source Label,Description,Net Received (IDR),Gross Taxable Amount (IDR),Tax Withheld (IDR),Tax Treatment');

  const yearPrefix = `${result.year}-`;
  const relevantTx = transactions.filter(
    (tx) =>
      !tx.isDeleted &&
      tx.type === 'income' &&
      tx.date.startsWith(yearPrefix) &&
      (tx.taxTreatment === 'withheld_at_source' || tx.taxTreatment === 'needs_self_calculation')
  );

  for (const tx of relevantTx) {
    const net = tx.amount || 0;
    const withheld = tx.taxWithheldAmount || 0;
    const gross = typeof tx.grossAmount === 'number' && tx.grossAmount > 0
      ? tx.grossAmount
      : (tx.taxTreatment === 'withheld_at_source' ? net + withheld : net);

    lines.push(
      `"${tx.date}","${tx.taxSourceLabel || '-'}","${tx.description.replace(/"/g, '""')}",${net},${gross},${withheld},"${tx.taxTreatment}"`
    );
  }

  lines.push('');
  lines.push('--- MANDATORY DISCLAIMER ---');
  lines.push(`"${PPH_PERSISTENT_DISCLAIMER_TEXT.replace(/"/g, '""')}"`);

  return lines.join('\n');
}

/**
 * Generates printable HTML worksheet
 */
export function generateTaxWorksheetPrintableHtml(
  result: AnnualPPhCalculationResult,
  transactions: Transaction[]
): string {
  const formatIDR = (val: number) => `Rp ${Math.abs(val).toLocaleString('id-ID')}`;

  const yearPrefix = `${result.year}-`;
  const relevantTx = transactions.filter(
    (tx) =>
      !tx.isDeleted &&
      tx.type === 'income' &&
      tx.date.startsWith(yearPrefix) &&
      (tx.taxTreatment === 'withheld_at_source' || tx.taxTreatment === 'needs_self_calculation')
  );

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Lembar Kerja Estimasi PPh Pribadi ${result.year}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 24px; color: #1e293b; background: #fff; line-height: 1.5; font-size: 13px; }
    .header { border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 20px; }
    .title { font-size: 20px; font-weight: bold; margin: 0; color: #0f172a; }
    .subtitle { font-size: 12px; color: #64748b; margin-top: 4px; }
    .disclaimer-box { background: #fef2f2; border-left: 4px solid #ef4444; padding: 10px 14px; margin-bottom: 20px; font-size: 11px; color: #991b1b; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 20px; }
    .card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; background: #f8fafc; }
    .card-label { font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase; }
    .card-val { font-size: 18px; font-weight: bold; color: #0f172a; margin-top: 4px; }
    .card-val.highlight { color: #2563eb; }
    .card-val.danger { color: #dc2626; }
    .card-val.success { color: #16a34a; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 12px; }
    th { background: #f1f5f9; text-align: left; padding: 8px 10px; border-bottom: 1px solid #cbd5e1; font-weight: 600; }
    td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; }
    .num { text-align: right; }
    .footer { margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 12px; font-size: 10px; color: #94a3b8; text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <h1 class="title">LEMBAR KERJA ESTIMASI PPH PRIBADI (PPh 21 / PPh OP)</h1>
    <div class="subtitle">Tahun Pajak: ${result.year} | Dokumen Rujukan Pribadi (Bukan SPT Resmi)</div>
  </div>

  <div class="disclaimer-box">
    <strong>PERHATIAN & DISCLAIMER HUKUM:</strong><br>
    ${PPH_PERSISTENT_DISCLAIMER_TEXT_ID}
  </div>

  <div class="grid">
    <div class="card">
      <div class="card-label">Total Penghasilan Bruto (Gabungan)</div>
      <div class="card-val">${formatIDR(result.totalGrossTaxableIncome)}</div>
      <div style="font-size: 11px; color: #64748b; margin-top: 4px;">
        Aplikasi: ${formatIDR(result.flaggedGrossIncome)} | Gaji/Lainnya: ${formatIDR(result.otherExternalGrossIncome)}
      </div>
    </div>
    <div class="card">
      <div class="card-label">Penghasilan Kena Pajak (PKP)</div>
      <div class="card-val highlight">${formatIDR(result.pkp)}</div>
      <div style="font-size: 11px; color: #64748b; margin-top: 4px;">
        PTKP (${result.ptkpStatus}): ${formatIDR(result.ptkpAmount)}
      </div>
    </div>
    <div class="card">
      <div class="card-label">Estimasi PPh Terutang</div>
      <div class="card-val">${formatIDR(result.totalPPhTerutang)}</div>
      <div style="font-size: 11px; color: #64748b; margin-top: 4px;">
        Berdasarkan tarif progresif Pasal 17 UU HPP
      </div>
    </div>
    <div class="card">
      <div class="card-label">Posisi Akhir Estimasi</div>
      <div class="card-val ${result.status === 'kurang_bayar' ? 'danger' : result.status === 'lebih_bayar' ? 'success' : ''}">
        ${result.status === 'kurang_bayar' ? 'Kurang Bayar: ' + formatIDR(result.estimatedBalance) : result.status === 'lebih_bayar' ? 'Lebih Bayar: ' + formatIDR(result.estimatedBalance) : 'Nihil (Rp 0)'}
      </div>
      <div style="font-size: 11px; color: #64748b; margin-top: 4px;">
        Total Kredit Pajak (Dipotong): ${formatIDR(result.totalTaxCredits)}
      </div>
    </div>
  </div>

  <h3 style="font-size: 14px; margin-bottom: 8px;">Rincian Perhitungan Tarif Progresif (UU HPP)</h3>
  <table>
    <thead>
      <tr>
        <th>Lapisan Tarif</th>
        <th class="num">Tarif</th>
        <th class="num">Dasar Pengenaan Pajak (Rp)</th>
        <th class="num">PPh Terutang (Rp)</th>
      </tr>
    </thead>
    <tbody>
      ${result.bracketsBreakdown.map((b) => `
        <tr>
          <td>${b.label}</td>
          <td class="num">${b.rate * 100}%</td>
          <td class="num">${b.taxableAmountInBracket.toLocaleString('id-ID')}</td>
          <td class="num"><strong>${b.taxAmountInBracket.toLocaleString('id-ID')}</strong></td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <h3 style="font-size: 14px; margin-bottom: 8px;">Daftar Transaksi Penghasilan Terkait (${relevantTx.length})</h3>
  <table>
    <thead>
      <tr>
        <th>Tanggal</th>
        <th>Sumber / Label</th>
        <th>Keterangan</th>
        <th class="num">Net Masuk (Rp)</th>
        <th class="num">Bruto Pajak (Rp)</th>
        <th class="num">Pajak Dipotong (Rp)</th>
      </tr>
    </thead>
    <tbody>
      ${relevantTx.length === 0 ? '<tr><td colspan="6" style="text-align: center; color: #94a3b8;">Tidak ada transaksi penghasilan yang ditandai untuk tahun ini.</td></tr>' : relevantTx.map((tx) => {
        const net = tx.amount || 0;
        const withheld = tx.taxWithheldAmount || 0;
        const gross = typeof tx.grossAmount === 'number' && tx.grossAmount > 0 ? tx.grossAmount : (tx.taxTreatment === 'withheld_at_source' ? net + withheld : net);
        return `
          <tr>
            <td>${tx.date}</td>
            <td><strong>${tx.taxSourceLabel || '-'}</strong></td>
            <td>${tx.description}</td>
            <td class="num">${net.toLocaleString('id-ID')}</td>
            <td class="num">${gross.toLocaleString('id-ID')}</td>
            <td class="num">${withheld > 0 ? withheld.toLocaleString('id-ID') : '-'}</td>
          </tr>
        `;
      }).join('')}
    </tbody>
  </table>

  <div class="footer">
    Dicetak dari MyFinancialFlow Personal Finance PWA | Dokumen ini adalah lembar kerja pribadi dan tidak sah sebagai bukti pelaporan SPT resmi.
  </div>
</body>
</html>`;
}
