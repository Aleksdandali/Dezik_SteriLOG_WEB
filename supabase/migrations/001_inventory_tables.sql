-- ═══════════════════════════════════════════════════════════
-- DEZIK Admin — Inventory & Stock Management
-- Run against existing Supabase DB (extends current schema)
-- ═══════════════════════════════════════════════════════════

-- ─── 1. Extend orders with richer status workflow ───
-- Add new statuses to orders (existing: pending, confirmed, canceled)
-- New flow: pending → confirmed → processing → shipped → delivered → canceled
-- We use a text column (already exists), no ALTER needed — just document the new values.

-- Add payment tracking to orders
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'app';

COMMENT ON COLUMN orders.payment_status IS 'unpaid | paid | refunded';
COMMENT ON COLUMN orders.source IS 'app | admin | import';
COMMENT ON COLUMN orders.status IS 'pending | confirmed | processing | shipped | delivered | canceled';

-- ─── 2. Product variants (SKU) ───
CREATE TABLE IF NOT EXISTS product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,           -- e.g. "1л", "500мл", "100шт"
  price NUMERIC NOT NULL,
  cost_price NUMERIC,           -- собівартість
  barcode TEXT,
  weight_grams INTEGER,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_variants_product ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_sku ON product_variants(sku);

-- ─── 3. Warehouses ───
CREATE TABLE IF NOT EXISTS warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Insert default warehouse
INSERT INTO warehouses (name, is_default)
  VALUES ('Основний склад', true)
  ON CONFLICT DO NOTHING;

-- ─── 4. Stock (current quantities per variant+warehouse) ───
CREATE TABLE IF NOT EXISTS stocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 0,
  reserved INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(variant_id, warehouse_id)
);

CREATE INDEX IF NOT EXISTS idx_stocks_variant ON stocks(variant_id);
CREATE INDEX IF NOT EXISTS idx_stocks_warehouse ON stocks(warehouse_id);

COMMENT ON COLUMN stocks.quantity IS 'Total physical stock on hand';
COMMENT ON COLUMN stocks.reserved IS 'Reserved for pending/confirmed orders';

-- ─── 5. Stock movements (audit log) ───
CREATE TABLE IF NOT EXISTS stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  type TEXT NOT NULL,            -- 'in' | 'out' | 'reserve' | 'unreserve' | 'write_off' | 'transfer' | 'adjustment'
  quantity INTEGER NOT NULL,     -- positive = increase, negative = decrease
  reason TEXT,                   -- human-readable reason
  reference_type TEXT,           -- 'order' | 'manual' | 'import' | 'transfer'
  reference_id UUID,             -- order_id or transfer_id
  created_by UUID,               -- admin user id
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_variant ON stock_movements(variant_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_reference ON stock_movements(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created ON stock_movements(created_at DESC);

-- ─── 6. Stock reservations (per order) ───
CREATE TABLE IF NOT EXISTS stock_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'fulfilled' | 'released'
  created_at TIMESTAMPTZ DEFAULT now(),
  released_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_stock_reservations_order ON stock_reservations(order_id);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_variant ON stock_reservations(variant_id);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_status ON stock_reservations(status) WHERE status = 'active';

-- ─── 7. Link order_items to variants ───
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES product_variants(id);

-- ─── 8. SQL View: available stock ───
CREATE OR REPLACE VIEW v_stock_available AS
SELECT
  s.variant_id,
  s.warehouse_id,
  w.name AS warehouse_name,
  pv.sku,
  pv.name AS variant_name,
  p.name AS product_name,
  s.quantity AS on_hand,
  s.reserved,
  (s.quantity - s.reserved) AS available
FROM stocks s
JOIN product_variants pv ON pv.id = s.variant_id
JOIN products p ON p.id = pv.product_id
JOIN warehouses w ON w.id = s.warehouse_id
WHERE pv.active = true AND w.active = true;

-- ─── 9. RLS policies ───
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE stocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_reservations ENABLE ROW LEVEL SECURITY;

-- Public read for variants (mobile app needs prices)
CREATE POLICY "Anyone can read active variants" ON product_variants
  FOR SELECT USING (active = true);

-- Service role has full access (admin panel uses service_role key)
-- No additional policies needed — service_role bypasses RLS
