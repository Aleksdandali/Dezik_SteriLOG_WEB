-- Registration requests from new staff
CREATE TABLE ops_staff_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id BIGINT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  username TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ops_staff_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON ops_staff_requests FOR ALL USING (true) WITH CHECK (true);

-- Add visibility settings to staff
ALTER TABLE ops_staff ADD COLUMN IF NOT EXISTS visible_sections TEXT[] DEFAULT '{}';
