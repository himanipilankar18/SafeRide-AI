import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CarFront, LocateFixed, UserRound } from "lucide-react";
import L from "leaflet";
import { MapContainer, Marker, TileLayer } from "react-leaflet";
import type { JoinedRidePayload } from "@/screens/PassengerJoinRideScreen";

interface PassengerRideLiveScreenProps {
  ride: JoinedRidePayload;
}

const driverIcon = L.divIcon({
  className: "",
  html: '<div style="width:18px;height:18px;border-radius:9999px;background:#16a34a;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

const PassengerRideLiveScreen = ({ ride }: PassengerRideLiveScreenProps) => {
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(
    ride.lat !== null && ride.lng !== null ? { lat: ride.lat, lng: ride.lng } : null
  );
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [status, setStatus] = useState("Waiting for live location...");

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
    let cancelled = false;

    const loadStatus = async () => {
      try {
        const response = await fetch(`${apiBase}/rides/status/${ride.otpCode}`);
        const data = await response.json();

        if (cancelled || !response.ok || !data?.success || !data?.ride) {
          return;
        }

        if (data.ride.current_lat !== null && data.ride.current_lng !== null) {
          setDriverLocation({
            lat: Number(data.ride.current_lat),
            lng: Number(data.ride.current_lng),
          });
          setUpdatedAt(data.ride.location_updated_at || null);
          setStatus("Driver location is live");
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

  const center = driverLocation || { lat: 12.9716, lng: 77.5946 };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative h-full overflow-hidden bg-black"
    >
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
          {driverLocation && <Marker position={[driverLocation.lat, driverLocation.lng]} icon={driverIcon} />}
        </MapContainer>
      </div>

      <div className="absolute inset-x-4 top-4 z-[1000] rounded-3xl border border-white/20 bg-black/60 p-4 text-white backdrop-blur">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">Ride Joined</p>
        <div className="mt-2 flex items-center gap-3">
          <div className="h-14 w-14 overflow-hidden rounded-xl border border-white/20 bg-white/10">
            {ride.faceImage ? (
              <img src={ride.faceImage} alt="Driver" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <UserRound size={24} className="text-white/70" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{ride.driverName}</p>
            <p className="truncate text-xs text-white/80">{ride.carModel}</p>
            <p className="truncate text-xs text-white/80">{ride.carNumber}</p>
          </div>
        </div>
      </div>

      <div className="absolute inset-x-4 bottom-4 z-[1000] rounded-3xl border border-border bg-card/95 p-4 text-foreground shadow-xl">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <CarFront size={16} className="text-primary" />
          Driver Live Location
        </div>
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <LocateFixed size={14} className="text-primary" />
          {driverLocation ? `${driverLocation.lat.toFixed(5)}, ${driverLocation.lng.toFixed(5)}` : "Waiting for GPS..."}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{status}</p>
        {updatedAt && <p className="mt-1 text-[11px] text-muted-foreground">Updated: {new Date(updatedAt).toLocaleTimeString()}</p>}
      </div>
    </motion.div>
  );
};

export default PassengerRideLiveScreen;
