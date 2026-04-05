import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireStaff } from '@/lib/telegram/auth';
import { fetchAllProductsSafe } from '@/lib/keycrm';

const ML: Record<string, string> = { transparent: 'Прозорі', white: 'Білі', brown: 'Коричневі' };

export async function GET(request: NextRequest) {
  try {
    await requireStaff(request);
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { searchParams } = new URL(request.url);
    const location = searchParams.get('location') ?? 'afina_sklad';
    const isProduction = location === 'malynovskogo' || location === 'dalnytska';

    // 1. Get latest audit
    const { data: audits } = await supabase
      .from('ops_inventory_audits')
      .select('id, audit_date, created_at')
      .eq('location', location)
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(1);

    const lastAudit = audits?.[0] ?? null;

    // 2. Get audit items (raw materials)
    let auditItems: { name: string; quantity: number; unit: string; item_type: string }[] = [];
    if (lastAudit) {
      const { data } = await supabase
        .from('ops_inventory_audit_items')
        .select('name, quantity, unit, item_type')
        .eq('audit_id', lastAudit.id);
      auditItems = data ?? [];
    }

    const stockMap: Record<string, { name: string; quantity: number; unit: string; item_type: string }> = {};

    // Add ALL audit items (raw + finished)
    for (const item of auditItems) {
      stockMap[item.name] = { ...item };
    }

    if (isProduction) {
      const auditHasFinished = auditItems.some(i => i.item_type === 'finished');

      if (!auditHasFinished) {
        // No finished items in audit — calculate from production
        const { data: produced } = await supabase
          .from('ops_production')
          .select('bag_size, material, packages')
          .eq('location', location)
          .eq('stage', 'pack')
          .not('packages', 'is', null);

        for (const p of produced ?? []) {
          if (!p.bag_size || !p.packages) continue;
          const key = `${p.bag_size.replace('x', '×')} ${ML[p.material] ?? p.material}`;
          if (!stockMap[key]) stockMap[key] = { name: key, quantity: 0, unit: 'уп', item_type: 'finished' };
          stockMap[key].quantity += p.packages;
        }

        const { data: movedOut } = await supabase
          .from('ops_movements')
          .select('bag_size, material, packages')
          .eq('from_location', location)
          .not('packages', 'is', null);

        for (const m of movedOut ?? []) {
          if (!m.bag_size || !m.packages) continue;
          const key = `${m.bag_size.replace('x', '×')} ${ML[m.material] ?? m.material ?? ''}`;
          if (stockMap[key]) stockMap[key].quantity -= m.packages;
        }
      }
      // If audit HAS finished items — they override production calc (переоблік = факт)

      const result = Object.values(stockMap).filter(s => s.quantity > 0);
      return NextResponse.json({
        data: result,
        lastAudit: lastAudit ? { date: lastAudit.audit_date } : null,
        source: 'production',
      });
    }

    // Afina: KeyCRM = source of truth. Ignore audit finished items.
    const { data: opsProducts } = await supabase
      .from('ops_products')
      .select('name, keycrm_id, unit, category')
      .eq('active', true)
      .not('keycrm_id', 'is', null)
      .neq('category', 'raw')
      .order('sort_order');

    const keycrmProducts = await fetchAllProductsSafe();
    const keycrmMap = new Map(keycrmProducts.map(p => [p.id, p]));

    // Only KeyCRM data for finished products (no audit duplicates)
    const result: { name: string; quantity: number; unit: string; item_type: string }[] = [];

    if (keycrmMap.size > 0) {
      for (const op of opsProducts ?? []) {
        const kp = keycrmMap.get(op.keycrm_id!);
        if (kp && kp.quantity > 0) {
          result.push({ name: op.name, quantity: kp.quantity, unit: op.unit, item_type: 'finished' });
        }
      }
    }

    return NextResponse.json({
      data: result,
      lastAudit: lastAudit ? { date: lastAudit.audit_date } : null,
      source: 'keycrm',
    });
  } catch (err) {
    console.error('[Stock Error]', err);
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: message === 'Unauthorized' ? 401 : 500 });
  }
}
