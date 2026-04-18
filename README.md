# 🌱 AgroSense — Smart Farming through Sensor Networks
**Batch 11 Field Project | A.Raghavendra · K.Srikanth · P.Mahathi · U.Hemanth**

---

## 📌 Project Overview
AgroSense is a full-stack IoT web application designed for real-time agricultural monitoring and automated irrigation control using wireless sensor networks. It empowers farmers with critical insights into soil moisture, temperature, and environmental conditions to optimize water usage and maximize crop yield.

---

## ⚙️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | HTML5, CSS3 (Glassmorphism UI), Vanilla JS |
| **Backend** | Node.js + Express.js |
| **Database** | SQLite via `better-sqlite3` (Local file-based) |
| **Protocol** | REST API (JSON) |
| **Hardware** | ESP8266/Arduino + DHT22 + Soil Moisture Sensors (Compatible) |

---

## 📁 Project Structure

The project is structured as a lightweight, single-folder application for easy deployment:

```
FP/
├── index.html        ← Main Frontend SPA (Login + Dashboard)
├── server.js         ← Express REST API & SQLite Backend Engine
├── package.json      ← Node.js Dependencies
└── data/
    └── agrosense.db  ← Auto-generated SQLite Database
```

---

## 🚀 Quick Start

Follow these steps to run the server and view the dashboard locally.

### 1. Install Dependencies & Run Backend
Open your terminal in the project folder and run:
```bash
npm install
node server.js
```
*Note: The server will automatically create the `data/` folder and initialize the SQLite database on first run.*

### 2. Open the Application
The backend serves the API and the frontend concurrently. Open your browser and navigate to:
👉 **[http://localhost:3000](http://localhost:3000)**

### 3. Demo Login Credentials
To access the dashboard past the Farmer Portal login page:
- **Email:** `farmer@agrosense.io`
- **Password:** `demo123`

---

## 📡 API Endpoints

### Sensors
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/sensors` | List all sensors with latest readings |
| GET | `/api/sensors/:id` | Single sensor + 100 reading history |
| POST | `/api/sensors` | Register new sensor node |

### Readings
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/readings` | Ingest sensor data (from hardware) |
| GET | `/api/readings/summary` | Aggregate field summary |
| GET | `/api/readings/history` | Time-series data with filters |

### Devices
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/devices` | List all controlled devices |
| PATCH | `/api/devices/:id` | Toggle pump/valve on or off |

### Alerts
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/alerts` | List unresolved alerts |
| PATCH | `/api/alerts/:id/resolve` | Mark alert as resolved |

---

## 🌟 Features Implemented
- ✅ **Farmer Login Portal** with secure session routing and glassmorphic UI
- ✅ **Real-time Sensor Dashboard** with live clocks and auto-refresh logic
- ✅ **20-zone Interactive Field Map** with moisture color coding (red = dry, blue = wet)
- ✅ **7-Day Analytics Bar Chart** (moisture + temperature history)
- ✅ **Device Toggle Controls** (Main Pump, Drip Valves, Sprinklers)
- ✅ **Auto-Alert Generation** on threshold breaches (e.g. Temperature > 36°C)
- ✅ **Full REST API** for hardware sensor ingestion
- ✅ **Node Battery Monitoring** interface

## 🛠️ Hardware Integration (ESP8266 Example)
If you intend to hook up physical sensors to this dashboard, here is a C++ sample for Arduino/ESP8266 to push data to the local server:
```cpp
// Arduino sensor POST to backend
void sendReading() {
  HTTPClient http;
  http.begin("http://YOUR_SERVER_IP:3000/api/readings");
  http.addHeader("Content-Type", "application/json");
  String body = "{\"sensor_id\":\"S-01\",\"moisture\":" 
                + String(soilMoisture) 
                + ",\"temperature\":" + String(temp)
                + ",\"humidity\":" + String(humidity) + "}";
  http.POST(body);
  http.end();
}
```

## 🔮 Future Enhancements
- 📱 React Native companion mobile app
- 🤖 ML-based irrigation prediction scheduling
- 🌦️ Public Weather API integration (skip irrigation forecasts)
- ☀️ Solar panel energy monitoring metrics

# 👨‍💻 Authors
- A. Raghavendra
- K. Srikanth
- P. Mahathi
- U. Hemanth