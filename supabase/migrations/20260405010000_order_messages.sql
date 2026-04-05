-- Chat messages tied to orders
CREATE TABLE ops_order_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id INTEGER NOT NULL,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('customer', 'manager')),
  sender_telegram_id BIGINT,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ops_order_messages_order ON ops_order_messages(order_id);
ALTER TABLE ops_order_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON ops_order_messages FOR ALL USING (true) WITH CHECK (true);
