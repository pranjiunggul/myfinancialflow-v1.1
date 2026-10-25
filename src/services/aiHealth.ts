/**
 * Proactive Background Health Checking & Live Model Synchronization Engine
 *
 * Requirements:
 * 1. Proactive checking decoupled from chat requests (cached health status).
 * 2. Triggers: app launch, resume (Page Visibility API), periodic foreground interval (5-10 min), on-demand edits.
 * 3. Offline skip: if navigator.onLine === false, skip network calls, mark cloud as unreachable, check only Ollama.
 * 4. Lightweight validation: uses models endpoint (not full chat completion).
 * 5. Consecutive failure tracking: >= 3 consecutive failures triggers persistent alert.
 * 6. Fast-path lookup for chat dispatcher.
 */

import { db } from '../db/database';
import { encryptData, decryptData, type EncryptedPayload } from './crypto';
import type {
  AIProviderConfig,
  AIKeyRecord,
  AIPriorityItem,
  AIHealthStatus,
  AIHealthRecord,
  AIPersistentAlert,
} from '../types';

// In-memory health cache keyed by providerId or `${providerId}:${keyId}`
const healthCache = new Map<string, AIHealthRecord>();
type HealthSubscriber = (cache: Map<string, AIHealthRecord>) => void;
const subscribers = new Set<HealthSubscriber>();

export function subscribeToHealthUpdates(callback: HealthSubscriber): () => void {
  subscribers.add(callback);
  callback(new Map(healthCache));
  return () => {
    subscribers.delete(callback);
  };
}

function notifySubscribers() {
  const snapshot = new Map(healthCache);
  subscribers.forEach((cb) => {
    try {
      cb(snapshot);
    } catch (err) {
      console.warn('[AIHealth] Subscriber error:', err);
    }
  });
}

export function getCachedHealth(id: string): AIHealthRecord | undefined {
  return healthCache.get(id);
}

export function getAllCachedHealth(): Map<string, AIHealthRecord> {
  return new Map(healthCache);
}

export function setCachedHealth(id: string, record: AIHealthRecord) {
  healthCache.set(id, record);
  notifySubscribers();
}

/**
 * Hard PIN Requirement: Save an API key encrypted at rest with AES-GCM-256 + PBKDF2
 * Rejects with error if no PIN is provided.
 */
export async function saveEncryptedApiKey(params: {
  providerId: string;
  label: string;
  plainKey: string;
  masterPin: string;
}): Promise<AIKeyRecord> {
  const { providerId, label, plainKey, masterPin } = params;

  if (!masterPin || !masterPin.trim()) {
    throw new Error('A security PIN must be configured before saving AI API keys.');
  }

  const cleanKey = plainKey.trim();
  if (!cleanKey) {
    throw new Error('API key cannot be empty.');
  }

  // Encrypt using Web Crypto AES-GCM-256
  const encryptedPayload = await encryptData(cleanKey, masterPin);

  // Mask hint: show prefix and last 4 chars (e.g. "sk-...4f8b")
  let keyHint = '••••••••';
  if (cleanKey.length >= 8) {
    const prefix = cleanKey.slice(0, 3);
    const suffix = cleanKey.slice(-4);
    keyHint = `${prefix}...${suffix}`;
  } else if (cleanKey.length > 4) {
    keyHint = `...${cleanKey.slice(-3)}`;
  }

  const now = Date.now();
  const id = 'key_' + crypto.randomUUID().slice(0, 8);

  const record: AIKeyRecord = {
    id,
    providerId,
    label: label.trim() || 'API Key',
    encryptedKeyPayload: encryptedPayload as any,
    keyHint,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    version: 1,
  };

  await db.ai_keys.put(record);
  return record;
}

/**
 * Reveal / Decrypt API key in memory using user PIN
 * Note: Memory clearing in JavaScript is best-effort.
 */
export async function revealApiKey(keyRecord: AIKeyRecord, masterPin: string): Promise<string> {
  if (!masterPin) {
    throw new Error('Master PIN required to decrypt key.');
  }
  const plain = await decryptData<string>(keyRecord.encryptedKeyPayload as EncryptedPayload, masterPin);
  return plain;
}

/**
 * Lightweight Validation & Model Sync Call per Provider Protocol
 */
