import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireStaff } from '@/lib/telegram/auth';

export async function POST(request: NextRequest) {
  try {
    const staff = await requireStaff(request);
    if (staff.role !== 'admin') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    const { audit_id, action } = await request.json();
    if (!audit_id || !action) {
      return NextResponse.json({ error: 'Missing audit_id or action' }, { status: 400 });
    }

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    const { error } = await supabase
      .from('ops_inventory_audits')
      .update({ status: newStatus, approved_by: staff.id, approved_at: new Date().toISOString() })
      .eq('id', audit_id);

    if (error) throw error;

    return NextResponse.json({ ok: true, status: newStatus });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: message === 'Unauthorized' ? 401 : 500 });
  }
}
