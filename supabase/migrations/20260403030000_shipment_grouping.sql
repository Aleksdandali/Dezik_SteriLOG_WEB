-- Group multiple movement items into one shipment (накладна)
ALTER TABLE ops_movements ADD COLUMN IF NOT EXISTS shipment_id UUID;
CREATE INDEX IF NOT EXISTS idx_ops_movements_shipment ON ops_movements(shipment_id);
