import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ExternalLink, MapPin, Phone, Wrench } from "lucide-react";
import AppLogo from "@/components/AppLogo";
import type { LatLng } from "@/lib/navigationSafety";
import { MapContainer, Marker, TileLayer } from "react-leaflet";
import L from "leaflet";

interface DriverFindGarageScreenProps {
  onBackToHome: () => void;
}

type GarageView = {
  garageId: string;
  name: string;
  phone: string;
  address: string;
  lat: number;
  lng: number;
  services: string[];
  distanceKm: number | null;
  distanceToRouteKm: number | null;
};

type GarageDirectionsTarget = {
  lat: number;
  lng: number;
};

const myLocationIcon = L.divIcon({
  className: "",
  html: `
    <div style="position:relative;width:26px;height:26px;display:grid;place-items:center;">
      <div style="position:absolute;width:26px;height:26px;border-radius:9999px;background:rgba(16,185,129,.25);"></div>
      <div style="width:12px;height:12px;border-radius:9999px;background:#10b981;border:2px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.35);"></div>
    </div>`,
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

const garageIcon = L.divIcon({
  className: "",
  html: `
    <div style="position:relative;width:24px;height:24px;display:grid;place-items:center;">
      <div style="width:24px;height:24px;border-radius:9999px;background:#f8fafc;border:2px solid #0f172a;box-shadow:0 1px 6px rgba(0,0,0,.25);"></div>
      <div style="position:absolute;font-size:12px;line-height:1;">🛠️</div>
    </div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const DriverFindGarageScreen = ({ onBackToHome }: DriverFindGarageScreenProps) => {
  const [location, setLocation] = useState<LatLng | null>(null);
  const [garageSource, setGarageSource] = useState<"online" | "offline-cache" | "ride-route" | "demo-nearby">("online");
  const [nearbyGarages, setNearbyGarages] = useState<GarageView[]>([]);
  const [statusText, setStatusText] = useState("Finding nearby garages...");
  const [locationError, setLocationError] = useState<string | null>(null);

  const apiBase = useMemo(() => {
    const configured = import.meta.env.VITE_API_BASE_URL;
    if (typeof configured === "string" && configured.trim()) {
      const clean = configured.trim().replace(/\/$/, "");
      return clean.endsWith("/api") ? clean : `${clean}/api`;
    }
    return `${window.location.protocol}//${window.location.hostname}:5001/api`;
  }, []);

  const driverPhone = useMemo(
    () => localStorage.getItem("phoneNumber") || "driver-demo",
    [],
  );

  const mapCenter = useMemo(
    () => location || (nearbyGarages[0] ? { lat: nearbyGarages[0].lat, lng: nearbyGarages[0].lng } : null),
    [location, nearbyGarages],
  );

  useEffect(() => {
    let cancelled = false;

    const loadNearby = async (point: LatLng) => {
      try {
        setStatusText("Finding garages near your current location...");

        const url = new URL(`${apiBase}/garages/discover`);
        url.searchParams.set("lat", String(point.lat));
        url.searchParams.set("lng", String(point.lng));
        url.searchParams.set("limit", "8");
        url.searchParams.set("driverPhone", driverPhone);
        url.searchParams.set("preferNearby", "true");

        const response = await fetch(url.toString());
        const data = await response.json();

        if (!response.ok || !data?.success) {
          throw new Error(data?.message || "Could not fetch nearby garages");
        }

        if (cancelled) {
          return;
        }

        const garages = Array.isArray(data.garages) ? data.garages : [];
        setNearbyGarages(garages);
        setGarageSource(data.source || "online");
        setStatusText(
          data.source === "ride-route"
            ? "Showing garages saved for your active ride route."
            : data.source === "demo-nearby"
              ? "Demo mode: showing sample garages near your current location."
            : data.source === "online"
              ? "Showing live garages nearest to your location."
              : "Offline mode: showing cached garages nearest to you.",
        );
        setLocationError(null);
      } catch (error) {
        if (cancelled) {
          return;
        }
        setNearbyGarages([]);
        setLocationError(
          error instanceof Error
            ? error.message
            : "Could not fetch garages for your location.",
        );
        setStatusText("Unable to fetch garages right now.");
      }
    };

    if (!navigator.geolocation) {
      setLocationError("Location is unavailable on this device. Enable GPS to discover nearest garages.");
      setStatusText("Location required to find nearby garages.");
      return () => {
        cancelled = true;
      };
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const point = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        if (cancelled) {
          return;
        }

        setLocation(point);
        await loadNearby(point);
      },
      async () => {
        if (cancelled) {
          return;
        }
        setLocation(null);
        setNearbyGarages([]);
        setLocationError("Location permission denied or unavailable. Turn on location to see garages near you.");
        setStatusText("Location permission needed to find nearby garages.");
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
      },
    );

    return () => {
      cancelled = true;
    };
  }, [apiBase, driverPhone]);

  const callGarage = (phone: string) => {
    if (!phone || phone.toLowerCase().includes("unavailable")) {
      return;
    }
    window.location.href = `tel:${phone}`;
  };

  const openDirections = (garage: GarageDirectionsTarget) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${garage.lat},${garage.lng}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="h-full overflow-y-auto bg-[linear-gradient(180deg,#f8fafc_0%,#f1f5f9_45%,#e2e8f0_100%)]"
    >
      <div className="px-5 pt-10 pb-28">
        <div className="mb-5 flex items-center justify-between">
          <AppLogo showText />
          <button
            type="button"
            onClick={onBackToHome}
            className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
          >
            Back Home
          </button>
        </div>

        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_8px_22px_rgba(15,23,42,0.08)]">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-black text-slate-900">Find Garage</h2>
              <p className="text-xs text-slate-500">Get nearby support points in one clean view.</p>
            </div>
            <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-emerald-700">
              {garageSource === "ride-route"
                ? "Route"
                : garageSource === "demo-nearby"
                  ? "Demo"
                : garageSource === "online"
                  ? "Live"
                  : "Offline"}
            </span>
          </div>
          <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-xs font-medium text-slate-600">{statusText}</p>
          {locationError && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
              {locationError}
            </p>
          )}
        </div>

        {mapCenter && (
          <div className="overflow-hidden rounded-2xl border border-slate-300/70 bg-white shadow-[0_10px_26px_rgba(15,23,42,0.12)]">
            <div className="h-52">
              <MapContainer
                center={[mapCenter.lat, mapCenter.lng]}
                zoom={14}
                className="h-full w-full"
                zoomControl={false}
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution="&copy; OpenStreetMap contributors"
                />
                {location && <Marker position={[location.lat, location.lng]} icon={myLocationIcon} />}
                {nearbyGarages.map((entry) => (
                  <Marker
                    key={entry.garageId}
                    position={[entry.lat, entry.lng]}
                    icon={garageIcon}
                  />
                ))}
              </MapContainer>
            </div>
          </div>
        )}

        <div className="mt-4 space-y-3">
          {nearbyGarages.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
              {locationError || "Searching garages near your location..."}
            </div>
          ) : (
            nearbyGarages.map((entry) => (
              <div
                key={entry.garageId}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_6px_20px_rgba(15,23,42,0.08)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-slate-900">{entry.name}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{entry.address}</p>
                    <p className="mt-1 text-xs font-semibold text-emerald-700">
                      {entry.distanceKm !== null ? `${entry.distanceKm.toFixed(1)} km away` : "Distance unavailable"}
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-100 p-2">
                    <Wrench size={16} className="text-slate-700" />
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => callGarage(entry.phone)}
                    className="inline-flex items-center justify-center gap-1 rounded-xl border border-slate-300 bg-white py-2 text-xs font-semibold text-slate-800"
                  >
                    <Phone size={13} />
                    Call
                  </button>
                  <button
                    type="button"
                    onClick={() => openDirections({ lat: entry.lat, lng: entry.lng })}
                    className="inline-flex items-center justify-center gap-1 rounded-xl bg-slate-900 py-2 text-xs font-semibold text-slate-100"
                  >
                    <ExternalLink size={13} />
                    Directions
                  </button>
                </div>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(entry.services || []).slice(0, 3).map((service) => (
                    <span
                      key={`${entry.garageId}-${service}`}
                      className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700"
                    >
                      <MapPin size={10} className="mr-1 inline" />
                      {service}
                    </span>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default DriverFindGarageScreen;
