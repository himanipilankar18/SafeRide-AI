import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type TripStatus =
  | "IDLE"
  | "VERIFIED"
  | "OTP_VERIFIED"
  | "START_TRIP"
  | "ACTIVE"
  | "END_TRIP";

export type DrowsinessLevel = "NORMAL" | "WARNING" | "CRITICAL";

export type AlertLogEntry = {
  id: string;
  type: "DROWSINESS" | "ROUTE_ALERT" | "EMERGENCY" | "SYSTEM";
  message: string;
  severity: "low" | "medium" | "danger";
  timestamp: string;
};

type TripLifecycleState = {
  tripId: string | null;
  tripStatus: TripStatus;
  monitoringActive: boolean;
  drowsiness: {
    level: DrowsinessLevel;
    eyeClosure: number;
    attention: number;
    riskScore: number;
    fatigueScore: number;
    distractionScore: number;
    confidence: number;
    reason: string;
    blinkRatePerMinute: number;
    eyeClosureSeconds: number;
    yaw: number;
    pitch: number;
    roll: number;
    faceDetected: boolean;
    distractionReason: string;
    closureState: string;
    microsleepDetected: boolean;
    frequentBlinking: boolean;
    updatedAt: string | null;
  };
  routeAlert: {
    severity: "low" | "medium" | "danger";
    message: string;
    updatedAt: string | null;
  } | null;
  alertLogs: AlertLogEntry[];
};

type TripLifecycleContextValue = TripLifecycleState & {
  setTripContext: (payload: {
    tripId: string | null;
    tripStatus?: TripStatus;
    monitoringActive?: boolean;
  }) => void;
  updateTripStatus: (payload: {
    status: TripStatus;
    monitoringActive?: boolean;
  }) => void;
  updateDrowsiness: (payload: {
    level: DrowsinessLevel;
    eyeClosure: number;
    attention: number;
    riskScore?: number;
    fatigueScore?: number;
    distractionScore?: number;
    confidence?: number;
    reason?: string;
    blinkRatePerMinute?: number;
    eyeClosureSeconds?: number;
    yaw?: number;
    pitch?: number;
    roll?: number;
    faceDetected?: boolean;
    distractionReason?: string;
    closureState?: string;
    microsleepDetected?: boolean;
    frequentBlinking?: boolean;
  }) => void;
  updateRouteAlert: (payload: {
    severity: "low" | "medium" | "danger";
    message: string;
  }) => void;
  appendAlertLog: (entry: Omit<AlertLogEntry, "id">) => void;
  resetLifecycle: () => void;
};

const MAX_ALERT_LOGS = 100;

const initialState: TripLifecycleState = {
  tripId: null,
  tripStatus: "IDLE",
  monitoringActive: false,
  drowsiness: {
    level: "NORMAL",
    eyeClosure: 0,
    attention: 100,
    riskScore: 0,
    fatigueScore: 0,
    distractionScore: 0,
    confidence: 0,
    reason: "idle",
    blinkRatePerMinute: 0,
    eyeClosureSeconds: 0,
    yaw: 0,
    pitch: 0,
    roll: 0,
    faceDetected: false,
    distractionReason: "",
    closureState: "open",
    microsleepDetected: false,
    frequentBlinking: false,
    updatedAt: null,
  },
  routeAlert: null,
  alertLogs: [],
};

const TripLifecycleContext = createContext<TripLifecycleContextValue | null>(
  null,
);

