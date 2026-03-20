'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle } from 'lucide-react';

interface OrderActionsProps {
  orderId: string;
  status: string;
}

export function OrderActions({ orderId, status }: OrderActionsProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const updateStatus = async (newStatus: string) => {
    setLoading(true);
    await supabase.from('orders').update({ status: newStatus }).eq('id', orderId);
    setLoading(false);
    router.refresh();
  };

  if (status !== 'pending') return null;

  return (
    <div className="flex gap-3">
      <Button onClick={() => updateStatus('confirmed')} disabled={loading} className="bg-green-600 hover:bg-green-700">
        <CheckCircle className="mr-2 h-4 w-4" />
        Підтвердити
      </Button>
      <Button onClick={() => updateStatus('canceled')} disabled={loading} variant="destructive">
        <XCircle className="mr-2 h-4 w-4" />
        Скасувати
      </Button>
    </div>
  );
}
