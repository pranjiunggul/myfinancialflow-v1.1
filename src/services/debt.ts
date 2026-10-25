import { db, getOrCreateDeviceId } from '../db/database';
import type { DebtReceivable, DebtPayment, CurrencyCode } from '../types';
import { createTransaction, recordAudit, recalculateAllAccountBalances } from './ledger';

export async function createDebtReceivable(params: {
  type: 'debt' | 'receivable';
  personName: string;
  amount: number;
  currency: CurrencyCode;
  accountId: string;
  dueDate?: string;
  note?: string;
  date?: string;
}): Promise<DebtReceivable> {
  const deviceId = getOrCreateDeviceId();
  const id = 'dr_' + crypto.randomUUID();
  const now = Date.now();
  const txDate = params.date || new Date().toISOString().split('T')[0];

  const newRecord: DebtReceivable = {
    id,
    type: params.type,
    personName: params.personName.trim(),
    originalAmount: params.amount,
    currentBalance: params.amount,
    currency: params.currency,
    dueDate: params.dueDate || undefined,
    status: 'open',
    initialAccountId: params.accountId,
    note: params.note?.trim(),
    createdAt: now,
    updatedAt: now,
    deviceId,
    isDeleted: false,
    version: 1,
  };

  await db.transaction('rw', [db.debts_receivables, db.transactions, db.accounts, db.audit_logs], async () => {
    await db.debts_receivables.put(newRecord);

    // Create the corresponding initial ledger transaction
    // Debt = borrowing money -> cash inflow (+amount) to account
    // Receivable = lending money -> cash outflow (-amount) from account
    const txDescription =
      params.type === 'debt'
        ? `Borrowed funds from ${params.personName}`
        : `Lent funds to ${params.personName}`;

    await createTransaction({
      type: params.type,
      amount: params.amount,
      currency: params.currency,
      exchangeRateToBase: 1.0,
      baseAmount: params.amount,
      accountId: params.accountId,
      categoryId: 'cat_debt_loan',
      date: txDate,
      timestamp: now,
      description: txDescription,
      debtReceivableId: id,
      inputSource: 'manual',
    });

    await recordAudit(
      'debt',
      id,
      'create',
      `Created ${params.type}: ${params.amount} ${params.currency} with ${params.personName}`,
      undefined,
      newRecord
    );
  });

  await recalculateAllAccountBalances();
  return newRecord;
}

export async function recordDebtRepayment(params: {
  debtReceivableId: string;
  amount: number;
  accountId: string;
  date?: string;
  note?: string;
}): Promise<{ payment: DebtPayment; updatedDebt: DebtReceivable }> {
  const debt = await db.debts_receivables.get(params.debtReceivableId);
  if (!debt) throw new Error('Debt/Receivable record not found');
  if (debt.isDeleted) throw new Error('Cannot repay a deleted record');

  const paymentId = 'pay_' + crypto.randomUUID();
  const txDate = params.date || new Date().toISOString().split('T')[0];
  const now = Date.now();

  const newBalance = Math.max(0, debt.currentBalance - params.amount);
  const newStatus: DebtReceivable['status'] =
    newBalance === 0 ? 'settled' : 'partially_paid';

  let paymentRecord!: DebtPayment;
  let updatedDebt!: DebtReceivable;

  await db.transaction('rw', [db.debts_receivables, db.debt_payments, db.transactions, db.accounts, db.audit_logs], async () => {
    // 1. Create repayment transaction
    // Repaying debt -> cash outflow (-amount)
    // Collecting receivable repayment -> cash inflow (+amount)
    const txDescription =
      debt.type === 'debt'
        ? `Repayment to ${debt.personName}`
        : `Received repayment from ${debt.personName}`;

    const tx = await createTransaction({
      type: debt.type,
      amount: params.amount,
      currency: debt.currency,
      exchangeRateToBase: 1.0,
      baseAmount: params.amount,
      accountId: params.accountId,
      categoryId: 'cat_debt_loan',
      date: txDate,
      timestamp: now,
      description: txDescription,
      debtReceivableId: debt.id,
      debtRepaymentType: 'principal',
      inputSource: 'manual',
    });

    // 2. Record payment linkage
    paymentRecord = {
      id: paymentId,
      debtReceivableId: debt.id,
      transactionId: tx.id,
      amount: params.amount,
      date: txDate,
      note: params.note,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
    };
    await db.debt_payments.put(paymentRecord);

    // 3. Update debt record
    updatedDebt = {
      ...debt,
      currentBalance: newBalance,
      status: newStatus,
      updatedAt: now,
      version: (debt.version || 1) + 1,
    };
    await db.debts_receivables.put(updatedDebt);

    await recordAudit(
      'debt',
      debt.id,
      'update',
      `Repayment of ${params.amount} ${debt.currency} for ${debt.personName}. Remaining: ${newBalance}`,
      debt,
      updatedDebt
    );
  });

  await recalculateAllAccountBalances();
  return { payment: paymentRecord, updatedDebt };
}

export async function softDeleteDebtReceivable(id: string): Promise<void> {
  const debt = await db.debts_receivables.get(id);
  if (!debt) return;

  await db.transaction('rw', [db.debts_receivables, db.transactions, db.debt_payments, db.audit_logs], async () => {
    await db.debts_receivables.update(id, { isDeleted: true, updatedAt: Date.now() });

    // Also soft-delete all linked transactions so balances reverse cleanly!
    const linkedTxs = await db.transactions.where('debtReceivableId').equals(id).toArray();
    for (const tx of linkedTxs) {
      await db.transactions.update(tx.id, { isDeleted: true, updatedAt: Date.now() });
    }

    await recordAudit('debt', id, 'soft_delete', `Soft deleted ${debt.type} ${debt.personName}`, debt);
  });

  await recalculateAllAccountBalances();
}
