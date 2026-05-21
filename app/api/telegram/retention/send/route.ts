import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/telegram/auth';
import {
  getSupabase,
  canSendMessage,
  sendCustomerMessage,
  logRetentionMessage,
  getTelegramLinksByPhones,
  generateAiMessage,
} from '@/lib/retention/helpers';

/**
 * POST /api/telegram/retention/send
 * Manager manually sends a retention message to a customer.
 * Body: { phone, messageType: 'reorder_reminder' | 'post_delivery' | 'win_back', products?: [...] }
 */
export async function POST(request: NextRequest) {
  try {
    const staff = await requireStaff(request);
    const body = await request.json();
    const { phone, messageType, products, segment, totalOrders, firstName } = body as {
      phone: string;
      messageType: 'reorder_reminder' | 'post_delivery' | 'win_back';
      products?: { name: string; daysLeft?: number }[];
      segment?: string;
      totalOrders?: number;
      firstName?: string;
    };

    if (!phone || !messageType) {
      return NextResponse.json({ error: 'phone and messageType required' }, { status: 400 });
    }

    const supabase = getSupabase();

    // Check telegram link
    const links = await getTelegramLinksByPhones(supabase, [phone]);
    const link = links.get(phone);
    if (!link) {
      return NextResponse.json({ error: 'not_in_bot', message: 'Клієнт не підписаний на бот' }, { status: 400 });
    }

    // Anti-spam check
    const allowed = await canSendMessage(supabase, phone);
    if (!allowed) {
      return NextResponse.json({ error: 'rate_limited', message: 'Нещодавно вже надсилали повідомлення' }, { status: 429 });
    }

    // Generate AI message
    let messageText = await generateAiMessage({
      messageType: messageType === 'win_back' ? 'reorder_reminder' : messageType,
      firstName: firstName ?? link.firstName,
      segment: segment ?? 'new',
      products: products ?? [],
      totalOrders: totalOrders ?? 1,
    });

    // Fallback
    if (!messageText) {
      const name = firstName ?? link.firstName ?? '';
      if (messageType === 'reorder_reminder') {
        const productList = (products ?? []).map(p => p.name).join(', ');
        messageText = `${name ? name + ', в' : 'В'}итратні матеріали закінчуються${productList ? ': ' + productList : ''}. Якщо потрібно поповнити — пишіть, відправимо того ж дня.`;
      } else if (messageType === 'post_delivery') {
        messageText = `${name ? name + ', все' : 'Все'} отримали? Якщо щось не так — пишіть, ми на зв'язку.`;
      } else {
        messageText = `${name ? name + ', давно' : 'Давно'} не чули від вас. Якщо потрібні витратні матеріали — ми на зв'язку, відправимо швидко.`;
      }
    }

    const webAppUrl = 'https://dezik-admin.vercel.app/customer';

    // Send
    await sendCustomerMessage(link.telegramId, messageText, {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Повторити замовлення', web_app: { url: webAppUrl } }],
          [{ text: 'Каталог на сайті', url: 'https://dezik.com.ua' }],
        ],
      },
    });

    // Log
    await logRetentionMessage(supabase, {
      phone,
      telegramId: link.telegramId,
      messageType,
      messageText,
    });

    // Log who sent it
    console.log(`[Retention Send] ${staff.name} sent ${messageType} to ${phone}`);

    return NextResponse.json({
      ok: true,
      messageSent: messageText,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: message === 'Unauthorized' ? 401 : 500 });
  }
}
