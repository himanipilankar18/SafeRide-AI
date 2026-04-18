import {
  endTrip,
  fetchRecentTripMotionMetrics,
  getTripById,
  getTripStatusById,
  insertTripMotionMetric,
  insertRiskLog,
  startTrip,
  triggerAlert,
  updateTripLocation,
} from "../db/sqlite.js";
import { emitTripEvent } from "../liveTracking.js";
import { emitRouteAlert } from "./tripLifecycleService.js";

const DEFAULT_DEVIATION_THRESHOLD_METERS = Number(
  process.env.ROUTE_DEVIATION_THRESHOLD_METERS || 100,
);
const HARSH_BRAKE_ACCEL_THRESHOLD_MPS2 = Number(
  process.env.HARSH_BRAKE_ACCEL_THRESHOLD_MPS2 || -3.5,
);
const HARSH_BRAKE_JERK_THRESHOLD_MPS3 = Number(
  process.env.HARSH_BRAKE_JERK_THRESHOLD_MPS3 || 4.5,
);
const SMOOTH_BRAKING_WINDOW_SECONDS = Number(
  process.env.SMOOTH_BRAKING_WINDOW_SECONDS || 60,
);
const SMOOTH_BRAKING_ALLOWED_HARSH_EVENTS = Number(
  process.env.SMOOTH_BRAKING_ALLOWED_HARSH_EVENTS || 2,
);

const tripKinematics = new Map();

const toRadians = (value) => (Number(value) * Math.PI) / 180;

const haversineMeters = (a, b) => {
  const earthRadiusMeters = 6371000;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);

  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(h));
};

const parseExpectedRoute = (routeValue) => {
  if (!routeValue) {
    return [];
  }

  let parsed = routeValue;
  if (typeof routeValue === "string") {
    try {
      parsed = JSON.parse(routeValue);
    } catch {
      return [];
    }
  }

  const points = Array.isArray(parsed?.polyline)
    ? parsed.polyline
    : Array.isArray(parsed)
      ? parsed
      : [];
  return points
    .map((point) => {
      if (!Array.isArray(point) || point.length < 2) {
        return null;
      }
      return {
        lat: Number(point[0]),
        lng: Number(point[1]),
      };
    })
    .filter(
      (point) => Number.isFinite(point?.lat) && Number.isFinite(point?.lng),
    );
};

const computeDeviationScore = (location, expectedRoute, thresholdMeters) => {
  if (!expectedRoute.length) {
    return {
      minDistanceMeters: 0,
      routeDeviationScore: 0,
      isDeviation: false,
    };
  }

  let minDistanceMeters = Number.POSITIVE_INFINITY;
  for (const point of expectedRoute) {
    const distance = haversineMeters(location, point);
    if (distance < minDistanceMeters) {
      minDistanceMeters = distance;
    }
  }

  const normalized = minDistanceMeters / Math.max(thresholdMeters, 1);
  const routeDeviationScore = Math.max(0, Math.min(1, normalized));

  return {
    minDistanceMeters,
    routeDeviationScore,
    isDeviation: minDistanceMeters > thresholdMeters,
  };
};

const normalizeRiskInput = (value) =>
  Math.max(0, Math.min(1, Number(value) || 0));

const computeBehaviorRisk = ({
  fatigueScore = 0,
  distractionScore = 0,
  smoothBrakingScore = 1,
}) => {
  const fatigue = Math.max(0, Math.min(1, Number(fatigueScore) || 0));
  const distraction = Math.max(0, Math.min(1, Number(distractionScore) || 0));
  const brakingRisk = 1 - normalizeRiskInput(smoothBrakingScore);

  const behaviorRisk = Number(
    (fatigue * 0.45 + distraction * 0.35 + brakingRisk * 0.2).toFixed(4),
  );

  if (behaviorRisk >= 0.75) {
    return { score: behaviorRisk, level: "high" };
  }
  if (behaviorRisk >= 0.45) {
    return { score: behaviorRisk, level: "medium" };
  }
  return { score: behaviorRisk, level: "low" };
};

