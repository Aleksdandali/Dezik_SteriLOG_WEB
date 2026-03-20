'use client';

import { Fragment, useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { format, isToday, isThisWeek, isThisMonth } from 'date-fns';
import { uk } from 'date-fns/locale';
import {
  Search, ShoppingCart, DollarSign, Clock, Package,
  ChevronDown, Phone, Truck, MapPin,
  Loader2, Copy, Check, Plus, MessageSquare, User, ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  updateOrderStatus, addPayment, addComment,
} from '@/app/(admin)/orders/[id]/order-actions-server';

/* ═══ Types ═══ */
interface Order {
  id: string; user_id: string; status: string; payment_status: string; source: string;
  order_number: number; total_amount: number; phone: string | null;
  first_name: string | null; last_name: string | null; city_name: string | null;
  warehouse_name: string | null; np_ttn: string | null; np_delivery_cost: number | null;
  notes: string | null; manager_comment: string | null; keycrm_order_id: number | null;
  created_at: string; order_items?: { id: string; product_name: string; quantity: number; price_at_order: number }[];
}

/* ═══ Config ═══ */
const P = '#4b569e';
const STATUSES: Record<string, { label: string; bg: string; text: string }> = {
  all:        { label: 'Всі',          bg: 'bg-gray-100',     text: 'text-gray-600' },
  pending:    { label: 'Нові',         bg: 'bg-amber-50',     text: 'text-amber-700' },
  confirmed:  { label: 'Підтверджено', bg: 'bg-blue-50',      text: 'text-blue-700' },
  processing: { label: 'В обробці',    bg: 'bg-indigo-50',    text: 'text-indigo-700' },
  shipped:    { label: 'Доставка',     bg: 'bg-violet-50',    text: 'text-violet-700' },
  delivered:  { label: 'Доставлено',   bg: 'bg-emerald-50',   text: 'text-emerald-700' },
  canceled:   { label: 'Скасовано',    bg: 'bg-gray-100',     text: 'text-gray-500' },
};
const TRANSITIONS: Record<string, string[]> = {
  pending: ['confirmed', 'canceled'], confirmed: ['processing', 'canceled'],
  processing: ['shipped', 'canceled'], shipped: ['delivered'], delivered: [], canceled: [],
};
const PAY: Record<string, { label: string; cls: string }> = {
  unpaid:  { label: 'Не оплачено', cls: 'bg-red-50 text-red-700 border-red-200' },
  partial: { label: 'Частково',    cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  paid:    { label: 'Оплачено',    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};
const money = (n: number | string) => Number(n).toLocaleString('uk-UA');
const fmtD = (d: string) => {
  const date = new Date(d);
  return isToday(date) ? `Сьогодні ${format(date, 'HH:mm')}` : format(date, 'dd.MM.yy HH:mm', { locale: uk });
};

/* ═══ Atoms ═══ */
function StatusBadge({ status, size = 'sm' }: { status: string; size?: 'sm' | 'md' }) {
  const c = STATUSES[status] ?? STATUSES.pending;
  return (
    <span className={cn('inline-flex items-center font-semibold rounded-md',
      size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]',
      c.bg, c.text)}>
      {c.label}
    </span>
  );
}
function PayBadge({ status }: { status: string }) {
  const c = PAY[status] ?? PAY.unpaid;
  return <span className={cn('inline-flex px-2 py-0.5 rounded-md border text-[10px] font-semibold', c.cls)}>{c.label}</span>;
}
function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500); }}
      className="h-6 w-6 inline-flex items-center justify-center rounded-md hover:bg-[#eceef5] text-gray-400 hover:text-[#4b569e] transition-colors"
      title="Копіювати">
      {ok ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

/* ═══ Expanded Panel — KeyCRM style, no tabs ═══ */
function OrderPanel({ order }: { order: Order }) {
  const [isPending, startTransition] = useTransition();
  const [showPayForm, setShowPayForm] = useState(false);
  const [comment, setComment] = useState(order.manager_comment ?? '');
  const router = useRouter();

  const act = (fn: () => Promise<void>) => startTransition(async () => { await fn(); router.refresh(); });
  const name = [order.first_name, order.last_name].filter(Boolean).join(' ') || 'Невідомий';
  const itemsSum = order.order_items?.reduce((s, i) => s + i.quantity * Number(i.price_at_order), 0) ?? 0;
  const allowed = TRANSITIONS[order.status] ?? [];

  return (
    <td colSpan={8} className="p-0">
      <div className="border-t-2 border-[#4b569e] bg-white">
        {/* ── Row 1: Three columns — Order | Customer | Delivery ── */}
        <div className="grid grid-cols-[1fr_1fr_1fr] divide-x divide-[#eceef5]">

          {/* COL 1: Order info */}
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
              <span className="text-gray-400">№ замовлення</span>
              <span className="text-gray-800 font-medium">{order.order_number}</span>
              <span className="text-gray-400">Джерело</span>
              <span className="text-[#4b569e] font-medium">{order.source === 'app' ? 'Додаток' : order.source}</span>
              <span className="text-gray-400">Дата створення</span>
              <span className="text-gray-700">{fmtD(order.created_at)}</span>
              <span className="text-gray-400">Статус</span>
              <span><StatusBadge status={order.status} size="md" /></span>
              <span className="text-gray-400">Оплата</span>
              <span><PayBadge status={order.payment_status} /></span>
              {order.keycrm_order_id && <>
                <span className="text-gray-400">KeyCRM</span>
                <span className="text-gray-700 font-mono text-[12px]">#{order.keycrm_order_id}</span>
              </>}
            </div>

            {/* Status actions */}
            {allowed.length > 0 && (
              <div className="flex gap-2 pt-2 border-t border-[#eceef5]">
                {allowed.map(s => (
                  <button key={s} onClick={() => act(() => updateOrderStatus(order.id, s))} disabled={isPending}
                    className={cn('flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[12px] font-medium disabled:opacity-50 transition-colors',
                      s === 'canceled' ? 'border border-gray-200 text-gray-500 hover:bg-gray-50' : 'bg-[#4b569e] text-white hover:bg-[#363f75]')}>
                    {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {STATUSES[s]?.label ?? s}
                  </button>
                ))}
              </div>
            )}

            {/* Comment */}
            <div className="pt-2 border-t border-[#eceef5]">
              <p className="text-[11px] text-gray-400 font-medium mb-1.5">Коментар менеджера</p>
              <textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="+ Додати"
                rows={2}
                className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-[12px] text-gray-700 placeholder:text-gray-300 focus:outline-none focus:border-[#4b569e] focus:bg-white resize-none" />
              {comment !== (order.manager_comment ?? '') && (
                <button onClick={() => act(() => addComment(order.id, comment))} disabled={isPending}
                  className="mt-1 rounded-md bg-[#4b569e] text-white px-3 py-1 text-[11px] font-medium hover:bg-[#363f75] disabled:opacity-50">Зберегти</button>
              )}
            </div>
          </div>

          {/* COL 2: Customer */}
          <div className="p-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-full bg-[#eceef5] flex items-center justify-center text-[14px] font-bold text-[#4b569e] shrink-0">
                {(order.first_name?.[0] ?? '?').toUpperCase()}
              </div>
              <div>
                <p className="text-[14px] font-semibold text-[#4b569e]">{name}</p>
              </div>
            </div>

            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
              <span className="text-gray-400">Телефон</span>
              <span className="flex items-center gap-1">
                {order.phone ? <>
                  <span className="text-gray-800 font-mono text-[12px]">{order.phone}</span>
                  <CopyBtn text={order.phone} />
                </> : <span className="text-gray-300">—</span>}
              </span>
            </div>

            {order.phone && (
              <div className="flex gap-2 mt-4">
                <a href={`tel:${order.phone}`} onClick={e => e.stopPropagation()}
                  className="flex-1 flex items-center justify-center gap-2 rounded-md bg-emerald-500 hover:bg-emerald-600 text-white h-9 text-[12px] font-semibold transition-colors">
                  <Phone className="h-3.5 w-3.5" /> Зателефонувати
                </a>
                <button className="flex-1 flex items-center justify-center gap-2 rounded-md bg-[#4b569e] hover:bg-[#363f75] text-white h-9 text-[12px] font-semibold transition-colors">
                  <MessageSquare className="h-3.5 w-3.5" /> Написати
                </button>
              </div>
            )}

            {order.notes && (
              <div className="mt-4 pt-3 border-t border-[#eceef5]">
                <p className="text-[11px] text-gray-400 font-medium mb-1">Примітки клієнта</p>
                <p className="text-[12px] text-gray-600 bg-gray-50 rounded-md px-3 py-2">{order.notes}</p>
              </div>
            )}
          </div>

          {/* COL 3: Delivery */}
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
              <span className="text-gray-400">Отримувач</span>
              <div>
                <p className="text-gray-800 font-medium">{name}</p>
                {order.phone && <p className="text-[12px] text-gray-400 font-mono">{order.phone}</p>}
              </div>

              <span className="text-gray-400">Адреса</span>
              <div>
                {order.warehouse_name ? (
                  <p className="text-[12px] text-gray-700 leading-relaxed">{order.warehouse_name}</p>
                ) : <p className="text-gray-300 text-[12px]">—</p>}
                {order.city_name && (
                  <p className="text-[11px] text-gray-400 flex items-center gap-1 mt-0.5"><MapPin className="h-3 w-3" />{order.city_name}</p>
                )}
              </div>

              <span className="text-gray-400">Служба</span>
              <span className="flex items-center gap-1.5 text-gray-700">
                <Truck className="h-3.5 w-3.5 text-gray-400" /> Нова Пошта
              </span>

              <span className="text-gray-400">Трекінг</span>
              <span>
                {order.np_ttn ? (
                  <span className="inline-flex items-center gap-1">
                    <span className="font-mono text-[12px] text-gray-800 bg-gray-50 border border-gray-200 rounded px-2 py-0.5">{order.np_ttn}</span>
                    <CopyBtn text={order.np_ttn} />
                    <a href={`https://novaposhta.ua/tracking/?cargo_number=${order.np_ttn}`} target="_blank" rel="noopener"
                      onClick={e => e.stopPropagation()}
                      className="h-6 w-6 inline-flex items-center justify-center rounded-md hover:bg-[#eceef5] text-gray-400 hover:text-[#4b569e]"
                      title="Відстежити">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </span>
                ) : <span className="text-gray-300 text-[12px]">—</span>}
              </span>
            </div>
          </div>
        </div>

        {/* ── Row 2: Products table ── */}
        <div className="border-t border-[#eceef5]">
          <div className="px-4 py-2 bg-gray-50 border-b border-[#eceef5]">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Товари ({order.order_items?.length ?? 0})</span>
          </div>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-gray-400 border-b border-[#eceef5] bg-gray-50/50">
                <th className="px-4 py-2 text-left font-medium">Назва</th>
                <th className="px-4 py-2 text-center font-medium w-20">К-сть</th>
                <th className="px-4 py-2 text-right font-medium w-28">Ціна</th>
                <th className="px-4 py-2 text-right font-medium w-28">Сума</th>
              </tr>
            </thead>
            <tbody>
              {order.order_items?.map((item, i) => (
                <tr key={item.id} className={cn('hover:bg-gray-50/50 transition-colors', i > 0 && 'border-t border-gray-100')}>
                  <td className="px-4 py-2.5 text-gray-800">{item.product_name}</td>
                  <td className="px-4 py-2.5 text-center text-gray-500 tabular-nums">{item.quantity} шт</td>
                  <td className="px-4 py-2.5 text-right text-gray-500 tabular-nums">{money(item.price_at_order)} ₴</td>
                  <td className="px-4 py-2.5 text-right font-medium text-gray-800 tabular-nums">{money(item.quantity * Number(item.price_at_order))} ₴</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Row 3: Payments + Totals ── */}
        <div className="border-t border-[#eceef5] grid grid-cols-[1fr_auto] items-start">
          {/* Payments */}
          <div className="p-4">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Оплати</span>
              <button onClick={() => setShowPayForm(!showPayForm)}
                className="text-[11px] text-[#4b569e] hover:text-[#363f75] font-medium flex items-center gap-1">
                <Plus className="h-3 w-3" /> Додати оплату
              </button>
            </div>
            {showPayForm && (
              <form onSubmit={e => { e.preventDefault(); const fd = new FormData(e.currentTarget);
                act(async () => { await addPayment(order.id, { amount: Number(fd.get('amount')), method: fd.get('method') as string, status: 'paid' }); setShowPayForm(false); }); }}
                className="flex items-center gap-2 mb-3 p-2 bg-gray-50 rounded-md border border-gray-200">
                <input name="amount" type="number" step="0.01" defaultValue={Number(order.total_amount)} required placeholder="Сума"
                  className="w-28 rounded border border-gray-200 px-2 py-1.5 text-[12px] focus:outline-none focus:border-[#4b569e]" />
                <select name="method" className="rounded border border-gray-200 px-2 py-1.5 text-[12px] focus:outline-none focus:border-[#4b569e]">
                  <option value="cash">Готівка</option><option value="card">Картка</option><option value="online">Онлайн</option>
                </select>
                <button type="submit" disabled={isPending}
                  className="rounded-md bg-[#4b569e] text-white px-3 py-1.5 text-[11px] font-medium hover:bg-[#363f75] disabled:opacity-50">
                  {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Зберегти'}
                </button>
                <button type="button" onClick={() => setShowPayForm(false)} className="text-[11px] text-gray-400 hover:text-gray-600">Скасувати</button>
              </form>
            )}
            <p className="text-[12px] text-gray-300">Оплат: 0</p>
          </div>

          {/* Totals */}
          <div className="p-4 border-l border-[#eceef5] min-w-[280px]">
            <div className="space-y-1 text-[13px]">
              <div className="flex justify-between"><span className="text-gray-400">Сума за товари:</span><span className="text-gray-700 tabular-nums font-medium">{money(itemsSum)} ₴</span></div>
              {order.np_delivery_cost && Number(order.np_delivery_cost) > 0 && (
                <div className="flex justify-between"><span className="text-gray-400">Вартість доставки:</span><span className="text-gray-700 tabular-nums">{money(order.np_delivery_cost)} ₴</span></div>
              )}
              <div className="flex justify-between pt-2 mt-2 border-t border-[#eceef5] text-[15px] font-bold">
                <span className="text-gray-800">Загальна вартість:</span>
                <span className="text-gray-900 tabular-nums">{money(order.total_amount)} ₴</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </td>
  );
}

/* ═══ Order Row ═══ */
function OrderRow({ order, isOpen, onToggle }: { order: Order; isOpen: boolean; onToggle: () => void }) {
  const name = [order.first_name, order.last_name].filter(Boolean).join(' ') || '—';
  return (
    <Fragment>
      <tr onClick={onToggle}
        className={cn('group cursor-pointer transition-all duration-100',
          isOpen ? 'bg-[#eceef5]/50 border-l-2 border-l-[#4b569e]' : 'hover:bg-gray-50 border-l-2 border-l-transparent',
          'border-b border-[#eceef5]')}>
        <td className="pl-3 pr-1 py-3">
          <ChevronDown className={cn('h-4 w-4 text-gray-300 transition-transform duration-150 group-hover:text-[#4b569e]', isOpen && 'rotate-180 text-[#4b569e]')} />
        </td>
        <td className="px-2 py-3">
          <span className="text-[13px] text-[#4b569e] font-semibold tabular-nums">{order.order_number}</span>
        </td>
        <td className="px-2 py-3 text-[12px] text-gray-600">{fmtD(order.created_at)}</td>
        <td className="px-2 py-3"><StatusBadge status={order.status} /></td>
        <td className="px-2 py-3">
          <div>
            <p className="text-[13px] text-gray-800 font-medium truncate">{name}</p>
            {order.phone && <p className="text-[11px] text-gray-400 font-mono">{order.phone}</p>}
          </div>
        </td>
        <td className="px-2 py-3">
          {order.np_ttn
            ? <span className="text-[11px] font-mono text-gray-500">{order.np_ttn}</span>
            : <span className="text-[11px] text-gray-300">—</span>}
        </td>
        <td className="px-2 py-3"><PayBadge status={order.payment_status} /></td>
        <td className="px-3 py-3 text-right">
          <span className="text-[14px] font-bold text-gray-900 tabular-nums">{money(order.total_amount)} ₴</span>
        </td>
      </tr>
      {isOpen && <tr><OrderPanel order={order} /></tr>}
    </Fragment>
  );
}

/* ═══ Metric ═══ */
function Metric({ label, value, sub, icon: Icon }: { label: string; value: string | number; sub: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex items-center gap-3.5 rounded-xl border border-gray-200 bg-white px-4 py-3.5 shadow-sm">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#eceef5] text-[#4b569e]">
        <Icon className="h-[18px] w-[18px]" />
      </div>
      <div>
        <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">{label}</p>
        <p className="text-[20px] font-semibold text-gray-900 tabular-nums leading-tight">{value}</p>
        <p className="text-[11px] text-gray-400 tabular-nums">{sub}</p>
      </div>
    </div>
  );
}

/* ═══ Main ═══ */
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
        o.phone?.includes(q) || o.np_ttn?.includes(q) || o.city_name?.toLowerCase().includes(q) ||
        String(o.order_number).includes(q)
      );
    }
    return r;
  }, [orders, activeStatus, searchQuery]);

  const rev = (arr: Order[]) => arr.filter(o => o.status !== 'canceled').reduce((s, o) => s + Number(o.total_amount), 0);
  const today = orders.filter(o => isToday(new Date(o.created_at)));
  const week = orders.filter(o => isThisWeek(new Date(o.created_at), { weekStartsOn: 1 }));
  const month = orders.filter(o => isThisMonth(new Date(o.created_at)));

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-[22px] font-semibold text-gray-900 tracking-tight">Замовлення</h1>
        <p className="text-[13px] text-gray-400 mt-0.5">Керування замовленнями</p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-4 gap-3">
        <Metric label="Сьогодні" value={today.length} sub={`${money(rev(today))} грн`} icon={Clock} />
        <Metric label="Цей тиждень" value={week.length} sub={`${money(rev(week))} грн`} icon={ShoppingCart} />
        <Metric label="Цей місяць" value={month.length} sub={`${money(rev(month))} грн`} icon={Package} />
        <Metric label="Виручка" value={`${money(rev(orders))} ₴`} sub={`${orders.length} замовлень`} icon={DollarSign} />
      </div>

      {/* Filters + Search */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-1">
          {Object.entries(STATUSES).map(([key, c]) => {
            const on = activeStatus === key;
            const count = counts[key] ?? 0;
            return (
              <button key={key} onClick={() => setActiveStatus(key)}
                className={cn('inline-flex items-center gap-1.5 rounded-lg px-3 py-[7px] text-[12px] font-medium transition-all',
                  on ? 'bg-[#4b569e] text-white shadow-sm' : 'text-gray-500 hover:bg-[#eceef5] hover:text-[#363f75]')}>
                {key !== 'all' && <span className={cn('h-[6px] w-[6px] rounded-full', on ? 'bg-white/70' : c.bg.replace('bg-', 'bg-').replace('-50', '-400'))} />}
                {c.label}
                <span className={cn('text-[10px] tabular-nums ml-0.5', on ? 'text-white/50' : 'text-gray-300')}>{count}</span>
              </button>
            );
          })}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-[14px] w-[14px] text-gray-400" />
          <input type="text" placeholder="Пошук за ім'ям, телефоном, ТТН..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            className="w-72 rounded-lg border border-gray-200 bg-white pl-9 pr-3 py-[7px] text-[13px] text-gray-700 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-[#4b569e]/20 focus:border-[#4b569e] transition-all" />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <table className="w-full">
          <colgroup>
            <col className="w-10" />
            <col className="w-16" />
            <col className="w-[150px]" />
            <col className="w-[130px]" />
            <col />
            <col className="w-[160px]" />
            <col className="w-[110px]" />
            <col className="w-[110px]" />
          </colgroup>
          <thead>
            <tr className="border-b border-gray-200 bg-[#eceef5]/40 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#4b569e]/60">
              <th className="pl-3 py-2.5"></th>
              <th className="px-2 py-2.5 text-left">№</th>
              <th className="px-2 py-2.5 text-left">Дата</th>
              <th className="px-2 py-2.5 text-left">Статус</th>
              <th className="px-2 py-2.5 text-left">Покупець</th>
              <th className="px-2 py-2.5 text-left">Трекінг</th>
              <th className="px-2 py-2.5 text-left">Оплата</th>
              <th className="px-3 py-2.5 text-right">Сума</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(order => (
              <OrderRow key={order.id} order={order} isOpen={expandedId === order.id}
                onToggle={() => setExpandedId(expandedId === order.id ? null : order.id)} />
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="py-20 text-center">
                <ShoppingCart className="h-8 w-8 text-gray-200 mx-auto mb-3" />
                <p className="text-[14px] text-gray-400">{searchQuery ? 'Нічого не знайдено' : 'Замовлень поки немає'}</p>
              </td></tr>
            )}
          </tbody>
        </table>
        {filtered.length > 0 && (
          <div className="border-t border-gray-200 bg-gray-50 px-5 py-2.5 flex justify-between text-[12px] text-gray-400">
            <span>Показано {filtered.length} з {orders.length}</span>
            <span>Сума: <span className="font-semibold text-gray-700">{money(rev(filtered))} ₴</span></span>
          </div>
        )}
      </div>
    </div>
  );
}
