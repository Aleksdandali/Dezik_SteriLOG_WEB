'use server';

import { requireAdmin } from '@/lib/supabase/server';
import { OrderService } from '@/lib/services';
import { revalidatePath } from 'next/cache';

export async function updateOrderStatus(orderId: string, newStatus: string) {
  const admin = await requireAdmin();
  const service = new OrderService();
  await service.changeStatus(orderId, newStatus, admin.id);

  revalidatePath(`/orders/${orderId}`);
  revalidatePath('/orders');
}
