/**
 * Automated Daily Local Backup Engine for FinanceFlow
 * Creates encrypted standalone snapshots of the entire IndexedDB database.
 * Stores backups to Origin Private File System (OPFS) with fallback to IndexedDB.
 * Enforces a 7 daily + 4 weekly rolling retention policy.
 */

import { db, getOrCreateDeviceId } from '../db/database';
import { encryptData, decryptData, type EncryptedPayload } from './crypto';
import type { LocalBackupMetadata, AppSettings } from '../types';

export interface DatabaseDump {
  version: number;
  exportedAt: number;
  dateStr: string;
  deviceId: string;
  tables: {
    accounts: any[];
    categories: any[];
    transactions: any[];
    debts_receivables: any[];
    debt_payments: any[];
    recurring_rules: any[];
    audit_logs: any[];
    fx_rates: any[];
    settings: any[];
    ai_providers?: any[];
    ai_keys?: any[];
    ai_priorities?: any[];
    subscription_patterns?: any[];
    ai_chat_sessions?: any[];
    receipt_attachments?: any[];
    financial_goals?: any[];
    investment_assets?: any[];
    asset_valuations?: any[];
    achievements?: any[];
  };
}

/**
 * Format timestamp into YYYY-MM-DD using local time
 */
export function formatLocalDateStr(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Check if OPFS (Origin Private File System) is available
 */
export function isOpfsSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.storage && typeof (navigator.storage as any).getDirectory === 'function';
}

/**
 * Get or create the backups directory inside OPFS
 */
async function getOpfsBackupsDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (!isOpfsSupported()) return null;
  try {
    const root = await (navigator.storage as any).getDirectory();
    return await root.getDirectoryHandle('backups', { create: true });
  } catch (err) {
    console.warn('[OPFS] Failed to access backups directory, falling back to IndexedDB:', err);
    return null;
  }
}

/**
 * Serializes all IndexedDB tables into a consolidated object
 */
export async function createFullDatabaseDump(): Promise<DatabaseDump> {
  const deviceId = getOrCreateDeviceId();
  const now = new Date();
  const dateStr = formatLocalDateStr(now);

  const [
    accounts,
    categories,
    transactions,
    debts,
    debtPayments,
    recurring,
    auditLogs,
    fxRates,
    settings,
    aiProviders,
    aiKeys,
    aiPriorities,
    subscriptionPatterns,
    aiChatSessions,
    receiptAttachments,
    financialGoals,
    investmentAssets,
    assetValuations,
    achievements,
  ] = await Promise.all([
    db.accounts.toArray(),
    db.categories.toArray(),
    db.transactions.toArray(),
    db.debts_receivables.toArray(),
    db.debt_payments.toArray(),
    db.recurring_rules.toArray(),
    db.audit_logs.toArray(),
    db.fx_rates.toArray(),
    db.settings.toArray(),
    db.ai_providers.toArray(),
    db.ai_keys.toArray(),
    db.ai_priorities.toArray(),
    db.subscription_patterns.toArray(),
    db.ai_chat_sessions.toArray(),
    db.receipt_attachments.toArray(),
    db.financial_goals.toArray(),
    db.investment_assets.toArray(),
    db.asset_valuations.toArray(),
    db.achievements.toArray(),
  ]);

  return {
    version: 1,
    exportedAt: now.getTime(),
    dateStr,
    deviceId,
    tables: {
      accounts,
      categories,
      transactions,
      debts_receivables: debts,
      debt_payments: debtPayments,
      recurring_rules: recurring,
      audit_logs: auditLogs,
      fx_rates: fxRates,
      settings,
      ai_providers: aiProviders,
      ai_keys: aiKeys,
      ai_priorities: aiPriorities,
      subscription_patterns: subscriptionPatterns,
      ai_chat_sessions: aiChatSessions,
      receipt_attachments: receiptAttachments,
      financial_goals: financialGoals,
      investment_assets: investmentAssets,
      asset_valuations: assetValuations,
      achievements,
    },
  };
}

/**
 * Creates an encrypted snapshot of the database and saves it to OPFS / IndexedDB
 */
