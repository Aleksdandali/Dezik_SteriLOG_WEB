'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { SteriPreset } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2 } from 'lucide-react';

interface Props {
  presets: SteriPreset[];
}

const empty: FormState = {
  id: '', label: '', sublabel: '', temperature: '', duration: '',
  type: 'dry_heat', recommended: false, description: '', active: true, sort_order: '0',
};

interface FormState {
  id: string; label: string; sublabel: string; temperature: string; duration: string;
  type: string; recommended: boolean; description: string; active: boolean; sort_order: string;
}

export function SteriPresetsManager({ presets }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SteriPreset | null>(null);
  const [form, setForm] = useState(empty);

  const openNew = () => { setEditing(null); setForm(empty); setOpen(true); };
  const openEdit = (p: SteriPreset) => {
    setEditing(p);
    setForm({
      id: p.id, label: p.label, sublabel: p.sublabel,
      temperature: p.temperature.toString(), duration: p.duration.toString(),
      type: p.type, recommended: p.recommended, description: p.description ?? '',
      active: p.active, sort_order: p.sort_order.toString(),
    });
    setOpen(true);
  };

  const handleSave = async () => {
    const payload = {
      id: form.id, label: form.label, sublabel: form.sublabel,
      temperature: parseInt(form.temperature), duration: parseInt(form.duration),
      type: form.type, recommended: form.recommended, description: form.description || null,
      active: form.active, sort_order: parseInt(form.sort_order) || 0,
    };
    if (editing) {
      await supabase.from('steri_presets').update(payload).eq('id', editing.id);
    } else {
      await supabase.from('steri_presets').insert(payload);
    }
    setOpen(false);
    router.refresh();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Видалити цей режим?')) return;
    await supabase.from('steri_presets').delete().eq('id', id);
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Додати режим</Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Назва</TableHead>
            <TableHead>Підназва</TableHead>
            <TableHead>Тип</TableHead>
            <TableHead className="text-right">°C</TableHead>
            <TableHead className="text-right">Хв</TableHead>
            <TableHead>Рекомендований</TableHead>
            <TableHead>Активний</TableHead>
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {presets.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-medium">{p.label}</TableCell>
              <TableCell>{p.sublabel}</TableCell>
              <TableCell><Badge variant="outline">{p.type === 'dry_heat' ? 'Сухожар' : 'Автоклав'}</Badge></TableCell>
              <TableCell className="text-right">{p.temperature}</TableCell>
              <TableCell className="text-right">{p.duration}</TableCell>
              <TableCell>{p.recommended ? 'Так' : '—'}</TableCell>
              <TableCell>{p.active ? 'Так' : 'Ні'}</TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => handleDelete(p.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Редагувати режим' : 'Новий режим'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 grid-cols-2">
              <div className="space-y-2">
                <Label>ID</Label>
                <Input value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} disabled={!!editing} placeholder="dry_heat_180" />
              </div>
              <div className="space-y-2">
                <Label>Тип</Label>
                <Select value={form.type} onValueChange={(v: any) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dry_heat">Сухожар</SelectItem>
                    <SelectItem value="autoclave">Автоклав</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 grid-cols-2">
              <div className="space-y-2">
                <Label>Назва</Label>
                <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Підназва</Label>
                <Input value={form.sublabel} onChange={(e) => setForm({ ...form, sublabel: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-4 grid-cols-3">
              <div className="space-y-2">
                <Label>Температура °C</Label>
                <Input type="number" value={form.temperature} onChange={(e) => setForm({ ...form, temperature: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Тривалість (хв)</Label>
                <Input type="number" value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Порядок</Label>
                <Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Опис</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
            </div>
            <div className="flex gap-6">
              <div className="flex items-center gap-2">
                <Switch checked={form.recommended} onCheckedChange={(v) => setForm({ ...form, recommended: v })} />
                <Label>Рекомендований</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
                <Label>Активний</Label>
              </div>
            </div>
            <Button onClick={handleSave} className="w-full">Зберегти</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
