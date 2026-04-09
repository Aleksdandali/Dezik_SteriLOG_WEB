import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireStaff } from '@/lib/telegram/auth';

export async function GET(request: NextRequest) {
  try {
    await requireStaff(request);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { searchParams } = new URL(request.url);
    const location = searchParams.get('location');

    let query = supabase
      .from('ops_movements')
      .select('*, ops_staff!ops_movements_staff_id_fkey(name)')
      .is('confirmed_at', null)
      .order('created_at', { ascending: false })
      .limit(50);

    if (location) {
      query = query.eq('to_location', location);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[Pending] Supabase error:', JSON.stringify(error));
      // Fallback without join
      const { data: fallbackData } = await supabase
        .from('ops_movements')
        .select('*')
        .is('confirmed_at', null)
        .eq('to_location', location ?? '')
        .order('created_at', { ascending: false })
        .limit(50);
      return NextResponse.json({ data: fallbackData ?? [] });
    }

    return NextResponse.json({ data: data ?? [] });
  } catch (err) {
    console.error('[Pending] Error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