export async function createEncryptedLocalBackup(
  masterPin: string,
  source: 'auto_daily' | 'manual' = 'auto_daily'
): Promise<LocalBackupMetadata> {
  const dump = await createFullDatabaseDump();
  const dateStr = dump.dateStr;
  const timestamp = dump.exportedAt;
  const filename = `backup_${dateStr}_${source}.fflow.enc`;

  // 1. Encrypt dump with user PIN (PBKDF2 -> AES-GCM-256)
  const encryptedPayload = await encryptData(dump, masterPin);
  const encryptedContentStr = JSON.stringify(encryptedPayload, null, 2);
  const sizeBytes = new Blob([encryptedContentStr]).size;

  const metadata: LocalBackupMetadata = {
    id: `bak_${timestamp}`,
    filename,
    timestamp,
    dateStr,
    sizeBytes,
    recordCounts: {
      accounts: dump.tables.accounts.length,
      categories: dump.tables.categories.length,
      transactions: dump.tables.transactions.length,
      debts: dump.tables.debts_receivables.length,
      recurring: dump.tables.recurring_rules.length,
      auditLogs: dump.tables.audit_logs.length,
    },
    source,
  };

  // 2. Attempt OPFS write
  let savedToOpfs = false;
  const opfsDir = await getOpfsBackupsDirectory();
  if (opfsDir) {
    try {
      const fileHandle = await opfsDir.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(encryptedContentStr);
      await writable.close();
      savedToOpfs = true;
    } catch (err) {
      console.warn('[Backup] OPFS write failed, falling back to IndexedDB:', err);
    }
  }

  if (savedToOpfs) {
    console.log(`[Backup] Successfully wrote snapshot to OPFS: ${filename}`);
  }

  // 3. Fallback or duplicate to IndexedDB local_backups store
  try {
    await db.local_backups.put({
      id: metadata.id,
      filename,
      dateStr,
      timestamp,
      payload: encryptedContentStr,
      metadata,
    });
  } catch (err) {
    console.error('[Backup] Failed to save backup metadata to IndexedDB:', err);
  }

  // 4. Update lastLocalBackupAt in settings
  await db.settings.update('current', {
    lastLocalBackupAt: timestamp,
  });

  // 5. Enforce 7 daily + 4 weekly rolling retention
  await pruneOldBackups();

  return metadata;
}

/**
 * List all available local backups across OPFS and IndexedDB
 */
