export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { OrderActions } from './actions';
import { format } from 'date-fns';
import { uk } from 'date-fns/locale';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, User, Truck, Package, FileText, Clock,
  MapPin, Phone, Hash, CreditCard, ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; dotColor: string }> = {
  pending: { label: 'Нове замовлення', color: 'text-amber-700', bgColor: 'bg-amber-50 border-amber-200', dotColor: 'bg-amber-500' },
  confirmed: { label: 'Підтверджено', color: 'text-emerald-700', bgColor: 'bg-emerald-50 border-emerald-200', dotColor: 'bg-emerald-500' },
  shipped: { label: 'В доставці', color: 'text-blue-700', bgColor: 'bg-blue-50 border-blue-200', dotColor: 'bg-blue-500' },
  canceled: { label: 'Скасовано', color: 'text-red-700', bgColor: 'bg-red-50 border-red-200', dotColor: 'bg-red-500' },
};

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createAdminClient();

  const { data: order } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('id', id)
    .single();

  if (!order) notFound();

  const statusConfig = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.pending;
  const itemsCount = order.order_items?.length ?? 0;
  const itemsTotal = order.order_items?.reduce((s: number, i: any) => s + i.quantity * Number(i.price_at_order), 0) ?? 0;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link
          href="/orders"
          className="mt-1 flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold">Замовлення</h1>
            <span className="text-sm font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
              #{order.id.slice(0, 8)}
            </span>
            <span className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border',
              statusConfig.bgColor, statusConfig.color,
            )}>
              <span className={cn('h-2 w-2 rounded-full', statusConfig.dotColor)} />
              {statusConfig.label}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            <Clock className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />
            {format(new Date(order.created_at), "d MMMM yyyy 'о' HH:mm", { locale: uk })}
          </p>
        </div>
      </div>

      {/* Actions */}
      <OrderActions orderId={order.id} status={order.status} />

      {/* Info grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Client card */}
        <Card className="border border-border/50 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                <User className="h-4 w-4" />
              </div>
              Клієнт
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm">
                {(order.first_name?.[0] ?? '?').toUpperCase()}
              </div>
              <div>
                <p className="font-medium">
                  {order.first_name || order.last_name
                    ? `${order.first_name ?? ''} ${order.last_name ?? ''}`.trim()
                    : 'Невідомий'}
                </p>
              </div>
            </div>
            <Separator />
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span className="font-mono">{order.phone ?? '—'}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Delivery card */}
        <Card className="border border-border/50 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <Truck className="h-4 w-4" />
              </div>
              Доставка
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">{order.city_name ?? '—'}</p>
                <p className="text-muted-foreground text-xs">{order.warehouse_name ?? 'Відділення не обрано'}</p>
              </div>
            </div>
            <Separator />
            <div className="flex items-center gap-2">
              <Hash className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">ТТН:</span>
              {order.np_ttn ? (
                <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-xs font-mono text-blue-700 border border-blue-200">
                  <ExternalLink className="h-3 w-3" />
                  {order.np_ttn}
                </span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </div>
            {order.np_delivery_cost && (
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Вартість доставки:</span>
                <span className="font-medium">{Number(order.np_delivery_cost).toLocaleString('uk-UA')} ₴</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Order items */}
      <Card className="border border-border/50 shadow-sm overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <Package className="h-4 w-4" />
            </div>
            Товари
            <Badge variant="secondary" className="ml-auto text-xs">
              {itemsCount} {itemsCount === 1 ? 'позиція' : itemsCount < 5 ? 'позиції' : 'позицій'}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="font-semibold text-xs uppercase tracking-wide">#</TableHead>
                <TableHead className="font-semibold text-xs uppercase tracking-wide">Товар</TableHead>
                <TableHead className="text-center font-semibold text-xs uppercase tracking-wide">К-сть</TableHead>
                <TableHead className="text-right font-semibold text-xs uppercase tracking-wide">Ціна</TableHead>
                <TableHead className="text-right font-semibold text-xs uppercase tracking-wide">Сума</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.order_items?.map((item: any, idx: number) => (
                <TableRow key={item.id}>
                  <TableCell className="text-muted-foreground text-xs font-mono w-[40px]">{idx + 1}</TableCell>
                  <TableCell className="font-medium">{item.product_name}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary" className="text-xs">{item.quantity}</Badge>
                  </TableCell>
                  <TableCell className="text-right text-sm">{Number(item.price_at_order).toLocaleString('uk-UA')} ₴</TableCell>
                  <TableCell className="text-right text-sm font-medium">
                    {(item.quantity * Number(item.price_at_order)).toLocaleString('uk-UA')} ₴
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Total */}
          <div className="border-t border-border bg-muted/20 px-6 py-4">
            <div className="flex items-center justify-end gap-8">
              {order.np_delivery_cost && (
                <div className="text-sm text-muted-foreground">
                  Доставка: <span className="font-medium text-foreground">{Number(order.np_delivery_cost).toLocaleString('uk-UA')} ₴</span>
                </div>
              )}
              <div className="text-lg">
                Разом: <span className="font-bold text-foreground">{Number(order.total_amount).toLocaleString('uk-UA')} ₴</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Extra info */}
      {(order.notes || order.keycrm_order_id) && (
        <Card className="border border-border/50 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-gray-600">
                <FileText className="h-4 w-4" />
              </div>
              Додатково
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {order.notes && (
              <div className="rounded-lg bg-muted/50 p-3 text-sm">
                <p className="text-xs font-medium text-muted-foreground mb-1">Примітки:</p>
                <p>{order.notes}</p>
              </div>
            )}
            {order.keycrm_order_id && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">KeyCRM:</span>
                <Badge variant="outline" className="font-mono">#{order.keycrm_order_id}</Badge>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
