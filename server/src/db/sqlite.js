import sqlite3 from "sqlite3";
import path from "path";
import { fileURLToPath } from "url";

sqlite3.verbose();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_DB_FILENAME = "saferide.db";

let activeDbPath = null;

let dbInstancePromise = null;

const nowIso = () => new Date().toISOString();

const resolveDbPath = (dbPathOverride = null) => {
  const configuredPath = dbPathOverride || process.env.SAFERIDE_DB_PATH || DEFAULT_DB_FILENAME;
  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(__dirname, "../../", configuredPath);
};

const getDb = async (dbPathOverride = null) => {
  const resolvedPath = resolveDbPath(dbPathOverride);

  if (activeDbPath && activeDbPath !== resolvedPath) {
    throw new Error(
      `SQLite connection already initialized with ${activeDbPath}. Close it before switching to ${resolvedPath}.`
    );
  }

  if (!dbInstancePromise) {
    activeDbPath = resolvedPath;
    dbInstancePromise = new Promise((resolve, reject) => {
      const db = new sqlite3.Database(resolvedPath, (error) => {
        if (error) {
          reject(new Error(`Failed to open SQLite database: ${error.message}`));
          return;
        }

        db.run("PRAGMA foreign_keys = ON", (pragmaError) => {
          if (pragmaError) {
            reject(new Error(`Failed to enable foreign keys: ${pragmaError.message}`));
            return;
          }
          resolve(db);
        });
      });
    });
  }

  return dbInstancePromise;
};

const runQuery = async (sql, params = []) => {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) {
        reject(new Error(`SQLite run error: ${error.message}`));
        return;
      }
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
};

const getOne = async (sql, params = []) => {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) {
        reject(new Error(`SQLite get error: ${error.message}`));
        return;
      }
      resolve(row ?? null);
    });
  });
};

const getAll = async (sql, params = []) => {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) {
        reject(new Error(`SQLite all error: ${error.message}`));
        return;
      }
      resolve(rows ?? []);
    });
  });
};

