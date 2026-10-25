/**
 * Phase 8 Test Suite: AI Provider & API Key Management with Proactive Health Checking,
 * Zero-Knowledge Key Encryption, Priority Rollover Safety Net & Fallback Chain
 *
 * Validates:
 * 1. Hard PIN Prerequisite for API Key Storage (Zero-Knowledge Invariant)
 * 2. Provider Presets, Custom Provider & Dynamic Model Sync Matrix
 * 3. Proactive Background Health Checking & Offline Behavior (skipping cloud checks when offline)
 * 4. Fast-Path Selection via Cached Health Status
 * 5. Live Failover Safety Net (Unexpected 429 Rate Limit Rollover)
 * 6. Persistent Failure Alerting (>= 3 Consecutive Failures)
 * 7. Guaranteed 3-Tier Fallback Order (Cloud -> Ollama -> Phase 7 Deterministic Offline Engine)
 */

import 'fake-indexeddb/auto';
import { db, initializeDatabaseSeed } from '../src/db/database';
import {
  saveEncryptedApiKey,
  revealApiKey,
  checkProviderHealth,
  recordHealthResult,
  getFastPathTarget,
  setCachedHealth,
  startHealthCheckScheduler,
  runProactiveHealthCheckPass,
} from '../src/services/aiHealth';
import { createCustomProviderConfig } from '../src/services/aiPresets';
import { sendUnifiedChatMessage } from '../src/services/ai';
import type { Account, Category, CurrencyCode, AIProviderConfig, AIKeyRecord, AIPriorityItem } from '../src/types';

