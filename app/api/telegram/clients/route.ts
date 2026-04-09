import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/telegram/auth';
const KEY = () => process.env.KEYCRM_API_KEY!;
import { createClient } from '@supabase/supabase-js';

interface KeyCRMBuyer {
  id: number;
  full_name: string | null;
  phone: string[] | string | null;
  email: string[] | string | null;
  orders_count: number;
  orders_sum: string | null;
  created_at: string;
  updated_at: string;
}

export async function GET(request: NextRequest) {
  try {
    await requireStaff(request);
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search')?.trim();
    const page = parseInt(searchParams.get('page') ?? '1');

    let url = `https://openapi.keycrm.app/v1/buyer?limit=50&page=${page}`;
    if (search) {
      url += `&search=${encodeURIComponent(search)}`;
    }

    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${KEY()}`, 'Accept': 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`KeyCRM ${res.status}`);
    const data = await res.json() as { data: KeyCRMBuyer[]; last_page: number; total: number };

    // Check which customers are in bot
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const phoneList = (data.data ?? []).map(b => {
      const raw = Array.isArray(b.phone) ? b.phone[0] : b.phone;
      return raw?.replace(/\D/g, '').replace(/^38/, '') ?? '';
    }).filter(Boolean);
    const inBotSet = new Set<string>();
    if (phoneList.length > 0) {
      const { data: links } = await supabase.from('customer_telegram_links').select('phone').in('phone', phoneList);
      for (const l of links ?? []) inBotSet.add(l.phone);
    }

    const clients = (data.data ?? []).map(b => {
      const rawPhone = Array.isArray(b.phone) ? b.phone[0] : b.phone;
      const normPhone = rawPhone?.replace(/\D/g, '').replace(/^38/, '') ?? '';
      return {
        id: b.id,
        name: b.full_name ?? 'Без імені',
        phone: rawPhone ?? null,
        orders_count: b.orders_count ?? 0,
        orders_sum: parseFloat(b.orders_sum ?? '0'),
        in_bot: inBotSet.has(normPhone),
        created_at: b.created_at,
      };
    });

    return NextResponse.json({ data: clients, total: data.total ?? 0, last_page: data.last_page ?? 1 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: message === 'Unauthorized' ? 401 : 500 });
  }
}
