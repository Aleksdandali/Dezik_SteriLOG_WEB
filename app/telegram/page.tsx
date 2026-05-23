'use client';

import { useState, useEffect, useCallback, useRef, Component, type ReactNode } from 'react';

// Error boundary to prevent full page crash
class ErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  constructor(props: { children: ReactNode }) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(err: Error) { return { error: err.message }; }
  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-8 text-center">
          <div className="text-4xl">⚠️</div>
          <p className="text-[15px] font-semibold">Помилка додатку</p>
          <p className="text-[13px] text-[#9CA3AF]">{this.state.error}</p>
          <button onClick={() => this.setState({ error: null })} className="px-6 py-2 bg-[#4b569e] text-white rounded-xl font-semibold">Спробувати знову</button>
        </div>
      );
    }
    return this.props.children;
  }
}
import type {
  OpsStaff,
  OpsLocation,
  ExpenseCategory,
  SalesChannel,
  PaymentType,
  SupplierPaymentMethod,
  SalaryType,
  AuditItemType,
  ProductionStage,
  BagSize,
  BagMaterial,
} from '@/lib/telegram/types';
import {
  LOCATION_LABELS,
  EXPENSE_CATEGORY_LABELS,
  CHANNEL_LABELS,
  PAYMENT_TYPE_LABELS,
  SUPPLIER_METHOD_LABELS,
  BAG_SIZE_LABELS,
  BAG_MATERIAL_LABELS,
  PRODUCTION_STAGE_LABELS,
} from '@/lib/telegram/types';
import { useOpsEvent } from '@/lib/telegram/realtime-client';
import {
  type AuditProduct,
  getAuditProducts,
} from '@/lib/telegram/audit-catalog';

// ─── Types ────────────────────────────────────────────
type View =
  | 'menu'
  | 'expense'
  | 'receiving'
  | 'movement'
  | 'cash-report'
  | 'supplier-payment'
  | 'salary'
  | 'production'
  | 'warehouse'
  | 'shipments'
  | 'inventory-audit'
  | 'reports'
  | 'analytics'
  | 'history'
  | 'team'
  | 'orders'
  | 'fop-docs'
  | 'messages'
  | 'chat-detail'
  | 'stock-dashboard'
  | 'bot-clients'
  | 'retention-preview'
  | 'all-clients'
  | 'client-detail';

interface TelegramWebApp {
  initData: string;
  ready: () => void;
  expand: () => void;
  close: () => void;
  BackButton: {
    show: () => void;
    hide: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };
  HapticFeedback: {
    notificationOccurred: (type: 'success' | 'error' | 'warning') => void;
    impactOccurred: (style: 'light' | 'medium' | 'heavy') => void;
  };
  openTelegramLink: (url: string) => void;
}

declare global {
  interface Window {
    Telegram?: { WebApp: TelegramWebApp };
  }
}

// ─── API Helper ───────────────────────────────────────
function getInitData(): string {
  return window.Telegram?.WebApp?.initData ?? '';
}

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api/telegram${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-telegram-init-data': getInitData(),
      ...options?.headers,
    },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? 'Request failed');
  return json;
}

async function uploadPhoto(file: File): Promise<string> {
  let uploadBlob: Blob = file;

  try {
    const img = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const maxW = 1200;
    const scale = img.width > maxW ? maxW / img.width : 1;
    canvas.width = img.width * scale;
    canvas.height = img.height * scale;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    uploadBlob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.8)
    );
  } catch {
    // createImageBitmap failed (some Android devices) — upload original file
  }

  const formData = new FormData();
  formData.append('photo', uploadBlob, 'photo.jpg');

  const res = await fetch('/api/telegram/upload', {
    method: 'POST',
    headers: { 'x-telegram-init-data': getInitData() },
    body: formData,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? 'Upload failed');
  return json.url;
}

// ─── Design Tokens ────────────────────────────────────
const C = {
  primary: '#4b569e',
  primaryLight: '#eceef5',
  primaryDark: '#363f75',
  primaryShadow: 'rgba(75,86,158,0.25)',
  text: '#111827',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',
  border: '#E5E7EB',
  bg: '#F8FAFC',
  card: '#FFFFFF',
  success: '#10B981',
  successLight: '#D1FAE5',
  danger: '#EF4444',
  dangerLight: '#FEE2E2',
  warning: '#F59E0B',
};

// ─── Shared Components ───────────────────────────────
function Btn({
  children,
  onClick,
  variant = 'primary',
  disabled,
  className = '',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  className?: string;
}) {
  const base = 'rounded-2xl font-semibold transition-all duration-200 active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none';
  const variants = {
    primary: 'bg-gradient-to-b from-[#4b569e] to-[#363f75] text-white shadow-lg shadow-[#4b569e]/25',
    secondary: 'bg-[#eceef5] text-[#363f75]',
    ghost: 'bg-transparent text-[#4b569e]',
  };
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
}

function ChipGroup<T extends string>({
  options,
  labels,
  value,
  onChange,
  multiple = false,
}: {
  options: T[];
  labels: Record<T, string>;
  value: T | T[] | null;
  onChange: (val: T | T[]) => void;
  multiple?: boolean;
}) {
  const selected = Array.isArray(value) ? value : value ? [value] : [];
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const isActive = selected.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => {
              window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
              if (multiple) {
                const next = isActive ? selected.filter((v) => v !== opt) : [...selected, opt];
                onChange(next as T[]);
              } else {
                onChange(opt);
              }
            }}
            className={`px-4 py-2.5 rounded-2xl text-[13px] font-semibold transition-all duration-200 ${
              isActive
                ? 'bg-[#4b569e] text-white shadow-md shadow-[#4b569e]/25 scale-[1.02]'
                : 'bg-white text-[#363f75] border border-[#E5E7EB] hover:border-[#4b569e]/30'
            }`}
          >
            {labels[opt]}
          </button>
        );
      })}
    </div>
  );
}

