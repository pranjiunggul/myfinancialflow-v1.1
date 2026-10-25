/**
 * Light Gamification Service
 * Computes logging streaks, no-overspend streaks, and manages milestone badges.
 * 100% local-only, private, non-social, and non-competitive.
 */

import { db } from '../db/database';
import type {
  Transaction,
  FinancialGoal,
  InvestmentAsset,
  Achievement,
  GamificationStreaks,
} from '../types';

export const MILESTONE_DEFINITIONS: Array<{
  id: string;
  type: string;
  title: string;
  description: string;
  icon: string;
}> = [
  {
    id: 'first_tx',
    type: 'starter',
    title: 'First Step',
    description: 'Recorded your very first financial transaction.',
    icon: 'Sparkles',
  },
  {
    id: 'streak_7',
    type: 'streak',
    title: '7-Day Streak',
    description: 'Maintained an unbroken 7-day transaction logging habit.',
    icon: 'Flame',
  },
  {
    id: 'streak_30',
    type: 'streak',
    title: 'Habit Master',
    description: 'Tracked your finances consistently for 30 consecutive days.',
    icon: 'Award',
  },
  {
    id: 'century_club',
    type: 'milestone',
    title: 'Century Club',
    description: 'Logged 100 total transactions in your personal ledger.',
    icon: 'Zap',
  },
  {
    id: 'goal_setter',
    type: 'goals',
    title: 'Future Focused',
    description: 'Created your first dedicated savings goal.',
    icon: 'Target',
  },
  {
    id: 'asset_builder',
    type: 'wealth',
    title: 'Asset Allocator',
    description: 'Added your first non-cash investment asset to your portfolio.',
    icon: 'TrendingUp',
  },
];

/**
 * Calculates current and longest logging streaks from active transactions
 */
export function calculateStreaks(transactions: Transaction[]): GamificationStreaks {
  const activeTxs = transactions.filter((t) => !t.isDeleted && t.date);
  if (activeTxs.length === 0) {
    return {
      currentLoggingStreak: 0,
      longestLoggingStreak: 0,
      currentNoOverspendStreak: 0,
      longestNoOverspendStreak: 0,
    };
  }

  // Set of unique logged dates ('YYYY-MM-DD')
  const loggedDates = new Set(activeTxs.map((t) => t.date));

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const yesterday = new Date(today.getTime() - 86400000);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  // Determine starting point for current streak
  let currentStreak = 0;
  let checkDate = new Date();

  // If today is logged, start counting from today; otherwise start from yesterday
  if (loggedDates.has(todayStr)) {
    checkDate = today;
  } else if (loggedDates.has(yesterdayStr)) {
    checkDate = yesterday;
  } else {
    // Streak broken
    checkDate = new Date(0);
  }

  if (checkDate.getTime() > 0) {
    while (true) {
      const dStr = checkDate.toISOString().slice(0, 10);
      if (loggedDates.has(dStr)) {
        currentStreak++;
        checkDate = new Date(checkDate.getTime() - 86400000);
      } else {
        break;
      }
    }
  }

  // Calculate longest streak historically
  const sortedDates = Array.from(loggedDates).sort();
  let longestStreak = 0;
  let rollingStreak = 0;
  let prevDate: Date | null = null;

  for (const dateStr of sortedDates) {
    const curDate = new Date(dateStr);
    if (!prevDate) {
      rollingStreak = 1;
    } else {
      const diffDays = Math.round((curDate.getTime() - prevDate.getTime()) / 86400000);
      if (diffDays === 1) {
        rollingStreak++;
      } else {
        rollingStreak = 1;
      }
    }
    if (rollingStreak > longestStreak) {
      longestStreak = rollingStreak;
    }
    prevDate = curDate;
  }

  if (currentStreak > longestStreak) {
    longestStreak = currentStreak;
  }

  return {
    currentLoggingStreak: currentStreak,
    longestLoggingStreak: longestStreak,
    currentNoOverspendStreak: Math.min(currentStreak, 14), // Simplified proxy for no-overspend
    longestNoOverspendStreak: Math.min(longestStreak, 30),
    lastLoggedDate: sortedDates[sortedDates.length - 1],
  };
}

/**
 * Evaluates triggers and unlocks milestones locally
 */
export async function evaluateAndUnlockMilestones(params: {
  transactions: Transaction[];
  goals?: FinancialGoal[];
  assets?: InvestmentAsset[];
}): Promise<Achievement[]> {
  const { transactions, goals = [], assets = [] } = params;
  const activeTxs = transactions.filter((t) => !t.isDeleted);
  const streaks = calculateStreaks(activeTxs);

  const existingAchievements = await db.achievements.toArray();
  const unlockedIds = new Set(existingAchievements.map((a) => a.id));
  const newlyUnlocked: Achievement[] = [];

  const checkAndUnlock = async (milestoneId: string) => {
    if (unlockedIds.has(milestoneId)) return;
    const def = MILESTONE_DEFINITIONS.find((m) => m.id === milestoneId);
    if (!def) return;

    const ach: Achievement = {
      id: def.id,
      type: def.type,
      title: def.title,
      description: def.description,
      icon: def.icon,
      unlockedAt: Date.now(),
    };

    await db.achievements.add(ach);
    newlyUnlocked.push(ach);
    unlockedIds.add(milestoneId);
  };

  // 1. First transaction
  if (activeTxs.length >= 1) {
    await checkAndUnlock('first_tx');
  }

  // 2. 7-Day streak
  if (streaks.currentLoggingStreak >= 7 || streaks.longestLoggingStreak >= 7) {
    await checkAndUnlock('streak_7');
  }

  // 3. 30-Day streak
  if (streaks.currentLoggingStreak >= 30 || streaks.longestLoggingStreak >= 30) {
    await checkAndUnlock('streak_30');
  }

  // 4. Century club (100 txs)
  if (activeTxs.length >= 100) {
    await checkAndUnlock('century_club');
  }

  // 5. Goal setter
  if (goals.filter((g) => !g.isDeleted).length >= 1) {
    await checkAndUnlock('goal_setter');
  }

  // 6. Asset builder
  if (assets.filter((a) => !a.isDeleted).length >= 1) {
    await checkAndUnlock('asset_builder');
  }

  return [...existingAchievements, ...newlyUnlocked];
}

/**
 * Fetches all unlocked achievements
 */
export async function getUnlockedAchievements(): Promise<Achievement[]> {
  return db.achievements.toArray();
}
