import { motion } from "framer-motion";
import { Bell, LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import AppLogo from "@/components/AppLogo";
import PlaceSearchField from "@/components/PlaceSearchField";
import { geocodePlace, PlaceSuggestion } from "@/lib/placeSearch";
import { LatLng } from "@/lib/navigationSafety";
import L from "leaflet";
import {
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";

const screenTransition = {
  duration: 0.58,
  ease: [0.22, 1, 0.36, 1],
};

export interface TripConfig {
  sourceLabel: string;
  destinationLabel: string;
  source: LatLng;
  destination: LatLng;
  toleranceKm: number;
  sampleIntervalSec: number;
  rideOtpCode?: string;
  rideId?: number;
  driverName?: string;
  driverPhone?: string;
  driverVehicleDetails?: string;
}

interface HomeScreenProps {
  onCreateRide: (trip: TripConfig) => void;
}

const HomeScreen = ({ onCreateRide }: HomeScreenProps) => {
  const [sourceQuery, setSourceQuery] = useState("");
  const [destinationQuery, setDestinationQuery] = useState("");
  const [sourceSelection, setSourceSelection] =
    useState<PlaceSuggestion | null>(null);
  const [destinationSelection, setDestinationSelection] =
    useState<PlaceSuggestion | null>(null);
  const [currentLocation, setCurrentLocation] = useState<LatLng | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [shouldFollowMap, setShouldFollowMap] = useState(true);
  const [locationStatus, setLocationStatus] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [hasResolvedInitialLocation, setHasResolvedInitialLocation] =
    useState(false);
  const [isResolvingTrip, setIsResolvingTrip] = useState(false);
  const [tripError, setTripError] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);

  const defaultCenter = useMemo<LatLng>(
    () => ({ lat: 12.9716, lng: 77.5946 }),
    [],
  );

  const sourceMarkerIcon = useMemo(
    () =>
      L.divIcon({
        className: "",
        html: '<div style="width:14px;height:14px;border-radius:9999px;background:#2563eb;border:2px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.35);"></div>',
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      }),
    [],
  );

  const destinationMarkerIcon = useMemo(
    () =>
      L.divIcon({
        className: "",
        html: '<div style="width:14px;height:14px;border-radius:9999px;background:#16a34a;border:2px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.35);"></div>',
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      }),
    [],
  );

  const currentLocationIcon = useMemo(() => {
    const rotation = heading ?? 0;

    return L.divIcon({
      className: "",
      html: `
        <div style="position:relative;width:34px;height:34px;display:grid;place-items:center;">
          <div style="position:absolute;width:34px;height:34px;border-radius:9999px;background:rgba(37,99,235,.16);"></div>
          <div style="position:absolute;left:12px;top:-6px;width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:16px solid rgba(37,99,235,.85);transform-origin:5px 23px;transform:rotate(${rotation}deg);filter:drop-shadow(0 1px 3px rgba(0,0,0,.35));"></div>
          <div style="width:16px;height:16px;border-radius:9999px;background:#2563eb;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.4);"></div>
        </div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 17],
    });
  }, [heading]);

  const selectedCenter = sourceSelection
    ? { lat: sourceSelection.lat, lng: sourceSelection.lng }
    : destinationSelection
      ? { lat: destinationSelection.lat, lng: destinationSelection.lng }
      : currentLocation
        ? currentLocation
        : defaultCenter;

  const SelectionFocus = ({
    center,
    shouldFollow,
    onUserPan,
  }: {
    center: LatLng;
    shouldFollow: boolean;
    onUserPan: () => void;
  }) => {
    const map = useMap();
    useMapEvents({
      dragstart: onUserPan,
    });

    useEffect(() => {
      if (shouldFollow) {
        map.setView([center.lat, center.lng], map.getZoom(), { animate: true });
      }
    }, [center.lat, center.lng, map, shouldFollow]);

    return null;
  };

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationStatus("error");
      setHasResolvedInitialLocation(true);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const livePoint = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        setCurrentLocation(livePoint);
        setLocationStatus("ready");
        setHasResolvedInitialLocation(true);

        watchIdRef.current = navigator.geolocation.watchPosition(
          (nextPosition) => {
            const nextPoint = {
              lat: nextPosition.coords.latitude,
              lng: nextPosition.coords.longitude,
            };

            setCurrentLocation(nextPoint);
            if (
              typeof nextPosition.coords.heading === "number" &&
              Number.isFinite(nextPosition.coords.heading)
            ) {
              setHeading(nextPosition.coords.heading);
            }
          },
          () => undefined,
          {
            enableHighAccuracy: true,
            timeout: 8000,
            maximumAge: 3000,
          },
        );
      },
      () => {
        setLocationStatus("error");
        setHasResolvedInitialLocation(true);
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0,
      },
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, []);

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

  const resolveOrThrow = async (
    query: string,
    label: string,
    selected: PlaceSuggestion | null,
  ) => {
    const trimmed = query.trim();
    if (!trimmed) {
      throw new Error(`Please enter a ${label} location.`);
    }

    if (selected && selected.label.toLowerCase() === trimmed.toLowerCase()) {
      return selected;
    }

    const place = await geocodePlace(trimmed);
    if (!place) {
      throw new Error(
        `Could not find ${label}. Try a more specific place name.`,
      );
    }

    return place;
  };

  const handleStartRide = async () => {
    try {
      setIsResolvingTrip(true);
      setTripError(null);

      const [sourcePlace, destinationPlace] = await Promise.all([
        resolveOrThrow(sourceQuery, "source", sourceSelection),
        resolveOrThrow(destinationQuery, "destination", destinationSelection),
      ]);

      onCreateRide({
        sourceLabel: sourcePlace.label,
        destinationLabel: destinationPlace.label,
        source: { lat: sourcePlace.lat, lng: sourcePlace.lng },
        destination: { lat: destinationPlace.lat, lng: destinationPlace.lng },
        toleranceKm: 0.1,
        sampleIntervalSec: 5,
        driverName: "SafeRide Driver",
        driverPhone: "+91 demo-driver",
        driverVehicleDetails: "White Swift KA-01-AB-1234",
      });
    } catch (error) {
      setTripError(
        error instanceof Error
          ? error.message
          : "Unable to resolve the entered places.",
      );
    } finally {
      setIsResolvingTrip(false);
    }
  };

  if (!hasResolvedInitialLocation) {
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
      initial={{ opacity: 0, y: 18, scale: 0.985, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
      exit={{ opacity: 0, y: -18, scale: 1.015, filter: "blur(8px)" }}
      transition={screenTransition}
      className="relative h-full overflow-hidden bg-black"
    >
      <div className="absolute inset-0 z-0">
        <MapContainer
          center={[selectedCenter.lat, selectedCenter.lng]}
          zoom={13}
          className="h-full w-full"
          style={{ minHeight: "100%" }}
          zoomControl={false}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap contributors"
          />

          {sourceSelection && (
            <Marker
              position={[sourceSelection.lat, sourceSelection.lng]}
              icon={sourceMarkerIcon}
            />
          )}
          {destinationSelection && (
            <Marker
              position={[destinationSelection.lat, destinationSelection.lng]}
              icon={destinationMarkerIcon}
            />
          )}
          {currentLocation && (
            <Marker
              position={[currentLocation.lat, currentLocation.lng]}
              icon={currentLocationIcon}
            />
          )}

          {sourceSelection && destinationSelection && (
            <Polyline
              positions={[
                [sourceSelection.lat, sourceSelection.lng],
                [destinationSelection.lat, destinationSelection.lng],
              ]}
              color="#2563eb"
              weight={3}
            />
          )}

          <SelectionFocus
            center={selectedCenter}
            shouldFollow={shouldFollowMap}
            onUserPan={() => setShouldFollowMap(false)}
          />
        </MapContainer>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/55" />
      </div>

      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between px-6 pt-2 pb-4">
        <AppLogo />
        <button className="w-9 h-9 rounded-full bg-card/85 backdrop-blur border border-border flex items-center justify-center">
          <Bell size={16} className="text-foreground" />
        </button>
      </div>

      {/* Search fields */}
      <div className="absolute left-4 right-4 top-16 z-10 rounded-3xl border border-white/10 bg-black/35 backdrop-blur-xl px-4 py-4 shadow-2xl">
        <div className="space-y-3">
          <PlaceSearchField
            label="Source"
            placeholder="Enter pickup location"
            value={sourceQuery}
            onChange={setSourceQuery}
            onSelectPlace={(place) => {
              setSourceSelection(place);
              setShouldFollowMap(true);
            }}
            currentLocation={currentLocation}
            showCurrentLocationOption
            showLabel={false}
          />
          <PlaceSearchField
            label="Destination"
            placeholder="Enter drop-off location"
            value={destinationQuery}
            onChange={setDestinationQuery}
            onSelectPlace={(place) => {
              setDestinationSelection(place);
              setShouldFollowMap(true);
            }}
            showLabel={false}
          />
          {tripError && (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/15 px-4 py-3">
              <p className="text-xs font-semibold text-destructive">
                Could not start trip
              </p>
              <p className="text-xs text-white mt-1">{tripError}</p>
            </div>
          )}
          <motion.button
            type="button"
            onClick={handleStartRide}
            disabled={isResolvingTrip}
            whileTap={{ scale: 0.97 }}
            whileHover={{ scale: 1.01 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="w-full rounded-2xl bg-primary py-4 text-base font-bold text-primary-foreground shadow-xl shadow-black/20 disabled:opacity-70"
          >
            {isResolvingTrip ? (
              <span className="inline-flex items-center gap-2">
                <LoaderCircle size={16} className="animate-spin" />
                Creating Ride
              </span>
            ) : (
              "Create Ride"
            )}
          </motion.button>
        </div>
      </div>

      {/* Location pin */}
      <div className="absolute top-[42%] left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none">
        <div className="relative">
          <div className="w-4 h-4 rounded-full bg-primary border-[3px] border-primary-foreground" />
          <div className="absolute inset-0 w-4 h-4 rounded-full bg-primary/40 animate-pulse-ring" />
        </div>
      </div>
    </motion.div>
  );
};

export default HomeScreen;
