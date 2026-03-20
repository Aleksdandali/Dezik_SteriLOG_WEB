'use client';

import { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

interface ProductToggleProps {
  productId: string;
  inStock: boolean;
}

export function ProductToggle({ productId, inStock }: ProductToggleProps) {
  const [checked, setChecked] = useState(inStock);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleToggle = async (value: boolean) => {
    setChecked(value);
    setLoading(true);
    const supabase = createClient();
    await supabase.from('products').update({ in_stock: value }).eq('id', productId);
    setLoading(false);
    router.refresh();
  };

  return (
    <div
      className="flex items-center gap-1.5 rounded-full bg-white/90 dark:bg-black/50 px-2 py-1 backdrop-blur-sm shadow-sm"
      onClick={(e) => e.preventDefault()}
    >
      <span className="text-[10px] font-medium text-muted-foreground">
        {checked ? 'Вкл' : 'Викл'}
      </span>
      <Switch
        size="sm"
        checked={checked}
        onCheckedChange={handleToggle}
        disabled={loading}
      />
    </div>
  );
}
