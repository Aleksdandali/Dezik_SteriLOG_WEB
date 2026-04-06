import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const OPS_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';

async function sendTelegram(chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${OPS_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
}

/** POST — upload payment proof photo */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const orderId = formData.get('order_id');
    const file = formData.get('photo') as File | null;

    if (!orderId || !file) {
      return NextResponse.json({ error: 'order_id and photo are required' }, { status: 400 });
    }

    // Validate file size (10MB max)
    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 });
    }

    // Validate MIME type — only allow images
    const ALLOWED_TYPES: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/heic': 'heic',
    };
    const ext = ALLOWED_TYPES[file.type];
    if (!ext) {
      return NextResponse.json({ error: 'Only JPEG, PNG, WebP, HEIC images allowed' }, { status: 400 });
    }

    const fileName = `payment-proof/${orderId}/${Date.now()}.${ext}`;

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    const { error: uploadError } = await supabase.storage
      .from('ops-photos')
      .upload(fileName, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('[Payment Proof Upload Error]', uploadError);
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }

    const { data: urlData } = supabase.storage
      .from('ops-photos')
      .getPublicUrl(fileName);

    const photoUrl = urlData.publicUrl;

    // Save message to ops_order_messages
    await supabase
      .from('ops_order_messages')
      .insert({
        order_id: parseInt(String(orderId)),
        sender_type: 'customer',
        sender_telegram_id: null,
        text: `💳 Підтвердження оплати\n${photoUrl}`,
      });

    // Notify ops admins via Telegram bot
    const { data: admins } = await supabase
      .from('ops_staff')
      .select('telegram_id')
      .eq('role', 'admin')
      .eq('active', true);

    for (const admin of admins ?? []) {
      try {
        await sendTelegram(admin.telegram_id,
          `💳 Підтвердження оплати по замовленню #${orderId}\nФото: ${photoUrl}`
        );
      } catch {}
    }

    return NextResponse.json({ ok: true, url: photoUrl });
  } catch (err) {
    console.error('[Payment Proof Error]', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 });
  }
}

/** GET — get payment proofs for an order */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get('order_id');
  if (!orderId) return NextResponse.json({ data: [] });

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data } = await supabase
    .from('ops_order_messages')
    .select('id, text, created_at')
    .eq('order_id', parseInt(orderId))
    .like('text', '💳 Підтвердження оплати%')
    .order('created_at', { ascending: true });

  return NextResponse.json({ data: data ?? [] });
}
