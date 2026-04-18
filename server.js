// ============================================================
// AgroSense Smart Farming — Backend API
// Stack: Node.js + Express + SQLite (via better-sqlite3)
// Run:  npm install && node server.js
// ============================================================

const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_DIR  = path.join(__dirname, 'data');
const DB_PATH = path.join(DB_DIR, 'agrosense.db');

// Auto-create data directory if it doesn't exist
const fs = require('fs');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

// ---- Middleware ----
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// ---- DB Connection ----
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');   // faster writes
db.pragma('foreign_keys = ON');

// ---- DB Schema Init ----
db.exec(`
  CREATE TABLE IF NOT EXISTS sensors (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    sensor_id  TEXT UNIQUE NOT NULL,
    zone       TEXT NOT NULL,
    type       TEXT NOT NULL,    -- 'soil_moisture' | 'temperature' | 'humidity' | 'light'
    location_x INTEGER,
    location_y INTEGER,
    battery    INTEGER DEFAULT 100,
    active     INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS readings (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    sensor_id    TEXT NOT NULL,
    moisture     REAL,
    temperature  REAL,
    humidity     REAL,
    light_lux    REAL,
    recorded_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sensor_id) REFERENCES sensors(sensor_id)
  );

  CREATE TABLE IF NOT EXISTS irrigation_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    zone        TEXT NOT NULL,
    pump_id     TEXT NOT NULL,
    started_at  DATETIME NOT NULL,
    ended_at    DATETIME,
    litres_used REAL,
    trigger     TEXT DEFAULT 'manual',  -- 'manual' | 'auto' | 'scheduled'
    status      TEXT DEFAULT 'running'  -- 'running' | 'completed' | 'failed'
  );

  CREATE TABLE IF NOT EXISTS devices (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id  TEXT UNIQUE NOT NULL,
    name       TEXT NOT NULL,
    type       TEXT NOT NULL,   -- 'pump' | 'valve' | 'sprinkler'
    zone       TEXT,
    is_on      INTEGER DEFAULT 0,
    mode       TEXT DEFAULT 'manual',  -- 'manual' | 'auto' | 'scheduled'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS alerts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    sensor_id   TEXT,
    zone        TEXT,
    alert_type  TEXT NOT NULL,  -- 'low_moisture' | 'high_temp' | 'low_battery' | 'sensor_offline'
    severity    TEXT DEFAULT 'warning',  -- 'info' | 'warning' | 'critical'
    message     TEXT NOT NULL,
    resolved    INTEGER DEFAULT 0,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME
  );

  CREATE TABLE IF NOT EXISTS thresholds (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    zone            TEXT DEFAULT 'global',
    moisture_min    REAL DEFAULT 40.0,
    moisture_max    REAL DEFAULT 80.0,
    temp_max        REAL DEFAULT 35.0,
    humidity_min    REAL DEFAULT 50.0,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ---- Seed Sample Data (idempotent) ----
const sensorCount = db.prepare('SELECT COUNT(*) as c FROM sensors').get().c;
if (sensorCount === 0) {
  const insertSensor = db.prepare(`
    INSERT OR IGNORE INTO sensors (sensor_id, zone, type, location_x, location_y, battery)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const sensors = [
    ['S-01','Zone 01','multi',0,0,100],
    ['S-02','Zone 02','multi',1,0,95],
    ['S-03','Zone 03','multi',2,0,88],
    ['S-04','Zone 04','multi',3,0,72],
    ['S-08','Zone 08','multi',2,1,12],
    ['S-09','Zone 09','multi',3,1,90],
    ['S-10','Zone 10','multi',4,1,85],
    ['S-14','Zone 14','multi',3,2,60],
  ];
  sensors.forEach(s => insertSensor.run(...s));

  const insertReading = db.prepare(`
    INSERT INTO readings (sensor_id, moisture, temperature, humidity, light_lux, recorded_at)
    VALUES (?, ?, ?, ?, ?, datetime('now', ? || ' minutes'))
  `);
  sensors.forEach(([sid]) => {
    for (let i = 0; i < 48; i++) {
      insertReading.run(
        sid,
        Math.floor(Math.random() * 60 + 20),
        Math.floor(Math.random() * 12 + 28),
        Math.floor(Math.random() * 30 + 50),
        Math.floor(Math.random() * 500 + 600),
        `-${i * 30}`
      );
    }
  });

  const insertDevice = db.prepare(`
    INSERT OR IGNORE INTO devices (device_id, name, type, zone, is_on, mode)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  [
    ['PUMP-01','Main Pump','pump','All',1,'auto'],
    ['VALVE-01','Drip Valve A','valve','Zone 01',0,'scheduled'],
    ['SPRK-01','Sprinkler Zone A','sprinkler','Zone A',1,'auto'],
    ['SPRK-02','Sprinkler Zone B','sprinkler','Zone B',0,'manual'],
  ].forEach(d => insertDevice.run(...d));

  db.prepare(`INSERT OR IGNORE INTO thresholds (zone, moisture_min, moisture_max, temp_max, humidity_min)
              VALUES ('global', 40, 80, 35, 50)`).run();
}


// ======================================================
// ---- API ROUTES ----
// ======================================================

// GET /api/health
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
});


// ---- SENSORS ----

// GET /api/sensors — list all sensors
app.get('/api/sensors', (req, res) => {
  const sensors = db.prepare(`
    SELECT s.*,
      r.moisture, r.temperature, r.humidity, r.light_lux, r.recorded_at as last_reading
    FROM sensors s
    LEFT JOIN readings r ON r.id = (
      SELECT id FROM readings WHERE sensor_id = s.sensor_id ORDER BY recorded_at DESC LIMIT 1
    )
    WHERE s.active = 1
    ORDER BY s.sensor_id
  `).all();
  res.json({ success: true, data: sensors });
});

// GET /api/sensors/:id — single sensor + last N readings
app.get('/api/sensors/:id', (req, res) => {
  const sensor = db.prepare('SELECT * FROM sensors WHERE sensor_id = ?').get(req.params.id);
  if (!sensor) return res.status(404).json({ error: 'Sensor not found' });
  const history = db.prepare(
    'SELECT * FROM readings WHERE sensor_id = ? ORDER BY recorded_at DESC LIMIT 100'
  ).all(req.params.id);
  res.json({ success: true, data: { sensor, history } });
});

// POST /api/sensors — register a new sensor
app.post('/api/sensors', (req, res) => {
  const { sensor_id, zone, type, location_x, location_y } = req.body;
  if (!sensor_id || !zone || !type) {
    return res.status(400).json({ error: 'sensor_id, zone, and type are required' });
  }
  try {
    db.prepare(
      'INSERT INTO sensors (sensor_id, zone, type, location_x, location_y) VALUES (?, ?, ?, ?, ?)'
    ).run(sensor_id, zone, type, location_x || 0, location_y || 0);
    res.status(201).json({ success: true, message: `Sensor ${sensor_id} registered` });
  } catch (err) {
    res.status(409).json({ error: 'Sensor ID already exists' });
  }
});


// ---- READINGS ----

// POST /api/readings — ingest sensor data
app.post('/api/readings', (req, res) => {
  const { sensor_id, moisture, temperature, humidity, light_lux } = req.body;
  if (!sensor_id) return res.status(400).json({ error: 'sensor_id is required' });

  const sensor = db.prepare('SELECT * FROM sensors WHERE sensor_id = ?').get(sensor_id);
  if (!sensor) return res.status(404).json({ error: 'Sensor not found' });

  db.prepare(
    'INSERT INTO readings (sensor_id, moisture, temperature, humidity, light_lux) VALUES (?, ?, ?, ?, ?)'
  ).run(sensor_id, moisture, temperature, humidity, light_lux);

  // ---- Auto-alert logic ----
  const thresh = db.prepare("SELECT * FROM thresholds WHERE zone = 'global'").get();
  const alerts = [];

  if (moisture !== undefined && moisture < thresh.moisture_min) {
    alerts.push({
      sensor_id, zone: sensor.zone,
      alert_type: 'low_moisture', severity: moisture < 25 ? 'critical' : 'warning',
      message: `Zone ${sensor.zone}: Moisture critically low at ${moisture}%`
    });
  }
  if (temperature !== undefined && temperature > thresh.temp_max) {
    alerts.push({
      sensor_id, zone: sensor.zone,
      alert_type: 'high_temp', severity: 'warning',
      message: `Zone ${sensor.zone}: High temperature ${temperature}°C detected`
    });
  }

  if (alerts.length > 0) {
    const insertAlert = db.prepare(
      'INSERT INTO alerts (sensor_id, zone, alert_type, severity, message) VALUES (?,?,?,?,?)'
    );
    alerts.forEach(a => insertAlert.run(a.sensor_id, a.zone, a.alert_type, a.severity, a.message));
  }

  res.status(201).json({ success: true, alerts_triggered: alerts.length });
});

// GET /api/readings/summary — dashboard summary
app.get('/api/readings/summary', (req, res) => {
  const summary = db.prepare(`
    SELECT
      AVG(moisture)    AS avg_moisture,
      AVG(temperature) AS avg_temperature,
      AVG(humidity)    AS avg_humidity,
      AVG(light_lux)   AS avg_light,
      MIN(moisture)    AS min_moisture,
      MAX(temperature) AS max_temperature,
      COUNT(DISTINCT sensor_id) AS active_sensors
    FROM readings
    WHERE recorded_at >= datetime('now', '-1 hour')
  `).get();
  res.json({ success: true, data: summary });
});

// GET /api/readings/history?sensor_id=X&hours=24
app.get('/api/readings/history', (req, res) => {
  const { sensor_id, hours = 24 } = req.query;
  let query = `
    SELECT * FROM readings
    WHERE recorded_at >= datetime('now', '-${parseInt(hours)} hours')
  `;
  const params = [];
  if (sensor_id) { query += ' AND sensor_id = ?'; params.push(sensor_id); }
  query += ' ORDER BY recorded_at DESC LIMIT 500';
  const data = db.prepare(query).all(...params);
  res.json({ success: true, data });
});


// ---- DEVICES ----

// GET /api/devices
app.get('/api/devices', (req, res) => {
  const devices = db.prepare('SELECT * FROM devices ORDER BY device_id').all();
  res.json({ success: true, data: devices });
});

// PATCH /api/devices/:id — toggle on/off or change mode
app.patch('/api/devices/:id', (req, res) => {
  const { is_on, mode } = req.body;
  const device = db.prepare('SELECT * FROM devices WHERE device_id = ?').get(req.params.id);
  if (!device) return res.status(404).json({ error: 'Device not found' });

  const updates = [];
  const vals = [];
  if (is_on !== undefined) { updates.push('is_on = ?'); vals.push(is_on ? 1 : 0); }
  if (mode !== undefined)  { updates.push('mode = ?'); vals.push(mode); }

  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

  vals.push(req.params.id);
  db.prepare(`UPDATE devices SET ${updates.join(', ')} WHERE device_id = ?`).run(...vals);

  // Log irrigation action
  if (is_on !== undefined && device.type === 'pump') {
    if (is_on) {
      db.prepare(
        "INSERT INTO irrigation_logs (zone, pump_id, started_at, trigger) VALUES (?, ?, datetime('now'), 'manual')"
      ).run(device.zone, req.params.id);
    } else {
      db.prepare(`
        UPDATE irrigation_logs SET ended_at = datetime('now'), status = 'completed', litres_used = ?
        WHERE pump_id = ? AND ended_at IS NULL
      `).run(Math.floor(Math.random() * 200 + 100), req.params.id);
    }
  }

  res.json({ success: true, device_id: req.params.id, is_on: !!is_on, mode });
});


// ---- ALERTS ----

// GET /api/alerts
app.get('/api/alerts', (req, res) => {
  const { resolved = 0, limit = 20 } = req.query;
  const alerts = db.prepare(
    'SELECT * FROM alerts WHERE resolved = ? ORDER BY created_at DESC LIMIT ?'
  ).all(parseInt(resolved), parseInt(limit));
  res.json({ success: true, data: alerts });
});

// PATCH /api/alerts/:id/resolve
app.patch('/api/alerts/:id/resolve', (req, res) => {
  db.prepare(
    "UPDATE alerts SET resolved = 1, resolved_at = datetime('now') WHERE id = ?"
  ).run(req.params.id);
  res.json({ success: true, message: 'Alert resolved' });
});


// ---- IRRIGATION LOGS ----

// GET /api/irrigation
app.get('/api/irrigation', (req, res) => {
  const logs = db.prepare(
    'SELECT * FROM irrigation_logs ORDER BY started_at DESC LIMIT 50'
  ).all();
  res.json({ success: true, data: logs });
});


// ---- THRESHOLDS ----

// GET /api/thresholds
app.get('/api/thresholds', (req, res) => {
  const t = db.prepare('SELECT * FROM thresholds').all();
  res.json({ success: true, data: t });
});

// PUT /api/thresholds/:zone
app.put('/api/thresholds/:zone', (req, res) => {
  const { moisture_min, moisture_max, temp_max, humidity_min } = req.body;
  const existing = db.prepare('SELECT * FROM thresholds WHERE zone = ?').get(req.params.zone);
  if (existing) {
    db.prepare(`
      UPDATE thresholds SET moisture_min=?, moisture_max=?, temp_max=?, humidity_min=?,
      updated_at=datetime('now') WHERE zone=?
    `).run(moisture_min, moisture_max, temp_max, humidity_min, req.params.zone);
  } else {
    db.prepare(
      'INSERT INTO thresholds (zone, moisture_min, moisture_max, temp_max, humidity_min) VALUES (?,?,?,?,?)'
    ).run(req.params.zone, moisture_min, moisture_max, temp_max, humidity_min);
  }
  res.json({ success: true, zone: req.params.zone });
});


// ---- 404 handler ----
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

// ---- Error handler ----
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`\n🌱 AgroSense API running at http://localhost:${PORT}`);
  console.log(`📊 Dashboard at http://localhost:${PORT}/`);
  console.log(`🔌 API base: http://localhost:${PORT}/api\n`);
});

module.exports = app;