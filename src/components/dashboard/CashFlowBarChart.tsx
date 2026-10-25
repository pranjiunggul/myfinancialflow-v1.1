import React, { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import type { Transaction, CurrencyCode } from '../../types';
import { getMonthlyCashFlow } from '../../services/analytics';
import { formatCurrency } from '../../services/fx';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

interface CashFlowBarChartProps {
  transactions: Transaction[];
  baseCurrency: CurrencyCode;
}

export const CashFlowBarChart: React.FC<CashFlowBarChartProps> = ({
  transactions,
  baseCurrency,
}) => {
  const cashFlows = useMemo(() => {
    return getMonthlyCashFlow(transactions, 6);
  }, [transactions]);

  const chartData = {
    labels: cashFlows.map((cf) => cf.label),
    datasets: [
      {
        label: 'Inflow (Income)',
        data: cashFlows.map((cf) => cf.income),
        backgroundColor: '#10b981',
        borderRadius: 6,
        barPercentage: 0.65,
        categoryPercentage: 0.65,
      },
      {
        label: 'Outflow (Expense)',
        data: cashFlows.map((cf) => cf.expense),
        backgroundColor: '#ef4444',
        borderRadius: 6,
        barPercentage: 0.65,
        categoryPercentage: 0.65,
      },
    ],
  };

  const chartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          color: '#94a3b8',
          font: { size: 11, weight: 'bold' },
          usePointStyle: true,
          boxWidth: 8,
        },
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
            return `${context.dataset.label}: ${formatCurrency(context.parsed.y, baseCurrency)}`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#64748b', font: { size: 10 } },
      },
      y: {
        grid: { color: 'rgba(51, 65, 85, 0.4)' },
        ticks: {
          color: '#64748b',
          font: { size: 10 },
          callback: (value: any) => formatCurrency(value, baseCurrency, { compact: true }),
        },
      },
    },
  };

  return (
    <div className="p-5 sm:p-6 rounded-3xl bg-slate-900/60 border border-slate-800/80 space-y-4 shadow-xl">
      <div>
        <h3 className="text-sm font-bold text-white uppercase tracking-wider">
          Cash Flow Comparison
        </h3>
        <p className="text-xs text-slate-400">Monthly Inflow vs Outflow over the past 6 months</p>
      </div>

      <div className="h-64 sm:h-72 w-full">
        <Bar data={chartData} options={chartOptions} />
      </div>
    </div>
  );
};
