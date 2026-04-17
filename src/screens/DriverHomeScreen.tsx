import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { MapPin, Bell, PlusCircle, UserRound } from "lucide-react";
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
  onOpenRoadsideHelp: () => void;
  onOpenRegistration: () => void;
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
  onOpenRoadsideHelp,
  onOpenRegistration,
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
      <div className="flex h-full items-center justify-center bg-black text-white">
        <div className="text-center">
          <div className="mb-3 text-sm uppercase tracking-[0.3em] text-gray-400">
            Locating device
          </div>
          <div className="text-lg font-semibold">
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
      className="relative h-full overflow-hidden bg-black"
    >
      <div className="absolute inset-0 z-0">
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
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/55" />
      </div>

      <div className="relative z-10 flex items-center justify-between px-6 pt-2 pb-4">
        <div className="flex items-center gap-2">
          <AppLogo showText />
          <p className="text-[10px] text-muted-foreground ml-1">Driver Mode</p>
        </div>
        <button className="w-9 h-9 rounded-full bg-card/85 backdrop-blur border border-border flex items-center justify-center">
          <Bell size={16} className="text-foreground" />
        </button>
      </div>

      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
        <div className="relative">
          <div className="w-4 h-4 rounded-full bg-primary border-[3px] border-primary-foreground" />
          <div className="absolute inset-0 w-4 h-4 rounded-full bg-primary/40 animate-pulse-ring" />
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 z-10">
        <div className="bg-card/90 backdrop-blur-xl rounded-t-3xl px-6 pt-6 pb-20 border-t border-border shadow-[0_-10px_30px_rgba(0,0,0,0.25)]">
          <div className="flex items-center justify-between mb-5">
            <div className="text-center">
              <p className="text-2xl font-extrabold text-foreground">4.9</p>
              <p className="text-[10px] text-muted-foreground">Rating</p>
            </div>
            <div className="w-px h-8 bg-border" />
            <div className="text-center">
              <p className="text-2xl font-extrabold text-foreground">12</p>
              <p className="text-[10px] text-muted-foreground">Rides Today</p>
            </div>
            <div className="w-px h-8 bg-border" />
            <div className="text-center">
              <p className="text-2xl font-extrabold text-safe">92</p>
              <p className="text-[10px] text-muted-foreground">Safety Score</p>
            </div>
          </div>

          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <MapPin size={20} className="text-primary" />
            </div>
            <div>
              <p className="font-semibold text-sm text-foreground">
                Live device location
              </p>
              <p className="text-xs text-muted-foreground max-w-[250px] leading-snug break-words">
                {currentLocation ? locationLabel : "Waiting for GPS..."}
              </p>
            </div>
          </div>

          <button
            onClick={onGoOnline}
            className="w-full py-4 rounded-2xl bg-safe text-safe-foreground font-bold text-base transition-transform active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <PlusCircle size={20} />
            Join a Ride
          </button>

          <button
            onClick={onOpenRoadsideHelp}
            className="mt-2 w-full py-3 rounded-2xl border border-border bg-background text-foreground font-semibold text-sm transition-transform active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <Wrench size={16} />
            Roadside Help
          </button>

          <button
            onClick={onOpenRegistration}
            className="mt-2 w-full py-3 rounded-2xl bg-foreground text-background font-semibold text-sm transition-transform active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <UserRound size={16} />
            Complete Registration
          </button>
        </div>
      </div>
    </motion.div>
  );
};

export default DriverHomeScreen;
