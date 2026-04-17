import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CalendarClock, Car, Clock3, MapPin, Route } from "lucide-react";

type RideSummary = {
  id: number;
  otp_code: string;
  source_label: string | null;
  destination_label: string | null;
  distance_km: number | null;
  duration_sec: number | null;
  ended_at: string;
  driver_phone: string | null;
  passenger_phone: string | null;
  driver_performance_json: string | null;
};

interface TripSummaryScreenProps {
  role: "driver" | "passenger";
  phoneNumber: string;
  refreshKey?: number;
}

const formatDuration = (durationSec: number | null) => {
  if (!durationSec || durationSec <= 0) {
    return "-";
  }
  const mins = Math.floor(durationSec / 60);
  const secs = durationSec % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
};

const TripSummaryScreen = ({
  role,
  phoneNumber,
  refreshKey = 0,
}: TripSummaryScreenProps) => {
  const [rides, setRides] = useState<RideSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const apiBase = useMemo(() => {
    const configured = import.meta.env.VITE_API_BASE_URL;
    if (typeof configured === "string" && configured.trim()) {
      const clean = configured.trim().replace(/\/$/, "");
      return clean.endsWith("/api") ? clean : `${clean}/api`;
    }

    return `${window.location.protocol}//${window.location.hostname}:5001/api`;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadHistory = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `${apiBase}/rides/history?role=${encodeURIComponent(role)}&phone=${encodeURIComponent(phoneNumber)}`,
        );
        const data = await response.json();

        if (cancelled) {
          return;
        }

        if (!response.ok || !data?.success) {
          throw new Error(data?.message || "Failed to fetch trip history");
        }

        setRides(Array.isArray(data.rides) ? data.rides : []);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to fetch trip history",
          );
          setRides([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    if (!phoneNumber || phoneNumber === "N/A") {
      setRides([]);
      setLoading(false);
      return;
    }

    loadHistory();

    return () => {
      cancelled = true;
    };
  }, [apiBase, phoneNumber, refreshKey, role]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative h-full flex flex-col"
    >
      <div className="px-6 pt-2 pb-4">
        <h2 className="text-lg font-bold text-foreground">Trip Summary</h2>
        <p className="text-xs text-muted-foreground">
          {role === "driver"
            ? "Your completed rides and performance"
            : "Your completed rides"}
        </p>
      </div>

      <div className="flex-1 px-6 overflow-y-auto pb-28">
        {loading ? (
          <div className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
            Loading trip history...
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
            {error}
          </div>
        ) : rides.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-6 text-center">
            <CalendarClock
              className="mx-auto mb-2 text-muted-foreground"
              size={24}
            />
            <p className="text-sm font-semibold text-foreground">
              No completed trips yet
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              End an active trip to see ride details here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {rides.map((ride) => {
              const performance = ride.driver_performance_json
                ? (() => {
                    try {
                      return JSON.parse(ride.driver_performance_json) as {
                        safetyScore?: number;
                        deviationAlerts?: number;
                      };
                    } catch {
                      return null;
                    }
                  })()
                : null;

              return (
                <div
                  key={ride.id}
                  className="rounded-2xl border border-border bg-card p-4"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    OTP {ride.otp_code}
                  </p>

                  <div className="mt-2 space-y-2 text-sm">
                    <div className="flex items-start gap-2">
                      <MapPin size={14} className="mt-0.5 text-primary" />
                      <span>{ride.source_label || "Unknown source"}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <MapPin size={14} className="mt-0.5 text-destructive" />
                      <span>
                        {ride.destination_label || "Unknown destination"}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div className="rounded-xl bg-background px-3 py-2">
                      <Route size={13} className="mr-1 inline" />
                      {ride.distance_km
                        ? `${ride.distance_km.toFixed(2)} km`
                        : "-"}
                    </div>
                    <div className="rounded-xl bg-background px-3 py-2">
                      <Clock3 size={13} className="mr-1 inline" />
                      {formatDuration(ride.duration_sec)}
                    </div>
                    <div className="col-span-2 rounded-xl bg-background px-3 py-2">
                      Ended: {new Date(ride.ended_at).toLocaleString()}
                    </div>
                  </div>

                  {role === "driver" && (
                    <div className="mt-2 rounded-xl bg-primary/5 px-3 py-2 text-xs text-foreground">
                      <Car size={13} className="mr-1 inline text-primary" />
                      Safety score: {performance?.safetyScore ?? "-"} |
                      Deviation alerts: {performance?.deviationAlerts ?? "-"}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default TripSummaryScreen;
