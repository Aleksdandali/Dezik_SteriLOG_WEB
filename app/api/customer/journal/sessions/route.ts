import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authenticateCustomer } from '@/lib/telegram/customer-auth';
import { resolveUserId } from '@/lib/telegram/journal-bridge';

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/** GET — fetch sterilization sessions (journal history) */
export async function GET(request: NextRequest) {
  const telegramId = await authenticateCustomer(request);
  if (!telegramId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabase();
  const userId = await resolveUserId(supabase, telegramId);
  if (!userId) return NextResponse.json({ error: 'Not linked' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 100);
  const offset = parseInt(searchParams.get('offset') ?? '0');

  const { data: sessions, count } = await supabase
    .from('sterilization_sessions')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  // Stats
  const all = sessions ?? [];
  const passed = all.filter(s => s.result === 'success').length;
  const failed = all.filter(s => s.result === 'fail').length;

  return NextResponse.json({
    sessions: all,
    stats: {
      total: count ?? all.length,
      passed,
      failed,
      rate: all.length > 0 ? Math.round((passed / all.length) * 100) : 0,
    },
  });
}

/** POST — create new session */
export async function POST(request: NextRequest) {
  const telegramId = await authenticateCustomer(request);
  if (!telegramId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabase();
  const userId = await resolveUserId(supabase, telegramId);
  if (!userId) return NextResponse.json({ error: 'Not linked' }, { status: 403 });

  const body = await request.json();
  const { sterilizer_id, sterilizer_name, instrument_names, packet_type, temperature, duration_minutes } = body;

  if (!instrument_names) {
    return NextResponse.json({ error: 'Instrument names required' }, { status: 400 });
  }

  const { data: session, error } = await supabase
    .from('sterilization_sessions')
    .insert({
      user_id: userId,
      sterilizer_id: sterilizer_id ?? null,
      sterilizer_name: sterilizer_name ?? '',
      instrument_name: instrument_names,
      packet_type: packet_type ?? 'kraft',
      temperature: temperature ?? null,
      duration_minutes: duration_minutes ?? null,
      status: 'draft',
    })
    .select()
    .single();

  if (error) {
    console.error('[Journal Sessions POST]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ session });
}

/** PATCH — update session (start, complete, cancel) */
export async function PATCH(request: NextRequest) {
  const telegramId = await authenticateCustomer(request);
  if (!telegramId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabase();
  const userId = await resolveUserId(supabase, telegramId);
  if (!userId) return NextResponse.json({ error: 'Not linked' }, { status: 403 });

  const body = await request.json();
  const { session_id, status, started_at, ended_at, result } = body;

  if (!session_id) return NextResponse.json({ error: 'session_id required' }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (status) updates.status = status;
  if (started_at) updates.started_at = started_at;
  if (ended_at) updates.ended_at = ended_at;
  if (result !== undefined) updates.result = result;

  const { data: session, error } = await supabase
    .from('sterilization_sessions')
    .update(updates)
    .eq('id', session_id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    console.error('[Journal Sessions PATCH]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ session });
}
