import { NextRequest, NextResponse } from 'next/server';
import { keycrmFetch } from '@/lib/keycrm';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { phone, name, city_ref, warehouse_ref, city_name, warehouse_name, products } = body;

    if (!phone || !name || !products?.length) {
      return NextResponse.json({ error: 'Заповніть всі поля' }, { status: 400 });
    }

    // Create order in KeyCRM
    const orderData = {
      source_id: 8, // Telegram
      buyer: {
        full_name: name,
        phone: phone.replace(/\D/g, ''),
      },
      shipping: {
        delivery_service_id: 1, // Nova Poshta
        recipient_full_name: name,
        recipient_phone: phone.replace(/\D/g, ''),
        shipping_address_city: city_name || '',
        warehouse_ref: warehouse_ref || undefined,
        shipping_receive_point: warehouse_name || '',
      },
      products: products.map((p: { sku: string; quantity: number; price: number; name: string }) => ({
        sku: p.sku || undefined,
        name: p.name,
        quantity: p.quantity,
        price: p.price,
      })),
    };

    const key = process.env.KEYCRM_API_KEY;
    const res = await fetch('https://openapi.keycrm.app/v1/order', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderData),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`KeyCRM: ${text.substring(0, 200)}`);
    }

    const order = await res.json();
    return NextResponse.json({ ok: true, order_id: order.id });
  } catch (err) {
    console.error('[Create Customer Order]', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Помилка' }, { status: 500 });
  }
}
