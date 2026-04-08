import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabase,
  verifyCronAuth,
  isWithinSendWindow,
  getKyivDate,
  canSendMessage,
  sendCustomerMessage,
  logRetentionMessage,
  getTelegramLinksByPhones,
} from '@/lib/retention/helpers';
import { REORDER_LOOKAHEAD_DAYS } from '@/lib/retention/constants';

/**
 * REORDER REMINDER
 * Runs daily via Vercel cron.
 * Scans consumption_tracking for products nearing estimated empty date.
 * Sends first reminder (stage 0 -> 1) when estimated_empty_date <= today + 14 days.
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
    const today = getKyivDate();

    // Calculate the lookahead cutoff date
    const cutoffDate = new Date(today);
    cutoffDate.setDate(cutoffDate.getDate() + REORDER_LOOKAHEAD_DAYS);
    const cutoffStr = cutoffDate.toISOString().slice(0, 10);

    // Find all consumption entries where:
    // - estimated_empty_date is within the lookahead window
    // - reminder_stage is 0 (not yet reminded)
    const { data: dueItems, error: queryError } = await supabase
      .from('consumption_tracking')
      .select('*')
      .lte('estimated_empty_date', cutoffStr)
      .eq('reminder_stage', 0)
      .order('estimated_empty_date', { ascending: true });

    if (queryError) {
      console.error('[Reorder] Query error:', queryError);
      return NextResponse.json({ error: queryError.message }, { status: 500 });
    }

    if (!dueItems || dueItems.length === 0) {
      return NextResponse.json({ ok: true, processed: 0, reason: 'no_items_due' });
    }

    // Collect unique phones
    const phones = [...new Set(dueItems.map(item => item.phone))];

    // Get telegram links for all phones at once
    const telegramLinks = await getTelegramLinksByPhones(supabase, phones);

    let sent = 0;
    let skipped = 0;

    // Group items by phone to send one message per customer (not per product)
    const itemsByPhone = new Map<string, typeof dueItems>();
    for (const item of dueItems) {
      const existing = itemsByPhone.get(item.phone) ?? [];
      existing.push(item);
      itemsByPhone.set(item.phone, existing);
    }

    const webAppUrl = 'https://dezik-admin.vercel.app/customer';

    for (const [phone, items] of itemsByPhone) {
      const link = telegramLinks.get(phone);
      if (!link) {
        skipped += items.length;
        continue; // No Telegram link
      }

      // Anti-spam check
      const allowed = await canSendMessage(supabase, phone);
      if (!allowed) {
        skipped += items.length;
        continue;
      }

      // Build product list for the message
      const productLines = items
        .slice(0, 5) // Max 5 products per message
        .map(item => {
          const name = item.product_name || item.product_category;
          const daysLeft = Math.max(
            0,
            Math.ceil(
              (new Date(item.estimated_empty_date).getTime() - new Date(today).getTime()) /
              86400000
            )
          );
          if (daysLeft <= 0) return `  -- ${name} (вже закінчився)`;
          if (daysLeft <= 3) return `  -- ${name} (залишилось ${daysLeft} дн.)`;
          return `  -- ${name} (~${daysLeft} дн.)`;
        })
        .join('\n');

      const firstName = link.firstName ?? '';
      const greeting = firstName ? `${firstName}, схоже` : 'Схоже';
      const plural = items.length > 1 ? 'деяких товарів' : 'товару';

      const messageText =
        `${greeting}, запас ${plural} закінчується:\n\n` +
        `${productLines}\n\n` +
        `Повторити замовлення?`;

      try {
        await sendCustomerMessage(link.telegramId, messageText, {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Повторити замовлення', web_app: { url: webAppUrl } }],
              [{ text: 'Каталог на сайті', url: 'https://dezik.com.ua' }],
            ],
          },
        });

        await logRetentionMessage(supabase, {
          phone,
          telegramId: link.telegramId,
          messageType: 'reorder_reminder',
          messageText,
        });

        // Update reminder_stage to 1 for all items
        for (const item of items) {
          await supabase
            .from('consumption_tracking')
            .update({
              reminder_stage: 1,
              reminder_last_sent_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', item.id);
        }

        sent++;
      } catch (err) {
        console.error(`[Reorder] Failed to send to ${phone}:`, err);
      }
    }

    return NextResponse.json({
      ok: true,
      due_items: dueItems.length,
      customers_messaged: sent,
      skipped,
    });
  } catch (err) {
    console.error('[Reorder Cron]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
