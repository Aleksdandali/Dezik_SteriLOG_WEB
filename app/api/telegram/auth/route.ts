import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateInitData } from '@/lib/telegram/validate';

export async function POST(request: NextRequest) {
  try {
    const { initData } = await request.json();
    if (!initData) {
      return NextResponse.json({ error: 'Missing initData' }, { status: 400 });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return NextResponse.json({ error: 'Bot not configured' }, { status: 500 });
    }

    console.log('[Auth] initData length:', initData.length);
    console.log('[Auth] botToken exists:', !!botToken, 'length:', botToken.length);

    const tgUser = await validateInitData(initData, botToken);
    if (!tgUser) {
      console.log('[Auth] Validation failed for initData starting with:', initData.substring(0, 100));
      return NextResponse.json({ error: 'Invalid initData' }, { status: 401 });
    }

    console.log('[Auth] Validated user:', tgUser.id, tgUser.first_name);

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data: staff } = await supabase
      .from('ops_staff')
      .select('*')
      .eq('telegram_id', tgUser.id)
      .eq('active', true)
      .single();

    if (!staff) {
      return NextResponse.json(
        { error: 'Вас немає в системі. Зверніться до адміністратора.', telegram_id: tgUser.id },
        { status: 403 }
      );
    }

    return NextResponse.json({ staff });
  } catch (err) {
    console.error('[Auth Error]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
