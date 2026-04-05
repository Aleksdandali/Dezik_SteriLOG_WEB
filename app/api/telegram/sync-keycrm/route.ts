import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireOpsAdmin } from '@/lib/telegram/auth';
import { fetchAllProducts } from '@/lib/keycrm';

/** POST: sync product quantities from KeyCRM → ops_products */
export async function POST(request: NextRequest) {
  try {
    await requireOpsAdmin(request);
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    // Get our products with keycrm_id
    const { data: opsProducts } = await supabase
      .from('ops_products')
      .select('id, sku, keycrm_id')
      .not('keycrm_id', 'is', null);

    if (!opsProducts || opsProducts.length === 0) {
      return NextResponse.json({ error: 'No mapped products' }, { status: 400 });
    }

    // Fetch from KeyCRM
    const keycrmProducts = await fetchAllProducts();
    const keycrmMap = new Map(keycrmProducts.map(p => [p.id, p]));

    // Update quantities
    let updated = 0;
    for (const ops of opsProducts) {
      const kp = keycrmMap.get(ops.keycrm_id);
      if (!kp) continue;

      await supabase
        .from('ops_products')
        .update({ sell_price: kp.max_price })
        .eq('id', ops.id);

      updated++;
    }

    return NextResponse.json({ updated, total: opsProducts.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** GET: show current mapping status */
export async function GET(request: NextRequest) {
  try {
    await requireOpsAdmin(request);
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    const { data: opsProducts } = await supabase
      .from('ops_products')
      .select('sku, name, keycrm_id, category')
      .order('sort_order');

    // Fetch KeyCRM quantities
    const keycrmProducts = await fetchAllProducts();
    const keycrmMap = new Map(keycrmProducts.map(p => [p.id, p]));

    const result = (opsProducts ?? []).map(op => {
      const kp = op.keycrm_id ? keycrmMap.get(op.keycrm_id) : null;
      return {
        sku: op.sku,
        name: op.name,
        category: op.category,
        keycrm_id: op.keycrm_id,
        keycrm_name: kp?.name ?? null,
        keycrm_qty: kp?.quantity ?? null,
        keycrm_price: kp?.max_price ?? null,
      };
    });

    return NextResponse.json({ data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
