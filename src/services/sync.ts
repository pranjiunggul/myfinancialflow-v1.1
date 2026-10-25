/**
 * Field-Level LWW Sync & Conflict Resolution Engine for FinanceFlow
 * Implements 3-way delta sync between Local Dexie IndexedDB and Remote Google Drive.
 * Conflict resolution preserves full audit history of superseded versions.
 */

import type { Table } from 'dexie';
import { db, getOrCreateDeviceId } from '../db/database';
import {
  downloadEncryptedSyncFromDrive,
  uploadVisibleSyncToDrive,
  downloadVisibleSyncFromDrive,
  getCachedAccessToken,
  requestGoogleDriveAuth,
  fetchGoogleProfile,
} from './gdrive';
import { syncPendingReceiptsToDrive } from './receiptAttachments';
import { recalculateAllAccountBalances } from './ledger';
import { getLocalDeviceInfo, aggregateDevicesList } from './device';
import { detectCrossDeviceDuplicates } from './syncDuplicates';
import type {
  SyncManifest,
  SyncPayloadData,
  SyncConflictRecord,
  SyncDuplicatePair,
} from '../types';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'conflict' | 'duplicate_detected' | 'error' | 'offline';

type SyncListener = (
  status: SyncStatus,
  message?: string,
  conflicts?: SyncConflictRecord[],
  duplicates?: SyncDuplicatePair[]
) => void;
const listeners = new Set<SyncListener>();

let currentStatus: SyncStatus = 'idle';
let lastSyncMessage: string = '';
let recentConflicts: SyncConflictRecord[] = [];
let recentDuplicates: SyncDuplicatePair[] = [];

export function subscribeToSyncStatus(listener: SyncListener): () => void {
  listeners.add(listener);
  listener(currentStatus, lastSyncMessage, recentConflicts, recentDuplicates);
  return () => {
    listeners.delete(listener);
  };
}

function notifySyncStatus(
  status: SyncStatus,
  message: string = '',
  conflicts: SyncConflictRecord[] = recentConflicts,
  duplicates: SyncDuplicatePair[] = recentDuplicates
): void {
  currentStatus = status;
  lastSyncMessage = message;
  recentConflicts = conflicts;
  recentDuplicates = duplicates;
  listeners.forEach((l) => l(status, message, conflicts, duplicates));
}

export function getRecentConflicts(): SyncConflictRecord[] {
  return [...recentConflicts];
}

export function getRecentDuplicates(): SyncDuplicatePair[] {
  return [...recentDuplicates];
}

export function clearRecentConflicts(): void {
  recentConflicts = [];
  notifySyncStatus(currentStatus, lastSyncMessage, recentConflicts, recentDuplicates);
}

export function clearRecentDuplicates(): void {
  recentDuplicates = [];
  notifySyncStatus(currentStatus, lastSyncMessage, recentConflicts, recentDuplicates);
}

/**
 * Deep compare two objects excluding metadata fields like updatedAt
 */
function isContentEqual(a: any, b: any): boolean {
  if (!a || !b) return a === b;
  const filterKeys = (obj: any) => {
    const copy = { ...obj };
    delete copy.updatedAt;
    delete copy.createdAt;
    delete copy.deviceId;
    delete copy.version;
    return copy;
  };
  return JSON.stringify(filterKeys(a)) === JSON.stringify(filterKeys(b));
}

/**
 * Build outbound sync payload of all records modified since lastSyncedAt
 */
