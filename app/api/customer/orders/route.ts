import { NextRequest, NextResponse } from 'next/server';
import { keycrmFetch } from '@/lib/keycrm';

/** GET customer orders by phone number */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const phone = searchParams.get('phone');

  if (!phone || phone.length < 9 || phone.length > 20) {
    return NextResponse.json({ error: 'Вкажіть номер телефону' }, { status: 400 });
  }

  // Phone must contain only digits, spaces, dashes, parens, or leading +
  if (!/^\+?[\d\s\-()]+$/.test(phone)) {
    return NextResponse.json({ error: 'Невірний формат телефону' }, { status: 400 });
  }

  try {
    // Clean phone number
    const cleanPhone = phone.replace(/\D/g, '').replace(/^38/, '').replace(/^0/, '');

    const data = await keycrmFetch<{ data: {
      id: number;
      status_id: number;
      payment_status: string;
      grand_total: number;
      ordered_at: string;
      status_changed_at: string | null;
      buyer: { full_name: string | null; phone: string | null } | null;
      shipping: {
        tracking_code: string | null;
        shipping_status: string | null;
        shipping_address_city: string | null;
        shipping_receive_point: string | null;
        recipient_full_name: string | null;
        recipient_phone: string | null;
      } | null;
      products: { name: string; quantity: number; price: number }[];
    }[]; total: number }>(
      `/order?filter[buyer_phone]=${cleanPhone}&sort=-id&limit=10&include=products,shipping,buyer`
    );

    const STATUS_NAMES: Record<number, string> = {
      1: '🆕 Новий',
      4: '💲 Очікуємо оплату',
      8: '📦 Збирається',
      10: '💳 Наложний платіж',
      12: '✅ Відправлено',
      19: '❌ Скасовано',
    };

    const orders = (data.data ?? []).map(o => ({
      id: o.id,
      status: STATUS_NAMES[o.status_id] ?? `Статус ${o.status_id}`,
      status_id: o.status_id,
      payment: o.payment_status,
      total: o.grand_total,
      date: o.ordered_at,
      ttn: o.shipping?.tracking_code ?? null,
      np_status: o.shipping?.shipping_status ?? null,
      city: o.shipping?.shipping_address_city ?? null,
      address: o.shipping?.shipping_receive_point ?? null,
      products: (o.products ?? []).map(p => ({
        name: p.name,
        qty: p.quantity,
        price: p.price,
      })),
    }));

    // Get buyer profile from first order
    const firstOrder = data.data?.[0];
    const profile = firstOrder ? {
      name: firstOrder.shipping?.recipient_full_name || firstOrder.buyer?.full_name || null,
      phone: firstOrder.shipping?.recipient_phone || firstOrder.buyer?.phone || null,
      city: firstOrder.shipping?.shipping_address_city || null,
      address: firstOrder.shipping?.shipping_receive_point || null,
    } : null;

    return NextResponse.json({ data: orders, total: data.total ?? 0, profile });
  } catch (err) {
    console.error('[Customer Orders]', err);
    return NextResponse.json({ error: 'Помилка завантаження' }, { status: 500 });
  }
}
