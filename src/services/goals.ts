/**
 * Financial Goals Service
 * Handles CRUD, velocity-based projected completion date calculation,
 * and account-linked vs manual savings progress tracking.
 */

import { db, getOrCreateDeviceId } from '../db/database';
import type { FinancialGoal, Account, Transaction, CurrencyCode } from '../types';

export interface GoalProgressResult {
  currentAmount: number;
  targetAmount: number;
  percentage: number;
  remainingAmount: number;
  monthlyVelocity: number;
  projectedCompletionDate: string | null; // ISO YYYY-MM-DD or null if pace is stagnant
  monthsRemaining: number | null;
  isCompleted: boolean;
  isOverdue: boolean;
  statusNote: string;
}

/**
 * Calculates current progress and dynamic velocity-projected completion date
 */
export function calculateGoalProgress(
  goal: FinancialGoal,
  accounts: Account[],
  transactions: Transaction[],
  _baseCurrency: CurrencyCode = 'IDR'
): GoalProgressResult {
  let currentAmount = 0;

  if (goal.trackingMode === 'linked_account' && goal.linkedAccountId) {
    const linkedAcc = accounts.find((a) => a.id === goal.linkedAccountId && !a.isDeleted);
    if (linkedAcc) {
      currentAmount = Math.max(0, linkedAcc.currentBalance);
    }
  } else {
    // Default manual mode
    currentAmount = Math.max(0, goal.manualContribution || goal.currentAmount || 0);
  }

  const targetAmount = Math.max(1, goal.targetAmount);
  const remainingAmount = Math.max(0, targetAmount - currentAmount);
  const percentage = Math.min(100, Math.round((currentAmount / targetAmount) * 100));
  const isCompleted = currentAmount >= targetAmount;

  const todayStr = new Date().toISOString().slice(0, 10);
  const isOverdue = !!goal.targetDate && goal.targetDate < todayStr && !isCompleted;

  // Calculate 90-day saving velocity (monthly average net contribution)
  const nowMs = Date.now();
  const ninetyDaysAgoMs = nowMs - 90 * 86400000;
  let totalNetContribution90d = 0;

  if (goal.trackingMode === 'linked_account' && goal.linkedAccountId) {
    // Sum all transactions affecting the linked account over the last 90 days
    const recentTxs = transactions.filter(
      (t) => !t.isDeleted && (t.timestamp || 0) >= ninetyDaysAgoMs
    );
    for (const t of recentTxs) {
      const amt = t.baseAmount || t.amount;
      if (t.accountId === goal.linkedAccountId) {
        if (t.type === 'income') totalNetContribution90d += amt;
        else if (t.type === 'expense') totalNetContribution90d -= amt;
        else if (t.type === 'transfer') totalNetContribution90d -= (amt + (t.transferMeta?.feeAmount || 0));
      } else if (t.transferMeta?.toAccountId === goal.linkedAccountId && t.type === 'transfer') {
        totalNetContribution90d += amt;
      }
    }
  } else {
    // Manual tracking mode: check goal-specific transactions or amortize manual contribution
    const goalTxs = transactions.filter(
      (t) =>
        !t.isDeleted &&
        (t.timestamp || 0) >= ninetyDaysAgoMs &&
        (t.tags?.includes(goal.id) || t.description.toLowerCase().includes(goal.name.toLowerCase()))
    );
    if (goalTxs.length > 0) {
      for (const t of goalTxs) {
        totalNetContribution90d += (t.baseAmount || t.amount);
      }
    } else {
      const lastActivityMs = Math.max(goal.updatedAt || 0, goal.createdAt || 0);
      const daysSinceActivity = (nowMs - lastActivityMs) / 86400000;
      if (daysSinceActivity >= 90) {
        // Zero contribution activity in trailing 90 days
        totalNetContribution90d = 0;
      } else {
        // Amortize current manual contribution across goal lifetime if active recently
        const goalAgeDays = Math.max(1, Math.min(90, Math.round((nowMs - goal.createdAt) / 86400000)));
        totalNetContribution90d = (currentAmount / goalAgeDays) * Math.min(90, goalAgeDays);
      }
    }
  }

  // Monthly velocity is the average 30-day run rate based on the 90-day observation window
  const monthlyVelocity = Math.max(0, Math.round((totalNetContribution90d / 3)));

  let projectedCompletionDate: string | null = null;
  let monthsRemaining: number | null = null;
  let statusNote = '';

  if (isCompleted) {
    statusNote = 'Goal fully achieved! 🎉';
  } else if (monthlyVelocity > 0) {
    monthsRemaining = Math.ceil(remainingAmount / monthlyVelocity);
    const projDate = new Date(nowMs + monthsRemaining * 30.44 * 86400000);
    projectedCompletionDate = projDate.toISOString().slice(0, 10);
    statusNote = `At your current pace (~${monthlyVelocity.toLocaleString('id-ID')}/mo), projected completion is ${projectedCompletionDate}.`;
  } else {
    statusNote = 'Saving pace is currently stagnant. No completion date projected at this rate.';
  }

  return {
    currentAmount,
    targetAmount,
    percentage,
    remainingAmount,
    monthlyVelocity,
    projectedCompletionDate,
    monthsRemaining,
    isCompleted,
    isOverdue,
    statusNote,
  };
}