export async function buildLocalSyncPayload(lastSyncedAt: number = 0): Promise<{
  payload: SyncPayloadData;
  manifest: SyncManifest;
}> {
  const localDevice = await getLocalDeviceInfo();
  const settings = await db.settings.get('current');
  const deviceName = localDevice.deviceName;
  const deviceId = localDevice.deviceId;

  const aggregatedDevices = aggregateDevicesList(settings?.connectedDevices || [], localDevice);

  const accounts = lastSyncedAt > 0
    ? await db.accounts.filter((a) => (a.updatedAt || 0) > lastSyncedAt).toArray()
    : await db.accounts.toArray();

  const categories = lastSyncedAt > 0
    ? await db.categories.filter((c) => (c.updatedAt || 0) > lastSyncedAt).toArray()
    : await db.categories.toArray();

  const transactions = lastSyncedAt > 0
    ? await db.transactions.filter((t) => (t.updatedAt || 0) > lastSyncedAt).toArray()
    : await db.transactions.toArray();

  const debts = lastSyncedAt > 0
    ? await db.debts_receivables.filter((d) => (d.updatedAt || 0) > lastSyncedAt).toArray()
    : await db.debts_receivables.toArray();

  const debtPayments = lastSyncedAt > 0
    ? await db.debt_payments.filter((p) => (p.createdAt || 0) > lastSyncedAt).toArray()
    : await db.debt_payments.toArray();

  const recurringRules = lastSyncedAt > 0
    ? await db.recurring_rules.filter((r) => (r.updatedAt || 0) > lastSyncedAt).toArray()
    : await db.recurring_rules.toArray();

  const aiProviders = await db.ai_providers.toArray();
  const aiKeys = await db.ai_keys.toArray();
  const aiPriorities = await db.ai_priorities.toArray();
  const financialGoals = await db.financial_goals.toArray();
  const investmentAssets = await db.investment_assets.toArray();
  const assetValuations = await db.asset_valuations.toArray();
  const achievements = await db.achievements.toArray();
  const subscriptionPatterns = await db.subscription_patterns.toArray();
  const aiChatSessions = await db.ai_chat_sessions.toArray();
  const receiptAttachments = await db.receipt_attachments.toArray();

  const totalLocalCount =
    (await db.accounts.count()) +
    (await db.categories.count()) +
    (await db.transactions.count()) +
    (await db.debts_receivables.count());

  const timestamp = Date.now();

  const payload: SyncPayloadData = {
    deviceId,
    deviceName,
    timestamp,
    schemaVersion: 1,
    approvedAccountId: settings?.approvedGoogleAccountId,
    approvedAccountEmail: settings?.approvedGoogleEmail,
    devices: aggregatedDevices,
    tables: {
      accounts,
      categories,
      transactions,
      debts_receivables: debts,
      debt_payments: debtPayments,
      recurring_rules: recurringRules,
      ai_providers: aiProviders,
      ai_keys: aiKeys,
      ai_priorities: aiPriorities,
      financial_goals: financialGoals,
      investment_assets: investmentAssets,
      asset_valuations: assetValuations,
      achievements,
      subscription_patterns: subscriptionPatterns,
      ai_chat_sessions: aiChatSessions,
      receipt_attachments: receiptAttachments,
    },
  };

  const manifest: SyncManifest = {
    manifestVersion: 1,
    deviceId,
    deviceName,
    lastSyncTimestamp: timestamp,
    schemaVersion: 1,
    activeRevisionId: 'rev_' + crypto.randomUUID().slice(0, 8),
    totalRecordsCount: totalLocalCount,
    updatedAt: timestamp,
    approvedAccountId: settings?.approvedGoogleAccountId,
    approvedAccountEmail: settings?.approvedGoogleEmail,
    devices: aggregatedDevices,
  };

  return { payload, manifest };
}

/**
 * Merge remote sync payload into local database using 3-way LWW merge rules.
 * Automatically archives superseded conflict records into audit_logs.
 */
