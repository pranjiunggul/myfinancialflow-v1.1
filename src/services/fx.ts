import { db } from '../db/database';
import type { CurrencyCode } from '../types';

/**
 * Format currency amount with locale-aware symbol, grouping, and standard decimals
 */
export function formatCurrency(
  amount: number,
  currency: CurrencyCode = 'IDR',
  options?: { compact?: boolean }
): string {
  try {
    const isIDR = currency.toUpperCase() === 'IDR';
    const hasDecimals = !isIDR && amount % 1 !== 0;

    const formatter = new Intl.NumberFormat(isIDR ? 'id-ID' : 'en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: isIDR ? 0 : hasDecimals ? 2 : 0,
      maximumFractionDigits: isIDR ? 0 : 2,
      notation: options?.compact ? 'compact' : 'standard',
    });

    return formatter.format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

/**
 * Fetch live exchange rate from Frankfurter API with fallback to IndexedDB cached rates
 */
export async function getExchangeRate(
  fromCurrency: CurrencyCode,
  toCurrency: CurrencyCode
): Promise<{ rate: number; isOfflineCached: boolean }> {
  const from = fromCurrency.toUpperCase();
  const to = toCurrency.toUpperCase();

  if (from === to) {
    return { rate: 1.0, isOfflineCached: false };
  }

  const cacheKey = `${from}_${to}`;
  const reverseCacheKey = `${to}_${from}`;

  // 1. Try to fetch live from Frankfurter API
  const isOnline = typeof navigator === 'undefined' ? true : navigator.onLine !== false;
  if (isOnline) {
    try {
      const response = await fetch(`https://api.frankfurter.dev/v1/latest?base=${from}&symbols=${to}`, {
        headers: { Accept: 'application/json' },
      });

      if (response.ok) {
        const data = await response.json();
        const liveRate = data.rates?.[to];

        if (typeof liveRate === 'number') {
          // Cache to IndexedDB
          await db.fx_rates.put({
            id: cacheKey,
            fromCurrency: from,
            toCurrency: to,
            rate: liveRate,
            updatedAt: Date.now(),
            source: 'frankfurter',
          });

          return { rate: liveRate, isOfflineCached: false };
        }
      }
    } catch {
      // Network failed or offline - fall through to local cache
    }
  }

  // 2. Check local cached rates in IndexedDB
  const cached = await db.fx_rates.get(cacheKey);
  if (cached && typeof cached.rate === 'number') {
    return { rate: cached.rate, isOfflineCached: true };
  }

  // 2b. Check reverse cache if available (1 / rate)
  const reverseCached = await db.fx_rates.get(reverseCacheKey);
  if (reverseCached && typeof reverseCached.rate === 'number' && reverseCached.rate > 0) {
    return { rate: 1 / reverseCached.rate, isOfflineCached: true };
  }

  // 3. Fallback sensible estimates if neither API nor cache is populated
  const HARDCODED_FALLBACKS: Record<string, number> = {
    USD_IDR: 16250,
    EUR_IDR: 17500,
    SGD_IDR: 12200,
    GBP_IDR: 20600,
    IDR_USD: 1 / 16250,
    IDR_EUR: 1 / 17500,
  };

  const fallback = HARDCODED_FALLBACKS[cacheKey];
  if (fallback) {
    return { rate: fallback, isOfflineCached: true };
  }

  return { rate: 1.0, isOfflineCached: true };
}
