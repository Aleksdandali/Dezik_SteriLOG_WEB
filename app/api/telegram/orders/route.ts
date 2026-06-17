import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/telegram/auth';
import { keycrmFetch } from '@/lib/keycrm';
import { createClient } from '@supabase/supabase-js';

interface KOrder {
  id: number;
  status_id: number;
  payment_status: string;
  grand_total: number;
  products_total: number;
  discount_amount: number;
  ordered_at: string;
  created_at: string;
  status_changed_at: string | null;
  manager_comment: string | null;
  buyer_comment: string | null;
  buyer: {
    full_name: string | null;
    phone: string | null;
    orders_count: number | null;
    orders_sum: string | null;
  } | null;
  shipping: {
    tracking_code: string | null;
    recipient_full_name: string | null;
    recipient_phone: string | null;
    shipping_address_city: string | null;
    shipping_address_region: string | null;
    shipping_receive_point: string | null;
    full_address: string | null;
  } | null;
  products: {
    name: string;
    quantity: number;
    price: number;
    sku: string | null;
    picture: { thumbnail: string } | null;
  }[];
}

const STATUS_NAMES: Record<number, string> = {
  1: 'Новий',
  4: 'Очікуємо оплату',
  8: '🚚 На збірку',
  10: '💳 Наложка',
  12: '✅ Виконано',
  19: '❌ Скасовано',
  22: 'Підтверджено ботом',
};

/** GET orders list */
export async function GET(request: NextRequest) {
  try {
    await requireStaff(request);
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') ?? '1'; // default: new orders

    // Fetch status orders, filter by status_changed_at (last 30 days)
    const allOrders: KOrder[] = [];
    let fetchPage = 1;
    while (fetchPage <= 5) {
      const d = await keycrmFetch<{ data: KOrder[]; last_page: number }>(
        `/order?filter[status_id]=${status}&sort=-id&limit=50&page=${fetchPage}&include=products,shipping,buyer`
      );
      allOrders.push(...(d.data ?? []));
      if (fetchPage >= d.last_page) break;
      fetchPage++;
    }

    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
    const filtered = allOrders.filter(o => {
      const changed = o.status_changed_at ?? o.ordered_at ?? '';
      return changed >= cutoff;
    });

    const data = { data: filtered, total: filtered.length };

    // Fetch KeyCRM offers for stock display (match by SKU)
    const stockBySku = new Map<string, number>();
    try {
      for (let offerPage = 1; offerPage <= 3; offerPage++) {
        const offersData = await keycrmFetch<{ data: { sku: string; quantity: number }[]; last_page: number }>(
          `/offers?limit=50&page=${offerPage}`
        );
        for (const offer of offersData.data ?? []) {
          if (offer.sku) stockBySku.set(offer.sku, offer.quantity);
        }
        if (offerPage >= offersData.last_page) break;
      }
    } catch {}

    // Batch query customer_telegram_links for in_bot flag
    const normalizePhone = (p: string | null | undefined) => p ? p.replace(/\D/g, '').replace(/^38/, '').replace(/^0/, '') : '';
    const allPhones = [...new Set(
      (data.data ?? []).map(o => normalizePhone(o.shipping?.recipient_phone || o.buyer?.phone)).filter(Boolean)
    )];
    const inBotPhones = new Set<string>();
    if (allPhones.length > 0) {
      try {
        const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
        const { data: links } = await supabase.from('customer_telegram_links').select('phone').in('phone', allPhones);
        for (const l of links ?? []) inBotPhones.add(l.phone);
      } catch {}
    }

    const orders = (data.data ?? []).map(o => ({
      id: o.id,
      status_id: o.status_id,
      status_name: STATUS_NAMES[o.status_id] ?? `Статус ${o.status_id}`,
      payment_status: o.payment_status,
      total: o.grand_total,
      discount: o.discount_amount,
      ordered_at: o.ordered_at,
      manager_comment: o.manager_comment,
      buyer_comment: o.buyer_comment,
      recipient: o.shipping?.recipient_full_name || o.buyer?.full_name || null,
      phone: o.shipping?.recipient_phone || o.buyer?.phone || null,
      city: o.shipping?.shipping_address_city ?? null,
      address: o.shipping?.shipping_receive_point || o.shipping?.full_address || null,
      region: o.shipping?.shipping_address_region ?? null,
      ttn: o.shipping?.tracking_code ?? null,
      buyer_orders_count: o.buyer?.orders_count ?? null,
      in_bot: inBotPhones.has(normalizePhone(o.shipping?.recipient_phone || o.buyer?.phone)),
      products: (o.products ?? []).map(p => ({
        name: p.name,
        quantity: p.quantity,
        price: p.price,
        sku: p.sku,
        thumbnail: p.picture?.thumbnail ?? null,
        in_stock: p.sku ? (stockBySku.get(p.sku) ?? null) : null,
      })),
    }));

    return NextResponse.json({ data: orders, total: data.total ?? 0 });
  } catch (err) {
    console.error('[Orders Error]', err);
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: message === 'Unauthorized' ? 401 : 500 });
  }
}

/** POST update order status */
export async function POST(request: NextRequest) {
  try {
    await requireStaff(request);
    const body = await request.json();
    const { order_id, status_id, manager_comment, payment_status } = body;

    if (!order_id || (!status_id && !payment_status)) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const updateBody: Record<string, unknown> = {};
    if (status_id) updateBody.status_id = status_id;
    if (manager_comment !== undefined) updateBody.manager_comment = manager_comment;
    if (payment_status) updateBody.payment_status = payment_status;

    const key = process.env.KEYCRM_API_KEY;
    const res = await fetch(`https://openapi.keycrm.app/v1/order/${order_id}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(updateBody),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`KeyCRM: ${text.substring(0, 200)}`);
    }

    return NextResponse.json({ ok: true, order_id, new_status: STATUS_NAMES[status_id] ?? status_id });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: message === 'Unauthorized' ? 401 : 500 });
  }
}
