import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireStaff } from '@/lib/telegram/auth';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const CUSTOMER_BOT_TOKEN = process.env.TELEGRAM_CUSTOMER_BOT_TOKEN ?? '';

async function sendTelegramToCustomer(chatId: number, text: string) {
  const res = await fetch(
    `https://api.telegram.org/bot${CUSTOMER_BOT_TOKEN}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    },
  );
  if (!res.ok) {
    const err = await res.text();
    console.error('[Telegram sendMessage]', err);
  }
}

/** GET /api/chat/conversations/[id]/messages — Load messages */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireStaff(request);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 100);
  const before = searchParams.get('before');

  const supabase = getSupabase();

  let query = supabase
    .from('chat_messages')
    .select('*')
    .eq('conversation_id', id)
    .order('created_at', { ascending: false })
    .limit(limit + 1); // fetch one extra to check has_more

  if (before) {
    query = query.lt('created_at', before);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[Chat Messages GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const messages = data ?? [];
  const hasMore = messages.length > limit;
  if (hasMore) messages.pop();

  // Reverse to chronological order for the client
  messages.reverse();

  // Side effect: reset unread count for this conversation
  await supabase
    .from('chat_conversations')
    .update({ unread_by_manager: 0 })
    .eq('id', id);

  return NextResponse.json({ data: messages, has_more: hasMore });
}

/** POST /api/chat/conversations/[id]/messages — Manager sends reply */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let staff;
  try {
    staff = await requireStaff(request);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  let body: { text?: string; order_id?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { text, order_id } = body;
  if (!text?.trim()) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 });
  }

  const supabase = getSupabase();

  // Get conversation to find customer telegram_id
  const { data: conversation, error: convError } = await supabase
    .from('chat_conversations')
    .select('*')
    .eq('id', id)
    .single();

  if (convError || !conversation) {
    return NextResponse.json(
      { error: 'Conversation not found' },
      { status: 404 },
    );
  }

  // Insert message
  const { data: msg, error: msgError } = await supabase
    .from('chat_messages')
    .insert({
      conversation_id: id,
      sender_type: 'manager',
      sender_telegram_id: staff.telegram_id,
      channel: 'internal',
      text: text.trim(),
      order_id: order_id ?? null,
    })
    .select()
    .single();

  if (msgError) {
    console.error('[Chat Messages POST]', msgError);
    return NextResponse.json({ error: msgError.message }, { status: 500 });
  }

  // Update conversation metadata
  const preview =
    text.trim().length > 100 ? text.trim().slice(0, 100) + '...' : text.trim();

  await supabase
    .from('chat_conversations')
    .update({
      last_message_at: msg.created_at,
      last_message_preview: preview,
      last_message_sender: 'manager',
      unread_by_manager: 0,
    })
    .eq('id', id);

  // Deliver to customer via Telegram
  const customerTgId = conversation.customer_telegram_id;
  if (customerTgId) {
    const orderLabel = order_id ? ` #${order_id}` : '';
    try {
      await sendTelegramToCustomer(
        customerTgId,
        `<b>Відповідь менеджера${orderLabel}</b>\n\n${text.trim()}`,
      );
    } catch (err) {
      console.error('[Chat] Failed to send Telegram to customer:', err);
    }
  }

  return NextResponse.json({ data: msg });
}
