export const dynamic = 'force-dynamic';

import { OrderService } from '@/lib/services';
import { OrderCard } from '@/components/order-card';
import { notFound } from 'next/navigation';

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const service = new OrderService();

  try {
    const order = await service.getFullOrder(id);
    return <OrderCard order={order} />;
  } catch {
    notFound();
  }
}
