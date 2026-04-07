-- Add columns for tracking Telegram message IDs (to delete old notifications)
ALTER TABLE ops_notifications ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE ops_notifications ADD COLUMN IF NOT EXISTS telegram_chat_id BIGINT;
ALTER TABLE ops_notifications ADD COLUMN IF NOT EXISTS telegram_message_id BIGINT;
