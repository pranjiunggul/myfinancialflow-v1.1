/**
 * Cloudflare Worker: Zero-Knowledge Telegram Inbound Relay (Pure JavaScript version)
 *
 * Compatible with Cloudflare Dashboard's in-browser editor (worker.js)
 */
export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Telegram-Bot-Api-Secret-Token',
    };

    // Handle CORS preflight OPTIONS request
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Handle browser health-check GET requests
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
      const update = await request.json();
      if (!update.message) {
        return new Response('OK (No message)', { status: 200, headers: corsHeaders });
      }

      const msg = update.message;

      // Optional chat ID restriction for single-user security
      if (env.ALLOWED_CHAT_ID && String(msg.chat.id) !== String(env.ALLOWED_CHAT_ID)) {
        return new Response('Ignored (Unauthorized chat ID)', { status: 200, headers: corsHeaders });
      }

      // 2. Extract raw inbound data (Text or Photo)
      const isPhoto = Array.isArray(msg.photo) && msg.photo.length > 0;
      const rawText = msg.text || msg.caption || '';
      let fileId;

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
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (err) {
      return new Response(`Relay Error: ${err.message}`, { status: 500, headers: corsHeaders });
    }
  },
};

/**
 * Append raw queue item into Google Drive appDataFolder/raw_inbox_queue.json
 */
async function appendToGoogleDriveQueue(item, accessToken) {
  const searchUrl =
    'https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name=%27raw_inbox_queue.json%27&fields=files(id,name)';
  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!searchRes.ok) return;
  const searchData = await searchRes.json();
  const file = searchData.files?.[0];

  let queueItems = [];

  if (file?.id) {
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

  queueItems.push(item);

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