export const initDatabase = async ({ dbPath = null } = {}) => {
  await getDb(dbPath);

  await runQuery(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL CHECK (role IN ('driver', 'passenger')),
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1))
    )
  `);

  await runQuery(`
    CREATE TABLE IF NOT EXISTS driver_profiles (
      driver_id INTEGER PRIMARY KEY,
      license_number TEXT NOT NULL,
      vehicle_number TEXT NOT NULL,
      fatigue_threshold REAL NOT NULL DEFAULT 0.7,
      distraction_threshold REAL NOT NULL DEFAULT 0.7,
      FOREIGN KEY (driver_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await runQuery(`
    CREATE TABLE IF NOT EXISTS trips (
      trip_id INTEGER PRIMARY KEY AUTOINCREMENT,
      driver_id INTEGER NOT NULL,
      passenger_id INTEGER NOT NULL,
      start_lat REAL NOT NULL,
      start_lng REAL NOT NULL,
      end_lat REAL NOT NULL,
      end_lng REAL NOT NULL,
      expected_route TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      start_time TEXT NOT NULL,
      end_time TEXT,
      FOREIGN KEY (driver_id) REFERENCES users(id) ON DELETE RESTRICT,
      FOREIGN KEY (passenger_id) REFERENCES users(id) ON DELETE RESTRICT
    )
  `);

  await runQuery(`
    CREATE TABLE IF NOT EXISTS risk_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id INTEGER NOT NULL,
      timestamp TEXT NOT NULL,
      fatigue_score REAL NOT NULL,
      distraction_score REAL NOT NULL,
      route_deviation_score REAL NOT NULL,
      combined_risk REAL NOT NULL,
      FOREIGN KEY (trip_id) REFERENCES trips(trip_id) ON DELETE CASCADE
    )
  `);

  await runQuery(`
    CREATE TABLE IF NOT EXISTS alerts (
      alert_id INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      level TEXT NOT NULL,
      triggered_at TEXT NOT NULL,
      action_taken TEXT,
      FOREIGN KEY (trip_id) REFERENCES trips(trip_id) ON DELETE CASCADE
    )
  `);

  await runQuery(`
    CREATE TABLE IF NOT EXISTS emergency_events (
      event_id INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id INTEGER NOT NULL,
      triggered_by TEXT NOT NULL,
      location_lat REAL NOT NULL,
      location_lng REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      FOREIGN KEY (trip_id) REFERENCES trips(trip_id) ON DELETE CASCADE
    )
  `);

  await runQuery(`
    CREATE TABLE IF NOT EXISTS garage_cache (
      garage_id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      last_updated TEXT NOT NULL
    )
  `);

  return { dbPath: activeDbPath };
};

export const getDatabasePath = () => activeDbPath || resolveDbPath();

export const createUser = async ({ role, name, phone, verified = false }) => {
  if (!role || !name || !phone) {
    throw new Error("createUser requires role, name, and phone");
  }

  const normalizedRole = String(role).toLowerCase();
  if (normalizedRole !== "driver" && normalizedRole !== "passenger") {
    throw new Error("role must be either 'driver' or 'passenger'");
  }

  const result = await runQuery(
    `INSERT INTO users (role, name, phone, verified) VALUES (?, ?, ?, ?)`,
    [normalizedRole, name, phone, verified ? 1 : 0]
  );

  return getOne(`SELECT id, role, name, phone, verified FROM users WHERE id = ?`, [result.lastID]);
};

export const startTrip = async ({
  driverId,
  passengerId,
  startLat,
  startLng,
  endLat,
  endLng,
  expectedRoute = null,
  status = "active",
  startTime = nowIso(),
  endTime = null,
}) => {
  if (!driverId || !passengerId) {
    throw new Error("startTrip requires driverId and passengerId");
  }

  const result = await runQuery(
    `INSERT INTO trips (
      driver_id, passenger_id, start_lat, start_lng, end_lat, end_lng,
      expected_route, status, start_time, end_time
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      driverId,
      passengerId,
      startLat,
      startLng,
      endLat,
      endLng,
      expectedRoute,
      status,
      startTime,
      endTime,
    ]
  );

  return getOne(`SELECT * FROM trips WHERE trip_id = ?`, [result.lastID]);
};

export const insertRiskLog = async ({
  tripId,
  fatigueScore,
  distractionScore,
  routeDeviationScore,
  combinedRisk,
  timestamp = nowIso(),
}) => {
  if (!tripId) {
    throw new Error("insertRiskLog requires tripId");
  }

  const result = await runQuery(
    `INSERT INTO risk_logs (
      trip_id, timestamp, fatigue_score, distraction_score, route_deviation_score, combined_risk
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    [tripId, timestamp, fatigueScore, distractionScore, routeDeviationScore, combinedRisk]
  );

  return getOne(`SELECT * FROM risk_logs WHERE id = ?`, [result.lastID]);
};

export const triggerAlert = async ({
  tripId,
  type,
  level,
  actionTaken = null,
  triggeredAt = nowIso(),
}) => {
  if (!tripId || !type || !level) {
    throw new Error("triggerAlert requires tripId, type, and level");
  }

  const result = await runQuery(
    `INSERT INTO alerts (trip_id, type, level, triggered_at, action_taken) VALUES (?, ?, ?, ?, ?)`,
    [tripId, type, level, triggeredAt, actionTaken]
  );

  return getOne(`SELECT * FROM alerts WHERE alert_id = ?`, [result.lastID]);
};

export const triggerEmergencyEvent = async ({
  tripId,
  triggeredBy,
  locationLat,
  locationLng,
  status = "open",
}) => {
  if (!tripId || !triggeredBy) {
    throw new Error("triggerEmergencyEvent requires tripId and triggeredBy");
  }

  const result = await runQuery(
    `INSERT INTO emergency_events (trip_id, triggered_by, location_lat, location_lng, status)
     VALUES (?, ?, ?, ?, ?)`,
    [tripId, triggeredBy, locationLat, locationLng, status]
  );

  return getOne(`SELECT * FROM emergency_events WHERE event_id = ?`, [result.lastID]);
};

export const upsertGarage = async ({ garageId, name, phone = null, lat, lng, lastUpdated = nowIso() }) => {
  if (!garageId || !name) {
    throw new Error("upsertGarage requires garageId and name");
  }

  await runQuery(
    `INSERT INTO garage_cache (garage_id, name, phone, lat, lng, last_updated)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(garage_id) DO UPDATE SET
      name = excluded.name,
      phone = excluded.phone,
      lat = excluded.lat,
      lng = excluded.lng,
      last_updated = excluded.last_updated`,
    [garageId, name, phone, lat, lng, lastUpdated]
  );

  return getOne(`SELECT * FROM garage_cache WHERE garage_id = ?`, [garageId]);
};

export const fetchNearbyGarages = async ({ lat, lng, radiusKm = 5, limit = 10 }) => {
  if (lat === undefined || lng === undefined) {
    throw new Error("fetchNearbyGarages requires lat and lng");
  }

  return getAll(
    `SELECT *
     FROM (
       SELECT
         garage_id,
         name,
         phone,
         lat,
         lng,
         last_updated,
         (
           6371 * ACOS(
             COS(RADIANS(?)) * COS(RADIANS(lat)) * COS(RADIANS(lng) - RADIANS(?)) +
             SIN(RADIANS(?)) * SIN(RADIANS(lat))
           )
         ) AS distance_km
       FROM garage_cache
     ) AS distance_table
     WHERE distance_km <= ?
     ORDER BY distance_km ASC
     LIMIT ?`,
    [lat, lng, lat, radiusKm, limit]
  );
};

export const closeDatabase = async () => {
  if (!dbInstancePromise) {
    return;
  }

  const db = await dbInstancePromise;
  await new Promise((resolve, reject) => {
    db.close((error) => {
      if (error) {
        reject(new Error(`Failed to close SQLite database: ${error.message}`));
        return;
      }
      resolve();
    });
  });

  dbInstancePromise = null;
  activeDbPath = null;
};
