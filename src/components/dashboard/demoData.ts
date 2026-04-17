import type { DriverState } from "@/components/safety/DriverStateIndicator";
import type { HelpSpot } from "@/components/dashboard/NearbyHelpPanel";
import type { AlertHistoryItem } from "@/components/dashboard/AlertHistoryPanel";

interface DriverHomeDemoData {
  driverState: DriverState;
  riskPercent: number;
  riskLevel: "low" | "medium" | "high";
  online: boolean;
  pendingSyncCount: number;
  sessionSeconds: number;
  otpInput: string;
  activeRide: {
    passengerName: string;
    pickupLabel: string;
    destinationLabel: string;
    otpCode: string;
  };
  nearbyHelp: HelpSpot[];
  alertHistory: AlertHistoryItem[];
}

export const driverHomeDemoData: DriverHomeDemoData = {
  driverState: "alert",
  riskPercent: 28,
  riskLevel: "low",
  online: false,
  pendingSyncCount: 4,
  sessionSeconds: 4523,
  otpInput: "",
  activeRide: {
    passengerName: "Neha K.",
    pickupLabel: "MG Road Metro",
    destinationLabel: "HSR Layout Sector 2",
    otpCode: "802419",
  },
  nearbyHelp: [
    { id: "h1", name: "CityCare Hospital", etaLabel: "7 min", type: "hospital" },
    { id: "g1", name: "RapidFix Garage", etaLabel: "4 min", type: "garage" },
  ],
  alertHistory: [
    { id: "a1", title: "Distraction detected", timeLabel: "2 min ago", severity: "medium" },
    { id: "a2", title: "Harsh braking", timeLabel: "10 min ago", severity: "low" },
  ],
};

export type { DriverHomeDemoData };
