-- ============================================================
-- Retention System Phase 1: customer profiles, consumption, messages
-- ============================================================

-- 1. customer_profiles — aggregated customer data
CREATE TABLE customer_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL UNIQUE,                      -- KeyCRM phone, links to customer_telegram_links
  first_name TEXT,
  segment TEXT NOT NULL DEFAULT 'new',             -- new | active | vip | dormant | churned
  loyalty_tier TEXT NOT NULL DEFAULT 'bronze',     -- bronze | silver | gold | platinum
  total_orders INTEGER NOT NULL DEFAULT 0,
  annual_spend NUMERIC(12,2) NOT NULL DEFAULT 0,
  lifetime_spend NUMERIC(12,2) NOT NULL DEFAULT 0,
  first_order_date DATE,
  last_order_date DATE,
  avg_order_interval_days INTEGER,                 -- average days between orders
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cp_segment ON customer_profiles(segment);
CREATE INDEX idx_cp_loyalty ON customer_profiles(loyalty_tier);
CREATE INDEX idx_cp_last_order ON customer_profiles(last_order_date);

ALTER TABLE customer_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON customer_profiles FOR ALL USING (true) WITH CHECK (true);


-- 2. consumption_tracking — per-product consumption per customer
CREATE TABLE consumption_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL,                             -- customer phone
  product_category TEXT NOT NULL,                  -- e.g. 'BAG-100x200-WH', matches ops_products.sku
  product_name TEXT,                               -- human-readable name for messages
  last_order_date DATE NOT NULL,
  last_order_quantity INTEGER NOT NULL DEFAULT 0,
  estimated_daily_usage NUMERIC(8,4) NOT NULL DEFAULT 0,  -- units per day
  estimated_empty_date DATE,                       -- when product runs out
  reminder_stage INTEGER NOT NULL DEFAULT 0,       -- 0=not sent, 1=first reminder, 2=second reminder
  reminder_last_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(phone, product_category)
);

CREATE INDEX idx_ct_empty_date ON consumption_tracking(estimated_empty_date) WHERE reminder_stage < 2;
CREATE INDEX idx_ct_phone ON consumption_tracking(phone);

ALTER TABLE consumption_tracking ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON consumption_tracking FOR ALL USING (true) WITH CHECK (true);


-- 3. retention_messages — log of all retention messages sent
CREATE TABLE retention_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL,
  telegram_id BIGINT,
  message_type TEXT NOT NULL,                      -- post_delivery | reorder_reminder | win_back | upsell
  message_text TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  clicked BOOLEAN NOT NULL DEFAULT false,
  resulted_in_order BOOLEAN NOT NULL DEFAULT false,
  order_id INTEGER,                                -- KeyCRM order ID if resulted in order
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rm_phone_sent ON retention_messages(phone, sent_at DESC);
CREATE INDEX idx_rm_type ON retention_messages(message_type);
CREATE INDEX idx_rm_sent_at ON retention_messages(sent_at DESC);

ALTER TABLE retention_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON retention_messages FOR ALL USING (true) WITH CHECK (true);


-- Default consumption rates by product category (days per unit)
-- Used for first-time buyers when no history exists
COMMENT ON TABLE consumption_tracking IS 'Default daily usage estimates:
BAG-* (bags): ~3 per day for active salon
DEL-*/BIO-*/INS-*/SEP-* (liquids): 1000ml lasts ~60 days, 500ml ~30 days, 250ml ~15 days
JRN-30 (journal): 1 per 30 days
OIL-30 (oil): 1 per 60 days
TRAY-* (trays): 1 per 365 days';
