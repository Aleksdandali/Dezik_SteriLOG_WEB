CREATE TABLE bot_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id BIGINT NOT NULL,
  first_name TEXT,
  username TEXT,
  phone TEXT,
  is_customer BOOLEAN DEFAULT FALSE,
  last_active TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_bot_subscribers_tg ON bot_subscribers(telegram_id);
ALTER TABLE bot_subscribers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON bot_subscribers FOR ALL USING (true) WITH CHECK (true);
