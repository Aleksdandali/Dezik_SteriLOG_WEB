import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/telegram/auth';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/** GET /api/telegram/retention/dashboard — Retention funnel & client segments */
export async function GET(request: NextRequest) {
  try {
    await requireStaff(request);
    const supabase = getSupabase();

    // Get all customer intelligence data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: customers, error } = await (supabase.from('customer_intelligence') as any)
      .select('phone, name, city, segment, total_orders, total_spend, avg_order_value, avg_order_interval_days, last_order_date, product_categories, never_bought_categories, products_running_low, ai_summary')
      .order('last_order_date', { ascending: false });

    if (error) {
      console.error('[Dashboard] DB error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const all = customers ?? [];
    const now = Date.now();

    // Segment counts: new, returning, regular, vip, at_risk, dormant, lost
    const segments: Record<string, number> = {};
    for (const c of all) {
      segments[c.segment] = (segments[c.segment] || 0) + 1;
    }

    // Funnel: Новий → Повторний → Постійний → VIP
    const funnel = {
      new: (segments['new'] || 0),
      returning: (segments['returning'] || 0),
      regular: (segments['regular'] || 0),
      vip: (segments['vip'] || 0),
      at_risk: (segments['at_risk'] || 0),
      dormant: (segments['dormant'] || 0),
      lost: (segments['lost'] || 0),
    };

    const total = all.length;
    const withOrders = all.filter((c: Record<string, unknown>) => (c.total_orders as number) > 0).length;

    // Conversion rates
    const rateNewToReturning = withOrders > 0
      ? Math.round(((funnel.returning + funnel.regular + funnel.vip) / withOrders) * 100)
      : 0;
    const rateToRegular = withOrders > 0
      ? Math.round(((funnel.regular + funnel.vip) / withOrders) * 100)
      : 0;
    const rateToVip = withOrders > 0
      ? Math.round((funnel.vip / withOrders) * 100)
      : 0;

    // Revenue by segment
    const revenueBySegment: Record<string, number> = {};
    for (const c of all) {
      revenueBySegment[c.segment] = (revenueBySegment[c.segment] || 0) + Number(c.total_spend || 0);
    }

    // Avg check by segment
    const avgCheckBySegment: Record<string, number> = {};
    for (const seg of Object.keys(segments)) {
      const segCustomers = all.filter((c: Record<string, unknown>) => c.segment === seg);
      const withAvg = segCustomers.filter((c: Record<string, unknown>) => (c.avg_order_value as number) > 0);
      avgCheckBySegment[seg] = withAvg.length > 0
        ? Math.round(withAvg.reduce((s: number, c: Record<string, unknown>) => s + Number(c.avg_order_value), 0) / withAvg.length)
        : 0;
    }

    // One-timers for callback (ordered 7-90 days ago, 1 order, sorted by spend desc)
    const callbackList = all
      .filter((c: Record<string, unknown>) => {
        if ((c.total_orders as number) !== 1) return false;
        if (!c.last_order_date) return false;
        const days = Math.round((now - new Date(c.last_order_date as string).getTime()) / 86400000);
        return days >= 7 && days <= 90;
      })
      .map((c: Record<string, unknown>) => ({
        name: c.name,
        phone: c.phone,
        city: c.city,
        totalSpend: Math.round(Number(c.total_spend)),
        avgCheck: Math.round(Number(c.avg_order_value)),
        lastOrderDate: (c.last_order_date as string)?.split('T')[0],
        daysSince: Math.round((now - new Date(c.last_order_date as string).getTime()) / 86400000),
        products: c.product_categories,
        neverBought: c.never_bought_categories,
      }))
      .sort((a: { totalSpend: number }, b: { totalSpend: number }) => b.totalSpend - a.totalSpend)
      .slice(0, 50);

    // Needs attention today (products running low + at_risk)
    const needsAttention = all
      .filter((c: Record<string, unknown>) => {
        const low = c.products_running_low as unknown[];
        return (c.segment === 'at_risk') || (Array.isArray(low) && low.length > 0);
      })
      .map((c: Record<string, unknown>) => ({
        name: c.name,
        phone: c.phone,
        city: c.city,
        segment: c.segment,
        productsRunningLow: c.products_running_low,
        lastOrderDate: (c.last_order_date as string)?.split('T')[0] ?? null,
      }))
      .slice(0, 20);

    return NextResponse.json({
      total,
      withOrders,
      funnel,
      conversions: {
        newToReturning: rateNewToReturning,
        toRegular: rateToRegular,
        toVip: rateToVip,
      },
      revenueBySegment,
      avgCheckBySegment,
      callbackList,
      needsAttention,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: message === 'Unauthorized' ? 401 : 500 });
  }
}
