/**
 * Quick-Add Integration Test Suite
 * Validates:
 * 1. Inline creation of Category (createCategory) with budget, color, icon, and type.
 * 2. Inline creation of Account (createAccount) with starting balance, currency, icon, fee.
 * 3. End-to-end transaction creation using exclusively newly quick-added entities without visiting Settings.
 * 4. Account balance recalculation and ledger integrity.
 * 5. Category budget tracking participation for quick-added categories.
 * 6. AI proposal updating & execution with quick-added account and category.
 * 7. Telegram inbox item confirmation with quick-added account and category.
 */

import 'fake-indexeddb/auto';
import { db, initializeDatabaseSeed } from '../src/db/database';
import { createCategory, createAccount, createTransaction } from '../src/services/ledger';
import { executeConfirmedProposal } from '../src/services/ai';
import { confirmTelegramItem } from '../src/services/telegram';
import type { ActionProposal, TelegramInboxItem, CurrencyCode } from '../src/types';

async function runQuickAddFlowTests() {
  console.log('🚀 Starting Inline Quick-Add Flow Test Suite...\n');

  // Initialize DB seed
  await initializeDatabaseSeed();

  const baseCurrency: CurrencyCode = 'IDR';

  // =========================================================================
  // Test 1: Quick Add Category inline
  // =========================================================================
  console.log('--- Test 1: Quick Add Category Inline ---');
  const initialCategoryCount = await db.categories.count();

  const quickCat = await createCategory({
    name: 'Pet Care & Supplies',
    type: 'expense',
    color: '#10b981',
    icon: 'Cat',
    monthlyLimit: 750000,
  });

  if (!quickCat.id || quickCat.name !== 'Pet Care & Supplies') {
    throw new Error('QuickAdd Category creation failed to return valid category object!');
  }

  const storedCat = await db.categories.get(quickCat.id);
  if (!storedCat || storedCat.monthlyLimit !== 750000) {
    throw new Error('QuickAdd Category was not properly persisted in db.categories!');
  }

  const afterCategoryCount = await db.categories.count();
  if (afterCategoryCount !== initialCategoryCount + 1) {
    throw new Error(`Expected category count to increase by 1, got ${afterCategoryCount - initialCategoryCount}`);
  }

  console.log(`[PASS] Quick-added category "${quickCat.name}" (ID: ${quickCat.id}, Budget: ${quickCat.monthlyLimit})`);

  // =========================================================================
  // Test 2: Quick Add Account inline
  // =========================================================================
  console.log('--- Test 2: Quick Add Account Inline ---');
  const initialAccountCount = await db.accounts.count();

  const quickAcc = await createAccount({
    name: 'Blu by BCA Digital',
    type: 'bank',
    currency: 'IDR',
    initialBalance: 5000000,
    icon: 'Landmark',
    color: '#0284c7',
    monthlyAdminFee: 0,
  });

  if (!quickAcc.id || quickAcc.name !== 'Blu by BCA Digital') {
    throw new Error('QuickAdd Account creation failed to return valid account object!');
  }

  const storedAcc = await db.accounts.get(quickAcc.id);
  if (!storedAcc || storedAcc.currentBalance !== 5000000) {
    throw new Error('QuickAdd Account was not properly persisted in db.accounts with starting balance!');
  }

  const afterAccountCount = await db.accounts.count();
  if (afterAccountCount !== initialAccountCount + 1) {
    throw new Error(`Expected account count to increase by 1, got ${afterAccountCount - initialAccountCount}`);
  }

  console.log(`[PASS] Quick-added account "${quickAcc.name}" (ID: ${quickAcc.id}, Current Balance: ${quickAcc.currentBalance})`);

  // =========================================================================
  // Test 3: End-to-end Transaction creation using only quick-added entities
  // =========================================================================
  console.log('--- Test 3: Log Transaction using purely Quick-Added Account & Category ---');
  const txAmount = 250000;
  const tx = await createTransaction({
    accountId: quickAcc.id,
    categoryId: quickCat.id,
    type: 'expense',
    amount: txAmount,
    currency: 'IDR',
    description: 'Cat Food and Litter',
    date: new Date().toISOString().split('T')[0],
  });

  if (!tx.id || tx.amount !== txAmount) {
    throw new Error('Transaction creation failed with quick-added entities!');
  }

  // Verify Account balance was recalculated
  const updatedAcc = await db.accounts.get(quickAcc.id);
  const expectedBalance = 5000000 - 250000;
  if (!updatedAcc || updatedAcc.currentBalance !== expectedBalance) {
    throw new Error(`Expected account balance ${expectedBalance}, but got ${updatedAcc?.currentBalance}`);
  }
  console.log(`[PASS] Transaction logged. Account balance updated to: ${updatedAcc.currentBalance} IDR`);

  // =========================================================================
  // Test 4: Verify Quick-Added Category in Budget Tracking
  // =========================================================================
  console.log('--- Test 4: Quick-Added Category in Budget Tracking ---');
  const categoryTxs = await db.transactions.where('categoryId').equals(quickCat.id).toArray();
  const spentSoFar = categoryTxs.reduce((sum, t) => sum + (t.type === 'expense' ? t.amount : 0), 0);
  if (spentSoFar !== 250000) {
    throw new Error(`Expected budget spent for category to be 250,000, got ${spentSoFar}`);
  }
  const remainingBudget = (quickCat.monthlyLimit || 0) - spentSoFar;
  if (remainingBudget !== 500000) {
    throw new Error(`Expected remaining budget 500,000, got ${remainingBudget}`);
  }
  console.log(`[PASS] Category budget tracked accurately: ${spentSoFar} / ${quickCat.monthlyLimit} IDR (Remaining: ${remainingBudget})`);

  // =========================================================================
  // Test 5: AI Action Proposal Execution with Quick-Added Category & Account
  // =========================================================================
  console.log('--- Test 5: AI Action Proposal Execution with Quick-Added Entities ---');
  const proposal: ActionProposal = {
    id: 'prop_test_' + Date.now(),
    type: 'create',
    status: 'pending',
    summary: 'Vet Checkup expense',
    data: {
      type: 'expense',
      amount: 150000,
      currency: 'IDR',
      accountId: quickAcc.id,
      accountName: quickAcc.name,
      categoryId: quickCat.id,
      categoryName: quickCat.name,
      description: 'Routine Vet Checkup',
      date: new Date().toISOString().split('T')[0],
      inputSource: 'chat',
    },
    createdAt: Date.now(),
  };

  const allAccounts = await db.accounts.toArray();
  const allCategories = await db.categories.toArray();

  await executeConfirmedProposal(proposal, {
    accounts: allAccounts,
    categories: allCategories,
    baseCurrency,
  });

  const accAfterAI = await db.accounts.get(quickAcc.id);
  const expectedAfterAI = 5000000 - 250000 - 150000;
  if (!accAfterAI || accAfterAI.currentBalance !== expectedAfterAI) {
    throw new Error(`Expected account balance after AI execution ${expectedAfterAI}, got ${accAfterAI?.currentBalance}`);
  }
  console.log(`[PASS] AI Proposal successfully executed with quick-added entities. New balance: ${accAfterAI.currentBalance}`);

  // =========================================================================
  // Test 6: Telegram Inbox Ingestion Confirmation with Quick-Added Entities
  // =========================================================================
  console.log('--- Test 6: Telegram Ingestion Item Confirmation with Quick-Added Entities ---');
  const telegramItem: TelegramInboxItem = {
    id: 'tg_inbox_test_' + Date.now(),
    telegramMessageId: 9999,
    chatId: 12345678,
    senderName: 'TestUser',
    type: 'text',
    rawText: 'Cat Vaccine 100k',
    receivedAt: Date.now(),
    status: 'pending',
    processedProposal: {
      id: 'tg_prop_' + Date.now(),
      type: 'create',
      status: 'pending',
      summary: 'Telegram Inbound: Cat Vaccine',
      data: {
        type: 'expense',
        amount: 100000,
        currency: 'IDR',
        accountId: quickAcc.id,
        accountName: quickAcc.name,
        categoryId: quickCat.id,
        categoryName: quickCat.name,
        description: 'Cat Vaccine',
        date: new Date().toISOString().split('T')[0],
        inputSource: 'telegram',
      },
      createdAt: Date.now(),
    },
  };

  await db.telegram_inbox.put(telegramItem);

  await confirmTelegramItem(telegramItem, {
    accounts: await db.accounts.toArray(),
    categories: await db.categories.toArray(),
    baseCurrency,
  });

  const storedTg = await db.telegram_inbox.get(telegramItem.id);
  if (!storedTg || storedTg.status !== 'processed') {
    throw new Error('Telegram inbox item was not marked as processed!');
  }

  const accAfterTelegram = await db.accounts.get(quickAcc.id);
  const expectedAfterTelegram = 5000000 - 250000 - 150000 - 100000;
  if (!accAfterTelegram || accAfterTelegram.currentBalance !== expectedAfterTelegram) {
    throw new Error(`Expected account balance after Telegram confirmation ${expectedAfterTelegram}, got ${accAfterTelegram?.currentBalance}`);
  }
  console.log(`[PASS] Telegram item confirmed and ledger updated. Final balance: ${accAfterTelegram.currentBalance}`);

  console.log('\n🎉 ALL QUICK-ADD FLOW TESTS PASSED SUCCESSFULLY! 🎉\n');
}

runQuickAddFlowTests().catch((err) => {
  console.error('❌ Quick-Add flow test suite failed:', err);
  process.exit(1);
});
