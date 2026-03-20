'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { InstrumentPouchMap } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Pencil, Trash2 } from 'lucide-react';

const POUCH_OPTIONS = [
  { value: 'pouch_60x100', label: '60×100 мм' },
  { value: 'pouch_75x150', label: '75×150 мм' },
  { value: 'pouch_100x200', label: '100×200 мм' },
];

interface Props {
  items: InstrumentPouchMap[];
}

export function PouchMapManager({ items }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<InstrumentPouchMap | null>(null);
  const [form, setForm] = useState({ pattern: '', pouch_id: 'pouch_75x150', note: '', sort_order: '0' });

  const openNew = () => { setEditing(null); setForm({ pattern: '', pouch_id: 'pouch_75x150', note: '', sort_order: '0' }); setOpen(true); };
  const openEdit = (item: InstrumentPouchMap) => {
    setEditing(item);
    setForm({ pattern: item.pattern, pouch_id: item.pouch_id, note: item.note ?? '', sort_order: item.sort_order.toString() });
    setOpen(true);
  };

  const handleSave = async () => {
    const payload = { pattern: form.pattern, pouch_id: form.pouch_id, note: form.note || null, sort_order: parseInt(form.sort_order) || 0 };
    if (editing) {
      await supabase.from('instrument_pouch_map').update(payload).eq('id', editing.id);
    } else {
      await supabase.from('instrument_pouch_map').insert(payload);
    }
    setOpen(false);
    router.refresh();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Видалити?')) return;
    await supabase.from('instrument_pouch_map').delete().eq('id', id);
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Додати</Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Патерн</TableHead>
            <TableHead>Пакет</TableHead>
            <TableHead>Примітка</TableHead>
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="font-mono">{item.pattern}</TableCell>
              <TableCell>{POUCH_OPTIONS.find((p) => p.value === item.pouch_id)?.label ?? item.pouch_id}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{item.note ?? '—'}</TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(item)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => handleDelete(item.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Редагувати' : 'Нова рекомендація'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Патерн (case-insensitive пошук)</Label>
              <Input value={form.pattern} onChange={(e) => setForm({ ...form, pattern: e.target.value })} placeholder="сталекс 11" />
            </div>
            <div className="space-y-2">
              <Label>Рекомендований пакет</Label>
              <Select value={form.pouch_id} onValueChange={(v) => v && setForm({ ...form, pouch_id: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {POUCH_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Примітка</Label>
              <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </div>
            <Button onClick={handleSave} className="w-full">Зберегти</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
