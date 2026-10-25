/**
 * Investment & Non-Cash Asset Tracking Service
 * Handles non-cash asset management (stocks, mutual funds, crypto, gold, property),
 * manual valuation updates, valuation history logs, and optional public crypto price lookups.
 */

import { db, getOrCreateDeviceId } from '../db/database';
import type {
  InvestmentAsset,
  AssetValuation,
  CurrencyCode,
} from '../types';

// In-memory price cache for crypto lookups (15 min TTL)
const cryptoPriceCache = new Map<string, { priceUsd: number; timestamp: number }>();

const CRYPTO_SYMBOL_MAP: Record<string, string> = {
  btc: 'bitcoin',
  eth: 'ethereum',
  sol: 'solana',
  usdt: 'tether',
  usdc: 'usd-coin',
  bnb: 'binance-coin',
  xrp: 'ripple',
  ada: 'cardano',
  doge: 'dogecoin',
};

/**
 * Creates a new investment asset
 */
export async function createInvestmentAsset(
  assetData: Omit<InvestmentAsset, 'id' | 'createdAt' | 'updatedAt' | 'isDeleted' | 'deviceId' | 'version'>
): Promise<InvestmentAsset> {
  const deviceId = getOrCreateDeviceId();
  const id = 'asset_' + crypto.randomUUID().slice(0, 8);
  const now = Date.now();

  const newAsset: InvestmentAsset = {
    ...assetData,
    id,
    includeInNetWorth: assetData.includeInNetWorth !== undefined ? assetData.includeInNetWorth : true,
    createdAt: now,
    updatedAt: now,
    isDeleted: false,
    deviceId,
    version: 1,
  };

  await db.investment_assets.add(newAsset);

  // Initial valuation history entry
  const todayStr = new Date().toISOString().slice(0, 10);
  await db.asset_valuations.add({
    id: 'val_' + crypto.randomUUID().slice(0, 8),
    assetId: id,
    date: assetData.lastValuationDate || todayStr,
    value: assetData.currentValue,
    unitPrice: assetData.quantity && assetData.quantity > 0 ? assetData.currentValue / assetData.quantity : undefined,
    source: 'manual',
    createdAt: now,
  });

  // Audit log
  await db.audit_logs.add({
    id: 'audit_' + crypto.randomUUID().slice(0, 8),
    entityType: 'asset',
    entityId: id,
    action: 'create',
    deviceId,
    timestamp: now,
    changeSummary: `Created investment asset "${newAsset.name}" with initial valuation ${newAsset.currency} ${newAsset.currentValue}.`,
  });

  return newAsset;
}

/**
 * Records a new valuation entry for an asset and updates its current valuation
 */
export async function updateAssetValuation(
  assetId: string,
  newValue: number,
  options?: {
    date?: string;
    unitPrice?: number;
    source?: 'manual' | 'api';
    notes?: string;
  }
): Promise<InvestmentAsset | null> {
  const asset = await db.investment_assets.get(assetId);
  if (!asset) return null;

  const now = Date.now();
  const todayStr = new Date().toISOString().slice(0, 10);
  const valDate = options?.date || todayStr;

  // Add valuation log
  await db.asset_valuations.add({
    id: 'val_' + crypto.randomUUID().slice(0, 8),
    assetId,
    date: valDate,
    value: newValue,
    unitPrice: options?.unitPrice || (asset.quantity && asset.quantity > 0 ? newValue / asset.quantity : undefined),
    source: options?.source || 'manual',
    notes: options?.notes,
    createdAt: now,
  });

  // Update asset record
  const updatedAsset: InvestmentAsset = {
    ...asset,
    currentValue: newValue,
    lastValuationDate: valDate,
    updatedAt: now,
    version: (asset.version || 1) + 1,
  };

  await db.investment_assets.put(updatedAsset);

  // Audit log
  await db.audit_logs.add({
    id: 'audit_' + crypto.randomUUID().slice(0, 8),
    entityType: 'asset',
    entityId: assetId,
    action: 'update',
    deviceId: getOrCreateDeviceId(),
    timestamp: now,
    changeSummary: `Updated valuation for asset "${updatedAsset.name}" to ${updatedAsset.currency} ${updatedAsset.currentValue}.`,
  });

  return updatedAsset;
}

