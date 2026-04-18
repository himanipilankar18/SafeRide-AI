import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { KeyRound } from "lucide-react";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";

interface DriverRideSetupScreenProps {
  driverPhone: string;
  onJoinedRide: (ride: {
    rideId?: number;
    otpCode: string;
    sourceLabel: string;
    destinationLabel: string;
    source: { lat: number; lng: number };
    destination: { lat: number; lng: number };
  }) => void;
}

const DriverRideSetupScreen = ({
  driverPhone,
  onJoinedRide,
}: DriverRideSetupScreenProps) => {
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
      if (
        ride.start_lat === null ||
        ride.start_lng === null ||
        ride.end_lat === null ||
        ride.end_lng === null
      ) {
        throw new Error("This ride has incomplete route coordinates.");
      }

      onJoinedRide({
        rideId: Number(ride.ride_id),
        otpCode: String(ride.otp_code || otpCode),
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
      className="h-full overflow-y-auto px-5 pb-8 pt-20 bg-background"
    >
      <div className="mx-auto max-w-md rounded-3xl border border-border bg-card p-7 shadow-lg relative">
        <div className="flex flex-col items-center -mt-12 mb-2">
          <div className="rounded-full bg-primary/10 p-4 shadow-md mb-2">
            <KeyRound size={36} className="text-primary" />
          </div>
        </div>
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-primary text-center mb-1">
          Driver
        </p>
        <h2 className="text-2xl font-extrabold text-foreground text-center mb-1">
          Join a Ride
        </h2>
        <p className="text-sm text-muted-foreground text-center mb-4">
          Enter the OTP created by the passenger to start your trip.
        </p>

        <div className="mt-2 rounded-2xl border border-border bg-muted/60 p-5">
          <p className="mb-3 text-xs font-semibold text-foreground">Ride OTP</p>
          <InputOTP
            maxLength={6}
            value={otpCode}
            onChange={setOtpCode}
            autoFocus
            disabled={isJoining}
          >
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

        {error && (
          <div className="mt-4 rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive text-center">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={joinRide}
          disabled={otpCode.length !== 6 || isJoining}
          className="mt-7 w-full rounded-2xl bg-primary py-3 text-base font-bold text-primary-foreground shadow-lg transition-transform active:scale-[0.98] disabled:opacity-60"
        >
          {isJoining ? "Joining..." : "Join Ride"}
        </button>
      </div>
    </motion.div>
  );
};

export default DriverRideSetupScreen;
