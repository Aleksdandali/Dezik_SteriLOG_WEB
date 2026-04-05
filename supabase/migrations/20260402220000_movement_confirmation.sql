-- Movement confirmation by receiver
ALTER TABLE ops_movements ADD COLUMN confirmed_by UUID REFERENCES ops_staff(id);
ALTER TABLE ops_movements ADD COLUMN confirmed_at TIMESTAMPTZ;
ALTER TABLE ops_movements ADD COLUMN confirmed_packages INTEGER;

-- Stock balance view (computed from confirmed movements)
CREATE OR REPLACE VIEW v_ops_stock AS
SELECT
  m.to_location AS location,
  m.bag_size,
  m.material,
  COALESCE(SUM(m.confirmed_packages), 0) AS total_in,
  COALESCE((
    SELECT SUM(m2.confirmed_packages)
    FROM ops_movements m2
    WHERE m2.from_location = m.to_location
      AND m2.bag_size = m.bag_size
      AND m2.material = m.material
      AND m2.confirmed_at IS NOT NULL
  ), 0) AS total_out,
  COALESCE(SUM(m.confirmed_packages), 0) - COALESCE((
    SELECT SUM(m2.confirmed_packages)
    FROM ops_movements m2
    WHERE m2.from_location = m.to_location
      AND m2.bag_size = m.bag_size
      AND m2.material = m.material
      AND m2.confirmed_at IS NOT NULL
  ), 0) AS balance
FROM ops_movements m
WHERE m.confirmed_at IS NOT NULL
  AND m.bag_size IS NOT NULL
  AND m.material IS NOT NULL
GROUP BY m.to_location, m.bag_size, m.material;
