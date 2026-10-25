import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Send,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Key,
  ShieldCheck,
  Terminal,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Lock,
  Trash2,
  Globe,
  Info,
  MessageSquare,
  Radio,
} from 'lucide-react';
import { db } from '../../db/database';
import { useTranslation } from '../../i18n';
import type { AppSettings } from '../../types';
import {
  testTelegramBot,
  detectTelegramChatId,
  verifyWorkerWebhook,
  saveTelegramConfig,
  revealTelegramToken,
  disconnectTelegram,
} from '../../services/telegram';

interface TelegramSettingsProps {
  settings: AppSettings | null;
  masterPin?: string;
  onOpenSecuritySetup: () => void;
  onOpenTelegramInbox?: () => void;
}

export const TelegramSettings: React.FC<TelegramSettingsProps> = ({
  settings,
  masterPin,
  onOpenSecuritySetup,
  onOpenTelegramInbox,
}) => {
  const { t } = useTranslation();

  // Pending items count from IndexedDB
  const inboxItems = useLiveQuery(() => db.telegram_inbox.toArray(), []) || [];
  const pendingCount = inboxItems.filter((i) => i.status === 'pending').length;

  // Bot Credentials State
  const isConfigured = !!settings?.telegramBotTokenEnc;
  const [isEditingToken, setIsEditingToken] = useState(!isConfigured);
  const [botToken, setBotToken] = useState('');
  const [isTestingBot, setIsTestingBot] = useState(false);
  const [botTestResult, setBotTestResult] = useState<{
    ok: boolean;
    username?: string;
    firstName?: string;
    error?: string;
  } | null>(null);

  // Chat ID Linking State
  const [chatId, setChatId] = useState<number | undefined>(settings?.telegramChatId);
  const [isDetectingChatId, setIsDetectingChatId] = useState(false);
  const [chatIdDetectionResult, setChatIdDetectionResult] = useState<{
    ok: boolean;
    chatId?: number;
    fromName?: string;
    username?: string;
    error?: string;
  } | null>(null);
  const [showManualChatId, setShowManualChatId] = useState(false);
  const [manualChatIdInput, setManualChatIdInput] = useState(
    settings?.telegramChatId ? String(settings.telegramChatId) : ''
  );

  // Bridge Mode State
  const [bridgeMode, setBridgeMode] = useState<'worker' | 'daemon'>(
    settings?.telegramBridgeMode || 'worker'
  );
  const [workerUrl, setWorkerUrl] = useState(settings?.telegramWorkerUrl || '');
  const [workerSecret, setWorkerSecret] = useState('');
  const [isVerifyingWorker, setIsVerifyingWorker] = useState(false);
  const [workerVerifyResult, setWorkerVerifyResult] = useState<{
    ok: boolean;
    statusText?: string;
    error?: string;
  } | null>(null);

  // Security / PIN State
  const [pinInput, setPinInput] = useState(masterPin || '');
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // UI Tutorial and Copy State
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  // Sync settings when they update
  useEffect(() => {
    if (settings?.telegramChatId) {
      setChatId(settings.telegramChatId);
      setManualChatIdInput(String(settings.telegramChatId));
    }
    if (settings?.telegramBridgeMode) {
      setBridgeMode(settings.telegramBridgeMode);
    }
    if (settings?.telegramWorkerUrl) {
      setWorkerUrl(settings.telegramWorkerUrl);
    }
  }, [settings?.telegramChatId, settings?.telegramBridgeMode, settings?.telegramWorkerUrl]);

  const hasPinConfigured = !!settings?.pinEnabled && !!settings?.pinHash;

  // Determine Overall Status
  let connectionStatus: 'connected' | 'no_chat_id' | 'not_configured' = 'not_configured';
  if (isConfigured && chatId) {
    connectionStatus = 'connected';
  } else if (isConfigured && !chatId) {
    connectionStatus = 'no_chat_id';
  }

  // 1. Test Bot Connection
  const handleTestConnection = async () => {
    let tokenToTest = botToken.trim();
    if (!tokenToTest && settings?.telegramBotTokenEnc) {
      const pin = pinInput || masterPin;
      if (!pin) {
        setErrorMessage('Enter your Master PIN to decrypt and test your stored token.');
        return;
      }
      try {
        tokenToTest = await revealTelegramToken(settings.telegramBotTokenEnc, pin);
      } catch (err: any) {
        setErrorMessage(err.message || 'Failed to decrypt token with provided PIN.');
        return;
      }
    }

    if (!tokenToTest) {
      setErrorMessage('Please enter a Telegram Bot Token first.');
      return;
    }

    setIsTestingBot(true);
    setBotTestResult(null);
    setErrorMessage('');
    setStatusMessage('');

    try {
      const res = await testTelegramBot(tokenToTest);
      setBotTestResult(res);
      if (res.ok) {
        setStatusMessage(
          `Connected to ${res.username || 'Bot'} (${res.firstName || 'Verified'}) successfully!`
        );
      } else {
        setErrorMessage(res.error || 'Bot connection failed.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to reach Telegram API.');
    } finally {
      setIsTestingBot(false);
    }
  };

  // 2. Auto-Detect Chat ID via getUpdates
  const handleAutoDetectChatId = async () => {
    let tokenToUse = botToken.trim();
    if (!tokenToUse && settings?.telegramBotTokenEnc) {
      const pin = pinInput || masterPin;
      if (!pin) {
        setErrorMessage('Enter your Master PIN to decrypt your token for auto-detection.');
        return;
      }
      try {
        tokenToUse = await revealTelegramToken(settings.telegramBotTokenEnc, pin);
      } catch (err: any) {
        setErrorMessage(err.message || 'Failed to decrypt token with provided PIN.');
        return;
      }
    }

    if (!tokenToUse) {
      setErrorMessage('Please provide and test your Telegram Bot Token before linking Chat ID.');
      return;
    }

    setIsDetectingChatId(true);
    setChatIdDetectionResult(null);
    setErrorMessage('');
    setStatusMessage('');

    try {
      const res = await detectTelegramChatId(tokenToUse);
      setChatIdDetectionResult(res);
      if (res.ok && res.chatId) {
        setChatId(res.chatId);
        setManualChatIdInput(String(res.chatId));
        setStatusMessage(
          `Detected Chat ID: ${res.chatId} from ${res.fromName || 'User'}!`
        );
      } else {
        setErrorMessage(res.error || 'No updates found. Please send a message to your bot first.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to detect Chat ID.');
    } finally {
      setIsDetectingChatId(false);
    }
  };

  // 3. Verify Cloudflare Worker Webhook
  const handleVerifyWorker = async () => {
    if (!workerUrl.trim()) {
      setErrorMessage('Please enter your Cloudflare Worker URL.');
      return;
    }

    setIsVerifyingWorker(true);
    setWorkerVerifyResult(null);
    setErrorMessage('');
    setStatusMessage('');

    try {
      const res = await verifyWorkerWebhook(workerUrl.trim(), workerSecret.trim());
      setWorkerVerifyResult(res);
      if (res.ok) {
        setStatusMessage(res.statusText || 'Cloudflare Worker is online and reachable!');
      } else {
        setErrorMessage(res.error || 'Worker verification failed.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error reaching Cloudflare Worker.');
    } finally {
      setIsVerifyingWorker(false);
    }
  };

  // 4. Save Telegram Settings
  const handleSaveSettings = async () => {
    const pin = pinInput.trim() || (masterPin || '').trim();
    if (!pin) {
      setErrorMessage('Master PIN is required to securely encrypt your bot credentials.');
      return;
    }

    setIsSaving(true);
    setStatusMessage('');
    setErrorMessage('');

    try {
      const finalChatId = manualChatIdInput.trim() ? Number(manualChatIdInput.trim()) : chatId;

      await saveTelegramConfig({
        token: botToken.trim() || undefined,
        pin,
        chatId: finalChatId,
        bridgeMode,
        workerUrl: workerUrl.trim() || undefined,
        workerSecret: workerSecret.trim() || undefined,
        botUsername: botTestResult?.username || settings?.telegramBotUsername,
      });

      setStatusMessage('Telegram settings saved and encrypted with your Master PIN!');
      setIsEditingToken(false);
      setBotToken('');
      setWorkerSecret('');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save Telegram settings.');
    } finally {
      setIsSaving(false);
    }
  };

  // 5. Disconnect Telegram
  const handleDisconnect = async () => {
    if (confirm(t('settings.telegram.disconnectConfirm'))) {
      try {
        await disconnectTelegram();
        setBotToken('');
        setChatId(undefined);
        setManualChatIdInput('');
        setBotTestResult(null);
        setChatIdDetectionResult(null);
        setIsEditingToken(true);
        setStatusMessage('Telegram integration disconnected and stored credentials cleared.');
      } catch (err: any) {
        setErrorMessage('Failed to disconnect: ' + err.message);
      }
    }
  };

  // 6. Copy Daemon Command to Clipboard
  const daemonCommand = `npx tsx scripts/telegram-daemon.ts${chatId ? ` --chat-id ${chatId}` : ''}`;
  const handleCopyDaemon = async () => {
    try {
      await navigator.clipboard.writeText(daemonCommand);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2500);
    } catch (_) {
      // Fallback
    }
  };

  return (
    <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800/80 space-y-6">
      {/* Header & Status Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
        <div className="flex items-start space-x-3.5">
          <div className="p-3 rounded-2xl bg-sky-500/10 text-sky-400 shrink-0">
            <Send className="w-6 h-6 -rotate-12 translate-x-0.5" />
          </div>
          <div>
            <div className="flex items-center space-x-2.5">
              <h3 className="text-base font-bold text-white">{t('settings.telegram.title')}</h3>
              {connectionStatus === 'connected' && (
                <span className="px-2.5 py-0.5 text-[11px] font-black rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center space-x-1">
                  <CheckCircle className="w-3 h-3" />
                  <span>{t('settings.telegram.statusConnected')}</span>
                </span>
              )}
              {connectionStatus === 'no_chat_id' && (
                <span className="px-2.5 py-0.5 text-[11px] font-bold rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center space-x-1">
                  <Info className="w-3 h-3" />
                  <span>{t('settings.telegram.statusNoChatId')}</span>
                </span>
              )}
              {connectionStatus === 'not_configured' && (
                <span className="px-2.5 py-0.5 text-[11px] font-bold rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                  {t('settings.telegram.statusNotConfigured')}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-1">{t('settings.telegram.subtitle')}</p>
          </div>
        </div>

        {/* Quick Action Tray */}
        <div className="flex items-center space-x-2.5 shrink-0">
          {onOpenTelegramInbox && (
            <button
              onClick={onOpenTelegramInbox}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-xs font-semibold flex items-center space-x-1.5 transition"
            >
              <MessageSquare className="w-3.5 h-3.5 text-sky-400" />
              <span>{t('settings.telegram.openInbox')}</span>
              {pendingCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-sky-500 text-white text-[10px] font-bold">
                  {pendingCount}
                </span>
              )}
            </button>
          )}

          {isConfigured && (
            <button
              onClick={handleDisconnect}
              className="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 text-xs font-semibold flex items-center space-x-1.5 transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{t('settings.telegram.disconnect')}</span>
            </button>
          )}
        </div>
      </div>

      {/* PIN Security Warning if PIN is not yet set up */}
      {!hasPinConfigured && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start justify-between gap-3 text-xs text-amber-300">
          <div className="flex items-start space-x-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">{t('settings.telegram.securityPinNotice')}</p>
              <p className="text-amber-400/80 mt-0.5">
                Set up a 6-digit Master PIN to enable zero-knowledge AES-GCM-256 encrypted credential storage.
              </p>
            </div>
          </div>
          <button
            onClick={onOpenSecuritySetup}
            className="px-3 py-1.5 bg-amber-500 text-slate-950 font-bold rounded-xl text-xs hover:bg-amber-400 transition shrink-0"
          >
            {t('settings.setupPin')}
          </button>
        </div>
      )}

      {/* Messages */}
      {statusMessage && (
        <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 flex items-center space-x-2">
          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}
      {errorMessage && (
        <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Section 1: Telegram Bot Credentials */}
      <div className="p-5 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Key className="w-4 h-4 text-sky-400" />
            <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
              {t('settings.telegram.botSetup')}
            </h4>
          </div>
          {settings?.telegramBotUsername && (
            <span className="text-xs font-mono font-bold text-sky-400 bg-sky-500/10 px-2.5 py-0.5 rounded-lg border border-sky-500/20">
              {settings.telegramBotUsername}
            </span>
          )}
        </div>

        {/* Token Input or Stored Mask */}
        {isConfigured && !isEditingToken ? (
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-900 border border-slate-800">
            <div className="space-y-0.5">
              <span className="text-xs text-slate-400">{t('settings.telegram.botTokenLabel')}</span>
              <div className="font-mono text-sm font-bold text-slate-200 flex items-center space-x-2">
                <Lock className="w-3.5 h-3.5 text-emerald-400" />
                <span>{settings.telegramBotTokenMasked || '••••••••••••••••••••'}</span>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isTestingBot}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 font-semibold border border-slate-700 transition flex items-center space-x-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isTestingBot ? 'animate-spin' : ''}`} />
                <span>{isTestingBot ? t('settings.telegram.testing') : t('settings.telegram.testConnection')}</span>
              </button>
              <button
                type="button"
                onClick={() => setIsEditingToken(true)}
                className="px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-xs text-blue-400 font-semibold border border-blue-500/30 transition"
              >
                Change Token
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                {t('settings.telegram.botTokenLabel')}
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="password"
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                  placeholder={t('settings.telegram.botTokenPlaceholder')}
                  className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-sky-500 placeholder:text-slate-600"
                />
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={isTestingBot || !botToken.trim()}
                  className="px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold transition flex items-center justify-center space-x-1.5 shrink-0"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isTestingBot ? 'animate-spin' : ''}`} />
                  <span>{isTestingBot ? t('settings.telegram.testing') : t('settings.telegram.testConnection')}</span>
                </button>
              </div>
            </div>

            {botTestResult?.ok && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 flex items-center space-x-2">
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  {t('settings.telegram.botVerified')}:{' '}
                  <strong className="text-white">{botTestResult.username || botTestResult.firstName}</strong>
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Section 2: Link Telegram Account (Chat ID) */}
      <div className="p-5 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-indigo-400" />
            <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
              {t('settings.telegram.chatIdLabel')}
            </h4>
          </div>
          {chatId ? (
            <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-lg border border-emerald-500/20 flex items-center space-x-1">
              <Check className="w-3 h-3" />
              <span>Chat ID: {chatId}</span>
            </span>
          ) : (
            <span className="text-xs text-amber-400 font-semibold">Not Linked Yet</span>
          )}
        </div>

        <p className="text-xs text-slate-400">{t('settings.telegram.chatIdDesc')}</p>

        {/* Link Account Detection Flow */}
        <div className="space-y-3 pt-1">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <button
              type="button"
              onClick={handleAutoDetectChatId}
              disabled={isDetectingChatId}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold transition flex items-center justify-center space-x-2 shadow-lg shadow-indigo-600/20"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isDetectingChatId ? 'animate-spin' : ''}`} />
              <span>{isDetectingChatId ? t('settings.telegram.autoDetecting') : t('settings.telegram.autoDetectChatId')}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowManualChatId(!showManualChatId)}
              className="px-3.5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-300 transition"
            >
              {showManualChatId ? 'Hide Manual Input' : t('settings.telegram.manualChatId')}
            </button>
          </div>

          {/* Detection Instruction Tip */}
          <div className="text-[11px] text-slate-500 flex items-start space-x-1.5">
            <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
            <span>
              Instructions: Send any message (e.g. <code>/start</code> or <code>hello</code>) to your bot on Telegram, then click{' '}
              <strong>Auto-Detect Chat ID</strong>.
            </span>
          </div>

          {chatIdDetectionResult?.ok && (
            <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-300 flex items-center space-x-2">
              <CheckCircle className="w-4 h-4 text-indigo-400 shrink-0" />
              <span>
                Detected Chat ID: <strong className="text-white font-mono">{chatIdDetectionResult.chatId}</strong> ({chatIdDetectionResult.fromName})
              </span>
            </div>
          )}

          {/* Manual Input Fallback */}
          {showManualChatId && (
            <div className="pt-2">
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Numeric Chat ID
              </label>
              <input
                type="number"
                value={manualChatIdInput}
                onChange={(e) => {
                  setManualChatIdInput(e.target.value);
                  setChatId(e.target.value ? Number(e.target.value) : undefined);
                }}
                placeholder="e.g. 998877665"
                className="w-full max-w-xs px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          )}
        </div>
      </div>

      {/* Section 3: Bridge Mode Selection (Option A vs Option B) */}
      <div className="p-5 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-4">
        <div className="flex items-center space-x-2">
          <Radio className="w-4 h-4 text-emerald-400" />
          <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
            {t('settings.telegram.bridgeMode')}
          </h4>
        </div>
        <p className="text-xs text-slate-400">{t('settings.telegram.bridgeModeDesc')}</p>

        {/* Segmented Mode Selector */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
          {/* Option A Card */}
          <div
            onClick={() => setBridgeMode('worker')}
            className={`p-4 rounded-2xl border cursor-pointer transition flex flex-col justify-between space-y-3 ${
              bridgeMode === 'worker'
                ? 'bg-sky-500/10 border-sky-500 text-white'
                : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 text-slate-300'
            }`}
          >
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs flex items-center space-x-1.5">
                  <Globe className="w-4 h-4 text-sky-400" />
                  <span>{t('settings.telegram.modeWorker')}</span>
                </span>
                <input
                  type="radio"
                  name="bridgeMode"
                  checked={bridgeMode === 'worker'}
                  onChange={() => setBridgeMode('worker')}
                  className="accent-sky-500"
                />
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                {t('settings.telegram.modeWorkerDesc')}
              </p>
            </div>
            <div className="text-[10px] uppercase font-mono font-bold text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded w-max">
              24/7 Mobile Ready
            </div>
          </div>

          {/* Option B Card */}
          <div
            onClick={() => setBridgeMode('daemon')}
            className={`p-4 rounded-2xl border cursor-pointer transition flex flex-col justify-between space-y-3 ${
              bridgeMode === 'daemon'
                ? 'bg-emerald-500/10 border-emerald-500 text-white'
                : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 text-slate-300'
            }`}
          >
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs flex items-center space-x-1.5">
                  <Terminal className="w-4 h-4 text-emerald-400" />
                  <span>{t('settings.telegram.modeDaemon')}</span>
                </span>
                <input
                  type="radio"
                  name="bridgeMode"
                  checked={bridgeMode === 'daemon'}
                  onChange={() => setBridgeMode('daemon')}
                  className="accent-emerald-500"
                />
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                {t('settings.telegram.modeDaemonDesc')}
              </p>
            </div>
            <div className="text-[10px] uppercase font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded w-max">
              Zero Cloud Setup
            </div>
          </div>
        </div>

        {/* Bridge Mode Specific Fields */}
        {bridgeMode === 'worker' ? (
          <div className="pt-2 space-y-3 border-t border-slate-800/60">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                {t('settings.telegram.workerUrl')}
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="url"
                  value={workerUrl}
                  onChange={(e) => setWorkerUrl(e.target.value)}
                  placeholder={t('settings.telegram.workerUrlPlaceholder')}
                  className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-sky-500 placeholder:text-slate-600"
                />
                <button
                  type="button"
                  onClick={handleVerifyWorker}
                  disabled={isVerifyingWorker || !workerUrl.trim()}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:text-slate-600 text-white text-xs font-bold border border-slate-700 transition flex items-center justify-center space-x-1.5 shrink-0"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isVerifyingWorker ? 'animate-spin' : ''}`} />
                  <span>{isVerifyingWorker ? t('settings.telegram.verifying') : t('settings.telegram.verifyWebhook')}</span>
                </button>
              </div>
            </div>

            {workerVerifyResult?.ok && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 flex items-center space-x-2">
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{workerVerifyResult.statusText || 'Cloudflare Worker is online and reachable!'}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                {t('settings.telegram.workerSecret')}
              </label>
              <input
                type="password"
                value={workerSecret}
                onChange={(e) => setWorkerSecret(e.target.value)}
                placeholder="Optional secret token for request verification"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-sky-500 placeholder:text-slate-600"
              />
            </div>
          </div>
        ) : (
          <div className="pt-2 space-y-3 border-t border-slate-800/60">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                {t('settings.telegram.daemonCommand')}
              </label>
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 font-mono text-xs text-emerald-400 flex items-center justify-between gap-2 overflow-x-auto">
                <code>{daemonCommand}</code>
                <button
                  type="button"
                  onClick={handleCopyDaemon}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-sans font-semibold border border-slate-700 flex items-center space-x-1 shrink-0 transition"
                >
                  {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{isCopied ? t('settings.telegram.copied') : t('settings.telegram.copyCommand')}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Section 4: Master PIN Encryption & Save Action */}
      <div className="p-5 rounded-2xl bg-slate-950/60 border border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <label className="block text-xs font-bold text-slate-200 flex items-center space-x-1.5">
            <Lock className="w-3.5 h-3.5 text-emerald-400" />
            <span>Master PIN for Credential Encryption</span>
          </label>
          <input
            type="password"
            maxLength={6}
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value)}
            placeholder="Enter 6-digit PIN"
            className="w-full sm:w-44 px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-emerald-500 placeholder:tracking-normal placeholder:text-xs"
          />
        </div>

        <button
          type="button"
          onClick={handleSaveSettings}
          disabled={isSaving}
          className="px-6 py-3 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 disabled:opacity-50 text-white font-bold text-xs sm:text-sm shadow-lg shadow-sky-500/20 transition flex items-center justify-center space-x-2 shrink-0"
        >
          {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
          <span>{isSaving ? t('settings.telegram.saving') : t('settings.telegram.saveSettings')}</span>
        </button>
      </div>

      {/* Section 5: In-App Step-by-Step Tutorial */}
      <div className="pt-2 border-t border-slate-800/80">
        <button
          type="button"
          onClick={() => setIsTutorialOpen(!isTutorialOpen)}
          className="w-full p-3.5 rounded-2xl bg-slate-950/40 hover:bg-slate-950/80 border border-slate-800 flex items-center justify-between text-left transition"
        >
          <div className="flex items-center space-x-2.5">
            <Info className="w-4 h-4 text-sky-400" />
            <span className="text-xs font-bold text-white tracking-wide">
              {t('settings.telegram.tutorialTitle')}
            </span>
          </div>
          {isTutorialOpen ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </button>

        {isTutorialOpen && (
          <div className="mt-3 p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-4 text-xs">
            {/* Step 1 */}
            <div className="flex items-start space-x-3">
              <span className="w-6 h-6 rounded-full bg-sky-500/10 text-sky-400 font-bold flex items-center justify-center shrink-0 border border-sky-500/20 text-xs">
                1
              </span>
              <div>
                <h5 className="font-bold text-white">{t('settings.telegram.step1Title')}</h5>
                <p className="text-slate-400 mt-0.5 leading-relaxed">{t('settings.telegram.step1Desc')}</p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex items-start space-x-3">
              <span className="w-6 h-6 rounded-full bg-sky-500/10 text-sky-400 font-bold flex items-center justify-center shrink-0 border border-sky-500/20 text-xs">
                2
              </span>
              <div>
                <h5 className="font-bold text-white">{t('settings.telegram.step2Title')}</h5>
                <p className="text-slate-400 mt-0.5 leading-relaxed">{t('settings.telegram.step2Desc')}</p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex items-start space-x-3">
              <span className="w-6 h-6 rounded-full bg-sky-500/10 text-sky-400 font-bold flex items-center justify-center shrink-0 border border-sky-500/20 text-xs">
                3
              </span>
              <div>
                <h5 className="font-bold text-white">{t('settings.telegram.step3Title')}</h5>
                <p className="text-slate-400 mt-0.5 leading-relaxed">{t('settings.telegram.step3Desc')}</p>
              </div>
            </div>

            {/* Step 4 */}
            <div className="flex items-start space-x-3">
              <span className="w-6 h-6 rounded-full bg-sky-500/10 text-sky-400 font-bold flex items-center justify-center shrink-0 border border-sky-500/20 text-xs">
                4
              </span>
              <div>
                <h5 className="font-bold text-white">{t('settings.telegram.step4Title')}</h5>
                <p className="text-slate-400 mt-0.5 leading-relaxed">{t('settings.telegram.step4Desc')}</p>
              </div>
            </div>

            {/* Step 5 */}
            <div className="flex items-start space-x-3">
              <span className="w-6 h-6 rounded-full bg-sky-500/10 text-sky-400 font-bold flex items-center justify-center shrink-0 border border-sky-500/20 text-xs">
                5
              </span>
              <div>
                <h5 className="font-bold text-white">{t('settings.telegram.step5Title')}</h5>
                <p className="text-slate-400 mt-0.5 leading-relaxed">{t('settings.telegram.step5Desc')}</p>
                <div className="mt-2 p-2.5 rounded-xl bg-slate-900 border border-slate-800 font-mono text-[11px] text-slate-300 space-y-1">
                  <div>• "kopi kenangan 35k bca" &rarr; Expense 35,000 IDR (Food, BCA)</div>
                  <div>• "beli bensin gocap cash" &rarr; Expense 50,000 IDR (Transport, Cash)</div>
                  <div>• "lunch 12.50 card" &rarr; Expense 12.50 (Food, Card)</div>
                  <div>• Or send a clear photo of any store receipt!</div>
                </div>
              </div>
            </div>

            {/* Step 6 */}
            <div className="flex items-start space-x-3">
              <span className="w-6 h-6 rounded-full bg-sky-500/10 text-sky-400 font-bold flex items-center justify-center shrink-0 border border-sky-500/20 text-xs">
                6
              </span>
              <div>
                <h5 className="font-bold text-white">{t('settings.telegram.step6Title')}</h5>
                <p className="text-slate-400 mt-0.5 leading-relaxed">{t('settings.telegram.step6Desc')}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
