import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import BottomNav from "@/components/BottomNav";
import PhoneFrame from "@/components/PhoneFrame";
import RoleSelectScreen from "@/screens/RoleSelectScreen";
import OnboardingScreen from "@/screens/OnboardingScreen";
import LoginScreen from "@/screens/LoginScreen";
import HomeScreen from "@/screens/HomeScreen";
import MonitoringScreen from "@/screens/MonitoringScreen";
import EmergencyScreen from "@/screens/EmergencyScreen";
import TripSummaryScreen from "../screens/TripSummaryScreen";
import DriverHomeScreen from "@/screens/DriverHomeScreen";
import DriverFindGarageScreen from "@/screens/DriverFindGarageScreen";
import DriverFindHospitalScreen from "@/screens/DriverFindHospitalScreen";
import DriverMonitoringScreen from "@/screens/DriverMonitoringScreen";
import DriverVerificationScreen from "@/screens/DriverVerificationScreen";
import DriverRideSetupScreen from "@/screens/DriverRideSetupScreen";
import PassengerJoinRideScreen, {
  type JoinedRidePayload,
} from "@/screens/PassengerJoinRideScreen";
import PassengerRideLiveScreen from "../screens/PassengerRideLiveScreen";
import ProfileScreen from "@/screens/ProfileScreen";
import { TripConfig } from "@/screens/HomeScreen";

type Screen =
  | "onboarding"
  | "role"
  | "login"
  | "home"
  | "driverVerify"
  | "driverRideSetup"
  | "driverFindGarage"
  | "driverFindHospital"
  | "passengerJoinRide"
  | "passengerRideLive"
  | "profile"
  | "monitoring"
  | "emergency"
  | "summary";

