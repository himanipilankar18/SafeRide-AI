import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  CarFront,
  LocateFixed,
  Phone,
  UserRound,
} from "lucide-react";
import L from "leaflet";
import { MapContainer, Marker, Polyline, TileLayer } from "react-leaflet";
import type { JoinedRidePayload } from "@/screens/PassengerJoinRideScreen";
import {
  useLiveTracking,
  type DeviationAlert,
  type LiveTrackingEvent,
} from "@/lib/useLiveTracking";
import DriverDrowsinessPanel from "@/components/DriverDrowsinessPanel";
import { useTripLifecycle } from "@/context/TripLifecycleContext";

type LatLng = { lat: number; lng: number };

interface PassengerRideLiveScreenProps {
  ride: JoinedRidePayload;
  tripId?: string;
  onOpenEmergency?: () => void;
  onEndTrip?: (payload: {
    otpCode: string;
    finalLocation: LatLng | null;
    distanceKm: number;
    durationSec: number;
    driverPerformance?: {
      safetyScore: number;
      deviationAlerts: number;
      averageSpeedKmph: number;
      routeAdherencePercent: number;
      durationSec: number;
      distanceKm: number;
    };
  }) => Promise<void> | void;
}

type EmergencyContact = {
  name: string;
  phone: string;
  selectedForSos?: boolean;
};

const EMERGENCY_CONTACTS_KEY = "saferide_emergency_contacts";

