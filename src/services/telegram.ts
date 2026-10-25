/**
 * Telegram Inbound Ingestion Service for FinanceFlow
 * Zero-Knowledge Principle:
 * External worker/daemon only relays raw inbound text or image payloads.
 * All AI parsing and OCR occurs client-side using locally stored keys.
 * All database mutations require explicit user confirmation through the Review Tray.
 */

import { db } from '../db/database';
import { parseFreeFormOffline, executeConfirmedProposal } from './ai';
import { scanReceiptImage, scanReceiptWithAI, createProposalFromOCR } from './ocr';
import { encryptData, decryptData, type EncryptedPayload } from './crypto';
import type {
  TelegramInboxItem,
  ActionProposal,
  Account,
  Category,
  CurrencyCode,
  AppSettings,
} from '../types';

function base64ToBlob(base64: string): Blob {
  const parts = base64.split(';base64,');
  const contentType = parts[0].replace('data:', '') || 'image/jpeg';
  const raw = atob(parts[1] || parts[0]);
  const rawLength = raw.length;
  const uInt8Array = new Uint8Array(rawLength);
  for (let i = 0; i < rawLength; ++i) {
    uInt8Array[i] = raw.charCodeAt(i);
  }
  return new Blob([uInt8Array], { type: contentType });
}

/**
 * Enqueue a raw incoming Telegram item to IndexedDB
 */
