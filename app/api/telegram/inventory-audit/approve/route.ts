import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireStaff } from '@/lib/telegram/auth';
import { broadcastOps } from '@/lib/telegram/realtime';

export async function POST(request: NextRequest) {
  try {
    const staff = await requireStaff(request);
    if (staff.role !== 'admin') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    const { audit_id, action } = await request.json();
    if (!audit_id || (action !== 'approve' && action !== 'reject')) {
      // Whitelist actions explicitly — previously any string other than
      // 'approve' (including typos) silently became a reject.
      return NextResponse.json(
        { error: "Body must include audit_id and action ∈ {'approve','reject'}" },
        { status: 400 },
      );
    }

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    // Defense in depth: an admin must not approve their own audit.
    const { data: existing, error: fetchErr } = await supabase
      .from('ops_inventory_audits')
      .select('id, status, staff_id, location')
      .eq('id', audit_id)
      .single();
    if (fetchErr || !existing) {
      return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
    }
    if (existing.staff_id === staff.id) {
      return NextResponse.json({ error: 'Cannot review own audit' }, { status: 403 });
    }
    if (existing.status !== 'pending') {
      // Idempotent: already approved/rejected — return current state instead of
      // silently overwriting reviewer + timestamp.
      return NextResponse.json(
        { error: `Audit already ${existing.status}`, status: existing.status },
        { status: 409 },
      );
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    const { error } = await supabase
      .from('ops_inventory_audits')
      .update({ status: newStatus, approved_by: staff.id, approved_at: new Date().toISOString() })
      .eq('id', audit_id)
      .eq('status', 'pending'); // race guard: only update if still pending

    if (error) throw error;

    broadcastOps('audit.reviewed', { audit_id, status: newStatus, location: existing.location });

    return NextResponse.json({ ok: true, status: newStatus });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: message === 'Unauthorized' ? 401 : 500 });
  }
}
