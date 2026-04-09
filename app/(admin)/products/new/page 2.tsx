import { createAdminClient } from '@/lib/supabase/server';
import { ProductForm } from '@/components/product-form';

export default async function NewProductPage() {
  const supabase = await createAdminClient();
  const { data: categories } = await supabase.from('product_categories').select('*').order('sort_order');

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-3xl font-bold">Новий товар</h1>
      <ProductForm categories={categories ?? []} />
    </div>
  );
}
