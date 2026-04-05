import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireOpsAdmin } from '@/lib/telegram/auth';
import { addToOfferStock, getOfferStock } from '@/lib/keycrm';

export async function POST(request: NextRequest) {
  try {
    const staff = await requireOpsAdmin(request);
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const body = await request.json();
    const { audit_id, action } = body;

    if (!audit_id || !['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    if (action === 'reject') {
      await supabase.from('ops_inventory_audits').update({ status: 'rejected' }).eq('id', audit_id);
      return NextResponse.json({ ok: true, action: 'rejected' });
    }

    // Approve — update status
    await supabase.from('ops_inventory_audits').update({
      status: 'approved',
      approved_by: staff.id,
      approved_at: new Date().toISOString(),
    }).eq('id', audit_id);

    // Get audit details for KeyCRM sync
    const { data: audit } = await supabase
      .from('ops_inventory_audits')
      .select('location')
      .eq('id', audit_id)
      .single();

    const { data: items } = await supabase
      .from('ops_inventory_audit_items')
      .select('name, quantity, unit, item_type')
      .eq('audit_id', audit_id);

    // Sync finished products to KeyCRM (only for Afina)
    const keycrmResults: string[] = [];
    if (audit?.location === 'afina_sklad' && items) {
      const { data: products } = await supabase
        .from('ops_products')
        .select('name, keycrm_offer_id')
        .not('keycrm_offer_id', 'is', null);

      for (const item of items.filter(i => i.item_type === 'finished')) {
        const product = (products ?? []).find(p => p.name === item.name);
        if (product?.keycrm_offer_id) {
          try {
            const before = await getOfferStock(product.keycrm_offer_id);
            await addToOfferStock(product.keycrm_offer_id, item.quantity - before);
            keycrmResults.push(`${item.name}: ${before} → ${item.quantity}`);
          } catch (e) {
            keycrmResults.push(`${item.name}: ПОМИЛКА`);
          }
        }
      }
    }

    return NextResponse.json({ ok: true, action: 'approved', keycrm_sync: keycrmResults });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: msg === 'Forbidden' ? 403 : 500 });
  }
}
