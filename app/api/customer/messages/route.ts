import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateInitData } from '@/lib/telegram/validate';
import { dualWriteMessage } from '@/lib/chat/dual-write';

const OPS_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const CUSTOMER_BOT_TOKEN = process.env.TELEGRAM_CUSTOMER_BOT_TOKEN ?? '';

async function sendTelegram(token: string, chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
}

/** GET messages for an order */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get('order_id');
  if (!orderId) return NextResponse.json({ data: [] });

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data } = await supabase
    .from('ops_order_messages')
    .select('*')
    .eq('order_id', parseInt(orderId))
    .order('created_at', { ascending: true });

  return NextResponse.json({ data: data ?? [] });
}

/** POST send a message */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { order_id, sender_telegram_id, text } = body;

    if (order_id === undefined || order_id === null || !text) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    // Determine sender_type from authentication, not client input
    let sender_type = 'customer';
    const initData = request.headers.get('x-telegram-init-data');
    if (initData) {
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      if (botToken) {
        const tgUser = await validateInitData(initData, botToken);
        if (tgUser) {
          sender_type = 'manager';
        }
      }
    }

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    // Save message
    const { data: msg, error } = await supabase
      .from('ops_order_messages')
      .insert({ order_id, sender_type, sender_telegram_id: sender_telegram_id ?? null, text })
      .select()
      .single();

    if (error) throw error;

    // Dual-write to chat_conversations / chat_messages
    if (sender_telegram_id) {
      dualWriteMessage(supabase, {
        customerTelegramId: sender_telegram_id,
        senderType: sender_type as 'customer' | 'manager',
        senderId: String(sender_telegram_id),
        text,
        orderId: order_id,
        channel: sender_type === 'manager' ? 'internal' : 'telegram_miniapp',
      });
    }

    // Forward to the other side
    if (sender_type === 'customer') {
      // Look up customer info for notification
      let customerLabel = `замовлення #${order_id}`;
      if (sender_telegram_id) {
        const { data: link } = await supabase
          .from('customer_telegram_links')
          .select('phone, first_name')
          .eq('telegram_id', sender_telegram_id)
          .maybeSingle();
        if (link) {
          customerLabel = `${link.first_name ?? 'Клієнт'} (${link.phone ?? ''})`;
        }
      }
      if (order_id === 0) customerLabel = customerLabel.replace('замовлення #0', customerLabel);

      // Notify managers via ops bot
      const { data: admins } = await supabase
        .from('ops_staff')
        .select('telegram_id')
        .eq('role', 'admin')
        .eq('active', true);

      for (const admin of admins ?? []) {
        try {
          await sendTelegram(OPS_BOT_TOKEN, admin.telegram_id,
            order_id > 0
              ? `💬 <b>Повідомлення по замовленню #${order_id}</b>\n${customerLabel}\n\n${text}`
              : `💬 <b>Повідомлення від ${customerLabel}</b>\n\n${text}`
          );
        } catch {}
      }
    } else if (sender_type === 'manager' && sender_telegram_id) {
      // Find customer telegram_id from their messages
      const { data: customerMsgs } = await supabase
        .from('ops_order_messages')
        .select('sender_telegram_id')
        .eq('order_id', order_id)
        .eq('sender_type', 'customer')
        .not('sender_telegram_id', 'is', null)
        .limit(1);

      const customerTgId = customerMsgs?.[0]?.sender_telegram_id;
      if (customerTgId) {
        try {
          await sendTelegram(CUSTOMER_BOT_TOKEN, customerTgId,
            `📝 <b>Відповідь по замовленню #${order_id}</b>\n\n${text}`
          );
        } catch {}
      }
    }

    return NextResponse.json({ data: msg });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
