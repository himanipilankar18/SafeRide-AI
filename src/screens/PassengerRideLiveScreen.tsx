import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, CarFront, LocateFixed, UserRound } from "lucide-react";
import L from "leaflet";
import { MapContainer, Marker, TileLayer } from "react-leaflet";
import type { JoinedRidePayload } from "@/screens/PassengerJoinRideScreen";
import { Button } from "@/components/ui/button";
import {
  useLiveTracking,
  type DeviationAlert,
  type LiveTrackingEvent,
} from "@/lib/useLiveTracking";

interface PassengerRideLiveScreenProps {
  ride: JoinedRidePayload;
  tripId?: string;
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

const PassengerRideLiveScreen = ({
  ride,
  tripId,
}: PassengerRideLiveScreenProps) => {
  const [rideDetails, setRideDetails] = useState<JoinedRidePayload>(ride);
  const [driverLocation, setDriverLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(
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
  const [isSendingSos, setIsSendingSos] = useState(false);
  const [sosStatus, setSosStatus] = useState<string | null>(null);
  const [sosStatusType, setSosStatusType] = useState<"info" | "success" | "error">(
    "info",
  );

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
    let cancelled = false;

    const loadStatus = async () => {
      try {
        const response = await fetch(`${apiBase}/rides/status/${ride.otpCode}`);
        const data = await response.json();

        if (cancelled || !response.ok || !data?.success || !data?.ride) {
          return;
        }

        setRideDetails((prev) => ({
          ...prev,
          driverName: data.ride.driver_name || prev.driverName,
          carNumber: data.ride.car_number || prev.carNumber,
          carModel: data.ride.car_model || prev.carModel,
          faceImage: data.ride.face_image || prev.faceImage,
          lat: data.ride.current_lat ?? prev.lat,
          lng: data.ride.current_lng ?? prev.lng,
        }));

        if (data.ride.driver_name) {
          setStatus("Driver joined. Credentials verified.");
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

  useEffect(() => {
    const handleMessage = (event: LiveTrackingEvent) => {
      if (event.type === "deviation_alert") {
        const alert: DeviationAlert = {
          severity: event.severity as "warning" | "danger",
          message: event.message || "Route deviation detected",
          location: event.location || {
            lat: ride.lat ?? 0,
            lng: ride.lng ?? 0,
          },
          riskScore: event.riskScore || 0,
          trend: event.trend as "closer" | "flat" | "away",
        };

        setAlerts((prev) => [alert, ...prev].slice(0, 4));
        setRiskLevel(
          event.severity === "danger"
            ? "danger"
            : event.severity === "warning"
              ? "warning"
              : "safe",
        );
      }

      if (event.type === "trip_joined") {
        setConnectionStatus("connected");
        setStatus("Live route monitoring connected.");
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
  }, [connect, disconnect, ride.lat, ride.lng]);

  useEffect(() => {
    if (isConnected) {
      setConnectionStatus("connected");
    }
  }, [isConnected]);

  const sendSosAlert = async () => {
    let contacts: EmergencyContact[] = [];

    try {
      const saved = window.localStorage.getItem(EMERGENCY_CONTACTS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          contacts = parsed
            .map((item) => ({
              name: String(item?.name || "Emergency contact").trim(),
              phone: String(item?.phone || "").trim(),
              selectedForSos:
                typeof item?.selectedForSos === "boolean"
                  ? item.selectedForSos
                  : true,
            }))
            .filter((item) => item.phone && item.selectedForSos);
        }
      }
    } catch {
      contacts = [];
    }

    if (contacts.length === 0) {
      setSosStatus("No emergency contacts saved. Add contacts from the Emergency screen first.");
      setSosStatusType("error");
      return;
    }

    setIsSendingSos(true);
    setSosStatus("Sending SOS alerts...");
    setSosStatusType("info");

    try {
      const passengerPhone = window.localStorage.getItem("phoneNumber") || "passenger-demo";
      const fallbackLocation =
        rideDetails.lat !== null && rideDetails.lng !== null
          ? { lat: rideDetails.lat, lng: rideDetails.lng }
          : null;
      const location = driverLocation || fallbackLocation;

      const response = await fetch(`${apiBase}/emergency/alert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contacts,
          passenger: {
            phoneNumber: passengerPhone,
          },
          driver: {
            name: rideDetails.driverName,
            phoneNumber: "N/A",
            vehicleDetails: `${rideDetails.carModel} (${rideDetails.carNumber})`,
          },
          trip: {
            sourceLabel: "Live trip",
            destinationLabel: "Destination",
          },
          location,
          timestamp: new Date().toISOString(),
        }),
      });

      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.message || "Failed to send SOS alerts");
      }

      setSosStatus(data.message || "SOS alerts sent.");
      setSosStatusType("success");
    } catch (error) {
      setSosStatus(
        error instanceof Error ? error.message : "Failed to send SOS alerts.",
      );
      setSosStatusType("error");
    } finally {
      setIsSendingSos(false);
    }
  };

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
            <p className="truncate text-sm font-bold">
              {rideDetails.driverName}
            </p>
            <p className="truncate text-xs text-white/80">
              {rideDetails.carModel}
            </p>
            <p className="truncate text-xs text-white/80">
              {rideDetails.carNumber}
            </p>
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
                  {alert.severity === "danger"
                    ? "Route deviation"
                    : "Route warning"}
                </p>
                <p className="opacity-95">{alert.message}</p>
                <p className="mt-1 opacity-75">Risk {alert.riskScore}%</p>
              </div>
            </div>
          </motion.div>
        ))}
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
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setStatus("Refreshing live status...")}
          >
            Refresh
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={sendSosAlert}
            disabled={isSendingSos}
          >
            {isSendingSos ? "Sending..." : "SOS"}
          </Button>
        </div>
        {sosStatus && (
          <p
            className={`mt-2 text-xs ${
              sosStatusType === "success"
                ? "text-green-600"
                : sosStatusType === "error"
                  ? "text-red-600"
                  : "text-muted-foreground"
            }`}
          >
            {sosStatus}
          </p>
        )}
      </div>
    </motion.div>
  );
};

export default PassengerRideLiveScreen;
