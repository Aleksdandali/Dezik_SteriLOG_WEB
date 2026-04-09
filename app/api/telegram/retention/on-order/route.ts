import { NextRequest, NextResponse } from 'next/server';
import { keycrmFetch } from '@/lib/keycrm';
import {
  getSupabase,
  verifyCronAuth,
  loadProductMap,
  resolveProductSku,
} from '@/lib/retention/helpers';
import { CONSUMPTION_DEFAULTS } from '@/lib/retention/constants';

interface KOrderProduct {
  product_id?: number;
  sku: string | null;
  name: string;
  quantity: number;
  price: number;
}

interface KOrder {
  id: number;
  created_at: string;
  grand_total: number;
  buyer: { phone: string | null; full_name: string | null } | null;
  products: KOrderProduct[];
}

/**
 * ON-ORDER HANDLER
 * Called when a new order is synced from KeyCRM.
 * Updates customer_profiles and consumption_tracking.
 *
 * Can be invoked:
 * 1. As a webhook (POST with order data in body)
 * 2. As a cron (GET) to process recent new orders
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!verifyCronAuth(authHeader)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const orderId = body.order_id as number | undefined;

    if (!orderId) {
      return NextResponse.json({ error: 'order_id required' }, { status: 400 });
    }

    const supabase = getSupabase();

    // Fetch order details from KeyCRM
    const order = await keycrmFetch<KOrder>(
      `/order/${orderId}?include=buyer,products`
    );

    const phone = order.buyer?.phone?.replace(/\D/g, '');
    if (!phone || phone.length < 10) {
      return NextResponse.json({ ok: true, skipped: 'no_phone' });
    }

    await processOrder(supabase, order, phone);

    return NextResponse.json({ ok: true, order_id: orderId });
  } catch (err) {
    console.error('[On-Order POST]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/**
 * GET handler: cron-based batch processing of recent orders.
 * Checks for new orders (status=1, last 24h) that haven't been profiled yet.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!verifyCronAuth(authHeader)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = getSupabase();

    // Fetch recent orders from KeyCRM (last 24h, any status)
    const allOrders: KOrder[] = [];
    let page = 1;
    while (page <= 3) {
      const data = await keycrmFetch<{ data: KOrder[]; last_page: number }>(
        `/order?sort=-id&limit=50&page=${page}&include=buyer,products`
      );
      allOrders.push(...(data.data ?? []));
      if (page >= data.last_page) break;
      page++;
    }

    // Filter to orders created in last 48 hours
    const cutoff = new Date(Date.now() - 48 * 3600000).toISOString();
    const recentOrders = allOrders.filter(o => o.created_at >= cutoff);

    let processed = 0;
    let skipped = 0;

    for (const order of recentOrders) {
      const phone = order.buyer?.phone?.replace(/\D/g, '');
      if (!phone || phone.length < 10) {
        skipped++;
        continue;
      }

      // Check if we already processed this order (check last_synced_at on profile)
      const { data: profile } = await supabase
        .from('customer_profiles')
        .select('last_synced_at')
        .eq('phone', phone)
        .maybeSingle();

      // If profile exists and was synced after this order was created, skip
      if (profile?.last_synced_at && profile.last_synced_at > order.created_at) {
        skipped++;
        continue;
      }

      try {
        await processOrder(supabase, order, phone);
        processed++;
      } catch (err) {
        console.error(`[On-Order] Failed for order ${order.id}:`, err);
      }
    }

    return NextResponse.json({ ok: true, total: recentOrders.length, processed, skipped });
  } catch (err) {
    console.error('[On-Order Cron]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/**
 * Core logic: update customer_profiles and consumption_tracking for an order.
 */