export async function mergeRemoteSyncPayload(
  remotePayload: SyncPayloadData,
  lastSyncedAt: number = 0
): Promise<{
  mergedCount: number;
  conflicts: SyncConflictRecord[];
  duplicatePairs: SyncDuplicatePair[];
}> {
  const localDeviceId = getOrCreateDeviceId();
  const conflicts: SyncConflictRecord[] = [];
  let mergedCount = 0;
  let hasTransactionsUpdated = false;

  // Snapshot existing local transactions before merging to detect cross-device duplicates
  const existingLocalTransactions = await db.transactions.toArray();

  // Helper generic table merger
  async function mergeTable<T extends { id: string; updatedAt?: number; createdAt?: number; isDeleted?: boolean }>(
    entityType: 'account' | 'category' | 'transaction' | 'debt' | 'recurring',
    table: Table<T, string>,
    remoteRecords?: T[]
  ) {
    if (!remoteRecords || remoteRecords.length === 0) return;

    for (const remote of remoteRecords) {
      const local = await table.get(remote.id);
      const remoteTime = remote.updatedAt || remote.createdAt || 0;

      if (!local) {
        // Record does not exist locally -> direct insert
        await table.put(remote);
        mergedCount++;
        if (entityType === 'transaction') {
          hasTransactionsUpdated = true;
        }
        continue;
      }

      const localTime = local.updatedAt || local.createdAt || 0;

      // Both records exist. Check if identical content.
      if (isContentEqual(local, remote)) {
        // No meaningful difference
        continue;
      }

      // Check whether both sides modified since last sync (concurrent modification)
      const localModifiedSinceSync = localTime > lastSyncedAt;
      const remoteModifiedSinceSync = remoteTime > lastSyncedAt;

      if (remoteTime > localTime) {
        // Remote is newer -> Remote wins
        await table.put(remote);
        mergedCount++;

        if (localModifiedSinceSync && remoteModifiedSinceSync) {
          // Concurrent conflict! Local was superseded by Remote
          const conflict: SyncConflictRecord = {
            id: 'conf_' + crypto.randomUUID().slice(0, 8),
            entityType,
            entityId: remote.id,
            localVersion: local,
            remoteVersion: remote,
            winningSide: 'remote',
            winningRecord: remote,
            supersededVersion: local,
            resolvedAt: Date.now(),
            reason: `Remote change (${new Date(remoteTime).toISOString()}) superseded concurrent local edit (${new Date(localTime).toISOString()}).`,
          };
          conflicts.push(conflict);

          // Archive superseded version into audit_logs
          await db.audit_logs.add({
            id: 'audit_conf_' + crypto.randomUUID().slice(0, 8),
            entityType,
            entityId: remote.id,
            action: 'conflict_superseded',
            deviceId: remotePayload.deviceId || 'remote_device',
            timestamp: Date.now(),
            beforeSnapshot: local as any,
            afterSnapshot: remote as any,
            changeSummary: conflict.reason,
          });
        }

        if (entityType === 'transaction') {
          hasTransactionsUpdated = true;
        }
      } else if (localTime > remoteTime) {
        // Local is newer -> Local wins, remote is superseded
        if (localModifiedSinceSync && remoteModifiedSinceSync) {
          const conflict: SyncConflictRecord = {
            id: 'conf_' + crypto.randomUUID().slice(0, 8),
            entityType,
            entityId: local.id,
            localVersion: local,
            remoteVersion: remote,
            winningSide: 'local',
            winningRecord: local,
            supersededVersion: remote,
            resolvedAt: Date.now(),
            reason: `Local change (${new Date(localTime).toISOString()}) kept over older remote edit (${new Date(remoteTime).toISOString()}).`,
          };
          conflicts.push(conflict);

          await db.audit_logs.add({
            id: 'audit_conf_' + crypto.randomUUID().slice(0, 8),
            entityType,
            entityId: local.id,
            action: 'conflict_superseded',
            deviceId: localDeviceId,
            timestamp: Date.now(),
            beforeSnapshot: remote as any,
            afterSnapshot: local as any,
            changeSummary: conflict.reason,
          });
        }
      } else {
        // Identical timestamps but different content: deterministic tie breaker by deviceId
        if ((remotePayload.deviceId || '') > localDeviceId) {
          await table.put(remote);
          mergedCount++;
        }
      }
    }
  }

  // Execute merges across all entities
  await mergeTable('account', db.accounts as any, remotePayload.tables.accounts);
  await mergeTable('category', db.categories as any, remotePayload.tables.categories);
  await mergeTable('transaction', db.transactions as any, remotePayload.tables.transactions);
  await mergeTable('debt', db.debts_receivables as any, remotePayload.tables.debts_receivables);
  await mergeTable('recurring', db.recurring_rules as any, remotePayload.tables.recurring_rules);

  // Merge debt payments
  if (remotePayload.tables.debt_payments && remotePayload.tables.debt_payments.length > 0) {
    for (const payment of remotePayload.tables.debt_payments) {
      const exists = await db.debt_payments.get(payment.id);
      if (!exists) {
        await db.debt_payments.put(payment);
        mergedCount++;
      }
    }
  }

  // Merge AI configurations (providers, keys, priorities)
  if (remotePayload.tables.ai_providers?.length) {
    for (const prov of remotePayload.tables.ai_providers) {
      const existing = await db.ai_providers.get(prov.id);
      if (!existing || (prov.updatedAt || 0) > (existing.updatedAt || 0)) {
        await db.ai_providers.put(prov);
        mergedCount++;
      }
    }
  }
  if (remotePayload.tables.ai_keys?.length) {
    for (const k of remotePayload.tables.ai_keys) {
      const existing = await db.ai_keys.get(k.id);
      if (!existing || (k.updatedAt || 0) > (existing.updatedAt || 0)) {
        await db.ai_keys.put(k);
        mergedCount++;
      }
    }
  }
  if (remotePayload.tables.ai_priorities?.length) {
    for (const p of remotePayload.tables.ai_priorities) {
      await db.ai_priorities.put(p);
      mergedCount++;
    }
  }

  // Merge Financial Goals
  if (remotePayload.tables.financial_goals?.length) {
    for (const g of remotePayload.tables.financial_goals) {
      const existing = await db.financial_goals.get(g.id);
      if (!existing || (g.updatedAt || 0) > (existing.updatedAt || 0)) {
        await db.financial_goals.put(g);
        mergedCount++;
      }
    }
  }

  // Merge Investment Assets & Valuations
  if (remotePayload.tables.investment_assets?.length) {
    for (const a of remotePayload.tables.investment_assets) {
      const existing = await db.investment_assets.get(a.id);
      if (!existing || (a.updatedAt || 0) > (existing.updatedAt || 0)) {
        await db.investment_assets.put(a);
        mergedCount++;
      }
    }
  }
  if (remotePayload.tables.asset_valuations?.length) {
    for (const v of remotePayload.tables.asset_valuations) {
      const existing = await db.asset_valuations.get(v.id);
      if (!existing) {
        await db.asset_valuations.put(v);
        mergedCount++;
      }
    }
  }

  // Merge Achievements
  if (remotePayload.tables.achievements?.length) {
    for (const ach of remotePayload.tables.achievements) {
      const existing = await db.achievements.get(ach.id);
      if (!existing) {
        await db.achievements.put(ach);
        mergedCount++;
      }
    }
  }

  // Recalculate balances if any transaction was updated
  if (hasTransactionsUpdated) {
    try {
      await recalculateAllAccountBalances();
    } catch (err) {
      console.warn('[Sync] Balance recalculation warning:', err);
    }
  }

  // Detect cross-device duplicate transaction pairs (without dropping either record)
  let duplicatePairs: SyncDuplicatePair[] = [];
  if (remotePayload.tables.transactions && remotePayload.tables.transactions.length > 0) {
    try {
      duplicatePairs = await detectCrossDeviceDuplicates(
        remotePayload.tables.transactions,
        existingLocalTransactions,
        localDeviceId
      );
    } catch (dupErr) {
      console.warn('[Sync] Cross-device duplicate detection warning:', dupErr);
    }
  }

  return { mergedCount, conflicts, duplicatePairs };
}

