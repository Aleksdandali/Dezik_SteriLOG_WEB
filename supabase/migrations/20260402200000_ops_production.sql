-- ╔══════════════════════════════════════════════════╗
-- ║  Production Tracking — Маліновського             ║
-- ║  Друк рулонів + Упаковка пакетів                ║
-- ╚══════════════════════════════════════════════════╝

CREATE TABLE ops_production (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES ops_staff(id),
  location TEXT NOT NULL CHECK (location IN ('malynovskogo', 'dalnytska')),
  stage TEXT NOT NULL CHECK (stage IN ('print', 'pack')),
  -- Product spec
  bag_size TEXT NOT NULL CHECK (bag_size IN ('60x100', '75x150', '100x200', '150x230')),
  material TEXT NOT NULL CHECK (material IN ('transparent', 'white')),
  -- Output
  km NUMERIC(8,2) CHECK (km >= 0),           -- друкар: кілометри
  rolls INTEGER CHECK (rolls >= 0),           -- друкар: рулони
  packages INTEGER CHECK (packages >= 0),     -- пакувальник: упаковки (1 уп = 100 пакетів)
  --
  photo_url TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ops_production_created ON ops_production(created_at DESC);
CREATE INDEX idx_ops_production_staff ON ops_production(staff_id);
CREATE INDEX idx_ops_production_stage ON ops_production(stage);

ALTER TABLE ops_production ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON ops_production FOR ALL USING (true) WITH CHECK (true);
