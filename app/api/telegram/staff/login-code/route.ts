import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { issueStaffToken } from '@/lib/telegram/staff-token';

/**
 * Exchange a 6-digit login code (issued by the bot via `/login`) for a long-lived
 * staff token used by the Dezik Staff mobile app.
 *
 * Body: { code: string }
 * Response: { token, staff }
 */
export async function POST(request: NextRequest) {
  try {
    const { code } = (await request.json()) as { code?: unknown };
    if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: 'Невірний формат коду' }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // ── Apple App Review backdoor ──────────────────────────────────────
    // Reviewers cannot receive codes from our Telegram bot, so they would
    // otherwise be unable to log in and would reject the build. We accept a
    // fixed env-controlled code that maps to a pre-provisioned read-only
    // demo staff row. Revoke instantly by clearing APPLE_REVIEW_CODE.
    const reviewCode = process.env.APPLE_REVIEW_CODE;
    const reviewStaffId = process.env.APPLE_REVIEW_STAFF_ID;
    if (reviewCode && reviewStaffId && code === reviewCode) {
      const { data: demoStaff } = await supabase
        .from('ops_staff')
        .select('*')
        .eq('id', reviewStaffId)
        .eq('active', true)
        .single();
      if (demoStaff) {
        const token = issueStaffToken(demoStaff.id, demoStaff.telegram_id ?? 0);
        return NextResponse.json({ token, staff: demoStaff });
      }
    }

    const { data: row } = await supabase
      .from('ops_staff_login_codes')
      .select('code, telegram_id, expires_at')
      .eq('code', code)
      .single();

    if (!row) {
      return NextResponse.json({ error: 'Код не знайдено або вже використано' }, { status: 401 });
    }

    // One-shot: delete regardless of whether it's expired
    await supabase.from('ops_staff_login_codes').delete().eq('code', code);

    if (new Date(row.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: 'Код прострочено' }, { status: 401 });
    }

    const { data: staff } = await supabase
      .from('ops_staff')
      .select('*')
      .eq('telegram_id', row.telegram_id)
      .eq('active', true)
      .single();

    if (!staff) {
      return NextResponse.json({ error: 'Користувача не знайдено або не активовано' }, { status: 403 });
    }

    const token = issueStaffToken(staff.id, row.telegram_id);
    return NextResponse.json({ token, staff });
  } catch (err) {
    console.error('[staff/login-code]', err);
    return NextResponse.json({ error: 'Внутрішня помилка' }, { status: 500 });
  }
}
