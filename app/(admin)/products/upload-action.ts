'use server';

import { createAdminClient } from '@/lib/supabase/server';

export async function uploadProductImage(formData: FormData): Promise<{ path: string | null; error: string | null }> {
  const file = formData.get('file') as File | null;
  if (!file) return { path: null, error: 'No file provided' };

  const supabase = await createAdminClient();
  const ext = file.name.split('.').pop();
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error } = await supabase.storage
    .from('product-images')
    .upload(fileName, file, { upsert: true });

  if (error) return { path: null, error: error.message };
  return { path: fileName, error: null };
}

export async function removeProductImage(path: string): Promise<void> {
  if (!path || path.startsWith('http')) return;
  const supabase = await createAdminClient();
  await supabase.storage.from('product-images').remove([path]);
}
