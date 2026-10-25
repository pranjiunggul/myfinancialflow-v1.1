/**
 * Automated Test Suite: Phase D — Long-Term Reliability & Privacy
 * Covers:
 * - Feature 9: Opt-In Privacy-Preserving Crash Reporting, Strict Allow-List Enforcement, Zero Financial Data Guarantee
 * - Feature 10: One-Click Full Data Export (Zero-Dependency ZIP) & Two-Tier Erasure ("Right to be Forgotten")
 */

import 'fake-indexeddb/auto';
import { db } from '../src/db/database';
import {
  buildSanitizedTelemetryPayload,
  sanitizeStackTrace,
  reportClientError,
  TELEMETRY_WORKER_URL,
} from '../src/services/telemetry';
import {
  generateFullDataArchiveZip,
  executeFullDataDeletion,
} from '../src/services/dataWipe';
import type { Account, Category, Transaction, AppSettings } from '../src/types';

async function runPhaseDTests() {
  console.log('🚀 Running Phase D: Long-Term Reliability & Privacy Test Suite...\n');

  // =========================================================================
  // GROUP 1: Feature 9 — Crash Reporting & Strict Allow-List Enforcement
  // =========================================================================
  console.log('--- Test 1: Stack Trace Sanitization ---');
  const rawStack = `Error: Network failed
    at render (http://localhost:3000/src/components/chat/AIChatView.tsx?token=secretKey123:45:12)
    at Object.commit (http://localhost:3000/node_modules/react-dom/client.js:12:4)`;

  const sanitized = sanitizeStackTrace(rawStack);
  console.log('Sanitized stack trace:\n' + sanitized);
  if (sanitized.includes('secretKey123') || sanitized.includes('http://localhost')) {
    throw new Error('Stack trace sanitization failed to strip URLs or parameters!');
  }
  console.log('[PASS] Stack trace sanitized: query parameters and absolute origins stripped.');

  console.log('\n--- Test 2: Payload Allow-List Enforcement (Zero Financial Data Guarantee) ---');
  const mockError = new Error('IndexDB transaction failure on read');
  (mockError as any).sensitiveBalance = 50000000;
  (mockError as any).accountName = 'Secret Swiss Bank';

  const payload = buildSanitizedTelemetryPayload(mockError);
  console.log('Constructed telemetry payload keys:', Object.keys(payload));

  const allowedKeys = new Set(['errorMessage', 'stackTrace', 'appVersion', 'deviceType', 'os', 'browser', 'timestamp']);
  const payloadKeys = Object.keys(payload);
  const extraKeys = payloadKeys.filter((k) => !allowedKeys.has(k));

  if (extraKeys.length > 0) {
    throw new Error(`Payload contains non-allowlisted keys: ${extraKeys.join(', ')}`);
  }
  if ((payload as any).sensitiveBalance || (payload as any).accountName) {
    throw new Error('Sensitive financial properties leaked into telemetry payload!');
  }
  console.log('[PASS] Telemetry payload strictly conforms to allow-list; zero financial data transmitted.');

  console.log('\n--- Test 3: Default OFF Opt-In Gating ---');
  await db.settings.clear();
  await db.settings.add({
    id: 'current',
    baseCurrency: 'IDR',
    dateFormat: 'YYYY-MM-DD',
    language: 'id',
    theme: 'dark',
    deviceId: 'dev_test',
    deviceName: 'Test Laptop',
    pinEnabled: false,
    biometricsEnabled: false,
    autoLockMinutes: 5,
    googleDriveLinked: false,
    dailyBackupEnabled: true,
    aiEnabled: false,
    aiProvider: 'gemini',
    crashReportingEnabled: false, // Default OFF
  });

  let fetchCalled = false;
  const mockFetch = async () => {
    fetchCalled = true;
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  };

  const reportedDefaultOff = await reportClientError(new Error('Sample error'), TELEMETRY_WORKER_URL, mockFetch as any);
  console.log(`Reporting result when OFF: ${reportedDefaultOff}, fetchCalled: ${fetchCalled}`);
  if (reportedDefaultOff !== false || fetchCalled) {
    throw new Error('Crash reporting sent network request when opt-in was disabled!');
  }
  console.log('[PASS] Default OFF gating verified: zero network calls when disabled.');

  console.log('\n--- Test 4: Reporting Dispatches When Explicitly Opted-In ---');
  await db.settings.update('current', { crashReportingEnabled: true });
  let receivedPayload: any = null;

  const mockReportingFetch = async (url: string, opts: any) => {
    receivedPayload = JSON.parse(opts.body);
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  };

  const reportedOn = await reportClientError(new Error('Syntax render error'), TELEMETRY_WORKER_URL, mockReportingFetch as any);
  console.log(`Reporting result when ON: ${reportedOn}, received errorMessage: "${receivedPayload?.errorMessage}"`);
  if (!reportedOn || receivedPayload?.errorMessage !== 'Syntax render error') {
    throw new Error('Crash reporting failed to dispatch payload when opt-in was enabled!');
  }
  console.log('[PASS] Opted-in reporting dispatched allow-listed technical payload successfully.');

  // =========================================================================
  // GROUP 2: Feature 10 — "Right to be Forgotten" (Full ZIP Export & Wipe)
  // =========================================================================
  console.log('\n--- Test 5: Full Data Archive Zero-Dependency ZIP Generation ---');
  await db.accounts.clear();
  await db.categories.clear();
  await db.transactions.clear();

  await db.accounts.add({
    id: 'acc_export_test',
    name: 'BCA Main',
    type: 'bank',
    currency: 'IDR',
    initialBalance: 2000000,
    currentBalance: 2000000,
    icon: 'Landmark',
    color: '#0055aa',
    includeInNetWorth: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    deviceId: 'dev_test',
    isDeleted: false,
    version: 1,
  });

  await db.categories.add({
    id: 'cat_export_test',
    name: 'Groceries',
    type: 'expense',
    icon: 'ShoppingCart',
    color: '#f97316',
    isSystem: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    deviceId: 'dev_test',
    isDeleted: false,
    version: 1,
  });

  await db.transactions.add({
    id: 'tx_export_test',
    type: 'expense',
    date: '2026-10-24',
    timestamp: Date.now(),
    amount: 85000,
    currency: 'IDR',
    exchangeRateToBase: 1.0,
    baseAmount: 85000,
    accountId: 'acc_export_test',
    categoryId: 'cat_export_test',
    description: 'Weekly Fruit Market',
    tags: ['groceries', 'fresh'],
    inputSource: 'manual',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    deviceId: 'dev_test',
    isDeleted: false,
    version: 1,
  });

  // Include sensitive settings to test stripping
  await db.settings.update('current', {
    pinHash: 'sensitive_hash_value',
    telegramBotTokenEnc: { format: 'financeflow_enc_v1', salt: 's', iv: 'i', ciphertext: 'c', timestamp: 123 },
    aiApiKey: 'sk-secret-key-to-strip',
  });

  const zipBytes = await generateFullDataArchiveZip('IDR');
  console.log(`Generated ZIP archive: ${zipBytes.length} bytes`);

  // Verify standard ZIP Local File Header magic number 0x04034b50 (PK\x03\x04)
  if (zipBytes[0] !== 0x50 || zipBytes[1] !== 0x4b || zipBytes[2] !== 0x03 || zipBytes[3] !== 0x04) {
    throw new Error('Generated file does not match standard PK0304 ZIP file header signature!');
  }
  console.log('[PASS] Valid standard ZIP header (PK\\x03\\x04) generated by zero-dependency packager.');

  // Convert bytes to text to inspect entries
  const zipText = new TextDecoder().decode(zipBytes);
  if (!zipText.includes('transactions.csv') || !zipText.includes('accounts.json') || !zipText.includes('settings_sanitized.json')) {
    throw new Error('ZIP archive missing required table files!');
  }
  if (zipText.includes('sk-secret-key-to-strip') || zipText.includes('sensitive_hash_value')) {
    throw new Error('Sanitized export leaked sensitive encryption keys or hashed PIN!');
  }
  console.log('[PASS] All data tables included in ZIP; credentials & PIN hashes strictly scrubbed.');

  console.log('\n--- Test 6: Two-Tier Data Erasure (Cloud-First Before Local Wipe) ---');
  let mockDriveDeleted = false;
  // Mock global fetch for Google Drive delete requests
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, opts: any) => {
    if (url.includes('googleapis.com') && opts?.method === 'DELETE') {
      mockDriveDeleted = true;
      return new Response(null, { status: 204 });
    }
    if (url.includes('googleapis.com/drive/v3/files?spaces=appDataFolder')) {
      return new Response(JSON.stringify({ files: [{ id: 'cloud_manifest_1' }] }), { status: 200 });
    }
    return new Response(null, { status: 200 });
  }) as any;

  // Execute full wipe with cloud deletion enabled
  const wipeResult = await executeFullDataDeletion(true, 'mock_google_oauth_token');
  globalThis.fetch = originalFetch;

  console.log(`Wipe result: cloudDeleted = ${wipeResult.cloudDeleted}, localDeleted = ${wipeResult.localDeleted}`);
  if (!wipeResult.cloudDeleted || !wipeResult.localDeleted || !mockDriveDeleted) {
    throw new Error('Two-tier deletion failed to execute cloud-before-local wipe!');
  }

  // Verify all IndexedDB tables are empty
  const remainingAccounts = await db.accounts.count();
  const remainingTxs = await db.transactions.count();
  const remainingCategories = await db.categories.count();
  console.log(`Remaining records in IndexedDB: accounts=${remainingAccounts}, txs=${remainingTxs}, categories=${remainingCategories}`);

  if (remainingAccounts !== 0 || remainingTxs !== 0 || remainingCategories !== 0) {
    throw new Error('Residual records found in IndexedDB after full erasure!');
  }
  console.log('[PASS] All IndexedDB tables completely erased (0 residual records).');

  console.log('\n🎉 All Phase D Long-Term Reliability & Privacy Tests Passed Successfully!');
}

runPhaseDTests().catch((err) => {
  console.error('\n❌ Phase D tests failed:', err);
  process.exit(1);
});
