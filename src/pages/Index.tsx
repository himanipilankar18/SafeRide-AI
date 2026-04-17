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
import { TripConfig } from "@/screens/HomeScreen";

type Screen =
  | "onboarding"
  | "role"
  | "login"
  | "home"
  | "driverVerify"
  | "monitoring"
  | "emergency"
  | "summary";

const Index = () => {
  const [screen, setScreen] = useState<Screen>("onboarding");
  const [role, setRole] = useState<"driver" | "passenger" | null>(null);
  const [driverCredential, setDriverCredential] = useState<string>(
    () => localStorage.getItem("phoneNumber") || "driver-demo",
  );
  const [hasActiveTrip, setHasActiveTrip] = useState(false);
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
      case "monitoring":
        setHasActiveTrip(false);
        setScreen(role === "driver" ? "driverVerify" : "home");
        break;
      case "driverVerify":
        setScreen("home");
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
            onLogin={(user) => {
              if (user.userType === "driver") {
                setDriverCredential(user.phoneNumber || "driver-demo");
              }
              setScreen("home");
            }}
          />
        );
      case "home":
        return role === "driver" ? (
          <DriverHomeScreen
            key="driver-home"
            onGoOnline={() => setScreen("driverVerify")}
          />
        ) : (
          <HomeScreen
            key="passenger-home"
            onStartRide={(trip) => {
              setTripConfig(trip);
              setHasActiveTrip(true);
              setScreen("monitoring");
            }}
            onNavigate={(s) => setScreen(s as Screen)}
          />
        );
      case "driverVerify":
        return (
          <DriverVerificationScreen
            key="driver-verify"
            credential={driverCredential}
            onVerified={() => setScreen("monitoring")}
          />
        );
      case "monitoring":
        return role === "driver" ? (
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
      case "emergency":
        return (
          <EmergencyScreen
            key="emergency"
            onBack={() => setScreen("monitoring")}
            onNavigate={(s) => setScreen(s as Screen)}
            tripConfig={tripConfig}
            hasActiveTrip={hasActiveTrip}
          />
        );
      case "summary":
        return (
          <TripSummaryScreen
            key="summary"
            onNavigate={(s) => setScreen(s as Screen)}
          />
        );
    }
  };

  return (
    <PhoneFrame showBack={screen !== "onboarding"} onBack={handleBack}>
      <div className="relative h-full">
        <AnimatePresence mode="wait" initial={false}>
          {renderScreen()}
        </AnimatePresence>

        {role === "driver" &&
          ["home", "monitoring", "emergency", "summary"].includes(screen) && (
            <div className="absolute inset-x-0 bottom-0 z-[2000]">
              <BottomNav
                active={screen}
                onNavigate={(nextScreen) => {
                  if (role === "driver" && nextScreen === "monitoring") {
                    setScreen("driverVerify");
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
