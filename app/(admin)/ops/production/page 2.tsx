export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { uk } from 'date-fns/locale';

const STAGE_LABELS: Record<string, string> = { print: 'Друк', pack: 'Упаковка' };
const MATERIAL_LABELS: Record<string, string> = { transparent: 'Прозорий', white: 'Білий', brown: 'Коричневий' };

export default async function ProductionPage() {
  const supabase = await createAdminClient();

  const { data: production } = await supabase
    .from('ops_production')
    .select('*, ops_staff(name)')
    .order('created_at', { ascending: false })
    .limit(100);

  // Stats
  const today = new Date().toISOString().slice(0, 10);
  const todayItems = (production ?? []).filter(p => p.created_at.startsWith(today));
  const totalPacksToday = todayItems.filter(p => p.stage === 'pack').reduce((s, p) => s + (p.packages ?? 0), 0);
  const totalPrintsToday = todayItems.filter(p => p.stage === 'print').reduce((s, p) => s + (p.rolls ?? 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Виробництво</h1>
        <p className="text-muted-foreground">Записи з Telegram Ops Bot</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Сьогодні друк</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{totalPrintsToday} <span className="text-base font-normal text-muted-foreground">рулонів</span></p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Сьогодні упаковка</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{totalPacksToday} <span className="text-base font-normal text-muted-foreground">упаковок</span></p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Всього записів</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{production?.length ?? 0}</p></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Журнал виробництва</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Дата</TableHead>
                <TableHead>Працівник</TableHead>
                <TableHead>Етап</TableHead>
                <TableHead>Розмір</TableHead>
                <TableHead>Матеріал</TableHead>
                <TableHead className="text-right">Км</TableHead>
                <TableHead className="text-right">Рулони</TableHead>
                <TableHead className="text-right">Упаковки</TableHead>
                <TableHead>Фото</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(production ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="whitespace-nowrap">{format(new Date(p.created_at), 'dd.MM HH:mm', { locale: uk })}</TableCell>
                  <TableCell>{p.ops_staff?.name ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant={p.stage === 'print' ? 'default' : 'secondary'}>
                      {STAGE_LABELS[p.stage] ?? p.stage}
                    </Badge>
                  </TableCell>
                  <TableCell>{p.bag_size}</TableCell>
                  <TableCell>{MATERIAL_LABELS[p.material] ?? p.material}</TableCell>
                  <TableCell className="text-right">{p.km ?? '—'}</TableCell>
                  <TableCell className="text-right">{p.rolls ?? '—'}</TableCell>
                  <TableCell className="text-right font-semibold">{p.packages ?? '—'}</TableCell>
                  <TableCell>
                    {p.photo_url && (
                      <a href={p.photo_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-sm">
                        📷
                      </a>
                    )}
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
