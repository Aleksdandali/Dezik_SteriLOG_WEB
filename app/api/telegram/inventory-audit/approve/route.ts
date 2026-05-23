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

    const { audit_id, action, reason } = await request.json();
    if (!audit_id || (action !== 'approve' && action !== 'reject' && action !== 'revoke')) {
      // Whitelist actions explicitly — previously any string other than
      // 'approve' (including typos) silently became a reject.
      return NextResponse.json(
        { error: "Body must include audit_id and action ∈ {'approve','reject','revoke'}" },
        { status: 400 },
      );
    }
    // Reject + revoke must include actionable reason — operator (and audit log)
    // needs to know what to fix / why a baseline got undone. Approves are silent.
    const trimmedReason = typeof reason === 'string' ? reason.trim() : '';
    if ((action === 'reject' || action === 'revoke') && trimmedReason.length < 3) {
      return NextResponse.json(
        { error: `${action === 'reject' ? 'Reject' : 'Revoke'} вимагає поле reason (мін. 3 символи)` },
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
    // Revoke flips an APPROVED audit back to rejected with a reason — the
    // operator gets notified that the baseline they relied on was undone, and
    // the rejection_reason becomes the audit log line. All other actions
    // require the audit to be still pending.
    if (action === 'revoke') {
      if (existing.status !== 'approved') {
        return NextResponse.json(
          { error: `Revoke потребує статус 'approved' (зараз: ${existing.status})` },
          { status: 409 },
        );
      }
      const { error } = await supabase
        .from('ops_inventory_audits')
        .update({
          status: 'rejected',
          approved_by: staff.id,
          approved_at: new Date().toISOString(),
          rejection_reason: `[Revoked] ${trimmedReason}`,
        })
        .eq('id', audit_id)
        .eq('status', 'approved'); // race guard
      if (error) throw error;
      broadcastOps('audit.reviewed', { audit_id, status: 'rejected', location: existing.location });
      return NextResponse.json({ ok: true, status: 'rejected', revoked: true });
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
      .update({
        status: newStatus,
        approved_by: staff.id,
        approved_at: new Date().toISOString(),
        // Only set on reject so re-approving an audit after rename never
        // resurrects an old reason. Approves clear it for the same reason.
        rejection_reason: action === 'reject' ? trimmedReason : null,
      })
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
