'use client';

import { useState, useRef } from 'react';
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
import { Upload, X, ImageIcon, Loader2 } from 'lucide-react';

const STORAGE_URL = 'https://csshbetufyocutdislkn.supabase.co/storage/v1/object/public/product-images';

interface ProductFormProps {
  product?: Product;
  categories: ProductCategory[];
}

export function ProductForm({ product, categories }: ProductFormProps) {
  const router = useRouter();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

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

  const imageUrl = form.image_path
    ? form.image_path.startsWith('http')
      ? form.image_path
      : `${STORAGE_URL}/${form.image_path}`
    : null;

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const ext = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error } = await supabase.storage
      .from('product-images')
      .upload(fileName, file, { upsert: true });

    if (!error) {
      setForm({ ...form, image_path: fileName });
    }
    setUploading(false);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveImage = async () => {
    if (form.image_path && !form.image_path.startsWith('http')) {
      await supabase.storage.from('product-images').remove([form.image_path]);
    }
    setForm({ ...form, image_path: '' });
  };

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
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Image upload card */}
      <Card>
        <CardHeader>
          <CardTitle>Фото товару</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-6 items-start">
            <div className="relative w-40 h-40 rounded-2xl border-2 border-dashed border-border bg-[#F3F4F6] dark:bg-muted flex items-center justify-center overflow-hidden shrink-0">
              {imageUrl ? (
                <>
                  <img src={imageUrl} alt="Product" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    className="absolute top-1.5 right-1.5 rounded-full bg-red-500 p-1 text-white shadow-md hover:bg-red-600 transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </>
              ) : uploading ? (
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
              ) : (
                <ImageIcon className="h-10 w-10 text-[#9CA3AF]" />
              )}
            </div>

            <div className="space-y-3 flex-1">
              <div>
                <p className="text-sm font-medium text-foreground">Завантажити зображення</p>
                <p className="text-xs text-muted-foreground mt-0.5">PNG, JPG або WebP. Макс. 5 МБ.</p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Завантаження...</>
                ) : (
                  <><Upload className="mr-2 h-4 w-4" />Обрати файл</>
                )}
              </Button>

              <div className="pt-1">
                <Label htmlFor="image-url" className="text-xs text-muted-foreground">Або вставте URL</Label>
                <Input
                  id="image-url"
                  value={form.image_path}
                  onChange={(e) => setForm({ ...form, image_path: e.target.value })}
                  placeholder="https://..."
                  className="mt-1 h-9"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main info card */}
      <Card>
        <CardHeader>
          <CardTitle>Основна інформація</CardTitle>
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
              <Label htmlFor="volume">Об&#39;єм</Label>
              <Input id="volume" value={form.volume} onChange={(e) => setForm({ ...form, volume: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="shelf">Термін придатності (днів)</Label>
              <Input id="shelf" type="number" value={form.shelf_life_days} onChange={(e) => setForm({ ...form, shelf_life_days: e.target.value })} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sort">Порядок сортування</Label>
            <Input id="sort" type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} className="w-32" />
          </div>
        </CardContent>
      </Card>

      {/* Status card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Наявність товару</p>
              <p className="text-xs text-muted-foreground">Товар буде видимий у додатку, якщо увімкнений</p>
            </div>
            <Switch checked={form.in_stock} onCheckedChange={(v) => setForm({ ...form, in_stock: v })} />
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex gap-3">
        <Button type="submit" disabled={loading} size="lg">
          {loading ? 'Збереження...' : 'Зберегти'}
        </Button>
        <Button type="button" variant="outline" size="lg" onClick={() => router.back()}>
          Скасувати
        </Button>
      </div>
    </form>
  );
}
