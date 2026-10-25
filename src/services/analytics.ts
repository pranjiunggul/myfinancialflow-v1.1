import type {
  Transaction,
  Account,
  Category,
  CurrencyCode,
  InvestmentAsset,
} from '../types';

export interface MonthlyCashFlow {
  month: string;       // 'YYYY-MM'
  label: string;       // e.g. 'Oct 2026'
  income: number;
  expense: number;
  net: number;
  savingsRate: number; // percentage
}

export interface CategorySpendingShare {
  categoryId: string;
  name: string;
  color: string;
  icon: string;
  total: number;
  percentage: number;
}

export interface BudgetStatus {
  categoryId: string;
  name: string;
  color: string;
  icon: string;
  budget: number;
  actualSpent: number;
  remaining: number;
  percentUsed: number;
  status: 'safe' | 'warning' | 'over_budget';
}

export interface NetWorthPoint {
  date: string;        // 'YYYY-MM-DD'
  label: string;
  netWorth: number;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Computes monthly cash flow (income vs expense) for the last N months
 */
export function getMonthlyCashFlow(
  transactions: Transaction[],
  numMonths: number = 6
): MonthlyCashFlow[] {
  const result: MonthlyCashFlow[] = [];
  const now = new Date();

  // Generate month keys for past N months
  for (let i = numMonths - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 15);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const monthKey = `${year}-${month}`;
    const label = `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear().toString().slice(2)}`;

    result.push({
      month: monthKey,
      label,
      income: 0,
      expense: 0,
      net: 0,
      savingsRate: 0,
    });
  }

  const activeTxs = transactions.filter((t) => !t.isDeleted);
  const map = new Map<string, MonthlyCashFlow>();
  for (const item of result) {
    map.set(item.month, item);
  }

  for (const tx of activeTxs) {
    const monthKey = tx.date.slice(0, 7);
    const entry = map.get(monthKey);
    if (!entry) continue;

    const amount = tx.baseAmount || tx.amount;
    if (tx.type === 'income') {
      entry.income += amount;
    } else if (tx.type === 'expense') {
      entry.expense += amount;
    }
  }

  for (const item of result) {
    item.net = item.income - item.expense;
    item.savingsRate = item.income > 0 ? Math.round((item.net / item.income) * 100) : 0;
  }

  return result;
}

/**
 * Computes spending distribution by category for a specific month
 */
export function getCategorySpendingDistribution(
  transactions: Transaction[],
  categories: Category[],
  monthPrefix?: string
): CategorySpendingShare[] {
  const targetMonth = monthPrefix || new Date().toISOString().slice(0, 7);
  const activeTxs = transactions.filter(
    (t) => !t.isDeleted && t.type === 'expense' && t.date.startsWith(targetMonth)
  );

  const spendingMap = new Map<string, number>();
  let totalExpense = 0;

  for (const tx of activeTxs) {
    const amount = tx.baseAmount || tx.amount;
    totalExpense += amount;
    const cur = spendingMap.get(tx.categoryId) || 0;
    spendingMap.set(tx.categoryId, cur + amount);
  }

  const categoryLookup = new Map<string, Category>();
  for (const cat of categories) {
    categoryLookup.set(cat.id, cat);
  }

  const result: CategorySpendingShare[] = [];
  for (const [catId, amount] of spendingMap.entries()) {
    const cat = categoryLookup.get(catId);
    result.push({
      categoryId: catId,
      name: cat?.name || 'Uncategorized',
      color: cat?.color || '#94a3b8',
      icon: cat?.icon || 'Folder',
      total: amount,
      percentage: totalExpense > 0 ? Math.round((amount / totalExpense) * 100) : 0,
    });
  }

  return result.sort((a, b) => b.total - a.total);
}

/**
 * Computes budget vs actual metrics with overrun warnings
 */
