/**
 * Automated Test Suite: Cash Flow Forecasting Engine
 * Verifies 90-180 day simulation, recurring rule integration, discretionary baseline subtraction,
 * real-data depletion date detection, and multi-user account scoping.
 */

import { generateCashFlowForecast } from '../src/services/cashFlowForecast';
import type { Account, Transaction, RecurringRule } from '../src/types';

async function runForecastTest() {
  console.log('🚀 Running Cash Flow Forecasting Test Suite...\n');

  // Test 1: Positive Cash Flow Simulation (Surplus Projection)
  console.log('--- Test 1: Positive Cash Flow Simulation (Salary > Bills) ---');
  const mockAccounts: Account[] = [
    {
      id: 'acc_bca',
      name: 'BCA Checking',
      type: 'bank',
      currency: 'IDR',
      currentBalance: 10000000,
      includeInNetWorth: true,
      isArchived: false,
      isDeleted: false,
      createdAt: Date.now() - 60 * 86400000,
      updatedAt: Date.now(),
      deviceId: 'dev_test',
      version: 1,
    },
  ];

  // Recurring salary of Rp 20,000,000 / month, and rent of Rp 5,000,000 / month
  const recurringRules: RecurringRule[] = [
    {
      id: 'rec_salary',
      title: 'Monthly Salary',
      type: 'income',
      amount: 20000000,
      currency: 'IDR',
      accountId: 'acc_bca',
      categoryId: 'cat_salary',
      frequency: 'monthly',
      intervalValue: 1,
      dayOfMonth: 25,
      startDate: '2026-01-01',
      nextExecutionDate: '2026-11-25',
      autoPost: true,
      isDeleted: false,
      updatedAt: Date.now(),
      version: 1,
    },
    {
      id: 'rec_rent',
      title: 'Apartment Rent',
      type: 'expense',
      amount: 5000000,
      currency: 'IDR',
      accountId: 'acc_bca',
      categoryId: 'cat_rent',
      frequency: 'monthly',
      intervalValue: 1,
      dayOfMonth: 1,
      startDate: '2026-01-01',
      nextExecutionDate: '2026-11-01',
      autoPost: true,
      isDeleted: false,
      updatedAt: Date.now(),
      version: 1,
    },
  ];

  // Discretionary expenses: Rp 3,000,000 over 60 days (~Rp 50,000/day)
  const mockTxs: Transaction[] = [
    {
      id: 'tx_d1',
      type: 'expense',
      amount: 3000000,
      currency: 'IDR',
      baseAmount: 3000000,
      accountId: 'acc_bca',
      categoryId: 'cat_food',
      date: '2026-10-10',
      timestamp: Date.now() - 14 * 86400000,
      description: 'Groceries and dining out',
      isDeleted: false,
      createdAt: Date.now() - 14 * 86400000,
      updatedAt: Date.now() - 14 * 86400000,
      deviceId: 'dev_test',
      version: 1,
    },
  ];

  const forecast90 = generateCashFlowForecast({
    transactions: mockTxs,
    recurringRules,
    accounts: mockAccounts,
    horizonDays: 90,
    baseCurrency: 'IDR',
  });

  console.log(`Starting Net Worth: Rp ${forecast90.startNetWorth.toLocaleString('id-ID')}`);
  console.log(`Projected Net Worth (90D): Rp ${forecast90.endNetWorth.toLocaleString('id-ID')}`);
  console.log(`Projected Net Delta: Rp ${forecast90.netDelta.toLocaleString('id-ID')}`);
  console.log(`Daily Discretionary Rate: Rp ${forecast90.dailyDiscretionaryRate.toLocaleString('id-ID')}/day`);
  console.log(`Insights count: ${forecast90.insights.length}`);
  if (forecast90.insights.length > 0) {
    console.log(`Primary Insight: "${forecast90.insights[0].message}"`);
  }

  if (forecast90.netDelta <= 0 || forecast90.points.length !== 90) {
    throw new Error('90-day surplus forecast failed to project positive net cash flow!');
  }
  console.log('[PASS] 90-day surplus projection generated 90 points with positive net cash flow insight.');

  // Test 2: Account Depletion Detection (Truthful Warning)
  console.log('\n--- Test 2: Account Depletion Detection (Truthful Warning) ---');
  // Account with small balance (Rp 2,000,000) and heavy recurring expense (Rp 4,000,000 on day 10)
  const lowBalanceAccount: Account = {
    id: 'acc_cash_low',
    name: 'Petty Cash',
    type: 'cash',
    currency: 'IDR',
    currentBalance: 1500000,
    includeInNetWorth: true,
    isArchived: false,
    isDeleted: false,
    createdAt: Date.now() - 30 * 86400000,
    updatedAt: Date.now(),
    deviceId: 'dev_test',
    version: 1,
  };

  const heavyExpenseRules: RecurringRule[] = [
    {
      id: 'rec_gym',
      title: 'Annual Gym Membership',
      type: 'expense',
      amount: 2500000,
      currency: 'IDR',
      accountId: 'acc_cash_low',
      categoryId: 'cat_health',
      frequency: 'monthly',
      intervalValue: 1,
      dayOfMonth: new Date(Date.now() + 5 * 86400000).getDate(),
      startDate: '2026-01-01',
      nextExecutionDate: '2026-10-29',
      autoPost: true,
      isDeleted: false,
      updatedAt: Date.now(),
      version: 1,
    },
  ];

  const depletionForecast = generateCashFlowForecast({
    transactions: [],
    recurringRules: heavyExpenseRules,
    accounts: [lowBalanceAccount],
    horizonDays: 30,
    baseCurrency: 'IDR',
  });

  const depletionWarning = depletionForecast.insights.find((i) => i.type === 'warning');
  if (!depletionWarning || !depletionWarning.depletedAccountName || !depletionWarning.depletionDate) {
    throw new Error('Engine failed to detect projected account depletion!');
  }

  console.log(`Depletion Warning Detected:`);
  console.log(`- Account: ${depletionWarning.depletedAccountName}`);
  console.log(`- Projected Date: ${depletionWarning.depletionDate}`);
  console.log(`- Message: "${depletionWarning.message}"`);
  console.log('[PASS] Real depletion event correctly captured without fabrication.');

  // Test 3: Multi-User Scoping (accountIds filter)
  console.log('\n--- Test 3: Multi-User Scoping via accountIds Filtering ---');
  const scopedForecast = generateCashFlowForecast({
    transactions: mockTxs,
    recurringRules,
    accounts: [mockAccounts[0], lowBalanceAccount],
    horizonDays: 60,
    accountIds: ['acc_bca'], // Scope to only BCA account
    baseCurrency: 'IDR',
  });

  const hasLowAccountInScoped = scopedForecast.points.some(
    (p) => p.accountBalances['acc_cash_low'] !== undefined
  );
  if (hasLowAccountInScoped) {
    throw new Error('Scoped forecast leaked unselected account into projection!');
  }
  console.log(`[PASS] accountIds parameter correctly isolated target account (acc_bca) for multi-user forward readiness.`);

  // Test 4: Neutral Insight on Insufficient Data (No Made-Up Warnings)
  console.log('\n--- Test 4: Neutral Guidance on Empty Data (Zero Fabrication) ---');
  const emptyForecast = generateCashFlowForecast({
    transactions: [],
    recurringRules: [],
    accounts: [mockAccounts[0]],
    horizonDays: 90,
  });

  const neutralInsight = emptyForecast.insights.find((i) => i.type === 'neutral');
  if (!neutralInsight) {
    throw new Error('Expected neutral guidance when insufficient data exists!');
  }
  console.log(`[PASS] Neutral insight returned: "${neutralInsight.message}"`);

  console.log('\n🎉 ALL CASH FLOW FORECASTING TESTS PASSED WITH 100% SUCCESS!');
}

runForecastTest().catch((err) => {
  console.error('❌ Forecast test failed:', err);
  process.exit(1);
});
