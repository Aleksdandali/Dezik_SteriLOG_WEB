import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { keycrmFetch } from '@/lib/keycrm';
import { sendMessage, deleteMessage } from '@/lib/telegram/bot';

interface KOrder {
  id: number;
  status_changed_at: string | null;
  grand_total: number;
  payment_status: string;
  buyer: { full_name: string | null } | null;
  shipping: { recipient_full_name: string | null; shipping_address_city: string | null; tracking_code: string | null } | null;
  products: { name: string; quantity: number }[];
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    const today = new Date().toISOString().slice(0, 10);
    const allOrders: KOrder[] = [];
    let page = 1;
    while (page <= 3) {
      const data = await keycrmFetch<{ data: KOrder[]; last_page: number }>(
        `/order?filter[status_id]=8&sort=-id&limit=50&page=${page}&include=shipping,buyer,products`
      );
      allOrders.push(...(data.data ?? []));
      if (page >= data.last_page) break;
      page++;
    }
    const todayOrders = allOrders.filter(o => (o.status_changed_at ?? '').startsWith(today));

    // Check already notified orders
    const { data: notified } = await supabase.from('ops_notifications').select('order_id').is('type', null);
    const notifiedIds = new Set((notified ?? []).map(n => n.order_id));
    const newOrders = todayOrders.filter(o => !notifiedIds.has(o.id));

    if (newOrders.length === 0) {
      return NextResponse.json({ new: 0, today_total: todayOrders.length });
    }

    // Get chat IDs: warehouse staff + admins
    const { data: staff } = await supabase.from('ops_staff').select('telegram_id, location, role').eq('active', true);
    const chatIds = new Set<number>();
    for (const s of staff ?? []) {
      if (s.location === 'afina_sklad' || s.role === 'admin') chatIds.add(s.telegram_id);
    }

    // Delete previous auto-notification messages
    const { data: oldMsgs } = await supabase
      .from('ops_notifications')
      .select('id, telegram_chat_id, telegram_message_id')
      .eq('type', 'auto_shipment');

    for (const old of oldMsgs ?? []) {
      if (old.telegram_chat_id && old.telegram_message_id) {
        await deleteMessage(old.telegram_chat_id, old.telegram_message_id);
      }
    }
    if (oldMsgs && oldMsgs.length > 0) {
      await supabase.from('ops_notifications').delete().eq('type', 'auto_shipment');
    }

    // Build summary message
    const summary =
      `📬 <b>${newOrders.length} нов${newOrders.length === 1 ? 'е замовлення' : 'их замовлень'} на збірку</b>\n\n` +
      newOrders.slice(0, 10).map(o => {
        const n = o.shipping?.recipient_full_name || o.buyer?.full_name || '?';
        const city = o.shipping?.shipping_address_city || '';
        const pay = o.payment_status === 'paid' ? '✅' : '💳';
        return `#${o.id} · ${n} · ${city} · ${o.grand_total} грн ${pay}`;
      }).join('\n') +
      (newOrders.length > 10 ? `\n\n… і ще ${newOrders.length - 10}` : '');

    // Send new messages and save message_ids
    for (const chatId of chatIds) {
      try {
        const result = await sendMessage(chatId, summary);
        const msgId = result?.result?.message_id;
        if (msgId) {
          await supabase.from('ops_notifications').insert({
            order_id: 0,
            type: 'auto_shipment',
            telegram_chat_id: chatId,
            telegram_message_id: msgId,
          });
        }
      } catch {}
    }

    // Mark orders as notified
    for (const o of newOrders) {
      await supabase.from('ops_notifications').upsert({ order_id: o.id }, { onConflict: 'order_id' });
    }

    // Clean old records (>7 days)
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    await supabase.from('ops_notifications').delete().lt('notified_at', weekAgo).is('type', null);

    return NextResponse.json({ new: newOrders.length, sent: chatIds.size });
  } catch (err) {
    console.error('[Notify Error]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
