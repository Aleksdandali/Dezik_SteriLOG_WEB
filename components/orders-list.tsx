'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { format, isToday, isThisWeek, isThisMonth, formatDistanceToNow } from 'date-fns';
import { uk } from 'date-fns/locale';
import Link from 'next/link';
import {
  Search, ShoppingCart, DollarSign, Clock, Package,
  ChevronRight, Phone, MapPin, Eye, ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';

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

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; dotColor: string }> = {
  all: { label: 'Всі', color: 'text-gray-700', bgColor: 'bg-gray-100 hover:bg-gray-200', dotColor: 'bg-gray-400' },
  pending: { label: 'Нові', color: 'text-amber-700', bgColor: 'bg-amber-50 hover:bg-amber-100 border-amber-200', dotColor: 'bg-amber-500' },
  confirmed: { label: 'Підтверджені', color: 'text-emerald-700', bgColor: 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200', dotColor: 'bg-emerald-500' },
  shipped: { label: 'Доставка', color: 'text-blue-700', bgColor: 'bg-blue-50 hover:bg-blue-100 border-blue-200', dotColor: 'bg-blue-500' },
  canceled: { label: 'Скасовані', color: 'text-red-700', bgColor: 'bg-red-50 hover:bg-red-100 border-red-200', dotColor: 'bg-red-500' },
};

function StatusDot({ status }: { status: string }) {
  const config = STATUS_CONFIG[status];
  return (
    <span className={cn('inline-block h-2 w-2 rounded-full', config?.dotColor ?? 'bg-gray-400')} />
  );
}

function StatusTag({ status }: { status: string }) {
  const config = STATUS_CONFIG[status];
  if (!config) return <Badge variant="outline">{status}</Badge>;
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold border',
      config.bgColor, config.color,
    )}>
      <StatusDot status={status} />
      {config.label}
    </span>
  );
}

function formatRelativeDate(dateStr: string) {
  const date = new Date(dateStr);
  if (isToday(date)) {
    return `Сьогодні ${format(date, 'HH:mm')}`;
  }
  return format(date, 'dd.MM.yyyy HH:mm', { locale: uk });
}

function formatTimeAgo(dateStr: string) {
  return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: uk });
}