export async function listAvailableLocalBackups(): Promise<LocalBackupMetadata[]> {
  const resultsMap = new Map<string, LocalBackupMetadata>();

  // 1. Read from IndexedDB
  try {
    const idbBackups = await db.local_backups.toArray();
    for (const b of idbBackups) {
      if (b.metadata) {
        resultsMap.set(b.filename, b.metadata);
      }
    }
  } catch (err) {
    console.warn('[Backup] Could not query IndexedDB backups:', err);
  }

  // 2. Read from OPFS if available
  const opfsDir = await getOpfsBackupsDirectory();
  if (opfsDir) {
    try {
      // Iterate directory handles
      for await (const [name, handle] of (opfsDir as any).entries()) {
        if (name.endsWith('.fflow.enc') && !resultsMap.has(name)) {
          const file = await (handle as FileSystemFileHandle).getFile();
          resultsMap.set(name, {
            id: `opfs_${name}`,
            filename: name,
            timestamp: file.lastModified,
            dateStr: name.split('_')[1] || formatLocalDateStr(new Date(file.lastModified)),
            sizeBytes: file.size,
            recordCounts: { accounts: 0, categories: 0, transactions: 0, debts: 0, recurring: 0, auditLogs: 0 },
            source: name.includes('auto_daily') ? 'auto_daily' : 'manual',
          });
        }
      }
    } catch (err) {
      console.warn('[Backup] Error enumerating OPFS backups:', err);
    }
  }

  return Array.from(resultsMap.values()).sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Prune backups older than 7 days (keeping 1 per week for preceding 4 weeks)
 */
export async function pruneOldBackups(): Promise<number> {
  const allBackups = await listAvailableLocalBackups();
  if (allBackups.length <= 7) return 0;

  const now = Date.now();
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const SEVEN_DAYS_MS = 7 * MS_PER_DAY;
  const THIRTY_FIVE_DAYS_MS = 35 * MS_PER_DAY; // 7 days + 4 weeks

  let prunedCount = 0;
  const opfsDir = await getOpfsBackupsDirectory();
  const keptWeeklyDays = new Set<string>();

  for (const b of allBackups) {
    const ageMs = now - b.timestamp;

    if (ageMs <= SEVEN_DAYS_MS) {
      // Keep all daily backups within last 7 days
      continue;
    } else if (ageMs <= THIRTY_FIVE_DAYS_MS) {
      // Keep only 1 backup per week for weeks 2 to 5
      const weekKey = `${Math.floor(ageMs / (7 * MS_PER_DAY))}`;
      if (!keptWeeklyDays.has(weekKey)) {
        keptWeeklyDays.add(weekKey);
        continue;
      }
    }

    // Otherwise, prune it!
    try {
      if (opfsDir) {
        await opfsDir.removeEntry(b.filename);
      }
      await db.local_backups.where('filename').equals(b.filename).delete();
      prunedCount++;
    } catch (err) {
      console.warn(`[Backup] Failed to prune backup ${b.filename}:`, err);
    }
  }

  return prunedCount;
}

/**
 * Check if daily backup is needed on app open/resume
 */
export async function checkAndRunDailyBackup(masterPin: string): Promise<LocalBackupMetadata | null> {
  const settings = await db.settings.get('current');
  if (settings?.dailyBackupEnabled === false) {
    return null;
  }

  const todayStr = formatLocalDateStr();
  const lastBackupTime = settings?.lastLocalBackupAt;

  if (lastBackupTime) {
    const lastBackupDateStr = formatLocalDateStr(new Date(lastBackupTime));
    if (lastBackupDateStr === todayStr) {
      // Backup already completed today
      return null;
    }
  }

  // Run daily backup
  return await createEncryptedLocalBackup(masterPin, 'auto_daily');
}

/**
 * Export backup to a downloadable file for manual safekeeping
 */
export async function exportEncryptedBackupToFile(masterPin: string): Promise<string> {
  const dump = await createFullDatabaseDump();
  const encryptedPayload = await encryptData(dump, masterPin);
  const encryptedContentStr = JSON.stringify(encryptedPayload, null, 2);
  const filename = `financeflow_backup_${dump.dateStr}.fflow.enc`;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const blob = new Blob([encryptedContentStr], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return filename;
}

/**
 * Restore database from an encrypted .fflow.enc backup file or payload string
 */
export async function restoreEncryptedBackup(
  encryptedDataOrString: EncryptedPayload | string,
  masterPin: string,
  overwrite: boolean = false
): Promise<{
  restoredCounts: Record<string, number>;
}> {
  const payload: EncryptedPayload =
    typeof encryptedDataOrString === 'string'
      ? JSON.parse(encryptedDataOrString)
      : encryptedDataOrString;

  // 1. Decrypt with master PIN
  const decryptedJson = await decryptData(payload, masterPin);
  const dump: DatabaseDump = typeof decryptedJson === 'string' ? JSON.parse(decryptedJson) : decryptedJson;

  if (!dump.tables || !dump.tables.accounts || !dump.tables.transactions) {
    throw new Error('Invalid backup file structure. Missing required database tables.');
  }

  // 2. Perform restoration
  if (overwrite) {
    await Promise.all([
      db.accounts.clear(),
      db.categories.clear(),
      db.transactions.clear(),
      db.debts_receivables.clear(),
      db.debt_payments.clear(),
      db.recurring_rules.clear(),
      db.audit_logs.clear(),
      db.fx_rates.clear(),
    ]);
  }

  // Restore tables via bulkPut (handles both fresh populate and upsert merge)
  if (dump.tables.accounts?.length) await db.accounts.bulkPut(dump.tables.accounts);
  if (dump.tables.categories?.length) await db.categories.bulkPut(dump.tables.categories);
  if (dump.tables.transactions?.length) await db.transactions.bulkPut(dump.tables.transactions);
  if (dump.tables.debts_receivables?.length) await db.debts_receivables.bulkPut(dump.tables.debts_receivables);
  if (dump.tables.debt_payments?.length) await db.debt_payments.bulkPut(dump.tables.debt_payments);
  if (dump.tables.recurring_rules?.length) await db.recurring_rules.bulkPut(dump.tables.recurring_rules);
  if (dump.tables.audit_logs?.length) await db.audit_logs.bulkPut(dump.tables.audit_logs);
  if (dump.tables.fx_rates?.length) await db.fx_rates.bulkPut(dump.tables.fx_rates);
  if (dump.tables.ai_providers?.length) await db.ai_providers.bulkPut(dump.tables.ai_providers);
  if (dump.tables.ai_keys?.length) await db.ai_keys.bulkPut(dump.tables.ai_keys);
  if (dump.tables.ai_priorities?.length) await db.ai_priorities.bulkPut(dump.tables.ai_priorities);
  if (dump.tables.subscription_patterns?.length) await db.subscription_patterns.bulkPut(dump.tables.subscription_patterns);
  if (dump.tables.ai_chat_sessions?.length) await db.ai_chat_sessions.bulkPut(dump.tables.ai_chat_sessions);
  if (dump.tables.receipt_attachments?.length) await db.receipt_attachments.bulkPut(dump.tables.receipt_attachments);
  if (dump.tables.financial_goals?.length) await db.financial_goals.bulkPut(dump.tables.financial_goals);
  if (dump.tables.investment_assets?.length) await db.investment_assets.bulkPut(dump.tables.investment_assets);
  if (dump.tables.asset_valuations?.length) await db.asset_valuations.bulkPut(dump.tables.asset_valuations);
  if (dump.tables.achievements?.length) await db.achievements.bulkPut(dump.tables.achievements);

  // Restore user settings if present (preserving deviceId)
  if (dump.tables.settings?.length) {
    const currentSettings = await db.settings.get('current');
    const backupSettings = dump.tables.settings[0] as AppSettings;
    await db.settings.put({
      ...backupSettings,
      id: 'current',
      deviceId: currentSettings?.deviceId || backupSettings.deviceId,
    });
  }

  // Log restore operation to audit trail
  await db.audit_logs.add({
    id: 'audit_restore_' + crypto.randomUUID().slice(0, 8),
    entityType: 'transaction',
    entityId: 'backup_restore',
    action: 'restore',
    deviceId: getOrCreateDeviceId(),
    timestamp: Date.now(),
    changeSummary: `Database restored from backup taken on ${dump.dateStr} (${overwrite ? 'Full Overwrite' : 'Merge'}).`,
  });

  return {
    restoredCounts: {
      accounts: dump.tables.accounts?.length || 0,
      categories: dump.tables.categories?.length || 0,
      transactions: dump.tables.transactions?.length || 0,
      debts: dump.tables.debts_receivables?.length || 0,
      recurring: dump.tables.recurring_rules?.length || 0,
    },
  };
}
