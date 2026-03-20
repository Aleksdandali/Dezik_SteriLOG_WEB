'use server';

import { createAdminClient, requireAdmin } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

const ALLOWED_STATUSES = ['confirmed', 'canceled'];

export async function updateOrderStatus(orderId: string, newStatus: string) {
  await requireAdmin();

  if (!ALLOWED_STATUSES.includes(newStatus)) {
    throw new Error('Invalid status');
  }

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from('orders')
    .update({ status: newStatus })
    .eq('id', orderId);

  if (error) throw new Error(error.message);

  revalidatePath(`/orders/${orderId}`);
  revalidatePath('/orders');
}