const computeOverallRisk = ({
  behaviorRiskScore = 0,
  routeDeviationScore = 0,
}) => {
  const behavior = normalizeRiskInput(behaviorRiskScore);
  const deviation = normalizeRiskInput(routeDeviationScore);

  const combinedRisk = Number((behavior * 0.75 + deviation * 0.25).toFixed(4));

  if (combinedRisk >= 0.75) {
    return { combinedRisk, level: "high" };
  }
  if (combinedRisk >= 0.45) {
    return { combinedRisk, level: "medium" };
  }
  return { combinedRisk, level: "low" };
};

const toTimestampMs = (timestampValue) => {
  if (!timestampValue) {
    return Date.now();
  }

  const parsed = Date.parse(timestampValue);
  return Number.isFinite(parsed) ? parsed : Date.now();
};

const computeMotionMetrics = ({ tripId, location, timestampMs }) => {
  const prev = tripKinematics.get(tripId);
  const windowMs = SMOOTH_BRAKING_WINDOW_SECONDS * 1000;

  if (!prev) {
    const initialState = {
      lastLocation: location,
      lastTimestampMs: timestampMs,
      lastSpeedMps: null,
      lastAccelerationMps2: null,
      harshBrakeTimestamps: [],
    };

    tripKinematics.set(tripId, initialState);

    return {
      speedMps: null,
      accelerationMps2: null,
      jerkMps3: null,
      harshBrakeDetected: false,
      smoothBrakingScore: 1,
      harshBrakesInWindow: 0,
    };
  }

  const dtSec = (timestampMs - prev.lastTimestampMs) / 1000;
  if (!Number.isFinite(dtSec) || dtSec <= 0) {
    return {
      speedMps: prev.lastSpeedMps,
      accelerationMps2: prev.lastAccelerationMps2,
      jerkMps3: null,
      harshBrakeDetected: false,
      smoothBrakingScore: Number(
        (
          1 -
          Math.min(
            1,
            prev.harshBrakeTimestamps.length /
              Math.max(SMOOTH_BRAKING_ALLOWED_HARSH_EVENTS, 1),
          )
        ).toFixed(4),
      ),
      harshBrakesInWindow: prev.harshBrakeTimestamps.length,
    };
  }

  const distanceMeters = haversineMeters(prev.lastLocation, location);
  const speedMps = distanceMeters / dtSec;
  const accelerationMps2 =
    prev.lastSpeedMps === null || prev.lastSpeedMps === undefined
      ? null
      : (speedMps - prev.lastSpeedMps) / dtSec;
  const jerkMps3 =
    accelerationMps2 === null ||
    prev.lastAccelerationMps2 === null ||
    prev.lastAccelerationMps2 === undefined
      ? null
      : (accelerationMps2 - prev.lastAccelerationMps2) / dtSec;

  const harshBrakeDetected =
    (accelerationMps2 !== null &&
      accelerationMps2 <= HARSH_BRAKE_ACCEL_THRESHOLD_MPS2) ||
    (jerkMps3 !== null &&
      jerkMps3 <= -Math.abs(HARSH_BRAKE_JERK_THRESHOLD_MPS3));

  const recentHarshBrakes = prev.harshBrakeTimestamps
    .filter((ms) => timestampMs - ms <= windowMs)
    .concat(harshBrakeDetected ? [timestampMs] : []);
  const harshBrakesInWindow = recentHarshBrakes.length;
  const smoothBrakingScore = Number(
    (
      1 -
      Math.min(
        1,
        harshBrakesInWindow / Math.max(SMOOTH_BRAKING_ALLOWED_HARSH_EVENTS, 1),
      )
    ).toFixed(4),
  );

  tripKinematics.set(tripId, {
    lastLocation: location,
    lastTimestampMs: timestampMs,
    lastSpeedMps: speedMps,
    lastAccelerationMps2: accelerationMps2,
    harshBrakeTimestamps: recentHarshBrakes,
  });

  return {
    speedMps: Number(speedMps.toFixed(4)),
    accelerationMps2:
      accelerationMps2 === null ? null : Number(accelerationMps2.toFixed(4)),
    jerkMps3: jerkMps3 === null ? null : Number(jerkMps3.toFixed(4)),
    harshBrakeDetected,
    smoothBrakingScore,
    harshBrakesInWindow,
  };
};

