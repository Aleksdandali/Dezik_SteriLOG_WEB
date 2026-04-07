import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/telegram/auth';
import { keycrmFetch } from '@/lib/keycrm';

interface KOrder {
  id: number;
  grand_total: number;
  payment_status: string;
  status_id: number;
  source_id: number | null;
  ordered_at: string;
  created_at: string;
  status_changed_at: string | null;
}

const SOURCE_NAMES: Record<number, string> = {
  2: 'Вайбер',
  3: 'Instagram',
  8: 'Telegram',
  12: 'Хорошоп',
  14: 'Rozetka',
  17: 'OLX',
  19: 'Prom.ua',
  20: 'Dezik Bot',
};

const STATUS_NAMES: Record<number, string> = {
  1: 'Новий',
  4: 'Оплата',
  8: 'На збірку',
  10: 'Наложка',
  12: 'Відправлено',
  19: 'Скасовано',
};

export async function GET(request: NextRequest) {
  try {
    await requireStaff(request);
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') ?? 'week';

    // Calculate date range
    const now = new Date();
    let fromDate: string;
    const toDate = now.toISOString().slice(0, 10);

    switch (period) {
      case 'today':
        fromDate = toDate;
        break;
      case 'month':
        fromDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        break;
      case 'week':
      default:
        fromDate = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
        break;
    }

    // Fetch all orders for the period (all statuses)
    const allOrders: KOrder[] = [];
    let page = 1;
    while (page <= 10) {
      const data = await keycrmFetch<{ data: KOrder[]; last_page: number }>(
        `/order?sort=-id&limit=50&page=${page}&filter[created_between]=${fromDate},${toDate}`
      );
      allOrders.push(...(data.data ?? []));
      if (page >= data.last_page) break;
      page++;
    }

    // Filter orders within the date range (safety filter)
    const orders = allOrders.filter(o => {
      const d = (o.ordered_at ?? '').slice(0, 10);
      return d >= fromDate && d <= toDate;
    });

    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((s, o) => s + o.grand_total, 0);
    const avgOrder = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;
    const paidOrders = orders.filter(o => o.payment_status === 'paid');
    const paidPercent = totalOrders > 0 ? Math.round((paidOrders.length / totalOrders) * 100) : 0;

    // By source
    const sourceMap: Record<number, { orders: number; revenue: number }> = {};
    for (const o of orders) {
      const sid = o.source_id ?? 0;
      if (!sourceMap[sid]) sourceMap[sid] = { orders: 0, revenue: 0 };
      sourceMap[sid].orders++;
      sourceMap[sid].revenue += o.grand_total;
    }
    const bySource = Object.entries(sourceMap)
      .map(([sid, v]) => ({
        name: SOURCE_NAMES[Number(sid)] ?? 'Інше',
        source_id: Number(sid),
        orders: v.orders,
        revenue: v.revenue,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    // By status
    const statusMap: Record<number, number> = {};
    for (const o of orders) {
      statusMap[o.status_id] = (statusMap[o.status_id] ?? 0) + 1;
    }
    const byStatus = Object.entries(statusMap)
      .map(([sid, count]) => ({
        name: STATUS_NAMES[Number(sid)] ?? `Статус ${sid}`,
        status_id: Number(sid),
        count,
      }))
      .sort((a, b) => b.count - a.count);

    // By day
    const dayMap: Record<string, { orders: number; revenue: number }> = {};
    // Initialize all days in range
    const start = new Date(fromDate);
    const end = new Date(toDate);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      dayMap[key] = { orders: 0, revenue: 0 };
    }
    for (const o of orders) {
      const day = (o.ordered_at ?? '').slice(0, 10);
      if (!dayMap[day]) dayMap[day] = { orders: 0, revenue: 0 };
      dayMap[day].orders++;
      dayMap[day].revenue += o.grand_total;
    }
    const byDay = Object.entries(dayMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, orders: v.orders, revenue: v.revenue }));

    return NextResponse.json({
      period: { from: fromDate, to: toDate },
      total_orders: totalOrders,
      total_revenue: totalRevenue,
      by_source: bySource,
      by_status: byStatus,
      by_day: byDay,
      avg_order: avgOrder,
      paid_percent: paidPercent,
    });
  } catch (err) {
    console.error('[Analytics Error]', err);
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: message === 'Unauthorized' ? 401 : 500 });
  }
}
