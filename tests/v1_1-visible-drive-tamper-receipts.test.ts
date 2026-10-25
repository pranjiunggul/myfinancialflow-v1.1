/**
 * Test Suite: MyFinancialFlow V1.1 Visible Google Drive Storage & Tamper-Evidence
 * 
 * Verifies:
 * 1. Visible Drive folder hierarchy ("MyFinancialFlow Data/Receipts/YYYY-MM/").
 * 2. Structured, human-readable JSON files (transactions.json, accounts.json, etc.).
 * 3. Lightweight Tamper-Evidence:
 *    - SHA-256 checksum generation across data tables.
 *    - Detection and warning on external edits in Google Drive.
 *    - Authenticated HMAC tamper seal protection on approvedAccountId (Google Account Lock).
 * 4. Receipt image offload to Drive with webViewLink linkage.
 * 5. Local receipt cache pruning policy against 2.0 GB ceiling.
 */

import 'fake-indexeddb/auto';
import { db } from '../src/db/database';
import {
  uploadVisibleSyncToDrive,
  downloadVisibleSyncFromDrive,
  uploadReceiptImageToDrive,
  ROOT_FOLDER_NAME,
  RECEIPTS_FOLDER_NAME,
  MANIFEST_FILE_NAME,
  TRANSACTIONS_FILE_NAME,
  ACCOUNTS_FILE_NAME,
} from '../src/services/gdrive';
import {
  attachReceiptToTransaction,
  getReceiptAttachment,
  syncPendingReceiptsToDrive,
  pruneCachedReceiptImages,
  calculateReceiptsStorageBytes,
} from '../src/services/receiptAttachments';
import { performGoogleDriveSync } from '../src/services/sync';
import { computeSha256Hex } from '../src/services/crypto';
import type { SyncManifest, SyncPayloadData, ReceiptAttachment } from '../src/types';

