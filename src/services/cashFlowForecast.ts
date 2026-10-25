/**
 * Cash Flow Forecasting Engine
 * Simulates future 3-6 month cash flow based on active recurring rules,
 * scheduled salary/bill dates, and trailing historical discretionary spend.
 * Multi-user forward-compatible via optional accountIds filtering.
 */

import type {
  Transaction,
  RecurringRule,
  Account,
  CurrencyCode,
  CashFlowForecastPoint,
  CashFlowInsight,
} from '../types';

export interface ForecastOptions {
  transactions: Transaction[];
  recurringRules: RecurringRule[];
  accounts: Account[];
  horizonDays?: number; // 90 or 180 days (default 90)
  accountIds?: string[]; // Optional account filtering (multi-user ready)
  baseCurrency?: CurrencyCode;
}

export interface ForecastResult {
  points: CashFlowForecastPoint[];
  insights: CashFlowInsight[];
  startNetWorth: number;
  endNetWorth: number;
  netDelta: number;
  dailyDiscretionaryRate: number;
}

/**
 * Checks if a recurring rule executes on a specific simulated date
 */
function doesRuleExecuteOnDate(rule: RecurringRule, date: Date, dateStr: string): boolean {
  if (rule.isDeleted) return false;
  if (rule.startDate && dateStr < rule.startDate) return false;
  if (rule.endDate && dateStr > rule.endDate) return false;

  const dayOfMonth = date.getDate();
  const dayOfWeek = date.getDay(); // 0 = Sun, 6 = Sat

  switch (rule.frequency) {
    case 'daily':
      return true;
    case 'weekly':
      return rule.dayOfWeek !== undefined ? rule.dayOfWeek === dayOfWeek : true;
    case 'biweekly': {
      if (!rule.startDate) return false;
      const startMs = new Date(rule.startDate).getTime();
      const currentMs = date.getTime();
      const diffDays = Math.round((currentMs - startMs) / 86400000);
      return diffDays >= 0 && diffDays % 14 === 0;
    }
    case 'monthly': {
      const targetDay = rule.dayOfMonth || 1;
      // Handle months with fewer days (e.g. Feb 28/29)
      const lastDayOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      const actualTargetDay = Math.min(targetDay, lastDayOfMonth);
      return dayOfMonth === actualTargetDay;
    }
    case 'yearly': {
      if (!rule.startDate) return false;
      const startParts = rule.startDate.split('-');
      const currentMonth = String(date.getMonth() + 1).padStart(2, '0');
      const currentDay = String(date.getDate()).padStart(2, '0');
      return startParts[1] === currentMonth && startParts[2] === currentDay;
    }
    default:
      return false;
  }
}

/**
 * Generates forward-looking cash flow forecast points and plain-language insights
 */
