import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

interface DriverRideSetupScreenProps {
  driverPhone: string;
  onJoinedRide: (ride: {
    sourceLabel: string;
    destinationLabel: string;
    source: { lat: number; lng: number };
    destination: { lat: number; lng: number };
  }) => void;
}

const DriverRideSetupScreen = ({ driverPhone, onJoinedRide }: DriverRideSetupScreenProps) => {
  const [otpCode, setOtpCode] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiBase = useMemo(() => {
    const configured = import.meta.env.VITE_API_BASE_URL;
    if (typeof configured === "string" && configured.trim()) {
      const clean = configured.trim().replace(/\/$/, "");
      return clean.endsWith("/api") ? clean : `${clean}/api`;
    }

    return `${window.location.protocol}//${window.location.hostname}:5001/api`;
  }, []);

  const joinRide = async () => {
    if (otpCode.length !== 6) {
      return;
    }

    setIsJoining(true);
    setError(null);

    try {
      const response = await fetch(`${apiBase}/rides/join-driver`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          otpCode,
          driverPhone: driverPhone || "driver-demo",
        }),
      });

      const data = await response.json();
      if (!response.ok || !data?.success || !data?.ride) {
        throw new Error(data?.message || "Could not join ride");
      }

      const ride = data.ride;
      if (ride.start_lat === null || ride.start_lng === null || ride.end_lat === null || ride.end_lng === null) {
        throw new Error("This ride has incomplete route coordinates.");
      }

      onJoinedRide({
        sourceLabel: ride.source_label || "Passenger pickup",
        destinationLabel: ride.destination_label || "Passenger destination",
        source: { lat: Number(ride.start_lat), lng: Number(ride.start_lng) },
        destination: { lat: Number(ride.end_lat), lng: Number(ride.end_lng) },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to join ride");
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="h-full overflow-y-auto px-5 pb-8 pt-12"
    >
      <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">Driver</p>
        <h2 className="mt-2 text-2xl font-extrabold text-foreground">Join a Ride</h2>
        <p className="mt-1 text-xs text-muted-foreground">Enter the OTP created by passenger.</p>

        <div className="mt-5 rounded-2xl border border-border bg-background/60 p-4">
          <p className="mb-3 text-xs font-semibold text-foreground">Ride OTP</p>
          <InputOTP maxLength={6} value={otpCode} onChange={setOtpCode} autoFocus disabled={isJoining}>
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>
        </div>

        {error && <div className="mt-4 rounded-xl bg-red-100 px-3 py-2 text-xs text-red-800">{error}</div>}

        <button
          type="button"
          onClick={joinRide}
          disabled={otpCode.length !== 6 || isJoining}
          className="mt-5 w-full rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-60"
        >
          {isJoining ? "Joining..." : "Join Ride"}
        </button>
      </div>
    </motion.div>
  );
};

export default DriverRideSetupScreen;
