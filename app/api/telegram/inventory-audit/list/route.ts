import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireStaff } from '@/lib/telegram/auth';

export async function GET(request: NextRequest) {
  try {
    await requireStaff(request);
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { searchParams } = new URL(request.url);
    const location = searchParams.get('location');

    let query = supabase
      .from('ops_inventory_audits')
      .select('*, ops_staff!ops_inventory_audits_staff_id_fkey(name), ops_inventory_audit_items(name, quantity, unit, item_type)')
      .order('created_at', { ascending: false })
      .limit(30);

    if (location) query = query.eq('location', location);

    const { data, error } = await query;
    if (error) {
      // Fallback without FK hint
      const { data: fb } = await supabase
        .from('ops_inventory_audits')
        .select('*, ops_inventory_audit_items(name, quantity, unit, item_type)')
        .order('created_at', { ascending: false })
        .eq('location', location ?? '')
        .limit(30);
      return NextResponse.json({ data: fb ?? [] });
    }

    return NextResponse.json({ data: data ?? [] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: msg === 'Unauthorized' ? 401 : 500 });
  }
}
