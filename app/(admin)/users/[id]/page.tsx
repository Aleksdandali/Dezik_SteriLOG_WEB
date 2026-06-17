import { createAdminClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { StatusBadge } from '@/components/status-badge';
import { format } from 'date-fns';
import { uk } from 'date-fns/locale';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createAdminClient();

  const [
    { data: profile },
    { count: ordersCount },
    { count: cyclesCount },
    { data: recentOrders },
    { data: recentCycles },
    { data: instruments },
    { data: sterilizers },
  ] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', id).single(),
    supabase.from('orders').select('*', { count: 'exact', head: true }).eq('user_id', id),
    supabase.from('sterilization_sessions').select('*', { count: 'exact', head: true }).eq('user_id', id),
    supabase.from('orders').select('*').eq('user_id', id).order('created_at', { ascending: false }).limit(5),
    supabase.from('sterilization_sessions').select('*').eq('user_id', id).order('created_at', { ascending: false }).limit(5),
    supabase.from('instruments').select('*').eq('user_id', id),
    supabase.from('sterilizers').select('*').eq('user_id', id),
  ]);

  if (!profile) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/users" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-3xl font-bold">{profile.name ?? '—'}</h1>
        <Badge variant="outline">{profile.role}</Badge>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Профіль</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><span className="text-muted-foreground">Салон:</span> {profile.salon_name ?? '—'}</p>
            <p><span className="text-muted-foreground">Місто:</span> {profile.city ?? '—'}</p>
            <p><span className="text-muted-foreground">Телефон:</span> {profile.phone ?? '—'}</p>
            <p><span className="text-muted-foreground">Реєстрація:</span> {format(new Date(profile.created_at), 'dd.MM.yyyy', { locale: uk })}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Статистика</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><span className="text-muted-foreground">Замовлень:</span> {ordersCount ?? 0}</p>
            <p><span className="text-muted-foreground">Циклів стерилізації:</span> {cyclesCount ?? 0}</p>
            <p><span className="text-muted-foreground">Інструментів:</span> {instruments?.length ?? 0}</p>
            <p><span className="text-muted-foreground">Стерилізаторів:</span> {sterilizers?.length ?? 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Сповіщення</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><span className="text-muted-foreground">Цикл завершено:</span> {profile.notification_cycle_done ? 'Так' : 'Ні'}</p>
            <p><span className="text-muted-foreground">Цикл простоює:</span> {profile.notification_cycle_idle ? 'Так' : 'Ні'}</p>
            <p><span className="text-muted-foreground">Статус замовлення:</span> {profile.notification_order_status ? 'Так' : 'Ні'}</p>
          </CardContent>
        </Card>
      </div>

      {instruments && instruments.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Інструменти</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {instruments.map((i) => (
                <Badge key={i.id} variant="secondary">{i.name}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Останні замовлення</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Дата</TableHead>
                <TableHead>Сума</TableHead>
                <TableHead>Статус</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentOrders?.map((o) => (
                <TableRow key={o.id}>
                  <TableCell>{format(new Date(o.created_at), 'dd.MM.yyyy HH:mm', { locale: uk })}</TableCell>
                  <TableCell>{Number(o.total_amount).toLocaleString('uk-UA')} грн</TableCell>
                  <TableCell><StatusBadge status={o.status} /></TableCell>
                </TableRow>
              ))}
              {(!recentOrders || recentOrders.length === 0) && (
                <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">Немає замовлень</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Останні цикли стерилізації</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Дата</TableHead>
                <TableHead>Стерилізатор</TableHead>
                <TableHead>Інструменти</TableHead>
                <TableHead>Результат</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentCycles?.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{format(new Date(c.created_at), 'dd.MM.yyyy HH:mm', { locale: uk })}</TableCell>
                  <TableCell>{c.sterilizer_name}</TableCell>
                  <TableCell className="max-w-xs truncate">{c.instrument_names}</TableCell>
                  <TableCell>{c.result ? <StatusBadge status={c.result} type="cycle" /> : '—'}</TableCell>
                </TableRow>
              ))}
              {(!recentCycles || recentCycles.length === 0) && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Немає циклів</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
