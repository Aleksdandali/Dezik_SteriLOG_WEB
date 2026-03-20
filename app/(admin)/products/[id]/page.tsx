import { createAdminClient } from '@/lib/supabase/server';
import { ProductForm } from '@/components/product-form';
import { notFound } from 'next/navigation';

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createAdminClient();

  const [{ data: product }, { data: categories }] = await Promise.all([
    supabase.from('products').select('*').eq('id', id).single(),
    supabase.from('product_categories').select('*').order('sort_order'),
  ]);

  if (!product) notFound();

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-3xl font-bold">Редагувати товар</h1>
      <ProductForm product={product} categories={categories ?? []} />
    </div>
  );
}
