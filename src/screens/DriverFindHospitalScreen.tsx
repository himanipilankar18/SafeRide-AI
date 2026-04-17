import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Ambulance, ExternalLink, MapPin, Phone } from "lucide-react";
import AppLogo from "@/components/AppLogo";
import type { LatLng } from "@/lib/navigationSafety";
import { getNearbyHospitals } from "@/lib/roadsideSupport";
import { MapContainer, Marker, TileLayer } from "react-leaflet";
import L from "leaflet";

interface DriverFindHospitalScreenProps {
  onBackToEmergency: () => void;
}

type HospitalView = {
  hospitalId: string;
  name: string;
  phone: string;
  address: string;
  lat: number;
  lng: number;
  distanceKm: number | null;
};

type HospitalDirectionsTarget = {
  name: string;
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

const hospitalIcon = L.divIcon({
  className: "",
  html: `
    <div style="position:relative;width:24px;height:24px;display:grid;place-items:center;">
      <div style="width:24px;height:24px;border-radius:9999px;background:#fef2f2;border:2px solid #dc2626;box-shadow:0 1px 6px rgba(0,0,0,.25);"></div>
      <div style="position:absolute;font-size:11px;line-height:1;color:#dc2626;font-weight:700;">H</div>
    </div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const DriverFindHospitalScreen = ({
  onBackToEmergency,
}: DriverFindHospitalScreenProps) => {
  const [location, setLocation] = useState<LatLng | null>(null);
  const [hospitalSource, setHospitalSource] = useState<"online" | "offline-cache">("online");
  const [nearbyHospitals, setNearbyHospitals] = useState<HospitalView[]>([]);
  const [statusText, setStatusText] = useState("Finding nearby hospitals...");
  const [statusError, setStatusError] = useState<string | null>(null);

  const mapCenter = useMemo(() => location, [location]);

  useEffect(() => {
    let cancelled = false;

    const loadNearby = async (point: LatLng) => {
      try {
        setStatusText("Finding hospitals near your current location...");

        const { hospitals, source } = await getNearbyHospitals(point, 8);

        if (cancelled) {
          return;
        }

        const mappedHospitals: HospitalView[] = hospitals.map((entry) => ({
          hospitalId: entry.item.id,
          name: entry.item.name,
          phone: entry.item.phone,
          address: entry.item.address,
          lat: entry.item.location.lat,
          lng: entry.item.location.lng,
          distanceKm: entry.distanceKm,
        }));

        setNearbyHospitals(mappedHospitals);
        setHospitalSource(source);

        if (mappedHospitals.length === 0) {
          setStatusText("No hospitals found near your current location.");
          setStatusError("No nearby hospitals available right now. Try again in a moment.");
          return;
        }

        setStatusText(
          source === "online"
            ? "Showing live hospitals nearest to your location."
            : "Offline mode: showing cached hospitals nearest to you.",
        );
        setStatusError(null);
      } catch (error) {
        if (cancelled) {
          return;
        }
        setNearbyHospitals([]);
        setStatusError(
          error instanceof Error
            ? error.message
            : "Could not fetch hospitals for your location.",
        );
        setStatusText("Unable to fetch hospitals right now.");
      }
    };

    if (!navigator.geolocation) {
      setStatusError("Location is unavailable on this device. Enable GPS to discover nearest hospitals.");
      setStatusText("Location required to find nearby hospitals.");
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
        setNearbyHospitals([]);
        setStatusError("Location permission denied or unavailable. Turn on location to see hospitals near you.");
        setStatusText("Location permission needed to find nearby hospitals.");
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0,
      },
    );

    return () => {
      cancelled = true;
    };
  }, []);

  const callHospital = (phone: string) => {
    if (!phone || phone.toLowerCase().includes("unavailable")) {
      setStatusError("Phone number unavailable for this hospital.");
      return;
    }
    window.location.href = `tel:${phone}`;
  };

  const openDirections = (hospital: HospitalDirectionsTarget) => {
    setStatusError(
      `In-app simulation: directions to ${hospital.name} (${hospital.lat.toFixed(4)}, ${hospital.lng.toFixed(4)}). External map app not opened.`,
    );
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
            onClick={onBackToEmergency}
            className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
          >
            Back SOS
          </button>
        </div>

        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_8px_22px_rgba(15,23,42,0.08)]">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-black text-slate-900">Find Hospital</h2>
              <p className="text-xs text-slate-500">Get nearby emergency medical support points.</p>
            </div>
            <span className="rounded-full bg-red-50 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-red-700">
              {hospitalSource === "online" ? "Live" : "Offline"}
            </span>
          </div>
          <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-xs font-medium text-slate-600">{statusText}</p>
          {statusError && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
              {statusError}
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
                {nearbyHospitals.map((entry) => (
                  <Marker
                    key={entry.hospitalId}
                    position={[entry.lat, entry.lng]}
                    icon={hospitalIcon}
                  />
                ))}
              </MapContainer>
            </div>
          </div>
        )}

        <div className="mt-4 space-y-3">
          {nearbyHospitals.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
              {statusError || "Searching hospitals near your location..."}
            </div>
          ) : (
            nearbyHospitals.map((entry) => (
              <div
                key={entry.hospitalId}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_6px_20px_rgba(15,23,42,0.08)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-slate-900">{entry.name}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{entry.address}</p>
                    <p className="mt-1 text-xs font-semibold text-red-700">
                      {entry.distanceKm !== null ? `${entry.distanceKm.toFixed(1)} km away` : "Distance unavailable"}
                    </p>
                  </div>
                  <div className="rounded-lg bg-red-50 p-2">
                    <Ambulance size={16} className="text-red-700" />
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => callHospital(entry.phone)}
                    className="inline-flex items-center justify-center gap-1 rounded-xl border border-slate-300 bg-white py-2 text-xs font-semibold text-slate-800"
                  >
                    <Phone size={13} />
                    Call
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      openDirections({
                        name: entry.name,
                        lat: entry.lat,
                        lng: entry.lng,
                      })
                    }
                    className="inline-flex items-center justify-center gap-1 rounded-xl bg-slate-900 py-2 text-xs font-semibold text-slate-100"
                  >
                    <ExternalLink size={13} />
                    Directions
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default DriverFindHospitalScreen;