/**
 * Creates a new financial goal
 */
export async function createGoal(
  goalData: Omit<FinancialGoal, 'id' | 'createdAt' | 'updatedAt' | 'isDeleted' | 'deviceId' | 'version'>
): Promise<FinancialGoal> {
  const deviceId = getOrCreateDeviceId();
  const id = 'goal_' + crypto.randomUUID().slice(0, 8);
  const now = Date.now();

  const newGoal: FinancialGoal = {
    ...goalData,
    id,
    currentAmount: goalData.manualContribution || 0,
    trackingMode: goalData.trackingMode || 'manual',
    manualContribution: goalData.manualContribution || 0,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    isDeleted: false,
    deviceId,
    version: 1,
  };

  await db.financial_goals.add(newGoal);

  // Record audit log
  await db.audit_logs.add({
    id: 'audit_' + crypto.randomUUID().slice(0, 8),
    entityType: 'goal',
    entityId: id,
    action: 'create',
    deviceId,
    timestamp: now,
    changeSummary: `Created financial goal "${newGoal.name}" with target ${newGoal.currency} ${newGoal.targetAmount}.`,
  });

  return newGoal;
}

/**
 * Updates an existing goal
 */
export async function updateGoal(
  id: string,
  updates: Partial<FinancialGoal>
): Promise<FinancialGoal | null> {
  const goal = await db.financial_goals.get(id);
  if (!goal) return null;

  const now = Date.now();
  const updatedGoal: FinancialGoal = {
    ...goal,
    ...updates,
    updatedAt: now,
    version: (goal.version || 1) + 1,
  };

  await db.financial_goals.put(updatedGoal);

  await db.audit_logs.add({
    id: 'audit_' + crypto.randomUUID().slice(0, 8),
    entityType: 'goal',
    entityId: id,
    action: 'update',
    deviceId: getOrCreateDeviceId(),
    timestamp: now,
    changeSummary: `Updated financial goal "${updatedGoal.name}".`,
  });

  return updatedGoal;
}

/**
 * Soft deletes a goal
 */
export async function deleteGoal(id: string): Promise<boolean> {
  const goal = await db.financial_goals.get(id);
  if (!goal) return false;

  const now = Date.now();
  await db.financial_goals.update(id, {
    isDeleted: true,
    updatedAt: now,
    version: (goal.version || 1) + 1,
  });

  await db.audit_logs.add({
    id: 'audit_' + crypto.randomUUID().slice(0, 8),
    entityType: 'goal',
    entityId: id,
    action: 'soft_delete',
    deviceId: getOrCreateDeviceId(),
    timestamp: now,
    changeSummary: `Soft-deleted financial goal "${goal.name}".`,
  });

  return true;
}

/**
 * Adds a manual contribution to a goal
 */
export async function addGoalContribution(id: string, amount: number): Promise<FinancialGoal | null> {
  const goal = await db.financial_goals.get(id);
  if (!goal) return null;

  const newManual = (goal.manualContribution || 0) + amount;
  return updateGoal(id, {
    manualContribution: newManual,
    currentAmount: newManual,
  });
}

/**
 * Fetches all active goals
 */
export async function getActiveGoals(): Promise<FinancialGoal[]> {
  const all = await db.financial_goals.toArray();
  return all.filter((g) => !g.isDeleted);
}