const driverIcon = L.divIcon({
  className: "",
  html: '<div style="width:18px;height:18px;border-radius:9999px;background:#16a34a;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

const sourceMarkerIcon = L.divIcon({
  className: "",
  html: '<div style="width:14px;height:14px;border-radius:9999px;background:#2563eb;border:2px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.35);"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

const destinationMarkerIcon = L.divIcon({
  className: "",
  html: '<div style="width:14px;height:14px;border-radius:9999px;background:#16a34a;border:2px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.35);"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

const haversineKm = (a: LatLng, b: LatLng) => {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadius = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * earthRadius * Math.asin(Math.sqrt(h));
};

const fetchRoadRoute = async (
  from: LatLng,
  to: LatLng,
): Promise<[number, number][]> => {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
    const response = await fetch(url);
    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    const coordinates = data?.routes?.[0]?.geometry?.coordinates;
    if (!Array.isArray(coordinates)) {
      return [];
    }

    return coordinates.map(
      (coord: [number, number]) => [coord[1], coord[0]] as [number, number],
    );
  } catch {
    return [];
  }
};

const PassengerRideLiveScreen = ({
  ride,
  tripId,
  onOpenEmergency,
  onEndTrip,
}: PassengerRideLiveScreenProps) => {
  const {
    tripStatus,
    drowsiness,
    routeAlert,
    alertLogs,
    setTripContext,
    updateTripStatus,
    updateDrowsiness,
    updateRouteAlert,
    appendAlertLog,
  } = useTripLifecycle();
  const POLICE_PHONE = "+91112";
  const [rideDetails, setRideDetails] = useState<JoinedRidePayload>(ride);
  const [driverLocation, setDriverLocation] = useState<LatLng | null>(
    ride.lat !== null && ride.lng !== null
      ? { lat: ride.lat, lng: ride.lng }
      : null,
  );
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [status, setStatus] = useState("Waiting for driver to join OTP...");
  const [alerts, setAlerts] = useState<DeviationAlert[]>([]);
  const [riskLevel, setRiskLevel] = useState<"safe" | "warning" | "danger">(
    "safe",
  );
  const [connectionStatus, setConnectionStatus] = useState<
    "connecting" | "connected" | "disconnected"
  >("connecting");
  const [sourceLocation, setSourceLocation] = useState<LatLng | null>(
    ride.startLat !== null &&
      ride.startLat !== undefined &&
      ride.startLng !== null &&
      ride.startLng !== undefined
      ? { lat: Number(ride.startLat), lng: Number(ride.startLng) }
      : null,
  );
  const [destinationLocation, setDestinationLocation] = useState<LatLng | null>(
    ride.endLat !== null &&
      ride.endLat !== undefined &&
      ride.endLng !== null &&
      ride.endLng !== undefined
      ? { lat: Number(ride.endLat), lng: Number(ride.endLng) }
      : null,
  );
  const [expectedRoute, setExpectedRoute] = useState<[number, number][]>([]);
  const [travelPath, setTravelPath] = useState<[number, number][]>([]);
  const [isEndingTrip, setIsEndingTrip] = useState(false);

  const callNumber = (phone: string) => {
    if (!phone) {
      return;
    }
    window.location.href = `tel:${phone}`;
  };

  const startTimeRef = useRef(Date.now());

  const liveTripId = useMemo(
    () => tripId || ride.otpCode,
    [tripId, ride.otpCode],
  );
  const { connect, disconnect, isConnected } = useLiveTracking(
    liveTripId,
    "passenger",
  );

  const apiBase = useMemo(() => {
    const configured = import.meta.env.VITE_API_BASE_URL;
    if (typeof configured === "string" && configured.trim()) {
      const clean = configured.trim().replace(/\/$/, "");
      return clean.endsWith("/api") ? clean : `${clean}/api`;
    }

    const host = window.location.hostname;
    return `${window.location.protocol}//${host}:5001/api`;
  }, []);

  useEffect(() => {
    setTripContext({
      tripId: liveTripId,
      tripStatus,
      monitoringActive: tripStatus === "ACTIVE",
    });
  }, [liveTripId, setTripContext, tripStatus]);

  useEffect(() => {
    let cancelled = false;

    const loadStatus = async () => {
      try {
        const response = await fetch(`${apiBase}/rides/status/${ride.otpCode}`);
        const data = await response.json();

        if (cancelled || !response.ok || !data?.success || !data?.ride) {
          return;
        }

        const rideRow = data.ride;

        setRideDetails((prev) => ({
          ...prev,
          driverName: rideRow.driver_name || prev.driverName,
          carNumber: rideRow.car_number || prev.carNumber,
          carModel: rideRow.car_model || prev.carModel,
          faceImage: rideRow.face_image || prev.faceImage,
          lat: rideRow.current_lat ?? prev.lat,
          lng: rideRow.current_lng ?? prev.lng,
        }));

        if (rideRow.start_lat !== null && rideRow.start_lng !== null) {
          setSourceLocation({
            lat: Number(rideRow.start_lat),
            lng: Number(rideRow.start_lng),
          });
        }

        if (rideRow.end_lat !== null && rideRow.end_lng !== null) {
          setDestinationLocation({
            lat: Number(rideRow.end_lat),
            lng: Number(rideRow.end_lng),
          });
        }

        if (rideRow.driver_name) {
          setStatus("Driver joined. Credentials verified.");
        }

        if (rideRow.current_lat !== null && rideRow.current_lng !== null) {
          const point = {
            lat: Number(rideRow.current_lat),
            lng: Number(rideRow.current_lng),
          };

          setDriverLocation(point);
          setTravelPath((prev) =>
            [...prev, [point.lat, point.lng] as [number, number]].slice(-500),
          );
          setUpdatedAt(rideRow.location_updated_at || null);
          setStatus(
            rideRow.status === "completed"
              ? "Trip completed."
              : "Driver location is live",
          );
        }
      } catch {
        if (!cancelled) {
          setStatus("Trying to reconnect live location...");
        }
      }
    };

    loadStatus();
    const interval = window.setInterval(loadStatus, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [apiBase, ride.otpCode]);

  useEffect(() => {
    if (!sourceLocation || !destinationLocation) {
      return;
    }

    let cancelled = false;
    fetchRoadRoute(sourceLocation, destinationLocation).then((route) => {
      if (!cancelled) {
        setExpectedRoute(route);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [sourceLocation, destinationLocation]);

  useEffect(() => {
    const handleMessage = (event: LiveTrackingEvent) => {
      if (event.type === "TRIP_STATUS" && event.status) {
        updateTripStatus({
          status: String(event.status).toUpperCase() as
            | "IDLE"
            | "VERIFIED"
            | "OTP_VERIFIED"
            | "START_TRIP"
            | "ACTIVE"
            | "END_TRIP",
          monitoringActive: Boolean(event.monitoringActive),
        });
      }

      if (event.type === "DROWSINESS") {
        updateDrowsiness({
          level:
            event.level === "CRITICAL"
              ? "CRITICAL"
              : event.level === "WARNING"
                ? "WARNING"
                : "NORMAL",
          eyeClosure: Number(event.eyeClosure ?? 0),
          attention: Number(event.attention ?? 100),
          riskScore: Number(event.riskScore ?? 0),
          fatigueScore: Number(event.fatigueScore ?? event.eyeClosure ?? 0),
          distractionScore: Number(event.distractionScore ?? 0),
          confidence: Number(event.confidence ?? 0),
          reason: typeof event.reason === "string" ? event.reason : "model_update",
          blinkRatePerMinute: Number(event.blinkRatePerMinute ?? 0),
          eyeClosureSeconds: Number(event.eyeClosureSeconds ?? 0),
          yaw: Number(event.yaw ?? 0),
          pitch: Number(event.pitch ?? 0),
          roll: Number(event.roll ?? 0),
          faceDetected: Boolean(event.faceDetected),
          distractionReason:
            typeof event.distractionReason === "string"
              ? event.distractionReason
              : "",
          closureState:
            typeof event.fatigueFlags?.closureState === "string"
              ? event.fatigueFlags.closureState
              : "open",
          microsleepDetected: Boolean(event.fatigueFlags?.microsleep),
          frequentBlinking: Boolean(event.fatigueFlags?.frequentBlinking),
        });
      }

      if (event.type === "ROUTE_ALERT") {
        const severity =
          event.severity === "danger"
            ? "danger"
            : event.severity === "medium"
              ? "medium"
              : "low";

        updateRouteAlert({
          severity,
          message: event.message || "Route deviation detected",
        });
      }

      const isDirectDeviation = event.type === "deviation_alert";
      const isDriverDeviation =
        event.type === "driver_alert" &&
        String(event.message || "")
          .toLowerCase()
          .includes("route deviation");
      const isRiskDeviation =
        event.type === "location_update" && Boolean(event.risk?.isDeviation);

      if (isDirectDeviation || isDriverDeviation || isRiskDeviation) {
        const derivedSeverity =
          event.severity === "danger" ||
          event.level === "high" ||
          event.risk?.level === "high"
            ? "danger"
            : "warning";
        const derivedRiskScore = Math.max(
          0,
          Math.min(
            100,
            Number(
              event.riskScore ??
                (typeof event.risk?.routeDeviationScore === "number"
                  ? event.risk.routeDeviationScore * 100
                  : undefined) ??
                (typeof event.details?.routeDeviationScore === "number"
                  ? event.details.routeDeviationScore * 100
                  : 0),
            ),
          ),
        );

        const alert: DeviationAlert = {
          severity: derivedSeverity,
          message: event.message || "Route deviation detected",
          location: event.location || {
            lat: ride.lat ?? 0,
            lng: ride.lng ?? 0,
          },
          riskScore: derivedRiskScore,
          trend: event.trend as "closer" | "flat" | "away",
        };

        setAlerts([alert]);
        setRiskLevel(
          derivedSeverity === "danger"
            ? "danger"
            : derivedSeverity === "warning"
              ? "warning"
              : "safe",
        );
      }

      if (event.type === "trip_joined") {
        setConnectionStatus("connected");
        setStatus("Live route monitoring connected.");
      }

      if (event.type === "trip_complete") {
        setStatus("Trip completed.");
      }

      if (event.type === "trip_complete" || event.type === "trip_ended") {
        updateTripStatus({
          status: "END_TRIP",
          monitoringActive: false,
        });
      }
    };

    const handleError = () => {
      setConnectionStatus("disconnected");
    };

    connect(handleMessage, handleError).catch(() => {
      setConnectionStatus("disconnected");
    });

    return () => {
      disconnect();
    };
  }, [
    appendAlertLog,
    connect,
    disconnect,
    ride.lat,
    ride.lng,
    updateDrowsiness,
    updateRouteAlert,
    updateTripStatus,
  ]);

  useEffect(() => {
    if (isConnected) {
      setConnectionStatus("connected");
    }
  }, [isConnected]);

  const center = driverLocation ||
    sourceLocation || { lat: 12.9716, lng: 77.5946 };
  const routeLine =
    expectedRoute.length > 1
      ? expectedRoute
      : sourceLocation && destinationLocation
        ? ([
            [sourceLocation.lat, sourceLocation.lng],
            [destinationLocation.lat, destinationLocation.lng],
          ] as [number, number][])
        : [];

  const handleEndTrip = async () => {
    if (!onEndTrip || isEndingTrip) {
      return;
    }

    setIsEndingTrip(true);
    try {
      const finalLocation = driverLocation || sourceLocation || destinationLocation;

      const distanceKm = travelPath.length > 1
        ? travelPath.reduce((total, point, index) => {
            if (index === 0) {
              return 0;
            }

            const previous = {
              lat: travelPath[index - 1][0],
              lng: travelPath[index - 1][1],
            };
            const current = { lat: point[0], lng: point[1] };
            return total + haversineKm(previous, current);
          }, 0)
        : 0;

      const durationSec = Math.max(
        1,
        Math.round((Date.now() - startTimeRef.current) / 1000),
      );

      await onEndTrip({
        otpCode: rideDetails.otpCode,
        finalLocation,
        distanceKm,
        durationSec,
        driverPerformance: {
          safetyScore: riskLevel === "danger" ? 50 : riskLevel === "warning" ? 75 : 95,
          deviationAlerts: alerts.length,
          averageSpeedKmph: durationSec > 0 ? (distanceKm / durationSec) * 3600 : 0,
          routeAdherencePercent:
            riskLevel === "danger" ? 70 : riskLevel === "warning" ? 85 : 98,
          durationSec,
          distanceKm,
        },
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to end trip.");
    } finally {
      setIsEndingTrip(false);
    }
  };

  const isLifecycleActive = tripStatus === "ACTIVE";

  const drowsinessBadgeClass =
    drowsiness.level === "CRITICAL"
      ? "bg-red-100 text-red-700 border-red-300"
      : drowsiness.level === "WARNING"
        ? "bg-amber-100 text-amber-700 border-amber-300"
        : "bg-emerald-100 text-emerald-700 border-emerald-300";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative h-full overflow-hidden bg-black"
    >
      {isLifecycleActive ? (
        <div className="flex h-full snap-x snap-mandatory overflow-x-auto scroll-smooth">
          <section className="relative h-full w-full shrink-0 snap-start">
            <div className="absolute inset-0">
              <MapContainer
                center={[center.lat, center.lng]}
                zoom={15}
                className="h-full w-full"
                zoomControl={false}
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution="&copy; OpenStreetMap contributors"
                />

                {routeLine.length > 1 && (
                  <Polyline
                    positions={routeLine}
                    pathOptions={{ color: "#2563eb", weight: 7, opacity: 0.8 }}
                  />
                )}
                {travelPath.length > 1 && (
                  <Polyline
                    positions={travelPath}
                    pathOptions={{ color: "#22c55e", weight: 4, opacity: 0.95 }}
                  />
                )}

                {sourceLocation && (
                  <Marker
                    position={[sourceLocation.lat, sourceLocation.lng]}
                    icon={sourceMarkerIcon}
                  />
                )}
                {destinationLocation && (
                  <Marker
                    position={[destinationLocation.lat, destinationLocation.lng]}
                    icon={destinationMarkerIcon}
                  />
                )}
                {driverLocation && (
                  <Marker
                    position={[driverLocation.lat, driverLocation.lng]}
                    icon={driverIcon}
                  />
                )}
              </MapContainer>
            </div>

            <div className="absolute inset-x-4 top-4 z-[1000] rounded-3xl border border-white/20 bg-black/60 p-4 text-white backdrop-blur">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">
                Live Trip Map
              </p>
              <p className="mt-1 text-xs font-semibold text-primary-foreground/90">
                Swipe for Monitoring and Alerts
              </p>
              {routeAlert && (
                <p className="mt-2 rounded-lg bg-red-500/85 px-2 py-1 text-[11px] font-semibold">
                  {routeAlert.message}
                </p>
              )}
            </div>

            <div className="absolute inset-x-4 bottom-24 z-[1000] rounded-3xl border border-border bg-card/95 p-4 text-foreground shadow-xl">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <CarFront size={16} className="text-primary" />
                Navigation
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <LocateFixed size={14} className="text-primary" />
                {driverLocation
                  ? `${driverLocation.lat.toFixed(5)}, ${driverLocation.lng.toFixed(5)}`
                  : "Waiting for GPS..."}
              </div>
            </div>
          </section>

          <section className="h-full w-full shrink-0 snap-start overflow-y-auto bg-slate-950 px-4 pb-28 pt-4 text-white">
            <div className="rounded-3xl border border-white/15 bg-black/45 p-4 backdrop-blur">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">
                  Drowsiness Monitor
                </p>
                <span
                  className={`rounded-full border px-2 py-1 text-[11px] font-bold ${drowsinessBadgeClass}`}
                >
                  {drowsiness.level}
                </span>
              </div>

              <div className="mt-3">
                <DriverDrowsinessPanel
                  active={isLifecycleActive}
                  tripId={liveTripId}
                  onSample={(sample) => {
                    updateDrowsiness({
                      level: sample.state,
                      eyeClosure: Math.round(sample.fatigueScore * 100),
                      attention: Math.round(100 - sample.distractionScore * 100),
                      riskScore: sample.riskScore,
                      fatigueScore: Math.round(sample.fatigueScore * 100),
                      distractionScore: Math.round(sample.distractionScore * 100),
                      confidence: sample.confidence,
                      reason: sample.reason,
                      blinkRatePerMinute: sample.blinkRatePerMinute,
                      eyeClosureSeconds: sample.eyeClosureSeconds,
                      yaw: sample.yaw,
                      pitch: sample.pitch,
                      roll: sample.roll,
                      faceDetected: sample.faceDetected,
                      distractionReason: sample.distractionReason,
                      closureState: sample.closureState,
                      microsleepDetected: sample.microsleepDetected,
                      frequentBlinking: sample.frequentBlinking,
                    });
                  }}
                />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl bg-white/10 p-3">
                  <p className="text-[10px] uppercase tracking-[0.08em] text-white/60">
                    Eye Closure
                  </p>
                  <p className="mt-1 text-lg font-bold">
                    {Math.round(drowsiness.eyeClosure)}%
                  </p>
                </div>
                <div className="rounded-xl bg-white/10 p-3">
                  <p className="text-[10px] uppercase tracking-[0.08em] text-white/60">
                    Attention
                  </p>
                  <p className="mt-1 text-lg font-bold">
                    {Math.round(drowsiness.attention)}%
                  </p>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl bg-white/10 p-3">
                  <p className="text-[10px] uppercase tracking-[0.08em] text-white/60">
                    Blink Rate
                  </p>
                  <p className="mt-1 text-lg font-bold">
                    {drowsiness.blinkRatePerMinute.toFixed(1)} / min
                  </p>
                </div>
                <div className="rounded-xl bg-white/10 p-3">
                  <p className="text-[10px] uppercase tracking-[0.08em] text-white/60">
                    Closure Time
                  </p>
                  <p className="mt-1 text-lg font-bold">
                    {drowsiness.eyeClosureSeconds.toFixed(2)}s
                  </p>
                </div>
              </div>

              <div className="mt-3 rounded-xl bg-white/10 p-3 text-xs">
                <p className="text-[10px] uppercase tracking-[0.08em] text-white/60">
                  Head Pose (Yaw / Pitch / Roll)
                </p>
                <p className="mt-1 font-bold">
                  {drowsiness.yaw.toFixed(1)} / {drowsiness.pitch.toFixed(1)} / {drowsiness.roll.toFixed(1)}
                </p>
                <p className="mt-1 text-white/75">
                  {drowsiness.reason} {drowsiness.distractionReason ? `• ${drowsiness.distractionReason}` : ""}
                </p>
                <p className="mt-1 text-white/75">
                  closure: {drowsiness.closureState} • microsleep: {drowsiness.microsleepDetected ? "yes" : "no"}
                </p>
              </div>
            </div>
          </section>

          <section className="h-full w-full shrink-0 snap-start overflow-y-auto bg-zinc-950 px-4 pb-28 pt-4 text-white">
            <div className="rounded-3xl border border-white/15 bg-black/45 p-4 backdrop-blur">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">
                Alert Panel
              </p>

              <div className="mt-3 space-y-2">
                {alertLogs.length === 0 ? (
                  <p className="text-sm text-white/70">No alerts yet.</p>
                ) : (
                  alertLogs.map((entry) => (
                    <div
                      key={entry.id}
                      className={`rounded-xl border p-3 text-xs ${
                        entry.severity === "danger"
                          ? "border-red-400 bg-red-500/15"
                          : entry.severity === "medium"
                            ? "border-amber-400 bg-amber-500/15"
                            : "border-emerald-400 bg-emerald-500/10"
                      }`}
                    >
                      <p className="font-semibold">{entry.type}</p>
                      <p className="mt-1 text-white/85">{entry.message}</p>
                      <p className="mt-1 text-[10px] text-white/60">
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
        </div>
      ) : (
        <>
          <div className="absolute inset-0">
            <MapContainer
              center={[center.lat, center.lng]}
              zoom={15}
              className="h-full w-full"
              zoomControl={false}
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution="&copy; OpenStreetMap contributors"
              />

              {routeLine.length > 1 && (
                <Polyline
                  positions={routeLine}
                  pathOptions={{ color: "#2563eb", weight: 7, opacity: 0.8 }}
                />
              )}
              {travelPath.length > 1 && (
                <Polyline
                  positions={travelPath}
                  pathOptions={{ color: "#22c55e", weight: 4, opacity: 0.95 }}
                />
              )}

              {sourceLocation && (
                <Marker
                  position={[sourceLocation.lat, sourceLocation.lng]}
                  icon={sourceMarkerIcon}
                />
              )}
              {destinationLocation && (
                <Marker
                  position={[destinationLocation.lat, destinationLocation.lng]}
                  icon={destinationMarkerIcon}
                />
              )}
              {driverLocation && (
                <Marker
                  position={[driverLocation.lat, driverLocation.lng]}
                  icon={driverIcon}
                />
              )}
            </MapContainer>
          </div>

          <div className="absolute inset-x-4 top-4 z-[1000] rounded-3xl border border-white/20 bg-black/60 p-4 text-white backdrop-blur">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">
              OTP Ride
            </p>
            <p className="mt-1 text-xs font-semibold text-primary-foreground/90">
              OTP: {rideDetails.otpCode}
            </p>
            <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-white/80">
              <span className="rounded-full border border-white/15 bg-white/10 px-2 py-1">
                {connectionStatus === "connected"
                  ? "Route monitoring active"
                  : "Connecting route monitor..."}
              </span>
              <span className="rounded-full border border-white/15 bg-white/10 px-2 py-1">
                {riskLevel === "danger"
                  ? "Deviation alert"
                  : riskLevel === "warning"
                    ? "Route warning"
                    : "Route clear"}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-3">
              <div className="h-14 w-14 overflow-hidden rounded-xl border border-white/20 bg-white/10">
                {rideDetails.faceImage ? (
                  <img
                    src={rideDetails.faceImage}
                    alt="Driver"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <UserRound size={24} className="text-white/70" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{rideDetails.driverName}</p>
                <p className="truncate text-xs text-white/80">{rideDetails.carModel}</p>
                <p className="truncate text-xs text-white/80">{rideDetails.carNumber}</p>
              </div>
            </div>
          </div>

          <div className="absolute right-4 top-[7.5rem] z-[1001] max-w-[18rem] space-y-2">
            {alerts.map((alert, index) => (
              <motion.div
                key={`${alert.message}-${index}`}
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                className={`rounded-2xl border p-3 text-xs shadow-xl backdrop-blur ${
                  alert.severity === "danger"
                    ? "border-red-300 bg-red-600/90 text-white"
                    : "border-yellow-300 bg-yellow-500/90 text-white"
                }`}
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <div>
                    <p className="font-bold">
                      {alert.severity === "danger" ? "Route deviation" : "Route warning"}
                    </p>
                    <p className="opacity-95">{alert.message}</p>
                    <p className="mt-1 opacity-75">Risk {alert.riskScore}%</p>
                  </div>
                </div>
              </motion.div>
            ))}

            {alerts.length > 0 &&
              (riskLevel === "warning" || riskLevel === "danger") && (
                <motion.div
                  initial={{ opacity: 0, x: 40 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="rounded-2xl border border-red-300 bg-white/95 p-3 text-gray-900 shadow-xl"
                >
                  <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-red-600">
                    SOS Quick Actions
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={onOpenEmergency}
                      disabled={!onOpenEmergency}
                      className="rounded-lg bg-red-600 px-2 py-2 text-[11px] font-bold text-white disabled:opacity-60"
                    >
                      Open SOS
                    </button>
                    <button
                      type="button"
                      onClick={() => callNumber(POLICE_PHONE)}
                      className="rounded-lg border border-red-300 bg-red-50 px-2 py-2 text-[11px] font-bold text-red-700"
                    >
                      Call Police
                    </button>
                  </div>
                </motion.div>
              )}
          </div>

          <div className="absolute inset-x-4 bottom-24 z-[1000] rounded-3xl border border-border bg-card/95 p-4 text-foreground shadow-xl">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <CarFront size={16} className="text-primary" />
              Driver Live Location
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <LocateFixed size={14} className="text-primary" />
              {driverLocation
                ? `${driverLocation.lat.toFixed(5)}, ${driverLocation.lng.toFixed(5)}`
                : "Waiting for GPS..."}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{status}</p>
            {updatedAt && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Updated: {new Date(updatedAt).toLocaleTimeString()}
              </p>
            )}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onOpenEmergency}
                className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-xs font-bold text-red-700"
              >
                <Phone size={13} className="mr-1 inline" />
                SOS
              </button>
              <button
                type="button"
                onClick={handleEndTrip}
                disabled={!onEndTrip || isEndingTrip}
                className="rounded-xl bg-green-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
              >
                {isEndingTrip ? "Ending..." : "End Trip"}
              </button>
            </div>
          </div>
        </>
      )}
    </motion.div>
  );
};

export default PassengerRideLiveScreen;
