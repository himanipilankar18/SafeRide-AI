import { emitTripEvent } from "../liveTracking.js";
import {
  startDrowsinessBridge,
  stopDrowsinessBridge,
} from "./drowsinessBridge.js";

const VALID_STATUSES = [
  "IDLE",
  "VERIFIED",
  "OTP_VERIFIED",
  "START_TRIP",
  "ACTIVE",
  "END_TRIP",
];

const transitionOrder = {
  IDLE: 0,
  VERIFIED: 1,
  OTP_VERIFIED: 2,
  START_TRIP: 3,
  ACTIVE: 4,
  END_TRIP: 5,
};

const transitionTable = {
  IDLE: new Set(["VERIFIED"]),
  VERIFIED: new Set(["VERIFIED", "OTP_VERIFIED"]),
  OTP_VERIFIED: new Set(["OTP_VERIFIED", "START_TRIP"]),
  START_TRIP: new Set(["START_TRIP", "ACTIVE"]),
  ACTIVE: new Set(["ACTIVE", "END_TRIP"]),
  END_TRIP: new Set(["END_TRIP"]),
};

const lifecycleByTripId = new Map();
let monitoringRefs = 0;

const nowIso = () => new Date().toISOString();

const toSafeTripId = (tripId) => {
  const value = String(tripId || "").trim();
  if (!value) {
    throw new Error("tripId is required");
  }
  return value;
};

const toSafeState = (status) => {
  const normalized = String(status || "").trim().toUpperCase();
  if (!VALID_STATUSES.includes(normalized)) {
    throw new Error(`Invalid trip status: ${status}`);
  }
  return normalized;
};

const cloneState = (state) => ({
  tripId: state.tripId,
  status: state.status,
  driverId: state.driverId,
  passengerId: state.passengerId,
  monitoringActive: state.monitoringActive,
  updatedAt: state.updatedAt,
});

const ensureState = ({ tripId, driverId = null, passengerId = null }) => {
  const safeTripId = toSafeTripId(tripId);
  if (!lifecycleByTripId.has(safeTripId)) {
    lifecycleByTripId.set(safeTripId, {
      tripId: safeTripId,
      status: "IDLE",
      driverId,
      passengerId,
      monitoringActive: false,
      updatedAt: nowIso(),
    });
  }

  const existing = lifecycleByTripId.get(safeTripId);
  if (driverId !== undefined && driverId !== null) {
    existing.driverId = driverId;
  }
  if (passengerId !== undefined && passengerId !== null) {
    existing.passengerId = passengerId;
  }

  return existing;
};

const startMonitoring = async (tripState) => {
  if (tripState.monitoringActive) {
    return;
  }

  if (monitoringRefs === 0) {
    await startDrowsinessBridge();
  }

  monitoringRefs += 1;
  tripState.monitoringActive = true;

  emitTripEvent(tripState.tripId, {
    type: "TRIP_STATUS",
    status: "ACTIVE",
    monitoringActive: true,
  });
};

const stopMonitoring = async (tripState) => {
  if (!tripState.monitoringActive) {
    return;
  }

  tripState.monitoringActive = false;
  monitoringRefs = Math.max(0, monitoringRefs - 1);

  if (monitoringRefs === 0) {
    await stopDrowsinessBridge();
  }

  emitTripEvent(tripState.tripId, {
    type: "TRIP_STATUS",
    status: "END_TRIP",
    monitoringActive: false,
  });
};

const canTransition = (fromStatus, toStatus) =>
  Boolean(transitionTable[fromStatus]?.has(toStatus));

const applyTransition = async ({
  tripId,
  nextStatus,
  driverId = undefined,
  passengerId = undefined,
}) => {
  const tripState = ensureState({ tripId, driverId, passengerId });
  const normalizedNextStatus = toSafeState(nextStatus);

  if (!canTransition(tripState.status, normalizedNextStatus)) {
    throw new Error(
      `Invalid transition ${tripState.status} -> ${normalizedNextStatus}`,
    );
  }

  if (tripState.status === normalizedNextStatus) {
    return cloneState(tripState);
  }

  tripState.status = normalizedNextStatus;
  tripState.updatedAt = nowIso();

  if (normalizedNextStatus === "ACTIVE") {
    await startMonitoring(tripState);
  }

  if (normalizedNextStatus === "END_TRIP") {
    await stopMonitoring(tripState);
  }

  emitTripEvent(tripState.tripId, {
    type: "TRIP_STATUS",
    status: tripState.status,
    monitoringActive: tripState.monitoringActive,
  });

  return cloneState(tripState);
};

