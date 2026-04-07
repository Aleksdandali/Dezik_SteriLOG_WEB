import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/telegram/auth';
import { keycrmFetch } from '@/lib/keycrm';

interface KOrder {
  id: number;
  grand_total: number;
  payment_status: string;
  status_id: number;
  source_id: number | null;
  created_at: string;
  status_changed_at: string | null;
  ordered_at: string;
}

const SOURCE_NAMES: Record<number, string> = {
  2: 'Вайбер',
  3: 'Instagram',
  8: 'Telegram',
  12: 'Хорошоп',
};

export async function GET(request: NextRequest) {
  try {
    await requireStaff(request);
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') ?? 'today';
    const customDate = searchParams.get('date');

    // Calculate cutoff date
    const now = new Date();
    let fromDate: string;
    let toDate: string;

    if (customDate) {
      fromDate = customDate;
      toDate = customDate;
    } else {
      switch (period) {
        case 'week':
          fromDate = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
          toDate = now.toISOString().slice(0, 10);
          break;
        case 'month':
          fromDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
          toDate = now.toISOString().slice(0, 10);
          break;
        default:
          fromDate = now.toISOString().slice(0, 10);
          toDate = now.toISOString().slice(0, 10);
      }
    }

    // Fetch real sales: only status 12 (відправлено) — фактично відвантажені
    const allOrders: KOrder[] = [];
    for (const statusId of [12]) {
      let page = 1;
      while (page <= 10) {
        const data = await keycrmFetch<{ data: KOrder[]; last_page: number }>(
          `/order?filter[status_id]=${statusId}&sort=-id&limit=50&page=${page}`
        );
        allOrders.push(...(data.data ?? []));
        if (page >= data.last_page) break;
        page++;
      }
    }

    // Filter by status_changed_at within the period
    const orders = allOrders.filter(o => {
      const changed = (o.status_changed_at ?? o.ordered_at ?? '').slice(0, 10);
      return changed >= fromDate && changed <= toDate;
    });

    // Stats
    const total = orders.reduce((s, o) => s + o.grand_total, 0);
    const paid = orders.filter(o => o.payment_status === 'paid');
    const paidSum = paid.reduce((s, o) => s + o.grand_total, 0);
    const notPaid = orders.filter(o => o.payment_status === 'not_paid');
    const notPaidSum = notPaid.reduce((s, o) => s + o.grand_total, 0);
    const otherOrders = orders.filter(o => o.payment_status !== 'paid' && o.payment_status !== 'not_paid');
    const otherSum = otherOrders.reduce((s, o) => s + o.grand_total, 0);

    const shipped = orders.filter(o => o.status_id === 12).length;
    const onAssembly = orders.filter(o => o.status_id === 8).length;

    // Speed metrics: average time from ordered_at to status_changed_at for completed orders
    const completedWithTime = orders.filter(o => o.status_id === 12 && o.status_changed_at && o.ordered_at);
    let avgProcessingHours = 0;
    if (completedWithTime.length > 0) {
      const totalHours = completedWithTime.reduce((s, o) => {
        const diff = new Date(o.status_changed_at!).getTime() - new Date(o.ordered_at).getTime();
        return s + diff / 3600000;
      }, 0);
      avgProcessingHours = Math.round(totalHours / completedWithTime.length);
    }

    // Sources breakdown
    const bySource: Record<string, { sum: number; count: number }> = {};
    for (const o of orders) {
      const name = SOURCE_NAMES[o.source_id ?? 0] ?? `Інше`;
      if (!bySource[name]) bySource[name] = { sum: 0, count: 0 };
      bySource[name].sum += o.grand_total;
      bySource[name].count++;
    }

    return NextResponse.json({
      period: { from: fromDate, to: toDate },
      total_sum: total,
      orders_count: orders.length,
      paid_sum: paidSum,
      paid_count: paid.length,
      cod_sum: notPaidSum,
      cod_count: notPaid.length,
      other_sum: otherSum,
      other_count: otherOrders.length,
      shipped_count: shipped,
      assembly_count: onAssembly,
      avg_processing_hours: avgProcessingHours,
      by_source: bySource,
    });
  } catch (err) {
    console.error('[Cash Error]', err);
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: message === 'Unauthorized' ? 401 : 500 });
  }
}
