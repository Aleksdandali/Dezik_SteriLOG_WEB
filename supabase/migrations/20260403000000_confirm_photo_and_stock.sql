-- Photo from receiver when confirming
ALTER TABLE ops_movements ADD COLUMN IF NOT EXISTS confirm_photo_url TEXT;
