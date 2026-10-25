import React, { useState, useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { AlertTriangle, CheckCircle, Info } from 'lucide-react';
import type {
  Transaction,
  Account,
  RecurringRule,
  InvestmentAsset,
  CurrencyCode,
} from '../../types';
import { getNetWorthTimeline } from '../../services/analytics';
import { generateCashFlowForecast } from '../../services/cashFlowForecast';
import { formatCurrency } from '../../services/fx';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface NetWorthChartProps {
  transactions: Transaction[];
  accounts: Account[];
  baseCurrency: CurrencyCode;
  recurringRules?: RecurringRule[];
  investmentAssets?: InvestmentAsset[];
}

export const NetWorthChart: React.FC<NetWorthChartProps> = ({
  transactions,
  accounts,
  baseCurrency,
  recurringRules = [],
  investmentAssets = [],
}) => {
  const [mode, setMode] = useState<'historical' | 'forecast'>('historical');
  const [historicalDays, setHistoricalDays] = useState<number>(30);
  const [forecastHorizon, setForecastHorizon] = useState<number>(90); // 90 or 180 days

  // Historical Timeline
  const historicalPoints = useMemo(() => {
    return getNetWorthTimeline(
      transactions,
      accounts,
      baseCurrency,
      historicalDays,
      investmentAssets
    );
  }, [transactions, accounts, baseCurrency, historicalDays, investmentAssets]);

  // Cash Flow Forecast Simulation
  const forecastResult = useMemo(() => {
    if (mode !== 'forecast') return null;
    return generateCashFlowForecast({
      transactions,
      recurringRules,
      accounts,
      horizonDays: forecastHorizon,
      baseCurrency,
    });
  }, [mode, transactions, recurringRules, accounts, forecastHorizon, baseCurrency]);

  const isForecast = mode === 'forecast';

  const chartData = useMemo(() => {
    if (isForecast && forecastResult) {
      return {
        labels: forecastResult.points.map((p) => p.label),
        datasets: [
          {
            label: `Forecasted Cash Flow (${baseCurrency})`,
            data: forecastResult.points.map((p) => p.projectedNetWorth),
            borderColor: '#a855f7', // Violet
            borderDash: [6, 4], // Distinct dashed trajectory
            backgroundColor: (context: any) => {
              const ctx = context.chart.ctx;
              const gradient = ctx.createLinearGradient(0, 0, 0, 240);
              gradient.addColorStop(0, 'rgba(168, 85, 247, 0.25)');
              gradient.addColorStop(1, 'rgba(168, 85, 247, 0.00)');
              return gradient;
            },
            fill: true,
            tension: 0.25,
            borderWidth: 2.5,
            pointRadius: 0,
            pointHoverRadius: 6,
            pointBackgroundColor: '#c084fc',
            pointBorderColor: '#581c87',
          },
        ],
      };
    }

    return {
      labels: historicalPoints.map((p) => p.label),
      datasets: [
        {
          label: `Net Worth (${baseCurrency})`,
          data: historicalPoints.map((p) => p.netWorth),
          borderColor: '#3b82f6',
          backgroundColor: (context: any) => {
            const ctx = context.chart.ctx;
            const gradient = ctx.createLinearGradient(0, 0, 0, 240);
            gradient.addColorStop(0, 'rgba(59, 130, 246, 0.35)');
            gradient.addColorStop(1, 'rgba(59, 130, 246, 0.00)');
            return gradient;
          },
          fill: true,
          tension: 0.35,
          borderWidth: 2.5,
          pointRadius: historicalDays <= 30 ? 3 : 0,
          pointHoverRadius: 6,
          pointBackgroundColor: '#60a5fa',
          pointBorderColor: '#1e3a8a',
        },
      ],
    };
  }, [isForecast, forecastResult, historicalPoints, historicalDays, baseCurrency]);

  const chartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#0f172a',
        titleColor: '#94a3b8',
        bodyColor: '#ffffff',
        borderColor: isForecast ? '#7e22ce' : '#334155',
        borderWidth: 1,
        padding: 10,
        displayColors: false,
        callbacks: {
          label: (context: any) => {
            const prefix = isForecast ? 'Projected Net Worth' : 'Net Worth';
            return `${prefix}: ${formatCurrency(context.parsed.y, baseCurrency)}`;
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center space-x-2">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              {isForecast ? 'Cash Flow Forecast' : 'Net Worth Evolution'}
            </h3>
            {isForecast && (
              <span className="px-2 py-0.5 text-[10px] bg-purple-500/20 text-purple-300 font-semibold rounded-full border border-purple-500/30">
                Forward Projection (Dashed)
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400">
            {isForecast
              ? `Simulated trajectory based on recurring rules and average discretionary spend`
              : `Historical asset trend including cash and investment holdings in ${baseCurrency}`}
          </p>
        </div>

        {/* Mode & Horizon Controls */}
        <div className="flex flex-wrap items-center gap-1.5 self-start sm:self-auto">
          {/* Historical vs Forecast Tab */}
          <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setMode('historical')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                mode === 'historical'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Historical
            </button>
            <button
              onClick={() => setMode('forecast')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                mode === 'forecast'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Forecast
            </button>
          </div>

          {/* Timeframe Buttons */}
          <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
            {mode === 'historical' ? (
              [
                { label: '30D', value: 30 },
                { label: '90D', value: 90 },
                { label: '6M', value: 180 },
                { label: '1Y', value: 365 },
              ].map((item) => (
                <button
                  key={item.value}
                  onClick={() => setHistoricalDays(item.value)}
                  className={`px-2 py-1 rounded-lg text-xs font-semibold transition ${
                    historicalDays === item.value
                      ? 'bg-slate-800 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              ))
            ) : (
              [
                { label: '3 Months', value: 90 },
                { label: '6 Months', value: 180 },
              ].map((item) => (
                <button
                  key={item.value}
                  onClick={() => setForecastHorizon(item.value)}
                  className={`px-2 py-1 rounded-lg text-xs font-semibold transition ${
                    forecastHorizon === item.value
                      ? 'bg-slate-800 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="h-64 sm:h-72 w-full">
        <Line data={chartData} options={chartOptions} />
      </div>

      {/* Forecast Plain-Language Insights Banner */}
      {isForecast && forecastResult && forecastResult.insights.length > 0 && (
        <div className="space-y-2 pt-1 border-t border-slate-800/80">
          {forecastResult.insights.map((insight, idx) => (
            <div
              key={idx}
              className={`p-3 rounded-xl border text-xs flex items-start space-x-2.5 ${
                insight.type === 'warning'
                  ? 'bg-rose-500/10 border-rose-500/20 text-rose-300'
                  : insight.type === 'surplus'
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                  : 'bg-slate-950 border-slate-800 text-slate-300'
              }`}
            >
              {insight.type === 'warning' ? (
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
              ) : insight.type === 'surplus' ? (
                <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
              ) : (
                <Info className="w-4 h-4 shrink-0 text-slate-400 mt-0.5" />
              )}
              <div>
                <strong className="block font-semibold">{insight.title}</strong>
                <span>{insight.message}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
