-- Allow 'partial' in payment_status
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
-- No constraint needed — payment_status is a TEXT column with no CHECK
