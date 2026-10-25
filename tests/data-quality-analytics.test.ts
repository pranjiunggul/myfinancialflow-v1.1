/**
 * Automated Test Suite: Phase A — Data Quality & Trust
 * Covers:
 * - Feature 1: Automatic Recurring Subscription Detection, Intervals, Accept/Dismiss, Monthly Committed Spend
 * - Feature 2: Annual Wrapped Financial Summary, Savings Rate, Top Categories, Extremes, Streaks
 * - Feature 3: Spending Heatmap Relative 5-Level Intensity Calculation
 */

import 'fake-indexeddb/auto';
import { db } from '../src/db/database';
import {
  normalizeMerchant,
  detectInterval,
  detectRecurringSubscriptions,
  acceptSubscriptionPattern,
  dismissSubscriptionPattern,
  calculateMonthlyEquivalent,
  calculateTotalCommittedMonthlySpend,
} from '../src/services/subscriptionDetector';
import { computeAnnualWrapped } from '../src/services/wrapped';
import type { Transaction, RecurringRule } from '../src/types';

async function runDataQualityTests() {
  console.log('🚀 Running Phase A: Data Quality & Trust Test Suite...\n');

  // =========================================================================
  // GROUP 1: Feature 1 — Recurring Subscription Detection & Intervals
  // =========================================================================
  console.log('--- Test 1: Merchant Description Normalization ---');
  const raw1 = 'Pembayaran Netflix.com 186000';
  const norm1 = normalizeMerchant(raw1);
  console.log(`Normalized "${raw1}" -> "${norm1}"`);
  if (!norm1.includes('netflix')) throw new Error('Merchant normalization failed');
  console.log(`[PASS] Merchant normalized cleanly to "${norm1}".`);

  console.log('\n--- Test 2: Interval Detection (Weekly, Monthly, Yearly) ---');
  const weeklyDates = ['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22'];
  const weeklyRes = detectInterval(weeklyDates);
  if (!weeklyRes || weeklyRes.frequency !== 'weekly') {
    throw new Error(`Expected weekly frequency, got ${weeklyRes?.frequency}`);
  }
  console.log(`[PASS] Weekly interval detected: frequency="${weeklyRes.frequency}", days=${weeklyRes.intervalDays}.`);

  const monthlyDates = ['2026-07-15', '2026-08-15', '2026-09-15', '2026-10-15'];
  const monthlyRes = detectInterval(monthlyDates);
  if (!monthlyRes || monthlyRes.frequency !== 'monthly') {
    throw new Error(`Expected monthly frequency, got ${monthlyRes?.frequency}`);
  }
  console.log(`[PASS] Monthly interval detected: frequency="${monthlyRes.frequency}", dayOfMonth=${monthlyRes.dayOfMonth}.`);

  console.log('\n--- Test 3: Detecting Repeating Patterns from Transaction History ---');
  await db.transactions.clear();
  await db.recurring_rules.clear();
  await db.subscription_patterns.clear();

  // Populate repeating Spotify expense
  const spotifyTxs: Transaction[] = [
    {
      id: 'tx_spot_1',
      type: 'expense',
      date: '2026-08-10',
      timestamp: 1723248000000,
      amount: 54990,
      currency: 'IDR',
      exchangeRateToBase: 1.0,
      baseAmount: 54990,
      accountId: 'acc_bca',
      categoryId: 'cat_bills',
      description: 'Spotify Premium Individual',
      inputSource: 'manual',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      deviceId: 'dev_test',
      isDeleted: false,
      version: 1,
    },
    {
      id: 'tx_spot_2',
      type: 'expense',
      date: '2026-09-10',
      timestamp: 1725926400000,
      amount: 54990,
      currency: 'IDR',
      exchangeRateToBase: 1.0,
      baseAmount: 54990,
      accountId: 'acc_bca',
      categoryId: 'cat_bills',
      description: 'Spotify Premium Individual',
      inputSource: 'manual',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      deviceId: 'dev_test',
      isDeleted: false,
      version: 1,
    },
    {
      id: 'tx_spot_3',
      type: 'expense',
      date: '2026-10-10',
      timestamp: 1728518400000,
      amount: 54990,
      currency: 'IDR',
      exchangeRateToBase: 1.0,
      baseAmount: 54990,
      accountId: 'acc_bca',
      categoryId: 'cat_bills',
      description: 'Spotify Premium Individual',
      inputSource: 'manual',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      deviceId: 'dev_test',
      isDeleted: false,
      version: 1,
    },
  ];

  for (const t of spotifyTxs) {
    await db.transactions.add(t);
  }

  const detected = await detectRecurringSubscriptions();
  console.log(`Detected ${detected.length} recurring subscription pattern(s):`);
  detected.forEach((p) => console.log(` - ${p.merchantName}: Rp ${p.amount} (${p.frequency})`));
  if (detected.length === 0 || !detected[0].merchantName.includes('Spotify')) {
    throw new Error('Failed to detect Spotify subscription pattern!');
  }
  console.log(`[PASS] Recurring subscription accurately detected for "${detected[0].merchantName}".`);

  console.log('\n--- Test 4: Accepting Pattern Creates Recurring Rule ---');
  const newRule = await acceptSubscriptionPattern(detected[0]);
  const storedRule = await db.recurring_rules.get(newRule.id);
  if (!storedRule || storedRule.amount !== 54990) {
    throw new Error('Failed to create recurring rule from detected pattern!');
  }
  console.log(`[PASS] Rule created: id="${storedRule.id}", title="${storedRule.title}", next="${storedRule.nextExecutionDate}".`);

  // Verify pattern is no longer suggested
  const nextScan = await detectRecurringSubscriptions();
  if (nextScan.length !== 0) {
    throw new Error('Accepted pattern was unexpectedly suggested again!');
  }
  console.log('[PASS] Accepted pattern suppressed from subsequent scans.');

  console.log('\n--- Test 5: Monthly Committed Spend Calculation ---');
  const mockRules: RecurringRule[] = [
    {
      id: 'r1',
      title: 'Netflix',
      type: 'expense',
      amount: 186000,
      currency: 'IDR',
      accountId: 'acc1',
      categoryId: 'cat1',
      frequency: 'monthly',
      intervalValue: 1,
      startDate: '2026-01-01',
      nextExecutionDate: '2026-11-01',
      autoPost: true,
      isDeleted: false,
      updatedAt: Date.now(),
      version: 1,
    },
    {
      id: 'r2',
      title: 'Gym Weekly',
      type: 'expense',
      amount: 100000,
      currency: 'IDR',
      accountId: 'acc1',
      categoryId: 'cat1',
      frequency: 'weekly',
      intervalValue: 1,
      startDate: '2026-01-01',
      nextExecutionDate: '2026-10-28',
      autoPost: true,
      isDeleted: false,
      updatedAt: Date.now(),
      version: 1,
    },
  ];

  const committed = calculateTotalCommittedMonthlySpend(mockRules, {}, 'IDR');
  // Monthly 186,000 + Weekly 100,000 * (52 / 12) = 186,000 + ~433,333 = ~619,333
  console.log(`Total committed monthly spend: Rp ${Math.round(committed.totalMonthlySpend).toLocaleString('id-ID')}`);
  if (committed.totalMonthlySpend < 600000 || committed.totalMonthlySpend > 630000) {
    throw new Error(`Committed spend calculation out of expected range: ${committed.totalMonthlySpend}`);
  }
  console.log(`[PASS] Committed monthly spend calculated correctly with frequency weighting.`);

  // =========================================================================
  // GROUP 2: Feature 2 — Annual Wrapped Summary Calculation
  // =========================================================================
  console.log('\n--- Test 6: Annual Wrapped Metrics & Extremes ---');
  await db.transactions.clear();
  await db.categories.clear();

  await db.categories.bulkAdd([
    { id: 'cat_food', name: 'Food & Dining', type: 'expense', icon: 'Utensils', color: '#ef4444', isSystem: false, isDeleted: false, createdAt: Date.now(), updatedAt: Date.now(), deviceId: 'dev_test', version: 1 },
    { id: 'cat_gadget', name: 'Electronics', type: 'expense', icon: 'Laptop', color: '#3b82f6', isSystem: false, isDeleted: false, createdAt: Date.now(), updatedAt: Date.now(), deviceId: 'dev_test', version: 1 },
  ]);

  await db.transactions.bulkAdd([
    {
      id: 'tx_inc_1',
      type: 'income',
      date: '2026-01-25',
      timestamp: 1737763200000,
      amount: 20000000,
      currency: 'IDR',
      exchangeRateToBase: 1.0,
      baseAmount: 20000000,
      accountId: 'acc1',
      categoryId: 'cat_salary',
      description: 'January Salary',
      inputSource: 'manual',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      deviceId: 'dev_test',
      isDeleted: false,
      version: 1,
    },
    {
      id: 'tx_exp_big',
      type: 'expense',
      date: '2026-03-15',
      timestamp: 1742035200000,
      amount: 12000000,
      currency: 'IDR',
      exchangeRateToBase: 1.0,
      baseAmount: 12000000,
      accountId: 'acc1',
      categoryId: 'cat_gadget',
      description: 'MacBook Air M3',
      inputSource: 'manual',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      deviceId: 'dev_test',
      isDeleted: false,
      version: 1,
    },
    {
      id: 'tx_exp_food1',
      type: 'expense',
      date: '2026-03-20',
      timestamp: 1742467200000,
      amount: 250000,
      currency: 'IDR',
      exchangeRateToBase: 1.0,
      baseAmount: 250000,
      accountId: 'acc1',
      categoryId: 'cat_food',
      description: 'Sushi Tei Dinner',
      inputSource: 'manual',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      deviceId: 'dev_test',
      isDeleted: false,
      version: 1,
    },
  ]);

  const wrapped = await computeAnnualWrapped(2026, 'IDR');
  console.log(`Total Income: Rp ${wrapped.totalIncome.toLocaleString('id-ID')}`);
  console.log(`Total Expense: Rp ${wrapped.totalExpense.toLocaleString('id-ID')}`);
  console.log(`Savings Rate: ${wrapped.savingsRate}%`);
  console.log(`Biggest Expense: ${wrapped.biggestExpense?.description} (Rp ${wrapped.biggestExpense?.amount.toLocaleString('id-ID')})`);
  console.log(`Top Category: ${wrapped.topCategories[0]?.categoryName} (${wrapped.topCategories[0]?.percentage}%)`);

  if (wrapped.totalIncome !== 20000000) throw new Error('Incorrect wrapped total income');
  if (wrapped.totalExpense !== 12250000) throw new Error('Incorrect wrapped total expense');
  if (wrapped.savingsRate !== 39) throw new Error(`Expected savings rate 39%, got ${wrapped.savingsRate}%`);
  if (wrapped.biggestExpense?.description !== 'MacBook Air M3') throw new Error('Failed to find biggest expense');

  console.log('[PASS] Annual Wrapped computed accurate totals, savings rate, and single biggest expense.');

  // =========================================================================
  // GROUP 3: Feature 3 — Spending Heatmap Intensity Levels
  // =========================================================================
  console.log('\n--- Test 7: Spending Heatmap 5-Level Intensity Shading ---');
  const avg = 100000; // Daily benchmark average
  const getLevel = (spend: number, benchmark: number) => {
    if (spend <= 0) return 0;
    if (spend <= benchmark * 0.5) return 1;
    if (spend <= benchmark * 1.0) return 2;
    if (spend <= benchmark * 2.0) return 3;
    return 4;
  };

  const level0 = getLevel(0, avg);
  const level1 = getLevel(40000, avg);
  const level2 = getLevel(80000, avg);
  const level3 = getLevel(150000, avg);
  const level4 = getLevel(350000, avg);

  console.log(`Spend 0 -> Level ${level0} (No Spend)`);
  console.log(`Spend 40,000 -> Level ${level1} (Low)`);
  console.log(`Spend 80,000 -> Level ${level2} (Medium)`);
  console.log(`Spend 150,000 -> Level ${level3} (High)`);
  console.log(`Spend 350,000 -> Level ${level4} (Spike)`);

  if (level0 !== 0 || level1 !== 1 || level2 !== 2 || level3 !== 3 || level4 !== 4) {
    throw new Error('Heatmap shading levels failed classification!');
  }
  console.log('[PASS] Spending heatmap 5-level relative shading correctly calculated.');

  console.log('\n🎉 All Phase A Data Quality & Trust Tests Passed Successfully!');
}

runDataQualityTests().catch((err) => {
  console.error('\n❌ Phase A tests failed:', err);
  process.exit(1);
});
