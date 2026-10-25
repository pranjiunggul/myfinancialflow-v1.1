/**
 * Annual "Wrapped" Financial Summary Calculation Service
 * Computes deep retrospective insights across any 12-month period:
 * Income vs Expense, Savings Rate, Top Categories, Extremes, Streaks, YoY comparison.
 */

import { db } from '../db/database';
import type { Transaction, CurrencyCode } from '../types';

export interface WrappedStats {
  periodYear: number;
  totalIncome: number;
  totalExpense: number;
  netSavings: number;
  savingsRate: number; // percentage 0-100
  topCategories: Array<{
    categoryId: string;
    categoryName: string;
    amount: number;
    percentage: number;
    color: string;
  }>;
  biggestExpense: {
    description: string;
    amount: number;
    date: string;
    categoryName: string;
  } | null;
  cheapestMonth: { monthName: string; amount: number } | null;
  mostExpensiveMonth: { monthName: string; amount: number } | null;
  monthlyBreakdown: Array<{
    monthKey: string; // YYYY-MM
    monthName: string; // "Jan", "Feb", etc.
    income: number;
    expense: number;
  }>;
  priorYearYoY?: {
    priorYear: number;
    expenseChangePercent: number;
    incomeChangePercent: number;
  };
  funStats: {
    longestNoSpendStreakDays: number;
    mostFrequentMerchant: { name: string; count: number } | null;
    topDayOfWeek: { dayName: string; totalAmount: number } | null;
  };
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Computes Annual Wrapped metrics for a specific calendar year
 */
export async function computeAnnualWrapped(
  year: number = new Date().getFullYear(),
  _baseCurrency: CurrencyCode = 'IDR'
): Promise<WrappedStats> {
  const [allTransactions, categories] = await Promise.all([
    db.transactions.filter((tx) => !tx.isDeleted).toArray(),
    db.categories.toArray(),
  ]);

  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  // 1. Filter current year and prior year transactions
  const currentYearPrefix = `${year}-`;
  const priorYearPrefix = `${year - 1}-`;

  const currentYearTxs = allTransactions.filter((tx) => tx.date.startsWith(currentYearPrefix));
  const priorYearTxs = allTransactions.filter((tx) => tx.date.startsWith(priorYearPrefix));

  let totalIncome = 0;
  let totalExpense = 0;

  const categorySpending: Map<string, number> = new Map();
  let biggestExpenseTx: Transaction | null = null;

  // Monthly buckets: 12 months (0 to 11)
  const monthlyBuckets = Array.from({ length: 12 }, (_, i) => ({
    monthIndex: i,
    monthKey: `${year}-${String(i + 1).padStart(2, '0')}`,
    monthName: MONTH_NAMES[i].slice(0, 3),
    income: 0,
    expense: 0,
  }));

  // Merchant frequency
  const merchantCounts: Map<string, number> = new Map();

  // Day of week spending
  const dayOfWeekSpending = [0, 0, 0, 0, 0, 0, 0];

  // Daily spend for no-spend streak
  const dailySpendMap: Map<string, number> = new Map();

  for (const tx of currentYearTxs) {
    const amount = tx.baseAmount || tx.amount;
    const txMonth = parseInt(tx.date.split('-')[1], 10) - 1;

    if (tx.type === 'income') {
      totalIncome += amount;
      if (txMonth >= 0 && txMonth < 12) {
        monthlyBuckets[txMonth].income += amount;
      }
    } else if (tx.type === 'expense') {
      totalExpense += amount;
      if (txMonth >= 0 && txMonth < 12) {
        monthlyBuckets[txMonth].expense += amount;
      }

      // Category breakdown
      const catId = tx.categoryId || 'cat_unknown';
      categorySpending.set(catId, (categorySpending.get(catId) || 0) + amount);

      // Biggest single expense
      if (!biggestExpenseTx || amount > (biggestExpenseTx.baseAmount || biggestExpenseTx.amount)) {
        biggestExpenseTx = tx;
      }

      // Merchant frequency
      const cleanDesc = tx.description.trim();
      if (cleanDesc.length > 1) {
        merchantCounts.set(cleanDesc, (merchantCounts.get(cleanDesc) || 0) + 1);
      }

      // Day of week
      const d = new Date(tx.date + 'T12:00:00');
      const dayIdx = d.getDay();
      dayOfWeekSpending[dayIdx] += amount;

      // Daily spend tracking
      dailySpendMap.set(tx.date, (dailySpendMap.get(tx.date) || 0) + amount);
    }
  }

  // Savings rate
  const netSavings = totalIncome - totalExpense;
  const savingsRate = totalIncome > 0 ? Math.max(0, Math.round((netSavings / totalIncome) * 100)) : 0;

  // Top Categories (Top 5)
  const topCategories = Array.from(categorySpending.entries())
    .map(([catId, amount]) => {
      const cat = categoryMap.get(catId);
      return {
        categoryId: catId,
        categoryName: cat?.name || 'Other',
        amount,
        percentage: totalExpense > 0 ? Math.round((amount / totalExpense) * 100) : 0,
        color: cat?.color || '#6366f1',
      };
    })
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  // Extremes: Cheapest and Most Expensive Month (considering active elapsed months)
  const elapsedMonths = monthlyBuckets.filter((m) => m.expense > 0 || m.income > 0);
  let cheapestMonth: { monthName: string; amount: number } | null = null;
  let mostExpensiveMonth: { monthName: string; amount: number } | null = null;

  if (elapsedMonths.length > 0) {
    const sortedByExpense = [...elapsedMonths].sort((a, b) => a.expense - b.expense);
    cheapestMonth = {
      monthName: sortedByExpense[0].monthName,
      amount: sortedByExpense[0].expense,
    };
    mostExpensiveMonth = {
      monthName: sortedByExpense[sortedByExpense.length - 1].monthName,
      amount: sortedByExpense[sortedByExpense.length - 1].expense,
    };
  }

  // Longest No-Spend Streak
  let longestStreak = 0;
  let currentStreak = 0;
  // Iterate all days of the year up to today
  const startDay = new Date(`${year}-01-01T12:00:00`);
  const today = new Date();
  const endDay = year === today.getFullYear() ? today : new Date(`${year}-12-31T12:00:00`);

  const cur = new Date(startDay);
  while (cur <= endDay) {
    const dateStr = cur.toISOString().split('T')[0];
    const daySpend = dailySpendMap.get(dateStr) || 0;
    if (daySpend === 0) {
      currentStreak++;
      if (currentStreak > longestStreak) longestStreak = currentStreak;
    } else {
      currentStreak = 0;
    }
    cur.setDate(cur.getDate() + 1);
  }

  // Most frequent merchant
  let topMerchant: { name: string; count: number } | null = null;
  for (const [name, count] of merchantCounts.entries()) {
    if (!topMerchant || count > topMerchant.count) {
      topMerchant = { name, count };
    }
  }

  // Top spending day of week
  let maxDaySpend = -1;
  let topDayIdx = 0;
  dayOfWeekSpending.forEach((amt, idx) => {
    if (amt > maxDaySpend) {
      maxDaySpend = amt;
      topDayIdx = idx;
    }
  });

  // Prior Year YoY Comparison
  let priorYearYoY: WrappedStats['priorYearYoY'];
  if (priorYearTxs.length > 0) {
    let priorIncome = 0;
    let priorExpense = 0;
    for (const tx of priorYearTxs) {
      const amt = tx.baseAmount || tx.amount;
      if (tx.type === 'income') priorIncome += amt;
      else if (tx.type === 'expense') priorExpense += amt;
    }

    priorYearYoY = {
      priorYear: year - 1,
      expenseChangePercent:
        priorExpense > 0 ? Math.round(((totalExpense - priorExpense) / priorExpense) * 100) : 0,
      incomeChangePercent:
        priorIncome > 0 ? Math.round(((totalIncome - priorIncome) / priorIncome) * 100) : 0,
    };
  }

  return {
    periodYear: year,
    totalIncome,
    totalExpense,
    netSavings,
    savingsRate,
    topCategories,
    biggestExpense: biggestExpenseTx
      ? {
          description: biggestExpenseTx.description,
          amount: biggestExpenseTx.baseAmount || biggestExpenseTx.amount,
          date: biggestExpenseTx.date,
          categoryName: categoryMap.get(biggestExpenseTx.categoryId)?.name || 'General',
        }
      : null,
    cheapestMonth,
    mostExpensiveMonth,
    monthlyBreakdown: monthlyBuckets,
    priorYearYoY,
    funStats: {
      longestNoSpendStreakDays: longestStreak,
      mostFrequentMerchant: topMerchant,
      topDayOfWeek: maxDaySpend > 0 ? { dayName: DAY_NAMES[topDayIdx], totalAmount: maxDaySpend } : null,
    },
  };
}
