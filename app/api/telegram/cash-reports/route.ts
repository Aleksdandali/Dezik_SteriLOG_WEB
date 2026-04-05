import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireStaff } from '@/lib/telegram/auth';

export async function GET(request: NextRequest) {
  try {
    const staff = await requireStaff(request);
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') ?? '7', 10);
    const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

    let query = supabase
      .from('ops_cash_reports')
      .select('*, ops_staff(name)')
      .gte('report_date', since)
      .order('report_date', { ascending: false })
      .limit(100);

    if (staff.role !== 'admin') {
      query = query.eq('staff_id', staff.id);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: message === 'Unauthorized' ? 401 : 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const staff = await requireStaff(request);
    const body = await request.json();

    // Body is an array of { channel, payment_type, amount }
    const { report_date, entries } = body;
    if (!report_date || !entries || !Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const rows = entries
      .filter((e: { amount: number }) => e.amount > 0)
      .map((e: { channel: string; payment_type: string; amount: number; notes?: string }) => ({
        staff_id: staff.id,
        report_date,
        channel: e.channel,
        payment_type: e.payment_type,
        amount: parseFloat(String(e.amount)),
        notes: e.notes || null,
      }));

    if (rows.length === 0) {
      return NextResponse.json({ error: 'No entries with amount > 0' }, { status: 400 });
    }

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data, error } = await supabase
      .from('ops_cash_reports')
      .upsert(rows, { onConflict: 'staff_id,report_date,channel,payment_type' })
      .select();

    if (error) throw error;

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: message === 'Unauthorized' ? 401 : 500 });
  }
}
