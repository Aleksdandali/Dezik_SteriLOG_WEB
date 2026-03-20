export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/server';
import { OrdersList } from '@/components/orders-list';

export default async function OrdersPage() {
  const supabase = await createAdminClient();

  const { data: orders } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .order('created_at', { ascending: false });

  return <OrdersList orders={orders ?? []} />;
}
