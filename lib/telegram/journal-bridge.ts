import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Resolve telegram_id to Supabase user_id via profiles table.
 * Returns user_id (UUID) or null if not linked.
 */
export async function resolveUserId(
  supabase: SupabaseClient,
  telegramId: number,
): Promise<string | null> {
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('telegram_id', telegramId)
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * Link telegram_id to a profile by matching phone number.
 * Returns profile data if successful, null if no match.
 */
export async function linkTelegramToProfile(
  supabase: SupabaseClient,
  telegramId: number,
  phone: string,
): Promise<{ id: string; name: string | null; salon_name: string | null } | null> {
  // Normalize phone
  const clean = phone.replace(/\D/g, '').replace(/^38/, '');

  // Find profile by phone (try multiple formats)
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, name, salon_name, phone')
    .or(`phone.eq.${clean},phone.eq.+380${clean},phone.eq.0${clean},phone.eq.380${clean}`)
    .maybeSingle();

  if (!profile) return null;

  // Set telegram_id on this profile
  const { error } = await supabase
    .from('profiles')
    .update({ telegram_id: telegramId })
    .eq('id', profile.id);

  if (error) {
    console.error('[Journal Bridge] Link error:', error);
    return null;
  }

  return { id: profile.id, name: profile.name, salon_name: profile.salon_name };
}
