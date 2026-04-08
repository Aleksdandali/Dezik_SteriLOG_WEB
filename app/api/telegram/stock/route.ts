import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireStaff } from '@/lib/telegram/auth';
import { fetchAllProductsSafe } from '@/lib/keycrm';

const ML: Record<string, string> = { transparent: 'прозорі', white: 'білі', brown: 'коричневі' };

function bagKey(bagSize: string | null, material: string | null): string | null {
  if (!bagSize) return null;
  const size = bagSize.replace('x', '×');
  const mat = ML[material ?? ''] ?? material ?? '';
  return `Пакети ${size} ${mat}`.trim();
}

// Normalize audit/production names to match catalog format
// "100×200 Білі" → "Пакети 100×200 білі"
// "75×150 Прозорі" → "Пакети 75×150 прозорі"
function normalizeName(name: string): string {
  // Match bag patterns: optional "Пакети " + size×size + material
  const m = name.match(/^(?:Пакети\s+)?(\d+[×x]\d+)\s+(.+)$/i);
  if (m) {
    const size = m[1].replace('x', '×');
    const mat = m[2].toLowerCase();
    return `Пакети ${size} ${mat}`;
  }
  return name;
}

export async function GET(request: NextRequest) {
  try {
    await requireStaff(request);
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { searchParams } = new URL(request.url);
    const location = searchParams.get('location') ?? 'afina_sklad';
    const isProduction = location === 'malynovskogo' || location === 'dalnytska';

    // 1. Get latest approved audit
    const { data: audits } = await supabase
      .from('ops_inventory_audits')
      .select('id, audit_date, created_at')
      .eq('location', location)
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(1);

    const lastAudit = audits?.[0] ?? null;

    // 2. Get audit items
    let auditItems: { name: string; quantity: number; unit: string; item_type: string }[] = [];
    if (lastAudit) {
      const { data } = await supabase
        .from('ops_inventory_audit_items')
        .select('name, quantity, unit, item_type')
        .eq('audit_id', lastAudit.id);
      auditItems = data ?? [];
    }

    const stockMap: Record<string, { name: string; quantity: number; unit: string; item_type: string }> = {};

    // Add audit items as baseline (normalize names to match catalog)
    for (const item of auditItems) {
      const name = normalizeName(item.name);
      if (stockMap[name]) {
        stockMap[name].quantity += item.quantity;
      } else {
        stockMap[name] = { ...item, name };
      }
    }

    if (isProduction) {
      const auditHasFinished = auditItems.some(i => i.item_type === 'finished');
      // Date cutoff: if audit has finished items, only count delta AFTER audit
      const cutoff = auditHasFinished && lastAudit ? lastAudit.created_at : null;
      let source = auditHasFinished ? 'audit' : 'production';

      // Always calculate production delta (after cutoff if audit exists)
      let prodQuery = supabase
        .from('ops_production')
        .select('bag_size, material, packages')
        .eq('location', location)
        .eq('stage', 'pack')
        .not('packages', 'is', null);
      if (cutoff) prodQuery = prodQuery.gt('created_at', cutoff);

      const { data: produced } = await prodQuery;

      for (const p of produced ?? []) {
        const key = bagKey(p.bag_size, p.material);
        if (!key || !p.packages) continue;
        if (!stockMap[key]) stockMap[key] = { name: key, quantity: 0, unit: 'уп', item_type: 'finished' };
        stockMap[key].quantity += p.packages;
      }

      // Subtract CONFIRMED movements OUT (only confirmed, use confirmed_packages)
      let moveOutQuery = supabase
        .from('ops_movements')
        .select('bag_size, material, packages, confirmed_packages')
        .eq('from_location', location)
        .not('confirmed_at', 'is', null);
      if (cutoff) moveOutQuery = moveOutQuery.gt('confirmed_at', cutoff);

      const { data: movedOut } = await moveOutQuery;

      for (const m of movedOut ?? []) {
        const key = bagKey(m.bag_size, m.material);
        if (!key) continue;
        const qty = m.confirmed_packages ?? m.packages ?? 0;
        if (qty <= 0) continue;
        if (stockMap[key]) stockMap[key].quantity -= qty;
      }

      // Add CONFIRMED movements IN (returned to this location)
      let moveInQuery = supabase
        .from('ops_movements')
        .select('bag_size, material, packages, confirmed_packages')
        .eq('to_location', location)
        .not('confirmed_at', 'is', null);
      if (cutoff) moveInQuery = moveInQuery.gt('confirmed_at', cutoff);

      const { data: movedIn } = await moveInQuery;

      for (const m of movedIn ?? []) {
        const key = bagKey(m.bag_size, m.material);
        if (!key) continue;
        const qty = m.confirmed_packages ?? m.packages ?? 0;
        if (qty <= 0) continue;
        if (!stockMap[key]) stockMap[key] = { name: key, quantity: 0, unit: 'уп', item_type: 'finished' };
        stockMap[key].quantity += qty;
      }

      return NextResponse.json({
        data: Object.values(stockMap),
        lastAudit: lastAudit ? { date: lastAudit.audit_date } : null,
        source,
      });
    }

    // Afina: KeyCRM = source of truth
    const { data: opsProducts } = await supabase
      .from('ops_products')
      .select('name, keycrm_id, unit, category')
      .eq('active', true)
      .not('keycrm_id', 'is', null)
      .neq('category', 'raw')
      .order('sort_order');

    const keycrmProducts = await fetchAllProductsSafe();
    const keycrmMap = new Map(keycrmProducts.map(p => [p.id, p]));

    const result: { name: string; quantity: number; unit: string; item_type: string }[] = [];

    if (keycrmMap.size > 0) {
      for (const op of opsProducts ?? []) {
        const kp = keycrmMap.get(op.keycrm_id!);
        if (kp) {
          result.push({ name: op.name, quantity: kp.quantity - (kp.in_reserve ?? 0), unit: op.unit, item_type: 'finished' });
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
