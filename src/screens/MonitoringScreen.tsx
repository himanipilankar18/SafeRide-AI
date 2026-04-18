import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Clock,
  LocateFixed,
  MapPin,
  Phone,
  Route,
  Users,
  X,
} from "lucide-react";
import { LatLng, haversineKm } from "@/lib/navigationSafety";
import { TripConfig } from "@/screens/HomeScreen";
import { useLiveTracking } from "@/lib/useLiveTracking";
import {
  DistanceEntry,
  NearbyGarage,
  NearbyDriver,
  getNearbyGarages,
  getDriverIncident,
  clearDriverIncident,
} from "@/lib/roadsideSupport";
import L from "leaflet";
import {
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import EmergencyAlert from "@/components/EmergencyAlert";
import DriverDrowsinessPanel, {
  type DrowsinessSample,
  type DrowsinessState,
} from "@/components/DriverDrowsinessPanel";

type MapMode = "2d" | "offline";

type EmergencyContact = {
  id: string;
  name: string;
  phone: string;
};

type DeviationState = {
  severity: "warning" | "danger";
  distanceOffRouteKm: number;
  riskScore: number;
  trend: "closer" | "flat" | "away";
  message: string;
};

type DriverIncidentState = {
  reason: "puncture" | "mechanical";
  reportedAt: string;
};

type DriverSlide = "map" | "drowsiness" | "summary";

type DriverRideSummary = {
  id: number;
  otp_code: string;
  source_label: string | null;
  destination_label: string | null;
  distance_km: number | null;
  duration_sec: number | null;
  ended_at: string;
  driver_performance_json: string | null;
};

const EMERGENCY_CONTACTS_KEY = "saferide_emergency_contacts";
const DRIVER_LAST_RIDE_SCORE_KEY = "saferide_driver_last_ride_score";
const POLICE_CONTACT = { name: "Police Control Room", phone: "+91112" };

type DriverScoreAggregate = {
  samples: number;
  sumFatigue: number;
  sumDistraction: number;
  stateCounts: Record<DrowsinessState, number>;
  warningAlerts: number;
  criticalAlerts: number;
};

const emptyDriverAggregate = (): DriverScoreAggregate => ({
  samples: 0,
  sumFatigue: 0,
  sumDistraction: 0,
  stateCounts: {
    NORMAL: 0,
    WARNING: 0,
    CRITICAL: 0,
  },
  warningAlerts: 0,
  criticalAlerts: 0,
});

const clampPercent = (value: number) =>
  Math.max(0, Math.min(100, Math.round(value)));

const screenTransition = {
  duration: 0.66,
  ease: [0.22, 1, 0.36, 1],
};

const getMinRouteDistanceKm = (
  point: LatLng,
  route: [number, number][],
): number => {
  if (route.length === 0) {
    return 0;
  }

  return route.reduce((minDistance, [lat, lng]) => {
    const distance = haversineKm(point, { lat, lng });
    return distance < minDistance ? distance : minDistance;
  }, Number.POSITIVE_INFINITY);
};

interface MonitoringScreenProps {
  onEmergency: () => void;
  onNavigate: (screen: string) => void;
  tripConfig: TripConfig;
  onTripChange: (nextTrip: TripConfig) => void;
  hasActiveTrip?: boolean;
  isDriverMode?: boolean;
  tripId?: string;
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

const fetchRoadRoute = async (
  from: LatLng,
  to: LatLng,
): Promise<[number, number][]> => {
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

    return coordinates.map(
      (coord: [number, number]) => [coord[1], coord[0]] as [number, number],
    );
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
      map.setView([position.lat, position.lng], map.getZoom(), {
        animate: true,
        duration: 0.6,
      });
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

const EmptyRideState = ({
  onNavigate,
}: {
  onNavigate: (screen: string) => void;
}) => (
  <div className="absolute inset-x-5 bottom-24 z-30 rounded-3xl bg-white px-5 py-5 text-gray-950 shadow-[0_-10px_30px_rgba(0,0,0,0.22)]">
    <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-gray-300" />
    <p className="text-xl font-extrabold">No ride active</p>
    <p className="mt-1 text-sm font-medium text-gray-500">
      Start from a route, join a ride, or pick up where you left off.
    </p>
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
  isDriverMode = false,
  tripId,
}: MonitoringScreenProps) => {
  const [currentLocation, setCurrentLocation] = useState<LatLng>(
    tripConfig.source,
  );
  const [routePath, setRoutePath] = useState<[number, number][]>([
    [tripConfig.source.lat, tripConfig.source.lng],
  ]);
  const [expectedRoute, setExpectedRoute] = useState<[number, number][]>([]);
  const [mode, setMode] = useState<MapMode>("2d");
  const [driverSlide, setDriverSlide] = useState<DriverSlide>("map");
  const [heading, setHeading] = useState<number | null>(null);
  const [followVehicle, setFollowVehicle] = useState(true);
  const [locationError, setLocationError] = useState<string | null>(null);

  const liveTripId = useMemo(() => tripId || `trip_${Date.now()}`, [tripId]);
  const liveRole = isDriverMode ? "driver" : "passenger";
  const { connect, disconnect, send } = useLiveTracking(liveTripId, liveRole);
  const watchIdRef = useRef<number | null>(null);
  const lastSendRef = useRef(0);
  const lastDeviationDistanceRef = useRef<number | null>(null);
  const lastDeviationNotifyRef = useRef(0);

  const [emergencyContacts, setEmergencyContacts] = useState<
    EmergencyContact[]
  >([]);
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [contactPolice, setContactPolice] = useState(true);
  const [deviationState, setDeviationState] = useState<DeviationState | null>(
    null,
  );
  const [showDeviationPanel, setShowDeviationPanel] = useState(false);
  const [isDispatchingEmergency, setIsDispatchingEmergency] = useState(false);
  const [dispatchStatus, setDispatchStatus] = useState<string | null>(null);
  const [dispatchStatusType, setDispatchStatusType] = useState<
    "success" | "error" | "info"
  >("info");
  const [showRoadsidePanel, setShowRoadsidePanel] = useState(false);
  const [roadsideSource, setRoadsideSource] = useState<
    "online" | "offline-cache"
  >("online");
  const [nearbyGarages, setNearbyGarages] = useState<
    DistanceEntry<NearbyGarage>[]
  >([]);
  const [driverIncident, setDriverIncident] =
    useState<DriverIncidentState | null>(null);
  const [replacementDriver, setReplacementDriver] =
    useState<NearbyDriver | null>(null);
  const [replacementCandidates, setReplacementCandidates] = useState<
    Array<NearbyDriver & { distanceKm: number }>
  >([]);
  const [isFindingReplacement, setIsFindingReplacement] = useState(false);
  const [showEmergencyAlert, setShowEmergencyAlert] = useState(false);
  const [latestDrowsinessSample, setLatestDrowsinessSample] =
    useState<DrowsinessSample | null>(null);
  const [driverBehaviorScore, setDriverBehaviorScore] = useState(100);
  const [didAutoCompleteRide, setDidAutoCompleteRide] = useState(false);
  const [tripDeviationEvents, setTripDeviationEvents] = useState(0);
  const [tripEmergencyEvents, setTripEmergencyEvents] = useState(0);
  const [driverTripSummaries, setDriverTripSummaries] = useState<
    DriverRideSummary[]
  >([]);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const drowsinessAggregateRef = useRef<DriverScoreAggregate>(
    emptyDriverAggregate(),
  );
  const lastDrowsinessStateRef = useRef<DrowsinessState | null>(null);
  const completionTriggeredRef = useRef(false);
  const tripStartTimeRef = useRef(Date.now());

  const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL || "http://localhost:5001/api";

  const selectedContacts = emergencyContacts.filter((contact) =>
    selectedContactIds.includes(contact.id),
  );

  const computeScoreSnapshot = () => {
    const agg = drowsinessAggregateRef.current;
    const samples = Math.max(agg.samples, 1);
    const avgFatigue = agg.sumFatigue / samples;
    const avgDistraction = agg.sumDistraction / samples;
    const warningRatio = agg.stateCounts.WARNING / samples;
    const criticalRatio = agg.stateCounts.CRITICAL / samples;

    const score = clampPercent(
      100 -
        avgFatigue * 38 -
        avgDistraction * 30 -
        warningRatio * 42 -
        criticalRatio * 70 -
        agg.warningAlerts * 2 -
        agg.criticalAlerts * 4,
    );

    return {
      score,
      avgFatigue: Number(avgFatigue.toFixed(4)),
      avgDistraction: Number(avgDistraction.toFixed(4)),
      fatigueScore: Number((avgFatigue * 100).toFixed(1)),
      distractionScore: Number((avgDistraction * 100).toFixed(1)),
      warningEvents: agg.stateCounts.WARNING,
      criticalEvents: agg.stateCounts.CRITICAL,
      totalSamples: agg.samples,
      warningAlerts: agg.warningAlerts,
      criticalAlerts: agg.criticalAlerts,
    };
  };

  const handleDrowsinessSample = (sample: DrowsinessSample) => {
    setLatestDrowsinessSample(sample);

    const agg = drowsinessAggregateRef.current;
    agg.samples += 1;
    agg.sumFatigue += sample.fatigueScore;
    agg.sumDistraction += sample.distractionScore;
    agg.stateCounts[sample.state] += 1;

    const prevState = lastDrowsinessStateRef.current;
    if (prevState !== sample.state) {
      if (sample.state === "WARNING") {
        agg.warningAlerts += 1;
      }
      if (sample.state === "CRITICAL") {
        agg.criticalAlerts += 1;
      }
    }
    lastDrowsinessStateRef.current = sample.state;

    const scoreSnapshot = computeScoreSnapshot();
    setDriverBehaviorScore(scoreSnapshot.score);
  };

  const finalizeDriverRide = async (
    reason: "destination_reached" | "manual",
  ) => {
    if (completionTriggeredRef.current || !isDriverMode) {
      return;
    }

    completionTriggeredRef.current = true;

    const scoreSnapshot = computeScoreSnapshot();
    const durationSec = Math.max(
      1,
      Math.round((Date.now() - tripStartTimeRef.current) / 1000),
    );
    const distanceKm =
      routePath.length > 1
        ? routePath.reduce((total, point, index) => {
            if (index === 0) {
              return 0;
            }

            const previous = {
              lat: routePath[index - 1][0],
              lng: routePath[index - 1][1],
            };
            const current = { lat: point[0], lng: point[1] };
            return total + haversineKm(previous, current);
          }, 0)
        : 0;
    const riskLevel =
      scoreSnapshot.score < 60
        ? "CRITICAL"
        : scoreSnapshot.score < 80
          ? "WARNING"
          : "SAFE";

    const summaryPayload = {
      completedAt: new Date().toISOString(),
      rideOtpCode: tripConfig.rideOtpCode || null,
      destinationLabel: tripConfig.destinationLabel,
      sourceLabel: tripConfig.sourceLabel,
      reason,
      durationSec,
      distanceKm: Number(distanceKm.toFixed(3)),
      riskLevel,
      routeDeviationEvents: tripDeviationEvents,
      emergencyEvents: tripEmergencyEvents,
      ...scoreSnapshot,
    };

    setDriverBehaviorScore(scoreSnapshot.score);
    setDidAutoCompleteRide(reason === "destination_reached");

    try {
      window.localStorage.setItem(
        DRIVER_LAST_RIDE_SCORE_KEY,
        JSON.stringify(summaryPayload),
      );
    } catch {
      // no-op if storage is blocked
    }

    if (tripConfig.rideOtpCode) {
      try {
        await fetch(`${API_BASE_URL}/rides/end`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            otpCode: tripConfig.rideOtpCode,
            endedBy: "driver",
            finalLat: currentLocation.lat,
            finalLng: currentLocation.lng,
            distanceKm,
            durationSec,
            driverPerformance: summaryPayload,
          }),
        });
      } catch {
        // Summary sync is best-effort.
      }

      try {
        await fetch(`${API_BASE_URL}/rides/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            otpCode: tripConfig.rideOtpCode,
            lat: currentLocation.lat,
            lng: currentLocation.lng,
            completedAt: summaryPayload.completedAt,
            behaviorScore: scoreSnapshot.score,
            drowsinessSummary: summaryPayload,
          }),
        });
      } catch {
        // Completion sync is best-effort; local summary remains available.
      }

      try {
        await fetch(`${API_BASE_URL}/trip/end`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tripId: tripConfig.rideOtpCode }),
        });
      } catch {
        // Lifecycle shutdown is best-effort here; backend also handles cleanup on trip_complete.
      }
    }

    send("trip_complete", {
      reason,
      behaviorScore: scoreSnapshot.score,
      drowsiness: summaryPayload,
    });

    onNavigate("summary");
  };

  useEffect(() => {
    if (!hasActiveTrip || !isDriverMode) {
      return;
    }

    tripStartTimeRef.current = Date.now();
    setTripDeviationEvents(0);
    setTripEmergencyEvents(0);
    completionTriggeredRef.current = false;
    drowsinessAggregateRef.current = emptyDriverAggregate();
    lastDrowsinessStateRef.current = null;
  }, [hasActiveTrip, isDriverMode, tripConfig.rideOtpCode]);

  useEffect(() => {
    if (!isDriverMode) {
      setNearbyGarages([]);
      return;
    }

    let cancelled = false;

    const loadGarages = async () => {
      const { garages, source } = await getNearbyGarages(currentLocation, 3);
      if (cancelled) return;
      setNearbyGarages(garages);
      setRoadsideSource(source);
    };

    loadGarages();

    return () => {
      cancelled = true;
    };
  }, [currentLocation, isDriverMode]);

  const toggleContactSelection = (contactId: string) => {
    setSelectedContactIds((prev) =>
      prev.includes(contactId)
        ? prev.filter((id) => id !== contactId)
        : [...prev, contactId],
    );
  };

  const callNumber = (phone: string) => {
    if (!phone) return;
    window.location.href = `tel:${phone}`;
  };

  const handleDispatchEmergency = async () => {
    if (selectedContacts.length === 0 && !contactPolice) {
      setDispatchStatus(
        "Select at least one contact or enable police dispatch.",
      );
      setDispatchStatusType("error");
      return;
    }

    setIsDispatchingEmergency(true);
    setDispatchStatus("Dispatching emergency notifications...");
    setDispatchStatusType("info");

    try {
      const passengerPhone =
        window.localStorage.getItem("phoneNumber") || "passenger-demo";
      const response = await fetch(`${API_BASE_URL}/emergency/dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contacts: selectedContacts,
          police: contactPolice ? [POLICE_CONTACT] : [],
          passenger: {
            phoneNumber: passengerPhone,
          },
          driver: {
            name: tripConfig.driverName,
            phoneNumber: tripConfig.driverPhone,
            vehicleDetails: tripConfig.driverVehicleDetails,
          },
          trip: {
            sourceLabel: tripConfig.sourceLabel,
            destinationLabel: tripConfig.destinationLabel,
            source: tripConfig.source,
            destination: tripConfig.destination,
          },
          location: currentLocation,
          timestamp: new Date().toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata",
          }),
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(
          data.message || "Failed to dispatch emergency messages.",
        );
      }

      setDispatchStatus(data.message || "Emergency notifications sent.");
      setDispatchStatusType("success");
      if (isDriverMode) {
        setTripEmergencyEvents((prev) => prev + 1);
      }
    } catch (error) {
      setDispatchStatus(
        error instanceof Error
          ? error.message
          : "Failed to dispatch emergency messages.",
      );
      setDispatchStatusType("error");
    } finally {
      setIsDispatchingEmergency(false);
    }
  };

  const handleScheduleReplacementRide = async () => {
    setIsFindingReplacement(true);
    setReplacementCandidates([]);
    setReplacementDriver(null);
    setDispatchStatus("Searching nearby available drivers...");
    setDispatchStatusType("info");

    try {
      const lookupResponse = await fetch(
        `${API_BASE_URL}/rides/nearby-drivers?lat=${encodeURIComponent(
          String(currentLocation.lat),
        )}&lng=${encodeURIComponent(
          String(currentLocation.lng),
        )}&radiusKm=8&limit=5&excludePhone=${encodeURIComponent(
          String(tripConfig.driverPhone || ""),
        )}`,
      );

      const lookupData = await lookupResponse.json();
      if (!lookupResponse.ok || !lookupData?.success) {
        throw new Error(
          lookupData?.message || "Unable to fetch nearby available drivers.",
        );
      }

      const candidates = Array.isArray(lookupData?.drivers)
        ? lookupData.drivers
        : [];
      setReplacementCandidates(candidates);

      const nearest = candidates[0]
        ? { item: candidates[0], distanceKm: Number(candidates[0].distanceKm) }
        : null;

      if (!nearest) {
        throw new Error(
          "No nearby available driver found with live location in this area.",
        );
      }

      setReplacementDriver(nearest.item);

      const applyLocalReplacement = () => {
        onTripChange({
          ...tripConfig,
          source: currentLocation,
          sourceLabel: "Current ride handoff point",
          driverName: nearest.item.name,
          driverPhone: nearest.item.phone,
          driverVehicleDetails: nearest.item.vehicle,
        });
      };

      const syncReplacement = async () => {
        if (!tripId) {
          applyLocalReplacement();
          return;
        }

        const response = await fetch(`${API_BASE_URL}/rides/join-driver`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            otpCode: tripId,
            driverPhone: nearest.item.phone,
          }),
        });

        const data = await response.json();
        if (!response.ok || !data?.success || !data?.ride) {
          throw new Error(
            data?.message || "Failed to assign replacement driver",
          );
        }

        applyLocalReplacement();
      };

      await syncReplacement();

      setDispatchStatus(
        `Replacement ride scheduled with ${nearest.item.name} (${nearest.distanceKm.toFixed(1)} km away).`,
      );
      setDispatchStatusType("success");
      clearDriverIncident();
      setDriverIncident(null);
    } catch (error) {
      setDispatchStatus(
        error instanceof Error
          ? error.message
          : "Unable to schedule replacement ride.",
      );
      setDispatchStatusType("error");
    } finally {
      setIsFindingReplacement(false);
    }
  };

  const handleAssignSpecificReplacement = async (
    candidate: NearbyDriver & { distanceKm: number },
  ) => {
    setIsFindingReplacement(true);

    try {
      const applyLocalReplacement = () => {
        onTripChange({
          ...tripConfig,
          source: currentLocation,
          sourceLabel: "Current ride handoff point",
          driverName: candidate.name,
          driverPhone: candidate.phone,
          driverVehicleDetails: candidate.vehicle,
        });
      };

      if (tripId) {
        const response = await fetch(`${API_BASE_URL}/rides/join-driver`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            otpCode: tripId,
            driverPhone: candidate.phone,
          }),
        });

        const data = await response.json();
        if (!response.ok || !data?.success || !data?.ride) {
          throw new Error(data?.message || "Failed to assign selected driver");
        }
      }

      applyLocalReplacement();
      setReplacementDriver(candidate);
      setDispatchStatus(
        `Replacement ride assigned to ${candidate.name} (${candidate.distanceKm.toFixed(1)} km away).`,
      );
      setDispatchStatusType("success");
      clearDriverIncident();
      setDriverIncident(null);
    } catch (error) {
      setDispatchStatus(
        error instanceof Error
          ? error.message
          : "Unable to assign selected replacement driver.",
      );
      setDispatchStatusType("error");
    } finally {
      setIsFindingReplacement(false);
    }
  };

  useEffect(() => {
    connect(
      (event) => {
        if (!isDriverMode) {
          const isDirectDeviation = event.type === "deviation_alert";
          const isDriverDeviation =
            event.type === "driver_alert" &&
            String(event.message || "")
              .toLowerCase()
              .includes("route deviation");
          const isRiskDeviation =
            event.type === "location_update" &&
            Boolean(event.risk?.isDeviation);

          if (isDirectDeviation || isDriverDeviation || isRiskDeviation) {
            const severity =
              event.severity === "danger" ||
              event.level === "high" ||
              event.risk?.level === "high"
                ? "danger"
                : "warning";
            const rawRisk =
              event.riskScore ??
              (typeof event.risk?.routeDeviationScore === "number"
                ? event.risk.routeDeviationScore * 100
                : undefined) ??
              (typeof event.details?.routeDeviationScore === "number"
                ? event.details.routeDeviationScore * 100
                : 0);
            const riskScore = Math.max(0, Math.min(100, Number(rawRisk || 0)));
            const trend =
              event.trend === "away"
                ? "away"
                : event.trend === "closer"
                  ? "closer"
                  : "flat";
            const minDistanceMeters =
              event.risk?.minDistanceMeters ?? event.details?.minDistanceMeters;

            setDeviationState({
              severity,
              distanceOffRouteKm:
                typeof minDistanceMeters === "number"
                  ? minDistanceMeters / 1000
                  : 0,
              riskScore,
              trend,
              message: event.message || "Route deviation detected.",
            });
            setShowDeviationPanel(true);
          }
        }

        if (event.type === "trip_complete") {
          onNavigate("summary");
        }
      },
      (error) => console.error("Live tracking error:", error),
    ).catch(console.error);

    return () => disconnect();
  }, [connect, disconnect, isDriverMode, onNavigate]);

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
    try {
      const saved = window.localStorage.getItem(EMERGENCY_CONTACTS_KEY);
      if (!saved) {
        return;
      }

      const parsed = JSON.parse(saved) as EmergencyContact[];
      if (!Array.isArray(parsed)) {
        return;
      }

      const normalized = parsed
        .map((contact) => ({
          id: String(contact.id || `${Date.now()}-${contact.phone}`),
          name: String(contact.name || "Emergency contact"),
          phone: String(contact.phone || "").trim(),
        }))
        .filter((contact) => contact.phone);

      setEmergencyContacts(normalized);
      setSelectedContactIds(normalized.map((contact) => contact.id));
    } catch {
      setEmergencyContacts([]);
      setSelectedContactIds([]);
    }
  }, []);

  useEffect(() => {
    const syncIncident = () => {
      const record = getDriverIncident();
      if (!record) {
        setDriverIncident(null);
        return;
      }

      setDriverIncident({
        reason: record.reason,
        reportedAt: record.reportedAt,
      });
      setShowDeviationPanel(true);
    };

    syncIncident();

    window.addEventListener("storage", syncIncident);
    window.addEventListener("saferide-driver-incident", syncIncident);
    return () => {
      window.removeEventListener("storage", syncIncident);
      window.removeEventListener("saferide-driver-incident", syncIncident);
    };
  }, []);

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
        setRoutePath((prev) =>
          [...prev, [livePoint.lat, livePoint.lng] as [number, number]].slice(
            -500,
          ),
        );
        setLocationError(null);

        if (
          typeof position.coords.heading === "number" &&
          Number.isFinite(position.coords.heading)
        ) {
          setHeading(position.coords.heading);
        }

        const now = Date.now();
        if (
          isDriverMode &&
          now - lastSendRef.current > tripConfig.sampleIntervalSec * 1000
        ) {
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
  }, [isDriverMode, send, tripConfig.sampleIntervalSec]);

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
    return () =>
      window.removeEventListener("deviceorientation", handleOrientation);
  }, []);

  const vehicleIcon = useMemo(() => makeVehicleIcon(heading), [heading]);
  const distanceToDestination = haversineKm(
    currentLocation,
    tripConfig.destination,
  );
  const destinationReachedThresholdKm = Math.max(0.12, tripConfig.toleranceKm);
  const isNearDestination =
    distanceToDestination <= destinationReachedThresholdKm;
  const etaMinutes = Math.max(1, Math.round(distanceToDestination * 3.2));
  const routeLine = (
    expectedRoute.length > 0
      ? expectedRoute
      : [
          [tripConfig.source.lat, tripConfig.source.lng],
          [tripConfig.destination.lat, tripConfig.destination.lng],
        ]
  ) as [number, number][];

  const formatDuration = (durationSec: number | null) => {
    if (!durationSec || durationSec <= 0) {
      return "-";
    }

    const mins = Math.floor(durationSec / 60);
    const secs = durationSec % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  const getRiskBadge = (safetyScore: number | null) => {
    if (typeof safetyScore !== "number") {
      return { label: "Unknown", cls: "bg-gray-100 text-gray-700" };
    }

    if (safetyScore < 60) {
      return { label: "Critical", cls: "bg-red-100 text-red-700" };
    }

    if (safetyScore < 80) {
      return { label: "Warning", cls: "bg-amber-100 text-amber-700" };
    }

    return { label: "Safe", cls: "bg-emerald-100 text-emerald-700" };
  };

  useEffect(() => {
    if (!hasActiveTrip || !isDriverMode || !tripConfig.rideOtpCode) {
      return;
    }

    let cancelled = false;

    const pushLocation = async () => {
      try {
        await fetch(`${API_BASE_URL}/rides/location`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            otpCode: tripConfig.rideOtpCode,
            lat: currentLocation.lat,
            lng: currentLocation.lng,
            timestamp: new Date().toISOString(),
          }),
        });
      } catch {
        // Best-effort sync for passenger live status polling.
      }
    };

    pushLocation();

    const intervalId = window.setInterval(
      () => {
        if (!cancelled) {
          pushLocation();
        }
      },
      Math.max(2500, tripConfig.sampleIntervalSec * 1000),
    );

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [
    API_BASE_URL,
    currentLocation.lat,
    currentLocation.lng,
    hasActiveTrip,
    isDriverMode,
    tripConfig.rideOtpCode,
    tripConfig.sampleIntervalSec,
  ]);

  useEffect(() => {
    if (!hasActiveTrip || !isDriverMode || !isNearDestination) {
      return;
    }

    finalizeDriverRide("destination_reached");
  }, [finalizeDriverRide, hasActiveTrip, isDriverMode, isNearDestination]);

  useEffect(() => {
    if (!isDriverMode || !hasActiveTrip) {
      setDriverTripSummaries([]);
      return;
    }

    const driverPhone = (tripConfig.driverPhone || "").trim();
    if (!driverPhone) {
      return;
    }

    let cancelled = false;

    const loadSummary = async () => {
      setSummaryLoading(true);
      try {
        const response = await fetch(
          `${API_BASE_URL}/rides/history?role=driver&phone=${encodeURIComponent(driverPhone)}`,
        );
        const data = await response.json();
        if (cancelled) return;

        if (!response.ok || !data?.success || !Array.isArray(data.rides)) {
          setDriverTripSummaries([]);
          return;
        }

        setDriverTripSummaries(data.rides.slice(0, 12));
      } catch {
        if (!cancelled) {
          setDriverTripSummaries([]);
        }
      } finally {
        if (!cancelled) {
          setSummaryLoading(false);
        }
      }
    };

    loadSummary();

    return () => {
      cancelled = true;
    };
  }, [API_BASE_URL, hasActiveTrip, isDriverMode, tripConfig.driverPhone]);

  useEffect(() => {
    if (!hasActiveTrip || mode === "offline" || routeLine.length === 0) {
      setDeviationState(null);
      return;
    }

    const warningThresholdKm = Math.max(0.1, tripConfig.toleranceKm);
    const dangerThresholdKm = Math.max(0.2, warningThresholdKm * 2);
    const distanceOffRouteKm = getMinRouteDistanceKm(
      currentLocation,
      routeLine,
    );
    const previousDistance = lastDeviationDistanceRef.current;
    const trend: "closer" | "flat" | "away" =
      previousDistance === null
        ? "flat"
        : distanceOffRouteKm > previousDistance + 0.03
          ? "away"
          : distanceOffRouteKm < previousDistance - 0.03
            ? "closer"
            : "flat";

    lastDeviationDistanceRef.current = distanceOffRouteKm;

    const severity =
      distanceOffRouteKm >= dangerThresholdKm
        ? "danger"
        : distanceOffRouteKm >= warningThresholdKm
          ? "warning"
          : null;

    if (!severity) {
      setDeviationState(null);
      return;
    }

    const riskScore = Math.min(
      99,
      Math.round(
        (distanceOffRouteKm / warningThresholdKm) * 45 +
          (severity === "danger" ? 35 : 15),
      ),
    );

    const message =
      severity === "danger"
        ? "Major route deviation detected. Consider notifying emergency contacts or police."
        : "Route deviation detected. Stay alert and monitor the trip closely.";

    setDeviationState({
      severity,
      distanceOffRouteKm,
      riskScore,
      trend,
      message,
    });

    const now = Date.now();
    const shouldNotify =
      now - lastDeviationNotifyRef.current > 30000 || severity === "danger";

    if (shouldNotify) {
      setShowDeviationPanel(true);
      lastDeviationNotifyRef.current = now;
      if (isDriverMode) {
        setTripDeviationEvents((prev) => prev + 1);
      }

      send("deviation_alert", {
        severity,
        message,
        location: currentLocation,
        riskScore,
        trend,
      });
    }
  }, [
    currentLocation,
    hasActiveTrip,
    isDriverMode,
    mode,
    routeLine,
    send,
    tripConfig.toleranceKm,
  ]);

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
            <div className="absolute inset-0 z-0 transition-transform duration-700 ease-out">
              <MapContainer
                center={[currentLocation.lat, currentLocation.lng]}
                zoom={15}
                className="h-full w-full"
                style={{ zIndex: 0 }}
                zoomControl={false}
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution="&copy; OpenStreetMap contributors"
                />
                <Polyline
                  positions={routeLine}
                  pathOptions={{ color: "#2563eb", weight: 8, opacity: 0.35 }}
                />
                <Polyline
                  positions={routePath}
                  pathOptions={{ color: "#2563eb", weight: 6, opacity: 0.95 }}
                />
                <Marker
                  position={[tripConfig.source.lat, tripConfig.source.lng]}
                  icon={sourcePinIcon}
                />
                <Marker
                  position={[
                    tripConfig.destination.lat,
                    tripConfig.destination.lng,
                  ]}
                  icon={destinationPinIcon}
                />
                <Marker
                  position={[currentLocation.lat, currentLocation.lng]}
                  icon={vehicleIcon}
                />
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
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/70">
              Ride Mode Active
            </p>
            <div className="mt-1 flex items-center justify-between gap-3">
              <p className="truncate text-sm font-bold">
                {tripConfig.sourceLabel}
              </p>
              <div className="h-px flex-1 bg-white/25" />
              <p className="truncate text-sm font-bold text-right">
                {tripConfig.destinationLabel}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="absolute left-4 right-4 top-5 z-[1000]">
          <div className="rounded-2xl bg-black/65 px-4 py-3 text-white shadow-xl backdrop-blur-md border border-white/20">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/70">
              Ride
            </p>
            <p className="mt-1 text-sm font-bold">Choose how to continue</p>
          </div>
        </div>
      )}

      {hasActiveTrip && isDriverMode && (
        <div className="absolute left-4 right-4 top-24 z-[1010]">
          <div className="flex rounded-xl border border-white/20 bg-black/55 p-1 text-white backdrop-blur">
            {([
              { key: "map", label: "Map" },
              { key: "drowsiness", label: "Drowsiness" },
              { key: "summary", label: "Trip Summary" },
            ] as Array<{ key: DriverSlide; label: string }>).map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setDriverSlide(item.key)}
                className={`flex-1 rounded-lg px-2 py-2 text-[11px] font-bold ${
                  driverSlide === item.key
                    ? "bg-white text-black"
                    : "text-white/85"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {(!isDriverMode || driverSlide === "map") && (
        <div className="absolute left-4 top-36 z-[1000] flex rounded-full bg-white/95 p-1 shadow-xl">
          {(["2d", "offline"] as MapMode[]).map((item) => (
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
      )}

      {hasActiveTrip && (!isDriverMode || driverSlide === "map") && (
        <div className="absolute right-4 top-36 z-[1000] flex flex-col gap-3">
          {isDriverMode && (
            <button
              type="button"
              onClick={() => setShowRoadsidePanel((prev) => !prev)}
              className="rounded-full bg-white px-3 py-2 text-[11px] font-bold text-gray-900 shadow-xl"
            >
              {showRoadsidePanel ? "Hide Garage" : "Find Garage"}
            </button>
          )}
          {isDriverMode && (
            <button
              type="button"
              onClick={() => finalizeDriverRide("manual")}
              className="rounded-full bg-red-600 px-3 py-2 text-[11px] font-bold text-white shadow-xl"
            >
              End Trip
            </button>
          )}
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
        </div>
      )}

      {hasActiveTrip && isDriverMode && driverSlide === "drowsiness" && (
        <div className="absolute left-4 right-4 top-52 z-[1080]">
          <div className="mb-2 rounded-xl border border-white/25 bg-black/55 px-3 py-2 text-white shadow-lg backdrop-blur">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/70">
              Driver Ride Safety Score
            </p>
            <div className="mt-1 flex items-center justify-between gap-3">
              <p className="text-sm font-bold">{driverBehaviorScore}/100</p>
              <p className="text-[11px] font-medium text-white/80">
                {latestDrowsinessSample?.state || "NORMAL"}
              </p>
            </div>
            {didAutoCompleteRide && (
              <p className="mt-1 text-[11px] font-semibold text-emerald-200">
                Destination reached. Ride completion synced.
              </p>
            )}
          </div>
          <DriverDrowsinessPanel
            active={hasActiveTrip && isDriverMode}
            tripId={tripConfig.rideOtpCode || tripId}
            onSample={handleDrowsinessSample}
          />
        </div>
      )}

      {hasActiveTrip && isDriverMode && driverSlide === "summary" && (
        <div className="absolute inset-x-4 top-36 bottom-24 z-[1090] overflow-y-auto rounded-2xl border border-white/20 bg-black/65 p-4 text-white backdrop-blur">
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-white/70">
            Trip Summary
          </p>

          {summaryLoading ? (
            <p className="mt-3 text-sm text-white/75">Loading trip cards...</p>
          ) : driverTripSummaries.length === 0 ? (
            <p className="mt-3 text-sm text-white/75">
              No completed trip summaries yet.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              {driverTripSummaries.map((ride) => {
                const performance = ride.driver_performance_json
                  ? (() => {
                      try {
                        return JSON.parse(ride.driver_performance_json) as {
                          safetyScore?: number;
                        };
                      } catch {
                        return null;
                      }
                    })()
                  : null;

                const safetyScore =
                  typeof performance?.safetyScore === "number"
                    ? performance.safetyScore
                    : null;
                const risk = getRiskBadge(safetyScore);
                const liveDurationSec = Math.max(
                  1,
                  Math.round((Date.now() - tripStartTimeRef.current) / 1000),
                );
                const liveDistanceKm =
                  routePath.length > 1
                    ? routePath.reduce((total, point, index) => {
                        if (index === 0) {
                          return 0;
                        }

                        const previous = {
                          lat: routePath[index - 1][0],
                          lng: routePath[index - 1][1],
                        };
                        const current = { lat: point[0], lng: point[1] };
                        return total + haversineKm(previous, current);
                      }, 0)
                    : 0;
                const liveRisk = getRiskBadge(driverBehaviorScore);
                const liveSnapshot = computeScoreSnapshot();

                return (
                  <div
                    key={ride.id}
                    className="rounded-xl border border-white/20 bg-white/10 p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold text-white">
                        {new Date(ride.ended_at).toLocaleDateString()}
                      </p>
                      <span
                        className={`rounded-full px-2 py-1 text-[10px] font-bold ${risk.cls}`}
                      >
                        {risk.label}
                      </span>
                    </div>

                    <p className="mt-2 text-sm font-bold">
                      {ride.source_label || "Source"} → {ride.destination_label || "Destination"}
                    </p>

                    <div className="mt-3 rounded-lg bg-black/35 p-2">
                      <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-white/70">
                        Trip Overview
                      </p>
                      <div className="mt-1 grid grid-cols-3 gap-2 text-[11px] text-white/85">
                        <span>Time: {new Date(ride.ended_at).toLocaleTimeString()}</span>
                        <span>Distance: {liveDistanceKm.toFixed(2)} km</span>
                        <span>Duration: {formatDuration(liveDurationSec)}</span>
                      </div>
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-white/85">
                      <div className="rounded-lg bg-black/35 px-2 py-1.5">
                        <Clock size={12} className="mr-1 inline" />
                        {formatDuration(ride.duration_sec)}
                      </div>
                      <div className="rounded-lg bg-black/35 px-2 py-1.5">
                        <Route size={12} className="mr-1 inline" />
                        {ride.distance_km ? `${ride.distance_km.toFixed(2)} km` : "-"}
                      </div>
                    </div>

                    <div className="mt-2 flex items-center justify-between text-[11px] text-white/80">
                      <span>
                        Safety: {safetyScore !== null ? `${Math.round(safetyScore)}/100` : "-"}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <MapPin size={11} /> {ride.otp_code}
                      </span>
                    </div>

                    <div className="mt-2 rounded-lg bg-black/35 p-2">
                      <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-white/70">
                        Safety Summary
                      </p>
                      <div className="mt-1 grid grid-cols-3 gap-2 text-[11px] text-white/85">
                        <span>Fatigue: {liveSnapshot.fatigueScore.toFixed(1)}%</span>
                        <span>Distraction: {liveSnapshot.distractionScore.toFixed(1)}%</span>
                        <span>Risk: {liveRisk.label}</span>
                      </div>
                    </div>

                    <div className="mt-2 rounded-lg bg-black/35 p-2">
                      <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-white/70">
                        Events
                      </p>
                      <div className="mt-1 grid grid-cols-3 gap-2 text-[11px] text-white/85">
                        <span>Drowsy alerts: {liveSnapshot.warningAlerts + liveSnapshot.criticalAlerts}</span>
                        <span>Route deviations: {tripDeviationEvents}</span>
                        <span>Emergency: {tripEmergencyEvents}</span>
                      </div>
                    </div>

                    <div className={`mt-2 rounded-lg px-2 py-1.5 text-[11px] font-bold ${liveRisk.cls}`}>
                      Final Status: {liveRisk.label === "Safe" ? "GREEN - Safe ride" : liveRisk.label === "Warning" ? "YELLOW - Mild risk" : "RED - High risk"}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {hasActiveTrip && locationError && (!isDriverMode || driverSlide === "map") && (
        <div className="absolute left-4 right-4 top-[31rem] z-[1000] rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white shadow-xl">
          <AlertTriangle size={14} className="mr-2 inline" />
          {locationError}
        </div>
      )}

      {hasActiveTrip && isDriverMode && driverSlide === "map" && showRoadsidePanel && (
        <div className="absolute inset-x-4 top-[31rem] z-[1120] rounded-2xl border border-amber-300/70 bg-white/95 p-4 text-gray-900 shadow-2xl backdrop-blur">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-amber-700">
              Find Garage{" "}
              {roadsideSource === "offline-cache" ? "(Offline)" : "(Live)"}
            </p>
            <button
              type="button"
              onClick={() => setShowRoadsidePanel(false)}
              className="rounded-md border border-gray-200 px-2 py-1 text-xs font-semibold text-gray-600"
            >
              Close
            </button>
          </div>
          <p className="mt-1 text-xs text-gray-600">
            Nearest garages with phone and location.
          </p>

          <div className="mt-2 space-y-2">
            {nearbyGarages.length === 0 ? (
              <p className="text-xs text-gray-500">Finding nearby garages...</p>
            ) : (
              nearbyGarages.map((garage) => (
                <div
                  key={garage.item.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-gray-800">
                      {garage.item.name}
                    </p>
                    <p className="truncate text-[11px] text-gray-500">
                      {garage.item.phone}
                    </p>
                    <p className="truncate text-[11px] text-gray-500">
                      {garage.item.location.lat.toFixed(5)},{" "}
                      {garage.item.location.lng.toFixed(5)}
                    </p>
                    <p className="truncate text-[11px] text-gray-500">
                      {garage.distanceKm.toFixed(1)} km away
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => callNumber(garage.item.phone)}
                    className="rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-700"
                  >
                    Call
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {hasActiveTrip &&
        !isDriverMode &&
        showDeviationPanel &&
        (deviationState || driverIncident || replacementDriver) && (
          <div className="absolute inset-x-4 bottom-[7.25rem] z-[1150] rounded-2xl border border-red-300/70 bg-white/95 p-4 text-gray-900 shadow-2xl backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-red-600">
                  {deviationState
                    ? `Route Deviation ${deviationState.severity === "danger" ? "Detected" : "Warning"}`
                    : "Driver Vehicle Issue Reported"}
                </p>
                <p className="mt-1 text-sm font-semibold">
                  {deviationState
                    ? deviationState.message
                    : "Your current driver reported a puncture/mechanical issue. We can schedule a replacement ride."}
                </p>
                {deviationState && (
                  <p className="mt-1 text-xs text-gray-600">
                    Off route: {deviationState.distanceOffRouteKm.toFixed(2)} km
                    | Risk: {deviationState.riskScore}%
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowDeviationPanel(false)}
                className="rounded-md border border-gray-200 px-2 py-1 text-xs font-semibold text-gray-600"
              >
                Hide
              </button>
            </div>

            <div className="mt-3 rounded-xl bg-gray-50 p-3">
              <p className="text-xs font-semibold text-gray-700">
                Who should be notified?
              </p>

              <div className="mt-2 space-y-2">
                {emergencyContacts.length === 0 ? (
                  <p className="text-xs text-gray-500">
                    No emergency contacts found. Add them in the SOS screen.
                  </p>
                ) : (
                  emergencyContacts.map((contact) => (
                    <label
                      key={contact.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-gray-800">
                          {contact.name}
                        </p>
                        <p className="truncate text-[11px] text-gray-500">
                          {contact.phone} (SMS)
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={selectedContactIds.includes(contact.id)}
                        onChange={() => toggleContactSelection(contact.id)}
                      />
                    </label>
                  ))
                )}

                <label className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2">
                  <div>
                    <p className="text-xs font-semibold text-gray-800">
                      Police Control Room
                    </p>
                    <p className="text-[11px] text-gray-500">
                      {POLICE_CONTACT.phone} (SMS)
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={contactPolice}
                    onChange={() => setContactPolice((prev) => !prev)}
                  />
                </label>
              </div>
            </div>

            {dispatchStatus && (
              <div
                className={`mt-3 rounded-lg px-3 py-2 text-xs font-semibold ${
                  dispatchStatusType === "success"
                    ? "bg-green-100 text-green-700"
                    : dispatchStatusType === "error"
                      ? "bg-red-100 text-red-700"
                      : "bg-gray-100 text-gray-700"
                }`}
              >
                {dispatchStatus}
              </div>
            )}

            {driverIncident && (
              <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3">
                <p className="text-xs font-bold uppercase tracking-[0.08em] text-amber-700">
                  Driver reported vehicle issue
                </p>
                <p className="mt-1 text-xs font-medium text-amber-800">
                  Reason:{" "}
                  {driverIncident.reason === "puncture"
                    ? "Tyre puncture"
                    : "Mechanical issue"}
                </p>
                <p className="text-[11px] text-amber-700">
                  Passenger safety mode: schedule a replacement driver.
                </p>
                <button
                  type="button"
                  onClick={handleScheduleReplacementRide}
                  disabled={isFindingReplacement}
                  className="mt-2 w-full rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
                >
                  {isFindingReplacement
                    ? "Finding nearest driver..."
                    : "Schedule New Ride with Nearest Driver"}
                </button>
              </div>
            )}

            {replacementDriver && (
              <div className="mt-2 rounded-xl border border-green-200 bg-green-50 p-3">
                <p className="text-xs font-bold text-green-700">
                  Replacement Driver Assigned
                </p>
                <p className="mt-1 text-xs font-semibold text-green-800">
                  {replacementDriver.name} · {replacementDriver.vehicle}
                </p>
                <p className="text-[11px] text-green-700">
                  {replacementDriver.phone}
                </p>
                <button
                  type="button"
                  onClick={() => callNumber(replacementDriver.phone)}
                  className="mt-2 rounded-lg border border-green-300 bg-white px-3 py-1.5 text-[11px] font-bold text-green-700"
                >
                  Call Replacement Driver
                </button>
              </div>
            )}

            {replacementCandidates.length > 0 && (
              <div className="mt-2 rounded-xl border border-blue-200 bg-blue-50 p-3">
                <p className="text-xs font-bold text-blue-700">
                  Available Drivers Nearby
                </p>
                <div className="mt-2 space-y-2">
                  {replacementCandidates.map((candidate) => (
                    <div
                      key={`candidate-${candidate.id}`}
                      className="rounded-lg border border-blue-200 bg-white px-3 py-2"
                    >
                      <p className="text-xs font-semibold text-gray-900">
                        {candidate.name} · {candidate.vehicle}
                      </p>
                      <p className="text-[11px] text-gray-600">
                        {candidate.phone} ·{" "}
                        {Number(candidate.distanceKm).toFixed(1)} km away
                      </p>
                      <button
                        type="button"
                        disabled={isFindingReplacement}
                        onClick={() =>
                          handleAssignSpecificReplacement(candidate)
                        }
                        className="mt-2 rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-[11px] font-bold text-blue-700 disabled:opacity-60"
                      >
                        Assign This Driver
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {isFindingReplacement && (
              <div className="mt-2 rounded-xl border border-blue-200 bg-blue-50 p-3">
                <p className="text-xs font-semibold text-blue-700">
                  Searching for available drivers near your current location...
                </p>
              </div>
            )}

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleDispatchEmergency}
                disabled={isDispatchingEmergency}
                className="rounded-xl bg-red-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
              >
                {isDispatchingEmergency ? "Sending..." : "Send Emergency Alert"}
              </button>
              <button
                type="button"
                onClick={() => callNumber(POLICE_CONTACT.phone)}
                className="rounded-xl border border-red-300 bg-white px-3 py-2 text-xs font-bold text-red-700"
              >
                Call Police
              </button>
            </div>

            {selectedContacts.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedContacts.map((contact) => (
                  <button
                    key={`call-${contact.id}`}
                    type="button"
                    onClick={() => callNumber(contact.phone)}
                    className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold text-gray-700"
                  >
                    Call {contact.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

      {!hasActiveTrip ? (
        <EmptyRideState onNavigate={onNavigate} />
      ) : (
        <div className="absolute inset-x-0 bottom-0 z-[1100] rounded-t-3xl bg-white px-5 pb-24 pt-4 text-gray-950 shadow-[0_-10px_30px_rgba(0,0,0,0.22)]">
          <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-gray-300" />
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                if (isDriverMode) {
                  finalizeDriverRide("manual");
                  return;
                }
                onNavigate("home");
              }}
              className="grid h-11 w-11 place-items-center rounded-full border border-gray-200 text-gray-700"
              aria-label="Close ride"
            >
              <X size={24} />
            </button>
            <div className="text-center">
              <p className="text-3xl font-extrabold text-[#08783c]">
                {etaMinutes} min
              </p>
              <p className="text-sm font-semibold text-gray-500">
                {distanceToDestination.toFixed(1)} km
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowEmergencyAlert(true)}
              className="grid h-11 w-11 place-items-center rounded-full bg-red-600 text-white shadow-lg"
              aria-label="Emergency"
            >
              <Phone size={21} />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowEmergencyAlert(true)}
            className="mt-3 w-full rounded-2xl bg-red-600 px-4 py-3 text-sm font-extrabold text-white shadow-lg"
          >
            Call Emergency
          </button>
        </div>
      )}

      <EmergencyAlert
        open={showEmergencyAlert}
        onClose={() => setShowEmergencyAlert(false)}
        payloadBase={{
          passenger: {
            phoneNumber:
              window.localStorage.getItem("phoneNumber") || "passenger-demo",
            name: window.localStorage.getItem("name") || "Passenger",
          },
          driver: {
            name: tripConfig.driverName || "Assigned driver",
            phoneNumber: tripConfig.driverPhone || "",
          },
          trip: {
            sourceLabel: tripConfig.sourceLabel,
            source: tripConfig.source,
            destinationLabel: tripConfig.destinationLabel,
            destination: tripConfig.destination,
          },
          location: currentLocation,
        }}
      />

      <div className="absolute inset-x-0 bottom-0 z-[1200]"></div>
    </motion.div>
  );
};

export default MonitoringScreen;
