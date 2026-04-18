-- ============================================================
-- AgroSense Smart Farming — Database Schema
-- Engine: SQLite (production: PostgreSQL compatible)
-- File:   agrosense_schema.sql
-- ============================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ============================================================
-- TABLE: sensors
-- Represents each physical sensor node deployed in the field
-- ============================================================
CREATE TABLE IF NOT EXISTS sensors (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    sensor_id   TEXT UNIQUE NOT NULL,          -- e.g. "S-01"
    zone        TEXT NOT NULL,                 -- e.g. "Zone 01"
    type        TEXT NOT NULL                  -- 'multi' | 'soil_moisture' | 'temperature'
                CHECK (type IN ('multi','soil_moisture','temperature','humidity','light')),
    location_x  INTEGER DEFAULT 0,             -- Grid column (0-indexed)
    location_y  INTEGER DEFAULT 0,             -- Grid row (0-indexed)
    battery     INTEGER DEFAULT 100            -- Battery % (0-100)
                CHECK (battery BETWEEN 0 AND 100),
    active      INTEGER DEFAULT 1              -- 1=active, 0=decommissioned
                CHECK (active IN (0, 1)),
    description TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sensors_zone ON sensors(zone);
CREATE INDEX IF NOT EXISTS idx_sensors_active ON sensors(active);


-- ============================================================
-- TABLE: readings
-- Time-series sensor readings (core data table)
-- ============================================================
CREATE TABLE IF NOT EXISTS readings (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    sensor_id    TEXT NOT NULL,
    moisture     REAL CHECK (moisture BETWEEN 0 AND 100),     -- % volumetric
    temperature  REAL CHECK (temperature BETWEEN -20 AND 60), -- °C
    humidity     REAL CHECK (humidity BETWEEN 0 AND 100),     -- % relative
    light_lux    REAL CHECK (light_lux >= 0),                 -- lux
    recorded_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sensor_id) REFERENCES sensors(sensor_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_readings_sensor_time ON readings(sensor_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_readings_recorded_at ON readings(recorded_at DESC);


-- ============================================================
-- TABLE: devices
-- Controllable field devices (pumps, valves, sprinklers)
-- ============================================================
CREATE TABLE IF NOT EXISTS devices (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id   TEXT UNIQUE NOT NULL,          -- e.g. "PUMP-01"
    name        TEXT NOT NULL,
    type        TEXT NOT NULL
                CHECK (type IN ('pump','valve','sprinkler','fan','light')),
    zone        TEXT,
    is_on       INTEGER DEFAULT 0
                CHECK (is_on IN (0, 1)),
    mode        TEXT DEFAULT 'manual'
                CHECK (mode IN ('manual','auto','scheduled')),
    schedule    TEXT,                          -- JSON: {"days":["Mon"],"time":"06:00","duration":30}
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_devices_zone ON devices(zone);
CREATE INDEX IF NOT EXISTS idx_devices_type ON devices(type);


-- ============================================================
-- TABLE: irrigation_logs
-- Every pump/irrigation cycle is logged here
-- ============================================================
CREATE TABLE IF NOT EXISTS irrigation_logs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    zone         TEXT NOT NULL,
    pump_id      TEXT NOT NULL,
    started_at   DATETIME NOT NULL,
    ended_at     DATETIME,
    duration_sec INTEGER,                      -- computed on close
    litres_used  REAL,
    trigger      TEXT DEFAULT 'manual'
                 CHECK (trigger IN ('manual','auto','scheduled','weather')),
    status       TEXT DEFAULT 'running'
                 CHECK (status IN ('running','completed','failed','aborted')),
    notes        TEXT,
    FOREIGN KEY (pump_id) REFERENCES devices(device_id)
);

CREATE INDEX IF NOT EXISTS idx_irr_pump  ON irrigation_logs(pump_id);
CREATE INDEX IF NOT EXISTS idx_irr_zone  ON irrigation_logs(zone);
CREATE INDEX IF NOT EXISTS idx_irr_start ON irrigation_logs(started_at DESC);


-- ============================================================
-- TABLE: alerts
-- System-generated alerts from threshold violations
-- ============================================================
CREATE TABLE IF NOT EXISTS alerts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    sensor_id   TEXT,
    zone        TEXT,
    alert_type  TEXT NOT NULL
                CHECK (alert_type IN (
                  'low_moisture','high_moisture',
                  'high_temp','low_battery',
                  'sensor_offline','pump_failure',
                  'weather_warning'
                )),
    severity    TEXT DEFAULT 'warning'
                CHECK (severity IN ('info','warning','critical')),
    message     TEXT NOT NULL,
    resolved    INTEGER DEFAULT 0
                CHECK (resolved IN (0, 1)),
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME,
    resolved_by TEXT,                          -- user/system that resolved
    FOREIGN KEY (sensor_id) REFERENCES sensors(sensor_id)
);

CREATE INDEX IF NOT EXISTS idx_alerts_resolved   ON alerts(resolved, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_severity   ON alerts(severity);
CREATE INDEX IF NOT EXISTS idx_alerts_sensor     ON alerts(sensor_id);


-- ============================================================
-- TABLE: thresholds
-- Configurable alert thresholds per zone (or 'global')
-- ============================================================
CREATE TABLE IF NOT EXISTS thresholds (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    zone          TEXT UNIQUE DEFAULT 'global',
    moisture_min  REAL DEFAULT 40.0,           -- trigger irrigation below this
    moisture_max  REAL DEFAULT 80.0,           -- stop irrigation above this
    temp_max      REAL DEFAULT 35.0,           -- alert above this
    humidity_min  REAL DEFAULT 50.0,           -- alert below this
    updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- TABLE: users
-- Web dashboard authentication
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT UNIQUE NOT NULL,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,               -- bcrypt hash
    role          TEXT DEFAULT 'viewer'
                  CHECK (role IN ('admin','operator','viewer')),
    last_login    DATETIME,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- TABLE: audit_log
-- Tracks all configuration and device control actions
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER,
    action     TEXT NOT NULL,                  -- 'device.toggle' | 'threshold.update' etc.
    target     TEXT,                           -- device_id / sensor_id / zone
    payload    TEXT,                           -- JSON payload
    ip_address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log(created_at DESC);


-- ============================================================
-- VIEWS
-- ============================================================

-- Latest reading per sensor (fast dashboard load)
CREATE VIEW IF NOT EXISTS v_latest_readings AS
SELECT
    s.sensor_id,
    s.zone,
    s.battery,
    r.moisture,
    r.temperature,
    r.humidity,
    r.light_lux,
    r.recorded_at,
    CASE
        WHEN r.moisture < 30         THEN 'critical'
        WHEN r.moisture < 40         THEN 'warning'
        WHEN r.temperature > 37      THEN 'warning'
        WHEN s.battery < 15          THEN 'warning'
        ELSE 'ok'
    END AS status
FROM sensors s
LEFT JOIN readings r ON r.id = (
    SELECT id FROM readings
    WHERE sensor_id = s.sensor_id
    ORDER BY recorded_at DESC
    LIMIT 1
)
WHERE s.active = 1;


-- Field-wide aggregated summary (last 1 hour)
CREATE VIEW IF NOT EXISTS v_field_summary AS
SELECT
    COUNT(DISTINCT sensor_id)      AS active_sensors,
    ROUND(AVG(moisture), 1)        AS avg_moisture,
    ROUND(AVG(temperature), 1)     AS avg_temperature,
    ROUND(AVG(humidity), 1)        AS avg_humidity,
    ROUND(MIN(moisture), 1)        AS min_moisture,
    ROUND(MAX(temperature), 1)     AS max_temperature,
    COUNT(CASE WHEN moisture < 30 THEN 1 END) AS zones_dry,
    COUNT(CASE WHEN temperature > 35 THEN 1 END) AS zones_hot
FROM readings
WHERE recorded_at >= datetime('now', '-1 hour');


-- Daily irrigation totals
CREATE VIEW IF NOT EXISTS v_irrigation_daily AS
SELECT
    DATE(started_at) AS date,
    zone,
    COUNT(*)          AS cycles,
    SUM(litres_used)  AS total_litres,
    SUM(duration_sec) AS total_seconds
FROM irrigation_logs
WHERE status = 'completed'
GROUP BY DATE(started_at), zone
ORDER BY date DESC;


-- ============================================================
-- SEED DATA — Default thresholds & demo devices
-- ============================================================

INSERT OR IGNORE INTO thresholds (zone, moisture_min, moisture_max, temp_max, humidity_min)
VALUES
    ('global',  40, 80, 35, 50),
    ('Zone 01', 45, 75, 34, 55),
    ('Zone 02', 40, 80, 35, 50),
    ('Zone 08', 35, 75, 36, 45);


INSERT OR IGNORE INTO sensors (sensor_id, zone, type, location_x, location_y, battery) VALUES
    ('S-01', 'Zone 01', 'multi', 0, 0, 100),
    ('S-02', 'Zone 02', 'multi', 1, 0, 95),
    ('S-03', 'Zone 03', 'multi', 2, 0, 88),
    ('S-04', 'Zone 04', 'multi', 3, 0, 72),
    ('S-05', 'Zone 05', 'multi', 4, 0, 91),
    ('S-06', 'Zone 06', 'multi', 0, 1, 85),
    ('S-07', 'Zone 07', 'multi', 1, 1, 79),
    ('S-08', 'Zone 08', 'multi', 2, 1, 12),
    ('S-09', 'Zone 09', 'multi', 3, 1, 90),
    ('S-10', 'Zone 10', 'multi', 4, 1, 85),
    ('S-11', 'Zone 11', 'multi', 0, 2, 68),
    ('S-12', 'Zone 12', 'multi', 1, 2, 74),
    ('S-13', 'Zone 13', 'multi', 2, 2, 83),
    ('S-14', 'Zone 14', 'multi', 3, 2, 60),
    ('S-15', 'Zone 15', 'multi', 4, 2, 77);


INSERT OR IGNORE INTO devices (device_id, name, type, zone, is_on, mode) VALUES
    ('PUMP-01',  'Main Pump',        'pump',      'All',     1, 'auto'),
    ('PUMP-02',  'Backup Pump',      'pump',      'All',     0, 'manual'),
    ('VALVE-01', 'Drip Valve A',     'valve',     'Zone A',  0, 'scheduled'),
    ('VALVE-02', 'Drip Valve B',     'valve',     'Zone B',  0, 'scheduled'),
    ('SPRK-01',  'Sprinkler A',      'sprinkler', 'Zone A',  1, 'auto'),
    ('SPRK-02',  'Sprinkler B',      'sprinkler', 'Zone B',  0, 'manual'),
    ('SPRK-03',  'Sprinkler C',      'sprinkler', 'Zone C',  0, 'manual');


-- Admin user (password: admin123 — change in production!)
INSERT OR IGNORE INTO users (username, email, password_hash, role)
VALUES ('admin', 'admin@agrosense.io',
        '$2b$10$examplehashreplacewithrealbcrypt', 'admin');


-- ============================================================
-- USEFUL QUERIES (reference)
-- ============================================================

-- Latest readings for all sensors:
-- SELECT * FROM v_latest_readings;

-- Field summary:
-- SELECT * FROM v_field_summary;

-- Active unresolved alerts:
-- SELECT * FROM alerts WHERE resolved = 0 ORDER BY severity DESC, created_at DESC;

-- Water used today:
-- SELECT zone, SUM(litres_used) FROM irrigation_logs
-- WHERE DATE(started_at) = DATE('now') AND status = 'completed'
-- GROUP BY zone;

-- Sensors needing battery replacement:
-- SELECT sensor_id, zone, battery FROM sensors WHERE battery < 20 AND active = 1;