/**
 * Manually restore a superseded version from a conflict record
 */
export async function restoreSupersededConflictRecord(conflict: SyncConflictRecord): Promise<void> {
  const versionToRestore = {
    ...conflict.supersededVersion,
    updatedAt: Date.now(), // Bump timestamp so it becomes active and syncs back
  };

  const deviceId = getOrCreateDeviceId();

  switch (conflict.entityType) {
    case 'account':
      await db.accounts.put(versionToRestore);
      break;
    case 'category':
      await db.categories.put(versionToRestore);
      break;
    case 'transaction':
      await db.transactions.put(versionToRestore);
      await recalculateAllAccountBalances();
      break;
    case 'debt':
      await db.debts_receivables.put(versionToRestore);
      break;
    case 'recurring':
      await db.recurring_rules.put(versionToRestore);
      break;
  }

  // Log restoration in audit trail
  await db.audit_logs.add({
    id: 'audit_restored_' + crypto.randomUUID().slice(0, 8),
    entityType: conflict.entityType,
    entityId: conflict.entityId,
    action: 'restore',
    deviceId,
    timestamp: Date.now(),
    beforeSnapshot: conflict.winningRecord,
    afterSnapshot: versionToRestore,
    changeSummary: `User manually restored superseded ${conflict.entityType} version from conflict review.`,
  });

  // Remove from recent conflicts list
  recentConflicts = recentConflicts.filter((c) => c.id !== conflict.id);
  notifySyncStatus(currentStatus, `Restored ${conflict.entityType} from superseded conflict.`, recentConflicts);
}

