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
  ChevronDown, Phone, MapPin, Truck,
  Hash, CheckCircle, XCircle, Loader2, Copy, Check,
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

/* ── Muted, sophisticated status palette ── */
const STATUS_CONFIG: Record<string, { label: string; text: string; bg: string; dot: string; border: string }> = {
  all:       { label: 'Всі',           text: 'text-slate-600', bg: 'bg-slate-50',   dot: 'bg-slate-400',  border: 'border-slate-200' },
  pending:   { label: 'Нові',          text: 'text-orange-600', bg: 'bg-orange-50', dot: 'bg-orange-400', border: 'border-orange-200' },
  confirmed: { label: 'Підтверджені',  text: 'text-sky-700',   bg: 'bg-sky-50',     dot: 'bg-sky-500',    border: 'border-sky-200' },
  shipped:   { label: 'Доставка',      text: 'text-indigo-600', bg: 'bg-indigo-50', dot: 'bg-indigo-400', border: 'border-indigo-200' },
  canceled:  { label: 'Скасовані',     text: 'text-slate-500', bg: 'bg-slate-50',   dot: 'bg-slate-400',  border: 'border-slate-200' },
};

function StatusDot({ status }: { status: string }) {
  const c = STATUS_CONFIG[status];
  return <span className={cn('inline-block h-1.5 w-1.5 rounded-full', c?.dot ?? 'bg-slate-400')} />;
}

