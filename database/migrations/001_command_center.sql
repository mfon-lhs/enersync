-- ===========================================================================
-- MIGRATION 001: COMMAND CENTER COLUMNS
--
-- Upgrades a database that was created from the OLD schema.sql.
-- Run it once on EACH database you use:
--   1. enersync       (your real data)
--   2. enersync_test  (the pytest database)
--
-- It is safe to run twice: every step checks first, so a second run changes
-- nothing. The whole script runs as one unit. If any step fails, none of the
-- changes are kept.
--
-- A new, empty database does not need this file. schema.sql already has all of
-- these changes.
-- ===========================================================================

BEGIN;

-- 1. A new fixed list of allowed values: how urgent a request is
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'request_priority') THEN
        CREATE TYPE request_priority AS ENUM ('Low', 'Normal', 'High', 'Critical');
    END IF;
END
$$;

-- 2. New asset columns for the dashboard
ALTER TABLE assets
    ADD COLUMN IF NOT EXISTS capacity_value NUMERIC(12,2)
        CHECK (capacity_value IS NULL OR capacity_value >= 0),
    ADD COLUMN IF NOT EXISTS capacity_unit VARCHAR(20),
    ADD COLUMN IF NOT EXISTS utilization_pct NUMERIC(5,2) NOT NULL DEFAULT 0
        CHECK (utilization_pct BETWEEN 0 AND 100),
    ADD COLUMN IF NOT EXISTS is_critical BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS inspection_interval_days INT NOT NULL DEFAULT 90
        CHECK (inspection_interval_days > 0),
    ADD COLUMN IF NOT EXISTS latitude NUMERIC(8,6)
        CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
    ADD COLUMN IF NOT EXISTS longitude NUMERIC(9,6)
        CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180);

-- 3. Rules that tie two columns together: both are filled in, or both are empty
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assets_capacity_pair') THEN
        ALTER TABLE assets
            ADD CONSTRAINT assets_capacity_pair
            CHECK ((capacity_value IS NULL) = (capacity_unit IS NULL));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assets_coordinates_pair') THEN
        ALTER TABLE assets
            ADD CONSTRAINT assets_coordinates_pair
            CHECK ((latitude IS NULL) = (longitude IS NULL));
    END IF;
END
$$;

-- 4. Request priority. Existing requests become Normal.
ALTER TABLE logistics_requests
    ADD COLUMN IF NOT EXISTS priority request_priority NOT NULL DEFAULT 'Normal';

-- 5. Indexes for faster list pages and a faster audit log
CREATE INDEX IF NOT EXISTS idx_assets_status        ON assets (status);
CREATE INDEX IF NOT EXISTS idx_assets_location      ON assets (current_location);
CREATE INDEX IF NOT EXISTS idx_requests_status      ON logistics_requests (status);
CREATE INDEX IF NOT EXISTS idx_requests_asset       ON logistics_requests (asset_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table_log ON audit_logs (table_name, log_id DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user      ON audit_logs (user_id);

-- 6. Fill in the new details for the two original demo assets, if they exist.
-- The "IS NULL" check means a value you set yourself is never overwritten.
UPDATE assets
SET capacity_value = 500, capacity_unit = 'kVA', utilization_pct = 64, is_critical = TRUE,
    inspection_interval_days = 90, latitude = 4.815600, longitude = 7.049800,
    last_inspected_at = COALESCE(last_inspected_at, CURRENT_TIMESTAMP - INTERVAL '21 days')
WHERE asset_tag = 'ENS-PH-GEN-001' AND capacity_value IS NULL AND latitude IS NULL;

UPDATE assets
SET capacity_value = 1, capacity_unit = 'tonnes', utilization_pct = 0, is_critical = FALSE,
    inspection_interval_days = 60, latitude = 9.076500, longitude = 7.398600,
    last_inspected_at = COALESCE(last_inspected_at, CURRENT_TIMESTAMP - INTERVAL '75 days')
WHERE asset_tag = 'ENS-ABJ-FLEET-12' AND capacity_value IS NULL AND latitude IS NULL;

COMMIT;
