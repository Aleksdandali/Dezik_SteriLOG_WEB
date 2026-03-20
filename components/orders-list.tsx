'use client';

import { Fragment, useState, useMemo, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { format, isToday, isThisWeek, isThisMonth } from 'date-fns';
import { uk } from 'date-fns/locale';
import {
  Search, ShoppingCart, DollarSign, Clock, Package,
  ChevronRight, Phone, Truck, MapPin,
  Loader2, Copy, Check, Hash, CreditCard, FileText,
  Plus, MessageSquare, User,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import {
  updateOrderStatus, addPayment, addExpense, addComment,
} from '@/app/(admin)/orders/[id]/order-actions-server';

const B = '#4b569e';  // brand primary
const BD = '#363f75'; // brand dark
const BL = '#eceef5'; // brand light

interface Order {
  id: string; user_id: string; status: string; payment_status: string; source: string;
  order_number: number; total_amount: number; phone: string | null;
  first_name: string | null; last_name: string | null; city_name: string | null;
  warehouse_name: string | null; np_ttn: string | null; np_delivery_cost: number | null;
  notes: string | null; manager_comment: string | null; keycrm_order_id: number | null;
  created_at: string; order_items?: { id: string; product_name: string; quantity: number; price_at_order: number }[];
}

const STATUSES: Record<string, { label: string; dot: string }> = {
  all: { label: 'Всі', dot: 'bg-[#94a3b8]' },
  pending: { label: 'Нові', dot: 'bg-[#f59e0b]' },
  confirmed: { label: 'Підтверджені', dot: `bg-[${B}]` },
  processing: { label: 'В обробці', dot: 'bg-[#6366f1]' },
  shipped: { label: 'Доставка', dot: 'bg-[#8b5cf6]' },
  delivered: { label: 'Доставлено', dot: 'bg-[#10b981]' },
  canceled: { label: 'Скасовані', dot: 'bg-[#94a3b8]' },
};
const TRANSITIONS: Record<string, string[]> = {
  pending: ['confirmed', 'canceled'], confirmed: ['processing', 'canceled'],
  processing: ['shipped', 'canceled'], shipped: ['delivered'], delivered: [], canceled: [],
};
const STATUS_LABELS: Record<string, string> = {
  pending: 'Нове', confirmed: 'Підтверджено', processing: 'В обробці',
  shipped: 'Відправлено', delivered: 'Доставлено', canceled: 'Скасовано',
};
const PAYMENT_CFG: Record<string, { label: string; style: string }> = {
  unpaid: { label: 'Не оплачено', style: 'text-[#dc2626] bg-[#fef2f2] border-[#fecaca]' },
  partial: { label: 'Частково', style: 'text-[#f59e0b] bg-[#fffbeb] border-[#fde68a]' },
  paid: { label: 'Оплачено', style: 'text-[#16a34a] bg-[#f0fdf4] border-[#bbf7d0]' },
};
const METHOD_LABELS: Record<string, string> = { cash: 'Готівка', card: 'Картка', online: 'Онлайн', bank_transfer: 'Переказ' };
const money = (n: number | string) => Number(n).toLocaleString('uk-UA');
const fmtD = (d: string) => isToday(new Date(d)) ? `Сьогодні, ${format(new Date(d), 'HH:mm')}` : format(new Date(d), 'dd MMM yyyy, HH:mm', { locale: uk });

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return <button onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500); }}
    className="ml-1 h-5 w-5 inline-flex items-center justify-center rounded hover:bg-[#eceef5] text-[#94a3b8] hover:text-[#4b569e]">
    {ok ? <Check className="h-3 w-3 text-[#4b569e]" /> : <Copy className="h-3 w-3" />}
  </button>;
}
function StatusPill({ status }: { status: string }) {
  const c = STATUSES[status]; if (!c) return <span className="text-xs text-[#94a3b8]">{status}</span>;
  return <span className="inline-flex items-center gap-1.5"><span className={cn('h-[6px] w-[6px] rounded-full', c.dot)} /><span className="text-[13px] text-[#475569]">{c.label}</span></span>;
}
function PayBadge({ status }: { status: string }) {
  const c = PAYMENT_CFG[status] ?? PAYMENT_CFG.unpaid;
  return <span className={cn('inline-flex px-1.5 py-0.5 rounded border text-[10px] font-semibold', c.style)}>{c.label}</span>;
}
function SrcBadge({ source }: { source: string }) {
  return <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold text-[#4b569e] bg-[#eceef5]">{source === 'app' ? 'Додаток' : source}</span>;
}
function DL({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex items-center justify-between py-1.5 border-b border-[#eceef5] last:border-0"><span className="text-[13px] text-[#94a3b8]">{label}</span><span className="text-[13px] text-[#334155]">{children}</span></div>;
}
function Sec({ icon: I, children, right }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode; right?: React.ReactNode }) {
  return <div className="flex items-center justify-between mb-3"><div className="flex items-center gap-2"><I className="h-4 w-4 text-[#4b569e]" /><h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#94a3b8]">{children}</h3></div>{right}</div>;
}

/* ══ Expanded Card ══ */
function ExpandedCard({ order }: { order: Order }) {
  const [tab, setTab] = useState<'info' | 'payments' | 'history'>('info');
  const [isPending, startTransition] = useTransition();
  const [payments, setPayments] = useState<any[]>([]);
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [showPayForm, setShowPayForm] = useState(false);
  const [showExpForm, setShowExpForm] = useState(false);
  const [comment, setComment] = useState(order.manager_comment ?? '');
  const router = useRouter();

  // Fetch related data when expanded
  useEffect(() => {
    fetch(`/api/orders/${order.id}`).then(r => r.json()).then(data => {
      // API returns order, we need to fetch payments/audit separately
    }).catch(() => {});
  }, [order.id]);

  const act = (fn: () => Promise<void>) => startTransition(async () => { await fn(); router.refresh(); });
  const name = [order.first_name, order.last_name].filter(Boolean).join(' ') || 'Невідомий';
  const itemsSum = order.order_items?.reduce((s, i) => s + i.quantity * Number(i.price_at_order), 0) ?? 0;
  const allowed = TRANSITIONS[order.status] ?? [];

  const tabs = [
    { key: 'info' as const, label: 'Деталі' },
    { key: 'payments' as const, label: 'Оплати' },
    { key: 'history' as const, label: 'Історія' },
  ];

  return (
    <td colSpan={10} className="p-0">
      <div className="border-t-2 border-[#4b569e]">
        {/* Mini header */}
        <div className="bg-white px-5 py-3 flex items-center justify-between border-b border-[#eceef5]">
          <div className="flex items-center gap-3">
            <span className="text-[14px] font-semibold text-[#0f172a]">#{order.order_number}</span>
            <StatusPill status={order.status} />
            <PayBadge status={order.payment_status} />
            <Link href={`/orders/${order.id}`} className="text-[11px] text-[#4b569e] hover:underline ml-2">Відкрити повну картку →</Link>
          </div>
          {/* Status buttons */}
          {allowed.length > 0 && (
            <div className="flex gap-1.5">
              {allowed.map(s => (
                <button key={s} onClick={() => act(() => updateOrderStatus(order.id, s))} disabled={isPending}
                  className={cn('inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-medium disabled:opacity-50 transition-colors',
                    s === 'canceled' ? 'border border-[#e2e8f0] text-[#94a3b8] hover:bg-[#f8fafc]'
                      : 'bg-[#4b569e] text-white hover:bg-[#363f75]')}>
                  {isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="bg-white px-5 flex gap-0 border-b border-[#eceef5]">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={cn('px-4 py-2 text-[12px] font-medium border-b-2 -mb-px transition-colors',
                tab === t.key ? 'border-[#4b569e] text-[#4b569e]' : 'border-transparent text-[#94a3b8] hover:text-[#64748b]')}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="bg-[#f8fafc] p-5">
          {tab === 'info' && (
            <div className="grid grid-cols-3 gap-3">
              {/* Order + Status */}
              <div className="rounded-lg border border-[#d8dce8] bg-white p-4">
                <Sec icon={Hash}>Замовлення</Sec>
                <DL label="Номер">{order.order_number}</DL>
                <DL label="Дата">{fmtD(order.created_at)}</DL>
                <DL label="Джерело"><SrcBadge source={order.source} /></DL>
                <DL label="Статус"><StatusPill status={order.status} /></DL>
                {order.keycrm_order_id && <DL label="KeyCRM">#{order.keycrm_order_id}</DL>}
                {order.notes && <p className="mt-3 rounded-md bg-[#eceef5] px-3 py-2 text-[12px] text-[#64748b]">{order.notes}</p>}
                {/* Comment */}
                <div className="mt-3 pt-3 border-t border-[#eceef5]">
                  <Sec icon={MessageSquare}>Коментар</Sec>
                  <textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="Додати коментар..."
                    className="w-full rounded-md border border-[#d8dce8] bg-[#f8fafc] px-3 py-2 text-[12px] text-[#334155] placeholder:text-[#cbd5e1] focus:outline-none focus:border-[#4b569e] resize-none h-16" />
                  {comment !== (order.manager_comment ?? '') && (
                    <button onClick={() => act(() => addComment(order.id, comment))} disabled={isPending}
                      className="mt-1.5 rounded-md bg-[#4b569e] text-white px-3 py-1 text-[11px] font-medium hover:bg-[#363f75] disabled:opacity-50">Зберегти</button>
                  )}
                </div>
              </div>

              {/* Client + Delivery */}
              <div className="space-y-3">
                <div className="rounded-lg border border-[#d8dce8] bg-white p-4">
                  <Sec icon={User}>Покупець</Sec>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-9 w-9 rounded-full bg-[#eceef5] flex items-center justify-center text-[13px] font-semibold text-[#4b569e]">{(order.first_name?.[0] ?? '?').toUpperCase()}</div>
                    <div><p className="text-[14px] font-medium text-[#0f172a]">{name}</p>{order.city_name && <p className="text-[11px] text-[#94a3b8]">{order.city_name}</p>}</div>
                  </div>
                  {order.phone && (
                    <>
                      <DL label="Телефон"><span className="flex items-center font-mono text-[12px]">{order.phone}<CopyBtn text={order.phone} /></span></DL>
                      <a href={`tel:${order.phone}`} onClick={e => e.stopPropagation()}
                        className="mt-3 flex items-center justify-center gap-1.5 rounded-md border border-[#d8dce8] h-8 text-[12px] font-medium text-[#4b569e] hover:bg-[#eceef5] transition-colors">
                        <Phone className="h-3.5 w-3.5" /> Зателефонувати
                      </a>
                    </>
                  )}
                </div>
                <div className="rounded-lg border border-[#d8dce8] bg-white p-4">
                  <Sec icon={Truck}>Доставка</Sec>
                  <DL label="Отримувач">{name}</DL>
                  <div className="py-1.5">
                    <span className="text-[11px] text-[#94a3b8]">Адреса</span>
                    <p className="text-[12px] text-[#475569] leading-relaxed">{order.warehouse_name || '—'}</p>
                    {order.city_name && <p className="text-[11px] text-[#94a3b8] flex items-center gap-1 mt-0.5"><MapPin className="h-3 w-3" />{order.city_name}</p>}
                  </div>
                  <DL label="Трекінг">{order.np_ttn ? <span className="flex items-center"><span className="rounded border border-[#d8dce8] bg-[#f8fafc] px-2 py-0.5 text-[11px] font-mono">{order.np_ttn}</span><CopyBtn text={order.np_ttn} /></span> : '—'}</DL>
                </div>
              </div>

              {/* Items + Finance */}
              <div className="space-y-3">
                <div className="rounded-lg border border-[#d8dce8] bg-white overflow-hidden">
                  <div className="px-4 py-3 border-b border-[#eceef5]"><Sec icon={Package}>Товари ({order.order_items?.length ?? 0})</Sec></div>
                  {order.order_items?.map((item, i) => (
                    <div key={item.id} className={cn('flex justify-between px-4 py-2 text-[13px]', i > 0 && 'border-t border-[#eceef5]')}>
                      <div><p className="text-[#334155]">{item.product_name}</p><p className="text-[11px] text-[#94a3b8]">{item.quantity} × {money(item.price_at_order)} ₴</p></div>
                      <span className="font-medium text-[#0f172a] tabular-nums">{money(item.quantity * Number(item.price_at_order))} ₴</span>
                    </div>
                  ))}
                  <div className="bg-[#eceef5]/50 px-4 py-2.5 border-t border-[#d8dce8]">
                    <div className="flex justify-between text-[13px]"><span className="text-[#94a3b8]">Товари</span><span className="tabular-nums">{money(itemsSum)} ₴</span></div>
                    {order.np_delivery_cost && Number(order.np_delivery_cost) > 0 && <div className="flex justify-between text-[13px]"><span className="text-[#94a3b8]">Доставка</span><span className="tabular-nums">{money(order.np_delivery_cost)} ₴</span></div>}
                    <div className="flex justify-between text-[14px] font-bold text-[#0f172a] mt-1 pt-1 border-t border-[#d8dce8]"><span>Всього</span><span className="tabular-nums">{money(order.total_amount)} ₴</span></div>
                  </div>
                </div>

                {/* Expenses */}
                <div className="rounded-lg border border-[#d8dce8] bg-white p-4">
                  <Sec icon={FileText} right={
                    <button onClick={() => setShowExpForm(!showExpForm)} className="text-[11px] text-[#4b569e] hover:text-[#363f75] font-medium flex items-center gap-1"><Plus className="h-3 w-3" />Додати</button>
                  }>Витрати</Sec>
                  {showExpForm && (
                    <form onSubmit={e => { e.preventDefault(); const fd = new FormData(e.currentTarget); act(async () => { await addExpense(order.id, { name: fd.get('name') as string, amount: Number(fd.get('amount')) }); setShowExpForm(false); }); }}
                      className="flex gap-2 mb-2">
                      <input name="name" required placeholder="Назва" className="flex-1 rounded-md border border-[#d8dce8] px-2 py-1.5 text-[12px] placeholder:text-[#cbd5e1] focus:outline-none focus:border-[#4b569e]" />
                      <input name="amount" type="number" step="0.01" required placeholder="₴" className="w-20 rounded-md border border-[#d8dce8] px-2 py-1.5 text-[12px] placeholder:text-[#cbd5e1] focus:outline-none focus:border-[#4b569e]" />
                      <button type="submit" disabled={isPending} className="rounded-md bg-[#4b569e] text-white px-2.5 py-1.5 text-[11px] font-medium hover:bg-[#363f75] disabled:opacity-50">
                        {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'OK'}
                      </button>
                    </form>
                  )}
                  {expenses.length > 0 ? expenses.map((e: any) => (
                    <DL key={e.id} label={e.name}>{money(e.amount)} ₴</DL>
                  )) : <p className="text-[12px] text-[#cbd5e1]">Немає витрат</p>}
                </div>
              </div>
            </div>
          )}

          {tab === 'payments' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-semibold text-[#0f172a]">Оплати</span>
                <button onClick={() => setShowPayForm(!showPayForm)}
                  className="flex items-center gap-1.5 rounded-md bg-[#4b569e] text-white px-3 py-1.5 text-[12px] font-medium hover:bg-[#363f75]">
                  <Plus className="h-3.5 w-3.5" /> Додати оплату
                </button>
              </div>
              {showPayForm && (
                <div className="rounded-lg border border-[#d8dce8] bg-white p-4">
                  <form onSubmit={e => { e.preventDefault(); const fd = new FormData(e.currentTarget);
                    act(async () => { await addPayment(order.id, { amount: Number(fd.get('amount')), method: fd.get('method') as string, status: 'paid', comment: fd.get('comment') as string || undefined }); setShowPayForm(false); }); }}
                    className="grid grid-cols-4 gap-3">
                    <div><label className="text-[11px] text-[#94a3b8]">Сума</label><input name="amount" type="number" step="0.01" defaultValue={Number(order.total_amount)} required className="mt-1 w-full rounded-md border border-[#d8dce8] px-3 py-1.5 text-[13px] focus:outline-none focus:border-[#4b569e]" /></div>
                    <div><label className="text-[11px] text-[#94a3b8]">Спосіб</label><select name="method" className="mt-1 w-full rounded-md border border-[#d8dce8] px-3 py-1.5 text-[13px] focus:outline-none focus:border-[#4b569e]"><option value="cash">Готівка</option><option value="card">Картка</option><option value="online">Онлайн</option><option value="bank_transfer">Переказ</option></select></div>
                    <div><label className="text-[11px] text-[#94a3b8]">Коментар</label><input name="comment" placeholder="Необов'язково" className="mt-1 w-full rounded-md border border-[#d8dce8] px-3 py-1.5 text-[13px] placeholder:text-[#cbd5e1] focus:outline-none focus:border-[#4b569e]" /></div>
                    <div className="flex items-end gap-2">
                      <button type="submit" disabled={isPending} className="rounded-md bg-[#4b569e] text-white px-4 py-1.5 text-[12px] font-medium hover:bg-[#363f75] disabled:opacity-50 h-[34px]">{isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Зберегти'}</button>
                      <button type="button" onClick={() => setShowPayForm(false)} className="text-[12px] text-[#94a3b8] hover:text-[#64748b] h-[34px]">Скасувати</button>
                    </div>
                  </form>
                </div>
              )}
              <div className="rounded-lg border border-[#d8dce8] bg-white overflow-hidden">
                {payments.length > 0 ? (
                  <table className="w-full text-[13px]">
                    <thead><tr className="text-[10px] uppercase tracking-wider text-[#94a3b8] border-b border-[#eceef5]">
                      <th className="px-4 py-2 text-left font-medium">Дата</th><th className="px-4 py-2 text-left font-medium">Спосіб</th><th className="px-4 py-2 text-left font-medium">Статус</th><th className="px-4 py-2 text-right font-medium">Сума</th>
                    </tr></thead>
                    <tbody>{payments.map((p: any) => (
                      <tr key={p.id} className="border-b border-[#eceef5] last:border-0">
                        <td className="px-4 py-2 text-[#475569]">{fmtD(p.created_at)}</td>
                        <td className="px-4 py-2">{METHOD_LABELS[p.method] ?? p.method}</td>
                        <td className="px-4 py-2"><span className={cn('px-1.5 py-0.5 rounded text-[10px] font-semibold', p.status === 'paid' ? 'text-[#16a34a] bg-[#f0fdf4]' : 'text-[#94a3b8] bg-[#f8fafc]')}>{p.status === 'paid' ? 'Оплачено' : p.status}</span></td>
                        <td className="px-4 py-2 text-right font-medium tabular-nums">{money(p.amount)} ₴</td>
                      </tr>
                    ))}</tbody>
                  </table>
                ) : <p className="text-[13px] text-[#cbd5e1] text-center py-8">Оплат поки немає. Натисніть «Додати оплату».</p>}
              </div>
            </div>
          )}

          {tab === 'history' && (
            <div className="rounded-lg border border-[#d8dce8] bg-white p-4">
              <Sec icon={Clock}>Історія змін</Sec>
              {auditLog.length > 0 ? auditLog.map((e: any, i: number) => (
                <div key={e.id} className="flex gap-3 py-2 border-b border-[#eceef5] last:border-0">
                  <div className="flex flex-col items-center"><div className="h-2 w-2 rounded-full bg-[#4b569e] mt-1.5" />{i < auditLog.length - 1 && <div className="w-px flex-1 bg-[#eceef5] mt-1" />}</div>
                  <div><p className="text-[12px]"><span className="font-medium text-[#334155]">{e.created_by_name ?? 'System'}</span> <span className="text-[#94a3b8]">· {fmtD(e.created_at)}</span></p>
                    <p className="text-[12px] text-[#64748b]">{e.action === 'status_change' ? `Статус: ${STATUS_LABELS[e.old_value] ?? e.old_value} → ${STATUS_LABELS[e.new_value] ?? e.new_value}` : `${e.action}: ${e.new_value}`}</p>
                  </div>
                </div>
              )) : <p className="text-[13px] text-[#cbd5e1] text-center py-6">Історія порожня. Зміни будуть відображатись тут.</p>}
            </div>
          )}
        </div>
      </div>
    </td>
  );
}

/* ══ OrderRow ══ */
function OrderRow({ order, isOpen, onToggle }: { order: Order; isOpen: boolean; onToggle: () => void }) {
  const name = [order.first_name, order.last_name].filter(Boolean).join(' ') || '—';
  return (
    <Fragment>
      <tr onClick={onToggle} className={cn('group cursor-pointer transition-colors', isOpen ? 'bg-[#eceef5]/40' : 'hover:bg-[#eceef5]/30', !isOpen && 'border-b border-[#eceef5]')}>
        <td className="pl-3 pr-1 py-2.5"><ChevronRight className={cn('h-3.5 w-3.5 text-[#cbd5e1] transition-transform duration-150 group-hover:text-[#4b569e]', isOpen && 'rotate-90 text-[#4b569e]')} /></td>
        <td className="px-2 py-2.5 text-[12px] text-[#4b569e] font-mono tabular-nums font-semibold">{order.order_number}</td>
        <td className="px-2 py-2.5"><SrcBadge source={order.source} /></td>
        <td className="px-2 py-2.5 text-[12px] text-[#334155]">{fmtD(order.created_at)}</td>
        <td className="px-2 py-2.5"><StatusPill status={order.status} /></td>
        <td className="px-2 py-2.5 text-[12px] text-[#334155] truncate">{name}</td>
        <td className="px-2 py-2.5">{order.np_ttn ? <span className="text-[11px] font-mono text-[#475569] truncate block">{order.np_ttn}</span> : <span className="text-[11px] text-[#cbd5e1]">—</span>}</td>
        <td className="px-2 py-2.5 text-[12px] font-mono text-[#94a3b8] truncate">{order.phone ?? '—'}</td>
        <td className="px-2 py-2.5"><PayBadge status={order.payment_status} /></td>
        <td className="px-2 py-2.5 pr-4 text-right"><span className="text-[13px] font-semibold text-[#0f172a] tabular-nums">{money(order.total_amount)} ₴</span></td>
      </tr>
      {isOpen && <tr><ExpandedCard order={order} /></tr>}
    </Fragment>
  );
}

/* ══ Metric ══ */
function Metric({ label, value, sub, icon: Icon }: { label: string; value: string | number; sub: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex items-center gap-3.5 rounded-xl border border-[#d8dce8] bg-white px-4 py-3.5">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#eceef5] text-[#4b569e]"><Icon className="h-[18px] w-[18px]" /></div>
      <div><p className="text-[11px] font-medium text-[#94a3b8] uppercase tracking-wide">{label}</p><p className="text-[20px] font-semibold text-[#0f172a] tabular-nums leading-tight">{value}</p><p className="text-[11px] text-[#94a3b8] tabular-nums">{sub}</p></div>
    </div>
  );
}

/* ══ Main ══ */
export function OrdersList({ orders }: { orders: Order[] }) {
  const [activeStatus, setActiveStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const counts = useMemo(() => { const c: Record<string, number> = { all: orders.length }; orders.forEach(o => { c[o.status] = (c[o.status] || 0) + 1; }); return c; }, [orders]);
  const filtered = useMemo(() => {
    let r = orders;
    if (activeStatus !== 'all') r = r.filter(o => o.status === activeStatus);
    if (searchQuery.trim()) { const q = searchQuery.toLowerCase(); r = r.filter(o => o.first_name?.toLowerCase().includes(q) || o.last_name?.toLowerCase().includes(q) || o.phone?.includes(q) || o.np_ttn?.includes(q) || o.city_name?.toLowerCase().includes(q) || o.id.includes(q)); }
    return r;
  }, [orders, activeStatus, searchQuery]);

  const rev = (arr: Order[]) => arr.filter(o => o.status !== 'canceled').reduce((s, o) => s + Number(o.total_amount), 0);
  const today = orders.filter(o => isToday(new Date(o.created_at)));
  const week = orders.filter(o => isThisWeek(new Date(o.created_at), { weekStartsOn: 1 }));
  const month = orders.filter(o => isThisMonth(new Date(o.created_at)));

  return (
    <div className="space-y-5 max-w-[1400px]">
      <div><h1 className="text-[22px] font-semibold text-[#0f172a] tracking-tight">Замовлення</h1><p className="text-[13px] text-[#94a3b8] mt-0.5">Керування замовленнями</p></div>

      <div className="grid grid-cols-4 gap-3">
        <Metric label="Сьогодні" value={today.length} sub={`${money(rev(today))} грн`} icon={Clock} />
        <Metric label="Цей тиждень" value={week.length} sub={`${money(rev(week))} грн`} icon={ShoppingCart} />
        <Metric label="Цей місяць" value={month.length} sub={`${money(rev(month))} грн`} icon={Package} />
        <Metric label="Виручка" value={`${money(rev(orders))} ₴`} sub={`${orders.length} замовлень`} icon={DollarSign} />
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-1">
          {Object.entries(STATUSES).map(([key, c]) => {
            const on = activeStatus === key;
            return <button key={key} onClick={() => setActiveStatus(key)} className={cn('inline-flex items-center gap-1.5 rounded-lg px-3 py-[7px] text-[12px] font-medium transition-all', on ? 'bg-[#4b569e] text-white' : 'text-[#64748b] hover:bg-[#eceef5] hover:text-[#363f75]')}>
              {key !== 'all' && <span className={cn('h-[6px] w-[6px] rounded-full', on ? 'bg-white/70' : c.dot)} />}
              {c.label}<span className={cn('text-[10px] tabular-nums', on ? 'text-white/50' : 'text-[#cbd5e1]')}>{counts[key] ?? 0}</span>
            </button>;
          })}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-[14px] w-[14px] text-[#94a3b8]" />
          <input type="text" placeholder="Пошук..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            className="w-64 rounded-lg border border-[#d8dce8] bg-white pl-9 pr-3 py-[7px] text-[13px] text-[#334155] placeholder:text-[#cbd5e1] focus:outline-none focus:ring-2 focus:ring-[#4b569e]/20 focus:border-[#4b569e]" />
        </div>
      </div>

      <div className="rounded-xl border border-[#d8dce8] bg-white shadow-sm overflow-hidden">
        <table className="w-full table-fixed">
          <colgroup>
            <col className="w-8" /><col className="w-14" /><col className="w-20" /><col className="w-[160px]" />
            <col className="w-[110px]" /><col /><col className="w-[140px]" /><col className="w-[130px]" />
            <col className="w-[95px]" /><col className="w-[100px]" />
          </colgroup>
          <thead>
            <tr className="border-b border-[#d8dce8] bg-[#eceef5]/40 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#4b569e]/60">
              <th className="pl-3 py-2.5"></th><th className="px-2 py-2.5 text-left">№</th><th className="px-2 py-2.5 text-left">Джерело</th>
              <th className="px-2 py-2.5 text-left">Дата</th><th className="px-2 py-2.5 text-left">Статус</th><th className="px-2 py-2.5 text-left">Покупець</th>
              <th className="px-2 py-2.5 text-left">Трекінг</th><th className="px-2 py-2.5 text-left">Телефон</th><th className="px-2 py-2.5 text-left">Оплата</th>
              <th className="px-2 py-2.5 pr-4 text-right">Сума</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(order => <OrderRow key={order.id} order={order} isOpen={expandedId === order.id} onToggle={() => setExpandedId(expandedId === order.id ? null : order.id)} />)}
            {filtered.length === 0 && <tr><td colSpan={10} className="py-20 text-center"><ShoppingCart className="h-8 w-8 text-[#d8dce8] mx-auto mb-3" /><p className="text-[14px] text-[#94a3b8]">{searchQuery ? 'Нічого не знайдено' : 'Замовлень поки немає'}</p></td></tr>}
          </tbody>
        </table>
        {filtered.length > 0 && (
          <div className="border-t border-[#d8dce8] bg-[#eceef5]/30 px-5 py-2.5 flex justify-between text-[12px] text-[#94a3b8]">
            <span>Показано {filtered.length} з {orders.length}</span>
            <span>Сума: <span className="font-semibold text-[#334155]">{money(rev(filtered))} ₴</span></span>
          </div>
        )}
      </div>
    </div>
  );
}
