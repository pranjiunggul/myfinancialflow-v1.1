/**
 * Proactive Financial Advisor & Notification Fallback Engine for FinanceFlow
 * Evaluates spending spikes, budget overruns, and upcoming bills.
 * Delivers alerts primarily via In-App Banners with graceful fallback for OS/SW notifications.
 */

import { db } from '../db/database';
import { getBudgetPerformance } from './analytics';
import type { ProactiveAlertItem, CurrencyCode } from '../types';

type AlertListener = (alerts: ProactiveAlertItem[]) => void;
const listeners = new Set<AlertListener>();
let cachedAlerts: ProactiveAlertItem[] = [];

export function subscribeToProactiveAlerts(listener: AlertListener): () => void {
  listeners.add(listener);
  listener(cachedAlerts);
  return () => {
    listeners.delete(listener);
  };
}

export function dismissAlert(alertId: string): void {
  cachedAlerts = cachedAlerts.filter((a) => a.id !== alertId);
  listeners.forEach((l) => l(cachedAlerts));
}

/**
 * Request OS-level notification permission gracefully without crashing on unsupported platforms
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    console.log('[Notification] OS notifications not supported on this platform. In-app alerts active.');
    return false;
  }

  try {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  } catch (err) {
    console.warn('[Notification] Permission request failed, falling back to in-app alerts:', err);
    return false;
  }
}

/**
 * Dispatch an OS notification with graceful in-app degradation (iOS Safari safe)
 */
export function dispatchNotification(alert: ProactiveAlertItem): void {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    // Graceful fallback: do nothing, in-app banner will display
    return;
  }

  if (Notification.permission === 'granted') {
    try {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then((reg) => {
          reg.showNotification(alert.title, {
            body: alert.message,
            icon: '/pwa-192x192.png',
            tag: alert.id,
          });
        }).catch(() => {
          new Notification(alert.title, { body: alert.message });
        });
      } else {
        new Notification(alert.title, { body: alert.message });
      }
    } catch (err) {
      // Gracefully catch iOS Safari / platform security restrictions
      console.log('[Notification] Native push suppressed by platform. Relying on in-app banner.');
    }
  }
}

/**
 * Main Proactive Alert Evaluator
 * Runs on app startup / foreground resume
 */
