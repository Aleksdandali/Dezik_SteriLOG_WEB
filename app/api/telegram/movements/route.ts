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
      .from('ops_movements')
      .select('*, ops_staff!ops_movements_staff_id_fkey(name)')
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

    const { from_location, to_location, description, quantity, photo_url, bag_size, material, packages, shipment_id } = body;
    if (!from_location || !to_location || !description || !photo_url) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (from_location === to_location) {
      return NextResponse.json({ error: 'Locations must be different' }, { status: 400 });
    }

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data, error } = await supabase
      .from('ops_movements')
      .insert({
        staff_id: staff.id,
        from_location,
        to_location,
        description,
        quantity: quantity ? parseInt(String(quantity), 10) : null,
        photo_url,
        bag_size: bag_size || null,
        material: material || null,
        packages: packages ? parseInt(String(packages), 10) : null,
        shipment_id: shipment_id || null,
      })
      .select()
      .single();

    if (error) {
      console.error('[Movement POST] DB error:', JSON.stringify(error));
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    console.error('[Movement POST] Error:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message || 'Internal error' }, { status: message === 'Unauthorized' ? 401 : 500 });
  }
}


export async function DELETE(request: NextRequest) {
  try {
    await requireStaff(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const password = searchParams.get("password");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    if (password !== "300683") return NextResponse.json({ error: "Невірний пароль" }, { status: 403 });
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { error } = await supabase.from("ops_movements").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: message === "Unauthorized" ? 401 : 500 });
  }
}
