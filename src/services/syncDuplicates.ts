/**
 * Cross-Device Duplicate Transaction Detection Service
 * Detects distinct transaction records created independently on different devices
 * during an offline/sync delay window that represent the same real-world event.
 *
 * Rules:
 * - Does NOT silently drop either transaction; both are admitted to the ledger.
 * - Matching criteria: Same amount + Same date + Description similarity >= 0.70 (70%).
 * - Surfaces duplicate pairs for 1-tap user review (Keep Local, Keep Remote, Keep Both).
 */

import { db, getOrCreateDeviceId } from '../db/database';
import type { SyncDuplicatePair, Transaction } from '../types';
import { recalculateAllAccountBalances } from './ledger';

export const SIMILARITY_THRESHOLD = 0.70; // 70% threshold

const TRANSACTION_STOP_WORDS = new Set([
  'pembayaran', 'bayar', 'qris', 'transfer', 'transaksi', 'berhasil',
  'ke', 'dari', 'topup', 'top', 'up', 'beli', 'payment', 'merchant',
  'debit', 'kredit', 'rekening', 'an', 'via'
]);

/**
 * Clean and normalize text for comparison
 */
function normalizeText(text: string): string {
  return (text || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculate similarity between two transaction descriptions (0.0 to 1.0)
 * Uses cleaned word token overlap, Szymkiewicz–Simpson overlap coefficient,
 * and substring containment.
 */
export function calculateDescriptionSimilarity(desc1: string, desc2: string): number {
  const norm1 = normalizeText(desc1);
  const norm2 = normalizeText(desc2);

  if (!norm1 && !norm2) return 1.0;
  if (!norm1 || !norm2) return 0.0;
  if (norm1 === norm2) return 1.0;

  // 1. Direct Substring containment check
  if (norm1.includes(norm2) || norm2.includes(norm1)) {
    const shorter = Math.min(norm1.length, norm2.length);
    const longer = Math.max(norm1.length, norm2.length);
    const ratio = shorter / longer;
    if (ratio >= 0.4) {
      return Math.max(ratio, 0.80);
    }
  }

  // 2. Tokenize and filter out transaction noise words
  const rawTokens1 = norm1.split(' ').filter((w) => w.length > 1);
  const rawTokens2 = norm2.split(' ').filter((w) => w.length > 1);

  const cleanTokens1 = rawTokens1.filter((w) => !TRANSACTION_STOP_WORDS.has(w));
  const cleanTokens2 = rawTokens2.filter((w) => !TRANSACTION_STOP_WORDS.has(w));

  const tokens1 = new Set(cleanTokens1.length > 0 ? cleanTokens1 : rawTokens1);
  const tokens2 = new Set(cleanTokens2.length > 0 ? cleanTokens2 : rawTokens2);

  if (tokens1.size === 0 || tokens2.size === 0) {
    return 0.0;
  }

  let intersectionCount = 0;
  for (const t of tokens1) {
    if (tokens2.has(t)) {
      intersectionCount++;
    }
  }

  // Jaccard index
  const unionCount = new Set([...tokens1, ...tokens2]).size;
  const jaccard = unionCount > 0 ? intersectionCount / unionCount : 0.0;

  // Overlap coefficient (handles cases where one description is a more detailed version of the other)
  const minSize = Math.min(tokens1.size, tokens2.size);
  const overlapCoeff = minSize > 0 ? intersectionCount / minSize : 0.0;

  return Math.max(jaccard, overlapCoeff);
}

/**
 * Detect cross-device duplicate transaction pairs between remote batch and local transactions.
 * Persists detected pairs to db.sync_duplicates with 'pending' status.
 */
export async function detectCrossDeviceDuplicates(
  remoteTransactions: Transaction[],
  localTransactions: Transaction[],
  _currentDeviceId: string = getOrCreateDeviceId()
): Promise<SyncDuplicatePair[]> {
  const detectedPairs: SyncDuplicatePair[] = [];

  // Load existing active duplicate pairs to prevent duplicate alerts
  const existingPairs = await db.sync_duplicates.toArray();
  const knownPairKeys = new Set(
    existingPairs.map((p) => `${p.localTransactionId}::${p.remoteTransactionId}`)
  );
  // Also check reverse key
  existingPairs.forEach((p) => {
    knownPairKeys.add(`${p.remoteTransactionId}::${p.localTransactionId}`);
  });

  for (const remote of remoteTransactions) {
    if (remote.isDeleted) continue;

    for (const local of localTransactions) {
      if (local.isDeleted) continue;
      // Must be different records
      if (remote.id === local.id) continue;

      // Check if already registered
      const pairKey = `${local.id}::${remote.id}`;
      if (knownPairKeys.has(pairKey)) continue;

      // 1. Amount match (exact or within 0.01)
      if (Math.abs(remote.amount - local.amount) > 0.01) continue;

      // 2. Date match
      const dateMatch =
        remote.date === local.date ||
        (remote.timestamp && local.timestamp && Math.abs(remote.timestamp - local.timestamp) <= 24 * 3600 * 1000);
      if (!dateMatch) continue;

      // 3. Description similarity >= 70%
      const similarity = calculateDescriptionSimilarity(remote.description, local.description);
      if (similarity < SIMILARITY_THRESHOLD) continue;

      // Match found!
      const pair: SyncDuplicatePair = {
        id: 'dup_' + crypto.randomUUID().slice(0, 8),
        localTransactionId: local.id,
        remoteTransactionId: remote.id,
        localTransactionSnapshot: { ...local },
        remoteTransactionSnapshot: { ...remote },
        detectedAt: Date.now(),
        status: 'pending',
        reason: `Potential cross-device duplicate: ${local.amount.toLocaleString()} on ${local.date} ("${local.description}" vs "${remote.description}", ${Math.round(similarity * 100)}% match).`,
        similarityScore: Math.round(similarity * 100) / 100,
      };

      detectedPairs.push(pair);
      knownPairKeys.add(pairKey);
      await db.sync_duplicates.put(pair);
    }
  }

  return detectedPairs;
}

/**
 * Get all pending duplicate transaction pairs
 */
export async function getPendingDuplicatePairs(): Promise<SyncDuplicatePair[]> {
  return await db.sync_duplicates.where('status').equals('pending').toArray();
}

/**
 * 1-Tap Resolution for a Duplicate Pair:
 * - 'keep_local': soft-deletes remote transaction
 * - 'keep_remote': soft-deletes local transaction
 * - 'keep_both': marks pair as valid distinct transactions
 */
export async function resolveDuplicatePair(
  pairId: string,
  action: 'keep_local' | 'keep_remote' | 'keep_both',
  _masterPin?: string
): Promise<void> {
  const pair = await db.sync_duplicates.get(pairId);
  if (!pair) throw new Error(`Duplicate pair "${pairId}" not found`);

  const deviceId = getOrCreateDeviceId();
  const now = Date.now();

  if (action === 'keep_local') {
    // Delete remote transaction
    const remoteTx = await db.transactions.get(pair.remoteTransactionId);
    if (remoteTx) {
      await db.transactions.update(pair.remoteTransactionId, {
        isDeleted: true,
        updatedAt: now,
      });
      await db.audit_logs.add({
        id: 'audit_' + crypto.randomUUID().slice(0, 8),
        entityType: 'transaction',
        entityId: pair.remoteTransactionId,
        action: 'soft_delete',
        deviceId,
        timestamp: now,
        beforeSnapshot: remoteTx as any,
        afterSnapshot: { ...remoteTx, isDeleted: true, updatedAt: now } as any,
        changeSummary: `Resolved cross-device duplicate by keeping local transaction and removing remote copy.`,
      });
      await recalculateAllAccountBalances();
    }
    await db.sync_duplicates.update(pairId, { status: 'resolved_keep_local' });
  } else if (action === 'keep_remote') {
    // Delete local transaction
    const localTx = await db.transactions.get(pair.localTransactionId);
    if (localTx) {
      await db.transactions.update(pair.localTransactionId, {
        isDeleted: true,
        updatedAt: now,
      });
      await db.audit_logs.add({
        id: 'audit_' + crypto.randomUUID().slice(0, 8),
        entityType: 'transaction',
        entityId: pair.localTransactionId,
        action: 'soft_delete',
        deviceId,
        timestamp: now,
        beforeSnapshot: localTx as any,
        afterSnapshot: { ...localTx, isDeleted: true, updatedAt: now } as any,
        changeSummary: `Resolved cross-device duplicate by keeping remote transaction and removing local copy.`,
      });
      await recalculateAllAccountBalances();
    }
    await db.sync_duplicates.update(pairId, { status: 'resolved_keep_remote' });
  } else if (action === 'keep_both') {
    // Both retained
    await db.audit_logs.add({
      id: 'audit_' + crypto.randomUUID().slice(0, 8),
      entityType: 'transaction',
      entityId: pair.localTransactionId,
      action: 'update',
      deviceId,
      timestamp: now,
      changeSummary: `User marked cross-device duplicate pair as distinct transactions (kept both).`,
    });
    await db.sync_duplicates.update(pairId, { status: 'resolved_keep_both' });
  }
}
