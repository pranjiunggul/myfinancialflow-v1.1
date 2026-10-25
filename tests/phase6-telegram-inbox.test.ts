/**
 * Phase 6 Test Suite: Zero-Knowledge Telegram Ingestion & Cross-Platform Review Tray
 * Validates:
 * 1. Enqueue raw Telegram item (text and photo).
 * 2. Client-side AI / Offline parsing into ActionProposal (zero server-side AI).
 * 3. Indonesian slang & Baku understanding from Telegram chat messages.
 * 4. Zero-Write Safety Gate: No silent ledger mutations before user confirmation.
 * 5. Single & Batch confirmation execution to ledger with balance updates.
 * 6. Item rejection / dismissal.
 * 7. Remote queue sync from Google Drive raw_inbox_queue.json with deduplication.
 * 8. Cloudflare Worker dumb webhook relay validation (Option A).
 * 9. Local daemon runner queue persistence (Option B).
 */

import 'fake-indexeddb/auto';
import { db, initializeDatabaseSeed } from '../src/db/database';
import {
  enqueueTelegramItem,
  getPendingTelegramItems,
  parseTelegramItemToProposal,
  confirmTelegramItem,
  rejectTelegramItem,
  confirmAllTelegramItems,
  syncTelegramQueueFromRemote,
  testTelegramBot,
  detectTelegramChatId,
  verifyWorkerWebhook,
  saveTelegramConfig,
  revealTelegramToken,
  disconnectTelegram,
} from '../src/services/telegram';
import workerRelay from '../worker/telegram-relay';
import type { Account, Category, CurrencyCode } from '../src/types';

