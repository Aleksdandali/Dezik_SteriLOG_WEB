import { createAdminClient } from '@/lib/supabase/server';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Plus } from 'lucide-react';

export default async function ProductsPage() {
  const supabase = await createAdminClient();

  const { data: products } = await supabase
    .from('products')
    .select('*, product_categories(name)')
    .order('sort_order');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Товари</h1>
        <Link href="/products/new">
          <Button><Plus className="mr-2 h-4 w-4" />Додати товар</Button>
        </Link>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Назва</TableHead>
                <TableHead>Категорія</TableHead>
                <TableHead className="text-right">Ціна</TableHead>
                <TableHead>Наявність</TableHead>
                <TableHead className="text-right">Порядок</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products?.map((product) => (
                <TableRow key={product.id}>
                  <TableCell>
                    <Link href={`/products/${product.id}`} className="font-medium hover:underline">
                      {product.name}
                    </Link>
                  </TableCell>
                  <TableCell>{product.product_categories?.name ?? '—'}</TableCell>
                  <TableCell className="text-right">{Number(product.price).toLocaleString('uk-UA')} грн</TableCell>
                  <TableCell>
                    <Badge className={product.in_stock ? 'bg-green-100 text-green-800 hover:bg-green-100' : 'bg-red-100 text-red-800 hover:bg-red-100'} variant="secondary">
                      {product.in_stock ? 'В наявності' : 'Немає'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{product.sort_order}</TableCell>
                </TableRow>
              ))}
              {(!products || products.length === 0) && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    Товарів поки немає
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
