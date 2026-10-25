/**
 * Automated Verification Suite: Indonesian Personal Income Tax (PPh) Estimator Engine
 *
 * Verifies:
 * 1. Income below PTKP (PKP 0 -> PPh 0)
 * 2. Multi-tier progressive bracket calculation (5%, 15%, 25%, 30%, 35%)
 * 3. Tax credits subtraction from "tax withheld at source" (bukti potong)
 * 4. Dual Ledger integrity (net cash received vs gross taxable income)
 * 5. Single-PTKP Rule: Combining other external income (e.g. employer salary) with side income
 * 6. Custom PTKP numeric override and user-customizable brackets
 * 7. CSV and Printable HTML worksheet generation with mandatory legal disclaimers
 */

import {
  calculateAnnualPPh,
  calculateProgressiveTax,
  generateTaxWorksheetCsv,
  generateTaxWorksheetPrintableHtml,
  DEFAULT_PTKP_VALUES,
  DEFAULT_TAX_BRACKETS,
  PPH_PERSISTENT_DISCLAIMER_TEXT,
} from '../src/services/tax';
import type { Transaction, TaxBracketConfig } from '../src/types';

async function runTaxEngineTests() {
  console.log('🚀 Running Indonesian Personal Income Tax (PPh) Estimator Engine Tests...\n');

  // Helper to build realistic income transactions
  const createIncomeTx = (
    id: string,
    amount: number,
    taxTreatment: 'not_applicable' | 'withheld_at_source' | 'needs_self_calculation',
    opts?: {
      grossAmount?: number;
      taxWithheldAmount?: number;
      taxSourceLabel?: string;
      year?: number;
    }
  ): Transaction => {
    const yr = opts?.year || 2026;
    return {
      id,
      type: 'income',
      date: `${yr}-05-15`,
      timestamp: Date.now(),
      amount, // Net amount hitting account ledger
      grossAmount: opts?.grossAmount,
      taxWithheldAmount: opts?.taxWithheldAmount,
      taxSourceLabel: opts?.taxSourceLabel,
      taxTreatment,
      currency: 'IDR',
      exchangeRateToBase: 1.0,
      baseAmount: amount,
      accountId: 'acc_bca',
      categoryId: 'cat_freelance',
      description: `Income payment ${id}`,
      inputSource: 'manual',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      deviceId: 'dev_test',
      isDeleted: false,
      version: 1,
    };
  };

  // =========================================================================
  // TEST 1: Income Below PTKP
  // =========================================================================
  console.log('--- Test 1: Gross Income Below PTKP (Zero Tax Due) ---');
  const txBelowPtkp = [
    createIncomeTx('tx_1', 20000000, 'needs_self_calculation', { taxSourceLabel: 'Small Project' }),
    createIncomeTx('tx_2', 25000000, 'needs_self_calculation', { taxSourceLabel: 'Affiliate' }),
  ];

  const res1 = calculateAnnualPPh(txBelowPtkp, 2026, { selectedPtkpStatus: 'TK/0' });
  console.log(`Total Gross: Rp ${res1.totalGrossTaxableIncome.toLocaleString('id-ID')}, PTKP: Rp ${res1.ptkpAmount.toLocaleString('id-ID')}, PKP: Rp ${res1.pkp.toLocaleString('id-ID')}`);
  console.log(`Estimated PPh Terutang: Rp ${res1.totalPPhTerutang.toLocaleString('id-ID')}, Status: ${res1.status}`);

  if (res1.totalGrossTaxableIncome !== 45000000) {
    throw new Error(`Expected gross 45,000,000, got ${res1.totalGrossTaxableIncome}`);
  }
  if (res1.pkp !== 0 || res1.totalPPhTerutang !== 0 || res1.status !== 'nihil') {
    throw new Error('Income below PTKP must result in PKP 0 and Nihil tax!');
  }
  console.log('[PASS] Gross income below PTKP correctly yields PKP 0 and Nihil tax position.');

  // =========================================================================
  // TEST 2: Multi-Tier Progressive Progression & Tax Credits (Approved Plan Math)
  // Scenario: Rp 150M gross, TK/0 (PTKP 54M) -> PKP 96M
  // Layer 1 (5% up to 60M) = 3M
  // Layer 2 (15% for 36M) = 5.4M
  // Total PPh = 8.4M. Withheld at source = 5M -> Kurang Bayar = 3.4M
  // =========================================================================
  console.log('\n--- Test 2: Multi-Tier Progressive Progression & Tax Credits ---');
  const txApprovedPlan = [
    createIncomeTx('tx_shopee', 95000000, 'withheld_at_source', {
      grossAmount: 100000000,
      taxWithheldAmount: 5000000,
      taxSourceLabel: 'Shopee Affiliate (Bukti Potong PPh 21)',
    }),
    createIncomeTx('tx_tiktok', 50000000, 'needs_self_calculation', {
      taxSourceLabel: 'TikTok Affiliate (No Withholding)',
    }),
  ];

  const res2 = calculateAnnualPPh(txApprovedPlan, 2026, { selectedPtkpStatus: 'TK/0' });
  console.log(`Flagged Net Cash: Rp ${res2.flaggedNetReceived.toLocaleString('id-ID')}`);
  console.log(`Flagged Gross Income: Rp ${res2.flaggedGrossIncome.toLocaleString('id-ID')}`);
  console.log(`PTKP Applied: Rp ${res2.ptkpAmount.toLocaleString('id-ID')}`);
  console.log(`Penghasilan Kena Pajak (PKP): Rp ${res2.pkp.toLocaleString('id-ID')}`);
  console.log(`Bracket 1 (5%): Rp ${res2.bracketsBreakdown[0].taxAmountInBracket.toLocaleString('id-ID')}`);
  console.log(`Bracket 2 (15%): Rp ${res2.bracketsBreakdown[1].taxAmountInBracket.toLocaleString('id-ID')}`);
  console.log(`Total PPh Terutang: Rp ${res2.totalPPhTerutang.toLocaleString('id-ID')}`);
  console.log(`Total Tax Credits (Withheld): Rp ${res2.totalTaxCredits.toLocaleString('id-ID')}`);
  console.log(`Estimated Balance: Rp ${res2.estimatedBalance.toLocaleString('id-ID')} (${res2.status})`);

  if (res2.flaggedNetReceived !== 145000000) {
    throw new Error(`Expected net cash 145M, got ${res2.flaggedNetReceived}`);
  }
  if (res2.flaggedGrossIncome !== 150000000) {
    throw new Error(`Expected gross 150M, got ${res2.flaggedGrossIncome}`);
  }
  if (res2.pkp !== 96000000) {
    throw new Error(`Expected PKP 96M, got ${res2.pkp}`);
  }
  if (res2.totalPPhTerutang !== 8400000) {
    throw new Error(`Expected PPh Terutang 8.4M, got ${res2.totalPPhTerutang}`);
  }
  if (res2.totalTaxCredits !== 5000000) {
    throw new Error(`Expected Tax Credits 5M, got ${res2.totalTaxCredits}`);
  }
  if (res2.estimatedBalance !== 3400000 || res2.status !== 'kurang_bayar') {
    throw new Error(`Expected Kurang Bayar 3.4M, got ${res2.estimatedBalance} (${res2.status})`);
  }
  console.log('[PASS] Progressive calculation and tax credits match approved benchmark math with 100% precision.');

  // =========================================================================
  // TEST 3: Single-PTKP Rule with External Employer Salary
  // User has Rp 150M side income (Rp 5M credit) AND Rp 120M external salary (Rp 3.3M withheld)
  // Combined Gross: Rp 270M -> PTKP 54M -> PKP 216M
  // Layer 1 (60M @ 5%): 3M
  // Layer 2 (156M @ 15%): 23.4M
  // Total PPh = 26.4M. Combined Credits = 5M + 3.3M = 8.3M -> Kurang Bayar = 18.1M
  // =========================================================================
  console.log('\n--- Test 3: Single-PTKP Rule with Other External Income (e.g. Salary) ---');
  const res3 = calculateAnnualPPh(txApprovedPlan, 2026, {
    selectedPtkpStatus: 'TK/0',
    otherExternalGrossIncome: 120000000,
    otherExternalTaxWithheld: 3300000,
  });

  console.log(`Combined Gross: Rp ${res3.totalGrossTaxableIncome.toLocaleString('id-ID')}`);
  console.log(`PKP: Rp ${res3.pkp.toLocaleString('id-ID')}`);
  console.log(`Total PPh Terutang: Rp ${res3.totalPPhTerutang.toLocaleString('id-ID')}`);
  console.log(`Total Credits: Rp ${res3.totalTaxCredits.toLocaleString('id-ID')}`);
  console.log(`Final Kurang Bayar: Rp ${res3.estimatedBalance.toLocaleString('id-ID')}`);

  if (res3.totalGrossTaxableIncome !== 270000000) {
    throw new Error(`Expected combined gross 270M, got ${res3.totalGrossTaxableIncome}`);
  }
  if (res3.pkp !== 216000000) {
    throw new Error(`Expected PKP 216M, got ${res3.pkp}`);
  }
  if (res3.totalPPhTerutang !== 26400000) {
    throw new Error(`Expected PPh Terutang 26.4M, got ${res3.totalPPhTerutang}`);
  }
  if (res3.totalTaxCredits !== 8300000) {
    throw new Error(`Expected Total Credits 8.3M, got ${res3.totalTaxCredits}`);
  }
  if (res3.estimatedBalance !== 18100000 || res3.status !== 'kurang_bayar') {
    throw new Error(`Expected Kurang Bayar 18.1M, got ${res3.estimatedBalance}`);
  }
  console.log('[PASS] Single-PTKP Rule verified: External salary combined cleanly, preventing double-PTKP deduction.');

  // =========================================================================
  // TEST 4: Overwithholding / Lebih Bayar
  // Gross Rp 70M, Withheld Rp 3M, TK/0 (PTKP 54M) -> PKP 16M
  // PPh = 5% of 16M = 800k. Credits = 3M -> Lebih Bayar = -2.2M
  // =========================================================================
  console.log('\n--- Test 4: Overwithholding / Lebih Bayar Handling ---');
  const txOverwithheld = [
    createIncomeTx('tx_over', 67000000, 'withheld_at_source', {
      grossAmount: 70000000,
      taxWithheldAmount: 3000000,
      taxSourceLabel: 'Overwithheld Client',
    }),
  ];

  const res4 = calculateAnnualPPh(txOverwithheld, 2026, { selectedPtkpStatus: 'TK/0' });
  console.log(`PPh Terutang: Rp ${res4.totalPPhTerutang.toLocaleString('id-ID')}, Credits: Rp ${res4.totalTaxCredits.toLocaleString('id-ID')}`);
  console.log(`Balance: Rp ${res4.estimatedBalance.toLocaleString('id-ID')} (${res4.status})`);

  if (res4.totalPPhTerutang !== 800000 || res4.estimatedBalance !== -2200000 || res4.status !== 'lebih_bayar') {
    throw new Error('Expected Lebih Bayar of 2,200,000!');
  }
  console.log('[PASS] Lebih Bayar correctly identified when tax credits exceed PPh terutang.');

  // =========================================================================
  // TEST 5: Custom PTKP Direct Numeric Override & Bracket Customization
  // =========================================================================
  console.log('\n--- Test 5: Custom PTKP Direct Override & User-Defined Brackets ---');
  const customBrackets: TaxBracketConfig[] = [
    { id: 'flat1', label: 'Flat Tier 10%', upTo: null, rate: 0.10 },
  ];

  const res5 = calculateAnnualPPh(txApprovedPlan, 2026, {
    customPtkpAmount: 50000000, // Custom override instead of standard 54M
    brackets: customBrackets,
  });

  console.log(`Custom PTKP Applied: Rp ${res5.ptkpAmount.toLocaleString('id-ID')}`);
  console.log(`PKP with Custom PTKP: Rp ${res5.pkp.toLocaleString('id-ID')}`);
  console.log(`Tax with Custom Flat 10% Bracket: Rp ${res5.totalPPhTerutang.toLocaleString('id-ID')}`);

  if (res5.ptkpAmount !== 50000000) {
    throw new Error(`Expected custom PTKP 50M, got ${res5.ptkpAmount}`);
  }
  if (res5.pkp !== 100000000) {
    throw new Error(`Expected PKP 100M, got ${res5.pkp}`);
  }
  if (res5.totalPPhTerutang !== 10000000) {
    throw new Error(`Expected Flat 10% tax of 10M, got ${res5.totalPPhTerutang}`);
  }
  console.log('[PASS] Custom PTKP numeric override and user-defined brackets calculate accurately.');

  // =========================================================================
  // TEST 6: CSV & Printable HTML Worksheet Generation
  // =========================================================================
  console.log('\n--- Test 6: CSV and Printable HTML Worksheet Generation ---');
  const csv = generateTaxWorksheetCsv(res3, [...txApprovedPlan]);
  const html = generateTaxWorksheetPrintableHtml(res3, [...txApprovedPlan]);

  if (!csv.includes('PERSONAL ESTIMATION ONLY') || !csv.includes('Shopee Affiliate (Bukti Potong PPh 21)')) {
    throw new Error('CSV output is missing mandatory disclaimer or transaction items!');
  }
  if (!csv.includes(PPH_PERSISTENT_DISCLAIMER_TEXT)) {
    throw new Error('CSV output does not contain the mandatory persistent disclaimer!');
  }
  if (!html.includes('DISCLAIMER HUKUM') || !html.includes('LEMBAR KERJA ESTIMASI PPH PRIBADI')) {
    throw new Error('HTML output is missing header or legal disclaimer block!');
  }
  console.log(`Generated CSV size: ${csv.length} bytes`);
  console.log(`Generated HTML size: ${html.length} bytes`);
  console.log('[PASS] CSV and HTML worksheets successfully generated with prominent disclaimers.');

  console.log('\n🎉 ALL PPH ESTIMATOR ENGINE TESTS PASSED WITH 100% SUCCESS!\n');
}

runTaxEngineTests().catch((err) => {
  console.error('\n❌ Tax Engine Test Failed:', err);
  process.exit(1);
});
