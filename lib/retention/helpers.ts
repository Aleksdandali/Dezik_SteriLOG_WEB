import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  KYIV_TZ,
  SEND_WINDOW,
  MAX_MESSAGES_PER_WEEK,
  MIN_DAYS_BETWEEN_MESSAGES,
  CONSUMPTION_DEFAULTS,
} from './constants';

const BOT_API = 'https://api.telegram.org/bot';
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const AI_MODEL = 'claude-haiku-4-5-20251001';
const AI_MAX_TOKENS = 200;

/* ─── Product map: keycrm_id -> { sku, name, category } ─── */

export interface ProductMapEntry {
  sku: string;
  name: string;
  category: string;
}

let _productMapCache: Map<number, ProductMapEntry> | null = null;
let _productMapExpiry = 0;
const PRODUCT_MAP_TTL = 10 * 60 * 1000; // 10 minutes

/** Load ops_products and build a Map<keycrm_id, {sku, name, category}>. Cached for 10 min. */
export async function loadProductMap(
  supabase: SupabaseClient
): Promise<Map<number, ProductMapEntry>> {
  if (_productMapCache && Date.now() < _productMapExpiry) {
    return _productMapCache;
  }

  const { data, error } = await supabase
    .from('ops_products')
    .select('sku, name, category, keycrm_id')
    .eq('active', true)
    .not('keycrm_id', 'is', null);

  if (error) {
    console.error('[loadProductMap] DB error:', error.message);
    return _productMapCache ?? new Map();
  }

  const map = new Map<number, ProductMapEntry>();
  for (const row of data ?? []) {
    if (row.keycrm_id != null) {
      map.set(row.keycrm_id, {
        sku: row.sku,
        name: row.name,
        category: row.category,
      });
    }
  }

  _productMapCache = map;
  _productMapExpiry = Date.now() + PRODUCT_MAP_TTL;
  return map;
}

/**
 * Resolve a KeyCRM order product to our internal SKU.
 * Strategy: 1) match by product_id -> keycrm_id, 2) fuzzy name match as fallback.
 */
export function resolveProductSku(
  productMap: Map<number, ProductMapEntry>,
  keycrmProductId: number | null | undefined,
  productName: string
): { sku: string; entry: ProductMapEntry } | null {
  // 1. Direct match by keycrm_id
  if (keycrmProductId != null) {
    const entry = productMap.get(keycrmProductId);
    if (entry && CONSUMPTION_DEFAULTS[entry.sku]) {
      return { sku: entry.sku, entry };
    }
  }

  // 2. Fuzzy fallback: normalize product name and try to match
  const normalizedName = productName.toLowerCase().trim();
  for (const [, entry] of productMap) {
    const defaults = CONSUMPTION_DEFAULTS[entry.sku];
    if (!defaults) continue;
    const entryName = entry.name.toLowerCase();
    // Check if the KeyCRM product name contains our product name or vice versa
    if (normalizedName.includes(entryName) || entryName.includes(normalizedName)) {
      return { sku: entry.sku, entry };
    }
  }

  return null;
}

/* ─── AI message generation ─── */

interface AiMessageContext {
  messageType: 'reorder_reminder' | 'post_delivery';
  firstName: string | null;
  segment: string;
  products: { name: string; daysLeft?: number }[];
  totalOrders: number;
  orderId?: number;
}

const REORDER_SYSTEM_PROMPT = `Ти -- асистент бренду Dezik (стерилізація та дезінфекція для б'юті-індустрії).
Напиши коротке повідомлення клієнту про те, що його витратні матеріали закінчуються.
Правила:
- Українська мова, звертання на "ви" (з маленької літери)
- Без emoji
- 2-4 речення максимум
- Згадай товари з контексту
- Тон: дружній, професійний, не нав'язливий
- НЕ додавай кнопки/посилання -- їх додамо окремо
- Для VIP клієнтів можна додати "як завжди, подбаємо про швидку доставку"
- Для нових -- "раді, що обрали Dezik"`;

const POST_DELIVERY_SYSTEM_PROMPT = `Ти -- асистент бренду Dezik (стерилізація та дезінфекція для б'юті-індустрії).
Напиши коротке повідомлення-перевірку після доставки замовлення.
Правила:
- Українська мова, звертання на "ви" (з маленької літери)
- Без emoji
- 2-3 речення максимум
- Тон: турботливий, ненав'язливий
- Запитай чи все гаразд з замовленням
- НЕ додавай кнопки/посилання -- їх додамо окремо
- Для постійних клієнтів -- тепліший тон`;

/**
 * Generate an AI-personalized message via Claude Haiku.
 * Falls back to null on failure (caller should use template).
 */
export async function generateAiMessage(
  ctx: AiMessageContext
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('[AI] ANTHROPIC_API_KEY not set, falling back to template');
    return null;
  }

  const systemPrompt =
    ctx.messageType === 'reorder_reminder'
      ? REORDER_SYSTEM_PROMPT
      : POST_DELIVERY_SYSTEM_PROMPT;

  const userContent = JSON.stringify({
    first_name: ctx.firstName || null,
    segment: ctx.segment,
    total_orders: ctx.totalOrders,
    products: ctx.products,
    order_id: ctx.orderId ?? null,
  });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: AI_MAX_TOKENS,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      console.error('[AI] API error:', res.status, await res.text().catch(() => ''));
      return null;
    }

    const data = await res.json();
    const text = data?.content?.[0]?.text?.trim();
    if (!text || text.length < 10) return null;
    return text;
  } catch (err) {
    console.error('[AI] Generation failed:', err);
    return null;
  }
}

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
