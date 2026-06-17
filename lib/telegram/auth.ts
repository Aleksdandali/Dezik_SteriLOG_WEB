import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateInitData } from './validate';
import { verifyStaffToken } from './staff-token';
import type { OpsStaff } from './types';

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/** Look up staff by telegram_id */
async function findStaff(telegramId: number): Promise<OpsStaff | null> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('ops_staff')
    .select('*')
    .eq('telegram_id', telegramId)
    .eq('active', true)
    .single();
  return (data as OpsStaff) ?? null;
}

/**
 * Authenticate with full HMAC validation (for POST/mutations).
 * Returns null if HMAC validation fails — no fallback.
 */
export async function authenticateTelegram(
  request: NextRequest
): Promise<OpsStaff | null> {
  // Path 1: Bearer token from native mobile app (Dezik Staff)
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim();
    // Skip if it looks like a Telegram WebApp initData string mirrored into the Bearer header
    if (token && !token.includes('=') && !token.includes('&')) {
      const payload = verifyStaffToken(token);
      if (payload) {
        const supabase = getSupabaseAdmin();
        const { data } = await supabase
          .from('ops_staff')
          .select('*')
          .eq('id', payload.sub)
          .eq('active', true)
          .single();
        if (data) return data as OpsStaff;
      }
    }
  }

  // Path 2: Telegram WebApp initData (HMAC-validated)
  const initData = request.headers.get('x-telegram-init-data');
  if (!initData) return null;

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return null;

  try {
    const tgUser = await validateInitData(initData, botToken);
    if (tgUser) return findStaff(tgUser.id);
  } catch (e) {
    console.error('[Auth] HMAC validation error:', e);
  }

  return null;
}

export async function requireStaff(request: NextRequest): Promise<OpsStaff> {
  const staff = await authenticateTelegram(request);
  if (!staff) throw new Error('Unauthorized');
  return staff;
}

export async function requireOpsAdmin(request: NextRequest): Promise<OpsStaff> {
  const staff = await requireStaff(request);
  if (staff.role !== 'admin') throw new Error('Forbidden');
  return staff;
}
