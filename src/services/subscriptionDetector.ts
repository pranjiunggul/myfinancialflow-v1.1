/**
 * Automatic Recurring Subscription Detection Service
 * Analyzes transaction history for repeating patterns (merchant + amount + interval).
 * Suggests recurring rules and computes total monthly committed spend.
 */

import { db } from '../db/database';
import { calculateNextExecutionDate } from './recurring';
import { calculateDescriptionSimilarity } from './syncDuplicates';
import type {
  Transaction,
  RecurringRule,
  SubscriptionPattern,
  RecurringFrequency,
  CurrencyCode,
} from '../types';

/**
 * Normalizes merchant description by stripping common transaction noise
 */
export function normalizeMerchant(desc: string): string {
  return desc
    .toLowerCase()
    .replace(/(pembayaran|tagihan|transfer\s+ke|langganan|subscription|biaya|fee|pt|cv)\s+/gi, '')
    .replace(/[0-9\-_./\\#*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Detects intervals between an array of date strings (sorted ascending)
 */
export function detectInterval(dates: string[]): {
  frequency: RecurringFrequency;
  intervalDays: number;
  dayOfMonth?: number;
  dayOfWeek?: number;
} | null {
  if (dates.length < 2) return null;

  const msPerDay = 24 * 60 * 60 * 1000;
  const intervals: number[] = [];
  const dateObjs = dates.map((d) => new Date(d + 'T12:00:00'));

  for (let i = 1; i < dateObjs.length; i++) {
    const diffDays = Math.round((dateObjs[i].getTime() - dateObjs[i - 1].getTime()) / msPerDay);
    if (diffDays > 0) {
      intervals.push(diffDays);
    }
  }

  if (intervals.length === 0) return null;

  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;

  // Check variance
  const maxDeviation = Math.max(...intervals.map((x) => Math.abs(x - avgInterval)));

  // Weekly: ~7 days (variance <= 3 days)
  if (avgInterval >= 5 && avgInterval <= 9 && maxDeviation <= 3) {
    return {
      frequency: 'weekly',
      intervalDays: 7,
      dayOfWeek: dateObjs[dateObjs.length - 1].getDay(),
    };
  }

  // Bi-weekly: ~14 days (variance <= 4 days)
  if (avgInterval >= 12 && avgInterval <= 16 && maxDeviation <= 4) {
    return {
      frequency: 'biweekly',
      intervalDays: 14,
      dayOfWeek: dateObjs[dateObjs.length - 1].getDay(),
    };
  }

  // Monthly: 25-35 days (variance <= 5 days)
  if (avgInterval >= 25 && avgInterval <= 35 && maxDeviation <= 6) {
    const lastDayOfMonth = dateObjs[dateObjs.length - 1].getDate();
    return {
      frequency: 'monthly',
      intervalDays: Math.round(avgInterval),
      dayOfMonth: lastDayOfMonth,
    };
  }

  // Yearly: 350-380 days
  if (avgInterval >= 350 && avgInterval <= 380 && maxDeviation <= 15) {
    return {
      frequency: 'yearly',
      intervalDays: 365,
      dayOfMonth: dateObjs[dateObjs.length - 1].getDate(),
    };
  }

  return null;
}

/**
 * Scans transaction history and extracts potential recurring subscription patterns
 */
export async function detectRecurringSubscriptions(): Promise<SubscriptionPattern[]> {
  const transactions = await db.transactions
    .filter((tx) => !tx.isDeleted && tx.type === 'expense')
    .toArray();

  if (transactions.length < 2) return [];

  const existingRules = await db.recurring_rules.filter((r) => !r.isDeleted).toArray();
  const dismissedPatterns = await db.subscription_patterns.filter((p) => p.dismissed).toArray();
  const dismissedKeys = new Set(dismissedPatterns.map((p) => p.patternKey));

  // 1. Cluster transactions by normalized merchant & approximate amount (within 5%)
  const clusters: Map<string, Transaction[]> = new Map();

  for (const tx of transactions) {
    const normMerchant = normalizeMerchant(tx.description);
    if (!normMerchant || normMerchant.length < 2) continue;

    let matchedClusterKey: string | null = null;

    for (const [key, clusterTxs] of clusters.entries()) {
      const sample = clusterTxs[0];
      const sampleNorm = normalizeMerchant(sample.description);
      const similarity = calculateDescriptionSimilarity(normMerchant, sampleNorm);

      if (similarity >= 0.7) {
        // Check amount tolerance within 5%
        const amountDiff = Math.abs(tx.amount - sample.amount) / Math.max(tx.amount, sample.amount, 1);
        if (amountDiff <= 0.05 && tx.currency === sample.currency) {
          matchedClusterKey = key;
          break;
        }
      }
    }

    if (matchedClusterKey) {
      clusters.get(matchedClusterKey)!.push(tx);
    } else {
      const newKey = `${normMerchant}_${Math.round(tx.amount)}`;
      clusters.set(newKey, [tx]);
    }
  }

  const detected: SubscriptionPattern[] = [];

  // 2. Evaluate clusters for regularity
  for (const [, clusterTxs] of clusters.entries()) {
    if (clusterTxs.length < 2) continue; // Need at least 2 occurrences

    // Sort ascending by date
    clusterTxs.sort((a, b) => a.date.localeCompare(b.date));
    const dates = clusterTxs.map((t) => t.date);

    const intervalInfo = detectInterval(dates);
    if (!intervalInfo) continue;

    const sample = clusterTxs[clusterTxs.length - 1];
    const patternKey = `${normalizeMerchant(sample.description)}_${Math.round(sample.amount)}_${intervalInfo.frequency}`;

    // Skip if user previously dismissed this pattern
    if (dismissedKeys.has(patternKey)) continue;

    // Skip if already covered by an existing recurring rule
    const ruleExists = existingRules.some((rule) => {
      const nameMatch = calculateDescriptionSimilarity(rule.title, sample.description) >= 0.65;
      const amtMatch = Math.abs(rule.amount - sample.amount) / Math.max(rule.amount, sample.amount, 1) <= 0.05;
      return nameMatch && amtMatch;
    });
    if (ruleExists) continue;

    detected.push({
      id: 'pat_' + crypto.randomUUID().slice(0, 8),
      patternKey,
      merchantName: sample.description,
      suggestedCategoryId: sample.categoryId,
      suggestedAccountId: sample.accountId,
      amount: sample.amount,
      currency: sample.currency,
      frequency: intervalInfo.frequency,
      intervalDays: intervalInfo.intervalDays,
      dayOfMonth: intervalInfo.dayOfMonth,
      dayOfWeek: intervalInfo.dayOfWeek,
      dismissed: false,
      sampleTransactionIds: clusterTxs.map((t) => t.id),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  return detected;
}

/**
 * Accepts a detected pattern and converts it into a permanent RecurringRule
 */
export async function acceptSubscriptionPattern(pattern: SubscriptionPattern): Promise<RecurringRule> {
  const today = new Date().toISOString().split('T')[0];
  const nextDate = calculateNextExecutionDate(today, pattern.frequency, 1, pattern.dayOfMonth);

  const newRule: RecurringRule = {
    id: 'rule_' + crypto.randomUUID().slice(0, 8),
    title: pattern.merchantName,
    type: 'expense',
    amount: pattern.amount,
    currency: pattern.currency,
    accountId: pattern.suggestedAccountId || 'acc_default',
    categoryId: pattern.suggestedCategoryId || 'cat_bills',
    frequency: pattern.frequency,
    intervalValue: 1,
    dayOfMonth: pattern.dayOfMonth,
    dayOfWeek: pattern.dayOfWeek,
    startDate: today,
    nextExecutionDate: nextDate,
    autoPost: true,
    isDeleted: false,
    updatedAt: Date.now(),
    version: 1,
  };

  await db.recurring_rules.add(newRule);

  // Mark pattern as processed
  await db.subscription_patterns.put({
    ...pattern,
    dismissed: true, // will not prompt again
    updatedAt: Date.now(),
  });

  return newRule;
}

/**
 * Dismisses a detected subscription pattern so the user is never asked again
 */
export async function dismissSubscriptionPattern(pattern: SubscriptionPattern): Promise<void> {
  await db.subscription_patterns.put({
    ...pattern,
    dismissed: true,
    updatedAt: Date.now(),
  });
}

/**
 * Normalizes any recurring frequency to an estimated monthly cost in base currency
 */
export function calculateMonthlyEquivalent(
  amount: number,
  frequency: RecurringFrequency,
  rateToBase = 1.0
): number {
  const baseAmt = amount * rateToBase;
  switch (frequency) {
    case 'daily':
      return baseAmt * 30;
    case 'weekly':
      return baseAmt * (52 / 12);
    case 'biweekly':
      return baseAmt * (26 / 12);
    case 'monthly':
      return baseAmt * 1;
    case 'yearly':
      return baseAmt / 12;
    default:
      return baseAmt;
  }
}

/**
 * Calculates the total committed monthly spend across all active recurring rules
 */
export function calculateTotalCommittedMonthlySpend(
  rules: RecurringRule[],
  fxRates: Record<string, number> = {},
  baseCurrency: CurrencyCode = 'IDR'
): { totalMonthlySpend: number; breakdown: Array<{ title: string; monthlyCost: number; originalAmount: number; currency: string }> } {
  let totalMonthlySpend = 0;
  const breakdown: Array<{ title: string; monthlyCost: number; originalAmount: number; currency: string }> = [];

  for (const rule of rules) {
    if (rule.isDeleted) continue;
    let rate = 1.0;
    if (rule.currency !== baseCurrency) {
      rate = fxRates[`${rule.currency}_${baseCurrency}`] || 1.0;
    }

    const monthlyCost = calculateMonthlyEquivalent(rule.amount, rule.frequency, rate);
    totalMonthlySpend += monthlyCost;

    breakdown.push({
      title: rule.title,
      monthlyCost,
      originalAmount: rule.amount,
      currency: rule.currency,
    });
  }

  return { totalMonthlySpend, breakdown };
}
