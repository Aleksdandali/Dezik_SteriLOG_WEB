'use server';

import { requireAdmin } from '@/lib/supabase/server';
import { OrderService } from '@/lib/services';
import { revalidatePath } from 'next/cache';

async function getAdmin() {
  const user = await requireAdmin();
  return { id: user.id, name: user.email ?? 'Admin' };
}

export async function updateOrderStatus(orderId: string, newStatus: string) {
  const admin = await getAdmin();
  const service = new OrderService();
  await service.changeStatus(orderId, newStatus, admin.id, admin.name);
  revalidatePath('/orders');
}

export async function addPayment(orderId: string, data: {
  amount: number; method: string; status: string; comment?: string;
}) {
  const admin = await getAdmin();
  const service = new OrderService();
  await service.addPayment(orderId, data, admin.id, admin.name);
  revalidatePath('/orders');
}

export async function addExpense(orderId: string, data: {
  name: string; amount: number; comment?: string;
}) {
  const admin = await getAdmin();
  const service = new OrderService();
  await service.addExpense(orderId, data, admin.id, admin.name);
  revalidatePath('/orders');
}

export async function addComment(orderId: string, comment: string) {
  const admin = await getAdmin();
  const service = new OrderService();
  await service.addComment(orderId, comment, admin.id, admin.name);
  revalidatePath('/orders');
}

export async function updateDelivery(orderId: string, fields: Record<string, unknown>) {
  const admin = await getAdmin();
  const service = new OrderService();
  await service.updateDelivery(orderId, fields, admin.id, admin.name);
  revalidatePath('/orders');
}