export async function enqueueTelegramItem(
  rawItem: Omit<TelegramInboxItem, 'id' | 'createdAt'> & { id?: string }
): Promise<TelegramInboxItem> {
  const item: TelegramInboxItem = {
    id: rawItem.id || `tg_${rawItem.updateId || Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    updateId: rawItem.updateId || Date.now(),
    messageId: rawItem.messageId || 0,
    chatId: rawItem.chatId || 0,
    fromName: rawItem.fromName || 'Telegram User',
    timestamp: rawItem.timestamp || Date.now(),
    type: rawItem.type || 'text',
    rawText: rawItem.rawText || '',
    photoUrl: rawItem.photoUrl,
    photoBase64: rawItem.photoBase64,
    fileId: rawItem.fileId,
    status: rawItem.status || 'pending',
    createdAt: Date.now(),
  };

  // Prevent duplicate insertion
  const existing = await db.telegram_inbox.get(item.id);
  if (!existing) {
    await db.telegram_inbox.put(item);
  }
  return item;
}

/**
 * Get all pending Telegram inbox items awaiting review
 */
export async function getPendingTelegramItems(): Promise<TelegramInboxItem[]> {
  return db.telegram_inbox
    .filter((item) => item.status === 'pending')
    .reverse()
    .sortBy('timestamp');
}

/**
 * Process/parse a raw Telegram item client-side into an ActionProposal
 * Zero-write: only generates proposal data, does NOT commit to ledger!
 */
export async function parseTelegramItemToProposal(
  item: TelegramInboxItem,
  accounts: Account[],
  categories: Category[],
  baseCurrency: CurrencyCode,
  _settings?: AppSettings | null
): Promise<ActionProposal | null> {
  // If already parsed, return existing proposal
  if (item.processedProposal) {
    return item.processedProposal;
  }

  let proposal: ActionProposal | null = null;

  // Case 1: Photo / Receipt Image
  if (item.type === 'photo' && item.photoBase64) {
    try {
      const blob = base64ToBlob(item.photoBase64);
      let ocrResult: any = null;
      if (_settings?.aiEnabled !== false) {
        try {
          ocrResult = await scanReceiptWithAI(blob, { accounts, categories, baseCurrency, settings: _settings });
        } catch (aiErr) {
          console.warn('Telegram AI vision failed, falling back to local OCR:', aiErr);
        }
      }
      if (!ocrResult) {
        ocrResult = await scanReceiptImage(blob);
      }
      proposal = createProposalFromOCR(ocrResult, accounts, categories, baseCurrency);
      proposal.summary = `[Telegram Photo OCR] ${proposal.summary}`;
      proposal.data.inputSource = 'telegram';
      if (item.rawText && (!proposal.data.description || proposal.data.description === 'Receipt Purchase' || proposal.data.description === 'Transaksi')) {
        proposal.data.description = item.rawText;
      }
    } catch (err) {
      console.warn('Telegram photo OCR failed client-side:', err);
    }
  }

  // Case 2: Text Message (or fallback if photo OCR failed but has caption)
  const textToParse = item.rawText || (item.type === 'text' ? item.rawText : '');
  if (!proposal && textToParse) {
    proposal = parseFreeFormOffline(textToParse, accounts, categories, baseCurrency);
    if (proposal) {
      proposal.summary = `[Telegram Inbound] ${proposal.summary}`;
      proposal.data.inputSource = 'telegram';
    }
  }

  // If parsed, attach to item and update DB
  if (proposal) {
    item.processedProposal = proposal;
    await db.telegram_inbox.update(item.id, {
      processedProposal: proposal,
    });
  }

  return proposal;
}

/**
 * User Confirmation Gate: Commit a Telegram proposal to ledger
 */
export async function confirmTelegramItem(
  item: TelegramInboxItem,
  context: { accounts: Account[]; categories: Category[]; baseCurrency: CurrencyCode }
): Promise<void> {
  let proposal = item.processedProposal;
  if (!proposal) {
    proposal = (await parseTelegramItemToProposal(
      item,
      context.accounts,
      context.categories,
      context.baseCurrency
    )) || undefined;
  }

  if (!proposal) {
    throw new Error(`Cannot confirm Telegram item ${item.id}: failed to parse into valid proposal.`);
  }

  // Execute to ledger
  await executeConfirmedProposal(proposal, context);

  // Mark item as processed
  item.status = 'processed';
  await db.telegram_inbox.update(item.id, {
    status: 'processed',
    processedProposal: proposal,
  });
}

/**
 * Reject a Telegram inbound item
 */
export async function rejectTelegramItem(itemId: string): Promise<void> {
  await db.telegram_inbox.update(itemId, { status: 'rejected' });
}

/**
 * Batch confirm all pending items
 */
export async function confirmAllTelegramItems(
  items: TelegramInboxItem[],
  context: { accounts: Account[]; categories: Category[]; baseCurrency: CurrencyCode }
): Promise<{ confirmed: number; failed: number }> {
  let confirmed = 0;
  let failed = 0;

  for (const item of items) {
    try {
      await confirmTelegramItem(item, context);
      confirmed++;
    } catch (err) {
      console.error(`Failed to confirm item ${item.id}:`, err);
      failed++;
    }
  }

  return { confirmed, failed };
}

/**
 * Ingest remote queue from Google Drive (raw_inbox_queue.json)
 */
export async function syncTelegramQueueFromRemote(
  remoteQueueJson: string
): Promise<{ imported: number }> {
  let imported = 0;
  try {
    const rawItems: any[] = JSON.parse(remoteQueueJson);
    if (!Array.isArray(rawItems)) return { imported: 0 };

    for (const raw of rawItems) {
      const id = raw.id || `tg_${raw.updateId}_${raw.messageId}`;
      const exists = await db.telegram_inbox.get(id);
      if (!exists) {
        await enqueueTelegramItem({
          ...raw,
          id,
          status: 'pending',
        });
        imported++;
      }
    }
  } catch (err) {
    console.error('Failed to parse remote Telegram queue JSON:', err);
  }
  return { imported };
}

/**
 * Test Telegram Bot token validity using Telegram getMe API
 */
export async function testTelegramBot(
  token: string,
  fetchFn: typeof fetch = fetch
): Promise<{ ok: boolean; username?: string; firstName?: string; error?: string }> {
  const cleanToken = token.trim();
  if (!cleanToken) {
    return { ok: false, error: 'Telegram Bot Token cannot be empty' };
  }

  try {
    const res = await fetchFn(`https://api.telegram.org/bot${cleanToken}/getMe`);
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok && data.result) {
      return {
        ok: true,
        username: data.result.username ? `@${data.result.username}` : undefined,
        firstName: data.result.first_name,
      };
    }
    return {
      ok: false,
      error: data.description || `Telegram API error (HTTP ${res.status})`,
    };
  } catch (err: any) {
    return {
      ok: false,
      error: err.message || 'Network error reaching Telegram API',
    };
  }
}

/**
 * Auto-detect user Chat ID by inspecting recent inbound messages via getUpdates
 */
export async function detectTelegramChatId(
  token: string,
  fetchFn: typeof fetch = fetch
): Promise<{ ok: boolean; chatId?: number; fromName?: string; username?: string; error?: string }> {
  const cleanToken = token.trim();
  if (!cleanToken) {
    return { ok: false, error: 'Telegram Bot Token cannot be empty' };
  }

  try {
    const res = await fetchFn(
      `https://api.telegram.org/bot${cleanToken}/getUpdates?limit=10&allowed_updates=["message"]`
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return {
        ok: false,
        error: data.description || `Failed to fetch updates from Telegram (HTTP ${res.status})`,
      };
    }

    const updates = Array.isArray(data.result) ? data.result : [];
    if (updates.length === 0) {
      return {
        ok: false,
        error:
          'No recent messages found. Please open your bot in Telegram and send a message (e.g. "hi" or "/start"), then try again.',
      };
    }

    // Find the latest update with a message
    for (let i = updates.length - 1; i >= 0; i--) {
      const u = updates[i];
      if (u.message && u.message.chat && typeof u.message.chat.id === 'number') {
        const msg = u.message;
        const fullName = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ');
        return {
          ok: true,
          chatId: msg.chat.id,
          fromName: fullName || msg.from?.username || 'Telegram User',
          username: msg.from?.username ? `@${msg.from.username}` : undefined,
        };
      }
    }

    return {
      ok: false,
      error: 'No standard chat messages found in recent updates. Please send a text message to your bot.',
    };
  } catch (err: any) {
    return {
      ok: false,
      error: err.message || 'Network error reaching Telegram getUpdates API',
    };
  }
}

