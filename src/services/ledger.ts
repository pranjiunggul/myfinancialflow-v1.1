import { db, getOrCreateDeviceId } from '../db/database';
import type {
  Transaction,
  Account,
  Category,
  AuditLog,
} from '../types';

/**
 * Recomputes and updates the cached currentBalance for all active accounts
 * based on initialBalance + all non-deleted transactions in the database.
 */
export async function recalculateAllAccountBalances(): Promise<void> {
  const accounts = await db.accounts.filter(a => !a.isDeleted).toArray();
  const transactions = await db.transactions.filter(t => !t.isDeleted).toArray();

  const balanceMap = new Map<string, number>();
  for (const acc of accounts) {
    balanceMap.set(acc.id, acc.initialBalance || 0);
  }

  for (const tx of transactions) {
    const current = balanceMap.get(tx.accountId) ?? 0;

    switch (tx.type) {
      case 'income':
        balanceMap.set(tx.accountId, current + tx.amount);
        break;

      case 'expense':
        balanceMap.set(tx.accountId, current - tx.amount);
        break;

      case 'transfer': {
        const fee = tx.transferMeta?.feeAmount || 0;
        // Deduct transfer amount + fee from source account
        balanceMap.set(tx.accountId, current - (tx.amount + fee));

        // Credit to destination account
        if (tx.transferMeta?.toAccountId) {
          const destCurrent = balanceMap.get(tx.transferMeta.toAccountId) ?? 0;
          balanceMap.set(tx.transferMeta.toAccountId, destCurrent + tx.transferMeta.toAmount);
        }
        break;
      }

      case 'debt': {
        // Debt transaction:
        // If it's the initial borrowing: user receives money (+amount in account)
        // If it's a repayment: user pays back (-amount in account)
        if (tx.debtRepaymentType) {
          // Repaying a debt -> cash outflow
          balanceMap.set(tx.accountId, current - tx.amount);
        } else {
          // Incurring new debt -> cash inflow
          balanceMap.set(tx.accountId, current + tx.amount);
        }
        break;
      }

      case 'receivable': {
        // Receivable transaction:
        // If it's the initial loan given: user gives money (-amount in account)
        // If it's a collected repayment: user receives money (+amount in account)
        if (tx.debtRepaymentType) {
          // Receiving repayment from borrower -> cash inflow
          balanceMap.set(tx.accountId, current + tx.amount);
        } else {
          // Giving out loan to someone -> cash outflow
          balanceMap.set(tx.accountId, current - tx.amount);
        }
        break;
      }
    }
  }

  // Update account balances in Dexie
  await db.transaction('rw', db.accounts, async () => {
    for (const acc of accounts) {
      const computedBalance = balanceMap.get(acc.id) ?? acc.initialBalance;
      if (acc.currentBalance !== computedBalance) {
        await db.accounts.update(acc.id, {
          currentBalance: computedBalance,
          updatedAt: Date.now(),
        });
      }
    }
  });
}

/**
 * Creates an audit log entry for changes
 */
export async function recordAudit(
  entityType: AuditLog['entityType'],
  entityId: string,
  action: AuditLog['action'],
  changeSummary: string,
  beforeSnapshot?: Record<string, any>,
  afterSnapshot?: Record<string, any>
): Promise<void> {
  const auditEntry: AuditLog = {
    id: 'audit_' + crypto.randomUUID(),
    entityType,
    entityId,
    action,
    deviceId: getOrCreateDeviceId(),
    timestamp: Date.now(),
    beforeSnapshot,
    afterSnapshot,
    changeSummary,
  };
  await db.audit_logs.put(auditEntry);
}

/**
 * Save / Create a new transaction with automatic balance update
 */
export async function createTransaction(tx: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'deviceId' | 'isDeleted' | 'version'>): Promise<Transaction> {
  const deviceId = getOrCreateDeviceId();
  const id = 'tx_' + crypto.randomUUID();
  const now = Date.now();

  const newTx: Transaction = {
    ...tx,
    id,
    createdAt: now,
    updatedAt: now,
    deviceId,
    isDeleted: false,
    version: 1,
  };

  await db.transaction('rw', [db.transactions, db.accounts, db.audit_logs, db.debts_receivables], async () => {
    await db.transactions.put(newTx);
    await recordAudit('transaction', id, 'create', `Created ${newTx.type} transaction: ${newTx.amount} ${newTx.currency} (${newTx.description})`, undefined, newTx);
  });

  await recalculateAllAccountBalances();
  return newTx;
}

/**
 * Update an existing transaction with automatic balance recalculation
 */
