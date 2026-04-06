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
  | 'history'
  | 'team'
  | 'orders';

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
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const img = await createImageBitmap(file);

  const maxW = 1200;
  const scale = img.width > maxW ? maxW / img.width : 1;
  canvas.width = img.width * scale;
  canvas.height = img.height * scale;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.8)
  );

  const formData = new FormData();
  formData.append('photo', blob, 'photo.jpg');

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
      className={`w-full h-[52px] px-4 rounded-2xl border border-[#E5E7EB] bg-white text-base
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
      {view === 'history' && (
        <HistoryView staff={staff} />
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

  useEffect(() => {
    api<{ count: number }>('/shipments/count').then(r => setShipmentCount(r.count)).catch(() => {});
    api<{ total: number }>('/orders?status=1').then(r => setNewOrdersCount(r.total ?? 0)).catch(() => {});
    api<{ total_sum: number }>('/cash?period=today').then(r => setCashToday(r.total_sum ?? 0)).catch(() => {});
  }, []);

  const sections = staff.visible_sections ?? [];
  const canSee = (view: string) => isAdmin || sections.length === 0 || sections.includes(view);

  const mainItems: { icon: string; label: string; desc: string; view: View; color: string; badge?: number }[] = [
    { icon: '🏭', label: 'Виробництво', desc: 'Друк / Упаковка', view: 'production', color: '#4b569e' },
    { icon: '🚚', label: 'Переміщення', desc: 'Між точками', view: 'movement', color: '#3B82F6' },
    { icon: '📋', label: 'Склад', desc: 'Вхідні / Залишки', view: 'warehouse', color: '#10B981' },
    { icon: '📦', label: 'Приймання', desc: 'Від постачальника', view: 'receiving', color: '#F59E0B' },
    { icon: '📝', label: 'Замовлення', desc: 'Обробка KeyCRM', view: 'orders', color: '#3B82F6', badge: newOrdersCount },
    { icon: '📬', label: 'Відправки', desc: 'На збірку', view: 'shipments', color: '#F59E0B', badge: shipmentCount },
    { icon: '🧾', label: 'Каса', desc: cashToday > 0 ? `${cashToday.toLocaleString('uk-UA')} грн` : 'Продажі', view: 'cash-report', color: '#10B981' },
    { icon: '💰', label: 'Витрати', desc: 'Записати витрату', view: 'expense', color: '#EF4444' },
  ];

  const secondaryItems: { icon: string; label: string; view: View; adminOnly?: boolean }[] = [
    { icon: '🏦', label: 'Оплати постач.', view: 'supplier-payment' },
    { icon: '📝', label: 'Переоблік', view: 'inventory-audit' },
    { icon: '📋', label: 'Історія', view: 'history' },
    { icon: '💵', label: 'Зарплати', view: 'salary', adminOnly: true },
    { icon: '👥', label: 'Команда', view: 'team', adminOnly: true },
    { icon: '📊', label: 'Звіти P&L', view: 'reports', adminOnly: true },
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
              <svg className="w-4 h-4 text-[#C5C9D1]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          ))}
        </div>
      </div>
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
                          hasValue ? 'border-[#4b569e] bg-[#eceef5]/50 text-[#4b569e]' : 'border-[#E5E7EB] bg-white focus:border-[#4b569e]'
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
                <p className="text-[16px] font-bold text-[#111827]">{o.recipient}</p>
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
  const loadAuditArchive = async () => {
    if (!selectedLoc) return;
    setAuditArchiveLoading(true);
    try {
      const res = await api<{ data: HistoryItem[] }>(`/inventory-audit/list?location=${selectedLoc}`);
      setAuditArchive(res.data ?? []);
    } catch { setAuditArchive([]); }
    finally { setAuditArchiveLoading(false); }
  };

  const handleAuditApprove = async (auditId: string, action: 'approve' | 'reject') => {
    try {
      await api('/inventory-audit/approve', { method: 'POST', body: JSON.stringify({ audit_id: auditId, action }) });
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

          <div className="bg-white rounded-[20px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0]">
            {items.map((item: HistoryItem, idx: number) => (
              <div key={idx} className={`px-4 py-3 flex justify-between items-center ${idx > 0 ? 'border-t border-[#F5F5F5]' : ''}`}>
                <span className="text-[14px] font-medium text-[#111827]">{item.name}</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-[17px] font-bold text-[#111827]">{item.quantity}</span>
                  <span className="text-[12px] text-[#9CA3AF]">{item.unit}</span>
                </div>
              </div>
            ))}
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
                        {a.status === 'approved' ? '✅ Підтверджено' : a.status === 'rejected' ? '❌ Відхилено' : '⏳ Очікує'}
                      </span>
                    </div>
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

// ─── Product catalog for audits ──────────────────────
interface AuditProduct {
  id: string;
  name: string;
  group: string;
  unit: string;
  color?: string;
}

// Bags — exact SKUs from dezik.com.ua order form
const BAG_PRODUCTS: AuditProduct[] = [
  { id: 'bag_150x230_tr', name: '150×230 Прозорі', group: 'Пакети 150×230', unit: 'уп', color: '#3B82F6' },
  { id: 'bag_100x200_tr', name: '100×200 Прозорі', group: 'Пакети 100×200', unit: 'уп', color: '#3B82F6' },
  { id: 'bag_100x200_wh', name: '100×200 Білі', group: 'Пакети 100×200', unit: 'уп', color: '#9CA3AF' },
  { id: 'bag_100x200_br', name: '100×200 Коричневі', group: 'Пакети 100×200', unit: 'уп', color: '#92400E' },
  { id: 'bag_75x150_tr', name: '75×150 Прозорі', group: 'Пакети 75×150', unit: 'уп', color: '#3B82F6' },
  { id: 'bag_75x150_wh', name: '75×150 Білі', group: 'Пакети 75×150', unit: 'уп', color: '#9CA3AF' },
  { id: 'bag_60x100_tr', name: '60×100 Прозорі', group: 'Пакети 60×100', unit: 'уп', color: '#3B82F6' },
];

// Raw materials (Маліновського + Дальницька)
const RAW_MATERIALS: AuditProduct[] = [
  { id: 'raw_paper_white', name: 'Папір білий крафт 70г/м²', group: 'Папір', unit: 'кг' },
  { id: 'raw_paper_brown', name: 'Папір коричневий крафт 70г/м²', group: 'Папір', unit: 'кг' },
  { id: 'raw_film', name: 'Плівка ПЕТ', group: 'Плівка та клей', unit: 'кг' },
  { id: 'raw_glue', name: 'Клей', group: 'Плівка та клей', unit: 'кг' },
  { id: 'raw_paint', name: 'Фарба для друку', group: 'Витратники', unit: 'л' },
  { id: 'raw_tape', name: 'Двосторонній скотч', group: 'Витратники', unit: 'м' },
];

// Other products (Афіна warehouse)
const OTHER_PRODUCTS: AuditProduct[] = [
  { id: 'delanol_1000', name: 'Деланол 1л', group: 'Хімічна дезинфекція', unit: 'шт' },
  { id: 'delanol_500', name: 'Деланол 0.5л', group: 'Хімічна дезинфекція', unit: 'шт' },
  { id: 'delanol_250', name: 'Деланол 250мл', group: 'Хімічна дезинфекція', unit: 'шт' },
  { id: 'delanol_20', name: 'Деланол 20мл', group: 'Хімічна дезинфекція', unit: 'шт' },
  { id: 'bionol_1000', name: 'Біонол 1л', group: 'Хімічна дезинфекція', unit: 'шт' },
  { id: 'bionol_250', name: 'Біонол 250мл', group: 'Хімічна дезинфекція', unit: 'шт' },
  { id: 'instrum_1000', name: 'Інструм 1л', group: 'Очистка інструментів', unit: 'шт' },
  { id: 'instrum_500', name: 'Інструм 500мл', group: 'Очистка інструментів', unit: 'шт' },
  { id: 'instrum_250', name: 'Інструм 250мл', group: 'Очистка інструментів', unit: 'шт' },
  { id: 'septonal_500', name: 'Септональ 500мл', group: 'Контроль та антисептики', unit: 'шт' },
  { id: 'journal_steri', name: 'Журнал стерилізації (30 стор.)', group: 'Контроль та антисептики', unit: 'шт' },
  { id: 'oil_pro_30', name: 'Oil Pro 30мл', group: 'Контроль та антисептики', unit: 'шт' },
  { id: 'tray_1l', name: 'Лоток 1л', group: 'Лотки', unit: 'шт' },
  { id: 'tray_3l', name: 'Лоток 3л', group: 'Лотки', unit: 'шт' },
];

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

  // Pick product list based on type and location
  let products: AuditProduct[];
  if (auditItemType === 'raw') {
    products = RAW_MATERIALS;
  } else {
    const isAfina = locationId === 'afina_sklad';
    products = isAfina ? [...BAG_PRODUCTS, ...OTHER_PRODUCTS] : BAG_PRODUCTS;
  }

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
  const [ttnWeight, setTtnWeight] = useState('1');
  const [ttnPayer, setTtnPayer] = useState<'Sender' | 'Recipient'>('Recipient');
  const [ttnResult, setTtnResult] = useState<{ ttn: string; delivery_cost: number; estimated_delivery: string } | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<{ id: string; sender_type: string; text: string; created_at: string }[]>([]);
  const [chatText, setChatText] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  // Create order state
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [coName, setCoName] = useState('');
  const [coPhone, setCoPhone] = useState('');
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
          <button onClick={() => { setCreatingOrder(false); setCoSuccess(null); setCoName(''); setCoPhone(''); setCoCity(''); setCoCityRef(''); setCoWarehouse(''); setCoWarehouseRef(''); setCoProducts([]); setCoComment(''); loadOrders(); }}
            className="mt-6 px-6 py-3 rounded-xl bg-[#4b569e] text-white font-bold active:scale-[0.97] transition-all">
            До замовлень
          </button>
        </div>
      </div>
    );

    const coTotal = coProducts.reduce((s, p) => s + p.price * p.quantity, 0);
    const searchBuyer = async (q: string) => {
      if (q.length < 3) { setCoBuyerResults([]); return; }
      try {
        const r = await api<{ data: { name: string; phone: string; city: string; address: string }[] }>(`/orders/create?q=${encodeURIComponent(q)}`);
        setCoBuyerResults(r.data ?? []);
      } catch { setCoBuyerResults([]); }
    };
    const searchCity = async (q: string) => {
      if (q.length < 2) { setCoCitySuggestions([]); return; }
      try {
        const r = await fetch(`/api/customer/np-search?type=city&q=${encodeURIComponent(q)}`);
        const d = await r.json();
        setCoCitySuggestions((d.data ?? []).map((c: { ref: string; name: string }) => ({ ref: c.ref, name: c.name })));
      } catch {}
    };
    const searchWh = async (q: string) => {
      if (!coCityRef) return;
      try {
        const r = await fetch(`/api/customer/np-search?type=warehouse&city_ref=${coCityRef}&q=${encodeURIComponent(q)}`);
        const d = await r.json();
        setCoWhSuggestions((d.data ?? []).map((w: { ref: string; name: string }) => ({ ref: w.ref, name: w.name })));
      } catch {}
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

        {/* Buyer */}
        <div className="bg-white rounded-[20px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0] space-y-3">
          <p className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-wider">Клієнт</p>
          <div>
            <Input placeholder="Телефон клієнта" value={coPhone}
              onChange={e => { setCoPhone(e.target.value); searchBuyer(e.target.value); }} />
            {coBuyerResults.length > 0 && (
              <div className="mt-1 bg-[#F8FAFC] rounded-xl border border-[#E5E7EB] max-h-[150px] overflow-y-auto">
                {coBuyerResults.map((b, i) => (
                  <button key={i} onClick={() => {
                    setCoName(b.name); setCoPhone(b.phone);
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
          <Input placeholder="Ім'я клієнта" value={coName} onChange={e => setCoName(e.target.value)} />
        </div>

        {/* Shipping */}
        <div className="bg-white rounded-[20px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0] space-y-3">
          <p className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-wider">Доставка</p>
          <div>
            <Input placeholder="Місто" value={coCity}
              onChange={e => { setCoCity(e.target.value); searchCity(e.target.value); }} />
            {coCitySuggestions.length > 0 && (
              <div className="mt-1 bg-[#F8FAFC] rounded-xl border border-[#E5E7EB] max-h-[120px] overflow-y-auto">
                {coCitySuggestions.map((c, i) => (
                  <button key={i} onClick={() => {
                    setCoCity(c.name); setCoCityRef(c.ref); setCoCitySuggestions([]);
                    setCoWarehouse(''); setCoWarehouseRef('');
                    searchWh('');
                  }} className="w-full text-left px-3 py-2 text-[13px] border-b border-[#F0F0F0] last:border-0 active:bg-[#eceef5]">
                    {c.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <Input placeholder="Відділення НП" value={coWarehouse}
              onChange={e => { setCoWarehouse(e.target.value); searchWh(e.target.value); }} />
            {coWhSuggestions.length > 0 && (
              <div className="mt-1 bg-[#F8FAFC] rounded-xl border border-[#E5E7EB] max-h-[120px] overflow-y-auto">
                {coWhSuggestions.map((w, i) => (
                  <button key={i} onClick={() => {
                    setCoWarehouse(w.name); setCoWarehouseRef(w.ref); setCoWhSuggestions([]);
                  }} className="w-full text-left px-3 py-2 text-[13px] border-b border-[#F0F0F0] last:border-0 active:bg-[#eceef5]">
                    {w.name}
                  </button>
                ))}
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
              <button key={p.id} onClick={() => {
                if (p.quantity <= 0) {
                  if (!confirm(`⚠️ "${p.name}" немає на складі (0 шт).\n\nВсе одно додати?`)) return;
                }
                setCoProducts(prev => [...prev, { name: p.name, sku: String(p.id), price: p.price, quantity: 1 }]);
                window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
              }} className="text-left rounded-2xl bg-white border border-[#F0F0F0] shadow-[0_1px_3px_rgba(0,0,0,0.04)] active:scale-[0.96] transition-all overflow-hidden">
                <div className="aspect-square bg-[#F8FAFC] flex items-center justify-center p-2">
                  {p.thumbnail ? (
                    <img src={p.thumbnail} alt="" className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-[36px]">📦</span>
                  )}
                </div>
                <div className="p-2.5">
                  <p className="text-[12px] font-medium text-[#111827] leading-tight line-clamp-2 h-[32px]">{p.name}</p>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-[15px] font-bold text-[#4b569e]">{p.price} грн</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${p.quantity > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                      {p.quantity > 0 ? `${p.quantity}` : '0'}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Comment */}
        <div className="bg-white rounded-[20px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0]">
          <textarea value={coComment} onChange={e => setCoComment(e.target.value)}
            placeholder="Коментар до замовлення..."
            className="w-full h-16 px-3 py-2 rounded-xl border border-[#E5E7EB] text-[14px] resize-none focus:border-[#4b569e] focus:outline-none" />
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
                  buyer_name: coName, buyer_phone: coPhone.replace(/\D/g, ''),
                  city_name: coCity, city_ref: coCityRef,
                  warehouse_name: coWarehouse, warehouse_ref: coWarehouseRef,
                  products: coProducts.map(p => ({ ...p, offer_id: 0 })),
                  comment: coComment || undefined,
                }),
              });
              window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
              setCoSuccess(r.order_id);
            } catch (err) { alert(err instanceof Error ? err.message : 'Помилка'); }
            finally { setCoSubmitting(false); }
          }}
          className="w-full py-4 rounded-[20px] bg-[#4b569e] text-white text-[16px] font-bold active:scale-[0.97] transition-all disabled:opacity-40 shadow-lg shadow-[#4b569e]/25"
        >
          {coSubmitting ? '⏳ Створюємо...' : '✅ Створити замовлення'}
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
          <button onClick={() => { setViewingOrder(null); setChangingStatus(false); }}
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
          <p className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-wider">Клієнт</p>
          <div className="flex justify-between items-center">
            <p className="text-[16px] font-bold text-[#111827]">{o.recipient ?? 'Не вказано'}</p>
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
          <div className={`py-3 rounded-xl text-center text-[15px] font-bold ${
            o.payment_status === 'paid' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-orange-50 text-orange-700 border border-orange-200'
          }`}>
            {o.payment_status === 'paid' ? '✅ Оплачено' : '💳 Наложний платіж'}
          </div>
        </div>

        {/* Manager comment */}
        <div className="bg-white rounded-[20px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#F0F0F0] space-y-2">
          <p className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-wider">Коментар менеджера</p>
          <textarea
            value={managerComment}
            onChange={(e) => setManagerComment(e.target.value)}
            placeholder="Нотатка до замовлення..."
            className="w-full h-20 px-3 py-2 rounded-xl border border-[#E5E7EB] text-[14px] resize-none focus:border-[#4b569e] focus:outline-none"
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

              <div className="bg-[#F8FAFC] rounded-xl p-3 space-y-1.5">
                <p className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-wider">Отримувач</p>
                <p className="text-[14px] font-bold text-[#111827]">{o.recipient ?? '—'}</p>
                <p className="text-[13px] text-[#4b569e]">{o.phone ?? '—'}</p>
                <p className="text-[13px] text-[#111827]">📍 {o.address ?? o.city ?? '—'}</p>
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

              <div>
                <p className="text-[12px] text-[#9CA3AF] mb-1.5">Платник доставки</p>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setTtnPayer('Sender')}
                    className={`py-2.5 rounded-xl text-[13px] font-bold transition-all ${ttnPayer === 'Sender' ? 'bg-[#4b569e] text-white' : 'bg-white text-[#363f75] border border-[#E5E7EB]'}`}>
                    Відправник
                  </button>
                  <button onClick={() => setTtnPayer('Recipient')}
                    className={`py-2.5 rounded-xl text-[13px] font-bold transition-all ${ttnPayer === 'Recipient' ? 'bg-[#4b569e] text-white' : 'bg-white text-[#363f75] border border-[#E5E7EB]'}`}>
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
                    const res = await api<{ ttn: string; delivery_cost: number; estimated_delivery: string }>('/orders/create-ttn', {
                      method: 'POST',
                      body: JSON.stringify({ order_id: o.id, weight: parseFloat(ttnWeight) || 1, payer_type: ttnPayer }),
                    });
                    setTtnResult(res);
                    setShowTTNConfirm(false);
                    window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
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
              setTtnPayer(o.payment_status === 'paid' ? 'Sender' : 'Recipient');
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
