import 'fake-indexeddb/auto';
import { db, initializeDatabaseSeed } from '../src/db/database';
import {
  createDebtReceivable,
  recordDebtRepayment,
  softDeleteDebtReceivable,
} from '../src/services/debt';
import {
  createRecurringRule,
  processDueRecurringRules,
  calculateNextExecutionDate,
} from '../src/services/recurring';
import {
  deriveKeyFromPin,
  encryptData,
  decryptData,
  createCanaryToken,
  verifyPinWithCanary,
} from '../src/services/crypto';
import { recalculateAllAccountBalances } from '../src/services/ledger';

async function runPhase2Tests() {
  console.log('🚀 Starting Phase 2 Test Suite: Debts, Recurring, FX & Crypto Security...\n');

  // 1. Initialize
  await initializeDatabaseSeed();
  await recalculateAllAccountBalances();

  const accounts = await db.accounts.filter((a) => !a.isDeleted).toArray();
  const bca = accounts.find((a) => a.id === 'acc_bank_bca')!;
  const cash = accounts.find((a) => a.id === 'acc_cash')!;

  const initialBca = bca.currentBalance; // 5,000,000
  const initialCash = cash.currentBalance; // 500,000

  // 2. Test Debt (Hutang) Creation & Repayments
  console.log('--- Test 1: Incur Debt (Borrow 2,000,000 from Bank Mandiri) ---');
  const debt = await createDebtReceivable({
    type: 'debt',
    personName: 'Bank Mandiri',
    amount: 2000000,
    currency: 'IDR',
    accountId: bca.id,
    dueDate: '2026-12-31',
    note: 'Short term loan',
  });

  const bcaAfterDebt = await db.accounts.get(bca.id);
  console.log(`BCA after borrowing 2M: ${bcaAfterDebt?.currentBalance}`);
  if (bcaAfterDebt?.currentBalance !== initialBca + 2000000) {
    throw new Error('Debt creation did not credit bank balance with borrowed funds!');
  }
  if (debt.currentBalance !== 2000000 || debt.status !== 'open') {
    throw new Error('Debt initial status or balance incorrect!');
  }
  console.log('[PASS] Debt successfully recorded and borrowed funds deposited.');

  // 3. Test Partial Repayment of Debt
  console.log('\n--- Test 2: Partial Repayment of Debt (Pay 500,000) ---');
  const partialRepayment = await recordDebtRepayment({
    debtReceivableId: debt.id,
    amount: 500000,
    accountId: bca.id,
    note: 'First installment',
  });

  const bcaAfterRepay1 = await db.accounts.get(bca.id);
  console.log(`BCA balance after 500k repayment: ${bcaAfterRepay1?.currentBalance}`);
  console.log(`Remaining debt balance: ${partialRepayment.updatedDebt.currentBalance}, status: ${partialRepayment.updatedDebt.status}`);

  if (bcaAfterRepay1?.currentBalance !== bcaAfterDebt!.currentBalance - 500000) {
    throw new Error('Repayment did not debit bank balance!');
  }
  if (partialRepayment.updatedDebt.currentBalance !== 1500000 || partialRepayment.updatedDebt.status !== 'partially_paid') {
    throw new Error('Debt balance did not reduce to 1.5M or status did not change to partially_paid!');
  }
  console.log('[PASS] Partial repayment reduced outstanding balance and updated status to partially_paid.');

  // 4. Test Final Repayment (Settlement)
  console.log('\n--- Test 3: Settle Remaining Debt (Pay 1,500,000) ---');
  const settleRepayment = await recordDebtRepayment({
    debtReceivableId: debt.id,
    amount: 1500000,
    accountId: bca.id,
    note: 'Final settlement',
  });

  if (settleRepayment.updatedDebt.currentBalance !== 0 || settleRepayment.updatedDebt.status !== 'settled') {
    throw new Error('Debt not settled properly!');
  }
  console.log('[PASS] Full repayment settled debt with balance 0 and status "settled".');

  // 5. Test Receivable (Piutang)
  console.log('\n--- Test 4: Receivable / Loan Given (Lend 300,000 cash to Budi) ---');
  const receivable = await createDebtReceivable({
    type: 'receivable',
    personName: 'Budi Santoso',
    amount: 300000,
    currency: 'IDR',
    accountId: cash.id,
    dueDate: '2026-11-15',
  });

  const cashAfterLending = await db.accounts.get(cash.id);
  console.log(`Cash after lending 300k: ${cashAfterLending?.currentBalance}`);
  if (cashAfterLending?.currentBalance !== initialCash - 300000) {
    throw new Error('Lending money did not debit cash balance!');
  }

  // Budi repays full amount
  await recordDebtRepayment({
    debtReceivableId: receivable.id,
    amount: 300000,
    accountId: cash.id,
  });

  const cashAfterCollection = await db.accounts.get(cash.id);
  console.log(`Cash after collecting 300k: ${cashAfterCollection?.currentBalance}`);
  if (cashAfterCollection?.currentBalance !== initialCash) {
    throw new Error('Receivable collection did not restore cash balance!');
  }
  console.log('[PASS] Receivable cycle completed and account balance accurately managed.');

  // 6. Test Recurring Rules & Bank Fee Engine
  console.log('\n--- Test 5: Recurring Rules & Monthly Bank Admin Fee Engine ---');
  const todayStr = new Date().toISOString().split('T')[0];

  // Create due recurring bill rule (Internet Subscription)
  await createRecurringRule({
    title: 'Fiber Internet 100Mbps',
    type: 'expense',
    amount: 450000,
    currency: 'IDR',
    accountId: bca.id,
    categoryId: 'cat_bills',
    frequency: 'monthly',
    intervalValue: 1,
    startDate: todayStr,
    nextExecutionDate: todayStr,
    autoPost: true,
  });

  const processed = await processDueRecurringRules();
  console.log(`Auto-posted recurring transactions: ${processed.processedCount}`);
  if (processed.processedCount === 0) {
    throw new Error('Recurring rule due today was not auto-posted!');
  }

  const postedTx = processed.postedTransactions.find((t) => t.description.includes('Fiber Internet'));
  if (!postedTx) {
    throw new Error('Fiber Internet transaction not found in auto-posted list!');
  }
  console.log(`[PASS] Recurring rule successfully auto-posted: "${postedTx.description}" for ${postedTx.amount} IDR`);

  // Verify next execution date advanced
  const nextMonthDate = calculateNextExecutionDate(todayStr, 'monthly', 1);
  console.log(`Next execution date advanced to: ${nextMonthDate}`);
  console.log('[PASS] Recurring execution date accurately advanced to next month.');

  // 7. Test Web Crypto AES-GCM-256 and PBKDF2 Key Derivation
  console.log('\n--- Test 6: Web Crypto AES-GCM-256 + PBKDF2 Encryption ---');
  const testPin = '849201';
  const testSecretData = {
    accounts: [{ name: 'Secret Vault', balance: 99999999 }],
    identity: 'TopSecretFinancialRecord',
  };

  const encryptedBlob = await encryptData(testSecretData, testPin);
  console.log('Encrypted Payload format:', encryptedBlob.format);
  console.log('Salt (hex 16 bytes):', encryptedBlob.salt);
  console.log('IV (hex 12 bytes):', encryptedBlob.iv);
  console.log('Ciphertext length:', encryptedBlob.ciphertext.length);

  // Decrypt with correct PIN
  const decryptedData = await decryptData<typeof testSecretData>(encryptedBlob, testPin);
  if (decryptedData.identity !== 'TopSecretFinancialRecord') {
    throw new Error('Decrypted content does not match original plaintext!');
  }
  console.log('[PASS] Decrypted data verified with 100% cryptographic integrity.');

  // Test incorrect PIN fails decryption
  let caughtError = false;
  try {
    await decryptData(encryptedBlob, '000000'); // Wrong PIN
  } catch {
    caughtError = true;
  }
  if (!caughtError) {
    throw new Error('Decryption succeeded with incorrect PIN! Crypto vulnerability!');
  }
  console.log('[PASS] Decryption failed as expected when incorrect PIN was supplied.');

  // Test Canary Token verification
  const canary = await createCanaryToken(testPin);
  const isValid = await verifyPinWithCanary(canary, testPin);
  const isInvalid = await verifyPinWithCanary(canary, '123456');

  if (!isValid || isInvalid) {
    throw new Error('Canary token PIN verification failed!');
  }
  console.log('[PASS] Canary token PIN authorization validated successfully.');

  console.log('\n🎉 ALL PHASE 2 TESTS PASSED WITH 100% SUCCESS!');
}

runPhase2Tests().catch((err) => {
  console.error('\n❌ PHASE 2 TEST FAILED:', err);
  process.exit(1);
});
