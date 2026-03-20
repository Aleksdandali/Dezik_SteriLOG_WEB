'use client';

import { useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { format, isToday, isThisWeek, isThisMonth } from 'date-fns';
import { uk } from 'date-fns/locale';
import {
  Search, ShoppingCart, DollarSign, Clock, Package,
  ChevronDown, Phone, Truck,
  CheckCircle, XCircle, Loader2, Copy, Check,
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

const STATUSES: Record<string, { label: string; dot: string }> = {
  all:       { label: 'Всі',          dot: 'bg-slate-400' },
  pending:   { label: 'Нові',         dot: 'bg-orange-400' },
  confirmed: { label: 'Підтверджені', dot: 'bg-sky-500' },
  shipped:   { label: 'Доставка',     dot: 'bg-indigo-400' },
  canceled:  { label: 'Скасовані',    dot: 'bg-slate-400' },
};

function StatusTag({ status }: { status: string }) {
  const c = STATUSES[status];
  if (!c) return <span className="text-xs text-slate-400">{status}</span>;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
      <span className={cn('h-1.5 w-1.5 rounded-full flex-shrink-0', c.dot)} />
      {c.label}
    </span>
  );
}

function fmtDate(d: string) {
  const date = new Date(d);
  return isToday(date) ? `Сьогодні ${format(date, 'HH:mm')}` : format(date, 'dd.MM.yyyy HH:mm', { locale: uk });
}

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500); }}
      className="inline-flex h-5 w-5 items-center justify-center rounded text-slate-300 hover:text-slate-500 transition-colors">
      {ok ? <Check className="h-3 w-3 text-sky-500" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-slate-400 text-[13px]">{label}</span>
      <span className="text-slate-700 text-[13px]">{children}</span>
    </div>
  );
}

