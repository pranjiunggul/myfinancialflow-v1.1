/**
 * Telegram Long-Polling Local Daemon (Option B)
 *
 * ZERO TUNNELS / ZERO PUBLIC ENDPOINTS REQUIRED.
 * Runs locally on your computer using Telegram's native getUpdates long-polling API.
 *
 * PRIVACY GUARANTEE:
 * Does not process your transactions with third-party servers.
 * Collects incoming receipts/messages and stores them in a local queue file
 * for client-side processing inside FinanceFlow PWA.
 *
 * Usage:
 *   npx tsx scripts/telegram-daemon.ts --token YOUR_BOT_TOKEN
 * or set env:
 *   TELEGRAM_BOT_TOKEN=YOUR_BOT_TOKEN npx tsx scripts/telegram-daemon.ts
 */

import * as fs from 'fs';
import * as path from 'path';

interface DaemonConfig {
  botToken: string;
  allowedChatId?: number;
  pollIntervalSec: number;
  outputFilePath: string;
  lastUpdateId: number;
}

const DEFAULT_CONFIG_FILE = path.resolve(process.cwd(), '.telegram-daemon.json');
const DEFAULT_INBOX_FILE = path.resolve(process.cwd(), 'telegram_inbox_queue.json');

function loadConfig(): DaemonConfig {
  let token = process.env.TELEGRAM_BOT_TOKEN || '';
  let allowedChatId = process.env.TELEGRAM_CHAT_ID ? Number(process.env.TELEGRAM_CHAT_ID) : undefined;
  let lastUpdateId = 0;

  if (fs.existsSync(DEFAULT_CONFIG_FILE)) {
    try {
      const saved = JSON.parse(fs.readFileSync(DEFAULT_CONFIG_FILE, 'utf-8'));
      if (!token && saved.botToken) token = saved.botToken;
      if (!allowedChatId && saved.allowedChatId) allowedChatId = saved.allowedChatId;
      if (saved.lastUpdateId) lastUpdateId = saved.lastUpdateId;
    } catch (_) {}
  }

  // Parse CLI args
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--token' && args[i + 1]) {
      token = args[i + 1];
      i++;
    } else if (args[i] === '--chat-id' && args[i + 1]) {
      allowedChatId = Number(args[i + 1]);
      i++;
    }
  }

  return {
    botToken: token,
    allowedChatId,
    pollIntervalSec: 2,
    outputFilePath: DEFAULT_INBOX_FILE,
    lastUpdateId,
  };
}

