import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireStaff } from '@/lib/telegram/auth';
import { withDeltaSummaries, type AuditForDelta } from '@/lib/telegram/audit-delta';

export async function GET(request: NextRequest) {
  try {
    await requireStaff(request);
    const { searchParams } = new URL(request.url);
    const location = searchParams.get('location');

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    let query = supabase
      .from('ops_inventory_audits')
      .select('*, ops_staff(name), ops_inventory_audit_items(*)')
      .order('audit_date', { ascending: false })
      .limit(50);

    if (location) {
      query = query.eq('location', location);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Attach delta_summary so reviewers can spot suspicious переучёти without
    // opening each one (zero changes vs prior approved snapshot = likely fake).
    const annotated = withDeltaSummaries((data ?? []) as AuditForDelta[]);

    return NextResponse.json({ data: annotated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: message === 'Unauthorized' ? 401 : 500 });
  }
}
