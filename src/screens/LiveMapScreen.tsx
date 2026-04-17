import { useEffect, useState, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import { AlertTriangle, Phone, Navigation2, Activity } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  useLiveTracking,
  LiveTrackingEvent,
  DeviationAlert,
} from "@/lib/useLiveTracking";
import { LatLng, haversineKm } from "@/lib/navigationSafety";
import { Button } from "@/components/ui/button";

interface LiveMapScreenProps {
  tripId: string;
  userType: "driver" | "passenger";
  source: LatLng;
  destination: LatLng;
  onEmergency?: () => void;
  onEndRide?: () => void;
}

const driverMarkerIcon = L.divIcon({
  className: "",
  html: `<div style="width:24px;height:24px;background:url('data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22%23dc2626%22><path d=%22M12 2L8 8H16L12 2M4 9H20L18 20H6L4 9M12 12V17%22/></svg>') center/contain no-repeat;"></div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
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

const AutoCenter = ({
  position,
  enabled,
  onUserPan,
}: {
  position: LatLng;
  enabled: boolean;
  onUserPan: () => void;
}) => {
  const map = useMap();
  useMapEvents({
    dragstart: onUserPan,
  });

  useEffect(() => {
    if (enabled) {
      map.setView([position.lat, position.lng], map.getZoom(), {
        animate: true,
      });
    }
  }, [enabled, map, position]);

  return null;
};

const LiveMapScreen = ({
  tripId,
  userType,
  source,
  destination,
  onEmergency,
  onEndRide,
}: LiveMapScreenProps) => {
  const [currentLocation, setCurrentLocation] = useState<LatLng>(source);
  const [driverLocation, setDriverLocation] = useState<LatLng>(source);
  const [initialMapCenter, setInitialMapCenter] = useState<LatLng | null>(null);
  const [locationState, setLocationState] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [routePath, setRoutePath] = useState<[number, number][]>([
    [source.lat, source.lng],
  ]);
  const [alerts, setAlerts] = useState<DeviationAlert[]>([]);
  const [riskLevel, setRiskLevel] = useState<"safe" | "warning" | "danger">(
    "safe",
  );
  const [connectionStatus, setConnectionStatus] = useState<
    "connecting" | "connected" | "disconnected"
  >("connecting");
  const [shouldFollowVehicle, setShouldFollowVehicle] = useState(true);

  const { connect, disconnect, send, isConnected } = useLiveTracking(
    tripId,
    userType,
  );
  const watchIdRef = useRef<number | null>(null);
  const lastLocationSendRef = useRef(0);

  useEffect(() => {
    if (!navigator.geolocation) {
      setInitialMapCenter(source);
      setLocationState("error");
      return;
    }

    let cancelled = false;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (cancelled) return;

        const location = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        setInitialMapCenter(location);
        setLocationState("ready");

        if (userType === "driver") {
          setCurrentLocation(location);
        }
      },
      (error) => {
        if (cancelled) return;

        console.error("Geolocation error:", error);
        setInitialMapCenter(source);
        setLocationState("error");
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      },
    );

    return () => {
      cancelled = true;
    };
  }, [source, userType]);

  // Handle WebSocket messages
  const handleLiveTrackingMessage = (event: LiveTrackingEvent) => {
    switch (event.type) {
      case "location_update":
        if (userType === "passenger" && event.location) {
          setDriverLocation(event.location);
          setRoutePath((prev) =>
            [
              ...prev,
              [event.location.lat, event.location.lng] as [number, number],
            ].slice(-300),
          );

          if (event.risk?.isDeviation) {
            const severity =
              event.risk?.level === "high" ? "danger" : "warning";
            const score = Math.max(
              0,
              Math.min(
                100,
                Number(
                  typeof event.risk?.routeDeviationScore === "number"
                    ? event.risk.routeDeviationScore * 100
                    : 0,
                ),
              ),
            );

            const alert: DeviationAlert = {
              severity,
              message: "Route deviation detected",
              location: event.location,
              riskScore: score,
              trend: "away",
            };

            setAlerts((prev) => [alert, ...prev].slice(0, 5));
            setRiskLevel(severity);
          }
        }
        break;

      case "deviation_alert": {
        if (userType !== "passenger") {
          break;
        }

        const alert: DeviationAlert = {
          severity: event.severity as "warning" | "danger",
          message: event.message || "Route deviation detected",
          location: event.location || currentLocation,
          riskScore: event.riskScore || 0,
          trend: event.trend as "closer" | "flat" | "away",
        };

        setAlerts((prev) => [alert, ...prev].slice(0, 5));
        setRiskLevel(
          event.severity === "danger"
            ? "danger"
            : event.severity === "warning"
              ? "warning"
              : "safe",
        );
        break;
      }

      case "driver_alert": {
        if (userType !== "passenger") {
          break;
        }

        const isRouteDeviation = String(event.message || "")
          .toLowerCase()
          .includes("route deviation");

        if (!isRouteDeviation) {
          break;
        }

        const severity = event.level === "high" ? "danger" : "warning";
        const score = Math.max(
          0,
          Math.min(
            100,
            Number(
              typeof event.details?.routeDeviationScore === "number"
                ? event.details.routeDeviationScore * 100
                : 0,
            ),
          ),
        );

        const alert: DeviationAlert = {
          severity,
          message: event.message || "Route deviation detected",
          location: currentLocation,
          riskScore: score,
          trend: "away",
        };

        setAlerts((prev) => [alert, ...prev].slice(0, 5));
        setRiskLevel(severity);
        break;
      }

      case "trip_joined":
        console.log("✅ Joined trip:", event.tripId);
        setConnectionStatus("connected");
        break;

      case "user_disconnected":
        console.log("User disconnected:", event.message);
        break;

      case "trip_complete":
        console.log("🎉 Trip completed!");
        break;

      case "error":
        console.error("Error:", event.message);
        setConnectionStatus("disconnected");
        break;
    }
  };

  const handleError = (error: string) => {
    console.error("Live tracking error:", error);
    setConnectionStatus("disconnected");
  };

  // Initialize WebSocket connection
  useEffect(() => {
    connect(handleLiveTrackingMessage, handleError).catch(console.error);

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  // Driver: Track own GPS and broadcast location
  useEffect(() => {
    if (userType !== "driver" || !isConnected) return;

    if (!navigator.geolocation) {
      console.error("Geolocation not supported");
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const location = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        setCurrentLocation(location);

        // Send location update every 2 seconds
        const now = Date.now();
        if (now - lastLocationSendRef.current >= 2000) {
          send("location_update", { location });
          lastLocationSendRef.current = now;
        }
      },
      (error) => {
        console.error("Geolocation error:", error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      },
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [userType, isConnected, send]);

  const displayLocation =
    userType === "driver" ? currentLocation : driverLocation;
  const distanceToDestination = haversineKm(displayLocation, destination);
  const isArrived = distanceToDestination <= 0.1;

  if (!initialMapCenter) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-black text-white">
        <div className="text-center">
          <div className="mb-3 text-sm uppercase tracking-[0.3em] text-gray-400">
            Locating device
          </div>
          <div className="text-lg font-semibold">
            {locationState === "loading"
              ? "Getting your GPS position..."
              : "Using trip start location"}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen bg-black flex flex-col">
      {/* Full Screen Map */}
      <div className="flex-1 w-full h-full relative">
        <MapContainer
          center={[initialMapCenter.lat, initialMapCenter.lng]}
          zoom={16}
          className="w-full h-full"
          style={{ zIndex: 1 }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap contributors"
          />

          {/* Source marker */}
          <Marker position={[source.lat, source.lng]} icon={sourceMarkerIcon} />

          {/* Destination marker */}
          <Marker
            position={[destination.lat, destination.lng]}
            icon={destinationMarkerIcon}
          />

          {/* Driver/Vehicle marker */}
          <Marker
            position={[displayLocation.lat, displayLocation.lng]}
            icon={driverMarkerIcon}
          />

          {/* Route path */}
          {routePath.length > 1 && (
            <Polyline
              positions={routePath}
              color={riskLevel === "danger" ? "#dc2626" : "#2563eb"}
              weight={3}
            />
          )}

          {/* Auto-center on location */}
          <AutoCenter
            position={displayLocation}
            enabled={shouldFollowVehicle}
            onUserPan={() => setShouldFollowVehicle(false)}
          />
        </MapContainer>
      </div>

      {/* Top Status Bar */}
      <div className="absolute top-0 left-0 right-0 z-20 bg-gradient-to-b from-black/80 to-transparent p-4">
        <div className="flex justify-between items-start">
          {/* Connection Status */}
          <div
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${
              connectionStatus === "connected"
                ? "bg-green-500/20 text-green-400"
                : "bg-yellow-500/20 text-yellow-400"
            }`}
          >
            <div
              className={`w-2 h-2 rounded-full ${
                connectionStatus === "connected"
                  ? "bg-green-400"
                  : "bg-yellow-400"
              }`}
            />
            {connectionStatus === "connected"
              ? "Live tracking active"
              : "Connecting..."}
          </div>

          {/* Risk Level Badge */}
          <div
            className={`px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-2 ${
              riskLevel === "danger"
                ? "bg-red-500/20 text-red-400"
                : riskLevel === "warning"
                  ? "bg-yellow-500/20 text-yellow-400"
                  : "bg-green-500/20 text-green-400"
            }`}
          >
            {riskLevel === "danger" && <AlertTriangle size={16} />}
            {riskLevel === "danger"
              ? "DANGER"
              : riskLevel === "warning"
                ? "WARNING"
                : "SAFE"}
          </div>
        </div>
      </div>

      {/* Bottom Info Panel */}
      <div className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/95 to-transparent p-4">
        <div className="grid grid-cols-3 gap-4 mb-4">
          {/* Distance Info */}
          <div className="bg-gray-900/80 rounded-lg p-3">
            <div className="text-xs text-gray-400">Distance to destination</div>
            <div className="text-lg font-bold text-white">
              {distanceToDestination.toFixed(2)} km
            </div>
          </div>

          {/* Travel Distance */}
          <div className="bg-gray-900/80 rounded-lg p-3">
            <div className="text-xs text-gray-400 flex items-center gap-1">
              <Activity size={12} /> Travel distance
            </div>
            <div className="text-lg font-bold text-white">
              {(routePath.length * 0.01).toFixed(2)} km
            </div>
          </div>

          {/* Status */}
          <div className="bg-gray-900/80 rounded-lg p-3">
            <div className="text-xs text-gray-400">Status</div>
            <div className="text-lg font-bold text-white">
              {isArrived ? "Arrived! 🎉" : "In transit"}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button
            onClick={() => setShouldFollowVehicle(true)}
            variant="secondary"
            className="gap-2"
            size="sm"
          >
            <Navigation2 size={16} />
            Recenter
          </Button>
          <Button
            onClick={onEmergency}
            variant="destructive"
            className="flex-1 gap-2 bg-red-600 hover:bg-red-700"
            size="sm"
          >
            <Phone size={16} />
            Emergency
          </Button>
          {isArrived && (
            <Button
              onClick={onEndRide}
              variant="default"
              className="flex-1 gap-2 bg-green-600 hover:bg-green-700"
              size="sm"
            >
              <Navigation2 size={16} />
              End Ride
            </Button>
          )}
        </div>
      </div>

      {/* Live Alerts Stack */}
      <div className="absolute top-20 right-4 z-20 max-w-sm space-y-2">
        <AnimatePresence>
          {alerts.map((alert, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, x: 100 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 100 }}
              className={`p-3 rounded-lg text-sm font-medium ${
                alert.severity === "danger"
                  ? "bg-red-600/90 text-white border border-red-400"
                  : "bg-yellow-600/90 text-white border border-yellow-400"
              }`}
            >
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} />
                <div>
                  <div className="font-bold">
                    {alert.severity === "danger" ? "DEVIATION!" : "Warning"}
                  </div>
                  <div className="text-xs opacity-90">{alert.message}</div>
                  <div className="text-xs opacity-75 mt-1">
                    Risk: {alert.riskScore}%
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default LiveMapScreen;
