-- Auto-incrementing order number for human-readable display
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_number SERIAL;

-- Manager comment
ALTER TABLE orders ADD COLUMN IF NOT EXISTS manager_comment TEXT;

-- Create index for fast lookup
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number DESC);
