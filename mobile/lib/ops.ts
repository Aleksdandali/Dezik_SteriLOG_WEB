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
  /**
   * Quantity for this item from the most recent APPROVED audit at the same
   * location (server-injected). null = new item or no prior baseline.
   * Drives per-item Δ in the queue detail view.
   */
  baseline_quantity?: number | null;
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

// ── Production history (read-only feed) ────────────────
export type ProductionEntry = {
  id: string;
  staff_id: string;
  location: OpsLocation;
  stage: ProductionStage;
  bag_size: BagSize;
  material: BagMaterial;
  km: number | null;
  rolls: number | null;
  packages: number | null;
  photo_url: string | null;
  notes: string | null;
  created_at: string;
  ops_staff?: { name: string } | null;
};

export async function listProduction(days = 30): Promise<ProductionEntry[]> {
  const res = await api<{ data: ProductionEntry[] }>(`/api/telegram/production?days=${days}`);
  return res.data ?? [];
}

// ── Inventory-audit list + approval (admin) ────────────
export type AuditDeltaSummary = {
  baseline_audit_id: string;
  baseline_date: string;
  items_with_delta: number;
  largest_delta_pct: number;
};

export type AuditEntry = {
  id: string;
  staff_id: string;
  location: OpsLocation;
  audit_date: string;
  status: 'pending' | 'approved' | 'rejected' | string;
  created_at: string;
  approved_at: string | null;
  ops_staff?: { name: string } | null;
  ops_inventory_audit_items: AuditItem[];
  delta_summary: AuditDeltaSummary | null;
};

export async function listAudits(location?: OpsLocation): Promise<AuditEntry[]> {
  const q = location ? `?location=${location}` : '';
  const res = await api<{ data: AuditEntry[] }>(`/api/telegram/inventory-audit/list${q}`);
  return res.data ?? [];
}

