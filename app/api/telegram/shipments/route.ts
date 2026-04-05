import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/telegram/auth';
import { keycrmFetch, fetchAllProductsSafe } from '@/lib/keycrm';

interface KeyCRMOrder {
  id: number;
  status_id: number;
  payment_status: string;
  grand_total: number;
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
    shipping_address: string | null;
    shipping_receive_point: string | null;
    full_address: string | null;
    delivery_service_name: string | null;
  } | null;
  products: {
    id: number;
    name: string;
    quantity: number;
    price: number;
    sku: string | null;
    picture: { thumbnail: string } | null;
  }[];
}

/** GET orders ready for shipment (status=8, recent only) */
export async function GET(request: NextRequest) {
  try {
    await requireStaff(request);

    // Get today's orders with status=8
    // KeyCRM filter created_between works, but we need orders CHANGED today not created today
    // So: fetch ALL status=8 (paginated), filter by status_changed_at = today
    const allOrders: KeyCRMOrder[] = [];
    let page = 1;
    while (page <= 5) { // safety limit
      const data = await keycrmFetch<{ data: KeyCRMOrder[]; last_page: number }>(
        `/order?filter[status_id]=8&sort=-id&limit=50&page=${page}&include=products,shipping,buyer`
      );
      allOrders.push(...(data.data ?? []));
      if (page >= data.last_page) break;
      page++;
    }

    // Filter: status changed in last 30 days (not ancient stale orders)
    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
    const filtered = allOrders.filter(o => {
      const changed = o.status_changed_at ?? o.ordered_at ?? '';
      return changed >= cutoff;
    });

    // Build SKU → thumbnail map from products catalog (better photos than order.products.picture)
    const allProducts = await fetchAllProductsSafe();
    const skuToThumb = new Map<string, string>();
    // Products have offers with SKUs — need to fetch offers too
    try {
      const offersPage1 = await keycrmFetch<{ data: { sku: string; product_id: number }[] }>('/offers?limit=50&page=1');
      const offersPage2 = await keycrmFetch<{ data: { sku: string; product_id: number }[] }>('/offers?limit=50&page=2');
      const allOffers = [...(offersPage1.data ?? []), ...(offersPage2.data ?? [])];
      const prodThumb = new Map(allProducts.map(p => [p.id, p.thumbnail_url]));
      for (const offer of allOffers) {
        if (offer.sku && prodThumb.has(offer.product_id)) {
          skuToThumb.set(offer.sku, prodThumb.get(offer.product_id)!);
        }
      }
    } catch { /* fallback to order pictures */ }

    const orders = filtered.map(o => ({
      id: o.id,
      payment_status: o.payment_status,
      total: o.grand_total,
      ordered_at: o.ordered_at,
      created_at: o.created_at,
      status_changed_at: o.status_changed_at,
      status_name: '🚚 Передано на збірку',
      manager_comment: o.manager_comment,
      ttn: o.shipping?.tracking_code ?? null,
      recipient: o.shipping?.recipient_full_name || o.buyer?.full_name || null,
      phone: o.shipping?.recipient_phone || o.buyer?.phone || null,
      city: o.shipping?.shipping_address_city ?? null,
      address: o.shipping?.shipping_receive_point ?? o.shipping?.full_address ?? null,
      region: o.shipping?.shipping_address_region ?? null,
      delivery: o.shipping?.delivery_service_name ?? 'Нова Пошта',
      buyer_orders_count: o.buyer?.orders_count ?? null,
      buyer_orders_sum: o.buyer?.orders_sum ?? null,
      buyer_comment: o.buyer_comment,
      products: (o.products ?? []).map(p => ({
        name: p.name,
        quantity: p.quantity,
        sku: p.sku,
        thumbnail: (p.sku ? skuToThumb.get(p.sku) : null) ?? p.picture?.thumbnail ?? null,
      })),
    }));

    return NextResponse.json({ data: orders, total: orders.length });
  } catch (err) {
    console.error('[Shipments Error]', err);
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: message === 'Unauthorized' ? 401 : 500 });
  }
}

/** GET /api/telegram/shipments/archive — shipped orders */
// Moved to shipments/archive/route.ts

/** POST mark order as shipped (status → 12 completed) */
export async function POST(request: NextRequest) {
  try {
    await requireStaff(request);
    const body = await request.json();
    const { order_id, photo_url } = body;

    if (!order_id) {
      return NextResponse.json({ error: 'Missing order_id' }, { status: 400 });
    }

    const updateBody: Record<string, unknown> = { status_id: 12 };
    if (photo_url) {
      updateBody.manager_comment = `📸 Фото відправки: ${photo_url}`;
    }

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

    return NextResponse.json({ ok: true, order_id });
  } catch (err) {
    console.error('[Ship Error]', err);
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
