import 'fake-indexeddb/auto';
import { db, initializeDatabaseSeed } from '../src/db/database';
import { getExchangeRate, formatCurrency } from '../src/services/fx';
import { createTransaction } from '../src/services/ledger';

async function runFxEngineTests() {
  console.log('🚀 Starting Milestone 2.3 Test Suite: Live FX Engine, Caching & Snapshots...\n');

  await initializeDatabaseSeed();

  // Test 1: Live Frankfurter API fetch
  console.log('--- Test 1: Fetch Live FX Rate via Frankfurter API (USD -> EUR) ---');
  const liveResult = await getExchangeRate('USD', 'EUR');
  console.log(`Live rate USD -> EUR: ${liveResult.rate}, isOfflineCached: ${liveResult.isOfflineCached}`);

  if (typeof liveResult.rate !== 'number' || liveResult.rate <= 0) {
    throw new Error('Invalid rate returned from Frankfurter API!');
  }
  if (liveResult.isOfflineCached !== false) {
    throw new Error('Live fetch should report isOfflineCached === false!');
  }
  console.log('[PASS] Live FX rate successfully retrieved from Frankfurter API.');

  // Test 2: Verify IndexedDB caching
  console.log('\n--- Test 2: Verify Rate Caching in IndexedDB ---');
  const cachedRecord = await db.fx_rates.get('USD_EUR');
  console.log('Cached record in IndexedDB:', cachedRecord);

  if (!cachedRecord || cachedRecord.rate !== liveResult.rate || cachedRecord.source !== 'frankfurter') {
    throw new Error('Rate was not properly cached to IndexedDB fx_rates store!');
  }
  console.log('[PASS] Rate successfully cached in IndexedDB with source and timestamp.');

  // Test 3: Offline Stale-Rate Fallback
  console.log('\n--- Test 3: Offline Stale-Rate Fallback ---');
  // Seed a known historical cached rate in IndexedDB
  const MOCK_HISTORICAL_RATE = 11850;
  await db.fx_rates.put({
    id: 'SGD_IDR',
    fromCurrency: 'SGD',
    toCurrency: 'IDR',
    rate: MOCK_HISTORICAL_RATE,
    updatedAt: Date.now() - 86400000, // 1 day ago
    source: 'frankfurter',
  });

  // Temporarily simulate offline
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => Promise.reject(new Error('Network offline'))) as any;

  try {
    const offlineResult = await getExchangeRate('SGD', 'IDR');
    console.log(`Offline fallback rate SGD -> IDR: ${offlineResult.rate}, isOfflineCached: ${offlineResult.isOfflineCached}`);

    if (offlineResult.rate !== MOCK_HISTORICAL_RATE || offlineResult.isOfflineCached !== true) {
      throw new Error(`Offline fallback failed! Expected ${MOCK_HISTORICAL_RATE} (cached), got ${offlineResult.rate}`);
    }
    console.log('[PASS] Offline fallback successfully returned cached stale rate with isOfflineCached === true.');

    // Test 4: Reverse Cache Derivation (1 / rate)
    console.log('\n--- Test 4: Reverse Rate Calculation (EUR -> USD) ---');
    const reverseResult = await getExchangeRate('EUR', 'USD');
    const expectedReverse = Math.round((1 / liveResult.rate) * 10000) / 10000;
    const actualReverse = Math.round(reverseResult.rate * 10000) / 10000;
    console.log(`Reverse rate EUR -> USD: ${actualReverse} (expected ~${expectedReverse})`);

    if (Math.abs(actualReverse - expectedReverse) > 0.01) {
      throw new Error('Reverse rate derivation failed!');
    }
    console.log('[PASS] Reverse rate accurately derived from cached pair.');
  } finally {
    // Restore fetch
    globalThis.fetch = originalFetch;
  }

  // Test 5: Per-Transaction exchangeRateToBase Snapshotting
  console.log('\n--- Test 5: Historical Stability (Per-Transaction Snapshotting) ---');
  const SNAPSHOT_RATE_DAY_1 = 16200;
  const USD_AMOUNT = 150;

  // Record transaction on Day 1
  const tx = await createTransaction({
    type: 'income',
    amount: USD_AMOUNT,
    currency: 'USD',
    exchangeRateToBase: SNAPSHOT_RATE_DAY_1,
    baseAmount: USD_AMOUNT * SNAPSHOT_RATE_DAY_1, // 2,430,000 IDR
    accountId: 'acc_paypal_usd',
    categoryId: 'cat_freelance',
    date: '2026-10-01',
    timestamp: Date.now() - 86400000 * 20,
    description: 'Client invoice payment via PayPal USD',
    inputSource: 'manual',
  });

  console.log(`Transaction recorded with historical rate: ${tx.exchangeRateToBase}, baseAmount: ${tx.baseAmount}`);

  // Simulate market moving on Day 20 to 18,500 IDR
  const MARKET_RATE_DAY_20 = 18500;
  await db.fx_rates.put({
    id: 'USD_IDR',
    fromCurrency: 'USD',
    toCurrency: 'IDR',
    rate: MARKET_RATE_DAY_20,
    updatedAt: Date.now(),
    source: 'frankfurter',
  });

  // Re-fetch the historical transaction from IndexedDB
  const historicalTx = await db.transactions.get(tx.id);
  console.log(`Historical transaction rate after market shift: ${historicalTx?.exchangeRateToBase}`);
  console.log(`Historical transaction baseAmount after market shift: ${historicalTx?.baseAmount}`);

  if (historicalTx?.exchangeRateToBase !== SNAPSHOT_RATE_DAY_1) {
    throw new Error('Historical exchange rate was mutated! Accounting integrity compromised!');
  }
  if (historicalTx?.baseAmount !== USD_AMOUNT * SNAPSHOT_RATE_DAY_1) {
    throw new Error('Historical base amount was mutated! Reporting will fluctuate!');
  }
  console.log('[PASS] Per-transaction FX rate and base amount remain permanently frozen at transaction time.');

  console.log('\n🎉 ALL MILESTONE 2.3 FX ENGINE TESTS PASSED WITH 100% SUCCESS!');
}

runFxEngineTests().catch((err) => {
  console.error('\n❌ FX ENGINE TEST FAILED:', err);
  process.exit(1);
});
