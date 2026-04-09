-- Bridge: link Telegram Mini App users to Dezik Log profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS telegram_id BIGINT UNIQUE;
CREATE INDEX IF NOT EXISTS idx_profiles_telegram_id ON profiles(telegram_id);