/* ── Expanded detail ── */
function Detail({ order }: { order: Order }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const act = (s: string) => startTransition(async () => { await updateOrderStatus(order.id, s); router.refresh(); });
  const name = [order.first_name, order.last_name].filter(Boolean).join(' ') || 'Невідомий';
  const itemsSum = order.order_items?.reduce((s, i) => s + i.quantity * Number(i.price_at_order), 0) ?? 0;

  return (
    <td colSpan={7} className="p-0">
      <div className="border-t border-slate-200 bg-slate-50/80 px-6 py-5">
        <div className="grid grid-cols-3 gap-8">
          {/* Order */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-3">Замовлення</p>
            <div className="divide-y divide-slate-100">
              <Row label="№">{order.id.slice(0, 8)}</Row>
              <Row label="Створено">{fmtDate(order.created_at)}</Row>
              <Row label="Статус"><StatusTag status={order.status} /></Row>
              {order.keycrm_order_id && <Row label="KeyCRM">#{order.keycrm_order_id}</Row>}
            </div>
            {order.notes && <p className="mt-2 rounded border border-slate-200 bg-white p-2 text-xs text-slate-500">{order.notes}</p>}
            {order.status === 'pending' && (
              <div className="flex gap-2 mt-4">
                <Button size="sm" onClick={() => act('confirmed')} disabled={isPending} className="flex-1 bg-slate-800 hover:bg-slate-900 text-white text-xs h-8">
                  {isPending ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <CheckCircle className="mr-1.5 h-3 w-3" />}
                  Підтвердити
                </Button>
                <Button size="sm" variant="outline" onClick={() => act('canceled')} disabled={isPending} className="flex-1 text-xs h-8 border-slate-300 text-slate-500 hover:bg-slate-100">
                  <XCircle className="mr-1.5 h-3 w-3" />
                  Скасувати
                </Button>
              </div>
            )}
          </div>

          {/* Client */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-3">Покупець</p>
            <div className="flex items-center gap-2.5 mb-3">
              <div className="h-8 w-8 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center text-xs font-bold flex-shrink-0">
                {(order.first_name?.[0] ?? '?').toUpperCase()}
              </div>
              <span className="font-medium text-sm text-slate-700">{name}</span>
            </div>
            <div className="divide-y divide-slate-100">
              <div className="flex items-center justify-between py-1">
                <span className="text-slate-400 text-[13px]">Телефон</span>
                {order.phone ? (
                  <span className="flex items-center gap-1 text-[13px] font-mono text-slate-700">
                    {order.phone}
                    <CopyBtn text={order.phone} />
                  </span>
                ) : <span className="text-slate-300 text-[13px]">—</span>}
              </div>
            </div>
            {order.phone && (
              <a href={`tel:${order.phone}`} onClick={e => e.stopPropagation()}
                className="mt-3 flex items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white h-8 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                <Phone className="h-3 w-3" /> Зателефонувати
              </a>
            )}
          </div>

          {/* Delivery */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-3">Доставка</p>
            <div className="space-y-2 text-[13px]">
              <div>
                <p className="text-[11px] text-slate-400">Отримувач</p>
                <p className="font-medium text-slate-700">{name}</p>
                {order.phone && <p className="text-xs text-slate-400 font-mono">{order.phone}</p>}
              </div>
              <Separator className="!my-2" />
              <div>
                <p className="text-[11px] text-slate-400">Адреса</p>
                <p className="text-slate-600 text-xs leading-relaxed">{order.warehouse_name || '—'}</p>
                {order.city_name && <p className="text-xs text-slate-400">{order.city_name}</p>}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <Truck className="h-3.5 w-3.5" /> Нова Пошта
              </div>
              <div>
                <p className="text-[11px] text-slate-400">Трекінг</p>
                {order.np_ttn ? (
                  <span className="flex items-center gap-1 mt-0.5">
                    <span className="rounded border border-slate-200 bg-white px-2 py-0.5 text-xs font-mono text-slate-600">{order.np_ttn}</span>
                    <CopyBtn text={order.np_ttn} />
                  </span>
                ) : <p className="text-xs text-slate-300">—</p>}
              </div>
            </div>
          </div>
        </div>

        {/* Products table */}
        {order.order_items && order.order_items.length > 0 && (
          <div className="mt-5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">Товари ({order.order_items.length})</p>
            <table className="w-full text-[13px] border border-slate-200 rounded-md overflow-hidden">
              <thead>
                <tr className="bg-slate-100/80 text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-200">
                  <th className="px-4 py-2 text-left font-medium">Назва</th>
                  <th className="px-4 py-2 text-center font-medium w-16">К-сть</th>
                  <th className="px-4 py-2 text-right font-medium w-24">Ціна</th>
                  <th className="px-4 py-2 text-right font-medium w-24">Сума</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {order.order_items.map((item, i) => (
                  <tr key={item.id} className={cn(i > 0 && 'border-t border-slate-100')}>
                    <td className="px-4 py-2 text-slate-700">{item.product_name}</td>
                    <td className="px-4 py-2 text-center text-slate-500">{item.quantity}</td>
                    <td className="px-4 py-2 text-right text-slate-500">{Number(item.price_at_order).toLocaleString('uk-UA')} ₴</td>
                    <td className="px-4 py-2 text-right font-medium text-slate-700">{(item.quantity * Number(item.price_at_order)).toLocaleString('uk-UA')} ₴</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-slate-200 bg-slate-50/80 text-[13px]">
                <tr>
                  <td colSpan={3} className="px-4 py-1.5 text-right text-slate-400">Сума за товари:</td>
                  <td className="px-4 py-1.5 text-right font-medium text-slate-700">{itemsSum.toLocaleString('uk-UA')} ₴</td>
                </tr>
                {order.np_delivery_cost && Number(order.np_delivery_cost) > 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-1.5 text-right text-slate-400">Доставка:</td>
                    <td className="px-4 py-1.5 text-right text-slate-600">{Number(order.np_delivery_cost).toLocaleString('uk-UA')} ₴</td>
                  </tr>
                )}
                <tr className="border-t border-slate-200">
                  <td colSpan={3} className="px-4 py-2 text-right font-semibold text-slate-700">Загальна вартість:</td>
                  <td className="px-4 py-2 text-right font-bold text-slate-900">{Number(order.total_amount).toLocaleString('uk-UA')} ₴</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </td>
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

  const rev = (arr: Order[]) => arr.filter(o => o.status !== 'canceled').reduce((s, o) => s + Number(o.total_amount), 0);
  const today = orders.filter(o => isToday(new Date(o.created_at)));
  const week = orders.filter(o => isThisWeek(new Date(o.created_at), { weekStartsOn: 1 }));
  const month = orders.filter(o => isThisMonth(new Date(o.created_at)));

  const stats = [
    { label: 'Сьогодні', val: today.length, sub: `${rev(today).toLocaleString('uk-UA')} грн`, icon: Clock },
    { label: 'Цей тиждень', val: week.length, sub: `${rev(week).toLocaleString('uk-UA')} грн`, icon: ShoppingCart },
    { label: 'Цей місяць', val: month.length, sub: `${rev(month).toLocaleString('uk-UA')} грн`, icon: Package },
    { label: 'Виручка', val: `${rev(orders).toLocaleString('uk-UA')} ₴`, sub: `${orders.length} замовлень`, icon: DollarSign },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">Замовлення</h1>
        <p className="text-sm text-slate-400">Керування замовленнями з мобільного додатку</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {stats.map(s => (
          <div key={s.label} className="rounded-lg border border-slate-200 bg-white px-4 py-3 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 flex-shrink-0">
              <s.icon className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[11px] text-slate-400">{s.label}</p>
              <p className="text-lg font-bold text-slate-800 leading-tight">{s.val}</p>
              <p className="text-[11px] text-slate-400">{s.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters + Search */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {Object.entries(STATUSES).map(([key, c]) => {
            const count = statusCounts[key] ?? 0;
            const on = activeStatus === key;
            return (
              <button key={key} onClick={() => setActiveStatus(key)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium border transition-colors',
                  on ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                )}>
                {key !== 'all' && <span className={cn('h-1.5 w-1.5 rounded-full', on ? 'bg-white' : c.dot)} />}
                {c.label}
                <span className={cn('text-[10px]', on ? 'text-slate-400' : 'text-slate-300')}>{count}</span>
              </button>
            );
          })}
        </div>
        <div className="relative w-56">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input type="text" placeholder="Пошук..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            className="w-full rounded-md border border-slate-200 bg-white pl-8 pr-3 py-1.5 text-sm text-slate-700 placeholder:text-slate-300 focus:outline-none focus:border-slate-400" />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <table className="w-full table-fixed">
          <colgroup>
            <col className="w-10" />  {/* chevron */}
            <col className="w-10" />  {/* # */}
            <col className="w-[180px]" />  {/* date */}
            <col className="w-[120px]" />  {/* status */}
            <col />  {/* client — flex */}
            <col className="w-[140px]" />  {/* phone */}
            <col className="w-[100px]" />  {/* amount */}
          </colgroup>
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              <th className="px-3 py-2.5"></th>
              <th className="px-1 py-2.5 text-left">#</th>
              <th className="px-3 py-2.5 text-left">Дата</th>
              <th className="px-3 py-2.5 text-left">Статус</th>
              <th className="px-3 py-2.5 text-left">Клієнт</th>
              <th className="px-3 py-2.5 text-left">Телефон</th>
              <th className="px-3 py-2.5 text-right">Сума</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((order, idx) => {
              const open = expandedId === order.id;
              const name = [order.first_name, order.last_name].filter(Boolean).join(' ') || '—';
              return (
                <Fragment key={order.id}>
                  <tr
                    onClick={() => setExpandedId(open ? null : order.id)}
                    className={cn(
                      'border-b border-slate-100 cursor-pointer transition-colors',
                      open ? 'bg-slate-50' : 'hover:bg-slate-50/60',
                    )}
                  >
                    <td className="px-3 py-3 text-center">
                      <ChevronDown className={cn('h-4 w-4 text-slate-400 transition-transform mx-auto', open && 'rotate-180')} />
                    </td>
                    <td className="px-1 py-3 text-xs text-slate-400 font-mono">{filtered.length - idx}</td>
                    <td className="px-3 py-3 text-sm text-slate-700 font-medium">{fmtDate(order.created_at)}</td>
                    <td className="px-3 py-3"><StatusTag status={order.status} /></td>
                    <td className="px-3 py-3 text-sm text-slate-700 truncate">{name}</td>
                    <td className="px-3 py-3 text-xs font-mono text-slate-400 truncate">{order.phone ?? '—'}</td>
                    <td className="px-3 py-3 text-sm font-semibold text-slate-800 text-right">{Number(order.total_amount).toLocaleString('uk-UA')} ₴</td>
                  </tr>
                  {open && (
                    <tr>
                      <Detail order={order} />
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="py-16 text-center">
                  <ShoppingCart className="h-8 w-8 text-slate-200 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">{searchQuery ? 'Нічого не знайдено' : 'Замовлень поки немає'}</p>
                  {searchQuery && <button onClick={() => setSearchQuery('')} className="text-xs text-slate-500 hover:underline mt-1">Очистити</button>}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {filtered.length > 0 && (
          <div className="border-t border-slate-200 bg-slate-50 px-4 py-2 flex justify-between text-xs text-slate-400">
            <span>Показано {filtered.length} з {orders.length}</span>
            <span>Сума: <span className="font-semibold text-slate-600">{rev(filtered).toLocaleString('uk-UA')} ₴</span></span>
          </div>
        )}
      </div>
    </div>
  );
}

import { Fragment } from 'react';
