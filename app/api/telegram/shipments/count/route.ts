import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/telegram/auth';
import { keycrmFetch } from '@/lib/keycrm';

export async function GET(request: NextRequest) {
  try {
    await requireStaff(request);

    const allOrders: { status_changed_at: string | null; ordered_at: string | null }[] = [];
    let page = 1;
    while (page <= 5) {
      const data = await keycrmFetch<{ data: { status_changed_at: string | null; ordered_at: string | null }[]; last_page: number }>(
        `/order?filter[status_id]=8&sort=-id&limit=50&page=${page}`
      );
      allOrders.push(...(data.data ?? []));
      if (page >= data.last_page) break;
      page++;
    }

    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
    const count = allOrders.filter(o => (o.status_changed_at ?? o.ordered_at ?? '') >= cutoff).length;

    return NextResponse.json({ count });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
