import { db } from '../db/database';
import type { RecurringRule, Transaction } from '../types';
import { createTransaction, recordAudit, recalculateAllAccountBalances } from './ledger';

/**
 * Calculate the next execution date given a current date and frequency rule
 */
export function calculateNextExecutionDate(
  currentDateStr: string,
  frequency: RecurringRule['frequency'],
  intervalValue: number = 1,
  dayOfMonth?: number
): string {
  const date = new Date(currentDateStr + 'T12:00:00');

  switch (frequency) {
    case 'daily':
      date.setDate(date.getDate() + intervalValue);
      break;

    case 'weekly':
      date.setDate(date.getDate() + 7 * intervalValue);
      break;

    case 'biweekly':
      date.setDate(date.getDate() + 14 * intervalValue);
      break;

    case 'monthly': {
      const targetMonth = date.getMonth() + intervalValue;
      date.setMonth(targetMonth);
      if (dayOfMonth) {
        date.setDate(Math.min(dayOfMonth, new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()));
      }
      break;
    }

    case 'yearly':
      date.setFullYear(date.getFullYear() + intervalValue);
      break;
  }

  return date.toISOString().split('T')[0];
}

/**
 * Process all due recurring rules and monthly bank fees
 */
export async function processDueRecurringRules(): Promise<{
  postedTransactions: Transaction[];
  processedCount: number;
}> {
  const today = new Date().toISOString().split('T')[0];
  const now = Date.now();
  const postedTransactions: Transaction[] = [];

  // 1. Process Generic Recurring Rules
  const activeRules = await db.recurring_rules.filter((r) => !r.isDeleted).toArray();

  for (const rule of activeRules) {
    if (rule.nextExecutionDate <= today && rule.autoPost) {
      // Create auto transaction
      const tx = await createTransaction({
        type: rule.type,
        amount: rule.amount,
        currency: rule.currency,
        exchangeRateToBase: 1.0,
        baseAmount: rule.amount,
        accountId: rule.accountId,
        categoryId: rule.categoryId,
        date: rule.nextExecutionDate,
        timestamp: now,
        description: `[Recurring] ${rule.title}`,
        inputSource: 'recurring',
      });

      postedTransactions.push(tx);

      // Advance next execution date
      const nextDate = calculateNextExecutionDate(
        rule.nextExecutionDate,
        rule.frequency,
        rule.intervalValue,
        rule.dayOfMonth
      );

      await db.recurring_rules.update(rule.id, {
        nextExecutionDate: nextDate,
        lastProcessedAt: now,
        updatedAt: now,
      });

      await recordAudit(
        'recurring',
        rule.id,
        'update',
        `Auto-posted recurring transaction "${rule.title}" for date ${rule.nextExecutionDate}`
      );
    }
  }

  // 2. Process Monthly Bank Admin Fees
  const bankAccounts = await db.accounts
    .filter((a) => !a.isDeleted && a.type === 'bank' && !!a.monthlyAdminFee?.enabled)
    .toArray();

  const currentYearMonth = today.slice(0, 7); // 'YYYY-MM'
  const todayDay = new Date().getDate();

  for (const account of bankAccounts) {
    const feeConfig = account.monthlyAdminFee;
    if (!feeConfig || !feeConfig.enabled || !feeConfig.autoPost) continue;

    // Check if charge date has arrived this month
    if (todayDay >= feeConfig.dayOfMonth) {
      // Check if fee was already posted for this account this month
      const feeCategory = feeConfig.categoryId || 'cat_fees';
      const existingFeeTx = await db.transactions
        .filter(
          (t) =>
            !t.isDeleted &&
            t.accountId === account.id &&
            t.categoryId === feeCategory &&
            t.date.startsWith(currentYearMonth) &&
            t.description.includes('Monthly Bank Admin Fee')
        )
        .first();

      if (!existingFeeTx) {
        // Auto-post the monthly fee transaction
        const feeDate = `${currentYearMonth}-${String(feeConfig.dayOfMonth).padStart(2, '0')}`;
        const tx = await createTransaction({
          type: 'expense',
          amount: feeConfig.amount,
          currency: account.currency,
          exchangeRateToBase: 1.0,
          baseAmount: feeConfig.amount,
          accountId: account.id,
          categoryId: feeCategory,
          date: feeDate > today ? today : feeDate,
          timestamp: now,
          description: `Monthly Bank Admin Fee - ${account.name}`,
          inputSource: 'recurring',
        });

        postedTransactions.push(tx);
        await recordAudit(
          'account',
          account.id,
          'update',
          `Auto-posted monthly bank admin fee of ${feeConfig.amount} ${account.currency} for ${account.name}`
        );
      }
    }
  }

  if (postedTransactions.length > 0) {
    await recalculateAllAccountBalances();
  }

  return { postedTransactions, processedCount: postedTransactions.length };
}

/**
 * Create a new recurring rule
 */
export async function createRecurringRule(rule: Omit<RecurringRule, 'id' | 'isDeleted' | 'updatedAt' | 'version'>): Promise<RecurringRule> {
  const id = 'rec_' + crypto.randomUUID();
  const now = Date.now();

  const newRule: RecurringRule = {
    ...rule,
    id,
    isDeleted: false,
    updatedAt: now,
    version: 1,
  };

  await db.recurring_rules.put(newRule);
  await recordAudit('recurring', id, 'create', `Created recurring rule: ${newRule.title} (${newRule.frequency})`, undefined, newRule);
  return newRule;
}
