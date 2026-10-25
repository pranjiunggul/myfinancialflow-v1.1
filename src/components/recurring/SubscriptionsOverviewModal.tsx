import React, { useState, useEffect } from 'react';
import {
  X,
  CreditCard,
  Calendar,
  Sparkles,
  Check,
  Plus,
  RefreshCw,
  TrendingDown,
  Info,
} from 'lucide-react';
import { db } from '../../db/database';
import {
  detectRecurringSubscriptions,
  acceptSubscriptionPattern,
  dismissSubscriptionPattern,
  calculateTotalCommittedMonthlySpend,
} from '../../services/subscriptionDetector';
import { formatCurrency } from '../../services/fx';
import type { RecurringRule, SubscriptionPattern, CurrencyCode } from '../../types';

interface SubscriptionsOverviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  baseCurrency: CurrencyCode;
  onOpenCreateRule: () => void;
}

export const SubscriptionsOverviewModal: React.FC<SubscriptionsOverviewModalProps> = ({
  isOpen,
  onClose,
  baseCurrency,
  onOpenCreateRule,
}) => {
  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [patterns, setPatterns] = useState<SubscriptionPattern[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [allRules, detected] = await Promise.all([
        db.recurring_rules.filter((r) => !r.isDeleted).toArray(),
        detectRecurringSubscriptions(),
      ]);
      setRules(allRules);
      setPatterns(detected);
    } catch (err) {
      console.error('Failed to load subscriptions overview:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const { totalMonthlySpend, breakdown } = calculateTotalCommittedMonthlySpend(
    rules,
    {},
    baseCurrency
  );

  const handleAcceptPattern = async (pat: SubscriptionPattern) => {
    await acceptSubscriptionPattern(pat);
    await loadData();
  };

  const handleDismissPattern = async (pat: SubscriptionPattern) => {
    await dismissSubscriptionPattern(pat);
    await loadData();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-900/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Subscriptions & Recurring</h2>
              <p className="text-xs text-gray-400">
                Track committed recurring expenses and detected repeating bills
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-gray-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Total Committed Monthly Spend Banner */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-indigo-950/60 to-purple-950/40 border border-indigo-800/40">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-indigo-300">
                  Total Committed Monthly Spend
                </p>
                <h3 className="text-2xl font-extrabold text-white mt-1">
                  {formatCurrency(totalMonthlySpend, baseCurrency)}
                  <span className="text-xs font-normal text-gray-400 ml-1.5">/ month</span>
                </h3>
              </div>
              <div className="p-3 rounded-full bg-indigo-500/20 text-indigo-300">
                <TrendingDown className="w-6 h-6" />
              </div>
            </div>
            <p className="text-xs text-indigo-200/70 mt-2 flex items-center gap-1">
              <Info className="w-3.5 h-3.5 inline" />
              <span>
                Sum of {rules.length} active recurring {rules.length === 1 ? 'rule' : 'rules'} normalized to monthly cost.
              </span>
            </p>
          </div>

          {/* Section: Detected Unlinked Patterns */}
          {patterns.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>Detected Potential Subscriptions ({patterns.length})</span>
                </h4>
              </div>
              <p className="text-xs text-gray-400 mb-3">
                Transactions with repeating amounts and dates detected from your transaction history.
              </p>

              <div className="space-y-2.5">
                {patterns.map((pat) => (
                  <div
                    key={pat.id}
                    className="p-3.5 rounded-xl bg-gray-800/70 border border-amber-500/30 flex items-center justify-between gap-3"
                  >
                    <div>
                      <h5 className="text-sm font-medium text-white">{pat.merchantName}</h5>
                      <p className="text-xs text-gray-300 mt-0.5">
                        <span className="text-amber-300 font-semibold">
                          {formatCurrency(pat.amount, pat.currency)}
                        </span>{' '}
                        • Repeats {pat.frequency}{' '}
                        {pat.dayOfMonth ? `(around the ${pat.dayOfMonth}th)` : ''}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleDismissPattern(pat)}
                        className="px-2.5 py-1 text-xs text-gray-400 hover:text-white rounded-lg hover:bg-gray-700 transition"
                      >
                        Dismiss
                      </button>
                      <button
                        onClick={() => handleAcceptPattern(pat)}
                        className="flex items-center gap-1 px-3 py-1 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Add Rule</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section: Active Rules List */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                <Calendar className="w-4 h-4 text-indigo-400" />
                <span>Active Recurring Rules ({rules.length})</span>
              </h4>
              <button
                onClick={onOpenCreateRule}
                className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 font-medium"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add New Rule</span>
              </button>
            </div>

            {rules.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-gray-800 rounded-xl text-gray-400">
                <p className="text-sm">No active recurring rules yet.</p>
                <button
                  onClick={onOpenCreateRule}
                  className="mt-2 text-xs text-indigo-400 hover:underline"
                >
                  Create your first recurring subscription
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {rules.map((rule) => (
                  <div
                    key={rule.id}
                    className="p-3 rounded-xl bg-gray-800/50 border border-gray-700/60 flex items-center justify-between"
                  >
                    <div>
                      <h5 className="text-sm font-medium text-white">{rule.title}</h5>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {rule.frequency.toUpperCase()} • Next execution: {rule.nextExecutionDate}
                        {rule.autoPost ? ' (Auto-post)' : ' (Reminder only)'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-white">
                        {formatCurrency(rule.amount, rule.currency)}
                      </p>
                      <p className="text-[11px] text-gray-400">
                        ~{formatCurrency(
                          breakdown.find((b) => b.title === rule.title)?.monthlyCost || rule.amount,
                          baseCurrency
                        )}/mo
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-800 bg-gray-900/50 flex justify-between items-center">
          <button
            onClick={loadData}
            disabled={isLoading}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh Scan</span>
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-white bg-gray-800 hover:bg-gray-700 rounded-lg transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