export function OrdersList({ orders }: { orders: Order[] }) {
  const [activeStatus, setActiveStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

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
  const totalRevenue = orders
    .filter(o => o.status !== 'canceled')
    .reduce((sum, o) => sum + Number(o.total_amount), 0);

  const stats = [
    {
      label: 'Сьогодні',
      value: todayOrders.length,
      sub: `${todayOrders.filter(o => o.status !== 'canceled').reduce((s, o) => s + Number(o.total_amount), 0).toLocaleString('uk-UA')} грн`,
      icon: Clock,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      label: 'Цей тиждень',
      value: weekOrders.length,
      sub: `${weekOrders.filter(o => o.status !== 'canceled').reduce((s, o) => s + Number(o.total_amount), 0).toLocaleString('uk-UA')} грн`,
      icon: ShoppingCart,
      color: 'text-violet-600',
      bg: 'bg-violet-50',
    },
    {
      label: 'Цей місяць',
      value: monthOrders.length,
      sub: `${monthOrders.filter(o => o.status !== 'canceled').reduce((s, o) => s + Number(o.total_amount), 0).toLocaleString('uk-UA')} грн`,
      icon: Package,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
    {
      label: 'Загальна виручка',
      value: `${totalRevenue.toLocaleString('uk-UA')} ₴`,
      sub: `${orders.length} замовлень`,
      icon: DollarSign,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Замовлення</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Керування замовленнями з мобільного додатку
          </p>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="border border-border/50 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl', stat.bg)}>
                  <stat.icon className={cn('h-5 w-5', stat.color)} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">{stat.label}</p>
                  <p className="text-lg font-bold text-foreground leading-tight">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.sub}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters bar */}
      <Card className="border border-border/50 shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            {/* Status filters */}
            <div className="flex flex-wrap gap-2">
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
                        ? cn(config.bgColor, config.color, 'ring-2 ring-offset-1', key === 'all' ? 'ring-gray-300' : `ring-current/20`)
                        : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                    )}
                  >
                    {key !== 'all' && <StatusDot status={key} />}
                    {config.label}
                    <span className={cn(
                      'ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold min-w-[20px] text-center',
                      isActive ? 'bg-white/80 text-gray-700' : 'bg-gray-100 text-gray-500'
                    )}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Search */}
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
        </CardContent>
      </Card>

      {/* Orders table */}
      <Card className="border border-border/50 shadow-sm overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="w-[50px] text-center font-semibold text-xs uppercase tracking-wide">#</TableHead>
                <TableHead className="font-semibold text-xs uppercase tracking-wide">Дата</TableHead>
                <TableHead className="font-semibold text-xs uppercase tracking-wide">Статус</TableHead>
                <TableHead className="font-semibold text-xs uppercase tracking-wide">Клієнт</TableHead>
                <TableHead className="font-semibold text-xs uppercase tracking-wide">Місто</TableHead>
                <TableHead className="font-semibold text-xs uppercase tracking-wide">Телефон</TableHead>
                <TableHead className="font-semibold text-xs uppercase tracking-wide">ТТН</TableHead>
                <TableHead className="text-right font-semibold text-xs uppercase tracking-wide">Сума</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOrders.map((order, idx) => (
                <TableRow
                  key={order.id}
                  className="group hover:bg-muted/40 transition-colors"
                >
                  <TableCell className="text-center">
                    <span className="text-xs text-muted-foreground font-mono">
                      {filteredOrders.length - idx}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="text-sm font-medium">{formatRelativeDate(order.created_at)}</p>
                      <p className="text-[11px] text-muted-foreground">{formatTimeAgo(order.created_at)}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusTag status={order.status} />
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="text-sm font-medium text-primary hover:underline">
                        <Link href={`/orders/${order.id}`}>
                          {order.first_name || order.last_name
                            ? `${order.first_name ?? ''} ${order.last_name ?? ''}`.trim()
                            : '—'}
                        </Link>
                      </p>
                      {order.order_items && order.order_items.length > 0 && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {order.order_items.length} {order.order_items.length === 1 ? 'товар' : order.order_items.length < 5 ? 'товари' : 'товарів'}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {order.city_name ? (
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        <span className="text-sm">{order.city_name}</span>
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {order.phone ? (
                      <div className="flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        <span className="text-sm font-mono">{order.phone}</span>
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {order.np_ttn ? (
                      <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-xs font-mono text-blue-700 border border-blue-200">
                        <ExternalLink className="h-3 w-3" />
                        {order.np_ttn}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="text-sm font-bold">
                      {Number(order.total_amount).toLocaleString('uk-UA')} ₴
                    </span>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/orders/${order.id}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted hover:text-foreground"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
              {filteredOrders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="h-32 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <ShoppingCart className="h-8 w-8 opacity-40" />
                      <p className="text-sm">
                        {searchQuery ? 'Нічого не знайдено' : 'Замовлень поки немає'}
                      </p>
                      {searchQuery && (
                        <button
                          onClick={() => setSearchQuery('')}
                          className="text-xs text-primary hover:underline"
                        >
                          Очистити пошук
                        </button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {/* Footer with count */}
          {filteredOrders.length > 0 && (
            <div className="border-t border-border bg-muted/20 px-4 py-3 text-xs text-muted-foreground flex items-center justify-between">
              <span>
                Показано {filteredOrders.length} з {orders.length} замовлень
              </span>
              <span>
                Сума: <strong className="text-foreground">{filteredOrders.filter(o => o.status !== 'canceled').reduce((s, o) => s + Number(o.total_amount), 0).toLocaleString('uk-UA')} ₴</strong>
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
