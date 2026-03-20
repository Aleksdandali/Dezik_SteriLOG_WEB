'use client';

import { useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { format, isToday, isThisWeek, isThisMonth } from 'date-fns';
import { uk } from 'date-fns/locale';
import {
  Search, ShoppingCart, DollarSign, Clock, Package,
  ChevronDown, Phone, MapPin, ExternalLink, Truck,
  User, Hash, CheckCircle, XCircle, Loader2, Copy, Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { updateOrderStatus } from '@/app/(admin)/orders/[id]/order-actions-server';

interface Order {
  id: string;
  user_id: string;
  status: string;
  total_amount: number;
  delivery_address: string | null;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  city_name: string | null;
  warehouse_name: string | null;
  np_ttn: string | null;
  np_delivery_cost: number | null;
  notes: string | null;
  keycrm_order_id: number | null;
  created_at: string;
  order_items?: OrderItem[];
}

interface OrderItem {
  id: string;
  product_name: string;
  quantity: number;
  price_at_order: number;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; dotColor: string; borderColor: string }> = {
  all: { label: 'Всі', color: 'text-gray-700', bgColor: 'bg-gray-100 hover:bg-gray-200', dotColor: 'bg-gray-400', borderColor: 'border-gray-200' },
  pending: { label: 'Нові', color: 'text-amber-700', bgColor: 'bg-amber-50 hover:bg-amber-100', dotColor: 'bg-amber-500', borderColor: 'border-amber-200' },
  confirmed: { label: 'Підтверджені', color: 'text-emerald-700', bgColor: 'bg-emerald-50 hover:bg-emerald-100', dotColor: 'bg-emerald-500', borderColor: 'border-emerald-200' },
  shipped: { label: 'Доставка', color: 'text-blue-700', bgColor: 'bg-blue-50 hover:bg-blue-100', dotColor: 'bg-blue-500', borderColor: 'border-blue-200' },
  canceled: { label: 'Скасовані', color: 'text-red-700', bgColor: 'bg-red-50 hover:bg-red-100', dotColor: 'bg-red-500', borderColor: 'border-red-200' },
};

function StatusDot({ status }: { status: string }) {
  const config = STATUS_CONFIG[status];
  return <span className={cn('inline-block h-2 w-2 rounded-full', config?.dotColor ?? 'bg-gray-400')} />;
}

function StatusTag({ status }: { status: string }) {
  const config = STATUS_CONFIG[status];
  if (!config) return <Badge variant="outline">{status}</Badge>;
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold border',
      config.bgColor, config.color, config.borderColor,
    )}>
      <StatusDot status={status} />
      {config.label}
    </span>
  );
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  if (isToday(date)) return `Сьогодні ${format(date, 'HH:mm')}`;
  return format(date, 'dd.MM.yyyy HH:mm', { locale: uk });
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={(e) => { e.stopPropagation(); handleCopy(); }} className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
      {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

/* ── Expanded order detail panel ── */
function OrderExpandedRow({ order }: { order: Order }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleUpdateStatus = (newStatus: string) => {
    startTransition(async () => {
      await updateOrderStatus(order.id, newStatus);
      router.refresh();
    });
  };

  const clientName = order.first_name || order.last_name
    ? `${order.first_name ?? ''} ${order.last_name ?? ''}`.trim()
    : 'Невідомий';

  const itemsTotal = order.order_items?.reduce((s, i) => s + i.quantity * Number(i.price_at_order), 0) ?? 0;

  return (
    <div className="bg-[#f8f9fb] border-t border-b border-border/60 animate-in slide-in-from-top-2 duration-200">
      <div className="p-5">
        {/* 3-column layout */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

          {/* Column 1: Order info */}
          <div className="space-y-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Замовлення</h4>

            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">№ замовлення</span>
                <span className="font-mono text-xs">{order.id.slice(0, 8)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Час створення</span>
                <span>{formatDate(order.created_at)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Статус</span>
                <StatusTag status={order.status} />
              </div>
              {order.keycrm_order_id && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">KeyCRM</span>
                  <Badge variant="outline" className="font-mono text-xs">#{order.keycrm_order_id}</Badge>
                </div>
              )}
              {order.notes && (
                <div className="pt-1">
                  <span className="text-muted-foreground text-xs">Примітки:</span>
                  <p className="mt-1 rounded-md bg-white border border-border p-2 text-xs">{order.notes}</p>
                </div>
              )}
            </div>

            {/* Action buttons */}
            {order.status === 'pending' && (
              <div className="flex gap-2 pt-2">
                <Button
                  size="sm"
                  onClick={() => handleUpdateStatus('confirmed')}
                  disabled={isPending}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white flex-1"
                >
                  {isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="mr-1.5 h-3.5 w-3.5" />}
                  Підтвердити
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleUpdateStatus('canceled')}
                  disabled={isPending}
                  className="flex-1"
                >
                  <XCircle className="mr-1.5 h-3.5 w-3.5" />
                  Скасувати
                </Button>
              </div>
            )}
          </div>

          {/* Column 2: Client */}
          <div className="space-y-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Покупець</h4>

            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm flex-shrink-0">
                {(order.first_name?.[0] ?? '?').toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-sm text-primary">{clientName}</p>
              </div>
            </div>

            <div className="space-y-2.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Телефон</span>
                {order.phone ? (
                  <span className="flex items-center gap-1.5">
                    <span className="font-mono">{order.phone}</span>
                    <CopyButton text={order.phone} />
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </div>
            </div>

            {order.phone && (
              <div className="flex gap-2 pt-2">
                <a
                  href={`tel:${order.phone}`}
                  onClick={(e) => e.stopPropagation()}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-2 text-xs font-semibold transition-colors"
                >
                  <Phone className="h-3.5 w-3.5" />
                  Зателефонувати
                </a>
              </div>
            )}
          </div>

          {/* Column 3: Delivery */}
          <div className="space-y-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Доставка</h4>

            <div className="space-y-2.5 text-sm">
              <div>
                <span className="text-muted-foreground text-xs">Отримувач</span>
                <p className="font-medium">{clientName}</p>
                {order.phone && <p className="text-xs text-muted-foreground font-mono">{order.phone}</p>}
              </div>

              <Separator />

              <div>
                <span className="text-muted-foreground text-xs">Адреса доставки</span>
                {order.warehouse_name ? (
                  <p className="font-medium text-xs leading-relaxed">{order.warehouse_name}</p>
                ) : (
                  <p className="text-muted-foreground text-xs">—</p>
                )}
                {order.city_name && <p className="text-xs text-muted-foreground">{order.city_name}</p>}
              </div>

              <Separator />

              <div className="flex items-center gap-2">
                <Truck className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="text-xs text-muted-foreground">Нова Пошта</span>
              </div>

              <div>
                <span className="text-muted-foreground text-xs">Трекінг код</span>
                {order.np_ttn ? (
                  <div className="flex items-center gap-2 mt-1">
                    <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-2.5 py-1 text-xs font-mono text-blue-700 border border-blue-200">
                      {order.np_ttn}
                    </span>
                    <CopyButton text={order.np_ttn} />
                  </div>
                ) : (
                  <p className="text-muted-foreground text-xs">—</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Products table */}
        {order.order_items && order.order_items.length > 0 && (
          <div className="mt-6">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Товари ({order.order_items.length})
            </h4>
            <div className="rounded-lg border border-border bg-white overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40 text-xs text-muted-foreground uppercase tracking-wider">
                    <th className="px-4 py-2.5 text-left font-semibold">Назва</th>
                    <th className="px-4 py-2.5 text-center font-semibold">К-сть</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Ціна</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Сума</th>
                  </tr>
                </thead>
                <tbody>
                  {order.order_items.map((item, idx) => (
                    <tr key={item.id} className={cn(idx > 0 && 'border-t border-border/50')}>
                      <td className="px-4 py-2.5 font-medium">{item.product_name}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className="inline-flex h-6 min-w-[24px] items-center justify-center rounded bg-muted px-1.5 text-xs font-semibold">
                          {item.quantity}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-muted-foreground">{Number(item.price_at_order).toLocaleString('uk-UA')} ₴</td>
                      <td className="px-4 py-2.5 text-right font-semibold">{(item.quantity * Number(item.price_at_order)).toLocaleString('uk-UA')} ₴</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Totals */}
              <div className="border-t border-border bg-muted/20 px-4 py-3">
                <div className="flex flex-col items-end gap-1 text-sm">
                  <div className="flex gap-8">
                    <span className="text-muted-foreground">Сума за товари:</span>
                    <span className="font-semibold w-28 text-right">{itemsTotal.toLocaleString('uk-UA')} ₴</span>
                  </div>
                  {order.np_delivery_cost && Number(order.np_delivery_cost) > 0 && (
                    <div className="flex gap-8">
                      <span className="text-muted-foreground">Вартість доставки:</span>
                      <span className="w-28 text-right">{Number(order.np_delivery_cost).toLocaleString('uk-UA')} ₴</span>
                    </div>
                  )}
                  <Separator className="my-1 w-64" />
                  <div className="flex gap-8 text-base">
                    <span className="font-semibold">Загальна вартість:</span>
                    <span className="font-bold w-28 text-right">{Number(order.total_amount).toLocaleString('uk-UA')} ₴</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Main component ── */
export function OrdersList({ orders }: { orders: Order[] }) {
  const [activeStatus, setActiveStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: orders.length };
    for (const order of orders) {
      counts[order.status] = (counts[order.status] || 0) + 1;
    }
    return counts;
  }, [orders]);

  const filteredOrders = useMemo(() => {
    let result = orders;
    if (activeStatus !== 'all') {
      result = result.filter(o => o.status === activeStatus);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(o =>
        (o.first_name && o.first_name.toLowerCase().includes(q)) ||
        (o.last_name && o.last_name.toLowerCase().includes(q)) ||
        (o.phone && o.phone.includes(q)) ||
        (o.np_ttn && o.np_ttn.includes(q)) ||
        (o.city_name && o.city_name.toLowerCase().includes(q)) ||
        o.id.includes(q)
      );
    }
    return result;
  }, [orders, activeStatus, searchQuery]);

  // Stats
  const todayOrders = orders.filter(o => isToday(new Date(o.created_at)));
  const weekOrders = orders.filter(o => isThisWeek(new Date(o.created_at), { weekStartsOn: 1 }));
  const monthOrders = orders.filter(o => isThisMonth(new Date(o.created_at)));
  const totalRevenue = orders.filter(o => o.status !== 'canceled').reduce((sum, o) => sum + Number(o.total_amount), 0);

  const stats = [
    { label: 'Сьогодні', value: todayOrders.length, sub: `${todayOrders.filter(o => o.status !== 'canceled').reduce((s, o) => s + Number(o.total_amount), 0).toLocaleString('uk-UA')} грн`, icon: Clock, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Цей тиждень', value: weekOrders.length, sub: `${weekOrders.filter(o => o.status !== 'canceled').reduce((s, o) => s + Number(o.total_amount), 0).toLocaleString('uk-UA')} грн`, icon: ShoppingCart, color: 'text-violet-600', bg: 'bg-violet-50' },
    { label: 'Цей місяць', value: monthOrders.length, sub: `${monthOrders.filter(o => o.status !== 'canceled').reduce((s, o) => s + Number(o.total_amount), 0).toLocaleString('uk-UA')} грн`, icon: Package, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Загальна виручка', value: `${totalRevenue.toLocaleString('uk-UA')} ₴`, sub: `${orders.length} замовлень`, icon: DollarSign, color: 'text-amber-600', bg: 'bg-amber-50' },
  ];

  const toggleExpand = (id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Замовлення</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Керування замовленнями з мобільного додатку</p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((stat) => (
          <Card key={stat.label} className="border border-border/50 shadow-sm">
            <CardContent className="p-3.5">
              <div className="flex items-center gap-3">
                <div className={cn('flex h-9 w-9 items-center justify-center rounded-xl', stat.bg)}>
                  <stat.icon className={cn('h-4.5 w-4.5', stat.color)} />
                </div>
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground">{stat.label}</p>
                  <p className="text-lg font-bold text-foreground leading-tight">{stat.value}</p>
                  <p className="text-[11px] text-muted-foreground">{stat.sub}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(STATUS_CONFIG).map(([key, config]) => {
            const count = statusCounts[key] ?? 0;
            const isActive = activeStatus === key;
            return (
              <button
                key={key}
                onClick={() => setActiveStatus(key)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all border',
                  isActive
                    ? cn(config.bgColor, config.color, config.borderColor, 'shadow-sm')
                    : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                )}
              >
                {key !== 'all' && <StatusDot status={key} />}
                {config.label}
                <span className={cn(
                  'rounded-full px-1.5 text-[10px] font-bold min-w-[18px] text-center',
                  isActive ? 'bg-white/70 text-gray-700' : 'bg-gray-100 text-gray-500'
                )}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Пошук за ім'ям, телефоном, ТТН..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-input bg-background pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
          />
        </div>
      </div>

      {/* Orders list */}
      <Card className="border border-border/50 shadow-sm overflow-hidden">
        <CardContent className="p-0">
          {/* Table header */}
          <div className="grid grid-cols-[40px_40px_1fr_140px_140px_1fr_120px_100px_100px] items-center gap-0 bg-muted/40 border-b border-border px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <div></div>
            <div>#</div>
            <div>Дата</div>
            <div>Статус</div>
            <div>Клієнт</div>
            <div>Трекінг код</div>
            <div>Телефон</div>
            <div className="text-right">Сума</div>
            <div></div>
          </div>

          {/* Rows */}
          {filteredOrders.map((order, idx) => {
            const isExpanded = expandedId === order.id;
            const clientName = order.first_name || order.last_name
              ? `${order.first_name ?? ''} ${order.last_name ?? ''}`.trim()
              : '—';

            return (
              <div key={order.id}>
                {/* Compact row */}
                <div
                  onClick={() => toggleExpand(order.id)}
                  className={cn(
                    'grid grid-cols-[40px_40px_1fr_140px_140px_1fr_120px_100px_100px] items-center gap-0 px-3 py-2.5 text-sm cursor-pointer transition-colors border-b border-border/40',
                    isExpanded ? 'bg-primary/5' : 'hover:bg-muted/30',
                  )}
                >
                  {/* Expand chevron */}
                  <div>
                    <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', isExpanded && 'rotate-180')} />
                  </div>

                  {/* Number */}
                  <div className="text-xs text-muted-foreground font-mono">
                    {filteredOrders.length - idx}
                  </div>

                  {/* Date */}
                  <div className="font-medium text-sm">{formatDate(order.created_at)}</div>

                  {/* Status */}
                  <div><StatusTag status={order.status} /></div>

                  {/* Client */}
                  <div className="font-medium text-primary truncate">{clientName}</div>

                  {/* TTN */}
                  <div>
                    {order.np_ttn ? (
                      <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-[11px] font-mono text-blue-700 border border-blue-200">
                        {order.np_ttn}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </div>

                  {/* Phone */}
                  <div className="text-xs font-mono text-muted-foreground truncate">
                    {order.phone ?? '—'}
                  </div>

                  {/* Amount */}
                  <div className="text-right font-bold text-sm">
                    {Number(order.total_amount).toLocaleString('uk-UA')} ₴
                  </div>

                  {/* Items count */}
                  <div className="text-right">
                    {order.order_items && order.order_items.length > 0 && (
                      <span className="text-[11px] text-muted-foreground">
                        {order.order_items.length} шт
                      </span>
                    )}
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && <OrderExpandedRow order={order} />}
              </div>
            );
          })}

          {/* Empty state */}
          {filteredOrders.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
              <ShoppingCart className="h-10 w-10 opacity-30" />
              <p className="text-sm">{searchQuery ? 'Нічого не знайдено' : 'Замовлень поки немає'}</p>
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="text-xs text-primary hover:underline">Очистити пошук</button>
              )}
            </div>
          )}

          {/* Footer */}
          {filteredOrders.length > 0 && (
            <div className="border-t border-border bg-muted/20 px-4 py-2.5 text-xs text-muted-foreground flex items-center justify-between">
              <span>Показано {filteredOrders.length} з {orders.length}</span>
              <span>Сума: <strong className="text-foreground">{filteredOrders.filter(o => o.status !== 'canceled').reduce((s, o) => s + Number(o.total_amount), 0).toLocaleString('uk-UA')} ₴</strong></span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