const buildLogId = () => `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const TripLifecycleProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<TripLifecycleState>(initialState);

  const appendAlertLog = useCallback((entry: Omit<AlertLogEntry, "id">) => {
    setState((prev) => ({
      ...prev,
      alertLogs: [{ ...entry, id: buildLogId() }, ...prev.alertLogs].slice(
        0,
        MAX_ALERT_LOGS,
      ),
    }));
  }, []);

  const setTripContext = useCallback(
    ({ tripId, tripStatus = "IDLE", monitoringActive = false }: {
      tripId: string | null;
      tripStatus?: TripStatus;
      monitoringActive?: boolean;
    }) => {
      setState((prev) => ({
        ...prev,
        tripId,
        tripStatus,
        monitoringActive,
      }));
    },
    [],
  );

  const updateTripStatus = useCallback(
    ({ status, monitoringActive }: { status: TripStatus; monitoringActive?: boolean }) => {
      setState((prev) => ({
        ...prev,
        tripStatus: status,
        monitoringActive:
          typeof monitoringActive === "boolean"
            ? monitoringActive
            : status === "ACTIVE",
      }));

      appendAlertLog({
        type: "SYSTEM",
        message: `Trip status changed to ${status}`,
        severity: status === "ACTIVE" ? "low" : status === "END_TRIP" ? "medium" : "low",
        timestamp: new Date().toISOString(),
      });
    },
    [appendAlertLog],
  );

  const updateDrowsiness = useCallback(
    ({
      level,
      eyeClosure,
      attention,
      riskScore = 0,
      fatigueScore = 0,
      distractionScore = 0,
      confidence = 0,
      reason = "model_update",
      blinkRatePerMinute = 0,
      eyeClosureSeconds = 0,
      yaw = 0,
      pitch = 0,
      roll = 0,
      faceDetected = true,
      distractionReason = "",
      closureState = "open",
      microsleepDetected = false,
      frequentBlinking = false,
    }: {
      level: DrowsinessLevel;
      eyeClosure: number;
      attention: number;
      riskScore?: number;
      fatigueScore?: number;
      distractionScore?: number;
      confidence?: number;
      reason?: string;
      blinkRatePerMinute?: number;
      eyeClosureSeconds?: number;
      yaw?: number;
      pitch?: number;
      roll?: number;
      faceDetected?: boolean;
      distractionReason?: string;
      closureState?: string;
      microsleepDetected?: boolean;
      frequentBlinking?: boolean;
    }) => {
      const timestamp = new Date().toISOString();
      setState((prev) => ({
        ...prev,
        drowsiness: {
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
          distractionReason,
          closureState,
          microsleepDetected,
          frequentBlinking,
          updatedAt: timestamp,
        },
      }));

      if (level !== "NORMAL") {
        appendAlertLog({
          type: "DROWSINESS",
          message: `${reason || "Drowsiness"} (${level.toLowerCase()})`,
          severity: level === "CRITICAL" ? "danger" : "medium",
          timestamp,
        });
      }
    },
    [appendAlertLog],
  );

  const updateRouteAlert = useCallback(
    ({ severity, message }: { severity: "low" | "medium" | "danger"; message: string }) => {
      const timestamp = new Date().toISOString();
      setState((prev) => ({
        ...prev,
        routeAlert: {
          severity,
          message,
          updatedAt: timestamp,
        },
      }));

      appendAlertLog({
        type: "ROUTE_ALERT",
        message,
        severity,
        timestamp,
      });
    },
    [appendAlertLog],
  );

  const resetLifecycle = useCallback(() => {
    setState(initialState);
  }, []);

  const value = useMemo<TripLifecycleContextValue>(
    () => ({
      ...state,
      setTripContext,
      updateTripStatus,
      updateDrowsiness,
      updateRouteAlert,
      appendAlertLog,
      resetLifecycle,
    }),
    [
      state,
      setTripContext,
      updateTripStatus,
      updateDrowsiness,
      updateRouteAlert,
      appendAlertLog,
      resetLifecycle,
    ],
  );

  return (
    <TripLifecycleContext.Provider value={value}>
      {children}
    </TripLifecycleContext.Provider>
  );
};

export const useTripLifecycle = () => {
  const context = useContext(TripLifecycleContext);
  if (!context) {
    throw new Error("useTripLifecycle must be used inside TripLifecycleProvider");
  }

  return context;
};
