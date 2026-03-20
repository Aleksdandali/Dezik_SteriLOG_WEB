'use server';

import { createAdminClient, requireAdmin } from '@/lib/supabase/server';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

export async function uploadProductImage(formData: FormData): Promise<{ path: string | null; error: string | null }> {
  await requireAdmin();

  const file = formData.get('file') as File | null;
  if (!file) return { path: null, error: 'No file provided' };

  // Validate file type
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { path: null, error: 'Дозволені лише зображення (JPG, PNG, WebP, GIF)' };
  }

  // Validate file size
  if (file.size > MAX_SIZE) {
    return { path: null, error: 'Файл занадто великий. Максимум 5 МБ' };
  }

  const supabase = await createAdminClient();
  const ext = file.type.split('/')[1] === 'jpeg' ? 'jpg' : file.type.split('/')[1];
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error } = await supabase.storage
    .from('product-images')
    .upload(fileName, file, { upsert: true, contentType: file.type });

  if (error) return { path: null, error: error.message };
  return { path: fileName, error: null };
}

export async function removeProductImage(path: string): Promise<void> {
  await requireAdmin();
  if (!path || path.startsWith('http')) return;
  const supabase = await createAdminClient();
  await supabase.storage.from('product-images').remove([path]);
}
