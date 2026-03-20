'use server';

import { createAdminClient, requireAdmin } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function toggleProductStock(productId: string, inStock: boolean) {
  await requireAdmin();
  const supabase = await createAdminClient();
  const { error } = await supabase
    .from('products')
    .update({ in_stock: inStock })
    .eq('id', productId);

  if (error) throw new Error(error.message);

  revalidatePath('/products');
}

export async function saveProduct(productId: string | null, payload: {
  name: string;
  description: string | null;
  price: number;
  volume: string | null;
  category_id: string;
  image_path: string | null;
  in_stock: boolean;
  shelf_life_days: number | null;
  sort_order: number;
}) {
  await requireAdmin();
  const supabase = await createAdminClient();

  if (productId) {
    const { error } = await supabase.from('products').update(payload).eq('id', productId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from('products').insert(payload);
    if (error) throw new Error(error.message);
  }

  revalidatePath('/products');
}