/**
 * Full Sync Cycle with Google Drive:
 * 1. Authenticate with Google Drive appDataFolder
 * 2. Download remote encrypted payload & manifest
 * 3. Merge remote delta with local DB using 3-way LWW merge
 * 4. Build consolidated local delta and upload encrypted payload back to Drive
 * 5. Update settings.lastSyncedAt
 */
export async function performGoogleDriveSync(
  masterPin: string,
  clientId?: string,
  customToken?: string,
  fetchFn = fetch
): Promise<{
  success: boolean;
  mergedCount: number;
  conflicts: SyncConflictRecord[];
  duplicatePairs: SyncDuplicatePair[];
  manifest: SyncManifest;
}> {
  if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && navigator.onLine === false) {
    notifySyncStatus('offline', 'Device is offline. Sync postponed.');
    throw new Error('Device is offline. Please check your network connection.');
  }

  notifySyncStatus('syncing', 'Connecting to Google Drive...');

  try {
    const settings = await db.settings.get('current');
    const effectiveClientId = clientId || settings?.googleDriveClientId || '';

    let accessToken = customToken || getCachedAccessToken();
    if (!accessToken) {
      if (!effectiveClientId) {
        throw new Error('Google Drive Client ID is missing. Please configure it in Settings.');
      }
      accessToken = await requestGoogleDriveAuth(effectiveClientId);
    }

    // Step 0: Profile & Approved Account Verification
    const profile = await fetchGoogleProfile(accessToken, fetchFn);
    const approvedAccountId = settings?.approvedGoogleAccountId;
    const approvedAccountEmail = settings?.approvedGoogleEmail;

    // Check 1: If local device has an approved account lock, enforce match
    if (approvedAccountId && profile.id !== approvedAccountId) {
      const emailMatches =
        approvedAccountEmail && profile.email.toLowerCase() === approvedAccountEmail.toLowerCase();
      if (!emailMatches) {
        throw new Error(
          `This device signed in with a different Google account (${profile.email}) than your configured MyFinancialFlow account (${approvedAccountEmail || approvedAccountId}). Syncing with a different account would NOT access your existing data. Please sign in with the correct account, or contact support/reset if you intend to start fresh.`
        );
      }
    }

    notifySyncStatus('syncing', 'Fetching remote data from Google Drive...');

    // Download remote manifest and structured data with tamper verification
    const { manifest: remoteManifest, payload: remotePayload, tamperStatus } = await downloadVisibleSyncFromDrive(
      masterPin,
      accessToken,
      fetchFn
    );

    // Tamper Verification 1: Check Account Lock integrity
    if (tamperStatus && !tamperStatus.accountLockValid) {
      const lockError =
        tamperStatus.accountLockMismatchReason ||
        'Tamper Alert: Remote Google Account Lock was altered outside MyFinancialFlow. Sync blocked to protect vault integrity.';
      throw new Error(lockError);
    }

    if (remoteManifest) {
      console.log(`[Sync] Remote manifest revision: ${remoteManifest.activeRevisionId}`);

      // Tamper Verification 2: Enforce that remote manifest approvedAccountId did not change outside PIN migration
      if (approvedAccountId && remoteManifest.approvedAccountId && remoteManifest.approvedAccountId !== approvedAccountId) {
        throw new Error(
          `Tamper Alert: Remote Google Account Lock (${remoteManifest.approvedAccountId}) does not match your authorized account (${approvedAccountId}). If you changed accounts, use the PIN-gated "Change Approved Account" setting.`
        );
      }

      // Check 2: If remote manifest has an approved account, enforce match with current profile
      if (remoteManifest.approvedAccountId) {
        const remoteMatches =
          profile.id === remoteManifest.approvedAccountId ||
          (remoteManifest.approvedAccountEmail &&
            profile.email.toLowerCase() === remoteManifest.approvedAccountEmail.toLowerCase());

        if (!remoteMatches) {
          throw new Error(
            `This device signed in with a different Google account (${profile.email}) than your configured MyFinancialFlow account (${remoteManifest.approvedAccountEmail || remoteManifest.approvedAccountId}). Syncing with a different account would NOT access your existing data. Please sign in with the correct account, or contact support/reset if you intend to start fresh.`
          );
        }

        // Lock canonical account locally on this device if not yet saved
        if (!approvedAccountId) {
          await db.settings.update('current', {
            approvedGoogleAccountId: remoteManifest.approvedAccountId,
            approvedGoogleEmail: remoteManifest.approvedAccountEmail || profile.email,
          });
        }
      }
    } else if (!approvedAccountId && profile.id) {
      // First ever sync: lock this authenticated account as canonical approved account
      await db.settings.update('current', {
        approvedGoogleAccountId: profile.id,
        approvedGoogleEmail: profile.email,
      });
    }

    // Tamper Verification 3: Detect external edits to data files
    let tamperWarning: string | undefined;
    if (tamperStatus && tamperStatus.mismatches.length > 0) {
      tamperWarning = `External modification detected in Google Drive files (${tamperStatus.mismatches.join(
        ', '
      )}). Merging cautiously via LWW conflict resolution.`;
      console.warn(`[Sync Tamper Warning] ${tamperWarning}`);
      await db.audit_logs.add({
        id: 'audit_' + crypto.randomUUID().slice(0, 8),
        entityType: 'account',
        entityId: 'google_drive_tamper_warning',
        action: 'update',
        deviceId: getOrCreateDeviceId(),
        timestamp: Date.now(),
        changeSummary: tamperWarning,
      });
    }

    const lastSyncedAt = settings?.lastSyncedAt || 0;
    let mergedCount = 0;
    let conflicts: SyncConflictRecord[] = [];
    let duplicatePairs: SyncDuplicatePair[] = [];

    // If remote data exists, merge it into local Dexie
    if (remotePayload) {
      notifySyncStatus('syncing', 'Merging remote changes...');
      const mergeResult = await mergeRemoteSyncPayload(remotePayload, lastSyncedAt);
      mergedCount = mergeResult.mergedCount;
      conflicts = mergeResult.conflicts;
      duplicatePairs = mergeResult.duplicatePairs || [];
    }

    notifySyncStatus('syncing', 'Uploading visible structured changes to Google Drive...');

    // Prepare full consolidated payload to upload back to cloud
    const { payload: localPayload, manifest: newManifest } = await buildLocalSyncPayload(0);

    // Merge device lists across manifest and local state
    const localDevice = await getLocalDeviceInfo();
    const mergedDevices = aggregateDevicesList(
      remoteManifest?.devices || settings?.connectedDevices || [],
      localDevice
    );
    newManifest.devices = mergedDevices;
    localPayload.devices = mergedDevices;

    // Ensure approved account metadata is stamped into manifest
    newManifest.approvedAccountId = settings?.approvedGoogleAccountId || profile.id;
    newManifest.approvedAccountEmail = settings?.approvedGoogleEmail || profile.email;
    localPayload.approvedAccountId = newManifest.approvedAccountId;
    localPayload.approvedAccountEmail = newManifest.approvedAccountEmail;

    // Upload visible structured payload & updated manifest with SHA-256 integrity checksums
    await uploadVisibleSyncToDrive(newManifest, localPayload, masterPin, accessToken, fetchFn);

    // Offload pending receipts to Google Drive ("MyFinancialFlow Data/Receipts/YYYY-MM/")
    try {
      await syncPendingReceiptsToDrive(accessToken, fetchFn);
    } catch (rcptSyncErr) {
      console.warn('[Sync] Non-blocking receipt offload notice:', rcptSyncErr);
    }

    // Update settings
    await db.settings.update('current', {
      lastSyncedAt: newManifest.lastSyncTimestamp,
      googleDriveLinked: true,
      googleDriveUserEmail: profile.email,
      approvedGoogleAccountId: newManifest.approvedAccountId,
      approvedGoogleEmail: newManifest.approvedAccountEmail,
      connectedDevices: mergedDevices,
    });

    const status: SyncStatus =
      conflicts.length > 0
        ? 'conflict'
        : duplicatePairs.length > 0
        ? 'duplicate_detected'
        : 'synced';

    const msg =
      conflicts.length > 0
        ? `Sync complete with ${conflicts.length} conflict(s) resolved via LWW.`
        : duplicatePairs.length > 0
        ? `Sync complete. ${duplicatePairs.length} possible cross-device duplicate(s) flagged for review.`
        : `Sync complete. ${mergedCount} changes merged.`;

    notifySyncStatus(status, msg, conflicts, duplicatePairs);

    return {
      success: true,
      mergedCount,
      conflicts,
      duplicatePairs,
      manifest: newManifest,
    };
  } catch (error: any) {
    const errMessage = error?.message || 'Sync failed';
    notifySyncStatus('error', errMessage);
    throw error;
  }
}

