const express = require('express');
const cors = require('cors');
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

let db;
const dbPath = path.join(__dirname, 'data', 'agrosense.db');

// Initialize database
async function initDatabase() {
  const SQL = await initSqlJs();

  // Ensure data directory exists
  if (!fs.existsSync(path.join(__dirname, 'data'))) {
    fs.mkdirSync(path.join(__dirname, 'data'));
  }

  // Load existing database or create new one
  if (fs.existsSync(dbPath)) {
    const dbFile = fs.readFileSync(dbPath);
    db = new SQL.Database(dbFile);
    console.log('Existing database loaded');
  } else {
    db = new SQL.Database();
    console.log('New database created');

    // Create tables
    db.run(`CREATE TABLE IF NOT EXISTS sensors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sensor_id TEXT UNIQUE,
            name TEXT,
            type TEXT,
            zone INTEGER,
            status TEXT DEFAULT 'active',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

    db.run(`CREATE TABLE IF NOT EXISTS readings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sensor_id TEXT,
            moisture REAL,
            temperature REAL,
            humidity REAL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

    db.run(`CREATE TABLE IF NOT EXISTS devices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT UNIQUE,
            name TEXT,
            type TEXT,
            zone INTEGER,
            status TEXT DEFAULT 'off',
            last_toggled DATETIME
        )`);

    db.run(`CREATE TABLE IF NOT EXISTS alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sensor_id TEXT,
            parameter TEXT,
            value REAL,
            threshold REAL,
            message TEXT,
            resolved BOOLEAN DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

    // Insert sample sensors
    db.run(`INSERT OR IGNORE INTO sensors (sensor_id, name, type, zone) VALUES 
            ('S-01', 'North Field Sensor', 'soil_moisture', 1),
            ('S-02', 'East Field Sensor', 'soil_moisture', 2),
            ('S-03', 'South Field Sensor', 'temperature', 3),
            ('S-04', 'West Field Sensor', 'humidity', 4),
            ('S-05', 'Center Field Sensor', 'soil_moisture', 5),
            ('S-06', 'North-West Sensor', 'temperature', 1),
            ('S-07', 'South-East Sensor', 'humidity', 4),
            ('S-08', 'Irrigation Zone 1', 'soil_moisture', 1),
            ('S-09', 'Irrigation Zone 2', 'soil_moisture', 2),
            ('S-10', 'Weather Station', 'temperature', NULL)`);

    // Insert sample devices
    db.run(`INSERT OR IGNORE INTO devices (device_id, name, type, zone, status) VALUES 
            ('D-01', 'Main Pump', 'pump', NULL, 'off'),
            ('D-02', 'Drip Valve Zone 1', 'valve', 1, 'off'),
            ('D-03', 'Sprinkler Zone 2', 'sprinkler', 2, 'off'),
            ('D-04', 'Drip Valve Zone 3', 'valve', 3, 'off'),
            ('D-05', 'Sprinkler Zone 4', 'sprinkler', 4, 'off'),
            ('D-06', 'Drip Valve Zone 5', 'valve', 5, 'off')`);

    // Insert sample readings
    for (let i = 1; i <= 10; i++) {
      db.run(`INSERT INTO readings (sensor_id, moisture, temperature, humidity) VALUES 
                ('S-01', ${40 + Math.random() * 30}, ${25 + Math.random() * 10}, ${50 + Math.random() * 30}),
                ('S-02', ${40 + Math.random() * 30}, ${25 + Math.random() * 10}, ${50 + Math.random() * 30}),
                ('S-03', ${40 + Math.random() * 30}, ${25 + Math.random() * 10}, ${50 + Math.random() * 30})`);
    }

    console.log('Database tables and sample data created');
  }

  // Auto-save database every minute
  setInterval(() => {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
    console.log('Database auto-saved');
  }, 60000);
}

// Helper function to convert SQL results to JSON
function getRows(result) {
  if (!result || !result[0]) return [];
  const columns = result[0].columns;
  return result[0].values.map(row => {
    const obj = {};
    columns.forEach((col, idx) => {
      obj[col] = row[idx];
    });
    return obj;
  });
}

// API Routes
app.get('/api/sensors', (req, res) => {
  try {
    const result = db.exec("SELECT * FROM sensors");
    res.json(getRows(result));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/sensors/:id', (req, res) => {
  try {
    const sensor = db.exec(`SELECT * FROM sensors WHERE sensor_id = '${req.params.id}'`);
    const history = db.exec(`SELECT * FROM readings WHERE sensor_id = '${req.params.id}' ORDER BY timestamp DESC LIMIT 100`);

    res.json({
      sensor: getRows(sensor)[0] || null,
      history: getRows(history)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/sensors', (req, res) => {
  try {
    const { sensor_id, name, type, zone } = req.body;
    db.run(`INSERT INTO sensors (sensor_id, name, type, zone) VALUES (?, ?, ?, ?)`,
      [sensor_id, name, type, zone]);
    res.json({ success: true, message: 'Sensor registered' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/readings/summary', (req, res) => {
  try {
    const summary = db.exec(`
            SELECT 
                AVG(moisture) as avg_moisture,
                AVG(temperature) as avg_temperature,
                AVG(humidity) as avg_humidity
            FROM readings 
            WHERE timestamp >= datetime('now', '-1 hour')
        `);

    const result = getRows(summary)[0] || {};
    res.json({
      avg_moisture: Math.round(result.avg_moisture || 0),
      avg_temperature: Math.round(result.avg_temperature || 0),
      avg_humidity: Math.round(result.avg_humidity || 0)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/readings/history', (req, res) => {
  try {
    const { sensor_id, hours = 24 } = req.query;
    let query = `SELECT * FROM readings WHERE timestamp >= datetime('now', '-${hours} hours')`;
    if (sensor_id) {
      query += ` AND sensor_id = '${sensor_id}'`;
    }
    query += ` ORDER BY timestamp DESC`;

    const result = db.exec(query);
    res.json(getRows(result));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/readings', (req, res) => {
  try {
    const { sensor_id, moisture, temperature, humidity } = req.body;
    db.run(`INSERT INTO readings (sensor_id, moisture, temperature, humidity) VALUES (?, ?, ?, ?)`,
      [sensor_id, moisture, temperature, humidity]);

    // Check for alerts
    if (temperature && temperature > 36) {
      db.run(`INSERT INTO alerts (sensor_id, parameter, value, threshold, message) VALUES (?, ?, ?, ?, ?)`,
        [sensor_id, 'temperature', temperature, 36, `High temperature: ${temperature}°C`]);
    }
    if (moisture && moisture < 30) {
      db.run(`INSERT INTO alerts (sensor_id, parameter, value, threshold, message) VALUES (?, ?, ?, ?, ?)`,
        [sensor_id, 'moisture', moisture, 30, `Low moisture: ${moisture}%`]);
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/devices', (req, res) => {
  try {
    const result = db.exec("SELECT * FROM devices");
    res.json(getRows(result));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/devices/:id', (req, res) => {
  try {
    const { status } = req.body;
    db.run(`UPDATE devices SET status = ?, last_toggled = CURRENT_TIMESTAMP WHERE device_id = ?`,
      [status, req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/alerts', (req, res) => {
  try {
    const result = db.exec("SELECT * FROM alerts WHERE resolved = 0 ORDER BY created_at DESC");
    res.json(getRows(result));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/alerts/:id/resolve', (req, res) => {
  try {
    db.run(`UPDATE alerts SET resolved = 1 WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start server
initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
    console.log(`📊 Dashboard available at http://localhost:${PORT}`);
    console.log(`🌱 AgroSense IoT Platform Active`);
  });
}).catch(err => {
  console.error('Database initialization failed:', err);
  process.exit(1);
});
