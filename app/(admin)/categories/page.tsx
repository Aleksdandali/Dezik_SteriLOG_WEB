import { createAdminClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CategoriesManager } from '@/components/categories-manager';

export default async function CategoriesPage() {
  const supabase = await createAdminClient();

  const { data: categories } = await supabase
    .from('product_categories')
    .select('*, products(count)')
    .order('sort_order');

  const mapped = (categories ?? []).map((c: any) => ({
    ...c,
    product_count: c.products?.[0]?.count ?? 0,
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Категорії</h1>
      <Card>
        <CardHeader>
          <CardTitle>Управління категоріями</CardTitle>
        </CardHeader>
        <CardContent>
          <CategoriesManager categories={mapped} />
        </CardContent>
      </Card>
    </div>
  );
}
