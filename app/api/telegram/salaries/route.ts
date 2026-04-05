import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireOpsAdmin } from '@/lib/telegram/auth';

export async function GET(request: NextRequest) {
  try {
    const staff = await requireOpsAdmin(request);
    void staff;
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') ?? new Date().toISOString().slice(0, 7);

    const { data, error } = await supabase
      .from('ops_salaries')
      .select('*, ops_staff!ops_salaries_staff_id_fkey(name), recipient:ops_staff!ops_salaries_recipient_id_fkey(name)')
      .eq('period', period)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const staff = await requireOpsAdmin(request);
    const body = await request.json();

    const { recipient_id, amount, type, period, notes } = body;
    if (!recipient_id || !amount || !type || !period) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data, error } = await supabase
      .from('ops_salaries')
      .insert({
        staff_id: staff.id,
        recipient_id,
        amount: parseFloat(amount),
        type,
        period,
        notes: notes || null,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
