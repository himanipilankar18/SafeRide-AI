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
import TripSummaryScreen from "@/screens/TripSummaryScreen";
import DriverHomeScreen from "@/screens/DriverHomeScreen";
import DriverMonitoringScreen from "@/screens/DriverMonitoringScreen";
import DriverVerificationScreen from "@/screens/DriverVerificationScreen";
import DriverRideSetupScreen from "@/screens/DriverRideSetupScreen";
import PassengerJoinRideScreen, {
  type JoinedRidePayload,
} from "@/screens/PassengerJoinRideScreen";
import PassengerRideLiveScreen from "@/screens/PassengerRideLiveScreen";
import ProfileScreen from "@/screens/ProfileScreen";
import { TripConfig } from "@/screens/HomeScreen";

type Screen =
  | "onboarding"
  | "role"
  | "login"
  | "home"
  | "driverVerify"
  | "driverRideSetup"
  | "passengerJoinRide"
  | "passengerRideLive"
  | "profile"
  | "monitoring"
  | "emergency"
  | "summary";

const NAV_HIDDEN_SCREENS: Screen[] = [
  "onboarding",
  "role",
  "login",
  "driverVerify",
];
const NAV_TABS: Screen[] = [
  "home",
  "monitoring",
  "emergency",
  "summary",
  "profile",
];

const Index = () => {
  const [screen, setScreen] = useState<Screen>("onboarding");
  const [role, setRole] = useState<"driver" | "passenger" | null>(null);
  const [driverCredential, setDriverCredential] = useState<string>(
    () => localStorage.getItem("phoneNumber") || "driver-demo",
  );
  const [hasActiveTrip, setHasActiveTrip] = useState(false);
  const [joinedRide, setJoinedRide] = useState<JoinedRidePayload | null>(null);
  const [driverJoinedRideTrip, setDriverJoinedRideTrip] =
    useState<TripConfig | null>(null);
  const [tripConfig, setTripConfig] = useState<TripConfig>({
    sourceLabel: "MG Road, Bangalore",
    destinationLabel: "Koramangala, Bangalore",
    source: { lat: 12.9758, lng: 77.6058 },
    destination: { lat: 12.9352, lng: 77.6245 },
    toleranceKm: 0.3,
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
        setScreen("monitoring");
        break;
      case "summary":
        setScreen("home");
        break;
    }
  };

  const handleRoleSelect = (selectedRole: "driver" | "passenger") => {
    setRole(selectedRole);
    setScreen("login");
  };

  const shouldShowBottomNav =
    Boolean(role) && !NAV_HIDDEN_SCREENS.includes(screen);
  const activeNavScreen: Screen = NAV_TABS.includes(screen) ? screen : "home";

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
          <DriverHomeScreen
            key="driver-home"
            onGoOnline={async () => {
              const phone = localStorage.getItem("phoneNumber") || driverCredential || "driver-demo";
              const done = await checkDriverOnboardingDone(phone);
              setScreen(done ? "driverRideSetup" : "driverVerify");
            }}
            onOpenRoadsideHelp={() => setScreen("monitoring")}
            onOpenRegistration={() => setScreen("driverVerify")}
          />
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
                });

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
              setDriverJoinedRideTrip({
                sourceLabel: ride.sourceLabel,
                destinationLabel: ride.destinationLabel,
                source: ride.source,
                destination: ride.destination,
                toleranceKm: 0.3,
                sampleIntervalSec: 5,
                driverName: "Driver",
                driverPhone: driverCredential,
              });
              setHasActiveTrip(true);
              setScreen("monitoring");
            }}
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
          />
        ) : (
          <PassengerJoinRideScreen
            key="passenger-join-ride-fallback"
            passengerPhone={
              localStorage.getItem("phoneNumber") || "passenger-demo"
            }
            onJoined={(ride) => {
              setJoinedRide(ride);
              setHasActiveTrip(true);
              setScreen("passengerRideLive");
            }}
          />
        );
      case "monitoring":
        return role === "driver" && driverJoinedRideTrip ? (
          <MonitoringScreen
            key="driver-route-monitoring"
            onEmergency={() => setScreen("emergency")}
            onNavigate={(s) => setScreen(s as Screen)}
            tripConfig={driverJoinedRideTrip}
            onTripChange={setDriverJoinedRideTrip}
            hasActiveTrip={hasActiveTrip}
            isDriverMode
          />
        ) : role === "driver" ? (
          <DriverMonitoringScreen
            key="driver-monitoring"
            onEmergency={() => setScreen("emergency")}
          />
        ) : (
          <MonitoringScreen
            key="passenger-monitoring"
            onEmergency={() => setScreen("emergency")}
            onNavigate={(s) => setScreen(s as Screen)}
            tripConfig={tripConfig}
            onTripChange={setTripConfig}
            hasActiveTrip={hasActiveTrip}
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
            onBack={() => setScreen("monitoring")}
            tripConfig={tripConfig}
            hasActiveTrip={hasActiveTrip}
          />
        );
      case "summary":
        return <TripSummaryScreen key="summary" />;
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
          <div className="absolute inset-x-0 bottom-0 z-[2000]">
            <BottomNav
              active={activeNavScreen}
              onNavigate={(nextScreen) => {
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
