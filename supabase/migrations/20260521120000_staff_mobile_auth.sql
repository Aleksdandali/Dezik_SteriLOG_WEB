-- Mobile app auth flow for ops_staff (Dezik Staff iOS/Android).
-- Bot generates a one-shot 6-digit code → mobile exchanges it for a token.

CREATE TABLE ops_staff_login_codes (
  code TEXT PRIMARY KEY,
  telegram_id BIGINT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ops_staff_login_codes_telegram_id ON ops_staff_login_codes(telegram_id);
CREATE INDEX idx_ops_staff_login_codes_expires_at ON ops_staff_login_codes(expires_at);

ALTER TABLE ops_staff
  ADD COLUMN expo_push_token TEXT,
  ADD COLUMN expo_push_platform TEXT CHECK (expo_push_platform IN ('ios', 'android'));
