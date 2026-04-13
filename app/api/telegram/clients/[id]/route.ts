import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/telegram/auth';
import { keycrmFetch } from '@/lib/keycrm';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/** GET /api/telegram/clients/[id] — Full client detail with orders, products, intelligence */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireStaff(request);
    const { id } = await params;
    const buyerId = parseInt(id);
    if (!buyerId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

    const supabase = getSupabase();

    // 1. Fetch buyer from KeyCRM
    const buyer = await keycrmFetch<{
      id: number; full_name: string | null; phone: string[] | string | null;
      email: string[] | string | null; orders_count: number; orders_sum: string | null;
      created_at: string;
    }>(`/buyer/${buyerId}`);

    // 2. Fetch all orders for this buyer (up to 10 pages)
    const allOrders: {
      id: number; ordered_at: string; created_at: string; grand_total: number;
      status_id: number; payment_status: string;
      products: { product_id?: number; name: string; sku: string; quantity: number; price: number; price_sold: number }[];
      shipping?: { address_payload?: { city_desc?: string; region_desc?: string } };
    }[] = [];

    let page = 1;
    while (page <= 10) {
      const data = await keycrmFetch<{ data: typeof allOrders; last_page: number }>(
        `/order?filter[buyer_id]=${buyerId}&include=products,shipping&sort=-ordered_at&limit=50&page=${page}`
      );
      allOrders.push(...(data.data ?? []));
      if (page >= data.last_page) break;
      page++;
    }

    // 3. Get intelligence data from Supabase (if available)
    const rawPhone = Array.isArray(buyer.phone) ? buyer.phone[0] : buyer.phone;
    const normPhone = rawPhone?.replace(/\D/g, '').replace(/^38/, '') ?? '';

    const { data: intelligence } = await supabase
      .from('customer_intelligence')
      .select('*')
      .eq('keycrm_buyer_id', buyerId)
      .maybeSingle();

    // 4. Get consumption tracking
    const { data: consumption } = normPhone ? await supabase
      .from('consumption_tracking')
      .select('*')
      .eq('phone', normPhone) : { data: null };

    // 5. Get retention messages history
    const { data: messages } = normPhone ? await supabase
      .from('retention_messages')
      .select('*')
      .eq('phone', normPhone)
      .order('sent_at', { ascending: false })
      .limit(20) : { data: null };

    // 6. Check if in Telegram bot
    const { data: tgLink } = normPhone ? await supabase
      .from('customer_telegram_links')
      .select('telegram_id, first_name')
      .eq('phone', normPhone)
      .maybeSingle() : { data: null };

    // 7. Get customer profile
    const { data: profile } = normPhone ? await supabase
      .from('customer_profiles')
      .select('*')
      .eq('phone', normPhone)
      .maybeSingle() : { data: null };

    // Compute city from orders
    const city = allOrders.find(o => o.shipping?.address_payload?.city_desc)
      ?.shipping?.address_payload?.city_desc ?? null;

    // Compute product breakdown
    const productStats: Record<string, { name: string; count: number; totalQty: number; totalSpent: number; lastDate: string }> = {};
    for (const order of allOrders) {
      for (const p of order.products ?? []) {
        const key = p.name;
        if (!productStats[key]) {
          productStats[key] = { name: p.name, count: 0, totalQty: 0, totalSpent: 0, lastDate: '' };
        }
        productStats[key].count++;
        productStats[key].totalQty += p.quantity;
        productStats[key].totalSpent += (p.price_sold || p.price) * p.quantity;
        const d = order.ordered_at || order.created_at;
        if (d > productStats[key].lastDate) productStats[key].lastDate = d;
      }
    }

    const productBreakdown = Object.values(productStats)
      .sort((a, b) => b.totalSpent - a.totalSpent);

    // Format orders for response
    const orders = allOrders.map((o, i) => {
      const prevOrder = allOrders[i + 1];
      const daysSincePrev = prevOrder
        ? Math.round((new Date(o.ordered_at || o.created_at).getTime() - new Date(prevOrder.ordered_at || prevOrder.created_at).getTime()) / 86400000)
        : null;

      return {
        id: o.id,
        date: (o.ordered_at || o.created_at).split('T')[0],
        total: o.grand_total,
        status_id: o.status_id,
        payment_status: o.payment_status,
        daysSincePrev,
        products: (o.products ?? []).map(p => ({
          name: p.name,
          qty: p.quantity,
          price: p.price_sold || p.price,
        })),
      };
    });

    return NextResponse.json({
      buyer: {
        id: buyer.id,
        name: buyer.full_name ?? 'Без імені',
        phone: rawPhone,
        city,
        orders_count: buyer.orders_count,
        orders_sum: parseFloat(buyer.orders_sum ?? '0'),
        created_at: buyer.created_at,
        in_bot: !!tgLink,
        telegram_id: tgLink?.telegram_id ?? null,
      },
      profile,
      intelligence,
      orders,
      productBreakdown,
      consumption: consumption ?? [],
      retentionMessages: messages ?? [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: message === 'Unauthorized' ? 401 : 500 });
  }
}