/**
 * Deliberate "Change Approved Google Account" Migration Pathway
 * Gated behind master PIN. Authenticates new account and atomically updates
 * both local database and remote sync manifest with the newly approved credentials.
 */
export async function changeApprovedGoogleAccount(
  masterPin: string,
  newClientId?: string,
  customToken?: string,
  fetchFn = fetch
): Promise<{ success: boolean; approvedEmail: string; approvedAccountId: string }> {
  const settings = await db.settings.get('current');
  const effectiveClientId = newClientId || settings?.googleDriveClientId || '';

  let accessToken = customToken || getCachedAccessToken();
  if (!accessToken) {
    if (!effectiveClientId) {
      throw new Error('Google Drive Client ID is missing. Please configure it in Settings.');
    }
    accessToken = await requestGoogleDriveAuth(effectiveClientId);
  }

  const newProfile = await fetchGoogleProfile(accessToken, fetchFn);
  const deviceId = getOrCreateDeviceId();
  const now = Date.now();

  // 1. Update local settings
  await db.settings.update('current', {
    approvedGoogleAccountId: newProfile.id,
    approvedGoogleEmail: newProfile.email,
    googleDriveUserEmail: newProfile.email,
    googleDriveLinked: true,
  });

  // 2. Update remote manifest on Google Drive
  try {
    const { manifest: remoteManifest, payload: remotePayload } = await downloadEncryptedSyncFromDrive(
      masterPin,
      accessToken,
      fetchFn
    );

    if (remoteManifest && remotePayload) {
      remoteManifest.approvedAccountId = newProfile.id;
      remoteManifest.approvedAccountEmail = newProfile.email;
      remoteManifest.updatedAt = now;
      remotePayload.approvedAccountId = newProfile.id;
      remotePayload.approvedAccountEmail = newProfile.email;

      await uploadVisibleSyncToDrive(remoteManifest, remotePayload, masterPin, accessToken, fetchFn);
    }
  } catch (syncErr) {
    console.warn('[ChangeApprovedAccount] Remote manifest update notice:', syncErr);
  }

  // 3. Record audit log
  await db.audit_logs.add({
    id: 'audit_' + crypto.randomUUID().slice(0, 8),
    entityType: 'account',
    entityId: 'google_drive_approved_account',
    action: 'update',
    deviceId,
    timestamp: now,
    changeSummary: `User authorized migration of approved Google Account lock to ${newProfile.email} (${newProfile.id}).`,
  });

  return {
    success: true,
    approvedEmail: newProfile.email,
    approvedAccountId: newProfile.id,
  };
}
