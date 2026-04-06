import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/telegram/auth';
import { keycrmFetch } from '@/lib/keycrm';
import { createTTN } from '@/lib/nova-poshta';

export async function POST(request: NextRequest) {
  try {
    await requireStaff(request);
    const body = await request.json();
    const { order_id, weight, payer_type, override_recipient, override_phone, override_city_ref, override_warehouse_ref } = body;

    if (!order_id) return NextResponse.json({ error: 'Missing order_id' }, { status: 400 });

    // Get order with shipping from KeyCRM
    const order = await keycrmFetch<{
      id: number;
      grand_total: number;
      payment_status: string;
      shipping: {
        recipient_full_name: string | null;
        recipient_phone: string | null;
        address_payload: { city_ref: string; warehouse_ref: string } | null;
      } | null;
      buyer: { full_name: string | null; phone: string | null } | null;
    }>(`/order/${order_id}?include=shipping,buyer`);

    const shipping = order.shipping;
    const address = shipping?.address_payload;

    // Use override values if provided, otherwise fall back to order data
    const cityRef = override_city_ref || address?.city_ref;
    const warehouseRef = override_warehouse_ref || address?.warehouse_ref;

    if (!cityRef || !warehouseRef) {
      return NextResponse.json({ error: 'Замовлення не має адреси доставки НП' }, { status: 400 });
    }

    const recipientName = override_recipient || shipping?.recipient_full_name || order.buyer?.full_name;
    const recipientPhone = override_phone || shipping?.recipient_phone || order.buyer?.phone;

    if (!recipientName || !recipientPhone) {
      return NextResponse.json({ error: 'Немає імені або телефону отримувача' }, { status: 400 });
    }

    // Create TTN via Nova Poshta
    const result = await createTTN({
      recipientName,
      recipientPhone,
      cityRef,
      warehouseRef,
      weight: weight ?? 1,
      cost: order.grand_total,
      description: 'Товари Dezik',
      payerType: payer_type ?? (order.payment_status === 'paid' ? 'Sender' : 'Recipient'),
    });

    // Write TTN back to KeyCRM + change status to "На збірку" (8)
    const key = process.env.KEYCRM_API_KEY;
    await fetch(`https://openapi.keycrm.app/v1/order/${order_id}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        shipping: { tracking_code: result.ttn },
        status_id: 8,
      }),
    });

    return NextResponse.json({
      ok: true,
      ttn: result.ttn,
      delivery_cost: result.costOnSite,
      estimated_delivery: result.estimatedDeliveryDate,
    });
  } catch (err) {
    console.error('[Create TTN Error]', err);
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
