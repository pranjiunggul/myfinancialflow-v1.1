/**
 * Searchable Encrypted AI Chat History Service
 * Persists assistant conversations in Dexie v6 (ai_chat_sessions table)
 * Encrypted at rest using PIN-derived AES-GCM-256 (format: financeflow_enc_v1).
 * Supports keyword search, date filtering, and multi-session persistence.
 */

import { db } from '../db/database';
import { encryptData, decryptData } from './crypto';
import type { AIChatSession, ChatMessage } from '../types';

/**
 * Saves or updates a chat session with full AES-GCM-256 encryption
 */
export async function saveChatSession(
  sessionId: string,
  title: string,
  messages: ChatMessage[],
  masterPin = '000000'
): Promise<AIChatSession> {
  const encryptedPayload = await encryptData(messages, masterPin);

  const existing = await db.ai_chat_sessions.get(sessionId);

  const record: AIChatSession = {
    id: sessionId,
    title: title || (messages[0]?.content.slice(0, 30) || 'New Conversation'),
    createdAt: existing?.createdAt || Date.now(),
    updatedAt: Date.now(),
    messageCount: messages.length,
    encryptedPayload,
    isDeleted: false,
  };

  await db.ai_chat_sessions.put(record);
  return record;
}

/**
 * Lists all active chat sessions (metadata only, without decrypting all contents)
 */
export async function listChatSessions(): Promise<AIChatSession[]> {
  try {
    return await db.ai_chat_sessions
      .filter((s) => !s.isDeleted)
      .reverse()
      .sortBy('updatedAt');
  } catch (err) {
    console.warn('Error listing chat sessions:', err);
    return [];
  }
}

/**
 * Loads and decrypts full chat messages for a specific session
 */
export async function loadChatSessionMessages(
  sessionId: string,
  masterPin = '000000'
): Promise<ChatMessage[]> {
  const session = await db.ai_chat_sessions.get(sessionId);
  if (!session || session.isDeleted) return [];

  try {
    const decrypted = await decryptData<ChatMessage[]>(session.encryptedPayload, masterPin);
    return Array.isArray(decrypted) ? decrypted : [];
  } catch (err) {
    console.warn(`Failed to decrypt chat session ${sessionId}:`, err);
    return [];
  }
}

/**
 * Soft deletes a chat session
 */
export async function deleteChatSession(sessionId: string): Promise<void> {
  await db.ai_chat_sessions.update(sessionId, {
    isDeleted: true,
    updatedAt: Date.now(),
  });
}

/**
 * Searches across chat sessions by keyword and optional date range
 */
export async function searchChatHistory(
  keyword: string,
  startDate?: string,
  endDate?: string,
  masterPin = '000000'
): Promise<Array<{ session: AIChatSession; matchingMessages: ChatMessage[] }>> {
  const allSessions = await listChatSessions();
  const results: Array<{ session: AIChatSession; matchingMessages: ChatMessage[] }> = [];

  const lowerKey = keyword.toLowerCase().trim();

  for (const session of allSessions) {
    // Check date range against session creation/update
    if (startDate) {
      const sessionDate = new Date(session.updatedAt).toISOString().split('T')[0];
      if (sessionDate < startDate) continue;
    }
    if (endDate) {
      const sessionDate = new Date(session.updatedAt).toISOString().split('T')[0];
      if (sessionDate > endDate) continue;
    }

    try {
      const messages = await loadChatSessionMessages(session.id, masterPin);
      const matches = messages.filter((m) =>
        lowerKey ? m.content.toLowerCase().includes(lowerKey) : true
      );

      if (matches.length > 0 || session.title.toLowerCase().includes(lowerKey)) {
        results.push({
          session,
          matchingMessages: matches,
        });
      }
    } catch {
      // Skip undecryptable sessions
    }
  }

  return results;
}
