/**
 * Cloudflare Worker: Zero-Knowledge Telegram Inbound Relay (Option A)
 *
 * PRIVACY GUARANTEE:
 * This worker acts purely as a dumb relay for incoming Telegram webhooks.
 * It NEVER performs AI parsing, OCR, or stores the user's AI API keys.
 * All OCR and LLM processing happens 100% client-side in the FinanceFlow PWA.
 *
 * Deploy with Wrangler:
 * 1. npx wrangler init -y
 * 2. Set secret: npx wrangler secret put TELEGRAM_SECRET_TOKEN
 * 3. Set secret: npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_KEY (optional if syncing to Drive directly)
 * 4. Set bot webhook:
 *    curl -F "url=https://<your-worker>.workers.dev/webhook" \
 *         -F "secret_token=<TELEGRAM_SECRET_TOKEN>" \
 *         https://api.telegram.org/bot<BOT_TOKEN>/setWebhook
 */

export interface Env {
  TELEGRAM_SECRET_TOKEN: string;
  BOT_TOKEN?: string;
  // Optional Cloudflare KV or Google Drive OAuth credentials
  INBOX_KV?: KVNamespace;
  GOOGLE_ACCESS_TOKEN?: string;
  ALLOWED_CHAT_ID?: string; // Optional filter to only accept messages from user's chat ID
}

interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

interface TelegramMessage {
  message_id: number;
  from?: {
    id: number;
    first_name: string;
    username?: string;
  };
  chat: {
    id: number;
    type: string;
  };
  date: number;
  text?: string;
  caption?: string;
  photo?: TelegramPhotoSize[];
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const corsHeaders: Record<string, string> = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Telegram-Bot-Api-Secret-Token',
    };

    // Handle CORS preflight OPTIONS request
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Only accept POST requests
    if (request.method !== 'POST') {
      return new Response('FinanceFlow Telegram Relay Active. Awaiting webhooks.', {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'text/plain' },
      });
    }

    // 1. Verify Telegram Secret Token header for authenticity
    const secretHeader = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
    if (env.TELEGRAM_SECRET_TOKEN && secretHeader !== env.TELEGRAM_SECRET_TOKEN) {
      return new Response('Unauthorized webhook signature', { status: 403, headers: corsHeaders });
    }

    try {
      const update: TelegramUpdate = await request.json();
      if (!update.message) {
        return new Response('OK (No message)', { status: 200 });
      }

      const msg = update.message;

      // Optional chat ID restriction for single-user security
      if (env.ALLOWED_CHAT_ID && String(msg.chat.id) !== String(env.ALLOWED_CHAT_ID)) {
        return new Response('Ignored (Unauthorized chat ID)', { status: 200 });
      }

      // 2. Extract raw inbound data (Text or Photo)
      const isPhoto = Array.isArray(msg.photo) && msg.photo.length > 0;
      const rawText = msg.text || msg.caption || '';
      let fileId: string | undefined;

      if (isPhoto && msg.photo) {
        // Pick largest resolution photo
        const bestPhoto = msg.photo[msg.photo.length - 1];
        fileId = bestPhoto.file_id;
      }

      const inboxPayload = {
        id: `tg_${update.update_id}_${msg.message_id}`,
        updateId: update.update_id,
        messageId: msg.message_id,
        chatId: msg.chat.id,
        fromName: msg.from?.first_name || 'Telegram User',
        timestamp: (msg.date || Math.floor(Date.now() / 1000)) * 1000,
        type: isPhoto ? 'photo' : 'text',
        rawText,
        fileId,
        status: 'pending',
        createdAt: Date.now(),
      };

      // 3. Relay raw payload into Google Drive appDataFolder queue or KV
      if (env.INBOX_KV) {
        // Store in Cloudflare KV buffer for PWA polling
        await env.INBOX_KV.put(`inbox_${inboxPayload.id}`, JSON.stringify(inboxPayload), {
          expirationTtl: 86400 * 7, // 7 days retention
        });
      }

      // If Google Access Token is provided, push directly to Drive raw_inbox_queue.json
      if (env.GOOGLE_ACCESS_TOKEN) {
        await appendToGoogleDriveQueue(inboxPayload, env.GOOGLE_ACCESS_TOKEN);
      }

      return new Response(JSON.stringify({ status: 'ok', id: inboxPayload.id }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err: any) {
      return new Response(`Relay Error: ${err.message}`, { status: 500 });
    }
  },
};

/**
 * Append raw queue item into Google Drive appDataFolder/raw_inbox_queue.json
 */
async function appendToGoogleDriveQueue(item: any, accessToken: string) {
  // 1. Search for existing raw_inbox_queue.json in appDataFolder
  const searchUrl = 'https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name=%27raw_inbox_queue.json%27&fields=files(id,name)';
  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!searchRes.ok) return;
  const searchData = await searchRes.json();
  const file = searchData.files?.[0];

  let queueItems: any[] = [];

  if (file?.id) {
    // Download existing queue
    const dlRes = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (dlRes.ok) {
      try {
        queueItems = await dlRes.json();
      } catch (_) {
        queueItems = [];
      }
    }
  }

  // Append new item
  queueItems.push(item);

  // Upload updated queue
  const body = JSON.stringify(queueItems);
  if (file?.id) {
    await fetch(`https://www.googleapis.com/upload/drive/v3/files/${file.id}?uploadType=media`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body,
    });
  } else {
    // Create new file
    const meta = {
      name: 'raw_inbox_queue.json',
      parents: ['appDataFolder'],
    };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
    form.append('file', new Blob([body], { type: 'application/json' }));

    await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    });
  }
}
