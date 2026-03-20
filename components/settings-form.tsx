'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { AppConfig, PacketType } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Save } from 'lucide-react';

interface Props {
  config: AppConfig[];
  packetTypes: PacketType[];
}

export function SettingsForm({ config, packetTypes }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  const getVal = (key: string) => {
    const item = config.find((c) => c.key === key);
    return item?.value?.replace(/^"|"$/g, '') ?? '';
  };

  const [form, setForm] = useState({
    free_shipping_threshold: getVal('free_shipping_threshold'),
    notification_reminder_days: getVal('notification_reminder_days'),
    notification_reminder_hour: getVal('notification_reminder_hour'),
    temp_range_min: getVal('temp_range_min'),
    temp_range_max: getVal('temp_range_max'),
    duration_range_min: getVal('duration_range_min'),
    duration_range_max: getVal('duration_range_max'),
    pdf_company_name: getVal('pdf_company_name'),
    pdf_website: getVal('pdf_website'),
  });

  const handleSave = async () => {
    setLoading(true);
    const entries = Object.entries(form);
    for (const [key, value] of entries) {
      const isText = key.startsWith('pdf_');
      const dbValue = isText ? `"${value}"` : value;
      await supabase.from('app_config').upsert({ key, value: dbValue, updated_at: new Date().toISOString() });
    }
    setLoading(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    router.refresh();
  };

  const updatePacketType = async (id: string, label: string, active: boolean) => {
    await supabase.from('packet_types').update({ label, active }).eq('id', id);
    router.refresh();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Доставка</CardTitle></CardHeader>
        <CardContent>
          <div className="max-w-xs space-y-2">
            <Label>Поріг безкоштовної доставки (грн)</Label>
            <Input type="number" value={form.free_shipping_threshold} onChange={(e) => setForm({ ...form, free_shipping_threshold: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Сповіщення</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-4 max-w-md md:grid-cols-2">
            <div className="space-y-2">
              <Label>Днів до нагадування</Label>
              <Input type="number" value={form.notification_reminder_days} onChange={(e) => setForm({ ...form, notification_reminder_days: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Година нагадування (0-23)</Label>
              <Input type="number" min="0" max="23" value={form.notification_reminder_hour} onChange={(e) => setForm({ ...form, notification_reminder_hour: e.target.value })} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Стерилізація</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-4 max-w-lg md:grid-cols-2">
            <div className="space-y-2">
              <Label>Мін. температура (°C)</Label>
              <Input type="number" value={form.temp_range_min} onChange={(e) => setForm({ ...form, temp_range_min: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Макс. температура (°C)</Label>
              <Input type="number" value={form.temp_range_max} onChange={(e) => setForm({ ...form, temp_range_max: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Мін. тривалість (хв)</Label>
              <Input type="number" value={form.duration_range_min} onChange={(e) => setForm({ ...form, duration_range_min: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Макс. тривалість (хв)</Label>
              <Input type="number" value={form.duration_range_max} onChange={(e) => setForm({ ...form, duration_range_max: e.target.value })} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Брендинг PDF</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-4 max-w-lg md:grid-cols-2">
            <div className="space-y-2">
              <Label>Назва компанії</Label>
              <Input value={form.pdf_company_name} onChange={(e) => setForm({ ...form, pdf_company_name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Сайт</Label>
              <Input value={form.pdf_website} onChange={(e) => setForm({ ...form, pdf_website: e.target.value })} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={loading} size="lg">
        <Save className="mr-2 h-4 w-4" />
        {loading ? 'Збереження...' : saved ? 'Збережено!' : 'Зберегти налаштування'}
      </Button>

      <Card>
        <CardHeader><CardTitle>Типи пакетів</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Назва</TableHead>
                <TableHead>Активний</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {packetTypes.map((pt) => (
                <PacketTypeRow key={pt.id} item={pt} onUpdate={updatePacketType} />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function PacketTypeRow({ item, onUpdate }: { item: PacketType; onUpdate: (id: string, label: string, active: boolean) => void }) {
  const [label, setLabel] = useState(item.label);
  const [active, setActive] = useState(item.active);
  const changed = label !== item.label || active !== item.active;

  return (
    <TableRow>
      <TableCell className="font-mono">{item.id}</TableCell>
      <TableCell>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} className="max-w-xs" />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-3">
          <Switch checked={active} onCheckedChange={setActive} />
          {changed && (
            <Button size="sm" variant="outline" onClick={() => onUpdate(item.id, label, active)}>
              <Save className="mr-1 h-3 w-3" />Зберегти
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
