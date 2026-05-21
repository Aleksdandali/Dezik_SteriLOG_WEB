import { api } from './api';
import { API_BASE_URL } from './config';
import { getToken } from './auth';

// Domain types — kept in sync with web /lib/telegram/types.ts.
export type OpsLocation = 'malynovskogo' | 'afina_sklad' | 'afina_ofis' | 'dalnytska';

export type ExpenseCategory =
  | 'paper' | 'glue' | 'film' | 'packaging'
  | 'raw_materials' | 'rent' | 'utilities' | 'other';

export type AuditItemType = 'raw' | 'finished';

export type SupplierPaymentMethod = 'bank_transfer' | 'card' | 'cash' | 'other';

export type BagSize = '60x100' | '75x150' | '100x200' | '150x230';
export type BagMaterial = 'transparent' | 'white' | 'brown';

export const BAG_SIZE_LABELS: Record<BagSize, string> = {
  '60x100': '60x100',
  '75x150': '75x150',
  '100x200': '100x200',
  '150x230': '150x230',
};

export const BAG_MATERIAL_LABELS: Record<BagMaterial, string> = {
  transparent: 'Прозорий',
  white: 'Білий крафт',
  brown: 'Коричневий',
};

export const LOCATION_LABELS: Record<OpsLocation, string> = {
  malynovskogo: 'Маліновського',
  afina_sklad: 'Афіна склад',
  afina_ofis: 'Афіна офіс',
  dalnytska: 'Дальницька',
};

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  paper: 'Папір',
  glue: 'Клей',
  film: 'Плівка',
  packaging: 'Тара',
  raw_materials: 'Сировина',
  rent: 'Оренда',
  utilities: 'Комунальні',
  other: 'Інше',
};

export const SUPPLIER_METHOD_LABELS: Record<SupplierPaymentMethod, string> = {
  bank_transfer: 'Безнал (р/р)',
  card: 'Карта',
  cash: 'Готівка',
  other: 'Інше',
};

export const AUDIT_UNITS = ['шт', 'кг', 'м', 'рул', 'л', 'уп', 'кор'] as const;

export type AuditItem = {
  item_type: AuditItemType;
  name: string;
  quantity: number;
  unit: string;
  notes?: string | null;
};

// Multipart upload mirrors /api/telegram/upload — field "photo", optional "folder".
// On RN we send a local file URI; fetch turns the object into a real multipart part.
export async function uploadPhoto(uri: string, folder?: string): Promise<string> {
  const token = await getToken();
  const ext = (uri.split('.').pop() ?? 'jpg').toLowerCase();
  const mime =
    ext === 'png' ? 'image/png' :
    ext === 'webp' ? 'image/webp' :
    ext === 'heic' ? 'image/heic' :
    ext === 'pdf' ? 'application/pdf' :
    'image/jpeg';

  const form = new FormData();
  // RN-specific FormData file shape (typed loosely on purpose).
  form.append('photo', { uri, name: `upload.${ext}`, type: mime } as unknown as Blob);
  if (folder) form.append('folder', folder);

  const res = await fetch(`${API_BASE_URL}/api/telegram/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}`, 'x-telegram-init-data': token } : {},
    body: form,
  });
  if (!res.ok) {
    let msg = `Upload failed (${res.status})`;
    try { const j = await res.json(); if (j?.error) msg = j.error; } catch {}
    throw new Error(msg);
  }
  const { url } = (await res.json()) as { url: string };
  return url;
}

// ── Expenses ───────────────────────────────────────────
export type ExpenseInput = {
  amount: number;
  category: ExpenseCategory;
  location: OpsLocation;
  description?: string | null;
  photo_url: string;
};

export async function createExpense(input: ExpenseInput): Promise<void> {
  await api('/api/telegram/expenses', { method: 'POST', body: input });
}

// ── Inventory audit ────────────────────────────────────
export type AuditInput = {
  location: OpsLocation;
  audit_date?: string; // YYYY-MM-DD, defaults to today server-side
  items: AuditItem[];
};

export async function createAudit(input: AuditInput): Promise<void> {
  await api('/api/telegram/inventory-audit', { method: 'POST', body: input });
}

