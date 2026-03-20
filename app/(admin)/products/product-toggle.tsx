'use client';

import { useState, useTransition } from 'react';
import { Switch } from '@/components/ui/switch';
import { toggleProductStock } from './actions';

interface ProductToggleProps {
  productId: string;
  inStock: boolean;
}

export function ProductToggle({ productId, inStock }: ProductToggleProps) {
  const [checked, setChecked] = useState(inStock);
  const [isPending, startTransition] = useTransition();

  const handleToggle = (value: boolean) => {
    setChecked(value);
    startTransition(async () => {
      try {
        await toggleProductStock(productId, value);
      } catch {
        setChecked(!value);
      }
    });
  };

  return (
    <div
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
      className="flex items-center gap-1.5"
    >
      <Switch
        size="sm"
        checked={checked}
        onCheckedChange={handleToggle}
        disabled={isPending}
      />
    </div>
  );
}