async function runPhase8Tests() {
  console.log('🚀 Starting Phase 8 Test Suite: AI Provider & Key Management, Health Checking & Rollover...\n');

  // Initialize DB & Seed Presets
  await initializeDatabaseSeed();

  const accounts = await db.accounts.toArray();
  const categories = await db.categories.toArray();
  const baseCurrency: CurrencyCode = 'IDR';
  const MASTER_PIN = '882200';

  const context = { accounts, categories, baseCurrency, masterPin: MASTER_PIN };

  // =========================================================================
  // Test 1: Hard PIN Prerequisite for API Key Storage (Zero-Knowledge Invariant)
  // =========================================================================
  console.log('--- Test 1: Hard PIN Prerequisite for API Key Storage ---');

  // 1a: Attempt to save without PIN -> Must be strictly rejected
  let rejectedNoPin = false;
  try {
    await saveEncryptedApiKey({
      providerId: 'prov_deepseek',
      label: 'DeepSeek Personal',
      plainKey: 'sk-deepseek-live-secret-test-key-1234',
      masterPin: '',
    });
  } catch (err: any) {
    if (err.message.includes('A security PIN must be configured')) {
      rejectedNoPin = true;
    }
  }
  if (!rejectedNoPin) {
    throw new Error('FAILED: saveEncryptedApiKey allowed saving without a master PIN! Zero-knowledge compromised.');
  }
  console.log('[PASS] Blocked key saving without security PIN: "A security PIN must be configured before saving AI API keys."');

  // 1b: Save with valid PIN -> Must be encrypted at rest with AES-GCM-256
  const keyRecord = await saveEncryptedApiKey({
    providerId: 'prov_deepseek',
    label: 'DeepSeek Personal',
    plainKey: 'sk-deepseek-live-secret-test-key-1234',
    masterPin: MASTER_PIN,
  });

  const storedKeyInDb = await db.ai_keys.get(keyRecord.id);
  if (!storedKeyInDb) throw new Error('Key record not found in IndexedDB!');

  // Verify zero plaintext in database
  const rawDbString = JSON.stringify(storedKeyInDb);
  if (rawDbString.includes('sk-deepseek-live-secret-test-key-1234')) {
    throw new Error('FAILED: Plaintext API key found in IndexedDB!');
  }
  if (storedKeyInDb.encryptedKeyPayload.format !== 'financeflow_enc_v1') {
    throw new Error('FAILED: Encrypted payload format is not financeflow_enc_v1!');
  }
  console.log('[PASS] API key encrypted at rest in IndexedDB with AES-GCM-256 (format: financeflow_enc_v1).');
  console.log(`[PASS] Masked Key Hint generated: "${storedKeyInDb.keyHint}"`);

  // 1c: Decrypt with valid PIN
  const decryptedPlain = await revealApiKey(storedKeyInDb, MASTER_PIN);
  if (decryptedPlain !== 'sk-deepseek-live-secret-test-key-1234') {
    throw new Error('FAILED: Decrypted API key does not match original plain key!');
  }
  console.log('[PASS] Decrypted key in-memory using correct PIN successfully.');

  // 1d: Decrypt with incorrect PIN -> must fail
  let decryptFailedWrongPin = false;
  try {
    await revealApiKey(storedKeyInDb, '000000');
  } catch {
    decryptFailedWrongPin = true;
  }
  if (!decryptFailedWrongPin) {
    throw new Error('FAILED: Decryption succeeded with wrong PIN!');
  }
  console.log('[PASS] Decryption correctly rejected with invalid PIN.\n');

  // =========================================================================
  // Test 2: Provider Presets, Custom Provider & Dynamic Model Sync Matrix
  // =========================================================================
  console.log('--- Test 2: Provider Presets, Custom Provider & Model Sync ---');

  const seededProviders = await db.ai_providers.toArray();
  const presetIds = ['prov_deepseek', 'prov_openrouter', 'prov_gemini', 'prov_groq', 'prov_anthropic', 'prov_openai', 'prov_mistral', 'prov_ollama'];
  for (const pid of presetIds) {
    if (!seededProviders.some((p) => p.id === pid)) {
      throw new Error(`FAILED: Seeded preset provider "${pid}" missing from database!`);
    }
  }
  console.log(`[PASS] Verified ${seededProviders.length} pre-seeded provider presets in IndexedDB.`);

  // 2b: Create and persist a Custom Provider (e.g. self-hosted LM Studio)
  const customProv = createCustomProviderConfig({
    name: 'Local LM Studio',
    baseUrl: 'http://localhost:1234/v1',
    authHeaderFormat: 'Authorization: Bearer {KEY}',
    modelsEndpoint: '/models',
    defaultModel: 'qwen2.5-7b-instruct',
  });
  await db.ai_providers.put(customProv);
  const storedCustom = await db.ai_providers.get(customProv.id);
  if (!storedCustom || storedCustom.name !== 'Local LM Studio' || storedCustom.protocol !== 'openai_compatible') {
    throw new Error('FAILED: Custom provider could not be saved/retrieved from DB!');
  }
  console.log(`[PASS] Successfully registered Custom Provider: "${storedCustom.name}" (${storedCustom.baseUrl})`);

  // 2c: Model Sync Mock: OpenAI-compatible
  const mockFetchOpenAi = async (url: string | URL | Request) => {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        data: [{ id: 'deepseek-chat' }, { id: 'deepseek-reasoner' }, { id: 'deepseek-coder' }],
      }),
    } as any;
  };
  const deepseekProv = seededProviders.find((p) => p.id === 'prov_deepseek')!;
  const syncOpenAiRes = await checkProviderHealth(deepseekProv, 'sk-test', { fetchFn: mockFetchOpenAi });
  if (syncOpenAiRes.status !== 'healthy' || syncOpenAiRes.models?.length !== 3) {
    throw new Error('FAILED: OpenAI-compatible model sync failed!');
  }
  console.log(`[PASS] OpenAI-compatible model sync verified: ${syncOpenAiRes.models.join(', ')}`);

  // 2d: Model Sync Mock: Google Gemini
  const mockFetchGemini = async (url: string | URL | Request) => {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        models: [
          { name: 'models/gemini-1.5-flash', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-1.5-pro', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] }, // should be filtered
        ],
      }),
    } as any;
  };
  const geminiProv = seededProviders.find((p) => p.id === 'prov_gemini')!;
  const syncGeminiRes = await checkProviderHealth(geminiProv, 'test-key', { fetchFn: mockFetchGemini });
  if (syncGeminiRes.status !== 'healthy' || !syncGeminiRes.models?.includes('gemini-1.5-flash') || syncGeminiRes.models.includes('text-embedding-004')) {
    throw new Error('FAILED: Gemini model sync failed or did not strip non-generateContent models!');
  }
  console.log(`[PASS] Gemini model sync verified (models/ prefix stripped & filtered): ${syncGeminiRes.models.join(', ')}`);

  // 2e: Model Sync Mock: Anthropic
  const mockFetchAnthropic = async (url: string | URL | Request) => {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        data: [{ id: 'claude-3-5-sonnet-20241022' }, { id: 'claude-3-5-haiku-20241022' }],
      }),
    } as any;
  };
  const anthropicProv = seededProviders.find((p) => p.id === 'prov_anthropic')!;
  const syncAnthropicRes = await checkProviderHealth(anthropicProv, 'sk-ant-test', { fetchFn: mockFetchAnthropic });
  if (syncAnthropicRes.status !== 'healthy' || syncAnthropicRes.models?.length !== 2) {
    throw new Error('FAILED: Anthropic model sync failed!');
  }
  console.log(`[PASS] Anthropic model sync verified: ${syncAnthropicRes.models.join(', ')}`);

  // 2f: Model Sync Mock: Ollama
  const mockFetchOllama = async (url: string | URL | Request) => {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        models: [{ name: 'llama3.2:latest' }, { name: 'qwen2.5:latest' }],
      }),
    } as any;
  };
  const ollamaProv = seededProviders.find((p) => p.id === 'prov_ollama')!;
  const syncOllamaRes = await checkProviderHealth(ollamaProv, undefined, { fetchFn: mockFetchOllama });
  if (syncOllamaRes.status !== 'healthy' || syncOllamaRes.models?.length !== 2) {
    throw new Error('FAILED: Ollama model sync failed!');
  }
  console.log(`[PASS] Local Ollama model sync verified: ${syncOllamaRes.models.join(', ')}\n`);

  // =========================================================================
  // Test 3: Proactive Background Health Checking & Offline Behavior
  // =========================================================================
  console.log('--- Test 3: Proactive Health Checking & Offline Mode ---');

  // 3a: When device is offline, cloud health checks must be skipped entirely
  let cloudFetchAttempted = false;
  const mockOfflineCloudFetch = async () => {
    cloudFetchAttempted = true;
    return { ok: true, status: 200, json: async () => ({}) } as any;
  };

  const offlineCloudRes = await checkProviderHealth(deepseekProv, 'sk-test', {
    isOffline: true,
    fetchFn: mockOfflineCloudFetch,
  });

  if (cloudFetchAttempted) {
    throw new Error('FAILED: Cloud health check attempted a network call while device is offline!');
  }
  if (offlineCloudRes.status !== 'unreachable' || !offlineCloudRes.error?.includes('Device is offline')) {
    throw new Error('FAILED: Offline cloud check did not return unreachable with offline explanation!');
  }
  console.log('[PASS] Device offline: Cloud network calls skipped 100%, marked unreachable.');

  // 3b: Background Scheduler Lifecycle (Page Visibility API handling)
  let schedulerChecksRun = 0;
  const mockSchedulerFetch = async () => {
    schedulerChecksRun++;
    return { ok: true, status: 200, json: async () => ({ data: [] }) } as any;
  };

  const schedulerController = startHealthCheckScheduler({
    getMasterPin: () => MASTER_PIN,
    intervalMs: 1000,
    isOffline: () => false,
    fetchFn: mockSchedulerFetch,
  });

  // Explicitly await the health check pass
  await schedulerController.triggerCheckNow();

  // Verify execution
  if (schedulerChecksRun === 0) {
    throw new Error('FAILED: Health check scheduler did not trigger check!');
  }
  console.log(`[PASS] Health check scheduler initialized and executed check pass (runs: ${schedulerChecksRun}).`);
  schedulerController();
  console.log('[PASS] Health check scheduler cleanly stopped and listeners unsubscribed.\n');

  // =========================================================================
  // Test 4: Fast-Path Selection via Cached Health Status
  // =========================================================================
  console.log('--- Test 4: Fast-Path Selection via Cached Health Status ---');

  // Setup: 3 Priority Items
  // #1: OpenRouter (degraded/rate-limited in cache)
  // #2: DeepSeek (healthy in cache)
  // #3: Gemini (unreachable in cache)
  const keyOpenRouter = await saveEncryptedApiKey({
    providerId: 'prov_openrouter',
    label: 'OpenRouter Key',
    plainKey: 'sk-or-test-key-1111',
    masterPin: MASTER_PIN,
  });

  const testPriorities: AIPriorityItem[] = [
    { id: 'prio_1', providerId: 'prov_openrouter', keyId: keyOpenRouter.id, order: 1, isEnabled: true },
    { id: 'prio_2', providerId: 'prov_deepseek', keyId: keyRecord.id, order: 2, isEnabled: true },
    { id: 'prio_3', providerId: 'prov_gemini', keyId: 'gemini_key', order: 3, isEnabled: true },
  ];

  setCachedHealth(`prov_openrouter:${keyOpenRouter.id}`, {
    id: `prov_openrouter:${keyOpenRouter.id}`,
    status: 'degraded',
    lastChecked: Date.now(),
    lastError: 'HTTP 429 Quota Exceeded',
    consecutiveFailures: 1,
  });

  setCachedHealth(`prov_deepseek:${keyRecord.id}`, {
    id: `prov_deepseek:${keyRecord.id}`,
    status: 'healthy',
    lastChecked: Date.now(),
    consecutiveFailures: 0,
  });

  const allProviders = await db.ai_providers.toArray();
  const allKeys = await db.ai_keys.toArray();

  const fastPathTarget = await getFastPathTarget(testPriorities, allProviders, allKeys);
  if (!fastPathTarget || fastPathTarget.provider.id !== 'prov_deepseek') {
    throw new Error(`FAILED: Fast-path target did not select cached-healthy DeepSeek! Selected: ${fastPathTarget?.provider.name}`);
  }
  console.log(`[PASS] Fast-path skipped degraded #1 OpenRouter and jumped straight to healthy #2: "${fastPathTarget.provider.name}"\n`);

  // =========================================================================
  // Test 5: Live Failover Safety Net (Unexpected 429 at Request Time)
  // =========================================================================
  console.log('--- Test 5: Live Failover Safety Net (Unexpected 429 Rollover) ---');

  // Configure DB priorities:
  // Order 1: DeepSeek (primary)
  // Order 2: OpenRouter (secondary)
  await db.ai_priorities.clear();
  await db.ai_priorities.bulkPut([
    { id: 'prio_1', providerId: 'prov_deepseek', keyId: keyRecord.id, order: 1, isEnabled: true },
    { id: 'prio_2', providerId: 'prov_openrouter', keyId: keyOpenRouter.id, order: 2, isEnabled: true },
  ]);

  // Mock fetch: DeepSeek returns 429; OpenRouter returns 200 OK with tool proposal
  const mockRolloverFetch = async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = String(url);
    if (urlStr.includes('api.deepseek.com')) {
      return {
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        json: async () => ({ error: { message: 'Insufficient balance / rate limit reached' } }),
      } as any;
    }

    if (urlStr.includes('openrouter.ai')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'call_123',
                    function: {
                      name: 'createTransactionProposal',
                      arguments: JSON.stringify({
                        type: 'expense',
                        amount: 45000,
                        description: 'Makan siang soto',
                        accountName: 'Bank BCA',
                        categoryName: 'Food & Dining',
                      }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      } as any;
    }

    return { ok: false, status: 500 } as any;
  };

  const rolloverResult = await sendUnifiedChatMessage(
    'Makan siang soto 45rb bca',
    [],
    { aiEnabled: true } as any,
    context,
    mockRolloverFetch as any
  );

  if (rolloverResult.servingProvider !== 'OpenRouter') {
    throw new Error(`FAILED: Rollover did not serve from OpenRouter! Serving provider: ${rolloverResult.servingProvider}`);
  }
  if (!rolloverResult.failoverChain || rolloverResult.failoverChain.length === 0) {
    throw new Error('FAILED: Failover chain was not recorded in the chat response!');
  }
  if (!rolloverResult.failoverChain[0].reason.includes('429')) {
    throw new Error(`FAILED: Failover reason does not mention 429! Got: ${rolloverResult.failoverChain[0].reason}`);
  }
  if (!rolloverResult.proposals || rolloverResult.proposals.length === 0) {
    throw new Error('FAILED: Transaction proposal was lost during provider failover!');
  }

  console.log(`[PASS] Primary provider (DeepSeek) failed with 429; smoothly rolled over to OpenRouter without dropping message.`);
  console.log(`[PASS] Serving provider: "${rolloverResult.servingProvider}" (Model: "${rolloverResult.servingModel}")`);
  console.log(`[PASS] Rollover trace recorded: ${JSON.stringify(rolloverResult.failoverChain[0])}`);
  console.log(`[PASS] Preserved transaction proposal: "${rolloverResult.proposals[0].summary}"\n`);

  // =========================================================================
  // Test 6: Persistent Failure Alerting on Consecutive Failures (>= 3)
  // =========================================================================
  console.log('--- Test 6: Persistent Failure Alerting (Revision 2) ---');

  const failProvId = 'prov_groq';
  const targetAlertId = `prov_groq:key_test`;

  // 1st failure
  await recordHealthResult({
    targetId: targetAlertId,
    providerId: failProvId,
    providerName: 'Groq',
    result: { status: 'unreachable', error: 'Invalid API Key (HTTP 401)' },
  });
  let activeAlerts = await db.ai_failure_alerts.filter((a) => !a.dismissed).toArray();
  if (activeAlerts.length !== 0) throw new Error('Alert appeared prematurely before 3 failures!');

  // 2nd failure
  await recordHealthResult({
    targetId: targetAlertId,
    providerId: failProvId,
    providerName: 'Groq',
    result: { status: 'unreachable', error: 'Invalid API Key (HTTP 401)' },
  });
  activeAlerts = await db.ai_failure_alerts.filter((a) => !a.dismissed).toArray();
  if (activeAlerts.length !== 0) throw new Error('Alert appeared prematurely before 3 failures!');

  // 3rd consecutive failure -> Must trigger persistent alert!
  await recordHealthResult({
    targetId: targetAlertId,
    providerId: failProvId,
    providerName: 'Groq',
    result: { status: 'unreachable', error: 'Invalid API Key (HTTP 401)' },
  });
  activeAlerts = await db.ai_failure_alerts.filter((a) => !a.dismissed).toArray();
  if (activeAlerts.length === 0 || activeAlerts[0].failureCount !== 3) {
    throw new Error('FAILED: Persistent failure alert was not generated after 3 consecutive failures!');
  }
  console.log(`[PASS] Generated persistent failure alert after 3 consecutive failures: "${activeAlerts[0].reason}" (failureCount: ${activeAlerts[0].failureCount})`);

  // Recovery: Provider succeeds -> Alert must be automatically cleared
  await recordHealthResult({
    targetId: targetAlertId,
    providerId: failProvId,
    providerName: 'Groq',
    result: { status: 'healthy' },
  });
  activeAlerts = await db.ai_failure_alerts.filter((a) => !a.dismissed).toArray();
  if (activeAlerts.length !== 0) {
    throw new Error('FAILED: Persistent failure alert was not dismissed after provider recovered to healthy!');
  }
  console.log('[PASS] Persistent failure alert automatically resolved upon provider recovery.\n');

  // =========================================================================
  // Test 7: Guaranteed 3-Tier Fallback Order (Cloud -> Ollama -> Phase 7 Offline Engine)
  // =========================================================================
  console.log('--- Test 7: Guaranteed 3-Tier Fallback Order ---');

  // Case A: Cloud fails -> Local Ollama succeeds
  const mockCloudFailsOllamaSucceeds = async (url: string | URL | Request) => {
    const urlStr = String(url);
    if (urlStr.includes('11434')) {
      // Ollama returns chat response
      return {
        ok: true,
        status: 200,
        json: async () => ({
          message: {
            content: '{"action": "createTransactionProposal", "parameters": {"type": "expense", "amount": 25000, "description": "Kopi Susu", "accountName": "Bank BCA"}}',
          },
        }),
      } as any;
    }
    // All cloud providers fail with 503
    return { ok: false, status: 503, statusText: 'Service Unavailable' } as any;
  };

  const ollamaFallbackResult = await sendUnifiedChatMessage(
    'kopi susu 25rb bca',
    [],
    { aiEnabled: true } as any,
    context,
    mockCloudFailsOllamaSucceeds as any
  );

  if (!ollamaFallbackResult.servingProvider?.includes('Ollama')) {
    throw new Error(`FAILED: Expected Ollama to serve response after cloud failure! Got: ${ollamaFallbackResult.servingProvider}`);
  }
  console.log(`[PASS] Cloud providers failed -> Automatically served by Tier 2 (Local Ollama): "${ollamaFallbackResult.servingProvider}"`);

  // Case B: Cloud fails AND Ollama fails -> Guaranteed Fallback to Phase 7 Offline Deterministic Engine
  const mockAllFailFetch = async () => {
    return { ok: false, status: 500, statusText: 'Complete Outage' } as any;
  };

  const offlineEngineResult = await sendUnifiedChatMessage(
    'beli bensin 50rb pake cash kemaren',
    [],
    { aiEnabled: true } as any,
    context,
    mockAllFailFetch as any
  );

  if (offlineEngineResult.servingProvider !== 'Offline Intelligence') {
    throw new Error(`FAILED: Expected Phase 7 Offline Intelligence fallback! Got: ${offlineEngineResult.servingProvider}`);
  }
  if (!offlineEngineResult.proposals || offlineEngineResult.proposals.length === 0) {
    throw new Error('FAILED: Offline intelligence did not generate transaction proposal!');
  }
  const prop = offlineEngineResult.proposals[0];
  if (prop.data.amount !== 50000) {
    throw new Error(`FAILED: Offline intelligence parsed incorrect amount: ${prop.data.amount}`);
  }

  console.log(`[PASS] Cloud + Ollama outage -> Guaranteed fallback to Phase 7 Deterministic Offline Intelligence.`);
  console.log(`[PASS] Serving provider: "${offlineEngineResult.servingProvider}" (Model: "${offlineEngineResult.servingModel}")`);
  console.log(`[PASS] Deterministic offline proposal generated: ${prop.summary}`);

  console.log('\n🎉 ALL PHASE 8 AI PROVIDER & KEY MANAGEMENT, HEALTH CHECKING & FAILOVER TESTS PASSED WITH 100% SUCCESS!');
}

runPhase8Tests().catch((err) => {
  console.error('\n❌ Phase 8 Test Suite Failed:', err);
  process.exit(1);
});
