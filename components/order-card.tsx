'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { uk } from 'date-fns/locale';
import {
  ArrowLeft, Phone, Copy, Check, Truck, MapPin, Package,
  CreditCard, FileText, Clock, Plus, Loader2, MessageSquare,
  ChevronDown, ExternalLink, Hash, User,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import {
  updateOrderStatus, addPayment, addExpense, addComment, updateDelivery,
} from '@/app/(admin)/orders/[id]/order-actions-server';

/* ═══ Types ═══ */

interface OrderFull {
  id: string;
  order_number: number;
  status: string;
  payment_status: string;
  source: string;
  total_amount: number;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  city_name: string | null;
  warehouse_name: string | null;
  np_ttn: string | null;
  np_delivery_cost: number | null;
  notes: string | null;
  manager_comment: string | null;
  delivery_type: string | null;
  delivery_status: string | null;
  recipient_name: string | null;
  recipient_phone: string | null;
  keycrm_order_id: number | null;
  created_at: string;
  confirmed_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  canceled_at: string | null;
  order_items: Array<{ id: string; product_name: string; quantity: number; price_at_order: number }>;
  payments: Array<{ id: string; amount: number; method: string; status: string; comment: string | null; paid_at: string | null; created_at: string }>;
  audit_log: Array<{ id: string; action: string; field_name: string | null; old_value: string | null; new_value: string | null; comment: string | null; created_by_name: string | null; created_at: string }>;
  expenses: Array<{ id: string; name: string; amount: number; comment: string | null; created_at: string }>;
}

const money = (n: number | string) => Number(n).toLocaleString('uk-UA');
const fmtDate = (d: string) => format(new Date(d), 'dd MMM yyyy, HH:mm', { locale: uk });

const STATUS_LABELS: Record<string, string> = {
  pending: 'Нове', confirmed: 'Підтверджено', processing: 'В обробці',
  shipped: 'Відправлено', delivered: 'Доставлено', canceled: 'Скасовано',
};
const STATUS_DOTS: Record<string, string> = {
  pending: 'bg-[#f59e0b]', confirmed: 'bg-[#3b82f6]', processing: 'bg-[#6366f1]',
  shipped: 'bg-[#8b5cf6]', delivered: 'bg-[#10b981]', canceled: 'bg-[#94a3b8]',
};
const TRANSITIONS: Record<string, string[]> = {
  pending: ['confirmed', 'canceled'], confirmed: ['processing', 'canceled'],
  processing: ['shipped', 'canceled'], shipped: ['delivered'], delivered: [], canceled: [],
};
const PAY_LABELS: Record<string, { label: string; style: string }> = {
  unpaid: { label: 'Не оплачено', style: 'text-[#dc2626] bg-[#fef2f2] border-[#fecaca]' },
  partial: { label: 'Частково', style: 'text-[#f59e0b] bg-[#fffbeb] border-[#fde68a]' },
  paid: { label: 'Оплачено', style: 'text-[#16a34a] bg-[#f0fdf4] border-[#bbf7d0]' },
  refunded: { label: 'Повернення', style: 'text-[#94a3b8] bg-[#f8fafc] border-[#e2e8f0]' },
};
const METHOD_LABELS: Record<string, string> = {
  cash: 'Готівка', card: 'Картка', online: 'Онлайн', bank_transfer: 'Переказ',
};

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500); }}
      className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded hover:bg-[#f1f5f9] text-[#94a3b8] hover:text-[#475569]">
      {ok ? <Check className="h-3 w-3 text-[#3b82f6]" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

function SectionTitle({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="h-4 w-4 text-[#94a3b8]" />
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#94a3b8]">{children}</h3>
    </div>
  );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('rounded-lg border border-[#e2e8f0] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]', className)}>{children}</div>;
}

function DL({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-[#f1f5f9] last:border-0">
      <span className="text-[13px] text-[#94a3b8]">{label}</span>
      <span className="text-[13px] text-[#334155]">{children}</span>
    </div>
  );
}

/* ═══ Main Component ═══ */

export function OrderCard({ order }: { order: OrderFull }) {
  const [tab, setTab] = useState<'info' | 'payments' | 'history'>('info');
  const [isPending, startTransition] = useTransition();
  const [showPayForm, setShowPayForm] = useState(false);
  const [showExpForm, setShowExpForm] = useState(false);
  const [commentText, setCommentText] = useState(order.manager_comment ?? '');
  const router = useRouter();

  const name = [order.first_name, order.last_name].filter(Boolean).join(' ') || 'Невідомий';
  const itemsSum = order.order_items.reduce((s, i) => s + i.quantity * Number(i.price_at_order), 0);
  const totalPaid = order.payments.filter(p => p.status === 'paid').reduce((s, p) => s + Number(p.amount), 0);
  const totalExpenses = order.expenses.reduce((s, e) => s + Number(e.amount), 0);
  const profit = Number(order.total_amount) - totalExpenses;
  const allowed = TRANSITIONS[order.status] ?? [];

  const act = (fn: () => Promise<void>) => startTransition(async () => { await fn(); router.refresh(); });

  return (
    <div className="max-w-[1400px] space-y-5">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/orders" className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#e2e8f0] bg-white text-[#94a3b8] hover:text-[#334155] hover:bg-[#f8fafc] transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-[20px] font-semibold text-[#0f172a]">Замовлення #{order.order_number}</h1>
            <span className="inline-flex items-center gap-1.5 text-[13px] text-[#475569]">
              <span className={cn('h-[6px] w-[6px] rounded-full', STATUS_DOTS[order.status])} />
              {STATUS_LABELS[order.status] ?? order.status}
            </span>
            {(() => { const p = PAY_LABELS[order.payment_status]; return p ? <span className={cn('px-2 py-0.5 rounded border text-[11px] font-semibold', p.style)}>{p.label}</span> : null; })()}
          </div>
          <p className="text-[13px] text-[#94a3b8]">{fmtDate(order.created_at)}</p>
        </div>

        {/* Status changer */}
        {allowed.length > 0 && (
          <div className="flex gap-2">
            {allowed.map(s => (
              <button key={s} onClick={() => act(() => updateOrderStatus(order.id, s))} disabled={isPending}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-medium disabled:opacity-50 transition-colors',
                  s === 'canceled' ? 'border border-[#e2e8f0] text-[#94a3b8] hover:bg-[#f8fafc]' : 'bg-[#0f172a] text-white hover:bg-[#1e293b]',
                )}>
                {isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                <span className={cn('h-[5px] w-[5px] rounded-full', s === 'canceled' ? 'bg-[#94a3b8]' : 'bg-white/60')} />
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[#e2e8f0]">
        {([['info', 'Деталі'], ['payments', 'Оплати'], ['history', 'Історія']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={cn('px-4 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors',
              tab === key ? 'border-[#0f172a] text-[#0f172a]' : 'border-transparent text-[#94a3b8] hover:text-[#64748b]')}>
            {label}
            {key === 'payments' && order.payments.length > 0 && (
              <span className="ml-1.5 text-[10px] bg-[#f1f5f9] rounded-full px-1.5 py-0.5 text-[#64748b]">{order.payments.length}</span>
            )}
            {key === 'history' && order.audit_log.length > 0 && (
              <span className="ml-1.5 text-[10px] bg-[#f1f5f9] rounded-full px-1.5 py-0.5 text-[#64748b]">{order.audit_log.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab: Info */}
      {tab === 'info' && (
        <div className="grid grid-cols-3 gap-4">
          {/* Col 1: Order + Client */}
          <div className="space-y-4">
            <Card>
              <SectionTitle icon={Hash}>Замовлення</SectionTitle>
              <DL label="Номер">{order.order_number}</DL>
              <DL label="Дата">{fmtDate(order.created_at)}</DL>
              <DL label="Джерело">{order.source === 'app' ? 'Додаток' : order.source}</DL>
              {order.keycrm_order_id && <DL label="KeyCRM">#{order.keycrm_order_id}</DL>}
            </Card>

            <Card>
              <SectionTitle icon={User}>Покупець</SectionTitle>
              <div className="flex items-center gap-3 mb-3">
                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[#e2e8f0] to-[#cbd5e1] flex items-center justify-center text-[14px] font-semibold text-[#475569]">
                  {(order.first_name?.[0] ?? '?').toUpperCase()}
                </div>
                <div>
                  <p className="text-[14px] font-medium text-[#0f172a]">{name}</p>
                  {order.city_name && <p className="text-[12px] text-[#94a3b8]">{order.city_name}</p>}
                </div>
              </div>
              {order.phone && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] text-[#94a3b8]">Телефон</span>
                    <span className="flex items-center text-[13px] font-mono text-[#334155]">{order.phone}<CopyBtn text={order.phone} /></span>
                  </div>
                  <div className="flex gap-2">
                    <a href={`tel:${order.phone}`} className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-[#e2e8f0] h-8 text-[12px] font-medium text-[#475569] hover:bg-[#f8fafc]">
                      <Phone className="h-3.5 w-3.5" /> Зателефонувати
                    </a>
                  </div>
                </div>
              )}
            </Card>

            {/* Comment */}
            <Card>
              <SectionTitle icon={MessageSquare}>Коментар</SectionTitle>
              <textarea
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                placeholder="Додати коментар..."
                className="w-full rounded-md border border-[#e2e8f0] bg-[#f8fafc] px-3 py-2 text-[13px] text-[#334155] placeholder:text-[#cbd5e1] focus:outline-none focus:border-[#94a3b8] resize-none h-20"
              />
              {commentText !== (order.manager_comment ?? '') && (
                <button onClick={() => act(() => addComment(order.id, commentText))} disabled={isPending}
                  className="mt-2 rounded-lg bg-[#0f172a] text-white px-3 py-1.5 text-[12px] font-medium hover:bg-[#1e293b] disabled:opacity-50">
                  Зберегти
                </button>
              )}
            </Card>
          </div>

          {/* Col 2: Delivery + Items */}
          <div className="space-y-4">
            <Card>
              <SectionTitle icon={Truck}>Доставка</SectionTitle>
              <DL label="Служба">Нова Пошта</DL>
              <DL label="Тип">{order.delivery_type === 'courier' ? 'Кур\'єр' : 'До відділення'}</DL>
              <DL label="Отримувач">{order.recipient_name || name}</DL>
              <DL label="Телефон">{order.recipient_phone || order.phone || '—'}</DL>
              <div className="py-1.5">
                <span className="text-[13px] text-[#94a3b8]">Адреса</span>
                <p className="text-[12px] text-[#475569] mt-0.5 leading-relaxed">{order.warehouse_name || '—'}</p>
                {order.city_name && <p className="text-[11px] text-[#94a3b8] flex items-center gap-1 mt-0.5"><MapPin className="h-3 w-3" />{order.city_name}</p>}
              </div>
              <DL label="Трекінг">
                {order.np_ttn ? (
                  <span className="flex items-center gap-1">
                    <span className="rounded border border-[#e2e8f0] bg-[#f8fafc] px-2 py-0.5 text-[11px] font-mono">{order.np_ttn}</span>
                    <CopyBtn text={order.np_ttn} />
                  </span>
                ) : '—'}
              </DL>
            </Card>

            <Card>
              <SectionTitle icon={Package}>Товари ({order.order_items.length})</SectionTitle>
              <div className="space-y-2">
                {order.order_items.map(item => (
                  <div key={item.id} className="flex items-center justify-between py-1.5 border-b border-[#f1f5f9] last:border-0">
                    <div>
                      <p className="text-[13px] text-[#334155]">{item.product_name}</p>
                      <p className="text-[11px] text-[#94a3b8]">{item.quantity} × {money(item.price_at_order)} ₴</p>
                    </div>
                    <span className="text-[13px] font-medium text-[#0f172a] tabular-nums">{money(item.quantity * Number(item.price_at_order))} ₴</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-[#e2e8f0] space-y-1 text-[13px]">
                <div className="flex justify-between"><span className="text-[#94a3b8]">Товари</span><span className="tabular-nums">{money(itemsSum)} ₴</span></div>
                {order.np_delivery_cost && Number(order.np_delivery_cost) > 0 && (
                  <div className="flex justify-between"><span className="text-[#94a3b8]">Доставка</span><span className="tabular-nums">{money(order.np_delivery_cost)} ₴</span></div>
                )}
                <div className="flex justify-between font-semibold text-[#0f172a]"><span>Всього</span><span className="tabular-nums">{money(order.total_amount)} ₴</span></div>
              </div>
            </Card>
          </div>

          {/* Col 3: Finance */}
          <div className="space-y-4">
            <Card>
              <SectionTitle icon={CreditCard}>Фінанси</SectionTitle>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="rounded-lg bg-[#f8fafc] p-3 text-center">
                  <p className="text-[11px] text-[#94a3b8]">Оплачено</p>
                  <p className="text-[18px] font-bold text-[#0f172a] tabular-nums">{money(totalPaid)} ₴</p>
                </div>
                <div className="rounded-lg bg-[#f8fafc] p-3 text-center">
                  <p className="text-[11px] text-[#94a3b8]">Прибуток</p>
                  <p className={cn('text-[18px] font-bold tabular-nums', profit >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]')}>{money(profit)} ₴</p>
                </div>
              </div>
              <DL label="Сума замовлення">{money(order.total_amount)} ₴</DL>
              <DL label="Оплачено">{money(totalPaid)} ₴</DL>
              <DL label="Витрати">{money(totalExpenses)} ₴</DL>
              <DL label="Залишок">{money(Number(order.total_amount) - totalPaid)} ₴</DL>
            </Card>

            {/* Expenses */}
            <Card>
              <div className="flex items-center justify-between mb-3">
                <SectionTitle icon={FileText}>Витрати</SectionTitle>
                <button onClick={() => setShowExpForm(!showExpForm)} className="text-[12px] text-[#3b82f6] hover:text-[#2563eb] font-medium flex items-center gap-1">
                  <Plus className="h-3 w-3" /> Додати
                </button>
              </div>
              {showExpForm && <ExpenseForm orderId={order.id} onDone={() => { setShowExpForm(false); router.refresh(); }} />}
              {order.expenses.length > 0 ? order.expenses.map(e => (
                <div key={e.id} className="flex justify-between py-1.5 border-b border-[#f1f5f9] last:border-0 text-[13px]">
                  <span className="text-[#475569]">{e.name}</span>
                  <span className="font-medium text-[#334155] tabular-nums">{money(e.amount)} ₴</span>
                </div>
              )) : <p className="text-[12px] text-[#cbd5e1]">Немає витрат</p>}
            </Card>
          </div>
        </div>
      )}

      {/* Tab: Payments */}
      {tab === 'payments' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-[14px] font-semibold text-[#0f172a]">Оплати</h3>
            <button onClick={() => setShowPayForm(!showPayForm)}
              className="flex items-center gap-1.5 rounded-lg bg-[#0f172a] text-white px-3 py-1.5 text-[12px] font-medium hover:bg-[#1e293b]">
              <Plus className="h-3.5 w-3.5" /> Додати оплату
            </button>
          </div>
          {showPayForm && <PaymentForm orderId={order.id} maxAmount={Number(order.total_amount) - totalPaid} onDone={() => { setShowPayForm(false); router.refresh(); }} />}
          <Card>
            {order.payments.length > 0 ? (
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-[#94a3b8] border-b border-[#f1f5f9]">
                    <th className="pb-2 text-left font-medium">Дата</th>
                    <th className="pb-2 text-left font-medium">Спосіб</th>
                    <th className="pb-2 text-left font-medium">Статус</th>
                    <th className="pb-2 text-right font-medium">Сума</th>
                  </tr>
                </thead>
                <tbody>
                  {order.payments.map(p => (
                    <tr key={p.id} className="border-b border-[#f1f5f9] last:border-0">
                      <td className="py-2 text-[#475569]">{fmtDate(p.created_at)}</td>
                      <td className="py-2 text-[#475569]">{METHOD_LABELS[p.method] ?? p.method}</td>
                      <td className="py-2">
                        <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-semibold border',
                          p.status === 'paid' ? 'text-[#16a34a] bg-[#f0fdf4] border-[#bbf7d0]' : 'text-[#94a3b8] bg-[#f8fafc] border-[#e2e8f0]')}>
                          {p.status === 'paid' ? 'Оплачено' : p.status}
                        </span>
                      </td>
                      <td className="py-2 text-right font-medium text-[#0f172a] tabular-nums">{money(p.amount)} ₴</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="text-[13px] text-[#cbd5e1] text-center py-8">Оплат поки немає</p>}
          </Card>
        </div>
      )}

      {/* Tab: History */}
      {tab === 'history' && (
        <Card>
          <SectionTitle icon={Clock}>Історія змін</SectionTitle>
          {order.audit_log.length > 0 ? (
            <div className="space-y-0">
              {order.audit_log.map((entry, i) => (
                <div key={entry.id} className="flex gap-3 py-2.5 border-b border-[#f1f5f9] last:border-0">
                  <div className="flex flex-col items-center">
                    <div className="h-2 w-2 rounded-full bg-[#cbd5e1] mt-1.5" />
                    {i < order.audit_log.length - 1 && <div className="w-px flex-1 bg-[#f1f5f9] mt-1" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-[13px]">
                      <span className="font-medium text-[#334155]">{entry.created_by_name ?? 'System'}</span>
                      <span className="text-[#94a3b8]">·</span>
                      <span className="text-[12px] text-[#94a3b8]">{fmtDate(entry.created_at)}</span>
                    </div>
                    <p className="text-[13px] text-[#64748b] mt-0.5">
                      {entry.action === 'status_change' && <>Змінив статус: <span className="font-medium">{STATUS_LABELS[entry.old_value ?? ''] ?? entry.old_value}</span> → <span className="font-medium">{STATUS_LABELS[entry.new_value ?? ''] ?? entry.new_value}</span></>}
                      {entry.action === 'payment_added' && <>Додав оплату: <span className="font-medium">{entry.new_value}</span></>}
                      {entry.action === 'expense_added' && <>Додав витрату: <span className="font-medium">{entry.new_value}</span></>}
                      {entry.action === 'comment' && <>Коментар: <span className="font-medium">{entry.new_value}</span></>}
                      {entry.action === 'delivery_update' && <>Оновив доставку: {entry.field_name} → <span className="font-medium">{entry.new_value}</span></>}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="text-[13px] text-[#cbd5e1] text-center py-8">Історія порожня</p>}
        </Card>
      )}
    </div>
  );
}

/* ═══ Forms ═══ */

function PaymentForm({ orderId, maxAmount, onDone }: { orderId: string; maxAmount: number; onDone: () => void }) {
  const [isPending, startTransition] = useTransition();
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      await addPayment(orderId, {
        amount: Number(fd.get('amount')),
        method: fd.get('method') as string,
        status: 'paid',
        comment: fd.get('comment') as string || undefined,
      });
      onDone();
    });
  };
  return (
    <Card className="!bg-[#f8fafc]">
      <form onSubmit={handleSubmit} className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-[11px] text-[#94a3b8] font-medium">Сума</label>
          <input name="amount" type="number" step="0.01" defaultValue={maxAmount > 0 ? maxAmount : ''} required
            className="mt-1 w-full rounded-md border border-[#e2e8f0] px-3 py-1.5 text-[13px] focus:outline-none focus:border-[#94a3b8]" />
        </div>
        <div>
          <label className="text-[11px] text-[#94a3b8] font-medium">Спосіб</label>
          <select name="method" className="mt-1 w-full rounded-md border border-[#e2e8f0] px-3 py-1.5 text-[13px] focus:outline-none focus:border-[#94a3b8]">
            <option value="cash">Готівка</option>
            <option value="card">Картка</option>
            <option value="online">Онлайн</option>
            <option value="bank_transfer">Переказ</option>
          </select>
        </div>
        <div>
          <label className="text-[11px] text-[#94a3b8] font-medium">Коментар</label>
          <input name="comment" type="text" placeholder="Необов'язково"
            className="mt-1 w-full rounded-md border border-[#e2e8f0] px-3 py-1.5 text-[13px] placeholder:text-[#cbd5e1] focus:outline-none focus:border-[#94a3b8]" />
        </div>
        <div className="col-span-3 flex gap-2 justify-end">
          <button type="button" onClick={onDone} className="px-3 py-1.5 text-[12px] text-[#64748b] hover:text-[#334155]">Скасувати</button>
          <button type="submit" disabled={isPending}
            className="rounded-lg bg-[#0f172a] text-white px-4 py-1.5 text-[12px] font-medium hover:bg-[#1e293b] disabled:opacity-50">
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Зберегти'}
          </button>
        </div>
      </form>
    </Card>
  );
}

function ExpenseForm({ orderId, onDone }: { orderId: string; onDone: () => void }) {
  const [isPending, startTransition] = useTransition();
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      await addExpense(orderId, {
        name: fd.get('name') as string,
        amount: Number(fd.get('amount')),
        comment: fd.get('comment') as string || undefined,
      });
      onDone();
    });
  };
  return (
    <form onSubmit={handleSubmit} className="flex gap-2 mb-3">
      <input name="name" required placeholder="Назва" className="flex-1 rounded-md border border-[#e2e8f0] px-2 py-1.5 text-[12px] placeholder:text-[#cbd5e1] focus:outline-none focus:border-[#94a3b8]" />
      <input name="amount" type="number" step="0.01" required placeholder="Сума" className="w-24 rounded-md border border-[#e2e8f0] px-2 py-1.5 text-[12px] placeholder:text-[#cbd5e1] focus:outline-none focus:border-[#94a3b8]" />
      <button type="submit" disabled={isPending} className="rounded-lg bg-[#0f172a] text-white px-3 py-1.5 text-[12px] font-medium hover:bg-[#1e293b] disabled:opacity-50">
        {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Додати'}
      </button>
    </form>
  );
}
