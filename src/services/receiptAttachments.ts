/**
 * Receipt Attachments Service for MyFinancialFlow V1.1
 * Manages compressed receipt image blobs in Dexie (receipt_attachments table).
 * Supports cloud offload to Google Drive ("MyFinancialFlow Data/Receipts/YYYY-MM/"),
 * transaction linkage via webViewLink, and offline cache pruning against 2.0 GB ceiling.
 */

import { db } from '../db/database';
import { compressReceiptImage } from './imageCompression';
import { uploadReceiptImageToDrive } from './gdrive';
import type { ReceiptAttachment } from '../types';

export async function attachReceiptToTransaction(
  transactionId: string,
  imageDataUrlOrBase64: string
): Promise<ReceiptAttachment> {
  const compressed = await compressReceiptImage(imageDataUrlOrBase64, 1024, 0.75);
  const attachmentId = 'rcpt_' + crypto.randomUUID().slice(0, 8);

  const tx = await db.transactions.get(transactionId);
  const yearMonth = tx?.date ? tx.date.slice(0, 7) : new Date().toISOString().slice(0, 7);

  const record: ReceiptAttachment = {
    id: attachmentId,
    transactionId,
    mimeType: compressed.mimeType,
    sizeBytes: compressed.sizeBytes,
    width: compressed.width,
    height: compressed.height,
    dataBase64: compressed.dataBase64,
    yearMonth,
    isPruned: false,
    createdAt: Date.now(),
    isDeleted: false,
  };

  // Check if an existing attachment exists for this transaction and update/replace
  const existing = await db.receipt_attachments
    .where('transactionId')
    .equals(transactionId)
    .filter((r) => !r.isDeleted)
    .first();

  if (existing) {
    await db.receipt_attachments.update(existing.id, {
      ...record,
      id: existing.id,
      createdAt: Date.now(),
    });
    return { ...record, id: existing.id };
  }

  await db.receipt_attachments.add(record);
  return record;
}

export async function getReceiptAttachment(transactionId: string): Promise<ReceiptAttachment | null> {
  const attachment = await db.receipt_attachments
    .where('transactionId')
    .equals(transactionId)
    .filter((r) => !r.isDeleted)
    .first();

  return attachment || null;
}

export async function deleteReceiptAttachment(transactionId: string): Promise<void> {
  const existing = await db.receipt_attachments
    .where('transactionId')
    .equals(transactionId)
    .filter((r) => !r.isDeleted)
    .first();

  if (existing) {
    await db.receipt_attachments.update(existing.id, { isDeleted: true });
    // Also clear receiptUrl on transaction
    await db.transactions.update(transactionId, { receiptUrl: undefined });
  }
}

/**
 * Sync all pending un-uploaded local receipts to visible Google Drive
 */
export async function syncPendingReceiptsToDrive(
  accessToken: string,
  fetchFn = fetch
): Promise<{ uploadedCount: number; errors: number }> {
  let uploadedCount = 0;
  let errors = 0;

  const pendingReceipts = await db.receipt_attachments
    .filter((r) => !r.isDeleted && !r.driveFileId && !!r.dataBase64)
    .toArray();

  for (const receipt of pendingReceipts) {
    try {
      const tx = await db.transactions.get(receipt.transactionId);
      const txDate = tx?.date || new Date().toISOString().slice(0, 10);

      const uploaded = await uploadReceiptImageToDrive(receipt, txDate, accessToken, fetchFn);

      await db.receipt_attachments.update(receipt.id, {
        driveFileId: uploaded.fileId,
        driveWebViewLink: uploaded.webViewLink,
        yearMonth: uploaded.yearMonth,
      });

      // Update transaction record with the viewable Google Drive URL
      if (tx) {
        await db.transactions.update(tx.id, {
          receiptUrl: uploaded.webViewLink,
        });
      }

      uploadedCount++;
    } catch (err) {
      console.warn(`[ReceiptSync] Failed to upload receipt ${receipt.id}:`, err);
      errors++;
    }
  }

  return { uploadedCount, errors };
}

/**
 * Prune cached local base64 blobs for receipts already safely backed up to Google Drive.
 * Keeps receipt metadata and driveWebViewLink intact so transactions retain 1-click cloud access.
 */
export async function pruneCachedReceiptImages(options?: {
  olderThanDays?: number;
}): Promise<{ prunedCount: number; bytesReclaimed: number }> {
  const olderThanDays = options?.olderThanDays ?? 30;
  const cutoffTime = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;

  const eligibleReceipts = await db.receipt_attachments
    .filter((r) => !r.isDeleted && !!r.driveFileId && !!r.dataBase64 && r.createdAt < cutoffTime)
    .toArray();

  let bytesReclaimed = 0;
  let prunedCount = 0;

  for (const receipt of eligibleReceipts) {
    bytesReclaimed += receipt.sizeBytes || 0;
    await db.receipt_attachments.update(receipt.id, {
      dataBase64: undefined,
      sizeBytes: 0,
      isPruned: true,
    });
    prunedCount++;
  }

  return { prunedCount, bytesReclaimed };
}

/**
 * Calculates the total size in bytes consumed by active local receipt attachments
 */
export async function calculateReceiptsStorageBytes(): Promise<number> {
  try {
    const receipts = await db.receipt_attachments.filter((r) => !r.isDeleted).toArray();
    return receipts.reduce((sum, r) => sum + (r.sizeBytes || 0), 0);
  } catch {
    return 0;
  }
}
