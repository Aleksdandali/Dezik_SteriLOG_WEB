import type { TelegramUser } from './types';

/**
 * Validate Telegram Mini App initData using HMAC-SHA256.
 * Uses Web Crypto API (works in Edge & Node.js runtimes).
 * @see https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export async function validateInitData(initData: string, botToken: string): Promise<TelegramUser | null> {
  if (!initData) return null;

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) {
      console.log('[TG Validate] No hash in initData');
      return null;
    }

    // Build data-check-string
    params.delete('hash');
    const entries = Array.from(params.entries());
    entries.sort(([a], [b]) => a.localeCompare(b));
    const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join('\n');

    // HMAC-SHA256 using Web Crypto API
    const encoder = new TextEncoder();
    const token = botToken.trim();

    // Step 1: secret_key = HMAC-SHA256("WebAppData", bot_token)
    const keyData = encoder.encode('WebAppData');
    const hmacKey1 = await crypto.subtle.importKey(
      'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const secretKeyBuffer = await crypto.subtle.sign('HMAC', hmacKey1, encoder.encode(token));

    // Step 2: hash = HMAC-SHA256(secret_key, data_check_string)
    const hmacKey2 = await crypto.subtle.importKey(
      'raw', secretKeyBuffer, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const signatureBuffer = await crypto.subtle.sign('HMAC', hmacKey2, encoder.encode(dataCheckString));

    // Convert to hex
    const calculatedHash = Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    if (calculatedHash !== hash) {
      console.log('[TG Validate] Hash mismatch');
      console.log('[TG Validate] Expected:', hash.substring(0, 20) + '...');
      console.log('[TG Validate] Got:', calculatedHash.substring(0, 20) + '...');
      return null;
    }

    // Parse user
    const userStr = params.get('user');
    if (!userStr) {
      console.log('[TG Validate] No user in initData');
      return null;
    }

    console.log('[TG Validate] Success for user:', JSON.parse(userStr).id);
    return JSON.parse(userStr) as TelegramUser;
  } catch (err) {
    console.error('[TG Validate] Error:', err);
    return null;
  }
}
