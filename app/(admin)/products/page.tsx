import { createAdminClient } from '@/lib/supabase/server';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Plus, Package, Pencil } from 'lucide-react';
import { ProductToggle } from './product-toggle';

const STORAGE_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images`;

function getImageUrl(path: string | null) {
  if (!path) return null;
  return path.startsWith('http') ? path : `${STORAGE_URL}/${path}`;
}

export default async function ProductsPage() {
  const supabase = await createAdminClient();

  const { data: products } = await supabase
    .from('products')
    .select('*, product_categories(name)')
    .order('sort_order');

  const inStockCount = products?.filter(p => p.in_stock).length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Товари</h1>
          <p className="text-sm text-muted-foreground">
            {products?.length ?? 0} товарів &middot; {inStockCount} в наявності
          </p>
        </div>
        <Link href="/products/new">
          <Button><Plus className="mr-2 h-4 w-4" />Додати товар</Button>
        </Link>
      </div>

      <Card>
        <CardContent className="p-0 divide-y divide-border">
          {products?.map((product) => {
            const img = getImageUrl(product.image_path);
            return (
              <div key={product.id} className="flex items-center gap-4 px-4 py-3 hover:bg-[#F3F4F6] dark:hover:bg-white/5 transition-colors group">
                {/* Photo */}
                <div className="h-14 w-14 shrink-0 rounded-xl bg-[#F3F4F6] dark:bg-muted flex items-center justify-center overflow-hidden">
                  {img ? (
                    <img src={img} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Package className="h-6 w-6 text-[#9CA3AF]" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <Link href={`/products/${product.id}`} className="text-sm font-semibold text-foreground hover:text-primary transition-colors line-clamp-1">
                    {product.name}
                  </Link>
                  <div className="flex items-center gap-2 mt-0.5">
                    {product.product_categories?.name && (
                      <span className="text-xs text-muted-foreground">{product.product_categories.name}</span>
                    )}
                    {product.volume && (
                      <span className="text-xs text-[#9CA3AF]">&middot; {product.volume}</span>
                    )}
                  </div>
                </div>

                {/* Price */}
                <div className="text-right shrink-0 w-28">
                  <span className="text-sm font-bold text-foreground">
                    {Number(product.price).toLocaleString('uk-UA')} грн
                  </span>
                </div>

                {/* Stock badge */}
                <div className="shrink-0 w-24 text-center">
                  <Badge
                    variant="outline"
                    className={
                      product.in_stock
                        ? 'bg-[#F0FDF4] text-[#16a34a] border-[#22C55E]/20 text-xs'
                        : 'bg-[#FEF2F2] text-[#dc2626] border-[#EF4444]/20 text-xs'
                    }
                  >
                    {product.in_stock ? 'В наявності' : 'Немає'}
                  </Badge>
                </div>

                {/* Toggle */}
                <div className="shrink-0">
                  <ProductToggle productId={product.id} inStock={product.in_stock} />
                </div>

                {/* Edit */}
                <div className="shrink-0">
                  <Link href={`/products/${product.id}`}>
                    <Button variant="ghost" size="icon-sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                </div>
              </div>
            );
          })}

          {(!products || products.length === 0) && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Package className="h-12 w-12 text-[#9CA3AF] mb-4" />
              <p className="text-lg font-medium text-foreground">Товарів поки немає</p>
              <p className="text-sm text-muted-foreground mb-4">Додайте перший товар до каталогу</p>
              <Link href="/products/new">
                <Button><Plus className="mr-2 h-4 w-4" />Додати товар</Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
