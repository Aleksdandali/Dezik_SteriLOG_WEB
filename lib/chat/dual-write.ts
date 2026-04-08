import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Find or create a chat_conversation for a customer identified by telegram_id.
 * Returns the conversation row.
 */
export async function findOrCreateConversation(
  supabase: SupabaseClient,
  customerTelegramId: number,
  customerPhone?: string | null,
  customerName?: string | null,
) {
  // Try to find existing conversation by telegram_id
  const { data: existing } = await supabase
    .from('chat_conversations')
    .select('*')
    .eq('customer_telegram_id', customerTelegramId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) return existing;

  // Create new conversation
  const { data: created, error } = await supabase
    .from('chat_conversations')
    .insert({
      customer_telegram_id: customerTelegramId,
      customer_phone: customerPhone ?? null,
      customer_name: customerName ?? null,
      channel: 'telegram_miniapp',
      status: 'open',
      unread_by_manager: 0,
    })
    .select()
    .single();

  if (error) {
    console.error('[dual-write] Failed to create conversation:', error);
    return null;
  }

  return created;
}

/**
 * Dual-write a message to chat_messages and update conversation metadata.
 * This is fire-and-forget — errors are logged but do not block the caller.
 */
export async function dualWriteMessage(
  supabase: SupabaseClient,
  opts: {
    customerTelegramId: number;
    senderType: 'customer' | 'manager';
    senderId?: string | null;
    text: string;
    orderId?: number | null;
    channel?: string;
    customerPhone?: string | null;
    customerName?: string | null;
  },
) {
  try {
    // Enrich with customer data from telegram links
    let phone = opts.customerPhone;
    let name = opts.customerName;
    if (!phone || !name) {
      const { data: link } = await supabase
        .from('customer_telegram_links')
        .select('phone, first_name')
        .eq('telegram_id', opts.customerTelegramId)
        .maybeSingle();
      if (link) {
        phone = phone || link.phone;
        name = name || link.first_name;
      }
    }

    const conversation = await findOrCreateConversation(
      supabase,
      opts.customerTelegramId,
      phone,
      name,
    );
    if (!conversation) return;

    // Update name/phone if conversation was missing them
    if (conversation && (!conversation.customer_name || !conversation.customer_phone) && (name || phone)) {
      const upd: Record<string, string> = {};
      if (name && !conversation.customer_name) upd.customer_name = name;
      if (phone && !conversation.customer_phone) upd.customer_phone = phone;
      if (Object.keys(upd).length > 0) {
        await supabase.from('chat_conversations').update(upd).eq('id', conversation.id);
      }
    }

    // Insert message
    await supabase.from('chat_messages').insert({
      conversation_id: conversation.id,
      sender_type: opts.senderType,
      sender_telegram_id: opts.customerTelegramId,
      channel: opts.channel ?? 'telegram_miniapp',
      text: opts.text,
      order_id: opts.orderId ?? null,
    });

    // Update conversation metadata
    const preview =
      opts.text.length > 100 ? opts.text.slice(0, 100) + '...' : opts.text;

    const updates: Record<string, unknown> = {
      last_message_at: new Date().toISOString(),
      last_message_preview: preview,
      last_message_sender: opts.senderType,
    };

    if (opts.senderType === 'customer') {
      updates.unread_by_manager = (conversation.unread_by_manager ?? 0) + 1;
    }

    // Reopen if closed and customer writes again
    if (opts.senderType === 'customer' && conversation.status === 'closed') {
      updates.status = 'open';
    }

    await supabase
      .from('chat_conversations')
      .update(updates)
      .eq('id', conversation.id);
  } catch (err) {
    console.error('[dual-write] Error:', err);
  }
}
