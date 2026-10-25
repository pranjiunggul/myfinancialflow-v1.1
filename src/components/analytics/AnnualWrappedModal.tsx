import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  Download,
  ChevronLeft,
  ChevronRight,
  Award,
  Zap,
  Calendar,
  PieChart as PieIcon,
  Flame,
  Coffee,
} from 'lucide-react';
import { computeAnnualWrapped, type WrappedStats } from '../../services/wrapped';
import { formatCurrency } from '../../services/fx';
import type { CurrencyCode } from '../../types';

interface AnnualWrappedModalProps {
  isOpen: boolean;
  onClose: () => void;
  baseCurrency: CurrencyCode;
}

export const AnnualWrappedModal: React.FC<AnnualWrappedModalProps> = ({
  isOpen,
  onClose,
  baseCurrency,
}) => {
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [stats, setStats] = useState<WrappedStats | null>(null);
  const [cardIndex, setCardIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const TOTAL_CARDS = 5;

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      computeAnnualWrapped(selectedYear, baseCurrency)
        .then(setStats)
        .catch(console.error)
        .finally(() => setIsLoading(false));
      setCardIndex(0);
    }
  }, [isOpen, selectedYear, baseCurrency]);

  if (!isOpen) return null;

  const nextCard = () => setCardIndex((prev) => Math.min(prev + 1, TOTAL_CARDS - 1));
  const prevCard = () => setCardIndex((prev) => Math.max(prev - 1, 0));

  // Render & Download Canvas Image Memento
  const handleExportImage = () => {
    if (!stats) return;

    const width = 1080;
    const height = 1350;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 1. Background Gradient
    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, '#0f172a');
    bg.addColorStop(0.5, '#1e1b4b');
    bg.addColorStop(1, '#020617');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    // Glowing subtle circles
    ctx.fillStyle = 'rgba(99, 102, 241, 0.15)';
    ctx.beginPath();
    ctx.arc(200, 250, 350, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(236, 72, 153, 0.12)';
    ctx.beginPath();
    ctx.arc(880, 1100, 400, 0, Math.PI * 2);
    ctx.fill();

    // 2. Header
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 32px sans-serif';
    ctx.fillText('MYFINANCIALFLOW WRAPPED', 80, 120);

    ctx.fillStyle = '#ffffff';
    ctx.font = '800 68px sans-serif';
    ctx.fillText(`${stats.periodYear} Financial Journey`, 80, 200);

    // 3. Highlight Card: Savings Rate
    ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(80, 260, 920, 220, 24);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#38bdf8';
    ctx.font = '600 28px sans-serif';
    ctx.fillText('NET SAVINGS RATE', 120, 320);

    ctx.fillStyle = '#ffffff';
    ctx.font = '800 80px sans-serif';
    ctx.fillText(`${stats.savingsRate}%`, 120, 410);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '500 26px sans-serif';
    ctx.fillText(
      `Saved ${formatCurrency(stats.netSavings, baseCurrency)} out of ${formatCurrency(stats.totalIncome, baseCurrency)} earned`,
      120,
      450
    );

    // 4. Two-Column Stats: Total Income & Total Expense
    const colW = 440;
    // Income Box
    ctx.fillStyle = 'rgba(34, 197, 94, 0.08)';
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.3)';
    ctx.beginPath();
    ctx.roundRect(80, 520, colW, 180, 20);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#4ade80';
    ctx.font = '600 24px sans-serif';
    ctx.fillText('TOTAL EARNINGS', 110, 570);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 36px sans-serif';
    ctx.fillText(formatCurrency(stats.totalIncome, baseCurrency), 110, 640);

    // Expense Box
    ctx.fillStyle = 'rgba(239, 68, 68, 0.08)';
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.3)';
    ctx.beginPath();
    ctx.roundRect(560, 520, colW, 180, 20);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#f87171';
    ctx.font = '600 24px sans-serif';
    ctx.fillText('TOTAL EXPENSES', 590, 570);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 36px sans-serif';
    ctx.fillText(formatCurrency(stats.totalExpense, baseCurrency), 590, 640);

    // 5. Top Categories Section
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 34px sans-serif';
    ctx.fillText('Top Spending Categories', 80, 760);

    let catY = 820;
    stats.topCategories.slice(0, 3).forEach((cat, idx) => {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.beginPath();
      ctx.roundRect(80, catY, 920, 80, 16);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = '600 28px sans-serif';
      ctx.fillText(`${idx + 1}. ${cat.categoryName}`, 110, catY + 50);

      ctx.fillStyle = '#a5b4fc';
      ctx.font = '700 28px sans-serif';
      ctx.fillText(`${cat.percentage}% (${formatCurrency(cat.amount, baseCurrency)})`, 640, catY + 50);

      catY += 95;
    });

    // 6. Fun Stats Footer Card
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.beginPath();
    ctx.roundRect(80, 1120, 920, 140, 20);
    ctx.fill();

    ctx.fillStyle = '#fbbf24';
    ctx.font = '600 24px sans-serif';
    ctx.fillText('HIGHLIGHTS & HABITS', 110, 1165);

    const habitText = stats.funStats.mostFrequentMerchant
      ? `Most visited: ${stats.funStats.mostFrequentMerchant.name} (${stats.funStats.mostFrequentMerchant.count}x) • Longest streak: ${stats.funStats.longestNoSpendStreakDays} no-spend days`
      : `Longest streak: ${stats.funStats.longestNoSpendStreakDays} consecutive no-spend days`;

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '500 24px sans-serif';
    ctx.fillText(habitText, 110, 1215);

    // Download PNG
    const link = document.createElement('a');
    link.download = `MyFinancialFlow_Wrapped_${stats.periodYear}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="relative bg-gradient-to-b from-gray-900 via-indigo-950/90 to-gray-950 border border-indigo-500/30 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col min-h-[580px]">
        {/* Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-400 animate-spin" />
            <span className="text-xs uppercase tracking-widest font-bold text-indigo-300">
              MyFinancialFlow Wrapped
            </span>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="bg-black/40 border border-white/20 text-white text-xs rounded-lg px-2.5 py-1 focus:outline-none"
            >
              {[0, 1, 2].map((offset) => {
                const yr = new Date().getFullYear() - offset;
                return (
                  <option key={yr} value={yr} className="bg-gray-900 text-white">
                    {yr}
                  </option>
                );
              })}
            </select>

            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Progress Bar Indicators */}
        <div className="flex gap-1.5 px-6 pt-3">
          {Array.from({ length: TOTAL_CARDS }).map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                i <= cardIndex ? 'bg-indigo-400' : 'bg-white/15'
              }`}
            />
          ))}
        </div>

        {/* Card Body */}
        <div className="p-6 flex-1 flex flex-col justify-center items-center text-center">
          {isLoading || !stats ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-gray-400 mt-3">Crunching your annual ledger...</p>
            </div>
          ) : (
            <>
              {/* CARD 0: Total Story & Savings Rate */}
              {cardIndex === 0 && (
                <div className="space-y-4 animate-fade-in w-full">
                  <div className="inline-flex p-3 rounded-2xl bg-indigo-500/20 text-indigo-300 mb-2">
                    <Award className="w-8 h-8" />
                  </div>
                  <h3 className="text-2xl font-extrabold text-white">
                    Your {stats.periodYear} at a Glance
                  </h3>
                  <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                    <p className="text-xs text-indigo-300 font-semibold uppercase tracking-wider">
                      Net Savings Rate
                    </p>
                    <div className="text-5xl font-black text-white my-2">
                      {stats.savingsRate}%
                    </div>
                    <p className="text-xs text-gray-300">
                      You retained {formatCurrency(stats.netSavings, baseCurrency)} of your income
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20">
                      <p className="text-[11px] text-green-300 font-medium">Income</p>
                      <p className="text-sm font-bold text-white mt-0.5">
                        {formatCurrency(stats.totalIncome, baseCurrency)}
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                      <p className="text-[11px] text-red-300 font-medium">Expenses</p>
                      <p className="text-sm font-bold text-white mt-0.5">
                        {formatCurrency(stats.totalExpense, baseCurrency)}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* CARD 1: Top Categories */}
              {cardIndex === 1 && (
                <div className="space-y-4 animate-fade-in w-full">
                  <div className="inline-flex p-3 rounded-2xl bg-purple-500/20 text-purple-300 mb-2">
                    <PieIcon className="w-8 h-8" />
                  </div>
                  <h3 className="text-2xl font-extrabold text-white">Where Did It Go?</h3>
                  <p className="text-xs text-gray-300">Your top spending buckets in {stats.periodYear}</p>

                  <div className="space-y-2.5 text-left pt-2">
                    {stats.topCategories.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-6">No expenses logged yet</p>
                    ) : (
                      stats.topCategories.map((cat, idx) => (
                        <div
                          key={cat.categoryId}
                          className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between"
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="text-xs font-bold w-5 h-5 rounded-full bg-indigo-500/30 text-indigo-300 flex items-center justify-center">
                              {idx + 1}
                            </span>
                            <span className="text-sm font-medium text-white">{cat.categoryName}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-bold text-indigo-300">
                              {cat.percentage}%
                            </span>
                            <span className="text-xs text-gray-400 ml-1.5">
                              ({formatCurrency(cat.amount, baseCurrency)})
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* CARD 2: Extremes & Biggest Expense */}
              {cardIndex === 2 && (
                <div className="space-y-4 animate-fade-in w-full">
                  <div className="inline-flex p-3 rounded-2xl bg-amber-500/20 text-amber-300 mb-2">
                    <Zap className="w-8 h-8" />
                  </div>
                  <h3 className="text-2xl font-extrabold text-white">The Peaks & Valleys</h3>

                  {stats.biggestExpense && (
                    <div className="p-4 rounded-2xl bg-gradient-to-r from-red-950/40 to-amber-950/30 border border-red-500/30 text-left">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                        Biggest Single Expense
                      </span>
                      <h4 className="text-base font-bold text-white mt-1">
                        {stats.biggestExpense.description}
                      </h4>
                      <p className="text-xl font-black text-red-400 my-1">
                        {formatCurrency(stats.biggestExpense.amount, baseCurrency)}
                      </p>
                      <p className="text-xs text-gray-400">
                        {stats.biggestExpense.date} • {stats.biggestExpense.categoryName}
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3 pt-2 text-left">
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                      <span className="text-[10px] text-green-400 font-semibold uppercase">
                        Most Frugal Month
                      </span>
                      <p className="text-base font-bold text-white mt-1">
                        {stats.cheapestMonth ? stats.cheapestMonth.monthName : '-'}
                      </p>
                      <p className="text-xs text-gray-400">
                        {stats.cheapestMonth
                          ? formatCurrency(stats.cheapestMonth.amount, baseCurrency)
                          : ''}
                      </p>
                    </div>

                    <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                      <span className="text-[10px] text-orange-400 font-semibold uppercase">
                        Peak Spend Month
                      </span>
                      <p className="text-base font-bold text-white mt-1">
                        {stats.mostExpensiveMonth ? stats.mostExpensiveMonth.monthName : '-'}
                      </p>
                      <p className="text-xs text-gray-400">
                        {stats.mostExpensiveMonth
                          ? formatCurrency(stats.mostExpensiveMonth.amount, baseCurrency)
                          : ''}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* CARD 3: Year-Over-Year Comparison */}
              {cardIndex === 3 && (
                <div className="space-y-4 animate-fade-in w-full">
                  <div className="inline-flex p-3 rounded-2xl bg-blue-500/20 text-blue-300 mb-2">
                    <Calendar className="w-8 h-8" />
                  </div>
                  <h3 className="text-2xl font-extrabold text-white">Year-Over-Year</h3>

                  {stats.priorYearYoY ? (
                    <div className="space-y-3 pt-2">
                      <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-left">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-300">Expenses vs {stats.priorYearYoY.priorYear}</span>
                          <span
                            className={`text-sm font-bold flex items-center gap-1 ${
                              stats.priorYearYoY.expenseChangePercent > 0
                                ? 'text-red-400'
                                : 'text-green-400'
                            }`}
                          >
                            {stats.priorYearYoY.expenseChangePercent > 0 ? '+' : ''}
                            {stats.priorYearYoY.expenseChangePercent}%
                          </span>
                        </div>
                      </div>

                      <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-left">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-300">Income vs {stats.priorYearYoY.priorYear}</span>
                          <span
                            className={`text-sm font-bold flex items-center gap-1 ${
                              stats.priorYearYoY.incomeChangePercent >= 0
                                ? 'text-green-400'
                                : 'text-red-400'
                            }`}
                          >
                            {stats.priorYearYoY.incomeChangePercent > 0 ? '+' : ''}
                            {stats.priorYearYoY.incomeChangePercent}%
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-6 rounded-2xl bg-white/5 border border-white/10 text-gray-300 text-xs">
                      <p>
                        This is your first tracked year in MyFinancialFlow! Next year you'll see deep
                        YoY velocity comparisons here.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* CARD 4: Fun Financial Habits */}
              {cardIndex === 4 && (
                <div className="space-y-4 animate-fade-in w-full">
                  <div className="inline-flex p-3 rounded-2xl bg-pink-500/20 text-pink-300 mb-2">
                    <Flame className="w-8 h-8" />
                  </div>
                  <h3 className="text-2xl font-extrabold text-white">Financial Habits</h3>

                  <div className="space-y-2.5 text-left pt-2">
                    <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-300">
                        <Zap className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">Longest No-Spend Streak</p>
                        <p className="text-base font-bold text-white">
                          {stats.funStats.longestNoSpendStreakDays} Consecutive Days
                        </p>
                      </div>
                    </div>

                    {stats.funStats.mostFrequentMerchant && (
                      <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-300">
                          <Coffee className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-xs text-gray-400">Favorite Merchant</p>
                          <p className="text-base font-bold text-white">
                            {stats.funStats.mostFrequentMerchant.name}{' '}
                            <span className="text-xs font-normal text-indigo-300">
                              ({stats.funStats.mostFrequentMerchant.count} visits)
                            </span>
                          </p>
                        </div>
                      </div>
                    )}

                    {stats.funStats.topDayOfWeek && (
                      <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-amber-500/20 text-amber-300">
                          <Calendar className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-xs text-gray-400">Peak Spending Day</p>
                          <p className="text-base font-bold text-white">
                            {stats.funStats.topDayOfWeek.dayName}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Navigation Bar */}
        <div className="px-6 py-4 border-t border-white/10 bg-black/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={prevCard}
              disabled={cardIndex === 0}
              className="p-2 rounded-lg text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/10 transition"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-xs font-medium text-gray-400">
              {cardIndex + 1} / {TOTAL_CARDS}
            </span>
            <button
              onClick={nextCard}
              disabled={cardIndex === TOTAL_CARDS - 1}
              className="p-2 rounded-lg text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/10 transition"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <button
            onClick={handleExportImage}
            disabled={!stats}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/30 transition"
          >
            <Download className="w-4 h-4" />
            <span>Save Memento</span>
          </button>
        </div>
      </div>
    </div>
  );
};