export function generateCashFlowForecast(options: ForecastOptions): ForecastResult {
  const {
    transactions,
    recurringRules,
    accounts,
    horizonDays = 90,
    accountIds,
    baseCurrency = 'IDR',
  } = options;

  // 1. Filter eligible accounts
  const activeAccounts = accounts.filter(
    (a) => !a.isDeleted && a.includeInNetWorth && (!accountIds || accountIds.includes(a.id))
  );

  const initialAccountBalances: Record<string, number> = {};
  let startNetWorth = 0;

  for (const acc of activeAccounts) {
    initialAccountBalances[acc.id] = acc.currentBalance;
    const rate = acc.currency === baseCurrency ? 1.0 : acc.currency === 'USD' ? 16250 : 1.0;
    startNetWorth += acc.currentBalance * rate;
  }

  // 2. Compute trailing 60-day discretionary spending baseline
  const nowMs = Date.now();
  const sixtyDaysAgoMs = nowMs - 60 * 86400000;
  const recentTxs = transactions.filter(
    (t) =>
      !t.isDeleted &&
      (t.timestamp || 0) >= sixtyDaysAgoMs &&
      t.type === 'expense' &&
      (!accountIds || accountIds.includes(t.accountId))
  );

  // Exclude transactions that match active recurring rules to avoid double-counting
  const activeRuleTitles = new Set(
    recurringRules.filter((r) => !r.isDeleted).map((r) => r.title.toLowerCase().trim())
  );

  let discretionarySum = 0;
  for (const t of recentTxs) {
    const isRecurringMatch = Array.from(activeRuleTitles).some(
      (title) => t.description.toLowerCase().includes(title) || (t.tags && t.tags.includes('recurring'))
    );
    if (!isRecurringMatch) {
      discretionarySum += t.baseAmount || t.amount;
    }
  }

  // Daily discretionary spend baseline (amortized over 60 days)
  const dailyDiscretionaryRate = Math.round(discretionarySum / 60);

  // 3. Forward simulation loop day by day
  const simulatedBalances: Record<string, number> = { ...initialAccountBalances };
  const points: CashFlowForecastPoint[] = [];
  const insights: CashFlowInsight[] = [];

  // Track accounts that dip below 0
  const depletedAccountsTracked = new Set<string>();

  // Determine primary spending account (account with largest positive balance or checking)
  let primarySpendingAccountId = activeAccounts.find((a) => a.type === 'bank' || a.type === 'cash')?.id;
  if (!primarySpendingAccountId && activeAccounts.length > 0) {
    primarySpendingAccountId = activeAccounts[0].id;
  }

  for (let d = 1; d <= horizonDays; d++) {
    const simDate = new Date(nowMs + d * 86400000);
    const dateStr = simDate.toISOString().slice(0, 10);
    const label = `${String(simDate.getMonth() + 1).padStart(2, '0')}-${String(simDate.getDate()).padStart(2, '0')}`;

    let recurringDeltaForDay = 0;

    // A. Apply recurring rules firing on this day
    for (const rule of recurringRules) {
      if (doesRuleExecuteOnDate(rule, simDate, dateStr)) {
        if (!accountIds || accountIds.includes(rule.accountId)) {
          const ruleRate = rule.currency === baseCurrency ? 1.0 : rule.currency === 'USD' ? 16250 : 1.0;
          const convertedAmt = rule.amount * ruleRate;

          if (rule.type === 'income') {
            if (simulatedBalances[rule.accountId] !== undefined) {
              simulatedBalances[rule.accountId] += rule.amount;
            }
            recurringDeltaForDay += convertedAmt;
          } else if (rule.type === 'expense') {
            if (simulatedBalances[rule.accountId] !== undefined) {
              simulatedBalances[rule.accountId] -= rule.amount;
            }
            recurringDeltaForDay -= convertedAmt;
          }
        }
      }
    }

    // B. Apply daily discretionary spending
    if (primarySpendingAccountId && simulatedBalances[primarySpendingAccountId] !== undefined) {
      simulatedBalances[primarySpendingAccountId] -= dailyDiscretionaryRate;
    }

    // C. Calculate projected total net worth on this day
    let projectedNetWorth = 0;
    for (const acc of activeAccounts) {
      const balance = simulatedBalances[acc.id] || 0;
      const rate = acc.currency === baseCurrency ? 1.0 : acc.currency === 'USD' ? 16250 : 1.0;
      projectedNetWorth += balance * rate;

      // Check for zero/negative balance event
      if (balance <= 0 && !depletedAccountsTracked.has(acc.id)) {
        depletedAccountsTracked.add(acc.id);
        insights.push({
          type: 'warning',
          title: `Projected Deficit on ${acc.name}`,
          message: `At this pace, your ${acc.name} balance may drop below Rp 0 around ${dateStr} due to recurring commitments and daily expenses.`,
          depletedAccountName: acc.name,
          depletionDate: dateStr,
        });
      }
    }

    points.push({
      date: dateStr,
      label,
      projectedNetWorth: Math.round(projectedNetWorth),
      projectedDiscretionaryExpense: dailyDiscretionaryRate,
      projectedRecurringDelta: recurringDeltaForDay,
      accountBalances: { ...simulatedBalances },
    });
  }

  const endNetWorth = points.length > 0 ? points[points.length - 1].projectedNetWorth : startNetWorth;
  const netDelta = endNetWorth - startNetWorth;
  const horizonMonths = Math.round(horizonDays / 30);

  // 4. Positive surplus or general growth insight
  if (netDelta > 0) {
    const endDateStr = points[points.length - 1]?.date;
    insights.unshift({
      type: 'surplus',
      title: 'Positive Cash Flow Growth',
      message: `At this pace, you are projected to accumulate ~Rp ${netDelta.toLocaleString('id-ID')} over the next ${horizonMonths} months, reaching a projected net worth of ~Rp ${endNetWorth.toLocaleString('id-ID')} by ${endDateStr}.`,
      projectedSurplus: netDelta,
      surplusHorizonDays: horizonDays,
    });
  } else if (insights.length === 0) {
    if (recentTxs.length === 0 && recurringRules.length === 0) {
      insights.push({
        type: 'neutral',
        title: 'More Data Needed',
        message: 'Add recurring rules or log regular spending to enhance forecast precision.',
      });
    }
  }

  return {
    points,
    insights,
    startNetWorth,
    endNetWorth,
    netDelta,
    dailyDiscretionaryRate,
  };
}
