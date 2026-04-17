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

const isDuplicateColumnError = (error) =>
  Boolean(error?.message && String(error.message).toLowerCase().includes("duplicate column name"));

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
    CREATE TABLE IF NOT EXISTS driver_onboarding (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      phone TEXT NOT NULL UNIQUE,
      driver_name TEXT NOT NULL,
      car_number TEXT NOT NULL,
      car_model TEXT NOT NULL,
      face_credential TEXT NOT NULL,
      face_registered INTEGER NOT NULL DEFAULT 0 CHECK (face_registered IN (0, 1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  try {
    await runQuery(`ALTER TABLE driver_onboarding ADD COLUMN face_image TEXT`);
  } catch (error) {
    if (!isDuplicateColumnError(error)) {
      throw error;
    }
  }

  await runQuery(`
    CREATE TABLE IF NOT EXISTS ride_otps (
      ride_id INTEGER PRIMARY KEY AUTOINCREMENT,
      otp_code TEXT NOT NULL UNIQUE,
      driver_phone TEXT NOT NULL,
      passenger_phone TEXT,
      status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'completed', 'cancelled')),
      source_label TEXT,
      destination_label TEXT,
      start_lat REAL,
      start_lng REAL,
      end_lat REAL,
      end_lng REAL,
      current_lat REAL,
      current_lng REAL,
      location_updated_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  try {
    await runQuery(`ALTER TABLE ride_otps ADD COLUMN end_lat REAL`);
  } catch (error) {
    if (!isDuplicateColumnError(error)) {
      throw error;
    }
  }

  try {
    await runQuery(`ALTER TABLE ride_otps ADD COLUMN end_lng REAL`);
  } catch (error) {
    if (!isDuplicateColumnError(error)) {
      throw error;
    }
  }

  await runQuery(`
    CREATE INDEX IF NOT EXISTS idx_ride_otps_status_created
    ON ride_otps (status, created_at)
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
      garage_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      last_updated TEXT NOT NULL
    )
  `);

  await runQuery(`
    CREATE TABLE IF NOT EXISTS trip_live_locations (
      trip_id INTEGER PRIMARY KEY,
      driver_id INTEGER NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      timestamp TEXT NOT NULL,
      FOREIGN KEY (trip_id) REFERENCES trips(trip_id) ON DELETE CASCADE,
      FOREIGN KEY (driver_id) REFERENCES users(id) ON DELETE RESTRICT
    )
  `);

  await runQuery(`
    CREATE TABLE IF NOT EXISTS trip_motion_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id INTEGER NOT NULL,
      timestamp TEXT NOT NULL,
      speed_mps REAL,
      acceleration_mps2 REAL,
      jerk_mps3 REAL,
      harsh_brake INTEGER NOT NULL DEFAULT 0 CHECK (harsh_brake IN (0, 1)),
      smooth_braking_score REAL,
      FOREIGN KEY (trip_id) REFERENCES trips(trip_id) ON DELETE CASCADE
    )
  `);

  await runQuery(`
    CREATE TABLE IF NOT EXISTS user_session (
      user_id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      is_verified INTEGER NOT NULL DEFAULT 0 CHECK (is_verified IN (0, 1)),
      last_login TEXT NOT NULL
    )
  `);

  await runQuery(`
    CREATE TABLE IF NOT EXISTS trip_cache (
      trip_id TEXT PRIMARY KEY,
      driver_id TEXT,
      passenger_id TEXT,
      start_lat REAL,
      start_lng REAL,
      end_lat REAL,
      end_lng REAL,
      expected_route TEXT,
      status TEXT,
      start_time TEXT,
      end_time TEXT
    )
  `);

  await runQuery(`
    CREATE TABLE IF NOT EXISTS risk_logs_local (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      fatigue_score REAL,
      distraction_score REAL,
      route_deviation_score REAL,
      combined_risk REAL,
      synced INTEGER NOT NULL DEFAULT 0 CHECK (synced IN (0, 1))
    )
  `);

  await runQuery(`
    CREATE TABLE IF NOT EXISTS alerts_local (
      alert_id INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id TEXT NOT NULL,
      type TEXT NOT NULL,
      level TEXT NOT NULL,
      triggered_at TEXT NOT NULL,
      action_taken TEXT,
      synced INTEGER NOT NULL DEFAULT 0 CHECK (synced IN (0, 1))
    )
  `);

  await runQuery(`
    CREATE TABLE IF NOT EXISTS emergency_events_local (
      event_id INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id TEXT NOT NULL,
      triggered_by TEXT NOT NULL,
      location_lat REAL,
      location_lng REAL,
      status TEXT NOT NULL DEFAULT 'active',
      synced INTEGER NOT NULL DEFAULT 0 CHECK (synced IN (0, 1))
    )
  `);

  await runQuery(`
    CREATE TABLE IF NOT EXISTS driver_profile_local (
      driver_id TEXT PRIMARY KEY,
      fatigue_threshold REAL,
      distraction_threshold REAL,
      last_updated TEXT NOT NULL
    )
  `);

  await runQuery(`
    CREATE INDEX IF NOT EXISTS idx_risk_logs_trip_timestamp
    ON risk_logs (trip_id, timestamp)
  `);

  await runQuery(`
    CREATE INDEX IF NOT EXISTS idx_alerts_trip_triggered
    ON alerts (trip_id, triggered_at)
  `);

  await runQuery(`
    CREATE INDEX IF NOT EXISTS idx_motion_trip_timestamp
    ON trip_motion_metrics (trip_id, timestamp)
  `);

  await runQuery(`
    CREATE INDEX IF NOT EXISTS idx_risk_logs_local_synced
    ON risk_logs_local (synced, timestamp)
  `);

  await runQuery(`
    CREATE INDEX IF NOT EXISTS idx_alerts_local_synced
    ON alerts_local (synced, triggered_at)
  `);

  await runQuery(`
    CREATE INDEX IF NOT EXISTS idx_emergency_local_synced
    ON emergency_events_local (synced, event_id)
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

export const getUserByPhoneAndRole = async ({ phone, role }) => {
  if (!phone || !role) {
    throw new Error("getUserByPhoneAndRole requires phone and role");
  }

  return getOne(`SELECT id, role, name, phone, verified FROM users WHERE phone = ? AND role = ?`, [phone, role]);
};

export const ensureUser = async ({ role, name, phone, verified = false }) => {
  if (!role || !name || !phone) {
    throw new Error("ensureUser requires role, name, and phone");
  }

  const existing = await getUserByPhoneAndRole({ phone, role });
  if (existing) {
    await runQuery(`UPDATE users SET name = ?, verified = ? WHERE id = ?`, [name, verified ? 1 : 0, existing.id]);
    return getOne(`SELECT id, role, name, phone, verified FROM users WHERE id = ?`, [existing.id]);
  }

  return createUser({ role, name, phone, verified });
};

export const upsertDriverOnboarding = async ({
  userId = null,
  phone,
  driverName,
  carNumber,
  carModel,
  faceCredential,
  faceImage = null,
  faceRegistered = false,
}) => {
  if (!phone || !driverName || !carNumber || !carModel || !faceCredential) {
    throw new Error(
      "upsertDriverOnboarding requires phone, driverName, carNumber, carModel, and faceCredential"
    );
  }

  const timestamp = nowIso();

  await runQuery(
    `INSERT INTO driver_onboarding (
      user_id,
      phone,
      driver_name,
      car_number,
      car_model,
      face_credential,
      face_image,
      face_registered,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(phone) DO UPDATE SET
      user_id = excluded.user_id,
      driver_name = excluded.driver_name,
      car_number = excluded.car_number,
      car_model = excluded.car_model,
      face_credential = excluded.face_credential,
      face_image = COALESCE(excluded.face_image, driver_onboarding.face_image),
      face_registered = excluded.face_registered,
      updated_at = excluded.updated_at`,
    [
      userId,
      String(phone),
      String(driverName),
      String(carNumber),
      String(carModel),
      String(faceCredential),
      faceImage ? String(faceImage) : null,
      faceRegistered ? 1 : 0,
      timestamp,
      timestamp,
    ]
  );

  return getOne(`SELECT * FROM driver_onboarding WHERE phone = ?`, [String(phone)]);
};

export const markDriverFaceRegistered = async ({ phone, faceRegistered = true }) => {
  if (!phone) {
    throw new Error("markDriverFaceRegistered requires phone");
  }

  await runQuery(`UPDATE driver_onboarding SET face_registered = ?, updated_at = ? WHERE phone = ?`, [
    faceRegistered ? 1 : 0,
    nowIso(),
    String(phone),
  ]);

  return getOne(`SELECT * FROM driver_onboarding WHERE phone = ?`, [String(phone)]);
};

export const getDriverOnboardingByPhone = async (phone) => {
  if (!phone) {
    throw new Error("getDriverOnboardingByPhone requires phone");
  }

  return getOne(`SELECT * FROM driver_onboarding WHERE phone = ?`, [String(phone)]);
};

export const createRideOtp = async ({
  otpCode,
  driverPhone = "UNASSIGNED_DRIVER",
  passengerPhone = null,
  sourceLabel = null,
  destinationLabel = null,
  startLat = null,
  startLng = null,
  endLat = null,
  endLng = null,
}) => {
  if (!otpCode) {
    throw new Error("createRideOtp requires otpCode");
  }

  const timestamp = nowIso();

  const result = await runQuery(
    `INSERT INTO ride_otps (
      otp_code,
      driver_phone,
      passenger_phone,
      source_label,
      destination_label,
      start_lat,
      start_lng,
      end_lat,
      end_lng,
      current_lat,
      current_lng,
      location_updated_at,
      status,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'waiting', ?, ?)`,
    [
      String(otpCode),
      String(driverPhone),
      passengerPhone ? String(passengerPhone) : null,
      sourceLabel,
      destinationLabel,
      startLat,
      startLng,
      endLat,
      endLng,
      startLat,
      startLng,
      timestamp,
      timestamp,
      timestamp,
    ]
  );

  return getOne(`SELECT * FROM ride_otps WHERE ride_id = ?`, [result.lastID]);
};

export const getRideByOtp = async (otpCode) => {
  if (!otpCode) {
    throw new Error("getRideByOtp requires otpCode");
  }

  return getOne(`SELECT * FROM ride_otps WHERE otp_code = ?`, [String(otpCode)]);
};

export const joinRideByOtp = async ({ otpCode, passengerPhone }) => {
  if (!otpCode || !passengerPhone) {
    throw new Error("joinRideByOtp requires otpCode and passengerPhone");
  }

  const ride = await getRideByOtp(otpCode);
  if (!ride) {
    throw new Error("Invalid OTP");
  }

  if (ride.status !== "waiting" && ride.status !== "active") {
    throw new Error("This ride OTP is no longer active");
  }

  await runQuery(
    `UPDATE ride_otps
     SET passenger_phone = ?, status = 'active', updated_at = ?
     WHERE otp_code = ?`,
    [String(passengerPhone), nowIso(), String(otpCode)]
  );

  return getOne(`SELECT * FROM ride_otps WHERE otp_code = ?`, [String(otpCode)]);
};

export const joinRideByOtpAsDriver = async ({ otpCode, driverPhone }) => {
  if (!otpCode || !driverPhone) {
    throw new Error("joinRideByOtpAsDriver requires otpCode and driverPhone");
  }

  const ride = await getRideByOtp(otpCode);
  if (!ride) {
    throw new Error("Invalid OTP");
  }

  if (ride.status !== "waiting" && ride.status !== "active") {
    throw new Error("This ride OTP is no longer active");
  }

  await runQuery(
    `UPDATE ride_otps
     SET driver_phone = ?, status = 'active', updated_at = ?
     WHERE otp_code = ?`,
    [String(driverPhone), nowIso(), String(otpCode)]
  );

  return getOne(`SELECT * FROM ride_otps WHERE otp_code = ?`, [String(otpCode)]);
};

export const updateRideOtpLocation = async ({ otpCode, lat, lng, timestamp = nowIso() }) => {
  if (!otpCode || lat === undefined || lng === undefined) {
    throw new Error("updateRideOtpLocation requires otpCode, lat, and lng");
  }

  await runQuery(
    `UPDATE ride_otps
     SET current_lat = ?, current_lng = ?, location_updated_at = ?, updated_at = ?
     WHERE otp_code = ?`,
    [lat, lng, timestamp, nowIso(), String(otpCode)]
  );

  return getOne(`SELECT * FROM ride_otps WHERE otp_code = ?`, [String(otpCode)]);
};

export const getRideOtpPassengerView = async (otpCode) => {
  if (!otpCode) {
    throw new Error("getRideOtpPassengerView requires otpCode");
  }

  return getOne(
    `SELECT
      r.ride_id,
      r.otp_code,
      r.status,
      r.driver_phone,
      r.passenger_phone,
      r.source_label,
      r.destination_label,
      r.start_lat,
      r.start_lng,
      r.end_lat,
      r.end_lng,
      r.current_lat,
      r.current_lng,
      r.location_updated_at,
      d.driver_name,
      d.car_number,
      d.car_model,
      d.face_image,
      d.face_registered
    FROM ride_otps r
    LEFT JOIN driver_onboarding d
      ON d.phone = r.driver_phone
    WHERE r.otp_code = ?`,
    [String(otpCode)]
  );
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

export const getTripById = async (tripId) => {
  if (!tripId) {
    throw new Error("getTripById requires tripId");
  }

  return getOne(`SELECT * FROM trips WHERE trip_id = ?`, [tripId]);
};

export const updateTripLocation = async ({ tripId, driverId, lat, lng, timestamp = nowIso() }) => {
  if (!tripId || !driverId || lat === undefined || lng === undefined) {
    throw new Error("updateTripLocation requires tripId, driverId, lat, and lng");
  }

  await runQuery(
    `INSERT INTO trip_live_locations (trip_id, driver_id, lat, lng, timestamp)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(trip_id) DO UPDATE SET
      driver_id = excluded.driver_id,
      lat = excluded.lat,
      lng = excluded.lng,
      timestamp = excluded.timestamp`,
    [tripId, driverId, lat, lng, timestamp]
  );

  return getOne(`SELECT * FROM trip_live_locations WHERE trip_id = ?`, [tripId]);
};

export const endTrip = async ({ tripId, endTime = nowIso(), status = "completed" }) => {
  if (!tripId) {
    throw new Error("endTrip requires tripId");
  }

  await runQuery(`UPDATE trips SET status = ?, end_time = ? WHERE trip_id = ?`, [status, endTime, tripId]);

  return getOne(`SELECT * FROM trips WHERE trip_id = ?`, [tripId]);
};

export const getTripStatusById = async (tripId) => {
  if (!tripId) {
    throw new Error("getTripStatusById requires tripId");
  }

  const trip = await getOne(`SELECT * FROM trips WHERE trip_id = ?`, [tripId]);
  if (!trip) {
    return null;
  }

  const liveLocation = await getOne(`SELECT * FROM trip_live_locations WHERE trip_id = ?`, [tripId]);
  const latestRisk = await getOne(
    `SELECT * FROM risk_logs WHERE trip_id = ? ORDER BY timestamp DESC, id DESC LIMIT 1`,
    [tripId]
  );
  const latestAlert = await getOne(
    `SELECT * FROM alerts WHERE trip_id = ? ORDER BY triggered_at DESC, alert_id DESC LIMIT 1`,
    [tripId]
  );

  return {
    trip,
    liveLocation,
    latestRisk,
    latestAlert,
  };
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

export const insertTripMotionMetric = async ({
  tripId,
  timestamp = nowIso(),
  speedMps = null,
  accelerationMps2 = null,
  jerkMps3 = null,
  harshBrake = false,
  smoothBrakingScore = null,
}) => {
  if (!tripId) {
    throw new Error("insertTripMotionMetric requires tripId");
  }

  const result = await runQuery(
    `INSERT INTO trip_motion_metrics (
      trip_id,
      timestamp,
      speed_mps,
      acceleration_mps2,
      jerk_mps3,
      harsh_brake,
      smooth_braking_score
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      tripId,
      timestamp,
      speedMps,
      accelerationMps2,
      jerkMps3,
      harshBrake ? 1 : 0,
      smoothBrakingScore,
    ]
  );

  return getOne(`SELECT * FROM trip_motion_metrics WHERE id = ?`, [result.lastID]);
};

export const fetchRecentTripMotionMetrics = async ({ tripId, limit = 30 }) => {
  if (!tripId) {
    throw new Error("fetchRecentTripMotionMetrics requires tripId");
  }

  return getAll(
    `SELECT * FROM trip_motion_metrics WHERE trip_id = ? ORDER BY timestamp DESC, id DESC LIMIT ?`,
    [tripId, limit]
  );
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
  if ((garageId === undefined || garageId === null || String(garageId).trim() === "") || !name) {
    throw new Error("upsertGarage requires garageId and name");
  }

  const normalizedGarageId = String(garageId);

  await runQuery(
    `INSERT INTO garage_cache (garage_id, name, phone, lat, lng, last_updated)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(garage_id) DO UPDATE SET
      name = excluded.name,
      phone = excluded.phone,
      lat = excluded.lat,
      lng = excluded.lng,
      last_updated = excluded.last_updated`,
    [normalizedGarageId, name, phone, lat, lng, lastUpdated]
  );

  return getOne(`SELECT * FROM garage_cache WHERE garage_id = ?`, [normalizedGarageId]);
};

export const upsertUserSession = async ({
  userId,
  role,
  name,
  phone,
  isVerified = false,
  lastLogin = nowIso(),
}) => {
  if (!userId || !role || !name || !phone) {
    throw new Error("upsertUserSession requires userId, role, name, and phone");
  }

  await runQuery(
    `INSERT INTO user_session (user_id, role, name, phone, is_verified, last_login)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
      role = excluded.role,
      name = excluded.name,
      phone = excluded.phone,
      is_verified = excluded.is_verified,
      last_login = excluded.last_login`,
    [String(userId), String(role), String(name), String(phone), isVerified ? 1 : 0, lastLogin]
  );

  return getOne(`SELECT * FROM user_session WHERE user_id = ?`, [String(userId)]);
};

export const getActiveUserSession = async () => {
  return getOne(`SELECT * FROM user_session ORDER BY last_login DESC LIMIT 1`);
};

export const cacheTrip = async ({
  tripId,
  driverId,
  passengerId,
  startLat,
  startLng,
  endLat,
  endLng,
  expectedRoute = null,
  status = "ongoing",
  startTime = nowIso(),
  endTime = null,
}) => {
  if (!tripId) {
    throw new Error("cacheTrip requires tripId");
  }

  await runQuery(
    `INSERT INTO trip_cache (
      trip_id,
      driver_id,
      passenger_id,
      start_lat,
      start_lng,
      end_lat,
      end_lng,
      expected_route,
      status,
      start_time,
      end_time
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(trip_id) DO UPDATE SET
      driver_id = excluded.driver_id,
      passenger_id = excluded.passenger_id,
      start_lat = excluded.start_lat,
      start_lng = excluded.start_lng,
      end_lat = excluded.end_lat,
      end_lng = excluded.end_lng,
      expected_route = excluded.expected_route,
      status = excluded.status,
      start_time = excluded.start_time,
      end_time = excluded.end_time`,
    [
      String(tripId),
      driverId === undefined || driverId === null ? null : String(driverId),
      passengerId === undefined || passengerId === null ? null : String(passengerId),
      startLat ?? null,
      startLng ?? null,
      endLat ?? null,
      endLng ?? null,
      expectedRoute,
      status,
      startTime,
      endTime,
    ]
  );

  return getOne(`SELECT * FROM trip_cache WHERE trip_id = ?`, [String(tripId)]);
};

export const fetchTripCacheById = async (tripId) => {
  if (!tripId) {
    throw new Error("fetchTripCacheById requires tripId");
  }

  return getOne(`SELECT * FROM trip_cache WHERE trip_id = ?`, [String(tripId)]);
};

export const insertLocalRiskLog = async ({
  tripId,
  fatigueScore,
  distractionScore,
  routeDeviationScore,
  combinedRisk,
  timestamp = nowIso(),
  synced = false,
}) => {
  if (!tripId) {
    throw new Error("insertLocalRiskLog requires tripId");
  }

  const result = await runQuery(
    `INSERT INTO risk_logs_local (
      trip_id,
      timestamp,
      fatigue_score,
      distraction_score,
      route_deviation_score,
      combined_risk,
      synced
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      String(tripId),
      timestamp,
      fatigueScore ?? null,
      distractionScore ?? null,
      routeDeviationScore ?? null,
      combinedRisk ?? null,
      synced ? 1 : 0,
    ]
  );

  return getOne(`SELECT * FROM risk_logs_local WHERE id = ?`, [result.lastID]);
};

export const insertLocalAlert = async ({
  tripId,
  type,
  level,
  triggeredAt = nowIso(),
  actionTaken = null,
  synced = false,
}) => {
  if (!tripId || !type || !level) {
    throw new Error("insertLocalAlert requires tripId, type, and level");
  }

  const result = await runQuery(
    `INSERT INTO alerts_local (trip_id, type, level, triggered_at, action_taken, synced)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [String(tripId), String(type), String(level), triggeredAt, actionTaken, synced ? 1 : 0]
  );

  return getOne(`SELECT * FROM alerts_local WHERE alert_id = ?`, [result.lastID]);
};

export const insertLocalEmergencyEvent = async ({
  tripId,
  triggeredBy,
  locationLat,
  locationLng,
  status = "active",
  synced = false,
}) => {
  if (!tripId || !triggeredBy) {
    throw new Error("insertLocalEmergencyEvent requires tripId and triggeredBy");
  }

  const result = await runQuery(
    `INSERT INTO emergency_events_local (
      trip_id,
      triggered_by,
      location_lat,
      location_lng,
      status,
      synced
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    [String(tripId), String(triggeredBy), locationLat ?? null, locationLng ?? null, status, synced ? 1 : 0]
  );

  return getOne(`SELECT * FROM emergency_events_local WHERE event_id = ?`, [result.lastID]);
};

export const upsertDriverProfileLocal = async ({
  driverId,
  fatigueThreshold,
  distractionThreshold,
  lastUpdated = nowIso(),
}) => {
  if (!driverId) {
    throw new Error("upsertDriverProfileLocal requires driverId");
  }

  await runQuery(
    `INSERT INTO driver_profile_local (
      driver_id,
      fatigue_threshold,
      distraction_threshold,
      last_updated
    ) VALUES (?, ?, ?, ?)
    ON CONFLICT(driver_id) DO UPDATE SET
      fatigue_threshold = excluded.fatigue_threshold,
      distraction_threshold = excluded.distraction_threshold,
      last_updated = excluded.last_updated`,
    [String(driverId), fatigueThreshold ?? null, distractionThreshold ?? null, lastUpdated]
  );

  return getOne(`SELECT * FROM driver_profile_local WHERE driver_id = ?`, [String(driverId)]);
};

export const fetchUnsyncedLocalData = async ({ limit = 200 } = {}) => {
  const normalizedLimit = Number.isFinite(Number(limit)) ? Number(limit) : 200;

  const [riskLogs, alerts, emergencyEvents] = await Promise.all([
    getAll(`SELECT * FROM risk_logs_local WHERE synced = 0 ORDER BY timestamp ASC LIMIT ?`, [normalizedLimit]),
    getAll(`SELECT * FROM alerts_local WHERE synced = 0 ORDER BY triggered_at ASC LIMIT ?`, [normalizedLimit]),
    getAll(`SELECT * FROM emergency_events_local WHERE synced = 0 ORDER BY event_id ASC LIMIT ?`, [normalizedLimit]),
  ]);

  return {
    riskLogs,
    alerts,
    emergencyEvents,
  };
};

export const markLocalRiskLogSynced = async (id) => {
  if (!id) {
    throw new Error("markLocalRiskLogSynced requires id");
  }
  await runQuery(`UPDATE risk_logs_local SET synced = 1 WHERE id = ?`, [id]);
};

export const markLocalAlertSynced = async (alertId) => {
  if (!alertId) {
    throw new Error("markLocalAlertSynced requires alertId");
  }
  await runQuery(`UPDATE alerts_local SET synced = 1 WHERE alert_id = ?`, [alertId]);
};

export const markLocalEmergencyEventSynced = async (eventId) => {
  if (!eventId) {
    throw new Error("markLocalEmergencyEventSynced requires eventId");
  }
  await runQuery(`UPDATE emergency_events_local SET synced = 1 WHERE event_id = ?`, [eventId]);
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
