/**
 * Data & Privacy: Full Data Export & Deletion Service ("Right to be Forgotten")
 * Provides:
 * 1. "Export All My Data" — Single human-readable ZIP archive (CSV + sanitized JSONs).
 * 2. "Delete All My Data" — Secure two-tier wipe with cloud-before-local deletion order.
 */

import { db } from '../db/database';
import { exportTransactionsToCSV } from './export';
import { createZipArchive, type ZipFileInput } from '../utils/zip';
import { isOpfsSupported } from './backup';
import type { CurrencyCode } from '../types';

/**
 * Creates a complete human-readable ZIP archive of all user data
 */
export async function generateFullDataArchiveZip(
  baseCurrency: CurrencyCode = 'IDR'
): Promise<Uint8Array> {
  const [
    accounts,
    categories,
    transactions,
    debts,
    debtPayments,
    recurringRules,
    auditLogs,
    settings,
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
    db.settings.get('current'),
    db.financial_goals.toArray(),
    db.investment_assets.toArray(),
    db.asset_valuations.toArray(),
    db.achievements.toArray(),
  ]);

  // 1. Transactions CSV
  const txCsv = exportTransactionsToCSV(transactions, accounts, categories, baseCurrency);

  // 2. Sanitized Settings (Strictly strip all encrypted secrets, bot tokens, and keys)
  const sanitizedSettings = settings
    ? {
        ...settings,
        pinHash: undefined,
        telegramBotTokenEnc: undefined,
        telegramWorkerSecretEnc: undefined,
        aiApiKey: undefined,
      }
    : {};

  const files: ZipFileInput[] = [
    { filename: 'transactions.csv', content: txCsv },
    { filename: 'accounts.json', content: JSON.stringify(accounts, null, 2) },
    { filename: 'categories.json', content: JSON.stringify(categories, null, 2) },
    { filename: 'debts_receivables.json', content: JSON.stringify(debts, null, 2) },
    { filename: 'debt_payments.json', content: JSON.stringify(debtPayments, null, 2) },
    { filename: 'recurring_rules.json', content: JSON.stringify(recurringRules, null, 2) },
    { filename: 'audit_logs.json', content: JSON.stringify(auditLogs, null, 2) },
    { filename: 'settings_sanitized.json', content: JSON.stringify(sanitizedSettings, null, 2) },
    { filename: 'financial_goals.json', content: JSON.stringify(financialGoals, null, 2) },
    { filename: 'investment_assets.json', content: JSON.stringify(investmentAssets, null, 2) },
    { filename: 'asset_valuations.json', content: JSON.stringify(assetValuations, null, 2) },
    { filename: 'achievements.json', content: JSON.stringify(achievements, null, 2) },
  ];

  return createZipArchive(files);
}

/**
 * Triggers browser download of the full data ZIP archive
 */
export async function downloadFullDataArchive(baseCurrency: CurrencyCode = 'IDR'): Promise<void> {
  const zipBytes = await generateFullDataArchiveZip(baseCurrency);
  const blob = new Blob([zipBytes as any], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `MyFinancialFlow_Full_Export_${new Date().toISOString().split('T')[0]}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Executes Two-Tier Permanent Destruction:
 * Order of operations:
 * 1. Cloud-first: If wipeRemoteDrive is true, delete remote Google Drive appDataFolder content.
 * 2. Local-second: Wipe OPFS backup directory, clear all IndexedDB tables, and localStorage.
 */
export async function executeFullDataDeletion(
  wipeRemoteDrive = false,
  googleDriveToken?: string
): Promise<{ success: boolean; cloudDeleted: boolean; localDeleted: boolean }> {
  let cloudDeleted = false;
  let localDeleted = false;

  // Step 1: Cloud-First Wipe (if selected and token available)
  if (wipeRemoteDrive && googleDriveToken) {
    try {
      // Find "MyFinancialFlow Data" folder or legacy appDataFolder files and delete
      const folderQuery = encodeURIComponent("name = 'MyFinancialFlow Data' and mimeType = 'application/vnd.google-apps.folder' and trashed = false");
      const listFolderResp = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${folderQuery}&fields=files(id,name)`,
        {
          headers: { Authorization: `Bearer ${googleDriveToken}` },
        }
      );
      if (listFolderResp.ok) {
        let folderData: any = { files: [] };
        try {
          folderData = await listFolderResp.json();
        } catch {}
        for (const folder of folderData.files || []) {
          await fetch(`https://www.googleapis.com/drive/v3/files/${folder.id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${googleDriveToken}` },
          });
          cloudDeleted = true;
        }
      }

      // Also clean up any legacy appDataFolder files if present
      const listResp = await fetch(
        "https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&fields=files(id,name)",
        {
          headers: { Authorization: `Bearer ${googleDriveToken}` },
        }
      );
      if (listResp.ok) {
        let data: any = { files: [] };
        try {
          data = await listResp.json();
        } catch {}
        const files: Array<{ id: string }> = data.files || [];
        for (const f of files) {
          await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${googleDriveToken}` },
          });
          cloudDeleted = true;
        }
      }
    } catch (err) {
      console.warn('Failed to wipe remote Google Drive vault:', err);
    }
  }

  // Step 2: Wipe OPFS local backups
  if (isOpfsSupported()) {
    try {
      const root = await (navigator.storage as any).getDirectory();
      await root.removeEntry('backups', { recursive: true });
    } catch (err) {
      console.warn('OPFS backup directory cleanup skipped or failed:', err);
    }
  }

  // Step 3: Wipe all IndexedDB tables
  try {
    await db.transaction('rw', db.tables, async () => {
      for (const table of db.tables) {
        await table.clear();
      }
    });
    localDeleted = true;
  } catch (err) {
    console.warn('Failed to clear tables via transaction, dropping database:', err);
    await db.delete();
    localDeleted = true;
  }

  // Step 4: Clear localStorage keys
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.clear();
    } catch {}
  }

  return { success: localDeleted, cloudDeleted, localDeleted };
}
