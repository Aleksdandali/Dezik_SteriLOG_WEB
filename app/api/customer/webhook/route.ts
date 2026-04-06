import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const BOT_API = 'https://api.telegram.org/bot';

function getToken(): string {
  return process.env.TELEGRAM_CUSTOMER_BOT_TOKEN ?? '';
}

async function sendMessage(chatId: number, text: string, options?: { reply_markup?: unknown; parse_mode?: string }) {
  await fetch(`${BOT_API}${getToken()}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', ...options }),
  });
}

export async function POST(request: NextRequest) {
  // Verify webhook secret if configured
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (webhookSecret) {
    const secretHeader = request.headers.get('x-telegram-bot-api-secret-token');
    if (secretHeader !== webhookSecret) {
      return NextResponse.json({ ok: false }, { status: 403 });
    }
  }

  try {
    const update = await request.json();
    const msg = update.message;
    if (!msg?.text) return NextResponse.json({ ok: true });

    const chatId = msg.chat.id;
    const text = msg.text;

    if (text === '/start') {
      const webAppUrl = 'https://dezik-admin.vercel.app/customer';
      await sendMessage(chatId, '👋 Вітаємо в <b>Dezik</b>!\n\nПеревіряйте статус замовлень та переглядайте каталог.', {
        reply_markup: {
          inline_keyboard: [[
            { text: '📦 Мої замовлення', web_app: { url: webAppUrl } },
          ], [
            { text: '🛒 Каталог на сайті', url: 'https://dezik.com.ua' },
          ]],
        },
      });
      return NextResponse.json({ ok: true });
    }

    // Forward any other text as a chat message to the latest active order
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    // Find the most recent order this customer has chatted about (by telegram_id)
    const { data: recentMsg } = await supabase
      .from('ops_order_messages')
      .select('order_id')
      .eq('sender_telegram_id', chatId)
      .eq('sender_type', 'customer')
      .order('created_at', { ascending: false })
      .limit(1);

    const orderId = recentMsg?.[0]?.order_id;
    if (!orderId) {
      await sendMessage(chatId, '💬 Щоб написати менеджеру, відкрийте замовлення в додатку та натисніть "Написати менеджеру".', {
        reply_markup: {
          inline_keyboard: [[
            { text: '📦 Відкрити додаток', web_app: { url: 'https://dezik-admin.vercel.app/customer' } },
          ]],
        },
      });
      return NextResponse.json({ ok: true });
    }

    // Save the message
    await supabase
      .from('ops_order_messages')
      .insert({ order_id: orderId, sender_type: 'customer', sender_telegram_id: chatId, text });

    // Notify ops admins
    const OPS_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
    const { data: admins } = await supabase
      .from('ops_staff')
      .select('telegram_id')
      .eq('role', 'admin')
      .eq('active', true);

    for (const admin of admins ?? []) {
      try {
        await fetch(`${BOT_API}${OPS_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: admin.telegram_id,
            text: `💬 <b>Повідомлення по замовленню #${orderId}</b>\n\n${text}`,
            parse_mode: 'HTML',
          }),
        });
      } catch {}
    }

    await sendMessage(chatId, '✅ Повідомлення надіслано менеджеру. Ми відповімо якнайшвидше!');

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[Customer Webhook]', err);
    return NextResponse.json({ ok: true });
  }
}
