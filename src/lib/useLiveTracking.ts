import { useEffect, useRef, useCallback } from "react";

export interface LocationUpdate {
  lat: number;
  lng: number;
}

export interface DeviationAlert {
  severity: "warning" | "danger";
  message: string;
  location: LocationUpdate;
  riskScore: number;
  trend: "closer" | "flat" | "away";
}

export interface LiveTrackingEvent {
  type:
    | "TRIP_STATUS"
    | "DROWSINESS"
    | "ROUTE_ALERT"
    | "location_update"
    | "deviation_alert"
    | "driver_alert"
    | "trip_joined"
    | "user_disconnected"
    | "trip_complete"
    | "trip_started"
    | "trip_ended"
    | "error";
  tripId?: string;
  location?: LocationUpdate;
  severity?: string;
  level?: string;
  message?: string;
  status?: string;
  monitoringActive?: boolean;
  eyeClosure?: number;
  attention?: number;
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
  fatigueFlags?: {
    closureState?: string;
    microsleep?: boolean;
    frequentBlinking?: boolean;
    lowEar?: boolean;
    [key: string]: unknown;
  };
  distractionReason?: string;
  riskScore?: number;
  trend?: string;
  details?: {
    minDistanceMeters?: number;
    routeDeviationScore?: number;
    [key: string]: unknown;
  };
  risk?: {
    isDeviation?: boolean;
    level?: string;
    routeDeviationScore?: number;
    minDistanceMeters?: number;
    [key: string]: unknown;
  };
}

const WS_URL = import.meta.env.VITE_WS_BASE_URL || "ws://localhost:5001";

export const useLiveTracking = (
  tripId: string,
  role: "driver" | "passenger",
) => {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;

  const send = useCallback(
    (type: string, data?: any) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type,
            tripId,
            role,
            data,
          }),
        );
      }
    },
    [tripId, role],
  );

  const connect = useCallback(
    (
      onMessage: (event: LiveTrackingEvent) => void,
      onError: (error: string) => void,
    ) => {
      return new Promise<void>((resolve, reject) => {
        try {
          wsRef.current = new WebSocket(WS_URL);

          wsRef.current.onopen = () => {
            console.log(`🟢 WebSocket connected for ${role}`);
            reconnectAttemptsRef.current = 0;
            send("join_trip");
            resolve();
          };

          wsRef.current.onmessage = (event) => {
            try {
              const message = JSON.parse(event.data);
              onMessage(message);
            } catch (error) {
              console.error("Error parsing WebSocket message:", error);
            }
          };

          wsRef.current.onerror = (error) => {
            console.error("WebSocket error:", error);
            onError("WebSocket connection error");
            reject(error);
          };

          wsRef.current.onclose = () => {
            console.log(`🔴 WebSocket disconnected for ${role}`);

            // Auto-reconnect with exponential backoff
            if (reconnectAttemptsRef.current < maxReconnectAttempts) {
              const delay = Math.min(
                1000 * Math.pow(2, reconnectAttemptsRef.current),
                10000,
              );
              reconnectAttemptsRef.current += 1;
              console.log(
                `Reconnecting in ${delay}ms... (attempt ${reconnectAttemptsRef.current})`,
              );
              setTimeout(() => {
                connect(onMessage, onError).catch(console.error);
              }, delay);
            }
          };
        } catch (error) {
          console.error("Error creating WebSocket:", error);
          reject(error);
        }
      });
    },
    [send, role],
  );

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  return {
    connect,
    disconnect,
    send,
    isConnected: wsRef.current?.readyState === WebSocket.OPEN,
  };
};
