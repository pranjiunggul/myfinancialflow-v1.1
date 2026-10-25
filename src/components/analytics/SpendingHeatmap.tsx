import React, { useState, useEffect } from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';
import { db } from '../../db/database';
import { formatCurrency } from '../../services/fx';
import type { Transaction, CurrencyCode } from '../../types';

interface SpendingHeatmapProps {
  baseCurrency: CurrencyCode;
}

interface DayData {
  dateStr: string;
  dayOfMonth: number;
  totalSpend: number;
  transactions: Transaction[];
  level: 0 | 1 | 2 | 3 | 4;
}

export const SpendingHeatmap: React.FC<SpendingHeatmapProps> = ({ baseCurrency }) => {
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth()); // 0-11
  const [days, setDays] = useState<DayData[]>([]);
  const [dailyAverage, setDailyAverage] = useState<number>(0);
  const [selectedDay, setSelectedDay] = useState<DayData | null>(null);

  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const loadHeatmapData = async () => {
    try {
      const allExpenses = await db.transactions
        .filter((tx) => !tx.isDeleted && tx.type === 'expense')
        .toArray();

      // Compute user's overall daily average across all days with expenses
      const expenseByDate: Map<string, { total: number; txs: Transaction[] }> = new Map();
      let grandTotalExpense = 0;

      for (const tx of allExpenses) {
        const amt = tx.baseAmount || tx.amount;
        grandTotalExpense += amt;
        const entry = expenseByDate.get(tx.date) || { total: 0, txs: [] };
        entry.total += amt;
        entry.txs.push(tx);
        expenseByDate.set(tx.date, entry);
      }

      const activeDaysCount = Math.max(expenseByDate.size, 1);
      const avg = grandTotalExpense / activeDaysCount;
      setDailyAverage(avg);

      // Generate all days for selected month
      const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
      const monthPrefix = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;

      const monthDays: DayData[] = [];
      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${monthPrefix}-${String(day).padStart(2, '0')}`;
        const dayEntry = expenseByDate.get(dateStr) || { total: 0, txs: [] };
        const spend = dayEntry.total;

        // Relative 5-level shading
        let level: 0 | 1 | 2 | 3 | 4 = 0;
        if (spend > 0) {
          if (spend <= avg * 0.5) level = 1;
          else if (spend <= avg * 1.0) level = 2;
          else if (spend <= avg * 2.0) level = 3;
          else level = 4;
        }

        monthDays.push({
          dateStr,
          dayOfMonth: day,
          totalSpend: spend,
          transactions: dayEntry.txs,
          level,
        });
      }

      setDays(monthDays);
      setSelectedDay(null);
    } catch (err) {
      console.error('Failed to load spending heatmap data:', err);
    }
  };

  useEffect(() => {
    loadHeatmapData();
  }, [selectedYear, selectedMonth]);

  const handlePrevMonth = () => {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear((prev) => prev - 1);
    } else {
      setSelectedMonth((prev) => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear((prev) => prev + 1);
    } else {
      setSelectedMonth((prev) => prev + 1);
    }
  };

  // Color mapping based on shade level
  const getLevelColor = (level: 0 | 1 | 2 | 3 | 4): string => {
    switch (level) {
      case 0:
        return 'bg-gray-800/80 border-gray-700/60 text-gray-500 hover:border-gray-500';
      case 1:
        return 'bg-emerald-950/70 border-emerald-800/60 text-emerald-300 hover:border-emerald-400';
      case 2:
        return 'bg-emerald-800/80 border-emerald-600/70 text-emerald-100 hover:border-emerald-300';
      case 3:
        return 'bg-emerald-600/90 border-emerald-500 text-white hover:border-white';
      case 4:
        return 'bg-amber-600 border-amber-400 text-white font-bold shadow-sm shadow-amber-500/20';
    }
  };

  // Day offset for the 1st of the month
  const firstDayOfWeek = new Date(selectedYear, selectedMonth, 1).getDay(); // 0 = Sun

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 shadow-lg">
      {/* Header with Month/Year Navigation */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-indigo-400" />
          <h3 className="text-base font-bold text-white">Daily Spending Heatmap</h3>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handlePrevMonth}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs font-semibold text-white min-w-[110px] text-center">
            {MONTH_NAMES[selectedMonth]} {selectedYear}
          </span>
          <button
            onClick={handleNextMonth}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Daily Average Benchmark */}
      <div className="flex items-center justify-between text-xs text-gray-400 mb-3 px-1">
        <span>
          Daily benchmark average:{' '}
          <strong className="text-gray-200">{formatCurrency(dailyAverage, baseCurrency)}</strong>
        </span>
        <div className="flex items-center gap-1.5 text-[10px]">
          <span>Low</span>
          <span className="w-2.5 h-2.5 rounded-sm bg-gray-800 border border-gray-700" />
          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-950 border border-emerald-800" />
          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-800 border border-emerald-600" />
          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-600 border border-emerald-500" />
          <span className="w-2.5 h-2.5 rounded-sm bg-amber-600 border border-amber-400" />
          <span>Spike</span>
        </div>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
        <span>Sun</span>
        <span>Mon</span>
        <span>Tue</span>
        <span>Wed</span>
        <span>Thu</span>
        <span>Fri</span>
        <span>Sat</span>
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-1.5">
        {/* Empty slots for month start offset */}
        {Array.from({ length: firstDayOfWeek }).map((_, i) => (
          <div key={`empty-${i}`} className="h-10 rounded-lg bg-gray-950/40 border border-transparent" />
        ))}

        {/* Days */}
        {days.map((day) => {
          const isSelected = selectedDay?.dateStr === day.dateStr;
          return (
            <button
              key={day.dateStr}
              onClick={() => setSelectedDay(day)}
              className={`h-10 rounded-lg border text-xs flex flex-col items-center justify-center transition-all ${getLevelColor(
                day.level
              )} ${isSelected ? 'ring-2 ring-indigo-400 ring-offset-1 ring-offset-gray-900 scale-105 z-10' : ''}`}
            >
              <span className="text-[11px] leading-none">{day.dayOfMonth}</span>
              {day.totalSpend > 0 && (
                <span className="text-[8px] opacity-80 mt-0.5 leading-none truncate max-w-[90%]">
                  {day.totalSpend >= 1000000
                    ? `${(day.totalSpend / 1000000).toFixed(1)}M`
                    : day.totalSpend >= 1000
                    ? `${Math.round(day.totalSpend / 1000)}k`
                    : day.totalSpend}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Day Transaction Popover / Detail Drawer */}
      {selectedDay && (
        <div className="mt-4 p-4 rounded-xl bg-gray-800/80 border border-gray-700 animate-fade-in">
          <div className="flex items-center justify-between pb-2 border-b border-gray-700">
            <div>
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <span>{selectedDay.dateStr}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold">
                  Total: {formatCurrency(selectedDay.totalSpend, baseCurrency)}
                </span>
              </h4>
            </div>
            <button
              onClick={() => setSelectedDay(null)}
              className="text-gray-400 hover:text-white p-1 rounded-md"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-2.5 space-y-2 max-h-48 overflow-y-auto">
            {selectedDay.transactions.length === 0 ? (
              <p className="text-xs text-gray-400 py-2">No expenses on this day (No-spend day! 🎉)</p>
            ) : (
              selectedDay.transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="p-2 rounded-lg bg-gray-900/60 border border-gray-800 flex items-center justify-between text-xs"
                >
                  <div>
                    <span className="font-medium text-white">{tx.description}</span>
                    <span className="text-gray-400 ml-2">
                      {tx.time ? `@ ${tx.time}` : ''}
                    </span>
                  </div>
                  <span className="font-semibold text-red-400">
                    -{formatCurrency(tx.amount, tx.currency)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
