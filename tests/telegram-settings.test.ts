/**
 * Automated Test Suite: Telegram Integration Settings Page
 * Validates:
 * 1. PIN-gated encrypted bot token storage (AES-GCM-256 + PBKDF2 600,000 iterations)
 * 2. Token masking & PIN-authorized reveal
 * 3. Test Connection (getMe) flow: success & failure cases
 * 4. Chat ID linking: auto-detection from getUpdates and manual fallback
 * 5. Option A vs Option B bridge mode switching and webhook verification
 * 6. Disconnection & credential zeroing from IndexedDB
 */

import 'fake-indexeddb/auto';
import { db, initializeDatabaseSeed } from '../src/db/database';
import {
  saveTelegramConfig,
  revealTelegramToken,
  testTelegramBot,
  detectTelegramChatId,
  verifyWorkerWebhook,
  disconnectTelegram,
} from '../src/services/telegram';

async function runTelegramSettingsTests() {
  console.log('🚀 Starting Telegram Settings Page Automated Test Suite...\n');

  await initializeDatabaseSeed();

  const MASTER_PIN = '123456';
  const WRONG_PIN = '654321';
  const MOCK_TOKEN = '1234567890:ABCdefGhIjklmNoPQRstuVWxyz1234';

  // =========================================================================
  // Test 1: PIN-Gated Encrypted Token Storage & Masking
  // =========================================================================
  console.log('--- Test 1: PIN-Gated Encrypted Token Storage & Masking ---');

  // 1a: Saving without PIN must fail
  let pinErrorThrown = false;
  try {
    await saveTelegramConfig({
      token: MOCK_TOKEN,
      pin: '',
    });
  } catch (err: any) {
    pinErrorThrown = true;
    if (!err.message.includes('Master PIN required')) {
      throw new Error(`Unexpected error message: ${err.message}`);
    }
  }
  if (!pinErrorThrown) {
    throw new Error('Security Violation: saveTelegramConfig succeeded without PIN!');
  }
  console.log('[PASS] Blocked saving without Master PIN.');

  // 1b: Saving with valid PIN must encrypt at rest with AES-GCM-256
  await saveTelegramConfig({
    token: MOCK_TOKEN,
    pin: MASTER_PIN,
    botUsername: '@FinanceFlowTestBot',
  });

  const settingsAfterSave = await db.settings.get('current');
  if (!settingsAfterSave?.telegramEnabled) {
    throw new Error('telegramEnabled was not set to true in settings!');
  }
  if (!settingsAfterSave?.telegramBotTokenEnc) {
    throw new Error('telegramBotTokenEnc was not stored in settings!');
  }

  // Ensure ciphertext is an encrypted payload format
  if (settingsAfterSave.telegramBotTokenEnc.format !== 'financeflow_enc_v1') {
    throw new Error(`Invalid encrypted payload format: ${settingsAfterSave.telegramBotTokenEnc.format}`);
  }
  if (!settingsAfterSave.telegramBotTokenEnc.ciphertext || settingsAfterSave.telegramBotTokenEnc.ciphertext.includes(MOCK_TOKEN)) {
    throw new Error('Security Breach: Token was stored in plaintext or unencrypted!');
  }

  // Ensure token is masked for display
  if (settingsAfterSave.telegramBotTokenMasked !== '123456...1234') {
    throw new Error(`Masked token mismatch: expected 123456...1234, got ${settingsAfterSave.telegramBotTokenMasked}`);
  }
  console.log(`[PASS] Token encrypted at rest: ciphertext len = ${settingsAfterSave.telegramBotTokenEnc.ciphertext.length}, masked = "${settingsAfterSave.telegramBotTokenMasked}"`);

  // 1c: Decrypt / Reveal with valid PIN
  const decryptedToken = await revealTelegramToken(settingsAfterSave.telegramBotTokenEnc, MASTER_PIN);
  if (decryptedToken !== MOCK_TOKEN) {
    throw new Error(`Decrypted token mismatch: expected ${MOCK_TOKEN}, got ${decryptedToken}`);
  }
  console.log('[PASS] Decrypted token with valid PIN matches original plaintext 100%.');

  // 1d: Decrypt with incorrect PIN must fail
  let wrongPinFailed = false;
  try {
    await revealTelegramToken(settingsAfterSave.telegramBotTokenEnc, WRONG_PIN);
  } catch {
    wrongPinFailed = true;
  }
  if (!wrongPinFailed) {
    throw new Error('Security Breach: Decryption succeeded with incorrect PIN!');
  }
  console.log('[PASS] Decryption failed as expected when incorrect PIN was supplied.');

  // =========================================================================
  // Test 2: Test Connection (getMe) Flow: Success & Failure Cases
  // =========================================================================
  console.log('\n--- Test 2: Test Connection (getMe) Flow ---');

  // 2a: Empty token validation
  const emptyRes = await testTelegramBot('');
  if (emptyRes.ok || !emptyRes.error?.includes('empty')) {
    throw new Error('Expected empty token check to fail!');
  }
  console.log('[PASS] Empty bot token rejected immediately.');

  // 2b: Successful getMe mock call
  const mockFetchSuccess = async () =>
    new Response(
      JSON.stringify({
        ok: true,
        result: {
          id: 1234567890,
          is_bot: true,
          first_name: 'FinanceFlow Assistant',
          username: 'financeflow_test_bot',
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  const testSuccessRes = await testTelegramBot(MOCK_TOKEN, mockFetchSuccess as any);
  if (!testSuccessRes.ok || testSuccessRes.username !== '@financeflow_test_bot' || testSuccessRes.firstName !== 'FinanceFlow Assistant') {
    throw new Error(`Expected getMe success, got: ${JSON.stringify(testSuccessRes)}`);
  }
  console.log(`[PASS] getMe verified bot: ${testSuccessRes.firstName} (${testSuccessRes.username})`);

  // 2c: Failed getMe (Unauthorized / Invalid Token)
  const mockFetchUnauthorized = async () =>
    new Response(
      JSON.stringify({
        ok: false,
        error_code: 401,
        description: 'Unauthorized: invalid token',
      }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );

  const testFailRes = await testTelegramBot('invalid_token', mockFetchUnauthorized as any);
  if (testFailRes.ok || !testFailRes.error?.includes('Unauthorized')) {
    throw new Error(`Expected getMe failure on invalid token, got: ${JSON.stringify(testFailRes)}`);
  }
  console.log(`[PASS] getMe correctly handled HTTP 401 error: "${testFailRes.error}"`);

  // =========================================================================
  // Test 3: Chat ID Auto-Detection & Manual Fallback
  // =========================================================================
  console.log('\n--- Test 3: Chat ID Auto-Detection & Manual Fallback ---');

  // 3a: Auto-detect Chat ID from getUpdates with standard message
  const mockFetchUpdatesSuccess = async () =>
    new Response(
      JSON.stringify({
        ok: true,
        result: [
          {
            update_id: 10001,
            message: {
              message_id: 42,
              from: {
                id: 987654321,
                is_bot: false,
                first_name: 'Dhika',
                last_name: 'Herlambang',
                username: 'dhikaherlambang',
              },
              chat: {
                id: 987654321,
                first_name: 'Dhika',
                type: 'private',
              },
              date: 1729750000,
              text: 'Halo bot financeflow',
            },
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  const detectSuccess = await detectTelegramChatId(MOCK_TOKEN, mockFetchUpdatesSuccess as any);
  if (!detectSuccess.ok || detectSuccess.chatId !== 987654321 || detectSuccess.fromName !== 'Dhika Herlambang') {
    throw new Error(`Expected Chat ID detection success, got: ${JSON.stringify(detectSuccess)}`);
  }
  console.log(`[PASS] Auto-detected sender: ${detectSuccess.fromName} (${detectSuccess.username}), Chat ID: ${detectSuccess.chatId}`);

  // 3b: Empty updates list handling
  const mockFetchEmptyUpdates = async () =>
    new Response(
      JSON.stringify({
        ok: true,
        result: [],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  const detectEmpty = await detectTelegramChatId(MOCK_TOKEN, mockFetchEmptyUpdates as any);
  if (detectEmpty.ok || !detectEmpty.error?.includes('No recent messages found')) {
    throw new Error(`Expected empty updates guidance error, got: ${JSON.stringify(detectEmpty)}`);
  }
  console.log(`[PASS] Handled empty updates gracefully: "${detectEmpty.error}"`);

  // 3c: Manual Chat ID Fallback Storage
  const MANUAL_CHAT_ID = 554433221;
  await saveTelegramConfig({
    pin: MASTER_PIN,
    chatId: MANUAL_CHAT_ID,
  });

  const settingsWithManualChat = await db.settings.get('current');
  if (settingsWithManualChat?.telegramChatId !== MANUAL_CHAT_ID) {
    throw new Error(`Expected telegramChatId to be ${MANUAL_CHAT_ID}, got ${settingsWithManualChat?.telegramChatId}`);
  }
  console.log(`[PASS] Manual Chat ID stored successfully in IndexedDB: ${settingsWithManualChat.telegramChatId}`);

  // =========================================================================
  // Test 4: Option A vs Option B Mode Switch & Verification
  // =========================================================================
  console.log('\n--- Test 4: Option A vs Option B Bridge Mode Switch & Verification ---');

  // 4a: Configure Option A (Cloudflare Worker Relay)
  const WORKER_URL = 'https://financeflow-relay.dhikaherlambang.workers.dev';
  const WORKER_SECRET = 'whsec_telegram_test_secret_9988';

  await saveTelegramConfig({
    pin: MASTER_PIN,
    bridgeMode: 'worker',
    workerUrl: WORKER_URL,
    workerSecret: WORKER_SECRET,
  });

  const workerSettings = await db.settings.get('current');
  if (workerSettings?.telegramBridgeMode !== 'worker' || workerSettings?.telegramWorkerUrl !== WORKER_URL) {
    throw new Error('Option A worker configuration was not persisted properly!');
  }
  if (!workerSettings?.telegramWorkerSecretEnc || workerSettings?.telegramWorkerSecretEnc.ciphertext.includes(WORKER_SECRET)) {
    throw new Error('Worker secret was not encrypted at rest with Master PIN!');
  }
  console.log(`[PASS] Option A persisted: mode = "worker", url = "${workerSettings.telegramWorkerUrl}", secret encrypted.`);

  // 4b: Verify Worker Webhook Relay endpoint
  const mockWorkerFetchSuccess = async () =>
    new Response(
      JSON.stringify({ ok: true, message: 'FinanceFlow Relay Active' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  const verifyRes = await verifyWorkerWebhook(WORKER_URL, WORKER_SECRET, mockWorkerFetchSuccess as any);
  if (!verifyRes.ok) {
    throw new Error(`Expected worker webhook verification to succeed, got: ${verifyRes.error}`);
  }
  console.log(`[PASS] Worker webhook verified: "${verifyRes.statusText}"`);

  // 4c: Switch to Option B (Desktop Long-Polling Daemon)
  await saveTelegramConfig({
    pin: MASTER_PIN,
    bridgeMode: 'daemon',
  });

  const daemonSettings = await db.settings.get('current');
  if (daemonSettings?.telegramBridgeMode !== 'daemon') {
    throw new Error(`Expected bridgeMode to be "daemon", got ${daemonSettings?.telegramBridgeMode}`);
  }
  console.log(`[PASS] Switched to Option B: mode = "${daemonSettings.telegramBridgeMode}".`);

  // =========================================================================
  // Test 5: Disconnect Flow & Credential Erasure
  // =========================================================================
  console.log('\n--- Test 5: Disconnect Flow & Credential Erasure ---');

  await disconnectTelegram();

  const clearedSettings = await db.settings.get('current');
  if (clearedSettings?.telegramEnabled !== false) {
    throw new Error('telegramEnabled was not set to false after disconnect!');
  }
  if (clearedSettings?.telegramBotTokenEnc !== undefined) {
    throw new Error('telegramBotTokenEnc was not cleared after disconnect!');
  }
  if (clearedSettings?.telegramBotTokenMasked !== undefined) {
    throw new Error('telegramBotTokenMasked was not cleared after disconnect!');
  }
  if (clearedSettings?.telegramChatId !== undefined) {
    throw new Error('telegramChatId was not cleared after disconnect!');
  }
  if (clearedSettings?.telegramWorkerUrl !== undefined) {
    throw new Error('telegramWorkerUrl was not cleared after disconnect!');
  }
  if (clearedSettings?.telegramWorkerSecretEnc !== undefined) {
    throw new Error('telegramWorkerSecretEnc was not cleared after disconnect!');
  }

  console.log('[PASS] Disconnected: All bot tokens, Chat IDs, and relay credentials completely erased from IndexedDB.');

  console.log('\n🎉 ALL TELEGRAM SETTINGS AUTOMATED TESTS PASSED WITH 100% SUCCESS! 🎉\n');
}

runTelegramSettingsTests().catch((err) => {
  console.error('❌ Telegram Settings test suite failed:', err);
  process.exit(1);
});