function PhotoCapture({
  photoUrl,
  onCapture,
}: {
  photoUrl: string | null;
  onCapture: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onCapture(f);
        }}
      />
      {photoUrl ? (
        <div className="relative group">
          <img src={photoUrl} alt="Фото" className="w-full h-44 object-cover rounded-2xl border border-[#E5E7EB]" />
          <div className="absolute inset-0 bg-black/0 group-active:bg-black/10 rounded-2xl transition-all" />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="absolute bottom-3 right-3 bg-white/90 backdrop-blur-sm rounded-xl px-3 py-1.5 text-xs font-semibold text-[#363f75] shadow-sm border border-white/50"
          >
            Змінити
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full py-8 rounded-2xl border-2 border-dashed border-[#4b569e]/30 bg-[#eceef5]/50
            flex flex-col items-center gap-2 active:scale-[0.97] transition-all"
        >
          <div className="w-12 h-12 rounded-full bg-[#eceef5] flex items-center justify-center">
            <svg className="w-6 h-6 text-[#4b569e]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
            </svg>
          </div>
          <span className="text-sm font-semibold text-[#4b569e]">Зробити фото</span>
          <span className="text-xs text-[#9CA3AF]">Натисніть щоб відкрити камеру</span>
        </button>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="text-[13px] font-semibold text-[#6B7280]">{label}</label>
      {children}
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full h-[52px] px-4 rounded-2xl border border-[#E5E7EB] bg-white text-[#111827] text-base
        focus:border-[#4b569e] focus:ring-2 focus:ring-[#4b569e]/10 focus:outline-none transition-all placeholder:text-[#C5C9D1] ${props.className ?? ''}`}
    />
  );
}

function SuccessScreen({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
    const t = setTimeout(onDone, 1500);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5">
      <div className="w-24 h-24 rounded-full bg-gradient-to-b from-[#D1FAE5] to-[#A7F3D0] flex items-center justify-center shadow-lg shadow-[#10B981]/20">
        <svg className="w-12 h-12 text-[#059669]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <div className="text-center">
        <p className="text-xl font-bold text-[#059669]">Збережено!</p>
        <p className="text-sm text-[#6B7280] mt-1">Дані успішно записані</p>
      </div>
    </div>
  );
}

/** Format time elapsed since a date */
function timeAgo(dateStr: string): { text: string; hours: number; isOverdue: boolean; isCritical: boolean } {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const hours = Math.floor(diffMs / 3600000);
  const mins = Math.floor((diffMs % 3600000) / 60000);

  let text: string;
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    text = `${days} д ${hours % 24} год`;
  } else if (hours >= 1) {
    text = `${hours} год ${mins} хв`;
  } else {
    text = `${mins} хв`;
  }

  return { text, hours, isOverdue: hours >= 6, isCritical: hours >= 24 };
}

function PageHeader({ icon, title, subtitle }: { icon: string; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <div className="w-11 h-11 rounded-2xl bg-[#eceef5] flex items-center justify-center text-xl">
        {icon}
      </div>
      <div>
        <h2 className="text-[17px] font-bold text-[#111827]">{title}</h2>
        {subtitle && <p className="text-[13px] text-[#9CA3AF]">{subtitle}</p>}
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────
export default function TelegramPageWrapper() {
  return <ErrorBoundary><TelegramPage /></ErrorBoundary>;
}

function TelegramPage() {
  const [view, setView] = useState<View>('menu');
  const [chatConvId, setChatConvId] = useState<string | null>(null);
  const [clientDetailId, setClientDetailId] = useState<number | null>(null);
  const [clientDetailBackView, setClientDetailBackView] = useState<View>('all-clients');
  const [staff, setStaff] = useState<OpsStaff | null>(null);
  const [allStaff, setAllStaff] = useState<OpsStaff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Auth
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      try { (tg as unknown as { requestFullscreen?: () => void }).requestFullscreen?.(); } catch {}
      try { (tg as unknown as { disableVerticalSwipes?: () => void }).disableVerticalSwipes?.(); } catch {}
      // Home screen — only suggest if not yet added
      try {
        const tw = tg as unknown as { checkHomeScreenStatus?: (cb?: (s: string) => void) => void; addToHomeScreen?: () => void; onEvent?: (e: string, cb: (s: string) => void) => void };
        if (tw.checkHomeScreenStatus) {
          tw.onEvent?.('homeScreenChecked', (status: string) => {
            if (status === 'missed' && !localStorage.getItem('dezik_hs_asked')) {
              localStorage.setItem('dezik_hs_asked', '1');
              tw.addToHomeScreen?.();
            }
          });
          tw.checkHomeScreenStatus();
        }
      } catch {}
    }

    (async () => {
      try {
        const initData = tg?.initData;
        if (!initData) {
          setError('Відкрийте через Telegram');
          setLoading(false);
          return;
        }
        const res = await fetch('/api/telegram/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initData }),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? 'Auth failed');
          setLoading(false);
          return;
        }
        setStaff(json.staff);
      } catch {
        setError('Помилка підключення');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Fetch all staff (for salary form)
  useEffect(() => {
    if (!staff) return;
    api<{ data: OpsStaff[] }>('/staff').then((r) => setAllStaff(r.data)).catch(() => {});
  }, [staff]);

  // Back button
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg) return;

    const handleBack = () => setView('menu');

    if (view !== 'menu') {
      tg.BackButton.show();
      tg.BackButton.onClick(handleBack);
    } else {
      tg.BackButton.hide();
    }

    return () => {
      tg.BackButton.offClick(handleBack);
    };
  }, [view]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-b from-[#4b569e] to-[#363f75] flex items-center justify-center text-white font-bold text-2xl shadow-lg shadow-[#4b569e]/30">
          D
        </div>
        <div className="w-6 h-6 border-2 border-[#4b569e] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-8 text-center">
        <div className="w-16 h-16 rounded-full bg-[#FEE2E2] flex items-center justify-center">
          <svg className="w-8 h-8 text-[#EF4444]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <p className="text-[15px] font-semibold text-[#111827]">{error}</p>
      </div>
    );
  }

  if (!staff) return null;

  return (
    <div className="px-4 py-5 pb-20 max-w-lg mx-auto">
      {view === 'menu' && (
        <MainMenu staff={staff} onNavigate={setView} />
      )}
      {view === 'expense' && (
        <ExpenseForm staff={staff} onDone={() => setView('menu')} />
      )}
      {view === 'receiving' && (
        <ReceivingForm staff={staff} onDone={() => setView('menu')} />
      )}
      {view === 'movement' && (
        <MovementForm staff={staff} onDone={() => setView('menu')} />
      )}
      {view === 'warehouse' && (
        <WarehouseView staff={staff} />
      )}
      {view === 'shipments' && (
        <ShipmentsView />
      )}
      {view === 'production' && (
        <ProductionForm staff={staff} onDone={() => setView('menu')} />
      )}
      {view === 'cash-report' && (
        <CashReportForm onDone={() => setView('menu')} />
      )}
      {view === 'supplier-payment' && (
        <SupplierPaymentForm onDone={() => setView('menu')} />
      )}
      {view === 'inventory-audit' && (
        <InventoryAuditForm staff={staff} onDone={() => setView('menu')} />
      )}
      {view === 'salary' && (
        <SalaryForm allStaff={allStaff} onDone={() => setView('menu')} />
      )}
      {view === 'orders' && (
        <OrdersView staff={staff} />
      )}
      {view === 'team' && (
        <TeamView />
      )}
      {view === 'reports' && (
        <ReportView />
      )}
      {view === 'analytics' && (
        <AnalyticsView />
      )}
      {view === 'history' && (
        <HistoryView staff={staff} />
      )}
      {view === 'fop-docs' && (
        <FopDocsView staff={staff} />
      )}
      {view === 'stock-dashboard' && (
        <StockDashboard />
      )}
      {view === 'bot-clients' && (
        <BotClientsView />
      )}
      {view === 'all-clients' && (
        <AllClientsView onClientClick={(id) => { setClientDetailId(id); setClientDetailBackView('all-clients'); setView('client-detail'); }} />
      )}
      {view === 'retention-preview' && (
        <RetentionPreview onClientClick={(id) => { setClientDetailId(id); setClientDetailBackView('retention-preview'); setView('client-detail'); }} />
      )}
      {view === 'client-detail' && clientDetailId && (
        <ClientDetailView buyerId={clientDetailId} onBack={() => setView(clientDetailBackView)} />
      )}
      {(view === 'messages' || view === 'chat-detail') && (
        <MessagesInbox onOpenChat={(id) => { setChatConvId(id); setView('chat-detail'); }} chatConvId={view === 'chat-detail' ? chatConvId : null} onBack={() => setView('messages')} />
      )}
    </div>
  );
}

// ─── Main Menu ────────────────────────────────────────
function MainMenu({
  staff,
  onNavigate,
}: {
  staff: OpsStaff;
  onNavigate: (view: View) => void;
}) {
  const isAdmin = staff.role === 'admin';
  const [shipmentCount, setShipmentCount] = useState(0);
  const [newOrdersCount, setNewOrdersCount] = useState(0);
  const [cashToday, setCashToday] = useState(0);
  const [pendingAuditsCount, setPendingAuditsCount] = useState(0);
  const [unreadMsgCount, setUnreadMsgCount] = useState(0);
  const [botClientsCount, setBotClientsCount] = useState(0);

  const refreshUnread = () => {
    api<{ data: { unread_by_manager: number }[] }>('/chat/conversations').then(r => {
      const total = (r.data ?? []).reduce((sum, c) => sum + (c.unread_by_manager ?? 0), 0);
      setUnreadMsgCount(total);
    }).catch(() => {});
  };

  const refreshPendingAudits = useCallback(() => {
    api<{ data: { status: string }[] }>('/inventory-audit?days=30').then(r => {
      setPendingAuditsCount((r.data ?? []).filter(a => a.status === 'pending').length);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    api<{ count: number }>('/shipments/count').then(r => setShipmentCount(r.count)).catch(() => {});
    fetch('/api/telegram/team?type=bot_clients', { headers: { 'x-telegram-init-data': getInitData() } })
      .then(r => r.json()).then(d => setBotClientsCount((d.data ?? []).length)).catch(() => {});
    refreshUnread();
    api<{ total: number }>('/orders?status=1').then(r => setNewOrdersCount(r.total ?? 0)).catch(() => {});
    api<{ total_sum: number }>('/cash?period=today').then(r => setCashToday(r.total_sum ?? 0)).catch(() => {});
    refreshPendingAudits();
    const interval = setInterval(refreshUnread, 30000);
    return () => clearInterval(interval);
  }, [refreshPendingAudits]);

  // Live: keep the "📝 Переоблік" badge in sync when another device creates
  // a new audit or an admin approves/rejects one.
  useOpsEvent('audit.created', refreshPendingAudits);
  useOpsEvent('audit.reviewed', refreshPendingAudits);

  const sections = staff.visible_sections ?? [];
  const canSee = (view: string) => isAdmin || sections.length === 0 || sections.includes(view);

  const mainItems: { icon: string; label: string; desc: string; view: View; color: string; badge?: number }[] = [
    { icon: '🏭', label: 'Виробництво', desc: 'Друк / Упаковка', view: 'production', color: '#4b569e' },
    { icon: '🚚', label: 'Переміщення', desc: 'Між точками', view: 'movement', color: '#3B82F6' },
    { icon: '📋', label: 'Склад', desc: 'Вхідні / Залишки', view: 'warehouse', color: '#10B981' },
    { icon: '📊', label: 'Залишки', desc: 'Всі локації', view: 'stock-dashboard', color: '#8B5CF6' },
    { icon: '📦', label: 'Приймання', desc: 'Від постачальника', view: 'receiving', color: '#F59E0B' },
    { icon: '📝', label: 'Замовлення', desc: 'Обробка KeyCRM', view: 'orders', color: '#3B82F6', badge: newOrdersCount },
    { icon: '📬', label: 'Відправки', desc: 'На збірку', view: 'shipments', color: '#F59E0B', badge: shipmentCount },
    { icon: '🧾', label: 'Каса', desc: cashToday > 0 ? `${cashToday.toLocaleString('uk-UA')} грн` : 'Продажі', view: 'cash-report', color: '#10B981' },
    { icon: '💰', label: 'Витрати', desc: 'Записати витрату', view: 'expense', color: '#EF4444' },
    { icon: '💬', label: 'Повідомлення', desc: 'Чати з клієнтами', view: 'messages', color: '#4b569e', badge: unreadMsgCount },
  ];

  const secondaryItems: { icon: string; label: string; view: View; adminOnly?: boolean; badge?: number }[] = [
    { icon: '🏦', label: 'Оплати постач.', view: 'supplier-payment' },
    { icon: '📝', label: 'Переоблік', view: 'inventory-audit', badge: pendingAuditsCount },
    { icon: '📋', label: 'Історія', view: 'history' },
    { icon: '💵', label: 'Зарплати', view: 'salary', adminOnly: true },
    { icon: '👥', label: 'Команда', view: 'team', adminOnly: true },
    { icon: '📊', label: 'Звіти P&L', view: 'reports', adminOnly: true },
    { icon: '📈', label: 'Аналітика', view: 'analytics', adminOnly: true },
    { icon: '👤', label: 'Клієнти', view: 'all-clients', adminOnly: true },
    { icon: '🔄', label: 'Retention', view: 'retention-preview', adminOnly: true },
    { icon: '📄', label: 'Документи ФОП', view: 'fop-docs', adminOnly: true },
  ];

  const visibleMain = mainItems.filter(i => canSee(i.view));
  const visibleSecondary = secondaryItems.filter((i) => (!i.adminOnly || isAdmin) && canSee(i.view));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-b from-[#4b569e] to-[#363f75] flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-[#4b569e]/30">
            D
          </div>
          <div>
            <h1 className="text-[17px] font-bold text-[#111827]">Dezik Ops</h1>
            <p className="text-[13px] text-[#9CA3AF]">{staff.name}</p>
          </div>
        </div>
        {isAdmin && (
          <span className="px-2.5 py-1 rounded-lg bg-[#eceef5] text-[11px] font-bold text-[#4b569e] uppercase tracking-wider">
            Admin
          </span>
        )}
      </div>

      {/* Main Actions — 2x2 grid */}
      <div className="grid grid-cols-2 gap-3">
        {visibleMain.map((item) => (
          <button
            key={item.view}
            onClick={() => {
              window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('medium');
              onNavigate(item.view);
            }}
            className="relative overflow-hidden flex flex-col items-start gap-3 bg-white rounded-[20px] p-4 pb-5
              shadow-[0_1px_3px_rgba(0,0,0,0.06),0_6px_16px_rgba(0,0,0,0.04)]
              active:scale-[0.97] active:shadow-none transition-all duration-200 border border-[#F0F0F0]"
          >
            <div
              className="w-11 h-11 rounded-[14px] flex items-center justify-center text-xl"
              style={{ backgroundColor: `${item.color}12` }}
            >
              {item.icon}
            </div>
            <div className="text-left flex-1">
              <p className="text-[15px] font-bold text-[#111827] leading-tight">{item.label}</p>
              <p className="text-[11px] text-[#9CA3AF] mt-0.5">{item.desc}</p>
            </div>
            {item.badge && item.badge > 0 && (
              <span className="absolute top-2 right-2 min-w-[22px] h-[22px] rounded-full bg-[#EF4444] text-white text-[11px] font-bold flex items-center justify-center px-1.5">
                {item.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Secondary Actions — horizontal list */}
      <div>
        <p className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-wider mb-3 px-1">Ще</p>
        <div className="bg-white rounded-[20px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0] divide-y divide-[#F5F5F5]">
          {visibleSecondary.map((item) => (
            <button
              key={item.view}
              onClick={() => {
                window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
                onNavigate(item.view);
              }}
              className="w-full flex items-center gap-3.5 px-4 py-3.5 active:bg-[#F8F8FA] transition-colors first:rounded-t-[20px] last:rounded-b-[20px]"
            >
              <span className="text-xl w-8 text-center">{item.icon}</span>
              <span className="text-[15px] font-medium text-[#111827] flex-1 text-left">{item.label}</span>
              {item.badge && item.badge > 0 ? (
                <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-red-500 text-white text-[12px] font-bold flex items-center justify-center">{item.badge}</span>
              ) : (
                <svg className="w-4 h-4 text-[#C5C9D1]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Bot clients info */}
      {botClientsCount > 0 && (
        <button onClick={() => onNavigate('bot-clients')}
          className="w-full bg-gradient-to-b from-[#4b569e]/5 to-[#4b569e]/10 rounded-[20px] p-4 border border-[#4b569e]/10 active:scale-[0.98] transition-all text-left">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#D1FAE5] flex items-center justify-center">
              <span className="text-lg">👥</span>
            </div>
            <div className="flex-1">
              <p className="text-[14px] font-bold text-[#111827]">Клієнти в боті</p>
              <p className="text-[12px] text-[#6B7280]">{botClientsCount} активних чатів</p>
            </div>
            <svg className="w-4 h-4 text-[#C5C9D1]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </div>
        </button>
      )}
    </div>
  );
}

// ─── Expense Form ─────────────────────────────────────
function ExpenseForm({
  staff,
  onDone,
}: {
  staff: OpsStaff;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<ExpenseCategory | null>(null);
  const [location, setLocation] = useState<OpsLocation | null>(staff.location);
  const [description, setDescription] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handlePhoto = (file: File) => {
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const canSubmit = amount && category && location && photoFile && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const photo_url = await uploadPhoto(photoFile);
      await api('/expenses', {
        method: 'POST',
        body: JSON.stringify({ amount, category, location, description, photo_url }),
      });
      setSuccess(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Помилка');
    } finally {
      setSubmitting(false);
    }
  };

  if (success) return <SuccessScreen onDone={onDone} />;

  return (
    <div className="space-y-5">
      <PageHeader icon="💰" title="Нова витрата" subtitle="Запишіть суму та додайте фото чека" />

      <Field label="Сума (грн)">
        <Input
          type="number"
          inputMode="decimal"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          autoFocus
        />
      </Field>

      <Field label="Категорія">
        <ChipGroup
          options={Object.keys(EXPENSE_CATEGORY_LABELS) as ExpenseCategory[]}
          labels={EXPENSE_CATEGORY_LABELS}
          value={category}
          onChange={(v) => setCategory(v as ExpenseCategory)}
        />
      </Field>

      <Field label="Приміщення">
        <ChipGroup
          options={Object.keys(LOCATION_LABELS) as OpsLocation[]}
          labels={LOCATION_LABELS}
          value={location}
          onChange={(v) => setLocation(v as OpsLocation)}
        />
      </Field>

      <Field label="Опис (необовʼязково)">
        <Input
          placeholder="Що купили?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>

      <Field label="Фото чека">
        <PhotoCapture photoUrl={photoPreview} onCapture={handlePhoto} />
      </Field>

      <Btn
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full py-4 text-base"
      >
        {submitting ? 'Зберігаємо...' : 'Зберегти витрату'}
      </Btn>
    </div>
  );
}

// ─── Receiving Form ───────────────────────────────────
// ─── Receiving Form (multi-item intake) ───────────────
interface ReceivingProduct {
  id: string;
  name: string;
  group: string;
  unit: string;
  icon: string;
  sizes?: string[];
  hasColor?: boolean;
}

const RECEIVING_MALYNOVSKOGO: ReceivingProduct[] = [
  { id: 'paper_wh', name: 'Папір білий', group: 'Папір', unit: 'кг', icon: '📄', sizes: ['240', '300', '340', '400', '440'] },
  { id: 'paper_br', name: 'Папір коричневий', group: 'Папір', unit: 'кг', icon: '📄', sizes: ['240', '300', '340', '400', '440'] },
  { id: 'film', name: 'Плівка ПЕТ', group: 'Плівка', unit: 'кг', icon: '🔲', sizes: ['200', '300', '400'] },
  { id: 'glue', name: 'Клей', group: 'Клей', unit: 'кг', icon: '🪣' },
  { id: 'tape', name: 'Скотч', group: 'Скотч', unit: 'рул', icon: '📏' },
  { id: 'paint', name: 'Фарба для друку', group: 'Фарба', unit: 'л', icon: '🎨' },
];

const RECEIVING_DALNYTSKA: ReceivingProduct[] = [
  { id: 'chem_raw', name: 'Хімічна сировина', group: 'Сировина', unit: 'кг', icon: '🧪' },
  { id: 'tara', name: 'Тара (флакони)', group: 'Тара', unit: 'шт', icon: '📦' },
];

const RECEIVING_AFINA: (ReceivingProduct & { thumb?: string })[] = [
  { id: 'del_1000', name: 'Деланол 1л', group: 'Деланол', unit: 'шт', icon: '💧', thumb: 'https://dezikmanager.api.keycrm.app/file-storage/thumbnails/dezikmanager/uploads/2024-08-27/l5Og6581Z5EQKfHEddkCTSvZV0ZvdrEk.jpg' },
  { id: 'del_500', name: 'Деланол 0.5л', group: 'Деланол', unit: 'шт', icon: '💧', thumb: 'https://dezikmanager.api.keycrm.app/file-storage/remote?url=https%3A%2F%2Fdezik.com.ua%2Fcontent%2Fimages%2F43%2Fsredstvo-dlya-dezinfekcii-pso-i-sterilizacii-instrumentov-delanol-0.5l-81548709033483_%2Bbf330f46b7.jpg' },
  { id: 'del_250', name: 'Деланол 250мл', group: 'Деланол', unit: 'шт', icon: '💧', thumb: 'https://dezikmanager.api.keycrm.app/file-storage/thumbnails/dezikmanager/uploads/2024-08-28/cpl6A0R8JzuYlTTeeoCUyQFRneEqND0Y.jpg' },
  { id: 'del_20', name: 'Деланол 20мл', group: 'Деланол', unit: 'шт', icon: '💧', thumb: 'https://dezikmanager.api.keycrm.app/file-storage/thumbnails/dezikmanager/uploads/2024-08-27/e7oDAbC9u8MX9RobF33xHfQQ78N9PDAq.jpg' },
  { id: 'ins_1000', name: 'Інструм 1л', group: 'Інструм', unit: 'шт', icon: '🧴', thumb: 'https://dezikmanager.api.keycrm.app/file-storage/thumbnails/dezikmanager/uploads/2024-08-27/QEWUZ0bHl5jFd9Euw8KDAYgCy4DsRKJK.jpg' },
  { id: 'ins_500', name: 'Інструм 0.5л', group: 'Інструм', unit: 'шт', icon: '🧴', thumb: 'https://dezikmanager.api.keycrm.app/file-storage/thumbnails/dezikmanager/uploads/2024-08-27/sBN3V6dq8BuFJncaW5jiTXGAWLb5Log2.jpg' },
  { id: 'ins_250', name: 'Інструм 250мл', group: 'Інструм', unit: 'шт', icon: '🧴', thumb: 'https://dezikmanager.api.keycrm.app/file-storage/thumbnails/dezikmanager/uploads/2024-08-27/4CiZg25U8yqT0Zoh6fM4th9JrWo5lFzH.jpg' },
  { id: 'journal', name: 'Журнал стерилізації', group: 'Аксесуари', unit: 'шт', icon: '📓', thumb: 'https://dezikmanager.api.keycrm.app/file-storage/remote?url=https%3A%2F%2Fdezik.com.ua%2Fcontent%2Fimages%2F31%2F75934763628429_%2Bb1eab930d4.jpg' },
  { id: 'oil', name: 'Oil Pro 30мл', group: 'Аксесуари', unit: 'шт', icon: '🫧', thumb: 'https://dezikmanager.api.keycrm.app/file-storage/remote?url=https%3A%2F%2Fdezik.com.ua%2Fcontent%2Fimages%2F45%2F50601119992387_%2B62b26d1e27.png' },
];

const RECEIVING_BY_LOCATION: Record<string, ReceivingProduct[]> = {
  malynovskogo: RECEIVING_MALYNOVSKOGO,
  dalnytska: RECEIVING_DALNYTSKA,
  afina_sklad: RECEIVING_AFINA,
};

function ReceivingForm({
  staff,
  onDone,
}: {
  staff: OpsStaff;
  onDone: () => void;
}) {
  const [location, setLocation] = useState<OpsLocation | null>(null);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [sizes, setSizes] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const isAfina = location === 'afina_sklad';
  const products = location ? (RECEIVING_BY_LOCATION[location] ?? []) : [];

  // For production locations — multi-item builder
  const [prodEntries, setProdEntries] = useState<{ material: string; size: string; qty: string; unit: string; icon: string }[]>([]);
  const [curMaterial, setCurMaterial] = useState<ReceivingProduct | null>(null);
  const [curSize, setCurSize] = useState('');
  const [curQty, setCurQty] = useState('');

  const addProdEntry = () => {
    if (!curMaterial || !curQty) return;
    setProdEntries([...prodEntries, {
      material: curMaterial.name,
      size: curSize,
      qty: curQty,
      unit: curMaterial.unit,
      icon: curMaterial.icon,
    }]);
    setCurMaterial(null);
    setCurSize('');
    setCurQty('');
  };

  const removeProdEntry = (idx: number) => setProdEntries(prodEntries.filter((_, i) => i !== idx));

  const filledItems = isAfina
    ? products.filter(p => quantities[p.id] && parseFloat(quantities[p.id]) > 0)
    : [];

  const handlePhoto = (file: File) => { setPhotoFile(file); setPhotoPreview(URL.createObjectURL(file)); };

  const canSubmitAfina = isAfina && filledItems.length > 0 && photoFile && !submitting;
  const canSubmitProd = !isAfina && prodEntries.length > 0 && photoFile && !submitting;

  const handleSubmit = async () => {
    if (!photoFile || !location) return;
    setSubmitting(true);
    try {
      const photo_url = await uploadPhoto(photoFile);

      if (isAfina) {
        for (const item of filledItems) {
          const desc = `${item.name} — ${quantities[item.id]} ${item.unit}`;
          await api('/receivings', { method: 'POST', body: JSON.stringify({ supplier: desc, quantity: parseInt(quantities[item.id], 10), amount: 0, location, description: desc, photo_url }) });
        }
      } else {
        for (const entry of prodEntries) {
          const size = entry.size ? ` ${entry.size}мм` : '';
          const desc = `${entry.material}${size} — ${entry.qty} ${entry.unit}`;
          await api('/receivings', { method: 'POST', body: JSON.stringify({ supplier: desc, quantity: parseInt(entry.qty, 10), amount: 0, location, description: desc, photo_url }) });
        }
      }
      setSuccess(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Помилка');
    } finally {
      setSubmitting(false);
    }
  };

  if (success) return <SuccessScreen onDone={() => {
    setSuccess(false); setQuantities({}); setSizes({}); setNotes('');
    setPhotoFile(null); setPhotoPreview(null);
  }} />;

  // Level 1: Choose location
  if (!location) {
    return (
      <div className="space-y-5">
        <PageHeader icon="📦" title="Приймання на склад" subtitle="Оберіть склад" />
        <div className="space-y-3">
          {(['malynovskogo', 'dalnytska', 'afina_sklad'] as OpsLocation[]).map(loc => (
            <button key={loc} onClick={() => { window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('medium'); setLocation(loc); }}
              className="w-full flex items-center gap-4 bg-white rounded-[20px] p-5
                shadow-[0_1px_3px_rgba(0,0,0,0.06),0_6px_16px_rgba(0,0,0,0.04)]
                active:scale-[0.97] transition-all border border-[#F0F0F0]">
              <div className="w-12 h-12 rounded-2xl bg-[#eceef5] flex items-center justify-center text-xl">
                {loc === 'malynovskogo' ? '🏭' : loc === 'dalnytska' ? '🧪' : '📦'}
              </div>
              <span className="text-[16px] font-bold text-[#111827]">{LOCATION_LABELS[loc]}</span>
              <svg className="w-5 h-5 text-[#C5C9D1] ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Level 2: Different UI per location type
  const headerBlock = (
    <div className="flex items-center gap-3">
      <button onClick={() => { setLocation(null); setProdEntries([]); setCurMaterial(null); }} className="w-10 h-10 rounded-xl bg-[#eceef5] flex items-center justify-center">
        <svg className="w-4 h-4 text-[#4b569e]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
      </button>
      <div>
        <h2 className="text-[17px] font-bold text-[#111827]">📦 Приймання</h2>
        <p className="text-[13px] text-[#9CA3AF]">{LOCATION_LABELS[location]}</p>
      </div>
    </div>
  );

  // === AFINA: column list with quantities ===
  if (isAfina) {
    const groups = [...new Set(products.map(p => p.group))];
    return (
      <div className="space-y-4">
        {headerBlock}
        {groups.map(group => {
          const gp = products.filter(p => p.group === group);
          return (
            <div key={group} className="bg-white rounded-[20px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0] overflow-hidden">
              <div className="px-4 py-2.5 bg-[#F8FAFC]"><p className="text-[13px] font-bold text-[#4b569e]">{group}</p></div>
              <div className="px-3 py-1">
                {gp.map(p => {
                  const qty = quantities[p.id] ?? '';
                  const hasValue = qty && parseFloat(qty) > 0;
                  return (
                    <div key={p.id} className="py-2.5 flex items-center gap-3 px-1">
                      {(p as typeof RECEIVING_AFINA[0]).thumb ? (
                        <img src={(p as typeof RECEIVING_AFINA[0]).thumb!} alt="" className="w-10 h-10 rounded-lg object-contain bg-white border border-[#E5E7EB] flex-shrink-0 p-0.5" />
                      ) : (
                        <span className="text-[18px] w-10 text-center flex-shrink-0">{p.icon}</span>
                      )}
                      <span className="text-[14px] font-medium text-[#111827] flex-1">{p.name}</span>
                      <input type="number" inputMode="numeric" placeholder="—" value={qty}
                        onChange={(e) => setQuantities(prev => ({ ...prev, [p.id]: e.target.value }))}
                        className={`w-[65px] h-10 px-2 rounded-xl text-center text-[15px] font-bold border transition-all focus:outline-none ${
                          hasValue ? 'border-[#4b569e] bg-[#eceef5]/50 text-[#4b569e]' : 'border-[#E5E7EB] bg-white text-[#111827] focus:border-[#4b569e]'
                        }`} />
                      <span className="text-[11px] text-[#9CA3AF] w-[20px]">{p.unit}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        <Field label="Фото поставки"><PhotoCapture photoUrl={photoPreview} onCapture={handlePhoto} /></Field>
        {filledItems.length > 0 && (
          <div className="bg-[#eceef5]/50 rounded-2xl p-3 space-y-1">
            {filledItems.map(p => (
              <p key={p.id} className="text-[13px] text-[#363f75] text-center">
                <span className="font-bold">{quantities[p.id]}</span> {p.unit} — {p.name}
              </p>
            ))}
          </div>
        )}
        <Btn onClick={handleSubmit} disabled={!canSubmitAfina} className="w-full py-4 text-base">
          {submitting ? 'Зберігаємо...' : `Прийняти (${filledItems.length} поз.)`}
        </Btn>
      </div>
    );
  }

  // === PRODUCTION: step-by-step item builder ===
  return (
    <div className="space-y-5">
      {headerBlock}

      {/* Already added items */}
      {prodEntries.length > 0 && (
        <div className="space-y-2">
          {prodEntries.map((entry, idx) => (
            <div key={idx} className="bg-white rounded-[20px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-[18px]">{entry.icon}</span>
                <div>
                  <p className="text-[14px] font-bold text-[#111827]">{entry.material}{entry.size ? ` ${entry.size}мм` : ''}</p>
                  <p className="text-[14px] font-semibold text-[#4b569e]">{entry.qty} {entry.unit}</p>
                </div>
              </div>
              <button onClick={() => removeProdEntry(idx)} className="text-[12px] text-red-400">✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Add new item form */}
      {!curMaterial ? (
        <div>
          <p className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-wider mb-2 px-1">
            {prodEntries.length > 0 ? 'Додати ще позицію' : 'Оберіть матеріал'}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {products.map((m, idx) => (
              <button key={idx} onClick={() => { window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light'); setCurMaterial(m); }}
                className="flex flex-col items-center gap-1.5 bg-white rounded-[16px] p-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0] active:scale-[0.97] transition-all">
                <span className="text-[22px]">{m.icon}</span>
                <span className="text-[12px] font-bold text-[#111827] text-center leading-tight">{m.name}</span>
                <span className="text-[10px] text-[#9CA3AF]">{m.unit}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-[20px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border-2 border-[#4b569e]/20 space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-[15px] font-bold text-[#111827]">{curMaterial.icon} {curMaterial.name}</p>
            <button onClick={() => { setCurMaterial(null); setCurSize(''); setCurQty(''); }} className="text-[12px] text-[#9CA3AF]">Скасувати</button>
          </div>

          {curMaterial.sizes && (
            <Field label="Ширина (мм)">
              <div className="flex flex-wrap gap-2">
                {curMaterial.sizes.map(size => (
                  <button key={size} onClick={() => setCurSize(curSize === size ? '' : size)}
                    className={`px-4 py-2.5 rounded-2xl text-[14px] font-bold transition-all ${
                      curSize === size ? 'bg-[#4b569e] text-white shadow-md shadow-[#4b569e]/25' : 'bg-[#F8FAFC] text-[#363f75] border border-[#E5E7EB]'
                    }`}>{size}</button>
                ))}
              </div>
            </Field>
          )}

          <Field label={`Кількість (${curMaterial.unit})`}>
            <Input type="number" inputMode="decimal" placeholder="0" value={curQty} onChange={(e) => setCurQty(e.target.value)} autoFocus />
          </Field>

          <Btn onClick={addProdEntry} disabled={!curQty} className="w-full py-3 text-[14px]">
            Додати ✓
          </Btn>
        </div>
      )}

      {/* Photo + submit */}
      {prodEntries.length > 0 && !curMaterial && (
        <>
          <Field label="Фото поставки"><PhotoCapture photoUrl={photoPreview} onCapture={handlePhoto} /></Field>
          <Btn onClick={handleSubmit} disabled={!canSubmitProd} className="w-full py-4 text-base">
            {submitting ? 'Зберігаємо...' : `Прийняти (${prodEntries.length} поз.)`}
          </Btn>
        </>
      )}
    </div>
  );
}

// ─── Movement Form (multi-item) ──────────────────────
interface MovementItem {
  bagSize: BagSize;
  material: BagMaterial;
  packages: string;
}

function MovementForm({
  staff,
  onDone,
}: {
  staff: OpsStaff;
  onDone: () => void;
}) {
  const isFromProduction = staff.location === 'malynovskogo' || staff.location === 'dalnytska';

  const [fromLoc, setFromLoc] = useState<OpsLocation | null>(staff.location ?? 'malynovskogo');
  const [toLoc, setToLoc] = useState<OpsLocation | null>(isFromProduction ? 'afina_sklad' : null);
  const [items, setItems] = useState<MovementItem[]>([
    { bagSize: '100x200', material: 'transparent', packages: '' },
  ]);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [fromStock, setFromStock] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!fromLoc) return;
    api<{ data: { name: string; quantity: number }[] }>(`/stock?location=${fromLoc}`)
      .then(r => {
        const m: Record<string, number> = {};
        for (const s of r.data ?? []) m[s.name] = s.quantity;
        setFromStock(m);
      }).catch(() => setFromStock({}));
  }, [fromLoc]);

  const STOCK_ML: Record<string, string> = { transparent: 'Прозорі', white: 'Білі', brown: 'Коричневі' };
  const getStockForItem = (bagSize: string, material: string) => {
    const key = `${bagSize.replace('x', '×')} ${STOCK_ML[material] ?? material}`;
    return fromStock[key] ?? null;
  };

  const addItem = () => setItems([...items, { bagSize: '100x200', material: 'transparent', packages: '' }]);
  const removeItem = (idx: number) => { if (items.length > 1) setItems(items.filter((_, i) => i !== idx)); };
  const updateItem = (idx: number, field: keyof MovementItem, value: string) => {
    const next = [...items];
    next[idx] = { ...next[idx], [field]: value };
    setItems(next);
  };

  const filledItems = items.filter(i => parseInt(i.packages) > 0);
  const totalPackages = filledItems.reduce((s, i) => s + parseInt(i.packages), 0);

  const handlePhoto = (file: File) => { setPhotoFile(file); setPhotoPreview(URL.createObjectURL(file)); };

  const canSubmit = fromLoc && toLoc && fromLoc !== toLoc && filledItems.length > 0 && photoFile && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const photo_url = await uploadPhoto(photoFile!);
      // Generate shared shipment_id for all items
      const shipment_id = crypto.randomUUID();
      for (const item of filledItems) {
        const desc = `${item.packages} уп. ${item.bagSize} ${BAG_MATERIAL_LABELS[item.material]}`;
        await api('/movements', {
          method: 'POST',
          body: JSON.stringify({
            from_location: fromLoc,
            to_location: toLoc,
            description: desc,
            quantity: parseInt(item.packages, 10),
            photo_url,
            bag_size: item.bagSize,
            material: item.material,
            packages: parseInt(item.packages, 10),
            shipment_id,
          }),
        });
      }
      setSuccess(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Помилка');
    } finally {
      setSubmitting(false);
    }
  };

  if (success) return <SuccessScreen onDone={onDone} />;

  const sizes = Object.keys(BAG_SIZE_LABELS) as BagSize[];
  const materials = Object.keys(BAG_MATERIAL_LABELS) as BagMaterial[];

  return (
    <div className="space-y-5">
      <PageHeader icon="🚚" title="Переміщення" subtitle="Відправка продукції між точками" />

      {/* Route */}
      <div className="bg-white rounded-[20px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0]">
        <p className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-wider mb-1">Звідки</p>
        <ChipGroup options={Object.keys(LOCATION_LABELS) as OpsLocation[]} labels={LOCATION_LABELS} value={fromLoc}
          onChange={(v) => { setFromLoc(v as OpsLocation); if (v === toLoc) setToLoc(null); }} />
        <div className="flex justify-center my-3">
          <div className="w-8 h-8 rounded-full bg-[#eceef5] flex items-center justify-center">
            <svg className="w-4 h-4 text-[#4b569e]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
            </svg>
          </div>
        </div>
        <p className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-wider mb-1">Куди</p>
        <ChipGroup options={(Object.keys(LOCATION_LABELS) as OpsLocation[]).filter((l) => l !== fromLoc)} labels={LOCATION_LABELS}
          value={toLoc} onChange={(v) => setToLoc(v as OpsLocation)} />
      </div>

      {/* Items */}
      {items.map((item, idx) => (
        <div key={idx} className="bg-white rounded-[20px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0] space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-[13px] font-semibold text-[#9CA3AF]">Позиція {idx + 1}</span>
            {items.length > 1 && (
              <button onClick={() => removeItem(idx)} className="text-red-400 text-[13px]">Видалити</button>
            )}
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {sizes.map((size) => (
              <button key={size} type="button" onClick={() => updateItem(idx, 'bagSize', size)}
                className={`py-2.5 rounded-xl text-[12px] font-bold transition-all ${
                  item.bagSize === size ? 'bg-[#4b569e] text-white' : 'bg-[#F8FAFC] text-[#363f75] border border-[#E5E7EB]'
                }`}>{size}</button>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {materials.map((mat) => (
              <button key={mat} type="button" onClick={() => updateItem(idx, 'material', mat)}
                className={`px-3 py-2 rounded-xl text-[12px] font-semibold transition-all ${
                  item.material === mat ? 'bg-[#4b569e] text-white' : 'bg-white text-[#363f75] border border-[#E5E7EB]'
                }`}>{BAG_MATERIAL_LABELS[mat]}</button>
            ))}
          </div>

          <Input type="number" inputMode="numeric" placeholder="Кількість упаковок"
            value={item.packages} onChange={(e) => updateItem(idx, 'packages', e.target.value)} />
          {(() => {
            const stock = getStockForItem(item.bagSize, item.material);
            if (stock === null) return null;
            const qty = parseInt(item.packages) || 0;
            const remaining = stock - qty;
            return (
              <div className="flex items-center justify-between px-1">
                <span className="text-[12px] text-[#9CA3AF]">На складі: <span className="font-bold text-[#111827]">{stock}</span> уп</span>
                {qty > 0 && (
                  <span className={`text-[12px] font-bold ${remaining >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    Залишок: {remaining} уп
                  </span>
                )}
              </div>
            );
          })()}
        </div>
      ))}

      <Btn variant="secondary" onClick={addItem} className="w-full py-3 text-[14px]">+ Додати позицію</Btn>

      <Field label="Фото вантажу">
        <PhotoCapture photoUrl={photoPreview} onCapture={handlePhoto} />
      </Field>

      {/* Summary */}
      {filledItems.length > 0 && fromLoc && toLoc && (
        <div className="bg-[#eceef5]/50 rounded-2xl p-3 space-y-1">
          {filledItems.map((item, i) => (
            <p key={i} className="text-[13px] text-[#363f75] text-center">
              <span className="font-bold">{item.packages} уп.</span> {item.bagSize} {BAG_MATERIAL_LABELS[item.material]}
            </p>
          ))}
          <p className="text-[11px] text-[#9CA3AF] text-center pt-1">
            {LOCATION_LABELS[fromLoc]} → {LOCATION_LABELS[toLoc]} · Разом: {totalPackages} уп.
          </p>
        </div>
      )}

      <Btn onClick={handleSubmit} disabled={!canSubmit} className="w-full py-4 text-base">
        {submitting ? 'Зберігаємо...' : `Відправити (${totalPackages} уп.)`}
      </Btn>
    </div>
  );
}

// ─── Cash Dashboard ──────────────────────────────────
interface CashData {
  total_sum: number;
  orders_count: number;
  paid_sum: number;
  paid_count: number;
  cod_sum: number;
  cod_count: number;
  other_sum: number;
  shipped_count: number;
  assembly_count: number;
  avg_processing_hours?: number;
  by_source?: Record<string, { sum: number; count: number }>;
  period: { from: string; to: string };
}

const SOURCE_ICONS: Record<string, string> = {
  'Хорошоп': '🛒',
  'Вайбер': '💬',
  'Instagram': '📸',
  'Telegram': '✈️',
  'Rozetka': '🟢',
  'OLX': '📋',
  'Prom.ua': '🏪',
  'Інше': '📦',
};

function CashReportForm({ onDone }: { onDone: () => void }) {
  void onDone;
  const [period, setPeriod] = useState<'today' | 'week' | 'month' | 'custom'>('today');
  const [customDate, setCustomDate] = useState('');
  const [data, setData] = useState<CashData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = period === 'custom' && customDate
        ? `?date=${customDate}`
        : `?period=${period}`;
      const res = await api<CashData>(`/cash${params}`);
      setData(res);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Помилка');
    } finally {
      setLoading(false);
    }
  }, [period, customDate]);

  useEffect(() => { if (period !== 'custom' || customDate) loadData(); }, [loadData, period, customDate]);

  const fmt = (n: number) => n.toLocaleString('uk-UA');

  return (
    <div className="space-y-5">
      <PageHeader icon="🧾" title="Каса" subtitle="Фінансовий дашборд" />

      {/* Period selector */}
      <div className="flex gap-2">
        {([['today', 'Сьогодні'], ['week', 'Тиждень'], ['month', 'Місяць']] as const).map(([p, label]) => (
          <button key={p} onClick={() => setPeriod(p)}
            className={`flex-1 py-2.5 rounded-2xl text-[13px] font-bold transition-all ${
              period === p ? 'bg-[#4b569e] text-white shadow-md shadow-[#4b569e]/25' : 'bg-white text-[#363f75] border border-[#F0F0F0]'
            }`}>{label}</button>
        ))}
        <button onClick={() => setPeriod('custom')}
          className={`px-3 py-2.5 rounded-2xl text-[13px] font-bold transition-all ${
            period === 'custom' ? 'bg-[#4b569e] text-white shadow-md shadow-[#4b569e]/25' : 'bg-white text-[#363f75] border border-[#F0F0F0]'
          }`}>📅</button>
      </div>

      {/* Custom date picker */}
      {period === 'custom' && (
        <Input type="date" value={customDate} onChange={(e) => setCustomDate(e.target.value)} />
      )}

      {loading ? (
        <div className="flex justify-center py-10">
          <div className="w-6 h-6 border-2 border-[#4b569e] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : data ? (
        <div className="space-y-4">
          {/* Main total */}
          <div className="bg-gradient-to-b from-[#4b569e] to-[#363f75] rounded-[20px] p-5 text-white shadow-lg shadow-[#4b569e]/25">
            <p className="text-[13px] opacity-70">Продажі</p>
            <p className="text-[32px] font-bold mt-1">{fmt(data.total_sum)} <span className="text-[16px] font-normal opacity-70">грн</span></p>
            <p className="text-[13px] opacity-70 mt-1">{data.orders_count} замовлень</p>
          </div>

          {/* Payment breakdown */}
          <div className="bg-white rounded-[20px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0]">
            <div className="px-4 py-3.5 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="text-[14px]">✅</span>
                <span className="text-[14px] font-medium text-[#111827]">Оплачено</span>
              </div>
              <div className="text-right">
                <span className="text-[16px] font-bold text-green-600">{fmt(data.paid_sum)} грн</span>
                <span className="text-[12px] text-[#9CA3AF] ml-1">({data.paid_count})</span>
              </div>
            </div>
            <div className="px-4 py-3.5 border-t border-[#F5F5F5] flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="text-[14px]">💳</span>
                <span className="text-[14px] font-medium text-[#111827]">Наложка</span>
              </div>
              <div className="text-right">
                <span className="text-[16px] font-bold text-orange-500">{fmt(data.cod_sum)} грн</span>
                <span className="text-[12px] text-[#9CA3AF] ml-1">({data.cod_count})</span>
              </div>
            </div>
            {data.other_sum > 0 && (
              <div className="px-4 py-3.5 border-t border-[#F5F5F5] flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="text-[14px]">💰</span>
                  <span className="text-[14px] font-medium text-[#111827]">Інше</span>
                </div>
                <div className="text-right">
                  <span className="text-[16px] font-bold text-[#4b569e]">{fmt(data.other_sum)} грн</span>
                </div>
              </div>
            )}
          </div>

          {/* Status breakdown */}
          <div className="bg-white rounded-[20px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0] p-4">
            <p className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-wider mb-3">Статуси</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center">
                <p className="text-[22px] font-bold text-green-600">{data.shipped_count}</p>
                <p className="text-[11px] text-[#9CA3AF]">Відправлено</p>
              </div>
              <div className="text-center">
                <p className="text-[22px] font-bold text-[#4b569e]">{data.assembly_count}</p>
                <p className="text-[11px] text-[#9CA3AF]">На збірку</p>
              </div>
              <div className="text-center">
                <p className="text-[22px] font-bold text-[#9CA3AF]">{data.orders_count - data.shipped_count - data.assembly_count}</p>
                <p className="text-[11px] text-[#9CA3AF]">Інші</p>
              </div>
            </div>
          </div>

          {/* Processing speed */}
          {data.avg_processing_hours !== undefined && data.avg_processing_hours > 0 && (
            <div className="bg-white rounded-[20px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0] p-4">
              <p className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-wider mb-2">Швидкість обробки</p>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[14px] font-medium text-[#111827]">Середній час</p>
                  <p className="text-[12px] text-[#9CA3AF]">від замовлення до відправки</p>
                </div>
                <p className={`text-[20px] font-bold ${
                  data.avg_processing_hours <= 8 ? 'text-green-600' :
                  data.avg_processing_hours <= 24 ? 'text-orange-500' :
                  'text-red-600'
                }`}>
                  {data.avg_processing_hours >= 24
                    ? `${Math.floor(data.avg_processing_hours / 24)} д ${data.avg_processing_hours % 24} год`
                    : `${data.avg_processing_hours} год`
                  }
                </p>
              </div>
            </div>
          )}

          {/* Period info */}
          <p className="text-[11px] text-[#C5C9D1] text-center">
            {data.period.from === data.period.to
              ? new Date(data.period.from).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })
              : `${new Date(data.period.from).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' })} — ${new Date(data.period.to).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' })}`
            }
            {' · '}KeyCRM
          </p>
        </div>
      ) : null}
    </div>
  );
}

// ─── Supplier Payment Form ────────────────────────────
function SupplierPaymentForm({ onDone }: { onDone: () => void }) {
  const [supplier, setSupplier] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<SupplierPaymentMethod>('card');
  const [description, setDescription] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handlePhoto = (file: File) => {
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const canSubmit = supplier && amount && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      let photo_url = null;
      if (photoFile) photo_url = await uploadPhoto(photoFile);
      await api('/supplier-payments', {
        method: 'POST',
        body: JSON.stringify({ supplier, amount, method, description, photo_url }),
      });
      setSuccess(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Помилка');
    } finally {
      setSubmitting(false);
    }
  };

  if (success) return <SuccessScreen onDone={onDone} />;

  return (
    <div className="space-y-5">
      <PageHeader icon="🏭" title="Оплата постачальнику" />

      <Field label="Постачальник">
        <Input
          placeholder="Назва / ПІБ"
          value={supplier}
          onChange={(e) => setSupplier(e.target.value)}
          autoFocus
        />
      </Field>

      <Field label="Сума (грн)">
        <Input
          type="number"
          inputMode="decimal"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </Field>

      <Field label="Спосіб оплати">
        <ChipGroup
          options={Object.keys(SUPPLIER_METHOD_LABELS) as SupplierPaymentMethod[]}
          labels={SUPPLIER_METHOD_LABELS}
          value={method}
          onChange={(v) => setMethod(v as SupplierPaymentMethod)}
        />
      </Field>

      <Field label="Опис (необовʼязково)">
        <Input
          placeholder="За що?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>

      <Field label="Фото (необовʼязково)">
        <PhotoCapture photoUrl={photoPreview} onCapture={handlePhoto} />
      </Field>

      <Btn onClick={handleSubmit} disabled={!canSubmit} className="w-full py-4 text-base">
        {submitting ? 'Зберігаємо...' : 'Зберегти оплату'}
      </Btn>
    </div>
  );
}

// ─── Salary Form (admin only) ─────────────────────────
function SalaryForm({
  allStaff,
  onDone,
}: {
  allStaff: OpsStaff[];
  onDone: () => void;
}) {
  const [recipientId, setRecipientId] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<SalaryType>('salary');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const period = new Date().toISOString().slice(0, 7);

  const canSubmit = recipientId && amount && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await api('/salaries', {
        method: 'POST',
        body: JSON.stringify({ recipient_id: recipientId, amount, type, period, notes }),
      });
      setSuccess(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Помилка');
    } finally {
      setSubmitting(false);
    }
  };

  if (success) return <SuccessScreen onDone={onDone} />;

  return (
    <div className="space-y-5">
      <PageHeader icon="💵" title="Зарплата / Аванс" />

      <Field label="Кому">
        <div className="flex flex-wrap gap-2">
          {allStaff.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setRecipientId(s.id)}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                recipientId === s.id
                  ? 'bg-[#4b569e] text-white shadow-md'
                  : 'bg-[#eceef5] text-[#363f75]'
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Тип">
        <ChipGroup
          options={['salary', 'advance'] as SalaryType[]}
          labels={{ salary: 'Зарплата', advance: 'Аванс' }}
          value={type}
          onChange={(v) => setType(v as SalaryType)}
        />
      </Field>

      <Field label="Сума (грн)">
        <Input
          type="number"
          inputMode="decimal"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          autoFocus
        />
      </Field>

      <Field label="Примітки (необовʼязково)">
        <Input
          placeholder="Коментар"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Field>

      <p className="text-sm text-[#6B7280]">Період: {period}</p>

      <Btn onClick={handleSubmit} disabled={!canSubmit} className="w-full py-4 text-base">
        {submitting ? 'Зберігаємо...' : 'Зберегти'}
      </Btn>
    </div>
  );
}

// ─── Shipments View (orders from KeyCRM) ─────────────
interface ShipmentOrder {
  id: number;
  ttn: string | null;
  recipient: string | null;
  phone: string | null;
  city: string | null;
  address: string | null;
  region: string | null;
  delivery: string | null;
  payment_status: string;
  buyer_orders_count: number | null;
  buyer_orders_sum: string | null;
  buyer_comment: string | null;
  total: number;
  ordered_at: string;
  manager_comment: string | null;
  in_bot?: boolean;
  products: { name: string; quantity: number; sku: string | null; thumbnail: string | null }[];
}

interface ArchiveOrder {
  id: number;
  recipient: string;
  phone: string | null;
  city: string | null;
  address: string | null;
  region: string | null;
  ttn: string | null;
  total: number;
  payment_status: string;
  ordered_at: string;
  completed_at: string;
  manager_comment: string | null;
  buyer_comment: string | null;
  buyer_orders_count: number | null;
  products: { name: string; quantity: number; sku: string | null; thumbnail: string | null }[];
}

function ShipmentsView() {
  const [tab, setTab] = useState<'queue' | 'archive'>('queue');
  const [orders, setOrders] = useState<ShipmentOrder[]>([]);
  const [archiveOrders, setArchiveOrders] = useState<ArchiveOrder[]>([]);
  const [archivePeriod, setArchivePeriod] = useState<'today' | 'yesterday' | 'week'>('today');
  const [loading, setLoading] = useState(true);
  const [shippingId, setShippingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [viewingOrder, setViewingOrder] = useState<ShipmentOrder | ArchiveOrder | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [shipPhotoFile, setShipPhotoFile] = useState<File | null>(null);
  const [shipPhotoPreview, setShipPhotoPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === 'queue') {
        const res = await api<{ data: ShipmentOrder[]; total: number }>('/shipments');
        setOrders(res.data ?? []);
      } else {
        const res = await api<{ data: ArchiveOrder[] }>(`/shipments/archive?period=${archivePeriod}`);
        setArchiveOrders(res.data ?? []);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Помилка');
    } finally {
      setLoading(false);
    }
  }, [tab, archivePeriod]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleShip = async (orderId: number) => {
    if (!shipPhotoFile) return;
    setSubmitting(true);
    try {
      const photo_url = await uploadPhoto(shipPhotoFile);
      await api('/shipments', {
        method: 'POST',
        body: JSON.stringify({ order_id: orderId, photo_url }),
      });
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
      setShippingId(null);
      setShipPhotoFile(null);
      setShipPhotoPreview(null);
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Помилка');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Order detail screen */}
      {viewingOrder && (() => {
        const o = viewingOrder;
        const isArchive = 'completed_at' in o;
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <button onClick={() => setViewingOrder(null)} className="w-10 h-10 rounded-xl bg-[#eceef5] flex items-center justify-center">
                <svg className="w-4 h-4 text-[#4b569e]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
              </button>
              <div>
                <h2 className="text-[17px] font-bold text-[#111827]">Замовлення #{o.id}</h2>
                <p className="text-[13px] text-[#9CA3AF]">
                  {isArchive ? '✅ Відправлено' : '🚚 На збірку'}
                  {' · '}
                  {new Date(o.ordered_at).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })}
                </p>
              </div>
            </div>

            {/* Status + Total */}
            <div className="bg-gradient-to-b from-[#4b569e] to-[#363f75] rounded-[20px] p-4 text-white shadow-lg shadow-[#4b569e]/25">
              <div className="flex justify-between items-center">
                <div>
                  <span className={`text-[12px] font-bold px-2 py-0.5 rounded-lg ${
                    o.payment_status === 'paid' ? 'bg-white/20' : 'bg-orange-400/30'
                  }`}>
                    {o.payment_status === 'paid' ? '✅ Оплачено' : '💳 Наложка'}
                  </span>
                </div>
                <p className="text-[24px] font-bold">{o.total.toLocaleString('uk-UA')} <span className="text-[14px] opacity-70">грн</span></p>
              </div>
            </div>

            {/* TTN */}
            {o.ttn && (
              <div className="bg-white rounded-[20px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0]">
                <p className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-wider">ТТН Нова Пошта</p>
                <p className="text-[18px] font-mono font-bold text-[#4b569e] mt-1">{o.ttn}</p>
              </div>
            )}

            {/* Recipient */}
            <div className="bg-white rounded-[20px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0] space-y-2">
              <p className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-wider">Отримувач</p>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1.5">
                  <p className="text-[16px] font-bold text-[#111827]">{o.recipient}</p>
                  {'in_bot' in o && (o as ShipmentOrder).in_bot && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-[#d1fae5] text-[#065f46]">В боті</span>
                  )}
                </div>
                {'buyer_orders_count' in o && (o as ArchiveOrder).buyer_orders_count && (o as ArchiveOrder).buyer_orders_count! > 1 && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-[#eceef5] text-[#4b569e]">
                    {(o as ArchiveOrder).buyer_orders_count} замовлень
                  </span>
                )}
              </div>
              {o.phone && <a href={`tel:${o.phone}`} className="text-[15px] text-[#4b569e] font-semibold block">{o.phone}</a>}
              {'address' in o && o.address && <p className="text-[14px] text-[#111827]">📍 {o.address}</p>}
              {o.city && <p className="text-[13px] text-[#9CA3AF]">{o.city}{'region' in o && o.region ? `, ${o.region}` : ''}</p>}
            </div>

            {/* Products */}
            <div className="bg-white rounded-[20px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0] space-y-3">
              <p className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-wider">Товари ({o.products.length})</p>
              {o.products.map((p, i) => (
                <div key={i} className="flex items-center gap-3 bg-[#F8FAFC] rounded-xl p-3">
                  {p.thumbnail ? (
                    <button onClick={() => setLightboxUrl(p.thumbnail)} className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 border border-[#E5E7EB] bg-white">
                      <img src={p.thumbnail} alt="" className="w-full h-full object-contain p-1" />
                    </button>
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-[#eceef5] flex items-center justify-center flex-shrink-0 text-2xl">📦</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-medium text-[#111827] leading-tight">{p.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {p.sku && <span className="text-[12px] text-[#9CA3AF]">SKU: {p.sku}</span>}
                      {'in_stock' in p && p.in_stock !== null && p.in_stock !== undefined && (
                        <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${
                          (p.in_stock as number) >= p.quantity ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                        }`}>
                          {(p.in_stock as number) >= p.quantity ? `✓ ${p.in_stock} на складі` : `⚠ ${p.in_stock} на складі`}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-[18px] font-bold text-[#4b569e] flex-shrink-0">×{p.quantity}</span>
                </div>
              ))}
            </div>

            {/* Comments */}
            {'buyer_comment' in o && o.buyer_comment && (
              <div className="bg-[#FEF3C7] rounded-[20px] px-4 py-3">
                <p className="text-[12px] text-[#92400E]">💬 Покупець: {o.buyer_comment}</p>
              </div>
            )}
            {'manager_comment' in o && o.manager_comment && (
              <div className="bg-[#DBEAFE] rounded-[20px] px-4 py-3">
                <p className="text-[12px] text-[#1E40AF]">📝 Менеджер: {o.manager_comment}</p>
              </div>
            )}

            {/* Ship action (only for active orders) */}
            {!isArchive && (
              shippingId === o.id ? (
                <div className="space-y-3">
                  <Field label="Фото посилки">
                    <PhotoCapture photoUrl={shipPhotoPreview} onCapture={(f) => { setShipPhotoFile(f); setShipPhotoPreview(URL.createObjectURL(f)); }} />
                  </Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Btn variant="secondary" onClick={() => { setShippingId(null); setShipPhotoFile(null); setShipPhotoPreview(null); }} className="py-3 text-[14px]">
                      Скасувати
                    </Btn>
                    <Btn onClick={async () => {
                      if (!shipPhotoFile) return;
                      setSubmitting(true);
                      try {
                        const photo_url = await uploadPhoto(shipPhotoFile);
                        await api('/shipments', { method: 'POST', body: JSON.stringify({ order_id: o.id, photo_url }) });
                        window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
                        setShippingId(null); setShipPhotoFile(null); setShipPhotoPreview(null);
                        setViewingOrder(null);
                        loadData();
                      } catch (err) { alert(err instanceof Error ? err.message : 'Помилка'); }
                      finally { setSubmitting(false); }
                    }} disabled={!shipPhotoFile || submitting} className="py-3 text-[14px]">
                      {submitting ? '...' : 'Відправлено ✅'}
                    </Btn>
                  </div>
                </div>
              ) : (
                <Btn onClick={() => {
                  window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('medium');
                  setShippingId(o.id);
                }} className="w-full py-4 text-base">
                  Зібрати та відправити 📸
                </Btn>
              )
            )}

            {isArchive && 'completed_at' in o && (
              <p className="text-[13px] text-[#9CA3AF] text-center">
                Відправлено: {new Date((o as ArchiveOrder).completed_at).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })}
                {' о '}
                {new Date((o as ArchiveOrder).completed_at).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
              </p>
            )}

            {lightboxUrl && (
              <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setLightboxUrl(null)}>
                <img src={lightboxUrl} alt="" className="max-w-full max-h-[85vh] rounded-2xl object-contain" />
                <button className="absolute top-4 right-4 w-11 h-11 bg-white/20 rounded-full flex items-center justify-center text-white text-xl" onClick={() => setLightboxUrl(null)}>✕</button>
              </div>
            )}
          </div>
        );
      })()}

      {!viewingOrder && <>
      <PageHeader icon="📬" title="Відправки" />

      {/* Tabs */}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setTab('queue')}
          className={`py-3 rounded-2xl text-[14px] font-bold transition-all ${
            tab === 'queue' ? 'bg-[#4b569e] text-white shadow-md shadow-[#4b569e]/25' : 'bg-white text-[#363f75] border border-[#F0F0F0]'
          }`}>
          На збірку{orders.length > 0 ? ` (${orders.length})` : ''}
        </button>
        <button onClick={() => setTab('archive')}
          className={`py-3 rounded-2xl text-[14px] font-bold transition-all ${
            tab === 'archive' ? 'bg-[#4b569e] text-white shadow-md shadow-[#4b569e]/25' : 'bg-white text-[#363f75] border border-[#F0F0F0]'
          }`}>
          Архів
        </button>
      </div>

      {/* Archive period filter */}
      {tab === 'archive' && (
        <div className="flex gap-2">
          {([['today', 'Сьогодні'], ['yesterday', 'Вчора'], ['week', 'Тиждень']] as const).map(([p, label]) => (
            <button key={p} onClick={() => setArchivePeriod(p)}
              className={`flex-1 py-2 rounded-xl text-[13px] font-medium transition-all ${
                archivePeriod === p ? 'bg-[#eceef5] text-[#4b569e] font-bold' : 'text-[#9CA3AF]'
              }`}>
              {label}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-10">
          <div className="w-6 h-6 border-2 border-[#4b569e] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tab === 'archive' ? (
        /* Archive tab */
        archiveOrders.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-3xl mb-2">📭</div>
            <p className="text-[14px] font-semibold text-[#111827]">Немає відправлень</p>
          </div>
        ) : (
          <div className="space-y-3">
            {archiveOrders.map(o => {
              const isOpen = expandedId === o.id;
              return (
                <div key={o.id} className="bg-white rounded-[20px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0] overflow-hidden">
                  <button onClick={() => setViewingOrder(o)}
                    className="w-full text-left px-4 py-3.5 flex items-center justify-between active:bg-[#F8FAFC]">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-bold text-[#111827]">#{o.id}</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-green-100 text-green-700">✅ Відправлено</span>
                      </div>
                      <p className="text-[14px] font-medium text-[#111827] mt-0.5">{o.recipient}</p>
                      <p className="text-[12px] text-[#9CA3AF]">{o.city} · {o.total} грн</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-[13px] font-bold text-[#4b569e]">
                        {new Date(o.ordered_at).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' })}
                      </p>
                      <p className="text-[11px] text-[#9CA3AF]">{o.products.length} поз.</p>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-4 border-t border-[#F5F5F5]">
                      {o.ttn && (
                        <div className="bg-[#F8FAFC] rounded-xl px-3 py-2 mt-3 mb-3">
                          <p className="text-[11px] text-[#9CA3AF]">ТТН Нова Пошта</p>
                          <p className="text-[15px] font-mono font-bold text-[#4b569e]">{o.ttn}</p>
                        </div>
                      )}

                      <div className="bg-[#F8FAFC] rounded-xl p-3 mb-3 space-y-1.5">
                        {o.recipient && (
                          <div className="flex justify-between items-center">
                            <p className="text-[14px] font-semibold text-[#111827]">{o.recipient}</p>
                            {o.buyer_orders_count && o.buyer_orders_count > 1 && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-[#eceef5] text-[#4b569e]">
                                {o.buyer_orders_count} замовлень
                              </span>
                            )}
                          </div>
                        )}
                        {o.phone && <a href={`tel:${o.phone}`} className="text-[13px] text-[#4b569e] font-medium block">{o.phone}</a>}
                        {o.address && <p className="text-[13px] text-[#111827]">📍 {o.address}</p>}
                        {o.city && <p className="text-[12px] text-[#9CA3AF]">{o.city}{o.region ? `, ${o.region}` : ''}</p>}
                      </div>

                      <div className="space-y-2 mb-3">
                        <p className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-wider">Товари</p>
                        {o.products.map((p, i) => (
                          <div key={i} className="bg-[#F8FAFC] rounded-xl p-3 flex items-center gap-3">
                            {p.thumbnail ? (
                              <button onClick={() => setLightboxUrl(p.thumbnail)} className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 border border-[#E5E7EB] bg-white">
                                <img src={p.thumbnail} alt="" className="w-full h-full object-contain p-1" />
                              </button>
                            ) : (
                              <div className="w-14 h-14 rounded-xl bg-[#eceef5] flex items-center justify-center flex-shrink-0 text-xl">📦</div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] font-medium text-[#111827] leading-tight">{p.name}</p>
                              {p.sku && <p className="text-[11px] text-[#9CA3AF] mt-0.5">SKU: {p.sku}</p>}
                            </div>
                            <span className="text-[16px] font-bold text-[#4b569e] flex-shrink-0">×{p.quantity}</span>
                          </div>
                        ))}
                      </div>

                      {o.buyer_comment && (
                        <div className="bg-[#FEF3C7] rounded-xl px-3 py-2 mb-2">
                          <p className="text-[11px] text-[#92400E]">💬 Покупець: {o.buyer_comment}</p>
                        </div>
                      )}
                      {o.manager_comment && (
                        <div className="bg-[#DBEAFE] rounded-xl px-3 py-2 mb-2">
                          <p className="text-[11px] text-[#1E40AF]">📝 Менеджер: {o.manager_comment}</p>
                        </div>
                      )}

                      <p className="text-[12px] text-[#9CA3AF] text-center mt-2">
                        Відправлено: {new Date(o.completed_at).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })}
                        {' о '}
                        {new Date(o.completed_at).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      ) : orders.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-4xl mb-3">✅</div>
          <p className="text-[15px] font-semibold text-[#111827]">Все відправлено</p>
          <p className="text-[13px] text-[#9CA3AF] mt-1">Нових замовлень на збірку немає</p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const isExpanded = expandedId === order.id;
            const isShipping = shippingId === order.id;

            return (
              <div key={order.id} className="bg-white rounded-[20px] shadow-[0_1px_3px_rgba(0,0,0,0.06),0_6px_16px_rgba(0,0,0,0.04)] border-2 border-[#4b569e]/20 overflow-hidden">
                {/* Header — tap to expand */}
                <button
                  onClick={() => setViewingOrder(order)}
                  className="w-full text-left p-4 active:bg-[#F8FAFC] transition-colors"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-[15px] font-bold text-[#111827]">#{order.id}</p>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-blue-100 text-blue-700">🚚 На збірку</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${
                          order.payment_status === 'paid' ? 'bg-green-100 text-green-700'
                          : order.payment_status === 'not_paid' ? 'bg-orange-100 text-orange-700'
                          : 'bg-blue-100 text-blue-700'
                        }`}>
                          {order.payment_status === 'paid' ? 'Оплачено' : order.payment_status === 'not_paid' ? 'Наложка' : order.payment_status}
                        </span>
                        {order.in_bot && <span className="px-1.5 py-0.5 rounded-md bg-[#D1FAE5] text-[#065F46] text-[9px] font-bold flex-shrink-0">В боті</span>}
                      </div>
                      <p className="text-[14px] font-medium text-[#111827] mt-0.5">{order.recipient ?? 'Клієнт'}</p>
                      <p className="text-[12px] text-[#9CA3AF]">
                        {order.city ?? ''}{order.city ? ' · ' : ''}{order.total} грн
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-[15px] font-bold text-[#4b569e]">
                        {order.ordered_at ? new Date(order.ordered_at).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' }) : ''}
                      </p>
                      <p className="text-[11px] text-[#9CA3AF]">{order.products.length} поз.</p>
                    </div>
                  </div>
                </button>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-[#F5F5F5]">
                    {/* TTN */}
                    {order.ttn && (
                      <div className="bg-[#F8FAFC] rounded-xl px-3 py-2 mt-3 mb-3">
                        <p className="text-[11px] text-[#9CA3AF]">ТТН Нова Пошта</p>
                        <p className="text-[15px] font-mono font-bold text-[#4b569e]">{order.ttn}</p>
                      </div>
                    )}

                    {/* Recipient details */}
                    <div className="bg-[#F8FAFC] rounded-xl p-3 mb-3 space-y-1.5">
                      {order.recipient && (
                        <div className="flex justify-between items-center">
                          <p className="text-[14px] font-semibold text-[#111827]">{order.recipient}</p>
                          {order.buyer_orders_count && order.buyer_orders_count > 1 && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-[#eceef5] text-[#4b569e]">
                              {order.buyer_orders_count} замовлень
                            </span>
                          )}
                        </div>
                      )}
                      {order.phone && (
                        <a href={`tel:${order.phone}`} className="text-[13px] text-[#4b569e] font-medium block">{order.phone}</a>
                      )}
                      {order.address && (
                        <p className="text-[13px] text-[#111827]">📍 {order.address}</p>
                      )}
                      {order.city && !order.address?.includes(order.city) && (
                        <p className="text-[12px] text-[#9CA3AF]">{order.city}{order.region ? `, ${order.region}` : ''}</p>
                      )}
                    </div>

                    {/* Products with photos */}
                    <div className="space-y-2 mb-3">
                      <p className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-wider">Товари</p>
                      {order.products.map((p, i) => (
                        <div key={i} className="bg-[#F8FAFC] rounded-xl p-3 flex items-center gap-3">
                          {p.thumbnail ? (
                            <button onClick={() => setLightboxUrl(p.thumbnail)} className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 border border-[#E5E7EB] bg-white">
                              <img src={p.thumbnail} alt="" className="w-full h-full object-contain p-1" />
                            </button>
                          ) : (
                            <div className="w-14 h-14 rounded-xl bg-[#eceef5] flex items-center justify-center flex-shrink-0 text-xl">📦</div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-medium text-[#111827] leading-tight">{p.name}</p>
                            {p.sku && <p className="text-[11px] text-[#9CA3AF] mt-0.5">SKU: {p.sku}</p>}
                          </div>
                          <span className="text-[16px] font-bold text-[#4b569e] flex-shrink-0">×{p.quantity}</span>
                        </div>
                      ))}
                    </div>

                    {/* Comments */}
                    {order.buyer_comment && (
                      <div className="bg-[#FEF3C7] rounded-xl px-3 py-2 mb-2">
                        <p className="text-[11px] text-[#92400E]">💬 Покупець: {order.buyer_comment}</p>
                      </div>
                    )}
                    {order.manager_comment && (
                      <div className="bg-[#DBEAFE] rounded-xl px-3 py-2 mb-3">
                        <p className="text-[11px] text-[#1E40AF]">📝 Менеджер: {order.manager_comment}</p>
                      </div>
                    )}

                    {/* Ship action */}
                    {isShipping ? (
                      <div className="space-y-3">
                        <Field label="Фото посилки">
                          <PhotoCapture photoUrl={shipPhotoPreview} onCapture={(f) => { setShipPhotoFile(f); setShipPhotoPreview(URL.createObjectURL(f)); }} />
                        </Field>
                        <div className="grid grid-cols-2 gap-2">
                          <Btn variant="secondary" onClick={() => { setShippingId(null); setShipPhotoFile(null); setShipPhotoPreview(null); }} className="py-3 text-[14px]">
                            Скасувати
                          </Btn>
                          <Btn onClick={() => handleShip(order.id)} disabled={!shipPhotoFile || submitting} className="py-3 text-[14px]">
                            {submitting ? '...' : 'Відправлено ✅'}
                          </Btn>
                        </div>
                      </div>
                    ) : (
                      <Btn onClick={() => {
                        window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('medium');
                        setShippingId(order.id);
                      }} className="w-full py-3 text-[14px]">
                        Зібрати та відправити 📸
                      </Btn>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {/* Lightbox */}
      {lightboxUrl && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setLightboxUrl(null)}>
          <img src={lightboxUrl} alt="" className="max-w-full max-h-[85vh] rounded-2xl object-contain" />
          <button className="absolute top-4 right-4 w-11 h-11 bg-white/20 rounded-full flex items-center justify-center text-white text-xl" onClick={() => setLightboxUrl(null)}>✕</button>
        </div>
      )}
      </>}
    </div>
  );
}

// ─── Warehouse View (3 levels: Location → Tabs → Content) ───────
type WarehouseTab = 'incoming' | 'stock' | 'audit';
type AuditType = 'raw' | 'finished';

const WAREHOUSE_LOCATIONS: { id: OpsLocation; icon: string; name: string; hasRaw: boolean }[] = [
  { id: 'malynovskogo', icon: '🏭', name: 'Маліновського', hasRaw: true },
  { id: 'afina_sklad', icon: '📦', name: 'Афіна склад', hasRaw: false },
  { id: 'dalnytska', icon: '🧪', name: 'Дальницька', hasRaw: true },
];

function WarehouseView({ staff }: { staff: OpsStaff }) {
  const [selectedLoc, setSelectedLoc] = useState<OpsLocation | null>(null);
  const [tab, setTab] = useState<WarehouseTab>('incoming');
  const [auditType, setAuditType] = useState<AuditType | null>(null);

  // Data
  const [pending, setPending] = useState<HistoryItem[]>([]);
  const [confirmed, setConfirmed] = useState<HistoryItem[]>([]);
  const [stock, setStock] = useState<{ name: string; quantity: number; unit: string; item_type?: string }[]>([]);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [lastAuditDate, setLastAuditDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [confirmQty, setConfirmQty] = useState('');
  const [confirmPhotoFile, setConfirmPhotoFile] = useState<File | null>(null);
  const [confirmPhotoPreview, setConfirmPhotoPreview] = useState<string | null>(null);

  // Audit
  const [auditSubTab, setAuditSubTab] = useState<'new' | 'archive'>('new');
  const [auditArchive, setAuditArchive] = useState<HistoryItem[]>([]);
  const [auditArchiveLoading, setAuditArchiveLoading] = useState(false);
  const [viewingAudit, setViewingAudit] = useState<HistoryItem | null>(null);
  const [auditItems, setAuditItems] = useState<
    { item_type: AuditItemType; name: string; quantity: string; unit: string; notes: string }[]
  >([{ item_type: 'raw', name: '', quantity: '', unit: 'шт', notes: '' }]);
  const [auditSubmitting, setAuditSubmitting] = useState(false);
  const [auditSuccess, setAuditSuccess] = useState(false);

  const currentWarehouse = WAREHOUSE_LOCATIONS.find((w) => w.id === selectedLoc);

  const loadTabData = useCallback(async () => {
    if (!selectedLoc) return;
    setLoading(true);
    try {
      if (tab === 'incoming') {
        const [pendingRes, confirmedRes] = await Promise.all([
          api<{ data: HistoryItem[] }>(`/movements/pending?location=${selectedLoc}`),
          api<{ data: HistoryItem[] }>(`/movements?days=30`),
        ]);
        setPending(pendingRes.data ?? []);
        setConfirmed((confirmedRes.data ?? []).filter((m: HistoryItem) => m.confirmed_at && m.to_location === selectedLoc));
      } else if (tab === 'stock') {
        const res = await api<{ data: { name: string; quantity: number; unit: string }[]; lastAudit: { date: string } | null; source: string }>(`/stock?location=${selectedLoc}`);
        setStock(res.data ?? []);
        setLastAuditDate(
          res.source === 'keycrm' ? 'keycrm'
          : res.source === 'production' ? 'live'
          : res.lastAudit?.date ?? null
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Помилка завантаження';
      console.error('[Warehouse]', msg);
      alert(msg);
    } finally {
      setLoading(false);
    }
  }, [tab, selectedLoc]);

  useEffect(() => {
    if (selectedLoc && tab !== 'audit') loadTabData();
  }, [selectedLoc, tab, loadTabData]);

  // confirmQty doubles as JSON for shipment confirms: {"id1": "5", "id2": "10"}
  const [confirmQtys, setConfirmQtys] = useState<Record<string, string>>({});

  const handleConfirmShipment = async (shipmentItems: HistoryItem[]) => {
    if (!confirmPhotoFile) return;
    const items = shipmentItems.map(m => ({
      id: m.id,
      confirmed_packages: parseInt(confirmQtys[m.id] || String(m.packages ?? m.quantity ?? 0), 10),
    }));
    try {
      const photo_url = await uploadPhoto(confirmPhotoFile);
      await api('/movements/confirm', {
        method: 'POST',
        body: JSON.stringify({
          shipment_id: shipmentItems[0].shipment_id,
          items,
          photo_url,
        }),
      });
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
      setConfirmingId(null);
      setConfirmQtys({});
      setConfirmPhotoFile(null);
      setConfirmPhotoPreview(null);
      loadTabData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Помилка');
    }
  };

  const handleConfirmSingle = async (movementId: string) => {
    if (!confirmQty || !confirmPhotoFile) return;
    try {
      const photo_url = await uploadPhoto(confirmPhotoFile);
      await api('/movements/confirm', {
        method: 'POST',
        body: JSON.stringify({
          movement_id: movementId,
          confirmed_packages: parseInt(confirmQty, 10),
          photo_url,
        }),
      });
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
      setConfirmingId(null);
      setConfirmQty('');
      setConfirmPhotoFile(null);
      setConfirmPhotoPreview(null);
      loadTabData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Помилка');
    }
  };

  const handleAuditSubmit = async () => {
    if (!selectedLoc || !auditType) return;
    const validItems = auditItems.filter((i) => i.name && i.quantity);
    if (validItems.length === 0) return;
    setAuditSubmitting(true);
    try {
      await api('/inventory-audit', {
        method: 'POST',
        body: JSON.stringify({
          location: selectedLoc,
          audit_date: new Date().toISOString().slice(0, 10),
          items: validItems.map((i) => ({
            item_type: auditType,
            name: i.name,
            quantity: parseFloat(i.quantity),
            unit: i.unit,
            notes: i.notes || null,
          })),
        }),
      });
      setAuditSuccess(true);
      setTimeout(() => {
        setAuditSuccess(false);
        setAuditType(null);
        setAuditItems([{ item_type: 'raw', name: '', quantity: '', unit: 'шт', notes: '' }]);
      }, 1500);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Помилка');
    } finally {
      setAuditSubmitting(false);
    }
  };

  // Load pending counts for all warehouses on mount
  const [pendingCounts, setPendingCounts] = useState<Record<string, number>>({});
  const pendingLoadedRef = useRef(false);
  useEffect(() => {
    if (selectedLoc || pendingLoadedRef.current) return;
    pendingLoadedRef.current = true;
    (async () => {
      try {
        const counts: Record<string, number> = {};
        for (const wh of WAREHOUSE_LOCATIONS) {
          const res = await api<{ data: HistoryItem[] }>(`/movements/pending?location=${wh.id}`);
          counts[wh.id] = res.data?.length ?? 0;
        }
        setPendingCounts(counts);
      } catch { /* ignore */ }
    })();
  }, [selectedLoc]);

  // ── Level 1: Location picker ──
  if (!selectedLoc) {
    return (
      <div className="space-y-5">
        <PageHeader icon="📋" title="Склад" subtitle="Оберіть локацію" />
        <div className="space-y-3">
          {WAREHOUSE_LOCATIONS.map((wh) => {
            const count = pendingCounts[wh.id] ?? 0;
            return (
              <button
                key={wh.id}
                onClick={() => {
                  window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('medium');
                  setSelectedLoc(wh.id);
                  setTab('incoming');
                }}
                className="w-full flex items-center gap-4 bg-white rounded-[20px] p-5
                  shadow-[0_1px_3px_rgba(0,0,0,0.06),0_6px_16px_rgba(0,0,0,0.04)]
                  active:scale-[0.97] transition-all border border-[#F0F0F0]"
              >
                <div className="w-12 h-12 rounded-2xl bg-[#eceef5] flex items-center justify-center text-2xl">
                  {wh.icon}
                </div>
                <div className="flex-1 text-left">
                  <p className="text-[15px] font-bold text-[#111827]">{wh.name}</p>
                  <p className="text-[12px] text-[#9CA3AF]">
                    {wh.hasRaw ? 'Сировина + готова продукція' : 'Готова продукція'}
                  </p>
                </div>
                {count > 0 && (
                  <span className="px-2.5 py-1 rounded-full bg-[#EF4444] text-white text-[12px] font-bold min-w-[24px] text-center">
                    {count}
                  </span>
                )}
                <svg className="w-5 h-5 text-[#C5C9D1]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Load audit archive — called manually, no useEffect
  const loadAuditArchive = useCallback(async () => {
    if (!selectedLoc) return;
    setAuditArchiveLoading(true);
    try {
      const res = await api<{ data: HistoryItem[] }>(`/inventory-audit/list?location=${selectedLoc}`);
      setAuditArchive(res.data ?? []);
    } catch { setAuditArchive([]); }
    finally { setAuditArchiveLoading(false); }
  }, [selectedLoc]);

  // Realtime: another device created/reviewed an audit on this warehouse →
  // refresh the archive so reviewers don't see a stale list. Guards on
  // selectedLoc + auditSubTab='archive' so we don't fetch when irrelevant.
  useOpsEvent('audit.created', (payload) => {
    if (payload?.location === selectedLoc && tab === 'audit' && auditSubTab === 'archive') {
      loadAuditArchive();
    }
  });
  useOpsEvent('audit.reviewed', (payload) => {
    if (payload?.location === selectedLoc && tab === 'audit' && auditSubTab === 'archive') {
      loadAuditArchive();
    }
  });

  const handleAuditApprove = async (auditId: string, action: 'approve' | 'reject') => {
    // Reject must collect an actionable reason — backend enforces min 3 chars.
    // window.prompt is good enough inside Telegram Mini App; we re-prompt on
    // empty input rather than silently sending an invalid request.
    let reason: string | undefined;
    if (action === 'reject') {
      const input = window.prompt('Причина відхилення (мін. 3 символи):', '');
      if (input == null) return; // user cancelled
      reason = input.trim();
      if (reason.length < 3) {
        alert('Причина має бути ≥3 символів');
        return;
      }
    }
    try {
      await api('/inventory-audit/approve', {
        method: 'POST',
        body: JSON.stringify({ audit_id: auditId, action, reason }),
      });
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
      setViewingAudit(null);
      loadAuditArchive();
    } catch (err) { alert(err instanceof Error ? err.message : 'Помилка'); }
  };

  // ── Level 3: Audit (tabs: Новий / Архів) ──
  if (tab === 'audit' && !auditType) {
    const types: { id: AuditType; icon: string; label: string }[] = currentWarehouse?.hasRaw
      ? [{ id: 'raw', icon: '🧱', label: 'Сировина' }, { id: 'finished', icon: '📦', label: 'Готова продукція' }]
      : [{ id: 'finished', icon: '📦', label: 'Готова продукція' }];

    // Viewing single audit detail
    if (viewingAudit) {
      const a = viewingAudit;
      const items = a.ops_inventory_audit_items ?? [];
      const isPending = a.status === 'pending';
      const isAdmin = staff.role === 'admin';

      return (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setViewingAudit(null)} className="w-10 h-10 rounded-xl bg-[#eceef5] flex items-center justify-center">
              <svg className="w-4 h-4 text-[#4b569e]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>
            <div>
              <h2 className="text-[17px] font-bold text-[#111827]">Переоблік</h2>
              <p className="text-[13px] text-[#9CA3AF]">
                {new Date(a.audit_date).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })}
                {' · '}{a.ops_staff?.name ?? ''}
                {' · '}{a.status === 'approved' ? '✅' : a.status === 'rejected' ? '❌' : '⏳'}
              </p>
            </div>
          </div>

          {a.status === 'rejected' && a.rejection_reason && (
            // Operator opens their rejected audit → sees exactly what to fix.
            <div className="bg-red-50 border-l-[3px] border-red-600 rounded-[12px] p-4">
              <p className="text-[11px] font-bold uppercase text-red-700 mb-1">Причина відхилення</p>
              <p className="text-[14px] text-red-900">{a.rejection_reason}</p>
            </div>
          )}

          <div className="bg-white rounded-[20px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0]">
            {items.map((item: HistoryItem, idx: number) => {
              // Per-item Δ vs the previous approved snapshot.
              //   baseline_quantity == null → new item (нов.)
              //   diff == 0                 → unchanged, no badge
              //   |Δ%| > 25                  → red
              //   |Δ%| > 10                  → amber
              //   else                       → muted grey
              const base = (item as HistoryItem & { baseline_quantity?: number | null }).baseline_quantity ?? null;
              const qty = Number(item.quantity ?? 0);
              const diff = base == null ? null : qty - base;
              const pct = base == null || base === 0 ? null : Math.abs(diff! / base) * 100;
              const deltaLabel =
                diff == null ? 'нов.' :
                diff === 0 ? null :
                `${diff > 0 ? '+' : ''}${diff}${pct != null ? ` · ${Math.round(pct)}%` : ''}`;
              const deltaCls =
                diff == null ? 'text-[#9CA3AF]' :
                pct != null && pct > 25 ? 'text-red-600' :
                pct != null && pct > 10 ? 'text-amber-600' :
                'text-[#9CA3AF]';
              return (
                <div key={idx} className={`px-4 py-3 flex justify-between items-center ${idx > 0 ? 'border-t border-[#F5F5F5]' : ''}`}>
                  <span className="text-[14px] font-medium text-[#111827]">{item.name}</span>
                  <div className="flex flex-col items-end">
                    <div className="flex items-baseline gap-1">
                      <span className="text-[17px] font-bold text-[#111827]">{item.quantity}</span>
                      <span className="text-[12px] text-[#9CA3AF]">{item.unit}</span>
                    </div>
                    {deltaLabel && (
                      <span className={`text-[11px] font-bold mt-0.5 ${deltaCls}`}>{deltaLabel}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {isPending && isAdmin && (
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => handleAuditApprove(a.id, 'reject')}
                className="py-3 rounded-2xl text-[14px] font-bold text-red-500 bg-red-50 border border-red-200">
                Відхилити ❌
              </button>
              <Btn onClick={() => handleAuditApprove(a.id, 'approve')} className="py-3 text-[14px]">
                Підтвердити ✅
              </Btn>
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="space-y-5">
        <PageHeader icon="📝" title="Переоблік" subtitle={currentWarehouse?.name} />

        {/* Sub-tabs */}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setAuditSubTab('new')}
            className={`py-3 rounded-2xl text-[14px] font-bold transition-all ${
              auditSubTab === 'new' ? 'bg-[#4b569e] text-white shadow-md shadow-[#4b569e]/25' : 'bg-white text-[#363f75] border border-[#F0F0F0]'
            }`}>Новий</button>
          <button onClick={() => { setAuditSubTab('archive'); loadAuditArchive(); }}
            className={`py-3 rounded-2xl text-[14px] font-bold transition-all ${
              auditSubTab === 'archive' ? 'bg-[#4b569e] text-white shadow-md shadow-[#4b569e]/25' : 'bg-white text-[#363f75] border border-[#F0F0F0]'
            }`}>Архів</button>
        </div>

        {auditSubTab === 'new' ? (
          /* New audit — type picker */
          <div className="space-y-3">
            <p className="text-[13px] text-[#9CA3AF] px-1">
              {new Date().toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
            {types.map((t) => (
              <button key={t.id} onClick={() => {
                window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('medium');
                setAuditType(t.id);
              }}
                className="w-full flex items-center gap-4 bg-white rounded-[20px] p-5
                  shadow-[0_1px_3px_rgba(0,0,0,0.06),0_6px_16px_rgba(0,0,0,0.04)]
                  active:scale-[0.97] transition-all border border-[#F0F0F0]">
                <div className="w-11 h-11 rounded-2xl bg-[#eceef5] flex items-center justify-center text-xl">{t.icon}</div>
                <span className="text-[15px] font-bold text-[#111827]">{t.label}</span>
                <svg className="w-5 h-5 text-[#C5C9D1] ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </button>
            ))}
          </div>
        ) : (
          /* Archive */
          auditArchiveLoading ? (
            <div className="flex justify-center py-10">
              <div className="w-6 h-6 border-2 border-[#4b569e] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : auditArchive.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-3xl mb-2">📭</div>
              <p className="text-[14px] font-semibold text-[#111827]">Немає переобліків</p>
            </div>
          ) : (
            <div className="space-y-3">
              {auditArchive.map((a: HistoryItem) => {
                const itemCount = a.ops_inventory_audit_items?.length ?? 0;
                const ds = a.delta_summary as
                  | { items_with_delta: number; largest_delta_pct: number; baseline_date: string }
                  | null;
                return (
                  <button key={a.id} onClick={() => setViewingAudit(a)}
                    className="w-full text-left bg-white rounded-[20px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0] active:bg-[#F8FAFC]">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-[15px] font-bold text-[#111827]">
                          {new Date(a.audit_date).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })}
                        </p>
                        <p className="text-[13px] text-[#9CA3AF] mt-0.5">
                          {a.ops_staff?.name ?? ''} · {itemCount} позицій
                        </p>
                      </div>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg ${
                        a.status === 'approved' ? 'bg-green-100 text-green-700' :
                        a.status === 'rejected' ? 'bg-red-100 text-red-700' :
                        'bg-orange-100 text-orange-700'
                      }`}>
                        {a.status === 'approved' ? '✅ Затверджено' : a.status === 'rejected' ? '❌ Відхилено' : '⏳ Очікує'}
                      </span>
                    </div>
                    {ds && (
                      // Δ vs prior approved snapshot — спрощує review:
                      // 0 змін = підозріло (copy-paste), >50% = треба перевірити
                      <p className={`text-[12px] mt-1.5 font-medium ${
                        ds.items_with_delta === 0 ? 'text-amber-600' :
                        ds.largest_delta_pct >= 50 ? 'text-red-600' :
                        'text-[#9CA3AF]'
                      }`}>
                        {ds.items_with_delta === 0
                          ? '⚠️ Δ = 0 vs минулого переобліку'
                          : `Δ ${ds.items_with_delta} поз. · max ${ds.largest_delta_pct}%`}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          )
        )}
      </div>
    );
  }

  // ── Level 3: Audit form ──
  if (tab === 'audit' && auditType) {
    if (auditSuccess) {
      return <SuccessScreen onDone={() => { setAuditSuccess(false); setAuditType(null); }} />;
    }

    // For finished products — pre-built product grid
    if (auditType === 'finished') {
      return <FinishedProductAudit
        warehouseName={currentWarehouse?.name ?? ''}
        locationId={selectedLoc}
        onSubmit={async (items) => {
          setAuditSubmitting(true);
          try {
            await api('/inventory-audit', {
              method: 'POST',
              body: JSON.stringify({
                location: selectedLoc,
                audit_date: new Date().toISOString().slice(0, 10),
                items,
              }),
            });
            setAuditSuccess(true);
          } catch (err) {
            alert(err instanceof Error ? err.message : 'Помилка');
          } finally {
            setAuditSubmitting(false);
          }
        }}
        submitting={auditSubmitting}
        onBack={() => setAuditType(null)}
      />;
    }

    // For raw materials — pre-built list (same UX as finished)
    return <FinishedProductAudit
      warehouseName={currentWarehouse?.name ?? ''}
      locationId={selectedLoc}
      auditItemType="raw"
      onSubmit={async (items) => {
        setAuditSubmitting(true);
        try {
          await api('/inventory-audit', {
            method: 'POST',
            body: JSON.stringify({
              location: selectedLoc,
              audit_date: new Date().toISOString().slice(0, 10),
              items,
            }),
          });
          setAuditSuccess(true);
        } catch (err) {
          alert(err instanceof Error ? err.message : 'Помилка');
        } finally {
          setAuditSubmitting(false);
        }
      }}
      submitting={auditSubmitting}
      onBack={() => setAuditType(null)}
    />;
  }

  // ── Level 2: Tabs (Вхідні / Залишки / Переоблік) ──
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => setSelectedLoc(null)} className="w-10 h-10 rounded-xl bg-[#eceef5] flex items-center justify-center">
          <svg className="w-4 h-4 text-[#4b569e]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <div>
          <h2 className="text-[17px] font-bold text-[#111827]">{currentWarehouse?.icon} {currentWarehouse?.name}</h2>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {(['incoming', 'stock', 'audit'] as WarehouseTab[]).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); if (t === 'audit') setAuditType(null); }}
            className={`py-3 rounded-2xl text-[13px] font-bold transition-all ${
              tab === t
                ? 'bg-[#4b569e] text-white shadow-md shadow-[#4b569e]/25'
                : 'bg-white text-[#363f75] border border-[#F0F0F0]'
            }`}
          >
            {{ incoming: `Вхідні${pending.length ? ` (${pending.length})` : ''}`, stock: 'Залишки', audit: 'Переоблік' }[t]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <div className="w-6 h-6 border-2 border-[#4b569e] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tab === 'incoming' ? (
        <div className="space-y-5">
          {/* Pending — group by shipment_id */}
          {(() => {
            // Group pending by shipment_id (null = standalone)
            const shipments: { key: string; items: HistoryItem[] }[] = [];
            const grouped = new Map<string, HistoryItem[]>();
            for (const m of pending) {
              const key = m.shipment_id ?? m.id;
              if (!grouped.has(key)) grouped.set(key, []);
              grouped.get(key)!.push(m);
            }
            grouped.forEach((items, key) => shipments.push({ key, items }));

            return shipments.length > 0 ? (
              <div>
                <p className="text-[11px] font-bold text-orange-500 uppercase tracking-wider mb-3 px-1">
                  Очікують прийому ({shipments.length} {shipments.length === 1 ? 'накладна' : 'накладних'})
                </p>
                <div className="space-y-4">
                  {shipments.map(({ key, items }) => {
                    const first = items[0];
                    const totalPkg = items.reduce((s, m) => s + (m.packages ?? m.quantity ?? 0), 0);
                    const isConfirming = confirmingId === key;

                    return (
                      <div key={key} className="bg-white rounded-[20px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border-2 border-orange-200">
                        {/* Header */}
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <p className="text-[13px] text-[#9CA3AF]">
                              {LOCATION_LABELS[first.from_location as OpsLocation]} · {first.ops_staff?.name}
                            </p>
                            <p className="text-[11px] text-[#C5C9D1]">
                              {new Date(first.created_at).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                          <span className="text-[13px] font-bold text-orange-600">{totalPkg} уп</span>
                        </div>

                        {/* Item list */}
                        <div className="space-y-1 mb-3">
                          {items.map((m: HistoryItem) => (
                            <div key={m.id} className="flex justify-between items-center py-1.5">
                              <p className="text-[14px] font-medium text-[#111827]">
                                {m.bag_size ? `${m.bag_size} ${BAG_MATERIAL_LABELS[m.material as BagMaterial] ?? ''}` : m.description}
                              </p>
                              {isConfirming ? (
                                <Input
                                  type="number" inputMode="numeric"
                                  placeholder={String(m.packages ?? m.quantity ?? 0)}
                                  value={confirmQtys[m.id] ?? String(m.packages ?? m.quantity ?? '')}
                                  onChange={(e) => setConfirmQtys(prev => ({ ...prev, [m.id]: e.target.value }))}
                                  className="!w-20 !h-9 text-center !text-[14px]"
                                />
                              ) : (
                                <span className="text-[14px] font-bold">{m.packages ?? m.quantity} уп</span>
                              )}
                            </div>
                          ))}
                        </div>

                        {/* Photo */}
                        {first.photo_url && !isConfirming && (
                          <button onClick={() => setLightboxUrl(first.photo_url)} className="w-full mb-3">
                            <img src={first.photo_url} alt="" className="w-full h-32 object-cover rounded-xl" />
                          </button>
                        )}

                        {isConfirming ? (
                          <div className="space-y-3">
                            <Field label="Фото підтвердження">
                              <PhotoCapture photoUrl={confirmPhotoPreview} onCapture={(f) => { setConfirmPhotoFile(f); setConfirmPhotoPreview(URL.createObjectURL(f)); }} />
                            </Field>
                            <div className="grid grid-cols-2 gap-2">
                              <Btn variant="secondary" onClick={() => { setConfirmingId(null); setConfirmQtys({}); setConfirmPhotoFile(null); setConfirmPhotoPreview(null); }} className="py-3 text-[14px]">Скасувати</Btn>
                              <Btn onClick={() => items[0].shipment_id ? handleConfirmShipment(items) : handleConfirmSingle(items[0].id)}
                                disabled={!confirmPhotoFile} className="py-3 text-[14px]">
                                Прийняв ✅
                              </Btn>
                            </div>
                          </div>
                        ) : (
                          <Btn onClick={() => {
                            window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('medium');
                            setConfirmingId(key);
                            const qtys: Record<string, string> = {};
                            items.forEach(m => { qtys[m.id] = String(m.packages ?? m.quantity ?? ''); });
                            setConfirmQtys(qtys);
                          }} className="w-full py-3 text-[14px]">
                            Порахувати та прийняти ({items.length} поз.)
                          </Btn>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="text-3xl mb-2">✅</div>
                <p className="text-[14px] font-semibold text-[#111827]">Все прийнято</p>
              </div>
            );
          })()}

          {/* Confirmed — history grouped by shipment */}
          {confirmed.length > 0 && (() => {
            const shipments: { key: string; items: HistoryItem[] }[] = [];
            const grp = new Map<string, HistoryItem[]>();
            for (const m of confirmed) {
              const key = m.shipment_id ?? m.id;
              if (!grp.has(key)) grp.set(key, []);
              grp.get(key)!.push(m);
            }
            grp.forEach((items, key) => shipments.push({ key, items }));

            return (
              <div>
                <p className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-wider mb-3 px-1">Прийнято раніше</p>
                <div className="space-y-3">
                  {shipments.map(({ key, items }) => {
                    const first = items[0];
                    const totalPkg = items.reduce((s, m) => s + (m.confirmed_packages ?? m.packages ?? 0), 0);
                    const isExpanded = confirmingId === `history_${key}`;

                    return (
                      <button
                        key={key}
                        onClick={() => setConfirmingId(isExpanded ? null : `history_${key}`)}
                        className="w-full text-left bg-white rounded-[20px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0] overflow-hidden"
                      >
                        {/* Summary row */}
                        <div className="flex items-center justify-between px-4 py-3">
                          <div className="flex-1">
                            <p className="text-[14px] font-medium text-[#111827]">
                              {items.length === 1
                                ? (first.bag_size ? `${first.bag_size} ${BAG_MATERIAL_LABELS[first.material as BagMaterial] ?? ''}` : first.description)
                                : `${items.length} позицій`
                              }
                            </p>
                            <p className="text-[12px] text-[#9CA3AF]">
                              {LOCATION_LABELS[first.from_location as OpsLocation]} · {first.ops_staff?.name} · {totalPkg} уп
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-[#C5C9D1]">
                              {new Date(first.confirmed_at).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' })}
                            </span>
                            <svg className={`w-4 h-4 text-[#C5C9D1] transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                            </svg>
                          </div>
                        </div>

                        {/* Expanded details */}
                        {isExpanded && (
                          <div className="px-4 pb-4 border-t border-[#F5F5F5]" onClick={(e) => e.stopPropagation()}>
                            {/* Items */}
                            <div className="py-2 space-y-1.5">
                              {items.map((m: HistoryItem) => (
                                <div key={m.id} className="flex justify-between items-center">
                                  <span className="text-[13px] text-[#111827]">
                                    {m.bag_size ? `${m.bag_size} ${BAG_MATERIAL_LABELS[m.material as BagMaterial] ?? ''}` : m.description}
                                  </span>
                                  <span className="text-[13px] font-bold">{m.confirmed_packages ?? m.packages} уп</span>
                                </div>
                              ))}
                            </div>
                            {/* Photos */}
                            <div className="flex gap-2 mt-2">
                              {first.photo_url && (
                                <button onClick={() => setLightboxUrl(first.photo_url)} className="flex-1 h-24 rounded-xl overflow-hidden">
                                  <img src={first.photo_url} alt="Відправник" className="w-full h-full object-cover" />
                                  <span className="text-[10px] text-[#9CA3AF] block mt-0.5 text-center">Відправник</span>
                                </button>
                              )}
                              {first.confirm_photo_url && (
                                <button onClick={() => setLightboxUrl(first.confirm_photo_url)} className="flex-1 h-24 rounded-xl overflow-hidden border-2 border-green-300">
                                  <img src={first.confirm_photo_url} alt="Отримувач" className="w-full h-full object-cover" />
                                  <span className="text-[10px] text-[#9CA3AF] block mt-0.5 text-center">Отримувач</span>
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Lightbox */}
          {lightboxUrl && (
            <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setLightboxUrl(null)}>
              <img src={lightboxUrl} alt="" className="max-w-full max-h-[85vh] rounded-2xl object-contain" />
              <button className="absolute top-4 right-4 w-11 h-11 bg-white/20 rounded-full flex items-center justify-center text-white text-xl" onClick={() => setLightboxUrl(null)}>✕</button>
            </div>
          )}
        </div>
      ) : (
        /* Stock tab — from last audit */
        <div className="space-y-3">
          {lastAuditDate && (
            <p className="text-[13px] text-[#9CA3AF] px-1">
              {lastAuditDate === 'keycrm'
                ? '📡 Дані з KeyCRM (онлайн)'
                : lastAuditDate === 'live'
                ? '🏭 Дані з виробництва (в реальному часі)'
                : `📋 Переоблік: ${new Date(lastAuditDate).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })}`
              }
            </p>
          )}
          {stock.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-3">📦</div>
              <p className="text-[15px] font-semibold text-[#111827]">Немає даних</p>
              <p className="text-[13px] text-[#9CA3AF] mt-1">Зробіть переоблік щоб побачити залишки</p>
            </div>
          ) : (() => {
            const rawItems = stock.filter(s => s.item_type === 'raw');
            const finishedItems = stock.filter(s => s.item_type !== 'raw');
            return (
              <div className="space-y-4">
                {rawItems.length > 0 && (
                  <div>
                    <p className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-wider mb-2 px-1">🧱 Сировина</p>
                    <div className="bg-white rounded-[20px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0]">
                      {rawItems.map((s, i) => (
                        <div key={i} className="flex items-center justify-between px-4 py-3">
                          <p className="text-[14px] font-medium text-[#111827]">{s.name}</p>
                          <div className="flex items-baseline gap-1">
                            <span className="text-[18px] font-bold text-[#111827]">{s.quantity}</span>
                            <span className="text-[11px] text-[#9CA3AF]">{s.unit}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {finishedItems.length > 0 && (
                  <div>
                    <p className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-wider mb-2 px-1">📦 Готова продукція</p>
                    <div className="bg-white rounded-[20px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0]">
                      {finishedItems.map((s, i) => (
                        <div key={i} className="flex items-center justify-between px-4 py-3">
                          <p className="text-[14px] font-medium text-[#111827]">{s.name}</p>
                          <div className="flex items-baseline gap-1">
                            <span className="text-[18px] font-bold text-[#111827]">{s.quantity}</span>
                            <span className="text-[11px] text-[#9CA3AF]">{s.unit}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// Product catalog lives in @/lib/telegram/audit-catalog (mirrored to
// mobile/lib/audit-catalog.ts for the standalone Expo project).

function FinishedProductAudit({
  warehouseName,
  locationId,
  auditItemType = 'finished',
  onSubmit,
  submitting,
  onBack,
}: {
  warehouseName: string;
  locationId: string;
  auditItemType?: 'finished' | 'raw';
  onSubmit: (items: { item_type: string; name: string; quantity: number; unit: string }[]) => void;
  submitting: boolean;
  onBack: () => void;
}) {
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [expectedQty, setExpectedQty] = useState<Record<string, number>>({});
  const [loadingExpected, setLoadingExpected] = useState(true);

  // Load current stock to show expected values
  useEffect(() => {
    (async () => {
      try {
        const res = await api<{ data: { name: string; quantity: number; item_type?: string }[] }>(`/stock?location=${locationId}`);
        const expected: Record<string, number> = {};
        for (const item of res.data ?? []) {
          expected[item.name] = item.quantity;
        }
        setExpectedQty(expected);
      } catch {}
      setLoadingExpected(false);
    })();
  }, [locationId]);

  const setQty = (key: string, val: string) => {
    setQuantities((prev) => ({ ...prev, [key]: val }));
  };

  // Single source of truth in @/lib/telegram/audit-catalog: raw=RAW_MATERIALS,
  // finished @ afina_sklad = bags + other, finished elsewhere = bags.
  const products: AuditProduct[] = getAuditProducts(
    auditItemType,
    locationId as OpsLocation,
  );

  const filledCount = Object.values(quantities).filter((v) => v !== '' && v !== undefined).length;

  const handleSubmit = () => {
    const items = products
      .filter((p) => {
        const q = quantities[p.id];
        return q !== '' && q !== undefined;
      })
      .map((p) => ({
        item_type: auditItemType,
        name: p.name,
        quantity: parseFloat(quantities[p.id]) || 0,
        unit: p.unit,
      }));
    if (items.length > 0) onSubmit(items);
  };

  // Group products
  const groups: string[] = [];
  products.forEach((p) => { if (!groups.includes(p.group)) groups.push(p.group); });

  return (
    <div className="space-y-4">
      <PageHeader
        icon={auditItemType === 'raw' ? '🧱' : '📦'}
        title={`Переоблік — ${auditItemType === 'raw' ? 'Сировина' : 'Готова продукція'}`}
        subtitle={warehouseName}
      />
      <p className="text-[13px] text-[#9CA3AF] px-1">
        {new Date().toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' })}
      </p>

      {groups.map((group) => {
        const groupProducts = products.filter((p) => p.group === group);
        return (
          <div key={group} className="bg-white rounded-[20px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0] overflow-hidden">
            <div className="px-4 py-2.5 bg-[#F8FAFC]">
              <p className="text-[13px] font-bold text-[#4b569e]">{group}</p>
            </div>
            <div className="px-3 py-1">
              {groupProducts.map((p) => {
                const qty = quantities[p.id] ?? '';
                const hasValue = qty && parseFloat(qty) > 0;
                return (
                  <div key={p.id} className="flex items-center gap-2 px-1 py-2.5">
                    {p.color && (
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                    )}
                    <span className="text-[13px] font-medium text-[#111827] flex-1">{p.name}</span>
                    {/* Expected from DB */}
                    {!loadingExpected && expectedQty[p.name] !== undefined && (
                      <span className="text-[12px] text-[#9CA3AF] w-[40px] text-right">{expectedQty[p.name]}</span>
                    )}
                    <div className="relative flex items-center gap-1">
                      <input
                        type="number"
                        inputMode="numeric"
                        placeholder={expectedQty[p.name]?.toString() ?? '—'}
                        value={qty}
                        onChange={(e) => setQty(p.id, e.target.value)}
                        className={`w-[70px] h-11 px-2 rounded-xl text-center text-[16px] font-bold
                          border transition-all focus:outline-none
                          ${hasValue
                            ? (() => {
                                const exp = expectedQty[p.name];
                                const actual = parseFloat(qty);
                                if (exp !== undefined && actual !== exp) return 'border-red-400 bg-red-50 text-red-600';
                                return 'border-[#4b569e] bg-[#eceef5]/50 text-[#4b569e]';
                              })()
                            : 'border-[#E5E7EB] bg-white text-[#111827] focus:border-[#4b569e]'
                          }`}
                      />
                      <span className="text-[11px] text-[#9CA3AF] w-[20px]">{p.unit}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {filledCount > 0 && (() => {
        const diffs = products
          .filter(p => quantities[p.id] !== '' && quantities[p.id] !== undefined)
          .map(p => {
            const actual = parseFloat(quantities[p.id]) || 0;
            const expected = expectedQty[p.name] ?? 0;
            return { name: p.name, actual, expected, diff: actual - expected };
          })
          .filter(d => d.diff !== 0);

        return (
          <div className="space-y-3">
            <div className="bg-[#eceef5]/50 rounded-2xl p-3 text-center">
              <p className="text-[13px] text-[#363f75]">
                Заповнено <span className="font-bold">{filledCount}</span> з {products.length}
              </p>
            </div>
            {diffs.length > 0 && (
              <div className="bg-red-50 rounded-2xl p-3 border border-red-200">
                <p className="text-[11px] font-bold text-red-600 uppercase tracking-wider mb-2">Розбіжності</p>
                {diffs.map(d => (
                  <div key={d.name} className="flex justify-between items-center py-1">
                    <span className="text-[13px] text-red-700">{d.name}</span>
                    <span className="text-[13px] font-bold text-red-600">
                      {d.diff > 0 ? '+' : ''}{d.diff} {products[0]?.unit}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      <Btn onClick={handleSubmit} disabled={filledCount === 0 || submitting} className="w-full py-4 text-base">
        {submitting ? 'Зберігаємо...' : `Зберегти переоблік (${filledCount})`}
      </Btn>
      <Btn variant="ghost" onClick={onBack} className="w-full py-3 text-[14px]">← Назад</Btn>
    </div>
  );
}

// ─── Production Form ──────────────────────────────────
function ProductionForm({
  staff,
  onDone,
}: {
  staff: OpsStaff;
  onDone: () => void;
}) {
  const defaultLocation = staff.location === 'malynovskogo' || staff.location === 'dalnytska'
    ? staff.location : 'malynovskogo';

  const [selectedStage, setSelectedStage] = useState<ProductionStage | null>(null);
  const [tab, setTab] = useState<'form' | 'archive'>('form');

  // Form state
  const [bagSize, setBagSize] = useState<BagSize>('100x200');
  const [material, setMaterial] = useState<BagMaterial>('transparent');
  const [km, setKm] = useState('');
  const [rolls, setRolls] = useState('');
  const [packages, setPackages] = useState('');
  const [notes, setNotes] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  // Archive state
  const [archive, setArchive] = useState<HistoryItem[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const handlePhoto = (file: File) => {
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const loadArchive = useCallback(async () => {
    if (!selectedStage) return;
    setArchiveLoading(true);
    try {
      const res = await api<{ data: HistoryItem[] }>('/production?days=30');
      setArchive((res.data ?? []).filter((p: HistoryItem) => p.stage === selectedStage));
    } catch { /* ignore */ } finally {
      setArchiveLoading(false);
    }
  }, [selectedStage]);

  useEffect(() => { if (tab === 'archive') loadArchive(); }, [tab, loadArchive]);

  const canSubmit = photoFile && !submitting && (
    (selectedStage === 'print' && (km || rolls)) ||
    (selectedStage === 'pack' && packages)
  );

  const handleSubmit = async () => {
    if (!canSubmit || !selectedStage) return;
    setSubmitting(true);
    try {
      const photo_url = await uploadPhoto(photoFile!);
      await api('/production', {
        method: 'POST',
        body: JSON.stringify({
          location: defaultLocation,
          stage: selectedStage,
          bag_size: bagSize,
          material,
          km: km || null,
          rolls: rolls || null,
          packages: packages || null,
          photo_url,
          notes,
        }),
      });
      setSuccess(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Помилка');
    } finally {
      setSubmitting(false);
    }
  };

  // History state (must be before any early return to satisfy React hooks rules)
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [historyLightbox, setHistoryLightbox] = useState<string | null>(null);

  useEffect(() => {
    if (selectedStage) return;
    (async () => {
      setHistoryLoading(true);
      try {
        const res = await api<{ data: HistoryItem[] }>('/production?days=30');
        setHistory(res.data ?? []);
      } catch {} finally { setHistoryLoading(false); }
    })();
  }, [selectedStage]);

  const sizes = Object.keys(BAG_SIZE_LABELS) as BagSize[];
  const materials = Object.keys(BAG_MATERIAL_LABELS) as BagMaterial[];

  if (success) return <SuccessScreen onDone={() => { setSuccess(false); setKm(''); setRolls(''); setPackages(''); setNotes(''); setPhotoFile(null); setPhotoPreview(null); }} />;

  // Level 1: Choose stage + history feed
  if (!selectedStage) {
    // Group history by date
    const byDate: Record<string, HistoryItem[]> = {};
    for (const item of history) {
      const date = item.created_at.slice(0, 10);
      if (!byDate[date]) byDate[date] = [];
      byDate[date].push(item);
    }
    const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

    return (
      <div className="space-y-5">
        <PageHeader icon="🏭" title="Виробництво" subtitle="Оберіть кабінет" />
        <div className="grid grid-cols-2 gap-3">
          {([
            { stage: 'print' as ProductionStage, icon: '🖨', title: 'Друк', desc: 'Рулони' },
            { stage: 'pack' as ProductionStage, icon: '📦', title: 'Упаковка', desc: 'Пакети' },
          ]).map(item => (
            <button
              key={item.stage}
              onClick={() => { window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('medium'); setSelectedStage(item.stage); setTab('form'); }}
              className="flex flex-col items-center justify-center gap-2 bg-white rounded-[20px] p-5
                shadow-[0_1px_3px_rgba(0,0,0,0.06),0_6px_16px_rgba(0,0,0,0.04)]
                active:scale-[0.97] transition-all border border-[#F0F0F0]"
            >
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-b from-[#4b569e] to-[#363f75] flex items-center justify-center text-xl shadow-lg shadow-[#4b569e]/20">
                {item.icon}
              </div>
              <div className="text-center">
                <p className="text-[15px] font-bold text-[#111827]">{item.title}</p>
                <p className="text-[11px] text-[#9CA3AF]">{item.desc}</p>
              </div>
            </button>
          ))}
        </div>

        {/* History feed */}
        {historyLoading ? (
          <div className="flex justify-center py-6">
            <div className="w-5 h-5 border-2 border-[#4b569e] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : history.length > 0 && (
          <div>
            <p className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-wider mb-3 px-1">Історія виробництва</p>
            <div className="space-y-2">
              {history.map(item => {
                const d = new Date(item.created_at);
                const isToday = item.created_at.slice(0, 10) === new Date().toISOString().slice(0, 10);
                const isPrint = item.stage === 'print';
                return (
                  <div key={item.id} className="bg-white rounded-[20px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0]">
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0 ${
                        isPrint ? 'bg-[#eceef5]' : 'bg-[#D1FAE5]'
                      }`}>
                        {isPrint ? '🖨' : '📦'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-[14px] font-bold text-[#111827]">
                              {item.bag_size} {BAG_MATERIAL_LABELS[item.material as BagMaterial] ?? ''}
                            </p>
                            <p className="text-[15px] font-bold mt-0.5" style={{ color: isPrint ? '#4b569e' : '#10B981' }}>
                              {isPrint
                                ? `${item.km ?? '—'} км · ${item.rolls ?? '—'} рулонів`
                                : `${item.packages ?? '—'} упаковок`
                              }
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-[12px] text-[#9CA3AF]">
                              {isToday ? 'Сьогодні' : d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' })}
                            </p>
                            <p className="text-[12px] text-[#9CA3AF]">
                              {d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                        <p className="text-[12px] text-[#9CA3AF] mt-1">{item.ops_staff?.name ?? ''}</p>
                        {item.notes && <p className="text-[12px] text-[#6B7280] mt-1">{item.notes}</p>}
                        {item.photo_url && (
                          <button onClick={() => setHistoryLightbox(item.photo_url)} className="mt-2 w-full">
                            <img src={item.photo_url} alt="" className="w-full h-24 object-cover rounded-xl" />
                          </button>
                        )}
                        <button onClick={() => {
                          const pwd = prompt('Введіть пароль для видалення:');
                          if (!pwd) return;
                          api(`/production?id=${item.id}&password=${pwd}`, { method: 'DELETE' })
                            .then(() => {
                              window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
                              setHistory(prev => prev.filter(h => h.id !== item.id));
                            })
                            .catch((err: Error) => alert(err.message || 'Помилка'));
                        }} className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-50 border border-red-200 text-red-500 text-[12px] font-bold active:bg-red-100 transition-all">
                          🗑 Видалити
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {historyLightbox && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setHistoryLightbox(null)}>
            <img src={historyLightbox} alt="" className="max-w-full max-h-[85vh] rounded-2xl object-contain" />
            <button className="absolute top-4 right-4 w-11 h-11 bg-white/20 rounded-full flex items-center justify-center text-white text-xl" onClick={() => setHistoryLightbox(null)}>✕</button>
          </div>
        )}
      </div>
    );
  }

  // Level 2: Tabs + content
  const stageLabel = selectedStage === 'print' ? 'Друк' : 'Упаковка';
  const stageIcon = selectedStage === 'print' ? '🖨' : '📦';

  return (
    <div className="space-y-5">
      {/* Header with back */}
      <div className="flex items-center gap-3">
        <button onClick={() => setSelectedStage(null)} className="w-10 h-10 rounded-xl bg-[#eceef5] flex items-center justify-center">
          <svg className="w-4 h-4 text-[#4b569e]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <div>
          <h2 className="text-[17px] font-bold text-[#111827]">{stageIcon} {stageLabel}</h2>
        </div>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setTab('form')}
          className={`py-3 rounded-2xl text-[14px] font-bold transition-all ${
            tab === 'form' ? 'bg-[#4b569e] text-white shadow-md shadow-[#4b569e]/25' : 'bg-white text-[#363f75] border border-[#F0F0F0]'
          }`}>Новий запис</button>
        <button onClick={() => setTab('archive')}
          className={`py-3 rounded-2xl text-[14px] font-bold transition-all ${
            tab === 'archive' ? 'bg-[#4b569e] text-white shadow-md shadow-[#4b569e]/25' : 'bg-white text-[#363f75] border border-[#F0F0F0]'
          }`}>Архів</button>
      </div>

      {tab === 'form' ? (
        /* === Form === */
        <div className="space-y-5">
          <Field label="Розмір пакета (мм)">
            <div className="grid grid-cols-4 gap-2">
              {sizes.map((size) => (
                <button key={size} type="button" onClick={() => setBagSize(size)}
                  className={`py-3 rounded-2xl text-[13px] font-bold transition-all ${
                    bagSize === size ? 'bg-[#4b569e] text-white shadow-md shadow-[#4b569e]/25' : 'bg-white text-[#363f75] border border-[#E5E7EB]'
                  }`}>{size}</button>
              ))}
            </div>
          </Field>

          <Field label="Матеріал">
            <ChipGroup options={materials} labels={BAG_MATERIAL_LABELS} value={material} onChange={(v) => setMaterial(v as BagMaterial)} />
          </Field>

          {selectedStage === 'print' ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Кілометри"><Input type="number" inputMode="decimal" placeholder="0" value={km} onChange={(e) => setKm(e.target.value)} /></Field>
              <Field label="Рулонів"><Input type="number" inputMode="numeric" placeholder="0" value={rolls} onChange={(e) => setRolls(e.target.value)} /></Field>
            </div>
          ) : (
            <Field label="Кількість упаковок (1 уп = 100 шт)">
              <Input type="number" inputMode="numeric" placeholder="0" value={packages} onChange={(e) => setPackages(e.target.value)} />
            </Field>
          )}

          <Field label="Примітки (необовʼязково)">
            <Input placeholder="Коментар" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>

          <Field label="Фото результату">
            <PhotoCapture photoUrl={photoPreview} onCapture={handlePhoto} />
          </Field>

          <Btn onClick={handleSubmit} disabled={!canSubmit} className="w-full py-4 text-base">
            {submitting ? 'Зберігаємо...' : 'Зберегти'}
          </Btn>
        </div>
      ) : (
        /* === Archive === */
        archiveLoading ? (
          <div className="flex justify-center py-10">
            <div className="w-6 h-6 border-2 border-[#4b569e] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : archive.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-3xl mb-2">📭</div>
            <p className="text-[14px] font-semibold text-[#111827]">Поки порожньо</p>
          </div>
        ) : (
          <div className="space-y-3">
            {archive.map((p: HistoryItem) => (
              <div key={p.id} className="bg-white rounded-[20px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0]">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-[14px] font-bold text-[#111827]">{p.bag_size} {BAG_MATERIAL_LABELS[p.material as BagMaterial] ?? ''}</p>
                    <p className="text-[12px] text-[#9CA3AF]">
                      {selectedStage === 'print'
                        ? `${p.km ?? '—'} км · ${p.rolls ?? '—'} рул`
                        : `${p.packages ?? '—'} уп`
                      }
                      {p.ops_staff?.name ? ` · ${p.ops_staff.name}` : ''}
                    </p>
                  </div>
                  <p className="text-[13px] font-bold text-[#4b569e]">
                    {new Date(p.created_at).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' })}
                  </p>
                </div>
                {p.notes && <p className="text-[12px] text-[#6B7280] mt-1">{p.notes}</p>}
                {p.photo_url && (
                  <button onClick={() => setLightboxUrl(p.photo_url)} className="mt-2 w-full">
                    <img src={p.photo_url} alt="" className="w-full h-28 object-cover rounded-xl" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )
      )}

      {/* Lightbox */}
      {lightboxUrl && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setLightboxUrl(null)}>
          <img src={lightboxUrl} alt="" className="max-w-full max-h-[85vh] rounded-2xl object-contain" />
          <button className="absolute top-4 right-4 w-11 h-11 bg-white/20 rounded-full flex items-center justify-center text-white text-xl" onClick={() => setLightboxUrl(null)}>✕</button>
        </div>
      )}
    </div>
  );
}

// ─── Inventory Audit Form ─────────────────────────────
function InventoryAuditForm({
  staff,
  onDone,
}: {
  staff: OpsStaff;
  onDone: () => void;
}) {
  const [location, setLocation] = useState<OpsLocation | null>(staff.location);
  const [items, setItems] = useState<
    { item_type: AuditItemType; name: string; quantity: string; unit: string; notes: string }[]
  >([{ item_type: 'raw', name: '', quantity: '', unit: 'шт', notes: '' }]);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const addItem = () => {
    setItems([...items, { item_type: 'raw', name: '', quantity: '', unit: 'шт', notes: '' }]);
  };

  const updateItem = (idx: number, field: string, value: string) => {
    const next = [...items];
    (next[idx] as Record<string, string>)[field] = value;
    setItems(next);
  };

  const removeItem = (idx: number) => {
    if (items.length > 1) setItems(items.filter((_, i) => i !== idx));
  };

  const canSubmit = location && items.some((i) => i.name && i.quantity) && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await api('/inventory-audit', {
        method: 'POST',
        body: JSON.stringify({
          location,
          audit_date: new Date().toISOString().slice(0, 10),
          items: items
            .filter((i) => i.name && i.quantity)
            .map((i) => ({
              item_type: i.item_type,
              name: i.name,
              quantity: parseFloat(i.quantity),
              unit: i.unit,
              notes: i.notes || null,
            })),
        }),
      });
      setSuccess(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Помилка');
    } finally {
      setSubmitting(false);
    }
  };

  if (success) return <SuccessScreen onDone={onDone} />;

  const units = ['шт', 'кг', 'м', 'рул', 'л', 'уп', 'кор'];

  return (
    <div className="space-y-5">
      <PageHeader icon="📝" title="Переоблік" subtitle="Щопонеділковий підрахунок" />
      <p className="text-sm text-[#6B7280]">
        {new Date().toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' })}
      </p>

      <Field label="Приміщення">
        <ChipGroup
          options={Object.keys(LOCATION_LABELS) as OpsLocation[]}
          labels={LOCATION_LABELS}
          value={location}
          onChange={(v) => setLocation(v as OpsLocation)}
        />
      </Field>

      {items.map((item, idx) => (
        <div key={idx} className="bg-white rounded-[20px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0] space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm font-semibold text-[#6B7280]">Позиція #{idx + 1}</span>
            {items.length > 1 && (
              <button onClick={() => removeItem(idx)} className="text-red-400 text-sm">
                Видалити
              </button>
            )}
          </div>

          <Field label="Тип">
            <div className="flex gap-2">
              {([
                ['raw', 'Сировина'],
                ['finished', 'Готова продукція'],
              ] as const).map(([type, label]) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => updateItem(idx, 'item_type', type)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    item.item_type === type
                      ? 'bg-[#4b569e] text-white'
                      : 'bg-[#eceef5] text-[#363f75]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Назва">
            <Input
              placeholder="Напр: Папір крафт 70г"
              value={item.name}
              onChange={(e) => updateItem(idx, 'name', e.target.value)}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Кількість">
              <Input
                type="number"
                inputMode="decimal"
                placeholder="0"
                value={item.quantity}
                onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
              />
            </Field>
            <Field label="Одиниця">
              <select
                value={item.unit}
                onChange={(e) => updateItem(idx, 'unit', e.target.value)}
                className="w-full h-12 px-4 rounded-xl border-2 border-[#E5E7EB] bg-white text-base"
              >
                {units.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Примітки (необовʼязково)">
            <Input
              placeholder="Стан, пошкодження тощо"
              value={item.notes}
              onChange={(e) => updateItem(idx, 'notes', e.target.value)}
            />
          </Field>
        </div>
      ))}

      <Btn variant="secondary" onClick={addItem} className="w-full py-3 text-base">
        + Додати позицію
      </Btn>

      <Btn onClick={handleSubmit} disabled={!canSubmit} className="w-full py-4 text-base">
        {submitting ? 'Зберігаємо...' : 'Зберегти переоблік'}
      </Btn>
    </div>
  );
}

// ─── Orders Management ───────────────────────────────
interface OrderItem {
  id: number;
  status_id: number;
  status_name: string;
  payment_status: string;
  total: number;
  ordered_at: string;
  recipient: string | null;
  phone: string | null;
  city: string | null;
  address: string | null;
  region: string | null;
  ttn: string | null;
  buyer_orders_count: number | null;
  manager_comment: string | null;
  buyer_comment: string | null;
  in_bot?: boolean;
  products: { name: string; quantity: number; price: number; sku: string | null; thumbnail: string | null; in_stock: number | null }[];
}

const ORDER_STATUSES = [
  { id: 1, label: 'Нові', color: '#3B82F6' },
  { id: 4, label: 'Оплата', color: '#F59E0B' },
  { id: 10, label: 'Наложка', color: '#8B5CF6' },
  { id: 8, label: 'Збірка', color: '#10B981' },
  { id: 12, label: 'Виконані', color: '#6B7280' },
];

const STATUS_ACTIONS = [
  { id: 1, label: 'Новий' },
  { id: 4, label: '💲 Очікуємо оплату' },
  { id: 8, label: '🚚 На збірку' },
  { id: 10, label: '💳 Наложка' },
  { id: 12, label: '✅ Виконано' },
  { id: 19, label: '❌ Скасувати' },
];

function OrdersView({ staff }: { staff: OpsStaff }) {
  const [statusFilter, setStatusFilter] = useState(1);
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [viewingOrder, setViewingOrder] = useState<OrderItem | null>(null);
  const [changingStatus, setChangingStatus] = useState(false);
  const [creatingTTN, setCreatingTTN] = useState(false);
  const [managerComment, setManagerComment] = useState('');
  const [stockQty, setStockQty] = useState<Record<string, number>>({});
  const [showTTNConfirm, setShowTTNConfirm] = useState(false);
  const [ttnWeight, setTtnWeight] = useState('0.5');
  const [ttnPayer, setTtnPayer] = useState<'Sender' | 'Recipient'>('Recipient');
  const [ttnPaymentMethod, setTtnPaymentMethod] = useState<'Cash' | 'NonCash'>('Cash');
  const [ttnResult, setTtnResult] = useState<{ ttn: string; delivery_cost: number; estimated_delivery: string } | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<{ id: string; sender_type: string; text: string; created_at: string }[]>([]);
  const [chatText, setChatText] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  // Edit address state for TTN creation
  const [editingAddress, setEditingAddress] = useState(false);
  const [editRecipient, setEditRecipient] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editCityRef, setEditCityRef] = useState('');
  const [editWarehouse, setEditWarehouse] = useState('');
  const [editWarehouseRef, setEditWarehouseRef] = useState('');
  const [editCitySuggestions, setEditCitySuggestions] = useState<{ ref: string; name: string }[]>([]);
  const [editWhSuggestions, setEditWhSuggestions] = useState<{ ref: string; name: string }[]>([]);

  // Create order state
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [coAiText, setCoAiText] = useState('');
  const [coAiParsing, setCoAiParsing] = useState(false);
  const [coLastName, setCoLastName] = useState('');
  const [coFirstName, setCoFirstName] = useState('');
  const [coPhone, setCoPhone] = useState('');
  const [coPaymentType, setCoPaymentType] = useState<'cod' | 'prepaid'>('cod');
  const [coCity, setCoCity] = useState('');
  const [coCityRef, setCoCityRef] = useState('');
  const [coWarehouse, setCoWarehouse] = useState('');
  const [coWarehouseRef, setCoWarehouseRef] = useState('');
  const [coComment, setCoComment] = useState('');
  const [coProducts, setCoProducts] = useState<{ name: string; sku: string; price: number; quantity: number }[]>([]);
  const [coSubmitting, setCoSubmitting] = useState(false);
  const [coCatalog, setCoCatalog] = useState<{ id: number; name: string; price: number; quantity: number; sku: string; thumbnail: string | null }[]>([]);
  const [coCatalogSearch, setCoCatalogSearch] = useState('');
  const [coBuyerResults, setCoBuyerResults] = useState<{ name: string; phone: string; city: string; address: string }[]>([]);
  const [coCitySuggestions, setCoCitySuggestions] = useState<{ ref: string; name: string }[]>([]);
  const [coWhSuggestions, setCoWhSuggestions] = useState<{ ref: string; name: string }[]>([]);
  const [coSuccess, setCoSuccess] = useState<number | null>(null);

  const loadChatMessages = useCallback(async (orderId: number) => {
    try {
      const res = await fetch(`/api/customer/messages?order_id=${orderId}`);
      const data = await res.json();
      setChatMessages(data.data ?? []);
    } catch {}
  }, []);

  const sendManagerMessage = async (orderId: number) => {
    if (!chatText.trim()) return;
    setChatSending(true);
    try {
      await fetch('/api/customer/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId,
          sender_type: 'manager',
          sender_telegram_id: staff.telegram_id,
          text: chatText.trim(),
        }),
      });
      setChatText('');
      loadChatMessages(orderId);
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
    } catch {} finally { setChatSending(false); }
  };

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ data: OrderItem[]; total: number }>(`/orders?status=${statusFilter}`);
      setOrders(res.data ?? []);
      setTotal(res.total ?? 0);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Помилка');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  const handleChangeStatus = async (orderId: number, newStatus: number) => {
    try {
      await api('/orders', {
        method: 'POST',
        body: JSON.stringify({ order_id: orderId, status_id: newStatus }),
      });
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
      setChangingStatus(false);
      setViewingOrder(null);
      loadOrders();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Помилка');
    }
  };

  // Create order screen
  if (creatingOrder) {
    if (coSuccess) return (
      <div className="space-y-4">
        <div className="text-center py-12">
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4 text-3xl">✅</div>
          <p className="text-[18px] font-bold text-[#111827]">Замовлення #{coSuccess} створено!</p>
          <button onClick={() => { setCreatingOrder(false); setCoSuccess(null); setCoLastName(''); setCoFirstName(''); setCoPhone(''); setCoCity(''); setCoCityRef(''); setCoWarehouse(''); setCoWarehouseRef(''); setCoProducts([]); setCoComment(''); setCoPaymentType('cod'); setCoAiText(''); loadOrders(); }}
            className="mt-6 px-6 py-3 rounded-xl bg-[#4b569e] text-white font-bold active:scale-[0.97] transition-all">
            До замовлень
          </button>
        </div>
      </div>
    );

    const coTotal = coProducts.reduce((s, p) => s + p.price * p.quantity, 0);
    const coName = `${coLastName} ${coFirstName}`.trim();
    const searchBuyer = async (q: string) => {
      if (q.length < 3) { setCoBuyerResults([]); return; }
      const phoneQ = `380${q.replace(/\D/g, '')}`;
      try {
        const r = await api<{ data: { name: string; phone: string; city: string; address: string }[] }>(`/orders/create?q=${encodeURIComponent(phoneQ)}`);
        setCoBuyerResults(r.data ?? []);
      } catch { setCoBuyerResults([]); }
    };
    let _cityTimer: ReturnType<typeof setTimeout> | null = null;
    let _whTimer: ReturnType<typeof setTimeout> | null = null;
    const searchCity = (q: string) => {
      if (_cityTimer) clearTimeout(_cityTimer);
      if (q.length < 2) { setCoCitySuggestions([]); return; }
      _cityTimer = setTimeout(async () => {
        try {
          const r = await fetch(`/api/customer/np-search?type=city&q=${encodeURIComponent(q)}`);
          const d = await r.json();
          setCoCitySuggestions((d.data ?? []).map((c: { ref: string; name: string }) => ({ ref: c.ref, name: c.name })));
        } catch {}
      }, 300);
    };
    const searchWh = (q: string) => {
      if (_whTimer) clearTimeout(_whTimer);
      if (!coCityRef) return;
      _whTimer = setTimeout(async () => {
        try {
          const r = await fetch(`/api/customer/np-search?type=warehouse&city_ref=${coCityRef}&q=${encodeURIComponent(q)}`);
          const d = await r.json();
          setCoWhSuggestions((d.data ?? []).map((w: { ref: string; name: string }) => ({ ref: w.ref, name: w.name })));
        } catch {}
      }, 200);
    };
    const loadCatalog = async () => {
      try {
        const r = await fetch('/api/customer/catalog');
        const d = await r.json();
        setCoCatalog((d.data ?? []).map((p: { id: number; name: string; price: number; quantity: number; thumbnail: string | null }) => ({ ...p, sku: String(p.id) })));
      } catch {}
    };
    if (coCatalog.length === 0) loadCatalog();

    const filteredCatalog = coCatalogSearch
      ? coCatalog.filter(p => p.name.toLowerCase().includes(coCatalogSearch.toLowerCase()))
      : coCatalog;

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setCreatingOrder(false)}
            className="w-10 h-10 rounded-xl bg-[#eceef5] flex items-center justify-center active:scale-[0.97] transition-transform">
            <svg className="w-4 h-4 text-[#4b569e]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <h2 className="text-[17px] font-bold text-[#111827]">Нове замовлення</h2>
        </div>

        {/* AI paste */}
        <div className="bg-gradient-to-br from-[#4b569e]/5 to-[#4b569e]/10 rounded-[20px] p-4 border border-[#4b569e]/15 space-y-2">
          <p className="text-[12px] font-bold text-[#4b569e]">
            <svg className="w-4 h-4 inline mr-1 -mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
            AI — вставте дані клієнта
          </p>
          <textarea
            value={coAiText}
            onChange={e => setCoAiText(e.target.value)}
            placeholder="Іванов Іван 0637443889 Одеса 95"
            className="w-full h-16 px-3 py-2 rounded-xl border border-[#4b569e]/20 bg-white text-[14px] text-[#111827] placeholder:text-[#9CA3AF] resize-none focus:border-[#4b569e] focus:outline-none"
          />
          <button
            disabled={coAiParsing || coAiText.trim().length < 5}
            onClick={async () => {
              setCoAiParsing(true);
              try {
                const r = await api<{ data: { last_name: string; first_name: string; phone: string; city: string; city_ref?: string; warehouse: string; comment: string } }>('/orders/parse', {
                  method: 'POST',
                  body: JSON.stringify({ text: coAiText }),
                });
                const d = r.data;
                setCoLastName(d.last_name || '');
                setCoFirstName(d.first_name || '');
                setCoPhone(d.phone || '');
                setCoCity(d.city || '');
                setCoWarehouse(d.warehouse || '');
                setCoComment(d.comment || '');
                if (d.city_ref) {
                  setCoCityRef(d.city_ref);
                  fetch(`/api/customer/np-search?type=warehouse&city_ref=${d.city_ref}&q=${encodeURIComponent(d.warehouse || '')}`)
                    .then(res => res.json())
                    .then(wh => {
                      const list = (wh.data ?? []).map((w: { ref: string; name: string }) => ({ ref: w.ref, name: w.name }));
                      setCoWhSuggestions(list);
                      if (d.warehouse && list.length === 0) {
                        alert(`Відділення "${d.warehouse}" не знайдено в ${d.city}. Оберіть вручну.`);
                      } else if (d.warehouse && list.length === 1) {
                        setCoWarehouse(list[0].name);
                        setCoWarehouseRef(list[0].ref);
                        setCoWhSuggestions([]);
                      }
                    })
                    .catch(() => {});
                }
                window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
                setCoAiText('');
              } catch (err) {
                alert(err instanceof Error ? err.message : 'Помилка AI');
              } finally { setCoAiParsing(false); }
            }}
            className="w-full py-2.5 rounded-xl bg-[#4b569e] text-white text-[13px] font-bold active:scale-[0.97] transition-all disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {coAiParsing ? (
              <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Розбираю...</>
            ) : (
              <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg> Розібрати AI</>
            )}
          </button>
        </div>

        {/* Buyer */}
        <div className="bg-white rounded-[20px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0] space-y-3">
          <p className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-wider">Клієнт</p>
          <div>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[14px] text-[#111827] font-bold select-none">+380</span>
              <Input placeholder="XX XXX XX XX" inputMode="tel" value={coPhone}
                className="!pl-[68px] text-[#111827]"
                onChange={e => {
                  const digits = e.target.value.replace(/\D/g, '').slice(0, 9);
                  setCoPhone(digits);
                  searchBuyer(digits);
                }} />
            </div>
            {coBuyerResults.length > 0 && (
              <div className="mt-1 bg-[#F8FAFC] rounded-xl border border-[#E5E7EB] max-h-[150px] overflow-y-auto">
                {coBuyerResults.map((b, i) => (
                  <button key={i} onClick={() => {
                    const parts = (b.name || '').split(' ');
                    setCoLastName(parts[0] || '');
                    setCoFirstName(parts.slice(1).join(' ') || '');
                    const rawPhone = b.phone?.replace(/\D/g, '') || '';
                    setCoPhone(rawPhone.startsWith('380') ? rawPhone.slice(3) : rawPhone.startsWith('0') ? rawPhone.slice(1) : rawPhone);
                    if (b.city) setCoCity(b.city);
                    if (b.address) setCoWarehouse(b.address);
                    setCoBuyerResults([]);
                  }} className="w-full text-left px-3 py-2 text-[13px] border-b border-[#F0F0F0] last:border-0 active:bg-[#eceef5]">
                    <p className="font-bold text-[#111827]">{b.name}</p>
                    <p className="text-[#9CA3AF]">{b.phone} · {b.city}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
          <Input placeholder="Прізвище" value={coLastName} onChange={e => setCoLastName(e.target.value)} />
          <Input placeholder="Ім'я" value={coFirstName} onChange={e => setCoFirstName(e.target.value)} />
        </div>

        {/* Shipping */}
        <div className="bg-white rounded-[20px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0] space-y-3">
          <p className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-wider">Доставка Нова Пошта</p>
          <div>
            <Input placeholder="Введіть місто..." value={coCity}
              onChange={e => {
                const v = e.target.value;
                setCoCity(v);
                if (coCityRef) { setCoCityRef(''); }
                searchCity(v.trim());
              }} />
            {coCitySuggestions.length > 0 && (
              <div className="mt-1 bg-white rounded-xl border-2 border-[#4b569e]/20 max-h-[160px] overflow-y-auto shadow-lg">
                {coCitySuggestions.map((c, i) => (
                  <button key={i} onClick={() => {
                    setCoCity(c.name); setCoCityRef(c.ref); setCoCitySuggestions([]);
                    setCoWarehouse(''); setCoWarehouseRef('');
                    // Auto-load warehouses for selected city
                    fetch(`/api/customer/np-search?type=warehouse&city_ref=${c.ref}&q=`)
                      .then(r => r.json())
                      .then(d => setCoWhSuggestions((d.data ?? []).map((w: { ref: string; name: string }) => ({ ref: w.ref, name: w.name }))))
                      .catch(() => {});
                    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
                  }} className="w-full text-left px-4 py-3 text-[14px] font-medium text-[#111827] border-b border-[#F0F0F0] last:border-0 active:bg-[#eceef5] transition-colors">
                    {c.name}
                  </button>
                ))}
              </div>
            )}
            {coCityRef && (
              <div className="flex items-center justify-between mt-1 px-1">
                <p className="text-[11px] text-green-600 font-medium">
                  <svg className="w-3 h-3 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                  {coCity}
                </p>
                <button onClick={() => { setCoCityRef(''); setCoCity(''); setCoWarehouse(''); setCoWarehouseRef(''); setCoWhSuggestions([]); }}
                  className="text-[11px] text-[#EF4444] font-medium active:opacity-60">Скинути</button>
              </div>
            )}
          </div>
          <div>
            {coCityRef ? (
              <>
                <Input placeholder="Номер або назва відділення..." value={coWarehouse}
                  onChange={e => {
                    const v = e.target.value;
                    setCoWarehouse(v); setCoWarehouseRef('');
                    searchWh(v);
                  }} />
                {coWhSuggestions.length > 0 && !coWarehouseRef && (
                  <div className="mt-1 bg-white rounded-xl border-2 border-[#4b569e]/20 max-h-[200px] overflow-y-auto shadow-lg">
                    {coWhSuggestions.map((w, i) => (
                      <button key={i} onClick={() => {
                        setCoWarehouse(w.name); setCoWarehouseRef(w.ref); setCoWhSuggestions([]);
                        window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
                      }} className="w-full text-left px-4 py-3 text-[13px] text-[#111827] border-b border-[#F0F0F0] last:border-0 active:bg-[#eceef5] transition-colors">
                        {w.name}
                      </button>
                    ))}
                  </div>
                )}
                {coWarehouseRef && (
                  <p className="text-[11px] text-green-600 font-medium mt-1 px-1">
                    <svg className="w-3 h-3 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                    {coWarehouse}
                  </p>
                )}
              </>
            ) : (
              <div className="px-4 py-3 rounded-xl bg-[#F8FAFC] border border-[#E5E7EB]">
                <p className="text-[13px] text-[#9CA3AF]">Спочатку оберіть місто</p>
              </div>
            )}
          </div>
        </div>

        {/* Selected products */}
        {coProducts.length > 0 && (
          <div className="bg-white rounded-[20px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0] space-y-3">
            <p className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-wider">В замовленні ({coProducts.length})</p>
            {coProducts.map((p, i) => {
              const cat = coCatalog.find(c => String(c.id) === p.sku);
              return (
                <div key={i} className="flex items-center gap-3 bg-[#F8FAFC] rounded-xl p-3">
                  {cat?.thumbnail ? (
                    <img src={cat.thumbnail} alt="" className="w-12 h-12 rounded-xl object-contain bg-white border border-[#E5E7EB] p-0.5 flex-shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-[#eceef5] flex items-center justify-center flex-shrink-0 text-lg">📦</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-[#111827] leading-tight">{p.name}</p>
                    <p className="text-[13px] font-bold text-[#4b569e] mt-0.5">{(p.price * p.quantity).toLocaleString('uk-UA')} грн</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => {
                      if (p.quantity <= 1) { setCoProducts(prev => prev.filter((_, j) => j !== i)); return; }
                      setCoProducts(prev => prev.map((pp, j) => j === i ? { ...pp, quantity: pp.quantity - 1 } : pp));
                    }} className="w-8 h-8 rounded-lg bg-white border border-[#E5E7EB] flex items-center justify-center text-[16px] font-bold active:bg-[#F0F0F0]">−</button>
                    <span className="w-8 text-center text-[15px] font-bold">{p.quantity}</span>
                    <button onClick={() => setCoProducts(prev => prev.map((pp, j) => j === i ? { ...pp, quantity: pp.quantity + 1 } : pp))}
                      className="w-8 h-8 rounded-lg bg-white border border-[#E5E7EB] flex items-center justify-center text-[16px] font-bold active:bg-[#F0F0F0]">+</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Product catalog */}
        <div className="space-y-3">
          <p className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-wider px-1">Каталог товарів</p>
          <div className="grid grid-cols-2 gap-2">
            {coCatalog.filter(p => !coProducts.some(cp => cp.sku === String(p.id))).map(p => (
              <button key={p.id} onClick={(e) => {
                if (p.quantity <= 0) {
                  if (!confirm(`⚠️ "${p.name}" немає на складі (0 шт).\n\nВсе одно додати?`)) return;
                }
                setCoProducts(prev => [...prev, { name: p.name, sku: String(p.id), price: p.price, quantity: 1 }]);
                window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
                const btn = e.currentTarget;
                btn.style.backgroundColor = '#D1FAE5';
                setTimeout(() => { btn.style.backgroundColor = ''; }, 400);
              }} className="text-left rounded-2xl bg-white border border-[#F0F0F0] shadow-[0_1px_3px_rgba(0,0,0,0.04)] active:scale-[0.95] transition-all overflow-hidden">
                <div className="aspect-[4/3] bg-[#F8FAFC] flex items-center justify-center p-2">
                  {p.thumbnail ? (
                    <img src={p.thumbnail} alt="" className="w-full h-full object-contain" />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-[#eceef5] flex items-center justify-center">
                      <svg className="w-6 h-6 text-[#4b569e]/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                    </div>
                  )}
                </div>
                <div className="p-2.5">
                  <p className="text-[11px] font-medium text-[#111827] leading-snug">{p.name}</p>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-[14px] font-bold text-[#4b569e]">{p.price} грн</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${p.quantity > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                      {p.quantity > 0 ? `${p.quantity}` : '0'}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Payment type */}
        <div className="bg-white rounded-[20px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0] space-y-3">
          <p className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-wider">Оплата</p>
          <div className="flex gap-2">
            <button onClick={() => setCoPaymentType('cod')}
              className={`flex-1 py-3 rounded-xl text-[13px] font-bold transition-all ${coPaymentType === 'cod' ? 'bg-gradient-to-b from-[#F59E0B] to-[#D97706] text-white shadow-md shadow-[#F59E0B]/25' : 'bg-white text-[#363f75] border border-[#E5E7EB]'}`}>
              Накладний платіж
            </button>
            <button onClick={() => setCoPaymentType('prepaid')}
              className={`flex-1 py-3 rounded-xl text-[13px] font-bold transition-all ${coPaymentType === 'prepaid' ? 'bg-gradient-to-b from-[#10B981] to-[#059669] text-white shadow-md shadow-[#10B981]/25' : 'bg-white text-[#363f75] border border-[#E5E7EB]'}`}>
              На рахунок
            </button>
          </div>
        </div>

        {/* Comment */}
        <div className="bg-white rounded-[20px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0]">
          <textarea value={coComment} onChange={e => setCoComment(e.target.value)}
            placeholder="Коментар до замовлення..."
            className="w-full h-16 px-3 py-2 rounded-xl border border-[#E5E7EB] bg-white text-[#111827] text-[14px] resize-none focus:border-[#4b569e] focus:outline-none placeholder:text-[#C5C9D1]" />
        </div>

        {/* Total & Submit */}
        {coProducts.length > 0 && (
          <div className="bg-gradient-to-b from-[#4b569e] to-[#363f75] rounded-[20px] p-4 text-white">
            <div className="flex justify-between items-center">
              <span className="text-[14px] opacity-80">{coProducts.reduce((s, p) => s + p.quantity, 0)} товарів</span>
              <span className="text-[22px] font-bold">{coTotal.toLocaleString('uk-UA')} грн</span>
            </div>
          </div>
        )}

        <button
          disabled={coSubmitting || !coName || !coPhone || !coCityRef || !coWarehouseRef || coProducts.length === 0}
          onClick={async () => {
            setCoSubmitting(true);
            try {
              const r = await api<{ ok: boolean; order_id: number }>('/orders/create', {
                method: 'POST',
                body: JSON.stringify({
                  buyer_name: coName, buyer_phone: `380${coPhone}`,
                  city_name: coCity, city_ref: coCityRef,
                  warehouse_name: coWarehouse, warehouse_ref: coWarehouseRef,
                  products: coProducts.map(p => ({ ...p, offer_id: 0 })),
                  comment: coComment || undefined,
                  payment_type: coPaymentType,
                }),
              });
              window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
              setCoSuccess(r.order_id);
            } catch (err) { alert(err instanceof Error ? err.message : 'Помилка'); }
            finally { setCoSubmitting(false); }
          }}
          className="w-full py-4 rounded-[20px] bg-[#4b569e] text-white text-[16px] font-bold active:scale-[0.97] transition-all disabled:opacity-40 shadow-lg shadow-[#4b569e]/25"
        >
          {coSubmitting ? '⏳ Створюємо...' : coPaymentType === 'cod' ? '✅ Створити та на збірку' : '✅ Створити замовлення'}
        </button>
      </div>
    );
  }

  // Order detail screen
  if (viewingOrder) {
    const o = viewingOrder;
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => { setViewingOrder(null); setChangingStatus(false); setEditingAddress(false); }}
            className="w-10 h-10 rounded-xl bg-[#eceef5] flex items-center justify-center active:scale-[0.97] transition-transform">
            <svg className="w-4 h-4 text-[#4b569e]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <div>
            <h2 className="text-[17px] font-bold text-[#111827]">Замовлення #{o.id}</h2>
            {(() => {
              const t = timeAgo(o.ordered_at);
              return (
                <p className="text-[13px] text-[#9CA3AF]">
                  {o.status_name} · <span className={t.isCritical ? 'text-red-600 font-bold' : t.isOverdue ? 'text-orange-500 font-bold' : ''}>⏱ {t.text}</span>
                </p>
              );
            })()}
          </div>
        </div>

        {/* Total */}
        <div className="bg-gradient-to-b from-[#4b569e] to-[#363f75] rounded-[20px] p-4 text-white shadow-lg shadow-[#4b569e]/25">
          <div className="flex justify-between items-center">
            <span className={`text-[12px] font-bold px-2 py-0.5 rounded-lg ${
              o.payment_status === 'paid' ? 'bg-white/20' : 'bg-orange-400/30'
            }`}>
              {o.payment_status === 'paid' ? '✅ Оплачено' : o.payment_status === 'not_paid' ? '💳 Не оплачено' : o.payment_status}
            </span>
            <p className="text-[24px] font-bold">{o.total.toLocaleString('uk-UA')} <span className="text-[14px] opacity-70">грн</span></p>
          </div>
        </div>

        {/* TTN */}
        {o.ttn && (
          <div className="bg-white rounded-[20px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0]">
            <p className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-wider">ТТН</p>
            <p className="text-[18px] font-mono font-bold text-[#4b569e] mt-1">{o.ttn}</p>
          </div>
        )}

        {/* Recipient */}
        <div className="bg-white rounded-[20px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0] space-y-2">
          <div className="flex justify-between items-center">
            <p className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-wider">Клієнт</p>
            {!o.ttn && (
              <button onClick={() => {
                if (!editingAddress) {
                  setEditRecipient(o.recipient ?? '');
                  setEditPhone(o.phone ?? '');
                  setEditCity(o.city ?? '');
                  setEditCityRef('');
                  setEditWarehouse(o.address ?? '');
                  setEditWarehouseRef('');
                  setEditCitySuggestions([]);
                  setEditWhSuggestions([]);
                }
                setEditingAddress(!editingAddress);
              }} className="text-[12px] font-bold text-[#4b569e] active:opacity-70 transition-opacity">
                {editingAddress ? 'Скасувати' : '✏️ Змінити адресу'}
              </button>
            )}
          </div>
          {!editingAddress ? (
            <>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1.5">
                  <p className="text-[16px] font-bold text-[#111827]">{o.recipient ?? 'Не вказано'}</p>
                  {o.in_bot && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-[#d1fae5] text-[#065f46]">В боті</span>
                  )}
                </div>
                {o.buyer_orders_count && o.buyer_orders_count > 1 && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-[#eceef5] text-[#4b569e]">{o.buyer_orders_count} замовлень</span>
                )}
              </div>
              {o.phone && (
                <div className="flex gap-2 mt-1">
                  <a href={`tel:${o.phone}`} className="flex-1 py-2 rounded-xl bg-[#4b569e] text-white text-center text-[13px] font-bold active:scale-[0.97] transition-all">
                    📞 {o.phone}
                  </a>
                  <a href={`viber://chat?number=${(o.phone || '').replace(/\+/g, '').replace(/^380/, '%2B380')}`}
                    className="px-4 py-2 rounded-xl bg-[#7360F2] text-white text-[13px] font-bold active:scale-[0.97] transition-all">
                    Viber
                  </a>
                </div>
              )}
              {o.address && <p className="text-[14px] text-[#111827] mt-2">📍 {o.address}</p>}
              {o.city && <p className="text-[13px] text-[#9CA3AF]">{o.city}{o.region ? `, ${o.region}` : ''}</p>}
              {!o.address && !o.city && (
                <p className="text-[13px] text-orange-500 font-medium mt-1">⚠️ Адреса не вказана — натисніть "Змінити адресу"</p>
              )}
            </>
          ) : (
            <div className="space-y-3 mt-2">
              <div>
                <p className="text-[12px] text-[#9CA3AF] mb-1">ПІБ отримувача</p>
                <Input value={editRecipient} onChange={e => setEditRecipient(e.target.value)} placeholder="Прізвище Ім'я По-батькові" />
              </div>
              <div>
                <p className="text-[12px] text-[#9CA3AF] mb-1">Телефон</p>
                <Input value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="+380..." inputMode="tel" />
              </div>
              <div>
                <p className="text-[12px] text-[#9CA3AF] mb-1">Місто</p>
                <Input placeholder="Введіть місто..." value={editCity}
                  onChange={e => {
                    const v = e.target.value;
                    setEditCity(v);
                    if (editCityRef) setEditCityRef('');
                    clearTimeout((window as unknown as Record<string, ReturnType<typeof setTimeout>>).__editCityTimer);
                    if (v.trim().length >= 2) {
                      (window as unknown as Record<string, ReturnType<typeof setTimeout>>).__editCityTimer = setTimeout(() => {
                        fetch(`/api/customer/np-search?type=city&q=${encodeURIComponent(v.trim())}`)
                          .then(r => r.json())
                          .then(d => setEditCitySuggestions((d.data ?? []).map((c: { ref: string; name: string }) => ({ ref: c.ref, name: c.name }))))
                          .catch(() => {});
                      }, 300);
                    } else {
                      setEditCitySuggestions([]);
                    }
                  }} />
                {editCitySuggestions.length > 0 && (
                  <div className="mt-1 bg-white rounded-xl border-2 border-[#4b569e]/20 max-h-[160px] overflow-y-auto shadow-lg">
                    {editCitySuggestions.map((c, i) => (
                      <button key={i} onClick={() => {
                        setEditCity(c.name); setEditCityRef(c.ref); setEditCitySuggestions([]);
                        setEditWarehouse(''); setEditWarehouseRef('');
                        fetch(`/api/customer/np-search?type=warehouse&city_ref=${c.ref}&q=`)
                          .then(r => r.json())
                          .then(d => setEditWhSuggestions((d.data ?? []).map((w: { ref: string; name: string }) => ({ ref: w.ref, name: w.name }))))
                          .catch(() => {});
                        window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
                      }} className="w-full text-left px-4 py-3 text-[14px] font-medium text-[#111827] border-b border-[#F0F0F0] last:border-0 active:bg-[#eceef5] transition-colors">
                        {c.name}
                      </button>
                    ))}
                  </div>
                )}
                {editCityRef && (
                  <div className="flex items-center justify-between mt-1 px-1">
                    <p className="text-[11px] text-green-600 font-medium">
                      <svg className="w-3 h-3 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                      {editCity}
                    </p>
                    <button onClick={() => { setEditCityRef(''); setEditCity(''); setEditWarehouse(''); setEditWarehouseRef(''); setEditWhSuggestions([]); }}
                      className="text-[11px] text-[#EF4444] font-medium active:opacity-60">Скинути</button>
                  </div>
                )}
              </div>
              <div>
                <p className="text-[12px] text-[#9CA3AF] mb-1">Відділення НП</p>
                {editCityRef ? (
                  <>
                    <Input placeholder="Номер або назва відділення..." value={editWarehouse}
                      onChange={e => {
                        const v = e.target.value;
                        setEditWarehouse(v); setEditWarehouseRef('');
                        clearTimeout((window as unknown as Record<string, ReturnType<typeof setTimeout>>).__editWhTimer);
                        (window as unknown as Record<string, ReturnType<typeof setTimeout>>).__editWhTimer = setTimeout(() => {
                          fetch(`/api/customer/np-search?type=warehouse&city_ref=${editCityRef}&q=${encodeURIComponent(v)}`)
                            .then(r => r.json())
                            .then(d => setEditWhSuggestions((d.data ?? []).map((w: { ref: string; name: string }) => ({ ref: w.ref, name: w.name }))))
                            .catch(() => {});
                        }, 200);
                      }} />
                    {editWhSuggestions.length > 0 && !editWarehouseRef && (
                      <div className="mt-1 bg-white rounded-xl border-2 border-[#4b569e]/20 max-h-[200px] overflow-y-auto shadow-lg">
                        {editWhSuggestions.map((w, i) => (
                          <button key={i} onClick={() => {
                            setEditWarehouse(w.name); setEditWarehouseRef(w.ref); setEditWhSuggestions([]);
                            window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
                          }} className="w-full text-left px-4 py-3 text-[13px] text-[#111827] border-b border-[#F0F0F0] last:border-0 active:bg-[#eceef5] transition-colors">
                            {w.name}
                          </button>
                        ))}
                      </div>
                    )}
                    {editWarehouseRef && (
                      <p className="text-[11px] text-green-600 font-medium mt-1 px-1">
                        <svg className="w-3 h-3 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                        {editWarehouse}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-[13px] text-[#9CA3AF] italic">Спочатку оберіть місто</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Products */}
        <div className="bg-white rounded-[20px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0] space-y-3">
          <p className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-wider">Товари ({o.products.length})</p>
          {o.products.map((p, i) => (
            <div key={i} className="flex items-center gap-3 bg-[#F8FAFC] rounded-xl p-3">
              {p.thumbnail ? (
                <button onClick={() => setLightboxUrl(p.thumbnail)} className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 border border-[#E5E7EB] bg-white">
                  <img src={p.thumbnail} alt="" className="w-full h-full object-contain p-1" />
                </button>
              ) : (
                <div className="w-14 h-14 rounded-xl bg-[#eceef5] flex items-center justify-center flex-shrink-0 text-xl">📦</div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-[#111827] leading-tight">{p.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[12px] text-[#9CA3AF]">{p.price} грн</span>
                  {p.in_stock !== null && p.in_stock !== undefined && (
                    <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${
                      p.in_stock >= p.quantity ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                    }`}>
                      {p.in_stock >= p.quantity ? `✓ ${p.in_stock} на складі` : `⚠ ${p.in_stock} на складі`}
                    </span>
                  )}
                </div>
              </div>
              <span className="text-[16px] font-bold text-[#4b569e] flex-shrink-0">×{p.quantity}</span>
            </div>
          ))}
        </div>

        {/* Comments */}
        {o.buyer_comment && (
          <div className="bg-[#FEF3C7] rounded-[20px] px-4 py-3">
            <p className="text-[12px] text-[#92400E]">💬 Покупець: {o.buyer_comment}</p>
          </div>
        )}
        {o.manager_comment && (
          <div className="bg-[#DBEAFE] rounded-[20px] px-4 py-3">
            <p className="text-[12px] text-[#1E40AF]">📝 Менеджер: {o.manager_comment}</p>
          </div>
        )}

        {/* Payment status */}
        <div className="bg-white rounded-[20px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0]">
          <p className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-wider mb-2">Статус оплати</p>
          <div className="flex gap-2">
            {([
              { key: 'paid', label: 'Оплачено', activeBg: 'bg-[#D1FAE5]', activeText: 'text-[#065F46]', activeBorder: 'border-[#A7F3D0]' },
              { key: 'not_paid', label: 'Накладний платіж', activeBg: 'bg-[#FEF3C7]', activeText: 'text-[#92400E]', activeBorder: 'border-[#FDE68A]' },
            ] as const).map(opt => {
              const isActive = o.payment_status === opt.key;
              return (
                <button key={opt.key}
                  onClick={async () => {
                    if (isActive) return;
                    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
                    try {
                      await api('/orders', { method: 'POST', body: JSON.stringify({ order_id: o.id, payment_status: opt.key }) });
                      o.payment_status = opt.key;
                      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
                      loadOrders();
                    } catch (err) { alert(err instanceof Error ? err.message : 'Помилка'); }
                  }}
                  className={`px-4 py-2.5 rounded-2xl text-[13px] font-semibold transition-all duration-200 ${
                    isActive
                      ? `${opt.activeBg} ${opt.activeText} border ${opt.activeBorder}`
                      : 'bg-white text-[#9CA3AF] border border-[#E5E7EB]'
                  }`}>
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Manager comment */}
        <div className="bg-white rounded-[20px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0] space-y-2">
          <p className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-wider">Коментар менеджера</p>
          <textarea
            value={managerComment}
            onChange={(e) => setManagerComment(e.target.value)}
            placeholder="Нотатка до замовлення..."
            className="w-full h-20 px-3 py-2 rounded-xl border border-[#E5E7EB] bg-white text-[#111827] text-[14px] resize-none focus:border-[#4b569e] focus:outline-none placeholder:text-[#C5C9D1]"
          />
          {managerComment !== (o.manager_comment ?? '') && (
            <Btn variant="secondary" onClick={async () => {
              try {
                await api('/orders', { method: 'POST', body: JSON.stringify({ order_id: o.id, status_id: o.status_id, manager_comment: managerComment }) });
                window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
              } catch (err) { alert(err instanceof Error ? err.message : 'Помилка'); }
            }} className="w-full py-2 text-[13px]">
              Зберегти коментар
            </Btn>
          )}
        </div>

        {/* TTN result */}
        {ttnResult && (
          <div className="bg-green-50 rounded-[20px] p-4 border border-green-200 space-y-2">
            <p className="text-[14px] font-bold text-green-700">✅ ТТН створено!</p>
            <p className="text-[18px] font-mono font-bold text-green-800">{ttnResult.ttn}</p>
            <p className="text-[12px] text-green-600">
              Доставка: ~{ttnResult.delivery_cost} грн · Очікувана дата: {ttnResult.estimated_delivery}
            </p>
          </div>
        )}

        {/* Create TTN */}
        {!o.ttn && !ttnResult && (
          showTTNConfirm ? (
            <div className="bg-white rounded-[20px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border-2 border-[#4b569e]/20 space-y-4">
              <p className="text-[15px] font-bold text-[#111827]">📦 Створення ТТН</p>

              <div className="bg-[#F8FAFC] rounded-xl p-3 space-y-1.5">
                <p className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-wider">Відправник</p>
                <p className="text-[14px] font-medium text-[#111827]">ФОП Вічев Юрій Іванович</p>
                <p className="text-[13px] text-[#9CA3AF]">Одеса · Грецька площа 3/4</p>
              </div>

              <div className={`rounded-xl p-3 space-y-1.5 ${editingAddress && editCityRef && editWarehouseRef ? 'bg-green-50 border border-green-200' : 'bg-[#F8FAFC]'}`}>
                <p className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-wider">
                  Отримувач {editingAddress && editCityRef && editWarehouseRef ? '(змінено)' : ''}
                </p>
                <p className="text-[14px] font-bold text-[#111827]">{editingAddress && editRecipient ? editRecipient : (o.recipient ?? '—')}</p>
                <p className="text-[13px] text-[#4b569e]">{editingAddress && editPhone ? editPhone : (o.phone ?? '—')}</p>
                <p className="text-[13px] text-[#111827]">📍 {editingAddress && editWarehouseRef ? `${editCity}, ${editWarehouse}` : (o.address ?? o.city ?? '—')}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[12px] text-[#9CA3AF] mb-1">Вага, кг</p>
                  <Input type="number" inputMode="decimal" value={ttnWeight} onChange={(e) => setTtnWeight(e.target.value)} placeholder="1" />
                </div>
                <div>
                  <p className="text-[12px] text-[#9CA3AF] mb-1">Вартість, грн</p>
                  <Input type="number" inputMode="numeric" value={String(o.total)} disabled className="!bg-[#F8FAFC] !text-[#9CA3AF]" />
                </div>
              </div>

              {/* Auto-detected payment & delivery info */}
              <div className={`rounded-xl px-3 py-2.5 space-y-1 ${o.payment_status !== 'paid' ? 'bg-[#FEF3C7] border border-[#FDE68A]' : 'bg-[#D1FAE5] border border-[#A7F3D0]'}`}>
                <p className={`text-[13px] font-semibold ${o.payment_status !== 'paid' ? 'text-[#92400E]' : 'text-[#065F46]'}`}>
                  {o.payment_status !== 'paid'
                    ? `💳 Наложка — ${o.total} грн при отриманні`
                    : '✅ Передоплата'}
                </p>
                {o.total >= 1000 && (
                  <p className="text-[12px] text-[#065F46]">🚚 Безкоштовна доставка (від 1000 грн)</p>
                )}
              </div>

              <div>
                <p className="text-[12px] text-[#9CA3AF] mb-1.5">Платник доставки</p>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setTtnPayer('Sender')}
                    className={`px-4 py-2.5 rounded-2xl text-[13px] font-semibold transition-all duration-200 ${ttnPayer === 'Sender' ? 'bg-[#4b569e] text-white shadow-md shadow-[#4b569e]/25' : 'bg-white text-[#363f75] border border-[#E5E7EB]'}`}>
                    Відправник
                  </button>
                  <button onClick={() => setTtnPayer('Recipient')}
                    className={`px-4 py-2.5 rounded-2xl text-[13px] font-semibold transition-all duration-200 ${ttnPayer === 'Recipient' ? 'bg-[#4b569e] text-white shadow-md shadow-[#4b569e]/25' : 'bg-white text-[#363f75] border border-[#E5E7EB]'}`}>
                    Отримувач
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Btn variant="secondary" onClick={() => setShowTTNConfirm(false)} className="py-3 text-[14px]">Скасувати</Btn>
                <Btn onClick={async () => {
                  window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('heavy');
                  setCreatingTTN(true);
                  try {
                    const res = await api<{ ttn: string; delivery_cost: number; estimated_delivery: string; keycrm_synced?: boolean }>('/orders/create-ttn', {
                      method: 'POST',
                      body: JSON.stringify({
                        order_id: o.id,
                        weight: parseFloat(ttnWeight) || 1,
                        payer_type: ttnPayer,
                        payment_status: o.payment_status,
                        ...(editingAddress && editRecipient ? { override_recipient: editRecipient } : {}),
                        ...(editingAddress && editPhone ? { override_phone: editPhone } : {}),
                        ...(editingAddress && editCityRef ? { override_city_ref: editCityRef } : {}),
                        ...(editingAddress && editWarehouseRef ? { override_warehouse_ref: editWarehouseRef } : {}),
                      }),
                    });
                    setTtnResult(res);
                    setShowTTNConfirm(false);
                    window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
                    if (res.keycrm_synced === false) {
                      alert('ТТН створено, але не вдалось записати в KeyCRM. Перевір вручну.');
                    }
                  } catch (err) {
                    alert(err instanceof Error ? err.message : 'Помилка');
                  } finally {
                    setCreatingTTN(false);
                  }
                }} disabled={creatingTTN} className="py-3 text-[14px]">
                  {creatingTTN ? '⏳ Створюємо...' : '✅ Створити'}
                </Btn>
              </div>
            </div>
          ) : (
            <Btn onClick={() => {
              window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('medium');
              setShowTTNConfirm(true);
              setTtnPayer((o.payment_status === 'paid' || o.total >= 1000) ? 'Sender' : 'Recipient');
            }} variant="secondary" className="w-full py-4 text-base">
              📦 Створити ТТН
            </Btn>
          )
        )}

        {/* Chat with customer */}
        <div className="bg-white rounded-[20px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0] space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-wider">Чат з клієнтом</p>
            {chatMessages.length > 0 && (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-[#4b569e] text-white">{chatMessages.length}</span>
            )}
          </div>
          {!chatOpen ? (
            <button onClick={() => { setChatOpen(true); loadChatMessages(o.id); }}
              className="w-full py-3 rounded-xl bg-[#eceef5] text-[#4b569e] text-[14px] font-bold active:scale-[0.97] transition-all">
              💬 Відкрити чат
            </button>
          ) : (
            <>
              <div className="max-h-[300px] overflow-y-auto space-y-2 bg-[#F8FAFC] rounded-xl p-3">
                {chatMessages.length === 0 ? (
                  <p className="text-[13px] text-[#9CA3AF] text-center py-4">Повідомлень немає</p>
                ) : (
                  chatMessages.map(m => (
                    <div key={m.id} className={`flex ${m.sender_type === 'manager' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-[13px] ${
                        m.sender_type === 'manager'
                          ? 'bg-[#4b569e] text-white rounded-br-md'
                          : 'bg-white text-[#111827] border border-[#E5E7EB] rounded-bl-md'
                      }`}>
                        {m.sender_type === 'customer' && (
                          <p className="text-[10px] font-bold text-[#4b569e] mb-0.5">Клієнт</p>
                        )}
                        <p>{m.text}</p>
                        <p className={`text-[9px] mt-0.5 ${m.sender_type === 'manager' ? 'text-white/60' : 'text-[#9CA3AF]'}`}>
                          {new Date(m.created_at).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatText}
                  onChange={e => setChatText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendManagerMessage(o.id); } }}
                  placeholder="Відповідь клієнту..."
                  className="flex-1 px-3 py-2.5 rounded-xl bg-[#F0F2F5] text-[13px] focus:outline-none focus:ring-2 focus:ring-[#4b569e]/30"
                />
                <button
                  onClick={() => sendManagerMessage(o.id)}
                  disabled={chatSending || !chatText.trim()}
                  className="w-10 h-10 rounded-xl bg-[#4b569e] text-white flex items-center justify-center active:scale-[0.95] transition-all disabled:opacity-40"
                >
                  {chatSending ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                    </svg>
                  )}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Change status */}
        {changingStatus ? (
          <div className="bg-white rounded-[20px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border-2 border-[#4b569e]/20 space-y-2">
            <p className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-wider">Змінити статус</p>
            {STATUS_ACTIONS.filter(s => s.id !== o.status_id).map(s => (
              <button key={s.id} onClick={() => {
                window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('medium');
                handleChangeStatus(o.id, s.id);
              }}
                className={`w-full text-left px-4 py-3 rounded-xl text-[14px] font-medium active:scale-[0.97] transition-all ${
                  s.id === 19 ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-[#F8FAFC] text-[#111827] border border-[#E5E7EB]'
                }`}>
                {s.label}
              </button>
            ))}
            <Btn variant="ghost" onClick={() => setChangingStatus(false)} className="w-full py-2 text-[13px]">Скасувати</Btn>
          </div>
        ) : (
          <Btn onClick={() => {
            window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('medium');
            setChangingStatus(true);
          }} className="w-full py-4 text-base">
            Змінити статус
          </Btn>
        )}

        {/* Lightbox */}
        {lightboxUrl && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setLightboxUrl(null)}>
            <img src={lightboxUrl} alt="" className="max-w-full max-h-[85vh] rounded-2xl object-contain" />
            <button className="absolute top-4 right-4 w-11 h-11 bg-white/20 rounded-full flex items-center justify-center text-white text-xl" onClick={() => setLightboxUrl(null)}>✕</button>
          </div>
        )}
      </div>
    );
  }

  // Orders list
  return (
    <div className="space-y-5">
      <PageHeader icon="📝" title="Замовлення" subtitle={`${total} замовлень`} />

      {/* Status filter tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {ORDER_STATUSES.map(s => (
          <button key={s.id} onClick={() => {
            window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
            setStatusFilter(s.id);
          }}
            className={`px-3 py-2 rounded-xl text-[13px] font-bold whitespace-nowrap transition-all ${
              statusFilter === s.id
                ? 'text-white shadow-md'
                : 'bg-white text-[#363f75] border border-[#F0F0F0]'
            }`}
            style={statusFilter === s.id ? { backgroundColor: s.color, boxShadow: `0 4px 12px ${s.color}40` } : {}}>
            {s.label}
          </button>
        ))}
      </div>

      {/* Create order button */}
      <button onClick={() => { setCreatingOrder(true); window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('medium'); }}
        className="w-full py-3 rounded-[16px] bg-[#4b569e] text-white text-[14px] font-bold active:scale-[0.97] transition-all shadow-md shadow-[#4b569e]/20">
        + Створити замовлення
      </button>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-10">
          <div className="w-6 h-6 border-2 border-[#4b569e] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-3xl mb-2">📭</div>
          <p className="text-[14px] font-semibold text-[#111827]">Немає замовлень</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map(o => (
            <button key={o.id} onClick={() => {
              window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
              setViewingOrder(o);
              setManagerComment(o.manager_comment ?? '');
            }}
              className="w-full text-left bg-white rounded-[20px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.06),0_6px_16px_rgba(0,0,0,0.04)]
                border border-[#F0F0F0] active:scale-[0.97] transition-all">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-bold text-[#111827]">#{o.id}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${
                      o.payment_status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                    }`}>
                      {o.payment_status === 'paid' ? 'Оплачено' : 'Не оплачено'}
                    </span>
                    {o.in_bot && <span className="px-1.5 py-0.5 rounded-md bg-[#D1FAE5] text-[#065F46] text-[9px] font-bold flex-shrink-0">В боті</span>}
                  </div>
                  <p className="text-[14px] font-medium text-[#111827] mt-1">{o.recipient ?? 'Клієнт'}</p>
                  <p className="text-[12px] text-[#9CA3AF]">{o.city ?? ''} · {o.total.toLocaleString('uk-UA')} грн · {o.products.length} поз.</p>
                </div>
                <div className="text-right flex-shrink-0">
                  {(() => {
                    const t = timeAgo(o.ordered_at);
                    return (
                      <>
                        <p className={`text-[13px] font-bold ${t.isCritical ? 'text-red-600' : t.isOverdue ? 'text-orange-500' : 'text-[#4b569e]'}`}>
                          ⏱ {t.text}
                        </p>
                        <p className="text-[11px] text-[#9CA3AF]">
                          {new Date(o.ordered_at).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' })}
                        </p>
                      </>
                    );
                  })()}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Team Management (admin only) ─────────────────────
const ALL_SECTIONS = [
  { id: 'production', label: 'Виробництво' },
  { id: 'movement', label: 'Переміщення' },
  { id: 'warehouse', label: 'Склад' },
  { id: 'shipments', label: 'Відправки' },
  { id: 'cash-report', label: 'Каса' },
  { id: 'expense', label: 'Витрати' },
  { id: 'receiving', label: 'Приймання' },
  { id: 'inventory-audit', label: 'Переоблік' },
];

function TeamView() {
  const [staff, setStaff] = useState<OpsStaff[]>([]);
  const [requests, setRequests] = useState<{ id: string; telegram_id: number; name: string; username: string | null; created_at: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [linkToStaffId, setLinkToStaffId] = useState<string | null>(null);
  const [approveRole, setApproveRole] = useState<'staff' | 'admin'>('staff');
  const [approveLocation, setApproveLocation] = useState<OpsLocation | ''>('');
  const [approveSections, setApproveSections] = useState<string[]>(['production', 'movement', 'warehouse']);
  // Extra warehouses this staffer should also see (beyond `location`). Backend
  // implicitly includes `location`, so this list is the "and also" set.
  const [approveLocations, setApproveLocations] = useState<OpsLocation[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ staff: OpsStaff[]; requests: typeof requests }>('/team');
      setStaff(res.staff ?? []);
      setRequests(res.requests ?? []);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Помилка');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleApprove = async (requestId: string) => {
    try {
      await api('/team', {
        method: 'POST',
        body: JSON.stringify({
          action: 'approve',
          request_id: requestId,
          link_to_staff_id: linkToStaffId || undefined,
          role: linkToStaffId ? undefined : approveRole,
          location: linkToStaffId ? undefined : (approveLocation || null),
          visible_sections: linkToStaffId ? undefined : approveSections,
          visible_locations: linkToStaffId ? undefined : approveLocations,
        }),
      });
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
      setApprovingId(null);
      setLinkToStaffId(null);
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Помилка');
    }
  };

  // Staff with fake telegram IDs (not yet linked to real person)
  const unlinkedStaff = staff.filter(s => s.telegram_id < 200000000);

  const handleReject = async (requestId: string) => {
    try {
      await api('/team', { method: 'POST', body: JSON.stringify({ action: 'reject', request_id: requestId }) });
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Помилка');
    }
  };

  const handleSaveStaff = async (staffId: string) => {
    try {
      await api('/team', {
        method: 'POST',
        body: JSON.stringify({
          action: 'update_staff',
          staff_id: staffId,
          role: approveRole,
          location: approveLocation || null,
          visible_sections: approveSections,
          visible_locations: approveLocations,
        }),
      });
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
      setEditingId(null);
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Помилка');
    }
  };

  const handleDeactivate = async (staffId: string) => {
    try {
      await api('/team', { method: 'POST', body: JSON.stringify({ action: 'update_staff', staff_id: staffId, active: false }) });
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Помилка');
    }
  };

  const startEditing = (s: OpsStaff) => {
    setEditingId(s.id);
    setApproveRole(s.role as 'staff' | 'admin');
    setApproveLocation((s.location as OpsLocation) || '');
    setApproveSections((s as unknown as { visible_sections?: string[] }).visible_sections ?? []);
    setApproveLocations(
      ((s as unknown as { visible_locations?: OpsLocation[] }).visible_locations ?? []),
    );
  };

  return (
    <div className="space-y-5">
      <PageHeader icon="👥" title="Команда" subtitle={`${staff.length} працівників`} />

      {loading ? (
        <div className="flex justify-center py-10">
          <div className="w-6 h-6 border-2 border-[#4b569e] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Pending requests */}
          {requests.length > 0 && (
            <div>
              <p className="text-[11px] font-bold text-orange-500 uppercase tracking-wider mb-3 px-1">
                Нові заявки ({requests.length})
              </p>
              <div className="space-y-3">
                {requests.map(req => (
                  <div key={req.id} className="bg-white rounded-[20px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border-2 border-orange-200">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <p className="text-[15px] font-bold text-[#111827]">{req.name}</p>
                        <p className="text-[12px] text-[#9CA3AF]">
                          {req.username ? `@${req.username}` : ''} · ID: {req.telegram_id}
                        </p>
                      </div>
                      <p className="text-[11px] text-[#C5C9D1]">
                        {new Date(req.created_at).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>

                    {approvingId === req.id ? (
                      <div className="space-y-3">
                        {/* Link to existing or create new */}
                        {unlinkedStaff.length > 0 && (
                          <Field label="Прив'язати до існуючого">
                            <div className="space-y-1.5">
                              {unlinkedStaff.map(s => (
                                <button key={s.id} onClick={() => setLinkToStaffId(linkToStaffId === s.id ? null : s.id)}
                                  className={`w-full text-left px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all ${
                                    linkToStaffId === s.id
                                      ? 'bg-[#4b569e] text-white'
                                      : 'bg-white text-[#111827] border border-[#E5E7EB]'
                                  }`}>
                                  {s.name}
                                  <span className={`text-[11px] ml-1 ${linkToStaffId === s.id ? 'opacity-70' : 'text-[#9CA3AF]'}`}>
                                    {s.role === 'admin' ? '👑' : '👤'}{s.location ? ` · ${LOCATION_LABELS[s.location as OpsLocation] ?? ''}` : ''}
                                  </span>
                                </button>
                              ))}
                              <button onClick={() => setLinkToStaffId(null)}
                                className={`w-full text-left px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all ${
                                  !linkToStaffId
                                    ? 'bg-[#4b569e] text-white'
                                    : 'bg-white text-[#111827] border border-[#E5E7EB]'
                                }`}>
                                ➕ Створити нового
                              </button>
                            </div>
                          </Field>
                        )}

                        {/* Show role/location/sections only for new staff */}
                        {!linkToStaffId && (
                          <>
                            <Field label="Роль">
                              <div className="flex gap-2">
                                {(['staff', 'admin'] as const).map(r => (
                                  <button key={r} onClick={() => setApproveRole(r)}
                                    className={`flex-1 py-2.5 rounded-2xl text-[13px] font-bold transition-all ${
                                      approveRole === r ? 'bg-[#4b569e] text-white' : 'bg-white text-[#363f75] border border-[#E5E7EB]'
                                    }`}>{r === 'admin' ? 'Адмін' : 'Працівник'}</button>
                                ))}
                              </div>
                            </Field>

                            <Field label="Локація">
                              <div className="flex flex-wrap gap-2">
                                <button onClick={() => setApproveLocation('')}
                                  className={`px-3 py-2 rounded-xl text-[12px] font-semibold ${!approveLocation ? 'bg-[#4b569e] text-white' : 'bg-white text-[#363f75] border border-[#E5E7EB]'}`}>
                                  Без
                                </button>
                                {(Object.keys(LOCATION_LABELS) as OpsLocation[]).map(loc => (
                                  <button key={loc} onClick={() => setApproveLocation(loc)}
                                    className={`px-3 py-2 rounded-xl text-[12px] font-semibold ${approveLocation === loc ? 'bg-[#4b569e] text-white' : 'bg-white text-[#363f75] border border-[#E5E7EB]'}`}>
                                    {LOCATION_LABELS[loc]}
                                  </button>
                                ))}
                              </div>
                            </Field>

                            <Field label="Інші локації (на додачу до основної)">
                              <div className="flex flex-wrap gap-2">
                                {(Object.keys(LOCATION_LABELS) as OpsLocation[]).map(loc => {
                                  const active = approveLocations.includes(loc);
                                  const isHome = approveLocation === loc;
                                  return (
                                    <button
                                      key={loc}
                                      disabled={isHome}
                                      onClick={() => setApproveLocations(prev =>
                                        active ? prev.filter(x => x !== loc) : [...prev, loc]
                                      )}
                                      className={`px-3 py-2 rounded-xl text-[12px] font-semibold ${
                                        isHome ? 'bg-[#eceef5] text-[#9CA3AF]' :
                                        active ? 'bg-[#4b569e] text-white' : 'bg-white text-[#363f75] border border-[#E5E7EB]'
                                      }`}>
                                      {LOCATION_LABELS[loc]}{isHome ? ' (осн.)' : ''}
                                    </button>
                                  );
                                })}
                              </div>
                            </Field>

                            <Field label="Що бачить">
                              <div className="flex flex-wrap gap-2">
                                {ALL_SECTIONS.map(s => {
                                  const active = approveSections.includes(s.id);
                                  return (
                                    <button key={s.id} onClick={() => setApproveSections(prev =>
                                      active ? prev.filter(x => x !== s.id) : [...prev, s.id]
                                    )}
                                      className={`px-3 py-2 rounded-xl text-[12px] font-semibold ${active ? 'bg-[#4b569e] text-white' : 'bg-white text-[#363f75] border border-[#E5E7EB]'}`}>
                                      {s.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </Field>
                          </>
                        )}

                        {linkToStaffId && (
                          <p className="text-[13px] text-[#4b569e] bg-[#eceef5] rounded-xl px-3 py-2">
                            Telegram акаунт буде прив'язаний до існуючого працівника. Роль і локація збережуться.
                          </p>
                        )}

                        <div className="grid grid-cols-2 gap-2">
                          <Btn variant="secondary" onClick={() => { setApprovingId(null); setLinkToStaffId(null); }} className="py-3 text-[14px]">Скасувати</Btn>
                          <Btn onClick={() => handleApprove(req.id)} className="py-3 text-[14px]">
                            {linkToStaffId ? 'Прив\'язати ✅' : 'Створити ✅'}
                          </Btn>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <Btn variant="secondary" onClick={() => handleReject(req.id)} className="py-3 text-[14px]">Відхилити ❌</Btn>
                        <Btn onClick={() => setApprovingId(req.id)} className="py-3 text-[14px]">Налаштувати ✅</Btn>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Current staff */}
          <div>
            <p className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-wider mb-3 px-1">Працівники</p>
            <div className="space-y-3">
              {staff.map(s => {
                const isEditing = editingId === s.id;
                return (
                  <div key={s.id} className="bg-white rounded-[20px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0] overflow-hidden">
                    <button
                      onClick={() => isEditing ? setEditingId(null) : startEditing(s)}
                      className="w-full text-left px-4 py-3.5 flex items-center justify-between active:bg-[#F8FAFC]"
                    >
                      <div>
                        <p className="text-[14px] font-medium text-[#111827]">{s.name}</p>
                        <p className="text-[12px] text-[#9CA3AF]">
                          {s.role === 'admin' ? '👑 Адмін' : '👤 Працівник'}
                          {s.location ? ` · ${LOCATION_LABELS[s.location as OpsLocation] ?? s.location}` : ''}
                        </p>
                      </div>
                      <svg className={`w-4 h-4 text-[#C5C9D1] transition-transform ${isEditing ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                      </svg>
                    </button>

                    {isEditing && (
                      <div className="px-4 pb-4 border-t border-[#F5F5F5] space-y-3 pt-3">
                        <Field label="Роль">
                          <div className="flex gap-2">
                            {(['staff', 'admin'] as const).map(r => (
                              <button key={r} onClick={() => setApproveRole(r)}
                                className={`flex-1 py-2.5 rounded-2xl text-[13px] font-bold transition-all ${
                                  approveRole === r ? 'bg-[#4b569e] text-white' : 'bg-white text-[#363f75] border border-[#E5E7EB]'
                                }`}>{r === 'admin' ? 'Адмін' : 'Працівник'}</button>
                            ))}
                          </div>
                        </Field>

                        <Field label="Локація">
                          <div className="flex flex-wrap gap-2">
                            <button onClick={() => setApproveLocation('')}
                              className={`px-3 py-2 rounded-xl text-[12px] font-semibold ${!approveLocation ? 'bg-[#4b569e] text-white' : 'bg-white text-[#363f75] border border-[#E5E7EB]'}`}>
                              Без
                            </button>
                            {(Object.keys(LOCATION_LABELS) as OpsLocation[]).map(loc => (
                              <button key={loc} onClick={() => setApproveLocation(loc)}
                                className={`px-3 py-2 rounded-xl text-[12px] font-semibold ${approveLocation === loc ? 'bg-[#4b569e] text-white' : 'bg-white text-[#363f75] border border-[#E5E7EB]'}`}>
                                {LOCATION_LABELS[loc]}
                              </button>
                            ))}
                          </div>
                        </Field>

                        <Field label="Інші локації (на додачу до основної)">
                          <div className="flex flex-wrap gap-2">
                            {(Object.keys(LOCATION_LABELS) as OpsLocation[]).map(loc => {
                              const active = approveLocations.includes(loc);
                              const isHome = approveLocation === loc;
                              return (
                                <button
                                  key={loc}
                                  disabled={isHome}
                                  onClick={() => setApproveLocations(prev =>
                                    active ? prev.filter(x => x !== loc) : [...prev, loc]
                                  )}
                                  className={`px-3 py-2 rounded-xl text-[12px] font-semibold ${
                                    isHome ? 'bg-[#eceef5] text-[#9CA3AF]' :
                                    active ? 'bg-[#4b569e] text-white' : 'bg-white text-[#363f75] border border-[#E5E7EB]'
                                  }`}>
                                  {LOCATION_LABELS[loc]}{isHome ? ' (осн.)' : ''}
                                </button>
                              );
                            })}
                          </div>
                        </Field>

                        <Field label="Що бачить">
                          <div className="flex flex-wrap gap-2">
                            {ALL_SECTIONS.map(sec => {
                              const active = approveSections.includes(sec.id);
                              return (
                                <button key={sec.id} onClick={() => setApproveSections(prev =>
                                  active ? prev.filter(x => x !== sec.id) : [...prev, sec.id]
                                )}
                                  className={`px-3 py-2 rounded-xl text-[12px] font-semibold ${active ? 'bg-[#4b569e] text-white' : 'bg-white text-[#363f75] border border-[#E5E7EB]'}`}>
                                  {sec.label}
                                </button>
                              );
                            })}
                          </div>
                        </Field>

                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <button onClick={() => handleDeactivate(s.id)} className="py-3 rounded-2xl text-[13px] font-bold text-red-500 bg-red-50 border border-red-200">
                            Деактивувати
                          </button>
                          <Btn onClick={() => handleSaveStaff(s.id)} className="py-3 text-[13px]">
                            Зберегти
                          </Btn>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Reports (admin only) ─────────────────────────────
// ─── Analytics Dashboard ──────────────────────────────
interface AnalyticsData {
  period: { from: string; to: string };
  total_orders: number;
  total_revenue: number;
  by_source: { name: string; source_id: number; orders: number; revenue: number }[];
  by_status: { name: string; status_id: number; count: number }[];
  by_day: { date: string; orders: number; revenue: number }[];
  avg_order: number;
  paid_percent: number;
}

const SOURCE_COLORS: Record<string, string> = {
  'Хорошоп': '#10B981',
  'Вайбер': '#8B5CF6',
  'Instagram': '#F59E0B',
  'Telegram': '#3B82F6',
  'Dezik Bot': '#4b569e',
  'Інше': '#9CA3AF',
};

function AnalyticsView() {
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('week');
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadAnalytics = useCallback(async (p: string) => {
    setLoading(true);
    try {
      const res = await api<AnalyticsData>(`/analytics?period=${p}`);
      setData(res);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAnalytics(period);
  }, [period, loadAnalytics]);

  const fmt = (n: number) => (n || 0).toLocaleString('uk-UA', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  const STATUS_COLORS: Record<string, string> = {
    'Відправлено': '#10B981',
    'На збірку': '#3B82F6',
    'Новий': '#F59E0B',
    'Оплата': '#8B5CF6',
    'Наложка': '#6366F1',
    'Скасовано': '#EF4444',
  };

  return (
    <div className="space-y-5 max-w-md mx-auto">
      {/* Header with period pills */}
      <div>
        <h2 className="text-[20px] font-bold text-[#111827] mb-4">Аналітика</h2>
        <div className="flex bg-[#F3F4F6] rounded-2xl p-1 gap-0.5">
          {(['today', 'week', 'month'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`flex-1 py-2 rounded-xl text-[13px] font-semibold transition-all duration-200 ${
                period === p
                  ? 'bg-white text-[#4b569e] shadow-sm'
                  : 'text-[#6B7280] hover:text-[#374151]'
              }`}
            >
              {{ today: 'Сьогоднi', week: 'Тиждень', month: 'Мiсяць' }[p]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-7 h-7 border-[2.5px] border-[#4b569e] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : data ? (
        <div className="space-y-4">
          {/* Top metrics — horizontal scroll */}
          <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
            {/* Orders */}
            <div className="min-w-[140px] flex-1 bg-white rounded-2xl p-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-[#F0F0F0]">
              <p className="text-[11px] text-[#9CA3AF] font-medium tracking-wide uppercase">Замовлення</p>
              <div className="flex items-baseline gap-1.5 mt-1.5">
                <span className="text-[22px] font-bold text-[#111827] leading-none">{fmt(data.total_orders)}</span>
                <span className="text-[12px] text-[#9CA3AF] font-medium">зам.</span>
              </div>
            </div>
            {/* Revenue */}
            <div className="min-w-[140px] flex-1 bg-white rounded-2xl p-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-[#F0F0F0]">
              <p className="text-[11px] text-[#9CA3AF] font-medium tracking-wide uppercase">Дохід</p>
              <div className="flex items-baseline gap-1.5 mt-1.5">
                <span className="text-[22px] font-bold text-[#10B981] leading-none">{fmt(data.total_revenue)}</span>
                <span className="text-[12px] text-[#9CA3AF] font-medium">грн</span>
              </div>
            </div>
            {/* Avg check */}
            <div className="min-w-[140px] flex-1 bg-white rounded-2xl p-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-[#F0F0F0]">
              <p className="text-[11px] text-[#9CA3AF] font-medium tracking-wide uppercase">Середній чек</p>
              <div className="flex items-baseline gap-1.5 mt-1.5">
                <span className="text-[22px] font-bold text-[#111827] leading-none">{fmt(data.avg_order)}</span>
                <span className="text-[12px] text-[#9CA3AF] font-medium">грн</span>
              </div>
            </div>
            {/* Paid % with circular indicator */}
            <div className="min-w-[140px] flex-1 bg-white rounded-2xl p-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-[#F0F0F0]">
              <p className="text-[11px] text-[#9CA3AF] font-medium tracking-wide uppercase">Оплачено</p>
              <div className="flex items-center gap-2.5 mt-1.5">
                <span className="text-[22px] font-bold text-[#111827] leading-none">{data.paid_percent}%</span>
                <svg width="28" height="28" viewBox="0 0 28 28" className="shrink-0">
                  <circle cx="14" cy="14" r="11" fill="none" stroke="#F3F4F6" strokeWidth="3" />
                  <circle
                    cx="14" cy="14" r="11" fill="none"
                    stroke={data.paid_percent >= 70 ? '#10B981' : data.paid_percent >= 40 ? '#F59E0B' : '#EF4444'}
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray={`${(data.paid_percent / 100) * 69.115} 69.115`}
                    transform="rotate(-90 14 14)"
                    style={{ transition: 'stroke-dasharray 0.7s ease-out' }}
                  />
                </svg>
              </div>
            </div>
          </div>

          {/* Revenue by source */}
          {data.by_source.length > 0 && (
            <div className="bg-white rounded-2xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-[#F0F0F0]">
              <h3 className="text-[14px] font-semibold text-[#111827] mb-3">Джерела</h3>
              <div className="space-y-3">
                {(() => {
                  const maxRevenue = Math.max(...data.by_source.map(s => s.revenue), 1);
                  return data.by_source.map((src) => {
                    const color = SOURCE_COLORS[src.name] ?? '#9CA3AF';
                    const barPct = maxRevenue > 0 ? Math.max((src.revenue / maxRevenue) * 100, 4) : 0;
                    return (
                      <div key={src.source_id}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                            <span className="text-[13px] font-medium text-[#374151]">{src.name}</span>
                            <span className="text-[11px] text-[#9CA3AF]">{src.orders} зам.</span>
                          </div>
                          <span className="text-[13px] font-semibold text-[#111827]">{fmt(src.revenue)} грн</span>
                        </div>
                        <div className="h-2 bg-[#F3F4F6] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700 ease-out"
                            style={{ width: `${barPct}%`, backgroundColor: color }}
                          />
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}

          {/* Orders trend */}
          {period === 'today' ? (
            <div className="bg-white rounded-2xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-[#F0F0F0]">
              <h3 className="text-[14px] font-semibold text-[#111827] mb-2">Динамiка</h3>
              <p className="text-[13px] text-[#6B7280]">
                Сьогоднi: <span className="font-bold text-[#111827]">{fmt(data.total_orders)}</span> замовлень
                на <span className="font-bold text-[#10B981]">{fmt(data.total_revenue)} грн</span>
              </p>
            </div>
          ) : data.by_day.length > 1 && (
            <div className="bg-white rounded-2xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-[#F0F0F0]">
              <h3 className="text-[14px] font-semibold text-[#111827] mb-3">Динамiка</h3>
              <div className="flex items-end gap-[3px]" style={{ height: 100 }}>
                {(() => {
                  const maxOrders = Math.max(...data.by_day.map(d => d.orders), 1);
                  return data.by_day.map((day) => {
                    const pct = (day.orders / maxOrders) * 100;
                    const dateObj = new Date(day.date + 'T00:00:00');
                    const dayLabel = `${String(dateObj.getDate()).padStart(2, '0')}.${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
                    return (
                      <div key={day.date} className="flex-1 flex flex-col items-center" style={{ minWidth: 0 }}>
                        {day.orders > 0 && (
                          <span className="text-[9px] font-bold text-[#4b569e] mb-0.5">{day.orders}</span>
                        )}
                        <div className="w-full flex-1 flex items-end">
                          <div
                            className="w-full rounded-t-[4px] transition-all duration-500 ease-out"
                            style={{
                              height: day.orders > 0 ? `${Math.max(pct, 8)}%` : '2px',
                              background: day.orders > 0
                                ? 'linear-gradient(180deg, #6872b0 0%, #4b569e 100%)'
                                : '#E5E7EB',
                            }}
                          />
                        </div>
                        <span className="text-[8px] text-[#9CA3AF] mt-1 leading-none">{dayLabel}</span>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}

          {/* Status breakdown */}
          {data.by_status.length > 0 && (
            <div className="bg-white rounded-2xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-[#F0F0F0]">
              <h3 className="text-[14px] font-semibold text-[#111827] mb-3">Статуси</h3>
              <div className="space-y-2.5">
                {data.by_status.map((st) => {
                  const pct = data.total_orders > 0 ? Math.round((st.count / data.total_orders) * 100) : 0;
                  const color = STATUS_COLORS[st.name] ?? '#4b569e';
                  return (
                    <div key={st.status_id}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[13px] font-medium text-[#374151]">{st.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-semibold text-[#111827]">{st.count}</span>
                          <span className="text-[11px] text-[#9CA3AF] w-8 text-right">{pct}%</span>
                        </div>
                      </div>
                      <div className="h-1.5 bg-[#F3F4F6] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500 ease-out"
                          style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-center text-[#6B7280] py-16">Немає даних</p>
      )}
    </div>
  );
}

interface ReportData {
  income: number;
  expenses: { total: number; byCategory: Record<string, number>; byLocation: Record<string, number> };
  supplierPayments: number;
  salaries: number;
  fixedCosts: number;
  totalCosts: number;
  profit: number;
  movements: Array<{
    from_location: OpsLocation;
    to_location: OpsLocation;
    description: string;
    quantity: number | null;
    created_at: string;
    ops_staff?: { name: string };
  }>;
  cashByChannel: Record<string, number>;
}

function ReportView() {
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('month');
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadReport = useCallback(async (p: string) => {
    setLoading(true);
    try {
      const res = await api<ReportData>(`/reports?period=${p}`);
      setData(res);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReport(period);
  }, [period, loadReport]);

  const fmt = (n: number) => {
    return (n || 0).toLocaleString('uk-UA', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  return (
    <div className="space-y-5">
      <PageHeader icon="📊" title="Звіти P&L" subtitle="Фінансова аналітика" />

      <div className="flex gap-2">
        {(['day', 'week', 'month'] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${
              period === p ? 'bg-[#4b569e] text-white' : 'bg-[#eceef5] text-[#363f75]'
            }`}
          >
            {{ day: 'День', week: 'Тиждень', month: 'Місяць' }[p]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <div className="w-6 h-6 border-2 border-[#4b569e] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : data ? (
        <div className="space-y-4">
          {/* P&L Summary */}
          <div className="bg-white rounded-[20px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0] space-y-3">
            <h3 className="font-semibold text-[#6B7280]">P&L</h3>
            <div className="flex justify-between">
              <span>Дохід</span>
              <span className="font-bold text-green-600">+{fmt(data.income)} грн</span>
            </div>
            <div className="flex justify-between">
              <span>Витрати</span>
              <span className="font-bold text-red-500">-{fmt(data.expenses.total)} грн</span>
            </div>
            <div className="flex justify-between">
              <span>Постачальники</span>
              <span className="font-bold text-red-500">-{fmt(data.supplierPayments)} грн</span>
            </div>
            <div className="flex justify-between">
              <span>Зарплати</span>
              <span className="font-bold text-red-500">-{fmt(data.salaries)} грн</span>
            </div>
            <div className="flex justify-between">
              <span>Постійні</span>
              <span className="font-bold text-red-500">-{fmt(data.fixedCosts)} грн</span>
            </div>
            <div className="border-t border-[#E5E7EB] pt-2 flex justify-between">
              <span className="font-bold">Прибуток</span>
              <span className={`font-bold text-lg ${data.profit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {fmt(data.profit)} грн
              </span>
            </div>
          </div>

          {/* Expenses by category */}
          {Object.keys(data.expenses.byCategory).length > 0 && (
            <div className="bg-white rounded-[20px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0] space-y-2">
              <h3 className="font-semibold text-[#6B7280]">Витрати по категоріях</h3>
              {Object.entries(data.expenses.byCategory).map(([cat, amt]) => (
                <div key={cat} className="flex justify-between">
                  <span>{EXPENSE_CATEGORY_LABELS[cat as ExpenseCategory] ?? cat}</span>
                  <span className="font-medium">{fmt(amt)} грн</span>
                </div>
              ))}
            </div>
          )}

          {/* Income by channel */}
          {Object.keys(data.cashByChannel).length > 0 && (
            <div className="bg-white rounded-[20px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0] space-y-2">
              <h3 className="font-semibold text-[#6B7280]">Дохід по каналах</h3>
              {Object.entries(data.cashByChannel).map(([ch, amt]) => (
                <div key={ch} className="flex justify-between">
                  <span>{CHANNEL_LABELS[ch as SalesChannel] ?? ch}</span>
                  <span className="font-medium">{fmt(amt)} грн</span>
                </div>
              ))}
            </div>
          )}

          {/* Movements */}
          {data.movements.length > 0 && (
            <div className="bg-white rounded-[20px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0] space-y-2">
              <h3 className="font-semibold text-[#6B7280]">Переміщення</h3>
              {data.movements.map((m, i) => (
                <div key={i} className="text-sm border-b border-[#E5E7EB] last:border-0 pb-2 last:pb-0">
                  <div className="flex justify-between">
                    <span className="font-medium">
                      {LOCATION_LABELS[m.from_location]} → {LOCATION_LABELS[m.to_location]}
                    </span>
                    <span className="text-[#6B7280]">{m.ops_staff?.name}</span>
                  </div>
                  <p className="text-[#6B7280]">{m.description}{m.quantity ? ` (${m.quantity} шт)` : ''}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="text-center text-[#6B7280] py-10">Немає даних</p>
      )}
    </div>
  );
}

// ─── History ──────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HistoryItem = any;

function HistoryView({ staff }: { staff: OpsStaff }) {
  const [tab, setTab] = useState<'production' | 'expenses' | 'receivings' | 'movements'>('production');
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api<{ data: HistoryItem[] }>(`/${tab}?days=30`)
      .then((r) => setItems(r.data ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [tab]);

  const fmt = (n: number) => (n || 0).toLocaleString('uk-UA');
  const fmtDate = (d: string) => {
    if (!d) return '';
    return new Date(d).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' });
  };

  return (
    <div className="space-y-5">
      <PageHeader icon="📋" title="Історія" subtitle="Останні 30 днів" />

      <div className="flex gap-2 overflow-x-auto pb-1">
        {([
          ['production', 'Виробн.'],
          ['expenses', 'Витрати'],
          ['receivings', 'Приймання'],
          ['movements', 'Перемiщ.'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${
              tab === key ? 'bg-[#4b569e] text-white' : 'bg-[#eceef5] text-[#363f75]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <div className="w-6 h-6 border-2 border-[#4b569e] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-center text-[#6B7280] py-10">Поки порожньо</p>
      ) : (
        <div className="space-y-3">
          {items.map((item: HistoryItem) => (
            <div
              key={item.id}
              className="bg-white rounded-[20px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0]"
            >
              <div className="flex justify-between items-start">
                <div>
                  {tab === 'production' && (
                    <>
                      <p className="font-semibold">
                        {PRODUCTION_STAGE_LABELS[item.stage as ProductionStage]} — {item.bag_size}
                      </p>
                      <p className="text-sm text-[#6B7280]">
                        {BAG_MATERIAL_LABELS[item.material as BagMaterial]}
                        {item.km ? ` · ${item.km} км` : ''}
                        {item.rolls ? ` · ${item.rolls} рул` : ''}
                        {item.packages ? ` · ${item.packages} уп` : ''}
                      </p>
                    </>
                  )}
                  {tab === 'expenses' && (
                    <>
                      <p className="font-semibold">{EXPENSE_CATEGORY_LABELS[item.category as ExpenseCategory] ?? item.category}</p>
                      <p className="text-sm text-[#6B7280]">{LOCATION_LABELS[item.location as OpsLocation] ?? item.location}</p>
                    </>
                  )}
                  {tab === 'receivings' && (
                    <>
                      <p className="font-semibold">{item.supplier}</p>
                      <p className="text-sm text-[#6B7280]">{item.quantity} шт</p>
                    </>
                  )}
                  {tab === 'movements' && (
                    <>
                      <p className="font-semibold">
                        {LOCATION_LABELS[item.from_location as OpsLocation]} → {LOCATION_LABELS[item.to_location as OpsLocation]}
                      </p>
                      <p className="text-sm text-[#6B7280]">{item.description}</p>
                    </>
                  )}
                  {staff.role === 'admin' && item.ops_staff && (
                    <p className="text-xs text-[#9CA3AF] mt-1">{item.ops_staff.name}</p>
                  )}
                </div>
                <div className="text-right">
                  {item.amount !== undefined && (
                    <p className="font-bold">{fmt(item.amount)} грн</p>
                  )}
                  <p className="text-xs text-[#9CA3AF]">{fmtDate(item.created_at)}</p>
                </div>
              </div>
              {item.photo_url && (
                <img
                  src={item.photo_url}
                  alt=""
                  className="mt-3 w-full h-24 object-cover rounded-xl"
                />
              )}
              {staff.role === 'admin' && (
                <button onClick={() => {
                  const pwd = prompt('Введіть пароль для видалення:');
                  if (!pwd) return;
                  const endpoint = tab === 'production' ? 'production' : tab === 'expenses' ? 'expenses' : tab === 'receivings' ? 'receivings' : 'movements';
                  api(`/${endpoint}?id=${item.id}&password=${pwd}`, { method: 'DELETE' })
                    .then(() => {
                      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
                      setItems(prev => prev.filter(h => h.id !== item.id));
                    })
                    .catch((err: Error) => alert(err.message || 'Помилка'));
                }} className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-50 border border-red-200 text-red-500 text-[12px] font-bold active:bg-red-100 transition-all">
                  🗑 Видалити
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── FOP Documents ───────────────────────────────────
interface FopDoc { name: string; url: string; type: 'pdf' | 'image'; uploaded_at: string; }

function FopDocsView({ staff }: { staff: OpsStaff }) {
  const [docs, setDocs] = useState<FopDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [viewingDoc, setViewingDoc] = useState<FopDoc | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const STORAGE_KEY = 'fop-documents';

  useEffect(() => {
    try { const s = localStorage.getItem(STORAGE_KEY); if (s) setDocs(JSON.parse(s)); } catch {}
    setLoading(false);
  }, []);

  const saveDocs = (next: FopDoc[]) => { setDocs(next); localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); };

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file, file.name);
      fd.append('folder', 'fop-documents');
      const res = await fetch('/api/telegram/upload', { method: 'POST', headers: { 'x-telegram-init-data': getInitData() }, body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Upload failed');
      const doc: FopDoc = { name: file.name.replace(/\.[^.]+$/, ''), url: json.url, type: file.type === 'application/pdf' ? 'pdf' : 'image', uploaded_at: new Date().toISOString() };
      saveDocs([doc, ...docs]);
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
    } catch (err) { alert(err instanceof Error ? err.message : 'Помилка завантаження'); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const shareDoc = (doc: FopDoc) => {
    const tg = window.Telegram?.WebApp;
    const url = `https://t.me/share/url?url=${encodeURIComponent(doc.url)}&text=${encodeURIComponent('📄 ' + doc.name)}`;
    if (tg?.openTelegramLink) { tg.openTelegramLink(url); } else { window.open(url, '_blank'); }
  };

  const deleteDoc = (idx: number) => { saveDocs(docs.filter((_, i) => i !== idx)); window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success'); };

  if (viewingDoc) {
    return (
      <div className="fixed inset-0 bg-[#F8FAFC] z-40 flex flex-col">
        <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-[#E5E7EB]">
          <button onClick={() => setViewingDoc(null)} className="w-9 h-9 rounded-xl bg-[#eceef5] flex items-center justify-center active:scale-[0.95] transition-transform">
            <svg className="w-4 h-4 text-[#4b569e]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
          </button>
          <h1 className="text-[15px] font-bold text-[#111827] flex-1 truncate">{viewingDoc.name}</h1>
          <button onClick={() => shareDoc(viewingDoc)} className="w-9 h-9 rounded-xl bg-[#eceef5] flex items-center justify-center active:scale-[0.95] transition-transform">
            <svg className="w-4 h-4 text-[#4b569e]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" /></svg>
          </button>
        </div>
        {viewingDoc.type === 'pdf'
          ? <iframe src={viewingDoc.type === 'pdf' ? `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(viewingDoc.url)}` : viewingDoc.url} className="flex-1 w-full" title={viewingDoc.name} />
          : <div className="flex-1 flex items-center justify-center p-4 overflow-auto"><img src={viewingDoc.url} alt={viewingDoc.name} className="max-w-full max-h-full rounded-2xl shadow-lg" /></div>
        }
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader icon="📄" title="Документи ФОП" subtitle="Завантаження та обмін" />
      <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
      <button onClick={() => fileRef.current?.click()} disabled={uploading}
        className="w-full py-4 rounded-2xl border-2 border-dashed border-[#4b569e]/30 bg-[#eceef5]/50 flex items-center justify-center gap-3 active:scale-[0.97] transition-all disabled:opacity-50">
        {uploading ? <div className="w-5 h-5 border-2 border-[#4b569e] border-t-transparent rounded-full animate-spin" />
          : <svg className="w-5 h-5 text-[#4b569e]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>}
        <span className="text-[15px] font-semibold text-[#4b569e]">{uploading ? 'Завантаження...' : 'Завантажити документ'}</span>
      </button>

      {loading ? <div className="flex justify-center py-12"><div className="w-8 h-8 border-3 border-[#4b569e] border-t-transparent rounded-full animate-spin" /></div>
      : docs.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 rounded-2xl bg-[#eceef5] flex items-center justify-center mx-auto mb-3"><span className="text-2xl">📄</span></div>
          <p className="text-[15px] font-semibold text-[#111827]">Немає документів</p>
          <p className="text-[13px] text-[#9CA3AF] mt-1">Завантажте PDF або фото документів</p>
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map((doc, i) => (
            <div key={i} className="bg-white rounded-[20px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0] overflow-hidden">
              <button onClick={() => setViewingDoc(doc)} className="w-full flex items-center gap-3.5 px-4 py-4 active:bg-[#F8F8FA] transition-colors text-left">
                <div className={`w-11 h-11 rounded-[14px] flex items-center justify-center flex-shrink-0 ${doc.type === 'pdf' ? 'bg-red-50' : 'bg-blue-50'}`}>
                  <span className="text-xl">{doc.type === 'pdf' ? '📕' : '🖼'}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-semibold text-[#111827] truncate">{doc.name}</p>
                  <p className="text-[12px] text-[#9CA3AF] mt-0.5">{new Date(doc.uploaded_at).toLocaleDateString('uk-UA')}</p>
                </div>
                <svg className="w-4 h-4 text-[#C5C9D1] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
              </button>
              <div className="flex border-t border-[#F0F0F0] divide-x divide-[#F0F0F0]">
                <button onClick={() => shareDoc(doc)} className="flex-1 flex items-center justify-center gap-2 py-3 text-[13px] font-semibold text-[#4b569e] active:bg-[#eceef5] transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" /></svg>
                  Поділитися
                </button>
                <button onClick={() => { if (confirm('Видалити документ?')) deleteDoc(i); }} className="flex-1 flex items-center justify-center gap-2 py-3 text-[13px] font-semibold text-[#EF4444] active:bg-red-50 transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                  Видалити
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Client Detail View ──────────────────────────────
function ClientDetailView({ buyerId, onBack }: { buyerId: number; onBack: () => void }) {
  const [data, setData] = useState<{
    buyer: { id: number; name: string; phone: string | null; city: string | null; orders_count: number; orders_sum: number; in_bot: boolean; created_at: string };
    profile: { segment: string; loyalty_tier: string; total_orders: number; lifetime_spend: string; avg_order_interval_days: number | null } | null;
    intelligence: { ai_summary: string; product_categories: string[]; never_bought_categories: string[]; products_running_low: { product_name: string; days_until_empty: number }[]; segment: string } | null;
    orders: { id: number; date: string; total: number; daysSincePrev: number | null; products: { name: string; qty: number; price: number }[] }[];
    productBreakdown: { name: string; count: number; totalQty: number; totalSpent: number }[];
    consumption: { product_name: string; estimated_empty_date: string; reminder_stage: number }[];
    retentionMessages: { message_type: string; message_text: string; sent_at: string }[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'orders' | 'chat'>('overview');
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<typeof data>(`/clients/${buyerId}`).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [buyerId]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

  const sendChat = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const msg = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: msg }]);
    setChatLoading(true);
    try {
      const res = await api<{ reply: string }>(`/clients/${buyerId}/chat`, {
        method: 'POST',
        body: JSON.stringify({ message: msg, history: chatMessages }),
      });
      setChatMessages(prev => [...prev, { role: 'assistant', content: res.reply }]);
    } catch {
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Помилка. Спробуйте ще раз.' }]);
    }
    setChatLoading(false);
  };

  if (loading) return <div className="flex flex-col items-center py-16 gap-3"><div className="w-6 h-6 border-2 border-[#4b569e] border-t-transparent rounded-full animate-spin" /><p className="text-[13px] text-[#9CA3AF]">Завантаження...</p></div>;
  if (!data) return <p className="text-center py-12 text-[#9CA3AF]">Помилка завантаження</p>;

  const { buyer, profile, intelligence, orders, productBreakdown, consumption, retentionMessages } = data;
  const seg = profile?.segment ?? intelligence?.segment ?? 'new';
  const segColors: Record<string, string> = { new: 'bg-blue-100 text-blue-700', active: 'bg-green-100 text-green-700', returning: 'bg-green-100 text-green-700', regular: 'bg-emerald-100 text-emerald-700', vip: 'bg-purple-100 text-purple-700', dormant: 'bg-red-100 text-red-700', lost: 'bg-red-200 text-red-800', at_risk: 'bg-orange-100 text-orange-700' };
  const tierColors: Record<string, string> = { bronze: 'bg-amber-100 text-amber-700', silver: 'bg-gray-200 text-gray-700', gold: 'bg-yellow-100 text-yellow-700', platinum: 'bg-purple-100 text-purple-700' };

  const daysSinceLast = orders[0] ? Math.round((Date.now() - new Date(orders[0].date).getTime()) / 86400000) : null;
  const avgInterval = profile?.avg_order_interval_days ?? (intelligence as Record<string, unknown>)?.avg_order_interval_days as number | null;
  const overdue = avgInterval && daysSinceLast ? Math.max(0, daysSinceLast - avgInterval) : null;

  // Journey progress
  const totalOrders = buyer.orders_count;
  const journeySteps = [
    { label: 'Новий', target: 1, emoji: '🆕' },
    { label: 'Повертається', target: 2, emoji: '🔄' },
    { label: 'Постійний', target: 5, emoji: '⭐' },
    { label: 'VIP', target: 10, emoji: '👑' },
  ];
  const currentStep = totalOrders >= 10 ? 3 : totalOrders >= 5 ? 2 : totalOrders >= 2 ? 1 : 0;
  const progressPct = Math.min(100, (totalOrders / 10) * 100);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="bg-white rounded-[20px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0]">
        <div className="flex items-center gap-3 mb-3">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center text-[18px] font-bold ${buyer.in_bot ? 'bg-[#D1FAE5] text-[#065F46]' : 'bg-[#F3F4F6] text-[#9CA3AF]'}`}>
            {buyer.name[0]?.toUpperCase()}
          </div>
          <div className="flex-1">
            <p className="text-[16px] font-bold text-[#111827]">{buyer.name}</p>
            <p className="text-[12px] text-[#9CA3AF]">{buyer.phone ?? '—'}{buyer.city ? ` · ${buyer.city}` : ''}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${segColors[seg] ?? 'bg-gray-100 text-gray-600'}`}>{seg}</span>
            {profile?.loyalty_tier && <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${tierColors[profile.loyalty_tier] ?? 'bg-gray-100 text-gray-600'}`}>{profile.loyalty_tier}</span>}
          </div>
        </div>
        {/* Journey progress */}
        <div className="flex items-center gap-1 mb-2">
          {journeySteps.map((s, i) => (
            <div key={i} className="flex-1 flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[13px] ${i < currentStep ? 'bg-[#D1FAE5] text-[#065F46]' : i === currentStep ? 'bg-[#4b569e] text-white ring-2 ring-[#4b569e]/30' : 'bg-[#F3F4F6] text-[#C5C9D1]'}`}>
                {i < currentStep ? '✓' : s.emoji}
              </div>
              <span className={`text-[9px] mt-0.5 ${i === currentStep ? 'font-bold text-[#111827]' : 'text-[#C5C9D1]'}`}>{s.label}</span>
            </div>
          ))}
        </div>
        <div className="h-1.5 bg-[#F3F4F6] rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-[#4b569e] to-[#8B5CF6] rounded-full transition-all" style={{ width: `${progressPct}%` }} />
        </div>
        <p className="text-[10px] text-[#9CA3AF] text-center mt-1">{totalOrders}/10 замовлень до VIP</p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-4 gap-2">
        <div className="bg-white rounded-[16px] p-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0] text-center">
          <p className="text-[16px] font-bold text-[#111827]">{buyer.orders_count}</p>
          <p className="text-[9px] text-[#9CA3AF]">Замовлень</p>
        </div>
        <div className="bg-white rounded-[16px] p-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0] text-center">
          <p className="text-[16px] font-bold text-[#111827]">{Math.round(buyer.orders_sum).toLocaleString('uk-UA')}</p>
          <p className="text-[9px] text-[#9CA3AF]">грн</p>
        </div>
        <div className="bg-white rounded-[16px] p-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0] text-center">
          <p className={`text-[16px] font-bold ${overdue && overdue > 0 ? 'text-[#EF4444]' : 'text-[#111827]'}`}>{daysSinceLast ?? '—'}<span className="text-[10px] font-normal">д</span></p>
          <p className="text-[9px] text-[#9CA3AF]">{overdue && overdue > 0 ? `+${overdue}д` : 'остання'}</p>
        </div>
        <div className="bg-white rounded-[16px] p-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0] text-center">
          <p className="text-[16px] font-bold text-[#111827]">{avgInterval ? `${Math.round(avgInterval)}` : '—'}<span className="text-[10px] font-normal">д</span></p>
          <p className="text-[9px] text-[#9CA3AF]">цикл</p>
        </div>
      </div>

      {/* AI Summary */}
      {intelligence?.ai_summary && (
        <div className="bg-[#eceef5] rounded-[16px] p-3 border border-[#D8DBE8]">
          <p className="text-[12px] text-[#363f75] leading-relaxed">{intelligence.ai_summary}</p>
        </div>
      )}

      {/* Consumption tracking */}
      {consumption.length > 0 && (
        <div className="bg-white rounded-[20px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[#F5F5F5]">
            <p className="text-[12px] font-bold text-[#9CA3AF] uppercase tracking-wider">Витратні матеріали</p>
          </div>
          {consumption.map((c, i) => {
            const daysLeft = Math.round((new Date(c.estimated_empty_date).getTime() - Date.now()) / 86400000);
            const statusColor = daysLeft <= 0 ? 'text-[#EF4444]' : daysLeft <= 7 ? 'text-[#F59E0B]' : 'text-[#10B981]';
            return (
              <div key={i} className={`flex items-center justify-between px-4 py-2.5 ${i > 0 ? 'border-t border-[#F5F5F5]' : ''}`}>
                <p className="text-[13px] text-[#111827]">{c.product_name}</p>
                <p className={`text-[13px] font-bold ${statusColor}`}>
                  {daysLeft <= 0 ? `${Math.abs(daysLeft)}д тому` : `${daysLeft}д`}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Tabs */}
      <div className="flex bg-white rounded-[16px] border border-[#F0F0F0] overflow-hidden">
        {(['overview', 'orders', 'chat'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-[12px] font-bold transition-colors ${tab === t ? 'bg-[#4b569e] text-white' : 'text-[#9CA3AF]'}`}>
            {t === 'overview' ? `Товари (${productBreakdown.length})` : t === 'orders' ? `Замовлення (${orders.length})` : 'AI Чат'}
          </button>
        ))}
      </div>

      {/* Tab: Overview (products + retention messages) */}
      {tab === 'overview' && (
        <div className="space-y-2">
          {productBreakdown.map((p, i) => (
            <div key={i} className="bg-white rounded-[16px] p-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0]">
              <div className="flex justify-between mb-0.5">
                <p className="text-[13px] font-semibold text-[#111827] truncate flex-1">{p.name}</p>
                <p className="text-[13px] font-bold text-[#111827] flex-shrink-0 ml-2">{Math.round(p.totalSpent)} грн</p>
              </div>
              <p className="text-[11px] text-[#9CA3AF]">{p.count}x замовлень · {p.totalQty} шт</p>
            </div>
          ))}
          {/* Never bought categories */}
          {intelligence?.never_bought_categories && intelligence.never_bought_categories.length > 0 && intelligence.never_bought_categories.length <= 5 && (
            <div className="bg-[#FEF3C7] rounded-[16px] p-3 border border-[#FDE68A]">
              <p className="text-[11px] font-bold text-[#92400E] mb-1">Cross-sell можливість</p>
              <p className="text-[12px] text-[#92400E]">Ніколи не купував: {intelligence.never_bought_categories.join(', ')}</p>
            </div>
          )}
          {/* Retention messages history */}
          {retentionMessages.length > 0 && (
            <div className="bg-white rounded-[20px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0] overflow-hidden">
              <div className="px-4 py-2.5 border-b border-[#F5F5F5]">
                <p className="text-[12px] font-bold text-[#9CA3AF] uppercase tracking-wider">Ретеншн повідомлення</p>
              </div>
              {retentionMessages.slice(0, 5).map((m, i) => (
                <div key={i} className={`px-4 py-2.5 ${i > 0 ? 'border-t border-[#F5F5F5]' : ''}`}>
                  <div className="flex justify-between mb-0.5">
                    <span className="text-[11px] font-bold text-[#4b569e]">{m.message_type}</span>
                    <span className="text-[10px] text-[#C5C9D1]">{m.sent_at?.split('T')[0]}</span>
                  </div>
                  <p className="text-[12px] text-[#6B7280] leading-relaxed">{m.message_text}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Orders */}
      {tab === 'orders' && (
        <div className="space-y-2">
          {orders.map((o, i) => (
            <div key={o.id} className="bg-white rounded-[16px] p-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0]">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-bold text-[#111827]">#{orders.length - i}</span>
                  <span className="text-[12px] text-[#9CA3AF]">{o.date}</span>
                  {o.daysSincePrev !== null && <span className="text-[10px] text-[#C5C9D1]">(через {o.daysSincePrev}д)</span>}
                </div>
                <span className="text-[14px] font-bold text-[#111827]">{Math.round(o.total)} грн</span>
              </div>
              {o.products.map((p, j) => (
                <div key={j} className="flex justify-between text-[12px] py-0.5">
                  <span className="text-[#6B7280] truncate flex-1">{p.name} <span className="text-[#C5C9D1]">×{p.qty}</span></span>
                  <span className="text-[#9CA3AF] flex-shrink-0 ml-2">{Math.round(p.price * p.qty)} грн</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Tab: AI Chat */}
      {tab === 'chat' && (
        <div className="bg-white rounded-[20px] border border-[#F0F0F0] overflow-hidden" style={{ minHeight: '50vh' }}>
          <div className="p-3 space-y-2 overflow-y-auto" style={{ maxHeight: '55vh' }}>
            {chatMessages.length === 0 && (
              <div className="text-center py-6">
                <p className="text-[24px] mb-2">🤖</p>
                <p className="text-[12px] text-[#9CA3AF] mb-3">AI знає все про {buyer.name}</p>
                <div className="flex flex-wrap gap-1.5 justify-center">
                  {['Як повернути?', 'Що запропонувати?', 'Напиши повідомлення', 'Порівняй з типовим'].map(q => (
                    <button key={q} onClick={() => { setChatInput(q); }}
                      className="px-2.5 py-1.5 bg-[#eceef5] rounded-xl text-[11px] text-[#363f75] font-medium active:scale-95">
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {chatMessages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap ${m.role === 'user' ? 'bg-[#4b569e] text-white' : 'bg-[#F3F4F6] text-[#111827]'}`}>
                  {m.content}
                </div>
              </div>
            ))}
            {chatLoading && <div className="flex justify-start"><div className="bg-[#F3F4F6] rounded-2xl px-3 py-2 text-[13px] text-[#9CA3AF]">Думаю...</div></div>}
            <div ref={chatEndRef} />
          </div>
          <form onSubmit={e => { e.preventDefault(); sendChat(); }} className="flex gap-2 p-2 border-t border-[#F0F0F0]">
            <input value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Питання про клієнта..."
              className="flex-1 h-[40px] px-3 rounded-xl border border-[#E5E7EB] text-[13px] text-[#111827] bg-white focus:border-[#4b569e] focus:outline-none" disabled={chatLoading} />
            <button type="submit" disabled={chatLoading || !chatInput.trim()}
              className="w-[40px] h-[40px] rounded-xl bg-[#4b569e] text-white flex items-center justify-center disabled:opacity-30">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" /></svg>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

// ─── Retention Preview ───────────────────────────────
function RetentionPreview({ onClientClick }: { onClientClick?: (buyerId: number) => void }) {
  const [data, setData] = useState<{ total_customers: number; total_orders_90d: number; would_send_reminders: number; would_send_winback: number; customers: {
    customer: string; phone: string; totalOrders: number; totalSpend: number; lastOrderDate: string; daysSinceLastOrder: number; segment: string;
    wouldSendPostDelivery: boolean; wouldSendWinback: boolean;
    products: { name: string; lastOrderedQty: number; daysPerUnit: number; estimatedEmptyDate: string; daysUntilEmpty: number; status: string; wouldSendReminder: boolean }[];
  }[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null); // phone being sent
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    api<typeof data>('/retention/preview').then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const segColors: Record<string, string> = { new: 'bg-blue-100 text-blue-700', active: 'bg-green-100 text-green-700', vip: 'bg-purple-100 text-purple-700', dormant: 'bg-red-100 text-red-700' };

  const handleSend = async (c: NonNullable<typeof data>['customers'][0], type: 'reorder_reminder' | 'post_delivery' | 'win_back') => {
    setSending(c.phone);
    setSendError(null);
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('medium');
    try {
      const products = c.products.filter(p => p.wouldSendReminder || p.status !== 'ok').map(p => ({
        name: p.name,
        daysLeft: p.daysUntilEmpty,
      }));
      await api('/retention/send', {
        method: 'POST',
        body: JSON.stringify({
          phone: c.phone,
          messageType: type,
          products,
          segment: c.segment,
          totalOrders: c.totalOrders,
          firstName: c.customer.split(' ')[0],
        }),
      });
      setSent(prev => new Set(prev).add(c.phone));
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Помилка';
      setSendError(msg);
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('error');
    }
    setSending(null);
  };

  if (loading) return <div className="flex flex-col items-center py-16 gap-3"><div className="w-6 h-6 border-2 border-[#4b569e] border-t-transparent rounded-full animate-spin" /><p className="text-[13px] text-[#9CA3AF]">Аналізую замовлення...</p></div>;
  if (!data) return <p className="text-center py-12 text-[#9CA3AF]">Помилка завантаження</p>;

  const needsAction = data.customers.filter(c => c.products.some(p => p.wouldSendReminder) || c.wouldSendWinback || c.wouldSendPostDelivery);
  const ok = data.customers.filter(c => !c.products.some(p => p.wouldSendReminder) && !c.wouldSendWinback && !c.wouldSendPostDelivery);

  // Funnel counts
  const fNew = data.customers.filter(c => c.segment === 'new').length;
  const fActive = data.customers.filter(c => c.segment === 'active').length;
  const fVip = data.customers.filter(c => c.segment === 'vip').length;
  const fDormant = data.customers.filter(c => c.segment === 'dormant').length;
  // "active" in preview = returning + regular (2+ orders, not dormant)
  const fReturning = data.customers.filter(c => c.segment === 'active' && c.totalOrders <= 3).length;
  const fRegular = data.customers.filter(c => c.segment === 'active' && c.totalOrders >= 4).length;

  const fTotal = data.total_customers;
  const funnelSteps = [
    { label: 'Новий', count: fNew, color: '#3B82F6', bg: '#EFF6FF', pct: fTotal > 0 ? Math.round((fNew / fTotal) * 100) : 0 },
    { label: 'Повторний', count: fReturning, color: '#10B981', bg: '#ECFDF5', pct: fTotal > 0 ? Math.round((fReturning / fTotal) * 100) : 0 },
    { label: 'Постійний', count: fRegular, color: '#8B5CF6', bg: '#F5F3FF', pct: fTotal > 0 ? Math.round((fRegular / fTotal) * 100) : 0 },
    { label: 'VIP', count: fVip, color: '#F59E0B', bg: '#FFFBEB', pct: fTotal > 0 ? Math.round((fVip / fTotal) * 100) : 0 },
  ];

  const convToRepeat = fTotal > 0 ? Math.round(((fReturning + fRegular + fVip) / fTotal) * 100) : 0;

  return (
    <div className="space-y-4">
      <PageHeader icon="🔄" title="Retention" subtitle={`${data.total_customers} клієнтів за 90 днів`} />

      {/* Funnel */}
      <div className="bg-white rounded-[20px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0]">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[12px] font-bold text-[#9CA3AF] uppercase tracking-wider">Воронка</p>
          <p className="text-[12px] text-[#9CA3AF]">Конверсія в повторних: <span className="font-bold text-[#111827]">{convToRepeat}%</span></p>
        </div>
        <div className="space-y-2">
          {funnelSteps.map((step, i) => {
            const maxCount = Math.max(...funnelSteps.map(s => s.count), 1);
            const barPct = Math.max(8, (step.count / maxCount) * 100);
            return (
              <div key={step.label}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[13px] font-semibold" style={{ color: step.color }}>{step.label}</span>
                  <span className="text-[13px] font-bold text-[#111827]">{step.count} <span className="text-[11px] font-normal text-[#9CA3AF]">({step.pct}%)</span></span>
                </div>
                <div className="h-[6px] bg-[#F3F4F6] rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${barPct}%`, backgroundColor: step.color }} />
                </div>
                {i < funnelSteps.length - 1 && (
                  <div className="flex justify-center py-0.5">
                    <svg className="w-3 h-3 text-[#D1D5DB]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" /></svg>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {fDormant > 0 && (
          <div className="mt-3 pt-3 border-t border-[#F0F0F0] flex items-center justify-between">
            <span className="text-[12px] text-[#EF4444] font-medium">Сплячі</span>
            <span className="text-[13px] font-bold text-[#EF4444]">{fDormant}</span>
          </div>
        )}
      </div>

      {/* Action summary */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white rounded-[16px] p-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0] text-center">
          <p className="text-[16px] font-bold text-[#F59E0B]">{data.would_send_reminders}</p>
          <p className="text-[10px] text-[#9CA3AF]">Нагадати</p>
        </div>
        <div className="bg-white rounded-[16px] p-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0] text-center">
          <p className="text-[16px] font-bold text-[#EF4444]">{data.would_send_winback}</p>
          <p className="text-[10px] text-[#9CA3AF]">Повернути</p>
        </div>
        <div className="bg-white rounded-[16px] p-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0] text-center">
          <p className="text-[16px] font-bold text-[#10B981]">{sent.size}</p>
          <p className="text-[10px] text-[#9CA3AF]">Надіслано</p>
        </div>
      </div>

      {sendError && (
        <div className="bg-[#FEE2E2] rounded-[16px] px-4 py-2 text-[12px] text-[#DC2626] font-medium">{sendError}</div>
      )}

      {/* Customers that need action */}
      {needsAction.length > 0 && (
        <div className="space-y-2">
          <p className="text-[12px] font-bold text-[#9CA3AF] uppercase tracking-wider px-1">Потребують дії ({needsAction.length})</p>
          {needsAction.map(c => {
            const isExp = expanded === c.phone;
            const isSent = sent.has(c.phone);
            const isSending = sending === c.phone;
            const urgent = c.products.filter(p => p.status === 'overdue' || p.status === 'empty').length;
            const soon = c.products.filter(p => p.status === 'soon').length;
            const hasReminder = c.products.some(p => p.wouldSendReminder);

            // Determine action type
            let actionType: 'reorder_reminder' | 'post_delivery' | 'win_back' = 'reorder_reminder';
            let actionLabel = 'Нагадати';
            let actionColor = 'bg-[#F59E0B]';
            if (c.wouldSendPostDelivery) { actionType = 'post_delivery'; actionLabel = 'Перевірити'; actionColor = 'bg-[#10B981]'; }
            else if (c.wouldSendWinback) { actionType = 'win_back'; actionLabel = 'Повернути'; actionColor = 'bg-[#EF4444]'; }

            return (
              <div key={c.phone}>
                <div className={`bg-white rounded-[20px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] border ${isSent ? 'border-[#D1FAE5]' : 'border-[#F0F0F0]'} overflow-hidden`}>
                  <button onClick={() => setExpanded(isExp ? null : c.phone)}
                    className="w-full p-4 active:bg-[#FAFAFA] transition-all text-left">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-[14px] font-bold text-[#111827] truncate">{c.customer}</p>
                          <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold ${segColors[c.segment] ?? 'bg-gray-100 text-gray-600'}`}>{c.segment}</span>
                          {isSent && <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-[#D1FAE5] text-[#065F46]">Надіслано</span>}
                        </div>
                        <p className="text-[12px] text-[#9CA3AF]">{c.totalOrders} зам · {c.totalSpend.toLocaleString('uk-UA')} грн · {c.daysSinceLastOrder}д тому</p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {urgent > 0 && <span className="w-5 h-5 rounded-full bg-[#EF4444] text-white text-[10px] font-bold flex items-center justify-center">{urgent}</span>}
                        {soon > 0 && <span className="w-5 h-5 rounded-full bg-[#F59E0B] text-white text-[10px] font-bold flex items-center justify-center">{soon}</span>}
                        <svg className={`w-4 h-4 text-[#C5C9D1] transition-transform ${isExp ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                      </div>
                    </div>
                  </button>
                  {isExp && (
                    <>
                      {c.wouldSendWinback && <div className="px-4 py-2 bg-[#FEE2E2] text-[12px] font-semibold text-[#DC2626]">Клієнт неактивний {c.daysSinceLastOrder} днів</div>}
                      {c.wouldSendPostDelivery && <div className="px-4 py-2 bg-[#D1FAE5] text-[12px] font-semibold text-[#065F46]">Замовлення щойно доставлене</div>}
                      {c.products.length === 0 ? <p className="px-4 py-3 text-[13px] text-[#9CA3AF]">Немає витратних товарів</p>
                      : c.products.map((p, i) => {
                        const colors = { ok: 'text-[#059669]', soon: 'text-[#D97706]', empty: 'text-[#DC2626]', overdue: 'text-[#DC2626]' };
                        const labels = { ok: 'ОК', soon: 'Скоро', empty: 'Закінчується', overdue: 'Закінчився' };
                        return (
                          <div key={i} className={`flex items-center justify-between px-4 py-2.5 ${i > 0 ? 'border-t border-[#F5F5F5]' : ''}`}>
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] font-medium text-[#111827] truncate">{p.name} ×{p.lastOrderedQty}</p>
                              <p className="text-[11px] text-[#9CA3AF]">Пустий: {p.estimatedEmptyDate}</p>
                            </div>
                            <div className="text-right flex-shrink-0 ml-2">
                              <p className={`text-[13px] font-bold ${colors[p.status as keyof typeof colors] ?? 'text-[#9CA3AF]'}`}>
                                {p.daysUntilEmpty > 0 ? `${p.daysUntilEmpty}д` : `${Math.abs(p.daysUntilEmpty)}д назад`}
                              </p>
                              <p className={`text-[10px] font-semibold ${colors[p.status as keyof typeof colors]}`}>{labels[p.status as keyof typeof labels]}</p>
                            </div>
                          </div>
                        );
                      })}
                      {/* Action buttons */}
                      {!isSent && (
                        <div className="flex gap-2 p-3 border-t border-[#F0F0F0]">
                          <button
                            onClick={() => handleSend(c, actionType)}
                            disabled={isSending}
                            className={`flex-1 h-[40px] rounded-xl ${actionColor} text-white text-[13px] font-bold active:scale-[0.97] disabled:opacity-50 flex items-center justify-center gap-1.5`}
                          >
                            {isSending ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : actionLabel}
                          </button>
                        </div>
                      )}
                      {isSent && (
                        <div className="px-4 py-2.5 border-t border-[#D1FAE5] bg-[#F0FDF4] text-[12px] font-semibold text-[#065F46] text-center">
                          Повідомлення надіслано в Telegram
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* OK customers */}
      {ok.length > 0 && (
        <div className="space-y-2">
          <p className="text-[12px] font-bold text-[#9CA3AF] uppercase tracking-wider px-1">Все ОК ({ok.length})</p>
          {ok.slice(0, 5).map(c => (
            <div key={c.phone} className="bg-white rounded-[20px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0]">
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-[#111827] truncate">{c.customer}</p>
                  <p className="text-[12px] text-[#9CA3AF]">{c.totalOrders} зам · {c.daysSinceLastOrder}д тому</p>
                </div>
                <span className="text-[11px] font-bold text-[#059669]">OK</span>
              </div>
            </div>
          ))}
          {ok.length > 5 && <p className="text-center text-[12px] text-[#C5C9D1]">+ ще {ok.length - 5} клієнтів</p>}
        </div>
      )}
    </div>
  );
}

// ─── All Clients (KeyCRM) ────────────────────────────
function AllClientsView({ onClientClick }: { onClientClick?: (buyerId: number) => void }) {
  const [clients, setClients] = useState<{ id: number; name: string; phone: string | null; orders_count: number; orders_sum: number; in_bot: boolean; created_at: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (q: string, p: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p) });
      if (q) params.set('search', q);
      const r = await api<{ data: typeof clients; total: number; last_page: number }>(`/clients?${params}`);
      setClients(r.data ?? []);
      setTotal(r.total ?? 0);
      setLastPage(r.last_page ?? 1);
    } catch (err) { console.error('[AllClients]', err); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load('', 1); }, [load]);

  const doSearch = (q: string) => {
    setSearch(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setPage(1); load(q, 1); }, 400);
  };

  return (
    <div className="space-y-4">
      <PageHeader icon="👤" title="Клієнти" subtitle={`${total} клієнтів у KeyCRM`} />

      <div className="relative">
        <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <input placeholder="Пошук по імені або телефону..." value={search} onChange={e => doSearch(e.target.value)}
          className="w-full h-[44px] pl-11 pr-4 rounded-2xl border border-[#E5E7EB] bg-white text-[#111827] text-[14px] focus:border-[#4b569e] focus:outline-none placeholder:text-[#C5C9D1]" />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-[#4b569e] border-t-transparent rounded-full animate-spin" /></div>
      ) : clients.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-[15px] font-semibold text-[#111827]">{search ? 'Не знайдено' : 'Немає клієнтів'}</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-[20px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0] divide-y divide-[#F5F5F5]">
            {clients.map(c => (
              <button key={c.id} onClick={() => onClientClick?.(c.id)} className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-[#F9FAFB] transition-colors">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-[14px] font-bold ${c.in_bot ? 'bg-[#D1FAE5] text-[#065F46]' : 'bg-[#F3F4F6] text-[#9CA3AF]'}`}>
                  {c.name[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-[14px] font-semibold text-[#111827] truncate">{c.name}</p>
                    {c.in_bot && <span className="px-1.5 py-0.5 rounded-md bg-[#D1FAE5] text-[#065F46] text-[9px] font-bold flex-shrink-0">В боті</span>}
                  </div>
                  <p className="text-[12px] text-[#9CA3AF]">{c.phone ?? '—'} · {c.orders_count} зам · {c.orders_sum.toLocaleString('uk-UA')} грн</p>
                </div>
                <svg className="w-4 h-4 text-[#C5C9D1] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
              </button>
            ))}
          </div>
          {lastPage > 1 && (
            <div className="flex items-center justify-center gap-3">
              <button disabled={page <= 1} onClick={() => { setPage(p => p - 1); load(search, page - 1); }}
                className="px-4 py-2 rounded-xl bg-[#eceef5] text-[#363f75] text-[13px] font-semibold disabled:opacity-30">← Назад</button>
              <span className="text-[13px] text-[#9CA3AF]">{page} / {lastPage}</span>
              <button disabled={page >= lastPage} onClick={() => { setPage(p => p + 1); load(search, page + 1); }}
                className="px-4 py-2 rounded-xl bg-[#eceef5] text-[#363f75] text-[13px] font-semibold disabled:opacity-30">Далі →</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Bot Clients ─────────────────────────────────────
interface BotClient {
  phone: string | null;
  first_name: string | null;
  telegram_id: number;
  is_customer: boolean;
  joined_at: string | null;
  last_active: string | null;
}

function BotClientsView() {
  const [clients, setClients] = useState<BotClient[]>([]);
  const [totalSubs, setTotalSubs] = useState(0);
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/telegram/team?type=bot_clients', {
      headers: { 'x-telegram-init-data': getInitData() },
    })
      .then(r => r.json())
      .then(d => { setClients(d.data ?? []); setTotalSubs(d.total_subscribers ?? 0); setTotalCustomers(d.total_customers ?? 0); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = search.trim()
    ? clients.filter(c => (c.first_name ?? '').toLowerCase().includes(search.toLowerCase()) || (c.phone ?? '').includes(search))
    : clients;

  return (
    <div className="space-y-4">
      <PageHeader icon="👥" title="Клієнти в боті" subtitle={`${clients.length} всього`} />

      {/* Stats */}
      {!loading && (
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white rounded-[20px] p-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0] text-center">
            <p className="text-[20px] font-bold text-[#111827]">{totalSubs}</p>
            <p className="text-[11px] text-[#9CA3AF]">Підписників</p>
          </div>
          <div className="bg-white rounded-[20px] p-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0] text-center">
            <p className="text-[20px] font-bold text-[#10B981]">{totalCustomers}</p>
            <p className="text-[11px] text-[#9CA3AF]">З телефоном</p>
          </div>
        </div>
      )}

      <div className="relative">
        <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <input placeholder="Пошук по імені або телефону..." value={search} onChange={e => setSearch(e.target.value)}
          className="w-full h-[44px] pl-11 pr-4 rounded-2xl border border-[#E5E7EB] bg-white text-[#111827] text-[14px] focus:border-[#4b569e] focus:outline-none placeholder:text-[#C5C9D1]" />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-[#4b569e] border-t-transparent rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-[15px] font-semibold text-[#111827]">{search ? 'Не знайдено' : 'Немає клієнтів'}</p>
        </div>
      ) : (
        <div className="bg-white rounded-[20px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0] divide-y divide-[#F5F5F5]">
          {filtered.map(c => (
            <div key={c.telegram_id} className="flex items-center gap-3 px-4 py-3.5">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-[14px] font-bold ${c.is_customer ? 'bg-[#D1FAE5] text-[#065F46]' : 'bg-[#F3F4F6] text-[#9CA3AF]'}`}>
                {(c.first_name ?? c.phone ?? '?')[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-[14px] font-semibold text-[#111827] truncate">{c.first_name || 'Без імені'}</p>
                  {c.is_customer && <span className="px-1.5 py-0.5 rounded-md bg-[#D1FAE5] text-[#065F46] text-[9px] font-bold flex-shrink-0">Клієнт</span>}
                </div>
                <p className="text-[12px] text-[#9CA3AF]">{c.phone || `tg: ${c.telegram_id}`}</p>
              </div>
              <div className="text-right flex-shrink-0">
                {c.last_active && <p className="text-[11px] text-[#9CA3AF]">{new Date(c.last_active).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' })}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Stock Dashboard ─────────────────────────────────
type StockCategory = 'raw' | 'finished';
interface DashStockItem { name: string; quantity: number; unit: string; item_type?: string; }

const DASH_LOCS = [
  { id: 'malynovskogo' as const, icon: '🏭', name: 'Маліновського', hasRaw: true },
  { id: 'afina_sklad' as const, icon: '📦', name: 'Афіна склад', hasRaw: false },
  { id: 'dalnytska' as const, icon: '🧪', name: 'Дальницька', hasRaw: true },
];

const LEVEL_STYLES = {
  good: { bg: 'bg-[#D1FAE5]', text: 'text-[#059669]', dot: 'bg-[#10B981]' },
  low: { bg: 'bg-[#FEF3C7]', text: 'text-[#D97706]', dot: 'bg-[#F59E0B]' },
  critical: { bg: 'bg-[#FEE2E2]', text: 'text-[#DC2626]', dot: 'bg-[#EF4444]' },
};

function stockLevel(qty: number, name: string): 'good' | 'low' | 'critical' {
  if (qty <= 0) return 'critical';
  const isBag = name.includes('×') || name.includes('x');
  const crit = isBag ? 5 : 3;
  const low = isBag ? 20 : 10;
  if (qty <= crit) return 'critical';
  if (qty <= low) return 'low';
  return 'good';
}

function StockDashboard() {
  const [cat, setCat] = useState<StockCategory>('finished');
  const [search, setSearch] = useState('');
  const [locData, setLocData] = useState<Record<string, { items: DashStockItem[]; source: string; lastAudit: string | null; loading: boolean }>>({});
  const [expandedLoc, setExpandedLoc] = useState<string | null>(null);

  useEffect(() => {
    const init: typeof locData = {};
    DASH_LOCS.forEach(l => { init[l.id] = { items: [], source: '', lastAudit: null, loading: true }; });
    setLocData(init);
    Promise.all(DASH_LOCS.map(async l => {
      try {
        const r = await api<{ data: DashStockItem[]; source: string; lastAudit: { date: string } | null }>(`/stock?location=${l.id}`);
        return { id: l.id, items: r.data ?? [], source: r.source ?? '', lastAudit: r.lastAudit?.date ?? null };
      } catch { return { id: l.id, items: [], source: '', lastAudit: null }; }
    })).then(results => {
      const next: typeof locData = {};
      results.forEach(r => { next[r.id] = { items: r.items, source: r.source, lastAudit: r.lastAudit, loading: false }; });
      setLocData(next);
    });
  }, []);

  const filterItems = (items: DashStockItem[]) => {
    let f = items.filter(i => cat === 'raw' ? i.item_type === 'raw' : i.item_type !== 'raw');
    if (search.trim()) { const q = search.toLowerCase(); f = f.filter(i => i.name.toLowerCase().includes(q)); }
    return f.sort((a, b) => a.name.localeCompare(b.name, 'uk'));
  };

  const allLoading = Object.values(locData).some(d => d.loading);

  // Totals
  const totalsMap: Record<string, DashStockItem> = {};
  DASH_LOCS.forEach(l => {
    if (cat === 'raw' && !l.hasRaw) return;
    filterItems(locData[l.id]?.items ?? []).forEach(item => {
      if (!totalsMap[item.name]) totalsMap[item.name] = { ...item, quantity: 0 };
      totalsMap[item.name].quantity += item.quantity;
    });
  });
  const totals = Object.values(totalsMap).sort((a, b) => a.name.localeCompare(b.name, 'uk'));

  const counts = { good: 0, low: 0, critical: 0 };
  totals.forEach(i => { counts[stockLevel(i.quantity, i.name)]++; });

  return (
    <div className="space-y-5">
      <PageHeader icon="📊" title="Залишки" subtitle="Всі локації" />

      {/* Toggle */}
      <div className="grid grid-cols-2 gap-2">
        {([{ id: 'finished' as StockCategory, label: '📦 Готова продукція' }, { id: 'raw' as StockCategory, label: '🧱 Сировина' }]).map(c => (
          <button key={c.id} onClick={() => { setCat(c.id); setExpandedLoc(null); window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light'); }}
            className={`py-3 rounded-2xl text-[13px] font-bold transition-all duration-200 ${cat === c.id ? 'bg-[#4b569e] text-white shadow-md shadow-[#4b569e]/25' : 'bg-white text-[#363f75] border border-[#F0F0F0]'}`}>
            {c.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <input placeholder="Пошук..." value={search} onChange={e => setSearch(e.target.value)}
          className="w-full h-[44px] pl-11 pr-9 rounded-2xl border border-[#E5E7EB] bg-white text-[#111827] text-[14px] focus:border-[#4b569e] focus:outline-none placeholder:text-[#C5C9D1]" />
        {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[#F3F4F6] flex items-center justify-center">
          <svg className="w-3 h-3 text-[#6B7280]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>}
      </div>

      {allLoading ? (
        <div className="flex flex-col items-center py-16 gap-3">
          <div className="w-6 h-6 border-2 border-[#4b569e] border-t-transparent rounded-full animate-spin" />
          <p className="text-[13px] text-[#9CA3AF]">Завантаження...</p>
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-3 gap-2">
            {([{ k: 'good' as const, label: 'Норма' }, { k: 'low' as const, label: 'Мало' }, { k: 'critical' as const, label: 'Критично' }]).map(s => (
              <div key={s.k} className="bg-white rounded-[20px] p-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0] text-center">
                <div className={`w-7 h-7 rounded-lg ${LEVEL_STYLES[s.k].bg} flex items-center justify-center mx-auto mb-1.5`}>
                  <div className={`w-2.5 h-2.5 rounded-full ${LEVEL_STYLES[s.k].dot}`} />
                </div>
                <p className="text-[18px] font-bold text-[#111827]">{counts[s.k]}</p>
                <p className="text-[11px] text-[#9CA3AF]">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Totals */}
          {totals.length > 0 && (
            <div>
              <p className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-wider mb-2 px-1">Загалом</p>
              <div className="bg-white rounded-[20px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0] overflow-hidden">
                {totals.map((item, i) => {
                  const lv = stockLevel(item.quantity, item.name);
                  const st = LEVEL_STYLES[lv];
                  return (
                    <div key={item.name} className={`flex items-center justify-between px-4 py-3 ${i > 0 ? 'border-t border-[#F5F5F5]' : ''}`}>
                      <div className="flex items-center gap-2.5 flex-1 min-w-0">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${st.dot}`} />
                        <p className="text-[14px] font-medium text-[#111827] truncate">{item.name}</p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                        <span className={`px-2 py-0.5 rounded-lg text-[13px] font-bold ${st.bg} ${st.text}`}>{item.quantity}</span>
                        <span className="text-[11px] text-[#9CA3AF] w-5">{item.unit}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Per location */}
          <div>
            <p className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-wider mb-2 px-1">По локаціях</p>
            <div className="space-y-2">
              {DASH_LOCS.filter(l => cat !== 'raw' || l.hasRaw).map(l => {
                const d = locData[l.id];
                const filtered = filterItems(d?.items ?? []);
                const isExp = expandedLoc === l.id;
                const lCounts = { good: 0, low: 0, critical: 0 };
                filtered.forEach(i => { lCounts[stockLevel(i.quantity, i.name)]++; });
                return (
                  <div key={l.id}>
                    <button onClick={() => { setExpandedLoc(isExp ? null : l.id); window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light'); }}
                      className="w-full bg-white rounded-[20px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0] active:scale-[0.98] transition-all">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-[#eceef5] flex items-center justify-center text-xl flex-shrink-0">{l.icon}</div>
                        <div className="flex-1 text-left min-w-0">
                          <p className="text-[14px] font-bold text-[#111827]">{l.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {d?.loading ? <div className="w-3 h-3 border-2 border-[#4b569e] border-t-transparent rounded-full animate-spin" />
                            : filtered.length === 0 ? <span className="text-[12px] text-[#9CA3AF]">Немає даних</span>
                            : <>
                              <span className="text-[12px] text-[#6B7280] font-medium">{filtered.length} поз.</span>
                              {lCounts.critical > 0 && <span className="flex items-center gap-0.5"><div className="w-1.5 h-1.5 rounded-full bg-[#EF4444]" /><span className="text-[10px] font-bold text-[#EF4444]">{lCounts.critical}</span></span>}
                              {lCounts.low > 0 && <span className="flex items-center gap-0.5"><div className="w-1.5 h-1.5 rounded-full bg-[#F59E0B]" /><span className="text-[10px] font-bold text-[#D97706]">{lCounts.low}</span></span>}
                            </>}
                          </div>
                        </div>
                        <svg className={`w-4 h-4 text-[#C5C9D1] transition-transform ${isExp ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                      </div>
                    </button>
                    {isExp && (
                      <div className="mt-1 bg-white rounded-[20px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0] overflow-hidden">
                        <div className="px-4 py-2 bg-[#F8FAFC] border-b border-[#F0F0F0]">
                          <p className="text-[11px] text-[#9CA3AF]">{d?.source === 'keycrm' ? '📡 KeyCRM' : d?.source === 'production' ? '🏭 Виробництво' : d?.lastAudit ? `📋 Переоблік: ${d.lastAudit}` : '📋 Дані переобліку'}</p>
                        </div>
                        {filtered.length === 0 ? <p className="py-6 text-center text-[13px] text-[#9CA3AF]">{search ? 'Не знайдено' : 'Немає даних'}</p>
                        : filtered.map((item, i) => {
                          const lv = stockLevel(item.quantity, item.name); const st = LEVEL_STYLES[lv];
                          return (
                            <div key={`${item.name}-${i}`} className={`flex items-center justify-between px-4 py-2.5 ${i > 0 ? 'border-t border-[#F5F5F5]' : ''}`}>
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${st.dot}`} />
                                <p className="text-[13px] font-medium text-[#111827] truncate">{item.name}</p>
                              </div>
                              <div className="flex items-baseline gap-1 flex-shrink-0 ml-2">
                                <span className={`text-[15px] font-bold ${st.text}`}>{item.quantity}</span>
                                <span className="text-[10px] text-[#9CA3AF]">{item.unit}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {totals.length === 0 && <div className="text-center py-10">
            <p className="text-2xl mb-2">{search ? '🔍' : '📦'}</p>
            <p className="text-[15px] font-semibold text-[#111827]">{search ? 'Не знайдено' : 'Немає даних'}</p>
            <p className="text-[13px] text-[#9CA3AF] mt-1">{search ? 'Спробуйте інший запит' : 'Зробіть переоблік'}</p>
          </div>}
        </>
      )}
    </div>
  );
}

// ─── Messages Inbox ──────────────────────────────────
interface ChatConv {
  id: string;
  customer_phone: string | null;
  customer_name: string | null;
  customer_telegram_id: number | null;
  status: string;
  last_message_at: string;
  last_message_preview: string | null;
  last_message_sender: string | null;
  unread_by_manager: number;
}

interface ChatMsg {
  id: string;
  conversation_id: string;
  sender_type: string;
  text: string | null;
  content_type: string;
  media_url: string | null;
  order_id: number | null;
  created_at: string;
}

function MessagesInbox({ onOpenChat, chatConvId, onBack }: {
  onOpenChat: (id: string) => void;
  chatConvId: string | null;
  onBack: () => void;
}) {
  const [convs, setConvs] = useState<ChatConv[]>([]);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [activeConv, setActiveConv] = useState<ChatConv | null>(null);
  const msgEndRef = useRef<HTMLDivElement>(null);

  const loadConvs = useCallback(async () => {
    try {
      const r = await api<{ data: ChatConv[] }>('/chat/conversations');
      setConvs(r.data ?? []);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { loadConvs(); }, [loadConvs]);

  const openChat = useCallback(async (conv: ChatConv) => {
    setActiveConv(conv);
    setMsgLoading(true);
    setMessages([]);
    onOpenChat(conv.id);
    try {
      const r = await api<{ data: ChatMsg[] }>(`/chat/conversations/${conv.id}/messages`);
      setMessages(r.data ?? []);
      // Mark as read locally
      setConvs(prev => prev.map(c => c.id === conv.id ? { ...c, unread_by_manager: 0 } : c));
    } catch {} finally { setMsgLoading(false); }
  }, [onOpenChat]);

  useEffect(() => {
    if (msgEndRef.current) msgEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendReply = async () => {
    if (!replyText.trim() || !chatConvId || sending) return;
    setSending(true);
    try {
      const r = await api<{ data: ChatMsg }>(`/chat/conversations/${chatConvId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ text: replyText.trim() }),
      });
      setMessages(prev => [...prev, r.data]);
      setReplyText('');
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Помилка');
    } finally { setSending(false); }
  };

  // Chat detail view
  if (chatConvId && activeConv) {
    return (
      <div className="space-y-0 -mx-4 -mt-5 -mb-20">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-[#F0F0F0] sticky top-0 z-10">
          <button onClick={() => { onBack(); setActiveConv(null); }}
            className="w-9 h-9 rounded-xl bg-[#eceef5] flex items-center justify-center active:scale-[0.95] transition-transform">
            <svg className="w-4 h-4 text-[#4b569e]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-bold text-[#111827] truncate">{activeConv.customer_name || 'Клієнт'}</p>
            <p className="text-[12px] text-[#9CA3AF]">{activeConv.customer_phone || ''}</p>
          </div>
          <button onClick={async () => {
            if (!confirm('Завершити чат?')) return;
            try {
              await api(`/chat/conversations/${chatConvId}/messages`, { method: 'POST', body: JSON.stringify({ text: '— Чат завершено —' }) });
              // Close conversation via direct supabase or just go back
              onBack(); setActiveConv(null); loadConvs();
              window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
            } catch {}
          }}
            className="px-3 py-1.5 rounded-xl bg-[#FEE2E2] text-[#DC2626] text-[11px] font-bold active:scale-[0.95] transition-all">
            Завершити
          </button>
        </div>

        {/* Messages */}
        <div className="px-4 py-3 space-y-2 min-h-[50vh] max-h-[65vh] overflow-y-auto bg-[#F8FAFC]">
          {msgLoading ? (
            <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-[#4b569e] border-t-transparent rounded-full animate-spin" /></div>
          ) : messages.length === 0 ? (
            <p className="text-center text-[13px] text-[#9CA3AF] py-8">Немає повідомлень</p>
          ) : messages.map(m => (
            <div key={m.id} className={`flex ${m.sender_type === 'manager' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl text-[14px] leading-snug ${
                m.sender_type === 'manager'
                  ? 'bg-[#4b569e] text-white rounded-br-lg'
                  : 'bg-white text-[#111827] border border-[#E5E7EB] rounded-bl-lg'
              }`}>
                {m.content_type === 'image' && m.media_url ? (
                  <img src={m.media_url} alt="" className="max-w-full rounded-xl mb-1" />
                ) : null}
                {m.text && <p className="whitespace-pre-wrap">{m.text}</p>}
                <p className={`text-[10px] mt-1 ${m.sender_type === 'manager' ? 'text-white/60' : 'text-[#9CA3AF]'}`}>
                  {new Date(m.created_at).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ))}
          <div ref={msgEndRef} />
        </div>

        {/* Input */}
        <div className="px-4 py-3 bg-white border-t border-[#F0F0F0] flex gap-2">
          <input
            value={replyText}
            onChange={e => setReplyText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
            placeholder="Написати відповідь..."
            className="flex-1 h-[44px] px-4 rounded-2xl border border-[#E5E7EB] bg-white text-[#111827] text-[14px] focus:border-[#4b569e] focus:outline-none placeholder:text-[#C5C9D1]"
          />
          <button onClick={sendReply} disabled={!replyText.trim() || sending}
            className="w-[44px] h-[44px] rounded-2xl bg-gradient-to-b from-[#4b569e] to-[#363f75] flex items-center justify-center text-white shadow-lg shadow-[#4b569e]/25 active:scale-[0.95] transition-all disabled:opacity-40">
            {sending
              ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>
            }
          </button>
        </div>
      </div>
    );
  }

  // Inbox list
  return (
    <div className="space-y-4">
      <PageHeader icon="💬" title="Повідомлення" subtitle="Чати з клієнтами" />

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-3 border-[#4b569e] border-t-transparent rounded-full animate-spin" /></div>
      ) : convs.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 rounded-2xl bg-[#eceef5] flex items-center justify-center mx-auto mb-3"><span className="text-2xl">💬</span></div>
          <p className="text-[15px] font-semibold text-[#111827]">Немає повідомлень</p>
          <p className="text-[13px] text-[#9CA3AF] mt-1">Коли клієнт напише — зʼявиться тут</p>
        </div>
      ) : (
        <div className="bg-white rounded-[20px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0] divide-y divide-[#F5F5F5]">
          {convs.map(c => (
            <button key={c.id} onClick={() => openChat(c)}
              className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-[#F8F8FA] transition-colors text-left first:rounded-t-[20px] last:rounded-b-[20px]">
              <div className="w-10 h-10 rounded-full bg-[#eceef5] flex items-center justify-center flex-shrink-0 text-[15px] font-bold text-[#4b569e]">
                {(c.customer_name ?? '?')[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-[14px] font-semibold text-[#111827] truncate">{c.customer_name || c.customer_phone || 'Клієнт'}</p>
                  <span className="text-[11px] text-[#9CA3AF] flex-shrink-0 ml-2">
                    {new Date(c.last_message_at).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' })}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <p className="text-[13px] text-[#9CA3AF] truncate flex-1">
                    {c.last_message_sender === 'manager' ? 'Ви: ' : ''}{c.last_message_preview || '...'}
                  </p>
                  {c.unread_by_manager > 0 && (
                    <span className="min-w-[20px] h-[20px] px-1.5 rounded-full bg-[#4b569e] text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0 ml-2">
                      {c.unread_by_manager}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
