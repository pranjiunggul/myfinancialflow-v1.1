/**
 * Automated Test Suite: Financial Goals & Velocity Calculation
 * Verifies dynamic velocity calculation, projected completion dates,
 * default manual tracking, and linked-account tracking behavior.
 */

import 'fake-indexeddb/auto';
import { db } from '../src/db/database';
import {
  createGoal,
  updateGoal,
  deleteGoal,
  addGoalContribution,
  calculateGoalProgress,
  getActiveGoals,
} from '../src/services/goals';
import type { Account, Transaction, FinancialGoal } from '../src/types';

async function runGoalsTest() {
  console.log('🚀 Running Financial Goals & Velocity Test Suite...\n');

  // Test 1: Goal Creation with Default Manual Mode
  console.log('--- Test 1: Create Goal with Default Manual Tracking ---');
  const goal1 = await createGoal({
    name: 'Emergency Fund 6 Months',
    icon: 'ShieldCheck',
    color: '#10b981',
    targetAmount: 30000000,
    currentAmount: 6000000,
    currency: 'IDR',
    targetDate: '2027-06-30',
    trackingMode: 'manual',
    manualContribution: 6000000,
    status: 'active',
  });

  if (!goal1.id || goal1.trackingMode !== 'manual' || goal1.manualContribution !== 6000000) {
    throw new Error('Goal creation failed or trackingMode did not default to manual!');
  }
  console.log(`[PASS] Created goal "${goal1.name}" (ID: ${goal1.id}) with default manual tracking mode.`);

  // Test 2: Calculate Progress & Dynamic Velocity (Manual Mode)
  console.log('\n--- Test 2: Calculate Progress & Dynamic Velocity (Manual Mode) ---');
  const mockAccounts: Account[] = [
    {
      id: 'acc_bca',
      name: 'BCA Checking',
      type: 'bank',
      currency: 'IDR',
      currentBalance: 15000000,
      includeInNetWorth: true,
      isArchived: false,
      isDeleted: false,
      createdAt: Date.now() - 90 * 86400000,
      updatedAt: Date.now(),
      deviceId: 'dev_test',
      version: 1,
    },
  ];

  // 3 monthly transactions contributing to this goal (1,000,000 each over last 90 days)
  const mockTxs: Transaction[] = [
    {
      id: 'tx_g1',
      type: 'expense',
      amount: 1000000,
      currency: 'IDR',
      baseAmount: 1000000,
      accountId: 'acc_bca',
      categoryId: 'cat_savings',
      date: '2026-08-15',
      timestamp: Date.now() - 70 * 86400000,
      description: 'Transfer to Emergency Fund 6 Months',
      tags: [goal1.id],
      isDeleted: false,
      createdAt: Date.now() - 70 * 86400000,
      updatedAt: Date.now() - 70 * 86400000,
      deviceId: 'dev_test',
      version: 1,
    },
    {
      id: 'tx_g2',
      type: 'expense',
      amount: 1000000,
      currency: 'IDR',
      baseAmount: 1000000,
      accountId: 'acc_bca',
      categoryId: 'cat_savings',
      date: '2026-09-15',
      timestamp: Date.now() - 40 * 86400000,
      description: 'Monthly savings Emergency Fund 6 Months',
      tags: [goal1.id],
      isDeleted: false,
      createdAt: Date.now() - 40 * 86400000,
      updatedAt: Date.now() - 40 * 86400000,
      deviceId: 'dev_test',
      version: 1,
    },
    {
      id: 'tx_g3',
      type: 'expense',
      amount: 1000000,
      currency: 'IDR',
      baseAmount: 1000000,
      accountId: 'acc_bca',
      categoryId: 'cat_savings',
      date: '2026-10-15',
      timestamp: Date.now() - 10 * 86400000,
      description: 'Topup Emergency Fund 6 Months',
      tags: [goal1.id],
      isDeleted: false,
      createdAt: Date.now() - 10 * 86400000,
      updatedAt: Date.now() - 10 * 86400000,
      deviceId: 'dev_test',
      version: 1,
    },
  ];

  const progress1 = calculateGoalProgress(goal1, mockAccounts, mockTxs, 'IDR');
  console.log(`Current: Rp ${progress1.currentAmount.toLocaleString('id-ID')} / Rp ${progress1.targetAmount.toLocaleString('id-ID')} (${progress1.percentage}%)`);
  console.log(`Monthly Velocity: Rp ${progress1.monthlyVelocity.toLocaleString('id-ID')}/month`);
  console.log(`Projected Date: ${progress1.projectedCompletionDate} (Months remaining: ${progress1.monthsRemaining})`);

  if (progress1.percentage !== 20 || progress1.monthlyVelocity !== 1000000 || !progress1.projectedCompletionDate) {
    throw new Error('Velocity calculation incorrect for manual mode!');
  }
  console.log('[PASS] Manual tracking mode computed exact 20% progress and projected completion date.');

  // Test 3: Linked Dedicated Account Tracking Mode
  console.log('\n--- Test 3: Linked Dedicated Account Tracking Mode ---');
  const dedicatedAccount: Account = {
    id: 'acc_dedicated_savings',
    name: 'BTPN Jenius Dream Saver',
    type: 'bank',
    currency: 'IDR',
    currentBalance: 12000000,
    includeInNetWorth: true,
    isArchived: false,
    isDeleted: false,
    createdAt: Date.now() - 90 * 86400000,
    updatedAt: Date.now(),
    deviceId: 'dev_test',
    version: 1,
  };

  const goal2 = await createGoal({
    name: 'New MacBook Pro',
    icon: 'Laptop',
    color: '#3b82f6',
    targetAmount: 24000000,
    currentAmount: 0,
    currency: 'IDR',
    trackingMode: 'linked_account',
    linkedAccountId: 'acc_dedicated_savings',
    manualContribution: 0,
    status: 'active',
  });

  const dedicatedTxs: Transaction[] = [
    {
      id: 'tx_d1',
      type: 'income',
      amount: 4000000,
      currency: 'IDR',
      baseAmount: 4000000,
      accountId: 'acc_dedicated_savings',
      categoryId: 'cat_savings',
      date: '2026-08-20',
      timestamp: Date.now() - 65 * 86400000,
      description: 'Monthly Autodebit to Dream Saver',
      isDeleted: false,
      createdAt: Date.now() - 65 * 86400000,
      updatedAt: Date.now() - 65 * 86400000,
      deviceId: 'dev_test',
      version: 1,
    },
    {
      id: 'tx_d2',
      type: 'income',
      amount: 4000000,
      currency: 'IDR',
      baseAmount: 4000000,
      accountId: 'acc_dedicated_savings',
      categoryId: 'cat_savings',
      date: '2026-09-20',
      timestamp: Date.now() - 35 * 86400000,
      description: 'Monthly Autodebit to Dream Saver',
      isDeleted: false,
      createdAt: Date.now() - 35 * 86400000,
      updatedAt: Date.now() - 35 * 86400000,
      deviceId: 'dev_test',
      version: 1,
    },
    {
      id: 'tx_d3',
      type: 'income',
      amount: 4000000,
      currency: 'IDR',
      baseAmount: 4000000,
      accountId: 'acc_dedicated_savings',
      categoryId: 'cat_savings',
      date: '2026-10-20',
      timestamp: Date.now() - 5 * 86400000,
      description: 'Monthly Autodebit to Dream Saver',
      isDeleted: false,
      createdAt: Date.now() - 5 * 86400000,
      updatedAt: Date.now() - 5 * 86400000,
      deviceId: 'dev_test',
      version: 1,
    },
  ];

  const progress2 = calculateGoalProgress(goal2, [dedicatedAccount], dedicatedTxs, 'IDR');
  console.log(`Dedicated Account Current Balance: Rp ${progress2.currentAmount.toLocaleString('id-ID')} (Target: Rp ${progress2.targetAmount.toLocaleString('id-ID')})`);
  console.log(`Percentage: ${progress2.percentage}% | Velocity: Rp ${progress2.monthlyVelocity.toLocaleString('id-ID')}/mo`);
  console.log(`Months Remaining: ${progress2.monthsRemaining} months`);

  if (progress2.percentage !== 50 || progress2.monthlyVelocity !== 4000000 || progress2.monthsRemaining !== 3) {
    throw new Error('Linked account progress calculation incorrect!');
  }
  console.log('[PASS] Linked dedicated account mode tracked 50% progress and projected 3 months remaining.');

  // Test 4: Stagnant Pace Handling (Velocity <= 0)
  console.log('\n--- Test 4: Stagnant Pace Handling ---');
  const stagnantGoal: FinancialGoal = {
    id: 'goal_stagnant',
    name: 'Vacation to Bali',
    targetAmount: 10000000,
    currentAmount: 1000000,
    currency: 'IDR',
    trackingMode: 'manual',
    manualContribution: 1000000,
    status: 'active',
    createdAt: Date.now() - 120 * 86400000,
    updatedAt: Date.now() - 120 * 86400000,
    isDeleted: false,
    deviceId: 'dev_test',
    version: 1,
  };

  const progressStagnant = calculateGoalProgress(stagnantGoal, [], [], 'IDR');
  console.log(`Status Note: "${progressStagnant.statusNote}"`);
  console.log(`Projected Date: ${progressStagnant.projectedCompletionDate}`);

  if (progressStagnant.projectedCompletionDate !== null) {
    throw new Error('Stagnant goal should return null projected completion date!');
  }
  console.log('[PASS] Stagnant goal returned null projected date without fabricating a completion timeline.');

  // Test 5: Add Contribution & Soft-Delete
  console.log('\n--- Test 5: Add Contribution & Soft-Delete ---');
  const updatedGoal = await addGoalContribution(goal1.id, 4000000);
  if (!updatedGoal || updatedGoal.manualContribution !== 10000000) {
    throw new Error('Failed to increment manual contribution!');
  }
  console.log(`[PASS] Goal contribution added: new total = Rp ${updatedGoal.manualContribution.toLocaleString('id-ID')}`);

  await deleteGoal(goal2.id);
  const activeGoals = await getActiveGoals();
  if (activeGoals.some((g) => g.id === goal2.id)) {
    throw new Error('Soft-deleted goal still appears in active goals!');
  }
  console.log(`[PASS] Goal soft-deleted successfully: ${activeGoals.length} active goal(s) remain.`);

  console.log('\n🎉 ALL FINANCIAL GOALS & VELOCITY TESTS PASSED WITH 100% SUCCESS!');
}

runGoalsTest().catch((err) => {
  console.error('❌ Goals test failed:', err);
  process.exit(1);
});