export async function updateTransaction(id: string, updates: Partial<Transaction>): Promise<void> {
  const existing = await db.transactions.get(id);
  if (!existing) throw new Error(`Transaction with ID ${id} not found`);

  const updated: Transaction = {
    ...existing,
    ...updates,
    updatedAt: Date.now(),
    version: (existing.version || 1) + 1,
  };

  await db.transaction('rw', [db.transactions, db.accounts, db.audit_logs], async () => {
    await db.transactions.put(updated);
    await recordAudit('transaction', id, 'update', `Updated transaction: ${updated.amount} ${updated.currency} (${updated.description})`, existing, updated);
  });

  await recalculateAllAccountBalances();
}

/**
 * Soft delete a transaction (never hard-deletes silently)
 */
export async function softDeleteTransaction(id: string): Promise<void> {
  const existing = await db.transactions.get(id);
  if (!existing) return;

  await db.transaction('rw', [db.transactions, db.audit_logs], async () => {
    await db.transactions.update(id, {
      isDeleted: true,
      updatedAt: Date.now(),
    });
    await recordAudit('transaction', id, 'soft_delete', `Soft-deleted transaction: ${existing.amount} ${existing.currency} (${existing.description})`, existing);
  });

  await recalculateAllAccountBalances();
}

/**
 * Restore a soft-deleted transaction
 */
export async function restoreTransaction(id: string): Promise<void> {
  const existing = await db.transactions.get(id);
  if (!existing) return;

  await db.transaction('rw', [db.transactions, db.audit_logs], async () => {
    await db.transactions.update(id, {
      isDeleted: false,
      updatedAt: Date.now(),
    });
    await recordAudit('transaction', id, 'restore', `Restored transaction: ${existing.amount} ${existing.currency} (${existing.description})`, existing);
  });

  await recalculateAllAccountBalances();
}

/**
 * Account CRUD helpers
 */
export async function createAccount(acc: Omit<Account, 'id' | 'currentBalance' | 'createdAt' | 'updatedAt' | 'deviceId' | 'isDeleted' | 'version'>): Promise<Account> {
  const deviceId = getOrCreateDeviceId();
  const id = 'acc_' + crypto.randomUUID();
  const now = Date.now();

  const newAcc: Account = {
    ...acc,
    id,
    currentBalance: acc.initialBalance,
    createdAt: now,
    updatedAt: now,
    deviceId,
    isDeleted: false,
    version: 1,
  };

  await db.accounts.put(newAcc);
  await recordAudit('account', id, 'create', `Created account ${newAcc.name} (${newAcc.currency})`, undefined, newAcc);
  await recalculateAllAccountBalances();
  return newAcc;
}

export async function updateAccount(id: string, updates: Partial<Account>): Promise<void> {
  const existing = await db.accounts.get(id);
  if (!existing) throw new Error(`Account not found`);

  const updated: Account = {
    ...existing,
    ...updates,
    updatedAt: Date.now(),
    version: (existing.version || 1) + 1,
  };

  await db.accounts.put(updated);
  await recordAudit('account', id, 'update', `Updated account ${updated.name}`, existing, updated);
  await recalculateAllAccountBalances();
}

export async function softDeleteAccount(id: string): Promise<{ success: boolean; message?: string }> {
  const activeTxCount = await db.transactions.where('accountId').equals(id).filter(t => !t.isDeleted).count();
  if (activeTxCount > 0) {
    return {
      success: false,
      message: `Cannot delete account. There are ${activeTxCount} active transactions linked to this account.`,
    };
  }

  const existing = await db.accounts.get(id);
  if (existing) {
    await db.accounts.update(id, { isDeleted: true, updatedAt: Date.now() });
    await recordAudit('account', id, 'soft_delete', `Soft-deleted account ${existing.name}`, existing);
  }
  return { success: true };
}

/**
 * Category CRUD helpers with reassignment check
 */
export async function createCategory(cat: Omit<Category, 'id' | 'createdAt' | 'updatedAt' | 'deviceId' | 'isDeleted' | 'version'>): Promise<Category> {
  const deviceId = getOrCreateDeviceId();
  const id = 'cat_' + crypto.randomUUID();
  const now = Date.now();

  const newCat: Category = {
    ...cat,
    id,
    createdAt: now,
    updatedAt: now,
    deviceId,
    isDeleted: false,
    version: 1,
  };

  await db.categories.put(newCat);
  await recordAudit('category', id, 'create', `Created category ${newCat.name}`, undefined, newCat);
  return newCat;
}

export async function updateCategory(id: string, updates: Partial<Category>): Promise<void> {
  const existing = await db.categories.get(id);
  if (!existing) throw new Error('Category not found');

  const updated: Category = {
    ...existing,
    ...updates,
    updatedAt: Date.now(),
    version: (existing.version || 1) + 1,
  };

  await db.categories.put(updated);
  await recordAudit('category', id, 'update', `Updated category ${updated.name}`, existing, updated);
}

