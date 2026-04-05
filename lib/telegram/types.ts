/* ── Telegram Bot API types (subset we use) ── */

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: TelegramUser;
    chat: { id: number; type: string };
    text?: string;
  };
}

export interface WebAppInitData {
  user: TelegramUser;
  auth_date: number;
  hash: string;
  query_id?: string;
}

/* ── Ops domain types ── */

export type OpsRole = 'admin' | 'staff';

export type OpsLocation = 'malynovskogo' | 'afina_sklad' | 'afina_ofis' | 'dalnytska';

export type ExpenseCategory =
  | 'paper' | 'glue' | 'film' | 'packaging'
  | 'raw_materials' | 'rent' | 'utilities' | 'other';

export type SalesChannel = 'website' | 'instagram' | 'telegram' | 'b2b' | 'other';

export type PaymentType = 'cash' | 'cod' | 'invoice' | 'card';

export type SupplierPaymentMethod = 'bank_transfer' | 'card' | 'cash' | 'other';

export type SalaryType = 'advance' | 'salary';

export type FixedCostCategory = 'rent' | 'utilities' | 'internet' | 'subscription' | 'other';

export interface OpsStaff {
  id: string;
  telegram_id: number;
  name: string;
  role: OpsRole;
  location: OpsLocation | null;
  active: boolean;
  visible_sections: string[];
  created_at: string;
}

export interface OpsExpense {
  id: string;
  staff_id: string;
  amount: number;
  category: ExpenseCategory;
  location: OpsLocation;
  description: string | null;
  photo_url: string;
  created_at: string;
  ops_staff?: OpsStaff;
}

export interface OpsReceiving {
  id: string;
  staff_id: string;
  supplier: string;
  quantity: number;
  amount: number;
  ttn: string | null;
  photo_url: string;
  location: OpsLocation;
  description: string | null;
  created_at: string;
  ops_staff?: OpsStaff;
}

export interface OpsMovement {
  id: string;
  staff_id: string;
  from_location: OpsLocation;
  to_location: OpsLocation;
  description: string;
  quantity: number | null;
  photo_url: string;
  created_at: string;
  ops_staff?: OpsStaff;
}

export interface OpsCashReport {
  id: string;
  staff_id: string;
  report_date: string;
  channel: SalesChannel;
  payment_type: PaymentType;
  amount: number;
  notes: string | null;
  created_at: string;
  ops_staff?: OpsStaff;
}

export interface OpsSupplierPayment {
  id: string;
  staff_id: string;
  supplier: string;
  amount: number;
  method: SupplierPaymentMethod;
  description: string | null;
  photo_url: string | null;
  created_at: string;
  ops_staff?: OpsStaff;
}

export interface OpsSalary {
  id: string;
  staff_id: string;
  recipient_id: string;
  amount: number;
  type: SalaryType;
  period: string;
  notes: string | null;
  created_at: string;
  ops_staff?: OpsStaff;
  recipient?: OpsStaff;
}

export interface OpsFixedCost {
  id: string;
  name: string;
  amount: number;
  category: FixedCostCategory;
  location: OpsLocation | null;
  active: boolean;
  created_at: string;
}

export interface OpsFixedCostPayment {
  id: string;
  fixed_cost_id: string;
  staff_id: string;
  amount: number;
  period: string;
  paid_at: string;
  created_at: string;
  ops_fixed_costs?: OpsFixedCost;
}

/* ── Production ── */

export type ProductionStage = 'print' | 'pack';
export type BagSize = '60x100' | '75x150' | '100x200' | '150x230';
export type BagMaterial = 'transparent' | 'white' | 'brown';

export interface OpsProduction {
  id: string;
  staff_id: string;
  location: OpsLocation;
  stage: ProductionStage;
  bag_size: BagSize;
  material: BagMaterial;
  km: number | null;
  rolls: number | null;
  packages: number | null;
  photo_url: string;
  notes: string | null;
  created_at: string;
  ops_staff?: OpsStaff;
}

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

export const PRODUCTION_STAGE_LABELS: Record<ProductionStage, string> = {
  print: 'Друк',
  pack: 'Упаковка',
};

export type AuditItemType = 'raw' | 'finished';

export interface OpsInventoryAudit {
  id: string;
  staff_id: string;
  location: OpsLocation;
  audit_date: string;
  created_at: string;
  ops_staff?: OpsStaff;
  ops_inventory_audit_items?: OpsInventoryAuditItem[];
}

export interface OpsInventoryAuditItem {
  id: string;
  audit_id: string;
  item_type: AuditItemType;
  name: string;
  unit: string;
  quantity: number;
  notes: string | null;
}

/* ── UI labels ── */

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

export const CHANNEL_LABELS: Record<SalesChannel, string> = {
  website: 'Сайт',
  instagram: 'Instagram',
  telegram: 'Telegram',
  b2b: 'Опт B2B',
  other: 'Інше',
};

export const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  cash: 'Готівка',
  cod: 'Наложка',
  invoice: 'Рахунок',
  card: 'Карта',
};

export const SUPPLIER_METHOD_LABELS: Record<SupplierPaymentMethod, string> = {
  bank_transfer: 'Безнал (р/р)',
  card: 'Карта',
  cash: 'Готівка',
  other: 'Інше',
};
