import { createAdminClient } from '@/lib/supabase/server';
import { StatusBadge } from '@/components/status-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { format } from 'date-fns';
import { uk } from 'date-fns/locale';
import Link from 'next/link';

export default async function OrdersPage() {
  const supabase = await createAdminClient();

  const { data: orders } = await supabase
    .from('orders')
    .select('*, profiles(name, last_name)')
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Замовлення</h1>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Дата</TableHead>
                <TableHead>Клієнт</TableHead>
                <TableHead>Місто</TableHead>
                <TableHead>Сума</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>ТТН</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders?.map((order) => (
                <TableRow key={order.id} className="cursor-pointer">
                  <TableCell>
                    <Link href={`/orders/${order.id}`} className="hover:underline">
                      {format(new Date(order.created_at), 'dd.MM.yyyy HH:mm', { locale: uk })}
                    </Link>
                  </TableCell>
                  <TableCell>{order.first_name} {order.last_name}</TableCell>
                  <TableCell>{order.city_name ?? '—'}</TableCell>
                  <TableCell>{Number(order.total_amount).toLocaleString('uk-UA')} грн</TableCell>
                  <TableCell><StatusBadge status={order.status} /></TableCell>
                  <TableCell className="font-mono text-sm">{order.np_ttn ?? '—'}</TableCell>
                </TableRow>
              ))}
              {(!orders || orders.length === 0) && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Замовлень поки немає
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