export async function evaluateProactiveFinancialAlerts(
  baseCurrency: CurrencyCode = 'IDR'
): Promise<ProactiveAlertItem[]> {
  const alerts: ProactiveAlertItem[] = [];
  const now = Date.now();
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const todayStr = new Date().toISOString().split('T')[0];

  const [transactions, categories, recurringRules, debts] = await Promise.all([
    db.transactions.filter((t) => !t.isDeleted).toArray(),
    db.categories.filter((c) => !c.isDeleted).toArray(),
    db.recurring_rules.filter((r) => !r.isDeleted).toArray(),
    db.debts_receivables.filter((d) => !d.isDeleted).toArray(),
  ]);

  // 1. Evaluate Budget Overruns (≥100%) and Warnings (≥80%)
  const budgets = getBudgetPerformance(transactions, categories, baseCurrency);
  for (const b of budgets) {
    if (b.status === 'over_budget') {
      alerts.push({
        id: `alert_budget_over_${b.categoryId}`,
        type: 'budget_overrun',
        title: `Budget Exceeded: ${b.name}`,
        message: `You have spent ${b.actualSpent.toLocaleString()} ${baseCurrency} (${b.percentUsed}%) exceeding your ${b.budget.toLocaleString()} ${baseCurrency} budget limit!`,
        severity: 'critical',
        timestamp: now,
        linkAction: 'budget',
      });
    } else if (b.status === 'warning') {
      alerts.push({
        id: `alert_budget_warn_${b.categoryId}`,
        type: 'budget_warning',
        title: `Budget Alert: ${b.name}`,
        message: `You have consumed ${b.percentUsed}% of your ${b.name} budget (${b.actualSpent.toLocaleString()} / ${b.budget.toLocaleString()} ${baseCurrency}).`,
        severity: 'warning',
        timestamp: now,
        linkAction: 'budget',
      });
    }
  }

  // 2. Evaluate Spending Spikes (>2.5x 30-day category average)
  const category30dTotals = new Map<string, { sum: number; count: number }>();
  const thirtyDaysAgo = now - 30 * MS_PER_DAY;

  for (const tx of transactions) {
    if (tx.type === 'expense' && tx.timestamp >= thirtyDaysAgo) {
      const cur = category30dTotals.get(tx.categoryId) || { sum: 0, count: 0 };
      category30dTotals.set(tx.categoryId, {
        sum: cur.sum + (tx.baseAmount || tx.amount),
        count: cur.count + 1,
      });
    }
  }

  const sevenDaysAgo = now - 7 * MS_PER_DAY;
  for (const tx of transactions) {
    if (tx.type === 'expense' && tx.timestamp >= sevenDaysAgo) {
      const stats = category30dTotals.get(tx.categoryId);
      if (stats) {
        const txAmt = tx.baseAmount || tx.amount;
        const otherCount = stats.count - 1;
        // Compare against leave-one-out baseline average
        if (otherCount >= 2) {
          const baselineAvg = (stats.sum - txAmt) / otherCount;
          if (baselineAvg > 0 && txAmt >= 2.5 * baselineAvg && txAmt > 50000) {
            const catName = categories.find((c) => c.id === tx.categoryId)?.name || 'Expense';
            const realMultiplier = Math.round((txAmt / baselineAvg) * 10) / 10;
            const multiplierStr = realMultiplier % 1 === 0 ? `${realMultiplier}x` : `${realMultiplier.toFixed(1)}x`;
            alerts.push({
              id: `alert_spike_${tx.id}`,
              type: 'spending_spike',
              title: `Unusual Spending Spike in ${catName}`,
              message: `Transaction "${tx.description}" (${txAmt.toLocaleString()} ${baseCurrency}) is ${multiplierStr} higher than your usual ${Math.round(baselineAvg).toLocaleString()} ${baseCurrency} average.`,
              severity: 'warning',
              timestamp: now,
              linkAction: 'transactions',
            });
          }
        }
      }
    }
  }

  // 3. Upcoming Recurring Bills Due within 3 Days
  const threeDaysFutureStr = new Date(now + 3 * MS_PER_DAY).toISOString().split('T')[0];
  for (const rule of recurringRules) {
    if (rule.nextExecutionDate >= todayStr && rule.nextExecutionDate <= threeDaysFutureStr) {
      alerts.push({
        id: `alert_bill_${rule.id}_${rule.nextExecutionDate}`,
        type: 'bill_due',
        title: `Upcoming Bill Due: ${rule.title}`,
        message: `${rule.title} (${rule.amount.toLocaleString()} ${rule.currency}) is scheduled for ${rule.nextExecutionDate}.`,
        severity: 'info',
        timestamp: now,
        linkAction: 'recurring',
      });
    }
  }

  // 4. Upcoming Debts / Receivables Due within 3 Days
  for (const d of debts) {
    if (d.status !== 'settled' && d.dueDate && d.dueDate >= todayStr && d.dueDate <= threeDaysFutureStr) {
      alerts.push({
        id: `alert_debt_${d.id}_${d.dueDate}`,
        type: 'debt_due',
        title: d.type === 'debt' ? `Debt Payment Due: ${d.personName}` : `Receivable Due Collection: ${d.personName}`,
        message: `${d.personName} (${d.currentBalance.toLocaleString()} ${d.currency}) is due on ${d.dueDate}.`,
        severity: 'warning',
        timestamp: now,
        linkAction: 'debts',
      });
    }
  }

  // Update cached alerts and notify subscribers
  cachedAlerts = alerts;
  listeners.forEach((l) => l(alerts));

  // Dispatch background notification for the most critical alert
  if (alerts.length > 0) {
    const topAlert = alerts.find((a) => a.severity === 'critical') || alerts[0];
    dispatchNotification(topAlert);
  }

  return alerts;
}