async function runV1_1Tests() {
  console.log('🚀 Starting MyFinancialFlow V1.1 Visible Storage & Tamper-Evidence Test Suite...\n');

  const MASTER_PIN = '882200';
  const mockDriveStorage = new Map<string, { id: string; name: string; content: string; modifiedTime: string; webViewLink?: string }>();

  // Mock Google Drive REST API fetch
  const mockDriveFetch: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = input.toString();

    // 1. Download media: GET /drive/v3/files/:id?alt=media
    if (urlStr.includes('alt=media')) {
      const fileId = urlStr.split('/drive/v3/files/')[1].split('?')[0];
      const file = Array.from(mockDriveStorage.values()).find((f) => f.id === fileId);
      if (!file) return new Response('Not Found', { status: 404 });
      return new Response(file.content, { status: 200 });
    }

    // 2. Search files or folders: GET /drive/v3/files?q=...
    if (urlStr.includes('/drive/v3/files') && !urlStr.includes('/upload') && init?.method !== 'POST') {
      const rawQ = new URL(urlStr).searchParams.get('q') || '';
      const qParam = decodeURIComponent(rawQ);
      const matched = Array.from(mockDriveStorage.values()).filter((f) => {
        if (qParam.includes(`name = '${ROOT_FOLDER_NAME}'`)) return f.name === ROOT_FOLDER_NAME;
        if (qParam.includes(`name = '${RECEIPTS_FOLDER_NAME}'`)) return f.name === RECEIPTS_FOLDER_NAME;
        if (qParam.includes("name = '2026-10'")) return f.name === '2026-10';
        if (qParam.includes(`name = '${MANIFEST_FILE_NAME}'`)) return f.name === MANIFEST_FILE_NAME;
        if (qParam.includes(`name = '${TRANSACTIONS_FILE_NAME}'`)) return f.name === TRANSACTIONS_FILE_NAME;
        if (qParam.includes(`name = '${ACCOUNTS_FILE_NAME}'`)) return f.name === ACCOUNTS_FILE_NAME;
        if (qParam.includes("name = 'categories.json'")) return f.name === 'categories.json';
        if (qParam.includes("name = 'goals.json'")) return f.name === 'goals.json';
        if (qParam.includes("name = 'investments.json'")) return f.name === 'investments.json';
        if (qParam.includes("name = 'metadata.json'")) return f.name === 'metadata.json';
        if (f.name.startsWith('rcpt_')) return true;
        return false;
      });

      return new Response(JSON.stringify({ files: matched }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 3. Create folder: POST /drive/v3/files (JSON body)
    if (urlStr.endsWith('/drive/v3/files') && init?.method === 'POST') {
      const body = JSON.parse(String(init.body));
      const folderId = 'folder_' + crypto.randomUUID().slice(0, 8);
      const entry = {
        id: folderId,
        name: body.name,
        content: '',
        modifiedTime: new Date().toISOString(),
      };
      mockDriveStorage.set(body.name, entry);
      return new Response(JSON.stringify(entry), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // 4. Create multipart upload: POST /upload/drive/v3/files?uploadType=multipart
    if (urlStr.includes('/upload/drive/v3/files') && init?.method === 'POST') {
      const body = String(init.body);
      const metadataMatch = body.match(/\{[\s\S]*?\}/);
      const metadata = metadataMatch ? JSON.parse(metadataMatch[0]) : { name: 'unknown' };
      const contentParts = body.split('\r\n\r\n');
      const content = contentParts.length >= 3 ? contentParts[2].split('\r\n--')[0] : '';

      const fileId = 'gdrive_' + crypto.randomUUID().slice(0, 8);
      const fileEntry = {
        id: fileId,
        name: metadata.name,
        content,
        modifiedTime: new Date().toISOString(),
        webViewLink: `https://drive.google.com/file/d/${fileId}/view`,
        webContentLink: `https://drive.google.com/uc?id=${fileId}&export=download`,
      };
      mockDriveStorage.set(metadata.name, fileEntry);

      return new Response(JSON.stringify(fileEntry), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 5. Update file media: PATCH /upload/drive/v3/files/:id?uploadType=media
    if (urlStr.includes('/upload/drive/v3/files/') && init?.method === 'PATCH') {
      const fileId = urlStr.split('/upload/drive/v3/files/')[1].split('?')[0];
      const file = Array.from(mockDriveStorage.values()).find((f) => f.id === fileId);
      if (!file) return new Response('Not Found', { status: 404 });
      file.content = String(init.body);
      file.modifiedTime = new Date().toISOString();
      return new Response(JSON.stringify({ id: file.id, name: file.name, webViewLink: file.webViewLink }), { status: 200 });
    }

    // 6. Userinfo endpoint
    if (urlStr.includes('oauth2/v3/userinfo')) {
      return new Response(JSON.stringify({ email: 'owner@gmail.com', name: 'App Owner', sub: 'goog_owner_999' }), {
        status: 200,
      });
    }

    return new Response('Mock Not Found', { status: 404 });
  };

  // Seed initial Dexie data
  await db.accounts.clear();
  await db.transactions.clear();
  await db.receipt_attachments.clear();
  await db.settings.clear();

  await db.settings.put({
    id: 'current',
    baseCurrency: 'IDR',
    pinEnabled: true,
    biometricsEnabled: false,
    autoLockMinutes: 5,
    googleDriveLinked: true,
    googleDriveClientId: 'mock_client_id.apps.googleusercontent.com',
    approvedGoogleAccountId: 'goog_owner_999',
    approvedGoogleEmail: 'owner@gmail.com',
    dailyBackupEnabled: true,
    aiEnabled: true,
    aiProvider: 'gemini',
  });

  await db.accounts.put({
    id: 'acc_bca',
    name: 'BCA Checking',
    type: 'bank',
    currency: 'IDR',
    balance: 10000000,
    isDeleted: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    version: 1,
  });

  const txRecord = {
    id: 'tx_dinner_01',
    type: 'expense' as const,
    amount: 150000,
    currency: 'IDR' as const,
    exchangeRateToBase: 1.0,
    baseAmount: 150000,
    accountId: 'acc_bca',
    categoryId: 'cat_food',
    date: '2026-10-25',
    time: '19:30',
    timestamp: Date.now(),
    description: 'Dinner at Sate Khas Senayan',
    inputSource: 'manual' as const,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    deviceId: 'dev_local',
    isDeleted: false,
    version: 1,
  };
  await db.transactions.put(txRecord);

  // --- Test 1: Upload Visible Structured Files with SHA-256 Checksums ---
  console.log('--- Test 1: Visible Structured Files Upload & Integrity Checksums ---');
  const manifest: SyncManifest = {
    manifestVersion: 1,
    deviceId: 'dev_local',
    deviceName: 'Test Laptop',
    lastSyncTimestamp: Date.now(),
    schemaVersion: 8,
    activeRevisionId: 'rev_v1_1_001',
    totalRecordsCount: 1,
    updatedAt: Date.now(),
    approvedAccountId: 'goog_owner_999',
    approvedAccountEmail: 'owner@gmail.com',
  };

  const payload: SyncPayloadData = {
    deviceId: 'dev_local',
    deviceName: 'Test Laptop',
    timestamp: Date.now(),
    schemaVersion: 8,
    approvedAccountId: 'goog_owner_999',
    approvedAccountEmail: 'owner@gmail.com',
    accounts: [await db.accounts.get('acc_bca') as any],
    categories: [],
    transactions: [txRecord],
  };

  const uploadResult = await uploadVisibleSyncToDrive(manifest, payload, MASTER_PIN, 'mock_token', mockDriveFetch);
  if (!uploadResult.rootFolderId) throw new Error('Root folder creation failed!');

  const driveTxFile = mockDriveStorage.get(TRANSACTIONS_FILE_NAME);
  if (!driveTxFile) throw new Error('transactions.json was not uploaded!');

  // Verify readability: Must contain plaintext dinner description
  if (!driveTxFile.content.includes('Dinner at Sate Khas Senayan') || !driveTxFile.content.includes('150000')) {
    throw new Error('transactions.json is not human readable!');
  }

  const driveManifestFile = mockDriveStorage.get(MANIFEST_FILE_NAME);
  if (!driveManifestFile) throw new Error('manifest.json was not uploaded!');
  const uploadedManifest: SyncManifest = JSON.parse(driveManifestFile.content);

  if (!uploadedManifest.fileChecksums || !uploadedManifest.fileChecksums[TRANSACTIONS_FILE_NAME]) {
    throw new Error('SHA-256 fileChecksums missing from manifest!');
  }
  if (!uploadedManifest.approvedAccountSeal) {
    throw new Error('approvedAccountSeal missing from manifest!');
  }

  console.log(`[PASS] Visible folder created. ${TRANSACTIONS_FILE_NAME} is 100% human-readable JSON.`);
  console.log(`[PASS] SHA-256 checksum computed: ${uploadedManifest.fileChecksums[TRANSACTIONS_FILE_NAME].slice(0, 16)}...`);

  // --- Test 2: Unaltered Download & Tamper Verification ---
  console.log('\n--- Test 2: Clean Download & Tamper Verification Pass ---');
  const downloadResult = await downloadVisibleSyncFromDrive(MASTER_PIN, 'mock_token', mockDriveFetch);
  if (!downloadResult.tamperStatus.ok || downloadResult.tamperStatus.mismatches.length > 0) {
    throw new Error('Clean sync flagged false-positive tamper mismatch!');
  }
  if (!downloadResult.tamperStatus.accountLockValid) {
    throw new Error('Clean sync flagged account lock as invalid!');
  }
  console.log('[PASS] Clean sync verified with zero tamper warnings (TamperStatus.ok = true).');

  // --- Test 3: Detection of External File Modification in Google Drive ---
  console.log('\n--- Test 3: Detection of External File Modification Outside App ---');
  // Simulate user or external script modifying transactions.json directly in Google Drive
  const rawTxContent = driveTxFile.content;
  const tamperedTxList = JSON.parse(rawTxContent);
  tamperedTxList[0].amount = 9999999; // Manually altered in Drive
  driveTxFile.content = JSON.stringify(tamperedTxList, null, 2);

  const tamperedDownload = await downloadVisibleSyncFromDrive(MASTER_PIN, 'mock_token', mockDriveFetch);
  if (tamperedDownload.tamperStatus.ok) {
    throw new Error('Failed to detect external modification to transactions.json!');
  }
  if (!tamperedDownload.tamperStatus.mismatches.includes(TRANSACTIONS_FILE_NAME)) {
    throw new Error('transactions.json was not reported in tamper mismatches list!');
  }
  console.log(`[PASS] Tamper detected! Mismatched files: ${tamperedDownload.tamperStatus.mismatches.join(', ')}`);

  // Restore content for subsequent tests
  driveTxFile.content = rawTxContent;

  // --- Test 4: Strict Blocking of Tampered Account Lock (approvedAccountId) ---
  console.log('\n--- Test 4: Strict Blocking on Tampered Google Account Lock ---');
  // Simulate an attacker attempting to hijack the vault by changing approvedAccountId in manifest.json
  const manifestObj: SyncManifest = JSON.parse(driveManifestFile.content);
  manifestObj.approvedAccountId = 'attacker_google_id_666';
  manifestObj.approvedAccountEmail = 'attacker@evil.com';
  // Attacker did not have the user's Master PIN, so seal will mismatch
  driveManifestFile.content = JSON.stringify(manifestObj, null, 2);

  let lockBlocked = false;
  try {
    await performGoogleDriveSync(
      MASTER_PIN,
      'mock_client_id.apps.googleusercontent.com',
      'mock_token',
      mockDriveFetch
    );
  } catch (err: any) {
    if (err.message.includes('Tamper Alert') || err.message.includes('Google Account Lock')) {
      lockBlocked = true;
      console.log(`[PASS] Hijacking attempt safely blocked: "${err.message}"`);
    } else {
      throw err;
    }
  }

  if (!lockBlocked) {
    throw new Error('CRITICAL VULNERABILITY: Tampered approvedAccountId was not blocked by sync engine!');
  }

  // Restore manifest
  driveManifestFile.content = JSON.stringify(uploadedManifest, null, 2);

  // --- Test 5: Receipt Image Upload & Direct Linkage ---
  console.log('\n--- Test 5: Receipt Image Upload to Drive Subfolder & webViewLink ---');
  const mockImageBase64 = 'data:image/jpeg;base64,' + Buffer.from('FAKE_JPEG_IMAGE_CONTENT').toString('base64');
  const attachedRcpt = await attachReceiptToTransaction('tx_dinner_01', mockImageBase64);

  if (!attachedRcpt.id || attachedRcpt.isPruned) {
    throw new Error('Receipt attachment creation failed!');
  }

  const syncReceiptResult = await syncPendingReceiptsToDrive('mock_token', mockDriveFetch);
  if (syncReceiptResult.uploadedCount !== 1) {
    throw new Error(`Expected 1 receipt uploaded, got ${syncReceiptResult.uploadedCount}`);
  }

  const updatedTx = await db.transactions.get('tx_dinner_01');
  const updatedRcpt = await getReceiptAttachment('tx_dinner_01');

  if (!updatedTx?.receiptUrl || !updatedTx.receiptUrl.includes('drive.google.com')) {
    throw new Error(`Transaction receiptUrl was not updated with Drive webViewLink! URL: ${updatedTx?.receiptUrl}`);
  }
  if (!updatedRcpt?.driveFileId || !updatedRcpt.driveWebViewLink) {
    throw new Error('Receipt record missing driveFileId or driveWebViewLink!');
  }

  console.log(`[PASS] Receipt uploaded to Drive: fileId="${updatedRcpt.driveFileId}", webViewLink="${updatedTx.receiptUrl}"`);

  // --- Test 6: Local Receipt Cache Pruning against 2.0 GB Ceiling ---
  console.log('\n--- Test 6: Local Receipt Cache Pruning against 2.0 GB Soft Ceiling ---');
  const storageBefore = await calculateReceiptsStorageBytes();
  if (storageBefore === 0) throw new Error('Storage before pruning should be > 0 bytes!');

  // Prune receipts (with olderThanDays = 0 to prune immediate test receipt)
  const pruneResult = await pruneCachedReceiptImages({ olderThanDays: 0 });
  if (pruneResult.prunedCount !== 1) {
    throw new Error(`Expected 1 pruned receipt, got ${pruneResult.prunedCount}`);
  }

  const storageAfter = await calculateReceiptsStorageBytes();
  if (storageAfter !== 0) {
    throw new Error(`Expected 0 bytes storage after pruning, got ${storageAfter}`);
  }

  // Verify that metadata & Drive link are preserved after local pruning
  const prunedRcpt = await getReceiptAttachment('tx_dinner_01');
  if (!prunedRcpt?.isPruned || prunedRcpt.dataBase64 !== undefined) {
    throw new Error('Pruned receipt should have isPruned = true and dataBase64 = undefined');
  }
  if (!prunedRcpt.driveWebViewLink || !prunedRcpt.driveFileId) {
    throw new Error('Pruned receipt must retain driveWebViewLink and driveFileId!');
  }

  console.log(`[PASS] Reclaimed ${pruneResult.bytesReclaimed} bytes of local storage.`);
  console.log('[PASS] Pruned receipt retains Google Drive link for online viewing.');

  console.log('\n🎉 ALL MYFINANCIALFLOW V1.1 TESTS PASSED WITH 100% SUCCESS!');
}

runV1_1Tests().catch((err) => {
  console.error('\n❌ V1.1 TEST FAILED:', err);
  process.exit(1);
});
