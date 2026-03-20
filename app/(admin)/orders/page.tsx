export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/server';
import { OrdersList } from '@/components/orders-list';

export default async function OrdersPage() {
  const supabase = await createAdminClient();

  const { data: orders } = await supabase
    .from('orders')
    .select('*, order_items(*), payments(*), order_expenses(*)')
    .order('created_at', { ascending: false });

  // Enrich order items with product images
  if (orders) {
    const productIds = [...new Set(orders.flatMap(o => o.order_items?.map((i: any) => i.product_id).filter(Boolean) ?? []))];
    if (productIds.length > 0) {
      const { data: products } = await supabase.from('products').select('id, image_path').in('id', productIds);
      const imgMap = new Map(products?.map(p => [p.id, p.image_path]) ?? []);
      for (const order of orders) {
        for (const item of (order.order_items ?? [])) {
          (item as any).image_path = imgMap.get((item as any).product_id) ?? null;
        }
      }
    }
  }

  return <OrdersList orders={orders ?? []} />;
}
