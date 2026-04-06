import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { keycrmFetch } from '@/lib/keycrm';
import { sendSMSSafe } from '@/lib/smsfly';

/** Cron: check new KeyCRM orders and send SMS with bot link */
export async function GET(request: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET not set' }, { status: 500 });
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    // Get new orders (status=1) from KeyCRM
    const result = await keycrmFetch<{ data: { id: number; buyer: { phone: string | null } | null; source_id: number }[] }>(
      '/order?filter[status_id]=1&sort=-id&limit=20&include=buyer'
    );

    let sent = 0;
    for (const order of result.data ?? []) {
      const phone = order.buyer?.phone?.replace(/\D/g, '');
      if (!phone || phone.length < 10) continue;

      // Check if we already sent SMS for this order
      const { data: existing } = await supabase
        .from('ops_notifications')
        .select('id')
        .eq('type', 'sms_new_order')
        .eq('reference_id', String(order.id))
        .limit(1);

      if (existing && existing.length > 0) continue;

      // Send SMS
      await sendSMSSafe(phone, `Dezik: замовлення #${order.id} прийнято! Статус та зв'язок з менеджером у боті: t.me/dezik_ua_bot`);

      // Mark as sent
      await supabase.from('ops_notifications').insert({
        type: 'sms_new_order',
        reference_id: String(order.id),
        recipient: phone,
      });

      sent++;
    }

    return NextResponse.json({ ok: true, sent });
  } catch (err) {
    console.error('[Notify New Orders]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
