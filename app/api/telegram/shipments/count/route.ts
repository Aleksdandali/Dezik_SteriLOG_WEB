import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/telegram/auth';
import { keycrmFetch } from '@/lib/keycrm';

export async function GET(request: NextRequest) {
  try {
    await requireStaff(request);

    // Same logic as main shipments route: fetch all status=8, filter by date in JS
    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
    let count = 0;
    let page = 1;
    while (page <= 5) {
      const data = await keycrmFetch<{ data: { status_changed_at: string | null; ordered_at: string }[]; last_page: number }>(
        `/order?filter[status_id]=8&sort=-id&limit=50&page=${page}`
      );
      for (const o of data.data ?? []) {
        const changed = o.status_changed_at ?? o.ordered_at ?? '';
        if (changed >= cutoff) count++;
      }
      if (page >= data.last_page) break;
      page++;
    }

    return NextResponse.json({ count });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
