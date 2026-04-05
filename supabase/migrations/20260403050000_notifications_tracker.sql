-- Track which orders we already sent notifications for
CREATE TABLE IF NOT EXISTS ops_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id INTEGER NOT NULL UNIQUE,
  notified_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE ops_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON ops_notifications FOR ALL USING (true) WITH CHECK (true);
