import { createAdminClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/status-badge';
import { StatCard } from '@/components/stat-card';
import { PhotoViewer } from '@/components/photo-viewer';
import { format } from 'date-fns';
import { uk } from 'date-fns/locale';
import { Microscope, CheckCircle, XCircle } from 'lucide-react';

export default async function CyclesPage() {
  const supabase = await createAdminClient();

  const [
    { count: totalCount },
    { count: successCount },
    { count: failCount },
    { data: sessions },
  ] = await Promise.all([
    supabase.from('sterilization_sessions').select('*', { count: 'exact', head: true }),
    supabase.from('sterilization_sessions').select('*', { count: 'exact', head: true }).eq('result', 'success'),
    supabase.from('sterilization_sessions').select('*', { count: 'exact', head: true }).eq('result', 'fail'),
    supabase.from('sterilization_sessions')
      .select('*, profiles(name, last_name, salon_name)')
      .order('created_at', { ascending: false })
      .limit(100),
  ]);

  const total = totalCount ?? 0;
  const successPct = total > 0 ? Math.round(((successCount ?? 0) / total) * 100) : 0;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Журнал циклів</h1>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard title="Всього циклів" value={total} icon={Microscope} />
        <StatCard title="Успішних" value={`${successPct}%`} description={`${successCount ?? 0} циклів`} icon={CheckCircle} />
        <StatCard title="Невдалих" value={failCount ?? 0} icon={XCircle} />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Дата</TableHead>
                <TableHead>Користувач</TableHead>
                <TableHead>Салон</TableHead>
                <TableHead>Інструменти</TableHead>
                <TableHead>Стерилізатор</TableHead>
                <TableHead>Режим</TableHead>
                <TableHead>Результат</TableHead>
                <TableHead>Фото</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions?.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="whitespace-nowrap">
                    {format(new Date(s.created_at), 'dd.MM.yyyy HH:mm', { locale: uk })}
                  </TableCell>
                  <TableCell>{s.profiles?.name} {s.profiles?.last_name}</TableCell>
                  <TableCell>{s.profiles?.salon_name ?? '—'}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{s.instrument_names}</TableCell>
                  <TableCell>{s.sterilizer_name}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {s.temperature ? `${s.temperature}°C` : '—'} / {s.duration_minutes ? `${s.duration_minutes} хв` : '—'}
                  </TableCell>
                  <TableCell>
                    {s.result ? <StatusBadge status={s.result} type="cycle" /> : '—'}
                  </TableCell>
                  <TableCell>
                    <PhotoViewer beforePath={s.photo_before_path} afterPath={s.photo_after_path} />
                  </TableCell>
                </TableRow>
              ))}
              {(!sessions || sessions.length === 0) && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    Циклів поки немає
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
