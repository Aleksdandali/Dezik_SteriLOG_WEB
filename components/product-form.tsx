'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Product, ProductCategory } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ProductFormProps {
  product?: Product;
  categories: ProductCategory[];
}

export function ProductForm({ product, categories }: ProductFormProps) {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    name: product?.name ?? '',
    description: product?.description ?? '',
    price: product?.price?.toString() ?? '',
    volume: product?.volume ?? '',
    category_id: product?.category_id ?? '',
    image_path: product?.image_path ?? '',
    in_stock: product?.in_stock ?? true,
    shelf_life_days: product?.shelf_life_days?.toString() ?? '',
    sort_order: product?.sort_order?.toString() ?? '0',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const payload = {
      name: form.name,
      description: form.description || null,
      price: parseFloat(form.price),
      volume: form.volume || null,
      category_id: form.category_id,
      image_path: form.image_path || null,
      in_stock: form.in_stock,
      shelf_life_days: form.shelf_life_days ? parseInt(form.shelf_life_days) : null,
      sort_order: parseInt(form.sort_order) || 0,
    };

    if (product) {
      await supabase.from('products').update(payload).eq('id', product.id);
    } else {
      await supabase.from('products').insert(payload);
    }

    setLoading(false);
    router.push('/products');
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>{product ? 'Редагувати товар' : 'Новий товар'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Назва *</Label>
              <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="price">Ціна (грн) *</Label>
              <Input id="price" type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Опис</Label>
            <Textarea id="description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Категорія *</Label>
              <Select value={form.category_id} onValueChange={(v) => v && setForm({ ...form, category_id: v })}>
                <SelectTrigger><SelectValue placeholder="Оберіть" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="volume">Об'єм</Label>
              <Input id="volume" value={form.volume} onChange={(e) => setForm({ ...form, volume: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="shelf">Термін придатності (днів)</Label>
              <Input id="shelf" type="number" value={form.shelf_life_days} onChange={(e) => setForm({ ...form, shelf_life_days: e.target.value })} />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="image">Зображення (URL)</Label>
              <Input id="image" value={form.image_path} onChange={(e) => setForm({ ...form, image_path: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sort">Порядок сортування</Label>
              <Input id="sort" type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Switch checked={form.in_stock} onCheckedChange={(v) => setForm({ ...form, in_stock: v })} />
            <Label>В наявності</Label>
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="submit" disabled={loading}>
              {loading ? 'Збереження...' : 'Зберегти'}
            </Button>
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Скасувати
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