async function processOrder(
  supabase: ReturnType<typeof getSupabase>,
  order: KOrder,
  phone: string
): Promise<void> {
  const now = new Date().toISOString();
  const orderDate = order.created_at.slice(0, 10);

  // ---- 0. Load product map (keycrm_id -> SKU) ----
  const productMap = await loadProductMap(supabase);

  // ---- 1. Update customer_profiles ----

  // Fetch existing profile
  const { data: existingProfile } = await supabase
    .from('customer_profiles')
    .select('*')
    .eq('phone', phone)
    .maybeSingle();

  if (existingProfile) {
    // Update existing profile
    const newTotalOrders = (existingProfile.total_orders || 0) + 1;
    const newLifetimeSpend = parseFloat(existingProfile.lifetime_spend || '0') + (order.grand_total || 0);

    // Calculate annual spend (orders in last 365 days)
    const yearAgo = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
    const newAnnualSpend = orderDate >= yearAgo
      ? parseFloat(existingProfile.annual_spend || '0') + (order.grand_total || 0)
      : parseFloat(existingProfile.annual_spend || '0');

    // Calculate average interval
    let avgInterval = existingProfile.avg_order_interval_days;
    if (existingProfile.last_order_date) {
      const lastDate = new Date(existingProfile.last_order_date);
      const thisDate = new Date(orderDate);
      const daysDiff = Math.ceil((thisDate.getTime() - lastDate.getTime()) / 86400000);
      if (daysDiff > 0) {
        avgInterval = avgInterval
          ? Math.round((avgInterval + daysDiff) / 2)
          : daysDiff;
      }
    }

    // Determine segment
    const segment = calculateSegment(newTotalOrders, newAnnualSpend, avgInterval);
    const loyaltyTier = calculateLoyaltyTier(newLifetimeSpend, newTotalOrders);

    await supabase
      .from('customer_profiles')
      .update({
        total_orders: newTotalOrders,
        annual_spend: newAnnualSpend,
        lifetime_spend: newLifetimeSpend,
        last_order_date: orderDate,
        avg_order_interval_days: avgInterval,
        segment,
        loyalty_tier: loyaltyTier,
        first_name: order.buyer?.full_name?.split(' ')[0] || existingProfile.first_name,
        last_synced_at: now,
        updated_at: now,
      })
      .eq('phone', phone);
  } else {
    // Create new profile
    await supabase
      .from('customer_profiles')
      .insert({
        phone,
        first_name: order.buyer?.full_name?.split(' ')[0] || null,
        segment: 'new',
        loyalty_tier: 'bronze',
        total_orders: 1,
        annual_spend: order.grand_total || 0,
        lifetime_spend: order.grand_total || 0,
        first_order_date: orderDate,
        last_order_date: orderDate,
        avg_order_interval_days: null,
        last_synced_at: now,
      });
  }

  // ---- 2. Update consumption_tracking ----

  for (const product of order.products ?? []) {
    // Resolve SKU via keycrm_id -> ops_products mapping (with fuzzy name fallback)
    const resolved = resolveProductSku(
      productMap,
      product.product_id,
      product.name
    );
    if (!resolved) continue; // Unknown product, skip

    const { sku } = resolved;
    const defaults = CONSUMPTION_DEFAULTS[sku];
    if (!defaults || !defaults.isConsumable) continue;

    const quantity = product.quantity || 1;

    // Calculate estimated daily usage
    // If we have history, use weighted average; otherwise use defaults
    const { data: existingTracking } = await supabase
      .from('consumption_tracking')
      .select('*')
      .eq('phone', phone)
      .eq('product_category', sku)
      .maybeSingle();

    let dailyUsage: number;

    if (existingTracking && existingTracking.last_order_date) {
      // We have history: calculate actual usage from last order
      const lastDate = new Date(existingTracking.last_order_date);
      const thisDate = new Date(orderDate);
      const daysBetween = Math.max(1, Math.ceil((thisDate.getTime() - lastDate.getTime()) / 86400000));

      // Actual consumption rate from last interval
      const actualDailyUsage = existingTracking.last_order_quantity / daysBetween;

      // Weighted average: 70% actual, 30% default
      dailyUsage = actualDailyUsage * 0.7 + (quantity * defaults.dailyUsagePerUnit) * 0.3;
    } else {
      // First time ordering this product: use defaults
      dailyUsage = quantity * defaults.dailyUsagePerUnit;
    }

    // Ensure minimum daily usage to avoid infinite empty dates
    dailyUsage = Math.max(dailyUsage, 0.001);

    // Calculate estimated empty date
    const daysUntilEmpty = Math.ceil(quantity / dailyUsage);
    const emptyDate = new Date(orderDate);
    emptyDate.setDate(emptyDate.getDate() + daysUntilEmpty);
    const emptyDateStr = emptyDate.toISOString().slice(0, 10);

    if (existingTracking) {
      await supabase
        .from('consumption_tracking')
        .update({
          last_order_date: orderDate,
          last_order_quantity: quantity,
          estimated_daily_usage: dailyUsage,
          estimated_empty_date: emptyDateStr,
          reminder_stage: 0, // Reset reminder stage on new order
          reminder_last_sent_at: null,
          product_name: defaults.nameUk,
          updated_at: now,
        })
        .eq('id', existingTracking.id);
    } else {
      await supabase
        .from('consumption_tracking')
        .insert({
          phone,
          product_category: sku,
          product_name: defaults.nameUk,
          last_order_date: orderDate,
          last_order_quantity: quantity,
          estimated_daily_usage: dailyUsage,
          estimated_empty_date: emptyDateStr,
          reminder_stage: 0,
        });
    }
  }
}

/** Determine customer segment based on order history */
function calculateSegment(
  totalOrders: number,
  annualSpend: number,
  avgInterval: number | null
): string {
  if (totalOrders >= 10 || annualSpend >= 50000) return 'vip';
  if (totalOrders >= 3 && annualSpend >= 10000) return 'active';
  if (totalOrders === 1) return 'new';

  // Check if dormant (avg interval > 90 days and at least 2 orders)
  if (avgInterval && avgInterval > 90 && totalOrders >= 2) return 'dormant';

  return 'active';
}

/** Determine loyalty tier based on lifetime spend and order count */
function calculateLoyaltyTier(lifetimeSpend: number, totalOrders: number): string {
  if (lifetimeSpend >= 100000 || totalOrders >= 20) return 'platinum';
  if (lifetimeSpend >= 50000 || totalOrders >= 10) return 'gold';
  if (lifetimeSpend >= 15000 || totalOrders >= 5) return 'silver';
  return 'bronze';
}