function StatusTag({ status }: { status: string }) {
  const c = STATUS_CONFIG[status];
  if (!c) return <Badge variant="outline">{status}</Badge>;
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium border', c.bg, c.text, c.border)}>
      <StatusDot status={status} />
      {c.label}
    </span>
  );
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  if (isToday(date)) return `Сьогодні ${format(date, 'HH:mm')}`;
  return format(date, 'dd.MM.yyyy HH:mm', { locale: uk });
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="inline-flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
    >
      {copied ? <Check className="h-3 w-3 text-sky-600" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

/* ── Expanded detail ── */
function OrderDetail({ order }: { order: Order }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const update = (s: string) => startTransition(async () => { await updateOrderStatus(order.id, s); router.refresh(); });

  const name = [order.first_name, order.last_name].filter(Boolean).join(' ') || 'Невідомий';
  const itemsTotal = order.order_items?.reduce((s, i) => s + i.quantity * Number(i.price_at_order), 0) ?? 0;

  return (
    <div className="border-t border-slate-200 bg-slate-50/70 px-6 py-5 animate-in fade-in duration-150">
      {/* 3-column grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* Col 1: Order info */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-3">Замовлення</p>
          <div className="space-y-2 text-[13px]">
            <Row label="№ замовлення" value={<span className="font-mono text-xs text-slate-500">{order.id.slice(0, 8)}</span>} />
            <Row label="Створено" value={formatDate(order.created_at)} />
            <Row label="Статус" value={<StatusTag status={order.status} />} />
            {order.keycrm_order_id && <Row label="KeyCRM" value={<span className="font-mono text-xs">#{order.keycrm_order_id}</span>} />}
          </div>
          {order.notes && (
            <div className="mt-3 rounded-md border border-slate-200 bg-white p-2.5 text-xs text-slate-600">{order.notes}</div>
          )}
          {order.status === 'pending' && (
            <div className="flex gap-2 mt-4">
              <Button size="sm" onClick={() => update('confirmed')} disabled={isPending} className="flex-1 bg-slate-800 hover:bg-slate-900 text-white text-xs h-8">
                {isPending ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <CheckCircle className="mr-1.5 h-3 w-3" />}
                Підтвердити
              </Button>
              <Button size="sm" variant="outline" onClick={() => update('canceled')} disabled={isPending} className="flex-1 text-xs h-8 border-slate-300 text-slate-600 hover:bg-slate-100">
                <XCircle className="mr-1.5 h-3 w-3" />
                Скасувати
              </Button>
            </div>
          )}
        </div>

        {/* Col 2: Client */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-3">Покупець</p>
          <div className="flex items-center gap-2.5 mb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-slate-600 text-xs font-bold">
              {(order.first_name?.[0] ?? '?').toUpperCase()}
            </div>
            <span className="font-medium text-sm text-slate-800">{name}</span>
          </div>
          <div className="space-y-2 text-[13px]">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Телефон</span>
              {order.phone ? (
                <span className="flex items-center gap-1">
                  <span className="font-mono text-xs">{order.phone}</span>
                  <CopyBtn text={order.phone} />
                </span>
              ) : <span className="text-slate-300">—</span>}
            </div>
          </div>
          {order.phone && (
            <a
              href={`tel:${order.phone}`}
              onClick={(e) => e.stopPropagation()}
              className="mt-4 flex items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Phone className="h-3 w-3" />
              Зателефонувати
            </a>
          )}
        </div>

        {/* Col 3: Delivery */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-3">Доставка</p>
          <div className="space-y-3 text-[13px]">
            <div>
              <span className="text-[11px] text-slate-400">Отримувач</span>
              <p className="font-medium text-sm text-slate-800">{name}</p>
              {order.phone && <p className="text-xs text-slate-500 font-mono">{order.phone}</p>}
            </div>
            <Separator className="bg-slate-200" />
            <div>
              <span className="text-[11px] text-slate-400">Адреса доставки</span>
              {order.warehouse_name ? (
                <p className="text-xs text-slate-700 leading-relaxed">{order.warehouse_name}</p>
              ) : <p className="text-xs text-slate-300">—</p>}
              {order.city_name && <p className="text-xs text-slate-400">{order.city_name}</p>}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <Truck className="h-3.5 w-3.5" /> Нова Пошта
            </div>
            <div>
              <span className="text-[11px] text-slate-400">Трекінг код</span>
              {order.np_ttn ? (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="rounded border border-slate-200 bg-white px-2 py-0.5 text-xs font-mono text-slate-600">{order.np_ttn}</span>
                  <CopyBtn text={order.np_ttn} />
                </div>
              ) : <p className="text-xs text-slate-300">—</p>}
            </div>
          </div>
        </div>
      </div>

      {/* Products */}
      {order.order_items && order.order_items.length > 0 && (
        <div className="mt-5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">
            Товари ({order.order_items.length})
          </p>
          <div className="rounded-md border border-slate-200 bg-white overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] uppercase tracking-wider text-slate-400">
                  <th className="px-4 py-2 text-left font-medium">Назва</th>
                  <th className="px-4 py-2 text-center font-medium w-20">К-сть</th>
                  <th className="px-4 py-2 text-right font-medium w-24">Ціна</th>
                  <th className="px-4 py-2 text-right font-medium w-24">Сума</th>
                </tr>
              </thead>
              <tbody>
                {order.order_items.map((item, i) => (
                  <tr key={item.id} className={cn(i > 0 && 'border-t border-slate-100')}>
                    <td className="px-4 py-2.5 text-slate-700">{item.product_name}</td>
                    <td className="px-4 py-2.5 text-center text-slate-500">{item.quantity}</td>
                    <td className="px-4 py-2.5 text-right text-slate-500">{Number(item.price_at_order).toLocaleString('uk-UA')} ₴</td>
                    <td className="px-4 py-2.5 text-right font-medium text-slate-700">{(item.quantity * Number(item.price_at_order)).toLocaleString('uk-UA')} ₴</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-2.5 text-[13px]">
              <div className="flex flex-col items-end gap-0.5">
                <div className="flex gap-6">
                  <span className="text-slate-400">Сума за товари:</span>
                  <span className="font-medium text-slate-700 w-24 text-right">{itemsTotal.toLocaleString('uk-UA')} ₴</span>
                </div>
                {order.np_delivery_cost && Number(order.np_delivery_cost) > 0 && (
                  <div className="flex gap-6">
                    <span className="text-slate-400">Доставка:</span>
                    <span className="text-slate-600 w-24 text-right">{Number(order.np_delivery_cost).toLocaleString('uk-UA')} ₴</span>
                  </div>
                )}
                <div className="flex gap-6 mt-1 pt-1 border-t border-slate-100">
                  <span className="font-semibold text-slate-700">Загальна вартість:</span>
                  <span className="font-bold text-slate-900 w-24 text-right">{Number(order.total_amount).toLocaleString('uk-UA')} ₴</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-400">{label}</span>
      <span className="text-slate-700">{value}</span>
    </div>
  );
}

/* ── Main ── */
export function OrdersList({ orders }: { orders: Order[] }) {
  const [activeStatus, setActiveStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = { all: orders.length };
    orders.forEach(o => { c[o.status] = (c[o.status] || 0) + 1; });
    return c;
  }, [orders]);

  const filtered = useMemo(() => {
    let r = orders;
    if (activeStatus !== 'all') r = r.filter(o => o.status === activeStatus);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      r = r.filter(o =>
        o.first_name?.toLowerCase().includes(q) || o.last_name?.toLowerCase().includes(q) ||
        o.phone?.includes(q) || o.np_ttn?.includes(q) || o.city_name?.toLowerCase().includes(q) || o.id.includes(q)
      );
    }
    return r;
  }, [orders, activeStatus, searchQuery]);

  const today = orders.filter(o => isToday(new Date(o.created_at)));
  const week = orders.filter(o => isThisWeek(new Date(o.created_at), { weekStartsOn: 1 }));
  const month = orders.filter(o => isThisMonth(new Date(o.created_at)));
  const rev = (arr: Order[]) => arr.filter(o => o.status !== 'canceled').reduce((s, o) => s + Number(o.total_amount), 0);

  const stats = [
    { label: 'Сьогодні', value: today.length, sub: `${rev(today).toLocaleString('uk-UA')} грн`, icon: Clock, accent: 'text-slate-600 bg-slate-100' },
    { label: 'Цей тиждень', value: week.length, sub: `${rev(week).toLocaleString('uk-UA')} грн`, icon: ShoppingCart, accent: 'text-slate-600 bg-slate-100' },
    { label: 'Цей місяць', value: month.length, sub: `${rev(month).toLocaleString('uk-UA')} грн`, icon: Package, accent: 'text-slate-600 bg-slate-100' },
    { label: 'Загальна виручка', value: `${rev(orders).toLocaleString('uk-UA')} ₴`, sub: `${orders.length} замовлень`, icon: DollarSign, accent: 'text-slate-600 bg-slate-100' },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">Замовлення</h1>
        <p className="text-sm text-slate-400 mt-0.5">Керування замовленнями з мобільного додатку</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border border-slate-200 bg-white p-3.5 flex items-center gap-3">
            <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg', s.accent)}>
              <s.icon className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[11px] text-slate-400 font-medium">{s.label}</p>
              <p className="text-lg font-bold text-slate-800 leading-tight">{s.value}</p>
              <p className="text-[11px] text-slate-400">{s.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(STATUS_CONFIG).map(([key, c]) => {
            const count = statusCounts[key] ?? 0;
            const active = activeStatus === key;
            return (
              <button
                key={key}
                onClick={() => setActiveStatus(key)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all border',
                  active ? cn(c.bg, c.text, c.border) : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300 hover:text-slate-500'
                )}
              >
                {key !== 'all' && <StatusDot status={key} />}
                {c.label}
                <span className={cn('text-[10px] font-semibold', active ? 'text-current' : 'text-slate-300')}>{count}</span>
              </button>
            );
          })}
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Пошук..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-md border border-slate-200 bg-white pl-8 pr-3 py-1.5 text-sm text-slate-700 placeholder:text-slate-300 focus:outline-none focus:border-slate-400 transition-colors"
          />
        </div>
      </div>

      {/* Orders */}
      <div className="space-y-2">
        {filtered.map((order, idx) => {
          const isOpen = expandedId === order.id;
          const name = [order.first_name, order.last_name].filter(Boolean).join(' ') || '—';

          return (
            <div
              key={order.id}
              className={cn(
                'rounded-lg border bg-white overflow-hidden transition-all',
                isOpen ? 'border-slate-300 shadow-sm' : 'border-slate-200 hover:border-slate-300'
              )}
            >
              {/* Row */}
              <div
                onClick={() => setExpandedId(isOpen ? null : order.id)}
                className={cn(
                  'grid grid-cols-[32px_32px_1fr_100px_1fr_1fr_120px_90px] items-center gap-2 px-4 py-3 cursor-pointer transition-colors',
                  isOpen ? 'bg-slate-50' : 'hover:bg-slate-50/50'
                )}
              >
                <ChevronDown className={cn('h-4 w-4 text-slate-400 transition-transform', isOpen && 'rotate-180')} />
                <span className="text-xs text-slate-400 font-mono">{filtered.length - idx}</span>
                <span className="text-sm font-medium text-slate-700">{formatDate(order.created_at)}</span>
                <StatusTag status={order.status} />
                <span className="text-sm text-slate-700 truncate">{name}</span>
                <span className="text-xs font-mono text-slate-400 truncate">{order.phone ?? '—'}</span>
                <span className="text-xs font-mono text-slate-400 truncate">
                  {order.np_ttn ? order.np_ttn : '—'}
                </span>
                <span className="text-sm font-semibold text-slate-800 text-right">
                  {Number(order.total_amount).toLocaleString('uk-UA')} ₴
                </span>
              </div>

              {/* Expanded */}
              {isOpen && <OrderDetail order={order} />}
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="rounded-lg border border-slate-200 bg-white flex flex-col items-center gap-2 py-16 text-slate-400">
            <ShoppingCart className="h-8 w-8 opacity-30" />
            <p className="text-sm">{searchQuery ? 'Нічого не знайдено' : 'Замовлень поки немає'}</p>
            {searchQuery && <button onClick={() => setSearchQuery('')} className="text-xs text-slate-500 hover:underline">Очистити</button>}
          </div>
        )}
      </div>

      {/* Footer */}
      {filtered.length > 0 && (
        <div className="flex items-center justify-between text-xs text-slate-400 px-1">
          <span>Показано {filtered.length} з {orders.length}</span>
          <span>Сума: <span className="font-semibold text-slate-600">{rev(filtered).toLocaleString('uk-UA')} ₴</span></span>
        </div>
      )}
    </div>
  );
}
