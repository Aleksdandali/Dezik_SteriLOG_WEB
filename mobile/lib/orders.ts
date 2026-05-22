import { api } from './api';

export type OrderProduct = {
  name: string;
  quantity: number;
  price: number;
  sku: string | null;
  thumbnail: string | null;
  in_stock: number | null;
};

export type Order = {
  id: number;
  status_id: number;
  status_name: string;
  payment_status: string;
  total: number;
  discount: number;
  ordered_at: string;
  manager_comment: string | null;
  buyer_comment: string | null;
  recipient: string | null;
  phone: string | null;
  city: string | null;
  address: string | null;
  region: string | null;
  ttn: string | null;
  buyer_orders_count: number | null;
  in_bot: boolean;
  products: OrderProduct[];
};

export const STATUS_NAMES: Record<number, string> = {
  1: 'Новий',
  4: 'Очікуємо оплату',
  8: '🚚 На збірку',
  10: '💳 Наложка',
  12: '✅ Виконано',
  19: '❌ Скасовано',
  22: 'Підтверджено ботом',
};

// Status transitions a staff member typically performs on the go.
// 1 → 8 (to assembly), 1 → 19 (cancel)
// 8 → 4 (await payment), 8 → 12 (done)
// 10 → 12 (done)
// 22 → 8 (to assembly)
export const STATUS_TRANSITIONS: Record<number, number[]> = {
  1: [8, 19],
  4: [12, 19],
  8: [4, 12, 19],
  10: [12, 19],
  22: [8, 19],
};

export async function listOrders(statusId = 1): Promise<Order[]> {
  const res = await api<{ data: Order[] }>(`/api/telegram/orders?status=${statusId}`);
  return res.data ?? [];
}

export async function updateOrderStatus(orderId: number, statusId: number): Promise<void> {
  await api('/api/telegram/orders', {
    method: 'POST',
    body: { order_id: orderId, status_id: statusId },
  });
}

// In-memory cache so the detail screen doesn't need to refetch the whole list.
// Set by the list screen before navigating; read by the detail screen.
const orderCache = new Map<number, Order>();

export function cacheOrder(order: Order): void {
  orderCache.set(order.id, order);
}

export function getCachedOrder(id: number): Order | undefined {
  return orderCache.get(id);
}

/** Drop all cached orders. Called from logout to avoid leaking data across users. */
export function clearOrdersCache(): void {
  orderCache.clear();
}
