import { createAdminClient } from '@/lib/supabase/server';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Plus, Package } from 'lucide-react';
import { ProductToggle } from './product-toggle';

const STORAGE_URL = 'https://csshbetufyocutdislkn.supabase.co/storage/v1/object/public/product-images';

export default async function ProductsPage() {
  const supabase = await createAdminClient();

  const { data: products } = await supabase
    .from('products')
    .select('*, product_categories(name)')
    .order('sort_order');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Товари</h1>
          <p className="text-sm text-muted-foreground">{products?.length ?? 0} товарів у каталозі</p>
        </div>
        <Link href="/products/new">
          <Button><Plus className="mr-2 h-4 w-4" />Додати товар</Button>
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {products?.map((product) => (
          <Card key={product.id} className="group relative overflow-hidden transition-shadow hover:shadow-md">
            <div className="absolute top-3 right-3 z-10">
              <ProductToggle productId={product.id} inStock={product.in_stock} />
            </div>

            <Link href={`/products/${product.id}`} className="block">
              <div className="relative aspect-square bg-[#F3F4F6] dark:bg-muted flex items-center justify-center overflow-hidden">
                {product.image_path ? (
                  <img
                    src={product.image_path.startsWith('http') ? product.image_path : `${STORAGE_URL}/${product.image_path}`}
                    alt={product.name}
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  />
                ) : (
                  <Package className="h-12 w-12 text-[#9CA3AF]" />
                )}
              </div>

              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-foreground leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                    {product.name}
                  </h3>
                </div>

                <div className="flex items-center gap-2">
                  {product.product_categories?.name && (
                    <Badge variant="secondary" className="text-xs font-normal">
                      {product.product_categories.name}
                    </Badge>
                  )}
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-lg font-bold text-foreground">
                    {Number(product.price).toLocaleString('uk-UA')} <span className="text-sm font-medium text-muted-foreground">грн</span>
                  </span>
                  <Badge
                    className={
                      product.in_stock
                        ? 'bg-[#F0FDF4] text-[#22C55E] hover:bg-[#F0FDF4] border-[#22C55E]/20'
                        : 'bg-[#FEF2F2] text-[#EF4444] hover:bg-[#FEF2F2] border-[#EF4444]/20'
                    }
                    variant="outline"
                  >
                    {product.in_stock ? 'В наявності' : 'Немає'}
                  </Badge>
                </div>
              </CardContent>
            </Link>
          </Card>
        ))}

        {(!products || products.length === 0) && (
          <div className="col-span-full flex flex-col items-center justify-center py-16 text-center">
            <Package className="h-12 w-12 text-[#9CA3AF] mb-4" />
            <p className="text-lg font-medium text-foreground">Товарів поки немає</p>
            <p className="text-sm text-muted-foreground mb-4">Додайте перший товар до каталогу</p>
            <Link href="/products/new">
              <Button><Plus className="mr-2 h-4 w-4" />Додати товар</Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
