-- ===========================================================================
-- ENERSYNC DATABASE SCHEMA
-- Asset and logistics tracker for energy operations
--
-- Requires PostgreSQL 11 or newer. PostgreSQL only: this file will not run
-- on MySQL.
--
-- This file is the source of truth for the database. The column names here
-- are the ones the application code must use.
-- ===========================================================================

-- 1. ENUM TYPES
-- Fixed lists of allowed values. The database rejects anything else.
CREATE TYPE user_role AS ENUM ('SuperAdmin', 'LogisticsManager', 'FieldTechnician', 'Viewer');
CREATE TYPE asset_status AS ENUM ('Operational', 'MaintenanceRequired', 'Decommissioned', 'InTransit');
CREATE TYPE request_status AS ENUM ('Pending', 'Approved', 'Rejected', 'Completed');

-- ROLE PERMISSIONS
-- Enforced by the backend. The database only stores the role.
--   SuperAdmin       everything, including managing users and reading the audit log
--   LogisticsManager view assets, create and edit assets, raise, approve and reject requests
--   FieldTechnician  view assets, raise requests
--   Viewer           view assets and requests only (read-only)

-- 2. USERS
-- People who log in. Deactivate a user with is_active = FALSE. Never delete
-- one, because their audit history must stay readable.
CREATE TABLE users (
    user_id       SERIAL PRIMARY KEY,
    first_name    VARCHAR(50)  NOT NULL,
    last_name     VARCHAR(50)  NOT NULL,
    email         VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,        -- bcrypt hash only. Never plain text.
    role          user_role    NOT NULL DEFAULT 'FieldTechnician',
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    location      VARCHAR(100) NOT NULL,        -- e.g. 'Port Harcourt Hub', 'Abuja HQ'
    created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. ASSETS
-- Equipment, vehicles and field infrastructure. Retire an asset by setting its
-- status to Decommissioned. Never delete it, because requests refer to it.
CREATE TABLE assets (
    asset_id          SERIAL PRIMARY KEY,
    asset_tag         VARCHAR(20)  NOT NULL UNIQUE,  -- e.g. 'ENS-PH-PUMP-042'
    name              VARCHAR(100) NOT NULL,
    category          VARCHAR(50)  NOT NULL,         -- e.g. 'Turbine', 'Fleet Vehicles', 'Drill Equipment'
    status            asset_status NOT NULL DEFAULT 'Operational',
    current_location  VARCHAR(100) NOT NULL,
    last_inspected_at TIMESTAMP WITH TIME ZONE,
    created_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. LOGISTICS REQUESTS
-- A request to move an asset from one place to another.
CREATE TABLE logistics_requests (
    request_id             SERIAL PRIMARY KEY,
    asset_id               INT NOT NULL REFERENCES assets(asset_id) ON DELETE RESTRICT,
    requested_by           INT NOT NULL REFERENCES users(user_id),
    approved_by            INT REFERENCES users(user_id),   -- NULL until approved
    origin                 VARCHAR(100) NOT NULL,
    destination            VARCHAR(100) NOT NULL,
    status                 request_status NOT NULL DEFAULT 'Pending',
    departure_date         TIMESTAMP WITH TIME ZONE,
    estimated_arrival_date TIMESTAMP WITH TIME ZONE,
    notes                  TEXT,
    created_at             TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at             TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. AUDIT LOGS
-- A history of changes: who did what, and the data before and after.
-- Rows are added, never edited or deleted. The user link has no
-- ON DELETE clause, so a user with audit history cannot be deleted.
CREATE TABLE audit_logs (
    log_id      BIGSERIAL PRIMARY KEY,
    user_id     INT REFERENCES users(user_id),   -- NULL only when no logged-in user is involved
    action_type VARCHAR(50) NOT NULL,            -- e.g. 'ASSET_TRANSFER_APPROVED', 'USER_LOGIN'
    table_name  VARCHAR(50) NOT NULL,
    record_id   INT NOT NULL,
    old_value   JSONB,                           -- data before the change
    new_value   JSONB,                           -- data after the change
    ip_address  VARCHAR(45),
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 6. AUTOMATIC updated_at
-- Sets updated_at to the current time whenever a row changes.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER logistics_requests_set_updated_at
BEFORE UPDATE ON logistics_requests
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ===========================================================================
-- SEED DATA
-- Fictional records for practice and demos. No real people or real assets.
-- ===========================================================================

-- PLACEHOLDER PASSWORDS: these are not real hashes, so these two users cannot
-- log in yet. The seed script will replace them with real bcrypt hashes.
INSERT INTO users (first_name, last_name, email, password_hash, role, location) VALUES
('Amina', 'Bello', 'a.bello@enersync.corp', 'DEMO-PLACEHOLDER-NOT-A-HASH', 'LogisticsManager', 'Abuja HQ'),
('Emeka', 'Okon',  'e.okon@enersync.corp',  'DEMO-PLACEHOLDER-NOT-A-HASH', 'FieldTechnician', 'Port Harcourt Hub');

INSERT INTO assets (asset_tag, name, category, status, current_location) VALUES
('ENS-PH-GEN-001',   'Caterpillar 500kVA Generator', 'Power Systems',   'Operational',         'Port Harcourt Hub'),
('ENS-ABJ-FLEET-12', 'Toyota Hilux 4x4 Escort',      'Logistics Fleet', 'MaintenanceRequired', 'Abuja HQ');

INSERT INTO logistics_requests (asset_id, requested_by, origin, destination, status, notes) VALUES
(1, 2, 'Port Harcourt Hub', 'Obagi Field Location', 'Pending',
 'Urgent deployment required for emergency power backup.');
