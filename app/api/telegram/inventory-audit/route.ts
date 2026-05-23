import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireStaff } from '@/lib/telegram/auth';
import { broadcastOps } from '@/lib/telegram/realtime';
import { withDeltaSummaries, type AuditForDelta } from '@/lib/telegram/audit-delta';

export async function GET(request: NextRequest) {
  try {
    const staff = await requireStaff(request);
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') ?? '30', 10);
    const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

    let query = supabase
      .from('ops_inventory_audits')
      .select('*, ops_staff(name), ops_inventory_audit_items(*)')
      .gte('audit_date', since)
      .order('audit_date', { ascending: false })
      .limit(20);

    if (staff.role !== 'admin') {
      query = query.eq('staff_id', staff.id);
    }

    const { data, error } = await query;
    if (error) throw error;

    const annotated = withDeltaSummaries((data ?? []) as AuditForDelta[]);
    return NextResponse.json({ data: annotated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: message === 'Unauthorized' ? 401 : 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const staff = await requireStaff(request);
    const body = await request.json();

    const { location, audit_date, items } = body;
    if (!location || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    // Create audit header (auto-approve if admin)
    const isAdmin = staff.role === 'admin';
    const { data: audit, error: auditError } = await supabase
      .from('ops_inventory_audits')
      .insert({
        staff_id: staff.id,
        location,
        audit_date: audit_date || new Date().toISOString().slice(0, 10),
        ...(isAdmin ? { status: 'approved', approved_by: staff.id, approved_at: new Date().toISOString() } : {}),
      })
      .select()
      .single();

    if (auditError) throw auditError;

    // Insert all items
    const rows = items.map((item: {
      item_type: string;
      name: string;
      unit?: string;
      quantity: number;
      notes?: string;
    }) => ({
      audit_id: audit.id,
      item_type: item.item_type,
      name: item.name,
      unit: item.unit || 'шт',
      quantity: parseFloat(String(item.quantity)),
      notes: item.notes || null,
    }));

    const { error: itemsError } = await supabase
      .from('ops_inventory_audit_items')
      .insert(rows);

    if (itemsError) throw itemsError;

    // Notify admins
    try {
      const { sendMessage } = await import('@/lib/telegram/bot');
      const { data: admins } = await supabase.from('ops_staff').select('telegram_id').eq('role', 'admin').eq('active', true);
      const LOCS: Record<string, string> = { malynovskogo: 'Маліновського', afina_sklad: 'Афіна', dalnytska: 'Дальницька' };
      const msg = `📝 <b>Новий переоблік</b>\n${LOCS[location] ?? location}\n${rows.length} позицій\n\n⏳ Очікує підтвердження`;
      for (const a of admins ?? []) { try { await sendMessage(a.telegram_id, msg); } catch {} }
    } catch {}

    broadcastOps('audit.created', {
      audit_id: audit.id,
      location,
      status: audit.status ?? (isAdmin ? 'approved' : 'pending'),
    });

    return NextResponse.json({ data: audit }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: message === 'Unauthorized' ? 401 : 500 });
  }
}
