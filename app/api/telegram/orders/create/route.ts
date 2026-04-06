import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/telegram/auth';
import { keycrmFetch } from '@/lib/keycrm';

/* ------------------------------------------------------------------ */
/*  POST /api/telegram/orders/create — create order in KeyCRM         */
/* ------------------------------------------------------------------ */

interface ProductItem {
  offer_id: number;
  name: string;
  sku: string;
  quantity: number;
  price: number;
}

interface CreateOrderBody {
  buyer_name: string;
  buyer_phone: string;
  city_name: string;
  city_ref: string;
  warehouse_name: string;
  warehouse_ref: string;
  products: ProductItem[];
  comment?: string;
}

export async function POST(request: NextRequest) {
  try {
    await requireStaff(request);

    const body: CreateOrderBody = await request.json();
    const {
      buyer_name,
      buyer_phone,
      city_name,
      city_ref,
      warehouse_name,
      warehouse_ref,
      products,
      comment,
    } = body;

    // Validation
    if (!buyer_name || !buyer_phone) {
      return NextResponse.json({ error: "Вкажіть ім'я та телефон покупця" }, { status: 400 });
    }
    if (!city_ref || !warehouse_ref) {
      return NextResponse.json({ error: 'Вкажіть місто та відділення' }, { status: 400 });
    }
    if (!products || products.length === 0) {
      return NextResponse.json({ error: 'Додайте хоча б один товар' }, { status: 400 });
    }

    const key = process.env.KEYCRM_API_KEY;
    if (!key) throw new Error('KEYCRM_API_KEY not set');

    const orderPayload = {
      source_id: 20,         // Dezik_bot_tg
      status_id: 1,          // Новий
      buyer: {
        full_name: buyer_name,
        phone: buyer_phone,
      },
      shipping: {
        delivery_service_id: 1, // Nova Poshta
        recipient_full_name: buyer_name,
        recipient_phone: buyer_phone,
        shipping_address_city: city_name,
        warehouse_ref: warehouse_ref,
        shipping_receive_point: warehouse_name,
      },
      products: products.map((p) => ({
        sku: p.sku,
        name: p.name,
        quantity: p.quantity,
        price: p.price,
      })),
      ...(comment ? { manager_comment: comment } : {}),
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch('https://openapi.keycrm.app/v1/order', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(orderPayload),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text();
        console.error('[Create Order] KeyCRM error:', res.status, text.substring(0, 500));
        return NextResponse.json(
          { error: `KeyCRM ${res.status}: ${text.substring(0, 200)}` },
          { status: 502 },
        );
      }

      const data = await res.json() as { id: number };
      return NextResponse.json({ ok: true, order_id: data.id });
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    console.error('[Create Order Error]', err);
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/* ------------------------------------------------------------------ */
/*  GET /api/telegram/orders/create?q=... — search buyers in KeyCRM   */
/* ------------------------------------------------------------------ */

interface KBuyer {
  full_name: string | null;
  phone: string | null;
}

interface KShipping {
  shipping_address_city: string | null;
  shipping_receive_point: string | null;
}

interface KOrderSearchItem {
  id: number;
  buyer: KBuyer | null;
  shipping: KShipping | null;
}

export async function GET(request: NextRequest) {
  try {
    await requireStaff(request);

    const q = request.nextUrl.searchParams.get('q')?.trim()?.replace(/\D/g, '');
    if (!q || q.length < 5) {
      return NextResponse.json({ data: [] });
    }

    // Search by phone using filter[buyer_phone]
    const phone = q.startsWith('380') ? q : q.startsWith('0') ? `38${q}` : q;
    const result = await keycrmFetch<{ data: KOrderSearchItem[] }>(
      `/order?filter[buyer_phone]=${phone}&include=shipping,buyer&limit=10&sort=-id`,
    );

    // Extract unique buyers by phone
    const seen = new Set<string>();
    const buyers: { name: string; phone: string; city: string; address: string }[] = [];

    for (const order of result.data) {
      const buyerPhone = order.buyer?.phone;
      if (!buyerPhone || seen.has(buyerPhone)) continue;
      seen.add(buyerPhone);

      buyers.push({
        name: order.buyer?.full_name ?? '',
        phone: buyerPhone,
        city: order.shipping?.shipping_address_city ?? '',
        address: order.shipping?.shipping_receive_point ?? '',
      });
    }

    return NextResponse.json({ data: buyers });
  } catch (err) {
    console.error('[Buyer Search Error]', err);
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
