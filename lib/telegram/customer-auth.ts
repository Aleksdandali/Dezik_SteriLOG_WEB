import { NextRequest } from 'next/server';
import { validateInitData } from './validate';

/**
 * Authenticate a customer from Telegram Mini App initData.
 * Returns telegram_id if valid, null otherwise.
 */
export async function authenticateCustomer(request: NextRequest): Promise<number | null> {
  const initData = request.headers.get('x-telegram-init-data');
  if (!initData) return null;

  const botToken = process.env.TELEGRAM_CUSTOMER_BOT_TOKEN;
  if (!botToken) return null;

  const tgUser = await validateInitData(initData, botToken);
  return tgUser?.id ?? null;
}

/**
 * Escape HTML to prevent XSS in Telegram messages.
 */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
