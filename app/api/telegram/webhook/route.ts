import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendStartMessage, sendMessage } from '@/lib/telegram/bot';
import type { TelegramUpdate } from '@/lib/telegram/types';

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
    const update: TelegramUpdate = await request.json();

    if (update.message?.text) {
      const chatId = update.message.chat.id;
      const text = update.message.text;
      const from = update.message.from;

      if (text === '/start') {
        const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

        // Check if already registered
        const { data: staff } = await supabase
          .from('ops_staff')
          .select('id, name')
          .eq('telegram_id', from.id)
          .eq('active', true)
          .single();

        if (staff) {
          // Existing staff — show Mini App button
          const webAppUrl = 'https://dezik-admin.vercel.app/telegram';
          await sendStartMessage(chatId, webAppUrl);
        } else {
          // Check if request already pending
          const { data: existing } = await supabase
            .from('ops_staff_requests')
            .select('status')
            .eq('telegram_id', from.id)
            .single();

          if (existing?.status === 'pending') {
            await sendMessage(chatId, '⏳ Ваша заявка на розгляді. Очікуйте підтвердження від адміністратора.');
          } else if (existing?.status === 'rejected') {
            await sendMessage(chatId, '❌ Вашу заявку відхилено. Зверніться до адміністратора.');
          } else {
            // Create new request
            const name = [from.first_name, from.last_name].filter(Boolean).join(' ');
            await supabase.from('ops_staff_requests').upsert({
              telegram_id: from.id,
              name,
              username: from.username ?? null,
              status: 'pending',
            }, { onConflict: 'telegram_id' });

            await sendMessage(chatId, '👋 Вітаю! Заявку на доступ надіслано.\n\nОчікуйте підтвердження від адміністратора.');

            // Notify admins with inline keyboard
            const { data: admins } = await supabase
              .from('ops_staff')
              .select('telegram_id')
              .eq('role', 'admin')
              .eq('active', true);

            const adminMsg =
              `👤 <b>Новий запит на доступ</b>\n\n` +
              `Ім'я: <b>${name}</b>\n` +
              `Username: ${from.username ? '@' + from.username : '—'}\n` +
              `Telegram ID: <code>${from.id}</code>\n\n` +
              `Підтвердіть в розділі "Команда" в додатку.`;

            for (const admin of admins ?? []) {
              try {
                await sendMessage(admin.telegram_id, adminMsg);
              } catch {}
            }
          }
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[Webhook Error]', err);
    return NextResponse.json({ ok: true });
  }
}