function saveConfig(config: DaemonConfig) {
  try {
    fs.writeFileSync(DEFAULT_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
  } catch (_) {}
}

function appendToLocalQueue(filePath: string, item: any) {
  let queue: any[] = [];
  if (fs.existsSync(filePath)) {
    try {
      queue = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      if (!Array.isArray(queue)) queue = [];
    } catch (_) {
      queue = [];
    }
  }

  // Deduplicate
  if (!queue.some((q) => q.id === item.id)) {
    queue.push(item);
    fs.writeFileSync(filePath, JSON.stringify(queue, null, 2), 'utf-8');
  }
}

async function fetchTelegramPhotoBase64(botToken: string, fileId: string): Promise<string | undefined> {
  try {
    const fileRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`);
    if (!fileRes.ok) return undefined;
    const fileData = await fileRes.json();
    const filePath = fileData.result?.file_path;
    if (!filePath) return undefined;

    const downloadRes = await fetch(`https://api.telegram.org/file/bot${botToken}/${filePath}`);
    if (!downloadRes.ok) return undefined;

    const buffer = Buffer.from(await downloadRes.arrayBuffer());
    return `data:image/jpeg;base64,${buffer.toString('base64')}`;
  } catch (err) {
    console.error('Failed to download photo:', err);
    return undefined;
  }
}

export async function runTelegramDaemon(customConfig?: Partial<DaemonConfig>) {
  const config = { ...loadConfig(), ...customConfig };

  if (!config.botToken) {
    console.error('❌ Error: Telegram Bot Token is required.');
    console.log('\nPlease provide your token using:');
    console.log('  npx tsx scripts/telegram-daemon.ts --token <YOUR_TELEGRAM_BOT_TOKEN>');
    console.log('or set environment variable:');
    console.log('  set TELEGRAM_BOT_TOKEN=<YOUR_TELEGRAM_BOT_TOKEN>');
    return;
  }

  console.log('🤖 FinanceFlow Telegram Long-Polling Daemon (Option B)');
  console.log(`📁 Local Queue File: ${config.outputFilePath}`);
  console.log('🔒 Security: Zero public endpoints or tunnels. Direct long-polling getUpdates.\n');
  console.log('Connecting to Telegram Bot API...');

  try {
    // Verify bot token
    const meRes = await fetch(`https://api.telegram.org/bot${config.botToken}/getMe`);
    if (!meRes.ok) {
      throw new Error(`Invalid bot token (HTTP ${meRes.status})`);
    }
    const me = await meRes.json();
    console.log(`✅ Authenticated as @${me.result?.username} (${me.result?.first_name})`);
    console.log('🚀 Listening for incoming receipts and transaction messages (Ctrl+C to stop)...\n');
  } catch (err: any) {
    console.error('❌ Authentication failed:', err.message);
    return;
  }

  let isRunning = true;
  process.on('SIGINT', () => {
    console.log('\nStopping daemon gracefully...');
    isRunning = false;
    process.exit(0);
  });

  let offset = config.lastUpdateId > 0 ? config.lastUpdateId + 1 : 0;

  while (isRunning) {
    try {
      const url = `https://api.telegram.org/bot${config.botToken}/getUpdates?offset=${offset}&timeout=20`;
      const res = await fetch(url);

      if (!res.ok) {
        console.warn(`Polling error (HTTP ${res.status}). Retrying in 5s...`);
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }

      const data = await res.json();
      const updates = data.result || [];

      for (const update of updates) {
        offset = update.update_id + 1;
        config.lastUpdateId = update.update_id;
        saveConfig(config);

        const msg = update.message;
        if (!msg) continue;

        if (config.allowedChatId && msg.chat?.id !== config.allowedChatId) {
          console.log(`⚠️ Ignored message from unauthorized chat ID: ${msg.chat?.id}`);
          continue;
        }

        const isPhoto = Array.isArray(msg.photo) && msg.photo.length > 0;
        let photoBase64: string | undefined;

        if (isPhoto && msg.photo) {
          const best = msg.photo[msg.photo.length - 1];
          console.log(`📸 Received photo receipt from ${msg.from?.first_name || 'User'} (${best.width}x${best.height}). Downloading...`);
          photoBase64 = await fetchTelegramPhotoBase64(config.botToken, best.file_id);
        }

        const rawText = msg.text || msg.caption || '';
        const item = {
          id: `tg_${update.update_id}_${msg.message_id}`,
          updateId: update.update_id,
          messageId: msg.message_id,
          chatId: msg.chat.id,
          fromName: msg.from?.first_name || 'Telegram User',
          timestamp: (msg.date || Math.floor(Date.now() / 1000)) * 1000,
          type: isPhoto ? 'photo' : 'text',
          rawText,
          photoBase64,
          status: 'pending',
          createdAt: Date.now(),
        };

        appendToLocalQueue(config.outputFilePath, item);
        console.log(`📥 Queued ${item.type.toUpperCase()}: "${rawText || 'Photo Receipt'}" -> [${item.id}]`);

        // Send friendly acknowledgement back to user on Telegram
        try {
          const ackText = isPhoto
            ? `🧾 Receipt received! Saved to your FinanceFlow inbox. Open your app to confirm.`
            : `✍️ Transaction noted: "${rawText}". Saved to FinanceFlow inbox for your review.`;
          await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: msg.chat.id,
              text: ackText,
              reply_to_message_id: msg.message_id,
            }),
          });
        } catch (_) {}
      }
    } catch (err: any) {
      console.error('Polling loop error:', err.message);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

// Allow direct CLI execution if executed directly
if (process.argv[1] && process.argv[1].endsWith('telegram-daemon.ts')) {
  runTelegramDaemon().catch(console.error);
}
