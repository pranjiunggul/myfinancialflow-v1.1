/**
 * AI Token Pricing & Estimated Monthly Spending Cap Engine
 * Calculates self-computed token cost estimates per request based on published model rates.
 * Enforces per-provider caps, 80% threshold warnings, and priority rollover cutoff.
 * NOTE: All cost figures are explicitly self-computed ESTIMATES, not literal invoiced amounts.
 */

import { db } from '../db/database';
import type { AIProviderConfig } from '../types';

export interface ModelPricing {
  inputPer1M: number;  // USD per 1M input tokens
  outputPer1M: number; // USD per 1M output tokens
}

export const PUBLISHED_MODEL_PRICING: Record<string, ModelPricing> = {
  // OpenAI
  'gpt-4o': { inputPer1M: 2.5, outputPer1M: 10.0 },
  'gpt-4o-mini': { inputPer1M: 0.15, outputPer1M: 0.6 },
  'o1-mini': { inputPer1M: 1.1, outputPer1M: 4.4 },

  // Google Gemini
  'gemini-2.0-flash': { inputPer1M: 0.075, outputPer1M: 0.3 },
  'gemini-1.5-flash': { inputPer1M: 0.075, outputPer1M: 0.3 },
  'gemini-1.5-pro': { inputPer1M: 1.25, outputPer1M: 5.0 },

  // Anthropic
  'claude-3-5-sonnet-20241022': { inputPer1M: 3.0, outputPer1M: 15.0 },
  'claude-3-5-sonnet': { inputPer1M: 3.0, outputPer1M: 15.0 },
  'claude-3-5-haiku-20241022': { inputPer1M: 0.8, outputPer1M: 4.0 },
  'claude-3-5-haiku': { inputPer1M: 0.8, outputPer1M: 4.0 },

  // DeepSeek
  'deepseek-chat': { inputPer1M: 0.14, outputPer1M: 0.28 },
  'deepseek-reasoner': { inputPer1M: 0.55, outputPer1M: 2.19 },

  // Groq
  'llama-3.3-70b-versatile': { inputPer1M: 0.59, outputPer1M: 0.79 },
  'llama-3.1-8b-instant': { inputPer1M: 0.05, outputPer1M: 0.08 },
};

export const DEFAULT_FALLBACK_PRICING: ModelPricing = {
  inputPer1M: 1.0,
  outputPer1M: 4.0,
};

/**
 * Calculates estimated cost in USD for a given token usage
 */
export function estimateTokenCostUSD(
  modelId: string,
  promptTokens = 0,
  completionTokens = 0
): number {
  const normModel = modelId.toLowerCase().trim();
  const pricing = PUBLISHED_MODEL_PRICING[normModel] || DEFAULT_FALLBACK_PRICING;

  const inputCost = (promptTokens / 1_000_000) * pricing.inputPer1M;
  const outputCost = (completionTokens / 1_000_000) * pricing.outputPer1M;

  return inputCost + outputCost;
}

/**
 * Gets current month string YYYY-MM in local time
 */
export function getCurrentMonthStr(): string {
  const now = new Date();
  const yr = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, '0');
  return `${yr}-${mo}`;
}

/**
 * Checks whether an AI provider has exceeded its estimated monthly spending cap
 */
export function isProviderCapExceeded(provider: AIProviderConfig): {
  isExceeded: boolean;
  isWarning80: boolean;
  estimatedSpend: number;
  cap?: number;
  reason?: string;
} {
  const cap = provider.monthlySpendCap;
  if (!cap || cap <= 0) {
    return { isExceeded: false, isWarning80: false, estimatedSpend: provider.estimatedMonthSpend || 0 };
  }

  // Check if calendar month has changed
  const currentMonth = getCurrentMonthStr();
  let estimatedSpend = provider.estimatedMonthSpend || 0;
  if (provider.lastSpendResetMonth && provider.lastSpendResetMonth !== currentMonth) {
    estimatedSpend = 0; // Rolled over to new calendar month
  }

  const ratio = estimatedSpend / cap;
  const isWarning80 = ratio >= 0.8 && ratio < 1.0;
  const isExceeded = ratio >= 1.0;

  let reason: string | undefined;
  if (isExceeded) {
    reason = `Estimated monthly spending cap reached (~$${estimatedSpend.toFixed(2)} / ~$${cap.toFixed(2)} limit)`;
  }

  return { isExceeded, isWarning80, estimatedSpend, cap, reason };
}

/**
 * Accumulates self-computed estimated usage on the provider record in Dexie
 */
export async function recordEstimatedProviderUsage(
  providerId: string,
  modelId: string,
  promptTokens: number,
  completionTokens: number,
  fxRateToBase = 1.0
): Promise<number> {
  const provider = await db.ai_providers.get(providerId);
  if (!provider) return 0;

  const costUSD = estimateTokenCostUSD(modelId, promptTokens, completionTokens);
  const costInProviderCurrency = costUSD * fxRateToBase;

  const currentMonth = getCurrentMonthStr();
  let currentSpend = provider.estimatedMonthSpend || 0;

  // Monthly rollover reset if entering a new calendar month
  if (!provider.lastSpendResetMonth || provider.lastSpendResetMonth !== currentMonth) {
    currentSpend = 0;
  }

  const updatedSpend = currentSpend + costInProviderCurrency;

  await db.ai_providers.update(providerId, {
    estimatedMonthSpend: updatedSpend,
    lastSpendResetMonth: currentMonth,
    updatedAt: Date.now(),
  });

  return updatedSpend;
}
