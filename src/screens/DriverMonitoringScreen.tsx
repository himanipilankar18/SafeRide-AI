import { motion } from "framer-motion";
import {
  Shield,
  AlertTriangle,
  Eye,
  Gauge,
  Phone,
  Timer,
  Wrench,
  Car,
  MapPin,
} from "lucide-react";
import { useEffect, useState } from "react";
import { LatLng } from "@/lib/navigationSafety";
import {
  DistanceEntry,
  NearbyGarage,
  getNearbyGarages,
  reportDriverIncident,
} from "@/lib/roadsideSupport";

interface DriverMonitoringScreenProps {
  onEmergency: () => void;
}

const DriverMonitoringScreen = ({
  onEmergency,
}: DriverMonitoringScreenProps) => {
  const safetyScore = 92;
  const [location, setLocation] = useState<LatLng | null>(null);
  const [garageSource, setGarageSource] = useState<"online" | "offline-cache">(
    "online",
  );
  const [nearbyGarages, setNearbyGarages] = useState<
    DistanceEntry<NearbyGarage>[]
  >([]);
  const [assistStatus, setAssistStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      setAssistStatus("GPS not available on this device.");
      return;
    }

    let cancelled = false;

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const current = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        if (cancelled) return;
        setLocation(current);

        const { garages, source } = await getNearbyGarages(current, 3);
        if (cancelled) return;
        setNearbyGarages(garages);
        setGarageSource(source);
        setAssistStatus(
          source === "online"
            ? "Showing nearby garages from live GPS search."
            : "Live lookup unavailable. Showing cached nearby garages.",
        );
      },
      async () => {
        const fallback = { lat: 12.9716, lng: 77.5946 };
        if (cancelled) return;
        setLocation(fallback);
        const { garages, source } = await getNearbyGarages(fallback, 3);
        if (cancelled) return;
        setNearbyGarages(garages);
        setGarageSource(source);
        setAssistStatus("Using fallback city location for roadside support.");
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
      },
    );

    return () => {
      cancelled = true;
    };
  }, []);

  const callNumber = (phone: string) => {
    if (!phone) return;
    window.location.href = `tel:${phone}`;
  };

  const reportIssue = (reason: "puncture" | "mechanical") => {
    if (!location) {
      setAssistStatus("Waiting for your location. Try again in a moment.");
      return;
    }

    const nearest = nearbyGarages[0];
    reportDriverIncident({
      reason,
      location,
      reportedAt: new Date().toISOString(),
      nearestGarage: nearest
        ? {
            name: nearest.item.name,
            phone: nearest.item.phone,
            distanceKm: nearest.distanceKm,
          }
        : undefined,
    });

    setAssistStatus(
      nearest
        ? `Issue shared. Nearest garage: ${nearest.item.name} (${nearest.distanceKm.toFixed(1)} km).`
        : "Issue shared. Passenger can now request a replacement driver.",
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative h-full flex flex-col"
    >
      <div className="px-6 pt-2 pb-4">
        <h2 className="text-lg font-bold text-foreground">Driver Dashboard</h2>
        <p className="text-xs text-muted-foreground">
          AI monitoring your driving
        </p>
      </div>

      <div className="flex-1 px-6 space-y-4 overflow-y-auto pb-28">
        {/* Safety score circle */}
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-card rounded-2xl p-6 border border-border flex flex-col items-center"
        >
          <div className="relative w-28 h-28 mb-3">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke="hsl(var(--accent))"
                strokeWidth="8"
              />
              <motion.circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke="hsl(var(--safe))"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 42}`}
                initial={{ strokeDashoffset: 2 * Math.PI * 42 }}
                animate={{
                  strokeDashoffset: 2 * Math.PI * 42 * (1 - safetyScore / 100),
                }}
                transition={{ duration: 1.5, delay: 0.3 }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-extrabold text-foreground">
                {safetyScore}
              </span>
              <span className="text-[10px] text-muted-foreground">Safety</span>
            </div>
          </div>
          <p className="text-sm font-semibold text-safe">Excellent Driving</p>
        </motion.div>

        {/* Driving metrics */}
        <div className="grid grid-cols-2 gap-3">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.15 }}
            className="bg-card rounded-2xl p-4 border border-border"
          >
            <Gauge size={20} className="text-primary mb-2" />
            <p className="text-xl font-extrabold text-foreground">42</p>
            <p className="text-[10px] text-muted-foreground">km/h Speed</p>
          </motion.div>
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="bg-card rounded-2xl p-4 border border-border"
          >
            <Eye size={20} className="text-primary mb-2" />
            <p className="text-xl font-extrabold text-safe">Active</p>
            <p className="text-[10px] text-muted-foreground">Attention</p>
          </motion.div>
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.25 }}
            className="bg-card rounded-2xl p-4 border border-border"
          >
            <Timer size={20} className="text-primary mb-2" />
            <p className="text-xl font-extrabold text-foreground">1:24</p>
            <p className="text-[10px] text-muted-foreground">Drive Time</p>
          </motion.div>
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="bg-card rounded-2xl p-4 border border-border"
          >
            <AlertTriangle size={20} className="text-warning mb-2" />
            <p className="text-xl font-extrabold text-foreground">0</p>
            <p className="text-[10px] text-muted-foreground">Alerts</p>
          </motion.div>
        </div>

        {/* AI alerts */}
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.35 }}
          className="bg-card rounded-2xl p-5 border border-border space-y-3"
        >
          <p className="text-sm font-semibold text-muted-foreground">
            AI Insights
          </p>
          <div className="flex items-center gap-3 bg-safe/10 rounded-xl p-3">
            <Shield size={16} className="text-safe" />
            <span className="text-sm text-foreground">
              Smooth braking detected
            </span>
          </div>
          <div className="flex items-center gap-3 bg-safe/10 rounded-xl p-3">
            <Shield size={16} className="text-safe" />
            <span className="text-sm text-foreground">
              Lane discipline maintained
            </span>
          </div>
        </motion.div>

        <motion.button
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.4 }}
          onClick={onEmergency}
          className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl bg-destructive text-destructive-foreground font-bold transition-transform active:scale-[0.97]"
        >
          <Phone size={20} />
          Emergency
        </motion.button>

        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.45 }}
          className="bg-card rounded-2xl p-5 border border-border space-y-3"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-muted-foreground">
                Roadside Help
              </p>
              <p className="text-xs text-muted-foreground">
                Nearest garages around your current location
              </p>
            </div>
            <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-bold uppercase text-primary">
              {garageSource === "offline-cache" ? "Offline" : "Live"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => reportIssue("puncture")}
              className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-bold text-foreground"
            >
              <Wrench size={14} className="mr-1 inline" /> Tyre puncture
            </button>
            <button
              type="button"
              onClick={() => reportIssue("mechanical")}
              className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-bold text-foreground"
            >
              <Car size={14} className="mr-1 inline" /> Mechanical issue
            </button>
          </div>

          {assistStatus && (
            <p className="rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-muted-foreground">
              {assistStatus}
            </p>
          )}

          {nearbyGarages.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Searching nearby garages...
            </p>
          ) : (
            <div className="space-y-2">
              {nearbyGarages.map((garage) => (
                <div
                  key={garage.item.id}
                  className="rounded-xl border border-border bg-background p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {garage.item.name}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        <MapPin size={12} className="mr-1 inline" />
                        {garage.item.address}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {garage.distanceKm.toFixed(1)} km away
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {garage.item.location.lat.toFixed(5)},{" "}
                        {garage.item.location.lng.toFixed(5)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {garage.item.phone}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => callNumber(garage.item.phone)}
                      className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground"
                    >
                      Call
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
};

export default DriverMonitoringScreen;
