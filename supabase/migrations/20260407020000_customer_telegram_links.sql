CREATE TABLE customer_telegram_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL,
  telegram_id BIGINT NOT NULL,
  first_name TEXT,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_customer_telegram_phone ON customer_telegram_links(phone);
ALTER TABLE customer_telegram_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON customer_telegram_links FOR ALL USING (true) WITH CHECK (true);
