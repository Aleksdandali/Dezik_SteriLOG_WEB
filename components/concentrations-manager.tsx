'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { ConcentrateProduct } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, AlertTriangle } from 'lucide-react';

interface Props {
  items: ConcentrateProduct[];
}

const emptyForm = {
  id: '', name: '', active: true, sort_order: '0',
  concentration_instruments: '', concentration_surfaces: '', concentration_preclean: '', concentration_other: '',
  contact_time_instruments: '', contact_time_surfaces: '', contact_time_preclean: '', contact_time_other: '',
};

export function ConcentrationsManager({ items }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ConcentrateProduct | null>(null);
  const [form, setForm] = useState(emptyForm);

  const openNew = () => { setEditing(null); setForm(emptyForm); setOpen(true); };
  const openEdit = (c: ConcentrateProduct) => {
    setEditing(c);
    setForm({
      id: c.id, name: c.name, active: c.active, sort_order: c.sort_order.toString(),
      concentration_instruments: c.concentration_instruments?.toString() ?? '',
      concentration_surfaces: c.concentration_surfaces?.toString() ?? '',
      concentration_preclean: c.concentration_preclean?.toString() ?? '',
      concentration_other: c.concentration_other?.toString() ?? '',
      contact_time_instruments: c.contact_time_instruments?.toString() ?? '',
      contact_time_surfaces: c.contact_time_surfaces?.toString() ?? '',
      contact_time_preclean: c.contact_time_preclean?.toString() ?? '',
      contact_time_other: c.contact_time_other?.toString() ?? '',
    });
    setOpen(true);
  };

  const num = (v: string) => v ? parseFloat(v) : null;
  const int = (v: string) => v ? parseInt(v) : null;

  const handleSave = async () => {
    const payload = {
      id: form.id, name: form.name, active: form.active, sort_order: parseInt(form.sort_order) || 0,
      concentration_instruments: num(form.concentration_instruments),
      concentration_surfaces: num(form.concentration_surfaces),
      concentration_preclean: num(form.concentration_preclean),
      concentration_other: num(form.concentration_other),
      contact_time_instruments: int(form.contact_time_instruments),
      contact_time_surfaces: int(form.contact_time_surfaces),
      contact_time_preclean: int(form.contact_time_preclean),
      contact_time_other: int(form.contact_time_other),
    };
    if (editing) {
      const { id, ...rest } = payload;
      await supabase.from('concentrate_products').update(rest).eq('id', editing.id);
    } else {
      await supabase.from('concentrate_products').insert(payload);
    }
    setOpen(false);
    router.refresh();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Видалити?')) return;
    await supabase.from('concentrate_products').delete().eq('id', id);
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-lg bg-yellow-50 p-3 text-sm text-yellow-800">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        Дані потребують верифікації від DEZIK
      </div>

      <div className="flex justify-end">
        <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Додати</Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Назва</TableHead>
            <TableHead className="text-right">Інстр. %</TableHead>
            <TableHead className="text-right">Пов. %</TableHead>
            <TableHead className="text-right">ПСО %</TableHead>
            <TableHead className="text-right">Інше %</TableHead>
            <TableHead>Активний</TableHead>
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="font-medium">{c.name}</TableCell>
              <TableCell className="text-right">{c.concentration_instruments ?? '—'}</TableCell>
              <TableCell className="text-right">{c.concentration_surfaces ?? '—'}</TableCell>
              <TableCell className="text-right">{c.concentration_preclean ?? '—'}</TableCell>
              <TableCell className="text-right">{c.concentration_other ?? '—'}</TableCell>
              <TableCell>{c.active ? <Badge className="bg-green-100 text-green-800 hover:bg-green-100" variant="secondary">Так</Badge> : 'Ні'}</TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => handleDelete(c.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Редагувати' : 'Новий продукт'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 grid-cols-2">
              <div className="space-y-2">
                <Label>ID</Label>
                <Input value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} disabled={!!editing} placeholder="delanol" />
              </div>
              <div className="space-y-2">
                <Label>Назва</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
            </div>

            <p className="text-sm font-medium">Концентрації (%)</p>
            <div className="grid gap-3 grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Інструменти</Label>
                <Input type="number" step="0.1" value={form.concentration_instruments} onChange={(e) => setForm({ ...form, concentration_instruments: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Поверхні</Label>
                <Input type="number" step="0.1" value={form.concentration_surfaces} onChange={(e) => setForm({ ...form, concentration_surfaces: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">ПСО</Label>
                <Input type="number" step="0.1" value={form.concentration_preclean} onChange={(e) => setForm({ ...form, concentration_preclean: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Інше</Label>
                <Input type="number" step="0.1" value={form.concentration_other} onChange={(e) => setForm({ ...form, concentration_other: e.target.value })} />
              </div>
            </div>

            <p className="text-sm font-medium">Час контакту (хв)</p>
            <div className="grid gap-3 grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Інструменти</Label>
                <Input type="number" value={form.contact_time_instruments} onChange={(e) => setForm({ ...form, contact_time_instruments: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Поверхні</Label>
                <Input type="number" value={form.contact_time_surfaces} onChange={(e) => setForm({ ...form, contact_time_surfaces: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">ПСО</Label>
                <Input type="number" value={form.contact_time_preclean} onChange={(e) => setForm({ ...form, contact_time_preclean: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Інше</Label>
                <Input type="number" value={form.contact_time_other} onChange={(e) => setForm({ ...form, contact_time_other: e.target.value })} />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
              <Label>Активний</Label>
            </div>

            <Button onClick={handleSave} className="w-full">Зберегти</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
