import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Clock, LocateFixed, Phone, Users, X } from "lucide-react";
import { LatLng, haversineKm } from "@/lib/navigationSafety";
import { TripConfig } from "@/screens/HomeScreen";
import { useLiveTracking } from "@/lib/useLiveTracking";
import L from "leaflet";
import { MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from "react-leaflet";

type MapMode = "3d" | "2d" | "offline";

const screenTransition = {
  duration: 0.66,
  ease: [0.22, 1, 0.36, 1],
};

interface MonitoringScreenProps {
  onEmergency: () => void;
  onNavigate: (screen: string) => void;
  tripConfig: TripConfig;
  onTripChange: (nextTrip: TripConfig) => void;
  hasActiveTrip?: boolean;
}

const sourcePinIcon = L.divIcon({
  className: "",
  html: '<div style="width:14px;height:14px;border-radius:9999px;background:#2563eb;border:2px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.35);"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

const destinationPinIcon = L.divIcon({
  className: "",
  html: '<div style="width:14px;height:14px;border-radius:9999px;background:#16a34a;border:2px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.35);"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

const makeVehicleIcon = (heading: number | null) =>
  L.divIcon({
    className: "",
    html: `
      <div style="position:relative;width:38px;height:38px;display:grid;place-items:center;">
        <div style="position:absolute;width:38px;height:38px;border-radius:9999px;background:rgba(37,99,235,.18);"></div>
        <div style="position:absolute;left:13px;top:-5px;width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:18px solid #2563eb;transform-origin:6px 24px;transform:rotate(${heading ?? 0}deg);filter:drop-shadow(0 2px 3px rgba(0,0,0,.35));"></div>
        <div style="width:17px;height:17px;border-radius:9999px;background:#2563eb;border:3px solid white;box-shadow:0 2px 9px rgba(0,0,0,.38);"></div>
      </div>`,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
  });

const fetchRoadRoute = async (from: LatLng, to: LatLng): Promise<[number, number][]> => {
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

    return coordinates.map((coord: [number, number]) => [coord[1], coord[0]] as [number, number]);
  } catch {
    return [];
  }
};

const FollowLocation = ({
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
      map.setView([position.lat, position.lng], map.getZoom(), { animate: true, duration: 0.6 });
    }
  }, [enabled, map, position.lat, position.lng]);

  return null;
};

const OfflineMap = () => (
  <div className="absolute inset-0 overflow-hidden bg-[#eef0ed]">
    <div className="absolute -left-10 top-16 h-16 w-[120%] rotate-[-14deg] rounded-full bg-white/90 shadow-inner" />
    <div className="absolute left-20 top-0 h-[120%] w-16 rotate-[28deg] rounded-full bg-white/90 shadow-inner" />
    <div className="absolute right-4 top-36 h-[90%] w-12 rotate-[-38deg] rounded-full bg-white/80 shadow-inner" />
    <div className="absolute left-1/2 top-[18%] h-[58%] w-5 -translate-x-1/2 rotate-[5deg] rounded-full bg-[#4f8df7]" />
    <div className="absolute left-[44%] top-[50%] h-32 w-5 rotate-[72deg] rounded-full bg-[#4f8df7]" />
    <div className="absolute left-[52%] top-[45%] rounded-md bg-[#2563eb] px-3 py-1 text-[11px] font-semibold text-white shadow-lg">
      toward destination
    </div>
  </div>
);

const EmptyRideState = ({ onNavigate }: { onNavigate: (screen: string) => void }) => (
  <div className="absolute inset-x-5 bottom-7 z-30 rounded-3xl bg-white px-5 py-5 text-gray-950 shadow-[0_-10px_30px_rgba(0,0,0,0.22)]">
    <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-gray-300" />
    <p className="text-xl font-extrabold">No ride active</p>
    <p className="mt-1 text-sm font-medium text-gray-500">Start from a route, join a ride, or pick up where you left off.</p>
    <div className="mt-5 grid grid-cols-2 gap-3">
      <button
        type="button"
        className="flex min-h-24 flex-col items-start justify-between rounded-2xl bg-gray-950 p-4 text-left text-white shadow-lg"
      >
        <Users size={22} />
        <span className="text-sm font-bold">Join a Ride</span>
      </button>
      <button
        type="button"
        onClick={() => onNavigate("summary")}
        className="flex min-h-24 flex-col items-start justify-between rounded-2xl border border-gray-200 bg-white p-4 text-left text-gray-950 shadow-lg"
      >
        <Clock size={22} />
        <span className="text-sm font-bold">Previous Rides</span>
      </button>
    </div>
    <button
      type="button"
      onClick={() => onNavigate("home")}
      className="mt-3 w-full rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground"
    >
      Start a New Ride
    </button>
  </div>
);

const MonitoringScreen = ({
  onEmergency,
  onNavigate,
  tripConfig,
  onTripChange,
  hasActiveTrip = true,
}: MonitoringScreenProps) => {
  const [currentLocation, setCurrentLocation] = useState<LatLng>(tripConfig.source);
  const [routePath, setRoutePath] = useState<[number, number][]>([[tripConfig.source.lat, tripConfig.source.lng]]);
  const [expectedRoute, setExpectedRoute] = useState<[number, number][]>([]);
  const [mode, setMode] = useState<MapMode>("3d");
  const [heading, setHeading] = useState<number | null>(null);
  const [followVehicle, setFollowVehicle] = useState(true);
  const [locationError, setLocationError] = useState<string | null>(null);

  const tripId = useMemo(() => `trip_${Date.now()}`, []);
  const { connect, disconnect, send } = useLiveTracking(tripId, "driver");
  const watchIdRef = useRef<number | null>(null);
  const lastSendRef = useRef(0);

  useEffect(() => {
    connect(
      (event) => {
        if (event.type === "trip_complete") {
          onNavigate("summary");
        }
      },
      (error) => console.error("Live tracking error:", error),
    ).catch(console.error);

    return () => disconnect();
  }, [connect, disconnect, onNavigate]);

  useEffect(() => {
    let cancelled = false;

    fetchRoadRoute(tripConfig.source, tripConfig.destination).then((route) => {
      if (!cancelled) {
        setExpectedRoute(route);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [tripConfig.source, tripConfig.destination]);

  useEffect(() => {
    setCurrentLocation(tripConfig.source);
    setRoutePath([[tripConfig.source.lat, tripConfig.source.lng]]);
    setLocationError(null);
  }, [tripConfig.source]);

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationError("Location unavailable");
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const livePoint = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        setCurrentLocation(livePoint);
        setRoutePath((prev) => [...prev, [livePoint.lat, livePoint.lng]].slice(-500));
        setLocationError(null);

        if (typeof position.coords.heading === "number" && Number.isFinite(position.coords.heading)) {
          setHeading(position.coords.heading);
        }

        const now = Date.now();
        if (now - lastSendRef.current > tripConfig.sampleIntervalSec * 1000) {
          send("location_update", { location: livePoint });
          lastSendRef.current = now;
        }
      },
      (error) => setLocationError(error.message || "Location unavailable"),
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      },
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [send, tripConfig.sampleIntervalSec]);

  useEffect(() => {
    type CompassOrientationEvent = DeviceOrientationEvent & {
      webkitCompassHeading?: number;
    };

    const handleOrientation = (event: CompassOrientationEvent) => {
      const compassHeading =
        typeof event.webkitCompassHeading === "number"
          ? event.webkitCompassHeading
          : typeof event.alpha === "number"
            ? 360 - event.alpha
            : null;

      if (compassHeading !== null && Number.isFinite(compassHeading)) {
        setHeading(compassHeading);
      }
    };

    window.addEventListener("deviceorientation", handleOrientation);
    return () => window.removeEventListener("deviceorientation", handleOrientation);
  }, []);

  const vehicleIcon = useMemo(() => makeVehicleIcon(heading), [heading]);
  const distanceToDestination = haversineKm(currentLocation, tripConfig.destination);
  const etaMinutes = Math.max(1, Math.round(distanceToDestination * 3.2));
  const routeLine = expectedRoute.length > 0 ? expectedRoute : [[tripConfig.source.lat, tripConfig.source.lng], [tripConfig.destination.lat, tripConfig.destination.lng]];
  const mapTiltStyle =
    mode === "3d"
      ? {
          transform: "perspective(720px) rotateX(56deg) scale(1.45)",
          transformOrigin: "50% 72%",
        }
      : undefined;

  const handleUseCurrentAsSource = () => {
    onTripChange({
      ...tripConfig,
      source: currentLocation,
      sourceLabel: "Current location",
    });
    setFollowVehicle(true);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 26, scale: 1.035, filter: "blur(10px)" }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
      exit={{ opacity: 0, y: -18, scale: 0.985, filter: "blur(8px)" }}
      transition={screenTransition}
      className="absolute inset-0 overflow-hidden bg-black"
    >
      <div className="absolute inset-0 z-0">
        {mode === "offline" ? (
          <OfflineMap />
        ) : (
          <div className="absolute inset-0 z-0 overflow-hidden">
            <div className="absolute inset-0 z-0 transition-transform duration-700 ease-out" style={mapTiltStyle}>
              <MapContainer
                center={[currentLocation.lat, currentLocation.lng]}
                zoom={mode === "3d" ? 17 : 15}
                className="h-full w-full"
                style={{ zIndex: 0 }}
                zoomControl={false}
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; OpenStreetMap contributors'
                />
                <Polyline positions={routeLine} pathOptions={{ color: "#2563eb", weight: 8, opacity: 0.35 }} />
                <Polyline positions={routePath} pathOptions={{ color: "#2563eb", weight: 6, opacity: 0.95 }} />
                <Marker position={[tripConfig.source.lat, tripConfig.source.lng]} icon={sourcePinIcon} />
                <Marker position={[tripConfig.destination.lat, tripConfig.destination.lng]} icon={destinationPinIcon} />
                <Marker position={[currentLocation.lat, currentLocation.lng]} icon={vehicleIcon} />
                <FollowLocation
                  position={currentLocation}
                  enabled={followVehicle}
                  onUserPan={() => setFollowVehicle(false)}
                />
              </MapContainer>
            </div>
          </div>
        )}
      </div>

      {hasActiveTrip ? (
        <div className="absolute left-4 right-4 top-5 z-[1000]">
          <div className="rounded-2xl bg-black/65 px-4 py-3 text-white shadow-xl backdrop-blur-md border border-white/20">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/70">Ride Mode Active</p>
            <div className="mt-1 flex items-center justify-between gap-3">
              <p className="truncate text-sm font-bold">{tripConfig.sourceLabel}</p>
              <div className="h-px flex-1 bg-white/25" />
              <p className="truncate text-sm font-bold text-right">{tripConfig.destinationLabel}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="absolute left-4 right-4 top-5 z-[1000]">
          <div className="rounded-2xl bg-black/65 px-4 py-3 text-white shadow-xl backdrop-blur-md border border-white/20">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/70">Ride</p>
            <p className="mt-1 text-sm font-bold">Choose how to continue</p>
          </div>
        </div>
      )}

      <div className="absolute left-4 top-36 z-[1000] flex rounded-full bg-white/95 p-1 shadow-xl">
        {(["3d", "2d", "offline"] as MapMode[]).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setMode(item)}
            className={`rounded-full px-3 py-1.5 text-xs font-bold uppercase ${
              mode === item ? "bg-black text-white" : "text-gray-700"
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      {hasActiveTrip && <div className="absolute right-4 top-36 z-[1000] flex flex-col gap-3">
        <button
          type="button"
          onClick={() => {
            setFollowVehicle(true);
            handleUseCurrentAsSource();
          }}
          className="grid h-12 w-12 place-items-center rounded-full bg-white text-gray-900 shadow-xl"
          aria-label="Recenter"
        >
          <LocateFixed size={22} />
        </button>
      </div>}

      {hasActiveTrip && locationError && (
        <div className="absolute left-4 right-4 top-52 z-[1000] rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white shadow-xl">
          <AlertTriangle size={14} className="mr-2 inline" />
          {locationError}
        </div>
      )}

      {!hasActiveTrip ? (
        <EmptyRideState onNavigate={onNavigate} />
      ) : (
      <div className="absolute inset-x-0 bottom-0 z-[1100] rounded-t-3xl bg-white px-5 pb-5 pt-4 text-gray-950 shadow-[0_-10px_30px_rgba(0,0,0,0.22)]">
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-gray-300" />
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => onNavigate("home")}
            className="grid h-11 w-11 place-items-center rounded-full border border-gray-200 text-gray-700"
            aria-label="Close ride"
          >
            <X size={24} />
          </button>
          <div className="text-center">
            <p className="text-3xl font-extrabold text-[#08783c]">{etaMinutes} min</p>
            <p className="text-sm font-semibold text-gray-500">{distanceToDestination.toFixed(1)} km</p>
          </div>
          <button
            type="button"
            onClick={onEmergency}
            className="grid h-11 w-11 place-items-center rounded-full bg-red-600 text-white shadow-lg"
            aria-label="Emergency"
          >
            <Phone size={21} />
          </button>
        </div>
      </div>
      )}
    </motion.div>
  );
};

export default MonitoringScreen;