export async function checkProviderHealth(
  provider: AIProviderConfig,
  plainKey: string | undefined,
  options?: {
    isOffline?: boolean;
    fetchFn?: typeof fetch;
  }
): Promise<{
  status: AIHealthStatus;
  models?: string[];
  error?: string;
}> {
  const fetchFn = options?.fetchFn || fetch;
  const isOffline = options?.isOffline ?? (typeof navigator !== 'undefined' && navigator.onLine === false);

  // When device is offline, skip cloud calls entirely and immediately mark as unreachable
  if (isOffline) {
    if (provider.protocol !== 'ollama') {
      return {
        status: 'unreachable',
        error: 'Device is offline. Cloud provider health check skipped.',
      };
    }
  }

  try {
    // 1. Local Ollama Check
    if (provider.protocol === 'ollama') {
      const endpoint = `${provider.baseUrl.replace(/\/+$/, '')}/api/tags`;
      const resp = await fetchFn(endpoint, { method: 'GET' });
      if (!resp.ok) {
        return {
          status: 'unreachable',
          error: `Ollama returned HTTP ${resp.status}`,
        };
      }
      const data = await resp.json();
      const models: string[] = Array.isArray(data.models)
        ? data.models.map((m: any) => m.name || m.model || String(m))
        : [];
      return {
        status: 'healthy',
        models: models.length > 0 ? models : provider.availableModels,
      };
    }

    // Cloud providers require an API key
    if (!plainKey) {
      return {
        status: 'unreachable',
        error: 'No active API key provided for health check.',
      };
    }

    // 2. Google Gemini Check
    if (provider.protocol === 'gemini') {
      const endpoint = `${provider.baseUrl.replace(/\/+$/, '')}/models?key=${plainKey}`;
      const resp = await fetchFn(endpoint, { method: 'GET' });
      if (!resp.ok) {
        if (resp.status === 429) {
          return { status: 'degraded', error: 'Gemini rate limit or quota exceeded (HTTP 429).' };
        }
        if (resp.status === 401 || resp.status === 403) {
          return { status: 'unreachable', error: `Gemini authentication failed (HTTP ${resp.status}). Check API key.` };
        }
        return { status: 'unreachable', error: `Gemini health check error: HTTP ${resp.status}` };
      }
      const data = await resp.json();
      const rawModels: any[] = data.models || [];
      const supported = rawModels
        .filter((m: any) => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes('generateContent'))
        .map((m: any) => (m.name || '').replace(/^models\//, ''))
        .filter(Boolean);

      return {
        status: 'healthy',
        models: supported.length > 0 ? supported : provider.availableModels,
      };
    }

    // 3. Anthropic Messages API Check
    if (provider.protocol === 'anthropic') {
      const endpoint = `${provider.baseUrl.replace(/\/+$/, '')}/models`;
      const resp = await fetchFn(endpoint, {
        method: 'GET',
        headers: {
          'x-api-key': plainKey,
          'anthropic-version': '2023-06-01',
        },
      });

      if (!resp.ok) {
        if (resp.status === 429) {
          return { status: 'degraded', error: 'Anthropic rate limit or quota exceeded (HTTP 429).' };
        }
        if (resp.status === 401 || resp.status === 403) {
          return { status: 'unreachable', error: `Anthropic authentication failed (HTTP ${resp.status}). Check API key.` };
        }
        return { status: 'unreachable', error: `Anthropic health check error: HTTP ${resp.status}` };
      }

      const data = await resp.json();
      const models = (data.data || []).map((m: any) => m.id || m.name).filter(Boolean);
      return {
        status: 'healthy',
        models: models.length > 0 ? models : provider.availableModels,
      };
    }

    // 4. OpenAI-Compatible Check (DeepSeek, OpenRouter, Groq, OpenAI, Mistral, Custom)
    const modelsPath = provider.modelsEndpoint || '/models';
    const endpoint = `${provider.baseUrl.replace(/\/+$/, '')}${modelsPath.startsWith('/') ? '' : '/'}${modelsPath}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (provider.authHeaderFormat) {
      if (provider.authHeaderFormat.includes('{KEY}')) {
        const [headerName, ...valParts] = provider.authHeaderFormat.split(':');
        if (headerName && valParts.length > 0) {
          headers[headerName.trim()] = valParts.join(':').trim().replace('{KEY}', plainKey);
        } else {
          headers['Authorization'] = provider.authHeaderFormat.replace('{KEY}', plainKey);
        }
      } else {
        headers['Authorization'] = `Bearer ${plainKey}`;
      }
    } else {
      headers['Authorization'] = `Bearer ${plainKey}`;
    }

    const resp = await fetchFn(endpoint, { method: 'GET', headers });

    if (!resp.ok) {
      if (resp.status === 429) {
        return { status: 'degraded', error: `${provider.name} rate limit or quota exceeded (HTTP 429).` };
      }
      if (resp.status === 401 || resp.status === 403) {
        return { status: 'unreachable', error: `${provider.name} authentication failed (HTTP ${resp.status}). Check API key.` };
      }
      return { status: 'unreachable', error: `${provider.name} health check error: HTTP ${resp.status}` };
    }

    const data = await resp.json();
    const rawList: any[] = Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : [];
    const models = rawList
      .map((m: any) => (typeof m === 'string' ? m : m.id || m.name))
      .filter(Boolean);

    return {
      status: 'healthy',
      models: models.length > 0 ? models : provider.availableModels,
    };
  } catch (err: any) {
    return {
      status: 'unreachable',
      error: err.message || 'Network connection failed or timed out.',
    };
  }
}

/**
 * Record Health Result & Handle Consecutive Failure Alerting
 */
export async function recordHealthResult(params: {
  targetId: string; // providerId or `${providerId}:${keyId}`
  providerId: string;
  keyId?: string;
  providerName: string;
  keyLabel?: string;
  result: { status: AIHealthStatus; models?: string[]; error?: string };
}): Promise<AIHealthRecord> {
  const { targetId, providerId, keyId, providerName, keyLabel, result } = params;
  const existing = healthCache.get(targetId);
  const prevFailures = existing?.consecutiveFailures || 0;

  let consecutiveFailures = 0;
  if (result.status === 'unreachable' || result.status === 'degraded') {
    consecutiveFailures = prevFailures + 1;
  } else if (result.status === 'healthy') {
    consecutiveFailures = 0;
  }

  const record: AIHealthRecord = {
    id: targetId,
    status: result.status,
    lastChecked: Date.now(),
    lastError: result.error,
    consecutiveFailures,
  };

  healthCache.set(targetId, record);
  notifySubscribers();

  // If models were returned and valid, update the provider's availableModels in DB
  if (result.models && result.models.length > 0) {
    try {
      const prov = await db.ai_providers.get(providerId);
      if (prov) {
        await db.ai_providers.update(providerId, {
          availableModels: result.models,
          updatedAt: Date.now(),
        });
      }
    } catch (e) {
      console.warn('[AIHealth] Failed to update availableModels in DB:', e);
    }
  }

  // Persistent Failure Alerting (Revision 2):
  // When consecutiveFailures >= 3, persist an alert so user is clearly notified in Settings/Dashboard
  const alertId = `alert_${providerId}${keyId ? `_${keyId}` : ''}`;
  if (consecutiveFailures >= 3) {
    const alert: AIPersistentAlert = {
      id: alertId,
      providerId,
      keyId,
      providerName,
      keyLabel,
      failureCount: consecutiveFailures,
      reason: result.error || 'Provider has repeatedly failed health checks or requests.',
      timestamp: Date.now(),
      dismissed: false,
    };
    await db.ai_failure_alerts.put(alert);
  } else if (consecutiveFailures === 0) {
    // If provider recovered to healthy, automatically dismiss the failure alert
    const activeAlert = await db.ai_failure_alerts.get(alertId);
    if (activeAlert) {
      await db.ai_failure_alerts.delete(alertId);
    }
  }

  return record;
}

/**
 * Execute a proactive health check pass over all enabled providers/keys in the priority chain
 */
export async function runProactiveHealthCheckPass(options?: {
  masterPin?: string;
  isOffline?: boolean;
  fetchFn?: typeof fetch;
}): Promise<void> {
  const providers = await db.ai_providers.filter((p) => p.isEnabled).toArray();
  const keys = await db.ai_keys.filter((k) => k.isActive).toArray();
  const priorities = await db.ai_priorities.filter((p) => p.isEnabled).sortBy('order');

  const isOffline = options?.isOffline ?? (typeof navigator !== 'undefined' && navigator.onLine === false);

  // If priority chain is configured, check those items first
  if (priorities.length > 0) {
    for (const prio of priorities) {
      const prov = providers.find((p) => p.id === prio.providerId);
      if (!prov) continue;

      let plainKey: string | undefined;
      let keyRec: AIKeyRecord | undefined;

      if (prov.protocol !== 'ollama' && prio.keyId) {
        keyRec = keys.find((k) => k.id === prio.keyId);
        if (keyRec && options?.masterPin) {
          try {
            plainKey = await revealApiKey(keyRec, options.masterPin);
          } catch {
            plainKey = undefined;
          }
        }
      }

      const targetId = `${prio.providerId}:${prio.keyId || 'default'}`;
      const res = await checkProviderHealth(prov, plainKey, {
        isOffline,
        fetchFn: options?.fetchFn,
      });

      await recordHealthResult({
        targetId,
        providerId: prov.id,
        keyId: prio.keyId,
        providerName: prov.name,
        keyLabel: keyRec?.label,
        result: res,
      });
    }
  } else {
    // Check enabled providers with their keys
    for (const prov of providers) {
      const provKeys = keys.filter((k) => k.providerId === prov.id);
      if (prov.protocol === 'ollama') {
        const res = await checkProviderHealth(prov, undefined, { isOffline, fetchFn: options?.fetchFn });
        await recordHealthResult({
          targetId: prov.id,
          providerId: prov.id,
          providerName: prov.name,
          result: res,
        });
      } else if (provKeys.length > 0) {
        for (const k of provKeys) {
          let plainKey: string | undefined;
          if (options?.masterPin) {
            try {
              plainKey = await revealApiKey(k, options.masterPin);
            } catch {
              plainKey = undefined;
            }
          }
          const res = await checkProviderHealth(prov, plainKey, { isOffline, fetchFn: options?.fetchFn });
          await recordHealthResult({
            targetId: `${prov.id}:${k.id}`,
            providerId: prov.id,
            keyId: k.id,
            providerName: prov.name,
            keyLabel: k.label,
            result: res,
          });
        }
      }
    }
  }
}

/**
 * Fast-path selection: Consult cached status and return the highest-priority healthy target
 */
export async function getFastPathTarget(
  priorities: AIPriorityItem[],
  providers: AIProviderConfig[],
  keys: AIKeyRecord[]
): Promise<{
  priority: AIPriorityItem;
  provider: AIProviderConfig;
  key?: AIKeyRecord;
  model: string;
} | null> {
  const sorted = [...priorities].sort((a, b) => a.order - b.order);

  for (const prio of sorted) {
    if (!prio.isEnabled) continue;
    const prov = providers.find((p) => p.id === prio.providerId);
    if (!prov || !prov.isEnabled) continue;

    const key = keys.find((k) => k.id === prio.keyId);
    if (prov.protocol !== 'ollama' && (!key || !key.isActive)) continue;

    const targetId = `${prio.providerId}:${prio.keyId || 'default'}`;
    const health = healthCache.get(targetId) || healthCache.get(prov.id);

    // Fast-path chooses the first item marked healthy
    if (health?.status === 'healthy') {
      return {
        priority: prio,
        provider: prov,
        key,
        model: prio.modelOverride || prov.selectedModel,
      };
    }
  }

  return null;
}

export type HealthSchedulerController = (() => void) & {
  triggerCheckNow: () => Promise<void>;
  isPaused: () => boolean;
};

/**
 * Background Scheduler:
 * Periodic background interval while app is open and in foreground.
 * Pauses interval entirely when app is backgrounded/hidden (Page Visibility API), resumes on foreground.
 */
export function startHealthCheckScheduler(options: {
  getMasterPin: () => string | undefined;
  intervalMs?: number; // Default 5 minutes
  isOffline?: () => boolean;
  fetchFn?: typeof fetch;
}): HealthSchedulerController {
  const intervalMs = options.intervalMs || 5 * 60 * 1000;
  let timerId: any = null;
  let isPaused = false;

  const runCheck = async () => {
    if (isPaused) return;
    try {
      const pin = options.getMasterPin();
      const offline = options.isOffline ? options.isOffline() : (typeof navigator !== 'undefined' && navigator.onLine === false);
      await runProactiveHealthCheckPass({
        masterPin: pin,
        isOffline: offline,
        fetchFn: options.fetchFn,
      });
    } catch (err) {
      console.warn('[AIHealth] Periodic health check pass failed:', err);
    }
  };

  const startTimer = () => {
    if (timerId) clearInterval(timerId);
    timerId = setInterval(runCheck, intervalMs);
  };

  const stopTimer = () => {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
  };

  // Initial check execution
  runCheck();
  startTimer();

  // Page Visibility API handler
  const handleVisibilityChange = () => {
    if (typeof document === 'undefined') return;
    if (document.hidden) {
      isPaused = true;
      stopTimer();
    } else {
      isPaused = false;
      runCheck();
      startTimer();
    }
  };

  // Online / Offline handlers
  const handleOnline = () => {
    runCheck();
  };

  const handleOffline = () => {
    runCheck();
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
  }

  // Return controller
  const controller: any = () => {
    stopTimer();
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    }
  };
  controller.triggerCheckNow = runCheck;
  controller.isPaused = () => isPaused;

  return controller;
}