export const verifyTrip = async ({ tripId, driverId = null, passengerId = null }) =>
  applyTransition({ tripId, nextStatus: "VERIFIED", driverId, passengerId });

export const otpVerifyTrip = async ({ tripId, driverId = null, passengerId = null }) => {
  const verified = await applyTransition({
    tripId,
    nextStatus: "OTP_VERIFIED",
    driverId,
    passengerId,
  });

  // OTP verification should immediately progress to START_TRIP.
  const started = await applyTransition({
    tripId,
    nextStatus: "START_TRIP",
    driverId,
    passengerId,
  });

  return {
    tripId: verified.tripId,
    previous: verified,
    current: started,
  };
};

export const startTripLifecycle = async ({
  tripId,
  driverId = null,
  passengerId = null,
}) => {
  const current = ensureState({ tripId, driverId, passengerId });

  if (transitionOrder[current.status] < transitionOrder.START_TRIP) {
    throw new Error("Trip must be OTP_VERIFIED before START_TRIP");
  }

  const startState =
    current.status === "START_TRIP"
      ? cloneState(current)
      : await applyTransition({
          tripId,
          nextStatus: "START_TRIP",
          driverId,
          passengerId,
        });

  const activeState =
    startState.status === "ACTIVE"
      ? startState
      : await applyTransition({
          tripId,
          nextStatus: "ACTIVE",
          driverId,
          passengerId,
        });

  return activeState;
};

export const endTripLifecycle = async ({ tripId }) => {
  const current = ensureState({ tripId });

  if (current.status === "END_TRIP") {
    return cloneState(current);
  }

  if (current.status !== "ACTIVE") {
    // Keep this idempotent and safe for cleanup calls from existing flows.
    current.status = "END_TRIP";
    current.updatedAt = nowIso();
    await stopMonitoring(current);

    emitTripEvent(current.tripId, {
      type: "TRIP_STATUS",
      status: current.status,
      monitoringActive: false,
    });

    return cloneState(current);
  }

  const ended = await applyTransition({ tripId, nextStatus: "END_TRIP" });

  // Reset back to IDLE baseline for next trip lifecycle.
  lifecycleByTripId.set(ended.tripId, {
    tripId: ended.tripId,
    status: "IDLE",
    driverId: ended.driverId,
    passengerId: ended.passengerId,
    monitoringActive: false,
    updatedAt: nowIso(),
  });

  emitTripEvent(ended.tripId, {
    type: "TRIP_STATUS",
    status: "IDLE",
    monitoringActive: false,
  });

  return cloneState(lifecycleByTripId.get(ended.tripId));
};

export const getTripLifecycle = (tripId) => {
  const state = ensureState({ tripId });
  return cloneState(state);
};

export const isTripMonitoringActive = (tripId) => {
  const state = lifecycleByTripId.get(String(tripId || "").trim());
  return Boolean(state?.monitoringActive && state?.status === "ACTIVE");
};

export const emitRouteAlert = ({ tripId, severity, message }) => {
  if (!isTripMonitoringActive(tripId)) {
    return;
  }

  emitTripEvent(String(tripId), {
    type: "ROUTE_ALERT",
    severity,
    message,
  });
};

export const emitDrowsinessEvent = ({
  tripId,
  level,
  eyeClosure,
  attention,
  riskScore,
  fatigueScore,
  distractionScore,
  confidence,
  reason,
  blinkRatePerMinute,
  eyeClosureSeconds,
  yaw,
  pitch,
  roll,
  faceDetected,
  fatigueFlags,
  distractionReason,
}) => {
  if (!isTripMonitoringActive(tripId)) {
    return;
  }

  emitTripEvent(String(tripId), {
    type: "DROWSINESS",
    level,
    eyeClosure,
    attention,
    riskScore,
    fatigueScore,
    distractionScore,
    confidence,
    reason,
    blinkRatePerMinute,
    eyeClosureSeconds,
    yaw,
    pitch,
    roll,
    faceDetected,
    fatigueFlags,
    distractionReason,
  });
};
