export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { uk } from 'date-fns/locale';

const LOC: Record<string, string> = {
  malynovskogo: 'Маліновського',
  afina_sklad: 'Афіна склад',
  afina_ofis: 'Афіна офіс',
  dalnytska: 'Дальницька',
};
const MAT: Record<string, string> = { transparent: 'Прозорий', white: 'Білий', brown: 'Коричневий' };

export default async function MovementsPage() {
  const supabase = await createAdminClient();

  const { data: movements } = await supabase
    .from('ops_movements')
    .select('*, ops_staff(name)')
    .order('created_at', { ascending: false })
    .limit(100);

  const pending = (movements ?? []).filter(m => !m.confirmed_at);
  const confirmed = (movements ?? []).filter(m => m.confirmed_at);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Переміщення</h1>
        <p className="text-muted-foreground">Рух товару між локаціями</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Очікують підтвердження</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold text-orange-500">{pending.length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Підтверджені</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold text-green-600">{confirmed.length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Всього</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{movements?.length ?? 0}</p></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Журнал переміщень</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Дата</TableHead>
                <TableHead>Відправник</TableHead>
                <TableHead>Маршрут</TableHead>
                <TableHead>Товар</TableHead>
                <TableHead className="text-right">Відправлено</TableHead>
                <TableHead className="text-right">Прийнято</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Фото</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(movements ?? []).map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="whitespace-nowrap">{format(new Date(m.created_at), 'dd.MM HH:mm', { locale: uk })}</TableCell>
                  <TableCell>{m.ops_staff?.name ?? '—'}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {LOC[m.from_location] ?? m.from_location} → {LOC[m.to_location] ?? m.to_location}
                  </TableCell>
                  <TableCell>
                    {m.bag_size ? `${m.bag_size} ${MAT[m.material] ?? m.material ?? ''}` : m.description}
                  </TableCell>
                  <TableCell className="text-right">{m.packages ?? m.quantity ?? '—'}</TableCell>
                  <TableCell className="text-right font-semibold">{m.confirmed_packages ?? '—'}</TableCell>
                  <TableCell>
                    {m.confirmed_at ? (
                      <Badge variant="secondary" className="bg-green-100 text-green-700">Прийнято</Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-orange-100 text-orange-700">Очікує</Badge>
                    )}
                  </TableCell>
                  <TableCell className="flex gap-1">
                    {m.photo_url && <a href={m.photo_url} target="_blank" rel="noopener noreferrer" title="Фото відправника">📤</a>}
                    {m.confirm_photo_url && <a href={m.confirm_photo_url} target="_blank" rel="noopener noreferrer" title="Фото отримувача">📥</a>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