export async function softDeleteCategory(id: string, replacementCategoryId?: string): Promise<{ success: boolean; message?: string }> {
  const category = await db.categories.get(id);
  if (!category) return { success: false, message: 'Category not found' };
  if (category.isSystem) return { success: false, message: 'System categories cannot be deleted.' };

  const linkedTxs = await db.transactions.where('categoryId').equals(id).filter(t => !t.isDeleted).toArray();

  if (linkedTxs.length > 0) {
    if (!replacementCategoryId) {
      return {
        success: false,
        message: `This category has ${linkedTxs.length} active transactions. Please select a replacement category to reassign them.`,
      };
    }

    // Reassign all linked transactions to replacementCategoryId
    await db.transaction('rw', db.transactions, async () => {
      for (const tx of linkedTxs) {
        await db.transactions.update(tx.id, {
          categoryId: replacementCategoryId,
          updatedAt: Date.now(),
        });
      }
    });
  }

  await db.categories.update(id, { isDeleted: true, updatedAt: Date.now() });
  await recordAudit('category', id, 'soft_delete', `Soft deleted category ${category.name}`, category);
  return { success: true };
}


/**
 * Feature 6: Bulk Soft Delete Transactions
 * Deletes multiple transactions in a single batch, preserving audit logs and recalculating balances.
 */
export async function bulkSoftDeleteTransactions(txIds: string[]): Promise<number> {
  if (txIds.length === 0) return 0;

  const now = Date.now();
  let count = 0;

  await db.transaction('rw', [db.transactions, db.audit_logs], async () => {
    for (const id of txIds) {
      const existing = await db.transactions.get(id);
      if (existing && !existing.isDeleted) {
        await db.transactions.update(id, {
          isDeleted: true,
          updatedAt: now,
          version: (existing.version || 1) + 1,
        });
        await recordAudit(
          'transaction',
          id,
          'soft_delete',
          `Bulk soft-deleted transaction: ${existing.amount} ${existing.currency} (${existing.description})`,
          existing
        );
        count++;
      }
    }
  });

  await recalculateAllAccountBalances();
  return count;
}

/**
 * Feature 6: Bulk Reassign Category
 */
export async function bulkReassignCategory(txIds: string[], newCategoryId: string): Promise<number> {
  if (txIds.length === 0) return 0;

  const now = Date.now();
  let count = 0;

  await db.transaction('rw', [db.transactions, db.audit_logs], async () => {
    for (const id of txIds) {
      const existing = await db.transactions.get(id);
      if (existing && !existing.isDeleted && existing.categoryId !== newCategoryId) {
        const updated = {
          ...existing,
          categoryId: newCategoryId,
          updatedAt: now,
          version: (existing.version || 1) + 1,
        };
        await db.transactions.put(updated);
        await recordAudit(
          'transaction',
          id,
          'update',
          `Bulk reassigned category to ${newCategoryId}`,
          existing,
          updated
        );
        count++;
      }
    }
  });

  return count;
}

/**
 * Feature 6: Bulk Reassign Account
 */
export async function bulkReassignAccount(txIds: string[], newAccountId: string): Promise<number> {
  if (txIds.length === 0) return 0;

  const now = Date.now();
  let count = 0;

  await db.transaction('rw', [db.transactions, db.accounts, db.audit_logs], async () => {
    for (const id of txIds) {
      const existing = await db.transactions.get(id);
      if (existing && !existing.isDeleted && existing.accountId !== newAccountId) {
        const updated = {
          ...existing,
          accountId: newAccountId,
          updatedAt: now,
          version: (existing.version || 1) + 1,
        };
        await db.transactions.put(updated);
        await recordAudit(
          'transaction',
          id,
          'update',
          `Bulk reassigned account to ${newAccountId}`,
          existing,
          updated
        );
        count++;
      }
    }
  });

  await recalculateAllAccountBalances();
  return count;
}

/**
 * Feature 6: Bulk Add/Remove Tags
 */
export async function bulkUpdateTags(
  txIds: string[],
  addTags: string[] = [],
  removeTags: string[] = []
): Promise<number> {
  if (txIds.length === 0) return 0;

  const now = Date.now();
  let count = 0;

  await db.transaction('rw', [db.transactions, db.audit_logs], async () => {
    for (const id of txIds) {
      const existing = await db.transactions.get(id);
      if (existing && !existing.isDeleted) {
        const currentTags = new Set(existing.tags || []);
        addTags.forEach((t) => currentTags.add(t.trim().toLowerCase()));
        removeTags.forEach((t) => currentTags.delete(t.trim().toLowerCase()));

        const updatedTags = Array.from(currentTags);
        const updated = {
          ...existing,
          tags: updatedTags,
          updatedAt: now,
          version: (existing.version || 1) + 1,
        };
        await db.transactions.put(updated);
        await recordAudit(
          'transaction',
          id,
          'update',
          `Bulk updated tags: [${updatedTags.join(', ')}]`,
          existing,
          updated
        );
        count++;
      }
    }
  });

  return count;
}
