import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireStaff } from '@/lib/telegram/auth';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/** GET /api/chat/conversations — Manager inbox */
export async function GET(request: NextRequest) {
  try {
    await requireStaff(request);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') ?? 'open';
  const search = searchParams.get('search')?.trim();

  const supabase = getSupabase();

  let query = supabase
    .from('chat_conversations')
    .select('*', { count: 'exact' })
    .eq('status', status)
    .order('last_message_at', { ascending: false });

  if (search) {
    // Search by phone or name (ilike for partial match).
    // Strip PostgREST/SQL special chars to prevent filter-string injection.
    const safe = search.replace(/[%,()\\*]/g, '');
    if (safe) {
      query = query.or(
        `customer_phone.ilike.%${safe}%,customer_name.ilike.%${safe}%`,
      );
    }
  }

  const { data, count, error } = await query;

  if (error) {
    console.error('[Chat Conversations GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [], total: count ?? 0 });
}