const buildAiInsights = ({ motion, deviationResult }) => {
  const smoothBraking =
    motion.smoothBrakingScore >= 0.75 && !motion.harshBrakeDetected;
  const laneDiscipline =
    !deviationResult.isDeviation && deviationResult.routeDeviationScore <= 0.25;

  return [
    {
      key: "smooth_braking",
      label: smoothBraking
        ? "Smooth braking detected"
        : "Braking pattern needs attention",
      status: smoothBraking ? "good" : "warn",
      value: motion.smoothBrakingScore,
    },
    {
      key: "lane_discipline",
      label: laneDiscipline
        ? "Lane discipline maintained"
        : "Possible route/lane drift detected",
      status: laneDiscipline ? "good" : "warn",
      value: Number(
        (1 - Math.min(1, deviationResult.routeDeviationScore)).toFixed(4),
      ),
    },
  ];
};

const emitDriverAlert = ({ tripId, level, message, details }) => {
  const payload = {
    type: "driver_alert",
    level,
    message,
    details,
    hardwareAction: "BUZZER_BEEP",
  };

  emitTripEvent(tripId, payload);

  // Simulated hardware buzzer trigger for backend diagnostics.
  console.log(`[BUZZER] trip=${tripId} level=${level} message=${message}`);
};

export const startTripSession = async ({
  driverId,
  passengerId,
  startLat,
  startLng,
  destinationLat,
  destinationLng,
  expectedRoute = null,
}) => {
  const trip = await startTrip({
    driverId,
    passengerId,
    startLat,
    startLng,
    endLat: destinationLat,
    endLng: destinationLng,
    expectedRoute: expectedRoute ? JSON.stringify(expectedRoute) : null,
    status: "active",
  });

  await updateTripLocation({
    tripId: trip.trip_id,
    driverId,
    lat: startLat,
    lng: startLng,
  });

  emitTripEvent(trip.trip_id, {
    type: "trip_started",
    level: "low",
    message: "Trip started successfully",
  });

  tripKinematics.set(Number(trip.trip_id), {
    lastLocation: { lat: Number(startLat), lng: Number(startLng) },
    lastTimestampMs: Date.now(),
    lastSpeedMps: null,
    lastAccelerationMps2: null,
    harshBrakeTimestamps: [],
  });

  return trip;
};

