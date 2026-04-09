import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { dualWriteMessage } from '@/lib/chat/dual-write';

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
  // Verify webhook secret (required)
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[Webhook] TELEGRAM_WEBHOOK_SECRET not configured');
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  const secretHeader = request.headers.get('x-telegram-bot-api-secret-token');
  if (secretHeader !== webhookSecret) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  try {
    const update = await request.json();
    const msg = update.message;
    if (!msg) return NextResponse.json({ ok: true });

    const chatId = msg.chat.id;
    const text = msg.text;

    // Handle photo messages (payment screenshots)
    if (msg.photo && msg.photo.length > 0) {
      const fileId = msg.photo[msg.photo.length - 1].file_id;
      const token = getToken();

      // Get file path from Telegram
      const fileRes = await fetch(`${BOT_API}${token}/getFile?file_id=${fileId}`);
      const fileData = await fileRes.json();
      const filePath = fileData.result?.file_path;
      if (!filePath) {
        await sendMessage(chatId, '❌ Не вдалося обробити фото. Спробуйте ще раз.');
        return NextResponse.json({ ok: true });
      }

      // Download photo from Telegram
      const downloadUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;
      const photoRes = await fetch(downloadUrl);
      const photoBlob = await photoRes.blob();

      // Upload to Supabase storage
      const ext = filePath.split('.').pop() || 'jpg';
      const fileName = `payment-proof/tg-${chatId}/${Date.now()}.${ext}`;

      const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
      const { error: uploadError } = await supabase.storage
        .from('ops-photos')
        .upload(fileName, photoBlob, {
          contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
          upsert: false,
        });

      if (uploadError) {
        console.error('[Customer Webhook Photo Upload]', uploadError);
        await sendMessage(chatId, '❌ Не вдалося завантажити фото. Спробуйте ще раз.');
        return NextResponse.json({ ok: true });
      }

      const { data: urlData } = supabase.storage
        .from('ops-photos')
        .getPublicUrl(fileName);
      const photoUrl = urlData.publicUrl;

      // Find the most recent order for this customer
      const { data: recentMsg } = await supabase
        .from('ops_order_messages')
        .select('order_id')
        .eq('sender_telegram_id', chatId)
        .eq('sender_type', 'customer')
        .order('created_at', { ascending: false })
        .limit(1);

      const orderId = recentMsg?.[0]?.order_id ?? null;

      // Save photo message
      const paymentText = orderId ? `Підтвердження оплати\n${photoUrl}` : `Фото від клієнта\n${photoUrl}`;
      await supabase
        .from('ops_order_messages')
        .insert({
          order_id: orderId ?? 0,
          sender_type: 'customer',
          sender_telegram_id: chatId,
          text: `💳 ${paymentText}`,
        });

      // Dual-write to unified chat
      dualWriteMessage(supabase, {
        customerTelegramId: chatId,
        senderType: 'customer',
        senderId: String(chatId),
        text: `💳 ${paymentText}`,
        orderId,
        channel: 'telegram_dm',
      });

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
              text: `💳 Підтвердження оплати по замовленню #${orderId}\nФото: ${photoUrl}`,
              parse_mode: 'HTML',
            }),
          });
        } catch {}
      }

      await sendMessage(chatId, 'Фото отримано! Менеджер перевірить оплату.');
      return NextResponse.json({ ok: true });
    }

    if (!text) return NextResponse.json({ ok: true });

    if (text === '/start') {
      // Save bot subscriber
      const supabaseStart = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
      const firstName = msg.from?.first_name ?? null;
      const username = msg.from?.username ?? null;
      try {
        await supabaseStart.from('bot_subscribers').upsert({
          telegram_id: chatId,
          first_name: firstName,
          username,
          last_active: new Date().toISOString(),
        }, { onConflict: 'telegram_id' });
      } catch {}

      const webAppUrl = 'https://dezik-admin.vercel.app/customer';
      await sendMessage(chatId, 'Вітаємо в Dezik! 👋\n\nТут ви можете:\n— переглядати статус замовлень\n— підтвердити оплату\n— отримати консультацію AI\n— переглянути сертифікати та інструкції\n\nНатисніть кнопку нижче, введіть номер телефону і ви побачите всі ваші замовлення.', {
        reply_markup: {
          inline_keyboard: [[
            { text: '📦 Мій кабінет', web_app: { url: webAppUrl } },
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

    const orderId = recentMsg?.[0]?.order_id ?? null;

    // Save to ops_order_messages (backward compat, use order_id 0 if no order context)
    await supabase
      .from('ops_order_messages')
      .insert({ order_id: orderId ?? 0, sender_type: 'customer', sender_telegram_id: chatId, text });

    // Save to unified chat system (always works, regardless of order)
    dualWriteMessage(supabase, {
      customerTelegramId: chatId,
      senderType: 'customer',
      text,
      orderId,
      channel: 'telegram_dm',
    });

    // Look up customer name for notification
    const { data: link } = await supabase
      .from('customer_telegram_links')
      .select('phone, first_name')
      .eq('telegram_id', chatId)
      .maybeSingle();

    const customerLabel = link
      ? `${link.first_name ?? 'Клієнт'} (${link.phone ?? ''})`
      : `Telegram ${chatId}`;

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
            text: orderId
              ? `💬 <b>Повідомлення по замовленню #${orderId}</b>\n${customerLabel}\n\n${text}`
              : `💬 <b>Повідомлення від ${customerLabel}</b>\n\n${text}`,
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
