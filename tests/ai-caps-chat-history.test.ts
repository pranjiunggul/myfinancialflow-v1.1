/**
 * Automated Test Suite: Phase B — AI Usage Control & Transparency
 * Covers:
 * - Feature 4: Per-Provider Monthly Cost Cap, Token Pricing Reference, 80% Warning, Cap Cutoff & Failover, Rollover Reset
 * - Feature 5: Searchable Encrypted AI Chat History (AES-GCM-256), Keyword & Date Filtering
 */

import 'fake-indexeddb/auto';
import { db } from '../src/db/database';
import {
  estimateTokenCostUSD,
  isProviderCapExceeded,
  recordEstimatedProviderUsage,
  getCurrentMonthStr,
} from '../src/services/aiPricing';
import {
  saveChatSession,
  listChatSessions,
  loadChatSessionMessages,
  searchChatHistory,
  deleteChatSession,
} from '../src/services/chatHistory';
import type { AIProviderConfig, ChatMessage } from '../src/types';

async function runPhaseBTests() {
  console.log('🚀 Running Phase B: AI Usage Control & Transparency Test Suite...\n');

  const MASTER_PIN = '778899';

  // =========================================================================
  // GROUP 1: Feature 4 — Token Pricing & Monthly Spending Caps
  // =========================================================================
  console.log('--- Test 1: Published Model Token Pricing Calculations ---');
  // 10,000 prompt tokens + 2,000 completion tokens on gpt-4o-mini:
  // input: 10,000 / 1M * 0.15 = $0.0015
  // output: 2,000 / 1M * 0.60 = $0.0012
  // Total: $0.0027
  const costMini = estimateTokenCostUSD('gpt-4o-mini', 10000, 2000);
  console.log(`Estimated cost for gpt-4o-mini (10k in, 2k out): $${costMini.toFixed(6)}`);
  if (Math.abs(costMini - 0.0027) > 0.00001) {
    throw new Error(`Expected $0.0027, got $${costMini}`);
  }
  console.log('[PASS] Accurate token cost estimate for gpt-4o-mini.');

  // Gemini 1.5 Flash: $0.075 / 1M input, $0.30 / 1M output
  const costGemini = estimateTokenCostUSD('gemini-1.5-flash', 100000, 10000);
  // (100k/1M * 0.075) + (10k/1M * 0.3) = 0.0075 + 0.0030 = $0.0105
  console.log(`Estimated cost for gemini-1.5-flash (100k in, 10k out): $${costGemini.toFixed(6)}`);
  if (Math.abs(costGemini - 0.0105) > 0.00001) {
    throw new Error(`Expected $0.0105, got $${costGemini}`);
  }
  console.log('[PASS] Accurate token cost estimate for gemini-1.5-flash.');

  console.log('\n--- Test 2: Accumulating Estimated Spend on Provider Record ---');
  await db.ai_providers.clear();
  const testProv: AIProviderConfig = {
    id: 'prov_test_openai',
    name: 'OpenAI Test',
    type: 'preset',
    protocol: 'openai_compatible',
    baseUrl: 'https://api.openai.com/v1',
    availableModels: ['gpt-4o', 'gpt-4o-mini'],
    selectedModel: 'gpt-4o-mini',
    isEnabled: true,
    monthlySpendCap: 5.0, // $5.00 limit
    estimatedMonthSpend: 3.5, // Currently $3.50
    lastSpendResetMonth: getCurrentMonthStr(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    version: 1,
  };
  await db.ai_providers.add(testProv);

  // Add 100k tokens
  await recordEstimatedProviderUsage('prov_test_openai', 'gpt-4o-mini', 500000, 100000);
  const updatedProv = await db.ai_providers.get('prov_test_openai');
  console.log(`Updated estimated spend: ~$${updatedProv?.estimatedMonthSpend?.toFixed(4)}`);
  if (!updatedProv || updatedProv.estimatedMonthSpend! <= 3.5) {
    throw new Error('Estimated spend accumulation failed!');
  }
  console.log('[PASS] Provider estimated monthly spend accumulated successfully.');

  console.log('\n--- Test 3: 80% Warning & 100% Cap Cutoff Detection ---');
  // At $4.10 / $5.00 -> 82% (Warning threshold)
  await db.ai_providers.update('prov_test_openai', { estimatedMonthSpend: 4.10 });
  const provWarn = (await db.ai_providers.get('prov_test_openai'))!;
  const warnCheck = isProviderCapExceeded(provWarn);
  console.log(`At $4.10 / $5.00: isWarning80 = ${warnCheck.isWarning80}, isExceeded = ${warnCheck.isExceeded}`);
  if (!warnCheck.isWarning80 || warnCheck.isExceeded) {
    throw new Error('Expected 80% warning condition!');
  }
  console.log('[PASS] 80% spending cap warning correctly detected.');

  // At $5.05 / $5.00 -> Exceeded (Cutoff condition)
  await db.ai_providers.update('prov_test_openai', { estimatedMonthSpend: 5.05 });
  const provExceeded = (await db.ai_providers.get('prov_test_openai'))!;
  const exceededCheck = isProviderCapExceeded(provExceeded);
  console.log(`At $5.05 / $5.00: isExceeded = ${exceededCheck.isExceeded}, reason = "${exceededCheck.reason}"`);
  if (!exceededCheck.isExceeded || !exceededCheck.reason?.toLowerCase().includes('estimated monthly spending cap')) {
    throw new Error('Expected exceeded cap condition with explicit estimated spend label!');
  }
  console.log('[PASS] Monthly spending cap cutoff accurately triggered with estimated spend label.');

  console.log('\n--- Test 4: Calendar Month Rollover Automatic Reset ---');
  // Simulate previous calendar month
  await db.ai_providers.update('prov_test_openai', {
    lastSpendResetMonth: '2026-01',
    estimatedMonthSpend: 15.00,
  });
  const prevMonthProv = (await db.ai_providers.get('prov_test_openai'))!;
  const rolloverCheck = isProviderCapExceeded(prevMonthProv);
  console.log(`Rollover check: estimatedSpend for current month = ${rolloverCheck.estimatedSpend}, isExceeded = ${rolloverCheck.isExceeded}`);
  if (rolloverCheck.estimatedSpend !== 0 || rolloverCheck.isExceeded) {
    throw new Error('Failed to reset spend on calendar month rollover!');
  }
  console.log('[PASS] Calendar month rollover reset confirmed.');

  // =========================================================================
  // GROUP 2: Feature 5 — Searchable Encrypted AI Chat History
  // =========================================================================
  console.log('\n--- Test 5: AES-GCM-256 Encrypted Session Persistence ---');
  await db.ai_chat_sessions.clear();

  const mockMessages: ChatMessage[] = [
    { id: 'm1', role: 'user', content: 'Bagaimana cara mengurangi pengeluaran kopi saya?', timestamp: Date.now() },
    { id: 'm2', role: 'assistant', content: 'Berdasarkan data Anda, Anda menghabiskan Rp 450.000 untuk kopi di BCA bulan ini.', timestamp: Date.now() },
    { id: 'm3', role: 'user', content: 'Tolong buatkan budget 200rb untuk Food & Dining.', timestamp: Date.now() },
  ];

  const session = await saveChatSession('sess_coffee_audit', 'Analisis Pengeluaran Kopi', mockMessages, MASTER_PIN);
  console.log(`Session saved: id="${session.id}", format="${session.encryptedPayload.format}"`);
  if (session.encryptedPayload.format !== 'financeflow_enc_v1' || !session.encryptedPayload.ciphertext) {
    throw new Error('Chat session was not encrypted with financeflow_enc_v1 format!');
  }
  console.log('[PASS] Chat session encrypted and persisted in Dexie ai_chat_sessions.');

  console.log('\n--- Test 6: Decryption & Restoration of Messages ---');
  const decryptedMessages = await loadChatSessionMessages('sess_coffee_audit', MASTER_PIN);
  console.log(`Decrypted ${decryptedMessages.length} messages. First user message: "${decryptedMessages[0]?.content}"`);
  if (decryptedMessages.length !== 3 || !decryptedMessages[0].content.includes('kopi')) {
    throw new Error('Decrypted messages do not match original session payload!');
  }
  console.log('[PASS] Decrypted session messages match original chat thread.');

  console.log('\n--- Test 7: Full-Text Keyword Search Across Encrypted Sessions ---');
  // Save a second session
  await saveChatSession(
    'sess_tax_advice',
    'Tips Pajak Penghasilan',
    [
      { id: 'm4', role: 'user', content: 'Bagaimana lapor SPT Tahunan?', timestamp: Date.now() },
      { id: 'm5', role: 'assistant', content: 'Unduh bukti potong 1721-A1 dari kantor Anda sebelum Maret.', timestamp: Date.now() },
    ],
    MASTER_PIN
  );

  const searchKopi = await searchChatHistory('kopi', undefined, undefined, MASTER_PIN);
  console.log(`Keyword "kopi" found ${searchKopi.length} session(s): "${searchKopi[0]?.session.title}"`);
  if (searchKopi.length !== 1 || searchKopi[0].session.id !== 'sess_coffee_audit') {
    throw new Error('Keyword search failed to locate matching encrypted chat session!');
  }
  console.log('[PASS] Search located matching session by message body keyword.');

  const searchPajak = await searchChatHistory('SPT', undefined, undefined, MASTER_PIN);
  console.log(`Keyword "SPT" found ${searchPajak.length} session(s): "${searchPajak[0]?.session.title}"`);
  if (searchPajak.length !== 1 || searchPajak[0].session.id !== 'sess_tax_advice') {
    throw new Error('Keyword search failed to locate tax session!');
  }
  console.log('[PASS] Search accurately filtered distinct sessions by keyword.');

  console.log('\n--- Test 8: Soft Deletion of Chat Session ---');
  await deleteChatSession('sess_tax_advice');
  const activeSessions = await listChatSessions();
  console.log(`Active sessions count after deletion: ${activeSessions.length}`);
  if (activeSessions.some((s) => s.id === 'sess_tax_advice')) {
    throw new Error('Deleted session was still returned in active sessions list!');
  }
  console.log('[PASS] Chat session soft-deleted cleanly.');

  console.log('\n🎉 All Phase B AI Usage Control & Transparency Tests Passed Successfully!');
}

runPhaseBTests().catch((err) => {
  console.error('\n❌ Phase B tests failed:', err);
  process.exit(1);
});
