import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireStaff } from '@/lib/telegram/auth';

export async function GET(request: NextRequest) {
  try {
    const staff = await requireStaff(request);
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') ?? '7', 10);
    const since = new Date(Date.now() - days * 86400000).toISOString();

    let query = supabase
      .from('ops_production')
      .select('*, ops_staff(name)')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(50);

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

    const { location, stage, bag_size, material, km, rolls, packages, photo_url, notes } = body;
    if (!location || !stage || !bag_size || !material || !photo_url) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (stage === 'print' && !km && !rolls) {
      return NextResponse.json({ error: 'Вкажіть км або рулони' }, { status: 400 });
    }
    if (stage === 'pack' && !packages) {
      return NextResponse.json({ error: 'Вкажіть кількість упаковок' }, { status: 400 });
    }

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data, error } = await supabase
      .from('ops_production')
      .insert({
        staff_id: staff.id,
        location,
        stage,
        bag_size,
        material,
        km: km ? parseFloat(km) : null,
        rolls: rolls ? parseInt(rolls, 10) : null,
        packages: packages ? parseInt(packages, 10) : null,
        photo_url,
        notes: notes || null,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: message === 'Unauthorized' ? 401 : 500 });
  }
}
