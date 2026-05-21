import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireStaff } from '@/lib/telegram/auth';

/**
 * Register an Expo push token for the authenticated staff member.
 * Body: { expo_push_token: string, platform: 'ios' | 'android' }
 */
export async function POST(request: NextRequest) {
  try {
    const staff = await requireStaff(request);
    const body = (await request.json()) as { expo_push_token?: unknown; platform?: unknown };

    if (typeof body.expo_push_token !== 'string' || !body.expo_push_token.startsWith('ExponentPushToken[')) {
      return NextResponse.json({ error: 'Невірний expo_push_token' }, { status: 400 });
    }
    if (body.platform !== 'ios' && body.platform !== 'android') {
      return NextResponse.json({ error: 'Невірна platform' }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { error } = await supabase
      .from('ops_staff')
      .update({
        expo_push_token: body.expo_push_token,
        expo_push_platform: body.platform,
      })
      .eq('id', staff.id);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: message === 'Unauthorized' ? 401 : 500 });
  }
}