export async function reviewAudit(audit_id: string, action: 'approve' | 'reject'): Promise<void> {
  await api('/api/telegram/inventory-audit/approve', { method: 'POST', body: { audit_id, action } });
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

// ── Staff list ────────────────────────────────────────
export type Staff = {
  id: string;
  name: string;
  role?: string | null;
  location?: OpsLocation | null;
  active?: boolean | null;
};

export async function listStaff(): Promise<Staff[]> {
  const res = await api<{ data: Staff[] }>(`/api/telegram/staff`);
  return res.data ?? [];
}

// ── Salaries (admin only) ──────────────────────────────
export type SalaryType = 'salary' | 'advance';

export const SALARY_TYPE_LABELS: Record<SalaryType, string> = {
  salary: 'Зарплата',
  advance: 'Аванс',
};

export type SalaryInput = {
  recipient_id: string;
  amount: number;
  type: SalaryType;
  period: string; // YYYY-MM
  notes?: string | null;
};

export async function createSalary(input: SalaryInput): Promise<void> {
  await api('/api/telegram/salaries', { method: 'POST', body: input });
}

export type SalaryEntry = {
  id: string;
  staff_id: string;
  recipient_id: string;
  amount: number;
  type: SalaryType;
  period: string;
  notes: string | null;
  created_at: string;
  ops_staff?: { name: string } | null; // who issued
  recipient?: { name: string } | null;
};

// Admin only — GET returns 403 for non-admins.
export async function listSalaries(period?: string): Promise<SalaryEntry[]> {
  const q = period ? `?period=${period}` : '';
  const res = await api<{ data: SalaryEntry[] }>(`/api/telegram/salaries${q}`);
  return res.data ?? [];
}

// ── Team (admin) ───────────────────────────────────────
export type StaffRole = 'staff' | 'admin';

export type TeamMember = {
  id: string;
  telegram_id: number;
  name: string;
  role: StaffRole | string;
  location: OpsLocation | null;
  /** Multi-warehouse access. Empty = fallback to `location`. Admins ignore this. */
  visible_locations: OpsLocation[];
  visible_sections: string[] | null;
  active: boolean;
};

export type JoinRequest = {
  id: string;
  telegram_id: number;
  name: string;
  username: string | null;
  created_at: string;
};

export type TeamData = { staff: TeamMember[]; requests: JoinRequest[] };

export const STAFF_SECTIONS: { id: string; label: string }[] = [
  { id: 'production', label: 'Виробництво' },
  { id: 'movement', label: 'Переміщення' },
  { id: 'warehouse', label: 'Склад' },
  { id: 'shipments', label: 'Відправки' },
  { id: 'cash-report', label: 'Каса' },
  { id: 'expense', label: 'Витрати' },
  { id: 'receiving', label: 'Приймання' },
  { id: 'inventory-audit', label: 'Переоблік' },
];

export async function fetchTeam(): Promise<TeamData> {
  return api<TeamData>(`/api/telegram/team`);
}

export type ApproveRequestInput = {
  request_id: string;
  role: StaffRole;
  location?: OpsLocation | null;
  visible_sections?: string[];
  visible_locations?: OpsLocation[];
};

export async function approveRequest(input: ApproveRequestInput): Promise<void> {
  await api(`/api/telegram/team`, { method: 'POST', body: { action: 'approve', ...input } });
}

export async function rejectRequest(request_id: string): Promise<void> {
  await api(`/api/telegram/team`, { method: 'POST', body: { action: 'reject', request_id } });
}

export type UpdateStaffInput = {
  staff_id: string;
  role?: StaffRole;
  location?: OpsLocation | null;
  visible_sections?: string[];
  visible_locations?: OpsLocation[];
  active?: boolean;
};

export async function updateStaff(input: UpdateStaffInput): Promise<void> {
  await api(`/api/telegram/team`, { method: 'POST', body: { action: 'update_staff', ...input } });
}

// ── History (read + admin delete) ──────────────────────
export type ExpenseEntry = {
  id: string;
  amount: number;
  category: ExpenseCategory;
  location: OpsLocation;
  description: string | null;
  photo_url: string | null;
  created_at: string;
  ops_staff?: { name: string } | null;
};

export type ReceivingEntry = {
  id: string;
  supplier: string;
  quantity: number;
  amount: number;
  ttn: string | null;
  photo_url: string | null;
  location: OpsLocation;
  description: string | null;
  created_at: string;
  ops_staff?: { name: string } | null;
};

export type MovementEntry = {
  id: string;
  from_location: OpsLocation;
  to_location: OpsLocation;
  description: string;
  quantity: number | null;
  photo_url: string | null;
  bag_size: BagSize | null;
  material: BagMaterial | null;
  packages: number | null;
  shipment_id: string | null;
  created_at: string;
  ops_staff?: { name: string } | null;
};

export async function listExpenses(days = 30): Promise<ExpenseEntry[]> {
  const res = await api<{ data: ExpenseEntry[] }>(`/api/telegram/expenses?days=${days}`);
  return res.data ?? [];
}

export async function listReceivings(days = 30): Promise<ReceivingEntry[]> {
  const res = await api<{ data: ReceivingEntry[] }>(`/api/telegram/receivings?days=${days}`);
  return res.data ?? [];
}

export async function listMovements(days = 30): Promise<MovementEntry[]> {
  const res = await api<{ data: MovementEntry[] }>(`/api/telegram/movements?days=${days}`);
  return res.data ?? [];
}

export type HistoryKind = 'production' | 'expenses' | 'receivings' | 'movements';

// Admin-only — backend gates with password "300683" (matches Mini App HistoryView).
export async function deleteEntry(kind: HistoryKind, id: string, password: string): Promise<void> {
  await api(`/api/telegram/${kind}?id=${encodeURIComponent(id)}&password=${encodeURIComponent(password)}`, {
    method: 'DELETE',
  });
}

// ── Shipments (status=8 → status=12 with photo) ────────
export type ShipmentProduct = {
  name: string;
  quantity: number;
  sku: string | null;
  thumbnail: string | null;
  in_stock: number | null;
};

export type ShipmentOrder = {
  id: number;
  payment_status: string;
  total: number;
  ordered_at: string;
  created_at: string;
  status_changed_at: string | null;
  status_name: string;
  manager_comment: string | null;
  ttn: string | null;
  recipient: string | null;
  phone: string | null;
  city: string | null;
  address: string | null;
  region: string | null;
  delivery: string;
  buyer_orders_count: number | null;
  buyer_orders_sum: string | null;
  buyer_comment: string | null;
  in_bot: boolean;
  products: ShipmentProduct[];
};

export type ArchiveProduct = {
  name: string;
  quantity: number;
  sku: string | null;
  thumbnail: string | null;
};

export type ArchiveShipment = {
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
  products: ArchiveProduct[];
};

export type ArchivePeriod = 'today' | 'yesterday' | 'week';

export async function listShipments(): Promise<ShipmentOrder[]> {
  const res = await api<{ data: ShipmentOrder[] }>(`/api/telegram/shipments`);
  return res.data ?? [];
}

export async function listShipmentArchive(period: ArchivePeriod): Promise<ArchiveShipment[]> {
  const res = await api<{ data: ArchiveShipment[] }>(`/api/telegram/shipments/archive?period=${period}`);
  return res.data ?? [];
}

export async function markShipped(order_id: number, photo_url: string): Promise<void> {
  await api(`/api/telegram/shipments`, { method: 'POST', body: { order_id, photo_url } });
}

// ── P&L reports (admin) ────────────────────────────────
export type ReportPeriod = 'day' | 'week' | 'month';

export type SalesChannel = 'website' | 'instagram' | 'telegram' | 'b2b' | 'other';

export const CHANNEL_LABELS: Record<SalesChannel, string> = {
  website: 'Сайт',
  instagram: 'Instagram',
  telegram: 'Telegram',
  b2b: 'Опт B2B',
  other: 'Інше',
};

export type ReportMovement = {
  from_location: OpsLocation;
  to_location: OpsLocation;
  description: string;
  quantity: number | null;
  created_at: string;
  ops_staff?: { name: string } | null;
};

export type ReportData = {
  period: string;
  income: number;
  expenses: {
    total: number;
    byCategory: Record<string, number>;
    byLocation: Record<string, number>;
  };
  supplierPayments: number;
  salaries: number;
  fixedCosts: number;
  totalCosts: number;
  profit: number;
  movements: ReportMovement[];
  cashByChannel: Record<string, number>;
};

export async function fetchReport(period: ReportPeriod): Promise<ReportData> {
  return api<ReportData>(`/api/telegram/reports?period=${period}`);
}

// ── Analytics (KeyCRM order analytics) ─────────────────
export type AnalyticsPeriod = 'today' | 'week' | 'month';

export type AnalyticsSource = {
  name: string;
  source_id: number;
  orders: number;
  revenue: number;
};

export type AnalyticsStatus = {
  name: string;
  status_id: number;
  count: number;
};

export type AnalyticsDay = {
  date: string;
  orders: number;
  revenue: number;
};

export type AnalyticsData = {
  period: { from: string; to: string };
  total_orders: number;
  total_revenue: number;
  by_source: AnalyticsSource[];
  by_status: AnalyticsStatus[];
  by_day: AnalyticsDay[];
  avg_order: number;
  paid_percent: number;
};

export async function fetchAnalytics(period: AnalyticsPeriod): Promise<AnalyticsData> {
  return api<AnalyticsData>(`/api/telegram/analytics?period=${period}`);
}

// ── Dashboard counters (home screen badges) ────────────
export async function fetchShipmentCount(): Promise<number> {
  const r = await api<{ count: number }>(`/api/telegram/shipments/count`);
  return r.count ?? 0;
}

export async function fetchNewOrdersCount(): Promise<number> {
  const r = await api<{ total: number }>(`/api/telegram/orders?status=1`);
  return r.total ?? 0;
}

export async function fetchCashToday(): Promise<number> {
  const r = await api<{ total_sum: number }>(`/api/telegram/cash?period=today`);
  return r.total_sum ?? 0;
}

export async function fetchPendingAuditsCount(): Promise<number> {
  const r = await api<{ data: { status: string }[] }>(`/api/telegram/inventory-audit?days=30`);
  return (r.data ?? []).filter(a => a.status === 'pending').length;
}

export async function fetchUnreadCount(): Promise<number> {
  const r = await api<{ data: { unread_by_manager: number }[] }>(`/api/telegram/chat/conversations`);
  return (r.data ?? []).reduce((s, c) => s + (c.unread_by_manager ?? 0), 0);
}

export async function fetchBotClientsCount(): Promise<number> {
  const r = await api<{ data: unknown[] }>(`/api/telegram/team?type=bot_clients`);
  return (r.data ?? []).length;
}
