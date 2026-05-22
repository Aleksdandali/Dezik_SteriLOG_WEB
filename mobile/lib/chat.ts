import { api } from './api';

// Mirrors chat_conversations row + extras returned by /api/telegram/chat/conversations.
export type ChatConversation = {
  id: string;
  customer_phone: string | null;
  customer_name: string | null;
  customer_telegram_id: number | null;
  status: 'open' | 'closed' | string;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_sender: string | null;
  unread_by_manager: number;
};

// Mirrors chat_messages row.
export type ChatMessage = {
  id: string;
  conversation_id: string;
  sender_type: 'manager' | 'customer' | string;
  text: string | null;
  content_type: 'text' | 'image' | string;
  media_url: string | null;
  order_id: number | null;
  created_at: string;
};

export async function listConversations(
  status: 'open' | 'closed' = 'open',
): Promise<ChatConversation[]> {
  const res = await api<{ data: ChatConversation[] }>(
    `/api/telegram/chat/conversations?status=${status}`,
  );
  return res.data ?? [];
}

export async function loadMessages(
  conversationId: string,
  before?: string,
): Promise<{ messages: ChatMessage[]; hasMore: boolean }> {
  // Note: GET resets unread_by_manager on the server.
  const qs = before ? `?before=${encodeURIComponent(before)}` : '';
  const res = await api<{ data: ChatMessage[]; has_more: boolean }>(
    `/api/telegram/chat/conversations/${conversationId}/messages${qs}`,
  );
  return { messages: res.data ?? [], hasMore: !!res.has_more };
}

export async function sendMessage(
  conversationId: string,
  text: string,
  orderId?: number,
): Promise<ChatMessage> {
  const res = await api<{ data: ChatMessage }>(
    `/api/telegram/chat/conversations/${conversationId}/messages`,
    { method: 'POST', body: { text, order_id: orderId ?? null } },
  );
  return res.data;
}

// In-memory cache: list screen sets conversation, detail screen reads it
// without an extra round-trip (same pattern as orders.ts).
const cache = new Map<string, ChatConversation>();

export function cacheConversation(c: ChatConversation): void {
  cache.set(c.id, c);
}

export function getCachedConversation(id: string): ChatConversation | undefined {
  return cache.get(id);
}

// Optimistic local update of unread counter — server already does this on GET.
export function markConversationRead(id: string): void {
  const c = cache.get(id);
  if (c) cache.set(id, { ...c, unread_by_manager: 0 });
}

/** Drop all cached conversations. Called from logout. */
export function clearChatCache(): void {
  cache.clear();
}
