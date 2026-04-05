import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { keycrmFetch } from '@/lib/keycrm';
import { sendMessage } from '@/lib/telegram/bot';

interface KOrder {
  id: number;
  status_changed_at: string | null;
  grand_total: number;
  payment_status: string;
  buyer: { full_name: string | null } | null;
  shipping: { recipient_full_name: string | null; shipping_address_city: string | null; tracking_code: string | null; shipping_receive_point: string | null } | null;
  products: { name: string; quantity: number }[];
}

export async function GET(request: NextRequest) {
  // Auth: cron secret or open (for testing)
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    // Fetch today's status=8 orders
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

    // Check already notified
    const { data: notified } = await supabase
      .from('ops_notifications')
      .select('order_id');
    const notifiedIds = new Set((notified ?? []).map(n => n.order_id));

    const newOrders = todayOrders.filter(o => !notifiedIds.has(o.id));

    if (newOrders.length === 0) {
      return NextResponse.json({ new: 0, today_total: todayOrders.length });
    }

    // Get chat IDs: warehouse staff + admins
    const { data: staff } = await supabase
      .from('ops_staff')
      .select('telegram_id, location, role')
      .eq('active', true);

    const chatIds = new Set<number>();
    for (const s of staff ?? []) {
      if (s.location === 'afina_sklad' || s.role === 'admin') {
        chatIds.add(s.telegram_id);
      }
    }

    // If too many — send summary instead of individual messages
    if (newOrders.length > 5) {
      const summary =
        `📬 <b>${newOrders.length} нових замовлень на збірку</b>\n\n` +
        newOrders.slice(0, 15).map(o => {
          const n = o.shipping?.recipient_full_name || o.buyer?.full_name || '?';
          const city = o.shipping?.shipping_address_city || '';
          return `#${o.id} · ${n} · ${city} · ${o.grand_total} грн`;
        }).join('\n') +
        (newOrders.length > 15 ? `\n\n… і ще ${newOrders.length - 15}` : '');

      for (const chatId of chatIds) {
        try { await sendMessage(chatId, summary); } catch {}
      }

      for (const o of newOrders) {
        await supabase.from('ops_notifications').upsert({ order_id: o.id }, { onConflict: 'order_id' });
      }

      return NextResponse.json({ new: newOrders.length, sent: chatIds.size, mode: 'summary' });
    }

    // Few orders — send individual messages
    let sent = 0;
    for (const order of newOrders) {
      const name = order.shipping?.recipient_full_name || order.buyer?.full_name || 'Клієнт';
      const city = order.shipping?.shipping_address_city || '';
      const ttn = order.shipping?.tracking_code;
      const payment = order.payment_status === 'paid' ? '✅' : '💳 Наложка';
      const items = (order.products ?? []).map(p => {
        // Shorten product name
        let n = p.name.replace(/Dezik\s*/gi, '').replace(/\s*100шт\.?/g, '').replace(/\s*\(.*?\)/g, '').trim();
        if (n.length > 35) n = n.substring(0, 35) + '…';
        return `${n} ×${p.quantity}`;
      }).join('\n');

      const msg =
        `📬 <b>#${order.id}</b> · ${name}\n` +
        `${city}${order.grand_total > 0 ? ' · ' + order.grand_total + ' грн' : ''} ${payment}\n` +
        (ttn ? `ТТН: <code>${ttn}</code>\n` : '') +
        `\n${items}`;

      for (const chatId of chatIds) {
        try {
          await sendMessage(chatId, msg);
          sent++;
        } catch (e) {
          console.error(`[Notify] Send failed ${chatId}:`, e);
        }
      }

      // Mark as notified
      await supabase.from('ops_notifications').upsert({ order_id: order.id }, { onConflict: 'order_id' });
    }

    return NextResponse.json({ new: newOrders.length, sent, today_total: todayOrders.length });
  } catch (err) {
    console.error('[Notify Error]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
