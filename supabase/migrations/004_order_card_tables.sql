-- ═══════════════════════════════════════════════
-- Order card: payments, audit log, expenses, tags
-- ═══════════════════════════════════════════════

-- 1. Payments
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  method TEXT NOT NULL DEFAULT 'cash',         -- cash | card | online | bank_transfer
  status TEXT NOT NULL DEFAULT 'pending',       -- pending | paid | canceled | refunded
  external_id TEXT,                             -- link to payment gateway
  comment TEXT,
  paid_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- 2. Order audit log
CREATE TABLE IF NOT EXISTS order_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  action TEXT NOT NULL,          -- status_change | payment_added | item_changed | comment | delivery_update
  field_name TEXT,               -- which field changed
  old_value TEXT,
  new_value TEXT,
  comment TEXT,
  created_by UUID,
  created_by_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_order ON order_audit_log(order_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON order_audit_log(created_at DESC);

ALTER TABLE order_audit_log ENABLE ROW LEVEL SECURITY;

-- 3. Order expenses
CREATE TABLE IF NOT EXISTS order_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  comment TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expenses_order ON order_expenses(order_id);
ALTER TABLE order_expenses ENABLE ROW LEVEL SECURITY;

-- 4. Tags
CREATE TABLE IF NOT EXISTS tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#94a3b8',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_tags (
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (order_id, tag_id)
);

ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_tags ENABLE ROW LEVEL SECURITY;

-- 5. Add delivery fields to orders
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_type TEXT DEFAULT 'warehouse',   -- warehouse | courier
  ADD COLUMN IF NOT EXISTS delivery_status TEXT DEFAULT 'pending',   -- pending | created | in_transit | delivered | returned
  ADD COLUMN IF NOT EXISTS recipient_name TEXT,
  ADD COLUMN IF NOT EXISTS recipient_phone TEXT,
  ADD COLUMN IF NOT EXISTS shipped_date DATE,
  ADD COLUMN IF NOT EXISTS estimated_delivery DATE;
