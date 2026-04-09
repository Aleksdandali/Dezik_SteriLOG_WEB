import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authenticateCustomer } from '@/lib/telegram/customer-auth';
import { resolveUserId, linkTelegramToProfile } from '@/lib/telegram/journal-bridge';

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/** GET — check if telegram account is linked to a profile */
export async function GET(request: NextRequest) {
  const telegramId = await authenticateCustomer(request);
  if (!telegramId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabase();
  const userId = await resolveUserId(supabase, telegramId);

  if (!userId) {
    return NextResponse.json({ linked: false });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, salon_name')
    .eq('id', userId)
    .maybeSingle();

  return NextResponse.json({ linked: true, profile: profile ?? {} });
}

/** POST — link telegram to profile via phone match */
export async function POST(request: NextRequest) {
  const telegramId = await authenticateCustomer(request);
  if (!telegramId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { phone } = await request.json();
  if (!phone) return NextResponse.json({ error: 'Phone required' }, { status: 400 });

  const supabase = getSupabase();
  const result = await linkTelegramToProfile(supabase, telegramId, phone);

  if (!result) {
    return NextResponse.json({ success: false, error: 'Акаунт не знайдено. Спочатку зареєструйтесь в додатку Dezik Log.' }, { status: 404 });
  }

  return NextResponse.json({ success: true, profile: result });
}