/**
 * Updates asset metadata
 */
export async function updateInvestmentAsset(
  id: string,
  updates: Partial<InvestmentAsset>
): Promise<InvestmentAsset | null> {
  const asset = await db.investment_assets.get(id);
  if (!asset) return null;

  const now = Date.now();
  const updatedAsset: InvestmentAsset = {
    ...asset,
    ...updates,
    updatedAt: now,
    version: (asset.version || 1) + 1,
  };

  await db.investment_assets.put(updatedAsset);
  return updatedAsset;
}

/**
 * Soft deletes an asset
 */
export async function deleteInvestmentAsset(id: string): Promise<boolean> {
  const asset = await db.investment_assets.get(id);
  if (!asset) return false;

  const now = Date.now();
  await db.investment_assets.update(id, {
    isDeleted: true,
    updatedAt: now,
    version: (asset.version || 1) + 1,
  });

  await db.audit_logs.add({
    id: 'audit_' + crypto.randomUUID().slice(0, 8),
    entityType: 'asset',
    entityId: id,
    action: 'soft_delete',
    deviceId: getOrCreateDeviceId(),
    timestamp: now,
    changeSummary: `Soft-deleted investment asset "${asset.name}".`,
  });

  return true;
}

/**
 * Retrieves all active investment assets
 */
export async function getActiveInvestmentAssets(): Promise<InvestmentAsset[]> {
  const all = await db.investment_assets.toArray();
  return all.filter((a) => !a.isDeleted);
}

/**
 * Fetches valuation history for an asset
 */
export async function getAssetValuationHistory(assetId: string): Promise<AssetValuation[]> {
  const history = await db.asset_valuations.where('assetId').equals(assetId).toArray();
  return history.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Optional live crypto price fetch via public CoinCap / CoinGecko REST endpoint
 */
export async function fetchLiveCryptoPrice(tickerSymbol: string): Promise<number | null> {
  const cleanTicker = tickerSymbol.trim().toLowerCase();
  const assetId = CRYPTO_SYMBOL_MAP[cleanTicker] || cleanTicker;

  // Check cache first
  const cached = cryptoPriceCache.get(assetId);
  if (cached && Date.now() - cached.timestamp < 15 * 60 * 1000) {
    return cached.priceUsd;
  }

  try {
    // Attempt CoinCap public endpoint
    const response = await fetch(`https://api.coincap.io/v2/assets/${assetId}`);
    if (response.ok) {
      const data = await response.json();
      const priceUsd = parseFloat(data?.data?.priceUsd);
      if (!isNaN(priceUsd) && priceUsd > 0) {
        cryptoPriceCache.set(assetId, { priceUsd, timestamp: Date.now() });
        return priceUsd;
      }
    }
  } catch (err) {
    // Graceful offline fallback
    console.warn(`[Crypto Price Sync] Could not fetch live price for ${tickerSymbol}:`, err);
  }

  return null;
}

/**
 * Aggregates all active investment assets into the base currency
 */
export function calculateInvestmentsTotal(
  assets: InvestmentAsset[],
  baseCurrency: CurrencyCode = 'IDR',
  usdRate: number = 16250
): number {
  return assets
    .filter((a) => !a.isDeleted && a.includeInNetWorth)
    .reduce((total, asset) => {
      let multiplier = 1.0;
      if (asset.currency !== baseCurrency) {
        if (asset.currency === 'USD' && baseCurrency === 'IDR') {
          multiplier = usdRate;
        } else if (asset.currency === 'IDR' && baseCurrency === 'USD') {
          multiplier = 1 / usdRate;
        }
      }
      return total + (asset.currentValue * multiplier);
    }, 0);
}
