-- ===========================================================================
-- ENERSYNC DEMO DATA
-- A fuller set of FICTIONAL records, so the command center has something to show:
-- 4 users, 23 assets, 13 logistics requests and a matching audit history.
-- No real people, companies or equipment. Enersync is an independent portfolio
-- project and is not affiliated with any energy company.
--
-- HOW TO RUN: open pgAdmin, right-click the enersync database, choose Query Tool,
-- paste this whole file, and press F5. Run it on enersync ONLY, never on
-- enersync_test (the tests empty that database every time they run).
--
-- It is safe to run twice: the second run changes nothing.
--
-- It needs the new database layout (schema.sql, or the 001 upgrade script).
-- The demo users get a placeholder password, so nobody can log in as them yet.
-- Afterwards run:  python -m scripts.set_demo_passwords   (from the backend folder)
-- ===========================================================================

DO $$
DECLARE
    already_loaded BOOLEAN;
    r              RECORD;
    rid            INT;
    requester_id   INT;
    decider_id     INT;
    asset_row_id   INT;
    admin_id       INT;
    manager_id     INT;
    created_time   TIMESTAMPTZ;
BEGIN
    -- If the demo data is already in, stop here and change nothing
    SELECT EXISTS (SELECT 1 FROM assets WHERE asset_tag = 'ENS-LOS-CRANE-001') INTO already_loaded;
    IF already_loaded THEN
        RAISE NOTICE 'Demo data is already loaded. Nothing was changed.';
        RETURN;
    END IF;

    -- 1. USERS ----------------------------------------------------------
    -- The first two already exist if you ran schema.sql. ON CONFLICT skips existing emails.
    INSERT INTO users (first_name, last_name, email, password_hash, role, location) VALUES
    ('Ifeoma', 'Nwosu',   'i.nwosu@enersync.corp',   'DEMO-PLACEHOLDER-NOT-A-HASH', 'SuperAdmin',       'Abuja HQ'),
    ('Amina',  'Bello',   'a.bello@enersync.corp',   'DEMO-PLACEHOLDER-NOT-A-HASH', 'LogisticsManager', 'Abuja HQ'),
    ('Emeka',  'Okon',    'e.okon@enersync.corp',    'DEMO-PLACEHOLDER-NOT-A-HASH', 'FieldTechnician',  'Port Harcourt Hub'),
    ('Tunde',  'Adebayo', 't.adebayo@enersync.corp', 'DEMO-PLACEHOLDER-NOT-A-HASH', 'Viewer',           'Lagos Terminal')
    ON CONFLICT (email) DO NOTHING;

    SELECT user_id INTO admin_id   FROM users WHERE email = 'i.nwosu@enersync.corp';
    SELECT user_id INTO manager_id FROM users WHERE email = 'a.bello@enersync.corp';

    -- 2. ASSETS ---------------------------------------------------------
    -- tag, name, category, status, location, days since inspection,
    -- capacity, unit, utilization %, critical, inspection interval (days), latitude, longitude
    INSERT INTO assets (asset_tag, name, category, status, current_location, last_inspected_at,
                        capacity_value, capacity_unit, utilization_pct, is_critical,
                        inspection_interval_days, latitude, longitude, created_at)
    SELECT v.tag, v.name, v.category, v.status::asset_status, v.location,
           CURRENT_TIMESTAMP - make_interval(days => v.inspected_days_ago),
           v.cap, v.unit, v.util, v.critical, v.interval_days, v.lat, v.lon,
           CURRENT_TIMESTAMP - INTERVAL '60 days'
    FROM (VALUES
      ('ENS-PH-GEN-001',     'Caterpillar 500kVA Generator', 'Power Systems',   'Operational',         'Port Harcourt Hub',      21,  500::numeric,   'kVA'::text,    64::numeric, TRUE,  90, 4.815600::numeric,  7.049800::numeric),
      ('ENS-PH-GEN-002',     'Cummins 250kVA Generator',     'Power Systems',   'Operational',         'Port Harcourt Hub',      48,  250,            'kVA',          41,          FALSE, 90, 4.815900,           7.050200),
      ('ENS-PH-PUMP-007',    'Centrifugal Transfer Pump',    'Pumping',         'Operational',         'Port Harcourt Hub',      33,  900,            'm3/h',         72,          TRUE,  60, 4.816200,           7.049100),
      ('ENS-PH-PUMP-008',    'Booster Pump Skid',            'Pumping',         'MaintenanceRequired', 'Port Harcourt Hub',      97,  400,            'm3/h',         0,           FALSE, 60, 4.816000,           7.048800),
      ('ENS-PH-TANK-003',    'Storage Tank 3',               'Storage',         'Operational',         'Port Harcourt Hub',      12,  20000,          'bbl',          58,          TRUE,  180, 4.814800,          7.051000),
      ('ENS-ABJ-FLEET-12',   'Toyota Hilux 4x4 Escort',      'Logistics Fleet', 'MaintenanceRequired', 'Abuja HQ',               75,  1,              'tonnes',       0,           FALSE, 60, 9.076500,           7.398600),
      ('ENS-ABJ-FLEET-14',   'Mercedes Actros Haul Truck',   'Logistics Fleet', 'Operational',         'Abuja HQ',               18,  25,             'tonnes',       81,          FALSE, 45, 9.077100,           7.399200),
      ('ENS-ABJ-COMMS-002',  'Satellite Uplink Terminal',    'Communications',  'Operational',         'Abuja HQ',               30,  NULL,           NULL,           35,          TRUE,  120, 9.076900,          7.398100),
      ('ENS-LOS-CRANE-001',  'Mobile Harbour Crane',         'Lifting',         'Operational',         'Lagos Terminal',         40,  80,             'tonnes',       67,          TRUE,  90, 6.452300,           3.389800),
      ('ENS-LOS-FLEET-03',   'Flatbed Trailer 40ft',         'Logistics Fleet', 'InTransit',           'Lagos Terminal',         26,  30,             'tonnes',       100,         FALSE, 60, 6.452900,           3.390400),
      ('ENS-LOS-FORK-005',   'Forklift 5t',                  'Lifting',         'Operational',         'Lagos Terminal',         52,  5,              'tonnes',       46,          FALSE, 60, 6.452000,           3.389300),
      ('ENS-LOS-CONT-020',   'Container Reefer Unit',        'Storage',         'Decommissioned',      'Lagos Terminal',         400, NULL,           NULL,           0,           FALSE, 180, 6.451500,          3.391000),
      ('ENS-WAR-TURB-001',   'Gas Turbine Package',          'Turbine',         'Operational',         'Warri Depot',            15,  5000,           'kW',           88,          TRUE,  90, 5.516700,           5.750000),
      ('ENS-WAR-TURB-002',   'Gas Turbine Package (Standby)','Turbine',         'MaintenanceRequired', 'Warri Depot',            112, 5000,           'kW',           0,           TRUE,  90, 5.517000,           5.750500),
      ('ENS-WAR-COMP-004',   'Air Compressor Unit',          'Compression',     'Operational',         'Warri Depot',            61,  350,            'kW',           54,          FALSE, 90, 5.516300,           5.749600),
      ('ENS-WAR-FLEET-09',   'Crew Transport Bus',           'Logistics Fleet', 'InTransit',           'Warri Depot',            22,  30,             'seats',        100,         FALSE, 45, 5.516000,           5.751000),
      ('ENS-OBG-RIG-001',    'Workover Rig',                 'Drill Equipment', 'Operational',         'Obagi Field Location',   35,  250,            'tonnes',       77,          TRUE,  60, 5.356000,           6.612000),
      ('ENS-OBG-PUMP-011',   'Wellhead Injection Pump',      'Pumping',         'Operational',         'Obagi Field Location',   28,  300,            'm3/h',         63,          TRUE,  60, 5.356400,           6.612500),
      ('ENS-OBG-GEN-003',    'Field Generator 100kVA',       'Power Systems',   'Operational',         'Obagi Field Location',   70,  100,            'kVA',          92,          FALSE, 60, 5.355800,           6.611600),
      ('ENS-OBG-SEP-001',    'Three-Phase Separator',        'Process',         'MaintenanceRequired', 'Obagi Field Location',   130, 15000,          'bbl/day',      0,           TRUE,  120, 5.356700,          6.612900),
      ('ENS-BON-TANK-010',   'Export Storage Tank 10',       'Storage',         'Operational',         'Bonny Island Terminal',  44,  50000,          'bbl',          69,          TRUE,  180, 4.431000,          7.165000),
      ('ENS-BON-PIPE-001',   'Export Pipeline Manifold',     'Process',         'Operational',         'Bonny Island Terminal',  9,   NULL,           NULL,           74,          TRUE,  90, 4.431400,           7.165600),
      ('ENS-BON-GEN-004',    'Terminal Backup Generator',    'Power Systems',   'Decommissioned',      'Bonny Island Terminal',  300, 750,            'kVA',          0,           FALSE, 90, 4.430700,           7.164400)
    ) AS v(tag, name, category, status, location, inspected_days_ago, cap, unit, util, critical,
           interval_days, lat, lon)
    ON CONFLICT (asset_tag) DO NOTHING;

    -- 3. LOGISTICS REQUESTS, each with its audit history ----------------
    -- asset tag, requester email, decider email, origin, destination, status, priority,
    -- days since raised, days until departure (from now), days until arrival, note
    FOR r IN
        SELECT * FROM (VALUES
          ('ENS-PH-GEN-001',   'e.okon@enersync.corp',    NULL::text,                'Port Harcourt Hub',     'Obagi Field Location',  'Pending',   'High',     1,  2,  3,  'Urgent deployment required for emergency power backup.'::text),
          ('ENS-WAR-TURB-001', 'e.okon@enersync.corp',    NULL,                      'Warri Depot',           'Bonny Island Terminal', 'Pending',   'Critical', 0,  1,  2,  'Standby power needed before the scheduled terminal shutdown.'),
          ('ENS-LOS-FORK-005', 'a.bello@enersync.corp',   NULL,                      'Lagos Terminal',        'Warri Depot',           'Pending',   'Low',      2,  7,  9,  'Routine rebalancing of lifting equipment.'),
          ('ENS-ABJ-FLEET-14', 'a.bello@enersync.corp',   'a.bello@enersync.corp',   'Abuja HQ',              'Port Harcourt Hub',     'Approved',  'Normal',   3,  1,  4,  'Haul truck for the quarterly spares run.'),
          ('ENS-LOS-FLEET-03', 'e.okon@enersync.corp',    'a.bello@enersync.corp',   'Lagos Terminal',        'Port Harcourt Hub',     'Approved',  'High',     4, -1,  2,  'Trailer is on the road with the pump skid load.'),
          ('ENS-WAR-FLEET-09', 'e.okon@enersync.corp',    'i.nwosu@enersync.corp',   'Warri Depot',           'Obagi Field Location',  'Approved',  'Normal',   5, -1,  1,  'Crew change for the workover campaign.'),
          ('ENS-OBG-PUMP-011', 'e.okon@enersync.corp',    'a.bello@enersync.corp',   'Obagi Field Location',  'Port Harcourt Hub',     'Completed', 'Normal',   18, -16, -14, 'Returned for seal replacement. Delivered and signed off.'),
          ('ENS-PH-TANK-003',  'a.bello@enersync.corp',   'i.nwosu@enersync.corp',   'Port Harcourt Hub',     'Bonny Island Terminal', 'Completed', 'Low',      25, -22, -20, 'Tank inspection kit moved with the asset.'),
          ('ENS-PH-GEN-002',   'e.okon@enersync.corp',    'a.bello@enersync.corp',   'Port Harcourt Hub',     'Warri Depot',           'Completed', 'High',     30, -27, -25, 'Backup power for the Warri turbine overhaul.'),
          ('ENS-OBG-GEN-003',  'e.okon@enersync.corp',    'a.bello@enersync.corp',   'Obagi Field Location',  'Abuja HQ',              'Rejected',  'Low',      9,  -6, -4,  'Rejected: the generator is still needed on site.'),
          ('ENS-LOS-CRANE-001','a.bello@enersync.corp',   'i.nwosu@enersync.corp',   'Lagos Terminal',        'Bonny Island Terminal', 'Rejected',  'Normal',   14, -10, -8, 'Rejected: the crane exceeds the road load limit on this route.'),
          ('ENS-BON-PIPE-001', 'a.bello@enersync.corp',   'a.bello@enersync.corp',   'Bonny Island Terminal', 'Warri Depot',           'Completed', 'Critical', 40, -38, -37, 'Manifold spool piece sent for pressure testing.')
        ) AS v(tag, requester, decider, origin, destination, status, priority, days_ago, depart_in, arrive_in, note)
    LOOP
        SELECT asset_id INTO asset_row_id FROM assets WHERE asset_tag = r.tag;
        SELECT user_id  INTO requester_id FROM users  WHERE email = r.requester;
        SELECT user_id  INTO decider_id   FROM users  WHERE email = r.decider;
        created_time := CURRENT_TIMESTAMP - make_interval(days => r.days_ago);

        INSERT INTO logistics_requests (asset_id, requested_by, approved_by, origin, destination, status,
                                        priority, departure_date, estimated_arrival_date, notes,
                                        created_at, updated_at)
        VALUES (asset_row_id, requester_id,
                -- approved_by is filled only for requests that were approved (as the API does)
                CASE WHEN r.status IN ('Approved', 'Completed') THEN decider_id END,
                r.origin, r.destination, r.status::request_status, r.priority::request_priority,
                CURRENT_TIMESTAMP + make_interval(days => r.depart_in),
                CURRENT_TIMESTAMP + make_interval(days => r.arrive_in),
                r.note, created_time,
                CASE WHEN r.status = 'Pending' THEN created_time
                     ELSE created_time + INTERVAL '4 hours' END)
        RETURNING request_id INTO rid;

        -- The audit row for raising the request
        INSERT INTO audit_logs (user_id, action_type, table_name, record_id, old_value, new_value,
                                ip_address, created_at)
        VALUES (requester_id, 'REQUEST_CREATED', 'logistics_requests', rid, NULL,
                jsonb_build_object('request_id', rid, 'asset_id', asset_row_id, 'origin', r.origin,
                                   'destination', r.destination, 'status', 'Pending',
                                   'priority', r.priority),
                '127.0.0.1', created_time);

        -- The audit rows for each later step
        IF r.status IN ('Approved', 'Completed') THEN
            INSERT INTO audit_logs (user_id, action_type, table_name, record_id, old_value, new_value,
                                    ip_address, created_at)
            VALUES (decider_id, 'REQUEST_APPROVED', 'logistics_requests', rid,
                    jsonb_build_object('request_id', rid, 'origin', r.origin,
                                       'destination', r.destination, 'status', 'Pending',
                                       'approved_by', NULL, 'priority', r.priority),
                    jsonb_build_object('request_id', rid, 'origin', r.origin,
                                       'destination', r.destination, 'status', 'Approved',
                                       'approved_by', decider_id, 'priority', r.priority),
                    '127.0.0.1', created_time + INTERVAL '4 hours');
        END IF;

        IF r.status = 'Completed' THEN
            INSERT INTO audit_logs (user_id, action_type, table_name, record_id, old_value, new_value,
                                    ip_address, created_at)
            VALUES (decider_id, 'REQUEST_COMPLETED', 'logistics_requests', rid,
                    jsonb_build_object('request_id', rid, 'origin', r.origin,
                                       'destination', r.destination, 'status', 'Approved',
                                       'approved_by', decider_id, 'priority', r.priority),
                    jsonb_build_object('request_id', rid, 'origin', r.origin,
                                       'destination', r.destination, 'status', 'Completed',
                                       'approved_by', decider_id, 'priority', r.priority),
                    '127.0.0.1', created_time + INTERVAL '2 days');
        END IF;

        IF r.status = 'Rejected' THEN
            INSERT INTO audit_logs (user_id, action_type, table_name, record_id, old_value, new_value,
                                    ip_address, created_at)
            VALUES (decider_id, 'REQUEST_REJECTED', 'logistics_requests', rid,
                    jsonb_build_object('request_id', rid, 'origin', r.origin,
                                       'destination', r.destination, 'status', 'Pending',
                                       'approved_by', NULL, 'priority', r.priority),
                    jsonb_build_object('request_id', rid, 'origin', r.origin,
                                       'destination', r.destination, 'status', 'Rejected',
                                       'approved_by', NULL, 'priority', r.priority),
                    '127.0.0.1', created_time + INTERVAL '4 hours');
        END IF;
    END LOOP;

    -- 4. AUDIT HISTORY for users and assets -----------------------------
    -- When the demo users were added
    INSERT INTO audit_logs (user_id, action_type, table_name, record_id, old_value, new_value,
                            ip_address, created_at)
    SELECT admin_id, 'USER_CREATED', 'users', u.user_id, NULL,
           jsonb_build_object('user_id', u.user_id, 'first_name', u.first_name,
                              'last_name', u.last_name, 'role', u.role::text,
                              'location', u.location, 'is_active', TRUE),
           '127.0.0.1', CURRENT_TIMESTAMP - INTERVAL '61 days'
    FROM users u
    WHERE u.email IN ('a.bello@enersync.corp', 'e.okon@enersync.corp', 't.adebayo@enersync.corp');

    -- When the demo assets were registered
    INSERT INTO audit_logs (user_id, action_type, table_name, record_id, old_value, new_value,
                            ip_address, created_at)
    SELECT manager_id, 'ASSET_CREATED', 'assets', a.asset_id, NULL,
           jsonb_build_object('asset_id', a.asset_id, 'asset_tag', a.asset_tag, 'name', a.name,
                              'category', a.category, 'status', 'Operational',
                              'current_location', a.current_location),
           '127.0.0.1', a.created_at
    FROM assets a
    WHERE a.created_at = CURRENT_TIMESTAMP - INTERVAL '60 days';  -- only the assets added above

    -- Assets that were sent for maintenance: the status changed from Operational
    INSERT INTO audit_logs (user_id, action_type, table_name, record_id, old_value, new_value,
                            ip_address, created_at)
    SELECT manager_id, 'ASSET_UPDATED', 'assets', a.asset_id,
           jsonb_build_object('asset_tag', a.asset_tag, 'status', 'Operational'),
           jsonb_build_object('asset_tag', a.asset_tag, 'status', a.status::text),
           '127.0.0.1', CURRENT_TIMESTAMP - INTERVAL '8 days'
    FROM assets a
    WHERE a.status IN ('MaintenanceRequired', 'Decommissioned')
      AND a.created_at = CURRENT_TIMESTAMP - INTERVAL '60 days';

    RAISE NOTICE 'Demo data loaded.';
END
$$;
