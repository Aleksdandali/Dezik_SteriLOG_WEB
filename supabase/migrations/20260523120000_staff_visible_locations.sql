-- ─── visible_locations: per-staff multi-warehouse access ──────────────────
--
-- Today `ops_staff.location` is a single "home" warehouse. A staffer
-- assigned to Афіна сегодня has zero visibility into Маліновського, even if
-- they help out cross-site (which happens — e.g. an admin covers when the
-- on-site person is sick).
--
-- `visible_locations` answers: "which warehouses should this user see in
-- pickers / dashboards / audit queue?".
--
-- Semantics enforced in application code (not DB):
--   - admin role          → ALL locations regardless of value
--   - non-admin, []       → fallback to just `location` (current behavior)
--   - non-admin, [...]    → exactly these locations (must include `location`
--                           by convention; backend coerces if missing)
--
-- Forward-only ADD COLUMN — safe on existing rows. Default '{}' = current
-- single-home behavior, no UX regression for staff who aren't reassigned.

ALTER TABLE ops_staff
  ADD COLUMN IF NOT EXISTS visible_locations TEXT[] NOT NULL DEFAULT '{}';

-- Optional integrity: each entry must be a known warehouse. Cheap CHECK
-- because the array is tiny (≤4 entries).
ALTER TABLE ops_staff
  DROP CONSTRAINT IF EXISTS ops_staff_visible_locations_valid;
ALTER TABLE ops_staff
  ADD CONSTRAINT ops_staff_visible_locations_valid
  CHECK (
    visible_locations <@ ARRAY['malynovskogo','afina_sklad','afina_ofis','dalnytska']::TEXT[]
  );
