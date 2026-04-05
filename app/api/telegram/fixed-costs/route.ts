import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireOpsAdmin } from '@/lib/telegram/auth';

export async function GET(request: NextRequest) {
  try {
    const staff = await requireOpsAdmin(request);
    void staff;
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period');

    // Get all active fixed costs
    const { data: costs, error: costsError } = await supabase
      .from('ops_fixed_costs')
      .select('*')
      .eq('active', true)
      .order('location', { ascending: true });

    if (costsError) throw costsError;

    // If period specified, get payments for that period
    let payments = null;
    if (period) {
      const { data, error } = await supabase
        .from('ops_fixed_cost_payments')
        .select('*, ops_fixed_costs(name)')
        .eq('period', period);

      if (error) throw error;
      payments = data;
    }

    return NextResponse.json({ costs, payments });
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

    const { fixed_cost_id, amount, period } = body;
    if (!fixed_cost_id || !amount || !period) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data, error } = await supabase
      .from('ops_fixed_cost_payments')
      .upsert(
        {
          fixed_cost_id,
          staff_id: staff.id,
          amount: parseFloat(amount),
          period,
        },
        { onConflict: 'fixed_cost_id,period' }
      )
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