export const processLocationUpdate = async ({
  tripId,
  driverId,
  lat,
  lng,
  timestamp,
  fatigueScore = 0,
  distractionScore = 0,
}) => {
  const trip = await getTripById(tripId);
  if (!trip) {
    throw new Error("Trip not found");
  }

  if (trip.status !== "active") {
    throw new Error(`Cannot update location for trip in ${trip.status} state`);
  }

  const location = {
    lat: Number(lat),
    lng: Number(lng),
  };
  const requestTimestampMs = toTimestampMs(timestamp);
  const requestTimestampIso = new Date(requestTimestampMs).toISOString();

  if (!Number.isFinite(location.lat) || !Number.isFinite(location.lng)) {
    throw new Error("Invalid location coordinates");
  }

  const savedLocation = await updateTripLocation({
    tripId,
    driverId,
    lat: location.lat,
    lng: location.lng,
    timestamp: requestTimestampIso,
  });

  const expectedRoute = parseExpectedRoute(trip.expected_route);
  const deviationResult = computeDeviationScore(
    location,
    expectedRoute,
    DEFAULT_DEVIATION_THRESHOLD_METERS,
  );

  const motion = computeMotionMetrics({
    tripId: Number(tripId),
    location,
    timestampMs: requestTimestampMs,
  });

  const motionMetric = await insertTripMotionMetric({
    tripId,
    timestamp: requestTimestampIso,
    speedMps: motion.speedMps,
    accelerationMps2: motion.accelerationMps2,
    jerkMps3: motion.jerkMps3,
    harshBrake: motion.harshBrakeDetected,
    smoothBrakingScore: motion.smoothBrakingScore,
  });

  const behaviorRisk = computeBehaviorRisk({
    fatigueScore,
    distractionScore,
    smoothBrakingScore: motion.smoothBrakingScore,
  });
  const overallRisk = computeOverallRisk({
    behaviorRiskScore: behaviorRisk.score,
    routeDeviationScore: deviationResult.routeDeviationScore,
  });

  const riskLog = await insertRiskLog({
    tripId,
    fatigueScore,
    distractionScore,
    routeDeviationScore: deviationResult.routeDeviationScore,
    combinedRisk: overallRisk.combinedRisk,
    timestamp: requestTimestampIso,
  });

  const insights = buildAiInsights({
    motion,
    deviationResult,
  });

  let alert = null;
  if (
    deviationResult.isDeviation ||
    behaviorRisk.level !== "low" ||
    motion.harshBrakeDetected
  ) {
    const reason = deviationResult.isDeviation
      ? "route_deviation"
      : "driver_behavior";
    const alertLevel =
      overallRisk.level === "high" || motion.harshBrakeDetected
        ? "high"
        : behaviorRisk.level === "medium" || deviationResult.isDeviation
          ? "medium"
          : "low";

    alert = await triggerAlert({
      tripId,
      type: reason,
      level: alertLevel,
      actionTaken:
        alertLevel === "high"
          ? "escalate_to_passenger_and_buzzer"
          : "driver_warning",
    });

    emitDriverAlert({
      tripId,
      level: alertLevel,
      message: deviationResult.isDeviation
        ? "Route deviation detected"
        : motion.harshBrakeDetected
          ? "Harsh braking detected"
          : "Elevated driver risk detected",
      details: {
        minDistanceMeters: Number(deviationResult.minDistanceMeters.toFixed(2)),
        fatigueScore: Number(fatigueScore),
        distractionScore: Number(distractionScore),
        routeDeviationScore: deviationResult.routeDeviationScore,
        behaviorRisk: behaviorRisk.score,
        combinedRisk: overallRisk.combinedRisk,
        speedMps: motion.speedMps,
        accelerationMps2: motion.accelerationMps2,
        jerkMps3: motion.jerkMps3,
        smoothBrakingScore: motion.smoothBrakingScore,
        harshBrakesInWindow: motion.harshBrakesInWindow,
      },
    });

    if (deviationResult.isDeviation) {
      emitRouteAlert({
        tripId: String(tripId),
        severity:
          alertLevel === "high"
            ? "danger"
            : alertLevel === "medium"
              ? "medium"
              : "low",
        message: "Route deviation detected",
      });
    }
  }

  emitTripEvent(tripId, {
    type: "location_update",
    level: overallRisk.level,
    message: "Driver location updated",
    location: savedLocation,
    aiInsights: insights,
    motion,
    risk: {
      combinedRisk: overallRisk.combinedRisk,
      level: overallRisk.level,
      behaviorRisk: behaviorRisk.score,
      behaviorLevel: behaviorRisk.level,
      routeDeviationScore: deviationResult.routeDeviationScore,
      minDistanceMeters: Number(deviationResult.minDistanceMeters.toFixed(2)),
      isDeviation: deviationResult.isDeviation,
    },
  });

  return {
    tripId,
    location: savedLocation,
    riskLog,
    motionMetric,
    alert,
    aiInsights: insights,
    motion,
    risk: {
      combinedRisk: overallRisk.combinedRisk,
      level: overallRisk.level,
      behaviorRisk: behaviorRisk.score,
      behaviorLevel: behaviorRisk.level,
      routeDeviationScore: deviationResult.routeDeviationScore,
      isDeviation: deviationResult.isDeviation,
      minDistanceMeters: Number(deviationResult.minDistanceMeters.toFixed(2)),
    },
  };
};

export const completeTripSession = async ({ tripId }) => {
  const trip = await endTrip({
    tripId,
    status: "completed",
  });

  emitTripEvent(tripId, {
    type: "trip_ended",
    level: "low",
    message: "Trip ended",
  });

  tripKinematics.delete(Number(tripId));

  return trip;
};

export const fetchTripStatus = async ({ tripId }) => {
  const status = await getTripStatusById(tripId);
  if (!status) {
    throw new Error("Trip not found");
  }

  const motionMetrics = await fetchRecentTripMotionMetrics({
    tripId,
    limit: 20,
  });

  return {
    ...status,
    motionMetrics,
  };
};