const Index = () => {
  const [screen, setScreen] = useState<Screen>("onboarding");
  const [emergencyReturnScreen, setEmergencyReturnScreen] =
    useState<Screen>("monitoring");
  const [role, setRole] = useState<"driver" | "passenger" | null>(null);
  const [driverCredential, setDriverCredential] = useState<string>(
    () => localStorage.getItem("phoneNumber") || "driver-demo",
  );
  const [hasActiveTrip, setHasActiveTrip] = useState(false);
  const [joinedRide, setJoinedRide] = useState<JoinedRidePayload | null>(null);
  const [activeTripId, setActiveTripId] = useState<string | null>(null);
  const [summaryRefreshKey, setSummaryRefreshKey] = useState(0);
  const [driverJoinedRideTrip, setDriverJoinedRideTrip] =
    useState<TripConfig | null>(null);
  const [tripConfig, setTripConfig] = useState<TripConfig>({
    sourceLabel: "MG Road, Bangalore",
    destinationLabel: "Koramangala, Bangalore",
    source: { lat: 12.9758, lng: 77.6058 },
    destination: { lat: 12.9352, lng: 77.6245 },
    toleranceKm: 0.1,
    sampleIntervalSec: 5,
    driverName: "SafeRide Driver",
    driverPhone: "+91 demo-driver",
    driverVehicleDetails: "White Swift KA-01-AB-1234",
  });

  const resolveApiBase = () => {
    const configured = import.meta.env.VITE_API_BASE_URL;
    if (typeof configured === "string" && configured.trim()) {
      const clean = configured.trim().replace(/\/$/, "");
      return clean.endsWith("/api") ? clean : `${clean}/api`;
    }

    return `${window.location.protocol}//${window.location.hostname}:5001/api`;
  };

  const checkDriverOnboardingDone = async (phone: string) => {
    try {
      const response = await fetch(
        `${resolveApiBase()}/auth/driver-onboarding/${encodeURIComponent(phone)}`,
      );
      const data = await response.json();
      if (!response.ok || !data?.success || !data?.onboarding) {
        return false;
      }

      const onboarding = data.onboarding;
      return Boolean(
        onboarding.driver_name &&
        onboarding.car_number &&
        onboarding.car_model &&
        onboarding.face_credential &&
        onboarding.face_registered,
      );
    } catch {
      return false;
    }
  };

  const handleBack = () => {
    switch (screen) {
      case "role":
        setRole(null);
        setScreen("onboarding");
        break;
      case "login":
        setScreen("role");
        break;
      case "home":
        setScreen("login");
        break;
      case "driverRideSetup":
        setScreen("home");
        break;
      case "driverFindGarage":
        setScreen("home");
        break;
      case "driverFindHospital":
        setScreen("emergency");
        break;
      case "passengerJoinRide":
        setScreen("login");
        break;
      case "passengerRideLive":
        setScreen("passengerJoinRide");
        break;
      case "profile":
        setScreen("home");
        break;
      case "monitoring":
        setHasActiveTrip(false);
        setScreen("home");
        break;
      case "driverVerify":
        setScreen("login");
        break;
      case "emergency":
        setScreen(emergencyReturnScreen);
        break;
      case "summary":
        setScreen("home");
        break;
    }
  };

  const navigateToEmergency = (from: Screen) => {
    setEmergencyReturnScreen(from);
    setScreen("emergency");
  };

  const handleRoleSelect = (selectedRole: "driver" | "passenger") => {
    setRole(selectedRole);
    setScreen("login");
  };

  const shouldShowBottomNav =
    Boolean(role) && !["onboarding", "role", "login"].includes(screen);
  const bottomNavActive =
    screen === "passengerRideLive" ? "monitoring" : screen;

  const endTripAndSyncSummary = async ({
    otpCode,
    finalLocation,
    distanceKm,
    durationSec,
    driverPerformance,
  }: {
    otpCode: string;
    finalLocation: { lat: number; lng: number } | null;
    distanceKm: number;
    durationSec: number;
    driverPerformance?: {
      safetyScore?: number;
      deviationAlerts?: number;
      averageSpeedKmph?: number;
      routeAdherencePercent?: number;
      durationSec?: number;
      distanceKm?: number;
    };
  }) => {
    const response = await fetch(`${resolveApiBase()}/rides/end`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        otpCode,
        endedBy: role || "passenger",
        finalLat: finalLocation?.lat ?? null,
        finalLng: finalLocation?.lng ?? null,
        distanceKm,
        durationSec,
        driverPerformance: driverPerformance || null,
      }),
    });

    const data = await response.json();
    if (!response.ok || !data?.success) {
      throw new Error(data?.message || "Failed to end trip");
    }

    setHasActiveTrip(false);
    setSummaryRefreshKey((prev) => prev + 1);
    setScreen("summary");
  };

  const renderScreen = () => {
    switch (screen) {
      case "onboarding":
        return (
          <OnboardingScreen key="onboarding" onNext={() => setScreen("role")} />
        );
      case "role":
        return <RoleSelectScreen key="role" onSelect={handleRoleSelect} />;
      case "login":
        return (
          <LoginScreen
            key="login"
            userType={role ?? "passenger"}
            onLogin={async (user) => {
              if (user.userType === "driver") {
                const phone = user.phoneNumber || "driver-demo";
                setDriverCredential(phone);

                const done = await checkDriverOnboardingDone(phone);
                setScreen(done ? "home" : "driverVerify");
                return;
              }
              setScreen("home");
            }}
          />
        );
      case "home":
        return role === "driver" ? (
          hasActiveTrip && driverJoinedRideTrip ? (
            <MonitoringScreen
              key="driver-home-current-ride"
              onEmergency={() => navigateToEmergency("home")}
              onNavigate={(s) => setScreen(s as Screen)}
              tripConfig={driverJoinedRideTrip}
              onTripChange={setDriverJoinedRideTrip}
              hasActiveTrip={hasActiveTrip}
              isDriverMode
              tripId={activeTripId || undefined}
            />
          ) : (
            <DriverHomeScreen
              key="driver-home"
              onGoOnline={async () => {
                const phone =
                  localStorage.getItem("phoneNumber") ||
                  driverCredential ||
                  "driver-demo";
                const done = await checkDriverOnboardingDone(phone);
                setScreen(done ? "driverRideSetup" : "driverVerify");
              }}
              onOpenFindGarage={() => setScreen("driverFindGarage")}
            />
          )
        ) : (
          <HomeScreen
            key="passenger-home"
            onCreateRide={async (trip) => {
              setTripConfig(trip);

              try {
                const response = await fetch(
                  `${resolveApiBase()}/rides/create`,
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      passengerPhone:
                        localStorage.getItem("phoneNumber") || "passenger-demo",
                      sourceLabel: trip.sourceLabel,
                      destinationLabel: trip.destinationLabel,
                      startLocation: trip.source,
                      destinationLocation: trip.destination,
                    }),
                  },
                );

                const data = await response.json();
                if (!response.ok || !data?.success || !data?.ride?.otp_code) {
                  throw new Error(data?.message || "Could not create ride");
                }

                setJoinedRide({
                  otpCode: String(data.ride.otp_code),
                  driverName: "Waiting for driver",
                  carNumber: "TBD",
                  carModel: "TBD",
                  faceImage: null,
                  lat: trip.source.lat,
                  lng: trip.source.lng,
                  sourceLabel: trip.sourceLabel,
                  destinationLabel: trip.destinationLabel,
                  startLat: trip.source.lat,
                  startLng: trip.source.lng,
                  endLat: trip.destination.lat,
                  endLng: trip.destination.lng,
                });
                setActiveTripId(String(data.ride.otp_code));

                setScreen("passengerRideLive");
              } catch {
                setJoinedRide(null);
                setScreen("monitoring");
              }

              setHasActiveTrip(true);
            }}
          />
        );
      case "driverVerify":
        return (
          <DriverVerificationScreen
            key="driver-verify"
            phoneNumber={driverCredential}
            onVerified={() => {
              setScreen("home");
            }}
          />
        );
      case "driverRideSetup":
        return (
          <DriverRideSetupScreen
            key="driver-ride-setup"
            driverPhone={driverCredential}
            onJoinedRide={(ride) => {
              setActiveTripId(ride.otpCode);
              setDriverJoinedRideTrip({
                rideId: ride.rideId,
                rideOtpCode: ride.otpCode,
                sourceLabel: ride.sourceLabel,
                destinationLabel: ride.destinationLabel,
                source: ride.source,
                destination: ride.destination,
                toleranceKm: 0.1,
                sampleIntervalSec: 5,
                driverName: "Driver",
                driverPhone: driverCredential,
              });
              setHasActiveTrip(true);
              setScreen("monitoring");
            }}
          />
        );
      case "driverFindGarage":
        return (
          <DriverFindGarageScreen
            key="driver-find-garage"
            onBackToHome={() => setScreen("home")}
          />
        );
      case "driverFindHospital":
        return (
          <DriverFindHospitalScreen
            key="driver-find-hospital"
            onBackToEmergency={() => setScreen("emergency")}
          />
        );
      case "passengerJoinRide":
        return (
          <PassengerJoinRideScreen
            key="passenger-join-ride"
            passengerPhone={
              localStorage.getItem("phoneNumber") || "passenger-demo"
            }
            onJoined={(ride) => {
              setJoinedRide(ride);
              setActiveTripId(ride.otpCode);
              setHasActiveTrip(true);
              setScreen("passengerRideLive");
            }}
          />
        );
      case "passengerRideLive":
        return joinedRide ? (
          <PassengerRideLiveScreen
            key="passenger-ride-live"
            ride={joinedRide}
            tripId={activeTripId || joinedRide.otpCode}
            onOpenEmergency={() => navigateToEmergency("passengerRideLive")}
            onEndTrip={endTripAndSyncSummary}
          />
        ) : (
          <PassengerJoinRideScreen
            key="passenger-join-ride-fallback"
            passengerPhone={
              localStorage.getItem("phoneNumber") || "passenger-demo"
            }
            onJoined={(ride) => {
              setJoinedRide(ride);
              setActiveTripId(ride.otpCode);
              setHasActiveTrip(true);
              setScreen("passengerRideLive");
            }}
          />
        );
      case "monitoring":
        return role === "driver" && driverJoinedRideTrip ? (
          <MonitoringScreen
            key="driver-route-monitoring"
            onEmergency={() => navigateToEmergency("monitoring")}
            onNavigate={(s) => setScreen(s as Screen)}
            tripConfig={driverJoinedRideTrip}
            onTripChange={setDriverJoinedRideTrip}
            hasActiveTrip={hasActiveTrip}
            isDriverMode
            tripId={activeTripId || undefined}
          />
        ) : role === "driver" ? (
          <DriverMonitoringScreen
            key="driver-monitoring"
            onEmergency={() => navigateToEmergency("monitoring")}
          />
        ) : (
          <MonitoringScreen
            key="passenger-monitoring"
            onEmergency={() => navigateToEmergency("monitoring")}
            onNavigate={(s) => setScreen(s as Screen)}
            tripConfig={tripConfig}
            onTripChange={setTripConfig}
            hasActiveTrip={hasActiveTrip}
            tripId={activeTripId || undefined}
          />
        );
      case "profile":
        return (
          <ProfileScreen
            key="profile"
            role={role || "passenger"}
            phoneNumber={localStorage.getItem("phoneNumber") || "N/A"}
            onOpenRegistration={
              role === "driver" ? () => setScreen("driverVerify") : undefined
            }
          />
        );
      case "emergency":
        return (
          <EmergencyScreen
            key="emergency"
            onBack={() => setScreen(emergencyReturnScreen)}
            tripConfig={tripConfig}
            hasActiveTrip={hasActiveTrip}
            role={role || "passenger"}
            activeTripId={activeTripId}
            onOpenFindHospital={
              role === "driver"
                ? () => setScreen("driverFindHospital")
                : undefined
            }
          />
        );
      case "summary":
        return (
          <TripSummaryScreen
            key={`summary-${summaryRefreshKey}`}
            role={role || "passenger"}
            phoneNumber={localStorage.getItem("phoneNumber") || "N/A"}
            refreshKey={summaryRefreshKey}
          />
        );
    }
  };

  return (
    <PhoneFrame showBack={screen !== "onboarding"} onBack={handleBack}>
      <div className="relative h-full">
        <div className={shouldShowBottomNav ? "h-full pb-[84px]" : "h-full"}>
          <AnimatePresence mode="wait" initial={false}>
            {renderScreen()}
          </AnimatePresence>
        </div>

        {shouldShowBottomNav && (
          <div className="absolute inset-x-0 bottom-0 z-[3000] pointer-events-auto">
            <BottomNav
              active={bottomNavActive}
              onNavigate={(nextScreen) => {
                if (nextScreen === "emergency") {
                  navigateToEmergency(screen);
                  return;
                }

                setScreen(nextScreen as Screen);
              }}
            />
          </div>
        )}
      </div>
    </PhoneFrame>
  );
};

export default Index;
