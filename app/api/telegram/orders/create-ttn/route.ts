import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/telegram/auth';
import { keycrmFetch, keycrmPut } from '@/lib/keycrm';
import { createTTN } from '@/lib/nova-poshta';

export async function POST(request: NextRequest) {
  try {
    await requireStaff(request);
    const body = await request.json();
    const { order_id, weight, payer_type, payment_status: ui_payment_status, override_recipient, override_phone, override_city_ref, override_warehouse_ref } = body;

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

    // Use UI payment status if provided (user may have changed it), otherwise KeyCRM
    const effectivePaymentStatus = ui_payment_status || order.payment_status;
    const isNotPaid = effectivePaymentStatus !== 'paid';
    const needsCOD = isNotPaid && order.grand_total > 0;

    // Free delivery for orders >= 1000 UAH; otherwise Recipient pays for unpaid, Sender for paid
    const freeDelivery = order.grand_total >= 1000;
    const defaultPayer = (freeDelivery || !isNotPaid) ? 'Sender' : 'Recipient';
    const effectivePayer = payer_type ?? defaultPayer;
    const paymentMethod = effectivePayer === 'Sender' ? 'NonCash' : 'Cash';

    const result = await createTTN({
      recipientName,
      recipientPhone,
      cityRef,
      warehouseRef,
      weight: weight ?? 0.5,
      cost: order.grand_total,
      description: 'Товари Dezik',
      payerType: effectivePayer,
      paymentMethod,
      afterpayment: needsCOD,
      afterpaymentAmount: needsCOD ? order.grand_total : undefined,
    });

    // Write TTN back to KeyCRM + change status to "На збірку" (8)
    let keycrmSynced = true;
    try {
      await keycrmPut(`/order/${order_id}`, {
        shipping: { tracking_code: result.ttn },
        status_id: 8,
      });
    } catch (err) {
      console.error('[KeyCRM Sync Error]', err);
      keycrmSynced = false;
    }

    return NextResponse.json({
      ok: true,
      ttn: result.ttn,
      delivery_cost: result.costOnSite,
      estimated_delivery: result.estimatedDeliveryDate,
      keycrm_synced: keycrmSynced,
    });
  } catch (err) {
    console.error('[Create TTN Error]', err);
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
