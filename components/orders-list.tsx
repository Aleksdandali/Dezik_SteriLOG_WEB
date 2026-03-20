'use client';

import { Fragment, useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { format, isToday, isThisWeek, isThisMonth } from 'date-fns';
import { uk } from 'date-fns/locale';
import {
  Search, ShoppingCart, DollarSign, Clock, Package,
  ChevronRight, Phone, Truck, MapPin,
  CheckCircle, XCircle, Loader2, Copy, Check, Hash,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { updateOrderStatus } from '@/app/(admin)/orders/[id]/order-actions-server';

/* ════════════════════ Types ════════════════════ */

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

/* ════════════════════ Helpers ════════════════════ */

const STATUSES: Record<string, { label: string; dot: string }> = {
  all:        { label: 'Всі',          dot: 'bg-[#94a3b8]' },
  pending:    { label: 'Нові',         dot: 'bg-[#f59e0b]' },
  confirmed:  { label: 'Підтверджені', dot: 'bg-[#3b82f6]' },
  processing: { label: 'В обробці',    dot: 'bg-[#6366f1]' },
  shipped:    { label: 'Доставка',     dot: 'bg-[#8b5cf6]' },
  delivered:  { label: 'Доставлено',   dot: 'bg-[#10b981]' },
  canceled:   { label: 'Скасовані',    dot: 'bg-[#94a3b8]' },
};

const money = (n: number | string) => Number(n).toLocaleString('uk-UA');

const STATUS_FLOW: { value: string; label: string }[] = [
  { value: 'pending',    label: 'Нове' },
  { value: 'confirmed',  label: 'Підтверджено' },
  { value: 'processing', label: 'В обробці' },
  { value: 'shipped',    label: 'Відправлено' },
  { value: 'delivered',  label: 'Доставлено' },
  { value: 'canceled',   label: 'Скасовано' },
];

const TRANSITIONS: Record<string, string[]> = {
  pending:    ['confirmed', 'canceled'],
  confirmed:  ['processing', 'canceled'],
  processing: ['shipped', 'canceled'],
  shipped:    ['delivered'],
  delivered:  [],
  canceled:   [],
};

function StatusChanger({ status, isPending, onChangeStatus }: {
  status: string; isPending: boolean; onChangeStatus: (s: string) => void;
}) {
  const allowed = TRANSITIONS[status] ?? [];
  if (allowed.length === 0) return null;

  return (
    <div className="mt-4 space-y-2">
      <p className="text-[11px] text-[#94a3b8] font-medium">Змінити статус</p>
      <div className="flex flex-wrap gap-1.5">
        {allowed.map(s => {
          const cfg = STATUSES[s];
          const info = STATUS_FLOW.find(f => f.value === s);
          const isCanceled = s === 'canceled';
          return (
            <button
              key={s}
              onClick={() => onChangeStatus(s)}
              disabled={isPending}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg px-3 py-[6px] text-[12px] font-medium transition-all disabled:opacity-50',
                isCanceled
                  ? 'border border-[#e2e8f0] text-[#94a3b8] hover:bg-[#f8fafc] hover:text-[#64748b]'
                  : 'bg-[#0f172a] text-white hover:bg-[#1e293b] shadow-[0_1px_2px_rgba(0,0,0,0.15)]',
              )}
            >
              {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <span className={cn('h-[6px] w-[6px] rounded-full', isCanceled ? 'bg-[#94a3b8]' : cfg?.dot ?? 'bg-white')} />}
              {info?.label ?? s}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function fmtDate(d: string) {
  const date = new Date(d);
  return isToday(date) ? `Сьогодні, ${format(date, 'HH:mm')}` : format(date, 'dd MMM yyyy, HH:mm', { locale: uk });
}

function StatusPill({ status }: { status: string }) {
  const c = STATUSES[status];
  if (!c) return <span className="text-xs text-[#94a3b8]">{status}</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('h-[6px] w-[6px] rounded-full', c.dot)} />
      <span className="text-[13px] text-[#475569]">{c.label}</span>
    </span>
  );
}

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500); }}
      className="ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded hover:bg-[#f1f5f9] text-[#94a3b8] hover:text-[#475569] transition-colors"
    >
      {ok ? <Check className="h-3 w-3 text-[#3b82f6]" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

/* ════════════════════ Metric Card ════════════════════ */

function MetricCard({ label, value, sub, icon: Icon }: { label: string; value: string | number; sub: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex items-center gap-3.5 rounded-xl border border-[#e2e8f0] bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#f8fafc] text-[#64748b]">
        <Icon className="h-[18px] w-[18px]" />
      </div>
      <div>
        <p className="text-[11px] font-medium text-[#94a3b8] uppercase tracking-wide">{label}</p>
        <p className="text-[20px] font-semibold text-[#0f172a] leading-tight tabular-nums">{value}</p>
        <p className="text-[11px] text-[#94a3b8] tabular-nums">{sub}</p>
      </div>
    </div>
  );
}

/* ════════════════════ Order Detail Card ════════════════════ */

function OrderDetailsCard({ order }: { order: Order }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const act = (s: string) => startTransition(async () => { await updateOrderStatus(order.id, s); router.refresh(); });

  const name = [order.first_name, order.last_name].filter(Boolean).join(' ') || 'Невідомий';
  const itemsSum = order.order_items?.reduce((s, i) => s + i.quantity * Number(i.price_at_order), 0) ?? 0;

  return (
    <td colSpan={7} className="p-0">
      <div className="bg-[#f8fafc] px-5 pt-4 pb-5 border-t border-[#e2e8f0]">
        {/* Info cards row */}
        <div className="grid grid-cols-3 gap-3">

          {/* Card: Order */}
          <div className="rounded-lg border border-[#e2e8f0] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <div className="flex items-center gap-2 mb-3">
              <Hash className="h-3.5 w-3.5 text-[#94a3b8]" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#94a3b8]">Замовлення</span>
            </div>
            <dl className="space-y-2 text-[13px]">
              <div className="flex justify-between">
                <dt className="text-[#94a3b8]">Номер</dt>
                <dd className="font-mono text-[12px] text-[#475569]">{order.id.slice(0, 8)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#94a3b8]">Дата</dt>
                <dd className="text-[#475569]">{fmtDate(order.created_at)}</dd>
              </div>
              <div className="flex justify-between items-center">
                <dt className="text-[#94a3b8]">Статус</dt>
                <dd><StatusPill status={order.status} /></dd>
              </div>
              {order.keycrm_order_id && (
                <div className="flex justify-between">
                  <dt className="text-[#94a3b8]">KeyCRM</dt>
                  <dd className="font-mono text-[12px] text-[#475569]">#{order.keycrm_order_id}</dd>
                </div>
              )}
            </dl>
            {order.notes && (
              <p className="mt-3 rounded-md bg-[#f8fafc] border border-[#e2e8f0] px-3 py-2 text-[12px] text-[#64748b] leading-relaxed">{order.notes}</p>
            )}
            <StatusChanger status={order.status} isPending={isPending} onChangeStatus={act} />
          </div>

          {/* Card: Client */}
          <div className="rounded-lg border border-[#e2e8f0] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <div className="flex items-center gap-2 mb-3">
              <Phone className="h-3.5 w-3.5 text-[#94a3b8]" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#94a3b8]">Покупець</span>
            </div>
            <div className="flex items-center gap-3 mb-4">
              <div className="h-9 w-9 rounded-full bg-gradient-to-br from-[#e2e8f0] to-[#cbd5e1] flex items-center justify-center text-[13px] font-semibold text-[#475569] flex-shrink-0">
                {(order.first_name?.[0] ?? '?').toUpperCase()}
              </div>
              <div>
                <p className="text-[14px] font-medium text-[#0f172a]">{name}</p>
              </div>
            </div>
            <dl className="space-y-2 text-[13px]">
              <div className="flex items-center justify-between">
                <dt className="text-[#94a3b8]">Телефон</dt>
                <dd className="flex items-center">
                  {order.phone ? (
                    <>
                      <span className="font-mono text-[12px] text-[#475569]">{order.phone}</span>
                      <CopyBtn text={order.phone} />
                    </>
                  ) : <span className="text-[#cbd5e1]">—</span>}
                </dd>
              </div>
            </dl>
            {order.phone && (
              <a href={`tel:${order.phone}`} onClick={e => e.stopPropagation()}
                className="mt-4 flex items-center justify-center gap-1.5 rounded-lg border border-[#e2e8f0] bg-white h-8 text-[12px] font-medium text-[#475569] hover:bg-[#f8fafc] transition-colors">
                <Phone className="h-3.5 w-3.5" /> Зателефонувати
              </a>
            )}
          </div>

          {/* Card: Delivery */}
          <div className="rounded-lg border border-[#e2e8f0] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <div className="flex items-center gap-2 mb-3">
              <Truck className="h-3.5 w-3.5 text-[#94a3b8]" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#94a3b8]">Доставка</span>
            </div>
            <dl className="space-y-3 text-[13px]">
              <div>
                <dt className="text-[11px] text-[#94a3b8] mb-0.5">Отримувач</dt>
                <dd className="text-[#0f172a] font-medium">{name}</dd>
                {order.phone && <dd className="text-[12px] font-mono text-[#94a3b8]">{order.phone}</dd>}
              </div>
              <div className="h-px bg-[#f1f5f9]" />
              <div>
                <dt className="text-[11px] text-[#94a3b8] mb-0.5">Адреса</dt>
                {order.warehouse_name ? (
                  <dd className="text-[12px] text-[#475569] leading-relaxed">{order.warehouse_name}</dd>
                ) : <dd className="text-[#cbd5e1] text-[12px]">Не вказано</dd>}
                {order.city_name && (
                  <dd className="flex items-center gap-1 text-[12px] text-[#94a3b8] mt-0.5">
                    <MapPin className="h-3 w-3" />{order.city_name}
                  </dd>
                )}
              </div>
              <div>
                <dt className="text-[11px] text-[#94a3b8] mb-0.5">Трекінг</dt>
                {order.np_ttn ? (
                  <dd className="flex items-center">
                    <span className="inline-flex items-center rounded-md border border-[#e2e8f0] bg-[#f8fafc] px-2 py-0.5 text-[12px] font-mono text-[#475569]">{order.np_ttn}</span>
                    <CopyBtn text={order.np_ttn} />
                  </dd>
                ) : <dd className="text-[#cbd5e1] text-[12px]">—</dd>}
              </div>
            </dl>
          </div>
        </div>

        {/* Products */}
        {order.order_items && order.order_items.length > 0 && (
          <div className="mt-3 rounded-lg border border-[#e2e8f0] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="px-4 py-2.5 border-b border-[#f1f5f9]">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#94a3b8]">Товари ({order.order_items.length})</span>
            </div>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-[#94a3b8] border-b border-[#f1f5f9]">
                  <th className="px-4 py-2 text-left font-medium">Назва</th>
                  <th className="px-4 py-2 text-center font-medium w-16">К-сть</th>
                  <th className="px-4 py-2 text-right font-medium w-24">Ціна</th>
                  <th className="px-4 py-2 text-right font-medium w-28">Сума</th>
                </tr>
              </thead>
              <tbody>
                {order.order_items.map((item, i) => (
                  <tr key={item.id} className={cn(i > 0 && 'border-t border-[#f1f5f9]')}>
                    <td className="px-4 py-2.5 text-[#334155]">{item.product_name}</td>
                    <td className="px-4 py-2.5 text-center text-[#64748b] tabular-nums">{item.quantity}</td>
                    <td className="px-4 py-2.5 text-right text-[#64748b] tabular-nums">{money(item.price_at_order)} ₴</td>
                    <td className="px-4 py-2.5 text-right font-medium text-[#334155] tabular-nums">{money(item.quantity * Number(item.price_at_order))} ₴</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t border-[#e2e8f0] bg-[#f8fafc] px-4 py-2.5">
              <div className="flex flex-col items-end gap-0.5 text-[13px] tabular-nums">
                <div className="flex w-56 justify-between">
                  <span className="text-[#94a3b8]">Товари:</span>
                  <span className="text-[#475569]">{money(itemsSum)} ₴</span>
                </div>
                {order.np_delivery_cost && Number(order.np_delivery_cost) > 0 && (
                  <div className="flex w-56 justify-between">
                    <span className="text-[#94a3b8]">Доставка:</span>
                    <span className="text-[#475569]">{money(order.np_delivery_cost)} ₴</span>
                  </div>
                )}
                <div className="flex w-56 justify-between mt-1 pt-1.5 border-t border-[#e2e8f0]">
                  <span className="font-semibold text-[#334155]">Всього:</span>
                  <span className="font-bold text-[#0f172a]">{money(order.total_amount)} ₴</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </td>
  );
}

/* ════════════════════ OrderRow ════════════════════ */

function OrderRow({ order, index, isOpen, onToggle }: { order: Order; index: number; isOpen: boolean; onToggle: () => void }) {
  const name = [order.first_name, order.last_name].filter(Boolean).join(' ') || '—';

  return (
    <Fragment>
      <tr
        onClick={onToggle}
        className={cn(
          'group cursor-pointer transition-colors',
          isOpen ? 'bg-[#f8fafc]' : 'hover:bg-[#f8fafc]/60',
          !isOpen && 'border-b border-[#f1f5f9]',
        )}
      >
        <td className="pl-4 pr-1 py-3 w-8">
          <ChevronRight className={cn('h-4 w-4 text-[#cbd5e1] transition-transform duration-150 group-hover:text-[#94a3b8]', isOpen && 'rotate-90')} />
        </td>
        <td className="px-2 py-3 w-8 text-[12px] text-[#cbd5e1] font-mono tabular-nums">{index}</td>
        <td className="px-3 py-3">
          <span className="text-[13px] font-medium text-[#334155]">{fmtDate(order.created_at)}</span>
        </td>
        <td className="px-3 py-3">
          <StatusPill status={order.status} />
        </td>
        <td className="px-3 py-3">
          <span className="text-[13px] text-[#334155]">{name}</span>
          {order.city_name && <span className="ml-2 text-[12px] text-[#94a3b8]">{order.city_name}</span>}
        </td>
        <td className="px-3 py-3 text-[12px] font-mono text-[#94a3b8]">{order.phone ?? '—'}</td>
        <td className="px-3 py-3 pr-5 text-right">
          <span className="text-[14px] font-semibold text-[#0f172a] tabular-nums">{money(order.total_amount)} ₴</span>
        </td>
      </tr>
      {isOpen && (
        <tr><OrderDetailsCard order={order} /></tr>
      )}
    </Fragment>
  );
}

/* ════════════════════ OrdersList (main) ════════════════════ */

export function OrdersList({ orders }: { orders: Order[] }) {
  const [activeStatus, setActiveStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const counts = useMemo(() => {
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

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Header */}
      <div>
        <h1 className="text-[22px] font-semibold text-[#0f172a] tracking-tight">Замовлення</h1>
        <p className="text-[13px] text-[#94a3b8] mt-0.5">Керування замовленнями з мобільного додатку</p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-4 gap-3">
        <MetricCard label="Сьогодні" value={today.length} sub={`${money(rev(today))} грн`} icon={Clock} />
        <MetricCard label="Цей тиждень" value={week.length} sub={`${money(rev(week))} грн`} icon={ShoppingCart} />
        <MetricCard label="Цей місяць" value={month.length} sub={`${money(rev(month))} грн`} icon={Package} />
        <MetricCard label="Виручка" value={`${money(rev(orders))} ₴`} sub={`${orders.length} замовлень`} icon={DollarSign} />
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-1">
          {Object.entries(STATUSES).map(([key, c]) => {
            const on = activeStatus === key;
            return (
              <button
                key={key}
                onClick={() => setActiveStatus(key)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg px-3 py-[7px] text-[12px] font-medium transition-all',
                  on
                    ? 'bg-[#0f172a] text-white shadow-[0_1px_3px_rgba(0,0,0,0.2)]'
                    : 'text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#334155]'
                )}
              >
                {key !== 'all' && <span className={cn('h-[6px] w-[6px] rounded-full', on ? 'bg-white/70' : c.dot)} />}
                {c.label}
                <span className={cn('text-[10px] tabular-nums', on ? 'text-white/50' : 'text-[#cbd5e1]')}>{counts[key] ?? 0}</span>
              </button>
            );
          })}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-[14px] w-[14px] text-[#94a3b8]" />
          <input
            type="text"
            placeholder="Пошук за ім'ям, телефоном, ТТН..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-64 rounded-lg border border-[#e2e8f0] bg-white pl-9 pr-3 py-[7px] text-[13px] text-[#334155] placeholder:text-[#cbd5e1] focus:outline-none focus:ring-2 focus:ring-[#0f172a]/10 focus:border-[#94a3b8] transition-all"
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-[#e2e8f0] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.06)] overflow-hidden">
        <table className="w-full table-fixed">
          <colgroup>
            <col className="w-9" />
            <col className="w-9" />
            <col className="w-[200px]" />
            <col className="w-[130px]" />
            <col />
            <col className="w-[150px]" />
            <col className="w-[110px]" />
          </colgroup>
          <thead>
            <tr className="border-b border-[#e2e8f0] text-[10px] font-semibold uppercase tracking-[0.08em] text-[#94a3b8]">
              <th className="pl-4 py-3"></th>
              <th className="py-3 text-left">#</th>
              <th className="px-3 py-3 text-left">Дата</th>
              <th className="px-3 py-3 text-left">Статус</th>
              <th className="px-3 py-3 text-left">Клієнт</th>
              <th className="px-3 py-3 text-left">Телефон</th>
              <th className="px-3 py-3 pr-5 text-right">Сума</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((order, idx) => (
              <OrderRow
                key={order.id}
                order={order}
                index={filtered.length - idx}
                isOpen={expandedId === order.id}
                onToggle={() => setExpandedId(expandedId === order.id ? null : order.id)}
              />
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="py-20 text-center">
                  <ShoppingCart className="h-8 w-8 text-[#e2e8f0] mx-auto mb-3" />
                  <p className="text-[14px] text-[#94a3b8]">{searchQuery ? 'Нічого не знайдено' : 'Замовлень поки немає'}</p>
                  {searchQuery && <button onClick={() => setSearchQuery('')} className="mt-1 text-[12px] text-[#64748b] hover:text-[#334155] underline underline-offset-2">Очистити пошук</button>}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {filtered.length > 0 && (
          <div className="border-t border-[#e2e8f0] bg-[#f8fafc] px-5 py-2.5 flex justify-between text-[12px] text-[#94a3b8]">
            <span>Показано {filtered.length} з {orders.length}</span>
            <span>Сума: <span className="font-semibold text-[#334155]">{money(rev(filtered))} ₴</span></span>
          </div>
        )}
      </div>
    </div>
  );
}
