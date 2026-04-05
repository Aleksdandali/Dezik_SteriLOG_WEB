import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/telegram/auth';
import { keycrmFetch } from '@/lib/keycrm';

export async function GET(request: NextRequest) {
  try {
    await requireStaff(request);
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') ?? 'today';

    // Calculate date range
    const now = new Date();
    let from: string;
    switch (period) {
      case 'yesterday': {
        const y = new Date(now); y.setDate(y.getDate() - 1);
        from = y.toISOString().slice(0, 10);
        break;
      }
      case 'week':
        from = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
        break;
      default: // today
        from = now.toISOString().slice(0, 10);
    }
    const to = new Date(now.getTime() + 86400000).toISOString().slice(0, 10);

    // Status 12 = completed, filtered by updated_between (when it was completed)
    const data = await keycrmFetch<{ data: { id: number; grand_total: number; payment_status: string; ordered_at: string; updated_at: string; status_changed_at: string | null; manager_comment: string | null; buyer_comment: string | null; buyer: { full_name: string | null; phone: string | null; orders_count: number | null } | null; shipping: { recipient_full_name: string | null; recipient_phone: string | null; shipping_address_city: string | null; shipping_address_region: string | null; shipping_receive_point: string | null; tracking_code: string | null } | null; products: { name: string; quantity: number; sku: string | null; picture: { thumbnail: string } | null }[] }[]; total: number }>(
      `/order?filter[status_id]=12&filter[updated_between]=${from},${to}&include=products,shipping,buyer&sort=-id&limit=50`
    );

    const orders = (data.data ?? []).map(o => ({
      id: o.id,
      recipient: o.shipping?.recipient_full_name || o.buyer?.full_name || 'Клієнт',
      phone: o.shipping?.recipient_phone || o.buyer?.phone || null,
      city: o.shipping?.shipping_address_city ?? null,
      address: o.shipping?.shipping_receive_point ?? null,
      region: o.shipping?.shipping_address_region ?? null,
      ttn: o.shipping?.tracking_code ?? null,
      total: o.grand_total,
      payment_status: o.payment_status,
      ordered_at: o.ordered_at,
      completed_at: o.status_changed_at || o.updated_at,
      manager_comment: o.manager_comment,
      buyer_comment: o.buyer_comment,
      buyer_orders_count: o.buyer?.orders_count ?? null,
      products: (o.products ?? []).map(p => ({
        name: p.name,
        quantity: p.quantity,
        sku: p.sku,
        thumbnail: p.picture?.thumbnail ?? null,
      })),
    }));

    return NextResponse.json({ data: orders, total: data.total ?? orders.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: message === 'Unauthorized' ? 401 : 500 });
  }
}
