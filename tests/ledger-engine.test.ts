import 'fake-indexeddb/auto';
import { db, initializeDatabaseSeed } from '../src/db/database';
import {
  createAccount,
  createCategory,
  createTransaction,
  updateTransaction,
  softDeleteTransaction,
  restoreTransaction,
  softDeleteCategory,
  recalculateAllAccountBalances,
} from '../src/services/ledger';

async function runLedgerTests() {
  console.log('🚀 Starting Financial Ledger Test Suite...\n');

  // 1. Initialize Seed Data
  await initializeDatabaseSeed();
  await recalculateAllAccountBalances();

  const accounts = await db.accounts.filter((a) => !a.isDeleted).toArray();
  console.log(`[PASS] Initialized seed data with ${accounts.length} default accounts.`);

  const bcaAccount = accounts.find((a) => a.id === 'acc_bank_bca');
  const cashAccount = accounts.find((a) => a.id === 'acc_cash');
  const paypalAccount = accounts.find((a) => a.id === 'acc_paypal_usd');

  if (!bcaAccount || !cashAccount || !paypalAccount) {
    throw new Error('Seed accounts missing!');
  }

  const initialBcaBalance = bcaAccount.currentBalance; // 5,000,000
  const initialCashBalance = cashAccount.currentBalance; // 500,000
  console.log(`Initial BCA Balance: ${initialBcaBalance}, Cash: ${initialCashBalance}`);

  // 2. Test Income Transaction
  console.log('\n--- Test 1: Record Salary Income ---');
  const salaryTx = await createTransaction({
    type: 'income',
    amount: 10000000,
    currency: 'IDR',
    exchangeRateToBase: 1.0,
    baseAmount: 10000000,
    accountId: bcaAccount.id,
    categoryId: 'cat_salary',
    date: '2026-10-23',
    timestamp: Date.now(),
    description: 'Monthly Salary',
    inputSource: 'manual',
  });

  const bcaAfterSalary = await db.accounts.get(bcaAccount.id);
  console.log(`BCA after 10M income: ${bcaAfterSalary?.currentBalance}`);
  if (bcaAfterSalary?.currentBalance !== initialBcaBalance + 10000000) {
    throw new Error('Income balance calculation mismatch!');
  }
  console.log('[PASS] Income successfully credited account balance.');

  // 3. Test Expense Transaction
  console.log('\n--- Test 2: Record Grocery Expense ---');
  const expenseTx = await createTransaction({
    type: 'expense',
    amount: 250000,
    currency: 'IDR',
    exchangeRateToBase: 1.0,
    baseAmount: 250000,
    accountId: cashAccount.id,
    categoryId: 'cat_groceries',
    date: '2026-10-23',
    timestamp: Date.now(),
    description: 'Weekly Groceries',
    inputSource: 'manual',
  });

  const cashAfterExpense = await db.accounts.get(cashAccount.id);
  console.log(`Cash after 250k expense: ${cashAfterExpense?.currentBalance}`);
  if (cashAfterExpense?.currentBalance !== initialCashBalance - 250000) {
    throw new Error('Expense balance calculation mismatch!');
  }
  console.log('[PASS] Expense successfully debited account balance.');

  // 4. Test Atomic Account Transfer with Fee
  console.log('\n--- Test 3: Account Transfer with Bank Fee (BCA -> Cash: 1M + 2.5k fee) ---');
  const transferTx = await createTransaction({
    type: 'transfer',
    amount: 1000000,
    currency: 'IDR',
    exchangeRateToBase: 1.0,
    baseAmount: 1000000,
    accountId: bcaAccount.id,
    categoryId: 'cat_transfer',
    date: '2026-10-23',
    timestamp: Date.now(),
    description: 'ATM Cash Withdrawal with inter-bank fee',
    transferMeta: {
      toAccountId: cashAccount.id,
      toAmount: 1000000,
      toCurrency: 'IDR',
      feeAmount: 2500, // Fee deducted from source BCA
      feeCategoryId: 'cat_fees',
    },
    inputSource: 'manual',
  });

  const bcaAfterTransfer = await db.accounts.get(bcaAccount.id);
  const cashAfterTransfer = await db.accounts.get(cashAccount.id);

  console.log(`BCA balance after transfer: ${bcaAfterTransfer?.currentBalance}`);
  console.log(`Cash balance after transfer: ${cashAfterTransfer?.currentBalance}`);

  const expectedBca = bcaAfterSalary!.currentBalance - 1000000 - 2500;
  const expectedCash = cashAfterExpense!.currentBalance + 1000000;

  if (bcaAfterTransfer?.currentBalance !== expectedBca) {
    throw new Error(`Transfer source deduction failed. Expected ${expectedBca}, got ${bcaAfterTransfer?.currentBalance}`);
  }
  if (cashAfterTransfer?.currentBalance !== expectedCash) {
    throw new Error(`Transfer destination credit failed. Expected ${expectedCash}, got ${cashAfterTransfer?.currentBalance}`);
  }
  console.log('[PASS] Atomic transfer correctly debited source + fee and credited destination.');

  // 5. Test Soft-Delete and Balance Reversal
  console.log('\n--- Test 4: Soft-delete Transfer & Verify Balance Reversal ---');
  await softDeleteTransaction(transferTx.id);

  const bcaAfterDelete = await db.accounts.get(bcaAccount.id);
  const cashAfterDelete = await db.accounts.get(cashAccount.id);

  console.log(`BCA balance after transfer soft-delete: ${bcaAfterDelete?.currentBalance}`);
  console.log(`Cash balance after transfer soft-delete: ${cashAfterDelete?.currentBalance}`);

  if (bcaAfterDelete?.currentBalance !== bcaAfterSalary!.currentBalance) {
    throw new Error('Balance was not restored to BCA after deleting transfer!');
  }
  if (cashAfterDelete?.currentBalance !== cashAfterExpense!.currentBalance) {
    throw new Error('Balance was not reversed from Cash after deleting transfer!');
  }
  console.log('[PASS] Soft-delete reversed all account balances accurately.');

  // 6. Test Restoring Transaction
  console.log('\n--- Test 5: Restore Transfer from Trash ---');
  await restoreTransaction(transferTx.id);

  const bcaAfterRestore = await db.accounts.get(bcaAccount.id);
  if (bcaAfterRestore?.currentBalance !== expectedBca) {
    throw new Error('Balance was not re-applied after restoring transfer!');
  }
  console.log('[PASS] Restoring transaction re-applied balances accurately.');

  // 7. Test Category Deletion Protection & Reassignment
  console.log('\n--- Test 6: Category Deletion Protection & Reassignment ---');
  const deleteWithoutReassign = await softDeleteCategory('cat_groceries');
  if (deleteWithoutReassign.success) {
    throw new Error('Category with active transactions should not delete without reassignment!');
  }
  console.log(`[PASS] Blocked deletion correctly: "${deleteWithoutReassign.message}"`);

  // Reassign to Food & Dining
  const deleteWithReassign = await softDeleteCategory('cat_groceries', 'cat_food');
  if (!deleteWithReassign.success) {
    throw new Error('Failed to delete category with valid reassignment!');
  }

  const updatedExpenseTx = await db.transactions.get(expenseTx.id);
  if (updatedExpenseTx?.categoryId !== 'cat_food') {
    throw new Error('Linked transaction was not reassigned to new category!');
  }
  console.log('[PASS] Successfully reassigned transaction to replacement category.');

  // 8. Test Audit Trail
  console.log('\n--- Test 7: Verify Audit Log Trail ---');
  const auditLogs = await db.audit_logs.toArray();
  console.log(`Total Audit Log Entries: ${auditLogs.length}`);
  if (auditLogs.length < 5) {
    throw new Error('Audit trail did not capture all operations!');
  }
  console.log('[PASS] Full change audit trail recorded successfully.');

  console.log('\n🎉 ALL FINANCIAL LEDGER TESTS PASSED WITH 100% SUCCESS!');
}

runLedgerTests().catch((err) => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
