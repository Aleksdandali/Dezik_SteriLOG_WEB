'use client';

import { useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { format, isToday, isThisWeek, isThisMonth } from 'date-fns';
import { uk } from 'date-fns/locale';
import {
  Search, ShoppingCart, DollarSign, Clock, Package,
  ChevronDown, Phone, MapPin,
  Loader2, Copy, Check, Plus, MessageSquare, ExternalLink, Printer,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  updateOrderStatus, addPayment, addExpense, addComment, updatePaymentStatus,
} from '@/app/(admin)/orders/[id]/order-actions-server';

interface Payment {
  id: string; amount: number; method: string; status: string;
  comment: string | null; paid_at: string | null; created_at: string;
}
interface Expense {
  id: string; name: string; amount: number; comment: string | null; created_at: string;
}
interface Order {
  id: string; user_id: string; status: string; payment_status: string; source: string;
  order_number: number; total_amount: number; phone: string | null;
  first_name: string | null; last_name: string | null; city_name: string | null;
  warehouse_name: string | null; np_ttn: string | null; np_delivery_cost: number | null;
  notes: string | null; manager_comment: string | null; keycrm_order_id: number | null;
  created_at: string;
  order_items?: { id: string; product_name: string; quantity: number; price_at_order: number; products?: { image_path: string | null } | null }[];
  payments?: Payment[];
  order_expenses?: Expense[];
}

const STATUSES: Record<string, { label: string; bg: string; text: string }> = {
  all:        { label: 'Всі',          bg: 'bg-gray-100',   text: 'text-gray-600' },
  pending:    { label: 'НОВЕ',         bg: 'bg-amber-100',  text: 'text-amber-800' },
  confirmed:  { label: 'ПІДТВЕРДЖЕНО', bg: 'bg-blue-100',   text: 'text-blue-800' },
  processing: { label: 'В ОБРОБЦІ',   bg: 'bg-indigo-100',  text: 'text-indigo-800' },
  shipped:    { label: 'ДОСТАВКА',     bg: 'bg-violet-100', text: 'text-violet-800' },
  delivered:  { label: 'ДОСТАВЛЕНО',   bg: 'bg-emerald-100', text: 'text-emerald-800' },
  canceled:   { label: 'СКАСОВАНО',    bg: 'bg-gray-100',   text: 'text-gray-500' },
};
const TRANSITIONS: Record<string, string[]> = {
  pending: ['confirmed', 'canceled'], confirmed: ['processing', 'canceled'],
  processing: ['shipped', 'canceled'], shipped: ['delivered'], delivered: [], canceled: [],
};
const PAY: Record<string, { label: string; cls: string }> = {
  unpaid:  { label: 'Не оплачено', cls: 'bg-red-100 text-red-700 border-red-200' },
  partial: { label: 'Частково',    cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  paid:    { label: 'Оплачено',    cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
};
const METHOD_LABELS: Record<string, string> = { cash: 'Готівка', card: 'Картка', online: 'Онлайн', bank_transfer: 'Переказ' };
const money = (n: number | string) => Number(n).toLocaleString('uk-UA');
const fmtD = (d: string) => {
  const date = new Date(d);
  return isToday(date) ? `Сьогодні ${format(date, 'HH:mm')}` : format(date, 'dd.MM.yy HH:mm', { locale: uk });
};

function Badge({ status }: { status: string }) {
  const c = STATUSES[status] ?? STATUSES.pending;
  return <span className={cn('inline-flex px-2 py-0.5 rounded text-[10px] font-bold tracking-wide', c.bg, c.text)}>{c.label}</span>;
}
function PayBadge({ status }: { status: string }) {
  const c = PAY[status] ?? PAY.unpaid;
  return <span className={cn('inline-flex px-2 py-0.5 rounded border text-[10px] font-bold', c.cls)}>{c.label}</span>;
}
function Cp({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return <button onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500); }}
    title="Копіювати" className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-gray-100 text-gray-400 hover:text-[#4b569e] transition-colors">
    {ok ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
  </button>;
}
function LV({ label, children, className: cls }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex gap-4 py-[5px]', cls)}>
      <span className="text-[12px] text-gray-400 w-[140px] shrink-0">{label}</span>
      <span className="text-[13px] text-gray-800 min-w-0">{children}</span>
    </div>
  );
}

function Dropdown({ current, options, onSelect, disabled }: {
  current: string;
  options: { value: string; label: string; bg: string; text: string }[];
  onSelect: (v: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const cur = options.find(o => o.value === current) ?? options[0];

  return (
    <div className="relative" onClick={e => e.stopPropagation()}>
      <button
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-bold tracking-wide cursor-pointer transition-all border',
          cur.bg, cur.text, 'border-transparent',
          open && 'ring-2 ring-[#4b569e]/20',
          disabled && 'opacity-60 cursor-default',
        )}
      >
        {cur.label}
        <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-50 bg-white rounded-lg border border-gray-200 shadow-lg py-1.5 min-w-[200px]">
            {options.map(opt => (
              <button
                key={opt.value}
                onClick={() => { if (opt.value !== current) onSelect(opt.value); setOpen(false); }}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors',
                  opt.value === current ? 'bg-gray-50' : 'hover:bg-gray-50',
                )}
              >
                <span className={cn('inline-flex px-2 py-0.5 rounded text-[10px] font-bold tracking-wide', opt.bg, opt.text)}>
                  {opt.label}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function StatusDrop({ current, orderId, isPending, act }: {
  current: string; orderId: string; isPending: boolean; act: (fn: () => Promise<void>) => void;
}) {
  const allowed = TRANSITIONS[current] ?? [];
  const options = [current, ...allowed].map(s => ({
    value: s,
    label: STATUSES[s]?.label ?? s,
    bg: STATUSES[s]?.bg ?? 'bg-gray-100',
    text: STATUSES[s]?.text ?? 'text-gray-600',
  }));
  return <Dropdown current={current} options={options} disabled={isPending || !allowed.length}
    onSelect={v => act(() => updateOrderStatus(orderId, v))} />;
}

function PayDrop({ current, orderId, isPending, act }: {
  current: string; orderId: string; isPending: boolean; act: (fn: () => Promise<void>) => void;
}) {
  const options = Object.entries(PAY).map(([k, v]) => ({
    value: k, label: v.label, bg: v.cls.split(' ')[0], text: v.cls.split(' ')[1],
  }));
  return <Dropdown current={current} options={options} disabled={isPending}
    onSelect={v => act(() => updatePaymentStatus(orderId, v))} />;
}

// Expanded Panel
function PanelDiv({ order }: { order: Order }) {
  const [isPending, startTransition] = useTransition();
  const [showPay, setShowPay] = useState(false);
  const [comment, setComment] = useState(order.manager_comment ?? '');
  const router = useRouter();
  const act = (fn: () => Promise<void>) => startTransition(async () => { await fn(); router.refresh(); });

  const name = [order.first_name, order.last_name].filter(Boolean).join(' ') || '—';
  const itemsSum = order.order_items?.reduce((s, i) => s + i.quantity * Number(i.price_at_order), 0) ?? 0;
  const payments = order.payments ?? [];
  const expenses = order.order_expenses ?? [];
  const totalPaid = payments.filter(p => p.status === 'paid').reduce((s, p) => s + Number(p.amount), 0);
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const [showExp, setShowExp] = useState(false);

  return (
    <div className="border-t-2 border-[#4b569e] bg-white">
        {/* 3 Columns */}
        <div className="grid grid-cols-3 divide-x divide-gray-100 min-h-[280px]">

          {/* ─── LEFT: Order ─── */}
          <div className="px-5 py-4">
            <LV label="№ замовлення"><span className="font-semibold">{order.order_number}</span></LV>
            {order.keycrm_order_id && <LV label="№ зовнішній"><span className="text-[#4b569e] font-medium">{order.keycrm_order_id}</span></LV>}
            <LV label="Джерело">
              <span className="inline-flex items-center gap-1.5 font-medium">{order.source === 'app' ? '📱 Додаток' : order.source}</span>
            </LV>
            <LV label="Дата створення">{fmtD(order.created_at)}</LV>
            <LV label="Статус">
              <StatusDrop current={order.status} orderId={order.id} isPending={isPending} act={act} />
            </LV>
            <LV label="Статус оплати">
              <PayDrop current={order.payment_status} orderId={order.id} isPending={isPending} act={act} />
            </LV>

            {/* Comment */}
            <div className="mt-3 pt-3 border-t border-gray-100">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[12px] text-gray-400">Коментар менеджера</span>
              </div>
              {comment || true ? (
                <textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="+ Додати"
                  rows={2}
                  className="w-full rounded border border-gray-200 bg-white px-3 py-2 text-[12px] text-gray-700 placeholder:text-[#4b569e] placeholder:font-medium focus:outline-none focus:border-[#4b569e] resize-none" />
              ) : null}
              {comment !== (order.manager_comment ?? '') && (
                <button onClick={() => act(() => addComment(order.id, comment))} disabled={isPending}
                  className="mt-1 rounded bg-[#4b569e] text-white px-3 py-1 text-[11px] font-semibold hover:bg-[#363f75] disabled:opacity-50">
                  {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Зберегти'}
                </button>
              )}
            </div>
          </div>

          {/* ─── CENTER: Customer ─── */}
          <div className="px-5 py-4">
            <LV label="Покупець"><span className="text-[#4b569e] font-semibold">{name}</span></LV>
            <LV label="Телефон">
              {order.phone ? <span className="flex items-center gap-1 font-mono text-[12px]">{order.phone}<Cp text={order.phone} /></span> : <span className="text-gray-300">(пусто)</span>}
            </LV>
            <LV label="Місто">{order.city_name || <span className="text-gray-300">(пусто)</span>}</LV>

            {/* Action buttons */}
            {order.phone && (
              <div className="flex gap-2 mt-4">
                <a href={`tel:${order.phone}`} onClick={e => e.stopPropagation()}
                  className="flex-1 flex items-center justify-center gap-2 rounded-md bg-[#4b569e] hover:bg-[#363f75] text-white h-10 text-[13px] font-semibold transition-colors">
                  <Phone className="h-4 w-4" /> Зателефонувати
                </a>
                <button
                  className="flex-1 flex items-center justify-center gap-2 rounded-md bg-[#39b0ea] hover:bg-[#2da0d8] text-white h-10 text-[13px] font-semibold transition-colors">
                  <MessageSquare className="h-4 w-4" /> Написати
                </button>
              </div>
            )}

            {order.notes && (
              <div className="mt-4 pt-3 border-t border-gray-100">
                <span className="text-[12px] text-gray-400">Коментар покупця</span>
                <p className="text-[12px] text-gray-700 mt-1">{order.notes}</p>
              </div>
            )}
          </div>

          {/* ─── RIGHT: Delivery ─── */}
          <div className="px-5 py-4">
            <LV label="Отримувач">
              <div>
                <p className="font-medium">{name}</p>
                {order.phone && <p className="text-[12px] text-gray-400 font-mono">{order.phone}</p>}
              </div>
            </LV>
            <LV label="Адреса доставки">
              <div>
                {order.warehouse_name ? (
                  <p className="text-[12px] leading-relaxed">{order.warehouse_name}</p>
                ) : <span className="text-gray-300">—</span>}
                {order.city_name && (
                  <p className="text-[11px] text-gray-400 flex items-center gap-1 mt-0.5"><MapPin className="h-3 w-3" />{order.city_name}</p>
                )}
              </div>
            </LV>
            <LV label="Служба доставки">
              <span className="flex items-center gap-1.5 font-medium">🚚 Нова Пошта</span>
            </LV>
            <LV label="Трекінг код">
              {order.np_ttn ? (
                <span className="inline-flex items-center gap-1">
                  <span className="font-mono text-[12px] font-medium">{order.np_ttn}</span>
                  <Cp text={order.np_ttn} />
                  <a href={`https://novaposhta.ua/tracking/?cargo_number=${order.np_ttn}`} target="_blank" rel="noopener"
                    onClick={e => e.stopPropagation()} title="Відстежити"
                    className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-gray-100 text-gray-400 hover:text-[#4b569e]">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  <button title="Друкувати" className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-gray-100 text-gray-400 hover:text-[#4b569e]">
                    <Printer className="h-3.5 w-3.5" />
                  </button>
                </span>
              ) : <span className="text-gray-300">—</span>}
            </LV>
            <LV label="Витрати">
              <div>
                {expenses.length > 0 && expenses.map(e => (
                  <div key={e.id} className="text-[12px] text-gray-700">{e.name}: {money(e.amount)} ₴</div>
                ))}
                {totalExpenses > 0 && <div className="text-[12px] font-medium text-gray-800 mt-0.5">Всього: {money(totalExpenses)} ₴</div>}
                <button onClick={() => setShowExp(!showExp)} className="text-[#4b569e] font-medium text-[12px] mt-1">+ Додати</button>
                {showExp && (
                  <form onSubmit={e => { e.preventDefault(); const fd = new FormData(e.currentTarget);
                    act(async () => {
                      await addExpense(order.id, { name: fd.get('name') as string, amount: Number(fd.get('amount')) });
                      setShowExp(false);
                    }); }} className="flex gap-1.5 mt-1.5">
                    <input name="name" required placeholder="Назва" className="w-24 rounded border border-gray-200 px-2 py-1 text-[11px] focus:outline-none focus:border-[#4b569e]" />
                    <input name="amount" type="number" step="0.01" required placeholder="₴" className="w-16 rounded border border-gray-200 px-2 py-1 text-[11px] focus:outline-none focus:border-[#4b569e]" />
                    <button type="submit" disabled={isPending} className="rounded bg-[#4b569e] text-white px-2 py-1 text-[10px] font-semibold hover:bg-[#363f75] disabled:opacity-50">OK</button>
                  </form>
                )}
              </div>
            </LV>
          </div>
        </div>

        {/* Products */}
        <div className="border-t border-gray-200">
          <div className="px-5 py-2.5 flex items-center justify-between bg-gray-50">
            <span className="text-[13px] font-semibold text-gray-700">Товари ({order.order_items?.length ?? 0})</span>
          </div>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-[11px] text-gray-400 border-b border-gray-100 bg-gray-50/50">
                <th className="px-5 py-2 text-left font-medium w-14">Фото</th>
                <th className="px-3 py-2 text-left font-medium">Назва</th>
                <th className="px-3 py-2 text-center font-medium w-20">Кіл-во</th>
                <th className="px-3 py-2 text-right font-medium w-28">Ціна</th>
                <th className="px-5 py-2 text-right font-medium w-28">Сума</th>
              </tr>
            </thead>
            <tbody>
              {order.order_items?.map((item, i) => (
                <tr key={item.id} className={cn('hover:bg-blue-50/30 transition-colors', i > 0 && 'border-t border-gray-50')}>
                  <td className="px-5 py-2">
                    {item.products?.image_path ? (
                      <img src={item.products.image_path} alt="" className="h-10 w-10 rounded object-cover border border-gray-200" />
                    ) : (
                      <div className="h-10 w-10 rounded bg-gray-100 flex items-center justify-center text-gray-300">
                        <Package className="h-4 w-4" />
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-gray-800">{item.product_name}</td>
                  <td className="px-3 py-2.5 text-center text-gray-500 tabular-nums">{item.quantity} шт</td>
                  <td className="px-3 py-2.5 text-right text-gray-500 tabular-nums">{money(item.price_at_order)} ₴</td>
                  <td className="px-5 py-2.5 text-right font-medium text-gray-800 tabular-nums">{money(item.quantity * Number(item.price_at_order))} ₴</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Payments + Totals */}
        <div className="border-t border-gray-200 grid grid-cols-[1fr_320px]">
          {/* Payments */}
          <div className="px-5 py-3">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-[13px] font-semibold text-gray-700">Оплати</span>
              <button onClick={() => setShowPay(!showPay)}
                className="inline-flex items-center gap-1 text-[12px] text-white bg-[#4b569e] hover:bg-[#363f75] rounded px-2.5 py-1 font-semibold transition-colors">
                <Plus className="h-3 w-3" /> Додати оплату
              </button>
            </div>
            {showPay && (
              <form onSubmit={e => { e.preventDefault(); const fd = new FormData(e.currentTarget);
                act(async () => { await addPayment(order.id, { amount: Number(fd.get('amount')), method: fd.get('method') as string, status: 'paid' }); setShowPay(false); }); }}
                className="flex items-center gap-2 mb-3 p-2.5 bg-gray-50 rounded border border-gray-200">
                <input name="amount" type="number" step="0.01" defaultValue={Number(order.total_amount)} required
                  className="w-28 rounded border border-gray-200 px-2.5 py-1.5 text-[12px] focus:outline-none focus:border-[#4b569e]" />
                <select name="method" className="rounded border border-gray-200 px-2.5 py-1.5 text-[12px] focus:outline-none focus:border-[#4b569e]">
                  <option value="cash">Готівка</option><option value="card">Картка</option><option value="online">Онлайн</option>
                </select>
                <button type="submit" disabled={isPending}
                  className="rounded bg-[#4b569e] text-white px-3 py-1.5 text-[11px] font-semibold hover:bg-[#363f75] disabled:opacity-50">
                  {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Зберегти'}
                </button>
                <button type="button" onClick={() => setShowPay(false)} className="text-[11px] text-gray-400 hover:text-gray-600 px-2">Скасувати</button>
              </form>
            )}
            {payments.length > 0 ? (
              <table className="w-full text-[12px]">
                <thead><tr className="text-[10px] text-gray-400 border-b border-gray-100">
                  <th className="pb-1 text-left font-medium">Дата</th>
                  <th className="pb-1 text-left font-medium">Тип</th>
                  <th className="pb-1 text-right font-medium">Сума</th>
                  <th className="pb-1 text-center font-medium">Статус</th>
                </tr></thead>
                <tbody>{payments.map(p => (
                  <tr key={p.id} className="border-b border-gray-50 last:border-0">
                    <td className="py-1.5 text-gray-500">{fmtD(p.created_at)}</td>
                    <td className="py-1.5 text-gray-600">{METHOD_LABELS[p.method] ?? p.method}</td>
                    <td className="py-1.5 text-right font-medium tabular-nums">{money(p.amount)} ₴</td>
                    <td className="py-1.5 text-center">
                      <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-bold',
                        p.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500')}>{p.status === 'paid' ? '✓' : '○'}</span>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            ) : <p className="text-[12px] text-gray-300">Оплат немає</p>}
            <div className="mt-1 text-[12px] text-gray-500">Оплати: <span className="font-medium text-gray-700 tabular-nums">{money(totalPaid)} ₴</span></div>
          </div>

          {/* Totals */}
          <div className="px-5 py-3 border-l border-gray-200 bg-gray-50/50">
            <div className="space-y-1 text-[13px]">
              <div className="flex justify-between"><span className="text-gray-400">Сума за товари:</span><span className="text-gray-800 font-medium tabular-nums">{money(itemsSum)} ₴</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Вартість доставки:</span><span className={cn('tabular-nums', Number(order.np_delivery_cost ?? 0) > 0 ? 'text-gray-800' : 'text-gray-400')}>{money(order.np_delivery_cost ?? 0)} ₴</span></div>
              {totalExpenses > 0 && (
                <div className="flex justify-between"><span className="text-gray-400">Витрати:</span><span className="text-red-500 tabular-nums">-{money(totalExpenses)} ₴</span></div>
              )}
              <div className="flex justify-between pt-2 mt-1 border-t border-gray-200 text-[15px] font-bold">
                <span className="text-gray-800">Загальна вартість:</span>
                <span className="text-gray-900 tabular-nums">{money(order.total_amount)} ₴</span>
              </div>
              {totalPaid > 0 && (
                <div className="flex justify-between text-[13px]">
                  <span className="text-gray-400">Оплачено:</span>
                  <span className="text-emerald-600 font-medium tabular-nums">{money(totalPaid)} ₴</span>
                </div>
              )}
              {totalPaid > 0 && totalPaid < Number(order.total_amount) && (
                <div className="flex justify-between text-[13px]">
                  <span className="text-gray-400">До сплати:</span>
                  <span className="text-red-500 font-medium tabular-nums">{money(Number(order.total_amount) - totalPaid)} ₴</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function OrderCard({ order, isOpen, onToggle }: { order: Order; isOpen: boolean; onToggle: () => void }) {
  const name = [order.first_name, order.last_name].filter(Boolean).join(' ') || '—';
  return (
    <div className={cn('rounded-lg border-2 transition-all overflow-hidden',
      isOpen ? 'border-[#4b569e] shadow-md' : 'border-gray-200 hover:border-[#4b569e]/40 hover:shadow-sm')}>
      {/* Compact header row */}
      <div onClick={onToggle}
        className={cn('flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors',
          isOpen ? 'bg-[#eceef5]/60' : 'bg-white hover:bg-gray-50')}>
        <ChevronDown className={cn('h-4 w-4 text-gray-300 transition-transform duration-150 shrink-0', isOpen && 'rotate-180 text-[#4b569e]')} />
        <span className="text-[13px] text-gray-700 font-semibold tabular-nums w-10">{order.order_number}</span>
        <span className="text-[12px] text-gray-500 w-[130px]">{fmtD(order.created_at)}</span>
        <span className="w-[130px]"><Badge status={order.status} /></span>
        <div className="flex-1 min-w-0">
          <span className="text-[13px] text-gray-800 font-medium truncate block">{name}</span>
        </div>
        <span className="text-[12px] font-mono text-gray-400 w-[120px] truncate">{order.phone ?? '—'}</span>
        <span className="w-[130px]">{order.np_ttn ? <span className="text-[11px] font-mono text-gray-500">{order.np_ttn.slice(-10)}</span> : <span className="text-[11px] text-gray-200">—</span>}</span>
        <span className="w-[100px]"><PayBadge status={order.payment_status} /></span>
        <span className="text-[14px] font-bold text-gray-900 tabular-nums w-[90px] text-right">{money(order.total_amount)} ₴</span>
      </div>
      {/* Expanded panel */}
      {isOpen && <PanelDiv order={order} />}
    </div>
  );
}

function Metric({ label, value, sub, icon: Icon }: { label: string; value: string | number; sub: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3">
      <div className="h-9 w-9 flex items-center justify-center rounded-lg bg-[#eceef5] text-[#4b569e]">
        <Icon className="h-[17px] w-[17px]" />
      </div>
      <div>
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
        <p className="text-[18px] font-bold text-gray-900 tabular-nums leading-tight">{value}</p>
        <p className="text-[11px] text-gray-400 tabular-nums">{sub}</p>
      </div>
    </div>
  );
}

export function OrdersList({ orders }: { orders: Order[] }) {
  const [activeStatus, setActiveStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: orders.length };
    orders.forEach(o => { c[o.status] = (c[o.status] || 0) + 1; });
    return c;
  }, [orders]);

  const filtered = useMemo(() => {
    let r = orders;
    if (activeStatus !== 'all') r = r.filter(o => o.status === activeStatus);
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(o =>
        o.first_name?.toLowerCase().includes(q) || o.last_name?.toLowerCase().includes(q) ||
        o.phone?.includes(q) || o.np_ttn?.includes(q) || o.city_name?.toLowerCase().includes(q) ||
        String(o.order_number).includes(q)
      );
    }
    return r;
  }, [orders, activeStatus, search]);

  const rev = (arr: Order[]) => arr.filter(o => o.status !== 'canceled').reduce((s, o) => s + Number(o.total_amount), 0);
  const today = orders.filter(o => isToday(new Date(o.created_at)));
  const week = orders.filter(o => isThisWeek(new Date(o.created_at), { weekStartsOn: 1 }));
  const month = orders.filter(o => isThisMonth(new Date(o.created_at)));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-bold text-gray-900">Замовлення</h1>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input type="text" placeholder="Швидкий пошук" value={search} onChange={e => setSearch(e.target.value)}
            className="w-72 rounded-lg border border-gray-200 bg-white pl-10 pr-3 py-2 text-[13px] text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#4b569e]/20 focus:border-[#4b569e]" />
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-4 gap-3">
        <Metric label="Сьогодні" value={today.length} sub={`${money(rev(today))} грн`} icon={Clock} />
        <Metric label="Цей тиждень" value={week.length} sub={`${money(rev(week))} грн`} icon={ShoppingCart} />
        <Metric label="Цей місяць" value={month.length} sub={`${money(rev(month))} грн`} icon={Package} />
        <Metric label="Виручка" value={`${money(rev(orders))} ₴`} sub={`${orders.length} замовлень`} icon={DollarSign} />
      </div>

      {/* Status filters */}
      <div className="flex gap-1.5">
        {Object.entries(STATUSES).map(([key, c]) => {
          const on = activeStatus === key;
          const count = counts[key] ?? 0;
          return (
            <button key={key} onClick={() => setActiveStatus(key)}
              className={cn('inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-all',
                on ? 'bg-[#4b569e] text-white shadow-sm' : 'bg-white text-gray-500 border border-gray-200 hover:border-[#4b569e]/30 hover:text-[#4b569e]')}>
              {c.label}
              <span className={cn('text-[10px] tabular-nums', on ? 'text-white/60' : 'text-gray-300')}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
        <span className="w-4"></span>
        <span className="w-10">№</span>
        <span className="w-[130px]">Дата</span>
        <span className="w-[130px]">Статус</span>
        <span className="flex-1">Покупець</span>
        <span className="w-[120px]">Телефон</span>
        <span className="w-[130px]">Трекінг</span>
        <span className="w-[100px]">Оплата</span>
        <span className="w-[90px] text-right">Сума</span>
      </div>

      {/* Order cards */}
      <div className="space-y-2">
        {filtered.map(order => (
          <OrderCard key={order.id} order={order} isOpen={expandedId === order.id}
            onToggle={() => setExpandedId(expandedId === order.id ? null : order.id)} />
        ))}
        {filtered.length === 0 && (
          <div className="rounded-lg border-2 border-gray-200 bg-white py-16 text-center">
            <ShoppingCart className="h-8 w-8 text-gray-200 mx-auto mb-2" />
            <p className="text-[13px] text-gray-400">{search ? 'Нічого не знайдено' : 'Замовлень поки немає'}</p>
          </div>
        )}
      </div>

      {filtered.length > 0 && (
        <div className="flex justify-between text-[12px] text-gray-400 px-4">
          <span>Показано {filtered.length} з {orders.length}</span>
          <span>Сума: <span className="font-semibold text-gray-700">{money(rev(filtered))} ₴</span></span>
        </div>
      )}
    </div>
  );
}
