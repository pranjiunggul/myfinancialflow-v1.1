import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Cpu,
  Plus,
  RefreshCw,
  Trash2,
  Key,
  AlertTriangle,
  Eye,
  Copy,
  ArrowUp,
  ArrowDown,
  Layers,
  X,
  Server,
  Lock,
} from 'lucide-react';
import { db } from '../../db/database';
import type {
  AppSettings,
  AIProviderConfig,
  AIKeyRecord,
  AIPriorityItem,
  AIHealthRecord,
} from '../../types';
import {
  subscribeToHealthUpdates,
  checkProviderHealth,
  recordHealthResult,
  saveEncryptedApiKey,
  revealApiKey,
  runProactiveHealthCheckPass,
} from '../../services/aiHealth';
import { createCustomProviderConfig } from '../../services/aiPresets';

interface AIProviderManagerProps {
  settings: AppSettings | null;
  masterPin?: string;
  onOpenSecuritySetup: () => void;
}

export const AIProviderManager: React.FC<AIProviderManagerProps> = ({
  settings,
  masterPin,
  onOpenSecuritySetup,
}) => {
  const [activeTab, setActiveTab] = useState<'priorities' | 'providers' | 'keys'>('priorities');
  const [healthMap, setHealthMap] = useState<Map<string, AIHealthRecord>>(new Map());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Modals state
  const [isAddKeyModalOpen, setIsAddKeyModalOpen] = useState(false);
  const [isAddCustomProvModalOpen, setIsAddCustomProvModalOpen] = useState(false);
  const [isAddPriorityModalOpen, setIsAddPriorityModalOpen] = useState(false);

  // Key revelation state
  const [revealedKeyId, setRevealedKeyId] = useState<string | null>(null);
  const [revealedPlainKey, setRevealedPlainKey] = useState<string | null>(null);
  const [pinPromptKeyRecord, setPinPromptKeyRecord] = useState<AIKeyRecord | null>(null);
  const [enteredPin, setEnteredPin] = useState('');

  // Add Key form state
  const [newKeyProviderId, setNewKeyProviderId] = useState('');
  const [newKeyLabel, setNewKeyLabel] = useState('Primary Key');
  const [newKeyPlain, setNewKeyPlain] = useState('');
  const [newKeyPin, setNewKeyPin] = useState(masterPin || '');

  // Add Custom Provider form state
  const [customProvName, setCustomProvName] = useState('');
  const [customProvBaseUrl, setCustomProvBaseUrl] = useState('http://localhost:1234/v1');
  const [customProvAuthHeader, setCustomProvAuthHeader] = useState('Bearer {KEY}');
  const [customProvModelsEndpoint, setCustomProvModelsEndpoint] = useState('/models');
  const [customProvDefaultModel, setCustomProvDefaultModel] = useState('');

  // Add Priority Step form state
  const [newPrioProvId, setNewPrioProvId] = useState('');
  const [newPrioKeyId, setNewPrioKeyId] = useState('');
  const [newPrioModel, setNewPrioModel] = useState('');

  // Live queries from Dexie IndexedDB
  const providers = useLiveQuery(() => db.ai_providers.toArray()) || [];
  const keys = useLiveQuery(() => db.ai_keys.toArray()) || [];
  const priorities = useLiveQuery(() => db.ai_priorities.orderBy('order').toArray()) || [];
  const alerts = useLiveQuery(() => db.ai_failure_alerts.filter((a) => !a.dismissed).toArray()) || [];

  // Subscribe to proactive background health updates
  useEffect(() => {
    const unsubscribe = subscribeToHealthUpdates((snapshot) => {
      setHealthMap(new Map(snapshot));
    });
    return () => unsubscribe();
  }, []);

  const hasPinConfigured = !!settings?.pinEnabled && !!settings?.pinHash;

  // Manual Trigger: Run health check on a specific provider or key
  const handleCheckHealth = async (prov: AIProviderConfig, keyRec?: AIKeyRecord) => {
    setIsRefreshing(true);
    setStatusMessage('');
    setErrorMessage('');
    try {
      let plainKey: string | undefined;
      const effectivePin = masterPin || newKeyPin;

      if (prov.protocol !== 'ollama' && keyRec) {
        if (!effectivePin) {
          setErrorMessage('PIN required to decrypt key for testing.');
          setIsRefreshing(false);
          return;
        }
        plainKey = await revealApiKey(keyRec, effectivePin);
      }

      const res = await checkProviderHealth(prov, plainKey);
      const targetId = `${prov.id}:${keyRec?.id || 'default'}`;
      await recordHealthResult({
        targetId,
        providerId: prov.id,
        keyId: keyRec?.id,
        providerName: prov.name,
        keyLabel: keyRec?.label,
        result: res,
      });

      if (res.status === 'healthy') {
        setStatusMessage(`${prov.name} is healthy! Synced ${res.models?.length || 0} models.`);
      } else {
        setErrorMessage(`${prov.name} health check returned: ${res.status} (${res.error || 'Unknown error'})`);
      }
    } catch (err: any) {
      setErrorMessage(`Check failed: ${err.message}`);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Run full health check pass
  const handleCheckAll = async () => {
    setIsRefreshing(true);
    setStatusMessage('');
    try {
      await runProactiveHealthCheckPass({ masterPin: masterPin || newKeyPin });
      setStatusMessage('Completed health check pass across all configured providers.');
    } catch (err: any) {
      setErrorMessage(`Check pass error: ${err.message}`);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Add API Key submit
  const handleSaveKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasPinConfigured) {
      alert('You must set an App PIN first before storing API keys.');
      onOpenSecuritySetup();
      return;
    }

    const pinToUse = newKeyPin || masterPin;
    if (!pinToUse) {
      setErrorMessage('Please enter your App PIN to encrypt this key.');
      return;
    }

    try {
      const record = await saveEncryptedApiKey({
        providerId: newKeyProviderId || providers[0]?.id || 'prov_openrouter',
        label: newKeyLabel,
        plainKey: newKeyPlain,
        masterPin: pinToUse,
      });

      // Immediate health check
      const prov = providers.find((p) => p.id === record.providerId);
      if (prov) {
        handleCheckHealth(prov, record);
      }

      // If priority chain is empty, automatically add as #1 priority step
      if (priorities.length === 0) {
        await db.ai_priorities.put({
          id: 'prio_' + crypto.randomUUID().slice(0, 8),
          providerId: record.providerId,
          keyId: record.id,
          order: 1,
          isEnabled: true,
        });
      }

      setIsAddKeyModalOpen(false);
      setNewKeyPlain('');
      setStatusMessage(`Key "${record.label}" saved and encrypted with AES-GCM-256.`);
    } catch (err: any) {
      setErrorMessage(`Failed to save key: ${err.message}`);
    }
  };

  // Reveal API key in-memory
  const handleRevealKey = async (keyRec: AIKeyRecord) => {
    const pin = masterPin || enteredPin;
    if (!pin) {
      setPinPromptKeyRecord(keyRec);
      return;
    }

    try {
      const plain = await revealApiKey(keyRec, pin);
      setRevealedKeyId(keyRec.id);
      setRevealedPlainKey(plain);
      setPinPromptKeyRecord(null);
      setEnteredPin('');

      // Auto-clear after 10 seconds (Best-effort in JavaScript)
      setTimeout(() => {
        setRevealedKeyId(null);
        setRevealedPlainKey(null);
      }, 10000);
    } catch (err: any) {
      setErrorMessage('Incorrect PIN or failed decryption.');
    }
  };

  const handleCopyKey = async (keyRec: AIKeyRecord) => {
    const pin = masterPin || enteredPin;
    if (!pin) {
      setPinPromptKeyRecord(keyRec);
      return;
    }

    try {
      const plain = await revealApiKey(keyRec, pin);
      await navigator.clipboard.writeText(plain);
      setStatusMessage(`Key copied to clipboard. (Best-effort browser memory clearing active).`);
      setPinPromptKeyRecord(null);
      setEnteredPin('');
    } catch (err: any) {
      setErrorMessage('Incorrect PIN: ' + err.message);
    }
  };

  // Add Custom Provider submit
  const handleSaveCustomProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customProvName.trim() || !customProvBaseUrl.trim()) {
      setErrorMessage('Provider name and Base URL are required.');
      return;
    }

    const config = createCustomProviderConfig({
      name: customProvName,
      baseUrl: customProvBaseUrl,
      authHeaderFormat: customProvAuthHeader,
      modelsEndpoint: customProvModelsEndpoint,
      defaultModel: customProvDefaultModel,
    });

    await db.ai_providers.put(config);
    setIsAddCustomProvModalOpen(false);
    setCustomProvName('');
    setStatusMessage(`Custom provider "${config.name}" added successfully.`);
  };

  // Priority Reordering (Move Up / Move Down)
  const handleMovePriority = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= priorities.length) return;

    const itemA = priorities[index];
    const itemB = priorities[targetIndex];

    await db.ai_priorities.update(itemA.id, { order: itemB.order });
    await db.ai_priorities.update(itemB.id, { order: itemA.order });
  };

  // Add Priority Step submit
  const handleSavePriorityStep = async (e: React.FormEvent) => {
    e.preventDefault();
    const provId = newPrioProvId || providers[0]?.id;
    if (!provId) return;

    const newOrder = priorities.length > 0 ? Math.max(...priorities.map((p) => p.order)) + 1 : 1;
    const item: AIPriorityItem = {
      id: 'prio_' + crypto.randomUUID().slice(0, 8),
      providerId: provId,
      keyId: newPrioKeyId,
      modelOverride: newPrioModel.trim() || undefined,
      order: newOrder,
      isEnabled: true,
    };

    await db.ai_priorities.put(item);
    setIsAddPriorityModalOpen(false);
    setStatusMessage('Added step to priority rollover chain.');
  };

  return (
    <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800/80 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400">
            <Cpu className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white flex items-center space-x-2">
              <span>AI Providers & API Key Manager</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                AES-GCM-256
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              User-configurable multi-provider rollover with proactive health checking and zero-knowledge storage.
            </p>
          </div>
        </div>

        <button
          onClick={handleCheckAll}
          disabled={isRefreshing}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-indigo-400' : ''}`} />
          <span>Check All Health</span>
        </button>
      </div>

      {/* Revision 2: Persistent Failure Alert Banner */}
      {alerts.length > 0 && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 space-y-2">
          {alerts.map((alt) => (
            <div key={alt.id} className="flex items-start justify-between gap-3 text-xs">
              <div className="flex items-start space-x-2 text-rose-300">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-rose-200">
                    Persistent Failure: {alt.providerName} {alt.keyLabel ? `(${alt.keyLabel})` : ''}
                  </span>{' '}
                  failed {alt.failureCount} times in a row: <em>"{alt.reason}"</em>. Silent fallback may be using a different provider.
                </div>
              </div>
              <div className="flex items-center space-x-2 shrink-0">
                <button
                  onClick={() => {
                    const p = providers.find((pr) => pr.id === alt.providerId);
                    const k = keys.find((kr) => kr.id === alt.keyId);
                    if (p) handleCheckHealth(p, k);
                  }}
                  className="px-2 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 font-semibold"
                >
                  Test Now
                </button>
                <button
                  onClick={() => db.ai_failure_alerts.update(alt.id, { dismissed: true })}
                  className="p-1 text-slate-400 hover:text-white"
                  title="Dismiss alert"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Revision 1: Hard PIN Prerequisite Banner */}
      {!hasPinConfigured && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start justify-between gap-4">
          <div className="flex items-start space-x-3 text-xs text-amber-300">
            <Lock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-amber-200">Security PIN Required for API Keys</p>
              <p className="text-amber-300/80 mt-0.5">
                To guarantee zero-knowledge encryption, an App PIN must be configured before storing API keys.
                Keys are never saved in plaintext and cannot be recovered without your PIN.
              </p>
            </div>
          </div>
          <button
            onClick={onOpenSecuritySetup}
            className="px-3 py-1.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs hover:bg-amber-400 transition shrink-0"
          >
            Setup App PIN
          </button>
        </div>
      )}

      {/* Feedback Messages */}
      {statusMessage && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs">
          {statusMessage}
        </div>
      )}
      {errorMessage && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
          {errorMessage}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-800 space-x-4 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('priorities')}
          className={`pb-2.5 flex items-center space-x-1.5 transition ${
            activeTab === 'priorities'
              ? 'text-indigo-400 border-b-2 border-indigo-500'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Priority Chain ({priorities.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('providers')}
          className={`pb-2.5 flex items-center space-x-1.5 transition ${
            activeTab === 'providers'
              ? 'text-indigo-400 border-b-2 border-indigo-500'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Server className="w-3.5 h-3.5" />
          <span>Providers ({providers.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('keys')}
          className={`pb-2.5 flex items-center space-x-1.5 transition ${
            activeTab === 'keys'
              ? 'text-indigo-400 border-b-2 border-indigo-500'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Key className="w-3.5 h-3.5" />
          <span>API Keys ({keys.length})</span>
        </button>
      </div>

      {/* TAB 1: PRIORITY CHAIN */}
      {activeTab === 'priorities' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">
              When a request is initiated, MyFinancialFlow queries the highest-priority healthy provider, and automatically rolls down on 429 quota or network errors.
            </p>
            <button
              onClick={() => setIsAddPriorityModalOpen(true)}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Step</span>
            </button>
          </div>

          {priorities.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-2xl">
              No priority steps configured. Add your first provider step or add an API key.
            </div>
          ) : (
            <div className="space-y-2">
              {priorities.map((prio, idx) => {
                const prov = providers.find((p) => p.id === prio.providerId);
                const keyRec = keys.find((k) => k.id === prio.keyId);
                const targetId = `${prio.providerId}:${prio.keyId || 'default'}`;
                const health = healthMap.get(targetId) || healthMap.get(prio.providerId);

                return (
                  <div
                    key={prio.id}
                    className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center space-x-3">
                      {/* Priority Number Badge */}
                      <span className="w-6 h-6 rounded-lg bg-indigo-600/20 text-indigo-400 font-black flex items-center justify-center font-mono">
                        #{prio.order}
                      </span>

                      {/* Health Indicator Dot */}
                      <span
                        className={`w-2.5 h-2.5 rounded-full ${
                          health?.status === 'healthy'
                            ? 'bg-emerald-400 ring-2 ring-emerald-500/20'
                            : health?.status === 'degraded'
                            ? 'bg-amber-400 ring-2 ring-amber-500/20'
                            : health?.status === 'unreachable'
                            ? 'bg-rose-400 ring-2 ring-rose-500/20'
                            : 'bg-slate-500'
                        }`}
                        title={`Status: ${health?.status || 'unknown'}${health?.lastError ? ` (${health.lastError})` : ''}`}
                      />

                      <div>
                        <div className="font-bold text-white flex items-center space-x-2">
                          <span>{prov?.name || prio.providerId}</span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {prio.modelOverride || prov?.selectedModel || 'default'}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 flex items-center space-x-2 mt-0.5">
                          <span>Key: {keyRec?.label || 'None (Local)'}</span>
                          {health?.lastChecked && (
                            <span>• Checked {Math.round((Date.now() - health.lastChecked) / 60000)}m ago</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleMovePriority(idx, 'up')}
                        disabled={idx === 0}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white disabled:opacity-30"
                        title="Move up"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleMovePriority(idx, 'down')}
                        disabled={idx === priorities.length - 1}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white disabled:opacity-30"
                        title="Move down"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => db.ai_priorities.delete(prio.id)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400"
                        title="Delete priority step"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Guaranteed Fallback Indicator */}
          <div className="p-3.5 rounded-2xl bg-slate-950/40 border border-slate-800/60 text-xs text-slate-400 flex items-center justify-between font-mono">
            <span className="flex items-center space-x-2">
              <span className="text-amber-400">↳ Fallback Tiers:</span>
              <span>Local Ollama → Phase 7 Deterministic Offline Intelligence Engine</span>
            </span>
            <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded">
              Always Ready
            </span>
          </div>
        </div>
      )}

      {/* TAB 2: AI PROVIDERS */}
      {activeTab === 'providers' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">
              Configure available providers, live model lists, and add custom OpenAI-compatible endpoints (LM Studio, vLLM).
            </p>
            <button
              onClick={() => setIsAddCustomProvModalOpen(true)}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold border border-slate-700 transition"
            >
              <Plus className="w-3.5 h-3.5 text-indigo-400" />
              <span>Add Custom Provider</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {providers.map((prov) => {
              const provHealth = healthMap.get(prov.id);
              const provKey = keys.find((k) => k.providerId === prov.id);

              return (
                <div
                  key={prov.id}
                  className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-3 text-xs"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-bold text-white flex items-center space-x-2">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            provHealth?.status === 'healthy'
                              ? 'bg-emerald-400'
                              : provHealth?.status === 'degraded'
                              ? 'bg-amber-400'
                              : provHealth?.status === 'unreachable'
                              ? 'bg-rose-400'
                              : 'bg-slate-500'
                          }`}
                          title={`Status: ${provHealth?.status || 'unknown'}`}
                        />
                        <span>{prov.name}</span>
                        <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                          {prov.protocol}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono truncate max-w-[200px]">
                        {prov.baseUrl}
                      </div>
                    </div>

                    <div className="flex items-center space-x-1.5">
                      <button
                        onClick={() => handleCheckHealth(prov, provKey)}
                        disabled={isRefreshing}
                        className="p-1 rounded-lg text-slate-400 hover:text-white"
                        title="Refresh models & verify health"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                      {prov.type === 'custom' && (
                        <button
                          onClick={() => db.ai_providers.delete(prov.id)}
                          className="p-1 text-slate-500 hover:text-rose-400"
                          title="Delete custom provider"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Model Selector */}
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                      Active Model
                    </label>
                    <select
                      value={prov.selectedModel}
                      onChange={(e) => db.ai_providers.update(prov.id, { selectedModel: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs font-mono"
                    >
                      {prov.availableModels.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Feature 4: Estimated Monthly Spend & Spending Cap */}
                  <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-bold text-slate-400">
                        Estimated spend this month:
                      </span>
                      <span className="text-xs font-semibold text-white font-mono">
                        ~${(prov.estimatedMonthSpend || 0).toFixed(2)}
                        {prov.monthlySpendCap ? ` / ~$${prov.monthlySpendCap.toFixed(2)}` : ''}
                      </span>
                    </div>

                    {/* Progress bar if cap is configured */}
                    {prov.monthlySpendCap && prov.monthlySpendCap > 0 ? (
                      <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            (prov.estimatedMonthSpend || 0) >= prov.monthlySpendCap
                              ? 'bg-rose-500'
                              : (prov.estimatedMonthSpend || 0) >= prov.monthlySpendCap * 0.8
                              ? 'bg-amber-400'
                              : 'bg-indigo-500'
                          }`}
                          style={{
                            width: `${Math.min(
                              100,
                              Math.round(((prov.estimatedMonthSpend || 0) / prov.monthlySpendCap) * 100)
                            )}%`,
                          }}
                        />
                      </div>
                    ) : null}

                    {/* Warning / Cutoff Notice */}
                    {prov.monthlySpendCap && (prov.estimatedMonthSpend || 0) >= prov.monthlySpendCap ? (
                      <div className="text-[10px] text-rose-400 font-medium">
                        ⚠️ Estimated monthly spending cap reached. Provider automatically bypassed in priority rollover.
                      </div>
                    ) : prov.monthlySpendCap &&
                      (prov.estimatedMonthSpend || 0) >= prov.monthlySpendCap * 0.8 ? (
                      <div className="text-[10px] text-amber-400 font-medium">
                        ⚠️ Approaching estimated monthly spending cap (80%+).
                      </div>
                    ) : null}

                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-[10px] text-slate-400">Monthly cap ($):</span>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        placeholder="No cap"
                        value={prov.monthlySpendCap || ''}
                        onChange={(e) => {
                          const val = e.target.value ? parseFloat(e.target.value) : undefined;
                          db.ai_providers.update(prov.id, { monthlySpendCap: val });
                        }}
                        className="w-24 px-2 py-1 bg-slate-900 border border-slate-700 rounded-lg text-white text-[11px] font-mono focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: ENCRYPTED API KEYS */}
      {activeTab === 'keys' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">
              API keys are strictly encrypted with AES-GCM-256 + PBKDF2 (600k iterations) using your App PIN before hitting storage.
            </p>
            <button
              onClick={() => {
                if (!hasPinConfigured) {
                  alert('Please configure an App PIN first.');
                  onOpenSecuritySetup();
                  return;
                }
                setIsAddKeyModalOpen(true);
              }}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add API Key</span>
            </button>
          </div>

          {keys.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-2xl">
              No API keys stored. Click "Add API Key" to configure your providers.
            </div>
          ) : (
            <div className="space-y-2">
              {keys.map((k) => {
                const prov = providers.find((p) => p.id === k.providerId);
                const isRevealed = revealedKeyId === k.id;

                return (
                  <div
                    key={k.id}
                    className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-xl bg-slate-800 flex items-center justify-center text-indigo-400">
                        <Key className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-bold text-white flex items-center space-x-2">
                          <span>{k.label}</span>
                          <span className="text-[10px] text-slate-400">({prov?.name || k.providerId})</span>
                        </div>
                        <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                          {isRevealed ? (
                            <span className="text-emerald-400 font-semibold">{revealedPlainKey}</span>
                          ) : (
                            <span>{k.keyHint}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleRevealKey(k)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
                        title="Reveal key (10s in-memory, best-effort browser cleanup)"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleCopyKey(k)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
                        title="Copy key to clipboard"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => db.ai_keys.delete(k.id)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400"
                        title="Delete key"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <p className="text-[10px] text-slate-500 italic">
            * Note on key reveal: In-memory JavaScript variables are zeroed upon timeout on a best-effort basis; absolute memory zeroing cannot be guaranteed in garbage-collected browser runtimes.
          </p>
        </div>
      )}

      {/* MODAL: ADD API KEY */}
      {isAddKeyModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-white text-base">Add Encrypted API Key</h4>
              <button onClick={() => setIsAddKeyModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveKey} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 font-bold mb-1">Provider</label>
                <select
                  value={newKeyProviderId}
                  onChange={(e) => setNewKeyProviderId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white"
                >
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-bold mb-1">Key Label</label>
                <input
                  type="text"
                  placeholder="e.g. Personal Account, Work Tier"
                  value={newKeyLabel}
                  onChange={(e) => setNewKeyLabel(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 font-bold mb-1">API Key</label>
                <input
                  type="password"
                  placeholder="Paste your API key here..."
                  value={newKeyPlain}
                  onChange={(e) => setNewKeyPlain(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white font-mono"
                  required
                />
              </div>

              {!masterPin && (
                <div>
                  <label className="block text-amber-300 font-bold mb-1">Confirm App PIN (for AES-GCM-256)</label>
                  <input
                    type="password"
                    maxLength={6}
                    placeholder="Enter your 6-digit PIN"
                    value={newKeyPin}
                    onChange={(e) => setNewKeyPin(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white font-mono"
                    required
                  />
                </div>
              )}

              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsAddKeyModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold"
                >
                  Encrypt & Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD CUSTOM PROVIDER */}
      {isAddCustomProvModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-white text-base">Add Custom Provider</h4>
              <button onClick={() => setIsAddCustomProvModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCustomProvider} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 font-bold mb-1">Provider Name</label>
                <input
                  type="text"
                  placeholder="e.g. Local LM Studio, vLLM Server"
                  value={customProvName}
                  onChange={(e) => setCustomProvName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 font-bold mb-1">Base URL</label>
                <input
                  type="text"
                  placeholder="e.g. http://localhost:1234/v1"
                  value={customProvBaseUrl}
                  onChange={(e) => setCustomProvBaseUrl(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 font-bold mb-1">Auth Header Format</label>
                <input
                  type="text"
                  placeholder="Bearer {KEY}"
                  value={customProvAuthHeader}
                  onChange={(e) => setCustomProvAuthHeader(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-bold mb-1">Models Endpoint</label>
                <input
                  type="text"
                  placeholder="/models"
                  value={customProvModelsEndpoint}
                  onChange={(e) => setCustomProvModelsEndpoint(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-bold mb-1">Default Model Name</label>
                <input
                  type="text"
                  placeholder="e.g. llama-3.2-3b-instruct"
                  value={customProvDefaultModel}
                  onChange={(e) => setCustomProvDefaultModel(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white font-mono"
                />
              </div>

              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsAddCustomProvModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold"
                >
                  Save Provider
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD PRIORITY STEP */}
      {isAddPriorityModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-white text-base">Add Priority Step</h4>
              <button onClick={() => setIsAddPriorityModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSavePriorityStep} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 font-bold mb-1">Provider</label>
                <select
                  value={newPrioProvId}
                  onChange={(e) => setNewPrioProvId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white"
                >
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-bold mb-1">Key Association</label>
                <select
                  value={newPrioKeyId}
                  onChange={(e) => setNewPrioKeyId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white"
                >
                  <option value="">None (Ollama / Local)</option>
                  {keys
                    .filter((k) => !newPrioProvId || k.providerId === newPrioProvId)
                    .map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.label} ({k.keyHint})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-bold mb-1">Model Override (Optional)</label>
                <input
                  type="text"
                  placeholder="Defaults to provider selected model"
                  value={newPrioModel}
                  onChange={(e) => setNewPrioModel(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white font-mono"
                />
              </div>

              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsAddPriorityModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold"
                >
                  Add Step
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: PROMPT PIN FOR KEY REVEAL/COPY */}
      {pinPromptKeyRecord && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-6 space-y-4">
            <h4 className="font-bold text-white text-base">Enter PIN to Decrypt Key</h4>
            <p className="text-xs text-slate-400">
              Enter your 6-digit security PIN to unlock "{pinPromptKeyRecord.label}".
            </p>
            <input
              type="password"
              maxLength={6}
              placeholder="••••••"
              value={enteredPin}
              onChange={(e) => setEnteredPin(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-center font-mono text-lg tracking-widest"
              autoFocus
            />
            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setPinPromptKeyRecord(null);
                  setEnteredPin('');
                }}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleRevealKey(pinPromptKeyRecord)}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold"
              >
                Authorize
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
