import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireOpsAdmin } from '@/lib/telegram/auth';
import { sendMessage } from '@/lib/telegram/bot';

/** GET — list team + pending requests */
export async function GET(request: NextRequest) {
  try {
    await requireOpsAdmin(request);
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    const { searchParams } = new URL(request.url);
    if (searchParams.get('type') === 'bot_clients') {
      const [{ data: subscribers }, { data: customers }] = await Promise.all([
        supabase.from('bot_subscribers').select('telegram_id, first_name, username, last_active, created_at').order('last_active', { ascending: false }),
        supabase.from('customer_telegram_links').select('telegram_id, phone, first_name'),
      ]);
      const customerMap = new Map((customers ?? []).map(c => [c.telegram_id, c]));
      const merged = (subscribers ?? []).map(s => {
        const cust = customerMap.get(s.telegram_id);
        return {
          telegram_id: s.telegram_id,
          first_name: cust?.first_name || s.first_name || s.username || null,
          phone: cust?.phone || null,
          is_customer: !!cust,
          last_active: s.last_active,
          joined_at: s.created_at,
        };
      });
      // Also add customers not yet in subscribers
      for (const c of customers ?? []) {
        if (!merged.find(m => m.telegram_id === c.telegram_id)) {
          merged.push({ telegram_id: c.telegram_id, first_name: c.first_name, phone: c.phone, is_customer: true, last_active: null, joined_at: null });
        }
      }
      return NextResponse.json({ data: merged, total_subscribers: (subscribers ?? []).length, total_customers: (customers ?? []).length });
    }

    const [{ data: staff }, { data: requests }] = await Promise.all([
      supabase.from('ops_staff').select('*').eq('active', true).order('name'),
      supabase.from('ops_staff_requests').select('*').eq('status', 'pending').order('created_at', { ascending: false }),
    ]);

    return NextResponse.json({ staff: staff ?? [], requests: requests ?? [] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: msg === 'Forbidden' ? 403 : msg === 'Unauthorized' ? 401 : 500 });
  }
}

/** POST — approve/reject request OR update staff */
export async function POST(request: NextRequest) {
  try {
    await requireOpsAdmin(request);
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const body = await request.json();
    const { action } = body;

    if (action === 'approve') {
      const { request_id, role, location, visible_sections, visible_locations, link_to_staff_id } = body;
      if (!request_id) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

      // Get request
      const { data: req } = await supabase.from('ops_staff_requests').select('*').eq('id', request_id).single();
      if (!req) return NextResponse.json({ error: 'Request not found' }, { status: 404 });

      if (link_to_staff_id) {
        // Link to existing staff — update their telegram_id
        await supabase.from('ops_staff').update({ telegram_id: req.telegram_id }).eq('id', link_to_staff_id);
      } else {
        // Create new staff record
        if (!role) return NextResponse.json({ error: 'Missing role' }, { status: 400 });
        await supabase.from('ops_staff').insert({
          telegram_id: req.telegram_id,
          name: req.name,
          role,
          location: location || null,
          visible_sections: visible_sections || [],
          visible_locations: Array.isArray(visible_locations) ? visible_locations : [],
        });
      }

      // Update request status
      await supabase.from('ops_staff_requests').update({ status: 'approved' }).eq('id', request_id);

      // Notify the user
      try {
        const webAppUrl = 'https://dezik-admin.vercel.app/telegram';
        await sendMessage(req.telegram_id,
          `✅ Ваш доступ підтверджено!\n\nНатисніть кнопку нижче щоб відкрити додаток.`, {
          reply_markup: {
            inline_keyboard: [[{ text: '📊 Відкрити Dezik Ops', web_app: { url: webAppUrl } }]],
          },
        });
      } catch {}

      return NextResponse.json({ ok: true, action: 'approved' });
    }

    if (action === 'reject') {
      const { request_id } = body;
      await supabase.from('ops_staff_requests').update({ status: 'rejected' }).eq('id', request_id);

      // Get telegram_id to notify
      const { data: req } = await supabase.from('ops_staff_requests').select('telegram_id').eq('id', request_id).single();
      if (req) {
        try { await sendMessage(req.telegram_id, '❌ Вашу заявку відхилено.'); } catch {}
      }

      return NextResponse.json({ ok: true, action: 'rejected' });
    }

    if (action === 'update_staff') {
      const { staff_id, role, location, visible_sections, visible_locations, active } = body;
      if (!staff_id) return NextResponse.json({ error: 'Missing staff_id' }, { status: 400 });

      const updateData: Record<string, unknown> = {};
      if (role !== undefined) updateData.role = role;
      if (location !== undefined) updateData.location = location;
      if (visible_sections !== undefined) updateData.visible_sections = visible_sections;
      if (visible_locations !== undefined && Array.isArray(visible_locations)) {
        updateData.visible_locations = visible_locations;
      }
      if (active !== undefined) updateData.active = active;

      await supabase.from('ops_staff').update(updateData).eq('id', staff_id);
      return NextResponse.json({ ok: true, action: 'updated' });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
