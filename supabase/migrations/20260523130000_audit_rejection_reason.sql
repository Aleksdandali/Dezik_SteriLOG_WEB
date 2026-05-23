-- Reviewers must provide a reason when rejecting an inventory audit so the
-- operator who counted gets actionable feedback ("повтори блок Х", "фото
-- нечитке", тощо) instead of a silent ❌. Optional for approves.

ALTER TABLE ops_inventory_audits
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
