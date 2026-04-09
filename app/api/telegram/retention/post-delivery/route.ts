import { NextRequest, NextResponse } from 'next/server';
import { keycrmFetch } from '@/lib/keycrm';
import {
  getSupabase,
  verifyCronAuth,
  isWithinSendWindow,
  getKyivDateDaysAgo,
  canSendMessage,
  sendCustomerMessage,
  logRetentionMessage,
  getTelegramLinksByPhones,
  generateAiMessage,
} from '@/lib/retention/helpers';

interface KOrder {
  id: number;
  status_changed_at: string | null;
  buyer: { phone: string | null; full_name: string | null } | null;
}

/**
 * POST-DELIVERY CHECK
 * Runs daily via Vercel cron.
 * Finds orders delivered 1 day ago, sends a check-in message to the customer.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!verifyCronAuth(authHeader)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Only send during the Kyiv 10:00-12:00 window
  if (!isWithinSendWindow()) {
    return NextResponse.json({ ok: true, skipped: 'outside_send_window' });
  }

  try {
    const supabase = getSupabase();

    // Get yesterday's date in Kyiv time
    const yesterdayDate = getKyivDateDaysAgo(1);

    // Fetch delivered orders from KeyCRM (status 8 = delivered)
    // We paginate up to 3 pages to catch all
    const allOrders: KOrder[] = [];
    let page = 1;
    while (page <= 3) {
      const data = await keycrmFetch<{ data: KOrder[]; last_page: number }>(
        `/order?filter[status_id]=8&sort=-id&limit=50&page=${page}&include=buyer`
      );
      allOrders.push(...(data.data ?? []));
      if (page >= data.last_page) break;
      page++;
    }

    // Also check completed orders (status 10)
    page = 1;
    while (page <= 3) {
      const data = await keycrmFetch<{ data: KOrder[]; last_page: number }>(
        `/order?filter[status_id]=10&sort=-id&limit=50&page=${page}&include=buyer`
      );
      allOrders.push(...(data.data ?? []));
      if (page >= data.last_page) break;
      page++;
    }

    // Filter to orders whose status changed yesterday (delivered 1 day ago)
    const deliveredYesterday = allOrders.filter(o =>
      o.status_changed_at && o.status_changed_at.startsWith(yesterdayDate)
    );

    if (deliveredYesterday.length === 0) {
      return NextResponse.json({ ok: true, processed: 0, reason: 'no_deliveries_yesterday' });
    }

    // Collect unique phones
    const phonesSet = new Set<string>();
    for (const order of deliveredYesterday) {
      const phone = order.buyer?.phone?.replace(/\D/g, '');
      if (phone && phone.length >= 10) phonesSet.add(phone);
    }
    const phones = Array.from(phonesSet);

    // Get telegram links and customer profiles for all phones at once
    const telegramLinks = await getTelegramLinksByPhones(supabase, phones);

    const { data: profiles } = await supabase
      .from('customer_profiles')
      .select('phone, segment, total_orders')
      .in('phone', phones);
    const profileMap = new Map<string, { segment: string; totalOrders: number }>();
    for (const p of profiles ?? []) {
      profileMap.set(p.phone, { segment: p.segment ?? 'new', totalOrders: p.total_orders ?? 1 });
    }

    let sent = 0;
    let skipped = 0;

    for (const order of deliveredYesterday) {
      const phone = order.buyer?.phone?.replace(/\D/g, '');
      if (!phone || phone.length < 10) continue;

      const link = telegramLinks.get(phone);
      if (!link) {
        skipped++;
        continue; // Customer not in Telegram bot
      }

      // Anti-spam check
      const allowed = await canSendMessage(supabase, phone);
      if (!allowed) {
        skipped++;
        continue;
      }

      // Check if we already sent a post-delivery message for this order
      const { data: existing } = await supabase
        .from('retention_messages')
        .select('id')
        .eq('phone', phone)
        .eq('message_type', 'post_delivery')
        .eq('order_id', order.id)
        .limit(1);

      if (existing && existing.length > 0) {
        skipped++;
        continue;
      }

      const profile = profileMap.get(phone);

      // Try AI-generated message first
      let messageText = await generateAiMessage({
        messageType: 'post_delivery',
        firstName: link.firstName,
        segment: profile?.segment ?? 'new',
        products: [],
        totalOrders: profile?.totalOrders ?? 1,
        orderId: order.id,
      });

      // Fallback to template if AI fails
      if (!messageText) {
        const firstName = link.firstName ?? '';
        const greeting = firstName ? `${firstName}, все` : 'Все';

        messageText =
          `${greeting} отримали? Якщо щось не так -- пишіть, ми на зв'язку.\n\n` +
          `Замовлення #${order.id}`;
      }

      try {
        await sendCustomerMessage(link.telegramId, messageText, {
          reply_markup: {
            inline_keyboard: [[
              { text: 'Все добре, дякую!', callback_data: `retention_ok_${order.id}` },
              { text: 'Є питання', callback_data: `retention_issue_${order.id}` },
            ]],
          },
        });

        await logRetentionMessage(supabase, {
          phone,
          telegramId: link.telegramId,
          messageType: 'post_delivery',
          messageText,
          orderId: order.id,
        });

        sent++;
      } catch (err) {
        console.error(`[Post-Delivery] Failed to send to ${phone}:`, err);
      }
    }

    return NextResponse.json({ ok: true, delivered_yesterday: deliveredYesterday.length, sent, skipped });
  } catch (err) {
    console.error('[Post-Delivery Cron]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
