import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  KYIV_TZ,
  SEND_WINDOW,
  MAX_MESSAGES_PER_WEEK,
  MIN_DAYS_BETWEEN_MESSAGES,
} from './constants';

const BOT_API = 'https://api.telegram.org/bot';

/** Create Supabase service client */
export function getSupabase(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/** Get customer bot token */
function getCustomerBotToken(): string {
  const token = process.env.TELEGRAM_CUSTOMER_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_CUSTOMER_BOT_TOKEN is not set');
  return token;
}

/** Send message via customer Telegram bot */
export async function sendCustomerMessage(
  chatId: number,
  text: string,
  options?: { reply_markup?: unknown }
): Promise<{ ok: boolean; result?: { message_id: number } }> {
  const res = await fetch(`${BOT_API}${getCustomerBotToken()}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      ...options,
    }),
  });
  return res.json();
}

/** Check if current Kyiv time is within sending window */
export function isWithinSendWindow(): boolean {
  const now = new Date();
  const kyivTime = new Date(now.toLocaleString('en-US', { timeZone: KYIV_TZ }));
  const hour = kyivTime.getHours();
  return hour >= SEND_WINDOW.startHour && hour < SEND_WINDOW.endHour;
}

/** Get current date in Kyiv timezone as YYYY-MM-DD */
export function getKyivDate(): string {
  const now = new Date();
  return now.toLocaleDateString('sv-SE', { timeZone: KYIV_TZ }); // sv-SE gives YYYY-MM-DD format
}

/** Get a date N days ago in Kyiv timezone as YYYY-MM-DD */
export function getKyivDateDaysAgo(days: number): string {
  const now = new Date();
  const kyivNow = new Date(now.toLocaleString('en-US', { timeZone: KYIV_TZ }));
  kyivNow.setDate(kyivNow.getDate() - days);
  return kyivNow.toISOString().slice(0, 10);
}

/** Check anti-spam: whether customer has been messaged too recently or too many times this week */
export async function canSendMessage(
  supabase: SupabaseClient,
  phone: string
): Promise<boolean> {
  // Check: no message in the last MIN_DAYS_BETWEEN_MESSAGES days
  const minDate = new Date(Date.now() - MIN_DAYS_BETWEEN_MESSAGES * 86400000).toISOString();
  const { data: recentMessages } = await supabase
    .from('retention_messages')
    .select('id')
    .eq('phone', phone)
    .gte('sent_at', minDate);

  if (recentMessages && recentMessages.length > 0) {
    return false;
  }

  // Check: max MAX_MESSAGES_PER_WEEK messages in last 7 days
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data: weekMessages } = await supabase
    .from('retention_messages')
    .select('id')
    .eq('phone', phone)
    .gte('sent_at', weekAgo);

  if (weekMessages && weekMessages.length >= MAX_MESSAGES_PER_WEEK) {
    return false;
  }

  return true;
}

/** Log a retention message to the database */
export async function logRetentionMessage(
  supabase: SupabaseClient,
  params: {
    phone: string;
    telegramId: number;
    messageType: string;
    messageText: string;
    orderId?: number;
  }
): Promise<void> {
  await supabase.from('retention_messages').insert({
    phone: params.phone,
    telegram_id: params.telegramId,
    message_type: params.messageType,
    message_text: params.messageText,
    order_id: params.orderId ?? null,
  });
}

/** Verify cron authorization header */
export function verifyCronAuth(authHeader: string | null): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  return authHeader === `Bearer ${cronSecret}`;
}

/** Resolve phone -> telegram_id from customer_telegram_links */
export async function getTelegramIdByPhone(
  supabase: SupabaseClient,
  phone: string
): Promise<number | null> {
  const { data } = await supabase
    .from('customer_telegram_links')
    .select('telegram_id')
    .eq('phone', phone)
    .maybeSingle();

  return data?.telegram_id ?? null;
}

/** Get all telegram links for a set of phones */
export async function getTelegramLinksByPhones(
  supabase: SupabaseClient,
  phones: string[]
): Promise<Map<string, { telegramId: number; firstName: string | null }>> {
  if (phones.length === 0) return new Map();

  const { data } = await supabase
    .from('customer_telegram_links')
    .select('phone, telegram_id, first_name')
    .in('phone', phones);

  const map = new Map<string, { telegramId: number; firstName: string | null }>();
  for (const row of data ?? []) {
    map.set(row.phone, { telegramId: row.telegram_id, firstName: row.first_name });
  }
  return map;
}
