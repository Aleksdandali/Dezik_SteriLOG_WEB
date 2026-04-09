import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authenticateCustomer } from '@/lib/telegram/customer-auth';
import { resolveUserId } from '@/lib/telegram/journal-bridge';

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/** GET — fetch user's sterilizers */
export async function GET(request: NextRequest) {
  const telegramId = await authenticateCustomer(request);
  if (!telegramId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabase();
  const userId = await resolveUserId(supabase, telegramId);
  if (!userId) return NextResponse.json({ error: 'Not linked' }, { status: 403 });

  const { data } = await supabase
    .from('sterilizers')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  return NextResponse.json({ sterilizers: data ?? [] });
}

/** POST — create new sterilizer */
export async function POST(request: NextRequest) {
  const telegramId = await authenticateCustomer(request);
  if (!telegramId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabase();
  const userId = await resolveUserId(supabase, telegramId);
  if (!userId) return NextResponse.json({ error: 'Not linked' }, { status: 403 });

  const { name, type, brand } = await request.json();
  if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 });

  const { data, error } = await supabase
    .from('sterilizers')
    .insert({ user_id: userId, name, type: type ?? null, brand: brand ?? null })
    .select()
    .single();

  if (error) {
    console.error('[Sterilizers POST]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ sterilizer: data });
}