// ── Supplier payment ───────────────────────────────────
export type SupplierPaymentInput = {
  supplier: string;
  amount: number;
  method: SupplierPaymentMethod;
  description?: string | null;
  photo_url?: string | null;
};

export async function createSupplierPayment(input: SupplierPaymentInput): Promise<void> {
  await api('/api/telegram/supplier-payments', { method: 'POST', body: input });
}

// ── Movement (between warehouses) ──────────────────────
export type MovementInput = {
  from_location: OpsLocation;
  to_location: OpsLocation;
  description: string;
  quantity?: number | null;
  photo_url: string;
  bag_size?: BagSize;
  material?: BagMaterial;
  packages?: number;
  shipment_id?: string;
};

export async function createMovement(input: MovementInput): Promise<void> {
  await api('/api/telegram/movements', { method: 'POST', body: input });
}

// ── Production (print / pack) ──────────────────────────
export type ProductionStage = 'print' | 'pack';

export const PRODUCTION_STAGE_LABELS: Record<ProductionStage, string> = {
  print: 'Друк',
  pack: 'Упаковка',
};

export type ProductionInput = {
  location: OpsLocation;
  stage: ProductionStage;
  bag_size: BagSize;
  material: BagMaterial;
  km?: number | null;
  rolls?: number | null;
  packages?: number | null;
  photo_url: string;
  notes?: string | null;
};

export async function createProduction(input: ProductionInput): Promise<void> {
  await api('/api/telegram/production', { method: 'POST', body: input });
}

// ── Receivings (warehouse intake) ──────────────────────
export type ReceivingInput = {
  supplier: string;
  quantity: number;
  amount: number;
  ttn?: string | null;
  photo_url: string;
  location: OpsLocation;
  description?: string | null;
};

export async function createReceiving(input: ReceivingInput): Promise<void> {
  await api('/api/telegram/receivings', { method: 'POST', body: input });
}

// ── Movements: pending + confirm (warehouse-side flow) ─
export type PendingMovement = {
  id: string;
  staff_id: string;
  from_location: OpsLocation;
  to_location: OpsLocation;
  description: string;
  quantity: number | null;
  photo_url: string | null;
  bag_size: BagSize | null;
  material: BagMaterial | null;
  packages: number | null;
  shipment_id: string | null;
  confirmed_at: string | null;
  created_at: string;
  ops_staff?: { name: string } | null;
};

export async function listPendingMovements(location: OpsLocation): Promise<PendingMovement[]> {
  const res = await api<{ data: PendingMovement[] }>(`/api/telegram/movements/pending?location=${location}`);
  return res.data ?? [];
}

export type ConfirmShipmentInput = {
  shipment_id: string;
  items: { id: string; confirmed_packages: number }[];
  photo_url?: string;
};

export type ConfirmSingleInput = {
  movement_id: string;
  confirmed_packages: number;
  photo_url?: string;
};

export async function confirmMovement(input: ConfirmShipmentInput | ConfirmSingleInput): Promise<void> {
  await api('/api/telegram/movements/confirm', { method: 'POST', body: input });
}

// ── Stock dashboard ───────────────────────────────────
export type StockItem = {
  name: string;
  quantity: number;
  unit: string;
  item_type: 'raw' | 'finished' | string;
};

export type StockData = {
  data: StockItem[];
  lastAudit: { date: string } | null;
  source: 'audit' | 'production' | 'keycrm' | string;
};

export async function fetchStock(location: OpsLocation): Promise<StockData> {
  return api<StockData>(`/api/telegram/stock?location=${location}`);
}

// ── Cash report (read-only dashboard) ──────────────────
export type CashPeriod = 'today' | 'week' | 'month';

export type CashData = {
  period: { from: string; to: string };
  total_sum: number;
  orders_count: number;
  paid_sum: number;
  paid_count: number;
  cod_sum: number;
  cod_count: number;
  other_sum: number;
  other_count: number;
  shipped_count: number;
  assembly_count: number;
  avg_processing_hours: number;
  by_source: Record<string, { sum: number; count: number }>;
};

export async function fetchCash(opts: { period?: CashPeriod; date?: string } = {}): Promise<CashData> {
  const q = opts.date ? `?date=${opts.date}` : `?period=${opts.period ?? 'today'}`;
  return api<CashData>(`/api/telegram/cash${q}`);
}
