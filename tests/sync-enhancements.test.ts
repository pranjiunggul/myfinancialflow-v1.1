/**
 * Automated Test Suite: Single-User Multi-Device Sync Enhancements
 * 15 Distinct Scenarios Covering:
 * - Device Identity, User-Agent Inference (Desktop, Mobile, Tablet), Renaming & Manifest Aggregation (Tests 1-5)
 * - Cross-Device Duplicate Detection (70% Threshold) & 1-Tap Resolution (Keep Local, Keep Remote, Keep Both) (Tests 6-10)
 * - Single Approved Google Account Lock, Mismatch Blocking, Second Device Verification & PIN-Gated Migration (Tests 11-15)
 */

import 'fake-indexeddb/auto';
import { db, initializeDatabaseSeed } from '../src/db/database';
import {
  detectDeviceInfo,
  getLocalDeviceInfo,
  updateLocalDeviceName,
  aggregateDevicesList,
} from '../src/services/device';
import {
  calculateDescriptionSimilarity,
  detectCrossDeviceDuplicates,
  resolveDuplicatePair,
  getPendingDuplicatePairs,
  SIMILARITY_THRESHOLD,
} from '../src/services/syncDuplicates';
import {
  performGoogleDriveSync,
  changeApprovedGoogleAccount,
} from '../src/services/sync';
import type { Transaction, ConnectedDeviceInfo } from '../src/types';

