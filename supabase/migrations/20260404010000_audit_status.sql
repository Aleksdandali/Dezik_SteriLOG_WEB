-- Add approval flow to inventory audits
ALTER TABLE ops_inventory_audits ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected'));
ALTER TABLE ops_inventory_audits ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES ops_staff(id);
ALTER TABLE ops_inventory_audits ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

-- Mark all existing audits as approved (legacy data)
UPDATE ops_inventory_audits SET status = 'approved' WHERE status = 'pending';
