import { createAdminClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { StatusBadge } from '@/components/status-badge';
import { OrderActions } from './actions';
import { format } from 'date-fns';
import { uk } from 'date-fns/locale';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createAdminClient();

  const { data: order } = await supabase
    .from('orders')
    .select('*, order_items(*), profiles(name, last_name, phone, city)')
    .eq('id', id)
    .single();

  if (!order) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/orders" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold">Замовлення</h1>
          <p className="text-sm text-muted-foreground font-mono">{order.id.slice(0, 8)}</p>
        </div>
        <div className="ml-auto">
          <StatusBadge status={order.status} />
        </div>
      </div>

      <OrderActions orderId={order.id} status={order.status} />

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Клієнт</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><span className="text-muted-foreground">Ім'я:</span> {order.first_name} {order.last_name}</p>
            <p><span className="text-muted-foreground">Телефон:</span> {order.phone ?? '—'}</p>
            {order.profiles && (
              <p><span className="text-muted-foreground">Місто (профіль):</span> {order.profiles.city ?? '—'}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Доставка</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><span className="text-muted-foreground">Місто:</span> {order.city_name ?? '—'}</p>
            <p><span className="text-muted-foreground">Відділення НП:</span> {order.warehouse_name ?? '—'}</p>
            <p><span className="text-muted-foreground">ТТН:</span> <span className="font-mono">{order.np_ttn ?? '—'}</span></p>
            <p><span className="text-muted-foreground">Вартість доставки:</span> {order.np_delivery_cost ? `${order.np_delivery_cost} грн` : '—'}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Позиції замовлення</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Товар</TableHead>
                <TableHead className="text-right">Кількість</TableHead>
                <TableHead className="text-right">Ціна</TableHead>
                <TableHead className="text-right">Сума</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.order_items?.map((item: any) => (
                <TableRow key={item.id}>
                  <TableCell>{item.product_name}</TableCell>
                  <TableCell className="text-right">{item.quantity}</TableCell>
                  <TableCell className="text-right">{Number(item.price_at_order).toLocaleString('uk-UA')} грн</TableCell>
                  <TableCell className="text-right">{(item.quantity * Number(item.price_at_order)).toLocaleString('uk-UA')} грн</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Separator className="my-4" />
          <div className="flex justify-end text-lg font-bold">
            Разом: {Number(order.total_amount).toLocaleString('uk-UA')} грн
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Додатково</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p><span className="text-muted-foreground">Дата створення:</span> {format(new Date(order.created_at), 'dd.MM.yyyy HH:mm', { locale: uk })}</p>
          <p><span className="text-muted-foreground">Примітки:</span> {order.notes ?? '—'}</p>
          {order.keycrm_order_id && (
            <p><span className="text-muted-foreground">KeyCRM ID:</span> {order.keycrm_order_id}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
