import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireStaff } from '@/lib/telegram/auth';
import { addToOfferStock } from '@/lib/keycrm';

export async function POST(request: NextRequest) {
  try {
    const staff = await requireStaff(request);
    const body = await request.json();

    const { movement_id, shipment_id, confirmed_packages, items, photo_url } = body;

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    const updateBase: Record<string, unknown> = {
      confirmed_by: staff.id,
      confirmed_at: new Date().toISOString(),
    };
    if (photo_url) updateBase.confirm_photo_url = photo_url;

    // Collect confirmed items for KeyCRM sync
    const confirmedItems: { bag_size: string; material: string; packages: number }[] = [];

    if (shipment_id && items) {
      // Confirm entire shipment
      for (const item of items as { id: string; confirmed_packages: number }[]) {
        await supabase
          .from('ops_movements')
          .update({ ...updateBase, confirmed_packages: item.confirmed_packages })
          .eq('id', item.id);

        // Get movement details for KeyCRM sync
        const { data: mov } = await supabase
          .from('ops_movements')
          .select('bag_size, material, to_location')
          .eq('id', item.id)
          .single();

        if (mov?.bag_size && mov.to_location === 'afina_sklad') {
          confirmedItems.push({
            bag_size: mov.bag_size,
            material: mov.material,
            packages: item.confirmed_packages,
          });
        }
      }
    } else if (movement_id) {
      // Single movement confirm
      if (confirmed_packages === undefined) {
        return NextResponse.json({ error: 'Вкажіть кількість' }, { status: 400 });
      }

      const pkgs = parseInt(String(confirmed_packages), 10);
      const { data, error } = await supabase
        .from('ops_movements')
        .update({ ...updateBase, confirmed_packages: pkgs })
        .eq('id', movement_id)
        .select();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      if (data?.[0]?.bag_size && data[0].to_location === 'afina_sklad') {
        confirmedItems.push({
          bag_size: data[0].bag_size,
          material: data[0].material,
          packages: pkgs,
        });
      }
    }

    // Sync to KeyCRM — add confirmed packages to stock
    const keycrmResults: string[] = [];
    if (confirmedItems.length > 0) {
      // Get product mapping
      const { data: products } = await supabase
        .from('ops_products')
        .select('keycrm_offer_id, bag_size, bag_material')
        .not('keycrm_offer_id', 'is', null)
        .eq('category', 'bags');

      for (const item of confirmedItems) {
        const product = (products ?? []).find(
          p => p.bag_size === item.bag_size && p.bag_material === item.material
        );

        if (product?.keycrm_offer_id) {
          try {
            const result = await addToOfferStock(product.keycrm_offer_id, item.packages);
            keycrmResults.push(`${item.bag_size} ${item.material}: ${result.before} → ${result.after}`);
          } catch (e) {
            console.error(`[KeyCRM Sync] Failed for ${item.bag_size}:`, e);
            keycrmResults.push(`${item.bag_size}: ПОМИЛКА синхронізації`);
          }
        }
      }
    }

    return NextResponse.json({
      ok: true,
      confirmed: shipment_id ? (items as unknown[]).length : 1,
      keycrm_sync: keycrmResults,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    console.error('[Confirm]', msg);
    return NextResponse.json({ error: msg }, { status: msg === 'Unauthorized' ? 401 : 500 });
  }
}
