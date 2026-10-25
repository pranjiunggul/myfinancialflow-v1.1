import React, { useState, useEffect } from 'react';
import { Sparkles, Check, X, ArrowRight } from 'lucide-react';
import {
  detectRecurringSubscriptions,
  acceptSubscriptionPattern,
  dismissSubscriptionPattern,
} from '../../services/subscriptionDetector';
import { formatCurrency } from '../../services/fx';
import type { SubscriptionPattern, CurrencyCode } from '../../types';

interface SubscriptionSuggestionBannerProps {
  baseCurrency: CurrencyCode;
  onRuleCreated?: () => void;
  onOpenOverview?: () => void;
}

export const SubscriptionSuggestionBanner: React.FC<SubscriptionSuggestionBannerProps> = ({
  baseCurrency: _baseCurrency,
  onRuleCreated,
  onOpenOverview,
}) => {
  const [patterns, setPatterns] = useState<SubscriptionPattern[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    detectRecurringSubscriptions().then(setPatterns).catch(console.error);
  }, []);

  if (patterns.length === 0 || currentIndex >= patterns.length) {
    return null;
  }

  const currentPattern = patterns[currentIndex];

  const handleAccept = async () => {
    try {
      await acceptSubscriptionPattern(currentPattern);
      onRuleCreated?.();
      setCurrentIndex((prev) => prev + 1);
    } catch (err) {
      console.error('Failed to accept subscription pattern:', err);
    }
  };

  const handleDismiss = async () => {
    try {
      await dismissSubscriptionPattern(currentPattern);
      setCurrentIndex((prev) => prev + 1);
    } catch (err) {
      console.error('Failed to dismiss pattern:', err);
    }
  };

  const frequencyLabel =
    currentPattern.frequency === 'monthly'
      ? `around day ${currentPattern.dayOfMonth || 1} every month`
      : currentPattern.frequency === 'weekly'
      ? 'every week'
      : currentPattern.frequency === 'biweekly'
      ? 'every 2 weeks'
      : 'every year';

  return (
    <div className="bg-gradient-to-r from-blue-900/40 via-indigo-900/30 to-purple-900/30 border border-blue-500/30 rounded-xl p-4 mb-4 backdrop-blur-sm shadow-md animate-fade-in">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-blue-500/20 text-blue-400">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white flex items-center gap-2">
              Recurring Subscription Detected
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-normal">
                {currentIndex + 1} of {patterns.length}
              </span>
            </h4>
            <p className="text-xs text-gray-300 mt-0.5">
              Looks like <strong className="text-white font-medium">{currentPattern.merchantName}</strong> (
              <span className="text-blue-300 font-semibold">
                {formatCurrency(currentPattern.amount, currentPattern.currency)}
              </span>
              ) occurs {frequencyLabel}. Turn into an automatic recurring rule?
            </p>
          </div>
        </div>

        <button
          onClick={handleDismiss}
          className="text-gray-400 hover:text-gray-200 p-1 rounded-md"
          title="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center justify-between mt-3 pt-2 border-t border-white/10">
        {onOpenOverview ? (
          <button
            onClick={onOpenOverview}
            className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 transition"
          >
            <span>Subscriptions & Recurring</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        ) : (
          <div />
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={handleDismiss}
            className="px-3 py-1 text-xs text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition"
          >
            Dismiss
          </button>
          <button
            onClick={handleAccept}
            className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-sm transition"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Turn into Rule</span>
          </button>
        </div>
      </div>
    </div>
  );
};
