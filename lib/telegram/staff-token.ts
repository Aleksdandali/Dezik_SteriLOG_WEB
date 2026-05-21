import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Compact HMAC-signed token for the Dezik Staff mobile app.
 * Format: <base64url(payload)>.<base64url(signature)>
 * Payload: { sub: <staff.id>, tg: <telegram_id>, iat: <unix s>, exp: <unix s> }
 *
 * Signed with STAFF_JWT_SECRET. 30-day lifetime.
 */

const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export interface StaffTokenPayload {
  sub: string;
  tg: number;
  iat: number;
  exp: number;
}

function getSecret(): string {
  const secret = process.env.STAFF_JWT_SECRET;
  if (!secret) throw new Error('STAFF_JWT_SECRET is not set');
  return secret;
}

function b64urlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

function sign(data: string, secret: string): string {
  return b64urlEncode(createHmac('sha256', secret).update(data).digest());
}

export function issueStaffToken(staffId: string, telegramId: number, ttlSeconds = DEFAULT_TTL_SECONDS): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: StaffTokenPayload = {
    sub: staffId,
    tg: telegramId,
    iat: now,
    exp: now + ttlSeconds,
  };
  const payloadStr = b64urlEncode(Buffer.from(JSON.stringify(payload)));
  const sig = sign(payloadStr, getSecret());
  return `${payloadStr}.${sig}`;
}

export function verifyStaffToken(token: string): StaffTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadStr, sig] = parts;

  const expected = sign(payloadStr, getSecret());
  const expectedBuf = Buffer.from(expected);
  const sigBuf = Buffer.from(sig);
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!timingSafeEqual(sigBuf, expectedBuf)) return null;

  try {
    const payload = JSON.parse(b64urlDecode(payloadStr).toString('utf8')) as StaffTokenPayload;
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (typeof payload.sub !== 'string' || typeof payload.tg !== 'number') return null;
    return payload;
  } catch {
    return null;
  }
}
