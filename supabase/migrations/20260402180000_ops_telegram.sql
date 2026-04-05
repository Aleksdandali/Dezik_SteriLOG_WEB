-- ╔══════════════════════════════════════════════════╗
-- ║  Dezik Ops Bot — Database Schema                ║
-- ║  Phase 1: Expenses, Receivings, Movements,      ║
-- ║           Cash Reports, Supplier Payments,       ║
-- ║           Salaries, Fixed Costs                  ║
-- ╚══════════════════════════════════════════════════╝

-- ─── Staff (Telegram → internal user mapping) ────
CREATE TABLE ops_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id BIGINT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'staff')),
  location TEXT CHECK (location IN ('malynovskogo', 'afina_sklad', 'afina_ofis', 'dalnytska')),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Expenses ────
CREATE TABLE ops_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES ops_staff(id),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  category TEXT NOT NULL CHECK (category IN (
    'paper', 'glue', 'film', 'packaging', 'raw_materials',
    'rent', 'utilities', 'other'
  )),
  location TEXT NOT NULL CHECK (location IN (
    'malynovskogo', 'afina_sklad', 'afina_ofis', 'dalnytska'
  )),
  description TEXT,
  photo_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ops_expenses_staff ON ops_expenses(staff_id);
CREATE INDEX idx_ops_expenses_created ON ops_expenses(created_at DESC);

-- ─── Product Receivings ────
CREATE TABLE ops_receivings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES ops_staff(id),
  supplier TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  ttn TEXT,
  photo_url TEXT NOT NULL,
  location TEXT NOT NULL CHECK (location IN (
    'malynovskogo', 'afina_sklad', 'afina_ofis', 'dalnytska'
  )),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ops_receivings_created ON ops_receivings(created_at DESC);

-- ─── Product Movements (between locations) ────
CREATE TABLE ops_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES ops_staff(id),
  from_location TEXT NOT NULL CHECK (from_location IN (
    'malynovskogo', 'afina_sklad', 'afina_ofis', 'dalnytska'
  )),
  to_location TEXT NOT NULL CHECK (to_location IN (
    'malynovskogo', 'afina_sklad', 'afina_ofis', 'dalnytska'
  )),
  description TEXT NOT NULL,
  quantity INTEGER,
  photo_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (from_location != to_location)
);
CREATE INDEX idx_ops_movements_created ON ops_movements(created_at DESC);

-- ─── Daily Cash Reports ────
CREATE TABLE ops_cash_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES ops_staff(id),
  report_date DATE NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN (
    'website', 'instagram', 'telegram', 'b2b', 'other'
  )),
  payment_type TEXT NOT NULL CHECK (payment_type IN (
    'cash', 'cod', 'invoice', 'card'
  )),
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(staff_id, report_date, channel, payment_type)
);
CREATE INDEX idx_ops_cash_reports_date ON ops_cash_reports(report_date DESC);

-- ─── Supplier Payments ────
CREATE TABLE ops_supplier_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES ops_staff(id),
  supplier TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  method TEXT NOT NULL DEFAULT 'card' CHECK (method IN (
    'bank_transfer', 'card', 'cash', 'other'
  )),
  description TEXT,
  photo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ops_supplier_payments_created ON ops_supplier_payments(created_at DESC);

-- ─── Salaries ────
CREATE TABLE ops_salaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES ops_staff(id),
  recipient_id UUID NOT NULL REFERENCES ops_staff(id),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  type TEXT NOT NULL CHECK (type IN ('advance', 'salary')),
  period TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ops_salaries_period ON ops_salaries(period);

-- ─── Fixed Costs (templates) ────
CREATE TABLE ops_fixed_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  category TEXT NOT NULL CHECK (category IN ('rent', 'utilities', 'internet', 'subscription', 'other')),
  location TEXT CHECK (location IN ('malynovskogo', 'afina_sklad', 'afina_ofis', 'dalnytska')),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Fixed Cost Payments (actual monthly payments) ────
CREATE TABLE ops_fixed_cost_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fixed_cost_id UUID NOT NULL REFERENCES ops_fixed_costs(id),
  staff_id UUID NOT NULL REFERENCES ops_staff(id),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  period TEXT NOT NULL,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(fixed_cost_id, period)
);

-- ─── Inventory Audit (щопонеділковий переоблік) ────
CREATE TABLE ops_inventory_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES ops_staff(id),
  location TEXT NOT NULL CHECK (location IN (
    'malynovskogo', 'afina_sklad', 'afina_ofis', 'dalnytska'
  )),
  audit_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ops_inventory_audits_date ON ops_inventory_audits(audit_date DESC);

CREATE TABLE ops_inventory_audit_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID NOT NULL REFERENCES ops_inventory_audits(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('raw', 'finished')),
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'шт',
  quantity NUMERIC(12,2) NOT NULL CHECK (quantity >= 0),
  notes TEXT
);
CREATE INDEX idx_ops_audit_items_audit ON ops_inventory_audit_items(audit_id);

-- ─── RLS (all tables use service_role from API routes) ────
ALTER TABLE ops_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_receivings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_cash_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_supplier_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_salaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_fixed_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_fixed_cost_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_inventory_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_inventory_audit_items ENABLE ROW LEVEL SECURITY;

-- Allow service_role full access (API routes use this)
CREATE POLICY "service_role_all" ON ops_staff FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON ops_expenses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON ops_receivings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON ops_movements FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON ops_cash_reports FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON ops_supplier_payments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON ops_salaries FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON ops_fixed_costs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON ops_fixed_cost_payments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON ops_inventory_audits FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON ops_inventory_audit_items FOR ALL USING (true) WITH CHECK (true);

-- ─── Seed: Fixed Costs ────
INSERT INTO ops_fixed_costs (name, amount, category, location) VALUES
  ('Оренда Маліновського', 22000, 'rent', 'malynovskogo'),
  ('Оренда Афіна склад', 5000, 'rent', 'afina_sklad'),
  ('Оренда Афіна офіс', 6000, 'rent', 'afina_ofis'),
  ('Оренда Дальницька', 16000, 'rent', 'dalnytska');

-- ─── Storage bucket for photos ────
INSERT INTO storage.buckets (id, name, public) VALUES ('ops-photos', 'ops-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "ops_photos_upload" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'ops-photos');
CREATE POLICY "ops_photos_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'ops-photos');
