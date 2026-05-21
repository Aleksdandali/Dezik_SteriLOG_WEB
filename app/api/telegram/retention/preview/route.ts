import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/telegram/auth';
import { createClient } from '@supabase/supabase-js';
import { keycrmFetch } from '@/lib/keycrm';
import { CONSUMPTION_DEFAULTS } from '@/lib/retention/constants';
import { loadProductMap, resolveProductSku } from '@/lib/retention/helpers';

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/** GET /api/telegram/retention/preview — Show what retention would do (dry run) */
export async function GET(request: NextRequest) {
  try {
    await requireStaff(request);
    const supabase = getSupabase();

    // 0. Load product map for SKU resolution
    const productMap = await loadProductMap(supabase);

    // 1. Get recent orders from KeyCRM (last 200 orders)
    let allOrders: { id: number; ordered_at: string; grand_total: number; payment_status: string; status_id: number;
      client_id?: number;
      buyer: { id?: number; phone: string | null; full_name: string | null } | null;
      products: { product_id?: number; name: string; sku: string; quantity: number }[];
    }[] = [];

    let page = 1;
    while (page <= 4) {
      const data = await keycrmFetch<{ data: typeof allOrders; last_page: number }>(
        `/order?sort=-id&limit=50&page=${page}&include=products,buyer`
      );
      allOrders.push(...(data.data ?? []));
      if (page >= data.last_page) break;
      page++;
    }

    // Filter to last 90 days
    const cutoff90 = new Date(Date.now() - 90 * 86400000).toISOString();
    allOrders = allOrders.filter(o => o.ordered_at >= cutoff90);

    // 2. Group by customer phone
    const customerOrders: Record<string, {
      phone: string;
      name: string;
      orders: typeof allOrders;
      totalSpend: number;
      firstOrder: string;
      lastOrder: string;
    }> = {};

    for (const o of allOrders) {
      const phone = o.buyer?.phone?.replace(/\D/g, '').replace(/^38/, '') ?? '';
      if (!phone) continue;
      if (!customerOrders[phone]) {
        customerOrders[phone] = {
          phone,
          name: o.buyer?.full_name ?? 'Без імені',
          orders: [],
          totalSpend: 0,
          firstOrder: o.ordered_at,
          lastOrder: o.ordered_at,
        };
      }
      customerOrders[phone].orders.push(o);
      customerOrders[phone].totalSpend += o.grand_total;
      if (o.ordered_at < customerOrders[phone].firstOrder) customerOrders[phone].firstOrder = o.ordered_at;
      if (o.ordered_at > customerOrders[phone].lastOrder) customerOrders[phone].lastOrder = o.ordered_at;
    }

    // 3. For each customer, predict consumption
    const preview: {
      customer: string;
      phone: string;
      totalOrders: number;
      totalSpend: number;
      lastOrderDate: string;
      daysSinceLastOrder: number;
      products: {
        name: string;
        lastOrderedQty: number;
        lastOrderedDate: string;
        daysPerUnit: number;
        estimatedEmptyDate: string;
        daysUntilEmpty: number;
        status: 'ok' | 'soon' | 'empty' | 'overdue';
        wouldSendReminder: boolean;
      }[];
      wouldSendPostDelivery: boolean;
      wouldSendWinback: boolean;
      segment: string;
    }[] = [];

    const now = Date.now();

    for (const c of Object.values(customerOrders)) {
      const daysSinceLast = Math.floor((now - new Date(c.lastOrder).getTime()) / 86400000);
      const avgInterval = c.orders.length > 1
        ? Math.floor((new Date(c.lastOrder).getTime() - new Date(c.firstOrder).getTime()) / 86400000 / (c.orders.length - 1))
        : null;

      // Segment
      let segment = 'new';
      if (c.orders.length >= 5) segment = 'vip';
      else if (c.orders.length >= 2) segment = 'active';
      if (daysSinceLast > (avgInterval ? avgInterval * 1.5 : 60)) segment = 'dormant';

      // Per-product tracking from last order
      const lastOrder = c.orders.sort((a, b) => b.ordered_at.localeCompare(a.ordered_at))[0];
      const products: typeof preview[0]['products'] = [];

      for (const p of lastOrder.products) {
        // Resolve SKU via keycrm_id mapping (with fuzzy name fallback)
        const resolved = resolveProductSku(productMap, p.product_id, p.name, (p as Record<string, unknown>).sku as string);
        if (!resolved) continue;
        const sku = resolved.sku;
        const defaults = CONSUMPTION_DEFAULTS[sku];
        if (!defaults || !defaults.isConsumable) continue;

        const daysPerUnit = defaults.daysPerUnit;
        const totalDays = daysPerUnit * p.quantity;
        const orderDate = new Date(lastOrder.ordered_at).getTime();
        const emptyDate = orderDate + totalDays * 86400000;
        const daysUntilEmpty = Math.floor((emptyDate - now) / 86400000);

        let status: 'ok' | 'soon' | 'empty' | 'overdue' = 'ok';
        if (daysUntilEmpty <= 0) status = 'overdue';
        else if (daysUntilEmpty <= 7) status = 'empty';
        else if (daysUntilEmpty <= 14) status = 'soon';

        products.push({
          name: defaults.nameUk,
          lastOrderedQty: p.quantity,
          lastOrderedDate: lastOrder.ordered_at.split('T')[0],
          daysPerUnit,
          estimatedEmptyDate: new Date(emptyDate).toISOString().split('T')[0],
          daysUntilEmpty,
          status,
          wouldSendReminder: daysUntilEmpty <= 14 && daysUntilEmpty > -30,
        });
      }

      // Would send post-delivery? (delivered 1 day ago)
      const wouldSendPostDelivery = lastOrder.status_id >= 8 && daysSinceLast <= 2;

      // Would send winback?
      const wouldSendWinback = segment === 'dormant' && daysSinceLast > 45;

      preview.push({
        customer: c.name,
        phone: c.phone,
        totalOrders: c.orders.length,
        totalSpend: c.totalSpend,
        lastOrderDate: c.lastOrder.split('T')[0],
        daysSinceLastOrder: daysSinceLast,
        products: products.sort((a, b) => a.daysUntilEmpty - b.daysUntilEmpty),
        wouldSendPostDelivery,
        wouldSendWinback,
        segment,
      });
    }

    // Sort by most urgent
    preview.sort((a, b) => {
      const aMin = Math.min(...a.products.map(p => p.daysUntilEmpty), 999);
      const bMin = Math.min(...b.products.map(p => p.daysUntilEmpty), 999);
      return aMin - bMin;
    });

    return NextResponse.json({
      total_customers: preview.length,
      total_orders_90d: allOrders.length,
      would_send_reminders: preview.filter(p => p.products.some(pr => pr.wouldSendReminder)).length,
      would_send_winback: preview.filter(p => p.wouldSendWinback).length,
      customers: preview,
    });
  } catch (err) {
    console.error('[Retention Preview]', err);
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: message === 'Unauthorized' ? 401 : 500 });
  }
}
