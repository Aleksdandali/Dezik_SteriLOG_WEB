-- Add brown material + structured product fields to movements

-- 1. Add 'brown' to production materials
ALTER TABLE ops_production DROP CONSTRAINT IF EXISTS ops_production_material_check;
ALTER TABLE ops_production ADD CONSTRAINT ops_production_material_check
  CHECK (material IN ('transparent', 'white', 'brown'));

-- 2. Add product tracking fields to movements
ALTER TABLE ops_movements ADD COLUMN bag_size TEXT;
ALTER TABLE ops_movements ADD COLUMN material TEXT;
ALTER TABLE ops_movements ADD COLUMN packages INTEGER CHECK (packages > 0);
