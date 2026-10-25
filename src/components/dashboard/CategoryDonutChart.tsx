import React, { useMemo } from 'react';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import type { Transaction, Category, CurrencyCode } from '../../types';
import { getCategorySpendingDistribution } from '../../services/analytics';
import { formatCurrency } from '../../services/fx';

ChartJS.register(ArcElement, Tooltip, Legend);

interface CategoryDonutChartProps {
  transactions: Transaction[];
  categories: Category[];
  baseCurrency: CurrencyCode;
}

export const CategoryDonutChart: React.FC<CategoryDonutChartProps> = ({
  transactions,
  categories,
  baseCurrency,
}) => {
  const shares = useMemo(() => {
    return getCategorySpendingDistribution(transactions, categories);
  }, [transactions, categories]);

  const totalExpense = shares.reduce((sum, s) => sum + s.total, 0);

  const chartData = {
    labels: shares.map((s) => s.name),
    datasets: [
      {
        data: shares.map((s) => s.total),
        backgroundColor: shares.map((s) => s.color),
        borderColor: '#0f172a',
        borderWidth: 2,
        hoverOffset: 6,
      },
    ],
  };

  const chartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '72%',
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: '#0f172a',
        titleColor: '#94a3b8',
        bodyColor: '#ffffff',
        borderColor: '#334155',
        borderWidth: 1,
        padding: 10,
        callbacks: {
          label: (context: any) => {
            const val = context.parsed;
            const pct = totalExpense > 0 ? Math.round((val / totalExpense) * 100) : 0;
            return `${formatCurrency(val, baseCurrency)} (${pct}%)`;
          },
        },
      },
    },
  };

  if (shares.length === 0) {
    return (
      <div className="p-6 rounded-3xl bg-slate-900/60 border border-slate-800/80 flex flex-col items-center justify-center h-72 text-center text-slate-500 text-xs">
        No expense data recorded this month.
      </div>
    );
  }

  return (
    <div className="p-5 sm:p-6 rounded-3xl bg-slate-900/60 border border-slate-800/80 space-y-4 shadow-xl flex flex-col justify-between">
      <div>
        <h3 className="text-sm font-bold text-white uppercase tracking-wider">
          Category Distribution
        </h3>
        <p className="text-xs text-slate-400">Expense breakdown for current month</p>
      </div>

      <div className="relative h-56 w-full flex items-center justify-center">
        <Doughnut data={chartData} options={chartOptions} />
        {/* Center Total Text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Total Spent</span>
          <span className="text-base sm:text-lg font-black text-white font-mono">
            {formatCurrency(totalExpense, baseCurrency, { compact: true })}
          </span>
        </div>
      </div>

      {/* Mini Legend List */}
      <div className="space-y-1.5 pt-2 max-h-32 overflow-y-auto pr-1">
        {shares.slice(0, 5).map((s) => (
          <div key={s.categoryId} className="flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
              <span className="text-slate-300 font-medium truncate max-w-[120px]">{s.name}</span>
            </div>
            <div className="flex items-center space-x-2 font-mono">
              <span className="font-bold text-white">{formatCurrency(s.total, baseCurrency, { compact: true })}</span>
              <span className="text-slate-500 text-[11px]">({s.percentage}%)</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
