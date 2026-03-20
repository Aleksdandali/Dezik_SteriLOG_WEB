'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { ProductCategory } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, Save } from 'lucide-react';

interface Props {
  categories: (ProductCategory & { product_count: number })[];
}

export function CategoriesManager({ categories: initial }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(false);

  const addCategory = async () => {
    if (!newName.trim()) return;
    setLoading(true);
    await supabase.from('product_categories').insert({
      name: newName.trim(),
      sort_order: initial.length,
    });
    setNewName('');
    setLoading(false);
    router.refresh();
  };

  const deleteCategory = async (id: string, productCount: number) => {
    if (productCount > 0) {
      alert('Неможливо видалити категорію з товарами');
      return;
    }
    await supabase.from('product_categories').delete().eq('id', id);
    router.refresh();
  };

  const updateCategory = async (id: string, name: string, sortOrder: number) => {
    await supabase.from('product_categories').update({ name, sort_order: sortOrder }).eq('id', id);
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <Input
          placeholder="Нова категорія..."
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addCategory()}
        />
        <Button onClick={addCategory} disabled={loading}>
          <Plus className="mr-2 h-4 w-4" />Додати
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Назва</TableHead>
            <TableHead className="text-right">Товарів</TableHead>
            <TableHead className="w-24 text-right">Порядок</TableHead>
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {initial.map((cat) => (
            <CategoryRow
              key={cat.id}
              category={cat}
              onSave={updateCategory}
              onDelete={() => deleteCategory(cat.id, cat.product_count)}
            />
          ))}
          {initial.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                Категорій поки немає
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function CategoryRow({
  category,
  onSave,
  onDelete,
}: {
  category: ProductCategory & { product_count: number };
  onSave: (id: string, name: string, sortOrder: number) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(category.name);
  const [sortOrder, setSortOrder] = useState(category.sort_order.toString());
  const changed = name !== category.name || sortOrder !== category.sort_order.toString();

  return (
    <TableRow>
      <TableCell>
        <Input value={name} onChange={(e) => setName(e.target.value)} className="max-w-xs" />
      </TableCell>
      <TableCell className="text-right">{category.product_count}</TableCell>
      <TableCell className="text-right">
        <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="w-20 ml-auto" />
      </TableCell>
      <TableCell>
        <div className="flex gap-1">
          {changed && (
            <Button size="icon" variant="ghost" onClick={() => onSave(category.id, name, parseInt(sortOrder) || 0)}>
              <Save className="h-4 w-4" />
            </Button>
          )}
          <Button size="icon" variant="ghost" onClick={onDelete} disabled={category.product_count > 0}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
