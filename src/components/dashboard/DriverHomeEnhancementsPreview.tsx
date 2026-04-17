import { useState } from "react";
import DriverStateIndicator from "@/components/safety/DriverStateIndicator";
import RiskMeter from "@/components/safety/RiskMeter";
import NetworkStatusBadge from "@/components/safety/NetworkStatusBadge";
import SyncStatusIndicator from "@/components/safety/SyncStatusIndicator";
import DrivingSessionTimer from "@/components/safety/DrivingSessionTimer";
import SafetyStatusBanner from "@/components/safety/SafetyStatusBanner";
import QuickActionsPanel from "@/components/dashboard/QuickActionsPanel";
import ActiveRideCard from "@/components/dashboard/ActiveRideCard";
import JoinRideCard from "@/components/dashboard/JoinRideCard";
import NearbyHelpPanel from "@/components/dashboard/NearbyHelpPanel";
import AlertHistoryPanel from "@/components/dashboard/AlertHistoryPanel";
import { driverHomeDemoData } from "@/components/dashboard/demoData";

const DriverHomeEnhancementsPreview = () => {
  const [otpCode, setOtpCode] = useState(driverHomeDemoData.otpInput);

  return (
    <div className="h-full overflow-y-auto px-4 pb-24 pt-6">
      <div className="space-y-3">
        <SafetyStatusBanner
          title="Safety Monitor Active"
          message="AI risk monitoring is running. Pull over safely if warning state persists."
          severity={driverHomeDemoData.riskLevel === "high" ? "warning" : "normal"}
        />

        <div className="flex flex-wrap items-center gap-2">
          <NetworkStatusBadge online={driverHomeDemoData.online} />
          <SyncStatusIndicator pendingCount={driverHomeDemoData.pendingSyncCount} />
        </div>

        <DriverStateIndicator state={driverHomeDemoData.driverState} updatedAtLabel="Updated 5s ago" />
        <RiskMeter value={driverHomeDemoData.riskPercent} level={driverHomeDemoData.riskLevel} />
        <DrivingSessionTimer elapsedSeconds={driverHomeDemoData.sessionSeconds} />

        <JoinRideCard otpCode={otpCode} onOtpChange={setOtpCode} onJoin={() => console.log("join", otpCode)} />

        <ActiveRideCard
          passengerName={driverHomeDemoData.activeRide.passengerName}
          pickupLabel={driverHomeDemoData.activeRide.pickupLabel}
          destinationLabel={driverHomeDemoData.activeRide.destinationLabel}
          otpCode={driverHomeDemoData.activeRide.otpCode}
          onNavigate={() => console.log("start navigation")}
          onCallPassenger={() => console.log("call passenger")}
        />

        <QuickActionsPanel
          onSOS={() => console.log("SOS")}
          onFindHelp={() => console.log("Find Help")}
          onShareLocation={() => console.log("Share Location")}
        />

        <NearbyHelpPanel spots={driverHomeDemoData.nearbyHelp} onSelectSpot={(id) => console.log("help", id)} />
        <AlertHistoryPanel items={driverHomeDemoData.alertHistory} />
      </div>
    </div>
  );
};

export default DriverHomeEnhancementsPreview;