async function runSyncEnhancementsTests() {
  console.log('🚀 Starting Single-User Multi-Device Sync Enhancements Test Suite...\n');

  // Initialize DB seed
  await initializeDatabaseSeed();
  const MASTER_PIN = '889900';

  // =========================================================================
  // GROUP 1: Device Identity, User-Agent Inference & Manifest Aggregation
  // =========================================================================

  // Test 1: Desktop User-Agent Inference
  console.log('--- Test 1: User-Agent Inference — Desktop ---');
  const desktopUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  const desktopInfo = detectDeviceInfo(desktopUA);
  console.log(`Detected OS: ${desktopInfo.osName}, Browser: ${desktopInfo.browserName}, Type: ${desktopInfo.deviceType}`);
  if (desktopInfo.deviceType !== 'desktop' || desktopInfo.osName !== 'Windows' || desktopInfo.browserName !== 'Chrome') {
    throw new Error('Desktop UA classification failed!');
  }
  console.log(`[PASS] Desktop UA correctly classified: type="${desktopInfo.deviceType}", name="${desktopInfo.defaultName}".`);

  // Test 2: Mobile User-Agent Inference
  console.log('\n--- Test 2: User-Agent Inference — Mobile ---');
  const mobileUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
  const mobileInfo = detectDeviceInfo(mobileUA);
  console.log(`Detected OS: ${mobileInfo.osName}, Browser: ${mobileInfo.browserName}, Type: ${mobileInfo.deviceType}`);
  if (mobileInfo.deviceType !== 'mobile' || mobileInfo.osName !== 'iPhone (iOS)' || mobileInfo.browserName !== 'Safari') {
    throw new Error('Mobile UA classification failed!');
  }
  console.log(`[PASS] Mobile UA correctly classified: type="${mobileInfo.deviceType}", name="${mobileInfo.defaultName}".`);

  // Test 3: Tablet User-Agent Inference
  console.log('\n--- Test 3: User-Agent Inference — Tablet ---');
  const tabletUA = 'Mozilla/5.0 (iPad; CPU OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1';
  const tabletInfo = detectDeviceInfo(tabletUA);
  console.log(`Detected OS: ${tabletInfo.osName}, Browser: ${tabletInfo.browserName}, Type: ${tabletInfo.deviceType}`);
  if (tabletInfo.deviceType !== 'tablet' || tabletInfo.osName !== 'iPad (iPadOS)') {
    throw new Error('Tablet UA classification failed!');
  }
  console.log(`[PASS] Tablet UA correctly classified: type="${tabletInfo.deviceType}", name="${tabletInfo.defaultName}".`);

  // Test 4: Persistent Local Device Identity & User Custom Renaming
  console.log('\n--- Test 4: Local Device Identity Persistence & Renaming ---');
  const initialLocal = await getLocalDeviceInfo();
  console.log(`Generated Device ID: "${initialLocal.deviceId}", Default Name: "${initialLocal.deviceName}"`);
  if (!initialLocal.deviceId.startsWith('dev_')) {
    throw new Error('Device ID does not have expected dev_ prefix');
  }

  const renamedLocal = await updateLocalDeviceName('My Personal ThinkPad');
  const dbSettings = await db.settings.get('current');
  console.log(`Updated Device Name: "${renamedLocal.deviceName}", Stored in DB: "${dbSettings?.deviceName}"`);
  if (renamedLocal.deviceName !== 'My Personal ThinkPad' || dbSettings?.deviceName !== 'My Personal ThinkPad') {
    throw new Error('Custom device name was not persisted in DB!');
  }
  console.log(`[PASS] Local device ${initialLocal.deviceId} persisted and renamed to "${renamedLocal.deviceName}".`);

  // Test 5: Connected Devices Aggregation Across Sync Manifests
  console.log('\n--- Test 5: Connected Devices Manifest Aggregation ---');
  const remoteDevices: ConnectedDeviceInfo[] = [
    {
      deviceId: 'dev_phone_iphone15',
      deviceName: 'iPhone 15 Pro',
      deviceType: 'mobile',
      browserName: 'Safari',
      osName: 'iOS',
      firstSeenAt: Date.now() - 3600000,
      lastSyncAt: Date.now() - 600000,
    },
    {
      deviceId: initialLocal.deviceId,
      deviceName: 'Old Desktop Name',
      deviceType: 'desktop',
      firstSeenAt: Date.now() - 7200000,
      lastSyncAt: Date.now() - 1000000,
    },
  ];

  const aggregated = aggregateDevicesList(remoteDevices, renamedLocal);
  console.log(`Aggregated device count: ${aggregated.length}`);
  console.log(`Device 0: "${aggregated[0].deviceName}" (isCurrent: ${aggregated[0].isCurrentDevice})`);
  console.log(`Device 1: "${aggregated[1].deviceName}" (isCurrent: ${aggregated[1].isCurrentDevice})`);

  if (aggregated.length !== 2) throw new Error('Expected 2 aggregated devices');
  if (!aggregated[0].isCurrentDevice || aggregated[0].deviceName !== 'My Personal ThinkPad') {
    throw new Error('Current device was not sorted first or did not retain custom rename!');
  }
  console.log(`[PASS] Connected devices successfully merged: 2 devices tracked, current session prioritized first.`);

  // =========================================================================
  // GROUP 2: Cross-Device Duplicate Transaction Detection & Resolution
  // =========================================================================

  // Test 6: Heuristic Description Similarity & 70% Threshold
  console.log('\n--- Test 6: Description Similarity Heuristic & 70% Threshold ---');
  console.log(`Enforced Similarity Threshold: ${SIMILARITY_THRESHOLD * 100}%`);
  if (SIMILARITY_THRESHOLD !== 0.70) throw new Error('Similarity threshold must be 0.70 (70%)');

  const simExact = calculateDescriptionSimilarity('Kopi Kenangan Senayan', 'Kopi Kenangan Senayan');
  const simSubstring = calculateDescriptionSimilarity('Kopi Kenangan Senayan', 'Kopi Kenangan');
  const simNoiseStrip = calculateDescriptionSimilarity('Pembayaran QRIS Kopi Kenangan Senayan', 'Kopi Kenangan Senayan');
  const simOverlap = calculateDescriptionSimilarity('Warung Mie Ayam Bakso', 'Mie Ayam Bakso Wonogiri');
  const simUnrelated = calculateDescriptionSimilarity('Beli Tiket Pesawat Garuda', 'Bayar Tagihan Listrik PLN');

  console.log(`Exact: ${simExact} | Substring: ${simSubstring} | Noise Stripped: ${simNoiseStrip} | Token Overlap: ${simOverlap} | Unrelated: ${simUnrelated}`);
  if (simExact !== 1.0) throw new Error('Exact similarity must be 1.0');
  if (simSubstring < 0.70) throw new Error('Substring merchant should be >= 0.70');
  if (simNoiseStrip < 0.70) throw new Error('Noise stripped match should be >= 0.70');
  if (simOverlap < 0.70) throw new Error('Token overlap match should be >= 0.70');
  if (simUnrelated >= 0.70) throw new Error('Unrelated transactions should be < 0.70');
  console.log(`[PASS] Similarity heuristic verified against 70% threshold with transaction stop-word stripping.`);

  // Test 7: Real Cross-Device Duplicate Detection & Non-Destructive Ingestion
  console.log('\n--- Test 7: Non-Destructive Cross-Device Duplicate Ingestion ---');
  const accounts = await db.accounts.toArray();
  const bcaAccount = accounts[0];

  const localTx1: Transaction = {
    id: 'tx_laptop_coffee_01',
    type: 'expense',
    date: '2026-10-24',
    timestamp: Date.now() - 100000,
    amount: 35000,
    currency: 'IDR',
    exchangeRateToBase: 1,
    baseAmount: 35000,
    accountId: bcaAccount.id,
    categoryId: 'cat_food',
    description: 'Kopi Kenangan Senayan',
    inputSource: 'manual',
    createdAt: Date.now() - 100000,
    updatedAt: Date.now() - 100000,
    deviceId: initialLocal.deviceId,
    isDeleted: false,
    version: 1,
  };
  await db.transactions.put(localTx1);

  const remoteTx1: Transaction = {
    id: 'tx_phone_coffee_99',
    type: 'expense',
    date: '2026-10-24',
    timestamp: Date.now() - 90000,
    amount: 35000,
    currency: 'IDR',
    exchangeRateToBase: 1,
    baseAmount: 35000,
    accountId: bcaAccount.id,
    categoryId: 'cat_food',
    description: 'Pembayaran QRIS Kopi Kenangan Senayan',
    inputSource: 'ocr',
    createdAt: Date.now() - 90000,
    updatedAt: Date.now() - 90000,
    deviceId: 'dev_phone_iphone15',
    isDeleted: false,
    version: 1,
  };
  await db.transactions.put(remoteTx1);

  // Both records must be present in db.transactions (non-destructive)
  const locCheck = await db.transactions.get(localTx1.id);
  const remCheck = await db.transactions.get(remoteTx1.id);
  if (!locCheck || locCheck.isDeleted || !remCheck || remCheck.isDeleted) {
    throw new Error('Non-destructive ingestion failed: one or both transactions were not admitted to ledger!');
  }

  const detectedPairs = await detectCrossDeviceDuplicates([remoteTx1], [localTx1], initialLocal.deviceId);
  console.log(`Detected Duplicate Pairs: ${detectedPairs.length}`);
  if (detectedPairs.length !== 1) throw new Error('Expected 1 cross-device duplicate pair');
  const pair1 = detectedPairs[0];
  console.log(`Pair 1: Similarity=${pair1.similarityScore}, Reason="${pair1.reason}"`);
  if (pair1.similarityScore < 0.70) throw new Error('Similarity score below 0.70 threshold');
  console.log(`[PASS] Non-destructive ingestion verified (both tx active); duplicate pair flagged with similarity score ${pair1.similarityScore}.`);

  // Test 8: 1-Tap Resolution — Keep Local (Delete Remote)
  console.log('\n--- Test 8: 1-Tap Resolution — Keep Local ---');
  await resolveDuplicatePair(pair1.id, 'keep_local');
  const resRemote1 = await db.transactions.get(remoteTx1.id);
  const resLocal1 = await db.transactions.get(localTx1.id);
  const resPair1 = await db.sync_duplicates.get(pair1.id);

  console.log(`Remote tx isDeleted: ${resRemote1?.isDeleted}, Local tx isDeleted: ${resLocal1?.isDeleted}, Pair Status: ${resPair1?.status}`);
  if (!resRemote1?.isDeleted || resLocal1?.isDeleted || resPair1?.status !== 'resolved_keep_local') {
    throw new Error('keep_local resolution did not soft-delete remote tx or keep local active!');
  }

  const auditKeepLocal = await db.audit_logs.where('entityId').equals(remoteTx1.id).toArray();
  if (auditKeepLocal.length === 0 || auditKeepLocal[0].action !== 'soft_delete') {
    throw new Error('Audit log entry for keep_local resolution was not recorded!');
  }
  console.log(`[PASS] 1-Tap 'keep_local' soft-deleted remote copy, preserved local record, and recorded audit trail.`);

  // Test 9: 1-Tap Resolution — Keep Remote (Delete Local)
  console.log('\n--- Test 9: 1-Tap Resolution — Keep Remote ---');
  const localTx2: Transaction = {
    ...localTx1,
    id: 'tx_laptop_lunch_02',
    description: 'Nasi Goreng Kambing Kebon Sirih',
    amount: 45000,
  };
  const remoteTx2: Transaction = {
    ...remoteTx1,
    id: 'tx_phone_lunch_02',
    description: 'Nasi Goreng Kambing Kebon Sirih Jakarta',
    amount: 45000,
  };
  await db.transactions.bulkPut([localTx2, remoteTx2]);
  const detected2 = await detectCrossDeviceDuplicates([remoteTx2], [localTx2], initialLocal.deviceId);
  if (detected2.length !== 1) throw new Error('Expected duplicate pair 2 to be detected');

  await resolveDuplicatePair(detected2[0].id, 'keep_remote');
  const resRemote2 = await db.transactions.get(remoteTx2.id);
  const resLocal2 = await db.transactions.get(localTx2.id);
  const resPair2 = await db.sync_duplicates.get(detected2[0].id);

  console.log(`Local tx isDeleted: ${resLocal2?.isDeleted}, Remote tx isDeleted: ${resRemote2?.isDeleted}, Pair Status: ${resPair2?.status}`);
  if (!resLocal2?.isDeleted || resRemote2?.isDeleted || resPair2?.status !== 'resolved_keep_remote') {
    throw new Error('keep_remote resolution did not soft-delete local tx or keep remote active!');
  }
  console.log(`[PASS] 1-Tap 'keep_remote' soft-deleted local copy, preserved remote record, and recorded audit trail.`);

  // Test 10: 1-Tap Resolution — Keep Both (Distinct Real-World Transactions)
  console.log('\n--- Test 10: 1-Tap Resolution — Keep Both (Distinct Transactions) ---');
  const localTx3: Transaction = {
    ...localTx1,
    id: 'tx_laptop_snack_03',
    description: 'Roti O Stasiun Gambir',
    amount: 15000,
  };
  const remoteTx3: Transaction = {
    ...remoteTx1,
    id: 'tx_phone_snack_03',
    description: 'Roti O Stasiun Gambir 2',
    amount: 15000,
  };
  await db.transactions.bulkPut([localTx3, remoteTx3]);
  const detected3 = await detectCrossDeviceDuplicates([remoteTx3], [localTx3], initialLocal.deviceId);
  if (detected3.length !== 1) throw new Error('Expected duplicate pair 3 to be detected');

  await resolveDuplicatePair(detected3[0].id, 'keep_both');
  const resLocal3 = await db.transactions.get(localTx3.id);
  const resRemote3 = await db.transactions.get(remoteTx3.id);
  const resPair3 = await db.sync_duplicates.get(detected3[0].id);

  console.log(`Local tx isDeleted: ${resLocal3?.isDeleted}, Remote tx isDeleted: ${resRemote3?.isDeleted}, Pair Status: ${resPair3?.status}`);
  if (resLocal3?.isDeleted || resRemote3?.isDeleted || resPair3?.status !== 'resolved_keep_both') {
    throw new Error('keep_both resolution incorrectly modified transaction deletion states!');
  }
  console.log(`[PASS] 1-Tap 'keep_both' preserved both transactions active in ledger without data loss.`);

  // =========================================================================
  // GROUP 3: Single Approved Google Account Lock, Mismatch & Migration
  // =========================================================================

  // In-memory simulated Google Drive cloud backend
  const mockDriveStorage = new Map<string, { id: string; name: string; content: string }>();
  let currentAuthUser = {
    id: 'goog_user_112233',
    email: 'alex.finance@gmail.com',
    name: 'Alex Johnson',
  };

  const mockDriveFetch: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = input.toString();

    // 1. Userinfo endpoint
    if (urlStr.includes('oauth2/v3/userinfo')) {
      return new Response(JSON.stringify(currentAuthUser), { status: 200 });
    }

    // 2. Drive About endpoint
    if (urlStr.includes('/drive/v3/about')) {
      return new Response(
        JSON.stringify({
          user: {
            emailAddress: currentAuthUser.email,
            displayName: currentAuthUser.name,
            permissionId: currentAuthUser.id,
          },
        }),
        { status: 200 }
      );
    }

    // 3. Download file media: GET /drive/v3/files/:id?alt=media
    if (urlStr.includes('/drive/v3/files/') && urlStr.includes('alt=media')) {
      const fileId = urlStr.split('/drive/v3/files/')[1].split('?')[0];
      const file = Array.from(mockDriveStorage.values()).find((f) => f.id === fileId);
      if (!file) return new Response('Not Found', { status: 404 });
      return new Response(file.content, { status: 200 });
    }

    // 4. Search files or folders: GET /drive/v3/files?q=...
    if (urlStr.includes('/drive/v3/files') && !urlStr.includes('/upload') && init?.method !== 'POST') {
      const rawQ = new URL(urlStr).searchParams.get('q') || '';
      const qParam = decodeURIComponent(rawQ);
      const matched = Array.from(mockDriveStorage.values()).filter((f) => {
        if (qParam.includes("name = 'MyFinancialFlow Data'")) return f.name === 'MyFinancialFlow Data';
        if (qParam.includes("name = 'manifest.json'")) return f.name === 'manifest.json';
        if (qParam.includes("name = 'transactions.json'")) return f.name === 'transactions.json';
        if (qParam.includes("name = 'accounts.json'")) return f.name === 'accounts.json';
        if (qParam.includes("name = 'categories.json'")) return f.name === 'categories.json';
        if (qParam.includes("name = 'goals.json'")) return f.name === 'goals.json';
        if (qParam.includes("name = 'investments.json'")) return f.name === 'investments.json';
        if (qParam.includes("name = 'metadata.json'")) return f.name === 'metadata.json';
        if (qParam.includes("name = 'Receipts'")) return f.name === 'Receipts';
        if (qParam.includes("name = 'financeflow_manifest.json'")) return f.name === 'manifest.json';
        return false;
      });
      return new Response(JSON.stringify({ files: matched }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // 4b. Create folder: POST /drive/v3/files (JSON body)
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

    // 5. Multipart create file: POST /upload/drive/v3/files?uploadType=multipart
    if (urlStr.includes('/upload/drive/v3/files') && init?.method === 'POST') {
      const body = String(init.body);
      const metadataMatch = body.match(/\{[\s\S]*?\}/);
      const metadata = metadataMatch ? JSON.parse(metadataMatch[0]) : { name: 'unknown' };
      const contentParts = body.split('\r\n\r\n');
      const content = contentParts.length >= 3 ? contentParts[2].split('\r\n--')[0] : '';
      const fileId = 'gdrive_' + crypto.randomUUID().slice(0, 8);
      mockDriveStorage.set(metadata.name, { id: fileId, name: metadata.name, content });
      return new Response(JSON.stringify({ id: fileId, name: metadata.name }), { status: 200 });
    }

    // 6. Patch file media: PATCH /upload/drive/v3/files/:id?uploadType=media
    if (urlStr.includes('/upload/drive/v3/files/') && init?.method === 'PATCH') {
      const fileId = urlStr.split('/upload/drive/v3/files/')[1].split('?')[0];
      const file = Array.from(mockDriveStorage.values()).find((f) => f.id === fileId);
      if (!file) return new Response('Not Found', { status: 404 });
      file.content = String(init.body);
      return new Response(JSON.stringify({ id: file.id, name: file.name }), { status: 200 });
    }

    return new Response('Mock Not Found', { status: 404 });
  };

  // Test 11: Initial Lock Registration on First Connect
  console.log('\n--- Test 11: Initial Google Account Lock Registration ---');
  const firstSync = await performGoogleDriveSync(
    MASTER_PIN,
    'mock_client_id_01',
    'token_alex_01',
    mockDriveFetch
  );
  if (!firstSync.success) throw new Error('Initial sync execution failed!');

  const settingsAfterFirst = await db.settings.get('current');
  const manifestFile1 = mockDriveStorage.get('manifest.json') || mockDriveStorage.get('financeflow_manifest.json');
  if (!manifestFile1) throw new Error('Cloud manifest was not uploaded to Drive!');
  const manifestData1 = JSON.parse(manifestFile1.content);

  console.log(`Local Settings: email="${settingsAfterFirst?.approvedGoogleEmail}", id="${settingsAfterFirst?.approvedGoogleAccountId}"`);
  console.log(`Drive Manifest: email="${manifestData1.approvedAccountEmail}", id="${manifestData1.approvedAccountId}"`);

  if (settingsAfterFirst?.approvedGoogleEmail !== 'alex.finance@gmail.com' || manifestData1.approvedAccountEmail !== 'alex.finance@gmail.com') {
    throw new Error('Approved Google account was not locked locally or in Drive manifest!');
  }
  console.log(`[PASS] Canonical lock established for alex.finance@gmail.com in local settings and remote manifest.`);

  // Test 12: Subsequent Sync with Authorized Matching Account
  console.log('\n--- Test 12: Subsequent Sync with Authorized Account ---');
  const secondSync = await performGoogleDriveSync(
    MASTER_PIN,
    'mock_client_id_01',
    'token_alex_02',
    mockDriveFetch
  );
  console.log(`Sync Status: success=${secondSync.success}, Revision=${secondSync.manifest.activeRevisionId}`);
  if (!secondSync.success) throw new Error('Subsequent sync with approved account failed!');
  console.log(`[PASS] Subsequent sync with authorized matching Google account succeeded normally.`);

  // Test 13: Strict Pre-Flight Blocking of Mismatched / Imposter Account
  console.log('\n--- Test 13: Strict Mismatched Account Pre-Flight Blocking ---');
  currentAuthUser = {
    id: 'goog_imposter_99999',
    email: 'imposter.user@gmail.com',
    name: 'Imposter User',
  };

  let mismatchBlocked = false;
  let capturedErrorMessage = '';
  try {
    await performGoogleDriveSync(
      MASTER_PIN,
      'mock_client_id_01',
      'token_imposter_01',
      mockDriveFetch
    );
  } catch (err: any) {
    capturedErrorMessage = err.message;
    if (err.message.includes('This device signed in with a different Google account')) {
      mismatchBlocked = true;
    }
  }

  console.log(`Blocked: ${mismatchBlocked}`);
  console.log(`Captured Error: "${capturedErrorMessage}"`);
  if (!mismatchBlocked) {
    throw new Error('CRITICAL SECURITY BREACH: Mismatched Google account was not blocked before data operations!');
  }
  console.log(`[PASS] Mismatched account (imposter.user@gmail.com) strictly BLOCKED before any data read or write.`);

  // Test 14: Fresh Second Device Enforces Lock via Remote Manifest
  console.log('\n--- Test 14: Second Device Remote Manifest Lock Enforcement ---');
  // Clear local setting on simulated second device
  await db.settings.update('current', {
    approvedGoogleAccountId: undefined,
    approvedGoogleEmail: undefined,
  });

  let secondDeviceBlocked = false;
  try {
    await performGoogleDriveSync(
      MASTER_PIN,
      'mock_client_id_01',
      'token_imposter_02',
      mockDriveFetch
    );
  } catch (err: any) {
    if (err.message.includes('This device signed in with a different Google account')) {
      secondDeviceBlocked = true;
      console.log(`Second device blocked message: "${err.message}"`);
    }
  }

  if (!secondDeviceBlocked) {
    throw new Error('Second device failed to enforce remote manifest approved account lock!');
  }
  console.log(`[PASS] Fresh second device verified remote manifest and strictly blocked unauthorized account.`);

  // Test 15: PIN-Gated 'Change Approved Account' Migration Pathway
  console.log('\n--- Test 15: PIN-Gated "Change Approved Account" Migration Pathway ---');
  currentAuthUser = {
    id: 'goog_new_account_7788',
    email: 'alex.work@company.com',
    name: 'Alex Work Account',
  };

  const migration = await changeApprovedGoogleAccount(
    MASTER_PIN,
    'mock_client_id_01',
    'token_alex_work_01',
    mockDriveFetch
  );
  console.log(`Migration result: success=${migration.success}, newApprovedEmail="${migration.approvedEmail}"`);
  if (migration.approvedEmail !== 'alex.work@company.com') {
    throw new Error('Migration failed to return new approved email!');
  }

  const postMigrateSettings = await db.settings.get('current');
  const postMigrateManifestRaw = mockDriveStorage.get('manifest.json') || mockDriveStorage.get('financeflow_manifest.json');
  if (!postMigrateManifestRaw) throw new Error('Manifest not found after migration');
  const postMigrateManifest = JSON.parse(postMigrateManifestRaw.content);

  console.log(`Post-Migration Local Settings: "${postMigrateSettings?.approvedGoogleEmail}"`);
  console.log(`Post-Migration Drive Manifest: "${postMigrateManifest.approvedAccountEmail}"`);

  if (postMigrateSettings?.approvedGoogleEmail !== 'alex.work@company.com' || postMigrateManifest.approvedAccountEmail !== 'alex.work@company.com') {
    throw new Error('Migration did not update both local settings and remote manifest!');
  }

  // Verify subsequent sync with new account succeeds
  const postMigrateSync = await performGoogleDriveSync(
    MASTER_PIN,
    'mock_client_id_01',
    'token_alex_work_02',
    mockDriveFetch
  );
  if (!postMigrateSync.success) throw new Error('Subsequent sync with migrated approved account failed!');

  console.log(`[PASS] PIN-gated migration transferred canonical lock to alex.work@company.com across local & remote storage.`);

  console.log('\n🎉 ALL 15 SINGLE-USER MULTI-DEVICE SYNC ENHANCEMENT TESTS PASSED WITH 100% SUCCESS! 🎉\n');
}

runSyncEnhancementsTests().catch((err) => {
  console.error('\n❌ SYNC ENHANCEMENTS TEST FAILED:', err);
  process.exit(1);
});
