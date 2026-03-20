'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { updateOrderStatus } from './order-actions-server';

interface OrderActionsProps {
  orderId: string;
  status: string;
}

export function OrderActions({ orderId, status }: OrderActionsProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleUpdate = (newStatus: string) => {
    startTransition(async () => {
      await updateOrderStatus(orderId, newStatus);
      router.refresh();
    });
  };

  if (status !== 'pending') return null;

  return (
    <div className="flex gap-3">
      <Button onClick={() => handleUpdate('confirmed')} disabled={isPending} className="bg-green-600 hover:bg-green-700">
        {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
        Підтвердити
      </Button>
      <Button onClick={() => handleUpdate('canceled')} disabled={isPending} variant="destructive">
        <XCircle className="mr-2 h-4 w-4" />
        Скасувати
      </Button>
    </div>
  );
}