/**
 * Verify Cloudflare Worker Webhook Relay endpoint
 */
export async function verifyWorkerWebhook(
  workerUrl: string,
  secret?: string,
  fetchFn: typeof fetch = fetch
): Promise<{ ok: boolean; statusText?: string; error?: string }> {
  const cleanUrl = workerUrl.trim();
  if (!cleanUrl) {
    return { ok: false, error: 'Cloudflare Worker URL cannot be empty' };
  }

  try {
    const headers: Record<string, string> = {};
    if (secret) {
      headers['X-Telegram-Bot-Api-Secret-Token'] = secret.trim();
    }
    const res = await fetchFn(cleanUrl, {
      method: 'GET',
      headers,
    });

    if (res.ok || res.status === 200) {
      return {
        ok: true,
        statusText: 'Cloudflare Worker relay is reachable and responsive',
      };
    }
    return {
      ok: false,
      error: `Worker returned HTTP ${res.status}: ${res.statusText || 'Unexpected response'}`,
    };
  } catch (err: any) {
    // If standard CORS request was blocked, attempt a lightweight no-cors ping
    try {
      await fetchFn(cleanUrl, { method: 'GET', mode: 'no-cors' });
      return {
        ok: true,
        statusText: 'Cloudflare Worker relay is online and reachable (confirmed via ping)',
      };
    } catch (_) {}

    return {
      ok: false,
      error: err.message || 'Failed to connect to Cloudflare Worker URL',
    };
  }
}

/**
 * Save Telegram Configuration with PIN encryption
 */
export async function saveTelegramConfig(params: {
  token?: string;
  pin: string;
  chatId?: number;
  bridgeMode?: 'worker' | 'daemon';
  workerUrl?: string;
  workerSecret?: string;
  botUsername?: string;
}): Promise<void> {
  const { pin, token, chatId, bridgeMode, workerUrl, workerSecret, botUsername } = params;

  if (!pin || pin.trim().length === 0) {
    throw new Error('Master PIN required to securely store Telegram bot credentials.');
  }

  const updates: Partial<AppSettings> = {
    telegramEnabled: true,
  };

  if (chatId !== undefined) {
    updates.telegramChatId = chatId;
  }
  if (bridgeMode) {
    updates.telegramBridgeMode = bridgeMode;
  }
  if (workerUrl !== undefined) {
    updates.telegramWorkerUrl = workerUrl.trim();
  }
  if (botUsername !== undefined) {
    updates.telegramBotUsername = botUsername.trim();
  }

  if (token && token.trim().length > 0) {
    const cleanToken = token.trim();
    const encrypted = await encryptData(cleanToken, pin.trim());
    updates.telegramBotTokenEnc = encrypted;

    // Mask token: e.g. 123456...4f8b
    if (cleanToken.length > 10) {
      updates.telegramBotTokenMasked = `${cleanToken.slice(0, 6)}...${cleanToken.slice(-4)}`;
    } else {
      updates.telegramBotTokenMasked = `...${cleanToken.slice(-3)}`;
    }
  }

  if (workerSecret && workerSecret.trim().length > 0) {
    const cleanSecret = workerSecret.trim();
    const encryptedSecret = await encryptData(cleanSecret, pin.trim());
    updates.telegramWorkerSecretEnc = encryptedSecret;
    updates.telegramWorkerSecretMasked =
      cleanSecret.length > 8 ? `${cleanSecret.slice(0, 4)}...${cleanSecret.slice(-3)}` : '••••••••';
  }

  updates.telegramLastActiveAt = Date.now();
  await db.settings.update('current', updates);
}

/**
 * Reveal / Decrypt Telegram Bot Token in memory using user PIN
 */
export async function revealTelegramToken(payload: EncryptedPayload, pin: string): Promise<string> {
  if (!pin) {
    throw new Error('Master PIN required to decrypt Telegram token.');
  }
  return decryptData<string>(payload, pin);
}

/**
 * Disconnect Telegram and clear stored credentials
 */
export async function disconnectTelegram(): Promise<void> {
  await db.settings.update('current', {
    telegramEnabled: false,
    telegramBotTokenEnc: undefined,
    telegramBotTokenMasked: undefined,
    telegramBotUsername: undefined,
    telegramChatId: undefined,
    telegramWorkerUrl: undefined,
    telegramWorkerSecretEnc: undefined,
    telegramWorkerSecretMasked: undefined,
    telegramLastActiveAt: undefined,
  });
}
