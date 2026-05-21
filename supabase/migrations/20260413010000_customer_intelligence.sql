-- ============================================================
-- Customer Intelligence & Benchmarks for AI Retention System
-- Run: supabase db push
-- ============================================================

-- Segment enum for type safety
CREATE TYPE customer_segment AS ENUM (
  'new',        -- 1 order, < 30 days ago
  'returning',  -- 2 orders
  'regular',    -- 3-5 orders
  'vip',        -- 6+ orders OR total_spend > 15000
  'at_risk',    -- was regular/vip, no order 45-90 days
  'dormant',    -- no order 90-180 days
  'lost'        -- no order > 180 days
);

-- Main table: precomputed per-customer analytics
CREATE TABLE customer_intelligence (
  phone TEXT PRIMARY KEY,
  keycrm_buyer_id INTEGER UNIQUE,
  name TEXT,
  city TEXT,

  -- Lifecycle
  segment customer_segment NOT NULL DEFAULT 'new',
  first_order_date DATE,
  last_order_date DATE,
  days_since_last_order INTEGER, -- computed by sync job, not generated column
  total_orders INTEGER NOT NULL DEFAULT 0,
  total_spend NUMERIC(12,2) NOT NULL DEFAULT 0,
  avg_order_value NUMERIC(10,2) NOT NULL DEFAULT 0,
  avg_order_interval_days INTEGER, -- average days between orders (NULL if < 2 orders)

  -- Product behavior
  product_categories TEXT[] DEFAULT '{}',        -- ['bags','delanol','bionol','instrum','containers','septonal','journal','oil_pro']
  favorite_products JSONB DEFAULT '[]'::jsonb,   -- [{product_id, name, count, last_qty}] top 3
  never_bought_categories TEXT[] DEFAULT '{}',   -- categories they never bought

  -- Consumption predictions
  products_running_low JSONB DEFAULT '[]'::jsonb,  -- [{product, days_until_empty, last_qty, last_order_date}]
  next_expected_order_date DATE,

  -- Compared to base
  percentile_spend NUMERIC(5,2),     -- 0-100, e.g. 85.5 = top 14.5%
  percentile_frequency NUMERIC(5,2), -- 0-100
  is_below_avg_basket BOOLEAN DEFAULT false,

  -- For AI context
  ai_summary TEXT,                    -- precomputed 2-sentence summary in Ukrainian
  last_ai_analysis TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX idx_ci_segment ON customer_intelligence(segment);
CREATE INDEX idx_ci_last_order ON customer_intelligence(last_order_date DESC);
CREATE INDEX idx_ci_next_expected ON customer_intelligence(next_expected_order_date) WHERE next_expected_order_date IS NOT NULL;
CREATE INDEX idx_ci_days_since ON customer_intelligence(days_since_last_order DESC) WHERE days_since_last_order IS NOT NULL;
CREATE INDEX idx_ci_total_spend ON customer_intelligence(total_spend DESC);
CREATE INDEX idx_ci_keycrm_buyer ON customer_intelligence(keycrm_buyer_id) WHERE keycrm_buyer_id IS NOT NULL;
CREATE INDEX idx_ci_products_low ON customer_intelligence USING GIN(products_running_low);

-- Global benchmarks table (key-value store for aggregate metrics)
CREATE TABLE retention_benchmarks (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sync log for tracking pipeline runs
CREATE TABLE retention_sync_log (
  id SERIAL PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running', -- running | completed | failed
  customers_processed INTEGER DEFAULT 0,
  orders_fetched INTEGER DEFAULT 0,
  errors JSONB DEFAULT '[]'::jsonb,
  duration_ms INTEGER
);

-- Enable RLS (admin-only access)
ALTER TABLE customer_intelligence ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention_benchmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention_sync_log ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (used by API routes)
CREATE POLICY "service_role_ci" ON customer_intelligence
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_rb" ON retention_benchmarks
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_rsl" ON retention_sync_log
  FOR ALL USING (auth.role() = 'service_role');

-- Authenticated users can read
CREATE POLICY "authenticated_read_ci" ON customer_intelligence
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated_read_rb" ON retention_benchmarks
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated_read_rsl" ON retention_sync_log
  FOR SELECT USING (auth.role() = 'authenticated');

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_ci_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ci_updated_at
  BEFORE UPDATE ON customer_intelligence
  FOR EACH ROW EXECUTE FUNCTION update_ci_updated_at();

-- Seed initial benchmark keys so we know what to expect
INSERT INTO retention_benchmarks (key, value) VALUES
  ('avg_order_value_all', '0'::jsonb),
  ('avg_interval_all', '0'::jsonb),
  ('product_adoption_rates', '{}'::jsonb),
  ('segment_distribution', '{}'::jsonb),
  ('avg_basket_by_segment', '{}'::jsonb),
  ('cross_sell_success_rates', '{}'::jsonb),
  ('total_customers', '0'::jsonb),
  ('total_revenue', '0'::jsonb)
ON CONFLICT (key) DO NOTHING;
