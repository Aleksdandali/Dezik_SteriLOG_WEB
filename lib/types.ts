export interface Profile {
  id: string;
  name: string | null;
  salon_name: string | null;
  phone: string | null;
  city: string | null;
  avatar_url: string | null;
  role: 'owner' | 'staff';
  notification_cycle_done: boolean;
  notification_cycle_idle: boolean;
  notification_order_status: boolean;
  created_at: string;
  updated_at: string;
  email?: string;
}

export interface Instrument {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
}

export interface Sterilizer {
  id: string;
  user_id: string;
  name: string;
  type: 'dry_heat' | 'autoclave' | null;
  brand: string | null;
  created_at: string;
}

export interface SterilizationSession {
  id: string;
  user_id: string;
  salon_name: string | null;
  sterilizer_id: string | null;
  sterilizer_name: string;
  instrument_names: string;
  packet_type: 'kraft' | 'transparent' | 'none';
  pouch_size: string | null;
  temperature: number | null;
  duration_minutes: number | null;
  started_at: string | null;
  ended_at: string | null;
  photo_before_path: string | null;
  photo_after_path: string | null;
  result: 'success' | 'fail' | null;
  status: 'draft' | 'in_progress' | 'completed' | 'failed' | 'canceled';
  created_at: string;
  profiles?: Profile;
}

export interface Solution {
  id: string;
  user_id: string;
  product_id: string | null;
  name: string;
  opened_at: string;
  expires_at: string;
  status: 'active' | 'warning' | 'expired' | null;
  created_at: string;
}

export interface Product {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  price: number;
  volume: string | null;
  image_path: string | null;
  in_stock: boolean;
  shelf_life_days: number | null;
  sort_order: number;
  created_at: string;
  product_categories?: ProductCategory;
}

export interface ProductCategory {
  id: string;
  name: string;
  sort_order: number;
}

export type OrderStatus = 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'canceled';
export type PaymentStatus = 'unpaid' | 'paid' | 'refunded';

export interface Order {
  id: string;
  user_id: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  total_amount: number;
  delivery_address: string | null;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  city_ref: string | null;
  city_name: string | null;
  warehouse_ref: string | null;
  warehouse_name: string | null;
  np_ttn: string | null;
  np_delivery_cost: number | null;
  notes: string | null;
  keycrm_order_id: number | null;
  source: 'app' | 'admin' | 'import';
  confirmed_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  canceled_at: string | null;
  paid_at: string | null;
  created_at: string;
  profiles?: Profile;
  order_items?: OrderItem[];
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  variant_id: string | null;
  product_name: string;
  quantity: number;
  price_at_order: number;
  created_at: string;
}

/* ── Inventory ── */

export interface ProductVariant {
  id: string;
  product_id: string;
  sku: string;
  name: string;
  price: number;
  cost_price: number | null;
  barcode: string | null;
  weight_grams: number | null;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  product?: Product;
}

export interface Warehouse {
  id: string;
  name: string;
  address: string | null;
  is_default: boolean;
  active: boolean;
  created_at: string;
}

export interface Stock {
  variant_id: string;
  warehouse_id: string;
  quantity: number;
  reserved: number;
  updated_at: string;
}

export interface StockAvailable {
  variant_id: string;
  warehouse_id: string;
  warehouse_name: string;
  sku: string;
  variant_name: string;
  product_name: string;
  on_hand: number;
  reserved: number;
  available: number;
}

export type StockMovementType = 'in' | 'out' | 'reserve' | 'unreserve' | 'write_off' | 'adjustment';

export interface StockMovement {
  id: string;
  variant_id: string;
  warehouse_id: string;
  type: StockMovementType;
  quantity: number;
  reason: string | null;
  reference_type: string | null;
  reference_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface StockReservation {
  id: string;
  order_id: string;
  variant_id: string;
  warehouse_id: string;
  quantity: number;
  status: 'active' | 'fulfilled' | 'released';
  created_at: string;
  released_at: string | null;
}

export interface AppConfig {
  key: string;
  value: string;
  description: string | null;
  updated_at: string;
}

export interface SteriPreset {
  id: string;
  label: string;
  sublabel: string;
  temperature: number;
  duration: number;
  type: 'dry_heat' | 'autoclave';
  recommended: boolean;
  description: string | null;
  sort_order: number;
  active: boolean;
  created_at: string;
}

export interface PacketType {
  id: string;
  label: string;
  sort_order: number;
  active: boolean;
}

export interface InstrumentPouchMap {
  id: string;
  pattern: string;
  pouch_id: string;
  note: string | null;
  sort_order: number;
}

export interface ConcentrateProduct {
  id: string;
  name: string;
  product_id: string | null;
  concentration_instruments: number | null;
  concentration_surfaces: number | null;
  concentration_preclean: number | null;
  concentration_other: number | null;
  contact_time_instruments: number | null;
  contact_time_surfaces: number | null;
  contact_time_preclean: number | null;
  contact_time_other: number | null;
  active: boolean;
  sort_order: number;
  created_at: string;
}

export interface KnowledgeDocument {
  id: string;
  title: string;
  subtitle: string | null;
  content: string;
  category: 'guide' | 'method' | 'faq';
  sort_order: number;
  published: boolean;
  created_at: string;
  updated_at: string;
}
