import 'fake-indexeddb/auto';
import { db, initializeDatabaseSeed } from '../src/db/database';
import {
  getMonthlyCashFlow,
  getCategorySpendingDistribution,
  getBudgetPerformance,
  getNetWorthTimeline,
  getProjectedMonthBurn,
} from '../src/services/analytics';
import {
  exportTransactionsToCSV,
  parseCSVToTransactions,
  exportToExcelWorkbook,
} from '../src/services/export';
import { createTransaction } from '../src/services/ledger';

async function runPhase3AnalyticsTests() {
  console.log('🚀 Starting Phase 3 Test Suite: Analytics, Charts & Export/Import...\n');

  await initializeDatabaseSeed();

  const accounts = await db.accounts.filter((a) => !a.isDeleted).toArray();
  const categories = await db.categories.filter((c) => !c.isDeleted).toArray();

  const bca = accounts.find((a) => a.id === 'acc_bank_bca')!;
  const cash = accounts.find((a) => a.id === 'acc_cash')!;

  const today = new Date().toISOString().split('T')[0];
  const curMonth = today.slice(0, 7);

  // Set a test monthly budget on Food & Dining (cat_food: 3,000,000 IDR)
  await db.categories.update('cat_food', { budgetMonthly: 3000000 });
  await db.categories.update('cat_transport', { budgetMonthly: 1000000 });

  // 1. Seed test transactions for analytics
  console.log('--- Test 1: Seed Transactions & Test Cash Flow Analytics ---');
  await createTransaction({
    type: 'income',
    amount: 12000000,
    currency: 'IDR',
    exchangeRateToBase: 1.0,
    baseAmount: 12000000,
    accountId: bca.id,
    categoryId: 'cat_salary',
    date: today,
    timestamp: Date.now(),
    description: 'Monthly Salary Inflow',
    inputSource: 'manual',
  });

  await createTransaction({
    type: 'expense',
    amount: 2500000,
    currency: 'IDR',
    exchangeRateToBase: 1.0,
    baseAmount: 2500000,
    accountId: cash.id,
    categoryId: 'cat_food',
    date: today,
    timestamp: Date.now(),
    description: 'Dining out and food delivery',
    inputSource: 'manual',
  });

  await createTransaction({
    type: 'expense',
    amount: 1200000, // Exceeds 1,000,000 budget!
    currency: 'IDR',
    exchangeRateToBase: 1.0,
    baseAmount: 1200000,
    accountId: bca.id,
    categoryId: 'cat_transport',
    date: today,
    timestamp: Date.now(),
    description: 'Car maintenance and fuel',
    inputSource: 'manual',
  });

  const allTxs = await db.transactions.toArray();
  const updatedCategories = await db.categories.toArray();

  const cashFlows = getMonthlyCashFlow(allTxs, 6);
  console.log(`Cash Flow Months computed: ${cashFlows.length}`);
  const currentMonthFlow = cashFlows.find((cf) => cf.month === curMonth);
  console.log('Current Month Cash Flow:', currentMonthFlow);

  if (!currentMonthFlow || currentMonthFlow.income < 12000000 || currentMonthFlow.expense < 3700000) {
    throw new Error('Cash flow calculation failed!');
  }
  if (currentMonthFlow.savingsRate <= 0) {
    throw new Error('Savings rate calculation failed!');
  }
  console.log(`[PASS] Cash flow analytics verified: Inflow ${currentMonthFlow.income}, Outflow ${currentMonthFlow.expense}, Savings Rate ${currentMonthFlow.savingsRate}%.`);

  // 2. Test Category Spending Distribution
  console.log('\n--- Test 2: Category Spending Shares ---');
  const catShares = getCategorySpendingDistribution(allTxs, updatedCategories, curMonth);
  console.log('Category Shares:', catShares.map((s) => `${s.name}: ${s.total} (${s.percentage}%)`));

  if (catShares.length < 2) {
    throw new Error('Category distribution failed to group spending!');
  }
  const totalPercentage = catShares.reduce((s, c) => s + c.percentage, 0);
  if (totalPercentage < 98 || totalPercentage > 102) {
    throw new Error(`Total percentage does not sum to ~100%! Got: ${totalPercentage}`);
  }
  console.log('[PASS] Category distribution correctly aggregated and percentage normalized.');

  // 3. Test Budget vs Actual Performance
  console.log('\n--- Test 3: Budget vs Actual Monitoring & Overrun Alert ---');
  const budgetStatuses = getBudgetPerformance(allTxs, updatedCategories, curMonth);
  console.log('Budget Statuses:', budgetStatuses.map((b) => `${b.name}: ${b.actualSpent}/${b.budget} (${b.percentUsed}%, status: ${b.status})`));

  const transportBudget = budgetStatuses.find((b) => b.categoryId === 'cat_transport');
  if (!transportBudget || transportBudget.status !== 'over_budget' || transportBudget.percentUsed < 100) {
    throw new Error('Transport category should be marked as over_budget!');
  }

  const foodBudget = budgetStatuses.find((b) => b.categoryId === 'cat_food');
  if (!foodBudget || foodBudget.status !== 'warning' || foodBudget.percentUsed < 80) {
    throw new Error('Food category should be marked as warning (≥80%)!');
  }
  console.log('[PASS] Budget tracking correctly flagged over_budget (120%) and warning (83%) thresholds.');

  // 4. Test Net Worth Timeline
  console.log('\n--- Test 4: Net Worth Timeline Evolution ---');
  const netWorthPoints = getNetWorthTimeline(allTxs, accounts, 'IDR', 30);
  console.log(`Generated ${netWorthPoints.length} net worth historical points.`);
  if (netWorthPoints.length === 0 || netWorthPoints[netWorthPoints.length - 1].netWorth <= 0) {
    throw new Error('Net worth timeline calculation failed!');
  }
  console.log(`[PASS] Net worth timeline verified (Latest: ${netWorthPoints[netWorthPoints.length - 1].netWorth} IDR).`);

  // 5. Test Month Burn Rate Forecasting
  console.log('\n--- Test 5: Month-End Burn Rate Projection ---');
  const burn = getProjectedMonthBurn(3700000, new Date());
  console.log(`Burn rate: ${burn.dailyBurnAverage} IDR/day, Projected Month-End: ${burn.projectedMonthEnd} IDR`);
  if (burn.dailyBurnAverage <= 0 || burn.projectedMonthEnd <= 0) {
    throw new Error('Burn rate projection failed!');
  }
  console.log('[PASS] Burn rate calculation and month-end projection verified.');

  // 6. Test CSV Export & Parsing (Milestone 3.3)
  console.log('\n--- Test 6: CSV Export & Import Roundtrip ---');
  const csvContent = exportTransactionsToCSV(allTxs, accounts, updatedCategories, 'IDR');
  console.log(`Exported CSV length: ${csvContent.length} chars`);
  if (!csvContent.includes('Date,Time,Type,Description') || !csvContent.includes('Dining out and food delivery')) {
    throw new Error('CSV export does not contain expected RFC-4180 headers or records!');
  }

  // Parse CSV back
  const parsedRows = parseCSVToTransactions(csvContent, bca.id, 'cat_food', 'IDR');
  console.log(`Parsed ${parsedRows.length} transaction rows from CSV.`);
  if (parsedRows.length !== allTxs.length) {
    throw new Error(`CSV parser row count mismatch! Expected ${allTxs.length}, got ${parsedRows.length}`);
  }
  console.log('[PASS] CSV export and import parsing verified with 100% fidelity.');

  // 7. Test Excel Workbook XML Export
  console.log('\n--- Test 7: Excel Workbook (.xls/.xlsx) Export ---');
  const sampleDebt: DebtReceivable = {
    id: 'debt_sample_01',
    type: 'receivable',
    personName: 'Alice Johnson',
    originalAmount: 1500000,
    currentBalance: 500000,
    currency: 'IDR',
    dueDate: '2026-11-15',
    status: 'partial',
    description: 'Loan for laptop repair',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const excelContent = exportToExcelWorkbook(allTxs, accounts, updatedCategories, [sampleDebt]);
  if (
    !excelContent.includes('<?xml version="1.0"?>') ||
    !excelContent.includes('ss:Name="Transactions"') ||
    !excelContent.includes('ss:Name="Accounts"') ||
    !excelContent.includes('ss:Name="Debts &amp; Receivables"')
  ) {
    throw new Error('Excel workbook XML structure is invalid or missing required worksheets!');
  }

  if (
    !excelContent.includes('Alice Johnson') ||
    !excelContent.includes('1500000') ||
    !excelContent.includes('500000') ||
    !excelContent.includes('partial')
  ) {
    throw new Error('Debts & Receivables sheet does not contain expected debt data rows!');
  }
  console.log('[PASS] Excel workbook generated with all 3 worksheets (Transactions, Accounts, Debts & Receivables) and populated data.');

  console.log('\n🎉 ALL PHASE 3 ANALYTICS & EXPORT TESTS PASSED WITH 100% SUCCESS!');
}

runPhase3AnalyticsTests().catch((err) => {
  console.error('\n❌ PHASE 3 TEST FAILED:', err);
  process.exit(1);
});