export function getBudgetPerformance(
  transactions: Transaction[],
  categories: Category[],
  monthPrefix?: string
): BudgetStatus[] {
  const targetMonth = monthPrefix || new Date().toISOString().slice(0, 7);
  const activeTxs = transactions.filter(
    (t) => !t.isDeleted && t.type === 'expense' && t.date.startsWith(targetMonth)
  );

  const actualSpentMap = new Map<string, number>();
  for (const tx of activeTxs) {
    const cur = actualSpentMap.get(tx.categoryId) || 0;
    actualSpentMap.set(tx.categoryId, cur + (tx.baseAmount || tx.amount));
  }

  // Filter categories that have a budget set
  const budgetedCategories = categories.filter(
    (c) => !c.isDeleted && (c.budgetMonthly || 0) > 0
  );

  return budgetedCategories.map((cat) => {
    const budget = cat.budgetMonthly!;
    const actualSpent = actualSpentMap.get(cat.id) || 0;
    const remaining = budget - actualSpent;
    const percentUsed = Math.round((actualSpent / budget) * 100);

    let status: BudgetStatus['status'] = 'safe';
    if (percentUsed >= 100) {
      status = 'over_budget';
    } else if (percentUsed >= 80) {
      status = 'warning';
    }

    return {
      categoryId: cat.id,
      name: cat.name,
      color: cat.color,
      icon: cat.icon,
      budget,
      actualSpent,
      remaining,
      percentUsed,
      status,
    };
  }).sort((a, b) => b.percentUsed - a.percentUsed);
}

/**
 * Computes historical Net Worth curve over time
 */
export function getNetWorthTimeline(
  transactions: Transaction[],
  accounts: Account[],
  baseCurrency: CurrencyCode,
  days: number = 30,
  investmentAssets: InvestmentAsset[] = []
): NetWorthPoint[] {
  const result: NetWorthPoint[] = [];
  const now = new Date();

  // 1. Current Net Worth (Cash/Bank accounts + Non-cash investment assets)
  const activeAccounts = accounts.filter((a) => !a.isDeleted && a.includeInNetWorth);
  const accountsTotal = activeAccounts.reduce((sum, acc) => {
    const rate = acc.currency === baseCurrency ? 1.0 : acc.currency === 'USD' ? 16250 : 1.0;
    return sum + acc.currentBalance * rate;
  }, 0);

  const activeAssets = (investmentAssets || []).filter((a) => !a.isDeleted && a.includeInNetWorth);
  const assetsTotal = activeAssets.reduce((sum, asset) => {
    const rate = asset.currency === baseCurrency ? 1.0 : asset.currency === 'USD' ? 16250 : 1.0;
    return sum + asset.currentValue * rate;
  }, 0);

  const currentTotal = accountsTotal + assetsTotal;

  // 2. Generate daily dates backwards
  const dateMap = new Map<string, number>();
  for (let i = days; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    dateMap.set(dateStr, 0);
  }

  // Calculate daily net delta
  const sortedTxs = [...transactions]
    .filter((t) => !t.isDeleted)
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  let rollingNetWorth = currentTotal;
  const dateKeys = Array.from(dateMap.keys()).reverse();

  // Work backwards from today's net worth
  for (const dateKey of dateKeys) {
    const dayTxs = sortedTxs.filter((t) => t.date === dateKey);
    // Reverse the day's transactions to find previous day balance
    let dayNetInflow = 0;
    for (const tx of dayTxs) {
      const amt = tx.baseAmount || tx.amount;
      if (tx.type === 'income') dayNetInflow += amt;
      else if (tx.type === 'expense') dayNetInflow -= amt;
    }

    result.unshift({
      date: dateKey,
      label: dateKey.slice(5), // 'MM-DD'
      netWorth: Math.round(rollingNetWorth),
    });

    rollingNetWorth -= dayNetInflow;
  }

  return result;
}

/**
 * Computes projected month-end burn rate based on current date
 */
export function getProjectedMonthBurn(
  currentMonthExpense: number,
  now: Date = new Date()
): { daysPassed: number; daysTotal: number; projectedMonthEnd: number; dailyBurnAverage: number } {
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysTotal = new Date(year, month + 1, 0).getDate();
  const daysPassed = Math.max(1, now.getDate());

  const dailyBurnAverage = Math.round(currentMonthExpense / daysPassed);
  const projectedMonthEnd = Math.round(dailyBurnAverage * daysTotal);

  return {
    daysPassed,
    daysTotal,
    projectedMonthEnd,
    dailyBurnAverage,
  };
}
