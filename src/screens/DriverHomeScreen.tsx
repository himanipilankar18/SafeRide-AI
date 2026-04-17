import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { MapPin, Bell, PlusCircle } from "lucide-react";
import { Wrench } from "lucide-react";
import AppLogo from "@/components/AppLogo";
import { LatLng } from "@/lib/navigationSafety";
import { reverseGeocodePlace } from "@/lib/placeSearch";
import {
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";

interface DriverHomeScreenProps {
  onGoOnline: () => void;
  onOpenFindGarage: () => void;
}

const deviceLocationIcon = L.divIcon({
  className: "",
  html: `
    <div style="position:relative;width:34px;height:34px;display:grid;place-items:center;">
      <div style="position:absolute;width:34px;height:34px;border-radius:9999px;background:rgba(37,99,235,.16);"></div>
      <div style="position:absolute;left:12px;top:-6px;width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:16px solid rgba(37,99,235,.85);transform-origin:5px 23px;transform:rotate(0deg);filter:drop-shadow(0 1px 3px rgba(0,0,0,.35));"></div>
      <div style="width:16px;height:16px;border-radius:9999px;background:#2563eb;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.4);"></div>
    </div>`,
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

const FollowDevice = ({
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

const DriverHomeScreen = ({
  onGoOnline,
  onOpenFindGarage,
}: DriverHomeScreenProps) => {
  const fallbackCenter = useMemo<LatLng>(
    () => ({ lat: 12.9716, lng: 77.5946 }),
    [],
  );
  const [currentLocation, setCurrentLocation] = useState<LatLng | null>(null);
  const [initialCenter, setInitialCenter] = useState<LatLng | null>(null);
  const [shouldFollowMap, setShouldFollowMap] = useState(true);
  const [locationLabel, setLocationLabel] = useState("Finding your place...");
  const [locationStatus, setLocationStatus] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const watchIdRef = useRef<number | null>(null);
  const reverseGeoMetaRef = useRef<{
    timestamp: number;
    location: LatLng | null;
  }>({
    timestamp: 0,
    location: null,
  });

  const haversineMeters = (a: LatLng, b: LatLng) => {
    const toRadians = (value: number) => (value * Math.PI) / 180;
    const earthRadiusMeters = 6371000;
    const dLat = toRadians(b.lat - a.lat);
    const dLng = toRadians(b.lng - a.lng);

    const q =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRadians(a.lat)) *
        Math.cos(toRadians(b.lat)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    return 2 * earthRadiusMeters * Math.asin(Math.sqrt(q));
  };

  useEffect(() => {
    if (!navigator.geolocation) {
      setCurrentLocation(fallbackCenter);
      setInitialCenter(fallbackCenter);
      setLocationStatus("error");
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

        setCurrentLocation(location);
        setInitialCenter(location);
        setLocationStatus("ready");

        watchIdRef.current = navigator.geolocation.watchPosition(
          (livePosition) => {
            const liveLocation = {
              lat: livePosition.coords.latitude,
              lng: livePosition.coords.longitude,
            };

            setCurrentLocation(liveLocation);
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
      },
      (error) => {
        if (cancelled) return;

        console.error("Geolocation error:", error);
        setCurrentLocation(fallbackCenter);
        setInitialCenter(fallbackCenter);
        setLocationStatus("error");
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      },
    );

    return () => {
      cancelled = true;
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [fallbackCenter]);

  useEffect(() => {
    if (!currentLocation) {
      return;
    }

    const last = reverseGeoMetaRef.current;
    const now = Date.now();
    const hasRecentLookup = now - last.timestamp < 15000;
    const movedMeters = last.location
      ? haversineMeters(last.location, currentLocation)
      : Number.POSITIVE_INFINITY;

    if (hasRecentLookup && movedMeters < 40) {
      return;
    }

    let cancelled = false;

    const runLookup = async () => {
      const placeName = await reverseGeocodePlace(currentLocation);
      if (cancelled) {
        return;
      }

      reverseGeoMetaRef.current = {
        timestamp: Date.now(),
        location: currentLocation,
      };

      setLocationLabel(placeName || "Location name unavailable");
    };

    runLookup();

    return () => {
      cancelled = true;
    };
  }, [currentLocation]);

  if (!initialCenter) {
    return (
      <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top,_#f3f4f6,_#e5e7eb_65%,_#d1d5db)] text-slate-900">
        <div className="text-center">
          <div className="mb-2 text-[11px] uppercase tracking-[0.28em] text-slate-500">
            Locating Device
          </div>
          <div className="text-base font-semibold">
            {locationStatus === "loading"
              ? "Getting your GPS position..."
              : "Using fallback location"}
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative h-full overflow-hidden bg-slate-950"
    >
      <div className="absolute inset-0">
        <MapContainer
          center={[initialCenter.lat, initialCenter.lng]}
          zoom={16}
          className="h-full w-full"
          style={{ minHeight: "100%" }}
          zoomControl={false}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap contributors"
          />
          {currentLocation && (
            <Marker
              position={[currentLocation.lat, currentLocation.lng]}
              icon={deviceLocationIcon}
            />
          )}
          {currentLocation && (
            <FollowDevice
              position={currentLocation}
              enabled={shouldFollowMap}
              onUserPan={() => setShouldFollowMap(false)}
            />
          )}
        </MapContainer>
      </div>

      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.22)_0%,rgba(2,6,23,0.05)_35%,rgba(2,6,23,0.2)_100%)]" />

      <div className="pointer-events-none absolute inset-0 z-[1200]">
        <div className="absolute inset-x-5 top-10 flex items-center justify-between">
          <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-white/70 bg-white/55 px-3 py-2 shadow-sm backdrop-blur-xl">
            <AppLogo showText />
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-700">
              Driver
            </p>
          </div>
          <button className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full border border-white/70 bg-white/55 shadow-sm backdrop-blur-xl">
            <Bell size={16} className="text-slate-700" />
          </button>
        </div>

        <div className="absolute left-5 top-28 rounded-full border border-white/70 bg-white/55 px-3 py-1.5 text-[11px] font-semibold text-slate-700 shadow-sm backdrop-blur-xl">
          Live Map
        </div>

        <div className="absolute inset-x-5 bottom-24 space-y-3">
          <div className="pointer-events-auto rounded-2xl border border-white/75 bg-white/70 px-4 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.18)] backdrop-blur-xl">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100">
                <MapPin size={18} className="text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Live Device Location</p>
                <p className="text-xs leading-snug text-slate-500">
                  {currentLocation ? locationLabel : "Waiting for GPS..."}
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={onGoOnline}
            className="pointer-events-auto group w-full rounded-2xl border border-emerald-300 bg-emerald-500 px-4 py-4 text-left text-white shadow-[0_12px_26px_rgba(16,185,129,0.35)] transition-all hover:-translate-y-0.5 active:translate-y-0"
          >
            <div className="flex items-center gap-3">
              <PlusCircle size={20} />
              <div>
                <p className="text-base font-extrabold">Join a Ride</p>
                <p className="text-xs text-emerald-50">Start accepting nearby ride requests.</p>
              </div>
            </div>
          </button>

          <button
            onClick={onOpenFindGarage}
            className="pointer-events-auto w-full rounded-2xl border border-white/75 bg-white/70 px-4 py-4 text-left text-slate-900 shadow-[0_10px_22px_rgba(15,23,42,0.16)] backdrop-blur-xl transition-all hover:-translate-y-0.5 active:translate-y-0"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100">
                <Wrench size={18} className="text-slate-700" />
              </div>
              <div>
                <p className="text-base font-bold">Find Garage</p>
                <p className="text-xs text-slate-500">Open nearby garages and get quick support.</p>
              </div>
            </div>
          </button>

          <div className="pointer-events-auto rounded-2xl border border-white/75 bg-white/65 px-4 py-3 shadow-[0_8px_18px_rgba(15,23,42,0.14)] backdrop-blur-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Support Zone</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">Nearby garages within 5 km are one tap away.</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default DriverHomeScreen;