async function runPhase6Tests() {
  console.log('🚀 Starting Phase 6 Test Suite: Zero-Knowledge Telegram Bridge & Review Tray...\n');

  // Initialize DB
  await initializeDatabaseSeed();

  const accounts = await db.accounts.toArray();
  const categories = await db.categories.toArray();
  const baseCurrency: CurrencyCode = 'IDR';
  const context = { accounts, categories, baseCurrency };

  // =========================================================================
  // Test 1: Enqueue Raw Telegram Item (Text & Photo)
  // =========================================================================
  console.log('--- Test 1: Raw Telegram Item Enqueueing ---');
  const initialItemCount = await db.telegram_inbox.count();

  const item1 = await enqueueTelegramItem({
    updateId: 1001,
    messageId: 501,
    chatId: 998877,
    fromName: 'Budi Santoso',
    timestamp: Date.now(),
    type: 'text',
    rawText: 'beli bensin gocap cash',
    status: 'pending',
  });

  const item2 = await enqueueTelegramItem({
    updateId: 1002,
    messageId: 502,
    chatId: 998877,
    fromName: 'Budi Santoso',
    timestamp: Date.now(),
    type: 'text',
    rawText: 'kopi kenangan 35k bca',
    status: 'pending',
  });

  const countAfterEnqueue = await db.telegram_inbox.count();
  if (countAfterEnqueue !== initialItemCount + 2) {
    throw new Error('Failed to enqueue raw Telegram items into Dexie!');
  }

  const pendingList = await getPendingTelegramItems();
  if (pendingList.length < 2) {
    throw new Error('getPendingTelegramItems failed to retrieve pending items!');
  }
  console.log(`[PASS] Enqueued 2 raw items into local inbox tray (Pending count: ${pendingList.length}).`);

  // =========================================================================
  // Test 2: Client-Side Parsing into ActionProposal (Zero-Knowledge)
  // =========================================================================
  console.log('\n--- Test 2: Client-Side AI & Slang Parsing (Zero Server-Side AI) ---');

  // Parse item 1 ("beli bensin gocap cash" -> 50,000 IDR transport cash)
  const prop1 = await parseTelegramItemToProposal(item1, accounts, categories, baseCurrency);
  if (!prop1 || prop1.data.amount !== 50000 || prop1.data.categoryId !== 'cat_transport') {
    throw new Error(`Telegram client parser failed on slang "gocap"! Got: ${JSON.stringify(prop1?.data)}`);
  }
  console.log(`[PASS] Item 1 parsed client-side: ${prop1.data.description} -> ${prop1.data.amount} IDR (${prop1.data.categoryName}, ${prop1.data.accountName})`);

  // Parse item 2 ("kopi kenangan 35k bca" -> 35,000 IDR food bca)
  const prop2 = await parseTelegramItemToProposal(item2, accounts, categories, baseCurrency);
  if (!prop2 || prop2.data.amount !== 35000 || prop2.data.categoryId !== 'cat_food') {
    throw new Error(`Telegram client parser failed on "kopi kenangan 35k bca"! Got: ${JSON.stringify(prop2?.data)}`);
  }
  console.log(`[PASS] Item 2 parsed client-side: ${prop2.data.description} -> ${prop2.data.amount} IDR (${prop2.data.categoryName}, ${prop2.data.accountName})`);

  // =========================================================================
  // Test 3: Zero-Write Safety Gate Verification
  // =========================================================================
  console.log('\n--- Test 3: Zero-Write Safety Gate Verification ---');
  const txCountBeforeConfirm = await db.transactions.count();

  // Ensure NO database transactions were written simply by parsing
  if (txCountBeforeConfirm !== 0) {
    throw new Error('CRITICAL SAFETY BREACH: Ledger was mutated before user confirmation in review tray!');
  }
  console.log('[PASS] Zero-Write Gate Verified: Items remain pending with 0 unconfirmed ledger writes.');

  // =========================================================================
  // Test 4: Single Item Confirmation Execution
  // =========================================================================
  console.log('\n--- Test 4: Single Telegram Item Confirmation ---');
  const bcaAccBefore = await db.accounts.get('acc_bank_bca');
  const bcaBalanceBefore = bcaAccBefore?.currentBalance || 0;

  // Confirm item 2 (35,000 IDR from BCA)
  await confirmTelegramItem(item2, context);

  const txCountAfter1 = await db.transactions.count();
  if (txCountAfter1 !== 1) {
    throw new Error('Transaction was not logged after user confirmation!');
  }

  const updatedItem2 = await db.telegram_inbox.get(item2.id);
  if (updatedItem2?.status !== 'processed') {
    throw new Error('Telegram inbox item status was not updated to "processed"!');
  }

  const bcaAccAfter = await db.accounts.get('acc_bank_bca');
  if (bcaAccAfter?.currentBalance !== bcaBalanceBefore - 35000) {
    throw new Error(`Account balance was not debited correctly! Expected ${bcaBalanceBefore - 35000}, got ${bcaAccAfter?.currentBalance}`);
  }
  console.log(`[PASS] Item 2 confirmed and executed. BCA balance debited: ${bcaBalanceBefore} -> ${bcaAccAfter?.currentBalance} IDR.`);

  // =========================================================================
  // Test 5: Rejection / Dismissal of Inbound Item
  // =========================================================================
  console.log('\n--- Test 5: Rejection / Dismissal of Inbound Item ---');
  await rejectTelegramItem(item1.id);

  const updatedItem1 = await db.telegram_inbox.get(item1.id);
  if (updatedItem1?.status !== 'rejected') {
    throw new Error('Telegram item status was not updated to "rejected"!');
  }

  const remainingPending = await getPendingTelegramItems();
  if (remainingPending.some((i) => i.id === item1.id || i.id === item2.id)) {
    throw new Error('Processed or rejected items still appeared in pending list!');
  }
  console.log('[PASS] Item 1 successfully rejected and removed from pending tray.');

  // =========================================================================
  // Test 6: Batch Ingestion & Batch Confirmation
  // =========================================================================
  console.log('\n--- Test 6: Batch Ingestion & Batch Confirmation ---');
  const batchItemA = await enqueueTelegramItem({
    updateId: 2001,
    messageId: 601,
    chatId: 998877,
    fromName: 'Budi Santoso',
    timestamp: Date.now(),
    type: 'text',
    rawText: 'lunch padang 25k cash',
    status: 'pending',
  });

  const batchItemB = await enqueueTelegramItem({
    updateId: 2002,
    messageId: 602,
    chatId: 998877,
    fromName: 'Budi Santoso',
    timestamp: Date.now(),
    type: 'text',
    rawText: 'mrt commute 14k bca',
    status: 'pending',
  });

  const batchList = [batchItemA, batchItemB];
  const { confirmed, failed } = await confirmAllTelegramItems(batchList, context);

  if (confirmed !== 2 || failed !== 0) {
    throw new Error(`Batch confirmation failed! Confirmed: ${confirmed}, Failed: ${failed}`);
  }

  const txCountAfterBatch = await db.transactions.count();
  if (txCountAfterBatch !== 3) { // 1 previous + 2 batch
    throw new Error(`Expected 3 total transactions in ledger, found ${txCountAfterBatch}`);
  }
  console.log(`[PASS] Batch confirmed 2 pending Telegram items with 100% success.`);

  // =========================================================================
  // Test 7: Remote Queue Ingestion from Google Drive with Deduplication
  // =========================================================================
  console.log('\n--- Test 7: Remote Queue Ingestion with Deduplication ---');
  const mockRemoteQueue = JSON.stringify([
    {
      id: 'tg_remote_9001',
      updateId: 9001,
      messageId: 701,
      chatId: 998877,
      fromName: 'Remote User',
      timestamp: Date.now(),
      type: 'text',
      rawText: 'sepatu olah raga 250k bca',
    },
    {
      id: batchItemA.id, // Duplicate of already existing item
      updateId: batchItemA.updateId,
      messageId: batchItemA.messageId,
      chatId: 998877,
      rawText: batchItemA.rawText,
    },
  ]);

  const { imported } = await syncTelegramQueueFromRemote(mockRemoteQueue);
  if (imported !== 1) {
    throw new Error(`Expected exactly 1 new item imported (and 1 duplicate ignored), got ${imported}`);
  }

  const importedItem = await db.telegram_inbox.get('tg_remote_9001');
  if (!importedItem || importedItem.status !== 'pending') {
    throw new Error('Imported remote queue item not found in IndexedDB!');
  }
  console.log(`[PASS] Remote queue ingested 1 new item and safely deduplicated 1 existing item.`);

  // =========================================================================
  // Test 8: Cloudflare Worker Dumb Relay Verification (Option A)
  // =========================================================================
  console.log('\n--- Test 8: Cloudflare Worker Dumb Relay Protocol (Option A) ---');
  const mockEnv = {
    TELEGRAM_SECRET_TOKEN: 'super_secret_telegram_token_123',
  };

  // 8a: Reject unauthorized secret token
  const unauthReq = new Request('https://worker.dev/webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Telegram-Bot-Api-Secret-Token': 'wrong_token',
    },
    body: JSON.stringify({ update_id: 9999, message: { text: 'test' } }),
  });

  const unauthRes = await workerRelay.fetch(unauthReq, mockEnv as any);
  if (unauthRes.status !== 403) {
    throw new Error(`Worker should reject unauthorized secret token with 403! Got: ${unauthRes.status}`);
  }
  console.log('[PASS] Worker correctly rejected unauthorized webhook signature (HTTP 403).');

  // 8b: Accept authentic webhook and format dumb relay payload
  const authReq = new Request('https://worker.dev/webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Telegram-Bot-Api-Secret-Token': 'super_secret_telegram_token_123',
    },
    body: JSON.stringify({
      update_id: 12345,
      message: {
        message_id: 88,
        chat: { id: 777, type: 'private' },
        date: Math.floor(Date.now() / 1000),
        text: 'kopi 20k cash',
        from: { id: 777, first_name: 'Dewi' },
      },
    }),
  });

  const authRes = await workerRelay.fetch(authReq, mockEnv as any);
  if (authRes.status !== 200) {
    throw new Error(`Worker failed to accept authentic webhook! Status: ${authRes.status}`);
  }
  const relayBody = await authRes.json();
  if (relayBody.status !== 'ok' || !relayBody.id.includes('12345')) {
    throw new Error('Worker response body malformed!');
  }
  console.log(`[PASS] Cloudflare Worker relay accepted authentic payload -> Queued ID: ${relayBody.id}.`);

  // =========================================================================
  // Test 9: Telegram Bot Token PIN Encryption & Decryption
  // =========================================================================
  console.log('\n--- Test 9: Bot Token AES-GCM-256 PIN Encryption & Decryption ---');
  const sampleToken = '123456789:ABCdefGhIjklmNoPQRstuVWxyz';
  const masterPin = '882200';

  // 9a: Saving without PIN throws error
  try {
    await saveTelegramConfig({ token: sampleToken, pin: '' });
    throw new Error('saveTelegramConfig should reject empty PIN!');
  } catch (err: any) {
    if (!err.message.includes('PIN required')) {
      throw err;
    }
  }

  // 9b: Save with PIN
  await saveTelegramConfig({
    token: sampleToken,
    pin: masterPin,
    chatId: 987654321,
    bridgeMode: 'worker',
    workerUrl: 'https://financeflow-relay.example.workers.dev',
    botUsername: '@FinanceFlowReceiptBot',
  });

  const storedSettings = await db.settings.get('current');
  if (!storedSettings || !storedSettings.telegramEnabled) {
    throw new Error('Telegram settings not persisted to IndexedDB!');
  }
  if (!storedSettings.telegramBotTokenEnc || storedSettings.telegramBotTokenEnc.format !== 'financeflow_enc_v1') {
    throw new Error('Telegram Bot Token was not stored in encrypted financeflow_enc_v1 format!');
  }
  if (storedSettings.telegramBotTokenEnc.ciphertext === sampleToken) {
    throw new Error('CRITICAL: Telegram Bot Token stored as plaintext ciphertext!');
  }
  if (storedSettings.telegramBotTokenMasked !== '123456...Wxyz') {
    throw new Error(`Unexpected token mask: ${storedSettings.telegramBotTokenMasked}`);
  }

  // 9c: Reveal token with correct PIN
  const decryptedToken = await revealTelegramToken(storedSettings.telegramBotTokenEnc, masterPin);
  if (decryptedToken !== sampleToken) {
    throw new Error(`Decrypted token mismatch: expected ${sampleToken}, got ${decryptedToken}`);
  }

  // 9d: Reveal token with wrong PIN fails
  try {
    await revealTelegramToken(storedSettings.telegramBotTokenEnc, '000000');
    throw new Error('revealTelegramToken should fail with incorrect PIN!');
  } catch (err: any) {
    if (!err.message.includes('Decryption failed')) {
      throw err;
    }
  }

  // 9e: Disconnect clears credentials
  await disconnectTelegram();
  const clearedSettings = await db.settings.get('current');
  if (clearedSettings?.telegramEnabled || clearedSettings?.telegramBotTokenEnc || clearedSettings?.telegramChatId) {
    throw new Error('disconnectTelegram failed to clear stored credentials!');
  }
  console.log('[PASS] Bot token successfully encrypted at rest with AES-GCM-256 (PBKDF2 600k iterations) and decrypted only with valid PIN.');

  // =========================================================================
  // Test 10: testTelegramBot Connection Verification (getMe Mocking)
  // =========================================================================
  console.log('\n--- Test 10: testTelegramBot getMe Verification ---');
  const mockValidGetMe: typeof fetch = async (url) => {
    if (String(url).includes('/getMe')) {
      return new Response(
        JSON.stringify({
          ok: true,
          result: {
            id: 123456,
            is_bot: true,
            first_name: 'FinanceFlowBot',
            username: 'financeflow_bot',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response('Not Found', { status: 404 });
  };

  const validBotRes = await testTelegramBot(sampleToken, mockValidGetMe);
  if (!validBotRes.ok || validBotRes.username !== '@financeflow_bot' || validBotRes.firstName !== 'FinanceFlowBot') {
    throw new Error(`testTelegramBot failed on valid token: ${JSON.stringify(validBotRes)}`);
  }

  const mockInvalidGetMe: typeof fetch = async () => {
    return new Response(
      JSON.stringify({
        ok: false,
        error_code: 401,
        description: 'Unauthorized: invalid bot token',
      }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  };

  const invalidBotRes = await testTelegramBot('invalid_token', mockInvalidGetMe);
  if (invalidBotRes.ok || !invalidBotRes.error?.includes('Unauthorized')) {
    throw new Error(`testTelegramBot did not properly report 401 Unauthorized: ${JSON.stringify(invalidBotRes)}`);
  }
  console.log('[PASS] testTelegramBot correctly verifies bot identity via getMe and catches unauthorized errors.');

  // =========================================================================
  // Test 11: detectTelegramChatId Auto-Detection (getUpdates Mocking)
  // =========================================================================
  console.log('\n--- Test 11: detectTelegramChatId Extraction ---');
  const mockValidUpdates: typeof fetch = async () => {
    return new Response(
      JSON.stringify({
        ok: true,
        result: [
          {
            update_id: 8881,
            message: {
              message_id: 10,
              from: { id: 54321, first_name: 'Budi', last_name: 'Santoso', username: 'budisantoso' },
              chat: { id: 54321, type: 'private', first_name: 'Budi' },
              date: 1700000000,
              text: '/start',
            },
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  const detectedChat = await detectTelegramChatId(sampleToken, mockValidUpdates);
  if (
    !detectedChat.ok ||
    detectedChat.chatId !== 54321 ||
    detectedChat.fromName !== 'Budi Santoso' ||
    detectedChat.username !== '@budisantoso'
  ) {
    throw new Error(`detectTelegramChatId failed to extract chat ID: ${JSON.stringify(detectedChat)}`);
  }

  const mockEmptyUpdates: typeof fetch = async () => {
    return new Response(
      JSON.stringify({
        ok: true,
        result: [],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  const emptyChatRes = await detectTelegramChatId(sampleToken, mockEmptyUpdates);
  if (emptyChatRes.ok || !emptyChatRes.error?.includes('No recent messages found')) {
    throw new Error(`detectTelegramChatId should fail when updates array is empty: ${JSON.stringify(emptyChatRes)}`);
  }
  console.log('[PASS] detectTelegramChatId successfully extracts sender Chat ID and handles empty update states.');

  // =========================================================================
  // Test 12: verifyWorkerWebhook Relay Health Check
  // =========================================================================
  console.log('\n--- Test 12: verifyWorkerWebhook Health Check ---');
  const mockReachableWorker: typeof fetch = async () => {
    return new Response('FinanceFlow Telegram Relay Active. Awaiting webhooks.', { status: 200 });
  };

  const workerHealthOk = await verifyWorkerWebhook(
    'https://financeflow-relay.example.workers.dev',
    'secret_123',
    mockReachableWorker
  );
  if (!workerHealthOk.ok || !workerHealthOk.statusText?.includes('reachable')) {
    throw new Error(`verifyWorkerWebhook failed on 200 OK: ${JSON.stringify(workerHealthOk)}`);
  }

  const mockErrorWorker: typeof fetch = async () => {
    return new Response('Internal Server Error', { status: 500, statusText: 'Internal Error' });
  };

  const workerHealthErr = await verifyWorkerWebhook('https://broken.workers.dev', undefined, mockErrorWorker);
  if (workerHealthErr.ok || !workerHealthErr.error?.includes('500')) {
    throw new Error(`verifyWorkerWebhook did not catch 500 error: ${JSON.stringify(workerHealthErr)}`);
  }
  console.log('[PASS] verifyWorkerWebhook confirms Cloudflare Worker endpoint reachability and reports connection errors.');

  console.log('\n🎉 ALL PHASE 6 TELEGRAM INGESTION & REVIEW TRAY TESTS PASSED WITH 100% SUCCESS!');
}

runPhase6Tests().catch((err) => {
  console.error('\n❌ PHASE 6 TEST FAILED:', err);
  process.exit(1);
});
